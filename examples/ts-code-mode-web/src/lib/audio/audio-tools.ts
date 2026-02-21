import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@tanstack/ai'
import { asyncRegistry, generateRequestId } from './async-registry'

/**
 * Audio I/O Tools
 *
 * These tools handle loading, storing, playing, and managing audio files.
 * They use async requests to communicate with the client for operations
 * that require browser APIs (file picker, microphone, playback).
 *
 * The async pattern:
 * 1. Tool generates a unique request ID
 * 2. Tool emits custom event to client with the request ID
 * 3. Tool awaits the async registry promise
 * 4. Client handles the event and POSTs result to /api/audio-resolve
 * 5. Registry resolves the promise with the client's data
 * 6. Tool returns the actual data to the VM
 */

// Schema for audio data returned from client
const audioDataSchema = z.object({
  samples: z.array(z.number()).describe('Audio samples as Float32Array values'),
  sampleRate: z.number().describe('Sample rate in Hz'),
  duration: z.number().describe('Duration in seconds'),
  channels: z.number().describe('Number of audio channels'),
})

// Schema for stored audio metadata
const storedAudioSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(),
  sampleRate: z.number(),
})

/**
 * Load audio from file upload, microphone recording, or stored audio
 * This tool WAITS for the client to provide the audio data.
 */
export const audioLoadTool = toolDefinition({
  name: 'audio_load',
  description: `Load audio from various sources. This tool waits for the client to provide audio data.
- source='file': Opens file picker for user to select an audio file
- source='microphone': Records from user's microphone for the specified duration
- source='stored': Retrieves previously stored audio by name

Returns the actual audio samples that can be used for DSP processing.`,
  inputSchema: z.object({
    source: z
      .enum(['file', 'microphone', 'stored'])
      .describe('Source for audio'),
    name: z
      .string()
      .optional()
      .describe("Name of stored audio (required when source='stored')"),
    duration: z
      .number()
      .optional()
      .describe('Recording duration in seconds (microphone only, default 5)'),
  }),
  outputSchema: audioDataSchema,
}).server(async (input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const requestId = generateRequestId()

  // Validate input
  if (input.source === 'stored' && !input.name) {
    throw new Error("'name' is required when source='stored'")
  }

  // Emit request to client
  emitCustomEvent(
    'audio:load_request',
    {
      requestId,
      source: input.source,
      name: input.name,
      duration: input.duration || 5,
    },
  )

  // Wait for client to respond (120s timeout for user interactions)
  const audioData = await asyncRegistry.createRequest<{
    samples: number[]
    sampleRate: number
    duration: number
    channels: number
  }>(requestId, 120000, `audio_load:${input.source}`)

  return audioData
})

/**
 * Store audio for later retrieval and playback
 * This is a fire-and-forget operation - no need to wait.
 */
export const audioStoreTool = toolDefinition({
  name: 'audio_store',
  description:
    'Store processed audio data with a name. This makes it available for playback and future reference.',
  inputSchema: z.object({
    name: z.string().describe('Name for the stored audio'),
    samples: z
      .array(z.number())
      .describe('Audio samples as array of numbers'),
    sampleRate: z.number().describe('Sample rate in Hz'),
    description: z
      .string()
      .optional()
      .describe('Optional description shown in UI'),
    replace: z
      .boolean()
      .optional()
      .describe('Whether to overwrite if name exists'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    name: z.string(),
    message: z.string(),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})

  // Emit event to store audio on client (fire and forget)
  emitCustomEvent(
    'audio:store',
    {
      name: input.name,
      samples: input.samples,
      sampleRate: input.sampleRate,
      description: input.description,
      replace: input.replace,
    },
  )

  return {
    success: true,
    name: input.name,
    message: `Audio "${input.name}" has been stored and is now available for playback.`,
  }
})

/**
 * Play stored audio through user's speakers
 * This tool WAITS for playback to complete.
 */
export const audioPlayTool = toolDefinition({
  name: 'audio_play',
  description:
    "Play stored audio through the user's speakers. Waits for playback to complete.",
  inputSchema: z.object({
    name: z.string().describe('Name of the stored audio to play'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    duration: z.number().optional(),
  }),
}).server(async (input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const requestId = generateRequestId()

  // Emit request to client
  emitCustomEvent(
    'audio:play_request',
    {
      requestId,
      name: input.name,
    },
  )

  // Wait for playback to complete (60s timeout)
  const result = await asyncRegistry.createRequest<{
    success: boolean
    duration?: number
    error?: string
  }>(requestId, 60000, 'audio_play')

  if (!result.success) {
    throw new Error(result.error || `Failed to play "${input.name}"`)
  }

  return {
    success: true,
    message: `Finished playing "${input.name}"`,
    duration: result.duration,
  }
})

/**
 * List all stored audio files
 * This tool fetches the actual list from the client.
 */
export const audioListTool = toolDefinition({
  name: 'audio_list',
  description:
    'List all stored audio files with their metadata (name, duration, sample rate).',
  inputSchema: z.object({}),
  outputSchema: z.object({
    files: z.array(storedAudioSchema),
    count: z.number(),
  }),
}).server(async (_input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  const requestId = generateRequestId()

  // Emit request to client
  emitCustomEvent(
    'audio:list_request',
    {
      requestId,
    },
  )

  // Wait for client to respond (30s timeout - allow for SSE latency)
  const result = await asyncRegistry.createRequest<{
    files: Array<{
      id: string
      name: string
      duration: number
      sampleRate: number
    }>
  }>(requestId, 30000, 'audio_list')

  return {
    files: result.files,
    count: result.files.length,
  }
})

/**
 * Delete stored audio
 * This is a fire-and-forget operation.
 */
export const audioDeleteTool = toolDefinition({
  name: 'audio_delete',
  description: 'Delete a stored audio file.',
  inputSchema: z.object({
    name: z.string().describe('Name of the audio to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
}).server((input, context?: ToolExecutionContext) => {
  const emitCustomEvent = context?.emitCustomEvent || (() => {})

  // Emit event to delete audio on client (fire and forget)
  emitCustomEvent(
    'audio:delete',
    {
      name: input.name,
    },
  )

  return {
    success: true,
    message: `Audio "${input.name}" has been deleted.`,
  }
})

// Export all audio tools
export const audioTools = [
  audioLoadTool,
  audioStoreTool,
  audioPlayTool,
  audioListTool,
  audioDeleteTool,
]
