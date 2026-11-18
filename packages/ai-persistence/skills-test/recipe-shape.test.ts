import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractFence, readSkill } from './load-recipe'

const here = dirname(fileURLToPath(import.meta.url))

const skills = [
  'build-drizzle-adapter',
  'build-prisma-adapter',
  'build-custom-adapter',
  'build-cloudflare-adapter',
] as const

const tables = [
  'chat_threads',
  'chat_runs',
  'chat_interrupts',
  'chat_metadata',
] as const

const factories = [
  'messages: createMessageStore',
  'runs: createRunStore',
  'interrupts: createInterruptStore',
  'metadata: createMetadataStore',
] as const

describe('persistence adapter skills', () => {
  for (const name of skills) {
    it(`${name} names the four tables and store factories`, () => {
      const text = readSkill(name)
      for (const table of tables) expect(text).toContain(table)
      for (const factory of factories) expect(text).toContain(factory)
    })
  }

  it('keeps the sqlite schema stub equal to the skill fence', () => {
    const stub = readFileSync(
      join(here, 'stubs', 'drizzle-sqlite-schema.ts'),
      'utf8',
    )
    const fence = extractFence(
      readSkill('build-drizzle-adapter'),
      'drizzle-sqlite-schema',
    )
    expect(stub.trim()).toBe(fence.trim())
  })
})
