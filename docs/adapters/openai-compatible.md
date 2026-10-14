---
title: OpenAI-Compatible Adapter
id: openai-compatible-adapter
description: "Use any OpenAI-compatible provider (DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Qwen, Perplexity, local servers, and more) in TanStack AI with one generic adapter."
keywords:
  - tanstack ai
  - openai compatible
  - deepseek
  - moonshot
  - kimi
  - together
  - fireworks
  - cerebras
  - qwen
  - perplexity
  - lm studio
  - vllm
  - litellm
  - adapter
---

Many providers expose the OpenAI **Chat Completions** API (`/chat/completions`) — DeepSeek, Moonshot/Kimi, Together, Fireworks, Cerebras, Alibaba Qwen, Perplexity, NVIDIA NIM, and local servers like LM Studio, Ollama, and vLLM. Instead of a dedicated package per provider, TanStack AI ships one generic adapter: point it at any compatible `baseURL`, give it your models, and you get the same type-safe `chat()` experience as the first-class adapters.

Use this when your provider speaks the OpenAI Chat Completions wire format but doesn't have its own `@tanstack/ai-*` package. If a dedicated adapter exists (OpenAI, Grok, Groq, OpenRouter), prefer it. Those carry curated per-model metadata. For Vercel AI Gateway, install `@tanstack/ai-vercel-gateway` and use `vercelGatewayText`. See [Vercel AI Gateway](./vercel-gateway.md). For Lovable AI Gateway, install `@tanstack/ai-lovable` and use `lovableText` (plus image, video, embeddings, and speech factories). See [Lovable AI Gateway](./lovable.md).

Perplexity Sonar chat stays on this adapter. [`@tanstack/ai-perplexity`](./perplexity.md) is Search/grounding only — it does not replace `openaiCompatible` for `chat()`. Optional: pass `defaultHeaders: getPerplexityIntegrationHeaders()` from that package to send Perplexity's `X-Pplx-Integration` attribution header.

## Installation

The adapter ships inside `@tanstack/ai-openai` under the `/compatible` subpath — no extra install:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-openai
vue: @tanstack/ai-openai
solid: @tanstack/ai-openai
svelte: @tanstack/ai-openai
preact: @tanstack/ai-openai
angular: @tanstack/ai-openai
vanilla: @tanstack/ai-openai
octane: @tanstack/ai-openai

<!-- ::end:tabs -->

## Basic Usage

Configure the provider once with `openaiCompatible({ baseURL, apiKey, models })`, then select a model per call. The returned model name is a type-safe union of the models you declared:

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const deepseek = openaiCompatible({
  name: "deepseek", // optional label shown in devtools/errors (default: "openai-compatible")
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat", "deepseek-reasoner"],
});

