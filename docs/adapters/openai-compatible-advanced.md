---
title: "OpenAI-Compatible: Advanced"
id: openai-compatible-advanced
description: "Advanced setup for the OpenAI-compatible adapter in TanStack AI: headers and query parameters, the Responses API, Azure OpenAI, and model calls paid by a GitHub Copilot or ChatGPT plan."
keywords:
  - tanstack ai
  - openai compatible
  - responses api
  - azure openai
  - github copilot
  - chatgpt plan
  - adapter
---

This page has the details of the OpenAI-compatible adapter. To get a first chat working, start at [OpenAI-Compatible Adapter](./openai-compatible).

## Configuration

`openaiCompatible` accepts every `ClientOptions` field of the OpenAI SDK. `apiKey` and `baseURL` are required, and they are at the top level. The most useful other fields are `defaultHeaders` and `defaultQuery`, for providers that need extra auth or routing parameters:

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

Need a header on each request, or a log of each model call? The adapters that `openaiCompatible` makes support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

## Chat Completions vs Responses

By default, the adapter calls the **Chat Completions** API (`/chat/completions`). For a provider with the **Responses** API, set `api: "responses"`:

```typescript
import { openaiCompatible } from "@tanstack/ai-openai/compatible";

const provider = openaiCompatible({
  baseURL: "https://my-resource.openai.azure.com/openai/v1",
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  models: ["gpt-4o"],
  api: "responses", // default is "chat-completions"
});
```

The `api` choice also sets how `ChatStreamSummarizeAdapter` sends `maxLength`, with any wrapper name:

- Chat Completions uses `max_tokens`.
- Responses uses `max_output_tokens`.

An explicit token limit in `modelOptions` wins over `maxLength`.

Reasoning deltas stream as thinking content. Endpoints on the OpenAI spec from before July 2025 can still send the old event name `response.reasoning.delta`, which the spec replaced with `response.reasoning_text.delta`. The adapter reads both names the same way.

## Azure OpenAI

Use `createAzureOpenaiText` from `@tanstack/ai-openai`. It sets the `api-key` header, the endpoint, the API version, and the deployment name for you:

```typescript
import { createAzureOpenaiText } from "@tanstack/ai-openai";

const adapter = createAzureOpenaiText("gpt-5.6", process.env.AZURE_OPENAI_API_KEY!, {
  resourceName: "my-resource",
  deploymentName: "production-chat",
});
```

See [Azure OpenAI](./openai-advanced#azure-openai) for `azureOpenaiText`, which reads the key and the other values from the environment.

## GitHub Copilot

Your users can pay for model calls with their GitHub Copilot plan. Each user signs in with GitHub. Your server sends the GitHub token of the user to Copilot as `Authorization: Bearer`.

### 1. Create a GitHub OAuth app

1. On GitHub, open **Settings > Developer settings > OAuth Apps**. Click **New OAuth App**.
2. Set **Authorization callback URL** to your callback route, for example `https://my-app.com/auth/github/callback`.
3. Clear **Expire user access tokens**. The examples below keep one token and do not refresh it.
4. If your app runs in a terminal, select **Enable Device Flow**.
5. Set `GITHUB_CLIENT_ID` to the client ID. For a web app, also generate a client secret and set `GITHUB_CLIENT_SECRET` to it.

If you keep **Expire user access tokens** on, a token lasts 8 hours. Refresh it with its refresh token, as [Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) tells you.

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
- To keep the token fully out of the browser, keep it in your session store. Then put only the session id in the cookie.

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
- `Copilot-Vision-Request`: if a request has images, set it.

### 5. Call the model

Copilot serves each model on one of three APIs. `GET {baseURL}/models` lists the `supported_endpoints` of each model. Choose the adapter in this order:

1. `/v1/messages`: use `createAnthropicChat` from `@tanstack/ai-anthropic`, with the token and `auth: "bearer"`.
2. `/responses`: use `openaiCompatible` with `api: "responses"`.
3. `/chat/completions`: use `openaiCompatible` without `api` and without `modelOptions`.

The examples below read the sign-in from the cookies of the web app. In a terminal app, use the saved token and the host from step 3 in place of `signIn`.

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

A user with a ChatGPT plan can sign in with ChatGPT, with no API key. [Sign in with ChatGPT](./openai-advanced#sign-in-with-chatgpt-byok) adds the sign-in button and keeps the access token in the `openai` BYOK slot. Your server reads the token like a pasted key:

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

The ChatGPT route requires `store: false`. Do not set `max_output_tokens`. [Sign in with ChatGPT](./openai-advanced#sign-in-with-chatgpt-byok) lists the other limits.
