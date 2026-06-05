// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zAddVoiceIvcResponseModel,
  zAddVoiceResponseModel,
  zAudioWithTimestampsAndVoiceSegmentsResponseModel,
  zAudioWithTimestampsResponseModel,
  zBodyAddALanguageToTheResourceV1DubbingResourceDubbingIdLanguagePost,
  zBodyAddSharedVoiceV1VoicesAddPublicUserIdVoiceIdPost,
  zBodyAddVoiceV1VoicesAddPost,
  zBodyAudioIsolationStreamV1AudioIsolationStreamPost,
  zBodyAudioIsolationV1AudioIsolationPost,
  zBodyCreateANewSpeakerV1DubbingResourceDubbingIdSpeakerPost,
  zBodyCreateANewVoiceFromVoicePreviewV1TextToVoicePost,
  zBodyCreateForcedAlignmentV1ForcedAlignmentPost,
  zBodyDubAVideoOrAnAudioFileV1DubbingPost,
  zBodyDubsAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdDubPost,
  zBodyEditVoiceV1VoicesVoiceIdEditPost,
  zBodyGetSimilarLibraryVoicesV1SimilarVoicesPost,
  zBodyMoveSegmentsBetweenSpeakersV1DubbingResourceDubbingIdMigrateSegmentsPost,
  zBodyRenderAudioOrVideoForTheGivenLanguageV1DubbingResourceDubbingIdRenderLanguagePost,
  zBodySoundGenerationV1SoundGenerationPost,
  zBodySpeechToSpeechStreamingV1SpeechToSpeechVoiceIdStreamPost,
  zBodySpeechToSpeechV1SpeechToSpeechVoiceIdPost,
  zBodySpeechToTextV1SpeechToTextPost,
  zBodyTextToDialogueFullWithTimestamps,
  zBodyTextToDialogueMultiVoiceStreamingV1TextToDialogueStreamPost,
  zBodyTextToDialogueMultiVoiceV1TextToDialoguePost,
  zBodyTextToDialogueStreamWithTimestamps,
  zBodyTextToSpeechFull,
  zBodyTextToSpeechFullWithTimestamps,
  zBodyTextToSpeechStream,
  zBodyTextToSpeechStreamWithTimestamps,
  zBodyTranscribesSegmentsV1DubbingResourceDubbingIdTranscribePost,
  zBodyTranslatesAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdTranslatePost,
  zBodyVideoToMusicV1MusicVideoToMusicPost,
  zDoDubbingResponseModel,
  zDubbingRenderResponseModel,
  zEditVoiceResponseModel,
  zEditVoiceSettingsResponseModel,
  zForcedAlignmentResponseModel,
  zGetLibraryVoicesResponseModel,
  zSegmentCreatePayload,
  zSegmentDubResponse,
  zSegmentMigrationResponse,
  zSegmentTranscriptionResponse,
  zSegmentTranslationResponse,
  zSpeakerCreatedResponse,
  zStreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModel,
  zStreamingAudioChunkWithTimestampsResponseModel,
  zVoiceDesignRequestModel,
  zVoicePreviewsRequestModel,
  zVoicePreviewsResponseModel,
  zVoiceRemixRequestModel,
  zVoiceResponseModel,
  zVoiceSettingsResponseModel,
} from './zod.gen.js'

