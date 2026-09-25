# @tanstack/ai-skills

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
