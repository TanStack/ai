---
'@tanstack/ai-react': patch
---

`useChat` keeps working in a view hidden by React's `<Activity>`. Hiding runs the hook's effect cleanups, and the deferred teardown disposed the client while React kept the hook, so the view came back with a dead client: a reply in flight never resumed and the thread did not load again. When the view shows again, `useChat` now replaces the disposed client with a new one that starts from the messages on screen, loads the thread and rejoins its run.
