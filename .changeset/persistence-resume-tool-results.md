---
'@tanstack/ai-persistence': patch
---

Store a tool result once when a run resumes from a client-tool interrupt. The client posts earlier tool results under interrupt snapshot ids the store never saw, so `withPersistence` appended a second copy and the next provider request failed.

`withPersistence` lets a subagent that a tool call started check the answers to its own interrupts. The parent run does not check them against its own tools and batch, so a child client tool, and two children that wait at once, resume.
