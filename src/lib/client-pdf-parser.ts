import * as pdfjsLib from 'pdfjs-dist'
import { parseMultiDanfePdf } from './pdf-text-parser'
import { parseNFE } from './nfe-parser'

// Configurar worker do PDF.js para navegadores
if (typeof window !== 'undefined') {
  try {
    const version = pdfjsLib.version || '4.10.38'
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`
  } catch (e) {
    console.warn('Não foi possível definir pdf.worker.min.mjs:', e)
  }
}

export async function parsePdfClientSide(fileOrBuffer: File | ArrayBuffer | Uint8Array, fileName: string) {
  let arrayBuffer: ArrayBuffer
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer()
  } else if (fileOrBuffer instanceof Uint8Array) {
    arrayBuffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    ) as ArrayBuffer
  } else {
    arrayBuffer = fileOrBuffer
  }

  let pdfDoc: any = null
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    })
    pdfDoc = await loadingTask.promise
  } catch (err) {
    // Fallback caso o worker falhe
    console.warn('Tentando carregar PDF sem worker em background:', err)
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useWorkerFetch: false,
    } as any)
    pdfDoc = await loadingTask.promise
  }

  const numPages = pdfDoc.numPages
  const pages: { num: number; text: string }[] = []
  let fullText = ""

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(" ")
    pages.push({ num: i, text: pageText })
    fullText += (fullText ? "\n" : "") + pageText
  }

  const { items, xml, data } = parseMultiDanfePdf(fullText, fileName, pages)

  const itemsWithNFe = items.map((it) => {
    let nfeData = null
    if (it.xml) {
      try {
        nfeData = parseNFE(it.xml)
      } catch (e) {}
    }
    return {
      ...it,
      nfeData,
    }
  })

  let nfeData = null
  if (xml) {
    try {
      nfeData = parseNFE(xml)
    } catch (e) {}
  }

  return {
    xml,
    fileName: fileName ? fileName.replace(/\.pdf$/i, ".xml") : "convertido.xml",
    parsedData: data,
    items: itemsWithNFe,
    nfeData,
  }
}
