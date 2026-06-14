import type { Graphlit } from "graphlit-client";
import { Types } from "graphlit-client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import * as agentToolsExports from "../src/index.js";
import {
  createAddContentLabelTool,
  createAddContentsToCollectionTool,
  createAnalyzePromptTool,
  createCountContentsTool,
  createCreateCollectionTool,
  createDeleteCollectionTool,
  createDeleteMemoryTool,
  createEnrichCompaniesTool,
  createEnrichPersonsTool,
  createExploreEntityTool,
  createIngestLinksTool,
  createIngestMemoryTool,
  createIngestTextTool,
  createIngestUrlTool,
  createInspectContentTool,
  createListResourcesTool,
  createLookupEntityTool,
  createPublishAudioTool,
  createPublishImageTool,
  createPublishVideoTool,
  createQueryCollectionsTool,
  createQueryContentFacetsTool,
  createQueryFeedsTool,
  createReadResourceTool,
  createRemoveContentLabelTool,
  createRemoveContentsFromCollectionTool,
  createRetrieveCommunicationsTool,
  createRetrieveConversationsTool,
  createRetrieveContentsTool,
  createRetrieveEntitiesTool,
  createRetrieveFactsTool,
  createRetrieveImagesTool,
  createRetrieveMemoriesTool,
  createScreenshotPageTool,
  createWaitContentDoneTool,
  createWaitFeedDoneTool,
  createWebCrawlTool,
  createWebMapTool,
  createWebSearchTool,
  type StreamAgentArtifactCollector,
} from "../src/index.js";

function asClient(client: Partial<Graphlit>): Graphlit {
  return client as Graphlit;
}

