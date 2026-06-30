// Negative case: a file that has nothing to do with TanStack AI but
// happens to use a `body` key on object literals. Must remain
// untouched even though it pattern-matches.

function buildRequest(opts: { body: Record<string, unknown> }) {
  return fetch('/api/something', {
    method: 'POST',
    body: JSON.stringify(opts.body),
  })
}

const obj = { useChat: true, body: { hello: 'world' } }
const x = obj.useChat ? 1 : 0
