---
title: Keep Keys on the Server
id: server-keys
order: 10
description: "Save each user's provider keys on your server with a CredentialStore, and read them in your chat route with storedProviderKeys."
keywords:
  - tanstack ai
  - byok
  - api key
  - CredentialStore
  - storedProviderKeys
  - encryption
---

A key in the browser is gone when the user opens your app on a new device. A background job has no browser to send it. For these cases, save the key on your server, one key for each user and provider.

Do these four steps:

1. Make a credential store.
2. Add a route that saves the key.
3. Send the key from your form.
4. Read the key in the chat route.

## 1. Make a credential store

Start with the memory store:

```typescript
import { memoryCredentialStore } from "@tanstack/ai/byok/server";

export const credentials = memoryCredentialStore();
```

The memory store loses the keys when the process stops. For production, [write a store](#write-a-store-for-production) for your database or your secrets manager.

## 2. Add a route that saves the key

Get the user from your auth, not from the request body:

```typescript
import { credentials } from "./credentials";
import { getUser } from "./auth";

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body: unknown = await request.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("key" in body) ||
    typeof body.key !== "string"
  ) {
    return new Response("Send { key }", { status: 400 });
  }

  await credentials.set({
    scope: { userId: user.id },
    id: "openai",
    credential: { type: "api_key", value: body.key },
  });
  return new Response(null, { status: 204 });
}
```

## 3. Send the key from your form

```tsx
import { useState } from "react";

export function ServerKeyForm() {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void fetch("/api/keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: value.trim() }),
        }).then(() => setValue(""));
      }}
    >
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

## 4. Read the key in the chat route

`storedProviderKeys` reads the key that the user saved:

```typescript
import {
  chat,
  chatParamsFromRequest,
  keyedAdapter,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, storedProviderKeys } from "@tanstack/ai/byok/server";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiByok } from "@tanstack/ai-openai/byok";
import { credentials } from "./credentials";
import { getUser } from "./auth";

const gpt = keyedAdapter(openaiByok, (key) =>
  createOpenaiChat("gpt-6.1-sol", key),
);

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const keys = storedProviderKeys(credentials, { userId: user.id });
  const apiKey = await keys.get(openaiByok);
  if (!apiKey) return byokMissing(openaiByok);

  const params = await chatParamsFromRequest(request);
  const stream = chat({
    adapter: gpt.create(apiKey),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
  });
  return toServerSentEventsResponse(stream);
}
```

How `storedProviderKeys` finds a key:

- It reads the `api_key` credential that the user saved under the provider id.
- If you add `tenantId` to the scope, a user with no key gets the key of the tenant. A tenant key is saved with `tenantId` and no `userId`.
- If there is no saved key, it reads the env var of the provider, here `OPENAI_API_KEY`.
- To give the same keys to your [agents](./byok#keys-inside-agents), pass `keys.get` to `subagents.keys`.

Your users now save a key once, and every device and job uses it.

## Write a store for production

A `CredentialStore` has four methods. You decide where the secrets live:

- A `credentials` table in the database that you already use, next to your chat tables.
- A secrets manager, for example AWS Secrets Manager or Vault.

```ts
import type { CredentialScope } from "@tanstack/ai/byok";

type Credential =
  | { type: "api_key"; value: string }
  | {
      type: "oauth";
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number; // epoch ms
      scopes?: Array<string>;
      client?: {
        clientId: string;
        clientSecret?: string;
        redirectUri?: string;
        issuer?: string;
      };
    };

interface CredentialStore {
  get(key: { scope: CredentialScope; id: string }): Promise<Credential | null>;
  set(entry: {
    scope: CredentialScope;
    id: string;
    credential: Credential;
  }): Promise<void>;
  delete(key: { scope: CredentialScope; id: string }): Promise<void>;
  list(
    scope: CredentialScope,
  ): Promise<Array<{ id: string; type: Credential["type"]; expiresAt?: number }>>;
}
```

Type your store with `defineCredentialStore` from `@tanstack/ai/byok`. `CredentialScope` has `tenantId` and `userId`. It can also have a `threadId`, which the store ignores.

Rules for the keys:

- Key each credential by `scope.tenantId`, `scope.userId`, and `id`. Do not use `scope.threadId`.
- A user credential is not visible at the tenant scope. A tenant credential is not visible at the user scope.
- A scope with no tenant and no user is one bucket that every caller shares. Get the scope from your server-side auth, never from the request body.
- `client` is the OAuth client that the tokens belong to. A token refresh needs it.

Rules for the secrets (`value`, `accessToken`, `refreshToken`, `client.clientSecret`):

- Encrypt them at rest. Keep the encryption key in a KMS or a server-only env var, not in the same database.
- `list` returns ids and types only. It never returns a secret, not even masked.
- `delete` removes the row. Do not keep a soft-deleted copy of the secret.
- Do not write a secret to a log, an error message, or a trace.

The [harness](../harness/provider-keys) uses the same store: pass it to `createHarnessHost({ credentials })`.
