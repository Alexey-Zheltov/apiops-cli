// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * API Center publish (restore) orchestration.
 *
 * Reads artifacts from disk and PUTs them to a target API Center in dependency
 * tier order, re-importing API definition specification bodies.
 */

import { IApicClient } from '../clients/iapic-client.js';
import { ApicArtifactStore } from './apic-artifact-store.js';
import {
  APIC_DEPENDENCY_TIERS,
  APIC_RESOURCE_TYPE_METADATA,
  ApicResourceType,
} from '../models/apic-resource-types.js';
import { ApicResourceDescriptor, ApicServiceContext } from '../models/apic-types.js';
import { buildApicLabel } from '../lib/apic-uri.js';
import { logger } from '../lib/logger.js';

export interface ApicPublishConfig {
  readonly context: ApicServiceContext;
  readonly sourceDir: string;
  /** Preview actions without calling ARM. */
  readonly dryRun?: boolean;
  /** Re-import API definition specification bodies (default true). */
  readonly includeSpecifications?: boolean;
}

export interface ApicPublishResult {
  totalPublished: number;
  totalSpecifications: number;
  totalErrors: number;
  byType: Record<string, number>;
  exitCode: number;
}

/** Server-assigned fields stripped before PUT. */
const SYSTEM_TOP_LEVEL_FIELDS = ['id', 'name', 'type', 'systemData', 'etag'];

/**
 * Remove server-managed fields so the payload is a clean desired-state PUT.
 */
export function stripSystemFields(
  json: Record<string, unknown>,
): Record<string, unknown> {
  const clone = structuredClone(json);
  for (const field of SYSTEM_TOP_LEVEL_FIELDS) {
    delete clone[field];
  }
  const props = clone.properties;
  if (props && typeof props === 'object') {
    delete (props as Record<string, unknown>).provisioningState;
  }
  return clone;
}

export async function runApicPublish(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicPublishConfig,
): Promise<ApicPublishResult> {
  const result: ApicPublishResult = {
    totalPublished: 0,
    totalSpecifications: 0,
    totalErrors: 0,
    byType: {},
    exitCode: 0,
  };
  const includeSpecs = config.includeSpecifications ?? true;

  if (!config.dryRun) {
    await client.validatePreFlight(config.context);
  }

  const descriptors = await store.listDescriptors(config.sourceDir);
  const byType = groupByType(descriptors);

  for (const tier of APIC_DEPENDENCY_TIERS) {
    for (const type of tier) {
      for (const descriptor of byType.get(type) ?? []) {
        await publishOne(client, store, config, descriptor, includeSpecs, result);
      }
    }
  }

  result.exitCode = result.totalErrors > 0 ? 1 : 0;
  return result;
}

async function publishOne(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicPublishConfig,
  descriptor: ApicResourceDescriptor,
  includeSpecs: boolean,
  result: ApicPublishResult,
): Promise<void> {
  const label = buildApicLabel(descriptor);
  const json = await store.readResource(config.sourceDir, descriptor);
  if (!json) {
    return;
  }
  const payload = stripSystemFields(json);

  if (config.dryRun) {
    logger.info(`[dry-run] PUT ${label}`);
    result.byType[descriptor.type] = (result.byType[descriptor.type] ?? 0) + 1;
    result.totalPublished++;
    return;
  }

  try {
    await client.putResource(config.context, descriptor, payload);
    result.byType[descriptor.type] = (result.byType[descriptor.type] ?? 0) + 1;
    result.totalPublished++;

    if (includeSpecs && APIC_RESOURCE_TYPE_METADATA[descriptor.type].hasSpecification) {
      await publishSpecification(client, store, config, descriptor, json, result);
    }
  } catch (error) {
    result.totalErrors++;
    logger.error(`Failed to publish ${label}: ${(error as Error).message}`);
  }
}

async function publishSpecification(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicPublishConfig,
  descriptor: ApicResourceDescriptor,
  definitionJson: Record<string, unknown>,
  result: ApicPublishResult,
): Promise<void> {
  const content = await store.readSpecification(config.sourceDir, descriptor);
  if (content === undefined) {
    return;
  }
  const props = (definitionJson.properties ?? {}) as Record<string, unknown>;
  const spec = (props.specification ?? {}) as { name?: string; version?: string };
  await client.importSpecification(config.context, descriptor, {
    content,
    name: spec.name ?? 'openapi',
    version: spec.version,
  });
  result.totalSpecifications++;
}

function groupByType(
  descriptors: ApicResourceDescriptor[],
): Map<ApicResourceType, ApicResourceDescriptor[]> {
  const map = new Map<ApicResourceType, ApicResourceDescriptor[]>();
  for (const descriptor of descriptors) {
    const list = map.get(descriptor.type) ?? [];
    list.push(descriptor);
    map.set(descriptor.type, list);
  }
  return map;
}
