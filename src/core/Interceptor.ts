/**
 * ClawBands Interceptor
 * The Brain - Runtime Security Evaluation Engine
 */

import { SecurityPolicy, Decision, SecurityRule, ExecutionContext } from '../types';
import { DEFAULT_POLICY } from '../config';
import { Arbitrator } from './Arbitrator';
import { DecisionLog, DecisionRecord } from '../storage/DecisionLog';
import { StatsTracker } from '../storage/StatsTracker';
import { logger } from './Logger';
import chalk from 'chalk';

export class Interceptor {
  private policy: SecurityPolicy;
  private arbitrator: Arbitrator;
  private logEnabled: boolean;

  /**
   * Set to true when api.registerTool() succeeded for clawbands_respond.
   * Controls the blockReason message sent to the LLM in channel mode.
   */
  public respondToolAvailable = false;

  constructor(policy?: SecurityPolicy, logEnabled: boolean = true) {
    this.policy = policy || DEFAULT_POLICY;
    this.arbitrator = new Arbitrator();
    this.logEnabled = logEnabled;
  }

  /**
   * Evaluate the security policy for a tool call.
   * Used by the OpenClaw hook system — throws if the action is denied.
   * @param moduleName - The ClawBands module (e.g., 'FileSystem', 'Shell')
   * @param methodName - The method within the module (e.g., 'read', 'bash')
   * @param args - The arguments passed to the tool
   * @param sessionKey - OpenClaw session key (present in daemon/channel mode)
   */
  async evaluate(
    moduleName: string,
    methodName: string,
    args: unknown[],
    sessionKey?: string
  ): Promise<void> {
    const rule = this.lookupRule(moduleName, methodName);

    if (this.logEnabled) {
      this.logInterception(moduleName, methodName, rule.action);
    }

    const allowed = await this.executeDecision(rule, moduleName, methodName, args, sessionKey);

    if (!allowed) {
      // In channel mode (no TTY + sessionKey), provide a message the agent can
      // relay to the user on WhatsApp/Telegram so they can reply YES to approve.
      const isChannelMode = !process.stdin.isTTY && sessionKey;
      const detail = rule.description || 'No description provided.';

      if (isChannelMode) {
        const instructions = this.respondToolAvailable
          ? `Ask the user: YES, NO, or ALLOW (auto-approve for 15 min).\n` +
            `- YES → clawbands_respond({ decision: "yes" }), then retry.\n` +
            `- NO → clawbands_respond({ decision: "no" }). Do NOT retry.\n` +
            `- ALLOW → clawbands_respond({ decision: "allow" }), then retry. Auto-approves this action for 15 minutes.`
          : `Ask the user YES or NO.\n` +
            `- If YES: call ${moduleName}.${methodName}() again exactly as before.\n` +
            `- If NO: do NOT call the tool again. Tell the user the action was cancelled.`;

        throw new Error(
          `[ClawBands:APPROVAL_REQUIRED] ${moduleName}.${methodName}() is blocked pending human approval. ` +
            `Risk: ${detail}\n` +
            instructions
        );
      }

      throw new Error(
        `ClawBands Security Violation: ${moduleName}.${methodName}() was DENIED. ${detail}`
      );
    }
  }

  /**
   * Lookup the security rule for a module/method combination
   */
  private lookupRule(moduleName: string, methodName: string): SecurityRule {
    const moduleRules = this.policy.modules[moduleName];

    if (moduleRules && moduleRules[methodName]) {
      return moduleRules[methodName];
    }

    // Fallback to default action
    return {
      action: this.policy.defaultAction,
      description: `No specific rule defined for ${moduleName}.${methodName}`,
    };
  }

  /**
   * Execute the security decision based on the rule
   * @returns true if approved, false if denied
   */
  private async executeDecision(
    rule: SecurityRule,
    moduleName: string,
    methodName: string,
    args: unknown[],
    sessionKey?: string
  ): Promise<boolean> {
    const startTime = Date.now();

    switch (rule.action) {
      case 'ALLOW': {
        const decisionTime = Date.now() - startTime;
        await this.logDecision({
          timestamp: new Date().toISOString(),
          module: moduleName,
          method: methodName,
          args,
          decision: 'ALLOWED',
          decisionTime,
        });
        return true;
      }

      case 'DENY': {
        const decisionTime = Date.now() - startTime;
        await this.logDecision({
          timestamp: new Date().toISOString(),
          module: moduleName,
          method: methodName,
          args,
          decision: 'BLOCKED',
          reason: 'Policy: DENY',
          decisionTime,
        });
        return false;
      }

      case 'ASK': {
        const context: ExecutionContext = {
          moduleName,
          methodName,
          args,
          rule,
          sessionKey,
        };
        const approved = await this.arbitrator.judge(context);
        const decisionTime = Date.now() - startTime;

        await this.logDecision({
          timestamp: new Date().toISOString(),
          module: moduleName,
          method: methodName,
          args,
          decision: approved ? 'APPROVED' : 'REJECTED',
          userId: 'human',
          decisionTime,
        });

        return approved;
      }

      default:
        // Should never happen with TypeScript, but adding for safety
        throw new Error(`Unknown decision type: ${rule.action}`);
    }
  }

  /**
   * Log a decision to the audit trail and update stats
   */
  private async logDecision(record: DecisionRecord): Promise<void> {
    try {
      await DecisionLog.append(record);
      await StatsTracker.increment(record.decision, record.decisionTime);
    } catch (error) {
      // Don't fail the operation if logging fails
      logger.error('Failed to log decision', { error });
    }
  }

  /**
   * Log an interception event
   */
  private logInterception(moduleName: string, methodName: string, action: Decision): void {
    const coloredAction =
      action === 'ALLOW'
        ? chalk.green(action)
        : action === 'DENY'
          ? chalk.red(action)
          : chalk.yellow(action);

    logger.info(`${chalk.cyan('ClawBands:')} ${moduleName}.${methodName}() → ${coloredAction}`);
  }
}
