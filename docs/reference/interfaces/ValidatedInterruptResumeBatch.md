---
id: ValidatedInterruptResumeBatch
title: ValidatedInterruptResumeBatch
---

# Interface: ValidatedInterruptResumeBatch

Defined in: [packages/ai/src/interrupt-resume.ts:61](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L61)

## Properties

### canonicalResolutions?

```ts
optional canonicalResolutions?: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L64)

***

### errors

```ts
errors: readonly InterruptSubmissionError[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L62)

***

### fingerprint?

```ts
optional fingerprint?: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:65](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L65)

***

### resolutions?

```ts
optional resolutions?: readonly ResumeEntry[];
```

Defined in: [packages/ai/src/interrupt-resume.ts:63](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L63)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/interrupt-resume.ts:66](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L66)
