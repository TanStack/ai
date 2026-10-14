import { describe, it, expect } from 'vitest'
import {
  FixtureDriver,
  ProgrammaticDriver,
  LiveDriver,
} from '../src/index'

describe('UIDriver Implementations (§7)', () => {
  it('FixtureDriver returns all canonical fixtures by scenario ID', async () => {
    const driver = new FixtureDriver()
    const scenarios = driver.listScenarios()
    expect(scenarios).toHaveLength(9)

    for (const sc of scenarios) {
      const graph = await driver.render({ job: 'test', scenario: sc })
      expect(graph.specVersion).toBe('0.1')
      expect(graph.graphId).toBeDefined()
      expect(graph.root).toBeDefined()
    }
  })

  it('ProgrammaticDriver creates valid graph using builder API', async () => {
    const builder = ProgrammaticDriver.createBuilder(
      'Server Resource Dashboard',
      'Memory: 8GB, CPU: 4 cores, Button: Reboot',
    )
      .addText('Server Health Overview', 'heading')
      .addMetric('CPU Usage', '42%', '+3%', 'positive')
      .addButton('Restart Service', 'restartServer', { serverId: 'srv-01' })

    const graph = builder.build()
    expect(graph.specVersion).toBe('0.1')
    expect(graph.title).toBe('Server Resource Dashboard')
    expect(graph.root.children).toHaveLength(3)
  })

  it('LiveDriver outputs tool schema and handles model fallback', () => {
    const toolDef = LiveDriver.getRenderToolDefinition()
    expect(toolDef.name).toBe('render_ui')
    expect(toolDef.parameters.required).toContain('root')

    const repaired = LiveDriver.processModelOutput({
      title: 'Generated View',
      fallbackText: 'Plain text fallback',
      root: {
        id: 'n1',
        type: 'Text',
        props: { content: 'Generated text' },
      },
    })

    expect(repaired.specVersion).toBe('0.1')
    expect(repaired.fallbackText).toBe('Plain text fallback')
  })
})
