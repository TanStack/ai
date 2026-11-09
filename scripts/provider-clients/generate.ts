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
 * 4. Run Kubb into a scratch directory, then oxfmt.
 * 5. Write the result into the packages, or with `--check` compare it with
 *    the committed files.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diffFiles, docSkipReason, readTree, writeTree } from './files.ts'
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
async function fetchDoc(id: string) {
  const response = await fetch(`${API}/openapi/${id}`, {
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

async function main() {
  const listed = await listProviders()
  const scratch = await mkdtemp(join(tmpdir(), 'provider-clients-'))
  const docs = join(scratch, 'docs')
  const out = join(scratch, 'out')
  try {
    await mkdir(docs, { recursive: true })
    const generated: typeof PROVIDER_CLIENTS = []
    for (const provider of PROVIDER_CLIENTS) {
      const result = listed.has(provider.id)
        ? await fetchDoc(provider.id)
        : { skip: 'unknown_provider' }
      if ('skip' in result) {
        console.warn(`skip ${provider.id}: ${result.skip}`)
        continue
      }
      await writeFile(join(docs, `${provider.id}.json`), result.text)
      generated.push(provider)
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
