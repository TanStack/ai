---
title: Write a harness plugin
id: harness-plugins
order: 5
description: "Package tools, prompts, middleware, settings, commands, and state as a plugin that any harness can load."
keywords:
  - tanstack ai
  - harness
  - plugins
  - definePlugin
  - extension points
---

You built a feature for one harness, a todo list or a GitHub integration, and now you want it in every harness you ship. A plugin packages it: tools and prompts for the model, commands for the user, settings, and state that survives restarts.

## The smallest plugin

```ts group=harness-plugins
import { definePlugin } from '@tanstack/ai-harness'

export const today = definePlugin({
  name: 'acme/today',
  setup: () => ({ prompts: [`Today is ${new Date().toDateString()}.`] }),
})
```

Add it with `plugins: () => [today]` in `defineHarness`. `setup` runs once per session. To share one setup between all the sessions of a host, see [Share one setup between sessions](#share-one-setup-between-sessions).

## What `setup` can return

For the model:

- `tools`: tools for the model, made with `toolDefinition`.
- `prompts`: text for the system prompt. A function runs for each turn, so it can show current state. For text that changes often, see [Put changing text last](#put-changing-text-last).
- `middleware`: chat middleware for the lead turn, the same type as `chat({ middleware })`. `agentMiddleware` is for agent runs, see [Middleware in every agent](#middleware-in-every-agent).
- `generationMiddleware`: middleware for the activities agents call.
- `adapter`: a picker for the model of each turn, see [Pick the model of a turn](#pick-the-model-of-a-turn).

For agents and users:

- `agents`: agents added to `session.agents`. `routing.router` can send a turn to them too, see [Route a turn to an agent](./subagents#route-a-turn-to-an-agent).
- `subagents`: agents the model can call as tools. They are also added to `session.agents`.
- `commands`: user actions, see below.
- `config`: session settings, see below.
- `contribute`: items for another plugin's extension point.

If two plugins add the same tool, command, setting, or prompt id, `host.open` fails and names both plugins.

Return these from `setup`, not from the top level of `definePlugin`. A key like `adapter` or `tools` at the top level is a type error, and `definePlugin` throws for it. Other keys at the top level stay on the plugin object, so a plugin can give your code its own functions.

### Put changing text last

Set `placement: 'context'` on a prompt whose text changes often:

```ts group=harness-plugins
let openTickets = 0

export const tickets = definePlugin({
  name: 'acme/tickets',
  setup: () => ({
    prompts: [
      {
        id: 'acme/tickets:count',
        text: () => `Open tickets: ${openTickets}.`,
        placement: 'context',
      },
    ],
  }),
})
```

A provider caches the start of each request: the system prompts, then the history. A change of a system prompt makes the cache miss from that prompt on. A `'context'` prompt is the last system prompt, so the system prompts before it stay in the cache.

- The model gets all `'context'` text as one system prompt, after the other system prompts. The harness makes it again at each model call.
- The text has the authority of a system prompt, not of a user message.
- The default is `'system'`: the text goes in the system prompts, in plugin order.
- The log does not keep `'context'` text.
- The first-party todos, goal, and plan mode prompts use `'context'`.

### Refresh state at the start of a turn

A prompt function must return at once, so it cannot read a file or call a server. Do that work in `onTurnStart`. The harness calls it once at the start of each turn, before it reads the prompts:

```ts group=harness-plugins
import { readFile } from 'node:fs/promises'

let rules = ''

export const projectRules = definePlugin({
  name: 'acme/project-rules',
  setup: () => ({
    onTurnStart: async () => {
      rules = await readFile('RULES.md', 'utf8')
    },
    prompts: [() => rules],
  }),
})
```

- `onTurnStart` gets the turn. `turn.run` has the user of the turn and the credentials of that user.
- It runs one time for each turn, also when the turn makes many model calls.
- If it throws, the turn continues, and clients get a `harness.plugin.warning` event.

## Add commands and settings

Commands are actions for the user, not the model: slash commands and buttons in your app. Settings are typed, saved per session, and apply at the next turn.

```ts group=harness-plugins
import { configOption, defineCommand } from '@tanstack/ai-harness'
import { z } from 'zod'

export const greeter = definePlugin({
  name: 'acme/greeter',
  setup: (ctx) => ({
    config: {
      tone: configOption.select({ options: ['plain', 'warm'], default: 'plain' }),
    },
    commands: {
      greet: defineCommand({
        description: 'Greet someone',
        input: z.object({ name: z.string() }),
        run: async ({ name }, command) => {
          const sure = await command.step.ask({
            name: 'confirm',
            message: `Greet ${name}?`,
            schema: z.boolean(),
          })
          if (!sure) return 'Skipped.'
          return ctx.config.get('tone') === 'warm' ? `Hello, dear ${name}!` : `Hello, ${name}.`
        },
      }),
    },
  }),
})
```

- `session.runCommand({ name: 'greet', input: { name: 'Ada' } })` runs the command. A Standard Schema input (zod here) is checked, and the command gets the parsed value. A JSON Schema input is not checked, the same as a JSON Schema tool input.
- `session.setPluginSetting({ key: 'tone', value: 'warm' })` changes the setting. A value the option does not accept is rejected.
- `step.ask` waits for `session.answer({ questionId, value })`. The log keeps the question as a [wait](./waits), so a user on any server can answer it. The question goes to `session.onQuestion` listeners, and it stays in `session.snapshot().pendingWaits` until someone answers.
- When the host stops while the command waits, the next host runs the command again from the top. Put each side effect before the ask in `command.step.do`, so it does not run twice.
- `ctx.session.ask` is only for an MCP server that asks during a tool call. Anywhere else it throws. Use `step.ask`, the `question` tool, or a [permission rule](./permissions#rules-for-your-own-tool).

## Change commands while the session runs

Some commands come from data that changes: a folder of prompts, saved shortcuts, a list from a server. `ctx.commands` adds and removes them while the session runs. Here `/macro` saves a new command that sends a message:

```ts group=harness-plugins
export const macros = definePlugin({
  name: 'acme/macros',
  setup: (ctx) => ({
    commands: {
      macro: defineCommand({
        description: 'Save a command that sends a message: /macro <name> <message>',
        run: (input: unknown) => {
          const [name = '', ...words] = String(input ?? '').trim().split(' ')
          if (ctx.commands.has(name)) return `/${name} is taken.`
          ctx.commands.set(
            name,
            defineCommand({
              description: `Send: ${words.join(' ')}`,
              run: () => {
                void ctx.session.send(words.join(' '))
              },
            }),
          )
          return `Saved /${name}.`
        },
      }),
    },
  }),
})
```

- `ctx.commands.set(name, command)` adds a command of this plugin, or replaces it. A name that another plugin owns throws.
- `ctx.commands.delete(name)` removes a command of this plugin. Another plugin's name does nothing.
- Each change sends a `harness.commands.changed` event, so a client can read `session.commands()` again. A [session view](./custom-ui) reads the new list by itself.
- During `setup`, wait for `ctx.commands.ready` before you call `has` or `set`. The plugins after this one add their commands later, so a name can look free and still be taken.

```ts group=harness-plugins
export const greetings = definePlugin({
  name: 'acme/greetings',
  setup: (ctx) => {
    void ctx.commands.ready.then(() => {
      if (!ctx.commands.has('hi')) {
        ctx.commands.set('hi', defineCommand({ description: 'Say hi', run: () => 'Hi!' }))
      }
    })
  },
})
```

The [skills plugin](./skills) works this way: one command for each skill in a folder.

## Change agents while the session runs

Agents can come from data that changes too. `ctx.agents.set` and `ctx.agents.delete` work like `ctx.commands`. Here `/helper` adds an agent that the session can run at once:

```ts group=harness-plugins
import { defineAgent } from '@tanstack/ai'

export const helpers = definePlugin({
  name: 'acme/helpers',
  setup: (ctx) => ({
    commands: {
      helper: defineCommand({
        description: 'Add an agent: /helper <name>',
        run: (input: unknown) => {
          const name = String(input ?? '').trim()
          ctx.agents.set(
            defineAgent({ name, description: `The ${name} agent`, run: async () => 'Done.' }),
          )
          return `Added the ${name} agent.`
        },
      }),
    },
  }),
})
```

- `ctx.agents.set(agent)` adds an agent of this plugin, or replaces the one with the same name. A name that another plugin or the harness owns throws.
- `ctx.agents.set(agent, { subagent: true })` also gives the model a tool that runs the agent as a subagent, from the next turn. The tool has the name of the agent.
- `ctx.agents.delete(name)` removes an agent of this plugin, and its subagent tool. Another owner's name does nothing.
- `session.agent(name)`, `ctx.agents.list()`, and `routing` see the change at once.

`ctx.agents` also runs agents: `start`, `run`, and `group`, with `g.start` for each child of a group. It has the same type, `AgentActions`, as `ctx.harness.agents` in agent code. See [Run agents from a plugin](./subagents#run-agents-from-a-plugin).

## Keep state

`ctx.state(initial)` gives a plugin its own state for the thread. The session log keeps each change as a record, so any host that opens the thread reads the state back, also after a restart. Clients see each change as an AG-UI `STATE_SNAPSHOT` event.

```ts group=harness-plugins
export const counter = definePlugin({
  name: 'acme/counter',
  setup: (ctx) => {
    const state = ctx.state({ count: 0 })
    return {
      commands: {
        bump: defineCommand({
          description: 'Add one',
          run: async () => (await state.update((current) => ({ count: current.count + 1 }))).count,
        }),
      },
    }
  },
})
```

- The state is JSON.
- A key or a token of the session in the state goes into the log as `[redacted]`. `update` resolves with that same value. See [Keep tokens out of the log and the model](./auth#keep-tokens-out-of-the-log-and-the-model).
- The updates of one plugin run one at a time. Each `update` function gets the value that the update before it wrote.
- [`host.sessions.delete`](./lifecycle#delete-a-thread-for-good) deletes the state with the log. A fork does not copy it.
- For a long list of records, such as one record for each step, append records to the log and set `keepRecords`. Read them with `ctx.session.keptRecords(type)`. See [Keep records after a truncate](./session-log#keep-records-after-a-truncate).
- Agents get a state with the same `get` and `update` from `ctx.harness.state({ key, initial })`. See [Share state between agents](./subagents#share-state-between-agents).

## Middleware in every agent

You want to track token cost, or apply a policy, for every model call. But `middleware` runs only in the lead turn. The agents that the lead model calls, the agents you start in the background, and their own children each run a separate chat. Put the same middleware in `agentMiddleware` too. Then it runs in each of those chats.

```ts group=harness-plugins
import type { ChatMiddleware } from '@tanstack/ai'

export const usageByAgent = definePlugin({
  name: 'acme/usage-by-agent',
  setup: () => {
    const tokens = new Map<string, number>()
    const tracker: ChatMiddleware = {
      name: 'acme/usage-by-agent',
      onUsage: (ctx, usage) => {
        const agent = ctx.subagentName ?? 'lead'
        tokens.set(agent, (tokens.get(agent) ?? 0) + usage.totalTokens)
      },
    }
    return {
      middleware: [tracker],
      agentMiddleware: [tracker],
      commands: {
        tokens: defineCommand({
          description: 'Show the tokens of each agent',
          run: () => Object.fromEntries(tokens),
        }),
      },
    }
  },
})
```

- `ctx.subagentName` is the name of the agent. In the lead turn, it is `undefined`.
- `ctx.subagentRunId` is different for each run of an agent. For a nested child, `ctx.parentSubagentRunId` is the id of the child that started it.
- Each model call goes to `onUsage` one time, in the run that made the call. The lead turn does not count the usage of a child again.
- A background run that a turn starts keeps the plugins of that turn. So the `agentMiddleware` of a plugin with `lifetime: 'turn'` runs in it too. The turn plugins are cleaned up when the turn and its runs have settled.
- A tool result that your `onAfterToolCall` replaces is the result that the session log keeps. After a crash, the model gets that result again. See [The other tools of a cut batch](./durable-tools#the-other-tools-of-a-cut-batch).

## Act as the user of a run

Several people can write in one thread, and a background agent can run after its turn ended. A tool must use the GitHub token of the user who started its own run, not of the user who sent the latest message. Each run carries its user, and that user's credentials and keys, as the run context:

```ts group=harness-plugins
import { toolDefinition } from '@tanstack/ai'
import type { HarnessRunContext } from '@tanstack/ai-harness'

export const github = definePlugin({
  name: 'acme/github',
  setup: () => ({
    tools: [
      toolDefinition({ name: 'my_repos', description: 'List my GitHub repos' }).server<HarnessRunContext>(
        async (_args, ctx) => {
          const credential = await ctx.context.run.credentials.require('github')
          const token = credential.type === 'oauth' ? credential.accessToken : credential.value
          const response = await fetch('https://api.github.com/user/repos', {
            headers: { authorization: `Bearer ${token}` },
          })
          return response.json()
        },
      ),
    ],
  }),
})
```

Where each part of a plugin reads the run:

- A tool or a middleware hook: `ctx.context.run`. Type it with `HarnessRunContext`, for example `.server<HarnessRunContext>(...)` or `ChatMiddleware<HarnessRunContext>`.
- A command: `run` of the command context. Its `credentials` is the same as `run.credentials`.
- A plugin with `lifetime: 'turn'`: `ctx.turn.run`. Its `ctx.credentials` and `ctx.keys` belong to the same user.
- A session plugin (the default lifetime): `ctx.credentials` and `ctx.keys` have no user, so each call throws. `ctx.session.user` is the owner of the session.
- A plugin with `lifetime: 'host'`: its setup has no user and no session. Its tools read the user of each call from `ctx.context.run`.

`prepareTools` gets `run` too: the run of the turn, with its id and its user. `onTurnStart` gets the turn, with its run in `turn.run`.

A plugin that starts a turn picks its user. `ctx.session.send(text, { user })` and `ctx.session.note(text, { wake: true, user })` run that turn as `user`. Without it, the turn runs as `ctx.session.user`. To continue the work of a run, pass the `user` of that run.

The run has these fields:

| Field | What it is |
| --- | --- |
| `user` | The user who started the run: `{ id, tenantId }`. `undefined` in a session with no user. |
| `tenantId` | The tenant of the session. `undefined` in the default tenant. |
| `threadId`, `runId`, `parentRunId` | The thread, this run, and the run that started this one. |
| `logId` | The id of the log of the session tree in the store, with its tenant. |
| `epoch` | The ownership epoch of the log when the run started. See [Fence your own side effects](./durable-sessions#fence-your-own-side-effects). |
| `idempotencyKey(step, scope?)` | A key for one side effect of the run. A run again on any host gets the same key. |
| `signal` | Aborts when the run stops. |
| `credentials`, `keys` | The credentials and the model provider keys of the user of the run. The session replaces their values with `[redacted]` in what it keeps and sends. To refresh an OAuth token, use `credentials.refresh`. See [Auth and connectors](./auth#refresh-a-token). |

## Call a model from a plugin

Your plugin needs a model call of its own: a judge, a title, or a summary. A plain `chat()` call does not count in `session.usage()`, and it keeps running after the user cancels the turn. Call the model with `ctx.model.chat` instead:

```ts group=harness-plugins
export const recap = definePlugin({
  name: 'acme/recap',
  setup: (ctx) => ({
    commands: {
      recap: defineCommand({
        description: 'Sum up the conversation in three lines',
        run: async (_input, { run }) => {
          const transcript = await ctx.session.transcript()
          const { text } = await ctx.model.chat({
            run,
            label: 'recap',
            options: {
              messages: [...transcript, { role: 'user', content: 'Sum up this conversation in three lines.' }],
            },
          })
          return text
        },
      }),
    },
  }),
})
```

The options:

- `run`: the run that the call is for. The call uses the keys of its user, and the budget of the run applies. A plugin with `lifetime: 'turn'` can leave it out. Then the call uses the run of its turn.
- `adapter`: the model. Without it, the call uses the model of the session: the thread setting `model`, else the harness `adapter`. A `keyedAdapter(...)` gets the key of the user of the run.
- `options`: `messages`, `systemPrompts`, and `outputSchema`. With `outputSchema`, the call resolves to the checked value. Without it, the call resolves to `{ text, chunks }`.
- `label`: a name for the call in its usage record.
- `timeoutMs`: the time limit of the call. The default is 2 minutes.

The call stops when its run stops, for example on a cancel, and when the time limit ends. Then it rejects. Its usage counts in the session under `plugin:<name>`, here `plugin:acme/recap`. See [Usage of plugins](./usage#usage-of-plugins). The `goal()`, `title()`, and `compact()` plugins call their models this way.

## Pick the model of a turn

Some turns need another model: a short question does not need your strongest model, and an organization can allow only some models. Return an `adapter` picker from `setup`. When each turn starts, the session calls it with the message, context, and sender of that turn:

```ts group=harness-plugins
import { anthropicText } from '@tanstack/ai-anthropic'

export const cheapForShortTurns = definePlugin({
  name: 'acme/cheap-for-short-turns',
  setup: () => ({
    adapter: (turn) =>
      typeof turn.message === 'string' && turn.message.length < 200
        ? anthropicText('claude-haiku-5-5')
        : anthropicText('claude-sonnet-5-5'),
  }),
})
```

A short message now runs on Claude Haiku, and a long one on Claude Sonnet.

The `turn` has these fields:

| Field | What it is |
| --- | --- |
| `operationId` | The id of the operation that runs the turn. |
| `inputId` | The id of the input, when the turn has one. |
| `message` | The user message of the input. `undefined` for a resolve and a continue. |
| `context` | The [context of the input](./inputs#send-context-with-a-message). It is client data, so do not trust it. |
| `user` | Who sent the input. Default: the user that opened the session. See [Share a thread](./shared-threads). |
| `overrides` | The [overrides of the prompt](./turn-control#give-one-prompt-its-own-settings), when it has some. |
| `run` | The run of the turn: its user, and that user's credentials and keys. See [Act as the user of a run](#act-as-the-user-of-a-run). |

The session uses the picks like this:

- `undefined` keeps the harness adapter.
- If more than one plugin returns an adapter, the last plugin wins.
- The `overrides.adapter` of the turn wins over every pick.
- A model that the thread stored with `session.configure` also wins over every pick. See [Store settings per thread](./thread-settings).
- A keyed adapter gets the provider key of the sender.

If the picker does not need the turn, it can take no parameter.

### Read the model from your data

The picker is synchronous. To read a database first, give the plugin `lifetime: 'turn'`. The session then runs its `setup` for each turn and gives it the same turn as `ctx.turn`. An async `setup` can read the model from your data:

```ts group=harness-plugins
// Your lookup, for example a database query.
async function planOf(tenantId: string | undefined) {
  return tenantId === 'acme' ? 'strong' : 'fast'
}

export const modelOfTheOrg = definePlugin({
  name: 'acme/model-of-the-org',
  lifetime: 'turn',
  setup: async (ctx) => {
    const plan = await planOf(ctx.turn?.user?.tenantId)
    const adapter =
      plan === 'strong'
        ? anthropicText('claude-sonnet-5-5')
        : anthropicText('claude-haiku-5-5')
    return { adapter: () => adapter }
  },
})
```

A plugin with the default lifetime has no turn at setup, so its `ctx.turn` is `undefined`.

A `lifetime: 'turn'` plugin lives for one turn, so it cannot add commands or config options. If it tries, the turn fails with an error. Put them in a plugin with the default lifetime.

### Leave out the harness model

When a plugin picks the model of every turn, `defineHarness` needs no `adapter`:

```ts group=harness-plugins
import { defineHarness } from '@tanstack/ai-harness'

export const assistant = defineHarness({
  name: 'acme/assistant',
  plugins: () => [modelOfTheOrg],
})
```

If no plugin picks a model and the turn has no `overrides.adapter`, the turn fails with this error:

```text
This turn has no model. Set `adapter` in defineHarness, return one from a plugin `adapter()`, or pass `overrides.adapter` to the turn.
```

## Let plugins work together

Three ways, from simple to loose:

- **Capabilities.** One plugin declares `provides: [cap]` and calls `ctx.provide(cap, value)`. Another declares `requires: [cap]` and reads `ctx.get(cap)`. The provider must come first.
- **Extension points.** One plugin reads a list, and others add to it in any order.
- **Events.** `ctx.emit(event, value)` reaches every `ctx.on(event, handler)`. A listener stops when its plugin is cleaned up, for example on a reload.

```ts group=harness-plugins
import { createExtensionPoint, createPluginEvent } from '@tanstack/ai-harness'

export const Checks = createExtensionPoint<{ name: string }>('acme/checks')
export const checked = createPluginEvent<{ name: string }>('acme/checked')

export const runner = definePlugin({
  name: 'acme/check-runner',
  setup: (ctx) => {
    const checks = ctx.collect(Checks)
    return {
      commands: {
        check: defineCommand({
          description: 'Run every check',
          run: () => {
            for (const check of checks) ctx.emit(checked, check)
            return checks.map((check) => check.name)
          },
        }),
      },
    }
  },
})

export const lint = definePlugin({
  name: 'acme/lint',
  setup: () => ({ contribute: [Checks.item({ name: 'lint' })] }),
})
```

Read `ctx.collect` at run time (in a command, a tool, or a middleware hook). During `setup`, later plugins have not added their items yet.

## Clean up resources

Open resources with `ctx.resources.acquire(open, close)`. They close when the plugin is cleaned up, newest first: when the session closes, or for `lifetime: 'turn'`, after the turn and the background runs that it started. If a later plugin fails in `setup`, every plugin set up so far is cleaned up, and no model request is sent.

Set `lifetime: 'turn'` to set a plugin up again for each turn.

## Share one setup between sessions

A plugin that opens a database pool, or starts a process, does that work again for each session. A host with 300 open sessions then holds 300 pools. Set `lifetime: 'host'`, and the host sets the plugin up one time and shares it with every session:

```ts group=harness-plugins-host
import { toolDefinition } from '@tanstack/ai'
import { definePlugin } from '@tanstack/ai-harness'

// Your shared client, for example a database pool.
async function connect() {
  return { countOrders: async () => 42, end: async () => {} }
}

export const orders = definePlugin({
  name: 'acme/orders',
  lifetime: 'host',
  setup: async (ctx) => {
    const db = await ctx.resources.acquire(connect, (pool) => pool.end())
    return {
      tools: [
        toolDefinition({ name: 'count_orders', description: 'Count the orders' }).server(
          async () => db.countOrders(),
        ),
      ],
    }
  },
})
```

- The host sets the plugin up one time for each harness and plugin object. Every session of that harness that uses the same object shares this setup.
- Create the plugin one time, outside the `plugins` function, as `orders` is above. Then use it with `plugins: () => [orders]`. A `plugins` function that calls `definePlugin` or `mcp()` for each session gives each session its own setup.
- The host cleans it up when the last session that uses it closes, or at `host.close()`.
- Its setup context has no session, no credentials, no keys, and no commands. It has `harness`, the name of the harness, and `resources`.
- A tool of the plugin reads the user of its call from `ctx.context.run`. See [Act as the user of a run](#act-as-the-user-of-a-run).

Some parts need the session: a command, a setting, plugin state, or a question to the user. Return them from `session`. It runs for each session, with the same context as a session plugin:

```ts group=harness-plugins-host
import { defineCommand } from '@tanstack/ai-harness'

export const pool = definePlugin({
  name: 'acme/pool',
  lifetime: 'host',
  setup: async (ctx) => {
    const db = await ctx.resources.acquire(connect, (shared) => shared.end())
    return {
      session: (session) => ({
        commands: {
          orders: defineCommand({
            description: 'Count the orders',
            run: async () => `${await db.countOrders()} orders in ${session.session.threadId}`,
          }),
        },
      }),
    }
  },
})
```

The session gets the shared contributions and the `session` contributions together. The resources of `session` close with the session.

The [MCP plugin](./mcp) works this way for `stdio` servers: one process serves every session of the host.

## Reload plugins

You changed a plugin, an agent file, or the list that `plugins()` returns, and an open session still runs the old setup. `session.reloadPlugins()` sets the plugins up again:

```ts group=harness-plugins
import { watch } from 'node:fs'
import { createHarnessHost } from '@tanstack/ai-harness'

const host = createHarnessHost()
const session = await host.open(assistant, { threadId: 'thread-1' })

// One session.
await session.reloadPlugins()

// Every open session of the harness, each time a file in the folder changes.
watch('./plugins', () => void host.reload(assistant))
```

A reload works like this:

1. It waits for the running turn to end. No new turn starts until the reload ends.
2. It cleans up the resources of the session plugins, newest first.
3. It calls `plugins()` again and runs `setup` of each session plugin.
4. Clients get a `harness.reloaded` event. Read the commands, the settings, and the agents again.

The transcript, the log, the thread settings, and the inputs that wait stay. The next turn gets the new tools, prompts, and middleware. The `ctx.on` listeners of the old plugins stop.

The harness does not watch files. Your host decides when to reload, as the `watch` call above does.

If a `setup` throws, the session keeps working with no plugins. The promise rejects with the error, and the `harness.reloaded` event has its `error` message. Fix the plugin and call `reloadPlugins()` again.

## See the plan

`session.inspect()` lists the plugins in order, and who owns each tool, prompt, command, setting, and extension point item.

## What you have now

- A plugin that adds tools, prompts, commands, settings, and state to any harness.
- Middleware that sees every model call, in the lead turn and in every agent.
- Tools and commands that act as the user of their own run.
- Model calls of your plugin that count in the session usage and stop with their run.
- A picker that chooses the model of each turn from its message, context, and sender.
- Plugins that share services, lists, and events without knowing each other.
- Commands, agents, and whole plugins that change while the session runs.

Next: add the first-party plugins from `@tanstack/ai-harness/plugins` and `@tanstack/ai-harness/plugins/node`. [Ask before risky tool calls](./permissions) and [Switch between agent profiles](./agents) are two of them.
