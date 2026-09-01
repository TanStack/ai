---
'@tanstack/ai-bedrock': patch
---

fix: forward usage from Converse structuredOutputStream()

`ConverseTextAdapter.structuredOutputStream()` iterated the Converse event stream without a `metadata` branch, so the trailing usage event was ignored and `RUN_FINISHED` carried no token counts on the streaming structured-output path. The normal chat path (`processConverseStream`) and the non-stream `structuredOutput()` already handled it; this brings the third path in line.
