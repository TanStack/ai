import { describe, it, expect, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { REFERENCE_REGISTRY, makeReactBuilder, hashContent } from '../src/index'
import type { ArtifactBuilder, ArtifactRecord } from '../src/index'
import {
  createInMemoryFrameArtifactStore,
  createBlobArtifactStore,
  createFrameArtifacts,
  generativeUiArtifacts,
  artifactResourceUri,
  parseArtifactResourceUri,
  MCP_APP_MIME_TYPE,
} from '../src/artifacts'

/** react-tsx "compiles" by wrapping; fragment passes through. */
function fakeBuilder(): ArtifactBuilder {
  return makeReactBuilder(async ({ source }) => ({ code: `/*built*/\n${source}` }))
}

function rec(over: Partial<ArtifactRecord> = {}): ArtifactRecord {
  return {
    artifactId: 'art_1',
    revision: 1,
    contentHash: hashContent('x'),
    kind: 'react-tsx',
    title: 'T',
    fallbackText: 'fb',
    source: 'export default () => null',
    builtRef: 'store://assets/h1',
    registryVersion: REFERENCE_REGISTRY.version,
    provenance: { driver: 'live' },
    ownership: { ownerId: 'u1', scope: 'private' },
    trustTier: 'untrusted',
    createdAt: '2026-10-16T00:00:00.000Z',
    ...over,
  }
}

/* -------------------------------------------------------------------------- */
describe.each([
  ['in-memory', () => createInMemoryFrameArtifactStore()],
  ['blob-backed', () => createBlobArtifactStore(memoryPersistence().stores.blobs)],
])('FrameArtifactStore (%s)', (_label, make) => {
  it('saves revisions, serves latest/pinned/built, lists latest-per-artifact', async () => {
    const store = make()
    await store.save(rec({ revision: 1, builtRef: 'store://assets/h1' }), 'BUILT1')
    await store.save(rec({ revision: 2, supersedes: 1, title: 'T2', builtRef: 'store://assets/h2', createdAt: '2026-10-16T01:00:00.000Z' }), 'BUILT2')

    expect((await store.latest('art_1'))?.revision).toBe(2)
    expect((await store.get('art_1', 1))?.title).toBe('T')
    expect((await store.get('art_1'))?.title).toBe('T2')
    expect((await store.revisions('art_1')).map((r) => r.revision)).toEqual([1, 2])
    expect(await store.getBuilt('h1')).toBe('BUILT1')
    expect(await store.getBuilt('h2')).toBe('BUILT2')

    await store.save(rec({ artifactId: 'art_2', title: 'Other', builtRef: 'store://assets/h3', createdAt: '2026-10-16T02:00:00.000Z' }), 'B3')
    const list = await store.list()
    expect(list.map((r) => r.artifactId)).toContain('art_1')
    expect(list.map((r) => r.artifactId)).toContain('art_2')
    expect(await store.list({ query: 'other' })).toHaveLength(1)
  })

  it('rejects a duplicate revision (immutability, §3.2)', async () => {
    const store = make()
    await store.save(rec({ revision: 1 }), 'B')
    await expect(store.save(rec({ revision: 1 }), 'B')).rejects.toThrow(/exists/)
  })
})

/* -------------------------------------------------------------------------- */
describe('createFrameArtifacts (§8.1 operations)', () => {
  it('create builds + stores + returns a pin; revise makes rev 2', async () => {
    const store = createInMemoryFrameArtifactStore()
    const ops = createFrameArtifacts({ store, builder: fakeBuilder(), baseUrl: 'https://app.test', genId: () => 'art_x', now: () => '2026-10-16T00:00:00Z' })

    const created = await ops.create({ kind: 'html-fragment', title: 'Frag', source: '<p>v1</p>', fallbackText: 'fb' })
    expect(created).toEqual({ artifactId: 'art_x', revision: 1, url: 'https://app.test/a/art_x' })

    const revised = await ops.revise({ artifactId: 'art_x', source: '<p>v2</p>' })
    expect(revised).toMatchObject({ revision: 2 })
    expect((await store.get('art_x', 1))?.source).toBe('<p>v1</p>')
    expect((await store.get('art_x', 2))?.supersedes).toBe(1)
  })

  it('a react-tsx build stores the built bundle addressable by hash', async () => {
    const store = createInMemoryFrameArtifactStore()
    const ops = createFrameArtifacts({ store, builder: fakeBuilder(), genId: () => 'art_r' })
    await ops.create({ kind: 'react-tsx', title: 'Card', source: `import { useHostState } from '@ogui/bridge'\nexport default () => null`, fallbackText: 'fb' })
    const built = store.get('art_r').then((r) => r && store.getBuilt(r.builtRef!.replace('store://assets/', '')))
    expect(await built).toContain('/*built*/')
  })

  it('a disallowed import returns a structured build error and stores nothing (§7.3.3)', async () => {
    const store = createInMemoryFrameArtifactStore()
    const ops = createFrameArtifacts({ store, builder: fakeBuilder(), genId: () => 'art_bad' })
    const res = await ops.create({ kind: 'react-tsx', title: 'Bad', source: `import axios from 'axios'\nexport default () => null`, fallbackText: 'fb' })
    expect(res).toMatchObject({ error: 'build-failed' })
    if ('diagnostics' in res) expect(res.diagnostics[0]?.specifier).toBe('axios')
    expect(await store.latest('art_bad')).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
describe('generativeUiArtifacts middleware', () => {
  const mw = (store = createInMemoryFrameArtifactStore(), extra = {}) =>
    generativeUiArtifacts({ store, builder: fakeBuilder(), registry: REFERENCE_REGISTRY, genId: () => 'art_1', now: () => 't', ...extra })

  it('onConfig injects the four artifact tools', () => {
    const out: any = mw().onConfig!({} as any, { tools: [] } as any)
    expect(out.tools.map((t: any) => t.name)).toEqual(['create_artifact', 'revise_artifact', 'list_artifacts', 'read_artifact'])
  })

  it('is idempotent — only adds tools not already present', () => {
    const out: any = mw().onConfig!({} as any, { tools: [{ name: 'create_artifact' }, { name: 'list_artifacts' }] } as any)
    expect(out.tools.map((t: any) => t.name)).toEqual(['create_artifact', 'list_artifacts', 'revise_artifact', 'read_artifact'])
  })

  it('create_artifact executes, stores, returns a pin, and emits genui:artifact', async () => {
    const store = createInMemoryFrameArtifactStore()
    const out: any = mw(store).onConfig!({} as any, { tools: [] } as any)
    const create = out.tools.find((t: any) => t.name === 'create_artifact')
    const emit = vi.fn()
    const res = await create.execute({ kind: 'html-fragment', title: 'Dinner', source: '<p/>', fallbackText: 'fb' }, { emitCustomEvent: emit })
    expect(res).toMatchObject({ artifactId: 'art_1', revision: 1 })
    expect(emit).toHaveBeenCalledWith('genui:artifact', expect.objectContaining({ pin: { artifactId: 'art_1', revision: 1 }, title: 'Dinner', kind: 'html-fragment' }))
    expect((await store.latest('art_1'))?.title).toBe('Dinner')
  })

  it('create_artifact build failure returns the error as the tool result, emits nothing', async () => {
    const store = createInMemoryFrameArtifactStore()
    const out: any = mw(store).onConfig!({} as any, { tools: [] } as any)
    const create = out.tools.find((t: any) => t.name === 'create_artifact')
    const emit = vi.fn()
    const res = await create.execute({ kind: 'react-tsx', title: 'Bad', source: `import x from 'left-pad'\nexport default () => null`, fallbackText: 'fb' }, { emitCustomEvent: emit })
    expect(res).toMatchObject({ error: 'build-failed' })
    expect(emit).not.toHaveBeenCalled()
    expect(await store.latest('art_1')).toBeUndefined()
  })

  it('list_artifacts returns compact library entries', async () => {
    const store = createInMemoryFrameArtifactStore()
    const out: any = mw(store).onConfig!({} as any, { tools: [] } as any)
    const create = out.tools.find((t: any) => t.name === 'create_artifact')
    await create.execute({ kind: 'html-fragment', title: 'Emaj7 chord', source: '<p/>', fallbackText: 'fb' }, { emitCustomEvent: vi.fn() })
    const list = out.tools.find((t: any) => t.name === 'list_artifacts')
    const entries = await list.execute({ query: 'chord' }, {})
    expect(entries).toEqual([{ artifactId: 'art_1', revision: 1, title: 'Emaj7 chord', kind: 'html-fragment' }])
  })
})

/* -------------------------------------------------------------------------- */
describe('ui:// resource identity + MCP Apps emission (Phase 2)', () => {
  it('round-trips ui://genui/<id>@<rev>', () => {
    expect(artifactResourceUri('art_7', 3)).toBe('ui://genui/art_7@3')
    expect(parseArtifactResourceUri('ui://genui/art_7@3')).toEqual({ artifactId: 'art_7', revision: 3 })
    expect(parseArtifactResourceUri('ui://other/x@1')).toBeNull()
    expect(parseArtifactResourceUri('nope')).toBeNull()
  })

  it('emitUiResource emits a standard ui-resource part for html-fragment (additive to the pin)', async () => {
    const store = createInMemoryFrameArtifactStore()
    const mw = generativeUiArtifacts({
      store,
      builder: fakeBuilder(),
      registry: REFERENCE_REGISTRY,
      genId: () => 'art_1',
      now: () => 't',
      emitUiResource: true,
      renderShell: (rec) => `<!doctype html><title>${rec.title}</title>`,
    })
    const out: any = mw.onConfig!({} as any, { tools: [] } as any)
    const create = out.tools.find((t: any) => t.name === 'create_artifact')
    const emit = vi.fn()
    await create.execute({ kind: 'html-fragment', title: 'Chord', source: '<p/>', fallbackText: 'fb' }, { emitCustomEvent: emit })

    // Both the bespoke pin AND the standard ui-resource part fire.
    expect(emit).toHaveBeenCalledWith('genui:artifact', expect.anything())
    expect(emit).toHaveBeenCalledWith('ui-resource', expect.objectContaining({
      resource: expect.objectContaining({ uri: 'ui://genui/art_1@1', mimeType: MCP_APP_MIME_TYPE }),
      toolName: 'create_artifact',
    }))
    const uiCall = emit.mock.calls.find((c: Array<unknown>) => c[0] === 'ui-resource')!
    expect((uiCall[1] as any).resource.text).toContain('<!doctype html>')
  })

  it('skips the ui-resource part for react-tsx unless includeReactTsx (needs a serving origin)', async () => {
    const store = createInMemoryFrameArtifactStore()
    const mw = generativeUiArtifacts({
      store, builder: fakeBuilder(), registry: REFERENCE_REGISTRY, genId: () => 'art_2',
      emitUiResource: true, renderShell: () => '<!doctype html>',
    })
    const out: any = mw.onConfig!({} as any, { tools: [] } as any)
    const create = out.tools.find((t: any) => t.name === 'create_artifact')
    const emit = vi.fn()
    await create.execute({ kind: 'react-tsx', title: 'Card', source: `export default () => null`, fallbackText: 'fb' }, { emitCustomEvent: emit })
    const uiCalls = emit.mock.calls.filter((c: Array<unknown>) => c[0] === 'ui-resource')
    expect(uiCalls).toHaveLength(0)
  })
})
