import { describe, expect, it } from 'vitest'
import { stripTypeScript } from '../src/strip-typescript'

describe('stripTypeScript', () => {
  it('strips type annotations', async () => {
    const result = await stripTypeScript('const x: string = "hello"')
    expect(result).toContain('const x = "hello"')
    expect(result).not.toContain(': string')
  })

  it('strips generic types', async () => {
    const result = await stripTypeScript(
      'const items: Array<string> = ["a", "b"]',
    )
    expect(result).toContain('const items = ["a", "b"]')
    expect(result).not.toContain('Array<string>')
  })

  it('strips interfaces', async () => {
    const result = await stripTypeScript(
      'interface Foo { bar: string }\nconst x = 1',
    )
    expect(result).not.toContain('interface')
    expect(result).toContain('const x = 1')
  })

  it('strips type aliases', async () => {
    const result = await stripTypeScript(
      'type ID = string | number\nconst x = 1',
    )
    expect(result).not.toContain('type ID')
    expect(result).toContain('const x = 1')
  })

  it('converts enums to JS objects', async () => {
    const code = `enum Color { Red = "red", Blue = "blue" }\nconst c = Color.Red`
    const result = await stripTypeScript(code)
    expect(result).not.toContain('enum ')
    expect(result).toContain('Color')
    expect(result).toContain('Red')
  })

  it('handles top-level return', async () => {
    const result = await stripTypeScript('return 42')
    expect(result).toContain('return 42')
  })

  it('handles top-level await', async () => {
    const result = await stripTypeScript(
      'const x = await Promise.resolve(1)\nreturn x',
    )
    expect(result).toContain('await Promise.resolve(1)')
    expect(result).toContain('return x')
  })

  it('preserves template literals with angle brackets', async () => {
    const result = await stripTypeScript('const x = `value is <${1 + 2}>`')
    expect(result).toContain('`value is <${1 + 2}>`')
  })

  it('returns empty/whitespace for empty code', async () => {
    const result = await stripTypeScript('')
    expect(result.trim()).toBe('')
  })

  it('returns empty/whitespace for pure type-only code', async () => {
    const result = await stripTypeScript(
      'interface Foo { x: string }\ntype Bar = number',
    )
    expect(result.trim()).toBe('')
  })

  it('strips as type assertions', async () => {
    const result = await stripTypeScript('const x = (value as string).length')
    expect(result).toContain('value.length')
    expect(result).not.toContain(' as ')
  })

  it('throws on syntax errors', async () => {
    await expect(
      stripTypeScript('const x: = invalid{{{syntax'),
    ).rejects.toThrow()
  })

  it('handles complex generics', async () => {
    const code =
      'const map: Record<string, Array<{id: number}>> = {}\nreturn map'
    const result = await stripTypeScript(code)
    expect(result).toContain('const map = {}')
    expect(result).not.toContain('Record<')
  })
})
