import { createError } from '../output/errors.js';
import type { PreparedTransaction } from '@zkp2p/sdk';
import type { CommandExecutionContext } from './framework.js';

type AsyncCallable = (...args: unknown[]) => Promise<unknown>;
type PrepareableCallable = AsyncCallable & {
  prepare: (params: Record<string, unknown>) => Promise<PreparedTransaction | { prepared: PreparedTransaction }>;
};

function resolveMethod(target: unknown, path: readonly string[]): { parent: Record<string, unknown>; method: unknown } {
  let current = target as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (typeof next !== 'object' && typeof next !== 'function') {
      throw createError('UNSUPPORTED_OPERATION', `Method path ${path.join('.')} is not available.`);
    }
    current = next as Record<string, unknown>;
  }

  return {
    parent: current,
    method: current[path.at(-1) ?? ''],
  };
}

function asCallable(method: unknown, path: readonly string[]): AsyncCallable {
  if (typeof method !== 'function') {
    throw createError('UNSUPPORTED_OPERATION', `Method ${path.join('.')} is not callable.`);
  }
  return method as AsyncCallable;
}

function asPrepareable(method: unknown, path: readonly string[]): PrepareableCallable {
  if (typeof method !== 'function' || typeof (method as { prepare?: unknown }).prepare !== 'function') {
    throw createError('UNSUPPORTED_OPERATION', `Method ${path.join('.')} does not expose .prepare().`);
  }
  return method as PrepareableCallable;
}

function unwrapPreparedTransaction(result: PreparedTransaction | { prepared: PreparedTransaction }): PreparedTransaction {
  return 'prepared' in result ? result.prepared : result;
}

export function sdkReadHandler(
  path: readonly string[],
  buildArgs: (input: Record<string, unknown>, context: CommandExecutionContext) => Promise<unknown[]> | unknown[],
  options: { requireWallet?: boolean } = {},
) {
  return async (input: Record<string, unknown>, context: CommandExecutionContext): Promise<unknown> => {
    const { client } = await context.getClient({ requireWallet: options.requireWallet });
    const { parent, method } = resolveMethod(client, path);
    return Reflect.apply(asCallable(method, path), parent, await buildArgs(input, context));
  };
}

export function sdkWriteHandler(
  path: readonly string[],
  buildParams: (input: Record<string, unknown>, context: CommandExecutionContext) => Promise<Record<string, unknown>> | Record<string, unknown>,
  options: { description?: (input: Record<string, unknown>) => string; requireWallet?: boolean } = {},
) {
  return async (input: Record<string, unknown>, context: CommandExecutionContext): Promise<unknown> => {
    const { client } = await context.getClient({ requireWallet: options.requireWallet ?? true });
    const { parent, method } = resolveMethod(client, path);
    const prepareable = asPrepareable(method, path);

    const params = await buildParams(input, context);
    return context.runPrepared({
      description: options.description?.(input),
      prepare: async () => ({
        prepared: unwrapPreparedTransaction(await prepareable.prepare(params)),
      }),
      execute: async () => Reflect.apply(prepareable, parent, [params]),
    });
  };
}

export function sdkDirectWriteHandler(
  path: readonly string[],
  buildArgs: (input: Record<string, unknown>, context: CommandExecutionContext) => Promise<unknown[]> | unknown[],
  options: { requireWallet?: boolean } = {},
) {
  return async (input: Record<string, unknown>, context: CommandExecutionContext): Promise<unknown> => {
    const { client } = await context.getClient({ requireWallet: options.requireWallet ?? true });
    const { parent, method } = resolveMethod(client, path);
    return Reflect.apply(asCallable(method, path), parent, await buildArgs(input, context));
  };
}

export function sdkSeparatePrepareHandler(
  preparePath: readonly string[],
  executePath: readonly string[],
  buildParams: (input: Record<string, unknown>, context: CommandExecutionContext) => Promise<Record<string, unknown>> | Record<string, unknown>,
  options: {
    description?: (input: Record<string, unknown>) => string;
    requireWallet?: boolean;
    previewData?: (preparedResult: unknown) => unknown;
  } = {},
) {
  return async (input: Record<string, unknown>, context: CommandExecutionContext): Promise<unknown> => {
    const { client } = await context.getClient({ requireWallet: options.requireWallet ?? true });
    const prepareResolved = resolveMethod(client, preparePath);
    const executeResolved = resolveMethod(client, executePath);
    const prepareMethod = asCallable(prepareResolved.method, preparePath);
    const executeMethod = asCallable(executeResolved.method, executePath);

    const params = await buildParams(input, context);
    return context.runPrepared({
      description: options.description?.(input),
      prepare: async () => {
        const preparedResult = await Reflect.apply(prepareMethod, prepareResolved.parent, [params]);
        return {
          prepared: unwrapPreparedTransaction(preparedResult as PreparedTransaction | { prepared: PreparedTransaction }),
          previewData: options.previewData?.(preparedResult),
        };
      },
      execute: async () => Reflect.apply(executeMethod, executeResolved.parent, [params]),
    });
  };
}

export function mergeParamsWithFile(
  input: Record<string, unknown>,
  keys: string[],
  jsonPayload?: Record<string, unknown>,
): Record<string, unknown> {
  const picked = Object.fromEntries(keys.map((key) => [key, input[key]]));
  return { ...(jsonPayload ?? {}), ...picked };
}
