---
'@tanstack/ai-sandbox-local-process': minor
---

A command in `localProcessSandbox` gets only a few variables of the host process: `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`, `TEMP`, `TMP`, and on Windows `SystemRoot`, `ComSpec`, `PATHEXT`, `WINDIR`, and `USERPROFILE`. The workspace secrets and the env of the call still reach it. Provider keys and other secrets of the server do not. If a command needs another variable of the host, set it as a workspace secret or in the env of the call. `passEnv` names more variables of the host for each command, for example `HTTPS_PROXY` or `CLAUDE_CONFIG_DIR`. `scrubEnv` still removes a variable from the env of each command.
