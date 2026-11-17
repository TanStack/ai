---
'@tanstack/ai-client': patch
---

`ChatClient.detach()` no longer aborts a send that the client started. It still drops a rejoin tail. Before, React Strict Mode's mount, cleanup, mount replay (which React 19.3 also runs during hydration) aborted a send started on mount, and on a server with no durable log the run was lost. A hidden view now keeps its active send open until that send finishes.
