/**
 * ClawBands Arbitrator
 * The UI/Prompt Logic for Human-in-the-Loop Decisions
 *
 * Three modes:
 *  1. TTY (interactive terminal)  → inquirer prompt
 *  2. Daemon + sessionKey (channel) → approval queue (block-and-retry via messaging)
 *  3. Daemon without sessionKey    → auto-deny (fail-secure)
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { ExecutionContext } from '../types';
import { logger } from './Logger';
import { approvalQueue } from './ApprovalQueue';

export class Arbitrator {
  /**
   * Request human judgment on an intercepted action.
   * @param context - The execution context (includes optional sessionKey)
   * @returns true if approved, false if rejected
   */
  async judge(context: ExecutionContext): Promise<boolean> {
    // -----------------------------------------------------------------------
    // Mode 1: Interactive TTY — prompt via inquirer (original behavior)
    // -----------------------------------------------------------------------
    if (process.stdin.isTTY) {
      return this.judgeTTY(context);
    }

    // -----------------------------------------------------------------------
    // Mode 2: Daemon with session — channel-based approval queue
    // -----------------------------------------------------------------------
    if (context.sessionKey) {
      return this.judgeChannel(context);
    }

    // -----------------------------------------------------------------------
    // Mode 3: Daemon without session (cron, webhook, etc.) — auto-deny
    // -----------------------------------------------------------------------
    logger.info(
      `ASK policy → auto-denied (no TTY, no session): ${context.moduleName}.${context.methodName}()`,
      { args: context.args }
    );
    return false;
  }

  // ---------------------------------------------------------------------------
  // Mode 1 — TTY prompt
  // ---------------------------------------------------------------------------

  private async judgeTTY(context: ExecutionContext): Promise<boolean> {
    this.displayBanner();
    this.displayContext(context);

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'decision',
        message: chalk.bold.yellow('⚠️  What should ClawBands do?'),
        choices: [
          {
            name: chalk.green('✓ Approve - Allow this action'),
            value: true,
          },
          {
            name: chalk.red('✗ Reject - Block this action'),
            value: false,
          },
        ],
        default: 1, // Default to Reject for safety
      },
    ]);

    console.log(''); // Add spacing after decision

    if (answer.decision) {
      console.log(chalk.green('✓ Action APPROVED by user\n'));
    } else {
      console.log(chalk.red('✗ Action REJECTED by user\n'));
    }

    return answer.decision;
  }

  // ---------------------------------------------------------------------------
  // Mode 2 — Channel-based approval (WhatsApp / Telegram / etc.)
  // ---------------------------------------------------------------------------

  private judgeChannel(context: ExecutionContext): boolean {
    const { sessionKey, moduleName, methodName } = context;

    // Path A (primary): explicit approval — clawbands_respond({ decision: "yes" })
    // called approve().
    if (approvalQueue.consume(sessionKey!, moduleName, methodName)) {
      logger.info(`ASK policy → approved via channel: ${moduleName}.${methodName}()`, {
        sessionKey,
      });
      return true;
    }

    // Path B (fallback): retry-as-approval — used when api.registerTool() is not
    // available (old gateway). The agent retries the blocked tool after the user
    // said YES, and the retry itself is the approval signal.
    if (approvalQueue.consumePending(sessionKey!, moduleName, methodName)) {
      logger.info(
        `ASK policy → approved via channel (retry-as-approval): ${moduleName}.${methodName}()`,
        { sessionKey }
      );
      return true;
    }

    // Path C: first encounter — create a pending entry and block.
    // The Interceptor will throw an error whose message instructs the agent to
    // ask the user YES/NO. If clawbands_respond is available, the agent calls it;
    // otherwise falls back to retry-as-approval (Path B).
    approvalQueue.request(sessionKey!, moduleName, methodName);
    logger.info(`ASK policy → awaiting channel approval: ${moduleName}.${methodName}()`, {
      sessionKey,
    });
    return false;
  }

  // ---------------------------------------------------------------------------
  // Display helpers (TTY mode)
  // ---------------------------------------------------------------------------

  private displayBanner(): void {
    console.log('');
    console.log(chalk.bgRed.white.bold('═'.repeat(80)));
    console.log(
      chalk.bgRed.white.bold('   🦞 CLAWBANDS SECURITY ALERT - HUMAN AUTHORIZATION REQUIRED')
    );
    console.log(chalk.bgRed.white.bold('═'.repeat(80)));
    console.log('');
  }

  private displayContext(context: ExecutionContext): void {
    console.log(chalk.bold.cyan('📦 Module:'), chalk.white(context.moduleName));
    console.log(chalk.bold.cyan('🔧 Method:'), chalk.white(context.methodName));

    if (context.rule.description) {
      console.log(chalk.bold.cyan('⚠️  Risk:'), chalk.yellow(context.rule.description));
    }

    console.log(chalk.bold.cyan('📋 Arguments:'));

    try {
      const argsJson = JSON.stringify(context.args, null, 2);
      console.log(chalk.gray(this.indentJson(argsJson)));
    } catch {
      console.log(chalk.gray('  [Arguments contain non-serializable data]'));
      console.log(chalk.gray('  ' + String(context.args)));
    }

    console.log('');
    console.log(chalk.dim('─'.repeat(80)));
    console.log('');
  }

  private indentJson(json: string): string {
    return json
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n');
  }
}
