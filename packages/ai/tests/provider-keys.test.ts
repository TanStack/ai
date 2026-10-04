import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { spawnAgentStream } from '../src/activities/chat/agents/spawn'
import { defineByokProvider, isKeyedAdapter, keyedAdapter } from '../src/byok'
import { collectChunks, createMockAdapter } from './test-utils'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'
import type { DefinedAgent } from '../src/activities/chat/agents/define-agent'
import type { KeyedAdapter, ProviderKeys } from '../src/byok'

const envName = 'TANSTACK_AI_PROVIDER_KEYS_TEST'
const acme = defineByokProvider({ id: 'acme', label: 'Acme', env: envName })

/** A made-up adapter that keeps the key it was built with. */
const acmeImage = keyedAdapter(acme, (key) => ({ kind: 'image' as const, key }))

const input = {
  input: undefined,
  messages: [],
  threadId: 'thread-1',
  runId: 'run-1',
  parentRunId: 'parent-1',
  subagentRunId: 'child-1',
}

/** Provider keys a host would pass: every provider gets `key`. */
function hostKeys(key: string): ProviderKeys {
  return {
    get: async () => key,
    require: async () => key,
    adapter: async (adapter) =>
      isKeyedAdapter(adapter) ? adapter.create(key) : adapter,
  }
}

/** An agent that records the `ctx.keys` its run gets. */
function probe() {
  const seen: Array<ProviderKeys> = []
  const agent = defineAgent({
    name: 'probe',
    description: 'Records ctx.keys',
    run: (ctx) => {
      seen.push(ctx.keys)
      return Promise.resolve('ok')
    },
  })
  return { agent, seen }
}

/** Run `agent` the way a host does, outside a parent chat turn. */
function run(agent: DefinedAgent, binding?: SubagentBinding) {
  return collectChunks(
    spawnAgentStream(agent, input, undefined, undefined, binding),
  )
}

/** The `ctx.keys` of one probe run. */
async function runKeys(binding?: SubagentBinding) {
  const { agent, seen } = probe()
  await run(agent, binding)
  const keys = seen[0]
  if (!keys) throw new Error('the probe did not run')
  return keys
}

/**
 * The `ctx.keys` of a probe that a parent agent starts through its own
 * `ctx.chat({ subagents })`. `own` is the binding that nested chat sets.
 */
async function nestedKeys(host: SubagentBinding, own?: SubagentBinding) {
  const { agent: child, seen } = probe()
  const { adapter } = createMockAdapter({ iterations: [] })
  const lead = defineAgent({
    name: 'lead',
    description: 'Starts the probe',
    run: (ctx) =>
      ctx.chat({
        adapter,
        subagents: {
          agents: [child],
          router: () => 'probe',
          ...(own ? { binding: own } : {}),
        },
      }),
  })
  await run(lead, host)
  return seen[0]
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('keyedAdapter', () => {
  it('marks the value so a host can tell it from a plain adapter', () => {
    const { adapter } = createMockAdapter({})
    expect(isKeyedAdapter(acmeImage)).toBe(true)
    expect(acmeImage.provider).toBe(acme)
    expect(isKeyedAdapter(adapter)).toBe(false)
    expect(isKeyedAdapter(null)).toBe(false)
  })

  it('throws on an invalid provider id', () => {
    expect(() => keyedAdapter('Acme', (key) => key)).toThrow(
      'Invalid BYOK provider id: Acme',
    )
  })
})

describe('ctx.keys', () => {
  it('is the provider keys of the binding', async () => {
    const keys = hostKeys('sk-host')
    expect(await runKeys({ keys })).toBe(keys)
  })

  it('reads the provider env var when the host sets no keys', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await runKeys()
    expect(await keys.get(acme)).toBe('sk-env')
    expect(await keys.require(acme)).toBe('sk-env')
    // A bare provider id has no env names.
    expect(await keys.get('acme')).toBeNull()
  })

  it('throws an error that names the env var when the key is missing', async () => {
    const keys = await runKeys()
    expect(await keys.get(acme)).toBeNull()
    await expect(keys.require(acme)).rejects.toThrow(
      `Missing Acme API key. Set ${envName}.`,
    )
    await expect(keys.require('acme')).rejects.toThrow('Missing acme API key.')
  })

  it('returns no key where process is missing', async () => {
    const keys = await runKeys()
    vi.stubGlobal('process', undefined)
    // `get` reads the env before its first await, so the stub is gone
    // before vitest needs `process` again.
    const pending = keys.get(acme)
    vi.unstubAllGlobals()
    expect(await pending).toBeNull()
  })

  it('builds a keyed adapter with the key and returns a plain adapter unchanged', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await runKeys()
    const { adapter: text } = createMockAdapter({})
    const choice: AnyTextAdapter | KeyedAdapter<AnyTextAdapter> = keyedAdapter(
      acme,
      () => text,
    )

    expect(await keys.adapter(acmeImage)).toEqual({
      kind: 'image',
      key: 'sk-env',
    })
    expect(await keys.adapter(text)).toBe(text)
    expect(await keys.adapter(choice)).toBe(text)
    expectTypeOf(keys.adapter(acmeImage)).resolves.toEqualTypeOf<{
      kind: 'image'
      key: string
    }>()
    expectTypeOf(keys.adapter(choice)).resolves.toEqualTypeOf<AnyTextAdapter>()
  })

  it('gives a nested child the keys of the parent binding', async () => {
    const keys = hostKeys('sk-host')
    expect(await nestedKeys({ keys })).toBe(keys)
  })

  it('lets a nested chat pass its own keys', async () => {
    const own = hostKeys('sk-own')
    expect(await nestedKeys({ keys: hostKeys('sk-host') }, { keys: own })).toBe(
      own,
    )
  })
})
