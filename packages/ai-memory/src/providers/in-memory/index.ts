import {
  inspectRecords,
  isExpired,
  listRecordFacts,
  recallRecords,
  sameScope,
  saveTurn,
} from '../../internal/store'
import type {
  BuiltinOptions,
  MemoryRecord,
  RecordStore,
} from '../../internal/store'
import type { MemoryAdapter, MemoryScope } from '../../types'

export interface InMemoryOptions extends BuiltinOptions {}

export function inMemory(options: InMemoryOptions = {}): MemoryAdapter {
  const records = new Map<string, MemoryRecord>()

  function sweep(): Array<MemoryRecord> {
    const now = Date.now()
    const live: Array<MemoryRecord> = []
    const storedRecords = records.values()
    for (const r of storedRecords) {
      if (isExpired(r, now)) records.delete(r.id)
      else live.push(r)
    }
    return live
  }

  const store: RecordStore = {
    async add(batch) {
      const now = Date.now()
      for (const r of batch) records.set(r.id, { ...r, updatedAt: now })
      sweep()
    },
    async loadScope(scope: MemoryScope) {
      return sweep().filter((r) => sameScope(r.scope, scope))
    },
  }

  return {
    id: 'in-memory',
    recall: (scope, query) => recallRecords(store, scope, query, options),
    save: (scope, turn) => saveTurn(store, scope, turn, options),
    inspect: (scope) => inspectRecords(store, scope),
    listFacts: (scope) => listRecordFacts(store, scope),
  }
}
