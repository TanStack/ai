import { describe, expect, it } from 'vitest'
import { generateToolWrappers, wrapCode } from '../src/worker/wrap-code'
import type { ToolResultPayload, ToolSchema } from '../src/types'

/**
 * The CF Worker delegates actual sandboxing to Workers' V8 isolate via the
 * UNSAFE_EVAL binding, so we can't perform a real escape attempt in Node. What
 * we verify here instead is structural — the wrapper must not let user inputs
 * break out of their intended quoting/scoping.
 */

const benignTool: ToolSchema = {
  name: 'search',
  description: 'd',
  inputSchema: {},
}

describe('Cloudflare wrapCode — injection resilience', () => {
  it('escapes tool-result values via JSON.stringify so quotes are backslash-escaped', () => {
    const payload = '"); process.exit(1); (function leak(){ return `'
    const toolResults: Record<string, ToolResultPayload> = {
      search_0: { success: true, value: payload },
    }
    const wrapped = wrapCode('return 1', [benignTool], toolResults)
    // JSON.stringify must have escaped the leading quote; verify the escaped
    // form is what appears, and that no unescaped quote lets the payload end
    // the string literal (an unescaped `");` would close it).
    expect(wrapped).toContain(JSON.stringify(payload))
    expect(wrapped).not.toMatch(/[^\\]"\);\s*process\.exit/)
  })

  it('lands tool-result errors inside a JSON object literal, not a template literal', () => {
    const error = 'with `backtick` and ${alert(1)} template-looking stuff'
    const toolResults: Record<string, ToolResultPayload> = {
      search_0: { success: false, error },
    }
    const wrapped = wrapCode('return 1', [benignTool], toolResults)
    // JSON strings are always double-quoted, and `${…}` has no meaning inside
    // double-quoted JS strings. The JSON-escaped payload should appear, and
    // the assignment context should be a plain `const __toolResults = {…}`
    // — not inside any template literal.
    expect(wrapped).toContain(JSON.stringify(error))
    const assignment = wrapped.match(/const __toolResults =\s*([^;]+);/)
    expect(assignment).not.toBeNull()
    // The RHS should start with `{` (object literal), not a backtick
    expect(assignment![1]!.trimStart().startsWith('{')).toBe(true)
  })

  it('rejects adversarial tool names that would break the wrapper function', () => {
    const malicious: Array<string> = [
      "evil'); throw Error(); //",
      'has space',
      '1startsWithDigit',
      "with'quote",
      'with"quote',
      'with`backtick',
      'with\nnewline',
      'with;semi',
      '',
    ]
    for (const name of malicious) {
      const tool: ToolSchema = { name, description: '', inputSchema: {} }
      expect(
        () => generateToolWrappers([tool]),
        `should reject: ${JSON.stringify(name)}`,
      ).toThrow(/Invalid tool name/)
    }
  })

  it('accepts benign identifier-shaped tool names', () => {
    const valid = ['search', 'fetchData', 'my_tool_42', '$special', '_internal']
    for (const name of valid) {
      const tool: ToolSchema = { name, description: '', inputSchema: {} }
      expect(() => generateToolWrappers([tool])).not.toThrow()
    }
  })

  it('keeps tool names as bare identifiers only (never drops user input into strings unquoted)', () => {
    const wrapped = generateToolWrappers([benignTool])
    // Tool name appears once as a function identifier and once as a quoted
    // string literal. It must not appear elsewhere unquoted or interpolated.
    expect(wrapped).toContain('async function search(input)')
    expect(wrapped).toContain("name: 'search'")
  })

  it('tool-call IDs use an incrementing counter (not content-derived)', () => {
    // This matters because re-executions of the same code should produce
    // stable IDs across iterations — content-derived IDs would mismatch when
    // user inputs contain non-deterministic values.
    const wrapped = wrapCode('return 1', [benignTool])
    expect(wrapped).toContain('__toolCallIdx')
    expect(wrapped).toContain("'tc_' + (__toolCallIdx++)")
  })
})
