/**
 * ClawBands Default Security Policy
 * Philosophy: "Secure by Default"
 */

import { SecurityPolicy } from './types';

export const DEFAULT_POLICY: SecurityPolicy = {
  // PARANOIA MODE: If a tool is unknown, ask the human.
  defaultAction: 'ASK',

  modules: {
    FileSystem: {
      read: {
        action: 'ALLOW',
        description: 'Read-only access is generally safe',
      },
      write: {
        action: 'ASK',
        description: 'Modification of files requires approval',
      },
      delete: {
        action: 'DENY',
        description: 'Deletion is strictly prohibited',
      },
    },
    Shell: {
      bash: {
        action: 'ASK',
        description: 'Shell command execution risk',
      },
      exec: {
        action: 'ASK',
        description: 'Arbitrary Code Execution (RCE) risk',
      },
      spawn: {
        action: 'ASK',
        description: 'Process spawning risk',
      },
    },
    Network: {
      fetch: {
        action: 'ASK',
        description: 'Potential data exfiltration',
      },
      request: {
        action: 'ASK',
        description: 'HTTP request may leak data',
      },
    },
  },
};
