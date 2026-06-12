import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { entityRefs } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { isNotNullish, mapCompactCollection, type CompactCollectionResult } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

export const AddContentsToCollectionInputSchema = z.object({
  contentIds: z.array(z.string().trim().min(1)).min(1),
  collectionIds: z.array(z.string().trim().min(1)).min(1),
});

export type AddContentsToCollectionArgs = z.infer<
  typeof AddContentsToCollectionInputSchema
>;

export interface AddContentsToCollectionResult {
  collections: CompactCollectionResult[];
}

export function createAddContentsToCollectionTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  AddContentsToCollectionArgs,
  AddContentsToCollectionResult,
  typeof AddContentsToCollectionInputSchema
> {
  return {
    inputSchema: AddContentsToCollectionInputSchema,
    tool: createToolDefinition(
      "add_contents_to_collection",
      "Add Graphlit contents to one or more collections.",
      AddContentsToCollectionInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = AddContentsToCollectionInputSchema.parse(rawArgs);
      const response = await client.addContentsToCollections(
        entityRefs(args.contentIds),
        entityRefs(args.collectionIds),
      );

      return {
        collections:
          response.addContentsToCollections?.filter(isNotNullish).map(mapCompactCollection) ?? [],
      };
    },
  };
}
