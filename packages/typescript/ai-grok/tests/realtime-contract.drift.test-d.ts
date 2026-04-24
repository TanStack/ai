/**
 * Type-level drift check: our locally-inlined `RealtimeAdapter` /
 * `RealtimeConnection` contracts must stay structurally assignable to the
 * canonical ones in `@tanstack/ai-client`. If `@tanstack/ai-client` ever
 * adds, renames, or changes the signature of a required field, this file
 * will fail to compile and we must update `src/realtime/realtime-contract.ts`.
 *
 * `@tanstack/ai-client` is a devDependency for exactly this check; it's NOT
 * a peerDependency of `@tanstack/ai-grok` so consumers don't need to install
 * it unless they're actually using `RealtimeClient`.
 */
import type {
  RealtimeAdapter as CanonicalRealtimeAdapter,
  RealtimeConnection as CanonicalRealtimeConnection,
} from '@tanstack/ai-client'
import type {
  RealtimeAdapter as LocalRealtimeAdapter,
  RealtimeConnection as LocalRealtimeConnection,
} from '../src/realtime/realtime-contract'

// Accept-assign in both directions so the inlined types neither over- nor
// under-specify the canonical ones.
const _adapterFromLocal: CanonicalRealtimeAdapter = {} as LocalRealtimeAdapter
const _adapterFromCanonical: LocalRealtimeAdapter =
  {} as CanonicalRealtimeAdapter
const _connectionFromLocal: CanonicalRealtimeConnection =
  {} as LocalRealtimeConnection
const _connectionFromCanonical: LocalRealtimeConnection =
  {} as CanonicalRealtimeConnection

// Silence unused-variable complaints in case a future reviewer enables them.
export type _DriftCheck = [
  typeof _adapterFromLocal,
  typeof _adapterFromCanonical,
  typeof _connectionFromLocal,
  typeof _connectionFromCanonical,
]
