// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * Filesystem artifact store for API Center extract/publish.
 *
 * Writes one directory per resource with an `*Information.json` info file, and a
 * `specification/` sidecar for API definition bodies. Mirrors the layout in the
 * DR plan §5.3. Also walks the tree to reconstruct descriptors for publish.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  APIC_RESOURCE_TYPE_METADATA,
  ApicResourceType,
} from '../models/apic-resource-types.js';
import { ApicResourceDescriptor } from '../models/apic-types.js';
import { apicArtifactDir, apicInfoFilePath } from '../lib/apic-uri.js';

/** Map every info-file name back to its resource type (names are unique). */
const INFO_FILE_TO_TYPE: ReadonlyMap<string, ApicResourceType> = new Map(
  (Object.keys(APIC_RESOURCE_TYPE_METADATA) as ApicResourceType[]).map((type) => [
    APIC_RESOURCE_TYPE_METADATA[type].infoFile,
    type,
  ]),
);

/** File extension used for an exported specification, by format name. */
function specExtension(formatName: string, content: string): string {
  switch (formatName.toLowerCase()) {
    case 'wsdl':
    case 'wadl':
      return 'xml';
    case 'graphql':
      return 'graphql';
    case 'grpc':
      return 'proto';
    default:
      // openapi / asyncapi / raml / other — JSON or YAML by sniffing.
      return content.trimStart().startsWith('{') ? 'json' : 'yaml';
  }
}

export class ApicArtifactStore {
  /** Write a resource's ARM JSON to its info file. */
  async writeResource(
    baseDir: string,
    descriptor: ApicResourceDescriptor,
    json: Record<string, unknown>,
  ): Promise<void> {
    const dir = apicArtifactDir(baseDir, descriptor);
    await fs.mkdir(dir, { recursive: true });
    const file = apicInfoFilePath(baseDir, descriptor);
    await fs.writeFile(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  /** Write an exported specification body under the definition's sidecar dir. */
  async writeSpecification(
    baseDir: string,
    descriptor: ApicResourceDescriptor,
    content: string,
    formatName: string,
  ): Promise<void> {
    const specDir = path.join(apicArtifactDir(baseDir, descriptor), 'specification');
    await fs.mkdir(specDir, { recursive: true });
    const file = path.join(specDir, `specification.${specExtension(formatName, content)}`);
    await fs.writeFile(file, content, 'utf8');
  }

  /** Read a resource's ARM JSON, or undefined if absent. */
  async readResource(
    baseDir: string,
    descriptor: ApicResourceDescriptor,
  ): Promise<Record<string, unknown> | undefined> {
    const file = apicInfoFilePath(baseDir, descriptor);
    try {
      const text = await fs.readFile(file, 'utf8');
      return JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }

  /** Read the single exported specification file, or undefined if none. */
  async readSpecification(
    baseDir: string,
    descriptor: ApicResourceDescriptor,
  ): Promise<string | undefined> {
    const specDir = path.join(apicArtifactDir(baseDir, descriptor), 'specification');
    let entries: string[];
    try {
      entries = await fs.readdir(specDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
    const specFile = entries.find((e) => e.startsWith('specification.'));
    if (!specFile) {
      return undefined;
    }
    return fs.readFile(path.join(specDir, specFile), 'utf8');
  }

  /**
   * Walk the artifact tree and reconstruct every resource descriptor from its
   * info-file location.
   */
  async listDescriptors(baseDir: string): Promise<ApicResourceDescriptor[]> {
    const descriptors: ApicResourceDescriptor[] = [];
    const infoFiles = await this.findInfoFiles(baseDir);
    for (const absFile of infoFiles) {
      const fileName = path.basename(absFile);
      const type = INFO_FILE_TO_TYPE.get(fileName);
      if (!type) {
        continue;
      }
      const relDir = path
        .relative(baseDir, path.dirname(absFile))
        .split(path.sep)
        .join('/');
      const descriptor = this.pathToDescriptor(type, relDir);
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
    return descriptors;
  }

  /** Recursively collect files whose name is a known info file. */
  private async findInfoFiles(dir: string): Promise<string[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const results: string[] = [];
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.findInfoFiles(abs)));
      } else if (INFO_FILE_TO_TYPE.has(entry.name)) {
        results.push(abs);
      }
    }
    return results;
  }

  /**
   * Reverse a relative artifact directory into a descriptor. Handles the
   * `workspaces/{ws}/` prefix for workspace-scoped types.
   */
  private pathToDescriptor(
    type: ApicResourceType,
    relDir: string,
  ): ApicResourceDescriptor | undefined {
    const meta = APIC_RESOURCE_TYPE_METADATA[type];
    let remainder = relDir;
    let workspace: string | undefined;

    if (meta.scope === 'workspace') {
      const match = /^workspaces\/([^/]+)\/(.*)$/.exec(relDir);
      if (!match) {
        return undefined;
      }
      workspace = decodeURIComponent(match[1]);
      remainder = match[2];
    }

    const nameParts = parseTemplateSegments(meta.artifactDirectory, remainder);
    if (!nameParts) {
      return undefined;
    }
    return { type, nameParts, workspace };
  }
}

/**
 * Parse an actual `/`-joined path against a positional-placeholder template,
 * returning the captured name-parts (in placeholder order) or undefined if the
 * literal segments do not match.
 */
export function parseTemplateSegments(
  template: string,
  actual: string,
): string[] | undefined {
  const templateSegs = template.split('/');
  const actualSegs = actual.split('/');
  if (templateSegs.length !== actualSegs.length) {
    return undefined;
  }
  const indexed: Array<{ index: number; value: string }> = [];
  for (let i = 0; i < templateSegs.length; i++) {
    const t = templateSegs[i];
    const a = actualSegs[i];
    const placeholder = /^\{(\d+)\}$/.exec(t);
    if (placeholder) {
      indexed.push({ index: +placeholder[1], value: a });
    } else if (t !== a) {
      return undefined;
    }
  }
  return indexed.sort((x, y) => x.index - y.index).map((p) => p.value);
}
