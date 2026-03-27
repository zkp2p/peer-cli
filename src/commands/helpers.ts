import { createError } from '../output/errors.js';
import type { PreparedTransaction } from '@zkp2p/sdk';
import type { CommandExecutionContext } from './framework.js';
import { logDebug } from '../utils/logger.js';

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
    const args = await buildArgs(input, context);
    const methodName = path.join('.');
    const startedAt = Date.now();
    logDebug('SDK read call', { command: context.command, method: methodName, args });
    try {
      const result = await Reflect.apply(asCallable(method, path), parent, args);
      logDebug('SDK read completed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logDebug('SDK read failed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt, error });
      throw error;
    }
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
    const methodName = path.join('.');
    return context.runPrepared({
      description: options.description?.(input),
      prepare: async () => {
        const startedAt = Date.now();
        logDebug('SDK write prepare', { command: context.command, method: methodName, params });
        try {
          const prepared = unwrapPreparedTransaction(await prepareable.prepare(params));
          logDebug('SDK write prepared', { command: context.command, method: methodName, durationMs: Date.now() - startedAt });
          return { prepared };
        } catch (error) {
          logDebug('SDK write prepare failed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt, error });
          throw error;
        }
      },
      execute: async () => {
        const startedAt = Date.now();
        logDebug('SDK write execute', { command: context.command, method: methodName, params });
        try {
          const result = await Reflect.apply(prepareable, parent, [params]);
          logDebug('SDK write completed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt });
          return result;
        } catch (error) {
          logDebug('SDK write failed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt, error });
          throw error;
        }
      },
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
    const args = await buildArgs(input, context);
    const methodName = path.join('.');
    const startedAt = Date.now();
    logDebug('SDK direct write call', { command: context.command, method: methodName, args });
    try {
      const result = await Reflect.apply(asCallable(method, path), parent, args);
      logDebug('SDK direct write completed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logDebug('SDK direct write failed', { command: context.command, method: methodName, durationMs: Date.now() - startedAt, error });
      throw error;
    }
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
    const prepareMethodName = preparePath.join('.');
    const executeMethodName = executePath.join('.');
    return context.runPrepared({
      description: options.description?.(input),
      prepare: async () => {
        const startedAt = Date.now();
        logDebug('SDK separate prepare call', { command: context.command, method: prepareMethodName, params });
        try {
          const preparedResult = await Reflect.apply(prepareMethod, prepareResolved.parent, [params]);
          logDebug('SDK separate prepare completed', { command: context.command, method: prepareMethodName, durationMs: Date.now() - startedAt });
          return {
            prepared: unwrapPreparedTransaction(preparedResult as PreparedTransaction | { prepared: PreparedTransaction }),
            previewData: options.previewData?.(preparedResult),
          };
        } catch (error) {
          logDebug('SDK separate prepare failed', { command: context.command, method: prepareMethodName, durationMs: Date.now() - startedAt, error });
          throw error;
        }
      },
      execute: async () => {
        const startedAt = Date.now();
        logDebug('SDK separate execute call', { command: context.command, method: executeMethodName, params });
        try {
          const result = await Reflect.apply(executeMethod, executeResolved.parent, [params]);
          logDebug('SDK separate execute completed', { command: context.command, method: executeMethodName, durationMs: Date.now() - startedAt });
          return result;
        } catch (error) {
          logDebug('SDK separate execute failed', { command: context.command, method: executeMethodName, durationMs: Date.now() - startedAt, error });
          throw error;
        }
      },
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
