# Persisted subagents

This is the blog desk from the subagents example, plus a saved chat.

Refresh the page. The messages and the subagent cards come back. Refresh while a run is still streaming. The same run continues. Paste the key again, then send another message. The next agent still sees the saved notes.

The researcher calls a Wikipedia tool and shows its reasoning. A refresh keeps the reasoning, the tool call, and the tool result on its card.

The saved copy lives in this dev server process. Restart the server and the chat is gone.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter subagents-persisted dev`.
3. Open http://localhost:3105.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Send a prompt. Refresh the page.

The key stays in memory only. After a refresh, the page asks for it again. The server reads the key only from the page. It does not read `OPENROUTER_API_KEY`.

This example has no login. Every visitor shares one thread. A real app must make sure that the caller owns the thread.
