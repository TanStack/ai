/**
 * Adapt a sandbox {@link SpawnHandle} into byte streams for ACP stdio
 * (newline-delimited JSON-RPC).
 */
import type { SpawnHandle } from '@tanstack/ai-sandbox'
import type { AcpByteTransport } from './types'

export function spawnHandleToAcpTransport(
  handle: SpawnHandle,
): AcpByteTransport {
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
      `ACP harness process exited unexpectedly (code ${code}).${
        tail.trim() !== '' ? `\nstderr: ${tail.trim()}` : ''
      }`,
    )
  })
  void exited.catch(() => undefined)

  return {
    writable,
    readable,
    exited,
    stderrTail: () => tail,
    kill: () => handle.kill(),
  }
}
