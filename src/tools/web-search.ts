import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { scalarToString } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_LIMIT = 20;

type WebSearchResultItem = NonNullable<
  NonNullable<Types.SearchWebQuery["searchWeb"]>["results"]
>[number];
type WebSearchResult = NonNullable<WebSearchResultItem>;

export const WebSearchInputSchema = z.object({
  query: z.string().trim().min(1).describe("Search query."),
  searchService: z
    .nativeEnum(Types.SearchServiceTypes)
    .optional()
    .describe("Search service. Defaults to PARALLEL."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(DEFAULT_MAX_LIMIT)
    .optional()
    .describe("Maximum results. Defaults to 10."),
});

export type WebSearchArgs = z.infer<typeof WebSearchInputSchema>;

export interface WebSearchToolOptions {
  defaultSearchService?: Types.SearchServiceTypes;
  defaultLimit?: number;
  maxLimit?: number;
  correlationId?: string;
}

export interface WebSearchToolResult {
  query: string;
  searchService: Types.SearchServiceTypes;
  results: Array<{
    title?: string | null;
    uri?: string | null;
    text?: string | null;
    score?: number | null;
  }>;
}

function mapWebSearchResult(result: WebSearchResult) {
  return {
    title: result.title,
    uri: scalarToString(result.uri),
    text: result.text,
    score: result.score,
  };
}

export function createWebSearchTool(
  client: GraphlitClient,
  options: WebSearchToolOptions = {},
): GraphlitAgentTool<WebSearchArgs, WebSearchToolResult> {
  const defaultSearchService =
    options.defaultSearchService ?? Types.SearchServiceTypes.Parallel;
  const defaultLimit = options.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = options.maxLimit ?? DEFAULT_MAX_LIMIT;

  return {
    tool: createToolDefinition(
      "web_search",
      "Search the public web for current information. Returns URLs, titles, and snippets; it does not ingest results.",
      WebSearchInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = WebSearchInputSchema.parse(rawArgs);
      const searchService = args.searchService ?? defaultSearchService;
      const limit = clampInteger(args.limit, defaultLimit, 1, maxLimit);

      const response = await client.searchWeb(
        args.query,
        searchService,
        limit,
        options.correlationId,
      );

      return {
        query: args.query,
        searchService,
        results:
          response.searchWeb?.results
            ?.filter((result): result is WebSearchResult => result != null)
            .map(mapWebSearchResult) ?? [],
      };
    },
  };
}
