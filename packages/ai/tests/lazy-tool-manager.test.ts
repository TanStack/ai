import { describe, it, expect } from 'vitest'
import type { Tool } from '../src/types'
import { LazyToolManager } from '../src/activities/chat/tools/lazy-tool-manager'

const DISCOVERY_TOOL_NAME = '__lazy__tool__discovery__'

function makeTool(
  name: string,
  opts?: { lazy?: boolean; execute?: (args: any) => any },
): Tool {
  return {
    name,
    description: `Tool: ${name}`,
    execute: opts?.execute ?? (async (args: any) => args),
    lazy: opts?.lazy,
  }
}

/** Find the discovery tool from the active tools list */
function findDiscoveryTool(manager: LazyToolManager): Tool | undefined {
  return manager.getActiveTools().find((t) => t.name === DISCOVERY_TOOL_NAME)
}

describe('LazyToolManager', () => {
  describe('construction and separation', () => {
    it('returns all tools unchanged when none are lazy', () => {
      const tools = [makeTool('a'), makeTool('b')]
      const manager = new LazyToolManager(tools, [])

      const active = manager.getActiveTools()
      expect(active).toHaveLength(2)
      expect(active.map((t) => t.name)).toEqual(['a', 'b'])
    })

    it('does not create discovery tool when no tools are lazy', () => {
      const tools = [makeTool('a'), makeTool('b')]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      expect(discovery).toBeUndefined()
    })

    it('separates lazy tools from eager tools', () => {
      const tools = [
        makeTool('eager1'),
        makeTool('lazy1', { lazy: true }),
        makeTool('eager2'),
        makeTool('lazy2', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      const active = manager.getActiveTools()
      const names = active.map((t) => t.name)

      // Eager tools should be present
      expect(names).toContain('eager1')
      expect(names).toContain('eager2')

      // Lazy tools should NOT be present (not yet discovered)
      expect(names).not.toContain('lazy1')
      expect(names).not.toContain('lazy2')

      // Discovery tool should be present
      expect(names).toContain(DISCOVERY_TOOL_NAME)

      // Total: 2 eager + 1 discovery = 3
      expect(active).toHaveLength(3)
    })
  })

  describe('discovery tool', () => {
    it('has correct name and description listing tool names', () => {
      const tools = [
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      expect(discovery).toBeDefined()
      expect(discovery!.name).toBe(DISCOVERY_TOOL_NAME)
      expect(discovery!.description).toContain('lazyA')
      expect(discovery!.description).toContain('lazyB')
    })

    it('discovers valid tools and returns descriptions + schemas', async () => {
      const tools = [
        {
          name: 'weather',
          description: 'Get weather info',
          lazy: true,
          execute: async () => ({}),
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
            },
            required: ['location'],
          },
        } satisfies Tool,
      ]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      const result = await discovery!.execute!({
        toolNames: ['weather'],
      })

      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].name).toBe('weather')
      expect(result.tools[0].description).toBe('Get weather info')
      expect(result.tools[0].inputSchema).toBeDefined()
      expect(result.errors).toBeUndefined()
    })

    it('returns errors for unknown tool names', async () => {
      const tools = [makeTool('lazyA', { lazy: true })]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      const result = await discovery!.execute!({
        toolNames: ['nonexistent'],
      })

      expect(result.tools).toHaveLength(0)
      expect(result.errors).toBeDefined()
      expect(result.errors).toHaveLength(1)
      expect(result.errors![0]).toContain('nonexistent')
    })

    it('handles mix of valid and invalid tool names', async () => {
      const tools = [
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      const result = await discovery!.execute!({
        toolNames: ['lazyA', 'bogus', 'lazyB'],
      })

      expect(result.tools).toHaveLength(2)
      expect(result.tools.map((t: any) => t.name)).toEqual(['lazyA', 'lazyB'])
      expect(result.errors).toHaveLength(1)
      expect(result.errors![0]).toContain('bogus')
    })
  })

  describe('state tracking', () => {
    it('includes discovered tools in getActiveTools after discovery', async () => {
      const tools = [
        makeTool('eager1'),
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      // Discover lazyA via the discovery tool
      const discovery = findDiscoveryTool(manager)
      await discovery!.execute!({ toolNames: ['lazyA'] })

      const active = manager.getActiveTools()
      const names = active.map((t) => t.name)

      expect(names).toContain('eager1')
      expect(names).toContain('lazyA')
      expect(names).not.toContain('lazyB')
      // Discovery tool should still be present since lazyB remains undiscovered
      expect(names).toContain(DISCOVERY_TOOL_NAME)
    })

    it('resets hasNewlyDiscoveredTools after getActiveTools', async () => {
      const tools = [makeTool('lazyA', { lazy: true })]
      const manager = new LazyToolManager(tools, [])

      expect(manager.hasNewlyDiscoveredTools()).toBe(false)

      const discovery = findDiscoveryTool(manager)
      await discovery!.execute!({ toolNames: ['lazyA'] })
      expect(manager.hasNewlyDiscoveredTools()).toBe(true)

      manager.getActiveTools()
      expect(manager.hasNewlyDiscoveredTools()).toBe(false)
    })

    it('removes discovery tool when all lazy tools discovered', async () => {
      const tools = [
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      const discovery = findDiscoveryTool(manager)
      await discovery!.execute!({
        toolNames: ['lazyA', 'lazyB'],
      })

      const active = manager.getActiveTools()
      const names = active.map((t) => t.name)

      expect(names).toContain('lazyA')
      expect(names).toContain('lazyB')
      expect(names).not.toContain(DISCOVERY_TOOL_NAME)
    })

    it('correctly identifies undiscovered lazy tools via isUndiscoveredLazyTool', async () => {
      const tools = [
        makeTool('eager1'),
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
      ]
      const manager = new LazyToolManager(tools, [])

      expect(manager.isUndiscoveredLazyTool('lazyA')).toBe(true)
      expect(manager.isUndiscoveredLazyTool('lazyB')).toBe(true)
      expect(manager.isUndiscoveredLazyTool('eager1')).toBe(false)
      expect(manager.isUndiscoveredLazyTool('nonexistent')).toBe(false)

      const discovery = findDiscoveryTool(manager)
      await discovery!.execute!({ toolNames: ['lazyA'] })

      expect(manager.isUndiscoveredLazyTool('lazyA')).toBe(false)
      expect(manager.isUndiscoveredLazyTool('lazyB')).toBe(true)
    })

    it('provides helpful error message for undiscovered tools', () => {
      const tools = [makeTool('lazyA', { lazy: true })]
      const manager = new LazyToolManager(tools, [])

      const errorMsg = manager.getUndiscoveredToolError('lazyA')
      expect(errorMsg).toContain('lazyA')
      expect(errorMsg).toContain(DISCOVERY_TOOL_NAME)
      expect(errorMsg).toContain('must be discovered first')
    })
  })

  describe('message history scanning', () => {
    it('pre-populates discovered tools from message history', () => {
      const tools = [
        makeTool('lazyA', { lazy: true }),
        makeTool('lazyB', { lazy: true }),
        makeTool('lazyC', { lazy: true }),
      ]
      const messages = [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc_1',
              type: 'function',
              function: {
                name: DISCOVERY_TOOL_NAME,
                arguments: JSON.stringify({ toolNames: ['lazyA'] }),
              },
            },
          ],
        },
        {
          role: 'tool',
          content: JSON.stringify({
            tools: [
              {
                name: 'lazyA',
                description: 'Tool: lazyA',
                inputSchema: {},
              },
            ],
          }),
          toolCallId: 'tc_1',
        },
      ]

      const manager = new LazyToolManager(tools, messages as any)

      const active = manager.getActiveTools()
      const names = active.map((t) => t.name)

      // lazyA should already be discovered from history
      expect(names).toContain('lazyA')
      // lazyB and lazyC still undiscovered
      expect(names).not.toContain('lazyB')
      expect(names).not.toContain('lazyC')
      // Discovery tool should still exist
      expect(names).toContain(DISCOVERY_TOOL_NAME)
    })

    it('handles malformed discovery results in history gracefully', () => {
      const tools = [makeTool('lazyA', { lazy: true })]
      const messages = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc_bad',
              type: 'function',
              function: {
                name: DISCOVERY_TOOL_NAME,
                arguments: '{}',
              },
            },
          ],
        },
        {
          role: 'tool',
          content: 'THIS IS NOT VALID JSON{{{',
          toolCallId: 'tc_bad',
        },
      ]

      // Should not throw
      expect(() => new LazyToolManager(tools, messages as any)).not.toThrow()

      const manager = new LazyToolManager(tools, messages as any)
      // lazyA should still be undiscovered
      expect(manager.isUndiscoveredLazyTool('lazyA')).toBe(true)
    })

    it('ignores discovery results for tools not in current tool list', () => {
      const tools = [makeTool('lazyA', { lazy: true })]
      const messages = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'tc_1',
              type: 'function',
              function: {
                name: DISCOVERY_TOOL_NAME,
                arguments: JSON.stringify({
                  toolNames: ['removedTool'],
                }),
              },
            },
          ],
        },
        {
          role: 'tool',
          content: JSON.stringify({
            tools: [
              {
                name: 'removedTool',
                description: 'This tool no longer exists',
                inputSchema: {},
              },
            ],
          }),
          toolCallId: 'tc_1',
        },
      ]

      const manager = new LazyToolManager(tools, messages as any)

      // removedTool should not appear in discovered set (it's not in lazyToolMap)
      expect(manager.isUndiscoveredLazyTool('removedTool')).toBe(false)
      // lazyA is still undiscovered
      expect(manager.isUndiscoveredLazyTool('lazyA')).toBe(true)
    })
  })
})
