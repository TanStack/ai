/**
 * Generates the provider HTTP clients from the modelschemas OpenAPI
 * documents with Kubb, then formats them with oxfmt.
 *
 * Usage:
 *   pnpm generate:provider-clients          # write the clients
 *   pnpm generate:provider-clients --check  # exit 1 when a client is stale
 *
 * Steps:
 * 1. List the providers from `GET /v1/providers`.
 * 2. Fetch `GET /v1/openapi/{provider}` for each provider in `providers.ts`.
 * 3. Skip a provider whose document is not available (`missing_connect`,
 *    `no_endpoints`, `unknown_provider`). Its committed client stays.
 * 4. Fetch `GET /v1/openapi/{provider}?activity=` for each activity. One with
 *    per-model schemas (Fal) gets a types-only `src/generated/{activity}`
 *    holding a `{Provider}{Activity}Endpoints` map of model id to
 *    `{ input, output }`.
 * 5. Write the video duration tables: fal per endpoint, and the providers in
 *    `VIDEO_DURATIONS` per model of their create operation.
 * 6. Run Kubb into a scratch directory, then oxfmt.
 * 7. Write the result into the packages, or with `--check` compare it with
 *    the committed files.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  falImageFieldOverrides,
  falVideoDurations,
  renderFalImageFieldOverrides,
} from './fal.ts'
import type { ActivityDoc } from './fal.ts'
import {
  VIDEO_DURATIONS,
  operationVideoDurations,
  renderVideoDurations,
} from './video-durations.ts'
import type { Duration } from './video-durations.ts'
import {
  diffFiles,
  docSkipReason,
  parseDoc,
  readTree,
  withEndpointMap,
  writeTree,
} from './files.ts'
import { GENERATED_DIR, PROVIDER_CLIENTS, RUNTIME_DIR } from './providers.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API = 'https://modelschemas.com/v1'
const check = process.argv.includes('--check')

async function listProviders() {
  const response = await fetch(`${API}/providers`)
  if (!response.ok) {
    throw new Error(`modelschemas ${response.status} for ${API}/providers`)
  }
  const body: { providers: Array<{ id: string }> } = await response.json()
  return new Set(body.providers.map((provider) => provider.id))
}

/** The OpenAPI document text, or the reason it is skipped. */
async function fetchDoc(id: string, activity?: string) {
  const query = activity ? `?activity=${encodeURIComponent(activity)}` : ''
  const response = await fetch(`${API}/openapi/${id}${query}`, {
    headers: { Accept: 'application/openapi+json' },
  })
  const text = await response.text()
  const skip = docSkipReason(response.status, text)
  if (skip) return { skip }
  if (!response.ok) {
    throw new Error(`modelschemas ${response.status} for ${id}: ${text}`)
  }
  return { text }
}

async function listActivities(id: string) {
  const response = await fetch(`${API}/schemas/${id}`)
  if (!response.ok) return []
  const body: { activities?: Record<string, unknown> } = await response.json()
  return Object.keys(body.activities ?? {}).sort()
}

const pascal = (text: string) =>
  text.replace(/(^|[^a-z0-9])([a-z0-9])/gi, (_, _sep, c: string) =>
    c.toUpperCase(),
  )

