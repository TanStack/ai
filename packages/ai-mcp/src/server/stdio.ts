import {
  PROTOCOL_VERSION_META_KEY,
  isJSONRPCRequest,
  parseJSONRPCMessage,
} from '@modelcontextprotocol/server'
import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'

const mcpUrl = 'http://127.0.0.1/mcp'
const spec2026 = '2026-07-28'
const base64Prefix = '=?base64?'
const base64Suffix = '?='

/**
 * Serves one MCP server on stdin and stdout.
 *
 * `server` is the object that `createMCPServer` returns.
 * A host starts this process and sends JSON-RPC on stdin.
 * This function sends each message to `server.fetch`.
 * Then it writes each JSON-RPC answer on stdout.
 * stdout carries only protocol messages. Write logs with `console.error`.
 *
 * Call `close()` on the result to stop reading stdin.
 *
 * @param server - The server from `createMCPServer`
 *
 * @example
 * ```ts
 * const server = createMCPServer({
 *   name: 'weather',
 *   version: '1.0.0',
 *   tools: [getWeather],
 * })
 *
 * const handle = serveMCPStdio(server)
 * ```
 */
export function serveMCPStdio(server: {
  fetch: (request: Request) => Promise<Response>
}) {
  const transport = new StdioServerTransport()
  const aborts = new Set<AbortController>()
  let sessionId: string | undefined
  let legacyProtocol: string | undefined
  let legacyStream = false
  let closed = false
  let tail = Promise.resolve()
  const sideMessages = new Set<Promise<void>>()

  async function forward(message: unknown) {
    if (closed) return
    const controller = new AbortController()
    aborts.add(controller)
    try {
      const headers = new Headers({
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      })
      applyProtocolHeaders(headers, message, sessionId, legacyProtocol)
      const response = await server.fetch(
        new Request(mcpUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(message),
          signal: controller.signal,
        }),
      )
      if (closed) return
      sessionId = nextSessionId(response, sessionId)
      legacyProtocol = nextLegacyProtocol(response, legacyProtocol)
      const text = await response.text()
      if (closed) return
      if (legacyProtocol === undefined) {
        const version = protocolVersionFromBody(
          response.headers.get('content-type'),
          text,
        )
        if (version !== undefined && !isModernVersion(version)) {
          legacyProtocol = version
        }
      }
      await ensureLegacyStream()
      if (closed) return
      const contentType = response.headers.get('content-type')
      // A 401 or a 404 can carry no JSON-RPC body, or an OAuth error body.
      // The host still needs an answer to its request, or it waits until
      // its own timeout.
      const outbound = response.ok
        ? messagesFromBody(contentType, text)
        : errorMessagesFromBody(contentType, text)
      if (outbound.length === 0 && !response.ok) {
        await sendFailure(
          transport,
          message,
          `The MCP server answered HTTP ${response.status}.`,
        )
        return
      }
      for (const outboundMessage of outbound) {
        await transport.send(outboundMessage)
      }
    } catch (error) {
      if (closed || controller.signal.aborted) return
      console.error(errorText(error))
      await sendFailure(transport, message)
    } finally {
      aborts.delete(controller)
    }
  }

  transport.onmessage = (message) => {
    // A spec 2025 tool can wait inside server.fetch for the client answer.
    // That answer, and notifications/cancelled, must not wait behind the tool.
    if (isJSONRPCRequest(message)) {
      tail = tail
        .then(() => forward(message))
        .catch((error) => {
          console.error(errorText(error))
        })
      return
    }
    const run = forward(message).catch((error) => {
      console.error(errorText(error))
    })
    sideMessages.add(run)
    void run.finally(() => {
      sideMessages.delete(run)
    })
  }
  transport.onerror = (error) => {
    console.error(error.message)
  }

  async function ensureLegacyStream() {
    if (legacyStream || closed) return
    if (sessionId === undefined || legacyProtocol === undefined) return
    if (isModernVersion(legacyProtocol)) return
    legacyStream = true
    const controller = new AbortController()
    aborts.add(controller)
    const headers = new Headers({
      accept: 'text/event-stream',
      'mcp-session-id': sessionId,
      'mcp-protocol-version': legacyProtocol,
    })
    // A failed or ended stream resets the flag, so the next message opens
    // a new one. The failure must not replace the answer being forwarded.
    const stopStream = () => {
      legacyStream = false
      aborts.delete(controller)
    }
    let response: Response
    try {
      response = await server.fetch(
        new Request(mcpUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        }),
      )
    } catch (error) {
      stopStream()
      if (!closed) console.error(errorText(error))
      return
    }
    if (!response.ok || response.body === null) {
      stopStream()
      console.error(`MCP stdio legacy stream failed: ${response.status}`)
      return
    }
    void pumpLegacyStream(response.body, controller).finally(stopStream)
  }

  async function pumpLegacyStream(
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
  ) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    try {
      while (!controller.signal.aborted) {
        const read = await reader.read()
        if (read.done) return
        pending += decoder.decode(read.value, { stream: true })
        const events = pending.split('\n\n')
        pending = events.pop() ?? ''
        for (const event of events) {
          const messages = sseMessages(`${event}\n\n`)
          for (const message of messages) {
            await transport.send(message)
          }
        }
      }
    } catch (error) {
      if (closed || controller.signal.aborted) return
      console.error(errorText(error))
    }
  }

  const started = transport.start()
  started.catch((error) => {
    console.error(errorText(error))
  })

  const onStdinEnd = () => {
    void close()
  }
  process.stdin.on('end', onStdinEnd)

  async function close() {
    if (closed) return
    closed = true
    process.stdin.off('end', onStdinEnd)
    const pending = [...aborts]
    for (const controller of pending) {
      controller.abort()
    }
    aborts.clear()
    try {
      await started
    } catch {
      // start() already wrote this error to stderr.
    }
    await tail.catch(() => undefined)
    await Promise.all([...sideMessages])
    await transport.close()
  }

  return { close }
}

