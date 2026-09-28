import { describe, expect, it } from 'vitest'
import { listPages } from '../src/list-pages'

function fetchPages(
  pages: ReadonlyArray<{
    items: ReadonlyArray<string>
    nextCursor?: string
  }>,
) {
  const state = { calls: 0 }
  const fetchPage = (cursor: string | undefined) => {
    const page = pages[state.calls]
    state.calls += 1
    if (page === undefined) {
      throw new Error(`fetched past the fixture for cursor ${cursor ?? 'none'}`)
    }
    return Promise.resolve(page)
  }
  return { fetchPage, state }
}

describe('listPages', () => {
  it('concatenates three pages in order and stops when nextCursor is absent', async () => {
    const { fetchPage } = fetchPages([
      { items: ['a', 'b'], nextCursor: 'page-2' },
      { items: ['c'], nextCursor: 'page-3' },
      { items: ['d', 'e'] },
    ])

    await expect(listPages(fetchPage)).resolves.toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('throws when a page repeats the cursor', async () => {
    const { fetchPage, state } = fetchPages([
      { items: ['one'], nextCursor: 'same' },
      { items: ['two'], nextCursor: 'same' },
    ])

    await expect(listPages(fetchPage)).rejects.toThrow(
      'MCP list pagination repeated a cursor',
    )
    expect(state.calls).toBe(2)
  })

  it('throws when the page count is above the cap', async () => {
    const { fetchPage, state } = fetchPages([
      { items: ['a'], nextCursor: '1' },
      { items: ['b'], nextCursor: '2' },
      { items: ['c'], nextCursor: '3' },
    ])

    await expect(listPages(fetchPage, { maxPages: 2 })).rejects.toThrow(
      'MCP list pagination exceeded 2 pages',
    )
    expect(state.calls).toBe(2)
  })

  it('returns the items from a single page with no cursor', async () => {
    const { fetchPage } = fetchPages([{ items: ['only'] }])

    await expect(listPages(fetchPage)).resolves.toEqual(['only'])
  })
})
