// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * APIC descriptor ↔ ARM URI / list-path / artifact-path mapping.
 */

import * as path from 'node:path';
import {
  APIC_RESOURCE_TYPE_METADATA,
  ApicResourceType,
} from '../models/apic-resource-types.js';
import { ApicResourceDescriptor, ApicServiceContext } from '../models/apic-types.js';
import { formatTemplatePath, countTemplatePlaceholders } from './resource-path.js';
import { getCloudConfig } from './cloud-config.js';

/**
 * Build the API Center ARM base URL for a service instance.
 * `.../providers/Microsoft.ApiCenter/services/{name}`.
 */
export function buildApicBaseUrl(
  cloudName: string,
  subscriptionId: string,
  resourceGroup: string,
  serviceName: string,
): string {
  const config = getCloudConfig(cloudName);
  return (
    `${config.armBaseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}` +
    `/resourceGroups/${encodeURIComponent(resourceGroup)}` +
    `/providers/Microsoft.ApiCenter/services/${encodeURIComponent(serviceName)}`
  );
}

/**
 * Base URL for a descriptor's scope (service root, or the workspace segment for
 * workspace-scoped types). Does not include the resource path suffix.
 */
function scopeBaseUrl(
  context: ApicServiceContext,
  descriptor: ApicResourceDescriptor,
): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[descriptor.type];
  if (meta.scope === 'workspace') {
    if (!descriptor.workspace) {
      throw new Error(
        `Workspace-scoped resource ${descriptor.type} is missing a workspace name`,
      );
    }
    return `${context.baseUrl}/workspaces/${encodeURIComponent(descriptor.workspace)}`;
  }
  return context.baseUrl;
}

/**
 * Build the full ARM URI (including api-version) for a descriptor.
 */
export function buildApicArmUri(
  context: ApicServiceContext,
  descriptor: ApicResourceDescriptor,
): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[descriptor.type];
  const placeholderCount = countTemplatePlaceholders(meta.armPathSuffix);
  if (descriptor.nameParts.length < placeholderCount) {
    throw new Error(
      `Unresolved placeholder in ARM path for ${descriptor.type}: expected ` +
      `${placeholderCount} name-parts, got ${descriptor.nameParts.length}`,
    );
  }
  const suffix = formatTemplatePath(
    meta.armPathSuffix,
    descriptor.nameParts.map(encodeURIComponent),
  );
  return `${scopeBaseUrl(context, descriptor)}/${suffix}?api-version=${context.apiVersion}`;
}

/**
 * Build the collection (LIST) URL for a resource type, given the already-known
 * name-parts of its parent (empty for scope-root types). Derived from the type's
 * ARM path suffix by filling the leading placeholders and dropping the trailing
 * `/{n}` segment.
 */
export function buildApicListUri(
  context: ApicServiceContext,
  type: ApicResourceType,
  parentNameParts: string[],
  workspace?: string,
): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[type];
  // Drop the final `/{n}` placeholder segment to get the collection path.
  const collectionTemplate = meta.armPathSuffix.replace(/\/\{\d+\}$/, '');
  const filled = formatTemplatePath(
    collectionTemplate,
    parentNameParts.map(encodeURIComponent),
  );
  const base =
    meta.scope === 'workspace'
      ? `${context.baseUrl}/workspaces/${encodeURIComponent(workspace ?? '')}`
      : context.baseUrl;
  return `${base}/${filled}?api-version=${context.apiVersion}`;
}

/**
 * Human-readable label for logs (no encoding).
 */
export function buildApicLabel(descriptor: ApicResourceDescriptor): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[descriptor.type];
  const suffix = formatTemplatePath(meta.armPathSuffix, descriptor.nameParts);
  return descriptor.workspace
    ? `workspaces/${descriptor.workspace}/${suffix}`
    : suffix;
}

/**
 * Absolute artifact directory for a descriptor under `baseDir`.
 * Workspace-scoped resources are nested under `workspaces/{ws}/`.
 */
export function apicArtifactDir(
  baseDir: string,
  descriptor: ApicResourceDescriptor,
): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[descriptor.type];
  const rel = formatTemplatePath(meta.artifactDirectory, descriptor.nameParts);
  const scoped =
    meta.scope === 'workspace' && descriptor.workspace
      ? path.join('workspaces', descriptor.workspace, rel)
      : rel;
  return path.join(baseDir, scoped);
}

/**
 * Absolute info-file path for a descriptor under `baseDir`.
 */
export function apicInfoFilePath(
  baseDir: string,
  descriptor: ApicResourceDescriptor,
): string {
  const meta = APIC_RESOURCE_TYPE_METADATA[descriptor.type];
  return path.join(apicArtifactDir(baseDir, descriptor), meta.infoFile);
}
