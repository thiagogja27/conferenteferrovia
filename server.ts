import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { parseDanfeText, parseMultiDanfePdf } from "./src/lib/pdf-text-parser";

dotenv.config();

const app = express();
const PORT = 3000;

// Configurar o parser para aumentar o limite do tamanho dos corpos JSON (PDFs codificados em base64)
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Helper para limpar caracteres de controle inválidos em strings extraídas de PDFs
function cleanControlChars(val: any): any {
  if (typeof val === 'string') {
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  if (Array.isArray(val)) {
    return val.map(cleanControlChars);
  }
  if (val && typeof val === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(val)) {
      cleaned[key] = cleanControlChars(val[key]);
    }
    return cleaned;
  }
  return val;
}

// Endpoint de saúde
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint da API para converter PDF em XML de NF-e usando Regras Locais (Processamento Local e 100% Gratuito)
app.post("/api/pdf-to-xml", async (req, res, next) => {
  try {
    const { fileBase64, fileName } = req.body || {};

    if (!fileBase64) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado no corpo da requisição." });
    }

    // Processamento local ultra rápido baseado em regras e extração de texto
    const pdfBuffer = Buffer.from(fileBase64, "base64");
    
    let text = "";
    let pages: { num: number; text: string }[] = [];

    try {
      const parser = new PDFParse({ data: pdfBuffer });
      try {
        const textResult = await parser.getText();
        text = textResult?.text || "";
        pages = (textResult?.pages as any) || [];
      } finally {
        await parser.destroy();
      }
    } catch (pdfErr: any) {
      console.error(`Erro ao ler buffer do PDF ${fileName}:`, pdfErr);
      return res.status(400).json({
        error: `Não foi possível extrair o texto do PDF "${fileName}". O arquivo pode estar protegido, corrompido ou em formato incompatível.`
      });
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
    console.error("Erro geral na rota de conversão:", err);
    return res.status(500).json({ error: err.message || "Erro ao processar conversão do PDF." });
  }
});

// Endpoint genérico para extração de texto de PDFs (DANFE, MDF-e, Conhecimento de Transporte, etc.)
app.post("/api/parse-pdf-text", async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body || {};
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
    console.error(`Erro ao extrair texto do PDF ${req.body?.fileName}:`, err);
    return res.status(500).json({ error: err.message || "Erro ao extrair texto do PDF." });
  }
});

// Middleware global para garantia de resposta em JSON em caso de erro no Express
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Express Error Handler]", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Erro no servidor ao processar requisição.",
  });
});

// Configurar o Vite como middleware para servir a aplicação React em desenvolvimento
// Em produção, servirá os arquivos estáticos compilados na pasta 'dist'
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Rodando em http://localhost:${PORT}`);
  });
}

startServer();
