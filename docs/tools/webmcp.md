---
title: WebMCP Tools
id: webmcp
order: 5
description: "Let browser agents call your TanStack AI client tools through the experimental WebMCP API."
keywords:
  - tanstack ai
  - webmcp
  - browser agents
  - client tools
  - registerWebMCPTools
  - useRegisterWebMCPTools
  - createRegisterWebMCPTools
  - injectRegisterWebMCPTools
---

A browser agent visits your page and wants to do something, like open the help panel. Clicking around the UI is slow, and it breaks when the UI changes. WebMCP lets you give that agent a list of actions it can call by name.

You register your TanStack client tools on `document.modelContext`. The agent finds them there and calls them.

> [!WARNING]
> WebMCP is experimental. Treat it as an extra for browsers that support it. Your page must work without it.

This page sends your tools to WebMCP. To use the WebMCP tools of a page in your own chat, see [Page WebMCP Tools in Chat](./webmcp-page-tools).

## Set it up

### 1. Install the packages

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

### 2. Define a client tool

Put the tool at module scope. This tool opens a help panel:

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

### 3. Register the tool

Call the register function for your framework. When the component goes away, the function removes the tools.

<!-- ::start:framework -->

# React

Call `useRegisterWebMCPTools` in a component. Keep the tool array and the options stable, for example at module scope.

```tsx
import { useRegisterWebMCPTools } from '@tanstack/ai-react'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useRegisterWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Vue

Call `useRegisterWebMCPTools` in a setup scope. Vue removes the tools when it disposes the scope.

```vue
<script setup lang="ts">
import { useRegisterWebMCPTools } from '@tanstack/ai-vue'
import { webMCPTools } from './tools'

