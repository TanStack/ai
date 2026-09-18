# TanStack AI Homepage Plan

Status: working copy plan

Last updated: August 14, 2026

This document defines the homepage message, section order, visible copy, and required proof. It does not prescribe the final layout.

## Page job

The homepage needs to answer four questions quickly.

1. What can I build with TanStack AI?
2. Why would I choose it over Vercel AI SDK?
3. What proves the difference?
4. Where do I begin?

The primary audience is a TypeScript developer choosing an SDK for production AI features. Many visitors already know Vercel AI SDK.

The page must present TanStack AI as a complete SDK, not only an agent framework, protocol client, or chat library.

## Position

TanStack AI helps teams ship complete AI features without placing another vendor platform between their application and the models they choose.

The page leads with that result. The architecture then proves it.

The main proof is:

- No TanStack gateway, cloud, or model service sits in the request path.
- Exact-model types describe the model a developer selected.
- Native AG-UI keeps the interface independent from the server implementation.
- Separate activities and adapters keep the SDK composable.
- Shared standards keep schemas, tools, agents, and traces portable.

## Claim boundaries

The no-service claim needs precise wording.

Vercel AI SDK supports direct provider connections. TanStack must not claim otherwise.

The distinct fact is that TanStack has no owned gateway, cloud, workflow service, or model service for the SDK to prefer.

Use these claims:

- “Your requests, credentials, and data never pass through TanStack.”
- “Connect providers directly or use the gateway you choose.”
- “No TanStack service is required or preferred.”
- “TanStack ships the library. It does not sit in the request path.”

Do not use these claims:

- “Vercel AI SDK requires Vercel.”
- “Other AI SDKs always proxy your traffic.”
- “No services are involved.” Model providers and optional gateways are services.
- “Zero lock-in.” Provider features and infrastructure still create switching costs.
- “Switch providers without a migration.” Provider capabilities still differ.

## Page sequence

### 1. Hero

The hero makes the no-platform difference useful before it explains the implementation.

#### Visible copy

> # Ship AI features without putting another platform in the middle.
>
> TanStack AI is a typed SDK for streaming, tools, agents, structured output, media, and realtime. Connect providers directly or use the gateway you choose, then deploy anywhere.
>
> Exact-model types · Native AG-UI · Modular packages · No TanStack network hop

#### Actions

- Read the docs
- View on GitHub
- Copy AI prompt

#### Required proof

Keep the interactive architecture graph near the hero. Show the real request path without a TanStack service node.

`Your interface → Your server → Your provider or gateway`

The graph also needs to show interchangeable clients, compatible backends, and model providers. It must remain readable before interaction.

Do not place framework counts, provider counts, or the full agent feature list inside the hero paragraph.

### 2. The smallest complete implementation

The first code example shows that the independent architecture does not create a large setup cost.

#### Visible copy

> ## Your server route and client hook, end to end.
>
> Run `chat()` in your server route and connect it to your framework's client. Keep your auth, transport, interface, and deploy target.

#### Required proof

Show the current two-file server and client example. Keep both sides visible because the transport boundary is part of the product.

The client example needs to show messages and one approval interrupt. The server example needs one typed adapter and one server tool.

Framework tabs can swap the client binding without changing the server route.

Avoid comments that repeat the section copy. Code comments need to explain a real boundary or type.

### 3. No TanStack platform in the request path

This section moves the strongest durable distinction near the top of the page.

#### Visible copy

> ## There's no TanStack platform waiting behind the SDK.
>
> Your requests, credentials, and data never pass through TanStack. Connect directly to providers or use any gateway, including Vercel AI Gateway. Bring your own deployment platform, storage, workflow system, and sandbox.

Supporting line for the architecture visual:

> TanStack ships the library. It doesn't sit in the request path.

#### Required proof

Show several valid paths without implying that one path is preferred:

- Direct provider
- Local model
- OpenRouter
- Vercel AI Gateway
- OpenAI-compatible endpoint

Show deployment and infrastructure choices separately from model choices. A logo wall alone does not explain the architecture.

Link this section to the Vercel comparison for visitors evaluating both products.

### 4. Exact-model types

This section explains type sophistication through a compiler result.

#### Visible copy

> ## The types know which model you picked.
>
> Select a model and TypeScript narrows its options, capabilities, and input modalities. Pass an image to a text-only model and it fails in the editor, not production.

#### Required proof

Use an interactive provider and model selector. Changing the model must visibly change valid options or produce a real TypeScript error.

Show at least these cases:

- An input modality accepted by one model and rejected by another.
- A provider option that only exists for the selected model.
- A typed tool call or structured output part flowing into the client.

Do not use “clever types,” “advanced types,” or “more type safe” as the main explanation.

### 5. AG-UI and backend independence

This section makes standards useful before listing their names.

#### Visible copy

> ## Keep the interface when the backend changes.
>
> TanStack AI clients send and receive native AG-UI. Connect the same interface to TanStack AI, Python, Go, PHP, or any compatible server without translating a private stream format.

#### Required proof

Use one working interface with a backend selector. Each backend needs to preserve the same visible behavior:

- Streaming text
- A server tool
- A client tool
- Reasoning events
- An approval interrupt
- Structured output
- Error handling

The demo proves more than a diagram. Keep protocol details available, but do not require visitors to understand AG-UI before they see the result.

