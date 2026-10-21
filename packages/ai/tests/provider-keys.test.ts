import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import {
  byokHeaderName,
  defineByokProvider,
  isKeyedAdapter,
  keyedAdapter,
  keyedAdapters,
} from '../src/byok'
import { getByokKey, keyedAdapterFromRequest } from '../src/byok/server'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { spawnAgentStream } from '../src/activities/chat/agents/spawn'
import { chat } from '../src/activities/chat'
import { collectChunks, createMockAdapter } from './test-utils'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'
import type { DefinedAgent } from '../src/activities/chat/agents/define-agent'
import type { KeyedAdapter, ProviderKeys } from '../src/byok'
import type { ProviderKeySource } from '../src/byok/env-keys'

const acme = defineByokProvider({ id: 'acme', label: 'Acme' })

/** A made-up adapter that keeps the key it was built with. */
const acmeImage = keyedAdapter(acme, (key) => ({ kind: 'image' as const, key }))

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

  it('builds the adapter with the key a host reads from the request', () => {
    const request = new Request('http://localhost/api/chat', {
      headers: { [byokHeaderName('acme')]: 'sk-user' },
    })
    const key = getByokKey(request, acmeImage.provider)
    if (key === null) throw new Error('no key')

    const built = acmeImage.create(key)
    expect(built).toEqual({ kind: 'image', key: 'sk-user' })
    expectTypeOf(built).toEqualTypeOf<{ kind: 'image'; key: string }>()
  })
})

describe('keyedAdapters', () => {
  const withEnv = defineByokProvider({
    id: 'envy',
    label: 'Envy',
    env: 'ENVY_API_KEY',
  })
  const models = keyedAdapters({
    acme: (key) => ({ kind: 'acme' as const, key }),
    envy: keyedAdapter(withEnv, (key) => ({ kind: 'envy' as const, key })),
  })
  const requestWith = (headers: Record<string, string>) =>
    new Request('http://localhost/api/chat', { headers })

  afterEach(() => vi.unstubAllEnvs())

  it('makes a keyed adapter per provider, keyed by the map key', () => {
    expect(isKeyedAdapter(models.acme)).toBe(true)
    expect(models.acme.provider).toBe('acme')
    expect(models.envy.provider).toBe(withEnv)
  })

  it('throws when an entry is a keyed adapter for another provider', () => {
    expect(() =>
      keyedAdapters({ acme: keyedAdapter(withEnv, (key) => key) }),
    ).toThrow('the "acme" entry is a keyed adapter for "envy"')
  })

  it('picks the provider whose key the user sent', () => {
    vi.stubEnv('ENVY_API_KEY', 'sk-env')
    const built = keyedAdapterFromRequest(
      requestWith({ [byokHeaderName('acme')]: 'sk-user' }),
      models,
    )
    expect(built).toEqual({ kind: 'acme', key: 'sk-user' })
    expectTypeOf(built).toEqualTypeOf<
      { kind: 'acme'; key: string } | { kind: 'envy'; key: string } | null
    >()
  })

  it('falls back to the env names of a descriptor entry', () => {
    vi.stubEnv('ENVY_API_KEY', 'sk-env')
    expect(keyedAdapterFromRequest(requestWith({}), models)).toEqual({
      kind: 'envy',
      key: 'sk-env',
    })
  })

  it('gives null when no provider has a key', () => {
    vi.stubEnv('ENVY_API_KEY', '')
    expect(keyedAdapterFromRequest(requestWith({}), models)).toBeNull()
  })

  it('takes a list of keyed adapters too', () => {
    const built = keyedAdapterFromRequest(
      requestWith({ [byokHeaderName('acme')]: 'sk-user' }),
      [acmeImage],
    )
    expect(built).toEqual({ kind: 'image', key: 'sk-user' })
  })
})

const envName = 'TANSTACK_AI_PROVIDER_KEYS_TEST'
const acmeEnv = defineByokProvider({ id: 'acme', label: 'Acme', env: envName })

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

