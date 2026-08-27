# @tanstack/ai-skills

## 0.1.0

### Minor Changes

- [#1236](https://github.com/TanStack/ai/pull/1236) [`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b) - Add `@tanstack/ai-skills`: portable Agent Skills (`SKILL.md`) as a first-class `chat()` middleware.

  `withSkills(sources, options?)` renders a skill catalog and a `load_skill` tool so any tool-calling model can load skills on demand, on any provider, with no server sandbox. Skills come from `inlineSkill`, `skillDirectory` (`/node`), or a build-time `staticSkills` bundle, and compose via `aggregate`/`dedupe`/`filter`/`cache`. `createResourceTool` exposes a skill's bundled files through `read_skill_resource`, and `runSkillSourceConformance` (`/testing`) validates custom `SkillSource` adapters. The catalog renders as `<available_skills>` XML for Anthropic models and markdown for others; portable and hosted (native) skills refuse to combine in one call.

  Core `@tanstack/ai` now exports `SkillLimitError`. The native factories throw it (or add validation): `codeExecutionTool` (`@tanstack/ai-anthropic`) frames its 8-skill cap, and `shellTool` (`@tanstack/openai-base`) now validates `skill_id` format instead of nothing. `@tanstack/ai-sandbox` reuses the shared skill-directory walk from `@tanstack/ai-skills`.

  `withSkills` sends a `skills:state` CUSTOM chunk so TanStack AI DevTools can show the catalog and which skills the model loaded.

### Patch Changes

- Updated dependencies [[`5dc4e1a`](https://github.com/TanStack/ai/commit/5dc4e1a08728b410f85956093ccef621d12b4d6b), [`a7e0798`](https://github.com/TanStack/ai/commit/a7e079872af372496728d25e6ec23149cd5e04b9), [`6a083bf`](https://github.com/TanStack/ai/commit/6a083bfcfaa4fd0c83368c4d10067e5c2298e22c)]:
  - @tanstack/ai@0.51.0
