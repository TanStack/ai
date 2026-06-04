// Unresolvable adapter: `makeAdapter()` is not a known provider factory.
// The codemod must leave the call alone and report.

import { chat } from '@tanstack/ai'
import { makeAdapter } from './my-adapter'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: makeAdapter(),
    messages,
    temperature: 0.3,
  })
}
