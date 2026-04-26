import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { RealtimeConnection } from '@tanstack/ai-client'
import type { AnyClientTool, RealtimeMessage } from '@tanstack/ai'

// Capture the session options passed to Conversation.startSession
let capturedSessionOptions: Record<string, any> = {}

vi.mock('@11labs/client', () => ({
  Conversation: {
    startSession: vi.fn(async (options: Record<string, any>) => {
      capturedSessionOptions = options
      // Call onConnect to simulate connection established
      options.onConnect?.()
      return {
        endSession: vi.fn(),
        sendUserMessage: vi.fn(),
        getInputVolume: () => 0,
        getOutputVolume: () => 0,
        getInputByteFrequencyData: () => new Uint8Array(128),
        getOutputByteFrequencyData: () => new Uint8Array(128),
      }
    }),
  },
}))

import { elevenlabsRealtime } from '../src/realtime/adapter'

describe('elevenlabsRealtime adapter', () => {
  beforeEach(() => {
    capturedSessionOptions = {}
  })

  const fakeToken = {
    token: 'wss://fake-signed-url',
    expiresAt: Date.now() + 60_000,
  }

  async function createConnection(
    tools?: ReadonlyArray<AnyClientTool>,
  ): Promise<RealtimeConnection> {
    const adapter = elevenlabsRealtime()
    return adapter.connect(fakeToken, tools)
  }

  describe('onMessage duplicate user messages', () => {
    it('should emit only transcript for user messages, not message_complete', async () => {
      const connection = await createConnection()

      const transcriptEvents: Array<{
        role: string
        transcript: string
        isFinal: boolean
      }> = []
      const messageCompleteEvents: Array<{ message: RealtimeMessage }> = []

      connection.on('transcript', (payload) => {
        transcriptEvents.push(payload as any)
      })
      connection.on('message_complete', (payload) => {
        messageCompleteEvents.push(payload as any)
      })

      // Simulate a user message from ElevenLabs
      capturedSessionOptions.onMessage({
        message: 'Hello from user',
        source: 'user',
      })

      // Should emit transcript for user
      expect(transcriptEvents).toHaveLength(1)
      expect(transcriptEvents[0]).toMatchObject({
        role: 'user',
        transcript: 'Hello from user',
        isFinal: true,
      })

      // Should NOT emit message_complete for user — the RealtimeClient
      // already creates the user message from the final transcript
      expect(messageCompleteEvents).toHaveLength(0)
    })

    it('should emit only message_complete for assistant messages, not transcript', async () => {
      const connection = await createConnection()

      const transcriptEvents: Array<{
        role: string
        transcript: string
        isFinal: boolean
      }> = []
      const messageCompleteEvents: Array<{ message: RealtimeMessage }> = []

      connection.on('transcript', (payload) => {
        transcriptEvents.push(payload as any)
      })
      connection.on('message_complete', (payload) => {
        messageCompleteEvents.push(payload as any)
      })

      // Simulate an assistant message from ElevenLabs
      capturedSessionOptions.onMessage({
        message: 'Hello from assistant',
        source: 'ai',
      })

      // Should NOT emit transcript for assistant final messages —
      // message_complete is the canonical event for assistant messages
      expect(transcriptEvents).toHaveLength(0)

      // Should emit message_complete for assistant
      expect(messageCompleteEvents).toHaveLength(1)
      expect(messageCompleteEvents[0]!.message).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'audio', transcript: 'Hello from assistant' }],
      })
    })

    it('should not produce duplicate messages when both user and assistant speak', async () => {
      const connection = await createConnection()

      const transcriptEvents: Array<any> = []
      const messageCompleteEvents: Array<any> = []

      connection.on('transcript', (payload) => transcriptEvents.push(payload))
      connection.on('message_complete', (payload) =>
        messageCompleteEvents.push(payload),
      )

      // User speaks, then assistant responds
      capturedSessionOptions.onMessage({
        message: 'What is the weather?',
        source: 'user',
      })
      capturedSessionOptions.onMessage({
        message: 'It is sunny today.',
        source: 'ai',
      })

      // One transcript event (user only)
      expect(transcriptEvents).toHaveLength(1)
      expect(transcriptEvents[0].role).toBe('user')

      // One message_complete event (assistant only)
      expect(messageCompleteEvents).toHaveLength(1)
      expect(messageCompleteEvents[0].message.role).toBe('assistant')
    })
  })

  describe('clientTools registration', () => {
    it('should pass client tools as plain functions to @11labs/client', async () => {
      const mockTool: AnyClientTool = {
        name: 'get_weather',
        description: 'Get current weather',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
        } as any,
        execute: vi.fn(async (params: any) => `Sunny in ${params.city}`),
      }

      await createConnection([mockTool])

      // The clientTools passed to startSession should contain plain functions
      const registeredTool = capturedSessionOptions.clientTools?.get_weather
      expect(registeredTool).toBeDefined()
      expect(typeof registeredTool).toBe('function')

      // Calling the function directly should invoke the tool's execute
      const result = await registeredTool({ city: 'Seattle' })
      expect(result).toBe('Sunny in Seattle')
      expect(mockTool.execute).toHaveBeenCalledWith({ city: 'Seattle' })
    })

    it('should JSON-stringify non-string tool results', async () => {
      const mockTool: AnyClientTool = {
        name: 'get_data',
        description: 'Get data',
        execute: vi.fn(async () => ({ temp: 72, unit: 'F' })),
      }

      await createConnection([mockTool])

      const registeredTool = capturedSessionOptions.clientTools?.get_data
      const result = await registeredTool({})
      expect(result).toBe(JSON.stringify({ temp: 72, unit: 'F' }))
    })

    it('should not include clientTools in session options when no tools provided', async () => {
      await createConnection()

      expect(capturedSessionOptions.clientTools).toBeUndefined()
    })
  })
})
