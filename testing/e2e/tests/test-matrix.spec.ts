import { test, expect } from '@playwright/test'
import { providersFor } from './test-matrix'

test.describe('providersFor', () => {
  test('local default chat uses openai, anthropic, and gemini', () => {
    expect(providersFor('chat', {})).toEqual(['openai', 'anthropic', 'gemini'])
  })

  test('local default sound-effects uses elevenlabs when the default three do not support it', () => {
    expect(providersFor('sound-effects', {})).toEqual(['elevenlabs'])
  })

  test('explicit E2E_PROVIDERS keeps only the selected provider', () => {
    expect(providersFor('chat', { E2E_PROVIDERS: 'grok' })).toEqual(['grok'])
  })

  test('explicit E2E_PROVIDERS returns no providers when the selection does not support the feature', () => {
    expect(providersFor('image-gen', { E2E_PROVIDERS: 'elevenlabs' })).toEqual(
      [],
    )
  })

  test('CI chat includes providers outside the local default', () => {
    const ciChat = providersFor('chat', { CI: '1' })
    expect(ciChat).toContain('grok')
    expect(ciChat).toContain('vertex')
  })

  test('E2E_PROVIDERS=* chat includes providers outside the local default', () => {
    const allChat = providersFor('chat', { E2E_PROVIDERS: '*' })
    expect(allChat).toContain('grok')
    expect(allChat).toContain('vertex')
  })

  test('unknown E2E_PROVIDERS id throws', () => {
    expect(() =>
      providersFor('chat', { E2E_PROVIDERS: 'not-a-provider' }),
    ).toThrow(/E2E_PROVIDERS has unknown provider\(s\): not-a-provider/)
  })
})
