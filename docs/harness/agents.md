---
title: Switch between agent profiles
id: harness-agents
order: 10
description: "Give one harness several agents, such as a read-only planner and a builder. Each profile has its own prompt, tools, model, rules, and step limit, in code or in Markdown files."
keywords:
  - tanstack ai
  - harness
  - agents
  - agent profiles
  - plan
  - subagents
---

Your agent has two jobs. First it must plan a change without touching a file. Then it must build the change with every tool. The main model also needs a fast helper that searches the code. `agents()` gives the harness named agent profiles. Each profile has its own system prompt, tools, model, permission rules, and step limit.

## 1. Add the plugin

```ts group=harness-agents
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { agents } from '@tanstack/ai-harness/plugins/node'
import { anthropicText } from '@tanstack/ai-anthropic'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'

const root = process.cwd()
const sonnet = anthropicText('claude-sonnet-5-5')

const readTool = toolDefinition({
  name: 'read_file',
  description: 'Read a file in the project',
  inputSchema: z.object({ path: z.string() }),
}).server(({ path }) => readFile(resolve(root, path), 'utf8'))

const writeTool = toolDefinition({
  name: 'write_file',
  description: 'Write a file in the project',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
}).server(async ({ path, content }) => {
  await writeFile(resolve(root, path), content)
  return `Wrote ${path}.`
})

const coder = defineHarness({
  name: 'acme/coder',
  adapter: sonnet,
  tools: [readTool, writeTool],
  plugins: () => [
    permissions({ root, rules: [{ tool: 'write_file', decision: 'ask', kind: 'edit' }] }),
    agents({ adapter: () => sonnet }),
  ],
})
```

`adapter` turns a model id into an adapter. Here every agent uses the same model.

## 2. Plan, then build

```ts group=harness-agents
const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(coder, { threadId: 'dark-mode' })

await session.runCommand({ name: 'agent', input: 'plan' })
const plan = await session.send('How do I add a dark mode?')
console.log(plan.text)

await session.runCommand({ name: 'agent', input: 'build' })
await session.send('Do step 1.')
```

1. The `plan` agent reads the code and gives numbered steps. It has no tool that changes a file.
2. The `build` agent changes the files, after your answer to each [permission question](./permissions).

- `session.runCommand({ name: 'agent' })` with no input shows the current agent and the list: `Agent: build. Agents: build, plan.`
- A switch applies at the next turn.

The same switch is the `agent` setting. `session.describe().config` lists its options for a menu:

```ts group=harness-agents
const setting = session.describe().config.find((entry) => entry.key === 'agent')
if (setting?.option.type === 'select') {
  console.log(setting.value, setting.option.options) // 'build' ['build', 'plan']
}

await session.setPluginSetting({ key: 'agent', value: 'plan' })
```

A client can change the setting only when the harness exposes it. Add `expose: { config: ['agent'] }` to `defineHarness`.

## The built-in agents

| Agent | Mode | Tools | What it does |
| --- | --- | --- | --- |
| `build` | `primary`, the default | Every tool | Reads code, changes files, and runs commands. |
| `plan` | `primary` | The read tools and `todo_write` | Reads the code and gives a plan in numbered steps. |
| `general` | `subagent` | Every tool | Does a task in many steps and reports back. |
| `explore` | `subagent` | The read tools | Searches the code and reports the paths that it finds. |

The read tools are `read_file`, `list_files`, `grep`, `webfetch`, `websearch`, and `question`. An agent gets only the tools that the harness has.

The mode of a profile says who starts it:

- `primary`: it answers the user's turns. Pick it with the `agent` command or setting.
- `subagent`: the main model starts it as a child.
- `all`: both.

