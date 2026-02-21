# Audio Workbench - Code Mode Demo

The Audio Workbench is an advanced demonstration of TanStack AI Code Mode that showcases AI-driven audio analysis, processing, and visualization. It demonstrates how to build tools that require **asynchronous client-side operations** - a pattern that enables the AI's sandboxed VM to interact with browser APIs like file pickers, microphone recording, and audio playback.

## Overview

The Audio Workbench allows users to:
- **Load audio** from files or record from the microphone
- **Analyze audio** (spectrum analysis, noise floor, peak detection, etc.)
- **Process audio** (FFT, filtering, EQ, normalization, etc.)
- **Visualize results** (spectrum plots, waveforms, spectrograms)
- **Create custom plugins** using the Web Audio API's AudioWorklet
- **Real-time monitoring** with live audio processing chains

## Architecture

### Key Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  audio.tsx                                                      │
│  ├── useAudioManager() - Client-side audio state & operations   │
│  ├── handleCustomEvent() - Processes events from server         │
│  ├── AudioFileList - UI for stored audio files                  │
│  ├── PlotRenderer - Visualizations (spectrum, waveform, etc.)   │
│  └── MonitorStatus - Real-time processing chain status          │
├─────────────────────────────────────────────────────────────────┤
│  useChat() → SSE connection to /api/audio                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ SSE Stream (events + chunks)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Server (Node.js)                         │
├─────────────────────────────────────────────────────────────────┤
│  /api/audio - Chat endpoint with Code Mode                      │
│  ├── AI generates TypeScript code                               │
│  ├── Code runs in isolated-vm sandbox                           │
│  └── Tools emit custom events to client                         │
├─────────────────────────────────────────────────────────────────┤
│  /api/audio-resolve - Resolves async client requests            │
│  └── Client POSTs results back, resolves pending promises       │
├─────────────────────────────────────────────────────────────────┤
│  AsyncRequestRegistry - Manages pending async requests          │
│  └── Singleton that tracks request IDs and their promises       │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── routes/
│   ├── audio.tsx              # Main Audio Workbench page
│   ├── api.audio.ts           # Chat API endpoint for audio
│   └── api.audio-resolve.ts   # Async request resolution endpoint
├── lib/audio/
│   ├── index.ts               # Exports all audio tools
│   ├── async-registry.ts      # AsyncRequestRegistry singleton
│   ├── audio-tools.ts         # audio.* tools (load, store, list, play, delete)
│   ├── dsp-tools.ts           # dsp.* tools (FFT, filter, EQ, normalize, etc.)
│   ├── analyze-tools.ts       # analyze.* tools (RMS, peaks, noise floor, etc.)
│   ├── plot-tools.ts          # plot.* tools (spectrum, waveform, spectrogram)
│   ├── plugin-tools.ts        # plugin.* tools (create, list, delete AudioWorklets)
│   └── monitor-tools.ts       # monitor.* tools (real-time processing chain)
├── hooks/
│   └── useAudioManager.ts     # Client-side audio state management
├── components/audio/
│   ├── AudioFileList.tsx      # Stored audio files UI
│   ├── MonitorStatus.tsx      # Real-time monitoring status
│   └── PlotRenderer.tsx       # Visualization renderer
└── public/media/
    └── example-1.wav          # Pre-loaded example audio file
```

## Async Client-Side Tools Pattern

### The Problem

The AI runs code in an isolated VM on the server. When it needs to perform client-side operations (file upload, microphone recording, audio playback), it can't directly access browser APIs. The challenge is to enable the VM to **wait for** these operations to complete.

### The Solution

We implemented a **request-response pattern** using custom events and a resolve endpoint:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   VM Tool       │     │  Event Polling   │     │    Client       │
│                 │     │  (Framework)     │     │                 │
│ 1. Emit event   │────►│ Yield event      │────►│ Receive event   │
│    with reqId   │     │ immediately      │     │                 │
│                 │     │                  │     │ 2. Do operation │
│ 3. Block on     │     │ Poll & yield     │     │    (file pick,  │
│    registry     │     │ (every 50ms)     │     │    mic record)  │
│                 │     │                  │     │                 │
│ 4. Resume with  │◄────│ Promise resolved │◄────│ 3. POST result  │
│    client data  │     │                  │     │    to /resolve  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Key Implementation Details

#### 1. AsyncRequestRegistry (`src/lib/audio/async-registry.ts`)

A singleton that manages pending async requests:

```typescript
export class AsyncRequestRegistry {
  private requests = new Map<string, PendingRequest>()
  
