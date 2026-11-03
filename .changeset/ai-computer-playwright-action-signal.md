---
'@tanstack/ai-computer-playwright': minor
---

`screenshot`, `zoom`, and `navigate` reject when their signal aborts. Playwright takes no signal, so the page call continues in the background. The factory closes the new browser context when `create` aborts during the start URL.
