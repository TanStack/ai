---
title: Provider Skills
id: provider-skills
order: 3
description: "Attach hosted, provider-managed skills to code execution and shell tools in TanStack AI so the model can produce documents, run specialised environments, and more."
keywords:
  - tanstack ai
  - provider skills
  - anthropic skills
  - openai skills
  - code execution skills
  - shell tool skills
  - hosted skills
  - container skills
---

Provider Skills are hosted, provider-managed capability bundles that the model
loads on demand and runs inside the provider's server-side sandbox. You
reference them by a skill ID; the provider handles installation and execution.

> **Not to be confused with `@tanstack/ai-code-mode-snippets`**, whose snippets
> are TypeScript functions your application generates and runs in its own Code Mode sandbox (a local JS isolate). Provider
> Skills run entirely on the provider's infrastructure.

Skills are **inert without an execution tool**. The execution tool activates the
sandbox; skills are additional bundles that run inside it:

- **Anthropic**: skills attach to `codeExecutionTool` (`@tanstack/ai-anthropic/tools`).
- **OpenAI**: skills nest inside `shellTool` (`@tanstack/ai-openai/tools`) and
  require the Responses API.

You already have a `chat()` call working. By the end of this page you will have
attached a hosted skill to the right execution tool, with the provider handling
the rest.

---

## Portable vs hosted skills

There are two ways to give a model skills in TanStack AI, and they solve
different problems:

- **Portable skills** ([`withSkills`](../skills/agent-skills)) render a catalog
  and let the model call `load_skill`. They run on any tool-calling model, need
  no server sandbox, and read `SKILL.md` from a folder, a bundle, or your own
  store. Reach for these first.
- **Hosted (provider) skills**, this page, run inside the provider's server-side
  sandbox and are referenced by ID. They are non-portable and require an
  execution tool, but the provider does the running.

Use hosted skills when you need the provider's sandbox (running code, producing
files). Use portable skills for everything else.

The two do not mix in one `chat()` call. If you attach hosted skills to a
`code_execution` or `shell` tool and also add `withSkills`, the middleware
throws: the model would see two catalogs and two protocols. Pick one delivery
mode per call.

---

## Anthropic: skills via `codeExecutionTool`

### 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-anthropic
vue: @tanstack/ai-anthropic
solid: @tanstack/ai-anthropic
svelte: @tanstack/ai-anthropic
preact: @tanstack/ai-anthropic
angular: @tanstack/ai-anthropic
vanilla: @tanstack/ai-anthropic
octane: @tanstack/ai-anthropic

<!-- ::end:tabs -->

### 2. Add the `codeExecutionTool` with skills

Import `codeExecutionTool` from `@tanstack/ai-anthropic/tools`, not from the
adapter root. Pass a `skills` array as the second argument.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { codeExecutionTool } from '@tanstack/ai-anthropic/tools'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: anthropicText('claude-sonnet-4-5'),
    messages,
    tools: [
      codeExecutionTool(
        { type: 'code_execution_20250825', name: 'code_execution' },
        {
          skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }],
        },
      ),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

The adapter automatically:

- Lifts your skills into the request's top-level `container.skills` parameter
  (the shape Anthropic's API requires).
- Attaches the `code-execution-2025-08-25` beta header, plus the
  `skills-2025-10-02` beta header when skills are present.

You do not set beta headers manually.

### Skill shape

Each entry in the `skills` array is an `AnthropicContainerSkill`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'anthropic' \| 'custom'` | yes | `'anthropic'` for Anthropic-hosted skills; `'custom'` for your own bundles. |
| `skill_id` | `string` | yes | 1–64 characters. |
| `version` | `string` | no | Specific version string, or `'latest'` (default when omitted). |

Up to 8 skills per request. The factory throws at call time if you exceed this
or supply an invalid `skill_id`.

### Deprecation notice

Setting skills via `modelOptions.container.skills` is deprecated. Use
`codeExecutionTool(config, { skills })` instead — the legacy path bypasses the
automatic beta-header wiring.

---

## OpenAI: skills via `shellTool` (Responses API only)

The OpenAI `shellTool` accepts an `environment` object that can carry a
`skills` array. This is **Responses API only**; the Chat Completions API does
not support the shell tool.

### 1. Install the package

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

### 2. Add the `shellTool` with skills

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { shellTool } from '@tanstack/ai-openai/tools'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: openaiText('gpt-5.2'),
    messages,
    tools: [
      shellTool({
        environment: {
          type: 'container_auto',
          skills: [
            { type: 'skill_reference', skill_id: 'skill_abc', version: '2' },
          ],
        },
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

### Skill shape

Each entry in the `skills` array is a `SkillReference`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'skill_reference'` | yes | Always `'skill_reference'` for OpenAI. |
| `skill_id` | `string` | yes | The skill identifier provided by OpenAI. |
| `version` | `string` | no | A positive integer as a string (e.g. `'2'`) or `'latest'`. |

Note: `version` is a string, not a number.

---

## Scope

Only **hosted, managed-by-id** skills are wired by these factories:

- Anthropic: `type: 'anthropic'` or `type: 'custom'`
- OpenAI: `type: 'skill_reference'`

Inline bundles, local-path references, and upload-API skill creation are not
handled by `codeExecutionTool` or `shellTool`.

---

## Related pages

- [Portable Agent Skills](../skills/agent-skills) — the provider-agnostic
  alternative: a catalog plus `load_skill`, on any tool-calling model.
- [Provider Tools](./provider-tools.md) — all native provider tools and the
  type-level guard that prevents pairing a tool with an unsupported model.
- [Anthropic adapter → `codeExecutionTool`](../adapters/anthropic.md#codeexecutiontool)
- [OpenAI adapter → `shellTool`](../adapters/openai.md#shelltool)
