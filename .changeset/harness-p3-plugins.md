---
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai': minor
---

Harness plugins can now do everything a Claude Code style agent needs.

- **Plugin API.** `setup` can return `commands` (`defineCommand`, with typed input), `config` (`configOption.select`, `.boolean`, `.text`, `.number`), `contribute` for extension points (`createExtensionPoint`), and `adapter` to pick the main model. The setup context adds `collect`, typed events (`createPluginEvent`, `emit`, `on`), `state` (saved in the metadata store, published as `STATE_SNAPSHOT`), `config`, `credentials`, and `session` (`ask`, `prompt`, `transcript`, `setConfig`). Prompts can be functions called for each turn.
- **Session.** `session.command`, `session.commands`, `session.setConfig`, `session.config`, `session.answer`, and `session.inspect`. The protocol accepts `command`, `answer`, and `config` inputs.
- **Auth.** `oauthConnector` adds `connect:<id>` and `disconnect:<id>` commands and gives tools a fresh token. The OAuth runner (`loopbackLogin`, `deviceLogin`, `createPkce`, `exchangeCode`, `refreshCredential`) uses PKCE S256 and a single-use loopback on `127.0.0.1`. Tools that need a missing credential emit `harness.auth_required`.
- **First-party plugins** in `@tanstack/ai-harness/plugins`: `permissions` (with `default`, `plan`, `acceptEdits`, and `bypass` modes and the `PermissionRules` extension point), `workspaceTools`, `todos`, `modelPicker`, `projectInstructions`, `fileCommands`, `compact`, and `usage`.
- **`@tanstack/ai-persistence`** adds the optional `credentials` store (`CredentialStore`, `defineCredentialStore`) and compare-and-set on the memory metadata store. **`@tanstack/ai`** adds optional `getVersioned` and `setIf` to `MetadataStore`.
- **CLI.** Plugin commands, `/config`, `/connect`, and `/disconnect`. Questions from plugins are answered on the next line. Sign-in links open in the browser.
