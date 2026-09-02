---
title: WebMCP Tools
id: webmcp
order: 5
description: "Expose TanStack AI client tools to browser agents through the experimental WebMCP API."
keywords:
  - tanstack ai
  - webmcp
  - browser agents
  - client tools
  - registerWebMCPTools
  - useWebMCPTools
  - createWebMCPTools
  - injectWebMCPTools
---

You have a browser action that a page agent needs to discover and execute. WebMCP exposes your TanStack client tools through `document.modelContext`.

> **Experimental:** WebMCP support is experimental. Use it as progressive enhancement, not as a required application path.

During SSR, in insecure contexts, or in unsupported browsers, registration resolves without adding tools. Your application continues to work without WebMCP.

## 1. Install the packages

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react zod
vue: @tanstack/ai @tanstack/ai-vue zod
solid: @tanstack/ai @tanstack/ai-solid zod
svelte: @tanstack/ai @tanstack/ai-svelte zod
preact: @tanstack/ai @tanstack/ai-preact zod
angular: @tanstack/ai @tanstack/ai-angular zod
vanilla: @tanstack/ai @tanstack/ai-client zod
octane: @tanstack/ai @tanstack/ai-octane octane zod
remix: @tanstack/ai @tanstack/ai-remix remix zod

<!-- ::end:tabs -->

## 2. Define an executable client tool

Define the tool at module scope. A browser agent executes the tool to open a help panel.

```ts
// tools.ts
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const openHelpPanel = toolDefinition({
  name: 'open_help_panel',
  description: 'Open the help panel for a topic',
  inputSchema: z.object({
    topic: z.string(),
  }),
  outputSchema: z.object({
    opened: z.boolean(),
  }),
}).client((input) => {
  const panel = document.querySelector<HTMLElement>('#help-panel')
  if (!panel) {
    return { opened: false }
  }

  panel.dataset.topic = input.topic
  panel.showPopover()
  return { opened: true }
})

export const webMCPTools = [openHelpPanel]
```

WebMCP requires an executable `.client()` implementation. It also requires a nonempty description and a valid tool name.

A tool name can contain 1 to 128 ASCII letters, numbers, underscores, hyphens, or periods.

## 3. Register the tool

Use the lifecycle wrapper for your framework. Each wrapper removes its registrations during owner cleanup.

<!-- ::start:framework -->

# React

Call `useWebMCPTools` in a component. If its contents do not change, keep the tool array stable.

```tsx
import { useWebMCPTools } from '@tanstack/ai-react'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Vue

Call `useWebMCPTools` in a setup scope. Vue removes the registrations during scope disposal.

```vue
<script setup lang="ts">
import { useWebMCPTools } from '@tanstack/ai-vue'
import { webMCPTools } from './tools'

useWebMCPTools(webMCPTools, {
  onError: (error) => console.error('WebMCP registration failed', error),
})
</script>

<template>
  <section id="help-panel" popover>
    <h2>Help</h2>
  </section>
</template>
```

# Solid

Call `useWebMCPTools` in a reactive owner. Solid removes the registrations during owner cleanup.

```tsx
import { useWebMCPTools } from '@tanstack/ai-solid'
import { webMCPTools } from './tools'

