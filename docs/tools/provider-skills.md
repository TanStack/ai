---
title: Provider Skills
id: provider-skills
order: 3
description: "Attach hosted Anthropic/OpenAI skills to codeExecutionTool or shellTool."
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

If you need a provider-hosted skill (docs, specialised env) → attach it to the execution tool. Provider installs and runs it in their sandbox.

> Not `@tanstack/ai-code-mode-skills` (local TS). These run on provider infrastructure only.

Skills are **inert without an execution tool**:

| Provider | Attach to |
| --- | --- |
| Anthropic | `codeExecutionTool` (`@tanstack/ai-anthropic/tools`) |
| OpenAI | `shellTool` (`@tanstack/ai-openai/tools`) — Responses API only |

## Anthropic: `codeExecutionTool`

### 1. Install

```bash
npm install @tanstack/ai-anthropic
```

### 2. Add tool + skills

Import from `/tools`. Pass `skills` as the second argument:

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

Adapter automatically:

1. Lifts skills into top-level `container.skills`
2. Attaches beta headers (`code-execution-2025-08-25`, plus `skills-2025-10-02` when skills present)

Do not set beta headers yourself.

### Skill shape (`AnthropicContainerSkill`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'anthropic' \| 'custom'` | yes | Hosted vs your bundles |
| `skill_id` | `string` | yes | 1–64 chars |
| `version` | `string` | no | Version string or `'latest'` (default) |

Max 8 skills per request — factory throws if exceeded or `skill_id` invalid.

> **Deprecated:** `modelOptions.container.skills` — use `codeExecutionTool(config, { skills })` instead (legacy path skips beta-header wiring).

## OpenAI: `shellTool` (Responses API only)

Chat Completions does not support the shell tool.

### 1. Install

```bash
npm install @tanstack/ai-openai
```

### 2. Add tool + skills

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

### Skill shape (`SkillReference`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'skill_reference'` | yes | Always this literal |
| `skill_id` | `string` | yes | OpenAI skill id |
| `version` | `string` | no | e.g. `'2'` or `'latest'` (string, not number) |

## Scope

Only **hosted, managed-by-id** skills:

- Anthropic: `type: 'anthropic'` or `type: 'custom'`
- OpenAI: `type: 'skill_reference'`

Inline bundles, local paths, and upload-API skill creation are not handled.

## Related

- [Provider Tools](./provider-tools.md)
- [Anthropic → `codeExecutionTool`](../adapters/anthropic.md#codeexecutiontool)
- [OpenAI → `shellTool`](../adapters/openai.md#shelltool)
