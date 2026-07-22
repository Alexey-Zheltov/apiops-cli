// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { describe, it, expect } from 'vitest';
import {
  ApicResourceType,
  APIC_RESOURCE_TYPE_METADATA,
  APIC_DEPENDENCY_TIERS,
  getApicRootTypes,
  getApicChildTypes,
} from '../../../src/models/apic-resource-types.js';

const ALL_TYPES = Object.values(ApicResourceType);

describe('ApicResourceType metadata', () => {
  it('has metadata for every enum value', () => {
    for (const type of ALL_TYPES) {
      expect(APIC_RESOURCE_TYPE_METADATA[type], type).toBeDefined();
    }
    expect(Object.keys(APIC_RESOURCE_TYPE_METADATA)).toHaveLength(ALL_TYPES.length);
  });

  it('has unique info-file names (required for path reversal)', () => {
    const names = ALL_TYPES.map((t) => APIC_RESOURCE_TYPE_METADATA[t].infoFile);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never encodes the workspaces/{ws} segment in a path suffix', () => {
    for (const type of ALL_TYPES) {
      const meta = APIC_RESOURCE_TYPE_METADATA[type];
      if (meta.scope === 'workspace') {
        expect(meta.armPathSuffix.startsWith('workspaces/'), type).toBe(false);
      }
    }
  });

  it('only ApiDefinition carries a specification body', () => {
    const withSpec = ALL_TYPES.filter((t) => APIC_RESOURCE_TYPE_METADATA[t].hasSpecification);
    expect(withSpec).toEqual([ApicResourceType.ApiDefinition]);
  });

  it('every non-root parent reference resolves to a real type', () => {
    for (const type of ALL_TYPES) {
      const parent = APIC_RESOURCE_TYPE_METADATA[type].parent;
      if (parent !== null) {
        expect(APIC_RESOURCE_TYPE_METADATA[parent], `${type} parent`).toBeDefined();
      }
    }
  });
});

describe('getApicRootTypes', () => {
  it('returns the service-scoped roots', () => {
    expect(getApicRootTypes('service').sort()).toEqual(
      [ApicResourceType.MetadataSchema, ApicResourceType.Workspace].sort(),
    );
  });

  it('returns workspace-scoped roots without parents', () => {
    const roots = getApicRootTypes('workspace');
    expect(roots).toContain(ApicResourceType.Api);
    expect(roots).toContain(ApicResourceType.Environment);
    expect(roots).not.toContain(ApicResourceType.ApiVersion);
    expect(roots).not.toContain(ApicResourceType.ApiDefinition);
  });
});

describe('getApicChildTypes', () => {
  it('returns both children of Api', () => {
    expect(getApicChildTypes(ApicResourceType.Api).sort()).toEqual(
      [ApicResourceType.ApiVersion, ApicResourceType.ApiDeployment].sort(),
    );
  });

  it('returns ApiDefinition as the child of ApiVersion', () => {
    expect(getApicChildTypes(ApicResourceType.ApiVersion)).toEqual([
      ApicResourceType.ApiDefinition,
    ]);
  });
});

describe('APIC_DEPENDENCY_TIERS', () => {
  it('covers every resource type exactly once', () => {
    const flat = APIC_DEPENDENCY_TIERS.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.sort()).toEqual([...ALL_TYPES].sort());
  });

  it('orders every child strictly after its parent', () => {
    const tierIndex = new Map<ApicResourceType, number>();
    APIC_DEPENDENCY_TIERS.forEach((tier, i) => tier.forEach((t) => tierIndex.set(t, i)));
    for (const type of ALL_TYPES) {
      const parent = APIC_RESOURCE_TYPE_METADATA[type].parent;
      if (parent !== null) {
        expect(tierIndex.get(type)!, `${type} after ${parent}`).toBeGreaterThan(
          tierIndex.get(parent)!,
        );
      }
    }
  });
});
