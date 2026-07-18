import { describe, expect, it, vi } from 'vitest'
import { createBlobStore } from '../src/stores'
import type { BlobRow, TanstackAiDelegates } from '../src/model-contract'

function blobRow(key: string): BlobRow {
  return {
    key,
    contentType: null,
    size: 0n,
    etag: 'etag',
    customMetadataJson: null,
    createdAt: 0n,
    updatedAt: 0n,
    body: null,
  }
}

type FindManyArgs = { where?: { key: { startsWith: string } } }

/**
 * A blob delegate that returns the FULL row set on every `findMany`, regardless
 * of the pushed filter — the strongest stand-in for a case/accent-insensitive
 * collation that hands back a superset. A correct store must narrow membership,
 * ordering, and paging in JS rather than trusting the database.
 */
function fakeDelegates(rows: Array<BlobRow>): {
  delegates: TanstackAiDelegates
  findMany: ReturnType<typeof vi.fn>
} {
  const findMany = vi.fn(
    (_args: FindManyArgs): Promise<Array<BlobRow>> => Promise.resolve(rows),
  )
  return {
    delegates: { blob: { findMany } } as unknown as TanstackAiDelegates,
    findMany,
  }
}

describe('prisma blob list query shape', () => {
  it('pushes only a coarse startsWith prefilter — no range or cursor bounds', async () => {
    const rows = ['run_1/x', 'run_2/y', 'runX/z', 'RUN_1/w', 'other/z'].map(
      blobRow,
    )
    const { delegates, findMany } = fakeDelegates(rows)
    const store = createBlobStore(delegates)

    const page = await store.list({ prefix: 'run_', cursor: 'run_0' })

    // Membership is decided in JS: literal + case-sensitive, `_` is NOT a
    // wildcard, and the upper-case `RUN_1/w` is excluded.
    expect(page.objects.map((object) => object.key).sort()).toEqual([
      'run_1/x',
      'run_2/y',
    ])

    // The only thing pushed to the DB is `startsWith`. The cursor and any range
    // bounds are applied in JS so results stay correct under any collation.
    const arg = findMany.mock.calls.at(-1)?.[0] as FindManyArgs | undefined
    expect(arg).toEqual({ where: { key: { startsWith: 'run_' } } })
    expect(arg?.where?.key).not.toHaveProperty('gte')
    expect(arg?.where?.key).not.toHaveProperty('lt')
    expect(arg?.where?.key).not.toHaveProperty('gt')
  })

  it('scans with no filter for an empty prefix', async () => {
    const { delegates, findMany } = fakeDelegates([])
    const store = createBlobStore(delegates)
    await store.list()
    expect(findMany).toHaveBeenLastCalledWith({})
  })

  it('applies the cursor and limit in JS (keyset paging is not pushed down)', async () => {
    const rows = ['a/1', 'a/2', 'a/3'].map(blobRow)
    const { delegates, findMany } = fakeDelegates(rows)
    const store = createBlobStore(delegates)

    const first = await store.list({ prefix: 'a/', limit: 1 })
    expect(first.objects.map((object) => object.key)).toEqual(['a/1'])
    expect(first.truncated).toBe(true)

    const rest = await store.list({ prefix: 'a/', cursor: first.cursor })
    expect(rest.objects.map((object) => object.key)).toEqual(['a/2', 'a/3'])

    // Every call pushes the same coarse prefilter — the cursor never reaches SQL.
    for (const [arg] of findMany.mock.calls) {
      expect(arg).toEqual({ where: { key: { startsWith: 'a/' } } })
    }
  })
})
