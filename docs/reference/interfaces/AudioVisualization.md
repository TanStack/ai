---
id: AudioVisualization
title: AudioVisualization
---

# Interface: AudioVisualization

Defined in: [realtime/types.ts](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/types.ts)

Interface for accessing audio visualization data from a realtime connection. Provides volume levels, frequency data, and time-domain data for both input (microphone) and output (speaker) audio.

## Properties

### inputLevel

```ts
readonly inputLevel: number;
```

Input volume level (0-1 normalized).

***

### outputLevel

```ts
readonly outputLevel: number;
```

Output volume level (0-1 normalized).

***

### inputSampleRate

```ts
readonly inputSampleRate: number;
```

Input audio sample rate in Hz.

***

### outputSampleRate

```ts
readonly outputSampleRate: number;
```

Output audio sample rate in Hz.

## Methods

### getInputFrequencyData()

```ts
getInputFrequencyData(): Uint8Array;
```

Get frequency data for input audio visualization.

#### Returns

`Uint8Array`

***

### getOutputFrequencyData()

```ts
getOutputFrequencyData(): Uint8Array;
```

Get frequency data for output audio visualization.

#### Returns

`Uint8Array`

***

### getInputTimeDomainData()

```ts
getInputTimeDomainData(): Uint8Array;
```

Get time domain data for input waveform visualization.

#### Returns

`Uint8Array`

***

### getOutputTimeDomainData()

```ts
getOutputTimeDomainData(): Uint8Array;
```

Get time domain data for output waveform visualization.

#### Returns

`Uint8Array`

***

### onInputAudio?

```ts
optional onInputAudio: (callback: (samples: Float32Array, sampleRate: number) => void) => () => void;
```

Subscribe to raw input audio samples. Returns an unsubscribe function.

***

### onOutputAudio?

```ts
optional onOutputAudio: (callback: (samples: Float32Array, sampleRate: number) => void) => () => void;
```

Subscribe to raw output audio samples. Returns an unsubscribe function.
