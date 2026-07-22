// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Core APIC types: service context and resource descriptor.
 */

import { ApicResourceType } from './apic-resource-types.js';

/**
 * Connection/target context for a single API Center service instance.
 */
export interface ApicServiceContext {
  readonly subscriptionId: string;
  readonly resourceGroup: string;
  /** API Center service (catalog) name. */
  readonly serviceName: string;
  /** ARM api-version applied to requests. */
  readonly apiVersion: string;
  /** Fully-qualified base URL: `.../providers/Microsoft.ApiCenter/services/{name}`. */
  readonly baseUrl: string;
}

/**
 * Identifies a single APIC resource.
 */
export interface ApicResourceDescriptor {
  readonly type: ApicResourceType;
  /**
   * Ordered name-parts that fill the positional `{0}`, `{1}`, … placeholders in
   * both `armPathSuffix` and `artifactDirectory` for this resource type.
   */
  readonly nameParts: string[];
  /** Workspace name for workspace-scoped resources; undefined for service scope. */
  readonly workspace?: string;
}

/**
 * A resource read from ARM (or an artifact file) together with its descriptor.
 */
export interface ApicResourcePayload {
  readonly descriptor: ApicResourceDescriptor;
  /** Raw ARM JSON (ARM envelope with `properties`). Never parsed into typed fields. */
  readonly json: Record<string, unknown>;
}
