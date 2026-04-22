import type { GeminiLiveClient } from "./client"

/**
 * Audio Worklet Processor for capturing and processing audio
 */
const captureWorkletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 512; // 32ms at 16kHz — per Gemini best practices (20-40ms chunks)
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input.length > 0) {
      const inputChannel = input[0];

      // Buffer the incoming audio
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];

        // When buffer is full, send it to main thread
        if (this.bufferIndex >= this.bufferSize) {
          // Send the buffered audio to the main thread
          this.port.postMessage({
            type: "audio",
            data: this.buffer.slice(),
          });

          // Reset buffer
          this.bufferIndex = 0;
        }
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor("audio-capture-processor", AudioCaptureProcessor);`

/**
 * Audio Playback Worklet Processor for playing PCM audio.
 * Uses an offset tracker instead of slice() to avoid allocations
 * on the real-time audio thread.
 */
const playbackWorkletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.audioQueue = [];
    this.currentOffset = 0; // Track position in current buffer (avoids slice())

    this.port.onmessage = (event) => {
      if (event.data === "interrupt") {
        // Clear the queue on interrupt
        this.audioQueue = [];
        this.currentOffset = 0;
      } else if (event.data instanceof Float32Array) {
        // Add audio data to the queue
        this.audioQueue.push(event.data);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (output.length === 0) return true;

    const channel = output[0];
    let outputIndex = 0;

    // Fill the output buffer from the queue
    while (outputIndex < channel.length && this.audioQueue.length > 0) {
      const currentBuffer = this.audioQueue[0];

      if (!currentBuffer || currentBuffer.length === 0) {
        this.audioQueue.shift();
        this.currentOffset = 0;
        continue;
      }

      const remainingOutput = channel.length - outputIndex;
      const remainingBuffer = currentBuffer.length - this.currentOffset;
      const copyLength = Math.min(remainingOutput, remainingBuffer);

      // Copy audio data to output using offset (no slice allocation)
      for (let i = 0; i < copyLength; i++) {
        channel[outputIndex++] = currentBuffer[this.currentOffset++];
      }

      // If we've consumed the entire buffer, move to the next one
      if (this.currentOffset >= currentBuffer.length) {
        this.audioQueue.shift();
        this.currentOffset = 0;
      }
    }

    // Fill remaining output with silence
    while (outputIndex < channel.length) {
      channel[outputIndex++] = 0;
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);`

function calculateLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize)
  analyser.getByteTimeDomainData(data)

  // Find peak deviation from center (128 is silence)
  // This is more responsive than RMS for voice level meters
  let maxDeviation = 0
  for (const sample of data) {
    const deviation = Math.abs(sample - 128)
    if (deviation > maxDeviation) {
      maxDeviation = deviation
    }
  }

  // Normalize to 0-1 range (max deviation is 128)
  // Scale by 1.5x so that ~66% amplitude reads as full scale
  // This provides good visual feedback without pegging too early
  const normalized = maxDeviation / 128
  return Math.min(1, normalized * 1.5)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return bytes.buffer
}

// Empty arrays for when visualization isn't available
// frequencyBinCount = fftSize / 2 = 1024
const emptyFrequencyData = new Uint8Array(1024)
const emptyTimeDomainData = new Uint8Array(2048).fill(128) // 128 is silence

export class AudioStreamer {
  private audioContext: AudioContext | null = null
  private audioWorklet: AudioWorkletNode | null = null
  private mediaStream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private isStreaming = false
  private sampleRate = 16000
  private client: GeminiLiveClient | null = null

  constructor(client: GeminiLiveClient) {
    this.client = client
  }

  get inputLevel() {
    if (!this.analyser) return 0
    return calculateLevel(this.analyser)
  }

