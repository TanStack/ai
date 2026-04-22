import { convertSchemaToJsonSchema } from "@tanstack/ai";
import { ActivityHandling, EndSensitivity, Modality, StartSensitivity, TurnCoverage } from "@google/genai";
import type { ContextWindowCompressionConfig, FunctionDeclaration, FunctionResponse, LiveClientMessage, LiveServerGoAway, LiveServerMessage, LiveServerSessionResumptionUpdate, LiveServerToolCall, UsageMetadata } from "@google/genai";
import type { AnyClientTool, RealtimeSessionConfig, RealtimeToken } from "@tanstack/ai";
import type { GeminiRealtimeModel, GeminiRealtimeVoice } from "./types";

interface LiveResponsePayloads {
  text: string,
  audio: { audioData: string, transcript: string },
  setup_complete: string,
  interrupted: string,
  turn_complete: string,
  tool_call: LiveServerToolCall,
  session_resumption_update: LiveServerSessionResumptionUpdate,
  go_away: LiveServerGoAway,
  usage_metadata: UsageMetadata,
  error: string,
  input_transcription: { text: string, finished: boolean },
  output_transcription: { text: string, finished: boolean },
}

export type MultimodalLiveResponseType = keyof LiveResponsePayloads

export type LiveResponse = {
  [K in MultimodalLiveResponseType]: {
    type: K,
    data: LiveResponsePayloads[K],
    endOfTurn: boolean,
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
function parseResponseMessages(data: LiveServerMessage) {
  const responses: Array<LiveResponse> = [];
  const serverContent = data.serverContent;
  const parts = serverContent?.modelTurn?.parts;

  try {
    // Setup complete (exclusive — no other fields expected)
    if (data.setupComplete) {
      console.log("🏁 SETUP COMPLETE response", data);
      responses.push({ type: "setup_complete", data: "", endOfTurn: false });
      return responses;
    }

    // Tool call (exclusive)
    if (data.toolCall) {
      console.log("🎯 🛠️ TOOL CALL response", data.toolCall);
      responses.push({ type: "tool_call", data: data.toolCall, endOfTurn: false });
      return responses;
    }

    if (data.sessionResumptionUpdate) {
      responses.push({ type: "session_resumption_update", data: data.sessionResumptionUpdate, endOfTurn: false })
    }

    if (data.goAway) {
      responses.push({ type: "go_away", data: data.goAway, endOfTurn: false })
    }

    if (data.usageMetadata) {
      responses.push({ type: "usage_metadata", data: data.usageMetadata, endOfTurn: false })
    }

    // Audio data from model turn parts
    if (parts?.length) {
      for (const part of parts) {
        if (part.inlineData?.data) {
          responses.push({
            type: "audio",
            data: {
              audioData: part.inlineData.data,
              // The transcription is independent to the model turn which means it doesn’t imply any ordering between transcription and model turn.
              transcript: "",
            },
            endOfTurn: false
          });
        } else if (part.text) {
          console.log("💬 TEXT response", part.text);
          responses.push({ type: "text", data: part.text, endOfTurn: false });
        }
      }
    }

    // Transcriptions — checked independently, NOT in else-if with audio
    if (serverContent?.inputTranscription) {
      responses.push({
        type: "input_transcription",
        data: {
          text: serverContent.inputTranscription.text || "",
          finished: serverContent.inputTranscription.finished || false,
        },
        endOfTurn: false,
      });
    }

    if (serverContent?.outputTranscription) {
      responses.push({
        type: "output_transcription",
        data: {
          text: serverContent.outputTranscription.text || "",
          finished: serverContent.outputTranscription.finished || false,
        },
        endOfTurn: false,
      });
    }

    // Interrupted
    if (serverContent?.interrupted) {
      console.log("🗣️ INTERRUPTED response");
      responses.push({ type: "interrupted", data: "", endOfTurn: false });
    }

    // Turn complete
    if (serverContent?.turnComplete) {
      console.log("🏁 TURN COMPLETE response");
      responses.push({ type: "turn_complete", data: "", endOfTurn: true });
    }
  } catch (err) {
    console.log("⚠️ Error parsing response data: ", err, data);
  }

  return responses;
}

export class GeminiLiveClient {

  private token: string | null = null
  private model: GeminiRealtimeModel | null = null
  
  private responseModalities: Array<Modality> = [Modality.AUDIO];
  private systemInstructions = "";
  private googleGrounding = false;
  private voiceName: GeminiRealtimeVoice = "Puck"; // Default voice
  private temperature = 1.0; // Default temperature
  private inputAudioTranscription = false;
  private outputAudioTranscription = false;
  private contextWindowCompression: ContextWindowCompressionConfig | undefined = undefined;
  private proactiveAudio = false;
  private enableAffectiveDialog = false;

  private maxOutputTokens: number | undefined = undefined;
  private functions: Array<AnyClientTool> = [];
  private functionsMap = new Map<string, AnyClientTool>();

  // Automatic activity detection settings with defaults
  private automaticActivityDetection = {
    disabled: false,
    silence_duration_ms: 2000,
    prefix_padding_ms: 500,
    end_of_speech_sensitivity: EndSensitivity.END_SENSITIVITY_UNSPECIFIED,
    start_of_speech_sensitivity: StartSensitivity.START_SENSITIVITY_UNSPECIFIED,
  };

  private activityHandling = ActivityHandling.ACTIVITY_HANDLING_UNSPECIFIED;

  private webSocket: WebSocket | null = null
  // Last resumable session update
  private lastResumptionUpdate: LiveServerSessionResumptionUpdate | null = null
  private setupComplete = false
  private connected = false

  public onReceiveResponse: (response: LiveResponse) => void = () => { }
  public onOpen: () => void = () => { }
  public onClose: () => void = () => { }
  public onError: (error: string) => void = () => { }

  constructor(token: string, model: GeminiRealtimeModel, tools?: ReadonlyArray<AnyClientTool> ) {
    this.token = token
    this.model = model

    if (tools) {
      tools.forEach(tool => {
        this.functions.push(tool)
        this.functionsMap.set(tool.name, tool)
      })
    }
  }

  get isConnected() {
    return this.connected
  }

  get isSetupCompelete() {
    return this.setupComplete
  }

  /**
   * Connection management
   */
  connect() {
    const promise = new Promise((resolve, reject) => {
      this.webSocket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${this.token}`)

      this.webSocket.onclose = (event) => {
        console.log('realtime websocket close:', event)
        this.connected = false
        this.setupComplete = false;
        this.onClose()
        reject(new Error("Closed before connecting"))
      }

      this.webSocket.onerror = (event) => {
        console.error('realtime websocket error:', event)
        this.connected = false
        this.setupComplete = false;
        this.onError('Connection error')
        reject('Connection error')
      }

      this.webSocket.onopen = (event) => {
        console.log('realtime websocket open:', event)
        this.connected = true
        this.onOpen()
        resolve(this.webSocket)
      }

      this.webSocket.onmessage = this.onReceiveMessage.bind(this)
    })
   
    return promise
  }

  disconnect() {
    if (this.webSocket) {
      this.webSocket.close();
      this.connected = false;
      this.setupComplete = false;
    }
  }

  /**
   * Session management
   */
  getFunctionDefinitions(): Array<FunctionDeclaration> {
    return this.functions.map(f => ({
      name: f.name,
      description: f.description,
      parameters: convertSchemaToJsonSchema(f.inputSchema) as any,
    }))
  }

  sendInitialSetupMessage(resume = false) {
    const tools = this.getFunctionDefinitions()

    const sessionSetupMessage: LiveClientMessage = {
      setup: {
        model: `models/${this.model}`,
        generationConfig: {
          responseModalities: this.responseModalities,
          temperature: this.temperature,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName
              }
            }
          },
          enableAffectiveDialog: this.enableAffectiveDialog,
          maxOutputTokens: this.maxOutputTokens,
        },
        sessionResumption: {
          transparent: true
        },
        contextWindowCompression: this.contextWindowCompression,
        proactivity: {
          proactiveAudio: this.proactiveAudio
        },
        systemInstruction: { parts: [{ text: this.systemInstructions }] },
        tools: [{ functionDeclarations: tools }],
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: this.automaticActivityDetection.disabled,
            silenceDurationMs: this.automaticActivityDetection.silence_duration_ms,
            prefixPaddingMs: this.automaticActivityDetection.prefix_padding_ms,
            endOfSpeechSensitivity: this.automaticActivityDetection.end_of_speech_sensitivity,
            startOfSpeechSensitivity: this.automaticActivityDetection.start_of_speech_sensitivity,
          },
          activityHandling: this.activityHandling,
          turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
        },
      }
    }

    if (this.inputAudioTranscription) {
      sessionSetupMessage.setup!.inputAudioTranscription = {}
    }

    if (this.outputAudioTranscription) {
      sessionSetupMessage.setup!.outputAudioTranscription = {}
    }

    if (this.googleGrounding) {
      // Currently can't have both Google Search with custom tools.
      console.warn(
        "Google Grounding enabled, removing custom function calls if any."
      );
      sessionSetupMessage.setup!.tools = [{ googleSearch: {} }];
    }

    if (resume) {
      sessionSetupMessage.setup!.sessionResumption = {
        handle: this.lastResumptionUpdate?.newHandle,
        transparent: true
      }
    }

    console.log("FINAL SETUP JSON:", JSON.stringify(sessionSetupMessage, null, 2));
    this.sendMessage(sessionSetupMessage)
  }

  async restartSession(resume = false) {
    console.log("RESTARTING SESSION")
    this.disconnect()
    await this.connect()
    this.sendInitialSetupMessage(resume)
  }

  updateToken(token: RealtimeToken) {
    console.log("UPDATING TOKEN")
    this.token = token.token

    if (token.config.model && this.model != token.config.model) {
      this.model = token.config.model as GeminiRealtimeModel
      this.restartSession() // Restart session completely with new model
    } else {
      this.restartSession(true)
    }
  }

  async updateSession(config: Partial<RealtimeSessionConfig>) {
    // model can only be set during initial setup
    if (config.model && !this.setupComplete) {
      this.model = config.model as GeminiRealtimeModel
    }

    if (config.instructions) {
      this.systemInstructions = config.instructions
    }

    if (config.tools !== undefined) {
      this.functions = config.tools as Array<any>
      this.functionsMap.clear()
      config.tools.forEach(tool => {
        this.functionsMap.set(tool.name, tool as any)
      })
    }

    if (config.maxOutputTokens) {
      this.maxOutputTokens = typeof config.maxOutputTokens === 'number' ? config.maxOutputTokens : undefined
    }

    if (config.temperature) {
      this.temperature = config.temperature
    }

    if (config.voice) {
      this.voiceName = config.voice as GeminiRealtimeVoice
    }

    if (config.modelOptions?.googleGrounding) {
      this.googleGrounding = config.modelOptions.googleGrounding
    }

    if (config.modelOptions?.proactivity) {
      this.proactiveAudio = config.modelOptions.proactivity
    }

    if (config.modelOptions?.enableAffectiveDialog) {
      this.enableAffectiveDialog = config.modelOptions.enableAffectiveDialog
    }

    if (config.modelOptions?.contextWindowCompression) {
      this.contextWindowCompression = config.modelOptions.contextWindowCompression
    }

    const includeTranscription = config.outputModalities?.includes("text") || false
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
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    }
  }

  async onReceiveMessage(messageEvent: MessageEvent) {
    let jsonData;
    if (messageEvent.data instanceof Blob) {
      jsonData = await messageEvent.data.text();
    } else if (messageEvent.data instanceof ArrayBuffer) {
      jsonData = new TextDecoder().decode(messageEvent.data);
    } else {
      jsonData = messageEvent.data;
    }

    try {
      const messageData = JSON.parse(jsonData);
      // Parse all response types from this message (audio + transcription can coexist)
      const responses = parseResponseMessages(messageData);
      for (const response of responses) {
        if (
          response.type === "session_resumption_update" &&
          response.data.resumable
        ) {
          this.lastResumptionUpdate = response.data
        }
        if (response.type === "go_away") {
          // TODO: refresh token and resume session
        }
        if (response.type === "setup_complete") {
          this.setupComplete = true
        }
        this.onReceiveResponse(response);
      }
    } catch (err) {
      console.error("Error parsing JSON message:", err, jsonData);
    }
  }

  sendRealtimeInputMessage(data: string, mimeType: string) {
    const blob = { mimeType, data };

    if (mimeType.startsWith("audio/")) {
      this.sendMessage({ realtimeInput: { audio: blob } })
    } else if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
      this.sendMessage({ realtimeInput: { video: blob } })
    }
  }

  sendAudioMessage(base64PCM: string) {
    this.sendRealtimeInputMessage(base64PCM, "audio/pcm")
  }

  sendImageMessage(base64: string, mimeType = 'image/jpeg') {
    this.sendRealtimeInputMessage(base64, mimeType)
  }

  sendTextMessage(text: string) {
    const message: LiveClientMessage = {
      realtimeInput: {
        text
      }
    }
    this.sendMessage(message)
  }

  sendToolResponse(functionResponses: Array<FunctionResponse>) {
    const message: LiveClientMessage = {
      toolResponse: {
        functionResponses
      }
    }
    this.sendMessage(message)
  }
}