import {
  StreamProcessor,
  chat,
  maxIterations,
  modelMessagesToUIMessages,
} from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitEvent, emitJson } from '../../core/emit'
import { CliError } from '../../core/exit-codes'
import { loadJsonInput } from '../../core/config'
import { loadAttachments } from '../../core/io'
import { resolveAdapterContext, withSpinner } from '../context'
import { renderText } from '../../render/lazy'
import { buildMcpClients } from '../mcp-clients'
import { buildCodeMode } from '../code-mode'
import type { McpClientLike } from '../mcp-clients'
import type { RunContext } from '../context'

interface ModelMessageLike {
  role: string
  content: unknown
}

/**
 * `ts-ai chat` handler — stateless one-shot or `--stream`.
 *
 * History is supplied via `--messages` (a JSON array); nothing is persisted.
 * `--thread-id` is accepted purely as a passthrough correlation id. Tools come
 * from `--mcp` servers; `--code-mode` wraps those tools in a sandboxed
 * `execute_typescript` tool.
 */
export async function runChat(ctx: RunContext, prompt: string): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } =
    resolveAdapterContext(ctx.options)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'chat',
    apiKey,
    config: adapterConfig,
  })

  const messages = await buildMessages(ctx, prompt)
  const systemPrompts = resolveSystem(ctx)
  // --schema accepts a file path / inline JSON string (CLI flag) OR an already
  // parsed object (supplied via --config or the MCP `options` bag).
  const schemaInput = ctx.options.schema
  const schema =
    typeof schemaInput === 'string' && schemaInput
      ? await loadJsonInput(schemaInput, '--schema')
      : typeof schemaInput === 'object' && schemaInput !== null
        ? (schemaInput as Record<string, unknown>)
        : undefined
  const maxSteps =
    typeof ctx.options.maxSteps === 'number'
      ? ctx.options.maxSteps
      : typeof ctx.options.maxSteps === 'string'
        ? Number(ctx.options.maxSteps)
        : undefined
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1)) {
    throw new CliError('USAGE', '--max-steps must be a positive integer.')
  }

  // Resolve tools from MCP servers, optionally wrapped in Code Mode.
  const mcpSpecs = Array.isArray(ctx.options.mcp)
    ? (ctx.options.mcp as Array<string>)
    : []
  const useCodeMode = Boolean(ctx.options.codeMode)
  const clients = await buildMcpClients(mcpSpecs)

  let tools: Array<unknown> | undefined
  let mcp: { clients: Array<McpClientLike> } | undefined
  const extraSystem: Array<string> = []

  try {
    if (useCodeMode) {
      const discovered = (
        await Promise.all(clients.map((c) => c.tools()))
      ).flat()
      const wiring = await buildCodeMode(discovered)
      tools = [wiring.tool]
      extraSystem.push(wiring.systemPrompt)
    } else if (clients.length > 0) {
      mcp = { clients }
    }

    const base = {
      adapter: adapter as never,
      messages: messages as never,
      systemPrompts: [...(systemPrompts ?? []), ...extraSystem] as never,
      modelOptions: modelOptions as never,
      // The CLI owns all output; silence the library's internal logger so it
      // never writes to stdout/stderr behind our back.
      debug: false as never,
      ...(tools ? { tools: tools as never } : {}),
      ...(mcp ? { mcp: mcp as never } : {}),
      ...(maxSteps !== undefined
        ? { agentLoopStrategy: maxIterations(maxSteps) }
        : {}),
    }

    const thinking = `Thinking with ${resolved.provider}/${resolved.model}…`

    // Structured output: schema-bearing call resolves to the validated object.
    if (schema !== undefined) {
      const data = await withSpinner(
        ctx,
        thinking,
        () => chat({ ...base, outputSchema: schema as never }) as Promise<unknown>,
      )
      if (ctx.mode === 'pretty') {
        await renderText(JSON.stringify(data, null, 2))
        return
      }
      emitJson({ data, model: resolved.model })
      return
    }

    if (ctx.mode === 'stream') {
      const stream = chat({ ...base, stream: true }) as AsyncIterable<unknown>
      for await (const event of stream) {
        emitEvent(event)
      }
      return
    }

    // Buffered: accumulate the stream into a rich envelope via StreamProcessor.
    const processor = new StreamProcessor()
    processor.setMessages(modelMessagesToUIMessages(messages as never))
    const result = await withSpinner(ctx, thinking, () =>
      processor.process(chat({ ...base, stream: true }) as AsyncIterable<never>),
    )

    if (ctx.mode === 'pretty') {
      await renderText(result.content || '(no text response)')
      return
    }
    emitJson({
      text: result.content,
      ...(result.thinking ? { thinking: result.thinking } : {}),
      ...(result.toolCalls ? { toolCalls: result.toolCalls } : {}),
      finishReason: result.finishReason ?? null,
      messages: processor.toModelMessages(),
      model: resolved.model,
    })
  } finally {
    // When Code Mode owns the tools we passed (mcp not handed to chat), close
    // the MCP connections ourselves; otherwise chat() closes them.
    if (useCodeMode) {
      await Promise.all(clients.map((c) => c.close().catch(() => undefined)))
    }
  }
}

async function buildMessages(
  ctx: RunContext,
  prompt: string,
): Promise<Array<ModelMessageLike>> {
  const history = parseMessages(ctx.options.messages)
  const attachmentPaths = Array.isArray(ctx.options.attachment)
    ? (ctx.options.attachment as Array<string>)
    : []

  if (!prompt && history.length === 0) {
    throw new CliError('USAGE', 'Provide a prompt or --messages.')
  }
  if (!prompt) return history

  if (attachmentPaths.length === 0) {
    return [...history, { role: 'user', content: prompt }]
  }

  const attachments = await loadAttachments(attachmentPaths)
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }]
  for (const att of attachments) {
    const kind = att.mimeType.startsWith('image/') ? 'image' : 'file'
    parts.push({ type: kind, mimeType: att.mimeType, data: att.data })
  }
  return [...history, { role: 'user', content: parts }]
}

function parseMessages(value: unknown): Array<ModelMessageLike> {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new CliError('USAGE', '--messages must be a JSON array of messages.')
  }
  for (const m of value) {
    if (
      typeof m !== 'object' ||
      m === null ||
      typeof (m as { role?: unknown }).role !== 'string' ||
      !('content' in (m as Record<string, unknown>))
    ) {
      throw new CliError(
        'USAGE',
        '--messages entries must be objects with a string "role" and a "content" field.',
      )
    }
  }
  return value as Array<ModelMessageLike>
}

function resolveSystem(ctx: RunContext): Array<string> | undefined {
  const system = ctx.options.system
  return typeof system === 'string' && system ? [system] : undefined
}
