import { parseArgs } from 'node:util'

export interface CliArgs {
  help: boolean
  print?: string
  output: 'text' | 'ndjson'
  acp: boolean
  serve: boolean
  port: number
  hostname: string
  token?: string
  thread: string
}

export const USAGE = `Usage: <your-cli> [options]

With no options, starts the interactive UI.

Options:
  -p, --print <prompt>   Run one prompt, print the answer, and exit
      --output <format>  Print format for --print: text (default) or ndjson
      --acp              Serve the harness as an ACP v2 agent over stdio
      --serve            Serve the session protocol over HTTP
      --port <port>      Port for --serve (default 8787)
      --host <name>      Host name for --serve (default 127.0.0.1)
      --token <token>    Bearer token for --serve (default: HARNESS_TOKEN, or a new random token)
      --thread <id>      Conversation id (default: main)
  -h, --help             Show this help

Exit codes for --print: 0 done, 1 failed, 2 waiting for approval, 130 cancelled.`

/** Parse CLI flags. Throws with a short message on an unknown flag. */
export function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      help: { type: 'boolean', short: 'h' },
      print: { type: 'string', short: 'p' },
      output: { type: 'string' },
      acp: { type: 'boolean' },
      serve: { type: 'boolean' },
      port: { type: 'string' },
      host: { type: 'string' },
      token: { type: 'string' },
      thread: { type: 'string' },
    },
    strict: true,
  })
  const output = values.output ?? 'text'
  if (output !== 'text' && output !== 'ndjson') {
    throw new Error(`--output must be text or ndjson, got "${output}".`)
  }
  const port = Number(values.port ?? '8787')
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be a port number, got "${values.port}".`)
  }
  return {
    help: values.help ?? false,
    ...(values.print !== undefined ? { print: values.print } : {}),
    output,
    acp: values.acp ?? false,
    serve: values.serve ?? false,
    port,
    hostname: values.host ?? '127.0.0.1',
    ...(values.token !== undefined ? { token: values.token } : {}),
    thread: values.thread ?? 'main',
  }
}
