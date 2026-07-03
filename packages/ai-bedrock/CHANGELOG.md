# @tanstack/ai-bedrock

## 0.1.1

### Patch Changes

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/openai-base@0.9.6

## 0.1.0

### Minor Changes

- [#665](https://github.com/TanStack/ai/pull/665) [`27ba4c7`](https://github.com/TanStack/ai/commit/27ba4c72eb959786635046dc9e7d58cad3d6c4cd) - Add `@tanstack/ai-bedrock`: an Amazon Bedrock adapter. The default `bedrockText` path uses Bedrock's **Converse** API (`@aws-sdk/client-bedrock-runtime`), reaching the broad chat catalog including Anthropic Claude, Amazon Nova, and Meta Llama, with streaming, tools, reasoning, and structured output. Opt into Bedrock's OpenAI-compatible endpoints with `api: 'chat'` (Chat Completions) or `api: 'responses'` (gpt-oss Responses). Authentication supports Bedrock API keys or SigV4 via the AWS credential chain.

### Patch Changes

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
  - @tanstack/openai-base@0.9.6
