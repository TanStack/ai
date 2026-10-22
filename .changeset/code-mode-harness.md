---
'@tanstack/ai-code-mode': minor
---

Add `@tanstack/ai-code-mode/harness` with `codeMode({ driver })`: a harness plugin that gives the model one `execute_typescript` tool. The model writes a program that calls several tools, and the program runs in the isolate of any `@tanstack/ai-isolate-*` driver.

- By default, only tools that are safe to run without a question move into code mode. These are server tools with no `needsApproval` and no permission resources, which the permission rules allow in plan mode. A safe tool with `metadata.codeMode: true` always moves.
- `include` picks more tools, also tools with permission checks, such as the coding tools `read_file`, `write_file`, `edit_file`, `patch`, `list_files`, `grep`, `bash`, and `webfetch`. Each call of such a tool in a program gets the same decision from `permissions()` as a direct call. The call runs, or it throws an error with the reason, or the program waits for the user to approve it. The approval is a question wait that `session.answer` answers with `once`, `always`, or `reject`. A program that can wait gets a timeout of 10 minutes by default.
- The session log keeps the result of each checked call. After a stop, the next host runs the program again, and a call that finished before the stop does not run twice. A call that the stop cut, and that is not safe to run again, throws in the program.
- `include` never moves a tool that needs approval, or a tool that the rules deny in the current permission mode. The rules decide again at each turn, so in plan mode the tools that edit stay normal tool calls.
- `directCalls: 'keep'` keeps the moved tools in the model's tool list too. The session setting `directCalls` changes it while the session runs.
- `lazy: true` lists only the tool names and adds `discover_tools`. A tool name that is not a JavaScript identifier gets a safe name inside the program.

`@tanstack/ai-harness` is an optional peer dependency.
