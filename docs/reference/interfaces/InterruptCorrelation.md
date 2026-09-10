---
id: InterruptCorrelation
title: InterruptCorrelation
---

# Interface: InterruptCorrelation

Defined in: [packages/ai/src/interrupts.ts:8](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L8)

## Extended by

- [`BatchInterruptError`](BatchInterruptError.md)
- [`ItemInterruptError`](ItemInterruptError.md)

## Properties

### continuationRunId?

```ts
optional continuationRunId?: string;
```

Defined in: [packages/ai/src/interrupts.ts:13](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L13)

***

### generation

```ts
generation: number;
```

Defined in: [packages/ai/src/interrupts.ts:11](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L11)

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: [packages/ai/src/interrupts.ts:10](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L10)

***

### submissionId?

```ts
optional submissionId?: string;
```

Defined in: [packages/ai/src/interrupts.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L12)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/interrupts.ts:9](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupts.ts#L9)
