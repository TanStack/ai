---
title: Generate Image
id: generate-image
order: 2
description: "Build a React prompt box that returns an image in a TanStack Start app. The user pastes an OpenRouter key in the tab, and useGenerateImage calls a server route that runs generateImage."
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

You want a prompt box that returns an image. You also do not want to put a provider key in a server env file while you try it out.

In this tutorial, the user pastes an OpenRouter key in the browser. `useGenerateImage` sends the prompt to a server route, and the route runs `generateImage`. It takes about 10 minutes.

This tutorial uses React and TanStack Start. For other frameworks, open [Quick Start](../getting-started/quick-start). For sizes and other providers, open [Image Generation](../media/image-generation). To skip the setup, paste a key in the sandbox in step 5.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openrouter

<!-- ::end:tabs -->

Get an OpenRouter key from [openrouter.ai](https://openrouter.ai).

## 2. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
```

Create `src/components/open-router-key-form.tsx`. `byok.update` saves the key. `useByok` reads the status.

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

For passkeys or other storage, open [Bring Your Own Key](../advanced/byok).

## 3. Add the prompt page

Replace `src/routes/index.tsx` with this file. Pass `byok` to `useGenerateImage`. The hook then sends the key in an `x-byok-*` header.

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

## 4. Add the server route

Create `src/routes/api.generate.image.ts`, next to `index.tsx`. Start maps this file name to the `/api/generate/image` path.

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
    adapter: createOpenRouterImage('google/gemini-nano-banana-2.1', apiKey),
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

Import `openrouterByok` from `@tanstack/ai-openrouter/byok`, not from the main entry of the adapter.

## 5. Try it

1. Run the app.
2. Paste an OpenRouter key.
3. Type a prompt and click Generate.

The image shows on the page.

The same app is on the Examples tab at `/ai/latest/docs/framework/react/examples/generate-image`.

<!-- ::client-example library=ai framework=react slug=generate-image -->

You have an image from a prompt, and the OpenRouter key never sits in a server env file.

## How it works

The generation has two sides:

- **The client** runs in the browser. It holds the key, shows the prompt box, and sends a POST to your route.
- **The server route** reads the key, calls OpenRouter, and streams the image back.

On the client:

- `generate({ prompt })` starts the run.
- `result.images` holds the image when it arrives.
- If no key is saved, the hook does not send the POST. The form shows "Paste an OpenRouter key, then generate again."

On the server:

- `generationParamsFromRequest` reads the prompt from the POST body.
- `getByokKey` reads the `x-byok-openrouter` header first. If the header is empty, it reads `OPENROUTER_API_KEY` from the environment. If both are empty, `byokMissing` returns HTTP 401.
- `stream: true` makes `generateImage` return a stream, so `toServerSentEventsResponse` can send it to the hook.
- The route accepts a text prompt only. OpenRouter returns one image for each request.

The full example is on GitHub: [TanStack/ai `examples/react/generate-image`](https://github.com/TanStack/ai/tree/main/examples/react/generate-image).

For sizes, image-to-image, and other providers, open [Image Generation](../media/image-generation).

## Advanced

### Transform `result` with `onResult`

`result` is the full `ImageGenerationResult`, so the page still picks a URL or base64 for `<img>`. Pass `onResult` to do that work in the hook. Return a `src` string, and the hook stores that string on `result`.

The server route does not change. Only the page changes:

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

- A returned string replaces `result`.
- A `null` return keeps the previous `result`.
