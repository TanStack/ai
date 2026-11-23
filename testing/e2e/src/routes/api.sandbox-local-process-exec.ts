import { tmpdir } from 'node:os'
import { resolve, sep } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

/**
 * `exec()` of the local-process sandbox, with output that has multi-byte
 * characters. Body: `{ root }`, a folder in the temp folder that the test
 * made. The answer is the JSON of the exec result.
 *
 * The script writes each byte of `TEXT` by itself, with a pause between the
 * writes, to stdout and to stderr. So each multi-byte character comes to the
 * sandbox in more than one `data` chunk, and `exec()` must decode across the
 * chunks to give back `TEXT`, not U+FFFD.
 */

/** Two, three and four byte UTF-8 characters, and Persian text. */
export const TEXT = 'é € 😀 سلام'

const SCRIPT = [
  `const bytes = Buffer.from(${JSON.stringify(TEXT)}, 'utf8')`,
  `let index = 0`,
  `const next = () => {`,
  `  if (index >= bytes.length) return`,
  `  const byte = bytes.subarray(index, index + 1)`,
  `  process.stdout.write(byte)`,
  `  process.stderr.write(byte)`,
  `  index += 1`,
  `  setTimeout(next, 5)`,
  `}`,
  `next()`,
].join('\n')

export const Route = createFileRoute('/api/sandbox-local-process-exec')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const rootField =
          typeof body === 'object' && body !== null && 'root' in body
            ? body.root
            : undefined
        const root = typeof rootField === 'string' ? resolve(rootField) : ''
        if (!root.startsWith(resolve(tmpdir()) + sep)) {
          return new Response('root must be in the temp folder', {
            status: 400,
          })
        }
        const sandbox = await localProcessSandbox({ dir: root }).create({})
        try {
          await sandbox.fs.write('/workspace/split-utf8.mjs', SCRIPT)
          const result = await sandbox.process.exec('node split-utf8.mjs', {
            cwd: '/workspace',
          })
          return Response.json(result)
        } finally {
          await sandbox.destroy()
        }
      },
    },
  },
})
