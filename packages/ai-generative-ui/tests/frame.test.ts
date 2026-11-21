import { describe, it, expect, vi } from 'vitest'
import {
  // registry / build
  REFERENCE_REGISTRY,
  checkImports,
  extractImports,
  packageBase,
  preflightReactImports,
  makeReactBuilder,
  describeRegistryForPrompt,
  // store
  InMemoryArtifactStore,
  hashContent,
  // shell
  buildCsp,
  buildShellDocument,
  FRAME_THEME_TOKEN_NAMES,
  OGUI_BRIDGE_MODULE_SOURCE,
  // bridge
  validateInbound,
  createFrameHost,
  SHELL_VERSION,
  FRAME_PROTOCOL,
  // tools
  getArtifactToolDefinitions,
  createArtifactTools,
  // fixtures
  FRAME_FIXTURES,
} from '../src/index'
import type {
  ArtifactBuilder,
  ArtifactRecord,
  BridgeEnvelope,
  FrameTheme,
} from '../src/index'

const THEME: FrameTheme = {
  mode: 'light',
  tokens: { '--ui-bg': '#fff', '--ui-accent': '#2563eb' },
}

/** A fake builder: react-tsx "compiles" by wrapping; fragment passes through. */
function fakeBuilder(): ArtifactBuilder {
  return makeReactBuilder(async ({ source }) => ({
    code: `/*built*/\n${source}`,
  }))
}

function newRecord(over: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    artifactId: 'art_1',
    revision: 1,
    contentHash: hashContent('x'),
    kind: 'html-fragment',
    title: 'T',
    fallbackText: 'fallback',
    source: '<p>hi</p>',
    provenance: { driver: 'fixture' },
    ownership: { ownerId: 'u1', scope: 'private' },
    trustTier: 'untrusted',
    createdAt: '2026-10-16T00:00:00.000Z',
    ...over,
  }
}

/* -------------------------------------------------------------------------- */
describe('Module registry + import allowlist (§7.3.2, §7.3.3)', () => {
  it('extracts static, bare, and dynamic imports', () => {
    const src = `import React from 'react'\nimport { x } from "@tanstack/react-table"\nimport '@ogui/bridge'\nconst y = import('@host/ui')`
    expect(extractImports(src)).toEqual(
      expect.arrayContaining([
        'react',
        '@tanstack/react-table',
        '@ogui/bridge',
        '@host/ui',
      ]),
    )
  })

  it('reduces scoped subpaths to the package base', () => {
    expect(packageBase('@tanstack/react-table/foo')).toBe(
      '@tanstack/react-table',
    )
    expect(packageBase('react/jsx-runtime')).toBe('react')
    expect(packageBase('react')).toBe('react')
  })

  it('allows registry modules, rejects unknown and relative imports', () => {
    const ok = checkImports(
      `import { useReactTable } from '@tanstack/react-table'`,
      REFERENCE_REGISTRY,
    )
    expect(ok.ok).toBe(true)
    expect(ok.externals).toContain('@tanstack/react-table')

    const bad = checkImports(
      `import axios from 'axios'\nimport './helper'`,
      REFERENCE_REGISTRY,
    )
    expect(bad.ok).toBe(false)
    expect(bad.diagnostics.map((d) => d.specifier)).toEqual(
      expect.arrayContaining(['axios', './helper']),
    )
  })

  it('preflight returns a failing BuildResult for disallowed imports', () => {
    const { result } = preflightReactImports(
      `import x from 'left-pad'`,
      REFERENCE_REGISTRY,
    )
    expect(result?.ok).toBe(false)
    expect(result?.diagnostics?.[0]?.specifier).toBe('left-pad')
  })

  it('describes the registry for the model', () => {
    const text = describeRegistryForPrompt(REFERENCE_REGISTRY)
    expect(text).toContain('@tanstack/react-table')
    expect(text).toContain(REFERENCE_REGISTRY.version)
  })
})

