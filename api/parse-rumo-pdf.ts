import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
import {
  processRumoExtractedText,
  generateRumoWorkbook,
} from "../src/lib/rumo-pdf-parser";

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
    let text = "";
    try {
      const textResult = await parser.getText();
      text = textResult?.text || "";
    } finally {
      await parser.destroy();
    }

    if (!text || text.trim() === "") {
      return res.status(400).json({
        error: "O PDF parece estar vazio ou contém apenas imagens. Não foi possível extrair texto legível."
      });
    }

    const result = processRumoExtractedText(text, fileName || "resumo.pdf");
    if (!result.aoaData || result.aoaData.length <= 1) {
      return res.status(400).json({
        error: "Não foi possível extrair dados estruturados da composição ferroviária. Verifique se o arquivo corresponde ao Resumo Rumo / TEAG / Baltech."
      });
    }

    // Gera o arquivo Excel
    const wb = generateRumoWorkbook(result.aoaData, result.desmembreRows, result.cnpjData);
    const excelBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });

    return res.status(200).json({
      message: "Arquivo processado e planilha gerada com sucesso!",
      fileData: excelBase64,
      fileName: result.outputFileName,
      tableData: result.aoaData,
      desmembreCount: result.desmembreCount,
      desmembreRows: result.desmembreRows,
      desmembreRemetenteCount: result.desmembreRemetenteCount,
      cnpjData: result.cnpjData,
      prefixo: result.prefixo,
      trainName: result.trainName,
      totalWagons: result.totalWagons,
      totalWeightKg: result.totalWeightKg,
    });
  } catch (err: any) {
    console.error("Erro no processamento do PDF Rumo (Vercel Serverless):", err);
    return res.status(500).json({
      error: err.message || "Erro inesperado ao converter PDF de composição."
    });
  }
}
