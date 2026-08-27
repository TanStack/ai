---
'@tanstack/ai-skills': minor
'@tanstack/ai': minor
'@tanstack/ai-anthropic': patch
'@tanstack/openai-base': patch
'@tanstack/ai-sandbox': patch
'@tanstack/ai-client': patch
'@tanstack/ai-event-client': patch
'@tanstack/ai-devtools-core': patch
---

Add `@tanstack/ai-skills`: portable Agent Skills (`SKILL.md`) as a first-class `chat()` middleware.

`withSkills(sources, options?)` renders a skill catalog and a `load_skill` tool so any tool-calling model can load skills on demand, on any provider, with no server sandbox. Skills come from `inlineSkill`, `skillDirectory` (`/node`), or a build-time `staticSkills` bundle, and compose via `aggregate`/`dedupe`/`filter`/`cache`. `createResourceTool` exposes a skill's bundled files through `read_skill_resource`, and `runSkillSourceConformance` (`/testing`) validates custom `SkillSource` adapters. The catalog renders as `<available_skills>` XML for Anthropic models and markdown for others; portable and hosted (native) skills refuse to combine in one call.

Core `@tanstack/ai` now exports `SkillLimitError`. The native factories throw it (or add validation): `codeExecutionTool` (`@tanstack/ai-anthropic`) frames its 8-skill cap, and `shellTool` (`@tanstack/openai-base`) now validates `skill_id` format instead of nothing. `@tanstack/ai-sandbox` reuses the shared skill-directory walk from `@tanstack/ai-skills`.

`withSkills` sends a `skills:state` CUSTOM chunk so TanStack AI DevTools can show the catalog and which skills the model loaded.