  get inputFrequencyData() {
    if (!this.analyser) return emptyFrequencyData
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  get inputTimeDomainData() {
    if (!this.analyser) return emptyTimeDomainData
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    return data
  }

  get inputSampleRate() {
    return this.sampleRate
  }

  async start() {
    try {
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: this.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      })

      // Check if native AGC is active
      const track = this.mediaStream.getAudioTracks()[0];
      const settings = track?.getSettings();

      if (settings?.autoGainControl) {
        console.warn("Native AGC not supported.")
      }

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.sampleRate
      })

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => { })
      }

      const workletBlob = new Blob([captureWorkletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(workletBlob)

      // Load the audio worklet module
      await this.audioContext.audioWorklet.addModule(workletUrl)

      // Create the audio worklet node
      this.audioWorklet = new AudioWorkletNode(
        this.audioContext,
        "audio-capture-processor"
      )

      // Set up message handling from the worklet
      this.audioWorklet.port.onmessage = (event) => {
        if (!this.isStreaming) return;

        if (event.data.type === "audio") {
          const inputData = event.data.data;
          const pcmData = this.convertToPCM16(inputData);
          const base64Audio = this.arrayBufferToBase64(pcmData);

          // Send to Gemini only if after setup complete
          if (this.client?.isSetupCompelete) {
            this.client.sendAudioMessage(base64Audio);
          }
        }
      };

      // Create analyser for volume detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048 // Larger size for more accurate level detection
      this.analyser.smoothingTimeConstant = 0.3

      // Connect the audio graph
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      source.connect(this.analyser);
      this.analyser.connect(this.audioWorklet);

      // Start streaming
      this.isStreaming = true
      console.log("Audio streaming started");
    } catch (error) {
      console.error("Failed to start audio streaming:", error);
      throw error;
    }
  }

  stop() {
    this.isStreaming = false;

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet.port.close();
      this.audioWorklet = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    console.log("Audio streaming stopped");
  }

  startAudioCapture() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = true
      }
    }
    this.isStreaming = true
  }

  stopAudioCapture() {
    if (this.mediaStream) {
      // Disable tracks rather than stopping them to allow re-enabling
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = false
      }
    }
    this.isStreaming = false
  }

  private convertToPCM16(float32Array: Float32Array): ArrayBuffer {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]!));
      int16Array[i] = sample * 0x7fff;
    }
    return int16Array.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    const binary = String.fromCharCode(...bytes)
    return btoa(binary)
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private gainNode: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private isInitialized = false
  private volume = 1.0
  private sampleRate = 24000

  get outputLevel() {
    if (!this.analyser) return 0
    return calculateLevel(this.analyser)
  }

  get outputFrequencyData() {
    if (!this.analyser) return emptyFrequencyData
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(data)
    return data
  }

  get outputTimeDomainData() {
    if (!this.analyser) return emptyTimeDomainData
    const data = new Uint8Array(this.analyser.fftSize)
    this.analyser.getByteTimeDomainData(data)
    return data
  }

  get outputSampleRate() {
    return this.sampleRate
  }

  async init() {
    if (this.isInitialized) return;

    try {
      // Create audio context at 24kHz to match Gemini
      this.audioContext = new AudioContext({
          sampleRate: this.sampleRate,
      });

      const workletBlob = new Blob([playbackWorkletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(workletBlob)

      // Load the audio worklet module
      await this.audioContext.audioWorklet.addModule(workletUrl)

      // Create worklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor"
      )

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;

      // Create analyser for volume detection
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 2048 // Larger size for more accurate level detection
      this.analyser.smoothingTimeConstant = 0.3

      // Connect nodes
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log("Audio player initialized");
    } catch (error) {
      console.error("Failed to initialize audio player:", error);
      throw error;
    }
  }

  async play(base64Audio: string) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      // Resume audio context if suspended
      if (this.audioContext?.state === "suspended") {
        await this.audioContext.resume();
      }

      // Efficient base64 → binary decode
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 LE to Float32
      const inputArray = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(inputArray.length);
      for (let i = 0; i < inputArray.length; i++) {
        float32Data[i] = inputArray[i]! / 32768;
      }

      // Send to worklet for playback
      this.workletNode?.port.postMessage(float32Data);
    } catch (error) {
      console.error("Error playing audio chunk:", error);
      throw error;
    }
  }

  /* Interrupt playback */
  interrupt() {
    if (this.workletNode) {
      this.workletNode.port.postMessage("interrupt");
    }
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
  }
}