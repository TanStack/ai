// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  AddVoiceIVCResponseModelSchema,
  AddVoiceResponseModelSchema,
  AudioWithTimestampsAndVoiceSegmentsResponseModelSchema,
  AudioWithTimestampsResponseModelSchema,
  Body_Add_a_language_to_the_resource_v1_dubbing_resource__dubbing_id__language_postSchema,
  Body_Add_shared_voice_v1_voices_add__public_user_id___voice_id__postSchema,
  Body_Add_voice_v1_voices_add_postSchema,
  Body_Audio_Isolation_Stream_v1_audio_isolation_stream_postSchema,
  Body_Audio_Isolation_v1_audio_isolation_postSchema,
  Body_Create_a_new_speaker_v1_dubbing_resource__dubbing_id__speaker_postSchema,
  Body_Create_a_new_voice_from_voice_preview_v1_text_to_voice_postSchema,
  Body_Create_forced_alignment_v1_forced_alignment_postSchema,
  Body_Dub_a_video_or_an_audio_file_v1_dubbing_postSchema,
  Body_Dubs_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__dub_postSchema,
  Body_Edit_voice_v1_voices__voice_id__edit_postSchema,
  Body_Get_similar_library_voices_v1_similar_voices_postSchema,
  Body_Move_segments_between_speakers_v1_dubbing_resource__dubbing_id__migrate_segments_postSchema,
  Body_Render_audio_or_video_for_the_given_language_v1_dubbing_resource__dubbing_id__render__language__postSchema,
  Body_Sound_Generation_v1_sound_generation_postSchema,
  Body_Speech_to_Speech_Streaming_v1_speech_to_speech__voice_id__stream_postSchema,
  Body_Speech_to_Speech_v1_speech_to_speech__voice_id__postSchema,
  Body_Speech_to_Text_v1_speech_to_text_postSchema,
  Body_Text_to_dialogue__multi_voice__streaming_v1_text_to_dialogue_stream_postSchema,
  Body_Text_to_dialogue__multi_voice__v1_text_to_dialogue_postSchema,
  Body_Transcribes_segments_v1_dubbing_resource__dubbing_id__transcribe_postSchema,
  Body_Translates_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__translate_postSchema,
  Body_Video_to_Music_v1_music_video_to_music_postSchema,
  Body_text_to_dialogue_full_with_timestampsSchema,
  Body_text_to_dialogue_stream_with_timestampsSchema,
  Body_text_to_speech_fullSchema,
  Body_text_to_speech_full_with_timestampsSchema,
  Body_text_to_speech_streamSchema,
  Body_text_to_speech_stream_with_timestampsSchema,
  DoDubbingResponseModelSchema,
  DubbingRenderResponseModelSchema,
  EditVoiceResponseModelSchema,
  EditVoiceSettingsResponseModelSchema,
  ForcedAlignmentResponseModelSchema,
  GetLibraryVoicesResponseModelSchema,
  SegmentCreatePayloadSchema,
  SegmentDubResponseSchema,
  SegmentMigrationResponseSchema,
  SegmentTranscriptionResponseSchema,
  SegmentTranslationResponseSchema,
  SpeakerCreatedResponseSchema,
  StreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModelSchema,
  StreamingAudioChunkWithTimestampsResponseModelSchema,
  VoiceDesignRequestModelSchema,
  VoicePreviewsRequestModelSchema,
  VoicePreviewsResponseModelSchema,
  VoiceRemixRequestModelSchema,
  VoiceResponseModelSchema,
  VoiceSettingsResponseModelSchema,
} from './schemas.gen.js'

