---
'@tanstack/ai-anthropic': patch
---

Pass through full JSON Schema for tool input_schema instead of only properties/required, fixing support for discriminated unions and other complex schema constructs.