const stream = chat({
  adapter: deepseek("deepseek-chat"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

`deepseek("deepseek-reasoner")` is valid; `deepseek("gpt-4o")` is a type error — only declared models are accepted.

## One-Shot Usage

For a single model, skip the provider-factory and build the adapter inline with `openaiCompatibleText`:

```typescript
import { chat } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";

const stream = chat({
  adapter: openaiCompatibleText("deepseek-chat", {
    baseURL: "https://api.deepseek.com/v1",
    apiKey: process.env.DEEPSEEK_API_KEY!,
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Declaring Models

The `models` array accepts two forms, which you can mix:

- **A bare string** — gets optimistic defaults: `text` + `image` input, with `streaming`, `function_calling`, and `structured_outputs` support. Good for mainstream chat models.
- **A `createModel(name, capabilities)` definition** — declares precise per-model capabilities so the types match reality (e.g. a reasoning model with no image input).

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { createModel } from "@tanstack/ai";

const provider = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: [
    "deepseek-chat", // string → optimistic defaults
    createModel("deepseek-reasoner", {
      input: ["text"], // text only
      features: ["reasoning", "structured_outputs"],
    }),
  ],
});
```

> Capabilities are enforced at the type level. If a provider rejects a feature at runtime (e.g. tools on a model that doesn't support them), declare that model with `createModel` and omit the unsupported feature so the types stop you from calling it.

## Configuration

`openaiCompatible` accepts every OpenAI SDK `ClientOptions` field besides `apiKey`/`baseURL` (which are required and promoted to the top level). The most useful are `defaultHeaders` and `defaultQuery`, for providers that need extra auth or routing parameters:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://api.example.com/v1",
  apiKey: process.env.EXAMPLE_API_KEY!,
  models: ["some-model"],
  defaultHeaders: { "X-Custom-Header": "value" },
  defaultQuery: { "api-version": "2026-01-01" },
});
```

Need a header on each request, or a log of each model call? The chat adapters on this page support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

## Chat Completions vs Responses

By default the adapter targets the **Chat Completions** API (`/chat/completions`). For providers that implement the **Responses** API, select `api: "responses"`. This API choice also controls how `ChatStreamSummarizeAdapter` forwards `maxLength`, regardless of the wrapper name:

- Chat Completions uses `max_tokens`.
- Responses uses `max_output_tokens`.

An explicit token limit in `modelOptions` takes precedence over `maxLength`.

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://my-resource.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-4o"],
  api: "responses", // default is "chat-completions"
});
```

**Reasoning:** Reasoning deltas stream as thinking content. Endpoints frozen on the pre-July-2025 OpenAI spec may still emit the legacy event name `response.reasoning.delta` (removed from the spec in favor of `response.reasoning_text.delta`); the adapter recognizes both and maps them identically.

## Supported Providers

Any provider implementing the OpenAI Chat Completions API works. Common ones are below — **verify the `baseURL` and model ids against each provider's current docs**, since they change over time. Set the API key via the provider's own environment variable and pass it as `apiKey`.

| Provider | `baseURL` | Example model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat`, `deepseek-reasoner` |
| Moonshot / Kimi | `https://api.moonshot.ai/v1` | `kimi-k2-0711-preview` |
| Alibaba Qwen (DashScope, intl) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-max`, `qwen-plus` |
| Alibaba Qwen (DashScope, China) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-max` |
| Together AI | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/llama-v3p3-70b-instruct` |
| Cerebras | `https://api.cerebras.ai/v1` | `llama-3.3-70b` |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | `meta-llama/Llama-3.3-70B-Instruct` |
| Perplexity | `https://api.perplexity.ai` | `sonar`, `sonar-pro` |
| Mistral | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| Nebius | `https://api.studio.nebius.ai/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| Z.AI (GLM) | `https://api.z.ai/api/paas/v4` | `glm-4.6` |
| Baseten | `https://inference.baseten.co/v1` | model-dependent |
| Hugging Face (router) | `https://router.huggingface.co/v1` | `meta-llama/Llama-3.3-70B-Instruct` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` |
| Kilo Gateway | `https://api.kilo.ai/api/gateway` | `anthropic/claude-opus-5.5` |
| ZenMux | `https://zenmux.ai/api/v1` | `openai/gpt-5.5` |
| Poe | `https://api.poe.com/v1` | `openai/gpt-5.5` |
| DigitalOcean | `https://inference.do-ai.run/v1` | `openai-gpt-5.5` |
| Modal | `https://inference.us-west.modal.direct/v1` | `moonshotai/Kimi-K3` |
| Snowflake Cortex | `https://<account>.snowflakecomputing.com/api/v2/cortex/v1` | `claude-opus-5` |

Some providers sign the user in with OAuth instead of an API key. For Poe, DigitalOcean, and Snowflake Cortex, pass the access token from your sign-in code as `apiKey`.


On Chat Completions, `RUN_FINISHED.usage` carries the prompt cache counts that the provider reports. Cache reads arrive on `promptTokensDetails.cachedTokens`, and cache writes arrive on `promptTokensDetails.cacheWriteTokens`. Moonshot / Kimi reports both.

## Local & Self-Hosted Servers

Point the adapter at any local OpenAI-compatible server. The API key is usually a placeholder:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

// LM Studio
const lmstudio = openaiCompatible({
  name: "lmstudio",
  baseURL: "http://localhost:1234/v1",
  apiKey: "lm-studio",
  models: ["local-model"],
});

// vLLM
const vllm = openaiCompatible({
  name: "vllm",
  baseURL: "http://localhost:8000/v1",
  apiKey: "not-needed",
  models: ["meta-llama/Llama-3.3-70B-Instruct"],
});

// Ollama's OpenAI-compatible endpoint
const ollama = openaiCompatible({
  name: "ollama",
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama",
  models: ["llama3.3"],
});
```

> Ollama also has a dedicated adapter, [`@tanstack/ai-ollama`](./ollama), which understands its native API. Use `openaiCompatible` only if you specifically want Ollama's OpenAI-compatible surface.

## LiteLLM Proxy

[LiteLLM](https://github.com/BerriAI/litellm) is a self-hosted gateway that exposes a single OpenAI Chat Completions endpoint in front of 100+ providers (OpenAI, Anthropic, Google, Azure, AWS Bedrock, Mistral, Groq, and more). Because the proxy speaks the OpenAI wire format, it needs no dedicated package — point `openaiCompatible` at your proxy's `baseURL` (default `http://localhost:4000/v1`) and route to a provider with LiteLLM's `provider/model` naming:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const litellm = openaiCompatible({
  name: "litellm",
  baseURL: "http://localhost:4000/v1", // your LiteLLM proxy
  apiKey: process.env.LITELLM_API_KEY!, // a virtual key issued by the proxy
  models: [
    "anthropic/claude-sonnet-5",
    "openai/gpt-5.5",
    "gemini/gemini-3.5-flash",
  ],
});
```

`litellm("anthropic/claude-sonnet-5")` selects the Anthropic route; `litellm("openai/gpt-5.5")` selects OpenAI — all through the one proxy. Declare only the model routes you configured on the proxy; for precise per-model capabilities (e.g. a reasoning route without image input), use `createModel` as shown under [Declaring Models](#declaring-models).

> The proxy holds each upstream provider's real credentials; the `apiKey` here is the proxy's own virtual/master key, not the upstream provider's.

## Azure OpenAI

Use `createAzureOpenaiText` from `@tanstack/ai-openai`. It sets the `api-key` header, the endpoint, the API version, and the deployment name for you:

```typescript
import { createAzureOpenaiText } from "@tanstack/ai-openai";

