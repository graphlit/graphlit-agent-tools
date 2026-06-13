# @graphlit/agent-tools

Give your agent the Graphlit retrieval tools it needs.

Agents that answer from private knowledge need a small set of reliable abilities: retrieve the right Graphlit content, inspect the source behind a claim, and bring in fresh context when the knowledge base is missing something. `@graphlit/agent-tools` packages those abilities as small, framework-friendly tools backed by Graphlit.

Use these tools with any agent harness that accepts structured tool definitions and async handlers: Graphlit `streamAgent()`, OpenAI Agents SDK, Mastra, Claude Agent SDK, Claude Managed Agents, the Vercel AI SDK, or your own loop.

## Why Use It

- **Give your agent private context**: retrieve from Graphlit-ingested documents, emails, events, messages, pages, posts, and files.
- **Ground answers in inspectable sources**: return `contents://...` references your app can render or inspect before the agent makes source-backed claims.
- **Handle real retrieval requests**: support semantic questions like "what risks did the customer mention?" and filter-only requests like "all emails in the last week."
- **Bring in fresh context when needed**: let the agent search the web, ingest a URL, and wait for processing before using newly added content.
- **Keep control in the app**: choose the tools your agent should have without adding tool discovery, an MCP wrapper, or an approval layer.

## Install

```bash
npm install graphlit-client @graphlit/agent-tools
```

Run these tools server-side with Graphlit credentials. Do not expose Graphlit project credentials to the browser.

## Tool Shape

Every tool creator returns the same three pieces:

```typescript
type GraphlitAgentTool<TArgs, TResult> = {
  // Zod schema for frameworks that accept Zod or Standard JSON Schema.
  inputSchema: z.ZodType<TArgs>;

  // Graphlit tool definition. The schema is also available as a JSON string.
  tool: Types.ToolDefinitionInput;

  // Async implementation. The handler validates args with Zod before calling Graphlit.
  handler: (
    args: TArgs,
    artifacts?: StreamAgentArtifactCollector,
    abortSignal?: AbortSignal,
  ) => Promise<TResult>;
};
```

That shape is intentionally boring:

- Use `tool` plus `handler` with Graphlit `streamAgent()`.
- Use `inputSchema` plus `handler` with Zod/Standard-Schema frameworks like OpenAI Agents SDK and Mastra.
- Use `inputSchema.shape` plus `handler` with Claude Agent SDK custom tools.
- Use `JSON.parse(tool.schema)` plus `handler` with JSON Schema frameworks such as Claude Managed Agents custom tools.
- Call `handler(args)` directly from any custom agent loop.

## Tools

Prefer `retrieve_contents` plus `inspect_content` as the default RAG pair. Add mutating, enrichment, and generation tools only when the host app wants the agent to have those abilities.

For read-only agent comparisons or customer-facing agents that should not mutate a Graphlit project, a good default set is `retrieve_contents`, `inspect_content`, `count_contents`, `list_resources`, `read_resource`, `web_search`, and `web_map`. When exposing resource tools in a constrained app, pass `allowedKinds` to keep the agent inside the resource surface you intend.

### Read-Only Retrieval

| Agent ability | Add this tool | What it does |
| --- | --- | --- |
| Retrieve Graphlit knowledge | `createRetrieveContentsTool()` | Find relevant ingested content for grounded answers. |
| Inspect a source | `createInspectContentTool()` | Read fuller text, parent/child references, export URI text, or optional image descriptions from a returned `contents://...` source. |
| Count content | `createCountContentsTool()` | Count content matching public filters. |
| Query facets | `createQueryContentFacetsTool()` | Return content facet buckets for counts and filtering. |
| Retrieve communications | `createRetrieveCommunicationsTool()` | Find emails, events, messages, posts, issues, and pull requests by topic, participants, domains, and recency. |
| Retrieve conversations | `createRetrieveConversationsTool()` | Search Graphlit conversations. |
| Retrieve entities | `createRetrieveEntitiesTool()` | Retrieve knowledge-graph entities relevant to a prompt. |
| Retrieve facts | `createRetrieveFactsTool()` | Retrieve facts relevant to a prompt and filter. |
| Lookup an entity | `createLookupEntityTool()` | Resolve an entity by ID or name and return relationships. |
| Explore entities | `createExploreEntityTool()` | Compose entity lookup, related facts, contents, and conversations. |
| Retrieve images | `createRetrieveImagesTool()` | Retrieve image content and optionally fetch image bytes. |
| Retrieve memories | `createRetrieveMemoriesTool()` | Retrieve memory content with `ContentTypes.Memory` locked internally. |
| Query collections | `createQueryCollectionsTool()` | List collections. |
| Query feeds | `createQueryFeedsTool()` | List feeds. |
| Search the public web | `createWebSearchTool()` | Find current web leads without ingesting them. |
| Map a site | `createWebMapTool()` | Discover public URLs from a site map without ingesting them. |
| List resource URIs | `createListResourcesTool()` | List Graphlit resource URIs that `read_resource` can dereference. |
| Read resource URIs | `createReadResourceTool()` | Read `contents://`, `collections://`, `feeds://`, `facts://`, `conversations://`, and `entities://` resources through SDK calls. |

