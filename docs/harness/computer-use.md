---
title: Give your agent a computer
id: harness-computer-use
order: 8
description: "Let a harness agent use a web page. Each thread gets its own browser page. Screenshots go to the media store of the session, and OpenAI safety checks ask the user."
keywords:
  - tanstack ai
  - harness
  - computer use
  - computerUse
  - browser agent
  - playwright
  - screenshots
---

Your agent must do a task on a web page that has no API, for example fill in a form or find a price. `computerUse()` gives the agent a screen, a mouse, and a keyboard. Each thread gets its own browser page. Each screenshot goes to the media store of the session, so the log stays small.

To use computer use in a `chat()` route with no harness, read [Computer Use](../computer-use/computer-use).

## 1. Add the plugin

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vue: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
solid: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
svelte: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
preact: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
angular: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
octane: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod
vanilla: @tanstack/ai-harness @tanstack/ai-computer-use @tanstack/ai-computer-playwright playwright-core zod

<!-- ::end:tabs -->

Then download Chromium one time:

```bash
npx playwright-core install chromium
```

```ts group=harness-computer-use
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { computerUse } from '@tanstack/ai-computer-use/harness'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'

// One time, outside `plugins`, so the sessions share one Chromium.
const browser = computerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
})

export const agent = defineHarness({
  name: 'acme/browser-agent',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [permissions(), browser],
})

const host = createHarnessHost({ persistence: memoryPersistence() })
const session = await host.open(agent, { threadId: 'browser-1' })
await session.send('Go to https://tanstack.com/ai and tell me the title of the page.')
```

- The model gets the `computer` tool. With it, the model clicks, types, scrolls, and takes screenshots.
- The model also gets the `navigate` tool when the driver can open a URL. `playwrightComputer()` can.
- Chromium starts on the first action. Each thread gets a new page, and the page opens `startUrl`.

To use Anthropic, change only the adapter, for example to `anthropicText('claude-opus-5-5')`.

## 2. Answer a safety check

OpenAI can mark an action as risky, for example when the page tells the model to do something else. Before that action runs, `permissions()` asks the user. The turn stops, and you answer the approval:

```ts group=harness-computer-use
// wait.message is, for example: Allow computer {"action":{"type":"click",...},"pending_safety_checks":[...]}?
const waits = session.snapshot().pendingWaits
await session.resolve({
  inputId: 'approve-1',
  resume: waits.map((wait) => ({
    interruptId: wait.waitId,
    status: 'resolved',
    payload: 'once',
  })),
})
await session.settled({ inputId: 'approve-1' })
```

- `once` runs the action. The model gets the screenshot, and OpenAI gets the acknowledged check.
- `always` runs the action too, but it saves no rule. The next safety check asks again.
- `reject` does not run the action. The model gets an error result.

The other actions run with no question. Anthropic sends no safety checks, so its actions never ask.

In the `plan` mode, the `computer` tool does not run. To ask before every action, add a rule: `permissions({ rules: [{ tool: 'computer', decision: 'ask' }] })`.

CAUTION: Keep `permissions()` in the plugins. Without it, an action with a safety check does not run. In the `bypass` mode, it runs with no question. See [Pick a mode](./permissions#pick-a-mode).

## 3. Choose how many screenshots the model sees

Each action returns a screenshot. The plugin stores it in the media store of the session. The transcript and the log keep a small `harness-media:` reference to each one.

The model gets only the 3 newest screenshots. An older screenshot goes to the model as a 1x1 image, so a long task does not send every old screenshot again. To change the number, set `keepScreenshots`:

```ts group=harness-computer-use
export const browserWithHistory = computerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
  keepScreenshots: 5,
})
```

The media store keeps every screenshot, so a client can still show all of them. To keep the files after a restart, give the host a blob store. See [Keep media across restarts](./media#keep-media-across-restarts).

## When the pages close

- All the sessions of a host that use the same `computerUse()` object share one Chromium.
- A thread that stays idle for `idleTimeout` loses its page. The default is 10 minutes. The next action of that thread opens a new page at `startUrl`.
- `host.close()` closes every page, then Chromium.
- The pages live in the memory of the host. When another host opens the thread, the thread gets a new page there.

The browser can open every address that your server can reach. See [Keep the browser away from private addresses](../computer-use/computer-use#keep-the-browser-away-from-private-addresses). To use a Linux desktop or your own computer, pass another driver from [Drivers](../computer-use/drivers).

## What you have now

Run the session from step 1. The model calls `navigate`, reads the screenshot, and answers with the title of the page. Your harness agent now uses a browser, and each screenshot is in the media store of the session.
