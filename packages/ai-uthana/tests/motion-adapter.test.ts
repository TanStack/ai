import { describe, expect, it } from 'vitest'
import {
  cancelMotionJob,
  generateMotion,
  getMotionJobStatus,
} from '@tanstack/ai'
import { createUthanaCharacter, uthanaMotion } from '../src/index'
import type { StreamChunk } from '@tanstack/ai'

const BASE = 'https://uthana.com'
const AUTH = `Basic ${btoa('uth-test:')}`
const FBX_BYTES = new TextEncoder().encode('Kaydara FBX Binary  fake-fbx')
const GLB_BYTES = new TextEncoder().encode('glTF fake-glb')

interface SeenRequest {
  method: string
  url: string
  authorization: string | null
  graphql?: { query: string; variables: Record<string, unknown> }
}

type JobState = { status: string; result?: unknown }

/**
 * A fake Uthana: GraphQL at /graphql (create job, read job) and the motion
 * file endpoint. `jobs` is answered in order per poll, the last one
 * repeating. This is the network boundary; the adapter runs for real.
 */
function fakeUthana(options: {
  jobs?: Array<JobState>
  createErrors?: Array<{ message: string }>
  downloadStatus?: number
}) {
  const seen: Array<SeenRequest> = []
  let poll = 0
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const entry: SeenRequest = {
      method: request.method,
      url: request.url,
      authorization: request.headers.get('authorization'),
    }
    seen.push(entry)
    if (request.url === `${BASE}/graphql`) {
      const body: unknown = await request.json()
      if (
        typeof body !== 'object' ||
        body === null ||
        !('query' in body) ||
        typeof body.query !== 'string' ||
        !('variables' in body) ||
        typeof body.variables !== 'object' ||
        body.variables === null
      ) {
        return Response.json({ errors: [{ message: 'bad body' }] })
      }
      const variables = Object.fromEntries(Object.entries(body.variables))
      entry.graphql = { query: body.query, variables }
      if (body.query.includes('create_text_to_motion_job')) {
        if (options.createErrors) {
          return Response.json({ data: null, errors: options.createErrors })
        }
        return Response.json({
          data: {
            create_text_to_motion_job: {
              job: { id: 'job-1', status: 'READY' },
            },
          },
        })
      }
      const jobs = options.jobs ?? []
      const job = jobs[Math.min(poll, jobs.length - 1)]
      poll += 1
      return Response.json({ data: { job: { id: 'job-1', ...job } } })
    }
    if (request.url.includes('/motion/file/motion_viewer/')) {
      if (options.downloadStatus) {
        return new Response('forbidden', {
          status: options.downloadStatus,
          statusText: 'Forbidden',
        })
      }
      const bytes = request.url.includes('/fbx/') ? FBX_BYTES : GLB_BYTES
      return new Response(bytes)
    }
    return new Response('not found', { status: 404 })
  }
  return { fetch, seen }
}

const ORC_JOB = 'job-1?character=orc-1&formats=fbx&formats=glb&fps=30'

const finished = {
  status: 'FINISHED',
  result: {
    exc: null,
    result: { id: 'motion-9', tags: { Author: 'private' } },
  },
}

function decodeDataUrl(url: string): string {
  const base64 = url.slice(url.indexOf(',') + 1)
  return new TextDecoder().decode(
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
  )
}

