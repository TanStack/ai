// Claude AI service for handling queued AI responses
import { anthropicText } from '@tanstack/ai-anthropic'
import { chat, toolDefinition } from '@tanstack/ai'
import type { JSONSchema, ModelMessage, StreamChunk } from '@tanstack/ai'

// Define input schema for getWeather tool using JSONSchema
const getWeatherInputSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: {
      type: 'string',
      description: 'The city or location to get weather for',
    },
    unit: {
      type: 'string',
      enum: ['celsius', 'fahrenheit'],
      description: 'Temperature unit (defaults to celsius)',
    },
  },
  required: ['location'],
}

// Define output schema for getWeather tool using JSONSchema
const getWeatherOutputSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: { type: 'string' },
    temperature: { type: 'number' },
    unit: { type: 'string' },
    conditions: { type: 'string' },
    humidity: { type: 'number' },
  },
  required: ['location', 'temperature', 'unit', 'conditions'],
}

// Create the getWeather tool using JSONSchema instead of Zod
const getWeatherTool = toolDefinition({
  name: 'getWeather',
  description:
    'Get the current weather for a location. Returns temperature, conditions, and humidity.',
  inputSchema: getWeatherInputSchema,
  outputSchema: getWeatherOutputSchema,
}).server((args) => {
  // Mock weather data - in a real app this would call a weather API
  const mockWeatherData: Record<
    string,
    { temp: number; conditions: string; humidity: number }
  > = {
    'new york': { temp: 72, conditions: 'Partly cloudy', humidity: 65 },
    london: { temp: 58, conditions: 'Overcast', humidity: 80 },
    tokyo: { temp: 68, conditions: 'Sunny', humidity: 55 },
    paris: { temp: 62, conditions: 'Light rain', humidity: 75 },
    sydney: { temp: 78, conditions: 'Clear skies', humidity: 45 },
  }

  const location = (args.location as string).toLowerCase()
  const unit = (args.unit as string | undefined) ?? 'celsius'
  const weather = mockWeatherData[location] ?? {
    temp: 65,
    conditions: 'Unknown',
    humidity: 50,
  }

  // Convert temperature if needed
  let temperature = weather.temp
  if (unit === 'celsius') {
    temperature = Math.round(((temperature - 32) * 5) / 9)
  }

  console.log(`🌤️ Weather tool called for: ${args.location}`)

  return {
    location: args.location,
    temperature,
    unit,
    conditions: weather.conditions,
    humidity: weather.humidity,
  }
})

export interface ClaudeRequest {
  id: string
  username: string
  message: string
  conversationHistory: Array<ModelMessage>
}

export interface ClaudeQueueStatus {
  current: string | null
  queue: Array<string>
  isProcessing: boolean
}

export class ClaudeService {
  private adapter = anthropicText('claude-sonnet-4-5') // Uses ANTHROPIC_API_KEY from env
  private queue: Array<ClaudeRequest> = []
  private currentRequest: ClaudeRequest | null = null
  private isProcessing = false

  enqueue(request: ClaudeRequest): void {
    console.log(`🤖 Claude: Enqueuing request from ${request.username}`)
    this.queue.push(request)
  }

  getQueueStatus(): ClaudeQueueStatus {
    return {
      current: this.currentRequest?.username || null,
      queue: this.queue.map((r) => r.username),
      isProcessing: this.isProcessing,
    }
  }

  startProcessing(): void {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true
    this.currentRequest = this.queue.shift()!
    console.log(
      `🤖 Claude: Started processing request from ${this.currentRequest.username}`,
    )
  }

  finishProcessing(): void {
    console.log(
      `🤖 Claude: Finished processing request from ${this.currentRequest?.username}`,
    )
    this.currentRequest = null
    this.isProcessing = false
  }

  async *streamResponse(
    conversationHistory: Array<ModelMessage>,
  ): AsyncIterable<StreamChunk> {
    const systemMessage = `You are Claude, a friendly AI assistant participating in a group chat.
    Keep responses conversational, concise (2-3 sentences max unless asked for more detail), and helpful.
    You can see the entire conversation history with all participants.`

    try {
      console.log(`🤖 Claude: ========== STARTING STREAM RESPONSE ==========`)
      console.log(
        `🤖 Claude: Conversation history (${conversationHistory.length} messages):`,
      )
      conversationHistory.forEach((m, i) => {
        const content =
          typeof m.content === 'string' ? m.content.substring(0, 80) : '[array]'
        console.log(`  ${i + 1}. ${m.role}: ${content}...`)
      })

      let chunkCount = 0
      let accumulatedContent = ''

      for await (const chunk of chat({
        adapter: this.adapter,
        systemPrompts: [systemMessage],
        messages: [...conversationHistory] as any,
        tools: [getWeatherTool],
      })) {
        chunkCount++

        if (chunk.type === 'content' && chunk.delta) {
          accumulatedContent += chunk.delta
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [content] delta: "${chunk.delta}" (total: ${accumulatedContent.length} chars)`,
          )
        } else {
          console.log(
            `🤖 Claude: Chunk #${chunkCount} [${chunk.type}]`,
            JSON.stringify(chunk, null, 2).substring(0, 200),
          )
        }

        yield chunk
      }

      console.log(`🤖 Claude: ========== STREAM COMPLETE ==========`)
      console.log(
        `🤖 Claude: Total chunks: ${chunkCount}, Final content: "${accumulatedContent}"`,
      )
    } catch (error) {
      console.error('🤖 Claude: ========== ERROR IN STREAM ==========')
      console.error('🤖 Claude: Error streaming response:', error)
      throw error
    }
  }
}

// Global singleton instance
export const globalClaudeService = new ClaudeService()
