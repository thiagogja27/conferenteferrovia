import { PDFParse } from "pdf-parse";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const textResult = await parser.getText();
      const text = textResult?.text || "";
      const pages = (textResult?.pages as any) || [];
      return res.status(200).json({
        text,
        pages,
        fileName: fileName || "documento.pdf",
      });
    } finally {
      await parser.destroy();
    }
  } catch (err: any) {
    console.error("Erro na extração de texto PDF (Vercel Serverless):", err);
    return res.status(500).json({ error: err.message || "Erro ao extrair texto do PDF." });
  }
}
