import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRouter } from 'remix/router'

import chatController from './actions/chat/controller.ts'
import { routes } from './routes.ts'

// ponytail: map only the chat controller. The app router loads Chat, and
// @tanstack/ai-remix source has extensionless imports Node cannot resolve.
const router = createRouter()
router.map(routes.chat, chatController)

const chatUrl = 'http://localhost' + routes.chat.stream.href()

function postChat(body: string) {
  return router.fetch(
    new Request(chatUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  )
}

describe('chat', () => {
  it('returns 400 when the POST body is not JSON', async () => {
    const response = await postChat('not-json')
    assert.equal(response.status, 400)
    assert.equal(await response.text(), 'Bad request')
  })

  it('returns 400 when JSON is not a chat request', async () => {
    const response = await postChat(
      JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    )
    assert.equal(response.status, 400)
    assert.match(await response.text(), /RunAgentInput/)
  })
})
