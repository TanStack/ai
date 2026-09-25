---
title: Generate Image
id: generate-image
order: 2
description: "Create a TanStack Start app, then add React image generation. BYOK holds the OpenRouter key in the tab. useGenerateImage talks to a server route that runs generateImage."
keywords:
  - tanstack ai
  - tutorial
  - generate image
  - useGenerateImage
  - generateImage
  - byok
  - openrouter
  - tanstack start
---

You want a prompt box that returns an image.

Create a TanStack Start app. Then generate an image with OpenRouter.

This tutorial is React + Start. For other frameworks, open [Quick Start](../getting-started/quick-start). For sizes and other providers, open [Image Generation](../media/image-generation).

You can skip the scaffold and paste a key in the sandbox at the end of this page.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Then install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## Client and server

An image generation has two sides.

The **client** runs in the browser. It holds the key, draws the prompt box, and POSTs to your route.

The **server** route reads that key, calls OpenRouter, and streams the image back.

The next steps build the client. Then they add the route.

## 2. Set up BYOK on the client

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. Export `OpenRouterKeyForm` from that file. `byok.update` saves the key. `useByok` reads the status.

```tsx ignore
import { useState } from 'react'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/lib/byok'

export function OpenRouterKeyForm() {
  const snapshot = useByok(byok)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[openrouterByok.id]
  const masked = status && 'masked' in status ? status.masked : undefined
  const missingKey = snapshot.prompt?.reason === 'missing'

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        setError('')
        void byok
          .update(openrouterByok.id, next)
          .then(() => setDraft(''))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            ),
          )
      }}
    >
      <input
        type="password"
        autoComplete="off"
        placeholder={masked ? `Saved ${masked}` : 'Paste your OpenRouter key'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" disabled={!draft.trim()}>
        Save key
      </button>
      {missingKey ? (
        <p>Paste an OpenRouter key, then generate again.</p>
      ) : null}
      {error ? <p>{error}</p> : null}
    </form>
  )
}
```

If you want passkeys, open [Bring Your Own Key](../advanced/byok).

## 3. Hook up `useGenerateImage`

Open `src/routes/index.tsx`. Import `OpenRouterKeyForm` from `@/components/open-router-key-form`. Pass `byok`. The hook sends the key in an `x-byok-*` header.

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

// OpenRouter returns a public URL or raw base64. <img src> accepts both.
function imageSrc(image: { url?: string; b64Json?: string }) {
  if (image.url) return image.url
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`
  return undefined
}

function ImagePage() {
  const [prompt, setPrompt] = useState('')
  // POST { prompt } to /api/generate/image over SSE.
  // byok sends the OpenRouter key as x-byok-openrouter.
  // When the stream ends, result.images holds the picture.
  const { generate, result, isLoading, error, stop } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    byok,
  })

  const handleGenerate = () => {
    const next = prompt.trim()
    if (!next) return
    void generate({ prompt: next })
  }

  return (
    <div>
      <OpenRouterKeyForm />
      {result?.images[0] ? (
        <img
          src={imageSrc(result.images[0])}
          alt={prompt.trim() || 'Generated image'}
        />
      ) : null}
      {error ? <p>{error.message}</p> : null}
      {isLoading ? (
        <button type="button" onClick={stop}>
          Stop
        </button>
      ) : null}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!prompt.trim() || isLoading}
      >
        Generate
      </button>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ImagePage,
})
```

`generate({ prompt })` starts the run. `result.images` holds the image when it arrives.

A generate with no key does not POST. The form shows "Paste an OpenRouter key, then generate again."

## Bonus: transform `result` with `onResult`

`result` is the full `ImageGenerationResult`. You still pick a URL or base64 for `<img>`.

Pass `onResult`. Return a src string. The hook then stores that string on `result`.

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

function ImagePage() {
  const [prompt, setPrompt] = useState('')
  // POST { prompt } to /api/generate/image over SSE.
  // onResult runs when the image arrives. The return value becomes `result`.
  const { generate, result, isLoading, error, stop } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    byok,
    onResult: (raw) => {
      const image = raw.images[0]
      if (image?.url) return image.url
      if (image?.b64Json) return `data:image/png;base64,${image.b64Json}`
      return null
    },
  })

  const handleGenerate = () => {
    const next = prompt.trim()
    if (!next) return
    void generate({ prompt: next })
  }

  return (
    <div>
      <OpenRouterKeyForm />
      {result ? (
        <img src={result} alt={prompt.trim() || 'Generated image'} />
      ) : null}
      {error ? <p>{error.message}</p> : null}
      {isLoading ? (
        <button type="button" onClick={stop}>
          Stop
        </button>
      ) : null}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        disabled={isLoading}
      />
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!prompt.trim() || isLoading}
      >
        Generate
      </button>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ImagePage,
})
```

A returned string replaces `result`. A `null` return keeps the previous `result`.

The server route does not change.

## 4. Add the server route

Create `src/routes/api.generate.image.ts` in the `src/routes` folder, next to `index.tsx`. Start maps that file name to the `/api/generate/image` path. Do this in two steps.

### Read the key

`getByokKey` reads the `x-byok-openrouter` header, then `OPENROUTER_API_KEY` in the environment. If both are empty, `byokMissing` returns HTTP 401.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { generationParamsFromRequest } from '@tanstack/ai'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  await generationParamsFromRequest('image', request)
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)

  return new Response('ok')
}

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

This is a stub. The next step replaces the `ok` body.

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the adapter main entry.

### Call `generateImage` and return the stream

Replace the `ok` response. `generationParamsFromRequest` reads the prompt from the POST body. Pass the key into `createOpenRouterImage`. Wrap `generateImage()` with `toServerSentEventsResponse`. Pass `stream: true` so the hook can listen.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenRouterImage } from '@tanstack/ai-openrouter'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // Unwrap the prompt the hook POSTed. Then read the OpenRouter key.
  const { input, threadId, runId } = await generationParamsFromRequest(
    'image',
    request,
  )
  const apiKey = getByokKey(request, openrouterByok)
  if (!apiKey) return byokMissing(openrouterByok)
  if (typeof input.prompt !== 'string') {
    return new Response('This route accepts a text prompt only.', {
      status: 400,
    })
  }

  // Call OpenRouter. stream: true so the hook can listen on SSE.
  // The hook stores the finished picture on result.images.
  const stream = generateImage({
    adapter: createOpenRouterImage('google/gemini-3.1-flash-image', apiKey),
    prompt: input.prompt,
    stream: true,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

This route accepts a text prompt only. OpenRouter returns one image per request.

## 5. Try it

Run the app. Paste an OpenRouter key. Type a prompt. Click Generate. The image appears.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/generate-image`.

<!-- ::client-example library=ai framework=react slug=generate-image -->

You have an image from a prompt. The OpenRouter key never sits in a server env file.

The full example is on GitHub: [TanStack/ai `examples/react/generate-image`](https://github.com/TanStack/ai/tree/main/examples/react/generate-image).

For sizes, image-to-image, and other providers, open [Image Generation](../media/image-generation).
