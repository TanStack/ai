import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { defineCredentialStore } from '@tanstack/ai-persistence'
import type { Credential } from '@tanstack/ai-persistence'

/**
 * Sign-ins (Notion, Linear) saved in a file in your home folder, so they
 * survive a restart. The file is readable by your user only. A production
 * store would encrypt the values.
 */
export function fileCredentials(
  file = join(homedir(), '.tanstack-harness-example', 'credentials.json'),
) {
  type Saved = Record<string, Record<string, Credential>>
  const load = async (): Promise<Saved> => {
    try {
      const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Saved)
        : {}
    } catch {
      return {}
    }
  }
  const save = async (all: Saved) => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(all, null, 2), { mode: 0o600 })
  }
  const owner = (scope: { userId?: string; tenantId?: string }) =>
    `${scope.tenantId ?? '-'}/${scope.userId ?? '-'}`

  return defineCredentialStore({
    get: async (scope, id) => (await load())[owner(scope)]?.[id] ?? null,
    set: async (scope, id, credential) => {
      const all = await load()
      all[owner(scope)] = { ...all[owner(scope)], [id]: credential }
      await save(all)
    },
    delete: async (scope, id) => {
      const all = await load()
      delete all[owner(scope)]?.[id]
      await save(all)
    },
    list: async (scope) =>
      Object.entries((await load())[owner(scope)] ?? {}).map(
        ([id, credential]) => ({
          id,
          type: credential.type,
        }),
      ),
  })
}
