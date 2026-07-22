// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { IApicClient, ApicSpecification } from '../../../src/clients/iapic-client.js';
import { ApicResourceType } from '../../../src/models/apic-resource-types.js';
import { ApicResourceDescriptor, ApicServiceContext } from '../../../src/models/apic-types.js';
import { ApicArtifactStore } from '../../../src/services/apic-artifact-store.js';
import { runApicExtraction } from '../../../src/services/apic-extract-service.js';
import { runApicPublish } from '../../../src/services/apic-publish-service.js';

interface SeedEntry {
  type: ApicResourceType;
  nameParts: string[];
  workspace?: string;
  json: Record<string, unknown>;
  spec?: ApicSpecification;
}

function sameParent(entryParent: string[], parent: string[]): boolean {
  return entryParent.length === parent.length && entryParent.every((v, i) => v === parent[i]);
}

/** In-memory IApicClient for round-trip tests. */
class FakeApicClient implements IApicClient {
  readonly published: ApicResourceDescriptor[] = [];
  readonly imported: { descriptor: ApicResourceDescriptor; spec: ApicSpecification }[] = [];

  constructor(private readonly seed: SeedEntry[] = []) {}

  async *listResources(
    _context: ApicServiceContext,
    type: ApicResourceType,
    parentNameParts: string[],
    workspace?: string,
  ): AsyncIterable<Record<string, unknown>> {
    for (const entry of this.seed) {
      if (
        entry.type === type &&
        entry.workspace === workspace &&
        sameParent(entry.nameParts.slice(0, -1), parentNameParts)
      ) {
        yield entry.json;
      }
    }
  }

  async getResource(): Promise<Record<string, unknown> | undefined> {
    return undefined;
  }

  async putResource(
    _context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
  ): Promise<Record<string, unknown>> {
    this.published.push(descriptor);
    return {};
  }

  async deleteResource(): Promise<boolean> {
    return true;
  }

  async exportSpecification(
    _context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
  ): Promise<ApicSpecification | undefined> {
    const entry = this.seed.find(
      (e) =>
        e.type === descriptor.type &&
        e.workspace === descriptor.workspace &&
        sameParent(e.nameParts, descriptor.nameParts),
    );
    return entry?.spec;
  }

  async importSpecification(
    _context: ApicServiceContext,
    descriptor: ApicResourceDescriptor,
    spec: ApicSpecification,
  ): Promise<void> {
    this.imported.push({ descriptor, spec });
  }

  async validatePreFlight(): Promise<void> {
    // no-op
  }
}

const context: ApicServiceContext = {
  subscriptionId: 'sub',
  resourceGroup: 'rg',
  serviceName: 'svc',
  apiVersion: '2024-06-01-preview',
  baseUrl: 'https://management.azure.com/subscriptions/sub/resourceGroups/rg/providers/Microsoft.ApiCenter/services/svc',
};

function buildSeed(): SeedEntry[] {
  return [
    { type: ApicResourceType.Workspace, nameParts: ['default'], json: { name: 'default' } },
    {
      type: ApicResourceType.Api,
      nameParts: ['api-a'],
      workspace: 'default',
      json: { name: 'api-a', properties: { title: 'API A' } },
    },
    {
      type: ApicResourceType.ApiVersion,
      nameParts: ['api-a', 'v1'],
      workspace: 'default',
      json: { name: 'v1', properties: { lifecycleStage: 'production' } },
    },
    {
      type: ApicResourceType.ApiDefinition,
      nameParts: ['api-a', 'v1', 'def'],
      workspace: 'default',
      json: { name: 'def', properties: { specification: { name: 'openapi', version: '3.0.1' } } },
      spec: { content: '{"openapi":"3.0.1"}', name: 'openapi', version: '3.0.1' },
    },
  ];
}

describe('APIC extract → publish round trip', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apic-rt-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('extracts the resource tree and specifications to disk', async () => {
    const client = new FakeApicClient(buildSeed());
    const store = new ApicArtifactStore();

    const result = await runApicExtraction(client, store, { context, outputDir: baseDir });

    expect(result.totalErrors).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.totalExtracted).toBe(4);
    expect(result.totalSpecifications).toBe(1);
    expect(result.byType[ApicResourceType.ApiDefinition]).toBe(1);
  });

  it('publishes extracted artifacts in dependency-tier order', async () => {
    const store = new ApicArtifactStore();
    await runApicExtraction(new FakeApicClient(buildSeed()), store, {
      context,
      outputDir: baseDir,
    });

    const target = new FakeApicClient();
    const result = await runApicPublish(target, store, { context, sourceDir: baseDir });

    expect(result.totalErrors).toBe(0);
    expect(result.totalPublished).toBe(4);
    expect(result.totalSpecifications).toBe(1);

    const order = target.published.map((d) => d.type);
    expect(order.indexOf(ApicResourceType.Workspace)).toBeLessThan(
      order.indexOf(ApicResourceType.Api),
    );
    expect(order.indexOf(ApicResourceType.Api)).toBeLessThan(
      order.indexOf(ApicResourceType.ApiVersion),
    );
    expect(order.indexOf(ApicResourceType.ApiVersion)).toBeLessThan(
      order.indexOf(ApicResourceType.ApiDefinition),
    );
    expect(target.imported).toHaveLength(1);
    expect(target.imported[0].spec.content).toBe('{"openapi":"3.0.1"}');
  });

  it('dry-run publishes nothing to the client', async () => {
    const store = new ApicArtifactStore();
    await runApicExtraction(new FakeApicClient(buildSeed()), store, {
      context,
      outputDir: baseDir,
    });

    const target = new FakeApicClient();
    const result = await runApicPublish(target, store, {
      context,
      sourceDir: baseDir,
      dryRun: true,
    });

    expect(result.totalPublished).toBe(4);
    expect(target.published).toHaveLength(0);
    expect(target.imported).toHaveLength(0);
  });
});