async function main() {
  const listed = await listProviders()
  const scratch = await mkdtemp(join(tmpdir(), 'provider-clients-'))
  const docs = join(scratch, 'docs')
  const out = join(scratch, 'out')
  try {
    await mkdir(docs, { recursive: true })
    const generated: typeof PROVIDER_CLIENTS = []
    const falActivityDocs = new Map<string, ActivityDoc>()
    const videoDocs = new Map<string, ActivityDoc>()
    const activityTypes: Array<
      (typeof PROVIDER_CLIENTS)[number] & { activity: string }
    > = []
    for (const provider of PROVIDER_CLIENTS) {
      const result = listed.has(provider.id)
        ? await fetchDoc(provider.id)
        : { skip: 'unknown_provider' }
      if ('skip' in result) {
        console.warn(`skip ${provider.id}: ${result.skip}`)
        continue
      }
      await writeFile(
        join(docs, `${provider.id}.json`),
        JSON.stringify(parseDoc(result.text)),
      )
      generated.push(provider)

      for (const activity of await listActivities(provider.id)) {
        const doc = await fetchDoc(provider.id, activity)
        if ('skip' in doc) continue
        const parsed = parseDoc(doc.text)
        if (provider.id === 'fal') falActivityDocs.set(activity, parsed)
        if (activity === 'video') videoDocs.set(provider.id, parsed)
        const mapped = withEndpointMap(
          parsed,
          `${pascal(provider.id)}${pascal(activity)}Endpoints`,
        )
        if (!mapped) continue
        await writeFile(
          join(docs, `${provider.id}@${activity}.json`),
          JSON.stringify(mapped),
        )
        activityTypes.push({ ...provider, activity })
      }
    }
    if (generated.length === 0) throw new Error('No provider document found')

    execFileSync(
      'pnpm',
      [
        'exec',
        'kubb',
        'generate',
        '--config',
        join(ROOT, 'scripts/provider-clients/kubb.config.ts'),
        '--log-level',
        'silent',
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          KUBB_DISABLE_TELEMETRY: '1',
          PROVIDER_CLIENTS_DOCS: docs,
          PROVIDER_CLIENTS_OUT: out,
        },
      },
    )
    // ponytail: fal-only step. Generalise when a second provider needs
    // derived files from its activity documents.
    const falFields = join(out, '_fal-image-fields')
    if (falActivityDocs.size > 0) {
      await mkdir(falFields, { recursive: true })
      await writeFile(
        join(falFields, 'image-field-overrides.ts'),
        renderFalImageFieldOverrides(
          falImageFieldOverrides([...falActivityDocs.values()]),
        ),
      )
    }
    // Each video duration table, by the directory it is written to.
    const durationTables = new Map<string, [string, Map<string, Duration>]>()
    const falVideo = falActivityDocs.get('video')
    if (falVideo) {
      durationTables.set('packages/ai-fal/src/video/generated', [
        'fal',
        falVideoDurations(falVideo),
      ])
    }
    for (const { id, path, outDir } of VIDEO_DURATIONS) {
      let doc = videoDocs.get(id)
      if (!doc) {
        const fetched = await fetchDoc(id, 'video')
        if ('skip' in fetched) {
          console.warn(`skip ${id} video durations: ${fetched.skip}`)
          continue
        }
        doc = parseDoc(fetched.text)
      }
      durationTables.set(outDir, [id, operationVideoDurations(doc, path)])
    }
    for (const [i, [id, durations]] of [...durationTables.values()].entries()) {
      const dir = join(out, `_video-durations-${i}`)
      await mkdir(dir, { recursive: true })
      await writeFile(
        join(dir, 'video-durations.ts'),
        renderVideoDurations(id, durations),
      )
    }
    execFileSync(
      'pnpm',
      ['exec', 'oxfmt', '-c', join(ROOT, '.oxfmtrc.json'), out],
      { cwd: ROOT, stdio: 'inherit' },
    )

    // Each target directory of the repo and the files it should hold.
    const targets = new Map<string, Record<string, string>>()
    for (const { id, packageDir } of generated) {
      targets.set(
        join(packageDir, GENERATED_DIR),
        await readTree(join(out, id)),
      )
    }
    for (const { id, packageDir, activity } of activityTypes) {
      targets.set(
        join(packageDir, 'src/generated', activity),
        await readTree(join(out, `${id}@${activity}`)),
      )
    }
    if (falActivityDocs.size > 0) {
      targets.set(
        'packages/ai-fal/src/image/generated',
        await readTree(falFields),
      )
    }
    for (const [i, outDir] of [...durationTables.keys()].entries()) {
      targets.set(outDir, await readTree(join(out, `_video-durations-${i}`)))
    }
    // Each runtime file is the same in every run, so the union is the runtime.
    const runtime: Record<string, string> = {}
    for (const { id } of generated) {
      Object.assign(runtime, await readTree(join(out, '_runtime', id, '.kubb')))
    }
    targets.set(RUNTIME_DIR, runtime)

    let stale = false
    for (const [dir, expected] of targets) {
      const target = join(ROOT, dir)
      if (check) {
        for (const change of diffFiles(expected, await readTree(target))) {
          stale = true
          console.error(`${change.kind}: ${join(dir, change.path)}`)
        }
      } else {
        await rm(target, { recursive: true, force: true })
        await writeTree(target, expected)
        console.log(`wrote ${dir}`)
      }
    }
    if (stale) {
      console.error(
        'Provider clients are stale. Run `pnpm generate:provider-clients`.',
      )
      process.exitCode = 1
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

await main()
