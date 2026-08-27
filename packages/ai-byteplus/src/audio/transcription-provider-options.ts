export interface BytePlusTranscriptionProviderOptions {
  model_name?: string
  audio_format?: string
  /** Inverse text normalisation: render spoken numbers, dates etc. as digits. */
  enable_itn?: boolean
  /** Insert punctuation into the transcript. */
  enable_punc?: boolean
  /** Disfluency removal — drop fillers and stutters. */
  enable_ddc?: boolean
  enable_speaker_info?: boolean
  show_utterances?: boolean
  language?: string
  uid?: string
}
