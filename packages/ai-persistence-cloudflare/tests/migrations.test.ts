import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { d1Migrations } from '../src/index'

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
})
