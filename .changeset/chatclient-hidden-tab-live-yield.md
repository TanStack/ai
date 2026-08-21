---
'@tanstack/ai-client': patch
---

Fix live stream stalling in background browser tabs.

The live path skips the per-chunk `setTimeout(0)` while `document.hidden` is true, so stream pull is not paced by the hidden-tab timer clamp. Visible tabs, Node, and resume replay (`defer: false`) are unchanged.
