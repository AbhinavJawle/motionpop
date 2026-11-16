/**
 * The AudioWorklet processor of the recorder (design §6), as source text: it is loaded from a
 * Blob URL, so it needs no bundler entry. It posts copies of the first input channel; the
 * main thread decides whether to keep them (pause drops them).
 */
export const RECORDER_WORKLET = `
class MpRecorder extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('mp-recorder', MpRecorder);
`;