/**
 * Map of elevenlabs-audio endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const elevenlabsAudioEndpointZodMap: {
  readonly 'v1/audio-isolation': {
    readonly input: typeof zBodyAudioIsolationV1AudioIsolationPost
  }
  readonly 'v1/audio-isolation/stream': {
    readonly input: typeof zBodyAudioIsolationStreamV1AudioIsolationStreamPost
  }
  readonly 'v1/dubbing': {
    readonly input: typeof zBodyDubAVideoOrAnAudioFileV1DubbingPost
    readonly output: typeof zDoDubbingResponseModel
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/dub': {
    readonly input: typeof zBodyDubsAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdDubPost
    readonly output: typeof zSegmentDubResponse
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/language': {
    readonly input: typeof zBodyAddALanguageToTheResourceV1DubbingResourceDubbingIdLanguagePost
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/migrate-segments': {
    readonly input: typeof zBodyMoveSegmentsBetweenSpeakersV1DubbingResourceDubbingIdMigrateSegmentsPost
    readonly output: typeof zSegmentMigrationResponse
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/render/{language}': {
    readonly input: typeof zBodyRenderAudioOrVideoForTheGivenLanguageV1DubbingResourceDubbingIdRenderLanguagePost
    readonly output: typeof zDubbingRenderResponseModel
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/speaker': {
    readonly input: typeof zBodyCreateANewSpeakerV1DubbingResourceDubbingIdSpeakerPost
    readonly output: typeof zSpeakerCreatedResponse
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/speaker/{speaker_id}/segment': {
    readonly input: typeof zSegmentCreatePayload
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/transcribe': {
    readonly input: typeof zBodyTranscribesSegmentsV1DubbingResourceDubbingIdTranscribePost
    readonly output: typeof zSegmentTranscriptionResponse
  }
  readonly 'v1/dubbing/resource/{dubbing_id}/translate': {
    readonly input: typeof zBodyTranslatesAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdTranslatePost
    readonly output: typeof zSegmentTranslationResponse
  }
  readonly 'v1/forced-alignment': {
    readonly input: typeof zBodyCreateForcedAlignmentV1ForcedAlignmentPost
    readonly output: typeof zForcedAlignmentResponseModel
  }
  readonly 'v1/music/video-to-music': {
    readonly input: typeof zBodyVideoToMusicV1MusicVideoToMusicPost
  }
  readonly 'v1/similar-voices': {
    readonly input: typeof zBodyGetSimilarLibraryVoicesV1SimilarVoicesPost
    readonly output: typeof zGetLibraryVoicesResponseModel
  }
  readonly 'v1/sound-generation': {
    readonly input: typeof zBodySoundGenerationV1SoundGenerationPost
  }
  readonly 'v1/speech-to-speech/{voice_id}': {
    readonly input: typeof zBodySpeechToSpeechV1SpeechToSpeechVoiceIdPost
  }
  readonly 'v1/speech-to-speech/{voice_id}/stream': {
    readonly input: typeof zBodySpeechToSpeechStreamingV1SpeechToSpeechVoiceIdStreamPost
  }
  readonly 'v1/speech-to-text': {
    readonly input: typeof zBodySpeechToTextV1SpeechToTextPost
  }
  readonly 'v1/text-to-dialogue': {
    readonly input: typeof zBodyTextToDialogueMultiVoiceV1TextToDialoguePost
  }
  readonly 'v1/text-to-dialogue/stream': {
    readonly input: typeof zBodyTextToDialogueMultiVoiceStreamingV1TextToDialogueStreamPost
  }
  readonly 'v1/text-to-dialogue/stream/with-timestamps': {
    readonly input: typeof zBodyTextToDialogueStreamWithTimestamps
    readonly output: typeof zStreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModel
  }
  readonly 'v1/text-to-dialogue/with-timestamps': {
    readonly input: typeof zBodyTextToDialogueFullWithTimestamps
    readonly output: typeof zAudioWithTimestampsAndVoiceSegmentsResponseModel
  }
  readonly 'v1/text-to-speech/{voice_id}': {
    readonly input: typeof zBodyTextToSpeechFull
  }
  readonly 'v1/text-to-speech/{voice_id}/stream': {
    readonly input: typeof zBodyTextToSpeechStream
  }
  readonly 'v1/text-to-speech/{voice_id}/stream/with-timestamps': {
    readonly input: typeof zBodyTextToSpeechStreamWithTimestamps
    readonly output: typeof zStreamingAudioChunkWithTimestampsResponseModel
  }
  readonly 'v1/text-to-speech/{voice_id}/with-timestamps': {
    readonly input: typeof zBodyTextToSpeechFullWithTimestamps
    readonly output: typeof zAudioWithTimestampsResponseModel
  }
  readonly 'v1/text-to-voice': {
    readonly input: typeof zBodyCreateANewVoiceFromVoicePreviewV1TextToVoicePost
    readonly output: typeof zVoiceResponseModel
  }
  readonly 'v1/text-to-voice/{voice_id}/remix': {
    readonly input: typeof zVoiceRemixRequestModel
    readonly output: typeof zVoicePreviewsResponseModel
  }
  readonly 'v1/text-to-voice/create-previews': {
    readonly input: typeof zVoicePreviewsRequestModel
    readonly output: typeof zVoicePreviewsResponseModel
  }
  readonly 'v1/text-to-voice/design': {
    readonly input: typeof zVoiceDesignRequestModel
    readonly output: typeof zVoicePreviewsResponseModel
  }
  readonly 'v1/voices/{voice_id}/edit': {
    readonly input: typeof zBodyEditVoiceV1VoicesVoiceIdEditPost
    readonly output: typeof zEditVoiceResponseModel
  }
  readonly 'v1/voices/{voice_id}/settings/edit': {
    readonly input: typeof zVoiceSettingsResponseModel
    readonly output: typeof zEditVoiceSettingsResponseModel
  }
  readonly 'v1/voices/add': {
    readonly input: typeof zBodyAddVoiceV1VoicesAddPost
    readonly output: typeof zAddVoiceIvcResponseModel
  }
  readonly 'v1/voices/add/{public_user_id}/{voice_id}': {
    readonly input: typeof zBodyAddSharedVoiceV1VoicesAddPublicUserIdVoiceIdPost
    readonly output: typeof zAddVoiceResponseModel
  }
} = {
  'v1/audio-isolation': { input: zBodyAudioIsolationV1AudioIsolationPost },
  'v1/audio-isolation/stream': {
    input: zBodyAudioIsolationStreamV1AudioIsolationStreamPost,
  },
  'v1/dubbing': {
    input: zBodyDubAVideoOrAnAudioFileV1DubbingPost,
    output: zDoDubbingResponseModel,
  },
  'v1/dubbing/resource/{dubbing_id}/dub': {
    input:
      zBodyDubsAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdDubPost,
    output: zSegmentDubResponse,
  },
  'v1/dubbing/resource/{dubbing_id}/language': {
    input: zBodyAddALanguageToTheResourceV1DubbingResourceDubbingIdLanguagePost,
  },
  'v1/dubbing/resource/{dubbing_id}/migrate-segments': {
    input:
      zBodyMoveSegmentsBetweenSpeakersV1DubbingResourceDubbingIdMigrateSegmentsPost,
    output: zSegmentMigrationResponse,
  },
  'v1/dubbing/resource/{dubbing_id}/render/{language}': {
    input:
      zBodyRenderAudioOrVideoForTheGivenLanguageV1DubbingResourceDubbingIdRenderLanguagePost,
    output: zDubbingRenderResponseModel,
  },
  'v1/dubbing/resource/{dubbing_id}/speaker': {
    input: zBodyCreateANewSpeakerV1DubbingResourceDubbingIdSpeakerPost,
    output: zSpeakerCreatedResponse,
  },
  'v1/dubbing/resource/{dubbing_id}/speaker/{speaker_id}/segment': {
    input: zSegmentCreatePayload,
  },
  'v1/dubbing/resource/{dubbing_id}/transcribe': {
    input: zBodyTranscribesSegmentsV1DubbingResourceDubbingIdTranscribePost,
    output: zSegmentTranscriptionResponse,
  },
  'v1/dubbing/resource/{dubbing_id}/translate': {
    input:
      zBodyTranslatesAllOrSomeSegmentsAndLanguagesV1DubbingResourceDubbingIdTranslatePost,
    output: zSegmentTranslationResponse,
  },
  'v1/forced-alignment': {
    input: zBodyCreateForcedAlignmentV1ForcedAlignmentPost,
    output: zForcedAlignmentResponseModel,
  },
  'v1/music/video-to-music': {
    input: zBodyVideoToMusicV1MusicVideoToMusicPost,
  },
  'v1/similar-voices': {
    input: zBodyGetSimilarLibraryVoicesV1SimilarVoicesPost,
    output: zGetLibraryVoicesResponseModel,
  },
  'v1/sound-generation': { input: zBodySoundGenerationV1SoundGenerationPost },
  'v1/speech-to-speech/{voice_id}': {
    input: zBodySpeechToSpeechV1SpeechToSpeechVoiceIdPost,
  },
  'v1/speech-to-speech/{voice_id}/stream': {
    input: zBodySpeechToSpeechStreamingV1SpeechToSpeechVoiceIdStreamPost,
  },
  'v1/speech-to-text': { input: zBodySpeechToTextV1SpeechToTextPost },
  'v1/text-to-dialogue': {
    input: zBodyTextToDialogueMultiVoiceV1TextToDialoguePost,
  },
  'v1/text-to-dialogue/stream': {
    input: zBodyTextToDialogueMultiVoiceStreamingV1TextToDialogueStreamPost,
  },
  'v1/text-to-dialogue/stream/with-timestamps': {
    input: zBodyTextToDialogueStreamWithTimestamps,
    output: zStreamingAudioChunkWithTimestampsAndVoiceSegmentsResponseModel,
  },
  'v1/text-to-dialogue/with-timestamps': {
    input: zBodyTextToDialogueFullWithTimestamps,
    output: zAudioWithTimestampsAndVoiceSegmentsResponseModel,
  },
  'v1/text-to-speech/{voice_id}': { input: zBodyTextToSpeechFull },
  'v1/text-to-speech/{voice_id}/stream': { input: zBodyTextToSpeechStream },
  'v1/text-to-speech/{voice_id}/stream/with-timestamps': {
    input: zBodyTextToSpeechStreamWithTimestamps,
    output: zStreamingAudioChunkWithTimestampsResponseModel,
  },
  'v1/text-to-speech/{voice_id}/with-timestamps': {
    input: zBodyTextToSpeechFullWithTimestamps,
    output: zAudioWithTimestampsResponseModel,
  },
  'v1/text-to-voice': {
    input: zBodyCreateANewVoiceFromVoicePreviewV1TextToVoicePost,
    output: zVoiceResponseModel,
  },
  'v1/text-to-voice/{voice_id}/remix': {
    input: zVoiceRemixRequestModel,
    output: zVoicePreviewsResponseModel,
  },
  'v1/text-to-voice/create-previews': {
    input: zVoicePreviewsRequestModel,
    output: zVoicePreviewsResponseModel,
  },
  'v1/text-to-voice/design': {
    input: zVoiceDesignRequestModel,
    output: zVoicePreviewsResponseModel,
  },
  'v1/voices/{voice_id}/edit': {
    input: zBodyEditVoiceV1VoicesVoiceIdEditPost,
    output: zEditVoiceResponseModel,
  },
  'v1/voices/{voice_id}/settings/edit': {
    input: zVoiceSettingsResponseModel,
    output: zEditVoiceSettingsResponseModel,
  },
  'v1/voices/add': {
    input: zBodyAddVoiceV1VoicesAddPost,
    output: zAddVoiceIvcResponseModel,
  },
  'v1/voices/add/{public_user_id}/{voice_id}': {
    input: zBodyAddSharedVoiceV1VoicesAddPublicUserIdVoiceIdPost,
    output: zAddVoiceResponseModel,
  },
}

/** Union of valid elevenlabs-audio endpoint ids. */
export type ElevenlabsAudioEndpointId =
  keyof typeof elevenlabsAudioEndpointZodMap
