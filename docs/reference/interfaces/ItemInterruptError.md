---
id: ItemInterruptError
title: ItemInterruptError
---

Defined in: [packages/ai/src/interrupts.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L41)

## Extends

- [`InterruptCorrelation`](InterruptCorrelation.md)

## Properties

### code

```ts
code: ItemInterruptErrorCode;
```

Defined in: [packages/ai/src/interrupts.ts:44](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L44)

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

### interruptId

```ts
interruptId: string;
```

Defined in: [packages/ai/src/interrupts.ts:43](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L43)

***

### message

```ts
message: string;
```

Defined in: [packages/ai/src/interrupts.ts:45](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L45)

***

### path?

```ts
optional path?: readonly (string | number)[];
```

Defined in: [packages/ai/src/interrupts.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L46)

***

### retryable

```ts
retryable: boolean;
```

Defined in: [packages/ai/src/interrupts.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L48)

***

### scope

```ts
scope: "item";
```

Defined in: [packages/ai/src/interrupts.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L42)

***

### source

```ts
source: "server" | "client";
```

Defined in: [packages/ai/src/interrupts.ts:47](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L47)

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
