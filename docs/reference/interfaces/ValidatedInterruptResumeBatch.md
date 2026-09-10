---
id: ValidatedInterruptResumeBatch
title: ValidatedInterruptResumeBatch
---

# Interface: ValidatedInterruptResumeBatch

Defined in: [packages/ai/src/interrupt-resume.ts:69](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L69)

## Properties

### canonicalResolutions?

```ts
optional canonicalResolutions?: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:72](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L72)

***

### errors

```ts
errors: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:70](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L70)

***

### fingerprint?

```ts
optional fingerprint?: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L73)

***

### resolutions?

```ts
optional resolutions?: readonly RunAgentResumeItem[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:71](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L71)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/interrupt-resume.ts:74](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L74)