export function HelpPage() {
  useWebMCPTools(webMCPTools, {
    onError: (error) => console.error('WebMCP registration failed', error),
  })

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Svelte

Call `createWebMCPTools` in the component script. Svelte removes the registrations during component destruction.

```svelte
<script lang="ts">
  import { createWebMCPTools } from '@tanstack/ai-svelte'
  import { webMCPTools } from './tools'

  createWebMCPTools(webMCPTools, {
    onError: (error) => console.error('WebMCP registration failed', error),
  })
</script>

<section id="help-panel" popover>
  <h2>Help</h2>
</section>
```

# Preact

Call `useWebMCPTools` in a component. If its contents do not change, keep the tool array stable.

```tsx
import { useWebMCPTools } from '@tanstack/ai-preact'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Angular

Call `injectWebMCPTools` in an injection context. Angular removes the registrations through `DestroyRef`.

```ts
import { Component } from '@angular/core'
import { injectWebMCPTools } from '@tanstack/ai-angular'
import { webMCPTools } from './tools'

@Component({
  selector: 'app-help-page',
  standalone: true,
  template: '<section id="help-panel" popover><h2>Help</h2></section>',
})
export class HelpPage {
  webMCP = injectWebMCPTools(webMCPTools, {
    onError: (error) => console.error('WebMCP registration failed', error),
  })
}
```

# Octane

Call `useWebMCPTools` in a component. If its contents do not change, keep the tool array stable.

```tsx
import { useWebMCPTools } from '@tanstack/ai-octane'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Remix

Pass the component `Handle` to `createWebMCPTools`. Remix uses `handle.signal` for cleanup.

```tsx
import { createWebMCPTools } from '@tanstack/ai-remix'
import { clientEntry, createElement } from 'remix/ui'
import { webMCPTools } from './tools'

export const HelpPage = clientEntry(
  import.meta.url,
  function HelpPage(handle) {
    createWebMCPTools(handle, webMCPTools, {
      onError: (error) => console.error('WebMCP registration failed', error),
    })

    return () =>
      createElement(
        'section',
        { id: 'help-panel', popover: 'auto' },
        createElement('h2', {}, 'Help'),
      )
  },
)
```

<!-- ::end:framework -->

Changes to the `tools` or `options` value replace registrations in React, Preact, and Octane. Stable values prevent unnecessary registry changes.

All wrappers accept `toolOptions`, `context`, and `onError`. A contextual client tool makes `context` and the options argument required.

## Use the framework-neutral registrar

If another lifecycle owns the registration, use `registerWebMCPTools`. The required signal controls how long the tools stay registered.

```ts
import { registerWebMCPTools } from '@tanstack/ai-client'
import { webMCPTools } from './tools'

const registration = new AbortController()

await registerWebMCPTools(webMCPTools, {
  signal: registration.signal,
  toolOptions: {
    open_help_panel: {
      title: 'Open help',
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
    },
  },
})

export function disposeWebMCPTools() {
  registration.abort()
}
```

Call `disposeWebMCPTools()` from the explicit teardown path for your application shell. Do not use `pagehide`, because BFCache can restore the page.

The annotations are hints for the browser agent. They do not enforce permissions or approval.

## Understand the execution boundary

WebMCP calls the client handler directly. The result returns directly to WebMCP and does not continue a TanStack chat run.

The execution context has these WebMCP rules:

- `abortSignal` is the WebMCP execution signal. Pass it to cancellable browser APIs.
- `context` is the value from the registrar or wrapper options.
- `emitCustomEvent` does nothing because no TanStack stream exists.
- `toolCallId` is absent because WebMCP does not provide one.

The registration signal and the execution signal have different jobs. The registration signal removes tools, while the execution signal cancels one call.

Cancellation is cooperative. Your handler must observe `abortSignal` or pass it to an API that supports cancellation.

## Validate data at the page boundary

The registrar converts each input schema to JSON Schema for WebMCP discovery.

For a Standard Schema, it validates input before execution. It also validates output before the result returns to WebMCP.

A raw JSON Schema only describes the data. TanStack AI does not use it for runtime validation.

If you use raw JSON Schema, validate untrusted input inside the handler. Return a value that matches the output schema.

Tool results must be JSON-serializable. WebMCP reports a serialization failure to its caller.

## Keep the security boundary on the server

`needsApproval: true` tools cannot register with WebMCP. WebMCP annotations cannot enforce the TanStack approval contract.

Do not expose a sensitive action only through a browser check. The server endpoint must enforce authentication, authorization, rate limits, and business rules.

Tool names must be unique. Duplicate names in one call fail before registration changes the document registry.

WebMCP also rejects a name that another owner already registered. If registration fails, the registrar removes only the tools added by that call.

If WebMCP is available, your page now exposes `open_help_panel`. Other browsers continue to use the page without that agent action.
