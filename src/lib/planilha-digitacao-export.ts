import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { extractCfopFromNote, extractMercadoria, parseNFE } from '@/lib/nfe-parser'
import { extractPdfTextWithPdfJs, parsePdfClientSide } from '@/lib/client-pdf-parser'
import { parseMultiDanfePdf } from '@/lib/pdf-text-parser'
import type { RumoExtractionResult } from '@/lib/rumo-pdf-parser'
import { formatCnpj, normalizeVliWagonPlate, type VliExtractionResult } from '@/lib/vli-excel-parser'
import { resolveDestinatarioCadastro } from '@/lib/cadastros-logisticos-service'

export const PLANILHA_DIGITACAO_HEADERS = [
  'Vagão',
  'Bruto',
  'NFe',
  'Data NFe',
  'Rateio',
  'Chave NF',
  'Mercadoria',
  'Fornecedor',
  'Operação',
  'CNPJ Dest.',
  'Data',
  'Hora',
  'CFOP',
] as const

export interface PlanilhaDigitacaoRow {
  vagao: string
  bruto: string | number
  nfe: string
  dataNfe: string
  rateio: string | number
  chaveNf: string
  mercadoria: string
  fornecedor: string
  operacao: string
  cnpjDest: string
  data: string
  hora: string
  cfop: string
}

export interface LoadedNoteSummary {
  fileName: string
  chave: string
  cfop: string
}

export function normalizeChaveAcesso(raw?: string | null): string {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 44) return digits
  const match = digits.match(/\d{44}/)
  return match ? match[0] : digits
}