describe('ctx.keys', () => {
  const acmeEnvImage = keyedAdapter(acmeEnv, (key) => ({
    kind: 'image' as const,
    key,
  }))

  afterEach(() => vi.unstubAllEnvs())

  it('is the provider keys of the binding', async () => {
    const keys = hostKeys('sk-host')
    expect(await runKeys({ keys })).toBe(keys)
  })

  it('reads the provider env var when the host sets no keys', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await runKeys()
    expect(await keys.get(acmeEnv)).toBe('sk-env')
    expect(await keys.require(acmeEnv)).toBe('sk-env')
    // A bare provider id has no env names.
    expect(await keys.get('acme')).toBeNull()
  })

  it('throws an error that names the env var when the key is missing', async () => {
    const keys = await runKeys()
    expect(await keys.get(acmeEnv)).toBeNull()
    await expect(keys.require(acmeEnv)).rejects.toThrow(
      `Missing Acme API key. Set ${envName}.`,
    )
    await expect(keys.require('acme')).rejects.toThrow('Missing acme API key.')
  })

  it('returns no key where process is missing', async () => {
    const keys = await runKeys()
    vi.stubGlobal('process', undefined)
    // `get` reads the env before its first await, so the stub is gone
    // before vitest needs `process` again.
    const pending = keys.get(acmeEnv)
    vi.unstubAllGlobals()
    expect(await pending).toBeNull()
  })

  it('builds a keyed adapter with the key and returns a plain adapter unchanged', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await runKeys()
    const { adapter: text } = createMockAdapter({})
    const choice: AnyTextAdapter | KeyedAdapter<AnyTextAdapter> = keyedAdapter(
      acmeEnv,
      () => text,
    )

    expect(await keys.adapter(acmeEnvImage)).toEqual({
      kind: 'image',
      key: 'sk-env',
    })
    expect(await keys.adapter(text)).toBe(text)
    expect(await keys.adapter(choice)).toBe(text)
    expectTypeOf(keys.adapter(acmeEnvImage)).resolves.toEqualTypeOf<{
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

/**
 * The `ctx.keys` of a probe that `chat({ subagents: { keys } })` starts.
 * With `nested`, a lead agent starts the probe through its own
 * `ctx.chat({ subagents: { ...nested } })`.
 */
async function chatKeys(
  keys: ProviderKeySource,
  nested?: { keys?: ProviderKeySource },
) {
  const { agent: target, seen } = probe()
  const { adapter } = createMockAdapter({ iterations: [] })
  const lead = defineAgent({
    name: 'lead',
    description: 'Starts the probe',
    run: (ctx) =>
      ctx.chat({
        adapter,
        subagents: { agents: [target], router: () => 'probe', ...nested },
      }),
  })
  const agents: Array<DefinedAgent> = nested ? [lead] : [target]
  const name = nested ? 'lead' : 'probe'
  await collectChunks(
    chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'Go' }],
      subagents: { agents, router: () => name, keys },
    }),
  )
  const found = seen[0]
  if (!found) throw new Error('the probe did not run')
  return found
}

describe('subagents.keys', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('gives agents the key of each provider id', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await chatKeys({ acme: 'sk-user' })
    const image = keyedAdapter(acmeEnv, (key) => ({ kind: 'image', key }))

    expect(await keys.require(acmeEnv)).toBe('sk-user')
    expect(await keys.get('acme')).toBe('sk-user')
    expect(await keys.adapter(image)).toEqual({ kind: 'image', key: 'sk-user' })
  })

  it('falls back to the env var for a missing or null key', async () => {
    vi.stubEnv(envName, 'sk-env')
    expect(await (await chatKeys({ acme: null })).require(acmeEnv)).toBe(
      'sk-env',
    )
    expect(await (await chatKeys({ other: 'sk-other' })).get(acmeEnv)).toBe(
      'sk-env',
    )
  })

  it('throws an error that names the env var when no key is found', async () => {
    const keys = await chatKeys({ acme: '' })
    await expect(keys.require(acmeEnv)).rejects.toThrow(
      `Missing Acme API key. Set ${envName}.`,
    )
  })

  it('gives a nested child the keys of the chat', async () => {
    const keys = await chatKeys({ acme: 'sk-user' }, {})
    expect(await keys.require(acmeEnv)).toBe('sk-user')
  })

  it('lets a nested chat set its own keys', async () => {
    const keys = await chatKeys(
      { acme: 'sk-user' },
      { keys: { acme: 'sk-own' } },
    )
    expect(await keys.require(acmeEnv)).toBe('sk-own')
  })

  it('reads keys from a function, with the provider it gets', async () => {
    vi.stubEnv(envName, 'sk-env')
    const asked: Array<unknown> = []
    const keys = await chatKeys(async (provider) => {
      asked.push(provider)
      return provider === acmeEnv ? 'sk-fn' : null
    })

    expect(await keys.require(acmeEnv)).toBe('sk-fn')
    expect(asked).toEqual([acmeEnv])
    // The function has no key for a bare id, so the env name is not read.
    expect(await keys.get('acme')).toBeNull()
  })

  it('falls back to the parent keys when a nested function has no key', async () => {
    const keys = await chatKeys({ acme: 'sk-user' }, { keys: () => null })
    expect(await keys.require(acmeEnv)).toBe('sk-user')
  })

  it('keeps the parent keys for providers that a nested chat does not set', async () => {
    vi.stubEnv(envName, 'sk-env')
    const keys = await chatKeys(
      { acme: 'sk-user' },
      { keys: { other: 'sk-other' } },
    )
    expect(await keys.require(acmeEnv)).toBe('sk-user')
    expect(await keys.get('other')).toBe('sk-other')
  })
})
