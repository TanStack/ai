<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://tanstack.com/api/readme/ai.png?theme=dark">
  <img alt="TanStack AI" src="https://tanstack.com/api/readme/ai.png">
</picture>

# @tanstack/ai-sixtydb

Generate speech with 60db workspace voices through TanStack AI.

Set `SIXTYDB_API_KEY` on the server and select a voice from that workspace.
The adapter returns WAV by default, or raw PCM16 at 24 kHz with `format: 'pcm'`.

See the [60db adapter documentation](https://tanstack.com/ai/latest/docs/adapters/sixtydb) for setup and supported configuration.
