// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
/**
 * API Center (`apic`) command group.
 *
 * Provides `apic extract` and `apic publish` for disaster-recovery style
 * backup/restore of `Microsoft.ApiCenter/services` control-plane state. This is
 * an additive provider module; the APIM command path is unchanged.
 */

import { Command } from 'commander';
import { logger } from '../lib/logger.js';
import { getCloudConfig } from '../lib/cloud-config.js';
import { buildApicBaseUrl } from '../lib/apic-uri.js';
import { ApicServiceContext } from '../models/apic-types.js';
import { ApicClient } from '../clients/apic-client.js';
import { ApicArtifactStore } from '../services/apic-artifact-store.js';
import {
  runApicExtraction,
  ApicExtractResult,
} from '../services/apic-extract-service.js';
import {
  runApicPublish,
  ApicPublishResult,
} from '../services/apic-publish-service.js';

/** Default API Center ARM api-version (covers agents/skills/models/mcp/eval). */
const DEFAULT_APIC_API_VERSION = '2024-06-01-preview';

interface GlobalOptions {
  logLevel?: string;
  subscriptionId?: string;
  cloud?: string;
  format?: string;
  apiVersion?: string;
}

interface ApicExtractOptions {
  resourceGroup: string;
  serviceName: string;
  workspace?: string;
  output: string;
  specifications: boolean;
}

interface ApicPublishOptions {
  resourceGroup: string;
  serviceName: string;
  source: string;
  dryRun: boolean;
  specifications: boolean;
}

/** Create the `apic` command group. */
export function createApicCommand(): Command {
  const apic = new Command('apic').description(
    'Backup and restore Azure API Center (Microsoft.ApiCenter) services',
  );

  apic
    .command('extract')
    .description('Extract API Center configuration to local artifact files')
    .requiredOption('--resource-group <rg>', 'Azure resource group name')
    .requiredOption('--service-name <name>', 'API Center service instance name')
    .option('--workspace <name>', 'Restrict extraction to a single workspace')
    .option('--output <dir>', 'Output directory path', './apic-artifacts')
    .option('--no-specifications', 'Skip exporting API definition specifications')
    .action(async (options: ApicExtractOptions, command: Command) => {
      await executeExtract(options, command.optsWithGlobals<GlobalOptions>());
    });

  apic
    .command('publish')
    .description('Publish local API Center artifacts to an API Center service')
    .requiredOption('--resource-group <rg>', 'Azure resource group name')
    .requiredOption('--service-name <name>', 'API Center service instance name')
    .option('--source <dir>', 'Source directory with artifacts', './apic-artifacts')
    .option('--dry-run', 'Preview changes without applying them', false)
    .option('--no-specifications', 'Skip importing API definition specifications')
    .action(async (options: ApicPublishOptions, command: Command) => {
      await executePublish(options, command.optsWithGlobals<GlobalOptions>());
    });

  return apic;
}

/** Resolve the subscription id or exit with a clear error. */
function resolveSubscriptionId(globalOpts: GlobalOptions): string {
  const subscriptionId =
    globalOpts.subscriptionId ?? process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId) {
    logger.error(
      'Subscription ID required: use --subscription-id or set AZURE_SUBSCRIPTION_ID',
    );
    process.exit(2);
  }
  return subscriptionId;
}

/** Build the shared API Center service context and cloud auth scope. */
function buildContext(
  globalOpts: GlobalOptions,
  resourceGroup: string,
  serviceName: string,
): { context: ApicServiceContext; authScope: string } {
  const subscriptionId = resolveSubscriptionId(globalOpts);
  const apiVersion =
    globalOpts.apiVersion ??
    process.env.AZURE_API_VERSION ??
    DEFAULT_APIC_API_VERSION;
  const cloudName = globalOpts.cloud ?? 'public';
  const cloudConfig = getCloudConfig(cloudName);
  const baseUrl = buildApicBaseUrl(
    cloudName,
    subscriptionId,
    resourceGroup,
    serviceName,
  );
  return {
    context: {
      subscriptionId,
      resourceGroup,
      serviceName,
      apiVersion,
      baseUrl,
    },
    authScope: cloudConfig.authScope,
  };
}

async function executeExtract(
  options: ApicExtractOptions,
  globalOpts: GlobalOptions,
): Promise<void> {
  const { context, authScope } = buildContext(
    globalOpts,
    options.resourceGroup,
    options.serviceName,
  );
  const client = new ApicClient(authScope);
  const store = new ApicArtifactStore();

  const result = await runApicExtraction(client, store, {
    context,
    outputDir: options.output,
    workspace: options.workspace,
    includeSpecifications: options.specifications,
  });

  if (globalOpts.format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    outputExtractText(result, options.output);
  }
  process.exit(result.exitCode);
}

async function executePublish(
  options: ApicPublishOptions,
  globalOpts: GlobalOptions,
): Promise<void> {
  const { context, authScope } = buildContext(
    globalOpts,
    options.resourceGroup,
    options.serviceName,
  );
  const client = new ApicClient(authScope);
  const store = new ApicArtifactStore();

  const result = await runApicPublish(client, store, {
    context,
    sourceDir: options.source,
    dryRun: options.dryRun,
    includeSpecifications: options.specifications,
  });

  if (globalOpts.format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    outputPublishText(result, options.dryRun);
  }
  process.exit(result.exitCode);
}

function outputExtractText(result: ApicExtractResult, outputDir: string): void {
  logger.info(`Extracted ${result.totalExtracted} resource(s) to ${outputDir}`);
  if (result.totalSpecifications > 0) {
    logger.info(`Exported ${result.totalSpecifications} specification(s)`);
  }
  for (const [type, count] of Object.entries(result.byType)) {
    logger.info(`  ${type}: ${count}`);
  }
  if (result.totalErrors > 0) {
    logger.error(`Completed with ${result.totalErrors} error(s)`);
  }
}

function outputPublishText(result: ApicPublishResult, dryRun: boolean): void {
  const verb = dryRun ? 'Would publish' : 'Published';
  logger.info(`${verb} ${result.totalPublished} resource(s)`);
  if (result.totalSpecifications > 0) {
    logger.info(`Imported ${result.totalSpecifications} specification(s)`);
  }
  for (const [type, count] of Object.entries(result.byType)) {
    logger.info(`  ${type}: ${count}`);
  }
  if (result.totalErrors > 0) {
    logger.error(`Completed with ${result.totalErrors} error(s)`);
  }
}