function splitDateAndTime(rawDateTime?: string): { data: string; hora: string } {
  const clean = (rawDateTime || '').trim()
  if (!clean) return { data: '', hora: '' }

  const dateTimeMatch = clean.match(/(\d{2}[/.-]\d{2}[/.-]\d{2,4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/)
  if (dateTimeMatch) {
    return {
      data: (dateTimeMatch[1] || '').replace(/-/g, '/'),
      hora: dateTimeMatch[2] || '',
    }
  }

  const timeOnlyMatch = clean.match(/\b(\d{2}:\d{2}(?::\d{2})?)\b/)
  if (timeOnlyMatch) {
    return { data: '', hora: timeOnlyMatch[1] }
  }

  return { data: clean, hora: '' }
}

function parseExcelWeightValue(val: string | number | undefined): string | number {
  if (val === undefined || val === null || val === '') return ''
  if (typeof val === 'number') return isNaN(val) ? '' : Math.round(val * 1000) / 1000

  const str = String(val).trim()
  if (!str) return ''

  if (/^\d+$/.test(str)) {
    return parseInt(str, 10)
  }

  if (str.includes(',')) {
    const num = parseFloat(str.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    return isNaN(num) ? str : Math.round(num * 1000) / 1000
  }

  const dotParts = str.split('.')
  if (dotParts.length === 2 && dotParts[1].length !== 3) {
    const num = parseFloat(str)
    return isNaN(num) ? str : Math.round(num * 1000) / 1000
  }

  const fallback = parseFloat(str.replace(/\s/g, '').replace(/\./g, ''))
  return isNaN(fallback) ? str : Math.round(fallback * 1000) / 1000
}

function formatBrutoSemVirgula(val: string | number | undefined): string | number {
  const parsed = parseExcelWeightValue(val)
  if (typeof parsed !== 'number' || isNaN(parsed)) return parsed
  if (parsed > 0 && parsed < 500) {
    return Math.round(parsed * 1000)
  }
  return Math.round(parsed)
}

function formatNfeSemZeros(rawNfe?: string): string {
  const clean = (rawNfe || '').trim()
  if (!clean) return ''
  if (/^\d+$/.test(clean)) {
    return clean.replace(/^0+/, '') || '0'
  }
  return clean.replace(/\b0+(\d+)/g, '$1')
}

function resolveCnpjDest(rawDest?: string): string {
  const clean = (rawDest || '').trim()
  if (!clean || clean === '-') return ''

  const cnpjMatch = clean.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)
  if (cnpjMatch) {
    const digits = cnpjMatch[0].replace(/\D/g, '')
    if (digits.length === 14) return formatCnpj(digits)
  }

  const onlyDigits = clean.replace(/\D/g, '')
  if (onlyDigits.length === 14) {
    return formatCnpj(onlyDigits)
  }

  const matched = resolveDestinatarioCadastro(clean, undefined)
  if (matched?.cnpj && matched.cnpj.length === 14) {
    return formatCnpj(matched.cnpj)
  }

  return clean
}

function normalizeMercadoriaDigitacao(rawMercadoria?: string): string {
  const clean = (rawMercadoria || '').trim()
  if (!clean || clean === '-' || clean === 'N/A' || clean === 'N/I' || clean === 'null') return ''

  const standardized = extractMercadoria(undefined, clean)
  if (!standardized || standardized === 'N/I') return ''

  if (standardized.toUpperCase() === clean.toUpperCase()) {
    const stripped = standardized
      .replace(/^\d+\s*[-–:]\s*/, '')
      .replace(/\b(SECO|UMIDO|ÚMIDO|A GRANEL|GRANEL|EM GRAOS?|EM GRÃOS?)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    return stripped || standardized
  }

  return standardized
}

function findRawRowValue(rawRow: Record<string, any> | undefined, pattern: RegExp): string {
  if (!rawRow) return ''
  const key = Object.keys(rawRow).find((k) => pattern.test(k))
  if (!key) return ''
  const val = rawRow[key]
  return val === undefined || val === null ? '' : String(val).trim()
}

export function mapRumoToDigitacaoRows(result: RumoExtractionResult): PlanilhaDigitacaoRow[] {
  if (!result?.aoaData || result.aoaData.length <= 1) return []

  return result.aoaData.slice(1).map((r) => {
    const chaveNf = normalizeChaveAcesso(r[12])
    const { data, hora } = splitDateAndTime(r[10])

    return {
      vagao: (r[1] || '').trim(),
      bruto: formatBrutoSemVirgula(r[5]),
      nfe: formatNfeSemZeros(r[11]),
      dataNfe: (r[13] || '').trim(),
      rateio: parseExcelWeightValue(r[15]),
      chaveNf,
      mercadoria: normalizeMercadoriaDigitacao(r[9]),
      fornecedor: '',
      operacao: '',
      cnpjDest: resolveCnpjDest(r[17]),
      data,
      hora,
      cfop: '',
    }
  })
}

export function mapVliToDigitacaoRows(result: VliExtractionResult): PlanilhaDigitacaoRow[] {
  if (!result?.allRows || result.allRows.length === 0) return []

  const metaDt = splitDateAndTime(result.metadata.dataFim || result.metadata.dataInicio)

  return result.allRows.map((row) => {
    const chaveNf = normalizeChaveAcesso(row.chaveNf)

    let rateioVal: string | number = ''
    if (row.rateioNumeric !== undefined && row.rateioNumeric > 0) {
      rateioVal = row.rateioNumeric
    } else if (row.rateio) {
      rateioVal = parseExcelWeightValue(row.rateio)
    } else if (row.pesoNfNumeric !== undefined && row.pesoNfNumeric > 0) {
      rateioVal = row.pesoNfNumeric
    } else if (row.pesoNf) {
      rateioVal = parseExcelWeightValue(row.pesoNf)
    } else if (row.pesoLiquidoNumeric !== undefined && row.pesoLiquidoNumeric > 0) {
      rateioVal = row.pesoLiquidoNumeric
    } else if (row.pesoLiquido) {
      rateioVal = parseExcelWeightValue(row.pesoLiquido)
    }

    const brutoVal: string | number = formatBrutoSemVirgula(
      row.pesoBrutoNumeric !== undefined ? row.pesoBrutoNumeric : row.pesoBruto
    )

    const rawMercadoria = (
      row.mercadoria || findRawRowValue(row.rawRow, /mercadoria|produto/i)
    ).trim()

    const cnpjDest =
      row.cnpjDestFormatted && row.cnpjDestFormatted !== '-'
        ? row.cnpjDestFormatted
        : resolveCnpjDest(row.cnpjDest || row.destinatario)

    const rowDt = row.data ? splitDateAndTime(row.data) : { data: '', hora: '' }
    const dataFinal = rowDt.data || metaDt.data
    const horaFinal = (row.hora || '').trim() || rowDt.hora || metaDt.hora

    return {
      vagao: normalizeVliWagonPlate(row.vagao),
      bruto: brutoVal,
      nfe: formatNfeSemZeros(row.nfe),
      dataNfe: (row.dataNfe || '').trim(),
      rateio: rateioVal,
      chaveNf,
      mercadoria: normalizeMercadoriaDigitacao(rawMercadoria),
      fornecedor: '',
      operacao: '',
      cnpjDest,
      data: dataFinal,
      hora: horaFinal,
      cfop: '',
    }
  })
}

/**
 * Extrai mapa Chave de Acesso (44 dígitos) -> CFOP a partir de notas já carregadas no sistema
 */
export function buildCfopMapFromExistingNotes(existingNotes: any[] = []): Map<string, string> {
  const cfopMap = new Map<string, string>()

  for (const note of existingNotes) {
    if (!note || note.error) continue
    const rawKey =
      note.nfeData?.chaveAcesso ||
      note.parsedData?.chave ||
      note.chaveAcesso ||
      ''
    let chave = normalizeChaveAcesso(rawKey)

    if (chave.length !== 44 && typeof note.xmlContent === 'string' && note.xmlContent) {
      const chMatch =
        note.xmlContent.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/i) ||
        note.xmlContent.match(/Id=["']NFe(\d{44})["']/i)
      if (chMatch?.[1]) chave = chMatch[1]
    }

    if (chave.length !== 44) continue
    const cfop = extractCfopFromNote(note)
    if (cfop && cfop !== '-') {
      cfopMap.set(chave, cfop)
    }
  }

  return cfopMap
}

function extractXmlChaveAndCfop(xmlText: string): { chave: string; cfop: string } {
  let nfeData: any = null
  try {
    nfeData = parseNFE(xmlText)
  } catch {
    nfeData = null
  }

  let chave = normalizeChaveAcesso(nfeData?.chaveAcesso)
  if (chave.length !== 44) {
    const chMatch =
      xmlText.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/i) ||
      xmlText.match(/Id=["']NFe(\d{44})["']/i)
    if (chMatch?.[1]) chave = chMatch[1]
  }

  const cfop = extractCfopFromNote({ nfeData, xmlContent: xmlText })
  return {
    chave,
    cfop: cfop && cfop !== '-' ? cfop : '',
  }
}

/**
 * Lê arquivos XML, PDF (DANFE) e ZIP e extrai Chave de Acesso -> CFOP de cada nota fiscal
 */
export async function parseNotesForCfop(
  inputFiles: File[],
  onProgress?: (current: number, total: number, currentFile: string) => void
): Promise<{ entries: LoadedNoteSummary[]; errors: string[] }> {
  const entries: LoadedNoteSummary[] = []
  const errors: string[] = []

  type RawEntry = { name: string; lowerName: string; getBuffer: () => Promise<ArrayBuffer>; getText?: () => Promise<string> }
  const expanded: RawEntry[] = []

  const collectZip = async (zipBuffer: ArrayBuffer, prefix: string) => {
    try {
      const zip = await JSZip.loadAsync(zipBuffer)
      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue
        const cleanName = (relativePath.split('/').pop() || relativePath).toLowerCase()
        if (
          cleanName.startsWith('.') ||
          cleanName.includes('__macosx') ||
          cleanName.endsWith('.ds_store') ||
          cleanName.endsWith('thumbs.db')
        ) {
          continue
        }
        if (cleanName.endsWith('.zip')) {
          const nestedBuf = await zipEntry.async('arraybuffer')
          await collectZip(nestedBuf, `${prefix}/${relativePath}`)
        } else if (cleanName.endsWith('.xml') || cleanName.endsWith('.pdf')) {
          expanded.push({
            name: relativePath,
            lowerName: cleanName,
            getBuffer: () => zipEntry.async('arraybuffer'),
            getText: () => zipEntry.async('string'),
          })
        }
      }
    } catch (err: any) {
      errors.push(`Erro ao descompactar ${prefix}: ${err?.message || 'arquivo ZIP inválido'}`)
    }
  }

  for (const file of inputFiles) {
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.zip')) {
      const buf = await file.arrayBuffer()
      await collectZip(buf, file.name)
    } else if (lower.endsWith('.xml') || lower.endsWith('.pdf')) {
      expanded.push({
        name: file.name,
        lowerName: lower,
        getBuffer: () => file.arrayBuffer(),
        getText: () => file.text(),
      })
    }
  }

  const total = expanded.length
  for (let i = 0; i < expanded.length; i++) {
    const item = expanded[i]
    onProgress?.(i + 1, total, item.name)

    try {
      if (item.lowerName.endsWith('.xml')) {
        const xmlText = item.getText ? await item.getText() : new TextDecoder('utf-8').decode(await item.getBuffer())
        const { chave, cfop } = extractXmlChaveAndCfop(xmlText)
        if (chave.length === 44) {
          entries.push({ fileName: item.name, chave, cfop })
        } else {
          errors.push(`${item.name}: chave de acesso de 44 dígitos não encontrada no XML`)
        }
      } else if (item.lowerName.endsWith('.pdf')) {
        const buffer = await item.getBuffer()
        let subItems: Array<{ xml?: string | null; parsedData?: any; nfeData?: any }> = []

        // Extrai localmente via pdfjs primeiro para não sobrecarregar o proxy com centenas de requisições HTTP
        try {
          const localRes = await extractPdfTextWithPdfJs(buffer)
          if (localRes?.text && localRes.text.trim().length > 10) {
            const { items, xml, data } = parseMultiDanfePdf(localRes.text, item.name, localRes.pages || [])
            const mappedItems = (items || []).map((it) => {
              let nfeData = null
              if (it.xml) {
                try {
                  nfeData = parseNFE(it.xml)
                } catch {}
              }
              return { xml: it.xml, parsedData: it.parsedData, nfeData }
            })
            if (mappedItems.length > 0) {
              subItems = mappedItems
            } else if (xml || data?.chave) {
              let nfeData = null
              if (xml) {
                try {
                  nfeData = parseNFE(xml)
                } catch {}
              }
              subItems = [{ xml, parsedData: data, nfeData }]
            }
          }
        } catch {}

        // Fallback via parsePdfClientSide somente se a leitura local não encontrou nenhuma chave
        const hasValidLocalKey = subItems.some(
          (s) => normalizeChaveAcesso(s.nfeData?.chaveAcesso || s.parsedData?.chave).length === 44
        )
        if (!hasValidLocalKey) {
          const pdfRes = await parsePdfClientSide(buffer, item.name)
          subItems =
            Array.isArray(pdfRes?.items) && pdfRes.items.length > 0
              ? pdfRes.items
              : [{ xml: pdfRes?.xml, parsedData: pdfRes?.parsedData, nfeData: pdfRes?.nfeData }]
        }

        let foundAny = false
        for (const sub of subItems) {
          const rawKey = sub.nfeData?.chaveAcesso || sub.parsedData?.chave || ''
          let chave = normalizeChaveAcesso(rawKey)
          if (chave.length !== 44 && typeof sub.xml === 'string' && sub.xml) {
            const chMatch =
              sub.xml.match(/<chNFe>\s*(\d{44})\s*<\/chNFe>/i) ||
              sub.xml.match(/Id=["']NFe(\d{44})["']/i)
            if (chMatch?.[1]) chave = chMatch[1]
          }

          if (chave.length === 44) {
            const cfopRaw = extractCfopFromNote({
              nfeData: sub.nfeData,
              parsedData: sub.parsedData,
              xmlContent: sub.xml,
            })
            entries.push({
              fileName: item.name,
              chave,
              cfop: cfopRaw && cfopRaw !== '-' ? cfopRaw : '',
            })
            foundAny = true
          }
        }

        if (!foundAny) {
          errors.push(`${item.name}: nenhuma chave de acesso de 44 dígitos encontrada no PDF`)
        }
      }
    } catch (err: any) {
      errors.push(`${item.name}: ${err?.message || 'erro ao ler nota'}`)
    }
  }

  return { entries, errors }
}

/**
 * Aplica Data/Hora da Digitação e cruza CFOP por Chave de Acesso
 */
export function applyDigitacaoInputsToRows(
  rows: PlanilhaDigitacaoRow[],
  options: {
    dataDigitacao?: string
    horaDigitacao?: string
    cfopByChave?: Map<string, string>
  }
): PlanilhaDigitacaoRow[] {
  const customData = (options.dataDigitacao || '').trim()
  const customHora = (options.horaDigitacao || '').trim()
  const cfopMap = options.cfopByChave

  return rows.map((row) => {
    const cleanChave = normalizeChaveAcesso(row.chaveNf)
    const matchedCfop = cleanChave && cfopMap ? (cfopMap.get(cleanChave) || '') : row.cfop

    return {
      ...row,
      data: customData || row.data,
      hora: customHora || row.hora,
      cfop: matchedCfop || '',
    }
  })
}

export function exportPlanilhaDigitacaoExcel(
  rows: PlanilhaDigitacaoRow[],
  baseFileName: string = 'planilha_digitacao'
): string {
  const wb = XLSX.utils.book_new()

  const aoa: (string | number)[][] = [
    [...PLANILHA_DIGITACAO_HEADERS],
    ...rows.map((r) => [
      r.vagao || '',
      r.bruto,
      r.nfe || '',
      r.dataNfe || '',
      r.rateio,
      r.chaveNf || '',
      r.mercadoria || '',
      '',
      '',
      r.cnpjDest || '',
      r.data || '',
      r.hora || '',
      r.cfop || '',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Garante Bruto inteiro sem vírgula (col B / 1) e 3 casas decimais para Rateio fracionado (col E / 4)
  for (let rowIdx = 1; rowIdx < aoa.length; rowIdx++) {
    const brutoRef = XLSX.utils.encode_cell({ r: rowIdx, c: 1 })
    const brutoCell = ws[brutoRef]
    if (brutoCell && brutoCell.t === 'n' && typeof brutoCell.v === 'number') {
      brutoCell.z = '0'
    }

    const rateioRef = XLSX.utils.encode_cell({ r: rowIdx, c: 4 })
    const rateioCell = ws[rateioRef]
    if (rateioCell && rateioCell.t === 'n' && typeof rateioCell.v === 'number' && !Number.isInteger(rateioCell.v)) {
      rateioCell.z = '0.000'
    }
  }

  ws['!cols'] = [
    { wch: 14 }, // Vagão
    { wch: 12 }, // Bruto
    { wch: 14 }, // NFe
    { wch: 14 }, // Data NFe
    { wch: 12 }, // Rateio
    { wch: 46 }, // Chave NF
    { wch: 24 }, // Mercadoria
    { wch: 30 }, // Fornecedor
    { wch: 18 }, // Operação
    { wch: 20 }, // CNPJ Dest.
    { wch: 13 }, // Data
    { wch: 11 }, // Hora
    { wch: 12 }, // CFOP
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Planilha de Digitação')

  const cleanBase = baseFileName
    .replace(/\.(pdf|xlsx|xls)$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')

  const outputName = cleanBase
    ? `planilha_digitacao_${cleanBase}.xlsx`
    : `planilha_digitacao_${new Date().toISOString().slice(0, 10)}.xlsx`

  XLSX.writeFile(wb, outputName)
  return outputName
}
