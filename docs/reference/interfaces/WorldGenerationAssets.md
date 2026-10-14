---
id: WorldGenerationAssets
title: WorldGenerationAssets
---

Defined in: [packages/ai/src/types.ts:2734](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2734)

**`Experimental`**

Assets from a finished world job. Live session adapters omit this.
URLs are often signed CDN links. They can expire and may need a proxy
to fetch from a browser.

 World generation is an experimental feature and may change.

## Properties

### caption?

```ts
optional caption?: string;
```

Defined in: [packages/ai/src/types.ts:2736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2736)

**`Experimental`**

Auto-generated scene description

***

### imagery?

```ts
optional imagery?: object;
```

Defined in: [packages/ai/src/types.ts:2750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2750)

**`Experimental`**

#### panoUrl?

```ts
optional panoUrl?: string;
```

***

### mesh?

```ts
optional mesh?: object;
```

Defined in: [packages/ai/src/types.ts:2745](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2745)

**`Experimental`**

#### colliderMeshUrl?

```ts
optional colliderMeshUrl?: string;
```

#### fullResMeshUrl?

```ts
optional fullResMeshUrl?: string;
```

#### hqMeshUrl?

```ts
optional hqMeshUrl?: string;
```

***

### splats?

```ts
optional splats?: object;
```

Defined in: [packages/ai/src/types.ts:2739](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2739)

**`Experimental`**

#### groundPlaneOffset?

```ts
optional groundPlaneOffset?: number;
```

#### metricScaleFactor?

```ts
optional metricScaleFactor?: number;
```

#### spzUrls?

```ts
optional spzUrls?: Record<string, string>;
```

Quality-key map of splat URLs (`100k`, `500k`, `full_res`, …)

***

### thumbnailUrl?

```ts
optional thumbnailUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2738](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2738)

**`Experimental`**

Preview image URL
