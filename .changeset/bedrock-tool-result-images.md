---
'@tanstack/ai-bedrock': patch
---

The Bedrock Converse adapter now sends an inline tool-result image as a Converse image block on Amazon Nova and Anthropic Claude 3 and 4. Other models, URL images, and unsupported image types still send only the text. A tool result with only an image does not get an empty text block.
