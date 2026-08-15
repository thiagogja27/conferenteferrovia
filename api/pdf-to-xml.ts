import type { IncomingMessage, ServerResponse } from "http";
import { PDFParse } from "pdf-parse";
import { parseMultiDanfePdf } from "../src/lib/pdf-text-parser";

function cleanControlChars(val: any): any {
  if (typeof val === "string") {
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  }
  if (Array.isArray(val)) {
    return val.map(cleanControlChars);
  }
  if (val && typeof val === "object") {
    const cleaned: any = {};
    for (const key of Object.keys(val)) {
      cleaned[key] = cleanControlChars(val[key]);
    }
    return cleaned;
  }
  return val;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const { fileBase64, fileName } = body || {};
    if (!fileBase64) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado no corpo da requisição." });
    }

    const pdfBuffer = Buffer.from(fileBase64, "base64");
    let text = "";
    let pages: { num: number; text: string }[] = [];

    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const textResult = await parser.getText();
      text = textResult?.text || "";
      pages = (textResult?.pages as any) || [];
    } finally {
      await parser.destroy();
    }

    const { items, xml, data } = parseMultiDanfePdf(text, fileName, pages);
    const responseData = cleanControlChars({
      xml: xml,
      fileName: fileName ? fileName.replace(/\.pdf$/i, ".xml") : "convertido.xml",
      parsedData: data,
      items: items,
    });

    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error("Erro na conversão PDF->XML (Vercel Serverless):", err);
    return res.status(500).json({ error: err.message || "Erro ao processar conversão do PDF." });
  }
}
