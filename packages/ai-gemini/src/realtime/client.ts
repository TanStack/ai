import { convertSchemaToJsonSchema } from '@tanstack/ai'
import {
  ActivityHandling,
  EndSensitivity,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from '@google/genai'
import type {
  ContextWindowCompressionConfig,
  FunctionDeclaration,
  FunctionResponse,
  LiveClientMessage,
  LiveServerGoAway,
  LiveServerMessage,
  LiveServerSessionResumptionUpdate,
  LiveServerToolCall,
  ThinkingConfig,
  UsageMetadata,
} from '@google/genai'
import type {
  AnyClientTool,
  RealtimeSessionConfig,
  RealtimeToken,
  RealtimeToolConfig,
} from '@tanstack/ai'
import type {
  GeminiRealtimeModel,
  GeminiRealtimeProviderOptions,
  GeminiRealtimeVoice,
} from './types'

/** Build a Gemini FunctionDeclaration from an isomorphic client tool (Zod). */
function clientToolToDeclaration(tool: AnyClientTool): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: convertSchemaToJsonSchema(tool.inputSchema),
    responseJsonSchema: convertSchemaToJsonSchema(tool.outputSchema),
  }
}

/** Build a Gemini FunctionDeclaration from an already-serialized tool config. */
function toolConfigToDeclaration(
  tool: RealtimeToolConfig,
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.inputSchema,
    responseJsonSchema: tool.outputSchema,
  }
}

interface LiveResponsePayloads {
  text: string
  thought: string
  audio: { audioData: string; transcript: string }
  setup_complete: string
  interrupted: string
  turn_complete: string
  tool_call: LiveServerToolCall
  session_resumption_update: LiveServerSessionResumptionUpdate
  go_away: LiveServerGoAway
  usage_metadata: UsageMetadata
  error: string
  input_transcription: { text: string; finished: boolean }
  output_transcription: { text: string; finished: boolean }
}

export type MultimodalLiveResponseType = keyof LiveResponsePayloads

export type LiveResponse = {
  [K in MultimodalLiveResponseType]: {
    type: K
    data: LiveResponsePayloads[K]
    endOfTurn: boolean
  }
}[MultimodalLiveResponseType]

/**
 * Parses response messages from the Gemini Live API
 */
/**
 * Parses ALL response types from a single server message.
 * The server can now bundle multiple fields (e.g. audio + transcription)
 * in the same message. Returns an array of response objects.
 */
export function parseResponseMessages(
  data: LiveServerMessage,
): Array<LiveResponse> {
  const responses: Array<LiveResponse> = []
  const serverContent = data.serverContent
  const parts = serverContent?.modelTurn?.parts

  // Setup complete (exclusive — no other fields expected)
  if (data.setupComplete) {
    responses.push({ type: 'setup_complete', data: '', endOfTurn: false })
    return responses
  }

  // Tool call (exclusive)
  if (data.toolCall) {
    responses.push({
      type: 'tool_call',
      data: data.toolCall,
      endOfTurn: false,
    })
    return responses
  }

  if (data.sessionResumptionUpdate) {
    responses.push({
      type: 'session_resumption_update',
      data: data.sessionResumptionUpdate,
      endOfTurn: false,
    })
  }

  if (data.goAway) {
    responses.push({ type: 'go_away', data: data.goAway, endOfTurn: false })
  }

  if (data.usageMetadata) {
    responses.push({
      type: 'usage_metadata',
      data: data.usageMetadata,
      endOfTurn: false,
    })
  }

  // Audio data from model turn parts
  if (parts?.length) {
    for (const part of parts) {
      if (part.inlineData?.data) {
        responses.push({
          type: 'audio',
          data: {
            audioData: part.inlineData.data,
            // The transcription is independent to the model turn, which means it doesn't imply any ordering between transcription and model turn.
            transcript: '',
          },
          endOfTurn: false,
        })
      } else if (part.text) {
        responses.push({
          type: part.thought ? 'thought' : 'text',
          data: part.text,
          endOfTurn: false,
        })
      }
    }
  }

  // Transcriptions — checked independently, NOT in else-if with audio
  if (serverContent?.inputTranscription) {
    responses.push({
      type: 'input_transcription',
      data: {
        text: serverContent.inputTranscription.text || '',
        finished: serverContent.inputTranscription.finished || false,
      },
      endOfTurn: false,
    })
  }

  if (serverContent?.outputTranscription) {
    responses.push({
      type: 'output_transcription',
      data: {
        text: serverContent.outputTranscription.text || '',
        finished: serverContent.outputTranscription.finished || false,
      },
      endOfTurn: false,
    })
  }

  // Interrupted
  if (serverContent?.interrupted) {
    responses.push({ type: 'interrupted', data: '', endOfTurn: false })
  }

  // Turn complete
  if (serverContent?.turnComplete) {
    responses.push({ type: 'turn_complete', data: '', endOfTurn: true })
  }

  return responses
}

