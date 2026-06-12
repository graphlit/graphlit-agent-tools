import { Types } from "graphlit-client";
import { z } from "zod";

import type {
  ContentReference,
  GraphlitAgentTool,
  GraphlitClient,
} from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import {
  contentName,
  parseContentResourceUri,
  scalarToString,
  toContentResourceUri,
} from "../utils/content.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_CONCURRENCY = 3;

type ContentLink = NonNullable<
  NonNullable<Types.GetContentQuery["content"]>["links"]
>[number];

export const IngestLinksInputSchema = z.object({
  id: z.string().trim().min(1).optional().describe("Graphlit content ID."),
  resourceUri: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Graphlit content resource URI, such as contents://content-id."),
  linkTypes: z
    .array(z.nativeEnum(Types.LinkTypes))
    .optional()
    .describe("Optional hyperlink types to include."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum new links to ingest. Defaults to 20."),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe("Whether Graphlit should process each link synchronously."),
});

export type IngestLinksArgs = z.infer<typeof IngestLinksInputSchema>;

export interface IngestLinksToolOptions {
  collections?: ContentReference[];
  workflow?: Types.EntityReferenceInput;
  defaultWaitForCompletion?: boolean;
  defaultLimit?: number;
  concurrency?: number;
  correlationId?: string;
}

export interface IngestLinksResult {
  sourceContentId: string;
  ingested: Array<{ id: string; resourceUri: string; name: string; uri?: string | null }>;
  alreadyExisted: Array<{ id: string; resourceUri: string; name: string; uri?: string | null }>;
  failed: Array<{ uri: string; error: string }>;
  remaining: number;
}

function resolveContentId(args: IngestLinksArgs): string {
  const id = args.id ?? parseContentResourceUri(args.resourceUri);

  if (!id) {
    throw new Error("Provide either id or resourceUri.");
  }

  return id;
}

function compactContent(content: {
  id: string;
  name?: string | null;
  fileName?: string | null;
  uri?: unknown;
}) {
  return {
    id: content.id,
    resourceUri: toContentResourceUri(content.id) ?? `contents://${content.id}`,
    name: contentName(content),
    uri: scalarToString(content.uri),
  };
}

export function createIngestLinksTool(
  client: GraphlitClient,
  options: IngestLinksToolOptions = {},
): GraphlitAgentTool<
  IngestLinksArgs,
  IngestLinksResult,
  typeof IngestLinksInputSchema
> {
  return {
    inputSchema: IngestLinksInputSchema,
    tool: createToolDefinition(
      "ingest_links",
      "Ingest public hyperlinks extracted from an existing Graphlit content item, skipping URLs already present in Graphlit.",
      IngestLinksInputSchema,
    ),
    handler: async (rawArgs, artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = IngestLinksInputSchema.parse(rawArgs);
      const sourceContentId = resolveContentId(args);
      const limit = clampInteger(
        args.limit,
        options.defaultLimit ?? DEFAULT_LIMIT,
        1,
        100,
      );
      const waitForCompletion =
        args.waitForCompletion ?? options.defaultWaitForCompletion ?? false;
      const response = await client.getContent(sourceContentId);
      const links =
        response.content?.links?.filter((link): link is ContentLink => Boolean(link?.uri)) ?? [];
      const allowedTypes = new Set(args.linkTypes ?? []);
      const uris = [
        ...new Set(
          links
            .filter(
              (link) =>
                allowedTypes.size === 0 ||
                (link.linkType ? allowedTypes.has(link.linkType) : false),
            )
            .map((link) => scalarToString(link.uri))
            .filter((uri): uri is string => Boolean(uri)),
        ),
      ];

      const selected = uris.slice(0, limit);
      const alreadyExisted: IngestLinksResult["alreadyExisted"] = [];
      const ingested: IngestLinksResult["ingested"] = [];
      const failed: IngestLinksResult["failed"] = [];

      await mapWithConcurrency(
        selected,
        options.concurrency ?? DEFAULT_CONCURRENCY,
        async (uri) => {
          try {
            const existing = await client.queryContents({
              uri,
              limit: 1,
              disableInheritance: true,
            });
            const existingContent = existing.contents?.results?.find(Boolean);

            if (existingContent) {
              alreadyExisted.push(compactContent(existingContent));
              return;
            }

            const ingest = await client.ingestUri(
              uri,
              undefined,
              undefined,
              undefined,
              waitForCompletion,
              options.workflow,
              options.collections,
              undefined,
              options.correlationId,
            );
            const content = ingest.ingestUri;

            if (!content) {
              failed.push({ uri, error: "Graphlit did not return ingested content." });
              return;
            }

            artifacts?.addPending(Promise.resolve({ id: content.id }));
            ingested.push(compactContent(content));
          } catch (error) {
            failed.push({
              uri,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
        abortSignal,
      );

      return {
        sourceContentId,
        ingested,
        alreadyExisted,
        failed,
        remaining: Math.max(0, uris.length - selected.length),
      };
    },
  };
}
