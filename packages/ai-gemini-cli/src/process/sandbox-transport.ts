/**
 * Adapt a sandbox {@link SpawnHandle} (duplex string IO) into the
 * `{ writable, readable }` Uint8Array WebStreams that `@agentclientprotocol`'s
 * `ndJsonStream` consumes. This is the ONLY new transport piece needed to run
 * `gemini --acp` inside a sandbox instead of as a local child process — the ACP
 * protocol handling is reused unchanged.
 */
import type { SpawnHandle } from '@tanstack/ai-sandbox'

export interface AcpTransport {
  writable: WritableStream<Uint8Array>
  readable: ReadableStream<Uint8Array>
  /** Resolves (throws) when the underlying process exits unexpectedly. */
  exited: Promise<never>
  /** Last bytes of stderr, for error messages. */
  stderrTail: () => string
  kill: () => Promise<void>
}

export function spawnHandleToAcpTransport(handle: SpawnHandle): AcpTransport {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of handle.stdout) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      return handle.stdin.write(decoder.decode(chunk))
    },
    close() {
      return handle.stdin.end()
    },
  })

  let tail = ''
  void (async () => {
    try {
      for await (const chunk of handle.stderr) {
        tail = (tail + chunk).slice(-4096)
      }
    } catch {
      // stderr closed
    }
  })()

  const exited: Promise<never> = handle.wait().then((code) => {
    throw new Error(
      `Gemini CLI exited unexpectedly (code ${code}).${
        tail.trim() !== '' ? `\nstderr: ${tail.trim()}` : ''
      }`,
    )
  })
  // Mark the rejection handled so it isn't an unhandled rejection when the
  // consumer wins the race (consumers still observe it via Promise.race).
  void exited.catch(() => undefined)

  return {
    writable,
    readable,
    exited,
    stderrTail: () => tail,
    kill: () => handle.kill(),
  }
}
