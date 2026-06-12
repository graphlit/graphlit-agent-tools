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

const CompanyInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  linkedInUrl: z.string().trim().url().optional(),
});

export const EnrichCompaniesInputSchema = z.object({
  companies: z.array(CompanyInputSchema).min(1).max(DEFAULT_LIMIT),
  autoCreateEntity: z.boolean().optional().describe("Create missing organizations before enrichment."),
  serviceType: z.nativeEnum(Types.EntityEnrichmentServiceTypes).optional(),
});

export type EnrichCompaniesArgs = z.infer<typeof EnrichCompaniesInputSchema>;

export interface EnrichCompaniesToolOptions {
  defaultAutoCreateEntity?: boolean;
  connector?: Types.EntityEnrichmentConnectorInput;
  concurrency?: number;
  correlationId?: string;
}

export interface EnrichedCompanyResult {
  input: z.infer<typeof CompanyInputSchema>;
  lookupCandidates: unknown[];
  organization?: { id: string; resourceUri: string; name: string; uri?: string | null };
  enriched: boolean;
  warnings: string[];
}

export interface EnrichCompaniesResult {
  results: EnrichedCompanyResult[];
}

function organizationName(input: z.infer<typeof CompanyInputSchema>): string {
  return input.name ?? input.domain ?? input.linkedInUrl ?? "Unnamed company";
}

export function createEnrichCompaniesTool(
  client: GraphlitClient,
  options: EnrichCompaniesToolOptions = {},
): GraphlitAgentTool<
  EnrichCompaniesArgs,
  EnrichCompaniesResult,
  typeof EnrichCompaniesInputSchema
> {
  return {
    inputSchema: EnrichCompaniesInputSchema,
    tool: createToolDefinition(
      "enrich_companies",
      "Lookup and optionally create/enrich company organization entities with Graphlit enrichment connectors.",
      EnrichCompaniesInputSchema,
    ),
    handler: async (rawArgs, _artifacts, abortSignal) => {
      throwIfAborted(abortSignal);

      const args = EnrichCompaniesInputSchema.parse(rawArgs);
      const autoCreateEntity =
        args.autoCreateEntity ?? options.defaultAutoCreateEntity ?? false;
      const connector =
        options.connector ??
        ({
          type: args.serviceType ?? Types.EntityEnrichmentServiceTypes.Parallel,
          enrichedTypes: [Types.ObservableTypes.Organization],
        } satisfies Types.EntityEnrichmentConnectorInput);
      const concurrency = clampInteger(
        options.concurrency,
        DEFAULT_CONCURRENCY,
        1,
        DEFAULT_LIMIT,
      );
      const results = await mapWithConcurrency(
        args.companies,
        concurrency,
        async (input) => {
          const warnings: string[] = [];
          const lookup = await client.lookupCompanies(
            input.name,
            input.domain,
            input.linkedInUrl,
          );
          const lookupCandidates = lookup.lookupCompanies?.results?.filter(Boolean).map(stripTypename) ?? [];
          const existing = await client.queryOrganizations(
            {
              search: input.name ?? input.domain,
              uri: input.linkedInUrl,
              searchType: Types.SearchTypes.Hybrid,
              limit: 1,
              disableInheritance: true,
            },
            options.correlationId,
          );
          let organization = existing.organizations?.results?.find(Boolean);

          if (!organization && autoCreateEntity) {
            const created = await client.createOrganization({
              name: organizationName(input),
              uri: input.linkedInUrl ?? (input.domain ? `https://${input.domain}` : undefined),
            });

            if (created.createOrganization) {
              const fetched = await client.getOrganization(created.createOrganization.id);
              organization = fetched.organization;
            }
          }

          if (!organization) {
            warnings.push(
              autoCreateEntity
                ? "No organization was found or created."
                : "No organization found. Set autoCreateEntity to true to create and enrich one.",
            );

            return { input, lookupCandidates, enriched: false, warnings };
          }

          await client.enrichOrganizations(
            connector,
            { organizations: [{ id: organization.id }], limit: 1, disableInheritance: true },
            options.correlationId,
          );
          const enriched = await client.getOrganization(organization.id);
          const finalOrganization = enriched.organization ?? organization;

          return {
            input,
            lookupCandidates,
            organization: {
              id: finalOrganization.id,
              resourceUri:
                toEntityResourceUri(finalOrganization.id) ?? `entities://${finalOrganization.id}`,
              name: finalOrganization.name,
              uri: scalarToString(finalOrganization.uri),
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
