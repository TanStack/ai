---
'@tanstack/ai-mistral': patch
---

Send the images of a tool result to Mistral as image chunks in the tool message. Before, the adapter sent the content parts of a tool result as one JSON string, so the model got the image data as text and not as an image. Mistral accepts image chunks in a tool message, so the adapter now sends the parts.
