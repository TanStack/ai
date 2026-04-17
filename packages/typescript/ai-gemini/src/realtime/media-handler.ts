const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
`
const workletBlob = new Blob([workletCode], { type: 'application/javascript' })
const workletUrl = URL.createObjectURL(workletBlob)

export class MediaHandler {

  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null

  private nextStartTime = 0
  private scheduledSources: Array<AudioBufferSourceNode> = []

  // Analyzers
  private inputAnalyser: AnalyserNode | null = null
  private outputAnalyser: AnalyserNode | null = null
  private inputSource: MediaStreamAudioSourceNode | null = null
  private outputGainNode: GainNode | null = null

  private audioWorkletNode: AudioWorkletNode | null = null

  // Empty arrays for when visualization isn't available
  // frequencyBinCount = fftSize / 2 = 1024
  private emptyFrequencyData = new Uint8Array(1024)
  private emptyTimeDomainData = new Uint8Array(2048).fill(128) // 128 is silence

  public isRecording = false

  async initializeAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      await this.audioContext.audioWorklet.addModule(workletUrl)
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {})
    }
  }

  async setupInputAudioAnalysis() {
    await this.initializeAudio()
    if (!this.audioContext || !this.mediaStream) return

    this.inputAnalyser = this.audioContext.createAnalyser()
    this.inputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    this.inputAnalyser.smoothingTimeConstant = 0.3

    this.inputSource = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.inputSource.connect(this.inputAnalyser)
  }

  async setupOutputAudioAnalysis() {
    await this.initializeAudio()
    if (!this.audioContext) return

    this.outputAnalyser = this.audioContext.createAnalyser()
    this.outputAnalyser.fftSize = 2048
    this.outputAnalyser.smoothingTimeConstant = 0.3

    // Create a gain node as a routing hub for all playback sources
    this.outputGainNode = this.audioContext.createGain()
    this.outputGainNode.gain.value = 1

    // Route: outputGainNode → outputAnalyser → destination
    this.outputGainNode.connect(this.outputAnalyser)
    this.outputAnalyser.connect(this.audioContext.destination)
  }

  async startAudio(onAudioData: (audioData: ArrayBuffer) => void) {
    await this.initializeAudio()
    if (!this.audioContext) return

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      })

      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor"
      );

      this.audioWorkletNode.port.onmessage = (event) => {
        if (this.isRecording) {
          const downsampled = this.downsampleBuffer(
            event.data as Float32Array,
            this.audioContext!.sampleRate,
            16000
          );
          const pcm16 = this.convertFloat32ToInt16(downsampled);
          onAudioData(pcm16);
        }
      };

      source.connect(this.audioWorkletNode);

      // Mute local feedback
      const muteGain = this.audioContext.createGain();
      muteGain.gain.value = 0;
      this.audioWorkletNode.connect(muteGain);
      muteGain.connect(this.audioContext.destination);

      this.isRecording = true
    } catch (error) {
      throw new Error(
        `Error starting audio: ${error instanceof Error ? error.message : error}`,
      )
    }
  }

  stopAudio() {
    this.isRecording = false
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }
  }

  startAudioCapture() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = true
      }
    }
    this.isRecording = true
  }

  stopAudioCapture() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = false
      }
    }
    this.isRecording = false
  }

  playAudio(arrayBuffer: ArrayBuffer) {
    if (!this.audioContext) return;
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }

    const pcmData = new Int16Array(arrayBuffer);
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i]! / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    // Route through output analyser if available, otherwise direct to destination
    const outputTarget = this.outputGainNode ?? this.audioContext.destination;
    source.connect(outputTarget);

    const now = this.audioContext.currentTime;
    this.nextStartTime = Math.max(now, this.nextStartTime);
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx > -1) this.scheduledSources.splice(idx, 1);
    };
  }

  stopAudioPlayback() {
    this.scheduledSources.forEach((s) => {
      try {
        s.stop();
      } catch (e) { }
    });
    this.scheduledSources = [];
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  /**
   * Returns the current input (microphone) audio level as a normalized value [0, 1].
   */
  getInputLevel(): number {
    if (!this.inputAnalyser) return 0

    const data = new Uint8Array(this.inputAnalyser.frequencyBinCount)
    this.inputAnalyser.getByteFrequencyData(data)

    let sum = 0
    for (const i of data) {
      sum += i
    }
    return sum / (data.length * 255)
  }

  // Helper to calculate audio level from time domain data
  // Uses peak amplitude which is more responsive for voice audio meters
  calculateLevel(analyser: AnalyserNode): number {
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

  get inputLevel() {
    if (!this.inputAnalyser) return 0
    return this.calculateLevel(this.inputAnalyser)
  }

  get outputLevel() {
    if (!this.outputAnalyser) return 0
    return this.calculateLevel(this.outputAnalyser)
  }

  get inputFrequencyData() {
    if (!this.inputAnalyser) return this.emptyFrequencyData
    const data = new Uint8Array(this.inputAnalyser.frequencyBinCount)
    this.inputAnalyser.getByteFrequencyData(data)
    return data
  }

  get outputFrequencyData() {
    if (!this.outputAnalyser) return this.emptyFrequencyData
    const data = new Uint8Array(this.outputAnalyser.frequencyBinCount)
    this.outputAnalyser.getByteFrequencyData(data)
    return data
  }

  get inputTimeDomainData() {
    if (!this.inputAnalyser) return this.emptyTimeDomainData
    const data = new Uint8Array(this.inputAnalyser.fftSize)
    this.inputAnalyser.getByteTimeDomainData(data)
    return data
  }

  get outputTimeDomainData() {
    if (!this.outputAnalyser) return this.emptyTimeDomainData
    const data = new Uint8Array(this.outputAnalyser.fftSize)
    this.outputAnalyser.getByteTimeDomainData(data)
    return data
  }

  // Utils
  downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number) {
    if (outSampleRate === sampleRate) return buffer;
    const ratio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0,
        count = 0;
      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < buffer.length;
        i++
      ) {
        accum += buffer[i]!;
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
      buf[l] = Math.min(1, Math.max(-1, buffer[l]!)) * 0x7fff;
    }
    return buf.buffer;
  }

  convertBase64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}