export class GeminiLiveClient {
  private token: string | null = null
  private model: GeminiRealtimeModel | null = null

  private readonly responseModalities: Array<Modality> = [Modality.AUDIO]
  private systemInstructions = ''
  private googleGrounding = false
  private voiceName: GeminiRealtimeVoice = 'Puck'
  private temperature = 1.0
  private inputAudioTranscription = false
  private outputAudioTranscription = false
  private contextWindowCompression: ContextWindowCompressionConfig | undefined
  private proactiveAudio = false
  private enableAffectiveDialog = false
  private thinkingConfig: ThinkingConfig | undefined
  private speechLanguageCode: string | undefined

  private maxOutputTokens: number | undefined
  private functionDeclarations: Array<FunctionDeclaration> = []

  private readonly automaticActivityDetection = {
    disabled: false,
    silence_duration_ms: 2000,
    prefix_padding_ms: 500,
    end_of_speech_sensitivity: EndSensitivity.END_SENSITIVITY_UNSPECIFIED,
    start_of_speech_sensitivity: StartSensitivity.START_SENSITIVITY_UNSPECIFIED,
  }

  private readonly activityHandling =
    ActivityHandling.ACTIVITY_HANDLING_UNSPECIFIED

  private webSocket: WebSocket | null = null
  private lastResumptionUpdate: LiveServerSessionResumptionUpdate | null = null
  private setupComplete = false
  private connected = false

  public onReceiveResponse: (response: LiveResponse) => void = () => {}
  public onOpen: () => void = () => {}
  public onClose: () => void = () => {}
  public onError: (error: Error) => void = () => {}

  constructor(
    token: string,
    model: GeminiRealtimeModel,
    tools?: ReadonlyArray<AnyClientTool>,
  ) {
    this.token = token
    this.model = model

    if (tools) {
      this.functionDeclarations = tools.map(clientToolToDeclaration)
    }
  }

  get isConnected() {
    return this.connected
  }

  get isSetupComplete() {
    return this.setupComplete
  }

