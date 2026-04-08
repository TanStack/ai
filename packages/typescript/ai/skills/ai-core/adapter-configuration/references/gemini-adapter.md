# Gemini Adapter Reference

## Package

```
@tanstack/ai-gemini
```

## Adapter Factories

| Factory           | Type      | Description                   |
| ----------------- | --------- | ----------------------------- |
| `geminiText`      | Text/Chat | Chat completions              |
| `geminiImage`     | Image     | Image generation (Imagen)     |
| `geminiSpeech`    | TTS       | Text-to-speech (experimental) |
| `geminiSummarize` | Summarize | Text summarization            |

## Import

```typescript
import { geminiText } from '@tanstack/ai-gemini'
import { geminiImage } from '@tanstack/ai-gemini'
```

## Key Chat Models

| Model                           | Max Input | Max Output | Notes                        |
| ------------------------------- | --------- | ---------- | ---------------------------- |
| `gemini-3.1-pro-preview`        | 1M        | 65K        | Latest flagship, thinking    |
| `gemini-3-pro-preview`          | 1M        | 65K        | Previous flagship            |
| `gemini-3-flash-preview`        | 1M        | 65K        | Fast, thinking, multimodal   |
| `gemini-3.1-flash-lite-preview` | 1M        | 65K        | Budget, still capable        |
| `gemini-2.5-pro`                | 1M        | 65K        | Stable release, all features |
| `gemini-2.5-flash`              | 1M        | 65K        | Fast stable release          |

All Gemini text models accept `text`, `image`, `audio`, `video`, and `document` input.

## Provider-Specific modelOptions

```typescript
chat({
  adapter: geminiText('gemini-2.5-pro'),
  messages,
  modelOptions: {
    // Thinking (budget-based)
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 4096,
    },
    // Thinking (level-based, advanced models)
    thinkingConfig: {
      thinkingLevel: 'THINKING_LEVEL_HIGH',
    },
    // Safety settings
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
      },
    ],
    // Tool config
    toolConfig: {
      /* ToolConfig */
    },
    // Structured output
    responseMimeType: 'application/json',
    responseSchema: {
      /* Schema */
    },
    // Cached content
    cachedContent: 'cachedContents/abc123',
    // Response modalities
    responseModalities: ['TEXT'],
    // Sampling
    topK: 40,
    seed: 42,
    presencePenalty: 0.5,
    frequencyPenalty: 0.5,
    candidateCount: 1,
    stopSequences: ['END'],
  },
})
```

## Environment Variable

```
GOOGLE_API_KEY  (preferred)
GEMINI_API_KEY  (also accepted)
```

The adapter checks `GOOGLE_API_KEY` first, then falls back to `GEMINI_API_KEY`.
Note: `GOOGLE_GENAI_API_KEY` does NOT work.

## Gotchas

- All Gemini models are multimodal (text, image, audio, video, document input).
- Image generation models (`gemini-3-pro-image-preview`, etc.) have smaller
  input limits (65K tokens) compared to text models (1M tokens).
- `thinkingConfig.thinkingLevel` (level-based) and `thinkingConfig.thinkingBudget`
  (budget-based) serve different models. Check which your model supports.
- `cachedContent` must follow the format `cachedContents/{id}`.
