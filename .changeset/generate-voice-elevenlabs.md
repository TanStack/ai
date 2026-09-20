---
'@tanstack/ai': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-devtools-core': patch
---

Add a `generateVoice()` activity for creating a voice, and refresh the ElevenLabs model lists.

**`generateVoice()`** creates a reusable voice and returns voice ids that `generateSpeech({ voice })` accepts. Providers create voices two ways, and the activity covers both: design one from a text `prompt`, or derive one from `referenceAudio`. Pass a `name` to keep the voice in the provider's library, and read `saved` on each returned voice to see what happened. Every returned voice also carries `status`, which is `'ready'` on every adapter today. Comes with `VoiceAdapter` / `BaseVoiceAdapter` for adapter authors, the `voice:request:*` and `voice:usage` devtools events, and a `voice_generation` OpenTelemetry operation name. See [Voice Creation](https://tanstack.com/ai/latest/docs/media/voice-creation).

**`listVoices()`** reads an account voice catalog back, for when you did not store the id `generateVoice()` returned. It filters by `origin` (`premade`, `generated`, `cloned`, `professional`). `listVoices` is an optional method on `TTSAdapter` rather than `VoiceAdapter`, because `voice` is a `generateSpeech()` option and that is where the id gets used. Only providers with a per-account catalog implement it; where the voice list is fixed the package publishes it directly (`GeminiTTSVoices` from `@tanstack/ai-gemini`, the `OpenAITTSVoice` union from `@tanstack/ai-openai`), which beats a network call, and calling `listVoices()` on such an adapter throws and points at those exports. `elevenlabsSpeech` implements it against `GET /v1/voices`.

**`elevenlabsVoiceDesign()`** implements voice creation on `eleven_ttv_v3` and `eleven_multilingual_ttv_v2`. ElevenLabs' design-then-create two-step is hidden inside the adapter. Only `eleven_ttv_v3` accepts `referenceAudio`, and it is a design reference rather than a straight clone: a `prompt` is still required, and `modelOptions.promptStrength` balances the description against the recording.

**ElevenLabs models.** `@elevenlabs/elevenlabs-js` moves to `^2.68.0` and `@elevenlabs/client` to `^1.25.0`. The bump is what makes the new music and transcription ids type-check: 2.44 pinned the music request to `modelId?: 'music_v1'` and typed speech-to-text as a two-member `'scribe_v2' | 'scribe_v1'` union. Adds `eleven_v3_conversational` (TTS), `scribe_v2_medical` (Scribe), and `music_v2_5` and `music_v2` (music). `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`, `scribe_v1`, and `music_v1` are still accepted and are commented as deprecated in `model-meta.ts`. `ELEVENLABS_AUDIO_MODELS` is now pinned to the SDK's own `MusicModelId | SfxModelId` with `satisfies`, so an id the SDK drops fails the build instead of the request.

**Breaking:** `eleven_text_to_sound_v1` is removed from `ELEVENLABS_AUDIO_MODELS`. ElevenLabs dropped it from the catalog and from the SDK's `SfxModelId`, so the adapter can no longer send it. Use `eleven_text_to_sound_v2`.
