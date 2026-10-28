import { ProtocolError } from '@modelcontextprotocol/client'
import { MCPEventRequestError } from '../errors'
import type { MCPEventRequestKind } from '../errors'
import { isRecord } from './value'

const KIND_BY_CODE: Record<number, MCPEventRequestKind> = {
  [-32602]: 'invalid-params',
  [-32023]: 'not-found',
  [-32024]: 'forbidden',
  [-32025]: 'resource-exhausted',
  [-32026]: 'unsupported',
  [-32027]: 'callback-endpoint',
}

function redactData(data: unknown): unknown {
  if (!isRecord(data)) return data
  const { secret: _secret, ...rest } = data
  return rest
}

function looksLikeSecret(text: string): boolean {
  return text.includes('whsec_')
}

/**
 * Map a ProtocolError from an `events/*` call to `MCPEventRequestError`.
 * Other values pass through unchanged.
 */
export function toMCPEventRequestError(err: unknown): unknown {
  if (!(err instanceof ProtocolError)) return err
  const kind = KIND_BY_CODE[err.code] ?? 'unknown'
  const data = redactData(err.data)
  const reason =
    isRecord(err.data) && typeof err.data.reason === 'string'
      ? err.data.reason
      : undefined
  const rawMessage = err.message
  const message = looksLikeSecret(rawMessage)
    ? `MCP events request failed (${kind})`
    : rawMessage
  return new MCPEventRequestError(message, err.code, kind, reason, data, err)
}

export function isMethodNotFound(err: unknown): boolean {
  return err instanceof ProtocolError && err.code === -32601
}
