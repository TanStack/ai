---
id: GeneratedMediaSource
title: GeneratedMediaSource
---

# Type Alias: GeneratedMediaSource

```ts
type GeneratedMediaSource = 
  | {
  b64Json?: never;
  url: string;
}
  | {
  b64Json: string;
  url?: never;
};
```

Defined in: [packages/typescript/ai/src/types.ts:1228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1228)

Source of a generated media asset. Exactly one of `url` or `b64Json` is
present; the other is absent. Modeled as a mutually-exclusive union so the
type rejects `{}` and `{ url, b64Json }` together at compile time while
preserving the flat `.url` / `.b64Json` access patterns.

## Type Declaration

```ts
{
  b64Json?: never;
  url: string;
}
```

### b64Json?

```ts
optional b64Json: never;
```

### url

```ts
url: string;
```

URL to the generated asset (may be temporary)

```ts
{
  b64Json: string;
  url?: never;
}
```

### b64Json

```ts
b64Json: string;
```

Base64-encoded asset data

### url?

```ts
optional url: never;
```
