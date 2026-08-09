import { PDFParse } from "pdf-parse"
import { parseMultiDanfePdf } from "../src/lib/pdf-text-parser"

export default async function handler(req: any, res: any) {
  // Configurar cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { fileBase64, fileName } = body

    if (!fileBase64) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado no corpo da requisição." })
    }

    const pdfBuffer = Buffer.from(fileBase64, "base64")
    
    let text = ""
    let pages: { num: number; text: string }[] = []

    const parser = new PDFParse({ data: pdfBuffer })
    try {
      const textResult = await parser.getText()
      text = textResult?.text || ""
      pages = (textResult?.pages as any) || []
    } finally {
      await parser.destroy()
    }

    const { items, xml, data } = parseMultiDanfePdf(text, fileName, pages)
    
    return res.status(200).json({
      xml: xml,
      fileName: fileName ? fileName.replace(/\.pdf$/i, ".xml") : "convertido.xml",
      parsedData: data,
      items: items,
    })
  } catch (err: any) {
    console.error("Erro na conversão Vercel serverless:", err)
    return res.status(500).json({ error: err.message || "Erro ao processar conversão do PDF no Vercel." })
  }
}
