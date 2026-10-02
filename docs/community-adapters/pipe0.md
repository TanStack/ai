---
title: pipe0
id: pipe0-adapter
order: 3
description: "Give TanStack AI chats server tools to find people and enrich them with work emails, phone numbers, profiles, and company data using pipe0."
keywords:
  - tanstack ai
  - pipe0
  - tools
  - server tools
  - people search
  - data enrichment
  - email finder
  - community adapter
---

[`@pipe0/tanstack-ai`](https://github.com/pipe-0/pipe0/tree/main/packages/tanstack-ai) gives your
`chat()` calls three [server tools](../tools/server-tools) backed by [pipe0](https://www.pipe0.com),
a data enrichment API. One tool searches for people, and two enrich people and companies. Each
enrichment tries several data providers in order and stops at the first match, so one pipe0 API key
covers all of them.

| Tool | What it does |
| --- | --- |
| `find_people` | Searches for people by job title, employer, seniority, job function, company size, and location. |
| `enrich_person` | Finds a work email, mobile number, and profile from a LinkedIn URL, an email, or a name and company domain. |
| `enrich_company` | Returns firmographics for a company domain: description, industry, headcount, revenue, and founding year. |

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @pipe0/tanstack-ai @tanstack/ai zod
vue: @pipe0/tanstack-ai @tanstack/ai zod
solid: @pipe0/tanstack-ai @tanstack/ai zod
svelte: @pipe0/tanstack-ai @tanstack/ai zod
preact: @pipe0/tanstack-ai @tanstack/ai zod
angular: @pipe0/tanstack-ai @tanstack/ai zod
vanilla: @pipe0/tanstack-ai @tanstack/ai zod
octane: @pipe0/tanstack-ai @tanstack/ai zod

<!-- ::end:tabs -->

## Authentication

The tools read your pipe0 API key from `PIPE0_API_KEY`. Create one in the
[pipe0 dashboard](https://app.pipe0.com).

```bash
PIPE0_API_KEY=your-api-key
```

To pass the key in code instead, use the `apiKey` option.

## Basic Usage

`pipe0Tools()` returns all three tools. Pass them to `chat()` in your server route:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { pipe0Tools } from "@pipe0/tanstack-ai";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openaiText("gpt-5.5"),
    messages,
    tools: pipe0Tools(),
  });

  return toServerSentEventsResponse(stream);
}
```

Asked to "find the CTO of Linear and get their work email", the model calls `find_people`, then
passes the LinkedIn URL it found to `enrich_person`. When a search returns no one, the tool result
tells the model which filter to drop, so it can widen the search and try again.

To use only some tools, create them one by one:

```typescript
import { enrichCompany, enrichPerson } from "@pipe0/tanstack-ai";

const tools = [enrichPerson(), enrichCompany()];
```

## Tool Approval

Searches and enrichments spend pipe0 credits. To pause the run until the user approves a call, set
`needsApproval` on the tools that need it. See [Tool Approval Flow](../tools/tool-approval) for the
client side.

```typescript
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { enrichPerson, findPeople } from "@pipe0/tanstack-ai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Get the work email of the CTO of Linear." }],
  tools: [findPeople(), enrichPerson({ needsApproval: true })],
});
```

## Configuration

Every tool and `pipe0Tools()` take the same options:

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | pipe0 API key. Defaults to `process.env.PIPE0_API_KEY`. |
| `environment` | `"production" \| "sandbox"` | `sandbox` returns free placeholder data for development. Defaults to `production`. |
| `needsApproval` | `boolean` | Pauses the run for user approval before the tool executes. Defaults to `false`. |
| `client` | `Pipe0` | A configured client from [`@pipe0/client`](https://www.npmjs.com/package/@pipe0/client). |

Keep `PIPE0_API_KEY` on the server. `find_people` and `enrich_person` return personal contact data,
so only show results to users who are allowed to see them.

## Next Steps

- [pipe0 TanStack AI docs](https://www.pipe0.com/docs/sdks/integrations/tanstack-ai)
- [Server Tools](../tools/server-tools)
- [Tool Approval Flow](../tools/tool-approval)
