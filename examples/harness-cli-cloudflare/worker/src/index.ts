import codeMode from '@tanstack/ai-isolate-cloudflare/worker'
import { seal, unseal } from './crypto'
import type { Env } from './env'

export { Account } from './account'
export { SessionLog } from './session-log'

const json = (value: unknown, status = 200) => Response.json(value, { status })
const notFound = () => json({ error: 'Not found' }, 404)

/** Is the request's bearer token the Worker secret? */
function isAllowed(request: Request, env: Env) {
  const sent = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${env.HARNESS_SECRET}`
  const a = new TextEncoder().encode(sent)
  const b = new TextEncoder().encode(expected)
  return (
    env.HARNESS_SECRET !== '' &&
    a.byteLength === b.byteLength &&
    crypto.subtle.timingSafeEqual(a, b)
  )
}

const account = (env: Env) => env.ACCOUNT.getByName('account')

/** What the user said first in these log records, if a record has it. */
function titleOf(records: Array<unknown>) {
  for (const record of records) {
    if (typeof record !== 'object' || record === null) continue
    if (!('type' in record) || record.type !== 'harness.transcript') continue
    if (!('add' in record) || !Array.isArray(record.add)) continue
    for (const message of record.add) {
      const isUser =
        typeof message === 'object' &&
        message !== null &&
        message.role === 'user'
      if (!isUser) continue
      const content: unknown = message.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .map((part: unknown) =>
                  typeof part === 'object' &&
                  part !== null &&
                  'type' in part &&
                  part.type === 'text' &&
                  'content' in part &&
                  typeof part.content === 'string'
                    ? part.content
                    : '',
                )
                .join(' ')
            : ''
      const line = text.replace(/\s+/g, ' ').trim()
      if (line !== '') return line.slice(0, 200)
    }
  }
  return undefined
}

/** The metadata of an R2 object, in the shape of a `BlobRecord`. */
function blobRecord(object: R2Object) {
  const created = Number(object.customMetadata?.['x-created-at'])
  const { 'x-created-at': _created, ...customMetadata } =
    object.customMetadata ?? {}
  return {
    key: object.key,
    size: object.size,
    etag: object.etag,
    ...(object.httpMetadata?.contentType
      ? { contentType: object.httpMetadata.contentType }
      : {}),
    customMetadata,
    createdAt: Number.isFinite(created) ? created : object.uploaded.getTime(),
    updatedAt: object.uploaded.getTime(),
  }
}

async function sessions(request: Request, env: Env, parts: Array<string>) {
  const url = new URL(request.url)
  const [threadId, what] = parts
  if (threadId === undefined) {
    const limit = Number(url.searchParams.get('limit') ?? 20)
    return json({ sessions: await account(env).listSessions(limit) })
  }
  if (what !== 'log') return notFound()
  const log = env.SESSIONS.getByName(threadId)
  if (request.method === 'GET') {
    const after = Number(url.searchParams.get('after') ?? 0)
    const limit = url.searchParams.get('limit')
    return json({
      entries: await log.read(
        after,
        limit === null ? undefined : Number(limit),
      ),
    })
  }
  if (request.method !== 'POST') return notFound()
  const body: { seq: number; records: Array<unknown> } = await request.json()
  const written = await log.append(body.seq, body.records)
  if (!written) return json({ error: 'conflict', seq: body.seq }, 409)
  // Child agents (`<session>:<agent>`) are not sessions of their own.
  if (body.records.length > 0 && !threadId.includes(':')) {
    await account(env).touchSession(threadId, titleOf(body.records), Date.now())
  }
  return json({ ok: true })
}

async function metadata(request: Request, env: Env, parts: Array<string>) {
  const [namespace, key] = parts
  if (namespace === undefined || key === undefined) return notFound()
  const store = account(env)
  if (request.method === 'GET') {
    return json({ value: await store.getMetadata(namespace, key) })
  }
  if (request.method === 'PUT') {
    const body: { value: unknown } = await request.json()
    await store.setMetadata(namespace, key, body.value)
    return json({ ok: true })
  }
  if (request.method === 'DELETE') {
    await store.deleteMetadata(namespace, key)
    return json({ ok: true })
  }
  return notFound()
}

async function credentials(request: Request, env: Env, parts: Array<string>) {
  const [owner, id] = parts
  if (owner === undefined) return notFound()
  const store = account(env)
  if (id === undefined) {
    return json({ items: await store.listCredentials(owner) })
  }
  if (request.method === 'GET') {
    const sealed = await store.getCredential(owner, id)
    const credential: unknown =
      sealed === null
        ? null
        : JSON.parse(await unseal(env.ENCRYPTION_KEY, sealed))
    return json({ credential })
  }
  if (request.method === 'PUT') {
    const body: { credential: { type: string; expiresAt?: number } } =
      await request.json()
    const sealed = await seal(
      env.ENCRYPTION_KEY,
      JSON.stringify(body.credential),
    )
    await store.setCredential(
      owner,
      id,
      body.credential.type,
      body.credential.expiresAt ?? null,
      sealed,
    )
    return json({ ok: true })
  }
  if (request.method === 'DELETE') {
    await store.deleteCredential(owner, id)
    return json({ ok: true })
  }
  return notFound()
}

async function artifacts(request: Request, env: Env, parts: Array<string>) {
  const url = new URL(request.url)
  const [id] = parts
  const store = account(env)
  if (id === undefined) {
    const runId = url.searchParams.get('runId')
    const threadId = url.searchParams.get('threadId')
    if (request.method === 'DELETE' && runId !== null) {
      await store.deleteArtifactsForRun(runId)
      return json({ ok: true })
    }
    if (runId !== null)
      return json({ records: await store.listArtifacts('run_id', runId) })
    if (threadId !== null)
      return json({ records: await store.listArtifacts('thread_id', threadId) })
    return notFound()
  }
  if (request.method === 'GET') {
    return json({ record: await store.getArtifact(id) })
  }
  if (request.method === 'PUT') {
    const body: {
      record: { runId: string; threadId: string; createdAt: number }
    } = await request.json()
    await store.saveArtifact(
      id,
      body.record.runId,
      body.record.threadId,
      body.record.createdAt,
      body.record,
    )
    return json({ ok: true })
  }
  if (request.method === 'DELETE') {
    await store.deleteArtifact(id)
    return json({ ok: true })
  }
  return notFound()
}

async function blobs(request: Request, env: Env, parts: Array<string>) {
  const url = new URL(request.url)
  const [key] = parts
  if (key === undefined) {
    const limit = url.searchParams.get('limit')
    if (limit === '0') return json({ objects: [] })
    const prefix = url.searchParams.get('prefix')
    const cursor = url.searchParams.get('cursor')
    // The cursor is the last key of the page: the next page starts after it.
    const page = await env.MEDIA.list({
      ...(prefix ? { prefix } : {}),
      ...(cursor ? { startAfter: cursor } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      include: ['httpMetadata', 'customMetadata'],
    })
    const last = page.objects.at(-1)
    return json({
      objects: page.objects.map(blobRecord),
      ...(page.truncated && last ? { truncated: true, cursor: last.key } : {}),
    })
  }
  if (request.method === 'PUT') {
    const before = await env.MEDIA.head(key)
    const createdAt =
      before?.customMetadata?.['x-created-at'] ?? String(Date.now())
    const customMetadata: Record<string, string> = JSON.parse(
      request.headers.get('x-blob-metadata') ?? '{}',
    )
    const contentType = request.headers.get('Content-Type')
    const object = await env.MEDIA.put(key, request.body, {
      ...(contentType ? { httpMetadata: { contentType } } : {}),
      customMetadata: { ...customMetadata, 'x-created-at': createdAt },
    })
    return json(blobRecord(object))
  }
  if (request.method === 'DELETE') {
    await env.MEDIA.delete(key)
    return json({ ok: true })
  }
  if (url.searchParams.get('head') === '1') {
    const object = await env.MEDIA.head(key)
    return json({ record: object ? blobRecord(object) : null })
  }
  const offset = url.searchParams.get('offset')
  const length = url.searchParams.get('length')
  const object = await env.MEDIA.get(key, {
    ...(offset === null
      ? {}
      : {
          range: {
            offset: Number(offset),
            ...(length === null ? {} : { length: Number(length) }),
          },
        }),
  })
  if (object === null) return notFound()
  const served =
    offset === null
      ? undefined
      : {
          offset: Number(offset),
          length: Math.min(
            length === null ? object.size : Number(length),
            object.size - Number(offset),
          ),
        }
  return new Response(object.body, {
    headers: {
      'x-blob-record': JSON.stringify(blobRecord(object)),
      ...(served ? { 'x-blob-range': JSON.stringify(served) } : {}),
    },
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!isAllowed(request, env)) {
      return json(
        { error: 'Send the Worker secret: Authorization: Bearer <secret>' },
        401,
      )
    }
    const [route, ...parts] = new URL(request.url).pathname
      .split('/')
      .filter((part) => part !== '')
      .map((part) => decodeURIComponent(part))
    switch (route) {
      case 'health':
        return json({ ok: true, name: 'tanstack-harness' })
      case 'sessions':
        return sessions(request, env, parts)
      case 'metadata':
        return metadata(request, env, parts)
      case 'credentials':
        return credentials(request, env, parts)
      case 'artifacts':
        return artifacts(request, env, parts)
      case 'blobs':
        return blobs(request, env, parts)
      case 'code-mode':
        return codeMode.fetch(request, env, ctx)
      default:
        return notFound()
    }
  },
} satisfies ExportedHandler<Env>
