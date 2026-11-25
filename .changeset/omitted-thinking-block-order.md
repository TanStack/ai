---
'@tanstack/ai': patch
---

Keep a turn's block order when a thinking block arrives as an empty delta and then its signature, as Anthropic streams thinking whose text is omitted. The empty delta noted the step's position a second time, which dropped the order. A thinking block that followed a provider-executed tool (web_search, web_fetch) was then replayed before that tool, and Anthropic refused its signature with a 400.
