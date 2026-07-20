---
id: AudioVisualization
title: AudioVisualization
---

# Interface: AudioVisualization

Defined in: [packages/ai/src/realtime/types.ts:205](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L205)

Interface for accessing audio visualization data

## Properties

### getInputFrequencyData()

```ts
getInputFrequencyData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L212)

Get frequency data for input audio visualization

#### Returns

`Uint8Array`

***

### getInputTimeDomainData()

```ts
getInputTimeDomainData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L217)

Get time domain data for input waveform

#### Returns

`Uint8Array`

***

### getOutputFrequencyData()

```ts
getOutputFrequencyData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L214)

Get frequency data for output audio visualization

#### Returns

`Uint8Array`

***

### getOutputTimeDomainData()

```ts
getOutputTimeDomainData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L219)

Get time domain data for output waveform

#### Returns

`Uint8Array`

***

### inputLevel

```ts
readonly inputLevel: number;
```

Defined in: [packages/ai/src/realtime/types.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L207)

Input volume level (0-1 normalized)

***

### inputSampleRate

```ts
readonly inputSampleRate: number;
```

Defined in: [packages/ai/src/realtime/types.ts:222](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L222)

Input sample rate

***

### onInputAudio()?

```ts
optional onInputAudio: (callback) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L227)

Subscribe to raw input audio samples

#### Parameters

##### callback

(`samples`, `sampleRate`) => `void`

#### Returns

```ts
(): void;
```

##### Returns

`void`

***

### onOutputAudio()?

```ts
optional onOutputAudio: (callback) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L231)

Subscribe to raw output audio samples

#### Parameters

##### callback

(`samples`, `sampleRate`) => `void`

#### Returns

```ts
(): void;
```

##### Returns

`void`

***

### outputLevel

```ts
readonly outputLevel: number;
```

Defined in: [packages/ai/src/realtime/types.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L209)

Output volume level (0-1 normalized)

***

### outputSampleRate

```ts
readonly outputSampleRate: number;
```

Defined in: [packages/ai/src/realtime/types.ts:224](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L224)

Output sample rate
