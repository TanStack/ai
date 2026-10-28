---
id: BatchInterruptError
title: BatchInterruptError
---

Defined in: packages/ai/src/interrupts.ts:51

## Extends

- [`InterruptCorrelation`](InterruptCorrelation.md)

## Properties

### code

```ts
code: BatchInterruptErrorCode;
```

Defined in: packages/ai/src/interrupts.ts:53

***

### continuationRunId?

```ts
optional continuationRunId?: string;
```

Defined in: packages/ai/src/interrupts.ts:13

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`continuationRunId`](InterruptCorrelation.md#continuationrunid)

***

### generation

```ts
generation: number;
```

Defined in: packages/ai/src/interrupts.ts:11

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`generation`](InterruptCorrelation.md#generation)

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: packages/ai/src/interrupts.ts:10

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`interruptedRunId`](InterruptCorrelation.md#interruptedrunid)

***

### interruptIds

```ts
interruptIds: readonly string[];
```

Defined in: packages/ai/src/interrupts.ts:57

***

### message

```ts
message: string;
```

Defined in: packages/ai/src/interrupts.ts:54

***

### retryable

```ts
retryable: boolean;
```

Defined in: packages/ai/src/interrupts.ts:56

***

### scope

```ts
scope: "batch";
```

Defined in: packages/ai/src/interrupts.ts:52

***

### source

```ts
source: "transport" | "server" | "client";
```

Defined in: packages/ai/src/interrupts.ts:55

***

### submissionId?

```ts
optional submissionId?: string;
```

Defined in: packages/ai/src/interrupts.ts:12

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`submissionId`](InterruptCorrelation.md#submissionid)

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/interrupts.ts:9

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`threadId`](InterruptCorrelation.md#threadid)
