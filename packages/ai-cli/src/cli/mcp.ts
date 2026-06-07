import { spawn } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { COMMANDS } from '../manifest/manifest'

/**
 * `ts-ai mcp` — expose each generation command as an MCP tool over stdio.
 *
 * Each tool call re-invokes the `ts-ai` binary as a subprocess with `--json`
 * and an inline `--config` blob, then returns the parsed JSON. Shelling out to
 * ourselves keeps the JSON-RPC stdio channel cleanly separated from the
 * command's own stdout payload and reuses the entire option/precedence
 * pipeline without duplicating logic.
 */
export async function runMcpServer(cliVersion: string): Promise<void> {
  const server = new McpServer({ name: 'ts-ai', version: cliVersion })
  // The real CLI entry (bin.js), not this lazily-imported chunk's own path.
  const binPath = process.argv[1] ?? ''

  for (const spec of COMMANDS) {
    server.registerTool(
      spec.name,
      {
        title: spec.name,
        description: spec.description,
        inputSchema: {
          prompt: z
            .string()
            .optional()
            .describe('Prompt / input text for the command.'),
          options: z
            .record(z.string(), z.any())
            .optional()
            .describe('Command options (model, size, etc.) as a JSON object.'),
        },
      },
      async (args: { prompt?: string; options?: Record<string, unknown> }) => {
        const result = await invokeSelf(binPath, spec.name, args)
        return { content: [{ type: 'text' as const, text: result }] }
      },
    )
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

function invokeSelf(
  binPath: string,
  command: string,
  args: { prompt?: string; options?: Record<string, unknown> },
): Promise<string> {
  // Options first, then a `--` end-of-options terminator before the untrusted
  // prompt so an MCP client can't smuggle flags (e.g. a prompt starting with
  // `--api-key`) into the spawned CLI. commander treats everything after `--`
  // as positional operands.
  const argv = [binPath, command, '--json']
  if (args.options && Object.keys(args.options).length > 0) {
    argv.push('--config', JSON.stringify(args.options))
  }
  if (args.prompt) argv.push('--', args.prompt)

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', (code) => {
      // Non-zero still returns the structured error JSON on stdout; pass it
      // through so the MCP client sees a parseable result either way.
      resolve(stdout.trim() || stderr.trim() || `exit ${code}`)
    })
  })
}
