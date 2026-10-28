---
id: ValidateInterruptResumeBatchInput
title: ValidateInterruptResumeBatchInput
---

Defined in: packages/ai/src/interrupt-resume.ts:60

## Properties

### generation

```ts
generation: number;
```

Defined in: packages/ai/src/interrupt-resume.ts:63

***

### interruptedRunId

```ts
interruptedRunId: string;
```

Defined in: packages/ai/src/interrupt-resume.ts:62

***

### now?

```ts
optional now?: number;
```

Defined in: packages/ai/src/interrupt-resume.ts:67

***

### pending

```ts
pending: readonly PendingInterruptResumeRecord[];
```

Defined in: packages/ai/src/interrupt-resume.ts:64

***

### resume?

```ts
optional resume?: readonly RunAgentResumeItem[];
```

Defined in: packages/ai/src/interrupt-resume.ts:65

***

### threadId

```ts
threadId: string;
```

Defined in: packages/ai/src/interrupt-resume.ts:61

***

### tools

```ts
tools: Tool<SchemaInput, SchemaInput, string, unknown>[];
```

Defined in: packages/ai/src/interrupt-resume.ts:66
