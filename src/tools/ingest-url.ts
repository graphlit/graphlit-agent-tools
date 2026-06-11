import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { contentName, scalarToString, toContentResourceUri } from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";
import type { Types } from "graphlit-client";

export const IngestUrlInputSchema = z.object({
  url: z.string().trim().url().describe("Public URL to ingest into Graphlit."),
  name: z.string().trim().min(1).optional().describe("Optional content name."),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe("Whether Graphlit should process the URL synchronously."),
});

export type IngestUrlArgs = z.infer<typeof IngestUrlInputSchema>;

export interface IngestUrlToolOptions {
  collections?: ContentReference[];
  workflow?: Types.EntityReferenceInput;
  defaultWaitForCompletion?: boolean;
  correlationId?: string;
}

export interface IngestUrlResult {
  id: string;
  resourceUri: string;
  name: string;
  uri?: string | null;
  state?: string | null;
  type?: string | null;
  fileType?: string | null;
  mimeType?: string | null;
  waitForCompletion: boolean;
}

export function createIngestUrlTool(
  client: GraphlitClient,
  options: IngestUrlToolOptions = {},
): GraphlitAgentTool<IngestUrlArgs, IngestUrlResult> {
  return {
    tool: createToolDefinition(
      "ingest_url",
      "Ingest a public URL into Graphlit so it can be retrieved by later agent turns.",
      IngestUrlInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = IngestUrlInputSchema.parse(rawArgs);
      const waitForCompletion =
        args.waitForCompletion ?? options.defaultWaitForCompletion ?? false;
      const response = await client.ingestUri(
        args.url,
        args.name,
        undefined,
        undefined,
        waitForCompletion,
        options.workflow,
        options.collections,
        undefined,
        options.correlationId,
      );
      const content = response.ingestUri;

      if (!content) {
        throw new Error(`Failed to ingest URL: ${args.url}`);
      }

      artifacts?.addPending(Promise.resolve({ id: content.id }));

      return {
        id: content.id,
        resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
        name: contentName(content),
        uri: scalarToString(content.uri),
        state: content.state,
        type: content.type,
        fileType: content.fileType,
        mimeType: content.mimeType,
        waitForCompletion,
      };
    },
  };
}
