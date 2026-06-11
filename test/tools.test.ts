import type { Graphlit } from "graphlit-client";
import { Types } from "graphlit-client";
import { describe, expect, it, vi } from "vitest";

import {
  createIngestUrlTool,
  createInspectContentTool,
  createRetrieveContentsTool,
  createWaitContentDoneTool,
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
      createRetrieveContentsTool(client),
      createInspectContentTool(client),
      createWebSearchTool(client),
      createIngestUrlTool(client),
      createWaitContentDoneTool(client),
    ];

    for (const graphlitTool of tools) {
      const schema = JSON.parse(graphlitTool.tool.schema) as {
        type?: string;
        properties?: Record<string, unknown>;
      };

      expect(graphlitTool.tool.name).toBeTruthy();
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeTruthy();
    }
  });

  it("uses queryContents for filter-only retrieval", async () => {
    const queryContents = vi.fn(
      async (_filter?: Types.ContentFilter): Promise<Types.QueryContentsQuery> =>
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
                metadata: "{\"section\":\"email\"}",
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
    const webSearch = createWebSearchTool(client, { correlationId: "tenant-1" });

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
