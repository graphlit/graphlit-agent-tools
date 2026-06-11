import type { Types } from "graphlit-client";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

function stripUnsupportedSchemaFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedSchemaFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(input)) {
    if (key === "$schema" || key === "definitions" || key === "$defs") {
      continue;
    }

    output[key] = stripUnsupportedSchemaFields(nestedValue);
  }

  return output;
}

export function toToolSchema(schema: z.ZodTypeAny): string {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  });

  return JSON.stringify(stripUnsupportedSchemaFields(jsonSchema));
}

export function createToolDefinition(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
): Types.ToolDefinitionInput {
  return {
    name,
    description,
    schema: toToolSchema(schema),
  };
}
