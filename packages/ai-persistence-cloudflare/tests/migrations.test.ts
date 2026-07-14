import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { d1Migrations } from '../src/index'

interface MigrationBindings {
  AI_DB: D1Database
}

function statementsFor(sql: string): Array<string> {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}

async function applyMigration(
  d1: D1Database,
  migration: (typeof d1Migrations)[number],
): Promise<void> {
  await d1.batch(
    statementsFor(migration.sql).map((statement) => d1.prepare(statement)),
  )
}

describe('D1 migrations', () => {
  it('exports the canonical structured-state migration', () => {
    expect(d1Migrations).toHaveLength(2)
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
    expect(sql).not.toContain('CREATE TABLE `blobs`')
    expect(d1Migrations[1]).toMatchObject({
      id: '0001_tanstack_ai_interrupt_batches',
      filename: '0001_tanstack_ai_interrupt_batches.sql',
    })
    expect(d1Migrations[1]?.sql).toContain('CREATE TABLE `interrupt_batches`')
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

    const interruptEmbedded = await readFile(
      fileURLToPath(
        new URL(
          '../src/assets/0001_tanstack_ai_interrupt_batches.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    )
    const interruptPublished = await readFile(
      fileURLToPath(
        new URL(
          '../migrations/0001_tanstack_ai_interrupt_batches.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    )
    const drizzlePublished = await readFile(
      fileURLToPath(
        new URL(
          '../../ai-persistence-drizzle/drizzle/0001_tanstack_ai_interrupt_batches.sql',
          import.meta.url,
        ),
      ),
      'utf8',
    )
    expect(interruptPublished).not.toBe('')
    expect(interruptPublished).toBe(interruptEmbedded)
    expect(interruptPublished).toBe(drizzlePublished)
    expect(d1Migrations[1]?.sql).toBe(interruptEmbedded)
  })

  it('backfills safe legacy identity for pending and completed rows', async () => {
    const miniflare = new Miniflare({
      compatibilityDate: '2026-06-24',
      d1Databases: ['AI_DB'],
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    try {
      const bindings = await miniflare.getBindings<MigrationBindings>()
      const initial = d1Migrations[0]
      const interruptBatches = d1Migrations[1]
      expect(initial).toBeDefined()
      expect(interruptBatches).toBeDefined()
      if (!initial || !interruptBatches) return
      await applyMigration(bindings.AI_DB, initial)
      await bindings.AI_DB.batch([
        bindings.AI_DB.prepare(
          `INSERT INTO interrupts
            (interrupt_id, run_id, thread_id, status, requested_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          'pending-int',
          'pending-run',
          'thread-legacy',
          'pending',
          1,
          '{"id":"pending-int","reason":"confirmation"}',
        ),
        bindings.AI_DB.prepare(
          `INSERT INTO interrupts
            (interrupt_id, run_id, thread_id, status, requested_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          'resolved-int',
          'resolved-run',
          'thread-legacy',
          'resolved',
          2,
          '{"id":"resolved-int","reason":"confirmation"}',
        ),
      ])

      await applyMigration(bindings.AI_DB, interruptBatches)

      const rows = await bindings.AI_DB.prepare(
        `SELECT interrupt_id, generation, binding_json, response_schema_hash
         FROM interrupts ORDER BY interrupt_id`,
      ).all<{
        interrupt_id: string
        generation: number
        binding_json: string
        response_schema_hash: string
      }>()
      expect(rows.results).toEqual([
        {
          interrupt_id: 'pending-int',
          generation: 1,
          binding_json:
            '{"kind":"generic","interruptId":"pending-int","interruptedRunId":"pending-run","generation":1,"responseSchemaHash":"legacy:unknown"}',
          response_schema_hash: 'legacy:unknown',
        },
        {
          interrupt_id: 'resolved-int',
          generation: 0,
          binding_json:
            '{"kind":"generic","interruptId":"resolved-int","interruptedRunId":"resolved-run","generation":0,"responseSchemaHash":"legacy:unknown"}',
          response_schema_hash: 'legacy:unknown',
        },
      ])
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)
})
