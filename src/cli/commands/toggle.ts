/**
 * ClawBands Enable/Disable Commands
 */

import chalk from 'chalk';
import { loadOpenClawConfig, saveOpenClawConfig } from '../../plugin/config-manager';
import { logger } from '../../core/Logger';

export async function disableCommand(): Promise<void> {
  try {
    const config = await loadOpenClawConfig();

    if (!config?.plugins?.entries?.clawbands) {
      console.log(chalk.yellow('ClawBands is not registered in OpenClaw. Run: clawbands init'));
      process.exit(0);
    }

    config.plugins.entries.clawbands.enabled = false;
    await saveOpenClawConfig(config);

    console.log(chalk.green('ClawBands disabled'));
  } catch (error) {
    console.error(chalk.red('Failed to disable ClawBands:'), error);
    logger.error('Disable command failed', { error });
    process.exit(1);
  }
}

export async function enableCommand(): Promise<void> {
  try {
    const config = await loadOpenClawConfig();

    if (!config?.plugins?.entries?.clawbands) {
      console.log(chalk.yellow('ClawBands is not registered in OpenClaw. Run: clawbands init'));
      process.exit(0);
    }

    config.plugins.entries.clawbands.enabled = true;
    await saveOpenClawConfig(config);

    console.log(chalk.green('ClawBands enabled'));
  } catch (error) {
    console.error(chalk.red('Failed to enable ClawBands:'), error);
    logger.error('Enable command failed', { error });
    process.exit(1);
  }
}
