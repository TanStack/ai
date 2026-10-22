import { describe, expect, it } from 'vitest'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'
import { getComputerUseToolMetadata } from '../src/tools/computer-use'
import type { Tool } from '../src/types'

function toolWithMetadata(metadata: Record<string, unknown>): Tool {
  return { name: 'computer', description: 'Control a computer', metadata }
}

describe('getComputerUseToolMetadata', () => {
  it('returns the metadata of a portable computer-use tool', () => {
    const tool = toolWithMetadata({
      __kind: 'computer_use',
      display: { width: 1280, height: 720 },
      environment: 'browser',
      capabilities: { zoom: true, cursorPosition: false },
    })

    expect(getComputerUseToolMetadata(tool)).toEqual({
      __kind: 'computer_use',
      display: { width: 1280, height: 720 },
      environment: 'browser',
      capabilities: { zoom: true, cursorPosition: false },
    })
  })

  it('returns undefined for a plain tool', () => {
    const tool = toolDefinition({ name: 'getWeather', description: 'Weather' })

    expect(getComputerUseToolMetadata(tool)).toBeUndefined()
  })

  it('returns undefined for a native provider computer-use tool', () => {
    const tool = toolWithMetadata({
      __kind: 'anthropic.computer_use',
      display_width_px: 1280,
      display_height_px: 720,
    })

    expect(getComputerUseToolMetadata(tool)).toBeUndefined()
  })

  it('returns undefined when the computer_use metadata has a bad shape', () => {
    const tool = toolWithMetadata({
      __kind: 'computer_use',
      display: { width: 1280 },
      environment: 'browser',
      capabilities: { zoom: true, cursorPosition: false },
    })

    expect(getComputerUseToolMetadata(tool)).toBeUndefined()
  })
})
