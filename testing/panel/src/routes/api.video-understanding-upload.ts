import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'
import { uploadGeminiFile } from '@tanstack/ai-gemini'

/**
 * Upload a video (multipart form field `file`) to the Gemini Files API and wait
 * until it is ACTIVE. Returns `{ uri, mimeType, name }` for the client to pass
 * back with subsequent chat turns.
 *
 * The incoming blob is written to a temp file first — the Files API upload is
 * most reliable from a path, and it keeps the 24MB body off the heap longer
 * than necessary.
 */
export const Route = createFileRoute('/api/video-understanding-upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let tmpPath: string | undefined
        try {
          const formData = await request.formData()
          const file = formData.get('file')
          if (!(file instanceof File)) {
            return Response.json(
              { error: 'Expected a `file` field with a video.' },
              { status: 400 },
            )
          }

          const bytes = Buffer.from(await file.arrayBuffer())
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          tmpPath = path.join(os.tmpdir(), `vu-${process.pid}-${safeName}`)
          fs.writeFileSync(tmpPath, bytes)

          const uploaded = await uploadGeminiFile(tmpPath, {
            mimeType: file.type || 'video/mp4',
          })

          console.log(`>> video-understanding upload -> ${uploaded.uri}`)
          return Response.json(uploaded)
        } catch (error: any) {
          console.error(
            '[API Route] video-understanding upload error:',
            error?.message,
          )
          return Response.json(
            { error: error?.message ?? 'Upload failed' },
            { status: 500 },
          )
        } finally {
          if (tmpPath) {
            try {
              fs.unlinkSync(tmpPath)
            } catch {
              // best-effort cleanup
            }
          }
        }
      },
    },
  },
})
