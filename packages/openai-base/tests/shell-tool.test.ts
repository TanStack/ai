import { describe, expect, it } from 'vitest'
import {
  convertShellToolToAdapterFormat,
  shellTool,
} from '../src/tools/shell-tool'

describe('shellTool', () => {
  it('defaults to a bare shell tool with no environment', () => {
    const tool = shellTool()
    expect(convertShellToolToAdapterFormat(tool)).toEqual({ type: 'shell' })
  })

  it('passes a container_auto environment with skill references through the converter', () => {
    const tool = shellTool({
      environment: {
        type: 'container_auto',
        skills: [
          { type: 'skill_reference', skill_id: 'skill_abc', version: '2' },
        ],
      },
    })
    expect(convertShellToolToAdapterFormat(tool)).toEqual({
      type: 'shell',
      environment: {
        type: 'container_auto',
        skills: [
          { type: 'skill_reference', skill_id: 'skill_abc', version: '2' },
        ],
      },
    })
  })
})
