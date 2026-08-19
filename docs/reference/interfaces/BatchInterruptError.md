---
id: BatchInterruptError
title: BatchInterruptError
---

# Interface: BatchInterruptError

Defined in: [packages/ai/src/interrupts.ts:53](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L53)

## Extends

- [`InterruptCorrelation`](InterruptCorrelation.md)

## Properties

### code

```ts
code: BatchInterruptErrorCode;
```

Defined in: [packages/ai/src/interrupts.ts:55](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L55)

***

### continuationRunId?

```ts
optional continuationRunId?: string;
```

Defined in: [packages/ai/src/interrupts.ts:13](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L13)

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`continuationRunId`](InterruptCorrelation.md#continuationrunid)

***

### generation

```ts
generation: number;
```

Defined in: [packages/ai/src/interrupts.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L11)

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`generation`](InterruptCorrelation.md#generation)

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: [packages/ai/src/interrupts.ts:10](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L10)

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`interruptedRunId`](InterruptCorrelation.md#interruptedrunid)

***

### interruptIds

```ts
interruptIds: readonly string[];
```

Defined in: [packages/ai/src/interrupts.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L59)

***

### message

```ts
message: string;
```

Defined in: [packages/ai/src/interrupts.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L56)

***

### retryable

```ts
retryable: boolean;
```

Defined in: [packages/ai/src/interrupts.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L58)

***

### scope

```ts
scope: "batch";
```

Defined in: [packages/ai/src/interrupts.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L54)

***

### source

```ts
source: "transport" | "server" | "client";
```

Defined in: [packages/ai/src/interrupts.ts:57](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L57)

***

### submissionId?

```ts
optional submissionId?: string;
```

Defined in: [packages/ai/src/interrupts.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L12)

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`submissionId`](InterruptCorrelation.md#submissionid)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/interrupts.ts:9](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L9)

#### Inherited from

[`InterruptCorrelation`](InterruptCorrelation.md).[`threadId`](InterruptCorrelation.md#threadid)