const adapter = createAzureOpenaiText("gpt-5.6", process.env.AZURE_OPENAI_API_KEY!, {
  resourceName: "my-resource",
  deploymentName: "production-chat",
});
```

See [Azure OpenAI](./openai#azure-openai) for `azureOpenaiText`, which reads the key and the other values from the environment.

## GitHub Copilot

Your users can pay for model calls with their GitHub Copilot plan. Each user signs in with GitHub. Your server sends their GitHub token to Copilot as `Authorization: Bearer`.

### 1. Create a GitHub OAuth app

1. On GitHub, open **Settings > Developer settings > OAuth Apps**. Click **New OAuth App**.
2. Set **Authorization callback URL** to your callback route, for example `https://my-app.com/auth/github/callback`.
3. Clear **Expire user access tokens**. The examples below keep one token and do not refresh it.
4. If your app runs in a terminal, select **Enable Device Flow**.
5. Set `GITHUB_CLIENT_ID` to the client ID. For a web app, also generate a client secret and set `GITHUB_CLIENT_SECRET` to it.

If you keep **Expire user access tokens** on, a token lasts 8 hours. Refresh it with its refresh token, as [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) describes.

### 2. Sign the user in

Pick the flow for your app:

- Web app: the [web flow](#web-app) sends the user to GitHub and back.
- Terminal or desktop app: the [device flow](#terminal-app) shows a code. The user types the code on GitHub.

Both flows ask for the `read:user` scope only.

#### Web app

`copilot-auth.ts` has the two sign-in routes and a reader for your chat routes. The token goes into an `HttpOnly` cookie, so browser code cannot read it:

```typescript
import { copilotBaseURL } from "./copilot-host";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
}

function readCookie(request: Request, name: string): string | undefined {
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return undefined; // A malformed value counts as no cookie.
    }
  }
  return undefined;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

/** GET /auth/github: send the user to GitHub. */
export function startGithubSignIn(): Response {
  const state = crypto.randomUUID();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": cookie("github_state", state, 600),
    },
  });
}

/** GET /auth/github/callback: swap the code for a token. */
export async function finishGithubSignIn(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state || state !== readCookie(request, "github_state")) {
    return new Response("The sign-in failed. Try again.", { status: 400 });
  }
  const reply = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env("GITHUB_CLIENT_ID"),
      client_secret: env("GITHUB_CLIENT_SECRET"),
      code: url.searchParams.get("code"),
    }),
  });
  const { access_token }: { access_token?: string } = await reply.json();
  if (!access_token) {
    return new Response("The sign-in failed. Try again.", { status: 400 });
  }
  const baseURL = await copilotBaseURL(access_token);
  if (!baseURL) {
    return new Response("This GitHub account has no Copilot access.", {
      status: 403,
    });
  }
  const month = 60 * 60 * 24 * 30;
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", cookie("copilot_token", access_token, month));
  headers.append("Set-Cookie", cookie("copilot_base_url", baseURL, month));
  headers.append("Set-Cookie", cookie("github_state", "", 0));
  return new Response(null, { status: 302, headers });
}

/** The Copilot sign-in of the request, or `undefined`. */
export function getCopilotSignIn(request: Request) {
  const token = readCookie(request, "copilot_token");
  const baseURL = readCookie(request, "copilot_base_url");
  if (!token || !baseURL || !URL.canParse(baseURL)) return undefined;
  // The user can change cookies. Send the token only to a Copilot host.
  const { protocol, hostname } = new URL(baseURL);
  if (protocol !== "https:" || !hostname.endsWith(".githubcopilot.com")) {
    return undefined;
  }
  return { token, baseURL };
}
```

1. Call `startGithubSignIn` from your `GET /auth/github` route.
2. Call `finishGithubSignIn` from your `GET /auth/github/callback` route.
3. Link a **Sign in with GitHub** button to `/auth/github`.

- For GitHub Enterprise, also accept your `copilot-api.<your-domain>` host in `getCopilotSignIn`.
- To keep the token out of the browser completely, keep it in your session store. Then put only the session id in the cookie.

#### Terminal app

`copilot-device.ts` shows a code. Then it waits until the user types the code on GitHub:

```typescript
interface DeviceCode {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  interval?: number;
  error_description?: string;
}

interface TokenReply {
  access_token?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

async function postGithub(path: string, body: Record<string, string>) {
  const response = await fetch(`https://github.com${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function signInWithDevice(): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) throw new Error("Set GITHUB_CLIENT_ID.");
  const code: DeviceCode = await postGithub("/login/device/code", {
    client_id: clientId,
    scope: "read:user",
  });
  if (!code.device_code) {
    throw new Error(code.error_description ?? "The GitHub sign-in failed.");
  }
  console.log(`Open ${code.verification_uri} and type ${code.user_code}`);

  let interval = code.interval ?? 5;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const reply: TokenReply = await postGithub("/login/oauth/access_token", {
      client_id: clientId,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (reply.access_token) return reply.access_token;
    if (reply.error === "slow_down") {
      interval = reply.interval ?? interval + 5;
    } else if (reply.error !== "authorization_pending") {
      throw new Error(reply.error_description ?? "The GitHub sign-in failed.");
    }
  }
}
```

- `authorization_pending`: the user did not type the code yet. The loop asks again.
- `slow_down`: GitHub wants a longer wait. The loop waits longer.
- Any other error stops the sign-in. For example, the code expires after 15 minutes.

Keep the token in the OS keychain, or in a file that only the user can read. With **Expire user access tokens** cleared, the token does not expire, so the user signs in one time.

### 3. Find the Copilot host

Any GitHub account can sign in, but only some accounts have Copilot. Business and enterprise accounts can also have a different host. `copilot-host.ts` reads both from GitHub:

```typescript
interface CopilotUser {
  chat_enabled?: boolean;
  endpoints?: { api?: string };
}

/**
 * The Copilot API host of the user, or `undefined` when the account has no
 * Copilot. `githubHost` is your GitHub Enterprise domain, or `github.com`.
 */
export async function copilotBaseURL(
  token: string,
  githubHost = "github.com",
): Promise<string | undefined> {
  const api =
    githubHost === "github.com"
      ? "https://api.github.com"
      : `https://api.${githubHost}`;
  const response = await fetch(`${api}/copilot_internal/user`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2025-04-01",
    },
  });
  // A failed lookup uses the default host. Only GitHub can say "no Copilot".
  const user: CopilotUser = response.ok ? await response.json() : {};
  if (user.chat_enabled === false) return undefined;
  if (user.endpoints?.api) return user.endpoints.api.replace(/\/+$/, "");
  return githubHost === "github.com"
    ? "https://api.githubcopilot.com"
    : `https://copilot-api.${githubHost}`;
}
```

- `chat_enabled: false`: the account has no Copilot plan and no seat from an organization.
- `endpoints.api`: the host of this account.
- GitHub Enterprise: pass your domain as `githubHost`. Also put your domain in place of `github.com` in the sign-in URLs of step 2.

`copilot_internal/user` is not a public GitHub API. GitHub can change it.

### 4. Add the Copilot headers

Copilot reads a set of headers on every request. One `wrapFetch` in `copilot-headers.ts` sets all of them for each route:

```typescript
import type { FetchWrapper } from "@tanstack/ai";

