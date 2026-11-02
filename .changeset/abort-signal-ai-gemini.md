---
'@tanstack/ai-gemini': patch
---

Aborting a call now cancels the Gemini request for Lyria audio, speech, Veo and Omni video creation, the Veo input image download, and chat with agentic video. Before, the request kept running and was billed.
