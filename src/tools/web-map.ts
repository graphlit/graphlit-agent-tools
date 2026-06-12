import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { scalarToString } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

export const WebMapInputSchema = z.object({
  url: z.string().trim().url().describe("Public website URL to map."),
  allowedPaths: z
    .array(z.string().trim().min(1))
    .optional()
    .describe("Optional URL path patterns to include."),
  excludedPaths: z
    .array(z.string().trim().min(1))
    .optional()
    .describe("Optional URL path patterns to exclude."),
});

export type WebMapArgs = z.infer<typeof WebMapInputSchema>;

export interface WebMapToolOptions {
  correlationId?: string;
}

export interface WebMapResult {
  url: string;
  results: string[];
}

export function createWebMapTool(
  client: GraphlitClient,
  options: WebMapToolOptions = {},
): GraphlitAgentTool<WebMapArgs, WebMapResult, typeof WebMapInputSchema> {
  return {
    inputSchema: WebMapInputSchema,
    tool: createToolDefinition(
      "web_map",
      "Map a public website and return discovered URLs without ingesting them.",
      WebMapInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = WebMapInputSchema.parse(rawArgs);
      const response = await client.mapWeb(
        args.url,
        args.allowedPaths,
        args.excludedPaths,
        options.correlationId,
      );

      return {
        url: args.url,
        results:
          response.mapWeb?.results
            ?.map((uri) => scalarToString(uri))
            .filter((uri): uri is string => Boolean(uri)) ?? [],
      };
    },
  };
}
