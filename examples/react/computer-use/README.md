# Computer Use

You want the model to do a task on a web page for you. This app opens tanstack.com in Chromium, and the model finds the TanStack AI computer use docs. It reads each screenshot, then clicks, types, and scrolls. Each screenshot shows in the chat.

## Run it

1. From the repo root, run `pnpm install`.
2. Download Chromium one time: `pnpm --filter computer-use exec playwright-core install chromium`.
3. Copy `.env.example` to `.env.local`, then set `OPENAI_API_KEY`. Get a key at https://platform.openai.com/api-keys.
4. Run `pnpm --filter computer-use dev`.
5. Open http://localhost:3100 and click Send.

A Chromium window opens on your machine. Watch the model use it.

If OpenAI marks an action as risky, an approval card shows. Click Approve to run the action, or Decline to skip it.

The server route is `src/routes/api.chat.ts`. The chat UI is `src/routes/index.tsx`.

CAUTION: The browser can open every address that your server can reach. Run this app only on your own machine.
