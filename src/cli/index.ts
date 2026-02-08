#!/usr/bin/env node

/**
 * ClawBands CLI Entry Point
 */

import { Command } from 'commander';
import { initWizard } from './init';
import { policyCommand } from './commands/policy';
import { statsCommand } from './commands/stats';
import { auditCommand } from './commands/audit';
import { resetCommand } from './commands/reset';
import { disableCommand, enableCommand } from './commands/toggle';

const program = new Command();

program.name('clawbands').description('🦞 Put safety bands on OpenClaw').version('1.0.0');

// Initialize ClawBands with OpenClaw
program
  .command('init')
  .description('Setup ClawBands with OpenClaw (interactive wizard)')
  .action(initWizard);

// Manage security policies
program.command('policy').description('Manage security policies').action(policyCommand);

// View statistics
program.command('stats').description('View security statistics').action(statsCommand);

// View audit trail
program
  .command('audit')
  .description('View decision audit trail')
  .option('-n, --lines <number>', 'Number of recent decisions to show', '50')
  .action(auditCommand);

// Reset stats
program.command('reset').description('Reset statistics').action(resetCommand);

// Disable ClawBands
program.command('disable').description('Temporarily disable ClawBands').action(disableCommand);

// Enable ClawBands
program.command('enable').description('Re-enable ClawBands').action(enableCommand);

program.parse();
