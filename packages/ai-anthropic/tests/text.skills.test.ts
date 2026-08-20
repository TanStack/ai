import { describe, expect, it } from 'vitest'
import {
  computeAnthropicBetas,
  createAnthropicChat,
} from '../src/adapters/text'
import { codeExecutionTool } from '../src/tools'
import { createSilentLogger } from './utils/logger'

function makeAdapter() {
  return createAnthropicChat('claude-opus-4-8' as any, 'test-key') as any
}

function baseOptions(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-opus-4-8',
    messages: [{ role: 'user', content: 'hi' }],
    logger: createSilentLogger(),
    ...overrides,
  } as any
}

describe('anthropic skills → container', () => {
  it('lifts code_execution tool skills into top-level container.skills', () => {
    const adapter = makeAdapter()
    const tool = codeExecutionTool(
      { type: 'code_execution_20250825', name: 'code_execution' },
      { skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }] },
    )
    const req = adapter.mapCommonOptionsToAnthropic(
      baseOptions({ tools: [tool] }),
    )
    expect(req.container?.skills).toEqual([
      { type: 'anthropic', skill_id: 'pptx', version: 'latest' },
    ])
  })

  it('preserves container.id from modelOptions while adding tool skills', () => {
    const adapter = makeAdapter()
    const tool = codeExecutionTool(
      { type: 'code_execution_20250825', name: 'code_execution' },
      { skills: [{ type: 'anthropic', skill_id: 'xlsx' }] },
    )
    const req = adapter.mapCommonOptionsToAnthropic(
      baseOptions({
        tools: [tool],
        modelOptions: { container: { id: 'ctr_1', skills: null } },
      }),
    )
    expect(req.container?.id).toBe('ctr_1')
    expect(req.container?.skills).toEqual([
      { type: 'anthropic', skill_id: 'xlsx' },
    ])
  })

  it('leaves container undefined when no skills are attached', () => {
    const adapter = makeAdapter()
    const tool = codeExecutionTool({
      type: 'code_execution_20250825',
      name: 'code_execution',
    })
    const req = adapter.mapCommonOptionsToAnthropic(
      baseOptions({ tools: [tool] }),
    )
    expect(req.container).toBeUndefined()
  })
})

describe('computeAnthropicBetas', () => {
  it('adds code-execution + skills betas when a code_execution tool has skills', () => {
    const tool = codeExecutionTool(
      { type: 'code_execution_20250825', name: 'code_execution' },
      { skills: [{ type: 'anthropic', skill_id: 'pptx' }] },
    )
    const betas = computeAnthropicBetas([tool], undefined)
    expect(betas).toContain('code-execution-2025-08-25')
    expect(betas).toContain('skills-2025-10-02')
  })

  it('adds code-execution beta (no skills beta) for a bare code_execution tool', () => {
    const tool = codeExecutionTool({
      type: 'code_execution_20250825',
      name: 'code_execution',
    })
    const betas = computeAnthropicBetas([tool], undefined)
    expect(betas).toContain('code-execution-2025-08-25')
    expect(betas).not.toContain('skills-2025-10-02')
  })

  it('keeps interleaved-thinking when enabled and unions with skills betas', () => {
    const tool = codeExecutionTool(
      { type: 'code_execution_20250825', name: 'code_execution' },
      { skills: [{ type: 'anthropic', skill_id: 'pptx' }] },
    )
    const betas = computeAnthropicBetas([tool], {
      thinking: { type: 'enabled', budget_tokens: 2048 },
    } as any)
    expect(betas).toEqual(
      expect.arrayContaining([
        'interleaved-thinking-2025-05-14',
        'code-execution-2025-08-25',
        'skills-2025-10-02',
      ]),
    )
  })

  it('returns undefined when nothing requires a beta', () => {
    expect(computeAnthropicBetas(undefined, undefined)).toBeUndefined()
  })

  it('uses code-execution-2025-05-22 beta for legacy code_execution_20250522 tool', () => {
    const tool = codeExecutionTool({
      type: 'code_execution_20250522',
      name: 'code_execution',
    })
    const betas = computeAnthropicBetas([tool], undefined)
    expect(betas).toContain('code-execution-2025-05-22')
    expect(betas).not.toContain('code-execution-2025-08-25')
  })

  it('adds skills beta when ANY code_execution tool carries skills (scan-all)', () => {
    // The skills are on the SECOND tool. The old first-tool-only logic would
    // miss them; the scan-all logic must agree with the container-lift.
    const codeExecToolWithoutSkills = codeExecutionTool({
      type: 'code_execution_20250825',
      name: 'code_execution',
    })
    const codeExecToolWithSkills = codeExecutionTool(
      { type: 'code_execution_20250825', name: 'code_execution' },
      { skills: [{ type: 'anthropic', skill_id: 'pptx' }] },
    )
    const betas = computeAnthropicBetas(
      [codeExecToolWithoutSkills, codeExecToolWithSkills],
      undefined,
    )
    expect(betas).toContain('skills-2025-10-02')
  })

  it('returns undefined for a non-code_execution tool, and maps no container', () => {
    const fnTool = { name: 'noop', description: '', metadata: {} } as any
    expect(computeAnthropicBetas([fnTool], undefined)).toBeUndefined()

    const adapter = makeAdapter()
    const req = adapter.mapCommonOptionsToAnthropic(
      baseOptions({ tools: [fnTool] }),
    )
    expect(req.container).toBeUndefined()
  })

  it('does not enable code execution for an ordinary function with that name', () => {
    const fnTool = {
      name: 'code_execution',
      description: 'Run an application function',
      metadata: {
        skills: [{ type: 'anthropic', skill_id: 'must-not-be-lifted' }],
      },
    } as any

    expect(computeAnthropicBetas([fnTool], undefined)).toBeUndefined()

    const req = makeAdapter().mapCommonOptionsToAnthropic(
      baseOptions({ tools: [fnTool] }),
    )
    expect(req.container).toBeUndefined()
  })
})
