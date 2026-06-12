import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { createToolDefinition } from "../utils/schema.js";

export const CountContentsInputSchema = z.object({
  search: z.string().trim().min(1).optional().describe("Text to search for."),
  inLast: z.string().trim().min(1).optional().describe("Original-date ISO duration."),
  inNext: z.string().trim().min(1).optional().describe("Future original-date ISO duration."),
  from: z.string().trim().min(1).optional().describe("Original-date range start."),
  to: z.string().trim().min(1).optional().describe("Original-date range end."),
  type: z.nativeEnum(Types.ContentTypes).optional().describe("Content type."),
  fileType: z.nativeEnum(Types.FileTypes).optional().describe("File type."),
  collectionIds: z.array(z.string().trim().min(1)).optional(),
  feedIds: z.array(z.string().trim().min(1)).optional(),
});

export type CountContentsArgs = z.infer<typeof CountContentsInputSchema>;

export interface CountContentsToolOptions {
  collectionId?: string;
  collections?: ContentReference[];
  baseFilter?: Types.ContentFilter;
  searchType?: Types.SearchTypes;
}

export interface CountContentsResult {
  count: number;
  filter: Types.ContentFilter;
}

export function createCountContentsTool(
  client: GraphlitClient,
  options: CountContentsToolOptions = {},
): GraphlitAgentTool<
  CountContentsArgs,
  CountContentsResult,
  typeof CountContentsInputSchema
> {
  return {
    inputSchema: CountContentsInputSchema,
    tool: createToolDefinition(
      "count_contents",
      "Count Graphlit contents matching an app-free content filter.",
      CountContentsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = CountContentsInputSchema.parse(rawArgs);
      const filter = buildPublicContentFilter(args, options);
      const response = await client.countContents(filter);

      return {
        count: Number(response.countContents?.count ?? 0),
        filter,
      };
    },
  };
}