/** The Copilot interaction types: the main loop, a subagent, a title, or a compaction. */
type Interaction =
  | "conversation-agent"
  | "conversation-subagent"
  | "conversation-background"
  | "conversation-compaction";

export function copilotHeaders(
  sessionId: string,
  interaction: Interaction = "conversation-agent",
): FetchWrapper {
  return (next) => (input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const items = body.input ?? body.messages ?? [];
    const last = items.at(-1);
    // A user turn has text from the user. A tool result alone is an agent turn.
    const userTurn =
      last?.role === "user" &&
      (!Array.isArray(last.content) ||
        last.content.some(
          (part: { type?: string }) => part.type !== "tool_result",
        ));
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", "my-app/1.0.0");
    headers.set("Openai-Intent", "conversation-edits");
    headers.set("X-GitHub-Api-Version", "2026-08-01");
    headers.set("X-Interaction-Type", interaction);
    headers.set("X-Interaction-Id", sessionId);
    headers.set(
      "x-initiator",
      interaction === "conversation-agent" && userTurn ? "user" : "agent",
    );
    if (/"type":"(image|image_url|input_image)"/.test(JSON.stringify(items))) {
      headers.set("Copilot-Vision-Request", "true");
    }
    if (url.includes("/v1/messages")) {
      // Keep the betas that the adapter already set.
      const betas = headers.get("anthropic-beta");
      const thinking = "interleaved-thinking-2025-05-14";
      headers.set("anthropic-beta", betas ? `${betas},${thinking}` : thinking);
    }
    return next(input, { ...init, headers });
  };
}
```

- `x-initiator`: Copilot bills the requests that a user starts (`user`). Tool loop requests and the other interaction types are `agent`.
- `X-Interaction-Id`: use one stable id for each chat session.
- `X-Interaction-Type`: use `conversation-subagent` in a subagent, `conversation-background` for a title, and `conversation-compaction` for a summary of old messages.
- `Copilot-Vision-Request`: set it when a request has images.

### 5. Call the model

Copilot serves each model on one of three APIs. `GET {baseURL}/models` lists the `supported_endpoints` of each model. Choose the adapter in this order:

1. `/v1/messages`: use `createAnthropicChat` from `@tanstack/ai-anthropic`, with the token and `auth: "bearer"`.
2. `/responses`: use `openaiCompatible` with `api: "responses"`.
3. `/chat/completions`: use `openaiCompatible` without `api` and without `modelOptions`.

The examples below read the sign-in from the web app cookies. In a terminal app, use the saved token and the host from step 3 in place of `signIn`.

#### Claude models

Set the Copilot host as `baseURL`. The Anthropic SDK adds `/v1/messages`. Set `auth: "bearer"`. Do not use `"oauth"`, because it adds the Claude Code headers:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { copilotHeaders } from "./copilot-headers";
import { getCopilotSignIn } from "./copilot-auth";

export async function POST(request: Request) {
  const signIn = getCopilotSignIn(request);
  if (!signIn) return new Response("Sign in with GitHub.", { status: 401 });
  const params = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: createAnthropicChat("claude-sonnet-5-5", signIn.token, {
      baseURL: signIn.baseURL,
      auth: "bearer",
    }),
    messages: params.messages,
    wrapFetch: copilotHeaders(params.threadId),
  });
  return toServerSentEventsResponse(stream);
}
```

