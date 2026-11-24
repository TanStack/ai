import { searchDocs, warmDocs } from './search-docs.ts'
import type { ModelMessage } from '@tanstack/ai'
import type { WebSocket } from 'ws'
import type { Carrier } from './carriers.ts'
import type { CallSetup } from './providers.ts'

const SYSTEM_PROMPT = `You are the phone support agent for TanStack AI, a TypeScript AI SDK.
You are on a voice call. The caller hears your words, they do not read them.
- Call search_docs before you answer a question about TanStack AI.
- Answer in one to three short sentences. Then stop and let the caller speak.
- Say package and function names as words. Never read out URLs, code, or markdown.
- If the docs do not cover the question, say so and suggest where to look.`

/**
 * One phone call: caller audio in, agent audio out, until the socket closes.
 *
 * - `transcriptionSession()` turns caller audio into text.
 * - On `turn-end`, `chat()` streams a reply with the docs tool.
 * - Each finished sentence goes to `generateSpeech()` as soon as it lands,
 *   so the caller hears the first sentence while the model writes the rest.
 * - An `interim` event while the agent talks is a barge-in: stop the reply
 *   and clear the audio the carrier has not played yet.
 * - A hang-up stops the reply too, so no speech is made after the caller
 *   leaves.
 */
export async function handleCall(
  ws: WebSocket,
  carrier: Carrier,
  setup: CallSetup,
) {
  const callId = crypto.randomUUID()
  const messages: Array<ModelMessage> = []
  warmDocs()

  // Listen before the session opens. Callers send audio right away.
  const early: Array<Uint8Array> = []
  let send = (audio: Uint8Array) => {
    early.push(audio)
  }
  ws.on('message', (data, isBinary) => {
    const audio = carrier.audioIn(data, isBinary)
    if (audio) send(audio)
  })
  // `replying` owns what the agent says now: the greeting, then each reply.
  // A barge-in or a hang-up aborts it.
  const hello = new AbortController()
  let replying: AbortController | undefined = hello
  const hungUp = new AbortController()
  ws.on('close', () => {
    hungUp.abort()
    replying?.abort()
  })
  const stopTalking = () => {
    if (!replying) return
    replying.abort()
    replying = undefined
    carrier.clear()
  }

  // Say hello while the transcriber connects. The greeting is a fixed line,
  // so it needs no model round trip, only one speech call. It plays as soon
  // as it is ready, and the caller can talk over it like over a reply.
  const { greeting } = setup.character
  setup
    .speak(greeting, setup.character, callId, hello.signal)
    .then((pcm) => {
      if (hello.signal.aborted) return
      carrier.speak(pcm)
      carrier.caption('agent', greeting, true)
      messages.push({ role: 'assistant', content: greeting })
    })
    .catch((error: unknown) => {
      if (!hello.signal.aborted) console.error('greeting failed', error)
    })

  const session = await setup.listen(carrier.audio, hungUp.signal)
  send = (audio) => session.send(audio)
  for (const chunk of early) session.send(chunk)
  ws.on('close', () => {
    session
      .close()
      .catch((error: unknown) => console.error('close failed', error))
  })

  let turn = ''
  for await (const event of session) {
    switch (event.type) {
      case 'interim':
        stopTalking()
        carrier.caption('caller', `${turn} ${event.text}`.trim(), false)
        break
      case 'final':
        turn = `${turn} ${event.text}`.trim()
        break
      case 'turn-end': {
        if (!turn) break
        const question = turn
        turn = ''
        carrier.caption('caller', question, true)
        messages.push({ role: 'user', content: question })
        // A turn can end with no interim event first. Stop the last reply.
        stopTalking()
        replying = new AbortController()
        reply(callId, messages, carrier, setup, replying).catch(
          (error: unknown) => {
            console.error('reply failed', error)
            carrier.caption('agent', 'Sorry, that went wrong on my end.', true)
          },
        )
        break
      }
      case 'error':
        console.error('transcription error', event.error)
        break
    }
  }
}

async function reply(
  callId: string,
  messages: Array<ModelMessage>,
  carrier: Carrier,
  setup: CallSetup,
  abortController: AbortController,
) {
  const { signal } = abortController
  let pending = ''
  let full = ''
  let filled = false
  let failed: unknown
  // Start text-to-speech for each sentence at once. Deliver them in order.
  let delivery = Promise.resolve()
  const say = (sentence: string) => {
    const audio = setup
      .speak(sentence, setup.character, callId, signal)
      .catch((error: unknown) => {
        // A barge-in aborts every clip still in flight. That is not a failure.
        // A real failure stops the reply, so no later sentence plays.
        if (!signal.aborted) {
          failed = error
          abortController.abort()
        }
        return undefined
      })
    delivery = delivery.then(async () => {
      const pcm = await audio
      if (pcm && !signal.aborted) carrier.speak(pcm)
    })
  }

  try {
    const stream = setup.think({
      systemPrompts: [SYSTEM_PROMPT, setup.character.persona],
      tools: [searchDocs],
      messages,
      threadId: callId,
      abortController,
    })
    for await (const chunk of stream) {
      // The docs search takes a few seconds. Say something while it runs.
      if (chunk.type === 'TOOL_CALL_START' && !filled) {
        filled = true
        say(setup.character.filler)
      }
      if (chunk.type !== 'TEXT_MESSAGE_CONTENT') continue
      pending += chunk.delta
      full += chunk.delta
      // A sentence ends at . ! or ? followed by a space.
      let end = pending.search(/[.!?]\s/)
      while (end !== -1) {
        say(pending.slice(0, end + 1))
        pending = pending.slice(end + 2)
        end = pending.search(/[.!?]\s/)
      }
    }
    if (pending.trim()) say(pending)
    await delivery
  } catch (error) {
    // A barge-in aborts the stream. That is not a failure.
    if (signal.aborted && failed === undefined) return
    throw failed ?? error
  }
  if (failed !== undefined) throw failed
  if (full) {
    messages.push({ role: 'assistant', content: full })
    carrier.caption('agent', full, true)
  }
}
