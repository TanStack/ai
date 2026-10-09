---
'@tanstack/ai': patch
---

Fix `uiMessagesToWire` putting the model's answer before the tool result it was based on, so the next turn sees them in the right order.
