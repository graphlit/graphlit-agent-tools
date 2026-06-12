import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { parseResourceUri, toCollectionResourceUri } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";

export const DeleteCollectionInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  resourceUri: z.string().trim().min(1).optional(),
});

export type DeleteCollectionArgs = z.infer<typeof DeleteCollectionInputSchema>;

export interface DeleteCollectionResult {
  id: string;
  resourceUri: string;
  state?: Types.EntityState | null;
}

function resolveCollectionId(args: DeleteCollectionArgs): string {
  const id = args.id ?? parseResourceUri(args.resourceUri, "collections");

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

export function createDeleteCollectionTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  DeleteCollectionArgs,
  DeleteCollectionResult,
  typeof DeleteCollectionInputSchema
> {
  return {
    inputSchema: DeleteCollectionInputSchema,
    tool: createToolDefinition(
      "delete_collection",
      "Delete a Graphlit collection by ID or collections:// resource URI.",
      DeleteCollectionInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const id = resolveCollectionId(DeleteCollectionInputSchema.parse(rawArgs));
      const response = await client.deleteCollection(id);
      const collection = response.deleteCollection;

      if (!collection) {
        throw new Error(`Failed to delete collection: ${id}`);
      }

      return {
        id: collection.id,
        resourceUri:
          toCollectionResourceUri(collection.id) ?? `collections://${collection.id}`,
        state: collection.state,
      };
    },
  };
}
