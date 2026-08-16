import * as pdfjsLib from 'pdfjs-dist'
import { parseMultiDanfePdf } from './pdf-text-parser'
import { parseNFE } from './nfe-parser'

// Configuração segura do worker do pdf.js no browser
if (typeof window !== 'undefined') {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`
    }
  } catch (e) {
    console.warn('Configuração de worker pdf.js:', e)
  }
}

// Helper para converter ArrayBuffer para Base64 com segurança
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

/**
 * Extrator com pdfjs-dist no navegador
 */
export async function extractPdfTextWithPdfJs(arrayBuffer: ArrayBuffer): Promise<{ text: string; pages: { num: number; text: string }[] }> {
  try {
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`
    }
    const data = new Uint8Array(arrayBuffer)
    const loadingTask = pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
    })
    const pdfDoc = await loadingTask.promise
    const pages: { num: number; text: string }[] = []
    const fullTextParts: string[] = []

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str || '')
        .join(' ')
      pages.push({ num: i, text: pageText })
      fullTextParts.push(pageText)
    }

    if (fullTextParts.length > 0 && fullTextParts.join(' ').trim().length > 10) {
      return {
        text: fullTextParts.join('\n\n'),
        pages,
      }
    }
  } catch (err) {
    console.warn('pdfjs-dist falhou, usando extrator nativo:', err)
  }

  return extractPdfTextClientPure(arrayBuffer)
}

/**
 * Extrator nativo de texto de PDF no navegador para ambientes 100% estáticos (Vercel / SPA)
 * Sem dependência de workers externos ou CDNs remotas.
 */
