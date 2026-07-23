/// <reference types="@cloudflare/workers-types" />
import { afterAll, beforeAll } from 'vitest'
import { Miniflare } from 'miniflare'
import { runSandboxStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createD1SandboxStore, d1Migrations } from '../src/index'

interface RuntimeBindings {
  AI_DB: D1Database
}

let miniflare: Miniflare
let db: D1Database

beforeAll(async () => {
  miniflare = new Miniflare({
    compatibilityDate: '2026-06-24',
    d1Databases: ['AI_DB'],
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
  })
  const bindings = await miniflare.getBindings<RuntimeBindings>()
  db = bindings.AI_DB
  for (const migration of d1Migrations) {
    const statements = migration.sql
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
    await db.batch(statements.map((statement) => db.prepare(statement)))
  }
})

afterAll(async () => {
  await miniflare.dispose()
})

// One D1 binding is shared; truncating the table per store keeps each
// conformance case isolated.
runSandboxStoreConformance('cloudflare-d1', async () => {
  await db.exec('DELETE FROM sandboxes')
  return createD1SandboxStore(db)
})