function applyProtocolHeaders(
  headers: Headers,
  message: unknown,
  sessionId: string | undefined,
  legacyProtocol: string | undefined,
) {
  const version = envelopeVersion(message)
  const hasModernEnvelope = version !== undefined && isModernVersion(version)
  // Spec 2026 rejects a request when Mcp-Method is missing or does not match the body.
  if (
    version !== undefined &&
    isModernVersion(version) &&
    isJSONRPCRequest(message)
  ) {
    headers.set('mcp-protocol-version', version)
    headers.set('mcp-method', message.method)
    const name = mirroredName(message.method, message.params)
    if (name !== undefined) headers.set('mcp-name', encodeHeaderValue(name))
  }
  // A 2026 header on a claim-less body is rejected. Resend only a 2025 version.
  if (
    !hasModernEnvelope &&
    legacyProtocol !== undefined &&
    !isModernVersion(legacyProtocol)
  ) {
    headers.set('mcp-protocol-version', legacyProtocol)
  }
  const isInitialize =
    isJSONRPCRequest(message) && message.method === 'initialize'
  if (!isInitialize && sessionId !== undefined && sessionId.length > 0) {
    headers.set('mcp-session-id', sessionId)
  }
}

function nextSessionId(response: Response, current: string | undefined) {
  const headerSession = response.headers.get('mcp-session-id')
  if (headerSession !== null && headerSession.length > 0) return headerSession
  return current
}

function protocolVersionFromBody(contentType: string | null, text: string) {
  let messages: Array<unknown>
  try {
    messages = messagesFromBody(contentType, text)
  } catch {
    return undefined
  }
  for (const message of messages) {
    if (!isRecord(message) || !isRecord(message.result)) continue
    const version = message.result.protocolVersion
    if (typeof version === 'string' && version.length > 0) return version
  }
  return undefined
}

function nextLegacyProtocol(response: Response, current: string | undefined) {
  const headerProtocol = response.headers.get('mcp-protocol-version')
  if (headerProtocol !== null && !isModernVersion(headerProtocol))
    return headerProtocol
  return current
}

function envelopeVersion(message: unknown) {
  if (!isRecord(message) || !isRecord(message.params)) return undefined
  const meta = message.params._meta
  if (!isRecord(meta)) return undefined
  const version = meta[PROTOCOL_VERSION_META_KEY]
  return typeof version === 'string' ? version : undefined
}

function isModernVersion(version: string) {
  return version >= spec2026
}

function mirroredName(method: string, params: unknown) {
  if (!isRecord(params)) return undefined
  switch (method) {
    case 'tools/call':
    case 'prompts/get':
      return typeof params.name === 'string' ? params.name : undefined
    case 'resources/read':
      return typeof params.uri === 'string' ? params.uri : undefined
    default:
      return undefined
  }
}

function messagesFromBody(contentType: string | null, text: string) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  const type = mediaType(contentType)
  const isEventStream =
    type === 'text/event-stream' ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('event:')
  if (isEventStream) return sseMessages(text)
  return jsonMessages(trimmed)
}

// An error response body is JSON-RPC only when the server wrote one.
function errorMessagesFromBody(contentType: string | null, text: string) {
  try {
    return messagesFromBody(contentType, text)
  } catch {
    return []
  }
}

function jsonMessages(text: string) {
  const parsed: unknown = JSON.parse(text)
  const values = Array.isArray(parsed) ? parsed : [parsed]
  const messages: Array<JSONRPCMessage> = []
  for (const value of values) {
    messages.push(parseJSONRPCMessage(value))
  }
  return messages
}

function sseMessages(text: string) {
  const messages: Array<JSONRPCMessage> = []
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  let dataLines: Array<string> = []

  function flush() {
    if (dataLines.length === 0) return
    const payload = dataLines.join('\n').trim()
    dataLines = []
    if (payload.length === 0) return
    messages.push(parseJSONRPCMessage(JSON.parse(payload)))
  }

  for (const line of lines) {
    if (line.length === 0) {
      flush()
      continue
    }
    if (!line.startsWith('data:')) continue
    const raw = line.slice('data:'.length)
    const value = raw.startsWith(' ') ? raw.slice(1) : raw
    dataLines.push(value)
  }
  flush()
  return messages
}

function mediaType(header: string | null) {
  if (header === null) return undefined
  const essence = header.split(';')[0]
  if (essence === undefined) return undefined
  return essence.trim().toLowerCase()
}

async function sendFailure(
  transport: StdioServerTransport,
  message: unknown,
  text = 'Internal server error',
) {
  if (!isJSONRPCRequest(message)) return
  await transport.send(
    parseJSONRPCMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: text },
    }),
  )
}

function encodeHeaderValue(value: string) {
  if (!needsBase64(value)) return value
  return `${base64Prefix}${utf8ToBase64(value)}${base64Suffix}`
}

function needsBase64(value: string) {
  if (value.length === 0) return true
  const looksLikeSentinel =
    value.startsWith(base64Prefix) && value.endsWith(base64Suffix)
  if (looksLikeSentinel) return true
  if (value !== value.trim()) return true
  const chars = [...value]
  for (const char of chars) {
    const code = char.codePointAt(0)
    if (code === undefined) return true
    const isTab = code === 9
    const isPrintable = code >= 32 && code <= 126
    if (!isTab && !isPrintable) return true
  }
  return false
}

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  const byteList = [...bytes]
  for (const byte of byteList) {
    binary += String.fromCodePoint(byte)
  }
  return btoa(binary)
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The stdio server failed to answer.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
