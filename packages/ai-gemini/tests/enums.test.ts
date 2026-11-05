import { describe, expect, it } from 'vitest'
import * as sdk from '@google/genai'
import * as ours from '../src/client/enums'
import { HarmCategory } from '../src/index'

// The SDK enums are the oracle for the copied values.
const NAMES = [
  'HarmBlockThreshold',
  'HarmCategory',
  'ThinkingLevel',
  'FinishReason',
  'FunctionCallingConfigMode',
  'FileState',
  'VideoGenerationReferenceType',
  'ActivityHandling',
  'EndSensitivity',
  'Modality',
  'StartSensitivity',
  'TurnCoverage',
] as const

describe('enum copies', () => {
  it.each(NAMES)('%s has the same members and values as the SDK', (name) => {
    expect({ ...ours[name] }).toEqual({ ...sdk[name] })
  })

  it('keeps the member types of a public enum', () => {
    const member: HarmCategory.HARM_CATEGORY_HATE_SPEECH =
      sdk.HarmCategory.HARM_CATEGORY_HATE_SPEECH
    expect(member).toBe(HarmCategory.HARM_CATEGORY_HATE_SPEECH)
  })
})
