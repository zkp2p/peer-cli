import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Command } from 'commander';
import type { PreparedTransaction } from '@zkp2p/sdk';
import { buildOutput, renderOutput } from '../output/formatter.js';
import { createError, normalizeError } from '../output/errors.js';
import type { CLIOutput, OutputFormat } from '../output/types.js';
import { createClient as defaultCreateClient } from '../sdk/client.js';
import type { ClientBundle } from '../sdk/client.js';
import { resolveConfig as defaultResolveConfig } from '../sdk/config.js';
import type { GlobalOptions, ResolvedConfig } from '../sdk/config.js';
import { requestJson as defaultRequestJson } from '../utils/http.js';
import { logDebug, setDebugEnabled } from '../utils/logger.js';
import { parseJsonFile, parseJsonInput } from '../utils/validation.js';

export type SchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface SchemaProperty {
  type: SchemaType;
  description: string;
  enum?: readonly string[];
  default?: unknown;
}

export interface CliOptionDefinition {
  name: string;
  flags: string;
  description: string;
  schema: SchemaProperty;
  defaultValue?: unknown;
}

export interface CliArgumentDefinition {
  name: string;
  description: string;
  schema: SchemaProperty;
  required?: boolean;
}

export interface PreparedExecutionResult<TResult = unknown, TPreview = unknown> {
  executed: boolean;
  preview: {
    to: string;
    data: string;
    value: string;
    chainId: number;
    description?: string;
  };
  previewData?: TPreview;
  result?: TResult;
}

export interface CommandDefinition {
  path: string[];
  description: string;
  readOnly: boolean;
  dangerous?: boolean;
  authRequired?: boolean;
  requireWallet?: boolean;
  passthrough?: boolean;
  args?: CliArgumentDefinition[];
  options?: CliOptionDefinition[];
  examples?: string[];
  handler: (input: Record<string, unknown>, context: CommandExecutionContext) => Promise<unknown>;
}

export interface RuntimeDeps {
  createClient: typeof defaultCreateClient;
  resolveConfig: typeof defaultResolveConfig;
  requestJson: typeof defaultRequestJson;
}

export interface CommandExecutionContext {
  spec: CommandDefinition;
  command: string;
  config: ResolvedConfig;
  globalOptions: GlobalOptions;
  deps: RuntimeDeps;
  getClient: (options?: { requireWallet?: boolean }) => Promise<ClientBundle>;
  requestJson: typeof defaultRequestJson;
  readJsonFile: typeof parseJsonFile;
  readTextFile: (path: string) => Promise<string>;
  writeJsonFile: (path: string, value: unknown) => Promise<void>;
  runPrepared<TResult = unknown, TPreview = unknown>(plan: {
    description?: string;
    prepare: () => Promise<{ prepared: PreparedTransaction; previewData?: TPreview }>;
    execute: () => Promise<TResult>;
  }): Promise<PreparedExecutionResult<TResult, TPreview>>;
}

const DEFAULT_DEPS: RuntimeDeps = {
  createClient: defaultCreateClient,
  resolveConfig: defaultResolveConfig,
  requestJson: defaultRequestJson,
};

const GROUP_DESCRIPTIONS: Record<string, string> = {
  quote: 'Quote operations',
  taker: 'Taker operations',
  deposit: 'Deposit management',
  intent: 'Intent operations',
  vault: 'Vault management',
  delegate: 'Delegation operations',
  undelegate: 'Delegation operations',
  market: 'Market intelligence',
  transfer: 'USDC transfer commands',
  balance: 'USDC balance command',
  checkout: 'Checkout session commands',
  config: 'Configuration commands',
  mcp: 'Model Context Protocol server',
  payee: 'Payee helpers',
  oracle: 'Oracle helpers',
  pv: 'ProtocolViewer reads',
  indexer: 'Indexer reads',
};

function commandString(path: string[]): string {
  return ['peer', ...path].join(' ');
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, current]) => current !== undefined)) as T;
}

export function mergeCommandInput(
  explicitInput: Record<string, unknown>,
  paramsPayload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return pruneUndefined({ ...(paramsPayload ?? {}), ...explicitInput });
}

export function buildInputSchema(spec: CommandDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const arg of spec.args ?? []) {
    properties[arg.name] = pruneUndefined({
      type: arg.schema.type,
      description: arg.description,
      enum: arg.schema.enum,
      default: arg.schema.default,
    });
    if (arg.required !== false) {
      required.push(arg.name);
    }
  }

  for (const option of spec.options ?? []) {
    properties[option.name] = pruneUndefined({
      type: option.schema.type,
      description: option.description,
      enum: option.schema.enum,
      default: option.defaultValue ?? option.schema.default,
    });
  }

  properties.params = {
    type: 'object',
    description: 'Optional raw JSON params object merged underneath the typed CLI flags.',
  };

  return pruneUndefined({
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  });
}

