import { describe, expect, it } from 'vitest'
import { defineSandboxPolicy, evaluateCommand } from '../src/policy'

describe('evaluateCommand', () => {
  const policy = defineSandboxPolicy({
    commands: {
      allow: ['pnpm test', 'pnpm typecheck', 'git diff'],
      ask: ['pnpm install', 'curl *', 'wget *'],
      deny: ['sudo *', 'rm -rf *'],
    },
    default: 'ask',
  })

  it('allows exact allow matches', () => {
    expect(evaluateCommand('pnpm test', policy)).toBe('allow')
    expect(evaluateCommand('git diff', policy)).toBe('allow')
  })

  it('asks for ask matches incl. globs', () => {
    expect(evaluateCommand('pnpm install', policy)).toBe('ask')
    expect(evaluateCommand('curl https://example.com', policy)).toBe('ask')
  })

  it('denies deny matches incl. globs', () => {
    expect(evaluateCommand('sudo apt-get update', policy)).toBe('deny')
    expect(evaluateCommand('rm -rf /', policy)).toBe('deny')
  })

  it('deny beats ask beats allow (precedence)', () => {
    const overlap = defineSandboxPolicy({
      commands: {
        allow: ['git *'],
        ask: ['git push *'],
        deny: ['git push --force*'],
      },
    })
    expect(evaluateCommand('git status', overlap)).toBe('allow')
    expect(evaluateCommand('git push origin main', overlap)).toBe('ask')
    expect(evaluateCommand('git push --force origin main', overlap)).toBe('deny')
  })

  it('falls back to default for unmatched commands', () => {
    expect(evaluateCommand('node script.js', policy)).toBe('ask')
    expect(evaluateCommand('node script.js', { default: 'deny' })).toBe('deny')
    expect(evaluateCommand('node script.js', undefined)).toBe('ask')
  })

  it('does not let glob metachars leak across command boundaries', () => {
    // 'rm -rf *' must not match an unrelated 'confirm -rf safe' string.
    expect(evaluateCommand('confirm -rf safe', policy)).toBe('ask')
  })
})
