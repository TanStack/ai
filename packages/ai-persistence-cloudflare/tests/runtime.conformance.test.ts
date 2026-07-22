/// <reference types="@cloudflare/workers-types" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { cloudflarePersistence, d1Migrations } from '../src/index'
import { composePersistence } from '@tanstack/ai-persistence'
import type { AIPersistence, InterruptStore } from '@tanstack/ai-persistence'

interface RuntimeBindings {
  AI_DB: D1Database
}

describe('Cloudflare persistence on Miniflare bindings', () => {
  let miniflare: Miniflare
  let persistence: AIPersistence

  beforeAll(async () => {
    miniflare = new Miniflare({
      compatibilityDate: '2026-06-24',
      d1Databases: ['AI_DB'],
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    const bindings = await miniflare.getBindings<RuntimeBindings>()
    for (const migration of d1Migrations) {
      const statements = migration.sql
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
      await bindings.AI_DB.batch(
        statements.map((statement) => bindings.AI_DB.prepare(statement)),
      )
    }
    persistence = cloudflarePersistence({
      d1: bindings.AI_DB,
    })
  })

  afterAll(async () => {
    await miniflare.dispose()
  })

  runPersistenceConformance('cloudflare-d1', () => persistence, {
    // This composition supplies only a D1 binding (no Durable Object), so
    // there is no lock store.
    skip: ['locks'],
  })

  it('composes a custom interrupt store while retaining D1 runs', () => {
    const customInterrupts: InterruptStore = {
      create: () => Promise.resolve(),
      resolve: () => Promise.resolve(),
      cancel: () => Promise.resolve(),
      get: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      listPending: () => Promise.resolve([]),
      listByRun: () => Promise.resolve([]),
      listPendingByRun: () => Promise.resolve([]),
    }
    const composed = composePersistence(persistence, {
      overrides: { interrupts: customInterrupts },
    })

    expect(composed.stores.interrupts).toBe(customInterrupts)
    expect(composed.stores.runs).toBe(persistence.stores.runs)
  })

  it('removes only stores explicitly disabled by an override', () => {
    const composed = composePersistence(persistence, {
      overrides: { interrupts: false },
    })

    expect('interrupts' in composed.stores).toBe(false)
    expect(composed.stores.runs).toBe(persistence.stores.runs)
    expect(composed.stores.messages).toBe(persistence.stores.messages)
  })
})