/* -------------------------------------------------------------------------- */
describe('Artifact store (§3)', () => {
  it('content hash is deterministic and dedupes', () => {
    expect(hashContent('a', 'b')).toBe(hashContent('a', 'b'))
    expect(hashContent('a', 'b')).not.toBe(hashContent('a', 'c'))
  })

  it('stores revisions immutably, returns latest and pinned (§3.3)', () => {
    const store = new InMemoryArtifactStore()
    store.save(newRecord({ revision: 1 }))
    store.save(newRecord({ revision: 2, supersedes: 1, title: 'T2' }))
    expect(store.latest('art_1')?.revision).toBe(2)
    expect(store.get('art_1', 1)?.title).toBe('T')
    expect(store.get('art_1')?.title).toBe('T2')
    expect(store.revisions('art_1').map((r) => r.revision)).toEqual([1, 2])
    expect(() => store.save(newRecord({ revision: 1 }))).toThrow(/immutable/)
  })

  it('lists latest-per-artifact with scope + query filters', () => {
    const store = new InMemoryArtifactStore()
    store.save(
      newRecord({
        artifactId: 'a',
        title: 'Chord card',
        createdAt: '2026-10-16T01:00:00Z',
      }),
    )
    store.save(
      newRecord({
        artifactId: 'b',
        title: 'Spend monitor',
        ownership: { ownerId: 'u1', scope: 'pod' },
        createdAt: '2026-10-16T02:00:00Z',
      }),
    )
    expect(store.list().length).toBe(2)
    expect(store.list({ scope: 'pod' }).map((r) => r.artifactId)).toEqual(['b'])
    expect(store.list({ query: 'chord' }).map((r) => r.artifactId)).toEqual([
      'a',
    ])
  })

  it('blob store is content-addressed and write-once', () => {
    const store = new InMemoryArtifactStore()
    store.blobs.put('h', 'v1')
    store.blobs.put('h', 'v2')
    expect(store.blobs.get('h')).toBe('v1')
    expect(store.blobs.has('h')).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
describe('Shell + CSP (§4.3, §5)', () => {
  it('react-tsx CSP is strict (no unsafe-inline/eval), fragment relaxes script-src', () => {
    const react = buildCsp({
      kind: 'react-tsx',
      appOrigin: 'https://app.test',
      nonce: 'abc',
    })
    expect(react).toContain(`script-src 'self' https://app.test 'nonce-abc'`)
    expect(react).not.toContain('unsafe-eval')
    // script-src must not relax to unsafe-inline (style-src still may).
    expect(react).not.toContain(`script-src 'self' 'unsafe-inline'`)
    expect(react).toContain(`default-src 'none'`)
    expect(react).toContain(`connect-src 'none'`)

    const frag = buildCsp({
      kind: 'html-fragment',
      appOrigin: 'https://app.test',
    })
    expect(frag).toContain(`script-src 'self' 'unsafe-inline'`)
  })

  it('network grants widen connect-src for exactly that revision (§9.3)', () => {
    const csp = buildCsp({
      kind: 'react-tsx',
      appOrigin: 'https://app.test',
      connectGrants: ['https://api.example.com'],
    })
    expect(csp).toContain('connect-src https://api.example.com')
  })

  it('fragment shell inlines source, injects theme + bridge client + fallback', () => {
    const rec = newRecord({
      source: '<p data-x>hello</p>',
      fallbackText: 'HELLO TEXT',
    })
    const html = buildShellDocument({
      record: rec,
      instanceId: 'inst_1',
      appOrigin: 'https://app.test',
      theme: THEME,
    })
    expect(html).toContain('<p data-x>hello</p>')
    expect(html).toContain('--ui-accent:#2563eb')
    expect(html).toContain(FRAME_PROTOCOL)
    expect(html).toContain('HELLO TEXT') // noscript fallback
    expect(html).toContain('frame.ready')
  })

  it('react-tsx shell emits import map, nonce, and a shell-owned bootstrap', () => {
    const rec = newRecord({
      kind: 'react-tsx',
      builtRef: 'store://assets/x',
      registryVersion: REFERENCE_REGISTRY.version,
    })
    const html = buildShellDocument({
      record: rec,
      instanceId: 'inst_1',
      appOrigin: 'https://app.test',
      theme: THEME,
      registry: REFERENCE_REGISTRY,
      builtUrl: '/sandbox/_assets/x',
      props: { data: { total: 5 } },
      nonce: 'N1',
    })
    expect(html).toContain('type="importmap"')
    expect(html).toContain('"react"')
    expect(html).toContain('nonce="N1"')
    expect(html).toContain('createRoot') // bootstrap the model never writes (§7.3.1)
    expect(html).toContain('/sandbox/_assets/x')
    expect(html).toContain('"total":5')
  })

  it('exposes canonical theme token names and the bridge module', () => {
    expect(FRAME_THEME_TOKEN_NAMES).toContain('--ui-accent')
    expect(OGUI_BRIDGE_MODULE_SOURCE).toContain('useHostState')
    expect(OGUI_BRIDGE_MODULE_SOURCE).toContain("from 'react'")
  })
})

/* -------------------------------------------------------------------------- */
describe('Bridge protocol — contract (§6, §10.2)', () => {
  const ctx = { artifactId: 'art_1', instanceId: 'inst_1' }

  it('validates envelope: ns, type, ids, payload', () => {
    const good: BridgeEnvelope = {
      ns: FRAME_PROTOCOL,
      type: 'frame.resize',
      ...ctx,
      payload: { height: 42 },
    }
    expect(validateInbound(good, ctx).ok).toBe(true)

    expect(validateInbound({ ...good, ns: 'nope' }, ctx).ok).toBe(false)
    expect(validateInbound({ ...good, type: 'host.init' }, ctx).ok).toBe(false) // host→frame rejected inbound
    expect(validateInbound({ ...good, instanceId: 'other' }, ctx).ok).toBe(
      false,
    )
    expect(
      validateInbound({ ...good, payload: { height: 'tall' } }, ctx).ok,
    ).toBe(false)
    expect(validateInbound({ ...good, type: 'frame.bogus' }, ctx).ok).toBe(
      false,
    )
  })

  it('answers frame.ready with host.init carrying theme + state + registry', async () => {
    const sent: BridgeEnvelope[] = []
    const host = createFrameHost(ctx, {
      getTheme: () => THEME,
      getState: () => ({ selected: 3 }),
      setState: () => {},
      getData: () => ({ rows: [] }),
      registryVersion: 'runtime-x',
      send: (e) => sent.push(e),
    })
    await host.handleMessage({
      ns: FRAME_PROTOCOL,
      type: 'frame.ready',
      ...ctx,
      payload: { kind: 'html-fragment', shellVersion: SHELL_VERSION },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.type).toBe('host.init')
    const payload = sent[0]?.payload as any
    expect(payload.theme).toEqual(THEME)
    expect(payload.state).toEqual({ selected: 3 })
    expect(payload.registryVersion).toBe('runtime-x')
  })

  it('persists frame.state.set to the host (§6.4)', async () => {
    const setState = vi.fn()
    const host = createFrameHost(ctx, {
      getTheme: () => THEME,
      getState: () => ({}),
      setState,
      send: () => {},
    })
    await host.handleMessage({
      ns: FRAME_PROTOCOL,
      type: 'frame.state.set',
      ...ctx,
      payload: { state: { a: 1 } },
    })
    expect(setState).toHaveBeenCalledWith({ a: 1 })
  })

  it('routes an action intent and returns host.intent.result when a requestId is set (§6.3)', async () => {
    const sent: BridgeEnvelope[] = []
    const onIntent = vi.fn(async () => ({
      ok: true,
      result: { approved: true },
    }))
    const host = createFrameHost(ctx, {
      getTheme: () => THEME,
      getState: () => ({}),
      setState: () => {},
      onIntent,
      send: (e) => sent.push(e),
    })
    await host.handleMessage({
      ns: FRAME_PROTOCOL,
      type: 'frame.intent.action',
      ...ctx,
      requestId: 'req_9',
      payload: {
        intent: 'addToSongbook',
        payload: { chord: 'Emaj7' },
        state: { selected: 1 },
      },
    })
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        intentClass: 'action',
        intent: 'addToSongbook',
      }),
    )
    const result = sent.find((e) => e.type === 'host.intent.result')
    expect(result?.payload).toMatchObject({
      requestId: 'req_9',
      ok: true,
      result: { approved: true },
    })
  })

  it('drops malformed messages and logs the reason (§6.1)', async () => {
    const onDrop = vi.fn()
    const host = createFrameHost(ctx, {
      getTheme: () => THEME,
      getState: () => ({}),
      setState: () => {},
      onDrop,
      send: () => {},
    })
    await host.handleMessage({
      ns: 'bad',
      type: 'frame.ready',
      ...ctx,
      payload: {},
    })
    expect(onDrop).toHaveBeenCalledWith(
      expect.stringContaining('bad ns'),
      expect.anything(),
    )
  })

  it('pushData sends a host.data envelope the frame reads for live updates (§6.2)', () => {
    const sent: BridgeEnvelope[] = []
    const host = createFrameHost(ctx, {
      getTheme: () => THEME,
      getState: () => ({}),
      setState: () => {},
      send: (e) => sent.push(e),
    })
    host.pushData({ total: 42 })
    host.pushData({ total: 99 })
    const dataEvents = sent.filter((e) => e.type === 'host.data')
    expect(dataEvents).toHaveLength(2)
    expect(dataEvents[0]?.payload).toEqual({ data: { total: 42 } })
    expect(dataEvents[1]?.payload).toEqual({ data: { total: 99 } })
    // Same instance addressing as every other envelope.
    expect(dataEvents[0]).toMatchObject({
      ns: FRAME_PROTOCOL,
      artifactId: 'art_1',
      instanceId: 'inst_1',
    })
  })
})

/* -------------------------------------------------------------------------- */
describe('Artifact tools (§8.1)', () => {
  it('exposes create/revise/read/list/render definitions tailored to the registry', () => {
    const defs = getArtifactToolDefinitions(REFERENCE_REGISTRY)
    expect(defs.map((d) => d.name)).toEqual([
      'create_artifact',
      'revise_artifact',
      'read_artifact',
      'list_artifacts',
      'render_artifact',
    ])
    const create = defs.find((d) => d.name === 'create_artifact')!
    expect(JSON.stringify(create.parameters)).toContain('@tanstack/react-table')
  })

  it('create builds a react-tsx artifact, stores the bundle, returns a pin + url', async () => {
    const store = new InMemoryArtifactStore()
    const tools = createArtifactTools({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
      baseUrl: 'https://app.test',
      ownerId: 'u1',
      now: () => '2026-10-16T00:00:00Z',
      genId: () => 'art_abc',
    })
    const res = await tools.create({
      kind: 'react-tsx',
      title: 'Card',
      source: FRAME_FIXTURES['chord-card-tsx']!.source,
      fallbackText: 'fb',
    })
    expect(res).toEqual({
      artifactId: 'art_abc',
      revision: 1,
      url: 'https://app.test/a/art_abc',
    })
    const rec = store.latest('art_abc')!
    expect(rec.kind).toBe('react-tsx')
    expect(rec.builtRef).toMatch(/^store:\/\/assets\//)
    expect(rec.registryVersion).toBe(REFERENCE_REGISTRY.version)
    expect(
      store.blobs.get(rec.builtRef!.replace('store://assets/', '')),
    ).toContain('/*built*/')
  })

  it('create returns structured build errors for a disallowed import (§7.3.3)', async () => {
    const store = new InMemoryArtifactStore()
    const tools = createArtifactTools({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
      genId: () => 'art_x',
    })
    const res = await tools.create({
      kind: 'react-tsx',
      title: 'Bad',
      source: `import axios from 'axios'\nexport default () => null`,
      fallbackText: 'fb',
    })
    expect(res).toMatchObject({ error: 'build-failed' })
    if ('diagnostics' in res)
      expect(res.diagnostics[0]?.specifier).toBe('axios')
    expect(store.latest('art_x')).toBeUndefined() // nothing stored on failure
  })

  it('revise creates an immutable N+1 revision that supersedes N (§3.4.2)', async () => {
    const store = new InMemoryArtifactStore()
    const tools = createArtifactTools({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
      genId: () => 'art_r',
      now: () => '2026-10-16T00:00:00Z',
    })
    await tools.create({
      kind: 'html-fragment',
      title: 'Frag',
      source: '<p>v1</p>',
      fallbackText: 'fb',
    })
    const res = await tools.revise({
      artifactId: 'art_r',
      source: '<p>v2</p>',
      note: 'blue',
    })
    expect(res).toMatchObject({ revision: 2 })
    expect(store.get('art_r', 1)?.source).toBe('<p>v1</p>')
    expect(store.get('art_r', 2)?.supersedes).toBe(1)
  })

  it('list surfaces the library for reuse', async () => {
    const store = new InMemoryArtifactStore()
    const tools = createArtifactTools({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
    })
    await tools.create({
      kind: 'html-fragment',
      title: 'Emaj7 chord',
      source: '<p/>',
      fallbackText: 'fb',
    })
    expect(tools.list({ query: 'chord' }).length).toBe(1)
  })

  it('create_artifact exposes a dataSource param for live binding', () => {
    const create = getArtifactToolDefinitions(REFERENCE_REGISTRY).find(
      (d) => d.name === 'create_artifact',
    )!
    const props = (create.parameters as any).properties
    expect(props.dataSource).toBeDefined()
    expect(props.dataSource.properties.name).toBeDefined()
  })

  it('create persists a dataSource binding on the record, and revise carries it forward', async () => {
    const store = new InMemoryArtifactStore()
    const tools = createArtifactTools({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
      genId: () => 'art_live',
    })
    await tools.create({
      kind: 'html-fragment',
      title: 'Monitor',
      source: '<p>v1</p>',
      fallbackText: 'fb',
      dataSource: { name: 'spendFeed', params: { currency: 'USD' } },
    })
    expect(store.latest('art_live')?.dataSource).toEqual({
      name: 'spendFeed',
      params: { currency: 'USD' },
    })
    await tools.revise({ artifactId: 'art_live', source: '<p>v2</p>' })
    expect(store.get('art_live', 2)?.dataSource).toEqual({
      name: 'spendFeed',
      params: { currency: 'USD' },
    })
  })
})

/* -------------------------------------------------------------------------- */
describe('Fixtures (§10.3)', () => {
  it('chord-card-tsx only imports registry modules', () => {
    const check = checkImports(
      FRAME_FIXTURES['chord-card-tsx']!.source,
      REFERENCE_REGISTRY,
    )
    expect(check.ok).toBe(true)
  })
  it('spend-monitor imports TanStack Table + Charts from the registry', () => {
    const check = checkImports(
      FRAME_FIXTURES['spend-monitor']!.source,
      REFERENCE_REGISTRY,
    )
    expect(check.ok).toBe(true)
    expect(check.externals).toEqual(
      expect.arrayContaining([
        '@tanstack/react-table',
        '@tanstack/react-charts',
      ]),
    )
  })
  it('live-spend-monitor declares a dataSource binding and only imports registry modules', () => {
    const fx = FRAME_FIXTURES['live-spend-monitor']!
    expect(fx.dataSource?.name).toBe('spendFeed')
    const check = checkImports(fx.source, REFERENCE_REGISTRY)
    expect(check.ok).toBe(true)
    // Reads the live value via the bridge's useHostData hook.
    expect(fx.source).toContain('useHostData')
  })
  it('every fixture declares fallbackText (§5.3)', () => {
    for (const f of Object.values(FRAME_FIXTURES))
      expect(f.fallbackText.length).toBeGreaterThan(10)
  })
})
