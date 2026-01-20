---
title: Realtime Voice Chat Architecture
id: realtime-chat-architecture
---

# Realtime Voice Chat Architecture

This document describes the architecture of TanStack AI's realtime voice-to-voice chat capability, which enables browser-based voice conversations with AI models.

## Overview

The realtime chat system provides a vendor-neutral, type-safe abstraction for voice-to-voice AI interactions. It currently supports:

- **OpenAI Realtime API** - WebRTC-based connection with GPT-4o realtime models
- **ElevenLabs Conversational AI** - SDK-based connection for voice conversations

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Application                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   useRealtimeChat()                      │    │
│  │  - Connection state (status, mode)                       │    │
│  │  - Messages & transcripts                                │    │
│  │  - Audio visualization (levels, waveforms)               │    │
│  │  - Control methods (connect, disconnect, interrupt)      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       @tanstack/ai-client                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    RealtimeClient                        │    │
│  │  - Connection lifecycle management                       │    │
│  │  - Token refresh scheduling                              │    │
│  │  - Event subscription & dispatch                         │    │
│  │  - Tool execution coordination                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Adapters                           │
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │   openaiRealtime()   │    │ elevenlabsRealtime() │          │
│  │  - WebRTC connection │    │  - SDK wrapper       │          │
│  │  - Audio I/O         │    │  - Signed URL auth   │          │
│  │  - Event mapping     │    │  - Event mapping     │          │
│  └──────────────────────┘    └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Server-Side                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Token Generation Endpoint                   │    │
│  │  - openaiRealtimeToken() - ephemeral client secrets     │    │
│  │  - elevenlabsRealtimeToken() - signed URLs              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Token Adapters (Server-Side)

Token adapters generate short-lived credentials for client-side connections. This keeps API keys secure on the server.

```typescript
// Server-side token endpoint
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

const token = await realtimeToken({
  adapter: openaiRealtimeToken({
    model: 'gpt-4o-realtime-preview',
    voice: 'alloy',
    instructions: 'You are a helpful assistant.',
    turnDetection: {
      type: 'server_vad',
      threshold: 0.5,
      silence_duration_ms: 500,
    },
  }),
})
```

**Token Structure:**
```typescript
interface RealtimeToken {
  provider: string        // 'openai' | 'elevenlabs'
  token: string          // Ephemeral token or signed URL
  expiresAt: number      // Expiration timestamp (ms)
  config: RealtimeSessionConfig  // Session configuration
}
```

### 2. Client Adapters (Browser-Side)

Client adapters handle the actual connection to provider APIs, managing:
- WebRTC or WebSocket connections
- Audio capture and playback
- Event translation to common format
- Audio visualization data

```typescript
// Client-side adapter usage
import { openaiRealtime } from '@tanstack/ai-openai'

const adapter = openaiRealtime({
  connectionMode: 'webrtc', // default
})
```

### 3. RealtimeClient

The `RealtimeClient` class manages the connection lifecycle:

- **Connection Management**: Connect, disconnect, reconnect
- **Token Refresh**: Automatically refreshes tokens before expiry
- **Event Handling**: Subscribes to adapter events and dispatches to callbacks
- **State Management**: Tracks status, mode, messages, transcripts
- **Tool Execution**: Coordinates client-side tool calls

### 4. useRealtimeChat Hook

The React hook provides a reactive interface:

```typescript
const {
  // Connection state
  status,      // 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'
  error,
  connect,
  disconnect,

  // Conversation state
  mode,        // 'idle' | 'listening' | 'thinking' | 'speaking'
  messages,
  pendingUserTranscript,
  pendingAssistantTranscript,

  // Voice control
  startListening,
  stopListening,
  interrupt,

  // Audio visualization
  inputLevel,
  outputLevel,
  getInputTimeDomainData,
  getOutputTimeDomainData,
} = useRealtimeChat({
  getToken: () => fetch('/api/realtime-token').then(r => r.json()),
  adapter: openaiRealtime(),
})
```

## Connection Flow

### OpenAI WebRTC Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Server
    participant OpenAI

    Browser->>Server: POST /api/realtime-token
    Server->>OpenAI: POST /v1/realtime/sessions
    OpenAI-->>Server: { client_secret, expires_at }
    Server-->>Browser: RealtimeToken

    Browser->>Browser: getUserMedia() - request mic
    Browser->>Browser: Create RTCPeerConnection
    Browser->>Browser: Add audio track to PC
    Browser->>Browser: createOffer()

    Browser->>OpenAI: POST /v1/realtime?model=...
    Note right of Browser: SDP offer + ephemeral token
    OpenAI-->>Browser: SDP answer

    Browser->>Browser: setRemoteDescription()
    Note over Browser,OpenAI: WebRTC connection established

    Browser->>OpenAI: Audio via WebRTC
    OpenAI-->>Browser: Audio + events via WebRTC
