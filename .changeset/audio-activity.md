---
'@tanstack/ai': minor
---

feat: add generateMusic and generateSoundEffects activities

Splits generative audio into two distinct activities so each captures what the caller actually wants and each provider can advertise only the capabilities it supports:

- `generateMusic()` / `createMusicOptions()` for music generation (full songs, backing tracks, instrumentals)
- `generateSoundEffects()` / `createSoundEffectsOptions()` for short non-musical audio (ambience, foley, SFX)
- `MusicAdapter` / `BaseMusicAdapter` (`kind: 'music'`)
- `SoundEffectsAdapter` / `BaseSoundEffectsAdapter` (`kind: 'sound-effects'`)
- `MusicGenerationOptions` / `MusicGenerationResult` / `SoundEffectsGenerationOptions` / `SoundEffectsGenerationResult` types (`GeneratedAudio` shared between them)
- Devtools events: `music:request:started|completed|usage` and `soundEffects:request:started|completed|usage`