describe('uthanaMotion', () => {
  it('streams a job and downloads FBX and GLB on the chosen character', async () => {
    const uthana = fakeUthana({
      jobs: [{ status: 'READY' }, { status: 'RESERVED' }, finished],
    })
    const chunks: Array<StreamChunk> = []
    for await (const chunk of generateMotion({
      adapter: uthanaMotion('text-to-motion-3.0', {
        apiKey: 'uth-test',
        fetch: uthana.fetch,
      }),
      threadId: 'orc',
      prompt: 'a heavy warrior swings an axe',
      duration: 4,
      modelOptions: {
        character_id: 'orc-1',
        formats: ['fbx', 'glb'],
        fps: 30,
      },
      stream: true,
      pollingInterval: 0,
    })) {
      chunks.push(chunk)
    }

    expect(uthana.seen[0]?.graphql?.variables).toEqual({
      prompt: 'a heavy warrior swings an axe',
      model: 'text-to-motion-3.0',
      length: 4,
      character_id: 'orc-1',
    })
    expect(uthana.seen.every((r) => r.authorization === AUTH)).toBe(true)
    const statuses = chunks.flatMap((c) =>
      c.type === 'CUSTOM' && c.name === 'motion:status' ? [c.value] : [],
    )
    expect(statuses).toEqual([
      { jobId: ORC_JOB, status: 'pending' },
      { jobId: ORC_JOB, status: 'processing' },
      { jobId: ORC_JOB, status: 'completed' },
    ])
    const downloads = uthana.seen
      .filter((r) => r.url.includes('/motion/file/'))
      .map((r) => r.url)
    expect(downloads).toEqual([
      `${BASE}/motion/file/motion_viewer/orc-1/motion-9/fbx/uthana-motion-9.fbx?fps=30`,
      `${BASE}/motion/file/motion_viewer/orc-1/motion-9/glb/uthana-motion-9.glb?fps=30`,
    ])

    const result = chunks.find(
      (c) => c.type === 'CUSTOM' && c.name === 'generation:result',
    )
    const value = result?.type === 'CUSTOM' ? result.value : undefined
    expect(value).toMatchObject({
      jobId: ORC_JOB,
      model: 'text-to-motion-3.0',
      assets: [
        {
          format: 'fbx',
          contentType: 'application/fbx',
          fileName: 'uthana-motion-9.fbx',
          fileSize: FBX_BYTES.byteLength,
        },
        {
          format: 'glb',
          contentType: 'model/gltf-binary',
          fileName: 'uthana-motion-9.glb',
          fileSize: GLB_BYTES.byteLength,
        },
      ],
    })
    // The provider tags (they hold account details) never reach the result.
    expect(JSON.stringify(value)).not.toContain('private')
    const assets =
      typeof value === 'object' && value !== null && 'assets' in value
        ? value.assets
        : []
    const urls = Array.isArray(assets)
      ? assets.map((a: { url: string }) => decodeDataUrl(a.url))
      : []
    expect(urls).toEqual(['Kaydara FBX Binary  fake-fbx', 'glTF fake-glb'])
  })

  it('downloads with the submit options on every poll, from any adapter', async () => {
    const uthana = fakeUthana({ jobs: [finished] })
    const adapter = uthanaMotion('text-to-motion-3.0', {
      apiKey: 'uth-test',
      fetch: uthana.fetch,
    })

    for (let i = 0; i < 2; i += 1) {
      await getMotionJobStatus({
        adapter,
        jobId: 'job-1?character=orc-1&formats=glb&fps=60',
      })
    }

    const polledIds = uthana.seen.flatMap((r) =>
      r.graphql ? [r.graphql.variables.id] : [],
    )
    // Each poll reads the job twice: once for the status, once to download.
    expect(new Set(polledIds)).toEqual(new Set(['job-1']))
    const downloads = uthana.seen
      .filter((r) => r.url.includes('/motion/file/'))
      .map((r) => r.url)
    const expected = `${BASE}/motion/file/motion_viewer/orc-1/motion-9/glb/uthana-motion-9.glb?fps=60`
    expect(downloads).toEqual([expected, expected])
  })

  it('reports a failed job with the provider exception', async () => {
    const uthana = fakeUthana({
      jobs: [{ status: 'FAILED', result: { exc: 'Generation crashed' } }],
    })

    const status = await getMotionJobStatus({
      adapter: uthanaMotion('text-to-motion-3.0', {
        apiKey: 'uth-test',
        fetch: uthana.fetch,
      }),
      jobId: 'job-1',
    })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: 'Generation crashed',
    })
  })

  it('fails the status poll when the download is refused', async () => {
    const uthana = fakeUthana({ jobs: [finished], downloadStatus: 403 })

    const status = await getMotionJobStatus({
      adapter: uthanaMotion('text-to-motion-3.0', {
        apiKey: 'uth-test',
        fetch: uthana.fetch,
      }),
      jobId: 'job-1',
    })

    expect(status).toEqual({
      jobId: 'job-1',
      status: 'failed',
      error: 'Uthana download of fbx failed (403 Forbidden)',
    })
  })

  it('surfaces GraphQL errors from the submit', async () => {
    const uthana = fakeUthana({
      createErrors: [{ message: 'Insufficient balance' }],
    })

    await expect(
      generateMotion({
        adapter: uthanaMotion('text-to-motion-3.0', {
          apiKey: 'uth-test',
          fetch: uthana.fetch,
        }),
        threadId: 'orc',
        prompt: 'a heavy warrior swings an axe',
      }),
    ).rejects.toThrow('Uthana: Insufficient balance')
  })

  it('has no remote cancel', async () => {
    const uthana = fakeUthana({ jobs: [{ status: 'RESERVED' }] })

    await expect(
      cancelMotionJob({
        adapter: uthanaMotion('text-to-motion-3.0', {
          apiKey: 'uth-test',
          fetch: uthana.fetch,
        }),
        jobId: 'job-1',
      }),
    ).rejects.toThrow(
      'The uthana motion adapter cannot cancel jobs: the provider has no cancel API.',
    )
  })
})

describe('createUthanaCharacter', () => {
  it('uploads the model as a GraphQL multipart request', async () => {
    const parts: Record<string, string> = {}
    let fileName = ''
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const form = await new Request(input, init).formData()
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') parts[key] = value
        else fileName = value.name
      }
      return Response.json({
        data: {
          create_character: {
            character: { id: 'char-1', name: 'Orc' },
            auto_rig_confidence: 0.55,
            message: null,
          },
        },
      })
    }

    const character = await createUthanaCharacter({
      apiKey: 'uth-test',
      fetch,
      file: new Blob(['glb-bytes']),
      fileName: 'orc.glb',
      name: 'Orc',
    })

    expect(character).toEqual({
      characterId: 'char-1',
      name: 'Orc',
      autoRigConfidence: 0.55,
    })
    expect(JSON.parse(parts.map ?? '{}')).toEqual({ '0': ['variables.file'] })
    expect(JSON.parse(parts.operations ?? '{}').variables).toEqual({
      file: null,
      name: 'Orc',
      auto_rig: true,
    })
    expect(fileName).toBe('orc.glb')
  })
})
