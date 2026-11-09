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
 * 5. Run Kubb into a scratch directory, then oxfmt.
 * 6. Write the result into the packages, or with `--check` compare it with
 *    the committed files.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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
        const mapped = withEndpointMap(
          parseDoc(doc.text),
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
