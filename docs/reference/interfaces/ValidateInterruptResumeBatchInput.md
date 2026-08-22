---
id: ValidateInterruptResumeBatchInput
title: ValidateInterruptResumeBatchInput
---

# Interface: ValidateInterruptResumeBatchInput

Defined in: [packages/ai/src/interrupt-resume.ts:59](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L59)

## Properties

### generation

```ts
generation: number;
```

Defined in: [packages/ai/src/interrupt-resume.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L62)

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L61)

***

### now?

```ts
optional now?: number;
```

Defined in: [packages/ai/src/interrupt-resume.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L66)

***

### pending

```ts
pending: readonly PendingInterruptResumeRecord[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L63)

***

### resume?

```ts
optional resume?: readonly RunAgentResumeItem[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L64)

***

### threadId

```ts
threadId: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L60)

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L65)
