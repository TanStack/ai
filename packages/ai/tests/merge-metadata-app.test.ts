import { describe, expect, it } from 'vitest'
import {
  appMetadata,
  isPlainRecord,
  tanstackOnlyMetadata,
} from '../src/utilities/merge-metadata'

describe('appMetadata', () => {
  it('drops the tanstack key and keeps app keys', () => {
    expect(appMetadata({ a: 1, tanstack: { x: 1 } })).toEqual({ a: 1 })
  })

  it('keeps a record that has only app keys', () => {
    expect(appMetadata({ a: 1, b: { c: 2 } })).toEqual({ a: 1, b: { c: 2 } })
  })

  it('returns undefined when only the tanstack key is present', () => {
    expect(appMetadata({ tanstack: {} })).toBeUndefined()
  })

  it('returns undefined for a missing or non-record value', () => {
    expect(appMetadata(undefined)).toBeUndefined()
    expect(appMetadata(null)).toBeUndefined()
    expect(appMetadata(['a'])).toBeUndefined()
  })

  it('does not change the input', () => {
    const metadata = { a: 1, tanstack: { x: 1 } }
    appMetadata(metadata)
    expect(metadata).toEqual({ a: 1, tanstack: { x: 1 } })
  })
})

describe('tanstackOnlyMetadata', () => {
  it('keeps only the tanstack key', () => {
    expect(tanstackOnlyMetadata({ a: 1, tanstack: { x: 1 } })).toEqual({
      tanstack: { x: 1 },
    })
  })

  it('returns undefined when there is no tanstack key', () => {
    expect(tanstackOnlyMetadata({ a: 1 })).toBeUndefined()
  })

  it('returns undefined for a missing or non-record value', () => {
    expect(tanstackOnlyMetadata(undefined)).toBeUndefined()
    expect(tanstackOnlyMetadata(null)).toBeUndefined()
    expect(tanstackOnlyMetadata(['tanstack'])).toBeUndefined()
  })
})

describe('isPlainRecord', () => {
  it('accepts an object and rejects null and arrays', () => {
    expect(isPlainRecord({ a: 1 })).toBe(true)
    expect(isPlainRecord(null)).toBe(false)
    expect(isPlainRecord([1])).toBe(false)
    expect(isPlainRecord('text')).toBe(false)
  })
})
