---
id: WorldGenerationAssets
title: WorldGenerationAssets
---

Defined in: [packages/ai/src/types.ts:2774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2774)

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

Defined in: [packages/ai/src/types.ts:2776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2776)

**`Experimental`**

Auto-generated scene description

***

### imagery?

```ts
optional imagery?: object;
```

Defined in: [packages/ai/src/types.ts:2790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2790)

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

Defined in: [packages/ai/src/types.ts:2785](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2785)

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

Defined in: [packages/ai/src/types.ts:2779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2779)

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

Defined in: [packages/ai/src/types.ts:2778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2778)

**`Experimental`**

Preview image URL
