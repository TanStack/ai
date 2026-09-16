---
'@tanstack/ai': minor
'@tanstack/ai-elevenlabs': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-devtools': patch
---

Add a `generateVoice()` activity for creating a voice, and refresh the ElevenLabs model lists.

**`generateVoice()`** creates a reusable voice and returns voice ids that `generateSpeech({ voice })` accepts. Providers create voices two ways, and the activity covers both: design one from a text `prompt`, or clone one from `referenceAudio`. Pass a `name` to keep the voice in the provider's library, and read `saved` on each returned voice to see what happened. Comes with `VoiceAdapter` / `BaseVoiceAdapter` for adapter authors, the `voice:request:*` and `voice:usage` devtools events, and a `voice_generation` OpenTelemetry operation name. See [Voice Creation](https://tanstack.com/ai/latest/docs/media/voice-creation).

**Async training stays async.** A provider that trains a clone in the background returns voices with `status: 'training'` rather than holding the request open. Poll those with `getVoiceStatus({ adapter, voiceId })` until the status leaves `training`. A voice with no `status` is usable now, which covers every provider that creates a voice in one call. `getVoiceStatus` is an optional adapter method, so single-call adapters skip it, and calling it against one throws with a message that says why.

**`elevenlabsVoiceDesign()`** implements it on `eleven_ttv_v3` and `eleven_multilingual_ttv_v2`. ElevenLabs' design-then-create two-step is hidden inside the adapter. Only `eleven_ttv_v3` accepts reference audio.

**ElevenLabs models.** `@elevenlabs/elevenlabs-js` moves to `^2.68.0` and `@elevenlabs/client` to `^1.25.0`, which is what makes the new ids type-check. Adds `eleven_v3_conversational` (TTS), `scribe_v2_medical` and `scribe_v2_realtime` (Scribe), and `music_v2_5` and `music_v2` (music). `eleven_turbo_v2`, `eleven_turbo_v2_5`, `eleven_monolingual_v1`, `scribe_v1`, and `music_v1` are still accepted and now carry `@deprecated`.

**Breaking:** `eleven_text_to_sound_v1` is removed from `ELEVENLABS_AUDIO_MODELS`. ElevenLabs dropped it from the catalog and from the SDK's `SfxModelId`, so the adapter can no longer send it. Use `eleven_text_to_sound_v2`.
