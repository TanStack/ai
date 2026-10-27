import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChatPersistence } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))

export function extractFence(markdown: string, id: string): string {
  const marker = `<!-- fence: ${id} -->`
  const markerAt = markdown.indexOf(marker)
  if (markerAt < 0) throw new Error(`Missing fence marker ${id}`)
  const open = markdown.indexOf('```', markerAt + marker.length)
  if (open < 0) throw new Error(`Missing opening fence for ${id}`)
  const bodyStart = markdown.indexOf('\n', open)
  if (bodyStart < 0) throw new Error(`Missing fence body for ${id}`)
  const close = markdown.indexOf('\n```', bodyStart + 1)
  if (close < 0) throw new Error(`Missing closing fence for ${id}`)
  return markdown.slice(bodyStart + 1, close)
}

export function readSkill(name: string): string {
  return readFileSync(
    join(here, '..', 'skills', 'ai-persistence', name, 'SKILL.md'),
    'utf8',
  )
}

function rewriteAppImports(source: string): string {
  return source
    .replaceAll("from '@/db/schema'", "from './schema'")
    .replaceAll("from '@/db'", "from './db'")
}

function writeGenerated(dir: string, files: Record<string, string>): void {
  const out = join(here, '.generated', dir)
  mkdirSync(out, { recursive: true })
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(out, name), contents)
  }
}

function isRecipe(
  value: unknown,
): value is { chatPersistence: ChatPersistence } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chatPersistence' in value &&
    typeof value.chatPersistence === 'object' &&
    value.chatPersistence !== null
  )
}

async function importRecipe(dir: string): Promise<ChatPersistence> {
  const specifier = new URL(
    `./.generated/${dir}/chat-persistence.ts`,
    import.meta.url,
  ).href
  const loaded: unknown = await import(specifier)
  if (!isRecipe(loaded)) {
    throw new Error(`${dir} did not export chatPersistence`)
  }
  return loaded.chatPersistence
}

export async function loadDrizzleRecipe(
  id: 'drizzle-sqlite' | 'drizzle-pg',
): Promise<ChatPersistence> {
  const skill = readSkill('build-drizzle-adapter')
  const schemaId =
    id === 'drizzle-sqlite' ? 'drizzle-sqlite-schema' : 'drizzle-pg-schema'
  const harness = id === 'drizzle-sqlite' ? 'sqlite' : 'pg'
  writeGenerated(id, {
    'schema.ts': `${extractFence(skill, schemaId)}\n`,
    'db.ts': `export { db } from '../../harness/${harness}'\n`,
    'chat-persistence.ts': `${rewriteAppImports(
      extractFence(skill, 'drizzle-chat-persistence'),
    )}\n`,
  })
  return importRecipe(id)
}

export async function loadCustomRecipe(): Promise<ChatPersistence> {
  const skill = readSkill('build-custom-adapter')
  writeGenerated('custom-pg', {
    'db.ts': `export { pool } from '../../harness/custom-pg'\n`,
    'chat-persistence.ts': `${rewriteAppImports(
      extractFence(skill, 'custom-chat-persistence'),
    )}\n`,
  })
  return importRecipe('custom-pg')
}
