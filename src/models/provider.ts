// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Provider abstraction.
 *
 * apiops-cli was originally built for a single ARM resource provider
 * (Azure API Management). This module introduces a small, additive provider
 * concept so the same CLI can also serve Azure API Center without duplicating
 * the whole tool. Each provider declares only the ARM-facing facts that differ
 * between resource providers (namespace, service segment, api-versions).
 *
 * The existing APIM engine continues to use its own hardcoded constants; the
 * APIC command group consumes {@link APIC_PROVIDER}. Over time the APIM path can
 * be migrated onto this abstraction, but that refactor is intentionally out of
 * scope here to avoid any behavioural change to the mature APIM flow.
 */

export type ProviderId = 'apim' | 'apic';

/**
 * ARM-facing description of a resource provider that the generic engine needs
 * in order to build request URLs and select api-versions.
 */
export interface ProviderInfo {
  /** Stable provider identifier used on the CLI and in the registry. */
  readonly id: ProviderId;
  /** Human-readable name for log/help output. */
  readonly displayName: string;
  /** ARM resource-provider namespace, e.g. `Microsoft.ApiCenter`. */
  readonly armNamespace: string;
  /**
   * The resource-type segment for the top-level service resource under the
   * namespace, e.g. `service` (APIM) or `services` (APIC). Used to build the
   * `.../providers/{namespace}/{serviceResourceType}/{name}` base URL.
   */
  readonly serviceResourceType: string;
  /** Default api-version applied to every request unless overridden per type. */
  readonly defaultApiVersion: string;
  /**
   * Per-resource-type api-version overrides. Keyed by the provider's own
   * resource-type identifier (string) so this stays provider-agnostic.
   */
  readonly apiVersionOverrides: Readonly<Record<string, string>>;
}

/**
 * Azure API Management. Declared for completeness and future migration; the
 * current APIM command path does not yet consume it.
 */
export const APIM_PROVIDER: ProviderInfo = {
  id: 'apim',
  displayName: 'Azure API Management',
  armNamespace: 'Microsoft.ApiManagement',
  serviceResourceType: 'service',
  defaultApiVersion: '2024-05-01',
  apiVersionOverrides: {},
};

/**
 * Azure API Center. The default api-version is the newest preview so that
 * preview resource types (agents, skills, models, MCP registries, evaluation
 * configurations) are returned by ARM list endpoints. GA-only types are still
 * served correctly by the preview api-version.
 */
export const APIC_PROVIDER: ProviderInfo = {
  id: 'apic',
  displayName: 'Azure API Center',
  armNamespace: 'Microsoft.ApiCenter',
  serviceResourceType: 'services',
  defaultApiVersion: '2024-06-01-preview',
  apiVersionOverrides: {},
};

const REGISTRY: Readonly<Record<ProviderId, ProviderInfo>> = {
  apim: APIM_PROVIDER,
  apic: APIC_PROVIDER,
};

/**
 * Resolve a provider by id. Throws for unknown ids so callers fail fast.
 */
export function getProvider(id: ProviderId): ProviderInfo {
  const provider = REGISTRY[id];
  if (!provider) {
    const valid = Object.keys(REGISTRY).join(', ');
    throw new Error(`Unknown provider "${id}". Valid values: ${valid}`);
  }
  return provider;
}
