---
'@tanstack/ai-gemini': patch
---

Gemini-native image calls now use the Interactions API, return the interaction id as result.id, and reject thinkingConfig.thinkingBudget.
