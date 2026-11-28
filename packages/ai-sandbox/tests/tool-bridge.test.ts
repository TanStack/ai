/**
 * Verifies the host-side MCP tool-proxy bridge using the MCP SDK's own HTTP
 * client (no `claude` needed): list tools + call a tool, asserting the host
 * `execute()` runs and the result comes back, plus bearer-token enforcement.
 */
import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { EventType, defineActivityType } from '@tanstack/ai'
import { createBridgeEventChannel } from '../src/bridge-events'
import {
  createToolBridgeCore,
  hostForSandbox,
  startHostToolBridge,
} from '../src/tool-bridge'
import type { HostToolBridge } from '../src/tool-bridge'
import type {
  AnyTool,
  StandardSchemaV1,
  StreamChunk,
  ToolExecutionContext,
} from '@tanstack/ai'

let bridge: HostToolBridge | undefined

afterEach(async () => {
  if (bridge) await bridge.close()
  bridge = undefined
})

function tool(
  name: string,
  execute: (args: unknown, ctx?: ToolExecutionContext) => unknown,
): AnyTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

describe('startHostToolBridge', () => {
  it('rejects when the listener cannot start', async () => {
    await expect(
      startHostToolBridge([], {
        hostForSandbox: '127.0.0.1',
        threadId: 'thread-1',
        bindAddress: 'not a valid host',
      }),
    ).rejects.toMatchObject({ code: 'ENOTFOUND' })
  })

  it('serves chat() tools over MCP and proxies calls to the host', async () => {
    let calledWith: unknown
    bridge = await startHostToolBridge(
      [
        tool('getTime', (args) => {
          calledWith = args
          return 'high noon'
        }),
      ],
      { hostForSandbox: '127.0.0.1', threadId: 'thread-1' },
    )

    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
      requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
    })
    await client.connect(transport)

    const list = await client.listTools()
    expect(list.tools.map((t) => t.name)).toContain('getTime')

    const result = await client.callTool({
      name: 'getTime',
      arguments: { tz: 'utc' },
    })
    expect(calledWith).toEqual({ tz: 'utc' })
    expect(JSON.stringify(result.content)).toContain('high noon')

    await client.close()
  })

  it('reports tool execution errors as MCP tool errors', async () => {
    bridge = await startHostToolBridge(
      [
        tool('boom', () => {
          throw new Error('kaboom')
        }),
      ],
      { hostForSandbox: '127.0.0.1', threadId: 'thread-1' },
    )
    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url), {
      requestInit: { headers: { Authorization: `Bearer ${bridge.token}` } },
    })
    await client.connect(transport)
    const result = await client.callTool({ name: 'boom', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('kaboom')
    await client.close()
  })

  it('rejects requests without the bearer token', async () => {
    bridge = await startHostToolBridge([tool('noop', () => 'ok')], {
      hostForSandbox: '127.0.0.1',
      threadId: 'thread-1',
    })
    const client = new Client({ name: 'test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(bridge.url))
    await expect(client.connect(transport)).rejects.toThrow()
    await client.close().catch(() => {})
  })

  it('closes while a request is still open', async () => {
    const open = await startHostToolBridge([], {
      hostForSandbox: '127.0.0.1',
      threadId: 'thread-1',
    })
    // Send headers and part of a body, then never finish the request.
    const req = request(open.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${open.token}` },
    })
    req.on('error', () => {})
    req.write('{')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await open.close()
  })
})

describe('hostForSandbox', () => {
  it('uses host.docker.internal for docker and sbx', () => {
    expect(hostForSandbox('docker')).toBe('host.docker.internal')
    expect(hostForSandbox('sbx')).toBe('host.docker.internal')
  })

  it('uses loopback for other providers', () => {
    expect(hostForSandbox('local-process')).toBe('127.0.0.1')
    expect(hostForSandbox('daytona')).toBe('127.0.0.1')
  })
})

/** Rejects at once without a signal. With one, waits until it aborts. */
function waitForAbortTool() {
  return tool('slow', (_args, ctx) => {
    const signal = ctx?.abortSignal
    if (!signal) return Promise.reject(new Error('no signal'))
    return new Promise((resolve) => {
      signal.addEventListener('abort', () => resolve('stopped'), {
        once: true,
      })
    })
  })
}

describe('createToolBridgeCore call signal', () => {
  it('stops the tool when the call signal aborts', async () => {
    const core = createToolBridgeCore([waitForAbortTool()], {
      threadId: 't',
    })
    const controller = new AbortController()
    const pending = core.callTool('slow', {}, { signal: controller.signal })
    controller.abort()
    await expect(pending).resolves.toEqual({
      content: [{ type: 'text', text: 'stopped' }],
    })
  })

  it('still stops the tool when the bridge signal aborts', async () => {
    const run = new AbortController()
    const core = createToolBridgeCore([waitForAbortTool()], {
      threadId: 't',
      signal: run.signal,
    })
    const call = new AbortController()
    const pending = core.callTool('slow', {}, { signal: call.signal })
    run.abort()
    await expect(pending).resolves.toEqual({
      content: [{ type: 'text', text: 'stopped' }],
    })
  })

  it('passes no signal when neither the bridge nor the call has one', async () => {
    const core = createToolBridgeCore([waitForAbortTool()], { threadId: 't' })
    await expect(core.callTool('slow', {})).resolves.toMatchObject({
      isError: true,
    })
  })

  it('aborts the tool when the agent closes the tools/call request', async () => {
    let started!: () => void
    const running = new Promise<void>((resolve) => (started = resolve))
    let stopped!: () => void
    const aborted = new Promise<void>((resolve) => (stopped = resolve))
    bridge = await startHostToolBridge(
      [
        tool(
          'cancelMe',
          (_args: unknown, ctx?: { abortSignal?: AbortSignal }) => {
            started()
            return new Promise(() => {
              ctx?.abortSignal?.addEventListener('abort', () => stopped())
            })
          },
        ),
      ],
      { hostForSandbox: '127.0.0.1', threadId: 'thread-1' },
    )
    // The bridge is stateless: one server per HTTP request. Closing the
    // request ends that server, which aborts the running call.
    const req = request(bridge.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bridge.token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
    })
    req.on('error', () => {})
    req.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'cancelMe', arguments: {} },
      }),
    )
    await running
    req.destroy()
    await aborted
  })
})

type DeployProgress = { step: number; total: number }

function isDeployProgress(value: unknown): value is DeployProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    'step' in value &&
    typeof value.step === 'number' &&
    'total' in value &&
    typeof value.total === 'number'
  )
}

/** Like `z.object({ step: z.number().min(1), total: z.number() })`. */
const deployProgressSchema: StandardSchemaV1<DeployProgress> = {
  '~standard': {
    version: 1,
    vendor: 'tool-bridge-test',
    validate: (value) =>
      isDeployProgress(value) && value.step >= 1
        ? { value }
        : { issues: [{ message: 'step must be 1 or more' }] },
  },
}

const deployProgress = defineActivityType({
  activityType: 'deploy.progress',
  contentSchema: deployProgressSchema,
})

/**
 * Call a bridged `deploy` tool that emits `content` as the activity
 * `deploy-1`. Give back the call result and the chunks of the event channel.
 */
async function callDeployTool(content: DeployProgress) {
  const channel = createBridgeEventChannel({
    model: 'test-model',
    threadId: 'thread-1',
    runId: 'run-1',
  })
  const core = createToolBridgeCore(
    [
      tool('deploy', (_args, ctx) => {
        ctx?.emitActivity?.(deployProgress, 'deploy-1', content)
        return 'deployed'
      }),
    ],
    { threadId: 'thread-1', emitActivity: channel.emitActivity },
  )
  const result = await core.callTool('deploy', {})
  channel.close()
  const chunks: Array<StreamChunk> = []
  for await (const chunk of channel.stream) chunks.push(chunk)
  return { result, chunks }
}

describe('createToolBridgeCore emitActivity', () => {
  it('puts the activity of a bridged tool on the event channel stream', async () => {
    const { result, chunks } = await callDeployTool({ step: 1, total: 3 })

    expect(result).toEqual({ content: [{ type: 'text', text: 'deployed' }] })
    expect(chunks).toEqual([
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId: 'deploy-1',
        activityType: 'deploy.progress',
        content: { step: 1, total: 3 },
        replace: true,
        timestamp: expect.any(Number),
        metadata: {
          tanstack: {
            model: 'test-model',
            threadId: 'thread-1',
            runId: 'run-1',
          },
        },
      },
    ])
  })

  it('throws in the tool when the content fails the schema check', async () => {
    const { result, chunks } = await callDeployTool({ step: 0, total: 3 })

    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: 'text',
          text: expect.stringContaining(
            "Content check failed for activity type 'deploy.progress'",
          ),
        },
      ],
    })
    expect(chunks).toEqual([])
  })
})
