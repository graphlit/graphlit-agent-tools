import { z } from "zod";
import { Types } from "graphlit-client";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { createToolDefinition } from "../utils/schema.js";
import {
  createRetrieveContentsTool,
  type RetrieveContentsResult,
  type RetrieveContentsToolOptions,
} from "./retrieve-contents.js";

export const RetrieveMemoriesInputSchema = z.object({
  search: z.string().trim().min(1).optional(),
  inLast: z.string().trim().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type RetrieveMemoriesArgs = z.infer<typeof RetrieveMemoriesInputSchema>;

export interface RetrieveMemoriesToolOptions extends RetrieveContentsToolOptions {
  collections?: ContentReference[];
}

export type RetrieveMemoriesResult = RetrieveContentsResult;

export function createRetrieveMemoriesTool(
  client: GraphlitClient,
  options: RetrieveMemoriesToolOptions = {},
): GraphlitAgentTool<
  RetrieveMemoriesArgs,
  RetrieveMemoriesResult,
  typeof RetrieveMemoriesInputSchema
> {
  const retrieveContents = createRetrieveContentsTool(client, {
    ...options,
    baseFilter: {
      ...options.baseFilter,
      types: [Types.ContentTypes.Memory],
    },
  });

  return {
    inputSchema: RetrieveMemoriesInputSchema,
    tool: createToolDefinition(
      "retrieve_memories",
      "Retrieve Graphlit memory content. Content type is locked to MEMORY.",
      RetrieveMemoriesInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      const args = RetrieveMemoriesInputSchema.parse(rawArgs);
      return retrieveContents.handler(
        {
          search: args.search,
          inLast: args.inLast,
          offset: args.offset,
          limit: args.limit,
        },
        artifacts,
        abortSignal,
      );
    },
  };
}
