# @tanstack/ai-skills

## 1.0.0

### Major Changes

- [#1840](https://github.com/TanStack/ai/pull/1840) [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e) - TanStack AI 1.0.0. This release removes every API that was deprecated in 0.x. Read the upgrade guide before you upgrade: https://tanstack.com/ai/latest/docs/migration/v1
  - Removed all `@deprecated` exports, options, fields, and type aliases. Each one has a replacement that already shipped in 0.x.
  - Removed `addToolApprovalResponse()` from `ChatClient` and every chat hook. Resolve the bound `tool-approval` interrupt with `resolveInterrupt` instead. The devtools event `tools:approval:responded` is also removed.
  - Removed the old wire formats: the CUSTOM `approval-requested` and `tool-input-available` events, the `[DONE]` SSE line, the `data` copy of `forwardedProps`, pre-binding interrupt descriptors and their `approval_required` and `client_tool_input` reasons, and the STEP events that adapters sent next to `REASONING_*` events. Use a 1.0 client with a 1.0 server.
  - Removed the `toolName` alias from `TOOL_CALL_START` chunks. Read `toolCallName` instead.
  - `threadId` is now required on `useChat` and every other chat hook, `ChatClient`, the generation hooks and clients, `chat()`, `summarize()`, the generation functions, `codeModeWithSnippets()`, `selectRelevantSnippets()`, `CompactionContext`, and `SummarizeInput`. TanStack AI no longer makes a thread id for you. Pass a stable id for each conversation. `createChatHook` factory options no longer take `threadId`: pass it on each hook call. Octane generation hooks take `threadId` instead of `id`. `@tanstack/ai-sandbox` removes `resolveDurableThreadId` and `DurableThreadIdRequiredError`.
  - The published `@tanstack/ai-octane/ui` types are now strict. `UI.Messages`, `UI.Message`, `UI.Part`, and `UI.Interrupts` type their render children. `ToolProps` types `part.input` and `part.output` for the named tool. `toolsComponents` and `interruptsComponents` are required when the chat options declare tools or named interrupts. Code that relied on the old loose types can fail to compile.
  - A connection adapter's `connect()` and `send()` need the run context (with `threadId`) as their fourth argument. `ChatClient` and the generation clients pass it.
  - `@tanstack/ai-sandbox`: `createToolBridgeCore()`, `startHostToolBridge()`, a `ToolBridgeProvisioner`, and `executeHostTool()` take a required `threadId`. Bridged tools get it in their context.
  - `@tanstack/ai-sandbox`: the harness tool bridge and `executeHostTool()` refuse a tool with `needsApproval`. Before, the tool ran with no approval. Remove `needsApproval`, or run the tool with an HTTP adapter.
  - `stream()` and `rpcStream()` pass the AG-UI `RunAgentInput` for the run as the fourth factory argument, the same body the HTTP adapters send. Read it on the server with `chatParamsFromRequestBody()` or `generationParamsFromBody()`, so `threadId`, `runId`, and interrupt `resume` reach a server function. `RunAgentInput` is exported from `@tanstack/ai/client`.
  - A generation `fetcher` gets `threadId` and `runId` in its second argument, next to `signal` and `headers`. Pass them to the server generation call.
  - `generationParamsFromBody()` and `generationParamsFromRequest()` read the generation input from `forwardedProps`. A server that reads `body.data` gets `undefined`. Read `body.forwardedProps` instead. They also require `threadId` and `runId` and return them as strings, the same as `chatParamsFromRequestBody()` and the AG-UI `RunAgentInput`. A body that holds only the input is rejected.
  - Removed the readers for data saved in old 0.x formats (old Cloudflare run-log records, a bare `UIMessage[]` from client persistence, artifact records without `blobKey`).
  - Removed provider models that are shut down.
  - `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` get no 1.0 release. Import from `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, or `@tanstack/ai-vue/ui`.

### Minor Changes

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - `@tanstack/ai-skills/harness`: the new `skills({ dirs })` plugin gives the harness model the skills of a list of folders, and makes each skill a `/<name>` command that starts a turn with that skill. A skill with the name of another command is `/skill:<name>`, and `/skills` lists them. The plugin watches the folders, so a skill that you add or remove while the session runs changes the commands at once. The watcher lives as long as the host, every session that uses the same `skills()` object shares it, and a change makes each session read the folders again. A skill that does not load gets a fallback message.

### Patch Changes

- [#1755](https://github.com/TanStack/ai/pull/1755) [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983) - The `mcp()`, `codeMode()`, and `skills()` harness plugins send their warnings to the logger of the host (`createHarnessHost({ logger })`).

- Updated dependencies [[`fcbd199`](https://github.com/TanStack/ai/commit/fcbd199a66b553acef0b81bc76c4b4acd7fde6a9), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`959f43e`](https://github.com/TanStack/ai/commit/959f43e4b11112f2c097f642bdec34d8d0f83e27), [`a5c2af3`](https://github.com/TanStack/ai/commit/a5c2af3e93b8359209ea3c44856e4c06599387dc), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`39c1c79`](https://github.com/TanStack/ai/commit/39c1c79dc9b6c21329f659d9b4ba6968e9496983), [`fa2a291`](https://github.com/TanStack/ai/commit/fa2a291f5526f6dec9a91fe5b71de15dfaf59ec7), [`f7e7cce`](https://github.com/TanStack/ai/commit/f7e7cce8f2d543a7480b626b7985417e054bfd8d), [`7a0a48b`](https://github.com/TanStack/ai/commit/7a0a48bac8b531a90e768c87cb645da2fc8d3f31), [`468063c`](https://github.com/TanStack/ai/commit/468063c07cd904be97b154b415163c23510834b2), [`fe83aa0`](https://github.com/TanStack/ai/commit/fe83aa05fe2346c50693664d4a4896d4fc1fea5a), [`781a3a8`](https://github.com/TanStack/ai/commit/781a3a82c870e246deff23c7aca32094e9aaaf2f), [`39abb7e`](https://github.com/TanStack/ai/commit/39abb7ed172b4357bc04a39fc6cf7c3577f77cf3), [`f1b3f65`](https://github.com/TanStack/ai/commit/f1b3f65a59fb75116bd52abbb162cab8c763d10e)]:
  - @tanstack/ai@1.0.0
  - @tanstack/ai-harness@0.1.0

## 0.1.21

### Patch Changes

- Updated dependencies [[`824ee98`](https://github.com/TanStack/ai/commit/824ee98060983dd2b5728f288cecefa6a1250325)]:
  - @tanstack/ai@0.71.0

## 0.1.20

### Patch Changes

- Updated dependencies [[`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`5f95dbd`](https://github.com/TanStack/ai/commit/5f95dbd08f2780442000ac52074ea747d1b44187), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3292bad`](https://github.com/TanStack/ai/commit/3292bad7b26990c5aa4676cc9d9fe33b1741fc1a), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`4298480`](https://github.com/TanStack/ai/commit/429848047c8c514f29855f8a99a7260253eb5d5b), [`f68da51`](https://github.com/TanStack/ai/commit/f68da51f63f999b70ac7aaf5aebc0109a7e9daf7), [`30fa651`](https://github.com/TanStack/ai/commit/30fa651d173e519db8de50c9f888ded71b951640), [`1d0f8f1`](https://github.com/TanStack/ai/commit/1d0f8f11f4e781c4ecc38baa99c30320b593c555), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b), [`3170517`](https://github.com/TanStack/ai/commit/3170517d1c3faa0c1ee6fb004b8a551978fa2a7b)]:
  - @tanstack/ai@0.70.0

## 0.1.19

### Patch Changes

- Updated dependencies [[`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`412b0fe`](https://github.com/TanStack/ai/commit/412b0fea4f4bb569998c3d253d174efd7b501e3c), [`a0150c2`](https://github.com/TanStack/ai/commit/a0150c26b9e2b6050663450171e36a9dfa80915b), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4), [`fac0555`](https://github.com/TanStack/ai/commit/fac055559de98eb0fa23a0bc725808033ba3c2fc), [`6774e80`](https://github.com/TanStack/ai/commit/6774e803da3205101613ab2857c9ed4fbf975681), [`5bd27f2`](https://github.com/TanStack/ai/commit/5bd27f2fc94ebfb6d11bfb28d46d5d858310805e), [`c20f7b0`](https://github.com/TanStack/ai/commit/c20f7b021aa618fbfcc114b3f0bef5e888ff6b84), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`51f72fb`](https://github.com/TanStack/ai/commit/51f72fbf60e201f9c8d014aefa6406e777c05d6a), [`6f1e559`](https://github.com/TanStack/ai/commit/6f1e55934fe95ddf2bf3fb3031488a713e48c7af), [`cef1911`](https://github.com/TanStack/ai/commit/cef19119c76fc5f618d6c971efbc486323b213c3), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`1bfcee3`](https://github.com/TanStack/ai/commit/1bfcee35bb3cf0ff3aac005440c842e66c3d687d), [`78edeb2`](https://github.com/TanStack/ai/commit/78edeb20a5ba89f2513c3f46f1267a7ed7185045), [`44e3a0a`](https://github.com/TanStack/ai/commit/44e3a0a89c86defebd38b2221dd3b7725a12839a), [`7532b2b`](https://github.com/TanStack/ai/commit/7532b2b09188ebd1095a60a7c5df6ef08b06916c), [`7a5c0d6`](https://github.com/TanStack/ai/commit/7a5c0d6fc1541187a7f01b444bc07a0478274bcb), [`b881627`](https://github.com/TanStack/ai/commit/b881627d51076dcc1af031ac951046e2fb7d84c4)]:
  - @tanstack/ai@0.69.0

## 0.1.18

### Patch Changes

- Updated dependencies [[`723b4a4`](https://github.com/TanStack/ai/commit/723b4a4e8432825374d4980cc74c5f66dc7d1122), [`d84a49e`](https://github.com/TanStack/ai/commit/d84a49e5fef03499b10f63255880d056a55767a3)]:
  - @tanstack/ai@0.68.0

## 0.1.17

### Patch Changes

- Updated dependencies [[`7dbfaf6`](https://github.com/TanStack/ai/commit/7dbfaf6c37a3d97de3b1f5bdb87be8bbbe2b0164), [`88fd67c`](https://github.com/TanStack/ai/commit/88fd67cd7ddfbe2b154173d2395b2c0338e97644), [`3aa2e3d`](https://github.com/TanStack/ai/commit/3aa2e3d95e2dcb1c14b4fda3bcdbdf3152582092), [`c5ae415`](https://github.com/TanStack/ai/commit/c5ae4152d0a040bb6ce7321e16b7ee66d3c36f96), [`13ba1b0`](https://github.com/TanStack/ai/commit/13ba1b0e47dc822f10f6c5133184f92c2eb0a013), [`377262c`](https://github.com/TanStack/ai/commit/377262c0b4e5f59f8fd467a831b9341cc705077e)]:
  - @tanstack/ai@0.67.0

## 0.1.16

### Patch Changes

- Updated dependencies [[`f687c54`](https://github.com/TanStack/ai/commit/f687c54ae4b8a67f2154ff9dea0319b8d2712856), [`fb55bcb`](https://github.com/TanStack/ai/commit/fb55bcba5193d4465f43006505918a2dc4472ec4), [`630ec86`](https://github.com/TanStack/ai/commit/630ec86e9997fabe046cae1a491060d72cbc71ea)]:
  - @tanstack/ai@0.66.0

## 0.1.15

### Patch Changes

- Updated dependencies [[`7b6b1a9`](https://github.com/TanStack/ai/commit/7b6b1a99d45e40165f0a1f833a04e793a09275de), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`592c72c`](https://github.com/TanStack/ai/commit/592c72c2aa2cc3ea40942d96095170b3b4cbbd66), [`82291b2`](https://github.com/TanStack/ai/commit/82291b22941d2c813ff0050fc9d41b024480153d), [`ff3a66e`](https://github.com/TanStack/ai/commit/ff3a66ed8f628d45b282316fab337d3ed19f34cd), [`560c76f`](https://github.com/TanStack/ai/commit/560c76fd638b5691e195e1d0619fee8a78d98c20), [`4b9dcb4`](https://github.com/TanStack/ai/commit/4b9dcb44d8fe1e7c933b79c23d8f072e7bc300f4), [`30254ad`](https://github.com/TanStack/ai/commit/30254ad70161894d232d3b45e3b21f45d49f336e), [`40fdd22`](https://github.com/TanStack/ai/commit/40fdd22ce05d55e71514b4cc80b1c28cefb4a431)]:
  - @tanstack/ai@0.65.0

## 0.1.14

### Patch Changes

- Updated dependencies [[`3a09cf0`](https://github.com/TanStack/ai/commit/3a09cf04431a45810051ea5df6bb3935af421ddb), [`ee726f5`](https://github.com/TanStack/ai/commit/ee726f537dbb036d5edb756b92739afaa7573824), [`a5fce7f`](https://github.com/TanStack/ai/commit/a5fce7f95b8b9c6eb57697aa1e3f587bf27483b9), [`94116ad`](https://github.com/TanStack/ai/commit/94116ad137015b6f62fe62b4c06a335dbde36a49)]:
  - @tanstack/ai@0.64.0

## 0.1.13

### Patch Changes

- Updated dependencies [[`37b2826`](https://github.com/TanStack/ai/commit/37b282655ea9c780e9793ef33013d64b1bf88625), [`8e8ee26`](https://github.com/TanStack/ai/commit/8e8ee26959a471bb6fac180ded3a9a048ae93609), [`c5c1996`](https://github.com/TanStack/ai/commit/c5c19961b8c98497fd88ae93c5d6330d7b2ecb6a), [`3e30cde`](https://github.com/TanStack/ai/commit/3e30cde8ae7f5be7be3bc9c4f30c842159fc7edf), [`0eb8f0b`](https://github.com/TanStack/ai/commit/0eb8f0b7f4ffa0133a814f8fcfccbc1acedd7488), [`f44b6b2`](https://github.com/TanStack/ai/commit/f44b6b22578b893501e05612f02ea1aaee0951d3), [`d632d41`](https://github.com/TanStack/ai/commit/d632d41df227bf11bc3cdbf5542823f87562b3d4)]:
  - @tanstack/ai@0.63.0

## 0.1.12

### Patch Changes

- Updated dependencies [[`a450d00`](https://github.com/TanStack/ai/commit/a450d007a039610994342dd9c3387f880a4eb992), [`c54e20c`](https://github.com/TanStack/ai/commit/c54e20cf5be8e1f73e0be661e242391fa0e4633e), [`a56192e`](https://github.com/TanStack/ai/commit/a56192eafa0da2ccca2d576dc4371b196355c605), [`740ae66`](https://github.com/TanStack/ai/commit/740ae6664d358f00deddf72319ef947fe3bb0935), [`5099a32`](https://github.com/TanStack/ai/commit/5099a32cbfb6c77e335769793415fe7e90bb17d8), [`820429f`](https://github.com/TanStack/ai/commit/820429fa9bea8ba220cf073406760475ac07b112), [`0abae97`](https://github.com/TanStack/ai/commit/0abae97f94fe4d37523f8a6427972ae7fe3b7fde), [`8c68c2d`](https://github.com/TanStack/ai/commit/8c68c2d9750bcc818201089bbbb7d90aa26d99a1)]:
  - @tanstack/ai@0.62.0

## 0.1.11

### Patch Changes

- [#1483](https://github.com/TanStack/ai/pull/1483) [`39bfc72`](https://github.com/TanStack/ai/commit/39bfc72ee7a46e084eb05b07b4e606dd5ae03344) - Add a package README: what `withSkills` does, the inline setup, catalog options, the four skill sources and their entry points, and the conformance suite for a custom source.

## 0.1.10

### Patch Changes

- Updated dependencies [[`54d39d3`](https://github.com/TanStack/ai/commit/54d39d30704bbdbdccea756af31530cc6713fc2e), [`2d047c5`](https://github.com/TanStack/ai/commit/2d047c5cf5f25c244c05f0cb0e816b9634616fbb), [`74b5823`](https://github.com/TanStack/ai/commit/74b582305471eaf37a3b68595e60ed1a6f42d914), [`abb0169`](https://github.com/TanStack/ai/commit/abb0169bf96c38f59791450ce060d089a7fcd26e), [`ed87986`](https://github.com/TanStack/ai/commit/ed87986069bcfe42a51cedf1365cc10662b0e088), [`a0f7c14`](https://github.com/TanStack/ai/commit/a0f7c14a9d9a4b2e72e87b976f46d193deb5921b)]:
  - @tanstack/ai@0.61.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`ef0a00f`](https://github.com/TanStack/ai/commit/ef0a00f09059abfd9e96eb1367e8ff0280458abd)]:
  - @tanstack/ai@0.60.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0), [`9ab4f76`](https://github.com/TanStack/ai/commit/9ab4f7691f39884eebe8153caa9653926ae12fd0)]:
  - @tanstack/ai@0.59.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`796f2b5`](https://github.com/TanStack/ai/commit/796f2b5f7c05debe251ad3ecd4073d8cd119b3db)]:
  - @tanstack/ai@0.58.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`04bfd8c`](https://github.com/TanStack/ai/commit/04bfd8c26ce337cca53f3f8d286f14ed0432a329), [`254ab5f`](https://github.com/TanStack/ai/commit/254ab5ff5b0a9ca945cb313588f4b56394c7ecf7)]:
  - @tanstack/ai@0.57.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`7c4b25e`](https://github.com/TanStack/ai/commit/7c4b25ebefc64e4f209c282788f515939eca02e9), [`f60f736`](https://github.com/TanStack/ai/commit/f60f73612dd7621e2f1ad76abb1a640307dea3c6)]:
  - @tanstack/ai@0.56.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`fa13446`](https://github.com/TanStack/ai/commit/fa13446fab9b9048de9433a5ebf55bc626f5fd74), [`0945a79`](https://github.com/TanStack/ai/commit/0945a79b0923b31a5122d0bf28c115879341a410)]:
  - @tanstack/ai@0.55.0

## 0.1.3

### Patch Changes

- [#1350](https://github.com/TanStack/ai/pull/1350) [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198) - docs(skills): type-check the code fences in every package skill with kiira and fix the ones that did not compile

- Updated dependencies [[`c17bc95`](https://github.com/TanStack/ai/commit/c17bc951ca783d8023bf54d69035c19c0c72ea2f), [`53e2ec0`](https://github.com/TanStack/ai/commit/53e2ec082b40d8c3fcd09f408c29f0b895436198), [`6269eff`](https://github.com/TanStack/ai/commit/6269eff90e770205ffd9cae8c5989b8ff02b57ce)]:
  - @tanstack/ai@0.54.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`21775ee`](https://github.com/TanStack/ai/commit/21775ee2d23dd594cdc184678ff587341bd74871)]:
  - @tanstack/ai@0.53.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`49fc54c`](https://github.com/TanStack/ai/commit/49fc54ca0aacf2fc60bb36647a61a23559dda4bc), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7), [`e04ff6a`](https://github.com/TanStack/ai/commit/e04ff6abcb86c5ede17cd8c1c96df82e9aae03d7)]:
  - @tanstack/ai@0.52.0

## 0.1.0

### Minor Changes

- [#1236](https://github.com/TanStack/ai/pull/1236) [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b) - Add `@tanstack/ai-skills`: portable Agent Skills (`SKILL.md`) as a first-class `chat()` middleware.

  `withSkills(sources, options?)` renders a skill catalog and a `load_skill` tool so any tool-calling model can load skills on demand, on any provider, with no server sandbox. Skills come from `inlineSkill`, `skillDirectory` (`/node`), or a build-time `staticSkills` bundle, and compose via `aggregate`/`dedupe`/`filter`/`cache`. `createResourceTool` exposes a skill's bundled files through `read_skill_resource`, and `runSkillSourceConformance` (`/testing`) validates custom `SkillSource` adapters. The catalog renders as `<available_skills>` XML for Anthropic models and markdown for others; portable and hosted (native) skills refuse to combine in one call.

  Core `@tanstack/ai` now exports `SkillLimitError`. The native factories throw it (or add validation): `codeExecutionTool` (`@tanstack/ai-anthropic`) frames its 8-skill cap, and `shellTool` (`@tanstack/openai-base`) now validates `skill_id` format instead of nothing. `@tanstack/ai-sandbox` reuses the shared skill-directory walk from `@tanstack/ai-skills`.

  `withSkills` sends a `skills:state` CUSTOM chunk so TanStack AI DevTools can show the catalog and which skills the model loaded.

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/ai@0.51.0
