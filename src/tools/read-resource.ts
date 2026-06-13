import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { parseResourceUri, scalarToString } from "../utils/content.js";
import { buildPublicContentFilter } from "../utils/filters.js";
import { isNotNullish, mapCompactContent, mapCompactFeed, mapGraphNode, mapReference, stripTypename } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";
import { truncateText } from "../utils/text.js";
import { createInspectContentTool } from "./inspect-content.js";
import type { ResourceKind } from "./list-resources.js";

const DEFAULT_MAX_TEXT_LENGTH = 20_000;
const DEFAULT_RELATED_LIMIT = 20;
const DEFAULT_ALLOWED_KINDS: ResourceKind[] = [
  "contents",
  "collections",
  "feeds",
  "facts",
  "conversations",
  "entities",
];

export const ReadResourceInputSchema = z.object({
  uri: z
    .string()
    .trim()
    .min(1)
    .describe("Graphlit resource URI: contents://, collections://, feeds://, facts://, conversations://, or entities://."),
  maxTextLength: z.number().int().min(1).optional(),
  relatedLimit: z.number().int().min(1).max(100).optional(),
});

export type ReadResourceArgs = z.infer<typeof ReadResourceInputSchema>;

export interface ReadResourceToolOptions {
  allowedKinds?: ResourceKind[];
  maxTextLength?: number;
  relatedLimit?: number;
  correlationId?: string;
}

export interface ReadResourceResult {
  uri: string;
  resourceType: ResourceKind;
  name?: string | null;
  mimeType: string;
  text: string;
  metadata: unknown;
  related?: unknown;
}

function resolveUri(uri: string): { type: ResourceKind; id: string } {
  for (const type of [
    "contents",
    "collections",
    "feeds",
    "facts",
    "conversations",
    "entities",
  ] as const) {
    const id = parseResourceUri(uri, type);

    if (id) {
      return { type, id };
    }
  }

  throw new Error(`Unsupported resource URI: ${uri}`);
}

function allowedKinds(options: ReadResourceToolOptions): ResourceKind[] {
  return [...new Set(options.allowedKinds ?? DEFAULT_ALLOWED_KINDS)];
}

function assertAllowedKind(
  kind: ResourceKind,
  options: ReadResourceToolOptions,
): void {
  if (!allowedKinds(options).includes(kind)) {
    throw new Error(`Resource kind not allowed: ${kind}`);
  }
}

export function createReadResourceTool(
  client: GraphlitClient,
  options: ReadResourceToolOptions = {},
): GraphlitAgentTool<
  ReadResourceArgs,
  ReadResourceResult,
  typeof ReadResourceInputSchema
