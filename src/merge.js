import { PDFDocument } from "pdf-lib";

export async function inspectPdf(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  return { pageCount: document.getPageCount() };
}

export async function mergePdfBuffers(buffers, onProgress = () => {}) {
  if (!Array.isArray(buffers) || buffers.length < 2) {
    throw new Error("Choose at least two PDFs to merge.");
  }

  const merged = await PDFDocument.create();

  for (let index = 0; index < buffers.length; index += 1) {
    const source = await PDFDocument.load(buffers[index], { updateMetadata: false });
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
    onProgress({ completed: index + 1, total: buffers.length });
  }

  merged.setTitle("Merged PDF");
  merged.setCreator("phillip.byram.dev PDF Merger");
  merged.setProducer("pdf-lib");
  merged.setCreationDate(new Date());
  merged.setModificationDate(new Date());

  return merged.save();
}
