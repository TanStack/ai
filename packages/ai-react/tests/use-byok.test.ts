import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useByok } from '../src/use-byok'

const RAW_KEY = 'sk-abcdefghij'

describe('useByok', () => {
  it('reads the snapshot, remasks after update, and never exposes the raw key', async () => {
    const client = defineByok({ storage: memoryStorage() })
    const { result } = renderHook(() => useByok(client))

    expect(result.current.status.openai.state).toBe('empty')
    expect(JSON.stringify(result.current)).not.toContain(RAW_KEY)

    await act(async () => {
      await client.update('openai', RAW_KEY)
    })

    expect(result.current.status.openai).toEqual({
      state: 'set',
      masked: 'ghij',
    })
    expect(JSON.stringify(result.current)).not.toContain(RAW_KEY)
    expect(JSON.stringify(result.current.status.openai)).not.toContain(RAW_KEY)
  })
})
