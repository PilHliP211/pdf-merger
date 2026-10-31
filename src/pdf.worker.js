import { inspectPdf, mergePdfBuffers } from "./merge.js";

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (/encrypted/i.test(message)) {
    return "This PDF is password-protected or encrypted and can't be merged here.";
  }

  if (/invalid|parse|header|object/i.test(message)) {
    return "This file doesn't appear to be a valid, readable PDF.";
  }

  return message || "Something went wrong while reading this PDF.";
}

self.addEventListener("message", async (event) => {
  const { id, action, payload } = event.data;

  try {
    if (action === "inspect") {
      const result = await inspectPdf(payload.buffer);
      self.postMessage({ id, ok: true, result });
      return;
    }

    if (action === "merge") {
      const result = await mergePdfBuffers(payload.buffers, (progress) => {
        self.postMessage({ id, progress });
      });
      const output = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
      self.postMessage({ id, ok: true, result: output }, [output]);
      return;
    }

    throw new Error("Unknown PDF operation.");
  } catch (error) {
    self.postMessage({ id, ok: false, error: friendlyError(error) });
  }
});
