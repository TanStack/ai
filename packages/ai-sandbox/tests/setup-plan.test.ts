import { describe, expect, it } from 'vitest'
import { buildSetupPlan } from '../src/setup-plan'

describe('buildSetupPlan', () => {
  it('records serial/parallel groups in call order', () => {
    const plan = buildSetupPlan(({ serial, parallel }) => {
      serial('pnpm install')
      parallel(['pnpm build', 'pnpm typecheck'])
      serial('echo done')
    })
    expect(plan).toEqual([
      { kind: 'serial', command: 'pnpm install' },
      { kind: 'parallel', commands: ['pnpm build', 'pnpm typecheck'] },
      { kind: 'serial', command: 'echo done' },
    ])
  })
  it('treats a string array as serial groups', () => {
    expect(buildSetupPlan(['a', 'b'])).toEqual([
      { kind: 'serial', command: 'a' },
      { kind: 'serial', command: 'b' },
    ])
  })
  it('returns [] for undefined', () => {
    expect(buildSetupPlan(undefined)).toEqual([])
  })
})
