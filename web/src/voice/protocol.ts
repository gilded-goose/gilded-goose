// Voice on the device (029): the messages between the page and the Whisper worker live in core (`@goose/core/ondevice`),
// tested there. Audio goes in, text comes out, both inside this browser tab. The worker's only downloads are the
// model's files and ONNX Runtime (029, "Network").

export type { Backend, FromWorker, ToWorker } from "@goose/core/ondevice";

// tiny.en only (Joshua, Oct 30): on his iPhone it read the toaster request exactly in 0.42 s on WebGPU; base.en's
// 205 MB crashed the tab.
export const MODEL = "onnx-community/whisper-tiny.en";
