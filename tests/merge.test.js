import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { inspectPdf, mergePdfBuffers } from "../src/merge.js";

async function makePdf(pageSizes) {
  const document = await PDFDocument.create();
  pageSizes.forEach((size) => document.addPage(size));
  return document.save();
}

describe("PDF merge engine", () => {
  it("combines every page in source order", async () => {
    const first = await makePdf([[200, 300], [201, 301]]);
    const second = await makePdf([[400, 500]]);
    const progress = [];

    const result = await mergePdfBuffers([first, second], (value) => progress.push(value));
    const merged = await PDFDocument.load(result);

    expect(merged.getPageCount()).toBe(3);
    expect(merged.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([
      [200, 300],
      [201, 301],
      [400, 500],
    ]);
    expect(progress).toEqual([
      { completed: 1, total: 2 },
      { completed: 2, total: 2 },
    ]);
  });

  it("reports page counts without changing the source", async () => {
    const source = await makePdf([[200, 300], [400, 500], [600, 700]]);
    await expect(inspectPdf(source)).resolves.toEqual({ pageCount: 3 });
  });

  it("requires at least two documents", async () => {
    const source = await makePdf([[200, 300]]);
    await expect(mergePdfBuffers([source])).rejects.toThrow("at least two");
  });
});
