// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ApicArtifactStore,
  parseTemplateSegments,
} from '../../../src/services/apic-artifact-store.js';
import { ApicResourceType } from '../../../src/models/apic-resource-types.js';
import { ApicResourceDescriptor } from '../../../src/models/apic-types.js';

describe('parseTemplateSegments', () => {
  it('reverses a multi-placeholder template', () => {
    expect(
      parseTemplateSegments('apis/{0}/versions/{1}/definitions/{2}', 'apis/a/versions/v/definitions/d'),
    ).toEqual(['a', 'v', 'd']);
  });

  it('respects placeholder ordering', () => {
    expect(parseTemplateSegments('apis/{0}/deployments/{1}', 'apis/a/deployments/dep')).toEqual([
      'a',
      'dep',
    ]);
  });

  it('returns undefined on a literal mismatch', () => {
    expect(parseTemplateSegments('apis/{0}/versions/{1}', 'apis/a/deployments/d')).toBeUndefined();
  });

  it('returns undefined on a segment-count mismatch', () => {
    expect(parseTemplateSegments('apis/{0}', 'apis/a/versions/v')).toBeUndefined();
  });
});

describe('ApicArtifactStore', () => {
  let baseDir: string;
  const store = new ApicArtifactStore();

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apic-store-'));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('round-trips a resource payload', async () => {
    const descriptor: ApicResourceDescriptor = {
      type: ApicResourceType.Api,
      nameParts: ['api-a'],
      workspace: 'default',
    };
    await store.writeResource(baseDir, descriptor, { name: 'api-a', properties: { title: 'A' } });
    const read = await store.readResource(baseDir, descriptor);
    expect(read).toEqual({ name: 'api-a', properties: { title: 'A' } });
  });

  it('returns undefined reading a missing resource', async () => {
    const read = await store.readResource(baseDir, {
      type: ApicResourceType.Api,
      nameParts: ['nope'],
      workspace: 'default',
    });
    expect(read).toBeUndefined();
  });

  it('round-trips a specification body', async () => {
    const descriptor: ApicResourceDescriptor = {
      type: ApicResourceType.ApiDefinition,
      nameParts: ['api-a', 'v1', 'def'],
      workspace: 'default',
    };
    await store.writeSpecification(baseDir, descriptor, '{"openapi":"3.0.1"}', 'openapi');
    const content = await store.readSpecification(baseDir, descriptor);
    expect(content).toBe('{"openapi":"3.0.1"}');
  });

  it('reconstructs descriptors from the artifact tree', async () => {
    const workspace: ApicResourceDescriptor = {
      type: ApicResourceType.Workspace,
      nameParts: ['default'],
    };
    const definition: ApicResourceDescriptor = {
      type: ApicResourceType.ApiDefinition,
      nameParts: ['api-a', 'v1', 'def'],
      workspace: 'default',
    };
    await store.writeResource(baseDir, workspace, { name: 'default' });
    await store.writeResource(baseDir, definition, { name: 'def' });

    const descriptors = await store.listDescriptors(baseDir);
    expect(descriptors).toContainEqual(workspace);
    expect(descriptors).toContainEqual(definition);
  });
});