useRegisterWebMCPTools(webMCPTools, {
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

Call `useRegisterWebMCPTools` in a reactive owner. Solid removes the tools when it cleans up the owner.

```tsx
import { useRegisterWebMCPTools } from '@tanstack/ai-solid'
import { webMCPTools } from './tools'

export function HelpPage() {
  useRegisterWebMCPTools(webMCPTools, {
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

Call `createRegisterWebMCPTools` in the component script. Svelte removes the tools when it destroys the component.

```svelte
<script lang="ts">
  import { createRegisterWebMCPTools } from '@tanstack/ai-svelte'
  import { webMCPTools } from './tools'

  createRegisterWebMCPTools(webMCPTools, {
    onError: (error) => console.error('WebMCP registration failed', error),
  })
</script>

<section id="help-panel" popover>
  <h2>Help</h2>
</section>
```

# Preact

Call `useRegisterWebMCPTools` in a component. Keep the tool array and the options stable, for example at module scope.

```tsx
import { useRegisterWebMCPTools } from '@tanstack/ai-preact'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useRegisterWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Angular

Call `injectRegisterWebMCPTools` in an injection context. Angular removes the tools through `DestroyRef`.

```ts ignore
import { Component } from '@angular/core'
import { injectRegisterWebMCPTools } from '@tanstack/ai-angular'
import { webMCPTools } from './tools'

@Component({
  selector: 'app-help-page',
  standalone: true,
  template: '<section id="help-panel" popover><h2>Help</h2></section>',
})
export class HelpPage {
  webMCP = injectRegisterWebMCPTools(webMCPTools, {
    onError: (error) => console.error('WebMCP registration failed', error),
  })
}
```

# Octane

Call `useRegisterWebMCPTools` in a component. Keep the tool array and the options stable, for example at module scope.

```tsx
import { useRegisterWebMCPTools } from '@tanstack/ai-octane'
import { webMCPTools } from './tools'

const webMCPOptions = {
  onError(error: unknown) {
    console.error('WebMCP registration failed', error)
  },
}

export function HelpPage() {
  useRegisterWebMCPTools(webMCPTools, webMCPOptions)

  return (
    <section id="help-panel" popover="auto">
      <h2>Help</h2>
    </section>
  )
}
```

# Remix

Pass the component `Handle` to `createRegisterWebMCPTools`. Remix uses `handle.signal` to remove the tools.

```tsx
import { createRegisterWebMCPTools } from '@tanstack/ai-remix'
import { clientEntry, createElement } from 'remix/ui'
import { webMCPTools } from './tools'

export const HelpPage = clientEntry(
  import.meta.url,
  function HelpPage(handle) {
    createRegisterWebMCPTools(handle, webMCPTools, {
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

That is all. In a browser with WebMCP, an agent on this page can now find and call `open_help_panel`. In other browsers, the page works the same as before.

## How it works

1. The register function turns each tool into a WebMCP tool. The input schema becomes JSON Schema, so the agent knows what to send.
2. The agent calls the tool by name.
3. WebMCP runs your `.client()` function in the page.
4. The result goes back to the agent. It does not start or continue a TanStack chat run.

During SSR, in an insecure context, or in a browser without WebMCP, the register function adds no tools. It does not throw, so you can call it everywhere.

Each tool must have:

- A `.client()` function. WebMCP needs code that it can run.
- A description that is not empty.
- A name of 1 to 128 ASCII letters, numbers, underscores, hyphens, or periods.
- An input schema that accepts an object.
- No `needsApproval: true`. See [Security](#security).

If a tool breaks one of these rules, registration fails and `onError` gets the error.

## Advanced

### Register without a framework

If your own code owns the lifecycle, use `registerWebMCPTools` from `@tanstack/ai-client`. The `signal` option is required. The tools stay registered until the signal aborts.

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

Call `disposeWebMCPTools()` from the teardown code of your application shell. Do not call it on `pagehide`, because the browser can restore the page from the back/forward cache.

`registerWebMCPTools` returns a promise. If registration fails, the promise rejects.

### Options

All framework wrappers accept these options. `registerWebMCPTools` accepts the first two, plus `signal`.

- `toolOptions`: a `title` and `annotations` for each tool, by tool name.
- `context`: the value that your handler gets as `context`. If a client tool declares a context, `context` and the options argument are required.
- `onError`: gets a registration failure.

The annotations are hints for the browser agent:

- `readOnlyHint`: the tool does not change state.
- `untrustedContentHint`: the tool can return content that your app does not trust.

The annotations do not enforce permissions or approval.

### Stable values in React, Preact, and Octane

In these frameworks, a new `tools` or `options` value replaces the registrations. If the contents do not change, keep both values stable. Stable values prevent extra changes to the WebMCP registry.

### What your handler gets

WebMCP calls your client handler directly. The handler gets these values:

- `abortSignal`: the WebMCP signal for this call. Pass it to browser APIs that you can cancel.
- `context`: the value from the register options.
- `emitCustomEvent`: does nothing, because no TanStack stream exists.
- `toolCallId`: not set, because WebMCP does not give one.

The two signals have different jobs:

- The registration signal removes the tools.
- The execution signal (`abortSignal`) cancels one call.

Cancellation is cooperative. Your handler must read `abortSignal`, or pass it to an API that supports cancellation.

### Validation

The register function converts each input schema to JSON Schema for WebMCP.

- **Standard Schema** (for example Zod): TanStack AI validates the input before your handler runs. It also validates the output before the result goes back to WebMCP.
- **Raw JSON Schema**: the schema only describes the data. TanStack AI does not validate with it. Validate untrusted input inside the handler, and return a value that matches the output schema.

Tool results must be JSON-serializable. If a result cannot be serialized, WebMCP reports the failure to its caller.

### Security

A tool with `needsApproval: true` cannot register with WebMCP. WebMCP annotations cannot enforce the TanStack approval flow.

Do not protect a sensitive action with a browser check only. Your server endpoint must enforce these rules:

- Authentication.
- Authorization.
- Rate limits.
- Business rules.

### Duplicate tool names

Tool names must be unique.

- If one call has two tools with the same name, the call fails before it changes the registry.
- If another owner already registered a name, WebMCP rejects that name.
- If registration fails, the register function removes only the tools that this call added.

### Upgrade from 0.x

The 1.0 names of the wrapper functions and their option types are in the [1.0 upgrade guide](../migration/v1#other-client-renames).