`auth: "bearer"` sends `Authorization: Bearer` and no `x-api-key`. With a custom `baseURL`, the adapter sends no mid-conversation betas. It adds cache markers only when you set `promptCache`.

#### OpenAI models

Pass the token as `apiKey`:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { copilotHeaders } from "./copilot-headers";
import { getCopilotSignIn } from "./copilot-auth";

export async function POST(request: Request) {
  const signIn = getCopilotSignIn(request);
  if (!signIn) return new Response("Sign in with GitHub.", { status: 401 });
  const params = await chatParamsFromRequest(request);
  const copilot = openaiCompatible({
    name: "github-copilot",
    baseURL: signIn.baseURL,
    apiKey: signIn.token,
    api: "responses",
    models: ["gpt-6.1-sol"],
  });

  const stream = chat({
    adapter: copilot("gpt-6.1-sol"),
    messages: params.messages,
    modelOptions: { store: false, include: ["reasoning.encrypted_content"] },
    wrapFetch: copilotHeaders(params.threadId),
  });
  return toServerSentEventsResponse(stream);
}
```

- `store: false`: Copilot keeps no responses. With `include`, the stream gives the encrypted reasoning. The adapter sends it back on the next turn when your history keeps it.
- The Chat Completions adapter reads the thinking that Copilot streams on `delta.reasoning_text`.

Click **Sign in with GitHub**, approve, then send a message. The model call goes to the Copilot plan of the user.

## ChatGPT plan

A user with a ChatGPT plan can sign in with ChatGPT instead of an API key. [Sign in with ChatGPT](./openai#sign-in-with-chatgpt-byok) adds the sign-in button and keeps the access token in the `openai` BYOK slot. Your server reads the token like a pasted key:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, openaiByok);
  if (!apiKey) return byokMissing(openaiByok);
  const params = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: createOpenaiChat("gpt-6.1-sol", apiKey),
    messages: params.messages,
    modelOptions: { store: false },
  });
  return toServerSentEventsResponse(stream);
}
```

The ChatGPT route requires `store: false`. Do not set `max_output_tokens`. [Sign in with ChatGPT](./openai#sign-in-with-chatgpt-byok) lists the other limits.

## Example: With Tools

Tools work exactly as they do with any other adapter, for models that support function calling:

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import { z } from "zod";

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({ location: z.string() }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

const deepseek = openaiCompatible({
  baseURL: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  models: ["deepseek-chat"],
});

const stream = chat({
  adapter: deepseek("deepseek-chat"),
  messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
  tools: [getWeather],
});
```

## Next Steps

- [OpenAI Adapter](./openai) - The first-class OpenAI adapter
- [OpenRouter Adapter](./openrouter) - Access 300+ models through one gateway
- [Tools Guide](../tools/tools) - Learn about tools
- [Extending Adapters](../advanced/extend-adapter) - Add custom models to any adapter