  /**
   * Connection management
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${this.token}`,
      )
      this.webSocket = socket

      // The browser fires `onerror` then `onclose` on an abnormal close; this
      // flag stops the close handler from overwriting the surfaced error with a
      // benign "closed" signal.
      let errored = false

      socket.onclose = () => {
        this.connected = false
        this.setupComplete = false
        if (!errored) this.onClose()
        reject(new Error('WebSocket closed before setup completed'))
      }

      socket.onerror = () => {
        errored = true
        this.connected = false
        this.setupComplete = false
        const error = new Error('Gemini realtime WebSocket connection error')
        this.onError(error)
        reject(error)
      }

      socket.onopen = () => {
        this.connected = true
        this.onOpen()
        resolve()
      }

      socket.onmessage = (event) => {
        void this.onReceiveMessage(event)
      }
    })
  }

  disconnect() {
    if (this.webSocket) {
      // Detach handlers first so a deliberate teardown (e.g. during a
      // reconnect) doesn't emit a spurious close/error to the client.
      this.webSocket.onclose = null
      this.webSocket.onerror = null
      this.webSocket.onopen = null
      this.webSocket.onmessage = null
      this.webSocket.close()
      this.webSocket = null
    }
    this.connected = false
    this.setupComplete = false
  }

  /**
   * Session management
   */
  sendInitialSetupMessage(resume = false) {
    const tools = this.functionDeclarations

    const setup: NonNullable<LiveClientMessage['setup']> = {
      model: `models/${this.model}`,
      generationConfig: {
        responseModalities: this.responseModalities,
        temperature: this.temperature,
        speechConfig: {
          languageCode: this.speechLanguageCode,
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.voiceName,
            },
          },
        },
        enableAffectiveDialog: this.enableAffectiveDialog,
        maxOutputTokens: this.maxOutputTokens,
        thinkingConfig: this.thinkingConfig,
      },
      sessionResumption: {
        transparent: true,
        handle: resume ? this.lastResumptionUpdate?.newHandle : undefined,
      },
      contextWindowCompression: this.contextWindowCompression,
      proactivity: {
        proactiveAudio: this.proactiveAudio,
      },
      systemInstruction: { parts: [{ text: this.systemInstructions }] },
      tools: [{ functionDeclarations: tools }],
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: this.automaticActivityDetection.disabled,
          silenceDurationMs:
            this.automaticActivityDetection.silence_duration_ms,
          prefixPaddingMs: this.automaticActivityDetection.prefix_padding_ms,
          endOfSpeechSensitivity:
            this.automaticActivityDetection.end_of_speech_sensitivity,
          startOfSpeechSensitivity:
            this.automaticActivityDetection.start_of_speech_sensitivity,
        },
        activityHandling: this.activityHandling,
        turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
      },
    }

    if (this.inputAudioTranscription) {
      setup.inputAudioTranscription = {}
    }

    if (this.outputAudioTranscription) {
      setup.outputAudioTranscription = {}
    }

    if (this.googleGrounding) {
      // Currently can't have both Google Search with custom tools.
      console.warn(
        'Google Grounding enabled, removing custom function calls if any.',
      )
      setup.tools = [{ googleSearch: {} }]
    }

    this.sendMessage({ setup })
  }

  async restartSession(resume = false) {
    this.disconnect()
    await this.connect()
    this.sendInitialSetupMessage(resume)
  }

  updateToken(token: RealtimeToken) {
    this.token = token.token

    // Restart completely with the new model, or resume the existing session.
    const resume = !(token.config.model && this.model != token.config.model)
    if (!resume) {
      this.model = token.config.model as GeminiRealtimeModel
    }
    this.restartSession(resume).catch((err) =>
      this.onError(err instanceof Error ? err : new Error(String(err))),
    )
  }

  async updateSession(config: Partial<RealtimeSessionConfig>) {
    // model can only be set during initial setup
    if (config.model && !this.setupComplete) {
      this.model = config.model as GeminiRealtimeModel
    }

    if (config.instructions) {
      this.systemInstructions = config.instructions
    }

    if (config.tools) {
      this.functionDeclarations = config.tools.map(toolConfigToDeclaration)
    }

    if (config.maxOutputTokens) {
      // Gemini has no "inf" sentinel; treat it as "no explicit limit".
      this.maxOutputTokens =
        typeof config.maxOutputTokens === 'number'
          ? config.maxOutputTokens
          : undefined
    }

    if (config.temperature) {
      this.temperature = config.temperature
    }

    if (config.voice) {
      this.voiceName = config.voice as GeminiRealtimeVoice
    }

    const providerOptions = config.providerOptions as
      | GeminiRealtimeProviderOptions
      | undefined

    if (providerOptions?.googleGrounding) {
      this.googleGrounding = providerOptions.googleGrounding
    }

    if (providerOptions?.proactiveAudio) {
      this.proactiveAudio = providerOptions.proactiveAudio
    }

    if (providerOptions?.enableAffectiveDialog) {
      this.enableAffectiveDialog = providerOptions.enableAffectiveDialog
    }

    if (providerOptions?.contextWindowCompression) {
      this.contextWindowCompression = providerOptions.contextWindowCompression
    }

    if (providerOptions?.thinkingConfig) {
      this.thinkingConfig = providerOptions.thinkingConfig
    }

    if (providerOptions?.languageCode) {
      this.speechLanguageCode = providerOptions.languageCode
    }

    const includeTranscription =
      config.outputModalities?.includes('text') || false
    this.inputAudioTranscription = includeTranscription
    this.outputAudioTranscription = includeTranscription

    if (!this.setupComplete) {
      this.sendInitialSetupMessage()
    } else {
      return this.restartSession(true)
    }
  }

  /**
   * Message transmission & receiving
   */
  sendMessage(message: LiveClientMessage) {
    if (this.webSocket?.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message))
    } else {
      this.onError(
        new Error('Cannot send message: Gemini realtime socket is not open'),
      )
    }
  }

  async onReceiveMessage(messageEvent: MessageEvent) {
    let jsonData
    if (messageEvent.data instanceof Blob) {
      jsonData = await messageEvent.data.text()
    } else if (messageEvent.data instanceof ArrayBuffer) {
      jsonData = new TextDecoder().decode(messageEvent.data)
    } else {
      jsonData = messageEvent.data
    }

    try {
      const messageData = JSON.parse(jsonData)
      // Parse all response types from this message (audio + transcription can coexist)
      const responses = parseResponseMessages(messageData)
      for (const response of responses) {
        if (
          response.type === 'session_resumption_update' &&
          response.data.resumable
        ) {
          this.lastResumptionUpdate = response.data
        }
        if (response.type === 'setup_complete') {
          this.setupComplete = true
        }
        this.onReceiveResponse(response)
      }
    } catch (err) {
      this.onError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  sendRealtimeInputMessage(data: string, mimeType: string) {
    const blob = { mimeType, data }

    if (mimeType.startsWith('audio/')) {
      this.sendMessage({ realtimeInput: { audio: blob } })
    } else if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      this.sendMessage({ realtimeInput: { video: blob } })
    }
  }

  sendAudioMessage(base64PCM: string) {
    this.sendRealtimeInputMessage(base64PCM, 'audio/pcm')
  }

  sendImageMessage(base64: string, mimeType = 'image/jpeg') {
    this.sendRealtimeInputMessage(base64, mimeType)
  }

  sendTextMessage(text: string) {
    const message: LiveClientMessage = {
      realtimeInput: {
        text,
      },
    }
    this.sendMessage(message)
  }

  sendToolResponse(functionResponses: Array<FunctionResponse>) {
    const message: LiveClientMessage = {
      toolResponse: {
        functionResponses,
      },
    }
    this.sendMessage(message)
  }
}
