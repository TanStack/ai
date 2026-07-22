import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { d1Migrations } from '../src/index'

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

  // `createD1Stores` runs the Drizzle stores against a D1 database migrated
  // with this copy of the Drizzle migration, so it must stay byte-for-byte
  // identical to the Drizzle asset. Drift breaks the stores at runtime.
  it('cloudflare D1 asset matches the drizzle asset', async () => {
    const cloudflareSql = await readAsset(
      '../src/assets/0000_tanstack_ai_initial.sql',
    )
    const drizzleSql = await readAsset(
      '../../ai-persistence-drizzle/src/assets/0000_tanstack_ai_initial.sql',
    )
    expect(cloudflareSql).toBe(drizzleSql)
  })
})
