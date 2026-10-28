---
id: ItemInterruptError
title: ItemInterruptError
---

Defined in: packages/ai/src/interrupts.ts:41

## Extends

- [`InterruptCorrelation`](InterruptCorrelation.md)

## Properties

### code

```ts
code: ItemInterruptErrorCode;
```

Defined in: packages/ai/src/interrupts.ts:44

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

### interruptId

```ts
interruptId: string;
```

Defined in: packages/ai/src/interrupts.ts:43

***

### message

```ts
message: string;
```

Defined in: packages/ai/src/interrupts.ts:45

***

### path?

```ts
optional path?: readonly (string | number)[];
```

Defined in: packages/ai/src/interrupts.ts:46

***

### retryable

```ts
retryable: boolean;
```

Defined in: packages/ai/src/interrupts.ts:48

***

### scope

```ts
scope: "item";
```

Defined in: packages/ai/src/interrupts.ts:42

***

### source

```ts
source: "server" | "client";
```

Defined in: packages/ai/src/interrupts.ts:47

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
