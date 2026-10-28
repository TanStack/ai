/**
 * A minimal sentinel-driven fake `sh` for driving the persistent bootstrap
 * shell (see `../shell.ts`). Every command succeeds; `pwd` answers
 * `/workspace`, `export -p` answers an empty env, so `forkState()` resolves.
 *
 * Shipped from the `@tanstack/ai-sandbox/testkit` subpath so provider authors
 * (local-process, Docker, and third-party providers outside this repo) can
 * verify their `process.spawn` wiring against the journal contract without
 * reimplementing this fake themselves.
 */
import type { SpawnHandle } from '../contracts'

export function makeFakeShellSpawn(): SpawnHandle {
  const queue: Array<string> = []
  const waiters: Array<(result: IteratorResult<string>) => void> = []
  let done = false

  function emit(chunk: string): void {
    const waiter = waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: chunk, done: false })
    } else {
      queue.push(chunk)
    }
  }

  const stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return {
        next(): Promise<IteratorResult<string>> {
          const queued = queue.shift()
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false })
          }
          if (done) return Promise.resolve({ value: '', done: true })
          return new Promise<IteratorResult<string>>((resolve) => {
            waiters.push(resolve)
          })
        },
      }
    },
  }

  let counter = 0
  return {
    pid: 1,
    stdout,
    stderr: (async function* empty() {})(),
    stdin: {
      write: (data: string) => {
        const sentinel = `__BSSH_${counter}__`
        counter += 1
        if (data.startsWith('pwd;')) emit('/workspace\n')
        emit(`${sentinel} 0\n`)
        return Promise.resolve()
      },
      end: () => {
        done = true
        for (const waiter of waiters) waiter({ value: '', done: true })
        waiters.length = 0
        return Promise.resolve()
      },
    },
    wait: () => Promise.resolve(0),
    kill: () => Promise.resolve(),
  }
}
