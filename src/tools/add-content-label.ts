import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";

export const AddContentLabelInputSchema = z.object({
  contentId: z.string().trim().min(1),
  label: z.string().trim().min(1),
});

export type AddContentLabelArgs = z.infer<typeof AddContentLabelInputSchema>;

export interface ContentLabelResult {
  id: string;
  name: string;
}

export function createAddContentLabelTool(
  client: GraphlitClient,
): GraphlitAgentTool<
  AddContentLabelArgs,
  ContentLabelResult,
  typeof AddContentLabelInputSchema
> {
  return {
    inputSchema: AddContentLabelInputSchema,
    tool: createToolDefinition(
      "add_content_label",
      "Add a label to one Graphlit content item.",
      AddContentLabelInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = AddContentLabelInputSchema.parse(rawArgs);
      const response = await client.addContentLabel(args.contentId, args.label);
      const label = response.addContentLabel;

      if (!label) {
        throw new Error(`Failed to add label '${args.label}' to ${args.contentId}`);
      }

      return { id: label.id, name: label.name };
    },
  };
}