```

### ElevenLabs Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Server
    participant ElevenLabs

    Browser->>Server: POST /api/realtime-token
    Server->>ElevenLabs: POST /v1/convai/conversation/get_signed_url
    ElevenLabs-->>Server: { signed_url }
    Server-->>Browser: RealtimeToken

    Browser->>ElevenLabs: Conversation.startSession(signedUrl)
    Note over Browser,ElevenLabs: SDK handles WebSocket/WebRTC

    Browser->>ElevenLabs: Audio via SDK
    ElevenLabs-->>Browser: Audio + events via SDK
```

## Audio Visualization

The system provides real-time audio visualization through the `AudioVisualization` interface:

```typescript
interface AudioVisualization {
  inputLevel: number           // 0-1 normalized input volume (RMS)
  outputLevel: number          // 0-1 normalized output volume (RMS)
  getInputFrequencyData(): Uint8Array   // FFT frequency bins
  getOutputFrequencyData(): Uint8Array
  getInputTimeDomainData(): Uint8Array  // Raw waveform samples
  getOutputTimeDomainData(): Uint8Array
  inputSampleRate: number
  outputSampleRate: number
}
```

The OpenAI adapter uses Web Audio API `AnalyserNode` for visualization:
- `fftSize: 2048` for high-resolution analysis
- RMS (Root Mean Square) calculation for accurate volume levels
- Separate analysers for input (microphone) and output (AI voice)

## Event System

Adapters emit standardized events:

| Event | Payload | Description |
|-------|---------|-------------|
| `status_change` | `{ status }` | Connection status changed |
| `mode_change` | `{ mode }` | Conversation mode changed |
| `transcript` | `{ role, transcript, isFinal }` | Speech-to-text update |
| `message_complete` | `{ message }` | Full message received |
| `tool_call` | `{ toolCallId, toolName, input }` | Tool invocation requested |
| `interrupted` | `{ messageId? }` | Response was interrupted |
| `error` | `{ error }` | Error occurred |

## Current Status

### Implemented Features

- [x] OpenAI Realtime API integration (WebRTC)
- [x] ElevenLabs Conversational AI integration
- [x] Token generation and refresh
- [x] Audio capture and playback
- [x] Real-time transcription display
- [x] Audio visualization (levels, waveforms)
- [x] Interrupt capability
- [x] React hook (`useRealtimeChat`)
- [x] Demo application at `/realtime` route

### Known Limitations

- **Device Selection**: Currently uses system default audio devices. Custom device selection not yet implemented.
- **ElevenLabs SDK**: Using `@11labs/client@0.2.0` which has limited TypeScript support.
- **Push-to-Talk**: Manual VAD mode implemented but not exposed in demo UI.
- **Tool Calling**: Framework supports tools but demo doesn't showcase them.

### Demo Application

The `examples/ts-react-chat` application includes a realtime voice chat demo at the `/realtime` route:

**Features:**
- Provider selection (OpenAI / ElevenLabs)
- Connection status indicator
- Conversation mode indicator (Listening/Thinking/Speaking)
- Message history with transcripts
- Audio level meters
- Waveform visualization (debug mode)
- Interrupt button during AI speech

**Required Environment Variables:**
```bash
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=xi-...      # Optional, for ElevenLabs
ELEVENLABS_AGENT_ID=...        # Optional, for ElevenLabs
```

## Files Reference

### Core Types
- `packages/typescript/ai/src/realtime/types.ts` - Core type definitions
- `packages/typescript/ai-client/src/realtime-types.ts` - Client-side types

### Token Generation (Server)
- `packages/typescript/ai/src/realtime/index.ts` - `realtimeToken()` function
- `packages/typescript/ai-openai/src/realtime/token.ts` - OpenAI token adapter
- `packages/typescript/ai-elevenlabs/src/realtime/token.ts` - ElevenLabs token adapter

### Client Adapters
- `packages/typescript/ai-openai/src/realtime/adapter.ts` - OpenAI WebRTC adapter
- `packages/typescript/ai-elevenlabs/src/realtime/adapter.ts` - ElevenLabs SDK adapter

### Client Library
- `packages/typescript/ai-client/src/realtime-client.ts` - RealtimeClient class

### React Integration
- `packages/typescript/ai-react/src/use-realtime-chat.ts` - React hook
- `packages/typescript/ai-react/src/realtime-types.ts` - Hook types

### Demo Application
- `examples/ts-react-chat/src/routes/realtime.tsx` - Demo UI component
- `examples/ts-react-chat/src/routes/api.realtime-token.ts` - Token API endpoint
