import { describe, expect, it } from 'vitest'
import { blaxelSandbox } from '../src/index'

describe.skipIf(!process.env.BL_API_KEY || !process.env.BL_WORKSPACE)(
  'concurrent Blaxel output',
  () => {
    it('preserves each byte of simultaneous stdout and stderr', async () => {
      const provider = blaxelSandbox({
        region: process.env.BL_REGION,
        ttl: '10m',
      })
      const sandbox = await provider.create({})
      try {
        const process = await sandbox.process.spawn(
          "sleep 1; (head -c 262144 /dev/zero | tr '\\0' A) & (head -c 262144 /dev/zero | tr '\\0' B >&2) & wait",
        )
        const collect = async (stream: AsyncIterable<string>) => {
          const chunks: Array<Uint8Array> = []
          for await (const chunk of stream) chunks.push(Buffer.from(chunk))
          return Buffer.concat(chunks)
        }
        const [stdout, stderr, code] = await Promise.all([
          collect(process.stdout),
          collect(process.stderr),
          process.wait(),
        ])
        expect(stdout.equals(Buffer.alloc(262144, 65))).toBe(true)
        expect(stderr.equals(Buffer.alloc(262144, 66))).toBe(true)
        expect(code).toBe(0)
      } finally {
        await sandbox.destroy()
      }
    }, 120_000)
  },
)
