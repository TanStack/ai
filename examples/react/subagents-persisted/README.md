# Persisted subagents

This is the blog desk from the subagents example, plus a saved chat.

Refresh the page. The messages and the subagent cards come back. Refresh while a run is still streaming. The same run continues. Send another message after that refresh. The next agent still sees the saved notes.

The saved copy lives in this dev server process. Restart the server and the chat is gone.

## Run it

1. From the repo root, run `pnpm install`.
2. Run `pnpm --filter subagents-persisted dev`.
3. Open http://localhost:3105.
4. Paste an OpenRouter key from https://openrouter.ai/keys.
5. Send a prompt. Refresh the page.

The page still asks for the key. The key stays in this tab only.