  // Create a request that will be resolved later
  createRequest<T>(requestId: string, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.rejectRequest(requestId, new Error('Timeout'))
      }, timeoutMs)
      
      this.requests.set(requestId, { resolve, reject, timeout })
    })
  }
  
  // Called when client POSTs to /api/audio-resolve
  resolveRequest(requestId: string, data: any) {
    const request = this.requests.get(requestId)
    if (request) {
      clearTimeout(request.timeout)
      request.resolve(data)
      this.requests.delete(requestId)
    }
  }
}
```

#### 2. Tool Implementation (`src/lib/audio/audio-tools.ts`)

Tools emit events and wait for the registry:

```typescript
export const audioLoadTool = toolDefinition({
  name: 'audio_load',
  handler: async ({ source, name }, { emitCustomEvent }) => {
    const requestId = generateRequestId()
    
    // Emit event to client
    emitCustomEvent('audio:load_request', { requestId, source, name })
    
    // Wait for client to respond (blocks until resolved)
    const result = await asyncRegistry.createRequest(requestId, 60000)
    
    return result
  }
})
```

#### 3. Client Event Handler (`src/routes/audio.tsx`)

The client handles events and POSTs results back:

```typescript
const handleCustomEvent = useCallback(async (eventType, data, context) => {
  const am = audioManagerRef.current  // Use ref to avoid stale closure
  
  if (eventType === 'audio:load_request') {
    const { requestId, source, name } = data
    
    try {
      let audioData
      if (source === 'stored') {
        const stored = am.getAudio(name)
        audioData = { samples: Array.from(stored.samples), ... }
      } else if (source === 'file') {
        const file = await showFilePicker()
        const result = await am.loadAudioFile(file)
        audioData = { samples: Array.from(result.samples), ... }
      }
      
      // POST success back to server
      await fetch('/api/audio-resolve', {
        method: 'POST',
        body: JSON.stringify({ requestId, data: audioData })
      })
    } catch (err) {
      // POST error back to server
      await fetch('/api/audio-resolve', {
        method: 'POST',
        body: JSON.stringify({ requestId, error: err.message })
      })
    }
  }
}, [resolveRequest])
```

## Framework Changes (TanStack AI)

### Real-Time Event Streaming

We modified `@tanstack/ai` to stream custom events **during** tool execution, not just after. This was critical for the async pattern to work.

#### The Problem

Previously, events were queued and only sent after `executeToolCalls()` completed:

```typescript
// OLD: Events only drain AFTER tool execution
const result = await executeToolCalls(...)
yield* this.drainCustomEvents()  // Too late! Tool is already blocked
```

#### The Solution

We added `executeWithEventPolling()` - an async generator that polls for events during tool execution:

```typescript
// packages/typescript/ai/src/activities/chat/tools/tool-calls.ts

