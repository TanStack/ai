// Import all test runners
import { runCST } from './cst-chat-stream'
import { runOST } from './ost-one-shot-text'
import { runTLS } from './tls-tool-server'
import { runAPR } from './apr-approval-flow'
import { runSTR } from './str-structured-output'
import { runAGS } from './ags-agentic-structured'
import { runSUM } from './sum-summarize'
import { runSMS } from './sms-summarize-stream'
import { runIMG } from './img-image-generation'
import { runTTS } from './tts-text-to-speech'
import { runTRN } from './trn-transcription'
import { runMMJ, runMMP } from './mmi-multimodal-image'
import { runMMS, runMMT } from './mms-multimodal-structured'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * Adapter capability types
 */
export type AdapterCapability =
  | 'text'
  | 'summarize'
  | 'image'
  | 'tts'
  | 'transcription'

/**
 * Definition for a test
 */
export interface TestDefinition {
  /** 3-letter acronym identifier (uppercase) */
  id: string
  /** Human-readable name */
  name: string
  /** Brief description of what the test does */
  description: string
  /** Function to run the test */
  run: (ctx: AdapterContext) => Promise<TestOutcome>
  /** Required adapter capabilities (defaults to ['text']) */
  requires: Array<AdapterCapability>
  /** If true, test is skipped unless explicitly requested */
  skipByDefault?: boolean
}

/**
 * Registry of all available tests
 */
export const TESTS: Array<TestDefinition> = [
  {
    id: 'CST',
    name: 'Chat Stream',
    description: 'Streaming chat completion with basic prompt',
    run: runCST,
    requires: ['text'],
  },
  {
    id: 'OST',
    name: 'One-Shot Text',
    description: 'Non-streaming text completion (stream: false)',
    run: runOST,
    requires: ['text'],
  },
  {
    id: 'TLS',
    name: 'Tool Server',
    description: 'Tool execution with server-side handler',
    run: runTLS,
    requires: ['text'],
  },
  {
    id: 'APR',
    name: 'Approval Flow',
    description: 'Tool execution requiring user approval',
    run: runAPR,
    requires: ['text'],
  },
  {
    id: 'STR',
    name: 'Structured Output',
    description: 'Generate structured output with Zod schema',
    run: runSTR,
    requires: ['text'],
  },
  {
    id: 'AGS',
    name: 'Agentic Structured',
    description: 'Structured output with tool calls in agentic flow',
    run: runAGS,
    requires: ['text'],
  },
  {
    id: 'SUM',
    name: 'Summarize',
    description: 'Text summarization',
    run: runSUM,
    requires: ['summarize'],
  },
  {
    id: 'SMS',
    name: 'Summarize Stream',
    description: 'Streaming text summarization',
    run: runSMS,
    requires: ['summarize'],
  },
  {
    id: 'IMG',
    name: 'Image Generation',
    description: 'Generate images from text prompt',
    run: runIMG,
    requires: ['image'],
    skipByDefault: true, // Skip unless explicitly requested
  },
  {
    id: 'TTS',
    name: 'Text-to-Speech',
    description: 'Generate speech audio from text',
    run: runTTS,
    requires: ['tts'],
    skipByDefault: true, // Skip unless explicitly requested
  },
  {
    id: 'TRN',
    name: 'Transcription',
    description: 'Transcribe audio to text',
    run: runTRN,
    requires: ['transcription'],
    skipByDefault: true, // Skip unless explicitly requested
  },
  {
    id: 'MMJ',
    name: 'Multimodal JPEG',
    description:
      'Describe a JPEG image (meme with man, React icon, code/email text)',
    run: runMMJ,
    requires: ['text'],
  },
  {
    id: 'MMP',
    name: 'Multimodal PNG',
    description: 'Describe a PNG image (beach scene with AG UI text)',
    run: runMMP,
    requires: ['text'],
  },
  {
    id: 'MMS',
    name: 'Multimodal Structured JPEG',
    description: 'Describe a JPEG image with structured JSON output',
    run: runMMS,
    requires: ['text'],
  },
  {
    id: 'MMT',
    name: 'Multimodal Structured PNG',
    description: 'Describe a PNG image with structured JSON output',
    run: runMMT,
    requires: ['text'],
  },
]

/**
 * Get test definition by ID (case-insensitive)
 */
export function getTest(id: string): TestDefinition | undefined {
  return TESTS.find((t) => t.id.toLowerCase() === id.toLowerCase())
}

/**
 * Get all test IDs
 */
export function getTestIds(): Array<string> {
  return TESTS.map((t) => t.id)
}

/**
 * Get tests that run by default (excluding skipByDefault tests)
 */
export function getDefaultTests(): Array<TestDefinition> {
  return TESTS.filter((t) => !t.skipByDefault)
}
