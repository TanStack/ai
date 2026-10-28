import { stdioTransport } from '@tanstack/ai-mcp/stdio'
import type { Transport } from '@tanstack/ai-mcp'

/**
 * Keyless official MCP reference servers (run via npx -y; no API keys needed).
 * Each factory returns a fresh Transport instance — transports are single-use
 * and must not be shared across requests or reused after close().
 */

/** @modelcontextprotocol/server-everything — demo tools, resources, and prompts. */
export const everythingTransport = (): Transport =>
  stdioTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
  })

/** @modelcontextprotocol/server-memory — persistent knowledge-graph memory tool. */
export const memoryTransport = (): Transport =>
  stdioTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  })

/** @modelcontextprotocol/server-sequential-thinking — step-by-step reasoning tool. */
export const sequentialThinkingTransport = (): Transport =>
  stdioTransport({
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  })
