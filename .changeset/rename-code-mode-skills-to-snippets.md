---
'@tanstack/ai-code-mode-snippets': minor
'@tanstack/ai-code-mode': minor
'@tanstack/ai': minor
---

Rename Code Mode "skills" to "snippets" to disambiguate them from agent skills (the `SKILL.md` packaging system).

**Breaking — package rename.** `@tanstack/ai-code-mode-skills` is now published as **`@tanstack/ai-code-mode-snippets`**. Update your dependency and imports. The `/storage` subpath is unchanged.

**Breaking — API rename.** Every `Skill`/`skill` identifier in the package public API becomes `Snippet`/`snippet`, for example:

- `codeModeWithSkills()` → `codeModeWithSnippets()`
- `skillsToTools()` / `skillToTool()` → `snippetsToTools()` / `snippetToTool()`
- `skillsToBindings()` / `skillsToSimpleBindings()` → `snippetsToBindings()` / `snippetsToSimpleBindings()`
- `selectRelevantSkills()` → `selectRelevantSnippets()`
- `createSkillManagementTools()` → `createSnippetManagementTools()`
- `createSkillsSystemPrompt()` → `createSnippetsSystemPrompt()`
- `generateSkillTypes()` → `generateSnippetTypes()`
- `createFileSkillStorage()` / `createMemorySkillStorage()` → `createFileSnippetStorage()` / `createMemorySnippetStorage()`
- Types: `Skill`, `SkillStorage`, `SkillIndexEntry`, `SkillStats`, `SkillBinding`, `SkillsConfig`, `CodeModeWithSkillsOptions`/`Result` → the `Snippet…` equivalents
- Options: `skills` → `snippets`, `skillsAsTools` → `snippetsAsTools`, `maxSkillsInContext` → `maxSnippetsInContext`
- Runtime tools: `search_skills` / `get_skill` / `register_skill` → `search_snippets` / `get_snippet` / `register_snippet`
- Sandbox bindings are now exposed with the `snippet_` prefix (was `skill_`)

**Breaking — sandbox hook (`@tanstack/ai-code-mode`).** The `createCodeModeTool` config option `getSkillBindings` is renamed to **`getSnippetBindings`** (same signature — an optional `() => Promise<Record<string, ToolBinding>>` returning dynamic bindings merged at execution time).

**Breaking — wire contract (`@tanstack/ai`).** The Code Mode custom events are renamed: `code_mode:skill_call` / `_result` / `_error` → `code_mode:snippet_*` (payload field `skill` → `snippet`), and `skill:registered` → `snippet:registered`. The exported event types `CodeModeSkillCallEvent` / `CodeModeSkillResultEvent` / `CodeModeSkillErrorEvent` / `SkillRegisteredEvent` are renamed to their `Snippet` equivalents.