The `plan` agent and the `plan` mode of [permissions](./permissions#pick-a-mode) are separate. The agent has only the read tools and `todo_write`. The mode denies edits and commands for every agent. To drop the built-in agents, set `builtIns: false`.

## Add your own agent

Give `agents()` a profile. This one reviews the changes with a stronger model:

```ts group=harness-agents
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AgentProfile } from '@tanstack/ai-harness/plugins/node'

const review: AgentProfile = {
  name: 'review',
  description: 'Reviews the changes and lists the risks. Does not change files.',
  mode: 'all',
  model: 'claude-opus-5-5',
  system: 'You review code. Read the diff, then list each risk with its file and line.',
  tools: ['read_file', 'bash'],
  permissions: [{ tool: 'bash', resource: 'git diff*', decision: 'allow' }],
  steps: 20,
}

const models: Record<string, AnyTextAdapter> = {
  'claude-opus-5-5': anthropicText('claude-opus-5-5'),
}

export const withReview = agents({
  adapter: (model) => models[model] ?? sonnet,
  agents: [review],
})
```

`name`, `description`, and `mode` are required. The other fields:

| Field | What it does |
| --- | --- |
| `model` | A model id. `adapter` turns it into an adapter. Without it, a primary agent keeps the harness model, and a subagent uses the model of the turn that started it. |
| `system` | Text for the system prompt of each turn of this agent. |
| `tools` | The tools that this agent can call, by name. A `*` matches any text, for example `todo_*`. Without it, the agent gets every tool. |
| `permissions` | [Permission rules](./permissions#write-rules) that count while this agent is the primary agent. At that time, they also apply in each subagent run. |
| `steps` | The step limit. See [Limit the steps](#limit-the-steps). |
| `hidden` | `true` leaves the agent out of the `agent` command and setting. The model can still start it as a subagent. |

- A profile replaces an earlier profile with the same name. The order is the built-in agents, then `dirs`, then `agents`. So a profile named `plan` replaces the built-in `plan`.
- `default` names the primary agent of a new session. Without it, the first primary agent is the default, which is `build`.
- In the main turn, a model that the thread stored with `session.configure` wins over the profile `model`. See [What wins](./thread-settings#what-wins).
- A `tools` list also filters the subagent tools. To let the agent start subagents, add their tool names, for example `explore`.

## Load agents from Markdown files

Keep your agents next to your code as Markdown files. Save this file as `.agents/agents/review.md`:

```md
---
description: Reviews the changes and lists the risks. Does not change files.
mode: all
model: claude-opus-5-5
tools: [read_file]
steps: 20
---

You review code. Read the diff, then list each risk with its file and line.
```

Then give `agents()` the folder:

```ts group=harness-agents
export const fromFiles = agents({
  adapter: (model) => models[model] ?? sonnet,
  dirs: [`${root}/.agents/agents`],
})
```

- The file name is the agent name, here `review`.
- The body is the system prompt.
- The frontmatter sets `description`, `mode`, `model`, `tools`, `steps`, and `hidden: true`. The default `mode` is `all`.
- An unknown `mode`, or a `steps` that is not a whole number, stops `host.open` with an error, for example `Agent file review.md: "mode" is not valid.`
- The plugin reads the folder when a session opens, and again at each `session.reloadPlugins()`. A folder that it cannot read gives no agents.

## Limit the steps

An agent can call tools for a long time. `steps` sets the most model calls with tools in one run. With `steps: 20`:

1. The agent makes up to 20 model calls with tools.
2. Call 21 gets `toolChoice: 'none'` and a note: answer now, and say what is left to do.
3. Then the run stops.

The limit counts again in each turn of a primary agent and in each run of a subagent.

Some providers do not obey `'none'`. On Amazon Bedrock, `'none'` after a tool call goes to the model as `auto`. See [Provider notes](../tools/tools#provider-notes). If the model calls a tool on the last call anyway:

- The tool does not run.
- The model gets this tool result: `{ "error": "Step limit reached. Answer without calling tools." }`
- The run stops. That turn can end with no text answer.

## Let the model start a subagent

A profile with the mode `subagent` or `all` is also a subagent. The main model gets a tool for each one, with the name of the agent, for example `explore`. Ask the build agent: `use explore to find where the theme is set`.

A subagent run gets these parts of its profile:

- The tools of the turn that started it, filtered by its `tools`.
- Its `system` prompt.
- Its `model`, or the model of the turn that started it.
- Its step limit.

A subagent run stops after 50 model calls, or when an answer is cut at the output limit. The harness also limits the depth and the number of children. See [Stay within limits](./subagents#stay-within-limits). To give one run from code its own budget and time limit, see [Give one run a budget and a time limit](./subagents#give-one-run-a-budget-and-a-time-limit).

## Known limits

- A subagent run uses the `permissions` of the primary agent, not the rules of its own profile. For example, when `build` is the primary agent and starts `review`, the `build` rules apply and the `review` rules do not. Put rules that must hold in every run in `permissions({ rules })`. See [Rules in subagents](./permissions#rules-in-subagents).
- A Markdown agent cannot set `permissions`. Put those rules in a profile in code.
- On Amazon Bedrock, the model can still call a tool on the last call. The tool does not run, but the turn can end with no text answer.
- A subagent run gets the tools and the model of its turn from the memory of the host that ran that turn. On another host, or after a restart, the run fails with `Agent <name> cannot go on here`. Start it again from a turn.
- A subagent run that your code starts, not a turn, has no tools of a turn. Give its profile a `model`.

## What you have now

- A read-only `plan` agent, and a `build` agent to do the work.
- Your own agents in code or in Markdown files, each with its own prompt, tools, model, and rules.
- A step limit that ends a run with a text answer.
- Subagents that the main model starts to search and to research.
