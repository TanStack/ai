# Harness CLI on Cloudflare

A coding agent in your terminal, with its state in your Cloudflare account. The agent runs on your PC and works on your files. The sessions, the keys, the media, and code mode run in one Worker. The models go through your AI Gateway.

Because the state is in the Worker, you can start a session on one PC and continue it on another.

## Run it

From the repo root:

1. `pnpm install`
2. `pnpm build:all` (the example uses the local packages)
3. Deploy the Worker (see [Deploy the Worker](#deploy-the-worker)). To try it first, run it on your PC (see [Run the Worker on your PC](#run-the-worker-on-your-pc)).
4. `pnpm --filter harness-cli-cloudflare-example start`. The first start asks for the Worker URL and the secret.
5. Type `/connect cloudflare`, and paste a Cloudflare API token.

Now send a message.

## Deploy the Worker

Run these commands in `examples/harness-cli-cloudflare`:

1. `pnpm exec wrangler login`
2. `pnpm exec wrangler r2 bucket create tanstack-harness-media`
3. `pnpm exec wrangler secret put HARNESS_SECRET -c worker/wrangler.jsonc`. Type a long random string. The CLI sends it with each request.
4. `pnpm exec wrangler secret put ENCRYPTION_KEY -c worker/wrangler.jsonc`. Type a different long random string. The Worker encrypts the saved keys with it.
5. `pnpm worker:deploy`. The output shows the Worker URL.

Code mode runs each program in a new isolate (Dynamic Workers). A deploy with code mode needs the Workers Paid plan.

### Run the Worker on your PC

`wrangler dev` runs the same Worker on your PC, also on the Free plan:

1. Make the file `worker/.dev.vars` with two lines:

   ```sh
   HARNESS_SECRET=any-long-random-string
   ENCRYPTION_KEY=another-long-random-string
   ```

2. `pnpm worker:dev`. The Worker is at `http://localhost:8787`.
3. Start the CLI, and give `http://localhost:8787` and the `HARNESS_SECRET` value.

The local Worker keeps its data in `worker/.wrangler/`.

## What runs where

| Part                                                       | Where                                       |
| ---------------------------------------------------------- | ------------------------------------------- |
| The messages, the inputs, and the events of a session      | one Durable Object for each session         |
| The settings, the plugin state, the keys, and the sign-ins | the Account Durable Object (keys encrypted) |
| The list of sessions and the media records                 | the Account Durable Object                  |
| The bytes of the media                                     | R2                                          |
| The code mode programs                                     | a new isolate in the Worker                 |
| The models                                                 | Workers AI and your AI Gateway              |
| Images, speech, and voice transcripts                      | Workers AI, through your AI Gateway         |
| The agent, your files, `bash`, Claude Code, and Codex      | your PC                                     |

The CLI keeps the Worker URL and the secret in `~/.tanstack-harness-cloudflare/worker.json`. The file is readable by your user only.

## Connect Cloudflare

1. Type `/connect cloudflare`. The page to make an API token opens in the browser.
2. Make a token with the Workers AI and AI Gateway permissions. Paste it. The input shows dots, not the token.
3. If the token has more than one account, pick the account.
4. Type your AI Gateway ID, or press Enter for `default`.

The Worker keeps the token encrypted, so you connect once, on every PC. `/disconnect cloudflare` deletes it.

The Workers AI models need only the token. The AI Gateway models (Claude, GPT, Grok, and more) also need a payment for that provider in the gateway: your provider keys in the gateway, or Unified Billing.

### Developer shortcut: a `.env` file

1. Copy `.env.example` to `.env`.
2. Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `CLOUDFLARE_AI_GATEWAY_ID` is `default` when you do not set it.

The env vars work when no token is saved with `/connect cloudflare`.

## Pick the model and the effort

- `/model` asks for Workers AI or AI Gateway, then the model. AI Gateway asks for the vendor between them.
- Each model shows its context size, its effort levels, and its price, from `@tanstack/ai-models`.
- A new session starts on `anthropic/claude-sonnet-5` through your gateway. If the gateway cannot pay for Anthropic, pick a Workers AI model.
- `/model demo` answers without a token.
- `/effort` lists the levels of the current model. It sets `chat({ reasoning })`.

## Continue on another PC

1. On the other PC, clone the repo, then do steps 1 and 2 of [Run it](#run-it).
2. Start the CLI, and give the same Worker URL and secret.
3. Run `pnpm --filter harness-cli-cloudflare-example start --resume <id>`, or type `/resume` and pick the session.

These come along: the messages, the model and the effort, the todos and the usage, the keys and the sign-ins, and the media.

These stay on each PC:

- Your files. Clone the project on the other PC too.
- The sessions of Claude Code and Codex.
- The line history, the microphone choice, and the skills in `~/.tanstack-harness-cloudflare/skills`.

An approval that waits when you close the CLI is gone. Two PCs on the same session at the same time do not work: the second PC gets an error.

## Change the Worker

Type `/connect worker`. The screen closes and asks for the new URL and secret. Then it opens the same session id in the new Worker.

## Talk to it

Hold Ctrl+R while you talk, and let go. The words go into the input line. Fix them if needed, then press Enter.

Voice needs `ffmpeg` on the PATH and `/connect cloudflare`. The transcript comes from Whisper on Workers AI. Set `VOICE_LANGUAGE=en` (or your language) for the language you talk in.

## Make media

Ask in words. The agent picks the tool:

- `make an image of a red fox in the snow` (FLUX.1 schnell)
- `read this aloud with the orion voice: hello` (Deepgram Aura 2)

The R2 bucket keeps each file. The screen also saves it in `example-coder-media` with a number. `/open 2` opens file 2, and `/play` plays the last speech.

## Everything else

The rest works as in the [harness CLI example](../harness-cli/README.md): your files and the workspace, Claude Code and Codex, Notion and Linear, skills, the screen, the other modes, and the dashboard.

- Use `harness-cli-cloudflare-example` in the `pnpm --filter` commands.
- The files in your home folder are in `~/.tanstack-harness-cloudflare`, not `~/.tanstack-harness-example`.
- The Notion and Linear sign-ins are in the Worker, encrypted.
- Code mode runs in your Worker (`/code-mode`), not in a QuickJS isolate. The tool calls of a program come back to your PC to run.

## Test the Worker

`pnpm --filter harness-cli-cloudflare-example test` runs the Worker in `workerd` on your PC. The tests run the persistence conformance suite of `@tanstack/ai-persistence` against it, through the same HTTP stores that the CLI uses.
