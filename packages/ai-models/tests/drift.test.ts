import { describe, expect, it } from 'vitest'
import { getModels, getProviders } from '../src'
import { ONLY } from '../scripts/known-ids'
import { PROVIDERS } from '../scripts/providers'

const rowIds = new Set(PROVIDERS.map((row) => row.id))

describe('drift', () => {
  it('every generated provider has a rule row, and every row was generated', () => {
    expect(new Set(getProviders().map((provider) => provider.id))).toEqual(
      rowIds,
    )
  })

  it('every generated model belongs to a provider with a rule row', () => {
    for (const provider of getProviders())
      for (const model of getModels(provider.id))
        expect(rowIds.has(model.provider), model.id).toBe(true)
  })

  it('every hand-kept list names a provider with a rule row', () => {
    for (const id of Object.keys(ONLY)) expect(rowIds.has(id), id).toBe(true)
  })

  it('every provider has at least one model', () => {
    for (const provider of getProviders())
      expect(getModels(provider.id).length, provider.id).toBeGreaterThan(0)
  })
})
