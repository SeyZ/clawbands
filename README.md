# 🦞 + 🪢 ClawBands

<p align="center">
  <img src="logo.png" alt="ClawBands Logo" width="300"/>
</p>

**Put safety bands on [OpenClaw](https://github.com/openclaw/openclaw)**

ClawBands is a security middleware for [OpenClaw](https://github.com/openclaw/openclaw) AI agents. It hooks into OpenClaw's plugin system to intercept every tool execution (file writes, shell commands, network requests) and enforces human-in-the-loop approval before dangerous actions execute.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%23007ACC.svg)](http://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## Why?

OpenClaw can execute shell commands, modify files, and access your APIs. OS-level isolation (containers, VMs) protects your **host machine**, but it doesn't protect the **services your agent has access to**.

ClawBands solves this by hooking into OpenClaw's `before_tool_call` plugin event. Before any dangerous action executes (writes, deletes, shell commands, API calls), the agent pauses and waits for your decision. In a terminal, you get an interactive prompt. On messaging channels (WhatsApp, Telegram), the agent asks you YES/NO and relays your answer via a dedicated `clawbands_respond` tool. Every choice is logged to an immutable audit trail. Think of it as `sudo` for your AI agent: nothing happens without your explicit permission.

## Features

- 🔒 **Synchronous Blocking** - Agent pauses until you approve
- ⚙️ **Granular Control** - Allow reads, ask on writes, deny deletes
- 💬 **Channel Support** - Works in terminal, WhatsApp, Telegram via `clawbands_respond` tool
- 📊 **Full Audit Trail** - Every decision logged (JSON Lines format)
- ⚡ **Zero Latency** - Runs in-process, no API calls

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- OpenClaw installed

### Installation

```bash
# Install globally
npm install -g clawbands

# Run interactive setup
clawbands init

# Restart OpenClaw
openclaw restart
```

Done! ClawBands is now protecting your OpenClaw instance.

## How It Works

### Terminal Mode (TTY)

```
Agent calls tool: write('/etc/passwd', 'hacked')
  → before_tool_call hook fires
  → ClawBands checks policy: write = ASK
  → Interactive prompt:
    ┌─────────────────────────────────────┐
    │ 🦞 CLAWBANDS SECURITY ALERT         │
    │                                     │
    │ Module: FileSystem                  │
    │ Method: write                       │
    │ Args: ["/etc/passwd", "hacked"]     │
    │                                     │
    │ ❯ ✓ Approve                         │
    │   ✗ Reject                          │
    └─────────────────────────────────────┘
  → You reject → { block: true }
  → Decision logged to audit trail
```

### Channel Mode (WhatsApp / Telegram)

```
Agent calls tool: bash('rm -rf /tmp/data')
  → before_tool_call → policy = ASK → blocked (pending approval)
  → Agent asks: "ClawBands requires approval. YES or NO?"

User replies YES:
  → Agent calls clawbands_respond({ decision: "yes" })
  → before_tool_call intercepts → approves pending entry
  → Agent retries bash('rm -rf /tmp/data') → approved ✓

User replies NO:
  → Agent calls clawbands_respond({ decision: "no" })
  → before_tool_call intercepts → denies pending entry
  → Agent does NOT retry → cancelled ✓
```

The `clawbands_respond` tool is registered automatically via `api.registerTool()` when the gateway supports it.

## Security Policies

ClawBands uses three decision types:

| Policy | Behavior |
|--------|----------|
| **ALLOW** | Execute immediately (e.g., file reads) |
| **ASK** | Prompt for approval (e.g., file writes) |
| **DENY** | Block automatically (e.g., file deletes) |

Default policy (Balanced):
- FileSystem: read=ALLOW, write=ASK, delete=DENY
- Shell: bash=ASK, exec=ASK
- Network: fetch=ASK, request=ASK
- Everything else: ASK (fail-secure default)

## CLI Commands

```bash
clawbands init        # Interactive setup wizard
clawbands policy      # Manage security policies
clawbands stats       # View statistics
clawbands audit       # View decision history
clawbands reset       # Reset statistics
clawbands disable     # Temporarily disable
clawbands enable      # Re-enable
```

## Example: View Audit Trail

```bash
$ clawbands audit --lines 5

16:05:00 | FileSystem.read              | ALLOWED    |   0.0s
16:06:00 | FileSystem.write             | APPROVED   |   3.5s (human)
16:07:00 | Shell.bash                   | REJECTED   |   1.2s (human)
16:08:00 | FileSystem.delete            | BLOCKED    |   0.0s - Policy: DENY
```

## Example: View Statistics

```bash
$ clawbands stats

📊 ClawBands Statistics

Total Calls:    142

Decisions:
  ✅ Allowed:      35 (24.6%)
  ✅ Approved:     89 (62.7%) - by user
  ❌ Rejected:     12 (8.5%)  - by user
  🚫 Blocked:       6 (4.2%)  - by policy

Average Decision Time: 2.8s
```

## Data Storage

All data stored in `~/.openclaw/clawbands/`:

```
~/.openclaw/clawbands/
├── policy.json       # Your security rules
├── decisions.jsonl   # Audit trail (append-only)
├── stats.json        # Statistics
└── clawbands.log     # Application logs
```

## Use as a Library

```typescript
import { Interceptor, createToolCallHook } from 'clawbands';

// Create interceptor with default policy
const interceptor = new Interceptor();

// Create a hook handler for OpenClaw's before_tool_call event
const hook = createToolCallHook(interceptor);

// Register with the OpenClaw plugin API
api.on('before_tool_call', hook);
```

## Protected Tools

ClawBands intercepts every tool mapped in `TOOL_TO_MODULE`:
- **FileSystem**: read, write, edit, glob
- **Shell**: bash, exec
- **Browser**: navigate, screenshot, click, type, evaluate
- **Network**: fetch, request, webhook, download
- **Gateway**: listSessions, listNodes, sendMessage

Any unmapped tool falls through to `defaultAction` (ASK by default).

## Architecture

```
src/
├── core/
│   ├── Interceptor.ts    # Policy evaluation engine
│   ├── Arbitrator.ts     # Human-in-the-loop (TTY prompt / channel queue)
│   ├── ApprovalQueue.ts  # In-memory approval state for channel mode
│   └── Logger.ts         # Winston-based logging
├── plugin/
│   ├── index.ts              # Plugin entry point (hook + tool registration)
│   ├── tool-interceptor.ts   # before_tool_call handler + clawbands_respond intercept
│   └── config-manager.ts     # OpenClaw config management (register/unregister)
├── storage/        # Persistence (PolicyStore, DecisionLog, StatsTracker)
├── cli/            # Command-line interface
├── types.ts        # TypeScript definitions
└── config.ts       # Default policies
```

## Development

```bash
# Clone repo
git clone https://github.com/SeyZ/clawbands.git
cd clawbands

# Install dependencies
npm install

# Build
npm run build

# Test CLI locally
node dist/cli/index.js init

# Link for global testing
npm link
clawbands --help
```

## Security Guarantees

✅ **Zero Trust** - Every action evaluated
✅ **Synchronous Blocking** - Agent waits for approval
✅ **No Bypass** - Plugin hooks intercept all tool calls
✅ **Immutable Audit** - JSON Lines append-only format
✅ **Human Authority** - Critical decisions need approval
✅ **Fail Secure** - Unknown actions default to ASK/DENY

## Contributing

We believe in safe AI. PRs welcome!

1. Fork the repo
2. Create your feature branch: `git checkout -b feature/amazing`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing`
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT - See [LICENSE](LICENSE) for details.

## Acknowledgments

- Built for [OpenClaw](https://github.com/openclaw) agents
- Inspired by the need for human oversight in AI systems
- Thanks to the AI safety community

---

**Built with ❤️ for a safer AI future.**
