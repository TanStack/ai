---
'@tanstack/ai': patch
---

Fix `extendAdapter` dropping required parameters after the model (e.g. `apiKey` in `createAnthropicChat`). All factory parameters after the model are now preserved, including labels and optionality.
