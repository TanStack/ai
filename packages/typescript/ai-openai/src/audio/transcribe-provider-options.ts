import { OpenAITranscriptionModel } from "../openai-adapter";

export interface TranscribeProviderOptions {
  /**
   * The audio file object (not file name) to transcribe, in one of these formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, or webm.
   * https://platform.openai.com/docs/api-reference/audio/createTranscription#audio_createtranscription-file
   */
  file: File;
  /**
   * The model to use for transcription.  
   * https://platform.openai.com/docs/api-reference/audio/createTranscription#audio_createtranscription-model
   */
  model: OpenAITranscriptionModel;

  chunking_strategy: "auto" | {
    type: "server_vad"
    /**
     * Amount of audio to include before the VAD detected speech (in milliseconds).
     * @default 300
     */
    prefix_padding_ms?: number
    /**
     * Duration of silence to detect speech stop (in milliseconds). With shorter values the model will respond more quickly, but may jump in on short pauses from the user.
     * @default 200
     */
    silence_duration_ms: number;
    /**
     * Sensitivity threshold (0.0 to 1.0) for voice activity detection. A higher threshold will require louder audio to activate the model, and thus might perform better in noisy environments.
     * @default 0.5
     */
    threshold?: number
  }
  /**
   * Additional information to include in the transcription response. logprobs will return the log probabilities of the tokens in the response to understand the model's confidence in the transcription. logprobs only works with response_format set to json and only with the models gpt-4o-transcribe and gpt-4o-mini-transcribe. This field is not supported when using gpt-4o-transcribe-diarize.
   */
  include?: string[]
  /**
   * Optional list of speaker names that correspond to the audio samples provided in known_speaker_references[]. Each entry should be a short identifier (for example customer or agent). Up to 4 speakers are supported.
   */
  known_speaker_names: string[];
  /**
   * Optional list of audio samples (as data URLs) that contain known speaker references matching known_speaker_names[]. Each sample must be between 2 and 10 seconds, and can use any of the same input audio formats supported by file.
   */
  known_speaker_references?: string[];
  /**
   * The language of the input audio. Supplying the input language in ISO-639-1 (e.g. en) format will improve accuracy and latency.
   */
  language?: string;
  /**
   * An optional prompt to guide the transcription model's style or to help with uncommon words or phrases.
   */
  prompt?: string;
  /**
  * The format of the output, in one of these options: json, text, srt, verbose_json, vtt, or diarized_json. For gpt-4o-transcribe and gpt-4o-mini-transcribe, the only supported format is json. For gpt-4o-transcribe-diarize, the supported formats are json, text, and diarized_json, with diarized_json required to receive speaker annotations.
  */
  response_format?: "json" | "text" | "srt" | "verbose_json" | "vtt" | "diarized_json"

  /**
   * If set to true, the model response data will be streamed to the client as it is generated using server-sent events
   * Note: Streaming is not supported for the whisper-1 model and will be ignored.
   */
  stream?: boolean;
  /**
   * The sampling temperature, between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. If set to 0, the model will use log probability to automatically increase the temperature until certain thresholds are hit.
   */
  temperature?: number;
  /**
   * The timestamp granularities to populate for this transcription. response_format must be set verbose_json to use timestamp granularities. Either or both of these options are supported: word, or segment. Note: There is no additional latency for segment timestamps, but generating word timestamps incurs additional latency. This option is not available for gpt-4o-transcribe-diarize.
   */
  timestamp_granularities?: Array<"word" | "segment">;
}

export const validateTemperature = (options: TranscribeProviderOptions) => {
  if (options.temperature) {
    if (options.temperature < 0 || options.temperature > 1) {
      throw new Error("Temperature must be between 0 and 1.");
    }
  }
}

export const validateStream = (options: TranscribeProviderOptions) => {
  const unsupportedModels = ["whisper-1"];
  if (options.stream) {
    if (unsupportedModels.includes(options.model)) {
      throw new Error(`The model ${options.model} does not support streaming.`);
    }
  }
}

export const validatePrompt = (options: TranscribeProviderOptions) => {
  const unsupportedModels = ["gpt-4o-transcribe-diarize"];
  if (options.prompt) {
    if (unsupportedModels.includes(options.model)) {
      throw new Error(`The model ${options.model} does not support prompts.`);
    }
  }
}

export const validateKnownSpeakerNames = (options: TranscribeProviderOptions) => {
  if (options.known_speaker_names) {
    if (options.known_speaker_names.length > 4) {
      throw new Error("A maximum of 4 known speaker names are supported.");
    }
  }
};

export const validateInclude = (options: TranscribeProviderOptions) => {
  const unsupportedModels = ["gpt-4o-transcribe-diarize"];
  if (options.include) {
    if (unsupportedModels.includes(options.model)) {
      throw new Error(`The model ${options.model} does not support the include field.`);
    }
  }

  if (options.include && options.response_format !== "json") {
    throw new Error("The include field is only supported when response_format is set to json.");
  }

};