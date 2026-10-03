---
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': minor
'@tanstack/ai-mcp': minor
'@tanstack/ai-acp': minor
---

`@tanstack/ai-harness`: a harness turn can take images, audio, video, and documents, and the harness keeps the media that agents make. Sessions have `putMedia`, `getMedia`, `loadMedia`, and `mediaUrl`, and `mediaPart(record)` sends a stored file with a prompt. The transcript keeps a small `harness-media:<id>` URL, and only the model call gets the bytes. Every `ctx.generateImage`, `ctx.generateSpeech`, `ctx.generateAudio`, and `ctx.generateVideo({ stream: true })` result is saved and published as a `harness.media` event, and the records are saved on the message for history. `defineHarness({ media })` sets `maxBytes`, `kinds`, `accepts`, and `transcribe`, and a file the model cannot read stops the turn with a clear error. `createHarnessHandler` serves uploads, signed media URLs (`mediaSecret`), and file bytes with Range support. The browser client has `upload`, `mediaUrl`, and `loadMedia`, and the session view has media parts and `view.send(text, attachments)`.

`@tanstack/ai-harness-cli`: `@path` in a message attaches a file. Generated media is saved to `./<harness-name>-media` (`--media-dir` to change it), and `--mcp` lets path attachments read the working folder.

`@tanstack/ai-mcp`: the harness MCP server's `chat` tool takes `path`, `url`, and `data` attachments (`filePaths` sets the folders a path may read). Results carry the media of the turn: small images and audio inline, other files as `harness-media://` links that `resources/read` serves.

`@tanstack/ai-acp`: the ACP agent takes image, audio, and resource blocks, and advertises its prompt capabilities.
