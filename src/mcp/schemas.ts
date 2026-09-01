import * as z from 'zod/v4';
import type { CommandDefinition, SchemaProperty } from '../commands/framework.js';

function schemaToZod(property: SchemaProperty): z.ZodType<unknown> {
  let base: z.ZodType<unknown>;

  if (property.enum && property.enum.length > 0) {
    const [first, ...rest] = property.enum;
    if (first === undefined) {
      throw new Error('Enum schema must include at least one value.');
    }
    base = z.enum([first, ...rest]);
  } else {
    switch (property.type) {
      case 'string':
        base = z.string();
        break;
      case 'number':
        base = z.number();
        break;
      case 'boolean':
        base = z.boolean();
        break;
      case 'array':
        base = z.array(z.json());
        break;
      case 'object':
        base = z.record(z.string(), z.json());
        break;
      default:
        base = z.json();
        break;
    }
  }

  if (property.description) {
    base = base.describe(property.description);
  }
  if (property.default !== undefined) {
    return base.default(property.default as never);
  }
  return base;
}

export function buildToolName(spec: CommandDefinition): string {
  return `peer_${spec.path.join('_').replaceAll('-', '_')}`;
}

export function buildToolInputShape(spec: CommandDefinition): Record<string, z.ZodType<unknown>> {
  const shape: Record<string, z.ZodType<unknown>> = {};

  for (const arg of spec.args ?? []) {
    let schema = schemaToZod(arg.schema);
    if (arg.required === false) {
      schema = schema.optional();
    }
    shape[arg.name] = schema;
  }

  for (const option of spec.options ?? []) {
    let schema = schemaToZod({
      ...option.schema,
      default: option.defaultValue ?? option.schema.default,
    });

    if (option.defaultValue === undefined && option.schema.default === undefined) {
      schema = schema.optional();
    }
    shape[option.name] = schema;
  }

  shape.params = z.record(z.string(), z.json()).optional().describe('Optional raw JSON params merged beneath typed fields.');
  return shape;
}