describe("agent tools", () => {
  it("creates Graphlit tool definitions with JSON schemas", () => {
    const client = asClient({});
    const tools = [
      createAddContentLabelTool(client),
      createAddContentsToCollectionTool(client),
      createAnalyzePromptTool(),
      createCountContentsTool(client),
      createCreateCollectionTool(client),
      createDeleteCollectionTool(client),
      createDeleteMemoryTool(client),
      createEnrichCompaniesTool(client),
      createEnrichPersonsTool(client),
      createExploreEntityTool(client),
      createIngestLinksTool(client),
      createIngestMemoryTool(client),
      createIngestTextTool(client),
      createRetrieveContentsTool(client),
      createInspectContentTool(client),
      createListResourcesTool(client),
      createLookupEntityTool(client),
      createPublishAudioTool(client),
      createPublishImageTool(client),
      createPublishVideoTool(client),
      createQueryCollectionsTool(client),
      createQueryContentFacetsTool(client),
      createQueryFeedsTool(client),
      createReadResourceTool(client),
      createRemoveContentLabelTool(client),
      createRemoveContentsFromCollectionTool(client),
      createRetrieveCommunicationsTool(client),
      createRetrieveConversationsTool(client),
      createRetrieveEntitiesTool(client),
      createRetrieveFactsTool(client),
      createRetrieveImagesTool(client),
      createRetrieveMemoriesTool(client),
      createWebSearchTool(client),
      createIngestUrlTool(client),
      createWaitContentDoneTool(client),
      createWaitFeedDoneTool(client),
      createWebCrawlTool(client),
      createWebMapTool(client),
      createScreenshotPageTool(client),
    ];

    for (const graphlitTool of tools) {
      const schema = JSON.parse(graphlitTool.tool.schema) as {
        type?: string;
        properties?: Record<string, unknown>;
      };

      expect(graphlitTool.tool.name).toBeTruthy();
      expect(graphlitTool.inputSchema).toBeTruthy();
      expect(graphlitTool.inputSchema.safeParse({}).success).toBeTypeOf(
        "boolean",
      );
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeTruthy();
    }
  });

  it("keeps private Zine/Dossium tools out of package exports", () => {
    const exportedNames = new Set(Object.keys(agentToolsExports));

    for (const privateName of [
      "createInspectTool",
      "createDraftEmailTool",
      "createSendEmailTool",
      "createPostChannelMessageTool",
      "createPostSocialTool",
      "createWriteDocumentTool",
      "createWriteIssueTool",
      "createWriteCalendarEventTool",
      "createPlatformListResourcesTool",
      "createPlatformReadResourceTool",
    ]) {
      expect(exportedNames.has(privateName)).toBe(false);
    }
  });

  it("keeps source and tests free of app-layer dependency strings", () => {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const files: string[] = [];

    function visit(path: string): void {
      for (const entry of readdirSync(path)) {
        const fullPath = join(path, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          visit(fullPath);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          files.push(fullPath);
        }
      }
    }

    visit(join(root, "src"));
    visit(join(root, "test"));

    const banned = [
      /from ['"]@\//,
      /from ['"].*zine/i,
      new RegExp("re" + "dis", "i"),
      new RegExp("cl" + "erk", "i"),
      new RegExp("graphlit" + "-server", "i"),
      new RegExp("oauth" + "-connector", "i"),
      new RegExp("distribution" + "-utils", "i"),
      new RegExp("resolution" + "-required", "i"),
      new RegExp("agent" + "Targets"),
      new RegExp("Execution" + "Context"),
      new RegExp("createResolutionRequired" + "Result"),
      new RegExp("content" + "Link"),
      new RegExp("getVariant" + "BaseUrl"),
    ];

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of banned) {
        expect(pattern.test(text)).toBe(false);
      }
    }
  });

  it("returns a pure prompt analysis routing contract", async () => {
    const analyzePrompt = createAnalyzePromptTool();

    const result = await analyzePrompt.handler({
      prompt: "What is the latest from the NHL Stanley Cup Final?",
      retrievalNeeded: true,
      intent: "current_lookup",
      complexity: "standard",
      sourceScopes: ["public_web"],
      subjects: [
        {
          text: "NHL Stanley Cup Final",
          kind: "event",
          role: "primary",
        },
      ],
      evidencePlan: [
        {
          purpose: "search_public_web",
          queryOrTarget:
            "official NHL Stanley Cup Final latest schedule result",
          priority: "required",
          reason: "Current status and schedule can change.",
        },
        {
          purpose: "cross_check",
          queryOrTarget: "latest game recap from a second source",
          priority: "preferred",
          reason: "Cross-check answer-critical details.",
        },
      ],
      answerContract: {
        shape: "bullets",
        mustInclude: ["series status", "latest result", "next game"],
        citationExpectation: "source_labels",
        gapHandling: "Call out stale, missing, or contradictory evidence.",
      },
      nextStep: {
        tool: "web_search",
        parameters: {
          query: "official NHL Stanley Cup Final latest schedule result",
          limit: 5,
        },
        reason: "Start with current source-of-record status.",
      },
    });

    expect(result).toMatchObject({
      type: "prompt_analysis",
      retrievalNeeded: true,
      intent: "current_lookup",
      complexity: "standard",
      constraints: [],
      nextStep: { tool: "web_search" },
    });
  });

  it("lists and reads Graphlit resource-shaped URIs without platform MCP tool names", async () => {
    const queryCollections = vi.fn(
      async (): Promise<Types.QueryCollectionsQuery> =>
        ({
          collections: {
            results: [
              {
                id: "collection-1",
                name: "Customer docs",
                state: Types.EntityState.Enabled,
                type: Types.CollectionTypes.Collection,
                creationDate: "2026-06-01T00:00:00Z",
                owner: { id: "owner-1" },
              },
            ],
          },
        }) as Types.QueryCollectionsQuery,
    );
    const getFact = vi.fn(
      async (): Promise<Types.GetFactQuery> =>
        ({
          fact: {
            id: "fact-1",
            text: "The customer asked about onboarding risk.",
            state: Types.EntityState.Enabled,
            creationDate: "2026-06-10T00:00:00Z",
            owner: { id: "owner-1" },
          },
        }) as Types.GetFactQuery,
    );
    const client = asClient({ queryCollections, getFact });
    const listResources = createListResourcesTool(client);
    const readResource = createReadResourceTool(client);

    const listed = await listResources.handler({ kinds: ["collections"] });
    const read = await readResource.handler({ uri: "facts://fact-1" });

    expect(listed.resources[0]).toMatchObject({
      uri: "collections://collection-1",
      kind: "collections",
    });
    expect(getFact).toHaveBeenCalledWith("fact-1", undefined);
    expect(read).toMatchObject({
      uri: "facts://fact-1",
      resourceType: "facts",
      text: "The customer asked about onboarding risk.",
    });
  });

  it("uses queryContents for filter-only retrieval", async () => {
    const queryContents = vi.fn(
      async (
        _filter?: Types.ContentFilter,
      ): Promise<Types.QueryContentsQuery> =>
        ({
          contents: {
            results: [
              {
                id: "email-1",
                name: "Customer onboarding thread",
                fileName: null,
                uri: "https://mail.example/thread/1",
                type: Types.ContentTypes.Email,
                fileType: null,
                mimeType: "message/rfc822",
                creationDate: "2026-06-10T00:00:00Z",
                originalDate: "2026-06-10T00:00:00Z",
                relevance: 0.9,
                summary: "The customer asked about onboarding risk.",
              },
            ],
          },
        }) as Types.QueryContentsQuery,
    );
    const client = asClient({ queryContents });
    const retrieveContents = createRetrieveContentsTool(client);

    const result = await retrieveContents.handler({
      type: Types.ContentTypes.Email,
      inLast: "P7D",
      limit: 25,
    });

    expect(queryContents).toHaveBeenCalledWith(
      expect.objectContaining({
        disableInheritance: true,
        inLast: "P7D",
        limit: 25,
        types: [Types.ContentTypes.Email],
      }),
    );
    expect(result).toMatchObject({
      search: null,
      results: [
        {
          id: "email-1",
          resourceUri: "contents://email-1",
          name: "Customer onboarding thread",
          text: "The customer asked about onboarding risk.",
        },
      ],
    });
  });

  it("uses retrieveSources and lookupContents for searched retrieval", async () => {
    const retrieveSources = vi.fn(
      async (): Promise<Types.RetrieveSourcesMutation> =>
        ({
          retrieveSources: {
            results: [
              {
                content: { id: "content-1" },
                text: "A source excerpt about onboarding risk.",
                relevance: 0.82,
                metadata: '{"section":"email"}',
                pageNumber: null,
                frameNumber: null,
              },
            ],
          },
        }) as Types.RetrieveSourcesMutation,
    );
    const lookupContents = vi.fn(
      async (_ids: string[]): Promise<Types.LookupContentsQuery> =>
        ({
          lookupContents: {
            results: [
              {
                id: "content-1",
                name: "Onboarding update",
                fileName: null,
                uri: "https://mail.example/thread/2",
                type: Types.ContentTypes.Email,
                fileType: null,
                mimeType: "message/rfc822",
                creationDate: "2026-06-09T00:00:00Z",
                originalDate: "2026-06-09T00:00:00Z",
                summary: "Fallback summary",
              },
            ],
          },
        }) as Types.LookupContentsQuery,
    );
    const client = asClient({ retrieveSources, lookupContents });
    const retrieveContents = createRetrieveContentsTool(client, {
      correlationId: "tenant-1",
    });

    const result = await retrieveContents.handler({
      search: "onboarding risk",
      type: Types.ContentTypes.Email,
      limit: 3,
    });

    expect(retrieveSources).toHaveBeenCalledWith(
      "onboarding risk",
      expect.objectContaining({
        searchType: Types.SearchTypes.Hybrid,
        types: [Types.ContentTypes.Email],
      }),
      undefined,
      expect.objectContaining({
        type: Types.RetrievalStrategyTypes.Section,
        contentLimit: 3,
        disableFallback: true,
      }),
      expect.objectContaining({
        serviceType: Types.RerankingModelServiceTypes.Cohere,
      }),
      "tenant-1",
    );
    expect(lookupContents).toHaveBeenCalledWith(["content-1"]);
    expect(result.results[0]).toMatchObject({
      id: "content-1",
      resourceUri: "contents://content-1",
      text: "A source excerpt about onboarding risk.",
      relevance: 0.82,
    });
  });

  it("uses PARALLEL web search by default", async () => {
    const searchWeb = vi.fn(
      async (): Promise<Types.SearchWebQuery> =>
        ({
          searchWeb: {
            results: [
              {
                title: "Graphlit docs",
                uri: "https://docs.graphlit.dev",
                text: "Graphlit documentation",
                score: 0.7,
              },
            ],
          },
        }) as Types.SearchWebQuery,
    );
    const client = asClient({ searchWeb });
    const webSearch = createWebSearchTool(client, {
      correlationId: "tenant-1",
    });

    const result = await webSearch.handler({ query: "Graphlit streamAgent" });

    expect(searchWeb).toHaveBeenCalledWith(
      "Graphlit streamAgent",
      Types.SearchServiceTypes.Parallel,
      10,
      "tenant-1",
    );
    expect(result.results[0]).toMatchObject({
      uri: "https://docs.graphlit.dev",
      title: "Graphlit docs",
    });
  });

  it("ingests URLs and registers created content as an artifact", async () => {
    const ingestUri = vi.fn(
      async (): Promise<Types.IngestUriMutation> =>
        ({
          ingestUri: {
            id: "url-1",
            name: "Example",
            state: Types.EntityState.Enabled,
            type: Types.ContentTypes.Page,
            fileType: null,
            mimeType: "text/html",
            uri: "https://example.com",
          },
        }) as Types.IngestUriMutation,
    );
    const addPending = vi.fn();
    const artifacts: StreamAgentArtifactCollector = {
      addPending,
      resolve: async () => [{ id: "url-1" }],
    };
    const client = asClient({ ingestUri });
    const ingestUrl = createIngestUrlTool(client, {
      collections: [{ id: "collection-1" }],
      workflow: { id: "workflow-1" },
      defaultWaitForCompletion: true,
      correlationId: "tenant-1",
    });

    const result = await ingestUrl.handler(
      { url: "https://example.com" },
      artifacts,
    );

    expect(ingestUri).toHaveBeenCalledWith(
      "https://example.com",
      undefined,
      undefined,
      undefined,
      true,
      { id: "workflow-1" },
      [{ id: "collection-1" }],
      undefined,
      "tenant-1",
    );
    expect(addPending).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      id: "url-1",
      resourceUri: "contents://url-1",
      waitForCompletion: true,
    });
  });

  it("inspects content by resource URI", async () => {
    const getContent = vi.fn(
      async (): Promise<Types.GetContentQuery> =>
        ({
          content: {
            id: "content-1",
            name: "Launch notes",
            fileName: null,
            uri: "https://example.com/launch",
            type: Types.ContentTypes.Page,
            fileType: null,
            mimeType: "text/html",
            markdown: "# Launch notes",
          },
        }) as Types.GetContentQuery,
    );
    const client = asClient({ getContent });
    const inspectContent = createInspectContentTool(client);

    const result = await inspectContent.handler({
      resourceUri: "contents://content-1",
      mode: "markdown",
    });

    expect(getContent).toHaveBeenCalledWith("content-1");
    expect(result).toMatchObject({
      id: "content-1",
      resourceUri: "contents://content-1",
      text: "# Launch notes",
    });
  });

  it("polls content readiness", async () => {
    const isContentDone = vi.fn(
      async (): Promise<Types.IsContentDoneQuery> =>
        ({
          isContentDone: { result: true },
        }) as Types.IsContentDoneQuery,
    );
    const client = asClient({ isContentDone });
    const waitContentDone = createWaitContentDoneTool(client);

    const result = await waitContentDone.handler({ id: "content-1" });

    expect(isContentDone).toHaveBeenCalledWith("content-1");
    expect(result).toMatchObject({
      id: "content-1",
      done: true,
      attempts: 1,
    });
  });
});
