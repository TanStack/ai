/**
 * Yield the items of several async streams as they arrive. If the reader
 * stops early, every stream that is still open is closed, so its `finally`
 * runs.
 */
export async function* mergeStreams<T>(streams: Array<AsyncIterable<T>>) {
  const readers = streams.map((stream) => {
    const iterator = stream[Symbol.asyncIterator]()
    return {
      iterator,
      next: iterator.next(),
    }
  })

  try {
    while (readers.length > 0) {
      const indexed = readers.map((reader, index) =>
        reader.next.then((result) => ({ index, result, reader })),
      )
      const winner = await Promise.race(indexed)
      if (winner.result.done) {
        readers.splice(winner.index, 1)
        continue
      }
      yield winner.result.value
      winner.reader.next = winner.reader.iterator.next()
    }
  } finally {
    // The reader stopped early. Close every stream so its finally runs.
    for (const reader of readers) {
      void reader.iterator.return?.().catch(() => {})
    }
  }
}
