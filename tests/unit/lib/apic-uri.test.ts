// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { describe, it, expect } from 'vitest';
import {
  buildApicBaseUrl,
  buildApicArmUri,
  buildApicListUri,
  buildApicLabel,
} from '../../../src/lib/apic-uri.js';
import { ApicResourceType } from '../../../src/models/apic-resource-types.js';
import { ApicServiceContext } from '../../../src/models/apic-types.js';

const API_VERSION = '2024-06-01-preview';

function context(): ApicServiceContext {
  const baseUrl = buildApicBaseUrl('public', 'sub-1', 'rg-1', 'svc-1');
  return {
    subscriptionId: 'sub-1',
    resourceGroup: 'rg-1',
    serviceName: 'svc-1',
    apiVersion: API_VERSION,
    baseUrl,
  };
}

describe('buildApicBaseUrl', () => {
  it('builds a Microsoft.ApiCenter service URL', () => {
    const url = buildApicBaseUrl('public', 'sub-1', 'rg-1', 'svc-1');
    expect(url).toContain('/subscriptions/sub-1/resourceGroups/rg-1');
    expect(url).toContain('/providers/Microsoft.ApiCenter/services/svc-1');
  });
});

describe('buildApicArmUri', () => {
  it('builds a service-scoped resource URI', () => {
    const uri = buildApicArmUri(context(), {
      type: ApicResourceType.MetadataSchema,
      nameParts: ['schema-a'],
    });
    expect(uri).toContain('/metadataSchemas/schema-a?api-version=' + API_VERSION);
    expect(uri).not.toContain('/workspaces/');
  });

  it('prepends the workspace segment for workspace-scoped resources', () => {
    const uri = buildApicArmUri(context(), {
      type: ApicResourceType.ApiDefinition,
      nameParts: ['api-a', 'v1', 'def-1'],
      workspace: 'default',
    });
    expect(uri).toContain(
      '/workspaces/default/apis/api-a/versions/v1/definitions/def-1?api-version=' + API_VERSION,
    );
  });

  it('throws when a workspace-scoped descriptor lacks a workspace', () => {
    expect(() =>
      buildApicArmUri(context(), {
        type: ApicResourceType.Api,
        nameParts: ['api-a'],
      }),
    ).toThrow(/workspace/i);
  });
});

describe('buildApicListUri', () => {
  it('drops the trailing name placeholder to form a collection path', () => {
    const uri = buildApicListUri(
      context(),
      ApicResourceType.ApiVersion,
      ['api-a'],
      'default',
    );
    expect(uri).toContain('/workspaces/default/apis/api-a/versions?api-version=' + API_VERSION);
    expect(uri).not.toMatch(/versions\/[^?]/);
  });

  it('builds a service-scoped collection path', () => {
    const uri = buildApicListUri(context(), ApicResourceType.Workspace, []);
    expect(uri).toContain('/services/svc-1/workspaces?api-version=' + API_VERSION);
  });
});

describe('buildApicLabel', () => {
  it('includes the workspace prefix for workspace-scoped resources', () => {
    const label = buildApicLabel({
      type: ApicResourceType.ApiVersion,
      nameParts: ['api-a', 'v1'],
      workspace: 'default',
    });
    expect(label).toBe('workspaces/default/apis/api-a/versions/v1');
  });
});