### Graphlit Content Mutation

These tools mutate Graphlit project state. Host applications should expose them intentionally and apply their own approval policy when needed.

| Agent ability | Add this tool | What it does |
| --- | --- | --- |
| Add a URL | `createIngestUrlTool()` | Save a public URL for later retrieval. |
| Add text | `createIngestTextTool()` | Save raw text for later retrieval. |
| Add links | `createIngestLinksTool()` | Ingest public hyperlinks extracted from existing Graphlit content. |
| Screenshot a page | `createScreenshotPageTool()` | Capture a public page screenshot into Graphlit. |
| Create a collection | `createCreateCollectionTool()` | Create a collection. |
| Add contents to collections | `createAddContentsToCollectionTool()` | Add content IDs to collections. |
| Remove contents from a collection | `createRemoveContentsFromCollectionTool()` | Remove content IDs from one collection. |
| Delete a collection | `createDeleteCollectionTool()` | Delete a collection by ID or `collections://...` URI. |
| Add a content label | `createAddContentLabelTool()` | Add one label to one content item. |
| Remove a content label | `createRemoveContentLabelTool()` | Remove one label from one content item. |
| Create a web crawl | `createWebCrawlTool()` | Create a Graphlit web crawl feed. Defaults to a one-time crawl. |
| Wait for content processing | `createWaitContentDoneTool()` | Wait until a content item is ready. |
| Wait for feed sync | `createWaitFeedDoneTool()` | Wait until a feed sync is ready. |
| Store memory | `createIngestMemoryTool()` | Store a Graphlit memory item. The public schema does not expose TTL. |
| Delete memory | `createDeleteMemoryTool()` | Delete memory content after verifying `ContentTypes.Memory`. |

### Enrichment And Generation

Availability depends on the Graphlit project capabilities, connectors, and credits.

| Agent ability | Add this tool | What it does |
| --- | --- | --- |
| Enrich companies | `createEnrichCompaniesTool()` | Lookup company candidates and optionally create/enrich organization entities. |
| Enrich persons | `createEnrichPersonsTool()` | Lookup person candidates and optionally create/enrich person entities. |
| Publish audio | `createPublishAudioTool()` | Generate audio content from text. |
| Publish image | `createPublishImageTool()` | Generate image content from a prompt. |
| Publish video | `createPublishVideoTool()` | Generate video content from a prompt. |

This package intentionally does not export Zine/Dossium app-layer tools such as broad `inspect`, delivery tools (`draft_email`, `send_email`, social/channel/document/issue/calendar writers), prompt analysis, shell/code execution, or first-party orchestration helpers. The resource tools are package-native Graphlit readers, not `platform__...` MCP runtime tools, and they do not read `skills://`, `ui://`, or external `https://` resources.

## Graphlit streamAgent

`streamAgent()` can use the returned Graphlit tool definitions and handlers directly.

```typescript
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
  createWebSearchTool,
} from "@graphlit/agent-tools";

const client = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const retrieveContents = createRetrieveContentsTool(client);
const inspectContent = createInspectContentTool(client);
const webSearch = createWebSearchTool(client);

const selectedTools = [retrieveContents, inspectContent, webSearch];

await client.streamAgent(
  "What customer emails from last week mention onboarding risk?",
  (event) => {
    // Stream events to your UI.
  },
  undefined,
  undefined,
  selectedTools.map((item) => item.tool),
  Object.fromEntries(
    selectedTools.map((item) => [item.tool.name, item.handler]),
  ),
  { maxToolRounds: 8 },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Use retrieve_contents before answering questions that depend on ingested Graphlit content.",
    "Use inspect_content when a retrieved source needs fuller text before making a source-backed claim.",
    "If retrieved evidence is weak or missing, say so plainly.",
  ].join(" "),
);
```

