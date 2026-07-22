// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * IApicClient — abstraction over the Azure API Center control-plane REST API.
 */

import { ApicResourceType } from '../models/apic-resource-types.js';
import { ApicResourceDescriptor, ApicServiceContext } from '../models/apic-types.js';

/**
 * An API definition specification body plus the format name/version required to
 * re-import it via `importSpecification`.
 */
export interface ApicSpecification {
  /** Raw specification content (OpenAPI/AsyncAPI/WSDL/…). */
  content: string;
  /** Specification format name, e.g. `openapi`, `wsdl`, `graphql`. */
  name: string;
  /** Optional specification version, e.g. `3.0.1`. */
  version?: string;
}

export interface IApicClient {
  /**
   * List all resources of a type under the given parent (empty parentNameParts
   * for scope-root types). Handles ARM pagination via nextLink.
   */
  listResources(
    context: ApicServiceContext,
    type: ApicResourceType,
    parentNameParts: string[],
    workspace?: string,
  ): AsyncIterable<Record<string, unknown>>;

  /** GET a single resource; undefined on 404. */
  getResource(
    context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
  ): Promise<Record<string, unknown> | undefined>;

  /** PUT (create/update) a resource, polling any long-running operation. */
  putResource(
    context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** DELETE a resource, polling any long-running operation. Returns false on 404. */
  deleteResource(
    context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
  ): Promise<boolean>;

  /**
   * Export an API definition's specification body via the
   * `exportSpecification` action. Returns undefined when no spec is available.
   */
  exportSpecification(
    context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
  ): Promise<ApicSpecification | undefined>;

  /**
   * Import an API definition's specification body via the
   * `importSpecification` action, polling the long-running operation.
   */
  importSpecification(
    context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
    spec: ApicSpecification,
  ): Promise<void>;

  /**
   * Validate that the resource group and API Center service exist. Throws a
   * clear error otherwise. Must run before publish.
   */
  validatePreFlight(context: ApicServiceContext): Promise<void>;
}
