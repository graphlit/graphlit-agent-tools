import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  contentName,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

export const IngestTextInputSchema = z.object({
  text: z.string().trim().min(1).describe("Text to ingest into Graphlit."),
  name: z.string().trim().min(1).optional().describe("Content name."),
  textType: z
    .nativeEnum(Types.TextTypes)
    .optional()
    .describe("Text format. Defaults to PLAIN."),
  id: z.string().trim().min(1).optional().describe("Optional stable content ID."),
  uri: z.string().trim().url().optional().describe("Optional source URI."),
  identifier: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Optional external identifier."),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe("Whether Graphlit should process the text synchronously."),
});

export type IngestTextArgs = z.infer<typeof IngestTextInputSchema>;

export interface IngestTextToolOptions {
  collections?: ContentReference[];
  workflow?: Types.EntityReferenceInput;
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface IngestTextResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  identifier?: string | null;
  state?: Types.EntityState | null;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  waitForCompletion: boolean;
}

export function createIngestTextTool(
  client: GraphlitClient,
  options: IngestTextToolOptions = {},
): GraphlitAgentTool<
  IngestTextArgs,
  IngestTextResult,
  typeof IngestTextInputSchema
> {
  return {
    inputSchema: IngestTextInputSchema,
    tool: createToolDefinition(
      "ingest_text",
      "Ingest raw text into Graphlit so later agent turns can retrieve it.",
      IngestTextInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = IngestTextInputSchema.parse(rawArgs);
      const waitForCompletion =
        args.waitForCompletion ?? options.defaultWaitForCompletion ?? false;
      const response = await client.ingestText(
        args.text,
        args.name,
        args.textType ?? Types.TextTypes.Plain,
        args.uri,
        args.id,
        args.identifier,
        waitForCompletion,
        options.workflow,
        options.collections,
        undefined,
        options.correlationId,
      );
      const content = response.ingestText;

      if (!content) {
        throw new Error("Failed to ingest text.");
      }

      artifacts?.addPending(Promise.resolve({ id: content.id }));

      return {
        id: content.id,
        resourceUri:
          toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        uri: scalarToString(content.uri),
        identifier: content.identifier,
        state: content.state,
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        waitForCompletion,
      };
    },
  };
}
