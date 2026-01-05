---
title: Video Generation
id: video-generation
order: 16
---

# Video Generation (Experimental)

> **⚠️ EXPERIMENTAL FEATURE WARNING**
>
> Video generation is an **experimental feature** that is subject to significant changes. Please read the caveats below carefully before using this feature.
>
> **Key Caveats:**
> - The API may change without notice in future versions
> - OpenAI's Sora API is in limited availability and may require organization verification
> - Video generation uses a jobs/polling architecture, which differs from other synchronous activities
> - Pricing, rate limits, and quotas may vary and are subject to change
> - Not all features described here may be available in your OpenAI account

## Overview

TanStack AI provides experimental support for video generation through dedicated video adapters. Unlike image generation, video generation is an **asynchronous operation** that uses a jobs/polling pattern:

1. **Create a job** - Submit a prompt and receive a job ID
2. **Poll for status** - Check the job status until it's complete
3. **Retrieve the video** - Get the URL to download/view the generated video

Currently supported:
- **OpenAI**: Sora-2 and Sora-2-Pro models (when available)

## Basic Usage

### Creating a Video Job

```typescript
import { generateVideo } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Create a video adapter (uses OPENAI_API_KEY from environment)
const adapter = openaiVideo()

// Start a video generation job
const { jobId, model } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A golden retriever puppy playing in a field of sunflowers',
})

console.log('Job started:', jobId)
```

### Polling for Status

```typescript
import { getVideoJobStatus } from '@tanstack/ai'

// Check the status of the job
const status = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})

console.log('Status:', status.status) // 'pending' | 'processing' | 'completed' | 'failed'
console.log('Progress:', status.progress) // 0-100 (if available)

if (status.status === 'failed') {
  console.error('Error:', status.error)
}
```

### Getting the Video URL

```typescript
import { getVideoJobStatus } from '@tanstack/ai'

// Only call this after status is 'completed'
const result = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})

if (result.status === 'completed' && result.url) {
  console.log('Video URL:', result.url)
  console.log('Expires at:', result.expiresAt)
}
```

### Complete Example with Polling Loop

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

async function generateVideo(prompt: string) {
  const adapter = openaiVideo()

  // 1. Create the job
  const { jobId } = await generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt,
    size: '1280x720',
    duration: 8, // 4, 8, or 12 seconds
  })

  console.log('Job created:', jobId)

  // 2. Poll for completion
  let status = 'pending'
  while (status !== 'completed' && status !== 'failed') {
    // Wait 5 seconds between polls
    await new Promise((resolve) => setTimeout(resolve, 5000))

    const result = await getVideoJobStatus({
      adapter: openaiVideo('sora-2'),
      jobId,
    })

    status = result.status
    console.log(`Status: ${status}${result.progress ? ` (${result.progress}%)` : ''}`)

    if (result.status === 'failed') {
      throw new Error(result.error || 'Video generation failed')
    }
  }

  // 3. Get the video URL
  const result = await getVideoJobStatus({
    adapter: openaiVideo('sora-2'),
    jobId,
  })

  if (result.status === 'completed' && result.url) {
    return result.url
  }

  throw new Error('Video generation failed or URL not available')
}

