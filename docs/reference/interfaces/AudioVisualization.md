---
id: AudioVisualization
title: AudioVisualization
---

Defined in: [packages/ai/src/realtime/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L214)

Interface for accessing audio visualization data

## Properties

### getInputFrequencyData

```ts
getInputFrequencyData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:221](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L221)

Get frequency data for input audio visualization

#### Returns

`Uint8Array`

***

### getInputTimeDomainData

```ts
getInputTimeDomainData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:226](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L226)

Get time domain data for input waveform

#### Returns

`Uint8Array`

***

### getOutputFrequencyData

```ts
getOutputFrequencyData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:223](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L223)

Get frequency data for output audio visualization

#### Returns

`Uint8Array`

***

### getOutputTimeDomainData

```ts
getOutputTimeDomainData: () => Uint8Array;
```

Defined in: [packages/ai/src/realtime/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L228)

Get time domain data for output waveform

#### Returns

`Uint8Array`

***

### inputLevel

```ts
readonly inputLevel: number;
```

Defined in: [packages/ai/src/realtime/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L216)

Input volume level (0-1 normalized)

***

### inputSampleRate

```ts
readonly inputSampleRate: number;
```

Defined in: [packages/ai/src/realtime/types.ts:231](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L231)

Input sample rate

***

### onInputAudio?

```ts
optional onInputAudio?: (callback) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:236](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L236)

Subscribe to raw input audio samples

#### Parameters

##### callback

(`samples`, `sampleRate`) => `void`

#### Returns

() => `void`

***

### onOutputAudio?

```ts
optional onOutputAudio?: (callback) => () => void;
```

Defined in: [packages/ai/src/realtime/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L240)

Subscribe to raw output audio samples

#### Parameters

##### callback

(`samples`, `sampleRate`) => `void`

#### Returns

() => `void`

***

### outputLevel

```ts
readonly outputLevel: number;
```

Defined in: [packages/ai/src/realtime/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L218)

Output volume level (0-1 normalized)

***

### outputSampleRate

```ts
readonly outputSampleRate: number;
```

Defined in: [packages/ai/src/realtime/types.ts:233](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/types.ts#L233)

Output sample rate
