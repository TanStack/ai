import { describe, it, expect } from 'vitest'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'

describe('tool execution field', () => {
  it('sets execution to task on the server tool', () => {
    const serverTool = toolDefinition({
      name: 'longJob',
      description: 'Run a long job',
      execution: 'task',
    }).server(async () => 'ok')

    expect(serverTool.execution).toBe('task')
  })

  it('does not set execution to task when the definition omits it', () => {
    const serverTool = toolDefinition({
      name: 'shortJob',
      description: 'Run a short job',
    }).server(async () => 'ok')

    expect(serverTool.execution).toBeUndefined()
  })
})