### 6. Shared standards at system boundaries

AG-UI is the strongest standard, but it is not the only one shaping the product.

#### Visible copy

> ## Shared standards where your application meets another system.

Use short labels with one consequence each:

- **AG-UI** keeps client and server events portable.
- **Standard Schema** keeps tool and output validation independent from one schema library.
- **MCP** connects tools, resources, prompts, and interactive apps.
- **ACP** connects compatible coding-agent harnesses.
- **OpenTelemetry** keeps traces usable outside one vendor dashboard.
- **Agent Skills** packages reusable agent instructions in an open format.

#### Required proof

Link each standard to a working guide or example. Remove any standard that has no public implementation or test.

Do not present logos without the application boundary they affect.

### 7. Tools and agent control

This section shows where code executes and how the application stays in control.

#### Visible copy

> ## Tools stay where their data lives.
>
> Server tools run with private credentials. Client tools update local interface state. One shared definition keeps inputs and results typed across both.
>
> Approval pauses become AG-UI interrupts that your interface resolves before the run continues.

#### Required proof

Keep the current client and server tool toggle. Show the shared definition once instead of presenting two unrelated tool declarations.

The approval example needs to show the pause, application decision, and resumed run. Do not imply that approval always requires persistence.

Agent loop controls belong beside this example. State that stop conditions are ordinary typed functions when the code proves it.

### 8. Complete without becoming monolithic

This section carries product breadth and the lightweight claim together.

#### Visible copy

> ## Every activity is its own import.
>
> Add chat, structured output, image, video, speech, transcription, realtime, memory, MCP, Code Mode, or sandboxes as your application needs them.

#### Content groups

Use the jobs developers recognize rather than equal decorative cards.

**Text, tools, and structured output**

> Stream text, reasoning, tool calls, and typed objects through one message history.

**Image, video, speech, and realtime**

> Use activity-specific adapters and hooks without pulling those activities into chat.

**Memory, persistence, and resumable streams**

> Keep server-owned thread state, reconnect dropped clients, and resume long-running work with the stores you choose.

**MCP, Code Mode, and coding-agent sandboxes**

> Connect external capabilities or run coding agents in local, hosted, or container sandboxes through separate packages.

#### Required proof

Show package and import names. The modularity claim needs visible module boundaries.

Do not claim a bundle-size lead until a reproducible comparison exists.

Remove decorative numbering. The groups do not need equal visual weight.

### 9. Devtools

This section shows how teams inspect behavior after the first successful demo.

#### Visible copy

> ## See every turn, tool, interrupt, and error.
>
> TanStack Devtools finds every AI hook in your application and shows its messages, tool inputs, results, memory, state, usage, and errors in one timeline.

#### Required proof

Keep the existing turn-by-turn Devtools visual. It needs to show a real tool call, result, memory event, interrupt, and error state.

Mention replay only when the visible demo or current release supports it.

### 10. Starting points

The page ends with useful destinations instead of another summary or generic call to action.

#### Links

- Build streaming chat
- Start from a server route
- Browse examples
- Compare with Vercel AI SDK
- Read the architecture

Do not add a closing paragraph that repeats the hero.

## Existing copy to keep

These ideas from the current homepage are concrete and useful:

- The two-file server and client example.
- The framework switcher that leaves the server unchanged.
- The client and server tool comparison.
- The exact-model capability visual.
- The client, server, and provider graph.
- The detailed Devtools timeline.
- The current adoption statistics when they remain dated and accurate.

## Existing copy to remove or rewrite

Remove “The headless agent framework. Bring your own stack.” It narrows a product that also covers media, structured output, and realtime.

Remove “Shipped, not planned.” The linked examples and packages already prove what exists.

Remove “Not a chatbot library. Every modality, one runtime.” It defines the product through a denial and does not explain the module structure.

Remove “Switching is a line of config, not a migration.” Provider capabilities differ, so some switches require application changes.

Reduce repeated variations of “your server,” “your transport,” and “nothing through us.” Keep the strongest version in the no-platform section.

Remove numbered labels that only make feature blocks symmetrical.

## Evidence and maintenance

Every changing number needs a visible date or an automated source. This includes providers, frameworks, downloads, stars, models, and tests.

Every standards claim needs a linked implementation or compatibility test.

Every provider-switching claim needs an example that preserves provider differences instead of hiding them.

Keep the Vercel comparison accurate. Vercel works outside Vercel and supports direct providers.

Update this plan when one of these facts changes:

- TanStack launches a hosted service that enters the request path.
- The native wire protocol changes.
- A listed standard loses first-party support.
- Exact-model metadata stops controlling public adapter types.
- Product scope moves away from separate activities and adapters.
- The primary audience changes from application developers.

## Copy rules

- Lead with application work and consequences, then name architecture.
- Use “AI features” as the broad category in the hero.
- Use “agents” as one supported product area, not the whole category.
- Explain standards through the boundary they keep open.
- Explain types through errors they prevent.
- Explain lightweight architecture through imports and package boundaries.
- Prove trust through incentives and request flow instead of using the word “trust.”
- Name Vercel only where direct comparison or gateway support helps a decision.
- Keep framework, provider, and feature lists outside the hero.
- Remove any sentence that repeats a nearby diagram, code sample, or label.
