import { Types } from "graphlit-client";
import { z } from "zod";

import type { GraphlitAgentTool, GraphlitClient } from "../types.js";
import { throwIfAborted } from "../utils/abort.js";
import { clampInteger } from "../utils/clamp.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { scalarToString, toEntityResourceUri } from "../utils/content.js";
import { stripTypename } from "../utils/results.js";
import { createToolDefinition } from "../utils/schema.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 3;

const PersonInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  linkedInUrl: z.string().trim().url().optional(),
  title: z.string().trim().min(1).optional(),
});

export const EnrichPersonsInputSchema = z.object({
  persons: z.array(PersonInputSchema).min(1).max(DEFAULT_LIMIT),
  autoCreateEntity: z.boolean().optional().describe("Create missing persons before enrichment."),
  serviceType: z.nativeEnum(Types.EntityEnrichmentServiceTypes).optional(),
});

export type EnrichPersonsArgs = z.infer<typeof EnrichPersonsInputSchema>;

export interface EnrichPersonsToolOptions {
  defaultAutoCreateEntity?: boolean;
  connector?: Types.EntityEnrichmentConnectorInput;
  concurrency?: number;
  correlationId?: string;
}

export interface EnrichedPersonResult {
  input: z.infer<typeof PersonInputSchema>;
  lookupCandidates: unknown[];
  person?: { id: string; resourceUri: string; name: string; email?: string | null; uri?: string | null };
  enriched: boolean;
  warnings: string[];
}

export interface EnrichPersonsResult {
  results: EnrichedPersonResult[];
}

function personName(input: z.infer<typeof PersonInputSchema>): string {
  return input.name ?? input.email ?? input.linkedInUrl ?? "Unnamed person";
}

export function createEnrichPersonsTool(
  client: GraphlitClient,
  options: EnrichPersonsToolOptions = {},
): GraphlitAgentTool<
  EnrichPersonsArgs,
  EnrichPersonsResult,
  typeof EnrichPersonsInputSchema
> {
  return {
    inputSchema: EnrichPersonsInputSchema,
    tool: createToolDefinition(
      "enrich_persons",
      "Lookup and optionally create/enrich person entities with Graphlit enrichment connectors.",
      EnrichPersonsInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = EnrichPersonsInputSchema.parse(rawArgs);
      const autoCreateEntity =
        args.autoCreateEntity ?? options.defaultAutoCreateEntity ?? false;
      const connector =
        options.connector ??
        ({
          type: args.serviceType ?? Types.EntityEnrichmentServiceTypes.Parallel,
          enrichedTypes: [Types.ObservableTypes.Person],
        } satisfies Types.EntityEnrichmentConnectorInput);
      const concurrency = clampInteger(
        options.concurrency,
        DEFAULT_CONCURRENCY,
        1,
        DEFAULT_LIMIT,
      );
      const results = await mapWithConcurrency(
        args.persons,
        concurrency,
        async (input) => {
          const warnings: string[] = [];
          const lookup = await client.lookupPersons(input.linkedInUrl, input.email);
          const lookupCandidates = lookup.lookupPersons?.results?.filter(Boolean).map(stripTypename) ?? [];
          const existing = await client.queryPersons(
            {
              search: input.name,
              email: input.email,
              uri: input.linkedInUrl,
              searchType: Types.SearchTypes.Hybrid,
              limit: 1,
              disableInheritance: true,
            },
            options.correlationId,
          );
          let person = existing.persons?.results?.find(Boolean);

          if (!person && autoCreateEntity) {
            const created = await client.createPerson({
              name: personName(input),
              email: input.email,
              uri: input.linkedInUrl,
              title: input.title,
            });

            if (created.createPerson) {
              const fetched = await client.getPerson(created.createPerson.id);
              person = fetched.person;
            }
          }

          if (!person) {
            warnings.push(
              autoCreateEntity
                ? "No person was found or created."
                : "No person found. Set autoCreateEntity to true to create and enrich one.",
            );

            return { input, lookupCandidates, enriched: false, warnings };
          }

          await client.enrichPersons(
            connector,
            { persons: [{ id: person.id }], limit: 1, disableInheritance: true },
            options.correlationId,
          );
          const enriched = await client.getPerson(person.id);
          const finalPerson = enriched.person ?? person;

          return {
            input,
            lookupCandidates,
            person: {
              id: finalPerson.id,
              resourceUri:
                toEntityResourceUri(finalPerson.id) ?? `entities://${finalPerson.id}`,
              name: finalPerson.name,
              email: finalPerson.email,
              uri: scalarToString(finalPerson.uri),
            },
            enriched: true,
            warnings,
          };
        },
        abortSignal,
      );

      return { results };
    },
  };
}
