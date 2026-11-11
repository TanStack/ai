<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-muse

Muse provider adapter for TanStack AI.

Muse is served by the Meta Model API through an OpenAI-compatible Chat
Completions endpoint at `https://api.meta.ai/v1`, so this adapter drives it
with an OpenAI-compatible client through a `baseURL` override. It gives you
tree-shakeable text adapters for the Muse model family, including the
flagship `muse-ember-1.0` (Ember) model.

## Installation

```bash
npm install @tanstack/ai-muse @tanstack/ai
```

## Usage

```typescript
import { museText } from '@tanstack/ai-muse'
import { chat } from '@tanstack/ai'

// Reads the API key from MUSE_API_KEY (MODEL_API_KEY, the name used in
// Meta's docs, is also accepted).
const adapter = museText('muse-ember-1.0')

const result = await chat({
  adapter,
  threadId: 'thread-1',
  stream: false,
  messages: [{ role: 'user', content: 'Write a haiku about embers.' }],
})

console.log(result.text)
```

Pass an explicit key when you do not want to read it from the environment:

```typescript
import { createMuseText } from '@tanstack/ai-muse'

const adapter = createMuseText('muse-ember-1.0', 'your-meta-model-api-key')
```

## Models

Chat models served by the Meta Model API:

- `muse-ember-1.0` — flagship for high-volume execution (Ember)
- `muse-wonder-1.0`
- `muse-spark-1.3`, `muse-spark-1.2`, `muse-spark-1.1`
- `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor` — Contributor
  mode: discounted rates, your traffic may be used for training

All of these accept `text` and `image` input through this adapter. (On the
API itself they also accept video, audio, and PDF input, which this adapter
does not yet expose.)

Muse Glimmer is an open-weight model you run yourself; it is not served by
the Meta Model API and is not part of this adapter.
