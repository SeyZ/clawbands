/**
 * ClawBands Plugin Entry Point
 * OpenClaw plugin integration.
 *
 * IMPORTANT: register() must be SYNCHRONOUS — the OpenClaw gateway
 * ignores async plugin registration (the returned promise is not awaited).
 *
 * Hooks:
 *  before_tool_call → api.on() (tool interception)
 */

import { Interceptor } from '../core/Interceptor';
import { PolicyStore } from '../storage/PolicyStore';
import { logger } from '../core/Logger';
import { createToolCallHook, CLAWBANDS_RESPOND_TOOL } from './tool-interceptor';

export interface ClawBandsConfig {
  enabled?: boolean;
  defaultAction?: 'ALLOW' | 'DENY' | 'ASK';
}

/**
 * OpenClaw plugin API surface used by ClawBands.
 * Both methods are optional — the gateway may not support all of them.
 */
interface OpenClawPluginApi {
  on?(hookName: string, handler: (...args: unknown[]) => void): void;
  registerTool?(spec: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (...args: unknown[]) => Promise<unknown>;
  }): void;
}

/**
 * Attempt to register the clawbands_respond tool via api.registerTool().
 * Returns true if the call succeeded, false if the API is not available.
 */
function tryRegisterTool(api: OpenClawPluginApi): boolean {
  try {
    if (!api.registerTool) {
      logger.info('[plugin] api.registerTool not available — fallback retry-as-approval');
      return false;
    }
    api.registerTool({
      name: CLAWBANDS_RESPOND_TOOL,
      description: 'Respond to a ClawBands security prompt. Call after the user says YES, NO, or ALLOW.',
      parameters: {
        type: 'object',
        properties: {
          decision: {
            type: 'string',
            enum: ['yes', 'no', 'allow'],
            description: 'The user decision: "yes" to approve once, "no" to deny, "allow" to auto-approve for 15 minutes.',
          },
        },
        required: ['decision'],
      },
      // The actual logic runs in before_tool_call (tool-interceptor.ts).
      // This execute handler exists only because the gateway requires it.
      execute: async () => ({ result: 'Handled by ClawBands hook.' }),
    });
    logger.info(`[plugin] Registered tool: ${CLAWBANDS_RESPOND_TOOL}`);
    return true;
  } catch (err) {
    logger.warn(`[plugin] api.registerTool() threw`, { error: err });
    return false;
  }
}

/**
 * Safely attempt to register a hook via api.on().
 * Returns true if the call succeeded (no throw), false otherwise.
 */
function tryOn(
  api: OpenClawPluginApi,
  hookName: string,
  handler: (...args: unknown[]) => void,
  label: string
): boolean {
  try {
    if (!api.on) {
      logger.debug(`[plugin] ${label}: api.on not available`);
      return false;
    }
    api.on(hookName, handler);
    logger.info(`[plugin] ${label}: api.on('${hookName}') succeeded`);
    return true;
  } catch (err) {
    logger.warn(`[plugin] ${label}: api.on('${hookName}') threw`, { error: err });
    return false;
  }
}

export default {
  id: 'clawbands',
  name: 'ClawBands',

  register(api: OpenClawPluginApi): void {
    logger.info('ClawBands plugin loading...');

    try {
      const policy = PolicyStore.loadSync();
      logger.info('Security policy loaded', {
        defaultAction: policy.defaultAction,
        moduleCount: Object.keys(policy.modules).length,
      });

      const interceptor = new Interceptor(policy);

      // -----------------------------------------------------------------------
      // Hook: before_tool_call — tool interception
      // -----------------------------------------------------------------------
      const toolHook = createToolCallHook(interceptor);
      tryOn(api, 'before_tool_call', toolHook as (...args: unknown[]) => void, 'before_tool_call');

      // -----------------------------------------------------------------------
      // Tool registration: clawbands_respond
      // If available, the LLM sees this tool and calls it with { decision: "yes"|"no"|"allow" }.
      // The actual logic is intercepted in before_tool_call (tool-interceptor.ts).
      // -----------------------------------------------------------------------
      const toolRegistered = tryRegisterTool(api);
      interceptor.respondToolAvailable = toolRegistered;

      logger.info('ClawBands: hook registration complete', {
        respondToolAvailable: toolRegistered,
      });
    } catch (error) {
      logger.error('Failed to initialize ClawBands plugin', { error });
      throw error;
    }
  },
};
