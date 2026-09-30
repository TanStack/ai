<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-isolate-e2b

E2B sandbox driver for TanStack AI Code Mode.

Run the TypeScript that the model writes in an E2B sandbox, while your tools stay on your server. Each execution is one `node` process. When the code calls a tool, the call goes to your server, and the result goes back to the same process. The code runs once, from start to finish.

## Installation

```bash
pnpm add @tanstack/ai-isolate-e2b @tanstack/ai-code-mode e2b
```

## Usage

1. Set `E2B_API_KEY` in your server environment.
2. Create a sandbox and pass it to the driver:

```typescript
import { Sandbox } from 'e2b'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createE2BIsolateDriver } from '@tanstack/ai-isolate-e2b'

const sandbox = await Sandbox.create()

const { tool, systemPrompt } = createCodeMode({
  driver: createE2BIsolateDriver({ sandbox }),
  tools: [myServerTool],
})
```

3. Give `tool` and `systemPrompt` to `chat()`. The model can now run code in the sandbox.

The driver accepts any object with the `files` and `commands` shape of an E2B `Sandbox`. A sandbox from `@e2b/code-interpreter` also works.

## Options

- `sandbox` (required): the E2B sandbox that runs the code.
- `timeout` (optional): maximum time for one execution, tool calls included, in milliseconds. The default is `30000`.

The `memoryLimit` of `createCodeMode` sets the heap limit of the `node` process.

## What your application owns

- **The sandbox.** The driver does not create, pause, or kill it. Kill it when you are done.
- **Who shares it.** Executions in one sandbox see the same files and network. Use one sandbox for each user or trusted scope.
- **Secrets.** The driver sends no API key or server environment into the sandbox.

## What the driver does

- It kills the process group on timeout, on `dispose()`, and after each execution. This includes processes that the code started, unless they moved to a process group of their own (`detached: true`).
- If it cannot confirm that kill after an execution, `dispose()` throws.
- It returns an error name that tells you what happened:

| Error name                   | Meaning                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `TimeoutError`               | The execution ran longer than `timeout`.                                     |
| `MemoryLimitError`           | The code used more memory than `memoryLimit`.                                |
| `OutputLimitError`           | The code wrote more than 8 MB to stdout and stderr.                          |
| `E2BSandboxUnavailableError` | The sandbox is killed, expired, or paused.                                   |
| `E2BExecutionError`          | The process did not start, stopped without a result, or lost its connection. |

The sandbox template must have `node`, `setsid`, and `timeout`. The default E2B templates have them.

## How it works

```text
Your server                          E2B sandbox
-----------                          -----------
start one node process    --------->  run the generated code
                          <---------  tool call (stdout)
run the tool
send the result (stdin)   --------->  continue from the same point
                          <---------  final result
```

## Tests

```bash
pnpm --filter @tanstack/ai-isolate-e2b test:lib
```

The live tests run only when `E2B_API_KEY` is set:

```bash
E2B_API_KEY=... pnpm --filter @tanstack/ai-isolate-e2b test:live
```