export async function extractPdfTextClientPure(arrayBuffer: ArrayBuffer): Promise<{ text: string; pages: { num: number; text: string }[] }> {
  const uint8 = new Uint8Array(arrayBuffer)
  const rawString = new TextDecoder('latin1').decode(uint8)

  let extractedText = ''
  const pages: { num: number; text: string }[] = []

  // 1. Tentar descompactar streams /FlateDecode se houver DecompressionStream
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g
  let match: RegExpExecArray | null

  const textBlocks: string[] = []

  while ((match = streamRegex.exec(rawString)) !== null) {
    const streamContent = match[1]
    const streamBytes = new Uint8Array(streamContent.length)
    for (let i = 0; i < streamContent.length; i++) {
      streamBytes[i] = streamContent.charCodeAt(i) & 0xff
    }

    let decodedString = ''

    // Tentar descomprimir via DecompressionStream nativo do browser
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate')
        const writer = ds.writable.getWriter()
        writer.write(streamBytes)
        writer.close()
        const response = new Response(ds.readable)
        const decompressedBuffer = await response.arrayBuffer()
        decodedString = new TextDecoder('latin1').decode(new Uint8Array(decompressedBuffer))
      } catch (e) {
        // Se não for deflate ou falhar, usa o stream original
        decodedString = streamContent
      }
    } else {
      decodedString = streamContent
    }

    // Extrair texto de blocos BT ... ET
    const btRegex = /BT[\s\S]*?ET/g
    let btMatch: RegExpExecArray | null
    while ((btMatch = btRegex.exec(decodedString)) !== null) {
      const btBlock = btMatch[0]
      // Extrair strings em parênteses: (Texto) Tj ou [(T1)(T2)] TJ
      const strRegex = /\((?:[^()\\]|\\.)*\)\s*(?:Tj|'|")|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g
      let strMatch: RegExpExecArray | null
      let lineText = ''

      while ((strMatch = strRegex.exec(btBlock)) !== null) {
        if (strMatch[1]) {
          // Array TJ
          const subMatches = strMatch[1].match(/\((?:[^()\\]|\\.)*\)/g) || []
          const tjStr = subMatches
            .map(s => s.slice(1, -1).replace(/\\([()\\])/g, '$1'))
            .join('')
          if (tjStr.trim()) lineText += (lineText ? ' ' : '') + tjStr
        } else {
          // String simples Tj
          const raw = strMatch[0]
          const content = raw.substring(raw.indexOf('(') + 1, raw.lastIndexOf(')'))
          const clean = content.replace(/\\([()\\])/g, '$1')
          if (clean.trim()) lineText += (lineText ? ' ' : '') + clean
        }
      }

      if (lineText.trim()) {
        textBlocks.push(lineText)
      }
    }
  }

  if (textBlocks.length > 0) {
    extractedText = textBlocks.join('\n')
    pages.push({ num: 1, text: extractedText })
  } else {
    // Fallback: busca por padrões legíveis no binário
    const rawMatches = rawString.match(/\((?:[^()\\]|\\.)*\)/g) || []
    const plainText = rawMatches
      .map(s => s.slice(1, -1))
      .filter(s => s.length > 1 && /[a-zA-Z0-9]/.test(s))
      .join(' ')
    extractedText = plainText
    pages.push({ num: 1, text: plainText })
  }

  return { text: extractedText, pages }
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

  const base64 = arrayBufferToBase64(arrayBuffer)

  // 1. Tentar via endpoint /api/pdf-to-xml (compatível com Express e Vercel Serverless)
  try {
    const response = await fetch('/api/pdf-to-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName }),
    })

    const contentType = response.headers.get('content-type') || ''
    if (response.ok && contentType.includes('application/json')) {
      const resData = await response.json()
      if (resData && (resData.xml || (resData.items && resData.items.length > 0))) {
        const itemsWithNFe = (resData.items || []).map((it: any) => {
          let nfeData = null
          if (it.xml) {
            try {
              nfeData = parseNFE(it.xml)
            } catch (e) {}
          }
          return { ...it, nfeData }
        })

        let nfeData = null
        if (resData.xml) {
          try {
            nfeData = parseNFE(resData.xml)
          } catch (e) {}
        }

        return {
          xml: resData.xml,
          fileName: resData.fileName || (fileName ? fileName.replace(/\.pdf$/i, '.xml') : 'convertido.xml'),
          parsedData: resData.parsedData,
          items: itemsWithNFe,
          nfeData,
        }
      }
    }
  } catch (apiErr) {
    console.warn('API /api/pdf-to-xml indisponível, tentando próximo nível...', apiErr)
  }

  // 2. Tentar via endpoint /api/parse-pdf-text
  try {
    const response = await fetch('/api/parse-pdf-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName }),
    })

    const contentType = response.headers.get('content-type') || ''
    if (response.ok && contentType.includes('application/json')) {
      const res = await response.json()
      if (res && res.text) {
        const { items, xml, data } = parseMultiDanfePdf(res.text || '', fileName, res.pages || [])
        const itemsWithNFe = items.map((it) => {
          let nfeData = null
          if (it.xml) {
            try {
              nfeData = parseNFE(it.xml)
            } catch (e) {}
          }
          return { ...it, nfeData }
        })

        let nfeData = null
        if (xml) {
          try {
            nfeData = parseNFE(xml)
          } catch (e) {}
        }

        return {
          xml,
          fileName: fileName ? fileName.replace(/\.pdf$/i, '.xml') : 'convertido.xml',
          parsedData: data,
          items: itemsWithNFe,
          nfeData,
        }
      }
    }
  } catch (textApiErr) {
    console.warn('API /api/parse-pdf-text indisponível, usando extração local nativa...', textApiErr)
  }

  // 3. Fallback Client-Side no Navegador (com pdfjs-dist para Vercel / Ambientes Estáticos)
  const localRes = await extractPdfTextWithPdfJs(arrayBuffer)
  const { items, xml, data } = parseMultiDanfePdf(localRes.text || '', fileName, localRes.pages || [])
  const itemsWithNFe = items.map((it) => {
    let nfeData = null
    if (it.xml) {
      try {
        nfeData = parseNFE(it.xml)
      } catch (e) {}
    }
    return { ...it, nfeData }
  })

  let nfeData = null
  if (xml) {
    try {
      nfeData = parseNFE(xml)
    } catch (e) {}
  }

  return {
    xml,
    fileName: fileName ? fileName.replace(/\.pdf$/i, '.xml') : 'convertido.xml',
    parsedData: data,
    items: itemsWithNFe,
    nfeData,
  }
}
