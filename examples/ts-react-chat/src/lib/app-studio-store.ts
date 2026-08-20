import { InMemoryLockStore } from '@tanstack/ai/locks'
import { InMemorySandboxInstanceStore } from '@tanstack/ai-sandbox'
import { sqliteSandboxSnapshots } from './sqlite-persistence'

let snapshots: ReturnType<typeof sqliteSandboxSnapshots> | undefined
const instances = new InMemorySandboxInstanceStore()
const locks = new InMemoryLockStore()

export function appStudioSnapshots() {
  return (snapshots ??= sqliteSandboxSnapshots({
    url: './.data/app-studio.db',
    migrate: true,
  }))
}

export function appStudioInstances() {
  return instances
}

export function appStudioLocks() {
  return locks
}
