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

Let the model see and control one browser page. The driver takes screenshots of the page and sends mouse and keyboard input to it.

## Installation

```bash
pnpm add @tanstack/ai-computer-playwright @tanstack/ai-computer-use playwright
```

## Usage

1. Open a page that has a viewport size.
2. Pass the page to the driver:

```typescript
import { chromium } from 'playwright'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

const { tool, middleware, interrupt } = createComputerUse({
  driver: createPlaywrightComputerDriver({ page }),
})
```

3. Give `tool`, `middleware`, and `interrupt` to `chat()`. The model can now use the page.

The driver accepts any object with the shape of a Playwright `Page`. A page from `playwright-core` or `@playwright/test` also works.

## What your application owns

- **The browser.** The driver does not launch or close it. Close it when you are done.
- **The viewport.** The driver reads the viewport size once, when you create it. A page with no viewport size throws an error.

## What the driver does

- The `back` and `forward` mouse buttons go back and forward in the page history.
- Key names go to Playwright as they are. `['Control', 's']` becomes `Control+s`.
- `zoom` takes a screenshot of one region of the page.

Read the full guide: [Computer use drivers](https://tanstack.com/ai/latest/docs/computer-use/drivers).

## Tests

```bash
pnpm --filter @tanstack/ai-computer-playwright test:lib
```