/**
 * Map of elevenlabs-audio endpoint id -> self-contained JSON Schemas.
 * Each input/output schema bundles its $ref closure under `$defs`, so it
 * can be handed directly to LLM tool APIs or `z.fromJSONSchema`.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const elevenlabsAudioEndpointSchemaMap: {
  readonly 'v1/audio-isolation': {
    readonly input: typeof Body_Audio_Isolation_v1_audio_isolation_postSchema
  }
  readonly 'v1/audio-isolation/stream': {
    readonly input: typeof Body_Audio_Isolation_Stream_v1_audio_isolation_stream_postSchema
  }
  readonly 'v1/dubbing': {
    readonly input: typeof Body_Dub_a_video_or_an_audio_file_v1_dubbing_postSchema
    readonly output: typeof DoDubbingResponseModelSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/dub': {
    readonly input: typeof Body_Dubs_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__dub_postSchema
    readonly output: typeof SegmentDubResponseSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/language': {
    readonly input: typeof Body_Add_a_language_to_the_resource_v1_dubbing_resource__dubbing_id__language_postSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/migrate-segments': {
    readonly input: typeof Body_Move_segments_between_speakers_v1_dubbing_resource__dubbing_id__migrate_segments_postSchema
    readonly output: typeof SegmentMigrationResponseSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/render/{language}': {
    readonly input: typeof Body_Render_audio_or_video_for_the_given_language_v1_dubbing_resource__dubbing_id__render__language__postSchema
    readonly output: typeof DubbingRenderResponseModelSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/speaker': {
    readonly input: typeof Body_Create_a_new_speaker_v1_dubbing_resource__dubbing_id__speaker_postSchema
    readonly output: typeof SpeakerCreatedResponseSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/speaker/{speaker_id}/segment': {
    readonly input: typeof SegmentCreatePayloadSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/transcribe': {
    readonly input: typeof Body_Transcribes_segments_v1_dubbing_resource__dubbing_id__transcribe_postSchema
    readonly output: typeof SegmentTranscriptionResponseSchema
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/translate': {
    readonly input: typeof Body_Translates_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__translate_postSchema
    readonly output: typeof SegmentTranslationResponseSchema
  }
  readonly 'v1/forced-alignment': {
    readonly input: typeof Body_Create_forced_alignment_v1_forced_alignment_postSchema
    readonly output: typeof ForcedAlignmentResponseModelSchema
  }
  readonly 'v1/music/video-to-music': {
    readonly input: typeof Body_Video_to_Music_v1_music_video_to_music_postSchema
  }
  readonly 'v1/similar-voices': {
    readonly input: typeof Body_Get_similar_library_voices_v1_similar_voices_postSchema
    readonly output: typeof GetLibraryVoicesResponseModelSchema
  }
  readonly 'v1/sound-generation': {
    readonly input: typeof Body_Sound_Generation_v1_sound_generation_postSchema
  }
  readonly 'v1/speech-to-speech/{voice_id}': {
    readonly input: typeof Body_Speech_to_Speech_v1_speech_to_speech__voice_id__postSchema
  }
  readonly 'v1/speech-to-speech/{voice_id}/stream': {
    readonly input: typeof Body_Speech_to_Speech_Streaming_v1_speech_to_speech__voice_id__stream_postSchema
  }
  readonly 'v1/speech-to-text': {
    readonly input: typeof Body_Speech_to_Text_v1_speech_to_text_postSchema
  }
  readonly 'v1/text-to-dialogue': {
    readonly input: typeof Body_Text_to_dialogue__multi_voice__v1_text_to_dialogue_postSchema
  }
  readonly 'v1/text-to-dialogue/stream': {
    readonly input: typeof Body_Text_to_dialogue__multi_voice__streaming_v1_text_to_dialogue_stream_postSchema
  }
  readonly 'v1/text-to-dialogue/stream/with-timestamps': {
    readonly input: typeof Body_text_to_dialogue_stream_with_timestampsSchema
    readonly output: typeof StreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModelSchema
  }
  readonly 'v1/text-to-dialogue/with-timestamps': {
    readonly input: typeof Body_text_to_dialogue_full_with_timestampsSchema
    readonly output: typeof AudioWithTimestampsAndVoiceSegmentsResponseModelSchema
  }
  readonly 'v1/text-to-speech/{voice_id}': {
    readonly input: typeof Body_text_to_speech_fullSchema
  }
  readonly 'v1/text-to-speech/{voice_id}/stream': {
    readonly input: typeof Body_text_to_speech_streamSchema
  }
  readonly 'v1/text-to-speech/{voice_id}/stream/with-timestamps': {
    readonly input: typeof Body_text_to_speech_stream_with_timestampsSchema
    readonly output: typeof StreamingAudioChunkWithTimestampsResponseModelSchema
  }
  readonly 'v1/text-to-speech/{voice_id}/with-timestamps': {
    readonly input: typeof Body_text_to_speech_full_with_timestampsSchema
    readonly output: typeof AudioWithTimestampsResponseModelSchema
  }
  readonly 'v1/text-to-voice': {
    readonly input: typeof Body_Create_a_new_voice_from_voice_preview_v1_text_to_voice_postSchema
    readonly output: typeof VoiceResponseModelSchema
  }
  readonly 'v1/text-to-voice/{voice_id}/remix': {
    readonly input: typeof VoiceRemixRequestModelSchema
    readonly output: typeof VoicePreviewsResponseModelSchema
  }
  readonly 'v1/text-to-voice/create-previews': {
    readonly input: typeof VoicePreviewsRequestModelSchema
    readonly output: typeof VoicePreviewsResponseModelSchema
  }
  readonly 'v1/text-to-voice/design': {
    readonly input: typeof VoiceDesignRequestModelSchema
    readonly output: typeof VoicePreviewsResponseModelSchema
  }
  readonly 'v1/voices/{voice_id}/edit': {
    readonly input: typeof Body_Edit_voice_v1_voices__voice_id__edit_postSchema
    readonly output: typeof EditVoiceResponseModelSchema
  }
  readonly 'v1/voices/{voice_id}/settings/edit': {
    readonly input: typeof VoiceSettingsResponseModelSchema
    readonly output: typeof EditVoiceSettingsResponseModelSchema
  }
  readonly 'v1/voices/add': {
    readonly input: typeof Body_Add_voice_v1_voices_add_postSchema
    readonly output: typeof AddVoiceIVCResponseModelSchema
  }
  readonly 'v1/voices/add/{public_user_id}/{voice_id}': {
    readonly input: typeof Body_Add_shared_voice_v1_voices_add__public_user_id___voice_id__postSchema
    readonly output: typeof AddVoiceResponseModelSchema
  }
} = {
  'v1/audio-isolation': {
    input: Body_Audio_Isolation_v1_audio_isolation_postSchema,
  },
  'v1/audio-isolation/stream': {
    input: Body_Audio_Isolation_Stream_v1_audio_isolation_stream_postSchema,
  },
  'v1/dubbing': {
    input: Body_Dub_a_video_or_an_audio_file_v1_dubbing_postSchema,
    output: DoDubbingResponseModelSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/dub': {
    input:
      Body_Dubs_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__dub_postSchema,
    output: SegmentDubResponseSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/language': {
    input:
      Body_Add_a_language_to_the_resource_v1_dubbing_resource__dubbing_id__language_postSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/migrate-segments': {
    input:
      Body_Move_segments_between_speakers_v1_dubbing_resource__dubbing_id__migrate_segments_postSchema,
    output: SegmentMigrationResponseSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/render/{language}': {
    input:
      Body_Render_audio_or_video_for_the_given_language_v1_dubbing_resource__dubbing_id__render__language__postSchema,
    output: DubbingRenderResponseModelSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/speaker': {
    input:
      Body_Create_a_new_speaker_v1_dubbing_resource__dubbing_id__speaker_postSchema,
    output: SpeakerCreatedResponseSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/speaker/{speaker_id}/segment': {
    input: SegmentCreatePayloadSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/transcribe': {
    input:
      Body_Transcribes_segments_v1_dubbing_resource__dubbing_id__transcribe_postSchema,
    output: SegmentTranscriptionResponseSchema,
  },
  'v1/dubbing/resource/{dubbing_id}/translate': {
    input:
      Body_Translates_all_or_some_segments_and_languages_v1_dubbing_resource__dubbing_id__translate_postSchema,
    output: SegmentTranslationResponseSchema,
  },
  'v1/forced-alignment': {
    input: Body_Create_forced_alignment_v1_forced_alignment_postSchema,
    output: ForcedAlignmentResponseModelSchema,
  },
  'v1/music/video-to-music': {
    input: Body_Video_to_Music_v1_music_video_to_music_postSchema,
  },
  'v1/similar-voices': {
    input: Body_Get_similar_library_voices_v1_similar_voices_postSchema,
    output: GetLibraryVoicesResponseModelSchema,
  },
  'v1/sound-generation': {
    input: Body_Sound_Generation_v1_sound_generation_postSchema,
  },
  'v1/speech-to-speech/{voice_id}': {
    input: Body_Speech_to_Speech_v1_speech_to_speech__voice_id__postSchema,
  },
  'v1/speech-to-speech/{voice_id}/stream': {
    input:
      Body_Speech_to_Speech_Streaming_v1_speech_to_speech__voice_id__stream_postSchema,
  },
  'v1/speech-to-text': {
    input: Body_Speech_to_Text_v1_speech_to_text_postSchema,
  },
  'v1/text-to-dialogue': {
    input: Body_Text_to_dialogue__multi_voice__v1_text_to_dialogue_postSchema,
  },
  'v1/text-to-dialogue/stream': {
    input:
      Body_Text_to_dialogue__multi_voice__streaming_v1_text_to_dialogue_stream_postSchema,
  },
  'v1/text-to-dialogue/stream/with-timestamps': {
    input: Body_text_to_dialogue_stream_with_timestampsSchema,
    output:
      StreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModelSchema,
  },
  'v1/text-to-dialogue/with-timestamps': {
    input: Body_text_to_dialogue_full_with_timestampsSchema,
    output: AudioWithTimestampsAndVoiceSegmentsResponseModelSchema,
  },
  'v1/text-to-speech/{voice_id}': { input: Body_text_to_speech_fullSchema },
  'v1/text-to-speech/{voice_id}/stream': {
    input: Body_text_to_speech_streamSchema,
  },
  'v1/text-to-speech/{voice_id}/stream/with-timestamps': {
    input: Body_text_to_speech_stream_with_timestampsSchema,
    output: StreamingAudioChunkWithTimestampsResponseModelSchema,
  },
  'v1/text-to-speech/{voice_id}/with-timestamps': {
    input: Body_text_to_speech_full_with_timestampsSchema,
    output: AudioWithTimestampsResponseModelSchema,
  },
  'v1/text-to-voice': {
    input:
      Body_Create_a_new_voice_from_voice_preview_v1_text_to_voice_postSchema,
    output: VoiceResponseModelSchema,
  },
  'v1/text-to-voice/{voice_id}/remix': {
    input: VoiceRemixRequestModelSchema,
    output: VoicePreviewsResponseModelSchema,
  },
  'v1/text-to-voice/create-previews': {
    input: VoicePreviewsRequestModelSchema,
    output: VoicePreviewsResponseModelSchema,
  },
  'v1/text-to-voice/design': {
    input: VoiceDesignRequestModelSchema,
    output: VoicePreviewsResponseModelSchema,
  },
  'v1/voices/{voice_id}/edit': {
    input: Body_Edit_voice_v1_voices__voice_id__edit_postSchema,
    output: EditVoiceResponseModelSchema,
  },
  'v1/voices/{voice_id}/settings/edit': {
    input: VoiceSettingsResponseModelSchema,
    output: EditVoiceSettingsResponseModelSchema,
  },
  'v1/voices/add': {
    input: Body_Add_voice_v1_voices_add_postSchema,
    output: AddVoiceIVCResponseModelSchema,
  },
  'v1/voices/add/{public_user_id}/{voice_id}': {
    input:
      Body_Add_shared_voice_v1_voices_add__public_user_id___voice_id__postSchema,
    output: AddVoiceResponseModelSchema,
  },
}
