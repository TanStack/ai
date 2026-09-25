import { describe, expect, it } from 'vitest'
import { byteplusByok, byteplusVoiceByok } from '../src/byok'

describe('byteplus BYOK', () => {
  it('exports separate Ark and Seed Speech slugs', () => {
    expect(byteplusByok.id).toBe('byteplus')
    expect(byteplusByok.env).toEqual(['ARK_API_KEY', 'BYTEPLUS_API_KEY'])
    expect(byteplusVoiceByok.id).toBe('byteplus-voice')
    expect(byteplusVoiceByok.env).toEqual(['BYTEPLUS_VOICE_API_KEY'])
  })
})
