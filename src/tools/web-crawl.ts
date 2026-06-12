import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { toFeedResourceUri } from "../utils/content.js";
import { throwIfAborted } from "../utils/abort.js";
import { createToolDefinition } from "../utils/schema.js";

export const WebCrawlInputSchema = z.object({
  url: z.string().trim().url().describe("Website URL to crawl."),
  name: z.string().trim().min(1).optional().describe("Feed name."),
  identifier: z.string().trim().min(1).optional().describe("Optional feed identifier."),
  readLimit: z.number().int().min(1).optional().describe("Maximum items to read."),
  includeFiles: z.boolean().optional().describe("Whether to include linked files."),
  allowedPaths: z.array(z.string().trim().min(1)).optional(),
  excludedPaths: z.array(z.string().trim().min(1)).optional(),
  schedule: z
    .enum(["once", "monitor", "repeat"])
    .optional()
    .describe("Feed recurrence. Defaults to once."),
  repeatInterval: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("ISO 8601 duration for repeat schedules, such as PT6H."),
});

export type WebCrawlArgs = z.infer<typeof WebCrawlInputSchema>;

export interface WebCrawlToolOptions {
  workflow?: Types.EntityReferenceInput;
  correlationId?: string;
}

export interface WebCrawlResult {
  id: string;
  resourceUri: string;
  name: string;
  identifier?: string | null;
  state?: Types.EntityState | null;
  type: Types.FeedTypes;
  schedule: "once" | "monitor" | "repeat";
}

function recurrenceType(schedule: "once" | "monitor" | "repeat") {
  return schedule === "monitor"
    ? Types.TimedPolicyRecurrenceTypes.Monitor
    : schedule === "repeat"
      ? Types.TimedPolicyRecurrenceTypes.Repeat
      : Types.TimedPolicyRecurrenceTypes.Once;
}

export function createWebCrawlTool(
  client: GraphlitClient,
  options: WebCrawlToolOptions = {},
): GraphlitAgentTool<WebCrawlArgs, WebCrawlResult, typeof WebCrawlInputSchema> {
  return {
    inputSchema: WebCrawlInputSchema,
    tool: createToolDefinition(
      "web_crawl",
      "Create a Graphlit web crawl feed. Defaults to a one-time crawl unless a schedule is provided.",
      WebCrawlInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = WebCrawlInputSchema.parse(rawArgs);
      const schedule = args.schedule ?? "once";
      const response = await client.createFeed(
        {
          name: args.name ?? args.url,
          identifier: args.identifier,
          type: Types.FeedTypes.Web,
          workflow: options.workflow,
          web: {
            uri: args.url,
            readLimit: args.readLimit,
            includeFiles: args.includeFiles,
            allowedPaths: args.allowedPaths,
            excludedPaths: args.excludedPaths,
          },
          schedulePolicy: {
            recurrenceType: recurrenceType(schedule),
            repeatInterval: schedule === "repeat" ? args.repeatInterval : undefined,
          },
        },
        options.correlationId,
      );
      const feed = response.createFeed;

      if (!feed) {
        throw new Error(`Failed to create web crawl feed: ${args.url}`);
      }

      return {
        id: feed.id,
        resourceUri: toFeedResourceUri(feed.id) ?? `feeds://${feed.id}`,
        name: feed.name,
        identifier: feed.identifier,
        state: feed.state,
        type: feed.type,
        schedule,
      };
    },
  };
}
