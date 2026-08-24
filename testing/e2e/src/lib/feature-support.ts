import type { Provider, Feature } from '@/lib/types'

/**
 * Single source of truth for provider × feature support.
 *
 * This matrix is imported by `tests/test-matrix.ts` (Playwright specs) and
 * by the dev routes under `src/routes/` to decide which provider/feature
 * combinations to render and test. Update this file only — do not fork.
 */
export const matrix: Record<Feature, Set<Provider>> = {
  chat: new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  'one-shot-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  // BytePlus and LLM Gateway both stream their reasoning trace as
  // `delta.reasoning_content`, which is exactly the field aimock's
  // OpenAI-compatible chunk builder emits for a fixture's `reasoning` channel —
  // so each adapter's `extractReasoning` override is exercised end-to-end
  // against the shared fixture.
  reasoning: new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  'multi-turn': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  'tool-calling': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'openrouter-responses',
    'vercel-gateway',
    'vercel-gateway-responses',
    'lovable',
    'lovable-responses',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  'parallel-tool-calls': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  // Gemini excluded: approval flow timing issues with Gemini's streaming format
  // Vertex uses the same Gemini stream, so it is excluded for the same reason.
  'tool-approval': new Set([
    'openai',
    'anthropic',
    'ollama',
    'groq',
    'grok',
    'vertex-grok',
    'vertex-mistral',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  // Ollama excluded: aimock doesn't support content+toolCalls for /api/chat format
  'text-tool-text': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  'structured-output': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  // Streaming structured output: only providers with native streaming JSON
  // schema support are listed here. Other providers fall back to the
  // activity-layer `fallbackStructuredOutputStream` (which wraps the
  // non-streaming `structuredOutput`) but aren't exercised by E2E yet.
  'structured-output-stream': new Set([
    'openai',
    'groq',
    'grok',
    'vertex-grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'byteplus',
    'llmgateway',
  ]),
  // Multi-turn structured output: every turn produces its own typed
  // `structured-output` part on the assistant message, and historical
  // turns stay renderable. Works for every provider that supports both
  // multi-turn and structured-output — non-native-streaming adapters
  // (anthropic, gemini, ollama) fall back to a single
  // `structured-output.complete` event per turn, but the per-message
  // typed part still lands and the round-trip is identical.
  // Anthropic temporarily excluded — multi-turn structured output regresses
  // when the engine takes the #605 native-combined path on Claude 4.5+ (the
  // 2nd turn's rendered structured-output part shows the 1st turn's
  // content). Other native-combined providers (openai) still pass here,
  // so the regression appears Anthropic-specific. Likely an interaction
  // between the assistant message's text-content shape (post-#605) and
  // either useChat's part rendering or aimock's response routing for the
  // multi-turn shape. Tracking via follow-up issue; the single-turn
  // anthropic structured-output and structured-output-stream entries
  // (where applicable) continue to pass and are sufficient validation
  // for #605's native combined mode landing.
  'multi-turn-structured': new Set([
    'openai',
    'gemini',
    'vertex',
    'vertex-grok',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'byteplus',
    'llmgateway',
  ]),
  'agentic-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'openai-compatible',
    'mistral',
    'byteplus',
    'llmgateway',
  ]),
  // Native-combined-mode adapters only. Each provider's default test model
  // (or per-feature override in `features.ts`) must opt into combined mode
  // — otherwise the engine takes the legacy finalization path, which makes
  // an extra request that this feature's fixture doesn't model.
  // openrouter and openrouter-responses both default to openai/gpt-4o,
  // which is in OPENROUTER_COMBINED_TOOLS_AND_SCHEMA_MODELS.
  'agentic-structured-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'grok',
    'vertex-grok',
    'openrouter',
    'openrouter-responses',
    'byteplus',
  ]),
  // Bedrock excluded: the default e2e model (openai.gpt-oss-120b) is text-only
  // (input: ['text'], no vision) — image input isn't supported, so the
  // multimodal request never carries the image and the description comes back empty.
  // Mistral API default e2e model (mistral-large-latest) is text-only.
  // vertex-mistral uses mistral-medium-3, which accepts image input.
  'multimodal-image': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'grok',
    'vertex-grok',
    'vertex-mistral',
    'openrouter',
    'byteplus',
    'llmgateway',
  ]),
  // OpenAI only: this feature exercises the Responses adapter's PDF
  // `input_file` conversion (base64 `file_data` + filename).
  'multimodal-document': new Set(['openai']),
  // Bedrock excluded: same text-only default e2e model as multimodal-image above.
  'multimodal-structured': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'grok',
    'vertex-grok',
    'vertex-mistral',
    'openrouter',
    'byteplus',
    'llmgateway',
  ]),
  // byteplus excluded: @tanstack/ai-byteplus ships no summarize adapter —
  // Ark has no summarization endpoint, and api.summarize.ts builds a
  // dedicated `create*Summarize` adapter per provider rather than reusing the
  // chat adapter. Add both entries here if a Seed summarize adapter lands.
  summarize: new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'mistral',
    'llmgateway',
  ]),
  'summarize-stream': new Set([
    'openai',
    'anthropic',
    'gemini',
    'vertex',
    'vertex-grok',
    'vertex-mistral',
    'ollama',
    'groq',
    'grok',
    'bedrock',
    'bedrock-responses',
    'openrouter',
    'vercel-gateway',
    'lovable',
    'mistral',
    'llmgateway',
  ]),
  // Embedding (Promise-based `embed()` activity, no streaming). aimock 1.34
  // natively mocks OpenAI's /v1/embeddings (JSON fixture in
  // fixtures/embedding/). The other providers run through custom mounts in
  // global-setup.ts: Gemini because @google/genai posts to
  // `:batchEmbedContents` (aimock only handles `:embedContent`); Ollama
  // because aimock's /api/embed handler returns the legacy singular
  // `embedding` field, not the `embeddings: number[][]` shape the ollama SDK
  // `embed()` expects; Mistral because its SDK Zod-validates the response and
  // requires an `id` field aimock's OpenAI-format builder omits.
  // Vertex excluded: aimock's Vertex handler only covers
  // generateContent / streamGenerateContent. Vertex embed uses a
  // different path (`:predict` / `:batchEmbedContents` under
  // /v1/projects/…), so it cannot reuse the Gemini /v1beta mount.
  embedding: new Set([
    'openai',
    'gemini',
    'ollama',
    'mistral',
    'vercel-gateway',
    'lovable',
  ]),
  // Gemini excluded: aimock doesn't mock Gemini's Imagen predict endpoint format
  // vercel-gateway uses POST /v1/images/generations, the same path aimock
  // already mocks for openai. Drop this entry if the first run has no fixture.
  'image-gen': new Set([
    'openai',
    'grok',
    'byteplus',
    'vercel-gateway',
    'lovable',
  ]),
  // image-to-image (image parts in the generateImage prompt). aimock 1.29
  // mocks OpenAI's multipart `/v1/images/edits` (matches on the `prompt` form
  // field, ignores the binary image/mask fields), so the OpenAI route runs
  // end-to-end. Other providers route to endpoints aimock doesn't mock yet
  // (Gemini multimodal `generateContent`, xAI's JSON `/v1/images/edits`,
  // OpenRouter multimodal chat content parts, fal endpoint-specific input
  // fields) — their mapping is covered by unit tests. Add them here when
  // aimock support lands.
  // byteplus excluded: Seedream edits through the same /images/generations
  // endpoint (reference images ride an `image` array in the JSON body), so
  // there is no `/v1/images/edits` request for this spec's journal assertion
  // to find. The reference-image mapping is unit-tested instead.
  'image-to-image': new Set(['openai', 'lovable']),
  // byteplus excluded: BytePlus has no music/audio generation product —
  // Seed Speech is TTS + ASR only.
  // Vertex excluded for the same media-path reason as embedding: the
  // Gemini TTS / Veo / Lyria / Interactions mounts live under /v1beta.
  // Vertex posts those activities to /v1/projects/… instead.
  'audio-gen': new Set(['gemini', 'elevenlabs']),
  // byteplus excluded: no sound-effects endpoint (see audio-gen above).
  'sound-effects': new Set(['elevenlabs']),
  tts: new Set([
    'openai',
    'gemini',
    'grok',
    'elevenlabs',
    'byteplus',
    'lovable',
  ]),
  transcription: new Set([
    'openai',
    'grok',
    'groq',
    'elevenlabs',
    'byteplus',
    'lovable',
  ]),
  // byteplus excluded: this spec asserts named-speaker segments
  // (`agent`/`customer`), which is OpenAI's `diarized_json` shape. Seed ASR's
  // nearest equivalent is `enable_speaker_info`, whose response shape is
  // unverified — it couldn't be probed live without the Seed Speech voice key
  // — and the adapter reads speaker labels defensively out of an utterance's
  // `additions` for that reason. Revisit once the shape is confirmed.
  'transcription-diarization': new Set(['openai']),
  // Gemini Veo runs through a custom aimock mount (see geminiVeoMount in
  // global-setup.ts) — aimock 1.29 doesn't model the long-running
  // `:predictLongRunning` + operations-polling pair natively.
  // BytePlus Seedance uses its own create→poll task API
  // (POST/GET /api/v3/contents/generations/tasks), mounted as
  // byteplusSeedanceMount in global-setup.ts for the same reason.
  // OpenRouter excluded: its dedicated async video API
  // (`POST /api/v1/videos` → poll → `unsigned_urls`) is a different wire
  // shape from the OpenAI `/v1/videos` handler aimock 1.29 mocks. The
  // adapter's submit/poll/download lifecycle is covered by unit tests
  // (packages/ai-openrouter/tests/video-adapter.test.ts). Add it here when
  // aimock learns the OpenRouter job endpoints
  // (https://github.com/CopilotKit/aimock/issues/261).
  'video-gen': new Set(['openai', 'gemini', 'byteplus', 'lovable']),
  // image-to-video (image parts in the generateVideo prompt). aimock 1.29's
  // `/v1/videos` handler parses Sora's multipart upload (the SDK switches to
  // multipart when `input_reference` carries a File) and matches on the
  // `prompt` form field, so the OpenAI/Sora route runs end-to-end. fal's
  // endpoint-specific fields, Gemini Veo's image/lastFrame/referenceImages
  // routing, and OpenRouter's `frame_images` / `input_references` mapping
  // remain unit-test-only (the spec's journal assertion is tied to aimock's
  // /v1/videos pipeline, which custom mounts bypass).
  // byteplus excluded: Seedance takes its opening frame as a `first_frame`
  // role inside the task body's `content[]`, so the spec's assertion that a
  // multipart POST /v1/videos carried the prompt can't hold. The role mapping
  // is unit-tested instead.
  'image-to-video': new Set(['openai', 'lovable']),
  // Gemini Omni Flash video generation over the Interactions API. Runs
  // through a dedicated aimock mount (see geminiOmniVideoMount in
  // global-setup.ts) — aimock handles synchronous text interactions natively
  // but not background video jobs (create → poll → inline base64 mp4).
  // byteplus excluded: Ark has no Interactions-style API — Seedance video is
  // the task API covered by video-gen above.
  'interactions-video': new Set(['gemini']),
  // Only Gemini currently surfaces a first-class stateful conversation API via
  // the adapter (geminiTextInteractions, behind @tanstack/ai-gemini/experimental).
  // byteplus excluded for the same reason: Ark's chat endpoint is stateless.
  'stateful-interactions': new Set(['gemini']),
}

export function isSupported(provider: Provider, feature: Feature): boolean {
  return matrix[feature]?.has(provider) ?? false
}

export function getSupportedFeatures(provider: Provider): Feature[] {
  return (Object.entries(matrix) as Array<[Feature, Set<Provider>]>)
    .filter(([_, providers]) => providers.has(provider))
    .map(([feature]) => feature)
}
