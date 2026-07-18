import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { d1Migrations } from '../src/index'

/** The four state tables the D1 asset shares with the Drizzle asset. */
const sharedTables = ['messages', 'runs', 'interrupts', 'metadata'] as const

/** Whitespace- and breakpoint-insensitive DDL for each `CREATE TABLE`, by name. */
function parseCreateTables(sql: string): Map<string, string> {
  const tables = new Map<string, string>()
  for (const chunk of sql.split('--> statement-breakpoint')) {
    const statement = chunk.trim()
    if (statement === '') continue
    const [, name] = /CREATE TABLE [`"](\w+)[`"]/.exec(statement) ?? []
    if (name === undefined) continue
    const normalized = statement
      .replace(/\s+/g, ' ')
      .replace(/;\s*$/, '')
      .trim()
    tables.set(name, normalized)
  }
  return tables
}

async function readAsset(url: string): Promise<string> {
  return readFile(fileURLToPath(new URL(url, import.meta.url)), 'utf8')
}

describe('D1 migrations', () => {
  it('exports the canonical structured-state migration', () => {
    expect(d1Migrations).toHaveLength(1)
    expect(d1Migrations[0]).toMatchObject({
      id: '0000_tanstack_ai_initial',
      filename: '0000_tanstack_ai_initial.sql',
    })
    const sql = d1Migrations[0]?.sql ?? ''
    expect(sql).toMatch(/CREATE TABLE [`"]messages[`"]/)
    expect(sql).toMatch(/CREATE TABLE [`"]runs[`"]/)
    expect(sql).toMatch(/CREATE TABLE [`"]interrupts[`"]/)
    expect(sql).toMatch(/CREATE TABLE [`"]metadata[`"]/)
    expect(sql).not.toMatch(/CREATE TABLE [`"]artifacts[`"]/)
    expect(sql).not.toMatch(/CREATE TABLE [`"]blobs[`"]/)
  })

  it('keeps the published migration equal to the embedded asset', async () => {
    const embedded = await readFile(
      fileURLToPath(
        new URL('../src/assets/0000_tanstack_ai_initial.sql', import.meta.url),
      ),
      'utf8',
    )
    const published = await readFile(
      fileURLToPath(
        new URL('../migrations/0000_tanstack_ai_initial.sql', import.meta.url),
      ),
      'utf8',
    )
    expect(published).toBe(embedded)
    expect(d1Migrations[0]?.sql).toBe(embedded)
  })

  // `createD1Stores` runs the Drizzle stores against a D1 database migrated with
  // this hand-maintained subset, so the four shared tables' DDL must stay
  // identical to the Drizzle asset. Drift breaks the stores at runtime.
  it('cloudflare D1 asset matches the drizzle asset for the four shared tables', async () => {
    const cloudflareSql = await readAsset(
      '../src/assets/0000_tanstack_ai_initial.sql',
    )
    const drizzleSql = await readAsset(
      '../../ai-persistence-drizzle/src/assets/0000_tanstack_ai_initial.sql',
    )
    const cloudflare = parseCreateTables(cloudflareSql)
    const drizzle = parseCreateTables(drizzleSql)

    for (const table of sharedTables) {
      expect(drizzle.get(table), `drizzle is missing ${table}`).toBeDefined()
      expect(cloudflare.get(table), table).toBe(drizzle.get(table))
    }

    // The D1 asset ships ONLY the four shared tables; artifacts/blobs live in R2.
    expect([...cloudflare.keys()].sort()).toEqual([...sharedTables].sort())
    // The Drizzle asset additionally owns the R2-backed tables.
    expect(drizzle.has('artifacts')).toBe(true)
    expect(drizzle.has('blobs')).toBe(true)
  })
})
