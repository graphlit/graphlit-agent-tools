import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { contentName, scalarToString, toContentResourceUri } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

export const IngestMemoryInputSchema = z.object({
  text: z.string().trim().min(1).describe("Memory text to store."),
  name: z.string().trim().min(1).optional().describe("Memory name."),
  textType: z.nativeEnum(Types.TextTypes).optional().describe("Text format."),
  id: z.string().trim().min(1).optional(),
  identifier: z.string().trim().min(1).optional(),
});

export type IngestMemoryArgs = z.infer<typeof IngestMemoryInputSchema>;

export interface IngestMemoryToolOptions {
  collections?: ContentReference[];
  correlationId?: string;
}

export interface IngestMemoryResult {
  id: string;
  resourceUri: string;
  name: string;
  identifier?: string | null;
  state?: Types.EntityState | null;
  type?: Types.ContentTypes | null;
  fileType?: Types.FileTypes | null;
  mimeType?: string | null;
  uri?: string | null;
}

export function createIngestMemoryTool(
  client: GraphlitClient,
  options: IngestMemoryToolOptions = {},
): GraphlitAgentTool<
  IngestMemoryArgs,
  IngestMemoryResult,
  typeof IngestMemoryInputSchema
> {
  return {
    inputSchema: IngestMemoryInputSchema,
    tool: createToolDefinition(
      "ingest_memory",
      "Store a Graphlit memory content item. This public schema intentionally does not expose TTL.",
      IngestMemoryInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = IngestMemoryInputSchema.parse(rawArgs);
      const response = await client.ingestMemory(
        args.text,
        args.name,
        args.textType ?? Types.TextTypes.Plain,
        args.id,
        args.identifier,
        options.collections,
        options.correlationId,
      );
      const content = response.ingestMemory;

      if (!content) {
        throw new Error("Failed to ingest memory.");
      }

      artifacts?.addPending(Promise.resolve({ id: content.id }));

      return {
        id: content.id,
        resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        identifier: content.identifier,
        state: content.state,
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        uri: scalarToString(content.uri),
      };
    },
  };
}
