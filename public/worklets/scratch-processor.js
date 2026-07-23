/* global AudioWorkletProcessor, registerProcessor, sampleRate */
/**
 * Desktop Scratch transport — AudioWorklet adapter (Stage A: transport parity only).
 *
 * A thin wrapper around ScratchSamplePlayer (the tested DSP core). It receives the
 * decoded seamless-loop buffer over the port, plays it at rate 1 (normal playback),
 * and reports the authoritative read-head position back to the main thread at a
 * throttled rate. NO scratch rate control, NO marquee interaction here — that is
 * Stage B/C. Kept alive across pause (outputs silence while held) so its read head
 * (the single transport clock) never resets.
 *
 * Loaded as a MODULE worklet so it can import the shared core; if the browser or
 * MIME type does not support that, the main thread falls back to the legacy
 * AudioBufferSourceNode transport (see audioReactive.ts).
 */
import { ScratchSamplePlayer } from "./scratchSamplePlayer.mjs";

const REPORT_BLOCKS = 4; // ~11ms between position reports (128-frame blocks)

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.player = new ScratchSamplePlayer({ sampleRate });
    this.blocks = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "buffer") {
        this.player.setBuffer(
          d.channels,
          d.length,
          d.numChannels,
          d.sampleRate || sampleRate,
        );
      } else if (d.type === "play") {
        this.player.setPlaying(true);
      } else if (d.type === "hold") {
        this.player.setPlaying(false);
      } else if (d.type === "seek") {
        this.player.seek(d.pos);
      } else if (d.type === "rate") {
        this.player.setRate(d.rate); // reserved for Stage B
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (out && out.length > 0) this.player.process(out, out[0].length);
    if (++this.blocks >= REPORT_BLOCKS) {
      this.blocks = 0;
      this.port.postMessage({ type: "pos", pos: this.player.getPosition() });
    }
    return true; // stay alive across pause (held = silence, position preserved)
  }
}

registerProcessor("scratch-processor", ScratchProcessor);
