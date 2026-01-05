# @tanstack/ai-openai

## 0.2.0

### Patch Changes

- Updated dependencies [[`c5df33c`](https://github.com/TanStack/ai/commit/c5df33c2d3e72c3332048ffe7c64a553e5ea86fb)]:
  - @tanstack/ai@0.2.0

## 0.1.1

### Patch Changes

- add support for gpt 5.2 models ([#166](https://github.com/TanStack/ai/pull/166))

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai@0.1.0

## 0.0.3

### Patch Changes

- Fix reasoning token streaming for `gpt-5-mini` and `gpt-5-nano` models ([#94](https://github.com/TanStack/ai/pull/94))
  - Added `OpenAIReasoningOptions` to type definitions for `gpt-5-mini` and `gpt-5-nano` models
  - Fixed `summary` option placement in `OpenAIReasoningOptions` (moved inside `reasoning` object to match OpenAI SDK)
  - Added handler for `response.reasoning_summary_text.delta` events to stream reasoning summaries
  - Added model-specific `reasoning.summary` types: `concise` only available for `computer-use-preview`
  - Added `OpenAIReasoningOptionsWithConcise` for `computer-use-preview` model

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai@0.0.3

## 0.0.2

### Patch Changes

- added text metadata support for message inputs ([#95](https://github.com/TanStack/ai/pull/95))

- Updated dependencies [[`64fda55`](https://github.com/TanStack/ai/commit/64fda55f839062bc67b8c24850123e879fdbf0b3)]:
  - @tanstack/ai@0.0.2

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai@0.0.1
