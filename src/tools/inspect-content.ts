import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  contentName,
  parseContentResourceUri,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";

const DEFAULT_MAX_TEXT_LENGTH = 12_000;

export const InspectContentInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit content ID."),
  resourceUri: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Graphlit content resource URI, such as contents://content-id."),
  mode: z
    .enum(["auto", "summary", "markdown"])
    .optional()
    .describe("Text to return. Defaults to auto."),
  maxTextLength: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum text length to return."),
});

export type InspectContentArgs = z.infer<typeof InspectContentInputSchema>;

export interface InspectContentToolOptions {
  maxTextLength?: number;
}

export interface InspectContentResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  type?: string | null;
  fileType?: string | null;
  mimeType?: string | null;
  mode: "auto" | "summary" | "markdown";
  text: string;
  truncated: boolean;
}

function resolveContentId(args: InspectContentArgs): string {
  const id = args.id ?? parseContentResourceUri(args.resourceUri);

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

export function createInspectContentTool(
  client: GraphlitClient,
  options: InspectContentToolOptions = {},
): GraphlitAgentTool<InspectContentArgs, InspectContentResult> {
  return {
    tool: createToolDefinition(
      "inspect_content",
      "Inspect one Graphlit content item returned by retrieve_contents, using its id or contents:// resource URI.",
      InspectContentInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = InspectContentInputSchema.parse(rawArgs);
      const id = resolveContentId(args);
      const response = await client.getContent(id);
      const content = response.content;

      if (!content) {
        throw new Error(`Content not found: ${id}`);
      }

      const mode = args.mode ?? "auto";
      const maxTextLength =
        args.maxTextLength ?? options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
      const textSource =
        mode === "summary"
          ? (content.customSummary ??
            content.summary ??
            content.snippet ??
            content.description)
          : mode === "markdown"
            ? (content.markdown ??
              content.customSummary ??
              content.summary ??
              content.snippet ??
              content.description)
            : (content.markdown ??
              content.customSummary ??
              content.summary ??
              content.snippet ??
              content.description);
      const { text, truncated } = truncateText(textSource ?? "", maxTextLength);

      return {
        id: content.id,
        resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        uri: scalarToString(content.uri),
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        mode,
        text,
        truncated,
      };
    },
  };
}
