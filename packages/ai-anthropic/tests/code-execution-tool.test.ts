import { describe, expect, it } from 'vitest'
import {
  codeExecutionTool,
  convertCodeExecutionToolToAdapterFormat,
  readCodeExecutionSkills,
} from '../src/tools/code-execution-tool'

const config = {
  type: 'code_execution_20250825',
  name: 'code_execution',
} as const

describe('codeExecutionTool', () => {
  it('converts to the bare SDK tool config (skills are NOT in the wire tool)', () => {
    const tool = codeExecutionTool(config, {
      skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }],
    })
    expect(convertCodeExecutionToolToAdapterFormat(tool)).toEqual(config)
  })

  it('exposes attached skills via readCodeExecutionSkills', () => {
    const tool = codeExecutionTool(config, {
      skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }],
    })
    expect(readCodeExecutionSkills(tool)).toEqual([
      { type: 'anthropic', skill_id: 'pptx', version: 'latest' },
    ])
  })

  it('returns undefined skills when none attached', () => {
    expect(readCodeExecutionSkills(codeExecutionTool(config))).toBeUndefined()
  })

  it('rejects more than 8 skills', () => {
    const skills = Array.from({ length: 9 }, (_, i) => ({
      type: 'anthropic' as const,
      skill_id: `s${i}`,
    }))
    expect(() => codeExecutionTool(config, { skills })).toThrow(/at most 8/i)
  })

  it('rejects an empty skill_id', () => {
    expect(() =>
      codeExecutionTool(config, {
        skills: [{ type: 'anthropic', skill_id: '' }],
      }),
    ).toThrow(/between 1 and 64|skill_id/i)
  })

  it('rejects a skill_id longer than 64 characters', () => {
    expect(() =>
      codeExecutionTool(config, {
        skills: [{ type: 'anthropic', skill_id: 'a'.repeat(65) }],
      }),
    ).toThrow(/between 1 and 64|skill_id/i)
  })

  it('accepts a 64-character skill_id (boundary)', () => {
    expect(() =>
      codeExecutionTool(config, {
        skills: [{ type: 'anthropic', skill_id: 'a'.repeat(64) }],
      }),
    ).not.toThrow()
  })
})
