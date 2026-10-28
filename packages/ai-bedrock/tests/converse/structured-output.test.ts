import { describe, expect, it } from 'vitest'
import {
  STRUCTURED_TOOL_NAME,
  buildStructuredToolConfig,
} from '../../src/converse/structured-output'

describe('buildStructuredToolConfig', () => {
  it('wraps the output schema as a single forced tool', () => {
    const schema = { type: 'object', properties: { n: { type: 'number' } } }
    const cfg = buildStructuredToolConfig(schema)
    expect(cfg.tools?.[0]).toEqual({
      toolSpec: {
        name: STRUCTURED_TOOL_NAME,
        description: 'Return the final answer as structured JSON.',
        inputSchema: { json: schema },
      },
    })
    expect(cfg.toolChoice).toEqual({ tool: { name: STRUCTURED_TOOL_NAME } })
  })
})
