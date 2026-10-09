---
'@tanstack/ai-bedrock': patch
---

The Bedrock Converse adapter now sends the images of a tool result as Converse tool result image blocks. Before, the adapter kept only the text of a tool result and dropped its images, so the model did not see them. A tool result with only an image does not get an empty text block.
