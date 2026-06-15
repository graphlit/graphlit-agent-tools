import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";

const DEFAULT_MAX_TEXT_LENGTH = 20_000;

export const InspectPageInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .describe("Public web page URL to inspect without ingesting."),
  maxTextLength: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum inspected page text length to return."),
  range: z
    .object({
      start: z.number().int().min(0).optional(),
      end: z.number().int().min(0).optional(),
    })
    .optional()
    .describe("Optional character range to slice from the inspected page text."),
});

export type InspectPageArgs = z.infer<typeof InspectPageInputSchema>;

export interface InspectPageToolOptions {
  maxTextLength?: number;
  correlationId?: string;
}

export interface InspectPageResult {
  url: string;
  text: string;
  truncated: boolean;
  range?: { start: number; end: number } | null;
}

function applyRange(
  text: string,
  range: InspectPageArgs["range"],
): { text: string; range: { start: number; end: number } | null } {
  if (!range) {
    return { text, range: null };
  }

  const start = range.start ?? 0;
  const end = Math.min(range.end ?? text.length, text.length);

  if (end < start) {
    throw new Error("range.end must be greater than or equal to range.start.");
  }

  return {
    text: text.slice(start, end),
    range: { start, end },
  };
}

export function createInspectPageTool(
  client: GraphlitClient,
  options: InspectPageToolOptions = {},
): GraphlitAgentTool<
  InspectPageArgs,
  InspectPageResult,
  typeof InspectPageInputSchema
> {
  return {
    inputSchema: InspectPageInputSchema,
    tool: createToolDefinition(
      "inspect_page",
      "Inspect a public web page and return Markdown text without ingesting it into Graphlit.",
      InspectPageInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = InspectPageInputSchema.parse(rawArgs);
      const response = await client.inspectPage(args.url, options.correlationId);
      const textSource = response.inspectPage?.result;

      if (textSource == null) {
        throw new Error(`Failed to inspect page: ${args.url}`);
      }

      const maxTextLength =
        args.maxTextLength ?? options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
      const ranged = applyRange(textSource, args.range);
      const { text, truncated } = truncateText(ranged.text, maxTextLength);

      return {
        url: args.url,
        text,
        truncated,
        range: ranged.range,
      };
    },
  };
}
