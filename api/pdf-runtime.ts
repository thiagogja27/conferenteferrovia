import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

export async function getPDFParse() {
  const runtime = globalThis as any;

  runtime.DOMMatrix ??= DOMMatrix;
  runtime.ImageData ??= ImageData;
  runtime.Path2D ??= Path2D;

  return import("pdf-parse");
}
