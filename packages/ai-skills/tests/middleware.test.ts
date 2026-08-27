import { describe, expect, it } from 'vitest'
import { SkillLimitError } from '@tanstack/ai'
import { inlineSkill } from '../src/sources/inline'
import {
  SKILLS_STATE_EVENT,
  withSkills,
} from '../src/middleware'
import { createResourceTool } from '../src/tools/read-resource'
import type {
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  StreamChunk,
  Tool,
} from '@tanstack/ai'
import type { SkillSource } from '../src/types'

function makeCtx(provider = 'openai'): ChatMiddlewareContext {
  const bag = new Map<unknown, unknown>()
  return {
    provider,
    provide: (cap: object, value: unknown) => {
      bag.set(cap, value)
    },
    get: (cap: object) => {
      const value = bag.get(cap)
      if (value === undefined) throw new Error('missing capability')
      return value
    },
    getOptional: (cap: object) => bag.get(cap),
  } as unknown as ChatMiddlewareContext
}

function makeConfig(tools: Array<Tool> = []): ChatMiddlewareConfig {
  return {
    messages: [{ role: 'user', content: 'hi' }],
    systemPrompts: [],
    tools,
  }
}

const alpha = inlineSkill({
  name: 'alpha',
  description: 'does A',
  instructions: 'Do A.',
  resources: { 'references/note.md': 'hello' },
})

describe('withSkills', () => {
  it('injects load_skill and a catalog prompt', async () => {
    const mw = withSkills(alpha)
    const ctx = makeCtx()
    await mw.setup?.(ctx)
    const patch = await mw.onConfig?.(ctx, makeConfig())
    expect(patch?.tools?.some((t) => t.name === 'load_skill')).toBe(true)
    expect(
      patch?.systemPrompts?.some((p) => {
        const text = typeof p === 'string' ? p : p.content
        return text.includes('alpha')
      }),
    ).toBe(true)
  })

  it('is idempotent across onConfig iterations', async () => {
    const mw = withSkills(alpha)
    const ctx = makeCtx()
    await mw.setup?.(ctx)
    const first = await mw.onConfig?.(ctx, makeConfig())
    const second = await mw.onConfig?.(ctx, {
      messages: [],
      systemPrompts: first?.systemPrompts ?? [],
      tools: first?.tools ?? [],
    })
    expect(second?.tools?.filter((t) => t.name === 'load_skill')).toHaveLength(1)
  })

  it('refuses native hosted skills on the same call', async () => {
    const mw = withSkills(alpha)
    const ctx = makeCtx()
    await mw.setup?.(ctx)
    const native: Tool = {
      name: 'code_execution',
      description: 'hosted',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      metadata: { skills: [{ skill_id: 'xlsx' }] },
    }
    expect(() => mw.onConfig?.(ctx, makeConfig([native]))).toThrow(
      'cannot be combined',
    )
  })

  it('throws SkillLimitError when the catalog exceeds maxCatalogTokens', async () => {
    const huge: SkillSource = {
      list: () =>
        Promise.resolve([
          { name: 'alpha', description: 'x'.repeat(20000) },
        ]),
      load: () => Promise.resolve('body'),
    }
    const mw = withSkills(huge, { maxCatalogTokens: 10 })
    await expect(mw.setup?.(makeCtx())).rejects.toBeInstanceOf(SkillLimitError)
  })

  it('re-checks the cap after onLimitExceeded', async () => {
    const huge: SkillSource = {
      list: () =>
        Promise.resolve([
          { name: 'alpha', description: 'x'.repeat(20000) },
        ]),
      load: () => Promise.resolve('body'),
    }
    const mw = withSkills(huge, {
      maxCatalogTokens: 10,
      onLimitExceeded: (skills) => skills,
    })
    await expect(mw.setup?.(makeCtx())).rejects.toBeInstanceOf(SkillLimitError)
  })

  it('injects a skills:state CUSTOM chunk once', async () => {
    const mw = withSkills(alpha)
    const ctx = makeCtx()
    await mw.setup?.(ctx)
    const runStarted = {
      type: 'RUN_STARTED',
      threadId: 't1',
      runId: 'r1',
    } as unknown as StreamChunk
    const out = await mw.onChunk?.(ctx, runStarted)
    expect(Array.isArray(out)).toBe(true)
    const chunks = out as Array<StreamChunk>
    expect(chunks[0]).toBe(runStarted)
    const custom = chunks[1] as Extract<StreamChunk, { type: 'CUSTOM' }>
    expect(custom.type).toBe('CUSTOM')
    expect(custom.name).toBe(SKILLS_STATE_EVENT)
    expect(custom.value).toMatchObject({
      catalog: [{ name: 'alpha', description: 'does A' }],
      activated: [],
    })
    expect(await mw.onChunk?.(ctx, runStarted)).toBeUndefined()
  })
})

describe('createResourceTool', () => {
  function exec(tool: unknown): (input: unknown) => Promise<unknown> {
    const fn = (tool as { execute?: (i: unknown) => Promise<unknown> }).execute
    if (!fn) throw new Error('tool has no execute')
    return fn
  }

  it('returns utf8 for a markdown resource', async () => {
    const tool = createResourceTool(alpha)
    const result = await exec(tool)({
      skill: 'alpha',
      path: 'references/note.md',
    })
    expect(result).toEqual({
      skill: 'alpha',
      path: 'references/note.md',
      content: 'hello',
      encoding: 'utf8',
    })
  })

  it('rejects an unknown skill and a path outside listed resources', async () => {
    const tool = createResourceTool(alpha)
    await expect(
      exec(tool)({ skill: 'secret', path: 'references/note.md' }),
    ).rejects.toThrow('no skill named "secret"')
    await expect(
      exec(tool)({ skill: 'alpha', path: 'SKILL.md' }),
    ).rejects.toThrow('has no resource')
  })
})
