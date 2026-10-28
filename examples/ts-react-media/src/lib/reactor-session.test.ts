import { describe, expect, it } from 'vitest'
import { isRecorderUnavailable } from './reactor-session'

describe('isRecorderUnavailable', () => {
  it('matches the SDK code', () => {
    expect(isRecorderUnavailable({ code: 'RECORDER_DISABLED' })).toBe(true)
  })

  it('matches recorder copy', () => {
    expect(isRecorderUnavailable(new Error('recorder not enabled'))).toBe(true)
  })

  it('ignores other errors', () => {
    expect(isRecorderUnavailable(new Error('network'))).toBe(false)
  })
})
