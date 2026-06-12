import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";
import type { ContentLabelResult } from "./add-content-label.js";

export const RemoveContentLabelInputSchema = z.object({
  contentId: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export type RemoveContentLabelArgs = z.infer<typeof RemoveContentLabelInputSchema>;

export function createRemoveContentLabelTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  RemoveContentLabelArgs,
  ContentLabelResult,
  typeof RemoveContentLabelInputSchema
> {
  return {
    inputSchema: RemoveContentLabelInputSchema,
    tool: createToolDefinition(
      "remove_content_label",
      "Remove a label from one Graphlit content item.",
      RemoveContentLabelInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = RemoveContentLabelInputSchema.parse(rawArgs);
      const response = await client.removeContentLabel(args.contentId, args.label);
      const label = response.removeContentLabel;

      if (!label) {
        throw new Error(`Failed to remove label '${args.label}' from ${args.contentId}`);
      }

      return { id: label.id, name: label.name };
    },
  };
}
