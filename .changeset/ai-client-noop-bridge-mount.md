---
'@tanstack/ai-client': patch
---

Fix `NoOpChatDevtoolsBridge` missing `mountWithTools`, `notifyToolsChanged`, and `recordStreamId` — the first call to `ChatClient.sendMessage` (with the default no-op devtools factory) threw `this.devtoolsBridge.mountWithTools is not a function` and silently rejected. `mountDevtools()` sets `devtoolsMounted = true` *before* invoking `mountWithTools`, so the failure was non-obvious: the first send died inside the bridge call, while every subsequent send short-circuited past the broken line and worked normally.

Also fix the structural-parity check that was supposed to prevent this drift. `const x: Missing = undefined as never` always typechecks (because `never` is assignable to anything), so the original check was a no-op. Replaced with `type _AssertBridgeParity<T extends never> = T`, which now fails the build the next time the real bridge grows a public method the no-op doesn't stub.
