---
id: PendingInterruptResumeRecord
title: PendingInterruptResumeRecord
---

Defined in: packages/ai/src/interrupt-resume.ts:50

The persistence-neutral shape required to validate an interrupt resume.

## Properties

### binding

```ts
binding: InterruptBinding;
```

Defined in: packages/ai/src/interrupt-resume.ts:53

***

### genericRequest?

```ts
optional genericRequest?: GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>;
```

Defined in: packages/ai/src/interrupt-resume.ts:55

Present for a first-party generic interrupt.

***

### interruptId

```ts
interruptId: string;
```

Defined in: packages/ai/src/interrupt-resume.ts:51

***

### payload

```ts
payload: unknown;
```

Defined in: packages/ai/src/interrupt-resume.ts:52
