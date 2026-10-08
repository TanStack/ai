import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { defineCredentialStore } from '@tanstack/ai-persistence'
import type { Credential } from '@tanstack/ai-persistence'

/** The folder in your home folder where the example saves its files. */
export const SAVE_DIR = join(homedir(), '.tanstack-harness-batman')

/**
 * Values in groups, saved as JSON in `file`. `load` gives `{}` for a missing
 * or broken file. `update` changes the saved values. Updates run one after
 * the other, so a second update never loses the first.
 */
export function jsonFile<TValue>(file: string) {
  type Saved = Record<string, Record<string, TValue>>
  let updating = Promise.resolve()
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
  const update = (change: (all: Saved) => void) => {
    const run = updating.then(async () => {
      const all = await load()
      change(all)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(all, null, 2), { mode: 0o600 })
    })
    updating = run.catch(() => {})
    return run
  }
  return { load, update }
}

/**
 * Sign-ins (Notion, Linear) and model keys (`/connect openai`) saved in a
 * file in your home folder, so they survive a restart. The file is readable
 * by your user only. A production store would encrypt the values.
 */
export function fileCredentials(file = join(SAVE_DIR, 'credentials.json')) {
  const { load, update } = jsonFile<Credential>(file)
  const owner = (scope: { userId?: string; tenantId?: string }) =>
    `${scope.tenantId ?? '-'}/${scope.userId ?? '-'}`

  return defineCredentialStore({
    get: async (scope, id) => (await load())[owner(scope)]?.[id] ?? null,
    set: (scope, id, credential) =>
      update((all) => {
        all[owner(scope)] = { ...all[owner(scope)], [id]: credential }
      }),
    delete: (scope, id) =>
      update((all) => {
        delete all[owner(scope)]?.[id]
      }),
    list: async (scope) =>
      Object.entries((await load())[owner(scope)] ?? {}).map(
        ([id, credential]) => ({
          id,
          type: credential.type,
        }),
      ),
  })
}