## Mastra

Mastra tools accept an `id`, `description`, Zod-compatible `inputSchema`, and `execute` function. Pass the Graphlit tool's `inputSchema` and delegate execution to the Graphlit handler.

```typescript
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
} from "@graphlit/agent-tools";

const graphlit = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const retrieveContents = createRetrieveContentsTool(graphlit);
const inspectContent = createInspectContentTool(graphlit);

const mastraRetrieveContents = createTool({
  id: retrieveContents.tool.name,
  description:
    retrieveContents.tool.description ?? "Retrieve Graphlit content.",
  inputSchema: retrieveContents.inputSchema,
  execute: async (args, context) =>
    retrieveContents.handler(args, undefined, context?.abortSignal),
});

const mastraInspectContent = createTool({
  id: inspectContent.tool.name,
  description: inspectContent.tool.description ?? "Inspect Graphlit content.",
  inputSchema: inspectContent.inputSchema,
  execute: async (args, context) =>
    inspectContent.handler(args, undefined, context?.abortSignal),
});

export const customerKnowledgeAgent = new Agent({
  id: "customer-knowledge-agent",
  name: "Customer Knowledge Agent",
  model: "openai/gpt-5.5",
  instructions: [
    "Answer from Graphlit content when the user asks about private knowledge.",
    "Use retrieve_contents to find relevant content.",
    "Use inspect_content before making answer-critical source-backed claims.",
  ].join(" "),
  tools: {
    [retrieveContents.tool.name]: mastraRetrieveContents,
    [inspectContent.tool.name]: mastraInspectContent,
  },
});

await customerKnowledgeAgent.generate(
  "Which customer emails from last week mention onboarding risk?",
);
```

## OpenAI Agents SDK

OpenAI Agents SDK tools accept a `name`, `description`, Zod `parameters`, and `execute` function. Wrap the Graphlit handler as a function tool. Graphlit's SDK already handles its own OpenAI Responses API use internally; this adapter only exposes Graphlit retrieval as an OpenAI Agents SDK tool.

```typescript
import { Agent, run, tool } from "@openai/agents";
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
} from "@graphlit/agent-tools";

const graphlit = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const retrieveContents = createRetrieveContentsTool(graphlit);
const inspectContent = createInspectContentTool(graphlit);

const openaiRetrieveContents = tool({
  name: retrieveContents.tool.name,
  description:
    retrieveContents.tool.description ?? "Retrieve Graphlit content.",
  parameters: retrieveContents.inputSchema,
  async execute(args) {
    return retrieveContents.handler(args);
  },
});

const openaiInspectContent = tool({
  name: inspectContent.tool.name,
  description: inspectContent.tool.description ?? "Inspect Graphlit content.",
  parameters: inspectContent.inputSchema,
  async execute(args) {
    return inspectContent.handler(args);
  },
});

const customerKnowledgeAgent = new Agent({
  name: "Customer Knowledge Agent",
  model: "gpt-5.5",
  instructions: [
    "Answer from Graphlit content when the user asks about private knowledge.",
    "Use retrieve_contents to find relevant content.",
    "Use inspect_content before making answer-critical source-backed claims.",
  ].join(" "),
  tools: [openaiRetrieveContents, openaiInspectContent],
});

const result = await run(
  customerKnowledgeAgent,
  "Which customer emails from last week mention onboarding risk?",
);

console.log(result.finalOutput);
```

## Claude Agent SDK

Claude Agent SDK custom tools run through an in-process MCP server. Its TypeScript `tool()` helper expects a Zod raw shape, so pass `inputSchema.shape`.