export async function executeDefinition(
  spec: CommandDefinition,
  input: Record<string, unknown>,
  globalOptions: GlobalOptions,
  deps: RuntimeDeps = DEFAULT_DEPS,
): Promise<CLIOutput<unknown>> {
  const startedAt = Date.now();
  const command = commandString(spec.path);
  setDebugEnabled(Boolean(globalOptions.debug));
  logDebug('Resolving command config', { command, globalOptions });
  const fallbackEnv = typeof globalOptions.env === 'string' ? globalOptions.env : process.env.PEER_ENV ?? 'unknown';

  try {
    const config = await deps.resolveConfig(globalOptions);
    setDebugEnabled(config.debug);
    logDebug('Resolved config', {
      command,
      env: config.env,
      format: config.format,
      yes: config.yes,
      debug: config.debug,
      rpcUrl: config.rpcUrl,
      walletPath: config.walletPath,
      indexerUrl: config.indexerUrl,
      baseApiUrl: config.baseApiUrl,
      marketBaseUrl: config.marketBaseUrl,
      payBaseUrl: config.payBaseUrl,
      hasPrivateKey: Boolean(config.privateKey),
      hasApiKey: Boolean(config.apiKey),
      hasIndexerKey: Boolean(config.indexerKey),
      hasMarketApiKey: Boolean(config.marketApiKey),
      hasPayApiKey: Boolean(config.payApiKey),
    });
    logDebug('Command input', { command, input });

    const context: CommandExecutionContext = {
      spec,
      command,
      config,
      globalOptions,
      deps,
      getClient: (options = {}) => deps.createClient(config, { requireWallet: spec.requireWallet ?? options.requireWallet }),
      requestJson: deps.requestJson,
      readJsonFile: parseJsonFile,
      readTextFile: async (path) => readFile(path, 'utf8'),
      writeJsonFile: async (path, value) => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(value, null, 2));
      },
      runPrepared: async (plan) => {
        logDebug('Preparing write operation', { command, description: plan.description });
        const { prepared, previewData } = await plan.prepare();
        const preview = {
          to: prepared.to,
          data: prepared.data,
          value: prepared.value.toString(),
          chainId: prepared.chainId,
          description: plan.description,
        };
        logDebug('Prepared write operation', { command, preview, previewData });

        if (!config.yes) {
          logDebug('Write execution skipped because --yes/--execute was not set', { command });
          return {
            executed: false,
            preview,
            previewData,
          };
        }

        logDebug('Executing prepared write operation', { command });
        const result = await plan.execute();
        logDebug('Executed prepared write operation', { command, result });
        return {
          executed: true,
          preview,
          previewData,
          result,
        };
      },
    };

    const data = await spec.handler(input, context);
    logDebug('Command completed', { command, durationMs: Date.now() - startedAt });
    return buildOutput(
      { ok: true, data },
      {
        command,
        env: config.env,
        chain: 'base',
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      },
    );
  } catch (error) {
    logDebug('Command failed', { command, durationMs: Date.now() - startedAt, error });
    return buildOutput(
      { ok: false, error: normalizeError(error) },
      {
        command,
        env: fallbackEnv,
        chain: 'base',
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      },
    );
  }
}

function commandLeafName(spec: CommandDefinition): string {
  return spec.path.at(-1) ?? 'unknown';
}

function isWriteCommand(spec: CommandDefinition): boolean {
  return !spec.readOnly;
}

function applyDefinition(command: Command, spec: CommandDefinition, deps: RuntimeDeps): void {
  for (const arg of spec.args ?? []) {
    command.argument(arg.required === false ? `[${arg.name}]` : `<${arg.name}>`, arg.description);
  }

  for (const option of spec.options ?? []) {
    command.option(option.flags, option.description, option.defaultValue as never);
  }

  command.option('--params <json>', 'Raw JSON params object to merge under typed flags.');
  command.option('--params-file <path>', 'Read a raw JSON params object from a file path.');
  if (isWriteCommand(spec)) {
    command.option('--execute', 'Broadcast the prepared transaction immediately.');
  }

  command.action(async (...args: unknown[]) => {
    const commandInstance = args.at(-1) as Command;
    const optionBag = args.at(-2) as Record<string, unknown>;
    const optionInput = Object.fromEntries(
      Object.entries(optionBag).filter(([key]) => key !== 'params' && key !== 'paramsFile'),
    );
    const rawPositionals = args.slice(0, Math.max(0, args.length - 2));
    const explicitInput = Object.fromEntries((spec.args ?? []).map((definition, index) => [definition.name, rawPositionals[index]]));
    const paramsInput = await parseJsonFile(optionBag.paramsFile as string | undefined);
    const paramsInline = parseJsonInput(optionBag.params as string | undefined, '--params');
    const mergedParams = { ...(paramsInput ?? {}), ...(paramsInline ?? {}) };
    const globalOptions = commandInstance.optsWithGlobals() as GlobalOptions;
    const output = await executeDefinition(
      spec,
      mergeCommandInput({ ...explicitInput, ...optionInput }, mergedParams),
      globalOptions,
      deps,
    );

    if (!spec.passthrough) {
      const format = (globalOptions.format ?? 'json') as OutputFormat;
      const rendered = renderOutput(output, format);
      const writer = output.ok ? process.stdout : process.stderr;
      writer.write(`${rendered}\n`);
    }

    if (!output.ok) {
      process.exitCode = 1;
    }
  });
}

export function registerDefinitions(program: Command, definitions: CommandDefinition[], deps: RuntimeDeps = DEFAULT_DEPS): void {
  const branchMap = new Map<string, Command>();
  branchMap.set('', program);

  for (const spec of definitions) {
    if (spec.path.length === 0) {
      throw createError('CONFIG_ERROR', 'Command definitions must include at least one path segment.');
    }

    const parentSegments = spec.path.slice(0, -1);
    let currentPath = '';
    let currentCommand = program;

    for (const segment of parentSegments) {
      currentPath = `${currentPath}/${segment}`;
      let nextCommand = branchMap.get(currentPath);
      if (!nextCommand) {
        nextCommand = currentCommand.command(segment).description(GROUP_DESCRIPTIONS[segment] ?? `${segment} commands`);
        branchMap.set(currentPath, nextCommand);
      }
      currentCommand = nextCommand;
    }

    const leaf = currentCommand.command(commandLeafName(spec)).description(spec.description);
    applyDefinition(leaf, spec, deps);
  }
}
