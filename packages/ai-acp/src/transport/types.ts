import type { ndJsonStream } from '@agentclientprotocol/sdk'
import type { SpawnHandle } from '@tanstack/ai-sandbox'

/** How JSON-RPC messages are framed on the wire. */
export type AcpMessageFraming = 'ndjson' | 'frame'

/**
 * Byte-level duplex transport consumed by {@link ndJsonStream} for stdio
 * harnesses.
 */
export interface AcpByteTransport {
  writable: WritableStream<Uint8Array>
  readable: ReadableStream<Uint8Array>
  /** Resolves (throws) when the underlying connection exits unexpectedly. */
  exited: Promise<never>
  /** Last bytes of stderr, for error messages. */
  stderrTail: () => string
  kill: () => Promise<void>
}

/** Parsed JSON-RPC object streams passed to {@link ClientSideConnection}. */
export type AcpJsonRpcStream = ReturnType<typeof ndJsonStream>

export type AcpSessionTransport =
  | { kind: 'stdio'; process: SpawnHandle }
  | {
      kind: 'stream'
      stream: AcpJsonRpcStream
      dispose: () => Promise<void>
      stderrTail?: () => string
    }

export type AcpTransportPreference = 'auto' | 'stdio' | 'websocket'