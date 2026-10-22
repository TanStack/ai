---
'@tanstack/ai-persistence': patch
---

`withPersistence` lets a subagent that a tool call started check the answers to its own interrupts. The parent run does not check them against its own tools and batch, so a child client tool, and two children that wait at once, resume.
