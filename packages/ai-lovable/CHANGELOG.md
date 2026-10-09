# @tanstack/ai-lovable

## 0.5.3

### Patch Changes

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0
  - @tanstack/openai-base@0.13.0

## 0.5.2

### Patch Changes

- [#1652](https://github.com/TanStack/ai/pull/1652) [`13a5c4c`](https://github.com/TanStack/ai/commit/13a5c4c03333499b4cb8d88e5678161f81c39842) - Update the `openai` SDK dependency to `^7.30.0`. `openai` 7 requires Node.js 22 or later.

- Updated dependencies [[`13a5c4c`](https://github.com/TanStack/ai/commit/13a5c4c03333499b4cb8d88e5678161f81c39842)]:
  - @tanstack/openai-base@0.12.6

## 0.5.1

### Patch Changes

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`e14a0f0`](https://github.com/TanStack/ai/commit/e14a0f0af3db5b0d0a61cf5f30688bb97bc5f202), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`077c96a`](https://github.com/TanStack/ai/commit/077c96a1611c7528adcbb4e9b1918ce29cf66f29), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0
  - @tanstack/openai-base@0.12.5

## 0.5.0

### Minor Changes

- [#1541](https://github.com/TanStack/ai/pull/1541) [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e) - Video adapters can hand a provider's download stream to generation persistence instead of buffering it. Adapters now implement `getVideo()`. When a provider has no public URL for the finished video (OpenRouter, Lovable, Sora jobs without `url`), it returns a `VideoStreamResult` (`{ body, contentType }`), and `withGenerationPersistence` streams it into your blob store and sets `url` from `artifactUrl`.

  Nothing changes without persistence: `getVideoJobStatus()` and streaming `generateVideo()` still return a base64 `data:` URL for those providers.

  `VideoAdapter.getVideoUrl()` is deprecated in favor of `getVideo()`. It still works: on the built-in adapters it is `getVideo()` with a stream buffered into a `data:` URL, and custom adapters that only implement `getVideoUrl()` keep working. A custom adapter that extends `BaseVideoAdapter` with TypeScript's `noImplicitOverride` must add `override` to its `getVideoUrl()`, or rename it to `getVideo()`.

### Patch Changes

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`b414953`](https://github.com/TanStack/ai/commit/b4149531da00f97beb9b718f06752ab9a99ec389), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0
  - @tanstack/openai-base@0.12.4

## 0.4.0

### Minor Changes

- [#1539](https://github.com/TanStack/ai/pull/1539) [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49) - `snapDuration` and `snapToDurationOption` accept seconds (`6`), a numeric string (`"6"`), a seconds template (`"6s"`), or a keyword the model lists (`"auto"`). `durationToSeconds` reads the numeric forms. Sora (`sora-2`, `sora-2-pro`) accepts `4 | 8 | 12`, `"4" | "8" | "12"`, or `"4s" | "8s" | "12s"` and sends `"4" | "8" | "12"`. Lovable Veo accepts the same three spellings for 4, 6, and 8 seconds.

### Patch Changes

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0
  - @tanstack/openai-base@0.12.2

## 0.3.1

### Patch Changes

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`bb3bf30`](https://github.com/TanStack/ai/commit/bb3bf309f41b7744c14d1b0f967e76780b7266c9), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0
  - @tanstack/openai-base@0.12.1

## 0.3.0

### Minor Changes

- [#1499](https://github.com/TanStack/ai/pull/1499) [`f822940`](https://github.com/TanStack/ai/commit/f822940c9c029f46540349e64bceefff00286d6f) - Warn in development when a tool is sent with `strict: false` because its schema cannot be strict. The warning names the tool and the reason, for example `tool "lookup_user" sent with strict: false: schema uses $ref, which strict mode does not support`. It runs once per tool, never when `NODE_ENV` is `production`, and you can turn it off with `strictFallbackWarning: false` in the adapter config.

### Patch Changes

- Updated dependencies [[`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`a308fe9`](https://github.com/TanStack/ai/commit/a308fe95b126368c913a1aff3245d749a09d4312), [`489d610`](https://github.com/TanStack/ai/commit/489d610bb78f92f5df989b18acc71fe18cdfd3f9), [`7e21823`](https://github.com/TanStack/ai/commit/7e21823421cbe962c3b577b80e1de1f59bd350f5), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`f822940`](https://github.com/TanStack/ai/commit/f822940c9c029f46540349e64bceefff00286d6f), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai@0.62.0
  - @tanstack/openai-base@0.12.0

## 0.2.12

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`790cb0a`](https://github.com/TanStack/ai/commit/790cb0a0d089c7d28756076488c9b24a92629848), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0
  - @tanstack/openai-base@0.11.1

## 0.2.11

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd), [`222ebed`](https://github.com/TanStack/ai/commit/222ebed91c4f1d7f5c338e07279de60d13c1d79f)]:
  - @tanstack/ai@0.60.0
  - @tanstack/openai-base@0.11.0

## 0.2.10

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0
  - @tanstack/openai-base@0.10.16

## 0.2.9

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0
  - @tanstack/openai-base@0.10.15

## 0.2.8

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0
  - @tanstack/openai-base@0.10.14

## 0.2.7

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0
  - @tanstack/openai-base@0.10.13

## 0.2.6

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0
  - @tanstack/openai-base@0.10.12

## 0.2.5

### Patch Changes

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0
  - @tanstack/openai-base@0.10.11

## 0.2.4

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0
  - @tanstack/openai-base@0.10.10

## 0.2.3

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0
  - @tanstack/openai-base@0.10.8

## 0.2.2

### Patch Changes

- Updated dependencies [[`43b51f2`](https://github.com/TanStack/ai/commit/43b51f2e89db1c9fb23bb34b4ea4e052d370fb31), [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/openai-base@0.10.7
  - @tanstack/ai@0.51.0

## 0.2.1

### Patch Changes

- [#1253](https://github.com/TanStack/ai/pull/1253) [`8147e66`](https://github.com/TanStack/ai/commit/8147e6680996fc6f6c2d73294135ee0ccd5d1697) - Stop requiring Zod as a peer dependency when the adapters do not import it at runtime.

- Updated dependencies [[`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b), [`62c19ed`](https://github.com/TanStack/ai/commit/62c19edce7a814d868491ca920003899ec4c486b)]:
  - @tanstack/ai@0.50.0
  - @tanstack/openai-base@0.10.6

## 0.2.0

### Minor Changes

- [#1240](https://github.com/TanStack/ai/pull/1240) [`d0843c6`](https://github.com/TanStack/ai/commit/d0843c6b4d388e7f26036230f6ecbff112090e96) - `LovableModelId` is now the curated `LovableChatModel` union. The `(string & {})` escape hatch is removed, so TypeScript rejects uncurated model ids in `lovableText`, `createLovableText`, `lovableResponsesText`, `createLovableResponsesText`, and the summarize factories. The other modalities (image, video, embedding, TTS, transcription) were already limited to their curated lists.

## 0.1.0

### Minor Changes

- [#1226](https://github.com/TanStack/ai/pull/1226) [`af5fc73`](https://github.com/TanStack/ai/commit/af5fc73aeacc1d6b9b892e4be703784d50567a83) - Add a Lovable AI Gateway adapter for chat, embeddings, image, video, speech, transcription, and BYOK

### Patch Changes

- Updated dependencies [[`67ce4e5`](https://github.com/TanStack/ai/commit/67ce4e529c42e64d4591f996c7e3e32458d5dd7c), [`59481e2`](https://github.com/TanStack/ai/commit/59481e297831ba4bc7c13a80b3d23d1f6fbb7231)]:
  - @tanstack/ai@0.49.1
  - @tanstack/openai-base@0.10.5
