// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Azure API Center (APIC) resource-type model.
 *
 * Mirrors the metadata-driven design used for APIM (`resource-types.ts`) but
 * describes the `Microsoft.ApiCenter/services` control-plane hierarchy. Each
 * type is pure data: an ARM path suffix with positional `{0}`, `{1}`, …
 * placeholders (filled from a descriptor's `nameParts`), the artifact directory
 * template, the info-file name, its scope, and its parent in the resource tree.
 *
 * The generic extract/publish services walk this tree; no per-type code is
 * required for the common ARM CRUD case.
 */

export enum ApicResourceType {
  // Service-scoped
  MetadataSchema = 'MetadataSchema',
  Workspace = 'Workspace',

  // Workspace-scoped
  Environment = 'Environment',
  Api = 'Api',
  ApiVersion = 'ApiVersion',
  ApiDefinition = 'ApiDefinition',
  ApiDeployment = 'ApiDeployment',
  ApiSource = 'ApiSource',
  AnalyzerConfig = 'AnalyzerConfig',
  AuthConfig = 'AuthConfig',
  ResourceLink = 'ResourceLink',
  Plugin = 'Plugin',
  Model = 'Model',
  Agent = 'Agent',
  AgentVersion = 'AgentVersion',
  Skill = 'Skill',
  SkillVersion = 'SkillVersion',
  SkillEvaluationConfiguration = 'SkillEvaluationConfiguration',
  AgentEvaluationConfiguration = 'AgentEvaluationConfiguration',
  McpRegistry = 'McpRegistry',
}

/**
 * Scope at which a resource type lives relative to the service base URL.
 *   - 'service'   : directly under `.../services/{name}` (e.g. metadataSchemas).
 *   - 'workspace' : under `.../services/{name}/workspaces/{ws}` — the workspace
 *                   segment is added from the descriptor, not the path suffix.
 */
export type ApicScope = 'service' | 'workspace';

/**
 * Pure-data descriptor for a single APIC resource type.
 */
export interface ApicResourceTypeMetadata {
  /**
   * ARM path suffix relative to the (service or workspace) scope base, with
   * positional placeholders. Never includes the `workspaces/{ws}` segment —
   * that is prepended for workspace-scoped types from the descriptor.
   *
   * Examples:
   *   Api            'apis/{0}'                       nameParts: [api]
   *   ApiVersion     'apis/{0}/versions/{1}'          nameParts: [api, version]
   *   ApiDefinition  'apis/{0}/versions/{1}/definitions/{2}'
   */
  readonly armPathSuffix: string;
  /** Artifact directory template (positional placeholders as above). */
  readonly artifactDirectory: string;
  /** Info-file name written inside the artifact directory. */
  readonly infoFile: string;
  /** Scope of the resource type. */
  readonly scope: ApicScope;
  /** Parent type in the resource tree, or null for a scope root. */
  readonly parent: ApicResourceType | null;
  /**
   * True when this type carries a separately-exported specification body that
   * must be fetched via `exportSpecification` and re-applied via
   * `importSpecification` (currently only ApiDefinition).
   */
  readonly hasSpecification?: boolean;
}

export const APIC_RESOURCE_TYPE_METADATA: Record<ApicResourceType, ApicResourceTypeMetadata> = {
  [ApicResourceType.MetadataSchema]: {
    armPathSuffix: 'metadataSchemas/{0}',
    artifactDirectory: 'metadataSchemas/{0}',
    infoFile: 'metadataSchemaInformation.json',
    scope: 'service',
    parent: null,
  },
  [ApicResourceType.Workspace]: {
    armPathSuffix: 'workspaces/{0}',
    artifactDirectory: 'workspaces/{0}',
    infoFile: 'workspaceInformation.json',
    scope: 'service',
    parent: null,
  },
  [ApicResourceType.Environment]: {
    armPathSuffix: 'environments/{0}',
    artifactDirectory: 'environments/{0}',
    infoFile: 'environmentInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.Api]: {
    armPathSuffix: 'apis/{0}',
    artifactDirectory: 'apis/{0}',
    infoFile: 'apiInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.ApiVersion]: {
    armPathSuffix: 'apis/{0}/versions/{1}',
    artifactDirectory: 'apis/{0}/versions/{1}',
    infoFile: 'apiVersionInformation.json',
    scope: 'workspace',
    parent: ApicResourceType.Api,
  },
  [ApicResourceType.ApiDefinition]: {
    armPathSuffix: 'apis/{0}/versions/{1}/definitions/{2}',
    artifactDirectory: 'apis/{0}/versions/{1}/definitions/{2}',
    infoFile: 'apiDefinitionInformation.json',
    scope: 'workspace',
    parent: ApicResourceType.ApiVersion,
    hasSpecification: true,
  },
  [ApicResourceType.ApiDeployment]: {
    armPathSuffix: 'apis/{0}/deployments/{1}',
    artifactDirectory: 'apis/{0}/deployments/{1}',
    infoFile: 'apiDeploymentInformation.json',
    scope: 'workspace',
    parent: ApicResourceType.Api,
  },
  [ApicResourceType.ApiSource]: {
    armPathSuffix: 'apiSources/{0}',
    artifactDirectory: 'apiSources/{0}',
    infoFile: 'apiSourceInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.AnalyzerConfig]: {
    armPathSuffix: 'analyzerConfigs/{0}',
    artifactDirectory: 'analyzerConfigs/{0}',
    infoFile: 'analyzerConfigInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.AuthConfig]: {
    armPathSuffix: 'authConfigs/{0}',
    artifactDirectory: 'authConfigs/{0}',
    infoFile: 'authConfigInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.ResourceLink]: {
    armPathSuffix: 'links/{0}',
    artifactDirectory: 'links/{0}',
    infoFile: 'resourceLinkInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.Plugin]: {
    armPathSuffix: 'plugins/{0}',
    artifactDirectory: 'plugins/{0}',
    infoFile: 'pluginInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.Model]: {
    armPathSuffix: 'models/{0}',
    artifactDirectory: 'models/{0}',
    infoFile: 'modelInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.Agent]: {
    armPathSuffix: 'agents/{0}',
    artifactDirectory: 'agents/{0}',
    infoFile: 'agentInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.AgentVersion]: {
    armPathSuffix: 'agents/{0}/versions/{1}',
    artifactDirectory: 'agents/{0}/versions/{1}',
    infoFile: 'agentVersionInformation.json',
    scope: 'workspace',
    parent: ApicResourceType.Agent,
  },
  [ApicResourceType.Skill]: {
    armPathSuffix: 'skills/{0}',
    artifactDirectory: 'skills/{0}',
    infoFile: 'skillInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.SkillVersion]: {
    armPathSuffix: 'skills/{0}/versions/{1}',
    artifactDirectory: 'skills/{0}/versions/{1}',
    infoFile: 'skillVersionInformation.json',
    scope: 'workspace',
    parent: ApicResourceType.Skill,
  },
  [ApicResourceType.SkillEvaluationConfiguration]: {
    armPathSuffix: 'skillEvaluationConfigurations/{0}',
    artifactDirectory: 'skillEvaluationConfigurations/{0}',
    infoFile: 'skillEvaluationConfigurationInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.AgentEvaluationConfiguration]: {
    armPathSuffix: 'agentEvaluationConfigurations/{0}',
    artifactDirectory: 'agentEvaluationConfigurations/{0}',
    infoFile: 'agentEvaluationConfigurationInformation.json',
    scope: 'workspace',
    parent: null,
  },
  [ApicResourceType.McpRegistry]: {
    armPathSuffix: 'mcpRegistries/{0}',
    artifactDirectory: 'mcpRegistries/{0}',
    infoFile: 'mcpRegistryInformation.json',
    scope: 'workspace',
    parent: null,
  },
};

/**
 * Restore (publish) dependency ordering. Each inner array is a tier that may be
 * published in any order internally; tiers are applied sequentially so that a
 * resource's references always exist before it is created. See DR plan §6.
 */
export const APIC_DEPENDENCY_TIERS: readonly ApicResourceType[][] = [
  [ApicResourceType.MetadataSchema],
  [ApicResourceType.Workspace],
  [ApicResourceType.Environment, ApicResourceType.AuthConfig],
  [ApicResourceType.ApiSource],
  [ApicResourceType.Api],
  [ApicResourceType.ApiVersion],
  [ApicResourceType.ApiDefinition],
  [ApicResourceType.ApiDeployment],
  [
    ApicResourceType.AnalyzerConfig,
    ApicResourceType.ResourceLink,
    ApicResourceType.Plugin,
    ApicResourceType.Model,
  ],
  [ApicResourceType.Agent],
  [ApicResourceType.AgentVersion],
  [ApicResourceType.Skill],
  [ApicResourceType.SkillVersion],
  [
    ApicResourceType.SkillEvaluationConfiguration,
    ApicResourceType.AgentEvaluationConfiguration,
    ApicResourceType.McpRegistry,
  ],
];

/**
 * Root resource types for a given scope (those with no parent). Used by the
 * extractor to enumerate the top of each scope's tree.
 */
export function getApicRootTypes(scope: ApicScope): ApicResourceType[] {
  return (Object.keys(APIC_RESOURCE_TYPE_METADATA) as ApicResourceType[]).filter(
    (type) => {
      const meta = APIC_RESOURCE_TYPE_METADATA[type];
      return meta.scope === scope && meta.parent === null;
    },
  );
}

/**
 * Direct child types of a given parent type. Used to recurse the resource tree
 * during extraction.
 */
export function getApicChildTypes(parent: ApicResourceType): ApicResourceType[] {
  return (Object.keys(APIC_RESOURCE_TYPE_METADATA) as ApicResourceType[]).filter(
    (type) => APIC_RESOURCE_TYPE_METADATA[type].parent === parent,
  );
}
