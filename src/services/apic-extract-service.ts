// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * API Center extract orchestration.
 *
 * Walks the `Microsoft.ApiCenter/services` control-plane tree and writes each
 * resource to the artifact store, exporting API definition specification bodies
 * along the way.
 */

import { IApicClient } from '../clients/iapic-client.js';
import { ApicArtifactStore } from './apic-artifact-store.js';
import {
  APIC_RESOURCE_TYPE_METADATA,
  ApicResourceType,
  getApicChildTypes,
  getApicRootTypes,
} from '../models/apic-resource-types.js';
import { ApicResourceDescriptor, ApicServiceContext } from '../models/apic-types.js';
import { buildApicLabel } from '../lib/apic-uri.js';
import { logger } from '../lib/logger.js';

export interface ApicExtractConfig {
  readonly context: ApicServiceContext;
  readonly outputDir: string;
  /** Restrict extraction to a single workspace (defaults to all). */
  readonly workspace?: string;
  /** Also export API definition specification bodies (default true). */
  readonly includeSpecifications?: boolean;
}

export interface ApicExtractResult {
  totalExtracted: number;
  totalSpecifications: number;
  totalErrors: number;
  byType: Record<string, number>;
  descriptors: ApicResourceDescriptor[];
  exitCode: number;
}

export async function runApicExtraction(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicExtractConfig,
): Promise<ApicExtractResult> {
  const result: ApicExtractResult = {
    totalExtracted: 0,
    totalSpecifications: 0,
    totalErrors: 0,
    byType: {},
    descriptors: [],
    exitCode: 0,
  };
  const includeSpecs = config.includeSpecifications ?? true;

  const record = (type: ApicResourceType): void => {
    result.byType[type] = (result.byType[type] ?? 0) + 1;
    result.totalExtracted++;
  };

  // 1. Service-scoped roots (metadataSchemas, workspaces).
  for (const type of getApicRootTypes('service')) {
    for await (const item of client.listResources(config.context, type, [])) {
      const name = typeof item.name === 'string' ? item.name : '';
      if (!name) {
        continue;
      }
      const descriptor: ApicResourceDescriptor = { type, nameParts: [name] };
      await store.writeResource(config.outputDir, descriptor, item);
      result.descriptors.push(descriptor);
      record(type);

      if (type === ApicResourceType.Workspace) {
        if (config.workspace && name !== config.workspace) {
          continue;
        }
        await extractWorkspace(client, store, config, name, includeSpecs, result, record);
      }
    }
  }

  result.exitCode = result.totalErrors > 0 ? 1 : 0;
  return result;
}

/** Extract every workspace-scoped root type (and their children) for a workspace. */
async function extractWorkspace(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicExtractConfig,
  workspace: string,
  includeSpecs: boolean,
  result: ApicExtractResult,
  record: (type: ApicResourceType) => void,
): Promise<void> {
  for (const type of getApicRootTypes('workspace')) {
    await extractType(client, store, config, type, [], workspace, includeSpecs, result, record);
  }
}

/** Extract all resources of a type (under a parent) and recurse into children. */
async function extractType(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicExtractConfig,
  type: ApicResourceType,
  parentNameParts: string[],
  workspace: string,
  includeSpecs: boolean,
  result: ApicExtractResult,
  record: (type: ApicResourceType) => void,
): Promise<void> {
  let items: AsyncIterable<Record<string, unknown>>;
  try {
    items = client.listResources(config.context, type, parentNameParts, workspace);
    for await (const item of items) {
      const name = typeof item.name === 'string' ? item.name : '';
      if (!name) {
        continue;
      }
      const nameParts = [...parentNameParts, name];
      const descriptor: ApicResourceDescriptor = { type, nameParts, workspace };

      try {
        await store.writeResource(config.outputDir, descriptor, item);
        result.descriptors.push(descriptor);
        record(type);

        if (includeSpecs && APIC_RESOURCE_TYPE_METADATA[type].hasSpecification) {
          await extractSpecification(client, store, config, descriptor, result);
        }

        for (const childType of getApicChildTypes(type)) {
          await extractType(
            client, store, config, childType, nameParts, workspace, includeSpecs, result, record,
          );
        }
      } catch (error) {
        result.totalErrors++;
        logger.error(`Failed to extract ${buildApicLabel(descriptor)}: ${(error as Error).message}`);
      }
    }
  } catch (error) {
    result.totalErrors++;
    logger.error(`Failed to list ${type} in workspace "${workspace}": ${(error as Error).message}`);
  }
}

/** Export and persist an API definition's specification body. */
async function extractSpecification(
  client: IApicClient,
  store: ApicArtifactStore,
  config: ApicExtractConfig,
  descriptor: ApicResourceDescriptor,
  result: ApicExtractResult,
): Promise<void> {
  const spec = await client.exportSpecification(config.context, descriptor);
  if (!spec) {
    return;
  }
  await store.writeSpecification(config.outputDir, descriptor, spec.content, spec.name);
  result.totalSpecifications++;
}