// Usage
const videoUrl = await generateVideo('A cat playing piano in a jazz bar')
console.log('Video ready:', videoUrl)
```

## Options

### Job Creation Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `VideoAdapter` | Video adapter instance with model (required) |
| `prompt` | `string` | Text description of the video to generate (required) |
| `size` | `string` | Video resolution in WIDTHxHEIGHT format |
| `duration` | `number` | Video duration in seconds (maps to `seconds` parameter in API) |
| `modelOptions?` | `object` | Model-specific options (renamed from `providerOptions`) |

### Supported Sizes

Based on [OpenAI API docs](https://platform.openai.com/docs/api-reference/videos/create):

| Size | Description |
|------|-------------|
| `1280x720` | 720p landscape (16:9) - default |
| `720x1280` | 720p portrait (9:16) |
| `1792x1024` | Wide landscape |
| `1024x1792` | Tall portrait |

### Supported Durations

The API uses the `seconds` parameter. Allowed values:

- `4` seconds
- `8` seconds (default)
- `12` seconds

## Model Options

### OpenAI Model Options

Based on the [OpenAI Sora API](https://platform.openai.com/docs/api-reference/videos/create):

```typescript
const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A beautiful sunset over the ocean',
  size: '1280x720',      // '1280x720', '720x1280', '1792x1024', '1024x1792'
  duration: 8,           // 4, 8, or 12 seconds
  modelOptions: {
    size: '1280x720',    // Alternative way to specify size
    seconds: 8,          // Alternative way to specify duration
  }
})
```

## Response Types

### VideoJobResult (from create)

```typescript
interface VideoJobResult {
  jobId: string    // Unique job identifier for polling
  model: string    // Model used for generation
}
```

### VideoStatusResult (from status)

```typescript
interface VideoStatusResult {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number  // 0-100, if available
  error?: string     // Error message if failed
}
```

### VideoUrlResult (from url)

```typescript
interface VideoUrlResult {
  jobId: string
  url: string        // URL to download/stream the video
  expiresAt?: Date   // When the URL expires
}
```

## Model Variants

| Model | Description | Use Case |
|-------|-------------|----------|
| `sora-2` | Faster generation, good quality | Rapid iteration, prototyping |
| `sora-2-pro` | Higher quality, slower | Production-quality output |

## Error Handling

Video generation can fail for various reasons. Always implement proper error handling:

```typescript
try {
  const { jobId } = await generateVideo({
    adapter: openaiVideo('sora-2'),
    prompt: 'A scene',
  })

  // Poll for status...
  const status = await getVideoJobStatus({
    adapter: openaiVideo('sora-2'),
    jobId,
  })

  if (status.status === 'failed') {
    console.error('Generation failed:', status.error)
    // Handle failure (e.g., retry, notify user)
  }
} catch (error) {
  if (error.message.includes('Video generation API is not available')) {
    console.error('Sora API access may be required. Check your OpenAI account.')
  } else if (error.message.includes('rate limit')) {
    console.error('Rate limited. Please wait before trying again.')
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Rate Limits and Quotas

> **⚠️ Note:** Rate limits and quotas for video generation are subject to change and may vary by account tier.

Typical considerations:
- Video generation is computationally expensive
- Concurrent job limits may apply
- Monthly generation quotas may exist
- Longer/higher-quality videos consume more quota

Check the [OpenAI documentation](https://platform.openai.com/docs) for current limits.

## Environment Variables

The video adapter uses the same environment variable as other OpenAI adapters:

- `OPENAI_API_KEY`: Your OpenAI API key

## Explicit API Keys

For production use or when you need explicit control:

```typescript
import { createOpenaiVideo } from '@tanstack/ai-openai'

const adapter = createOpenaiVideo('your-openai-api-key')
```

## Differences from Image Generation

| Aspect | Image Generation | Video Generation |
|--------|-----------------|------------------|
| API Type | Synchronous | Jobs/Polling |
| Return Type | `ImageGenerationResult` | `VideoJobResult` → `VideoStatusResult` → `VideoUrlResult` |
| Wait Time | Seconds | Minutes |
| Multiple Outputs | `numberOfImages` option | Not supported |
| Options Field | `prompt`, `size`, `numberOfImages` | `prompt`, `size`, `duration` |

## Known Limitations

> **⚠️ These limitations are subject to change as the feature evolves.**

1. **API Availability**: The Sora API may not be available in all OpenAI accounts
2. **Generation Time**: Video generation can take several minutes
3. **URL Expiration**: Generated video URLs may expire after a certain period
4. **No Real-time Progress**: Progress updates may be limited or delayed
5. **Audio Limitations**: Audio generation support may be limited
6. **Prompt Length**: Long prompts may be truncated

## Best Practices

1. **Implement Timeouts**: Set reasonable timeouts for the polling loop
2. **Handle Failures Gracefully**: Have fallback behavior for failed generations
3. **Cache URLs**: Store video URLs and check expiration before re-fetching
4. **User Feedback**: Show clear progress indicators during generation
5. **Validate Prompts**: Check prompt length and content before submission
6. **Monitor Usage**: Track generation usage to avoid hitting quotas

## Future Considerations

This feature is experimental. Future versions may include:

- Additional video models and providers
- Streaming progress updates
- Video editing and manipulation
- Audio track generation
- Batch video generation
- Custom style/aesthetic controls

Stay tuned to the [TanStack AI changelog](https://github.com/TanStack/ai/blob/main/CHANGELOG.md) for updates.

