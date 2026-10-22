---
title: Provider Skills
id: provider-skills
order: 3
description: "Load hosted skills of Anthropic or OpenAI into the code sandbox of the provider, so the model can make documents and run special environments. Attach them to the code execution or shell tool."
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

A provider skill is a hosted skill, such as a PowerPoint skill, that Anthropic or OpenAI runs in its own sandbox.

Attach the skill IDs to the execution tool of the provider. The provider installs the skills and runs them. You only give the IDs.

- **Anthropic**: attach skills to `codeExecutionTool` from `@tanstack/ai-anthropic/tools`.
- **OpenAI**: put skills inside `shellTool` from `@tanstack/ai-openai/tools`. This needs the Responses API.

A skill does nothing without its execution tool. The tool starts the sandbox, and the skills run inside it.

## Portable vs hosted skills

TanStack AI has two kinds of skills. Pick the one that fits:

- **Portable skills** ([`withSkills`](../skills/agent-skills)) show a catalog and let the model call `load_skill`. They work on any model that can call tools. They need no sandbox on the server, and they read `SKILL.md` from a folder, a bundle, or your own store. Start with these.
- **Hosted skills** (this page) run in the sandbox of the provider, by ID. They work with one provider only, and they need an execution tool. The provider runs them.

If you need the sandbox of the provider, for example to run code or make files, use hosted skills. For everything else, use portable skills.

Use only one kind in a `chat()` call. If you attach hosted skills to a `code_execution` or `shell` tool and also add `withSkills`, the middleware throws. The reason: the model gets two catalogs and two protocols.

## Anthropic: skills on `codeExecutionTool`

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

### 2. Add `codeExecutionTool` with skills

Import `codeExecutionTool` from `@tanstack/ai-anthropic/tools`, not from the root of the adapter. Pass a `skills` array as the second argument:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { codeExecutionTool } from '@tanstack/ai-anthropic/tools'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: anthropicText('claude-opus-5-5'),
    messages,
    threadId,
    runId,
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

### 3. Try it

Ask your chat "Make a three-slide deck about our Q3 results." The model loads the `pptx` skill and makes the file in the sandbox of Anthropic.

The adapter does the setup for you:

- It moves your skills into the top-level `container.skills` parameter of the request. The Anthropic API wants them there.
- It adds the `code-execution-2025-08-25` beta header. When skills are present, it also adds the `skills-2025-10-02` beta header.

You do not set beta headers yourself.

### Skill shape

Each item in the `skills` array is an `AnthropicContainerSkill`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'anthropic' \| 'custom'` | yes | `'anthropic'` for skills that Anthropic hosts. `'custom'` for your own bundles. |
| `skill_id` | `string` | yes | 1 to 64 characters. |
| `version` | `string` | no | A version string, or `'latest'`. The default is `'latest'`. |

You can attach at most 8 skills to a request. If you pass more, or a `skill_id` that is not valid, the factory throws when you call it.

## OpenAI: skills in `shellTool` (Responses API only)

The OpenAI `shellTool` takes an `environment` object, and that object can hold a `skills` array. This works only with the Responses API. The Chat Completions API does not support the shell tool.

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

### 2. Add `shellTool` with skills

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { shellTool } from '@tanstack/ai-openai/tools'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
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

Replace `skill_abc` with the ID of your skill.

### Skill shape

Each item in the `skills` array is a `SkillReference`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `'skill_reference'` | yes | Always `'skill_reference'` for OpenAI. |
| `skill_id` | `string` | yes | The skill ID that OpenAI gives you. |
| `version` | `string` | no | A positive integer as a string (for example `'2'`), or `'latest'`. |

`version` is a string, not a number.

## Advanced

### What these factories support

The factories wire only hosted skills that you reference by ID:

- Anthropic: `type: 'anthropic'` or `type: 'custom'`.
- OpenAI: `type: 'skill_reference'`.

`codeExecutionTool` and `shellTool` do not handle inline bundles, local paths, or skill creation through the upload API.

### Related pages

- [Portable Agent Skills](../skills/agent-skills): a catalog plus `load_skill`, on any model that can call tools.
- [Provider Tools](./provider-tools.md): all native provider tools, and the type guard that stops a tool on a model that does not support it.
- [Anthropic: Advanced, `codeExecutionTool`](../adapters/anthropic-advanced.md#codeexecutiontool)
- [OpenAI: Advanced, `shellTool`](../adapters/openai-advanced.md#shelltool)

### Upgrade from 0.x

`modelOptions.container.skills` is not in 1.0. Pass skills to `codeExecutionTool(config, { skills })`.
