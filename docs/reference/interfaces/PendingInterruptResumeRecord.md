---
id: PendingInterruptResumeRecord
title: PendingInterruptResumeRecord
---

# Interface: PendingInterruptResumeRecord

Defined in: [packages/ai/src/interrupt-resume.ts:49](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L49)

The persistence-neutral shape required to validate an interrupt resume.

## Properties

### binding

```ts
binding: InterruptBinding;
```

Defined in: [packages/ai/src/interrupt-resume.ts:52](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L52)

***

### genericRequest?

```ts
optional genericRequest?: GenericInterruptRequestBase<InterruptDefinition<any, any, any, any, any>>;
```

Defined in: [packages/ai/src/interrupt-resume.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L54)

Present for a first-party generic interrupt.

***

### interruptId

```ts
interruptId: string;
```

Defined in: [packages/ai/src/interrupt-resume.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L50)

***

### payload

```ts
payload: unknown;
```

Defined in: [packages/ai/src/interrupt-resume.ts:51](https://github.com/TanStack/ai/blob/main/packages/ai/src/interrupt-resume.ts#L51)
