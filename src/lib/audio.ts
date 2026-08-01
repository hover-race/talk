import { LipsyncAnalyser } from "./lipsync";

/**
 * Owns the single AudioContext, the hidden playback element, and the analyser tap.
 * Playback and analysis are deliberately separate paths: the element plays the
 * remote track, the analyser only observes it.
 */
class AudioBus {
  ctx: AudioContext | null = null;
  analyser: LipsyncAnalyser | null = null;
  element: HTMLAudioElement | null = null;

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.analyser = new LipsyncAnalyser(this.ctx);
    this.element = new Audio();
    this.element.autoplay = true;
  }

  async attachRemoteStream(stream: MediaStream) {
    this.ensure();
    const el = this.element!;
    const ctx = this.ctx!;

    // Chrome only routes a remote WebRTC track into WebAudio when the stream is
    // also attached to a media element, so both consumers are required.
    el.srcObject = stream;
    await el.play();
    if (ctx.state === "suspended") await ctx.resume();
    this.analyser!.connect(stream);
  }

  detach() {
    this.analyser?.disconnect();
    if (this.element) {
      this.element.srcObject = null;
    }
  }

  setVolume(volume: number) {
    if (this.element) this.element.volume = volume;
  }
}

export const audioBus = new AudioBus();
