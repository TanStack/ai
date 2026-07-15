export {
  chatPlugin,
  definePlugin,
  generationPlugin,
} from './activities/plugin/index'
export type {
  AnyPlugin,
  ChatPlugin,
  ChatPluginCallback,
  ChatPluginRequest,
  ChatPluginReturn,
  GenerationPlugin,
  GenerationPluginExecute,
  GenerationPluginOptions,
  GenerationPluginRequest,
  PluginConfig,
  PluginDefinition,
  PluginKind,
} from './activities/plugin/index'
export {
  audioPlugin,
  imagePlugin,
  speechPlugin,
  summarizePlugin,
  transcriptionPlugin,
  videoPlugin,
} from './activities/plugin/media'
export type {
  AudioPluginInput,
  ImagePluginInput,
  MaybeStream,
  SpeechPluginInput,
  SummarizePluginInput,
  TranscriptionPluginInput,
  VideoPluginInput,
} from './activities/plugin/media'
