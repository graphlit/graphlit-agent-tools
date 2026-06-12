import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { parseContentResourceUri, toContentResourceUri } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";

export const DeleteMemoryInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  resourceUri: z.string().trim().min(1).optional(),
});

export type DeleteMemoryArgs = z.infer<typeof DeleteMemoryInputSchema>;

export interface DeleteMemoryResult {
  id: string;
  resourceUri: string;
  state?: Types.EntityState | null;
}

function resolveMemoryId(args: DeleteMemoryArgs): string {
  const id = args.id ?? parseContentResourceUri(args.resourceUri);

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

export function createDeleteMemoryTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  DeleteMemoryArgs,
  DeleteMemoryResult,
  typeof DeleteMemoryInputSchema
> {
  return {
    inputSchema: DeleteMemoryInputSchema,
    tool: createToolDefinition(
      "delete_memory",
      "Delete a Graphlit memory after verifying the content type is MEMORY.",
      DeleteMemoryInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const id = resolveMemoryId(DeleteMemoryInputSchema.parse(rawArgs));
      const contentResponse = await client.getContent(id);
      const content = contentResponse.content;

      if (!content) {
        throw new Error(`Content not found: ${id}`);
      }

      if (content.type !== Types.ContentTypes.Memory) {
        throw new Error(`Refusing to delete non-memory content: ${id}`);
      }

      const response = await client.deleteContent(id);
      const deleted = response.deleteContent;

      if (!deleted) {
        throw new Error(`Failed to delete memory: ${id}`);
      }

      return {
        id: deleted.id,
        resourceUri: toContentResourceUri(deleted.id) ?? `contents://${deleted.id}`,
        state: deleted.state,
      };
    },
  };
}
