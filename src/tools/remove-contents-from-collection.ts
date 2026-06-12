import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { entityRefs } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { mapCompactCollection, type CompactCollectionResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const RemoveContentsFromCollectionInputSchema = z.object({
  contentIds: z.array(z.string().trim().min(1)).min(1),
  collectionId: z.string().trim().min(1),
});

export type RemoveContentsFromCollectionArgs = z.infer<
  typeof RemoveContentsFromCollectionInputSchema
>;
export type RemoveContentsFromCollectionResult = CompactCollectionResult;

export function createRemoveContentsFromCollectionTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  RemoveContentsFromCollectionArgs,
  RemoveContentsFromCollectionResult,
  typeof RemoveContentsFromCollectionInputSchema
> {
  return {
    inputSchema: RemoveContentsFromCollectionInputSchema,
    tool: createToolDefinition(
      "remove_contents_from_collection",
      "Remove Graphlit contents from one collection.",
      RemoveContentsFromCollectionInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RemoveContentsFromCollectionInputSchema.parse(rawArgs);
      const response = await client.removeContentsFromCollection(
        entityRefs(args.contentIds),
        { id: args.collectionId },
      );
      const collection = response.removeContentsFromCollection;

      if (!collection) {
        throw new Error(`Failed to remove contents from collection: ${args.collectionId}`);
      }

      return mapCompactCollection(collection);
    },
  };
}
