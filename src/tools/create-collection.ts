import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { entityRefs } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { mapCompactCollection, type CompactCollectionResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const CreateCollectionInputSchema = z.object({
  name: z.string().trim().min(1).describe("Collection name."),
  type: z.nativeEnum(Types.CollectionTypes).optional().describe("Collection type."),
  contentIds: z.array(z.string().trim().min(1)).optional(),
  conversationIds: z.array(z.string().trim().min(1)).optional(),
  expectedCount: z.number().int().min(0).optional(),
});

export type CreateCollectionArgs = z.infer<typeof CreateCollectionInputSchema>;
export type CreateCollectionResult = CompactCollectionResult;

export function createCreateCollectionTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  CreateCollectionArgs,
  CreateCollectionResult,
  typeof CreateCollectionInputSchema
> {
  return {
    inputSchema: CreateCollectionInputSchema,
    tool: createToolDefinition(
      "create_collection",
      "Create a Graphlit collection. Host apps should expose this mutating tool only when collection changes are allowed.",
      CreateCollectionInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = CreateCollectionInputSchema.parse(rawArgs);
      const response = await client.createCollection({
        name: args.name,
        type: args.type,
        contents: args.contentIds?.length ? entityRefs(args.contentIds) : undefined,
        conversations: args.conversationIds?.length
          ? entityRefs(args.conversationIds)
          : undefined,
        expectedCount: args.expectedCount,
      });
      const collection = response.createCollection;

      if (!collection) {
        throw new Error(`Failed to create collection: ${args.name}`);
      }

      return mapCompactCollection(collection);
    },
  };
}
