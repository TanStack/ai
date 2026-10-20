<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-computer-playwright

Playwright browser driver for TanStack AI computer use.

Let the model see and control a browser page. Each thread gets its own page. The driver takes screenshots of the page and sends mouse and keyboard input to it.

## Installation

```bash
pnpm add @tanstack/ai-computer-playwright @tanstack/ai-computer-use playwright-core
npx playwright-core install chromium
```

## Usage

1. Create the computer with `playwrightComputer()`:

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { playwrightComputer } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
})
```

2. Give `computerUse.tools`, `middleware`, `interrupt`, and the thread id to `chat()`. The model can now use a page.

Each thread gets its own browser context, with its own cookies and storage, and one page. Chromium starts on the first action. `computerUse.close()` closes it.

`playwrightComputer()` takes these options. All of them are optional:

- `startUrl`: the URL that each new page opens.
- `display`: the viewport of each page in pixels. The default is 1280 x 800.
- `browser`: a Playwright `Browser` that makes the pages. `createComputerUse` never closes it.
- `launch`: the options for `chromium.launch()`.

## Share one page

To drive a page that you already have, use `createPlaywrightComputerDriver`. Every thread shares this page, so it serves one conversation at a time.

```typescript
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'

const computerUse = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})
```

- The driver accepts any object with the shape of a Playwright `Page`. A page from `playwright`, `playwright-core`, or `@playwright/test` works.
- The driver reads the viewport size once, when you create it. A page with no viewport size throws an error.
- Your app owns this page. `createComputerUse` never closes it.

## What the driver does

- `navigate` opens a URL in the page. Then `computerUse.tools` has the `navigate` tool.
- The `back` and `forward` mouse buttons go back and forward in the page history.
- Key names go to Playwright as they are. `['Control', 's']` becomes `Control+s`.
- `zoom` takes a screenshot of one region of the page.

Read the full guide: [Computer use drivers](https://tanstack.com/ai/latest/docs/computer-use/drivers).

## Tests

```bash
pnpm --filter @tanstack/ai-computer-playwright test:lib
```
