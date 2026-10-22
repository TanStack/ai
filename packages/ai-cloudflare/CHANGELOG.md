# @tanstack/ai-cloudflare

## 0.3.2

### Patch Changes

- Updated dependencies [[`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325), [`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325), [`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325)]:
  - @tanstack/ai@0.71.0
  - @tanstack/openai-base@0.16.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`5f95dbd`](https://github.com/TanStack/ai/commit/5f95dbd08f2780442000ac52074ea747d1b44187), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a), [`ee374b4`](https://github.com/TanStack/ai/commit/ee374b4753adfc2ae305edad03f1ac9a588321fa), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`4298480`](https://github.com/TanStack/ai/commit/429848047c8c514f29855f8a99a7260253eb5d5b), [`761a652`](https://github.com/TanStack/ai/commit/761a652a3d3f8d31017e11034a4844c8c81af0f6), [`f68da51`](https://github.com/TanStack/ai/commit/f68da51f63f999b70ac7aaf5aebc0109a7e9daf7), [`85c2956`](https://github.com/TanStack/ai/commit/85c2956c68f3226ef409b3a4e54d5be82198931e), [`30fa651`](https://github.com/TanStack/ai/commit/30fa651d173e519db8de50c9f888ded71b951640), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b)]:
  - @tanstack/ai@0.70.0
  - @tanstack/openai-base@0.15.0
  - @tanstack/ai-utils@0.5.0

## 0.3.0

### Minor Changes

- [#1721](https://github.com/TanStack/ai/pull/1721) [`4069e0e`](https://github.com/TanStack/ai/commit/4069e0e73608036fa75806744fd4ed8bf2e4a8b6) - Add `cloudflareBindingFetch({ binding, vendor, gateway })`. It sends the requests of the Anthropic and OpenAI text adapters (`createAnthropicChat`, `createOpenaiChat`) through the Workers AI binding (`env.AI.run`) to the AI Gateway `anthropic/...` and `openai/...` models, so a Worker can use Claude and GPT with no provider key.
  - `vendor: 'anthropic'` carries Anthropic Messages requests, and `vendor: 'openai'` carries OpenAI Responses requests.
  - The request body goes to `env.AI.run('<vendor>/<model>', body)`. Headers such as `anthropic-beta` go along as `extraHeaders`, and the SDK's auth and transport headers are dropped.
  - A Cloudflare error body is rewrapped so the SDK reports its message.

- [#1739](https://github.com/TanStack/ai/pull/1739) [`a0150c2`](https://github.com/TanStack/ai/commit/a0150c26b9e2b6050663450171e36a9dfa80915b) - Text adapters now set one stable code on `RUN_ERROR` when the input does not fit in the model's context window: `code: 'context_overflow'`. `@tanstack/ai` exports it as `CONTEXT_OVERFLOW_CODE`. The provider's own text stays in `message`.

  ```ts
  if (chunk.type === 'RUN_ERROR' && chunk.code === CONTEXT_OVERFLOW_CODE) {
    // shorten the messages, then call chat() again
  }
  ```

  These adapters set it: OpenAI and the other OpenAI-compatible adapters (from `code: 'context_length_exceeded'`), Anthropic, Gemini, Bedrock (Converse, Chat Completions, and Responses), OpenRouter, Grok, Cloudflare Workers AI, and BytePlus.

  Changes to code that reads the old values:
  - OpenAI-compatible adapters gave `code: 'context_length_exceeded'`. They now give `'context_overflow'`. `rawEvent` still has the provider's code.
  - Anthropic, Grok, OpenRouter, and BytePlus gave the HTTP status or a general bad-request code for this error. Gemini and Bedrock Converse gave no code.
  - The Anthropic adapter now sends `RUN_ERROR` with this code when the model stops with `stop_reason: 'model_context_window_exceeded'`. Before, it sent `RUN_FINISHED` with `finishReason: 'stop'`, so a cut-off answer looked complete.

- [#1692](https://github.com/TanStack/ai/pull/1692) [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c) - Set reasoning with `chat({ reasoning })`.
  - The adapter sends `reasoning_effort`, and `null` for `off`.
  - The reasoning data is in `utils/models.ts`, keyed by model id. `CloudflareModelReasoningByName` and `CLOUDFLARE_MODEL_REASONING` come from it.
  - `chat_template_kwargs` stays in `modelOptions`. It picks the output format, not the effort.

  Breaking: `reasoning_effort` is no longer in `modelOptions`.

  ```ts
  // Before
  chat({
    adapter: cloudflareText('@cf/zai-org/glm-5.3'),
    messages,
    modelOptions: { reasoning_effort: 'low' },
  })

  // After
  chat({
    adapter: cloudflareText('@cf/zai-org/glm-5.3'),
    messages,
    reasoning: 'low',
  })
  ```

### Patch Changes

- Updated dependencies [[`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4), [`412b0fe`](https://github.com/TanStack/ai/commit/412b0fea4f4bb569998c3d253d174efd7b501e3c), [`a0150c2`](https://github.com/TanStack/ai/commit/a0150c26b9e2b6050663450171e36a9dfa80915b), [`20954cc`](https://github.com/TanStack/ai/commit/20954ccbe62c6e1c44a5bb57f3d73215670488aa), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4), [`fac0555`](https://github.com/TanStack/ai/commit/fac055559de98eb0fa23a0bc725808033ba3c2fc), [`6774e80`](https://github.com/TanStack/ai/commit/6774e803da3205101613ab2857c9ed4fbf975681), [`5bd27f2`](https://github.com/TanStack/ai/commit/5bd27f2fc94ebfb6d11bfb28d46d5d858310805e), [`c20f7b0`](https://github.com/TanStack/ai/commit/c20f7b021aa618fbfcc114b3f0bef5e888ff6b84), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`51f72fb`](https://github.com/TanStack/ai/commit/51f72fbf60e201f9c8d014aefa6406e777c05d6a), [`6f1e559`](https://github.com/TanStack/ai/commit/6f1e55934fe95ddf2bf3fb3031488a713e48c7af), [`eb4eea0`](https://github.com/TanStack/ai/commit/eb4eea05b6c53b748bba5fd414b04ce387ead05d), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`78edeb2`](https://github.com/TanStack/ai/commit/78edeb20a5ba89f2513c3f46f1267a7ed7185045), [`44e3a0a`](https://github.com/TanStack/ai/commit/44e3a0a89c86defebd38b2221dd3b7725a12839a), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`ce99a17`](https://github.com/TanStack/ai/commit/ce99a17e4814cd564b693112bda87020af6cb57c), [`7a5c0d6`](https://github.com/TanStack/ai/commit/7a5c0d6fc1541187a7f01b444bc07a0478274bcb), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4)]:
  - @tanstack/ai@0.69.0
  - @tanstack/openai-base@0.14.0
  - @tanstack/ai-utils@0.4.2

## 0.2.7

### Patch Changes

- Updated dependencies [[`723b4a4`](https://github.com/TanStack/ai/commit/723b4a4e8432825374d4980cc74c5f66dc7d1122), [`d84a49e`](https://github.com/TanStack/ai/commit/d84a49e5fef03499b10f63255880d056a55767a3)]:
  - @tanstack/ai@0.68.0
  - @tanstack/openai-base@0.13.1

## 0.2.6

### Patch Changes

- [#1680](https://github.com/TanStack/ai/pull/1680) [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e) - Add `wrapFetch` to `chat()`, to the middleware `onConfig` config, and to `TextOptions`. A wrapper gets the next fetch and gives back a new fetch. Use it to change the URL, the headers, the request, or the response of a model call. The new `FetchWrapper` type names the wrapper.

  The engine chains the `chat()` wrapper and the middleware wrappers into one function. A middleware wrapper runs inside the `chat()` wrapper and applies to one model call only.

  These text adapters send their requests through the wrapper: every adapter on `@tanstack/openai-base` (OpenAI, the OpenAI-compatible adapters, Grok, Groq, BytePlus, LLM Gateway, Lovable, Vercel AI Gateway, Cloudflare, and the Bedrock Chat Completions and Responses APIs), Anthropic, Mistral, Ollama, and OpenRouter. The wrapper wraps the fetch of the adapter config, not the global fetch. An Anthropic or Ollama adapter with an injected client ignores `wrapFetch`. In Cloudflare binding mode, the wrapper runs, but the binding does not send the URL or the headers. Without `wrapFetch`, the requests do not change.

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0
  - @tanstack/openai-base@0.13.0

## 0.2.5

### Patch Changes

- [#1652](https://github.com/TanStack/ai/pull/1652) [`13a5c4c`](https://github.com/TanStack/ai/commit/13a5c4c03333499b4cb8d88e5678161f81c39842) - Update the `openai` SDK dependency to `^7.30.0`. `openai` 7 requires Node.js 22 or later.

- Updated dependencies [[`13a5c4c`](https://github.com/TanStack/ai/commit/13a5c4c03333499b4cb8d88e5678161f81c39842)]:
  - @tanstack/openai-base@0.12.6

## 0.2.4

### Patch Changes

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`e14a0f0`](https://github.com/TanStack/ai/commit/e14a0f0af3db5b0d0a61cf5f30688bb97bc5f202), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`077c96a`](https://github.com/TanStack/ai/commit/077c96a1611c7528adcbb4e9b1918ce29cf66f29), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0
  - @tanstack/openai-base@0.12.5

## 0.2.3

### Patch Changes

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`b414953`](https://github.com/TanStack/ai/commit/b4149531da00f97beb9b718f06752ab9a99ec389), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0
  - @tanstack/openai-base@0.12.4

## 0.2.2

### Patch Changes

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0
  - @tanstack/openai-base@0.12.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`bb3bf30`](https://github.com/TanStack/ai/commit/bb3bf309f41b7744c14d1b0f967e76780b7266c9), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0
  - @tanstack/openai-base@0.12.1

## 0.2.0

### Minor Changes

- [#1499](https://github.com/TanStack/ai/pull/1499) [`f822940`](https://github.com/TanStack/ai/commit/f822940c9c029f46540349e64bceefff00286d6f) - Warn in development when a tool is sent with `strict: false` because its schema cannot be strict. The warning names the tool and the reason, for example `tool "lookup_user" sent with strict: false: schema uses $ref, which strict mode does not support`. It runs once per tool, never when `NODE_ENV` is `production`, and you can turn it off with `strictFallbackWarning: false` in the adapter config.

### Patch Changes

- Updated dependencies [[`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`a308fe9`](https://github.com/TanStack/ai/commit/a308fe95b126368c913a1aff3245d749a09d4312), [`489d610`](https://github.com/TanStack/ai/commit/489d610bb78f92f5df989b18acc71fe18cdfd3f9), [`7e21823`](https://github.com/TanStack/ai/commit/7e21823421cbe962c3b577b80e1de1f59bd350f5), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`f822940`](https://github.com/TanStack/ai/commit/f822940c9c029f46540349e64bceefff00286d6f), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai@0.62.0
  - @tanstack/openai-base@0.12.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`790cb0a`](https://github.com/TanStack/ai/commit/790cb0a0d089c7d28756076488c9b24a92629848), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0
  - @tanstack/openai-base@0.11.1

## 0.1.7

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd), [`222ebed`](https://github.com/TanStack/ai/commit/222ebed91c4f1d7f5c338e07279de60d13c1d79f)]:
  - @tanstack/ai@0.60.0
  - @tanstack/openai-base@0.11.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0
  - @tanstack/openai-base@0.10.16

## 0.1.5

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0
  - @tanstack/openai-base@0.10.15

## 0.1.4

### Patch Changes

- [#1419](https://github.com/TanStack/ai/pull/1419) [`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329) - Add decide() and TypeSafe Jev evaluate adapters.

  Callers await one decide({ adapter, state, questions }) call.
  Questions use choice(), score(), and boolean(). Answers sit on the result (value, probability, confidence). Usage sits on result.meta.

  Jev transports:
  - @tanstack/ai-typesafe (typesafeDecider)
  - @tanstack/ai-openrouter (openRouterDecider)
  - @tanstack/ai-vercel-gateway (vercelGatewayDecider)
  - @tanstack/ai-cloudflare (cloudflareDecider)

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
  - @tanstack/openai-base@0.10.14

## 0.1.3

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0
  - @tanstack/openai-base@0.10.13

## 0.1.2

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0
  - @tanstack/openai-base@0.10.12

## 0.1.1

### Patch Changes

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0
  - @tanstack/openai-base@0.10.11

## 0.1.0

### Minor Changes

- [#1309](https://github.com/TanStack/ai/pull/1309) [`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871) - Add `@tanstack/ai-cloudflare`: a Cloudflare adapter for Workers AI chat, summarization, embeddings, image generation, text-to-speech, and transcription over the `env.AI` binding or the REST API, with AI Gateway routing (`gateway` option and `cloudflareGateway()` helper for other providers). `@tanstack/ai` learns the `cloudflare` max-tokens key for summarize, lets `defineByokProvider` declare companion credentials with `with`, and adds `getByokKeys(request, { name: provider })` to `@tanstack/ai/byok/server`. `@tanstack/ai-client`'s `defineByok` takes `providers`: a send for a provider with companions (Cloudflare token plus account id) carries every `x-byok-*` header and prompts for each missing value.

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0
  - @tanstack/openai-base@0.10.10
