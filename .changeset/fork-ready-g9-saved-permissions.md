---
'@tanstack/ai-harness': minor
---

`permissions()` has a `/permissions` command. It lists the saved "always" rules of the project. `/permissions forget <n>` deletes one, and the open session asks again at the next matching call. Server code can do the same with `listSavedPermissions` and `deleteSavedPermission` from `@tanstack/ai-harness/plugins`.
