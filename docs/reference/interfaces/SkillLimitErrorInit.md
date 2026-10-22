---
id: SkillLimitErrorInit
title: SkillLimitErrorInit
---

Defined in: packages/ai/src/utilities/errors.ts:13

Thrown when a skills request exceeds a provider limit. Lives in core (rather
than `@tanstack/ai-skills`) so the native tool factories in `ai-anthropic`
and `openai-base` can throw it without depending on the skills package;
`@tanstack/ai-skills` re-exports it for the portable path.

`path` distinguishes the native provider cap (e.g. Anthropic's 8-skill
limit) from a portable-path limit, so a portable user isn't sent chasing a
cap that only applies to hosted skills.

## Properties

### actual

```ts
actual: number;
```

Defined in: packages/ai/src/utilities/errors.ts:18

***

### allowed

```ts
allowed: number;
```

Defined in: packages/ai/src/utilities/errors.ts:17

***

### limit

```ts
limit: string;
```

Defined in: packages/ai/src/utilities/errors.ts:16

***

### offending

```ts
offending: string[];
```

Defined in: packages/ai/src/utilities/errors.ts:19

***

### path

```ts
path: "native" | "portable";
```

Defined in: packages/ai/src/utilities/errors.ts:15

***

### provider

```ts
provider: "anthropic" | "openai" | "gemini" | "other";
```

Defined in: packages/ai/src/utilities/errors.ts:14
