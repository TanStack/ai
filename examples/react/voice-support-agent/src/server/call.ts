import { chat, generateSpeech, transcriptionSession } from '@tanstack/ai'
import {
  openaiLiveTranscription,
  openaiSpeech,
  openaiText,
} from '@tanstack/ai-openai'
import { searchDocs } from './search-docs.ts'
import type { Character } from './characters.ts'
import type { ModelMessage } from '@tanstack/ai'
import type { WebSocket } from 'ws'
import type { Carrier } from './carriers.ts'

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
 */
export async function handleCall(
  ws: WebSocket,
  carrier: Carrier,
  character: Character,
) {
  const callId = crypto.randomUUID()
  const messages: Array<ModelMessage> = []

  // Listen before the session opens. Callers send audio right away.
  const early: Array<Uint8Array> = []
  let send = (audio: Uint8Array) => {
    early.push(audio)
  }
  ws.on('message', (data, isBinary) => {
    const audio = carrier.audioIn(data, isBinary)
    if (audio) send(audio)
  })
  const hungUp = new AbortController()
  ws.on('close', () => hungUp.abort())

  const session = await transcriptionSession({
    adapter: openaiLiveTranscription('gpt-transcribe'),
    audio: carrier.audio,
    // Pin the language. Without it the provider guesses per utterance, and a
    // short word like "yes" can come back in the wrong language.
    language: 'en',
    modelOptions: {
      prompt:
        'A support call about TanStack AI, a TypeScript SDK. Expect words like TanStack, useChat, toolDefinition, adapter, Zod, OpenAI, Anthropic, Gemini.',
    },
    abortSignal: hungUp.signal,
  })
  send = (audio) => session.send(audio)
  for (const chunk of early) session.send(chunk)
  ws.on('close', () => void session.close())

  let turn = ''
  let replying: AbortController | undefined
  for await (const event of session) {
    switch (event.type) {
      case 'interim':
        if (replying) {
          replying.abort()
          replying = undefined
          carrier.clear()
        }
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
        replying = new AbortController()
        void reply(callId, messages, carrier, character, replying)
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
  character: Character,
  abortController: AbortController,
) {
  const { signal } = abortController
  let pending = ''
  let full = ''
  // Start text-to-speech for each sentence at once. Deliver them in order.
  let delivery = Promise.resolve()
  const say = (sentence: string) => {
    const audio = generateSpeech({
      adapter: openaiSpeech('gpt-4o-mini-tts'),
      text: sentence,
      voice: character.voice,
      speed: character.speed,
      modelOptions: { instructions: character.instructions },
      format: 'pcm',
      threadId: callId,
      abortSignal: signal,
    }).catch((error: unknown) => {
      // A barge-in aborts every clip still in flight. That is not a failure.
      if (signal.aborted) return undefined
      throw error
    })
    delivery = delivery.then(async () => {
      const result = await audio
      if (result && !signal.aborted) {
        carrier.speak(Buffer.from(result.audio, 'base64'))
      }
    })
  }

  try {
    const stream = chat({
      adapter: openaiText('gpt-6.1-terra'),
      systemPrompts: [SYSTEM_PROMPT, character.persona],
      tools: [searchDocs],
      messages,
      threadId: callId,
      abortController,
    })
    for await (const chunk of stream) {
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
    if (signal.aborted) return
    throw error
  }
  if (full) {
    messages.push({ role: 'assistant', content: full })
    carrier.caption('agent', full, true)
  }
}
