# @tanstack/ai-isolate-daytona

Daytona sandbox driver for TanStack AI Code Mode.

This package runs generated JavaScript or TypeScript in a caller-provided Daytona sandbox and keeps TanStack tool implementations in your host process. When generated code calls an `external_*` tool, the sandbox returns a `need_tools` payload, the host executes the matching `ToolBinding.execute` callbacks, and the driver replays the code with accumulated tool results until it completes.

## Installation

```bash
pnpm add @tanstack/ai-isolate-daytona @tanstack/ai-code-mode
```

If you use the official Daytona SDK to create sandboxes, install it in your app too:

```bash
pnpm add @daytona/sdk
```

## Usage

```typescript
import { Daytona } from '@daytona/sdk'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createDaytonaIsolateDriver } from '@tanstack/ai-isolate-daytona'

const daytona = new Daytona()
const sandbox = await daytona.create({ language: 'typescript' })

const driver = createDaytonaIsolateDriver({
  sandbox,
  timeout: 30_000,
  maxToolRounds: 10,
})

const { tool, systemPrompt } = createCodeMode({
  driver,
  tools: [myServerTool],
})
```

The driver accepts a structural sandbox object with `sandbox.process.codeRun(...)`; it does not require `@daytona/sdk` as a package dependency.

## API

### `createDaytonaIsolateDriver(config)`

Creates an isolate driver that delegates Code Mode execution to a Daytona sandbox.

- `sandbox` (required): caller-owned object with `process.codeRun(code, params?, timeout?)`
- `timeout` (optional): total execution timeout across replay rounds, in milliseconds (default: `30000`)
- `maxToolRounds` (optional): maximum `need_tools` replay rounds per execution (default: `10`)

## Requirements

- The sandbox must support `process.codeRun`.
- Use a sandbox language/runtime that can execute the JavaScript emitted by Code Mode.
- Tool inputs and outputs must be JSON-serializable.
- Sandbox lifecycle, network access, filesystem contents, secrets, and cleanup are owned by your application. Creating a Code Mode context does not create or delete a Daytona sandbox.

## How It Works

```
Host process                         Daytona sandbox
------------                         ---------------
createCodeMode + tools
wrap generated code      --------->  run with process.codeRun
execute host tools       <---------  need_tools requests
replay with toolResults  --------->  continue execution
final result/logs        <---------  done or error envelope
```

Unlike the Cloudflare driver, Daytona does not need a parent Worker / Dynamic Worker split. The host process talks directly to a Daytona sandbox through `process.codeRun`, while tool execution stays host-owned.

## Validation

Run the package checks once the implementation files are present:

```bash
pnpm --filter @tanstack/ai-isolate-daytona test:lib
pnpm --filter @tanstack/ai-isolate-daytona test:types
pnpm --filter @tanstack/ai-isolate-daytona test:eslint
pnpm --filter @tanstack/ai-isolate-daytona build
pnpm --filter @tanstack/ai-isolate-daytona test:build
```

Live Daytona validation should be gated on explicit credentials and sandbox setup in the implementation tests or a local smoke script.

```bash
DAYTONA_LIVE_TEST=1 DAYTONA_API_KEY=... pnpm --filter @tanstack/ai-isolate-daytona test:live
```

The live suite is skipped unless `DAYTONA_LIVE_TEST=1` and `DAYTONA_API_KEY` are both present.