> {
  return {
    inputSchema: ReadResourceInputSchema,
    tool: createToolDefinition(
      "read_resource",
      "Read a Graphlit resource URI returned by agent-tools. Does not read external URLs or app-specific resources.",
      ReadResourceInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = ReadResourceInputSchema.parse(rawArgs);
      const { type, id } = resolveUri(args.uri);

      assertAllowedKind(type, options);

      const maxTextLength = args.maxTextLength ?? options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
      const relatedLimit = clampInteger(
        args.relatedLimit,
        options.relatedLimit ?? DEFAULT_RELATED_LIMIT,
        1,
        100,
      );

      if (type === "contents") {
        const inspect = createInspectContentTool(client, {
          maxTextLength,
          correlationId: options.correlationId,
        });
        const result = await inspect.handler(
          { resourceUri: args.uri, maxTextLength },
          undefined,
          abortSignal,
        );

        return {
          uri: args.uri,
          resourceType: type,
          name: result.name,
          mimeType: result.mimeType ?? "text/markdown",
          text: result.text,
          metadata: result,
        };
      }

      if (type === "collections") {
        const response = await client.getCollection(id);
        const collection = response.collection;

        if (!collection) {
          throw new Error(`Collection not found: ${id}`);
        }

        const contents = await client.queryContents(
          buildPublicContentFilter({ collectionIds: [id] }, {}, relatedLimit),
        );
        const relatedContents = contents.contents?.results?.filter(isNotNullish).map(mapCompactContent) ?? [];
        const text = JSON.stringify(
          {
            collection: collection.name,
            type: collection.type,
            contents: relatedContents,
          },
          null,
          2,
        );

        return {
          uri: args.uri,
          resourceType: type,
          name: collection.name,
          mimeType: "application/json",
          text: truncateText(text, maxTextLength).text,
          metadata: stripTypename(collection),
          related: { contents: relatedContents },
        };
      }

      if (type === "feeds") {
        const response = await client.getFeed(id);
        const feed = response.feed;

        if (!feed) {
          throw new Error(`Feed not found: ${id}`);
        }

        const contents = await client.queryContents(
          buildPublicContentFilter({ feedIds: [id] }, {}, relatedLimit),
        );
        const relatedContents = contents.contents?.results?.filter(isNotNullish).map(mapCompactContent) ?? [];
        const safeFeed = mapCompactFeed(feed);
        const text = JSON.stringify({ feed: safeFeed, contents: relatedContents }, null, 2);

        return {
          uri: args.uri,
          resourceType: type,
          name: feed.name,
          mimeType: "application/json",
          text: truncateText(text, maxTextLength).text,
          metadata: safeFeed,
          related: { contents: relatedContents },
        };
      }

      if (type === "facts") {
        const response = await client.getFact(id, options.correlationId);
        const fact = response.fact;

        if (!fact) {
          throw new Error(`Fact not found: ${id}`);
        }

        return {
          uri: args.uri,
          resourceType: type,
          name: truncateText(fact.text, 80).text,
          mimeType: "application/json",
          text: truncateText(fact.text, maxTextLength).text,
          metadata: {
            id: fact.id,
            state: fact.state,
            category: fact.category,
            confidence: fact.confidence,
            validAt: scalarToString(fact.validAt),
            invalidAt: scalarToString(fact.invalidAt),
            sourceType: fact.sourceType,
            content: fact.content ? mapReference(fact.content, "contents") : null,
            conversation: fact.conversation
              ? mapReference(fact.conversation, "conversations")
              : null,
            feeds: fact.feeds?.filter(isNotNullish).map((feed) => mapReference(feed, "feeds")) ?? [],
            mentions:
              fact.mentions?.filter(isNotNullish).map((mention) => ({
                type: mention.type,
                observable: mention.observable,
                start: mention.start,
                end: mention.end,
              })) ?? [],
          },
        };
      }

      if (type === "conversations") {
        const response = await client.getConversation(id);
        const conversation = response.conversation;

        if (!conversation) {
          throw new Error(`Conversation not found: ${id}`);
        }

        const messages =
          conversation.messages?.filter(isNotNullish).map((message) => ({
            role: message.role,
            author: message.author,
            message: message.message,
            timestamp: scalarToString(message.timestamp),
            citations:
              message.citations?.filter(isNotNullish).map((citation) => ({
                text: citation.text,
                index: citation.index,
                content: citation.content ? mapReference(citation.content, "contents") : null,
              })) ?? [],
          })) ?? [];
        const text = JSON.stringify(
          {
            name: conversation.name,
            type: conversation.type,
            summary: conversation.summary,
            messages,
          },
          null,
          2,
        );

        return {
          uri: args.uri,
          resourceType: type,
          name: conversation.name,
          mimeType: "application/json",
          text: truncateText(text, maxTextLength).text,
          metadata: {
            id: conversation.id,
            name: conversation.name,
            state: conversation.state,
            type: conversation.type,
            creationDate: scalarToString(conversation.creationDate),
            modifiedDate: scalarToString(conversation.modifiedDate),
            messageCount: conversation.messageCount,
            turnCount: conversation.turnCount,
            summary: conversation.summary,
          },
        };
      }

      const response = await client.lookupEntity(
        {
          id,
          includeMetadata: true,
          limit: relatedLimit,
          disableInheritance: true,
        },
        options.correlationId,
      );
      const lookup = response.lookupEntity;

      if (!lookup?.entity) {
        throw new Error(`Entity not found: ${id}`);
      }

      const entity = mapGraphNode(lookup.entity);
      const relationships =
        lookup.relationships?.filter(isNotNullish).map((relationship) => ({
          relation: relationship.relation,
          direction: relationship.direction,
          entity: mapGraphNode(relationship.entity),
        })) ?? [];
      const text = JSON.stringify({ entity, relationships }, null, 2);

      return {
        uri: args.uri,
        resourceType: type,
        name: entity.name,
        mimeType: "application/json",
        text: truncateText(text, maxTextLength).text,
        metadata: entity,
        related: { relationships, totalCount: lookup.totalCount },
      };
    },
  };
}
