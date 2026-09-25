import { expectTypeOf } from 'vitest'
import type { SandboxCreateInput, SandboxEnsureContext } from '../src'

const ensureWithoutName: SandboxEnsureContext = {
  threadId: 't',
  runId: 'r',
}
const ensureWithName: SandboxEnsureContext = {
  threadId: 't',
  runId: 'r',
  adapterName: 'grok-build',
}
const createEmpty: SandboxCreateInput = {}
const createWithName: SandboxCreateInput = { adapterName: 'codex' }

expectTypeOf(ensureWithoutName.adapterName).toEqualTypeOf<string | undefined>()
expectTypeOf(ensureWithName.adapterName).toEqualTypeOf<string | undefined>()
expectTypeOf(createEmpty.adapterName).toEqualTypeOf<string | undefined>()
expectTypeOf(createWithName.adapterName).toEqualTypeOf<string | undefined>()
