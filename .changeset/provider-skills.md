---
'@tanstack/ai-anthropic': minor
'@tanstack/ai-openai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
---

feat: attach hosted provider Skills to code-execution / shell tools

Hosted, provider-managed Agent Skills can now be attached to the server-side execution tool that runs them:

- **Anthropic** — `codeExecutionTool(config, { skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }] })`. The adapter lifts the skills into the request's top-level `container.skills` and automatically attaches the required beta headers (`code-execution-2025-08-25` — or `code-execution-2025-05-22` for the legacy `code_execution_20250522` variant — plus `skills-2025-10-02`).
- **OpenAI** — `shellTool({ environment: { type: 'container_auto', skills: [{ type: 'skill_reference', skill_id: '...', version: '2' }] } })`, threaded through the Responses API shell tool.

Scope: hosted/managed skills referenced by id + version. Skills are inert without the execution tool that runs them.

Setting skills via Anthropic's `modelOptions.container.skills` is deprecated in favor of `codeExecutionTool(config, { skills })`.

Bumps the `openai` SDK to `^6.41.0` (required for the typed shell `environment.skills` surface).