async function* executeWithEventPolling<T>(
  fn: () => Promise<T>,
  pendingEvents: Array<CustomEventStreamChunk>,
  pollInterval: number = 50
): AsyncGenerator<CustomEventStreamChunk, T, void> {
  let completed = false
  let result: T | undefined
  
  // Start async operation without awaiting
  fn().then(r => { result = r; completed = true })
     .catch(e => { error = e; completed = true })
  
  // Poll for events while waiting
  while (!completed) {
    while (pendingEvents.length > 0) {
      yield pendingEvents.shift()!  // Yield events immediately
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }
  
  // Final flush
  while (pendingEvents.length > 0) {
    yield pendingEvents.shift()!
  }
  
  return result!
}
```

This change lives in `packages/typescript/ai/src/activities/chat/tools/tool-calls.ts`.

## Audio Tools Reference

### Audio I/O (`audio.*`)

| Tool | Description |
|------|-------------|
| `audio_load` | Load audio from file, microphone, or storage |
| `audio_store` | Store audio samples with a name |
| `audio_list` | List all stored audio files |
| `audio_play` | Play stored audio |
| `audio_delete` | Delete stored audio |

### DSP Processing (`dsp.*`)

| Tool | Description |
|------|-------------|
| `dsp_fft` | Compute FFT (Fast Fourier Transform) |
| `dsp_welch` | Welch's method for power spectral density |
| `dsp_filter` | Apply filters (highpass, lowpass, bandpass, etc.) |
| `dsp_eq` | Apply parametric EQ |
| `dsp_normalize` | Normalize audio to target level |
| `dsp_trim` | Trim silence from start/end |
| `dsp_fade` | Apply fade in/out |
| `dsp_mix` | Mix multiple audio sources |
| `dsp_resample` | Change sample rate |

### Analysis (`analyze.*`)

| Tool | Description |
|------|-------------|
| `analyze_rms` | Calculate RMS level |
| `analyze_peak` | Find peak amplitude |
| `analyze_findPeaks` | Find spectral peaks |
| `analyze_detectClipping` | Detect clipping |
| `analyze_loudnessOverTime` | Loudness over time analysis |
| `analyze_compareSpectra` | Compare two spectra |
| `analyze_findResonances` | Find resonant frequencies |
| `analyze_noiseFloor` | Measure noise floor |

### Visualization (`plot.*`)

| Tool | Description |
|------|-------------|
| `plot_spectrum` | Frequency spectrum plot |
| `plot_waveform` | Time-domain waveform |
| `plot_spectrogram` | Time-frequency spectrogram |
| `plot_line` | Generic line chart |
| `plot_bar` | Bar chart |
| `plot_comparison` | Before/after comparison |
| `plot_table` | Data table |

### Plugin System (`plugin.*`)

| Tool | Description |
|------|-------------|
| `plugin_create` | Create custom AudioWorklet processor |
| `plugin_list` | List registered plugins |
| `plugin_delete` | Delete a plugin |
| `plugin_getCode` | Get plugin source code |

### Live Monitoring (`monitor.*`)

| Tool | Description |
|------|-------------|
| `monitor_start` | Start real-time monitoring with plugin chain |
| `monitor_stop` | Stop monitoring |
| `monitor_updateParam` | Update plugin parameter in real-time |
| `monitor_getParams` | Get current parameter values |
| `monitor_setChain` | Change the plugin chain |
| `monitor_isActive` | Check if monitoring is active |

## Stale Closure Fix

### The Problem

React's `useCallback` captures variables at creation time. When `handleCustomEvent` was passed to `useChat`, it captured an old version of `audioManager` that referenced empty state.

### The Solution

Use a ref to always access the current `audioManager`:

```typescript
const audioManager = useAudioManager()

// Ref always points to current audioManager
const audioManagerRef = useRef(audioManager)
audioManagerRef.current = audioManager

const handleCustomEvent = useCallback(async (eventType, data, context) => {
  // Use ref instead of captured audioManager
  const am = audioManagerRef.current
  
  const files = am.listAudio()  // Always gets current state
  // ...
}, [resolveRequest])  // No audioManager dependency needed
```

## Pre-loaded Example Audio

The example audio file is automatically loaded on page mount:

```typescript
useEffect(() => {
  const loadExampleAudio = async () => {
    const response = await fetch('/media/example-1.wav')
    const arrayBuffer = await response.arrayBuffer()
    
    const audioContext = new AudioContext()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const samples = audioBuffer.getChannelData(0)
    
    // Use replace: true to handle React strict mode
    audioManager.storeAudio('example-1', samples, audioBuffer.sampleRate, {
      replace: true
    })
  }
  loadExampleAudio()
}, [audioManager])
```

## Example Interactions

### Analyze Spectrum

```
User: Show me the spectrum of example-1

AI: I'll load and display the spectrum of "example-1" for you.
[Executes code that loads audio from storage, computes FFT, renders plot]
```

### Record and Analyze

```
User: Record 5 seconds from my mic and check the noise floor

AI: I'll record from your microphone and analyze the noise floor.
[Executes code that triggers mic recording, waits for audio, analyzes]
```

### Create Custom Plugin

```
User: Create a simple gain plugin I can use for monitoring

AI: I'll create a gain plugin for real-time audio processing.
[Creates AudioWorklet processor code, registers it with the system]
```

## Future Improvements

1. **Waveform visualization** - Add time-domain waveform display
2. **Spectrogram** - Time-frequency analysis visualization
3. **More DSP tools** - Compression, limiting, reverb, delay
4. **Plugin presets** - Save/load plugin parameter presets
5. **Audio export** - Download processed audio
6. **Multi-track** - Work with multiple audio tracks
7. **MIDI support** - Integrate MIDI input for real-time control

## Debugging Tips

1. **Check console logs** - All async operations log their status
2. **Watch for timeouts** - Default timeout is 30s for async requests
3. **Verify event flow** - Events should show "X events" in VM panel
4. **Check audioManagerRef** - Ensure ref is updated on each render

