// AudioRecorder tests call blob.arrayBuffer(), which jsdom lacks — pull in the
// shared polyfill (see packages/ai-client/tests/blob-polyfill.ts).
import '../../ai-client/tests/blob-polyfill'
