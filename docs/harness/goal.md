---
title: Work until a goal is met
id: harness-goal
order: 12
description: "Give the harness a goal, for example all tests pass. After each turn, a judge model checks the goal, and the harness keeps working until the goal is met."
keywords:
  - tanstack ai
  - harness
  - goal
  - judge
  - agent loop
---

You ask your agent to make all tests pass. It fixes one test, then it stops and waits for you. You type "keep going" again and again.

The `goal()` plugin keeps the harness working. You give the goal one time. After each turn, a judge model reads the goal and the end of the conversation. If the goal is not met, the plugin starts the next turn.

## 1. Add the plugin

```ts group=harness-goal
import { defineHarness } from '@tanstack/ai-harness'
import { goal, permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'

const root = process.cwd()

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-5.6'),
  plugins: () => [
    permissions(),
    workspaceTools({ root }),
    goal({ judge: openaiText('gpt-5.6-luna') }),
  ],
})
```

`judge` is the model that decides if the goal is met. It can be a smaller model than the main model, or the same model.

## 2. Give it a goal

1. Start the harness, for example with the [CLI](./cli).
2. Type `/goal all tests pass`. The first turn starts.
3. Watch the turns. Each new turn tells the model the reason of the last check:

```text
Keep working on the goal: all tests pass. Last check: The date parser test still fails.
```

4. Type `/goal` to see the result:

```text
Goal: all tests pass
Status: met, round 3 of 20.
Last check: All 12 tests pass.
```

## How it stops

The plugin starts no new turn in these cases:

- The judge says that the goal is met. The status is `met`.
- The plugin started `maxRounds` turns (20 by default). The status is `stopped`, and the last reason stays.
- A turn waits for an approval, or a turn fails. The status is `paused`.
- You send your own message. The status is `paused`, and your message runs as a normal turn.

To change the limit, set `maxRounds`, for example `goal({ judge, maxRounds: 50 })`.

## Commands

| Command | What it does |
| --- | --- |
| `/goal <text>` | Sets the goal and starts the first turn. |
| `/goal` | Shows the goal, the status, the round, and the last reason. |
| `/goal stop` | Ends the goal. The running turn finishes, and no new turn starts. |
| `/goal resume` | Continues a paused or stopped goal with a new round count. The goal is plugin state, so this also works after a restart. |

## Do something when the goal is met

The plugin sends the `GoalMet` event with the goal and the last reason. Listen for it in your own plugin:

```ts group=harness-goal
import { definePlugin } from '@tanstack/ai-harness'
import { GoalMet } from '@tanstack/ai-harness/plugins'

export const notify = definePlugin({
  name: 'acme/notify',
  setup: (ctx) => {
    ctx.on(GoalMet, (met) => console.log(`Done: ${met.goal}. ${met.reason}`))
  },
})
```

Clients get the same event as a `harness.plugin.event` with the name `tanstack/goal:met`.

## What you have now

- A harness that keeps working until the judge says that the goal is met.
- A round limit, so the loop cannot run without end.
- `/goal`, `/goal stop`, and `/goal resume` to see and control the goal.