```typescript
import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
} from "@graphlit/agent-tools";

const graphlit = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const retrieveContents = createRetrieveContentsTool(graphlit);
const inspectContent = createInspectContentTool(graphlit);

const claudeRetrieveContents = tool(
  retrieveContents.tool.name,
  retrieveContents.tool.description ?? "Retrieve Graphlit content.",
  retrieveContents.inputSchema.shape,
  async (args) => {
    const result = await retrieveContents.handler(args);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } },
);

const claudeInspectContent = tool(
  inspectContent.tool.name,
  inspectContent.tool.description ?? "Inspect Graphlit content.",
  inspectContent.inputSchema.shape,
  async (args) => {
    const result = await inspectContent.handler(args);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } },
);

const graphlitServer = createSdkMcpServer({
  name: "graphlit",
  version: "1.0.0",
  tools: [claudeRetrieveContents, claudeInspectContent],
});

for await (const message of query({
  prompt: "Summarize the customer emails from last week about onboarding risk.",
  options: {
    mcpServers: { graphlit: graphlitServer },
    allowedTools: [
      "mcp__graphlit__retrieve_contents",
      "mcp__graphlit__inspect_content",
    ],
  },
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

## Claude Managed Agents

Claude Managed Agents custom tools are client-executed: Claude emits a structured tool request, your application runs the Graphlit handler, then sends the result back to the session.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { Graphlit } from "graphlit-client";
import {
  createInspectContentTool,
  createRetrieveContentsTool,
} from "@graphlit/agent-tools";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const graphlit = new Graphlit(
  process.env.GRAPHLIT_ORGANIZATION_ID!,
  process.env.GRAPHLIT_ENVIRONMENT_ID!,
  process.env.GRAPHLIT_JWT_SECRET!,
);

const graphlitTools = [
  createRetrieveContentsTool(graphlit),
  createInspectContentTool(graphlit),
];

const handlers = Object.fromEntries(
  graphlitTools.map((item) => [item.tool.name, item.handler]),
);

const agent = await anthropic.beta.agents.create({
  name: "Customer Knowledge Agent",
  model: "claude-opus-4-8",
  tools: graphlitTools.map((item) => ({
    type: "custom" as const,
    name: item.tool.name,
    description: item.tool.description ?? `Run ${item.tool.name}.`,
    input_schema: JSON.parse(item.tool.schema),
  })),
});

const session = await anthropic.beta.sessions.create({
  agent: agent.id,
  environment_id: process.env.ANTHROPIC_ENVIRONMENT_ID!,
});

const stream = await anthropic.beta.sessions.events.stream(session.id);

await anthropic.beta.sessions.events.send(session.id, {
  events: [
    {
      type: "user.message",
      content: [
        {
          type: "text",
          text: "Which customer emails from last week mention onboarding risk?",
        },
      ],
    },
  ],
});

for await (const event of stream) {
  if (event.type === "agent.custom_tool_use") {
    const handler = handlers[event.name];
    if (!handler) continue;

    const result = await handler(event.input);

    await anthropic.beta.sessions.events.send(session.id, {
      events: [
        {
          type: "user.custom_tool_result",
          custom_tool_use_id: event.id,
          content: [{ type: "text", text: JSON.stringify(result) }],
        },
      ],
    });
  }

  if (
    event.type === "session.status_idle" &&
    event.stop_reason?.type === "end_turn"
  ) {
    break;
  }
}
```

## Realistic Retrieval Examples

`retrieve_contents` supports both semantic retrieval and filter-only content lookup.

For a prompt such as "show me all emails from last week," the tool can be called without a text search:

```typescript
await retrieveContents.handler({
  type: "EMAIL",
  inLast: "P7D",
  limit: 25,
});
```

For RAG over specific content text, pass `search`:

```typescript
await retrieveContents.handler({
  search: "onboarding risk renewal blocker",
  type: "EMAIL",
  inLast: "P30D",
  limit: 10,
});
```

For upcoming calendar context:

```typescript
await retrieveContents.handler({
  type: "EVENT",
  inNext: "P7D",
  limit: 20,
});
```

When answer-critical evidence needs more context, inspect the `contents://...` reference returned by retrieval:

```typescript
await inspectContent.handler({
  resourceUri: "contents://content-id-from-retrieve-contents",
  mode: "markdown",
});
```

## Notes

- Tool schemas are authored with Zod and converted to Graphlit `ToolDefinitionInput`.
- Public options reuse `graphlit-client` SDK types where possible, including `Types.ContentFilter`, `Types.EntityReferenceInput`, `Types.RetrievalStrategyInput`, and `Types.RerankingStrategyInput`.
- Returned retrieval results include `contents://...` resource URIs for UI source rendering and follow-up inspection.
- This package is a set of explicit tools. It does not include tool discovery, tool bundles, MCP server hosting, approval middleware, or app-specific routing.
