# @tanstack/ai-elevenlabs

## 0.2.29

### Patch Changes

- [#844](https://github.com/TanStack/ai/pull/844) [`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff) - Republish all packages with their compiled `dist/` output.

  Releases `0.33.0`–`0.36.0` were published without a `dist/` directory: the
  release workflow relied on an Nx-cached `build` whose outputs were not
  materialized to disk before `changeset publish` packed the tarballs, and
  `files: ["dist"]` silently includes nothing when `dist/` is absent. The
  published packages therefore contained only `src/`, so every export
  (`./dist/esm/*.js`) resolved to a missing file and the packages were
  uninstallable.

  The publish step now runs a fresh, cache-bypassing build of all packages
  immediately before publishing, guaranteeing compiled artifacts are present in
  every tarball.

- Updated dependencies [[`a6cceba`](https://github.com/TanStack/ai/commit/a6cceba4812e7e986183ee856112fcf5f8fa12ff)]:
  - @tanstack/ai@0.37.0
  - @tanstack/ai-utils@0.3.1

## 0.2.28

### Patch Changes

- Updated dependencies [[`fbd3762`](https://github.com/TanStack/ai/commit/fbd37623b287e370aa5678e161dec19cf13ae33b)]:
  - @tanstack/ai@0.36.0

## 0.2.27

### Patch Changes

- [#830](https://github.com/TanStack/ai/pull/830) [`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f) - Move the `RealtimeAdapter` / `RealtimeConnection` contract into `@tanstack/ai` and stop provider adapters from depending on `@tanstack/ai-client`.

  Provider packages (`@tanstack/ai-openai`, `@tanstack/ai-elevenlabs`, `@tanstack/ai-grok`) are usable server-side (text, embeddings, images, transcription, token minting, etc.) and must not pull in the client-only `@tanstack/ai-client`. The only thing their realtime adapters needed from it were the `RealtimeAdapter` / `RealtimeConnection` type shapes.

  Those two interfaces now live in `@tanstack/ai` — the shared layer that both provider packages and `@tanstack/ai-client` already depend on, and where every other realtime type (`RealtimeToken`, `RealtimeEvent`, `RealtimeSessionConfig`, …) already lives. They're exported from `@tanstack/ai` and `@tanstack/ai/client`. `@tanstack/ai-client` re-exports them unchanged, so `import { RealtimeAdapter } from '@tanstack/ai-client'` keeps working.

  As a result `@tanstack/ai-client` is no longer a dependency (peer or otherwise) of any provider package, and the previously-duplicated local contract + drift test in `@tanstack/ai-grok` are removed in favor of the single shared definition. Consumers only need `@tanstack/ai-client` at the point where they actually construct a `RealtimeClient`.

- Updated dependencies [[`c04abd3`](https://github.com/TanStack/ai/commit/c04abd35284d464d830bb9f15129c7a7c2533d3f)]:
  - @tanstack/ai@0.35.0

## 0.2.26

### Patch Changes

- Updated dependencies [[`31de22b`](https://github.com/TanStack/ai/commit/31de22b1ae780c53e3abbf9cf17e1db7b62de84a)]:
  - @tanstack/ai-utils@0.3.0
  - @tanstack/ai@0.34.0
  - @tanstack/ai-client@0.18.2

## 0.2.25

### Patch Changes

- Updated dependencies [[`2cb0313`](https://github.com/TanStack/ai/commit/2cb0313c1f13e1db37c5550308e36bb0b9b73b98), [`18e5f4d`](https://github.com/TanStack/ai/commit/18e5f4d9746a26c3194929ea4b49673728e8eaa5), [`21720dd`](https://github.com/TanStack/ai/commit/21720dd73524d624594a6dfb7e4669c03cc08af0), [`243b8fa`](https://github.com/TanStack/ai/commit/243b8fad7e8a48b68a1a96962ee1443cbd6a0ced)]:
  - @tanstack/ai@0.33.0
  - @tanstack/ai-client@0.18.1

## 0.2.24

### Patch Changes

- Updated dependencies [[`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f), [`8fa6cc5`](https://github.com/TanStack/ai/commit/8fa6cc56c5f36e22885c98a511dcceb2bfc0da1f)]:
  - @tanstack/ai@0.32.0
  - @tanstack/ai-client@0.18.0

## 0.2.23

### Patch Changes

- Updated dependencies [[`07aaf8b`](https://github.com/TanStack/ai/commit/07aaf8b9e5a8e699be25f936cc9cd651a46c16c5)]:
  - @tanstack/ai@0.31.0
  - @tanstack/ai-client@0.17.3

## 0.2.22

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`7103348`](https://github.com/TanStack/ai/commit/71033488212bff05dcccc857e721ab9262ebc2a6), [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai@0.30.0
  - @tanstack/ai-client@0.17.1
  - @tanstack/ai-utils@0.2.2

## 0.2.21

### Patch Changes

- Updated dependencies [[`ff267a5`](https://github.com/TanStack/ai/commit/ff267a5536327b006979f9f28ce2df7cc27f6e23), [`570c08a`](https://github.com/TanStack/ai/commit/570c08a8d1a35746c3d31a63188249cba2d2475a), [`22c9b42`](https://github.com/TanStack/ai/commit/22c9b42baec74914b720e440f29bd02be04eb164), [`215b6b4`](https://github.com/TanStack/ai/commit/215b6b401aa95d1d38da342aa09603cb1d616929), [`7d44569`](https://github.com/TanStack/ai/commit/7d445693ea079d7a85498a4465179ddd5f548cb0)]:
  - @tanstack/ai@0.29.0
  - @tanstack/ai-client@0.17.0

## 0.2.20

### Patch Changes

- Updated dependencies [[`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6), [`c0af426`](https://github.com/TanStack/ai/commit/c0af4262d269be67c69d6f878d9618f25fdeee19), [`00e0c93`](https://github.com/TanStack/ai/commit/00e0c932e6cb5e31f75f4b5e94486d7eb02b9ce1), [`496e814`](https://github.com/TanStack/ai/commit/496e8143435746965b10e0bbd12f26ebf04ae2a6)]:
  - @tanstack/ai@0.28.0
  - @tanstack/ai-client@0.16.3

## 0.2.19

### Patch Changes

- Updated dependencies [[`6df32b5`](https://github.com/TanStack/ai/commit/6df32b53026673d159e6df0892ce89effcb5c7b8)]:
  - @tanstack/ai@0.27.0
  - @tanstack/ai-client@0.16.2

## 0.2.18

### Patch Changes

- Updated dependencies [[`755e995`](https://github.com/TanStack/ai/commit/755e9953a31e879c4b88df0e7672ce1224886c97)]:
  - @tanstack/ai-client@0.16.0

## 0.2.17

### Patch Changes

- Updated dependencies [[`5d6cd28`](https://github.com/TanStack/ai/commit/5d6cd2834ba7ac1d7c7c1bd24ede202bf3e78010)]:
  - @tanstack/ai@0.26.0
  - @tanstack/ai-client@0.15.2

## 0.2.16

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai@0.25.0
  - @tanstack/ai-client@0.15.1

## 0.2.15

### Patch Changes

- Updated dependencies [[`c1ae8b9`](https://github.com/TanStack/ai/commit/c1ae8b94c83d70508975568eb4fc9b45f1af540b), [`a452ae8`](https://github.com/TanStack/ai/commit/a452ae8bcda8abfdc6309983976ed0fbf6df1915), [`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai@0.24.0
  - @tanstack/ai-client@0.15.0

## 0.2.14

### Patch Changes

- Updated dependencies [[`980ff9b`](https://github.com/TanStack/ai/commit/980ff9ba925f5dbae62a9318cc1e787d0ae24314), [`d5645cf`](https://github.com/TanStack/ai/commit/d5645cfd4d1b9cfc877f7d4d714517e166a99ce3)]:
  - @tanstack/ai@0.23.0
  - @tanstack/ai-client@0.14.0

## 0.2.13

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-client@0.13.0
  - @tanstack/ai@0.22.1

## 0.2.12

### Patch Changes

- Updated dependencies [[`ad23da9`](https://github.com/TanStack/ai/commit/ad23da92c279759b3778672dcee3d1616a02994b)]:
  - @tanstack/ai-client@0.12.0

## 0.2.11

### Patch Changes

- Updated dependencies [[`02f7d04`](https://github.com/TanStack/ai/commit/02f7d0427a406bd2dda6f5a51d1ef1d2600d5ac9)]:
  - @tanstack/ai@0.22.0
  - @tanstack/ai-client@0.11.8

## 0.2.10

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai@0.21.2
  - @tanstack/ai-client@0.11.6
  - @tanstack/ai-utils@0.2.1

## 0.2.9

### Patch Changes

- Adopt `@tanstack/eslint-config@0.4.0` and clean up the local override layer. ([#607](https://github.com/TanStack/ai/pull/607))
  - Bump `@tanstack/eslint-config` from `0.3.3` to `0.4.0`.
  - Drop dead `pnpm/enforce-catalog` and `pnpm/json-enforce-catalog` disables (upstream removed `eslint-plugin-pnpm` in `0.3.1`).
  - Drop the `no-case-declarations: off` override — no current source actually violates it.
  - Drop the `no-shadow: off` override — upstream sets it to `warn`, so it surfaces in editors without blocking CI.
  - Remove ~25 unnecessary type assertions across the publishable packages that the upgraded `typescript-eslint` now catches via `no-unnecessary-type-assertion`. One deliberately defensive cast in `ag-ui-wire.ts` is preserved with an inline opt-out and a reason comment.

  No public-API or runtime-behavior changes.

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529), [`a03d12b`](https://github.com/TanStack/ai/commit/a03d12b13ade93f3e262c6ffa996696ce27472ef), [`188fe11`](https://github.com/TanStack/ai/commit/188fe11b9b9691e5a241cfc416803da5b8ce5376)]:
  - @tanstack/ai@0.21.0
  - @tanstack/ai-client@0.11.4

## 0.2.8

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai@0.20.1
  - @tanstack/ai-client@0.11.3

## 0.2.7

### Patch Changes

- Updated dependencies [[`496db9c`](https://github.com/TanStack/ai/commit/496db9c42a7d3051a1295091eae29ae1c31ef997)]:
  - @tanstack/ai@0.20.0
  - @tanstack/ai-client@0.11.2

## 0.2.6

### Patch Changes

- Updated dependencies [[`2e0e2eb`](https://github.com/TanStack/ai/commit/2e0e2eb72684aac82e570d57767656e218289b49)]:
  - @tanstack/ai@0.19.0
  - @tanstack/ai-client@0.11.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`a9d1916`](https://github.com/TanStack/ai/commit/a9d19165a5028515cf1d091d611c8ac4b5b86099), [`e810153`](https://github.com/TanStack/ai/commit/e810153b34e593d3f3e1bbd8050164a6ad4423ed)]:
  - @tanstack/ai@0.18.0
  - @tanstack/ai-client@0.10.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`98979f7`](https://github.com/TanStack/ai/commit/98979f7e72f4b5bfb816fb14b60a12871f8c4bec), [`02527c2`](https://github.com/TanStack/ai/commit/02527c28c3285829535cd486e529e659260b3c5d)]:
  - @tanstack/ai@0.17.0
  - @tanstack/ai-client@0.9.2

## 0.2.3

### Patch Changes

- Updated dependencies [[`87f305c`](https://github.com/TanStack/ai/commit/87f305c9961d608fd7bea93a5100698a98aed11d)]:
  - @tanstack/ai@0.16.0
  - @tanstack/ai-client@0.9.1

## 0.2.2

### Patch Changes

- Internal refactor: every provider now delegates `getApiKeyFromEnv` / `generateId` / `transformNullsToUndefined` / `ModelMeta` helpers to the new `@tanstack/ai-utils` package. `ai-openai` and `ai-grok` additionally inherit OpenAI-compatible adapter base classes (Chat Completions / Responses text, image, summarize, transcription, TTS, video) from the new `@tanstack/openai-base` package; `ai-groq` keeps its own `BaseTextAdapter`-derived text adapter (Groq uses the `groq-sdk`, not the OpenAI SDK) but consumes `@tanstack/openai-base`'s schema converter and tool converters. The remaining providers (`ai-anthropic`, `ai-gemini`, `ai-ollama`, `ai-openrouter`, `ai-fal`, `ai-elevenlabs`) only consume `@tanstack/ai-utils` because they speak provider-native protocols, not OpenAI-compatible ones. No breaking changes — all public APIs remain identical. ([#409](https://github.com/TanStack/ai/pull/409))

- Updated dependencies [[`27c9aeb`](https://github.com/TanStack/ai/commit/27c9aeb80993f8262e65ef623a4cc6dadf18817e)]:
  - @tanstack/ai-utils@0.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`a4e2c55`](https://github.com/TanStack/ai/commit/a4e2c55a79490c2245ff2de2d3e1803a533c867b), [`82078bd`](https://github.com/TanStack/ai/commit/82078bdabe28d7d4a15a2847d667f363bf0a9cbe), [`b2d3cc1`](https://github.com/TanStack/ai/commit/b2d3cc131a31c54bd1e5841f958fbe333514e508), [`13cceae`](https://github.com/TanStack/ai/commit/13cceaedf64e398ca15b8dbbbfe215329ea26794)]:
  - @tanstack/ai@0.15.0
  - @tanstack/ai-client@0.9.0

## 0.2.0

### Minor Changes

- feat: add REST adapters to @tanstack/ai-elevenlabs and migrate realtime to the renamed SDK ([#504](https://github.com/TanStack/ai/pull/504))

  Extends `@tanstack/ai-elevenlabs` (previously realtime-only) with three tree-shakeable REST adapters built on the official `@elevenlabs/elevenlabs-js` SDK (v2.44+):
  - `elevenlabsSpeech()` — text-to-speech on `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_*`, `eleven_turbo_*`
  - `elevenlabsAudio()` — music (`music_v1`, with structured composition plans) and sound effects (`eleven_text_to_sound_v2`/`v1`) via a single adapter that dispatches by model
  - `elevenlabsTranscription()` — Scribe v1/v2 speech-to-text with diarization, keyterm biasing, PII redaction, and word-level timestamps

  Also migrates the existing realtime adapter off the deprecated `@11labs/client` onto the renamed `@elevenlabs/client` package.

## 0.1.8

### Patch Changes

- Updated dependencies [[`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a), [`af9eb7b`](https://github.com/TanStack/ai/commit/af9eb7bbb875b23b7e99b2e6b743636daad402d1), [`008f015`](https://github.com/TanStack/ai/commit/008f0154f852e7e6734d3e3d35cad47780b52b7a), [`54523f5`](https://github.com/TanStack/ai/commit/54523f5e9a9b4d4ea6c49e4551936bc2cc25593a)]:
  - @tanstack/ai@0.14.0
  - @tanstack/ai-client@0.8.0

## 0.1.7

### Patch Changes

- Wire each adapter's text, summarize, image, speech, transcription, and video paths through the new `InternalLogger` from `@tanstack/ai/adapter-internals`: `logger.request(...)` before each SDK call, `logger.provider(...)` for every chunk received, and `logger.errors(...)` in catch blocks. Migrates all pre-existing ad-hoc `console.*` calls in adapter catch blocks (including the OpenAI and ElevenLabs realtime adapters) onto the structured logger. No adapter factory or config-shape changes. ([#467](https://github.com/TanStack/ai/pull/467))

- Updated dependencies [[`c1fd96f`](https://github.com/TanStack/ai/commit/c1fd96ffbcee1372ab039127903162bdf5543dd9)]:
  - @tanstack/ai@0.13.0
  - @tanstack/ai-client@0.7.14

## 0.1.6

### Patch Changes

- Updated dependencies [[`e32583e`](https://github.com/TanStack/ai/commit/e32583e7612cede932baee6a79355e96e7124d90)]:
  - @tanstack/ai@0.12.0
  - @tanstack/ai-client@0.7.13

## 0.1.5

### Patch Changes

- Updated dependencies [[`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`12d43e5`](https://github.com/TanStack/ai/commit/12d43e55073351a6a2b5b21861b8e28c657b92b7), [`1d6f3be`](https://github.com/TanStack/ai/commit/1d6f3bef4fd1c4917823612fbcd9450a0fd2e627)]:
  - @tanstack/ai@0.11.0
  - @tanstack/ai-client@0.7.11

## 0.1.4

### Patch Changes

- fix(ai-elevenlabs): prevent duplicate user messages and fix client tools registration ([#419](https://github.com/TanStack/ai/pull/419))
  - Only emit `transcript` for user messages and `message_complete` for assistant messages, matching the contract expected by `RealtimeClient`
  - Pass client tools as plain async functions to `@11labs/client@0.2.0` instead of `{ handler, description, parameters }` objects which were silently ignored

## 0.1.3

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai@0.10.0
  - @tanstack/ai-client@0.7.7

## 0.1.2

### Patch Changes

- Updated dependencies [[`842e119`](https://github.com/TanStack/ai/commit/842e119a07377307ba0834ccca0e224dcb5c46ea)]:
  - @tanstack/ai@0.9.0
  - @tanstack/ai-client@0.7.3

## 0.1.1

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai@0.8.0
  - @tanstack/ai-client@0.7.1

## 0.1.0

### Minor Changes

- feat: add realtime voice chat with OpenAI and ElevenLabs adapters ([#300](https://github.com/TanStack/ai/pull/300))

  Adds realtime voice/text chat capabilities:
  - **@tanstack/ai**: `realtimeToken()` function and shared realtime types (`RealtimeToken`, `RealtimeMessage`, `RealtimeSessionConfig`, `RealtimeStatus`, `RealtimeMode`, `AudioVisualization`, events, and error types)
  - **@tanstack/ai-client**: Framework-agnostic `RealtimeClient` class with connection lifecycle, audio I/O, message state management, tool execution, and `RealtimeAdapter`/`RealtimeConnection` interfaces
  - **@tanstack/ai-openai**: `openaiRealtime()` client adapter (WebRTC) and `openaiRealtimeToken()` server token adapter with support for semantic VAD, multiple voices, and all realtime models
  - **@tanstack/ai-elevenlabs**: `elevenlabsRealtime()` client adapter (WebSocket) and `elevenlabsRealtimeToken()` server token adapter for ElevenLabs conversational AI agents
  - **@tanstack/ai-react**: `useRealtimeChat()` hook with reactive state for status, mode, messages, pending transcripts, audio visualization levels, VAD control, text/image input, and interruptions
  - **Docs**: Realtime Voice Chat guide and full API reference for all realtime classes, interfaces, functions, and type aliases

### Patch Changes

- Updated dependencies [[`86be1c8`](https://github.com/TanStack/ai/commit/86be1c8262bb3176ea786aa0af115b38c3e3f51a)]:
  - @tanstack/ai@0.7.0
  - @tanstack/ai-client@0.7.0
