// Same cap as MAX_TOOLS_LIST_PAGES in client.ts.
const DEFAULT_MAX_LIST_PAGES = 100

/**
 * This function reads each page of a cursor-paginated list.
 * This function returns the items in page order.
 *
 * The first call to `fetchPage` gets `undefined`.
 * Each later call gets the cursor from the previous page.
 * `options.maxPages` is the page cap.
 * The default cap is 100, the same limit as `MAX_TOOLS_LIST_PAGES`.
 *
 * If the next cursor is the same as the sent cursor,
 * this function throws an Error.
 * If the page count is more than the cap, this function throws an Error.
 */
export async function listPages<TItem>(
  fetchPage: (cursor: string | undefined) => Promise<{
    items: ReadonlyArray<TItem>
    nextCursor?: string
  }>,
  options?: { maxPages?: number },
) {
  const maxPages = options?.maxPages ?? DEFAULT_MAX_LIST_PAGES
  const items: Array<TItem> = []
  let cursor: string | undefined
  let pageCount = 0

  do {
    pageCount++
    if (pageCount > maxPages) {
      throw new Error(`MCP list pagination exceeded ${maxPages} pages`)
    }

    const page = await fetchPage(cursor)
    items.push(...page.items)
    const nextCursor = page.nextCursor
    if (nextCursor !== undefined && nextCursor === cursor) {
      throw new Error('MCP list pagination repeated a cursor')
    }
    cursor = nextCursor
  } while (cursor)

  return items
}
