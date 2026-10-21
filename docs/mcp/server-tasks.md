---
title: MCP Server Tasks
id: server-tasks
order: 13
description: "Let a long MCP tool return a task handle at once, so the host can poll for the result."
keywords:
  - tanstack ai
  - mcp
  - model context protocol
  - mcp server
  - execution
  - task handle
  - createMCPServer
  - inMemoryTaskStore
  - waitUntil
---

Your tool takes minutes, and the HTTP call stays open until the work ends. The host has no task id to poll.

Set `execution: 'task'` on the tool. The call returns a task handle at once, and the host polls for the result.

## Quick setup

You need an MCP server first. If you do not have one, start with [Serve Tools over HTTP](./server). This setup is for one long-lived process, such as a Node server. For a Worker, see [Run tasks on a Worker](#run-tasks-on-a-worker).

1. Set `execution: 'task'` on the tool definition.
2. Return the final value from the tool function.
3. Create the server once, outside the request handler.

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer } from '@tanstack/ai-mcp/server'

const buildReport = toolDefinition({
  name: 'build_report',
  description: 'Build a long report',
  execution: 'task',
}).server(async () => {
  const text = await writeReport()
  return { text }
})

async function writeReport() {
  await new Promise((resolve) => {
    setTimeout(resolve, 5000)
  })
  return 'Quarterly report'
}

const server = createMCPServer({
  name: 'reports',
  version: '1.0.0',
  tools: [buildReport],
})

export function handleMcp(request: Request) {
  return server.fetch(request)
}
```

The host calls `build_report` and gets a task handle at once. After 5 seconds, the status is `completed`, and the host reads `{ text: 'Quarterly report' }` from `structuredContent`.

## How it works

1. The host calls the tool.
2. The handler returns a task handle before the work ends.
3. The tool function continues in this process. There is no queue.
4. When the tool function ends, the task store saves the value.
5. The host polls until the status is `completed` or `failed`.

The default task store keeps each task in memory for this process. A TanStack AI host polls until the task ends. See [MCP Server Tools](../tools/mcp).

## What a task tool can use

The task keeps running after the call returns the task handle. As a result, the task cannot use the request that started it:

- `ctx.context.requestInput` throws an error. Ask for input in a tool without `execution: 'task'`.
- `ctx.context.sample` calls the `sample` option of `createMCPServer`. If you do not pass `sample`, it throws an error.
- `ctx.abortSignal` does not abort when the call request ends.

## Run tasks on a Worker

A Worker can stop when the response is sent. It can also build a new server for each request. Pass two more options:

- `taskStore`: create it once with `inMemoryTaskStore`, outside `fetch`. A new store on each request has no record of the old task.
- `waitUntil`: pass `waitUntil` from the Worker context. Without it, a Worker can stop before the tool function ends.

```ts
import { toolDefinition } from '@tanstack/ai'
import { createMCPServer, inMemoryTaskStore } from '@tanstack/ai-mcp/server'

const taskStore = inMemoryTaskStore()

const buildReport = toolDefinition({
  name: 'build_report',
  description: 'Build a long report',
  execution: 'task',
}).server(async () => {
  const text = await writeReport()
  return { text }
})

async function writeReport() {
  await new Promise((resolve) => {
    setTimeout(resolve, 5000)
  })
  return 'Quarterly report'
}

export default {
  async fetch(
    request: Request,
    _env: unknown,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const server = createMCPServer({
      name: 'reports',
      version: '1.0.0',
      tools: [buildReport],
      taskStore,
      waitUntil: (promise) => ctx.waitUntil(promise),
    })
    return server.fetch(request)
  },
}
```

The server calls `waitUntil` with the tool promise. This promise settles after the store saves the tool result or the tool error.

## Advanced

### Share the store across instances

If more than one instance can receive `tasks/get`, pass a `taskStore` that those instances share. A task store has three methods:

- `get`: read one task by id. Return `null` when the id is absent.
- `set`: save one task.
- `delete`: remove one task.

`@tanstack/ai-mcp/server` exports `inMemoryTaskStore` and the `TaskStore` type.

### Spec 2025 and spec 2026

Tasks are part of spec `2025-11-25`. Spec `2026-07-28` has no tasks yet.

| Spec | What the call returns |
| --- | --- |
| `2025-11-25` | A task handle. The host polls `tasks/get`, then reads `tasks/result`. |
| `2026-07-28` | The tool result. The tool runs inline, and the call waits for it. |

On spec 2025, the server sets `execution.taskSupport` to `required`. It also advertises the `tasks` capability for `tools/call`.

### The task handle

On spec 2025, the call response is the `CreateTaskResult` from the spec. The `task` field is a `Task` with status `working`.

```json
{
  "content": [{ "type": "text", "text": "task-id" }],
  "task": {
    "taskId": "task-id",
    "status": "working",
    "ttl": null,
    "createdAt": "2026-09-22T12:00:00.000Z",
    "lastUpdatedAt": "2026-09-22T12:00:00.000Z"
  }
}
```

`tasks/get` returns the same `Task` fields:

| Field | Value |
| --- | --- |
| `taskId` | The id from the call. |
| `status` | `working`, `completed`, or `failed`. |
| `ttl` | `null`. |
| `createdAt` | The time of the first `set`. |
| `lastUpdatedAt` | The time of the last `set`. |
| `statusMessage` | The error text, when the status is `failed`. |

### Task status

| Status | Meaning |
| --- | --- |
| `working` | The tool function is still at work. |
| `completed` | The store holds the tool result. |
| `failed` | The tool function threw an error. |

If the tool function throws, the task keeps the text of that error in `statusMessage`. If that error has no text, the task keeps `The tool failed.`

### Read the result

`tasks/result` wraps the value as `content`. When the value is an object, `tasks/result` also returns `structuredContent`.

Errors:

- If the status is not `completed`, `tasks/result` returns the error `Task result is not ready`.
- An unknown task id on `tasks/get` returns the error `Task not found`.
- When the server has `auth`, a task belongs to the caller that started it: the `clientId` of the token plus its `sub` claim. Another caller also gets `Task not found`. [MCP Server Auth](./server-auth) shows how the verifier sets these values.
