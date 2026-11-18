import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import { normalizeVliWagonPlate, type VliExtractionResult } from '@/lib/vli-excel-parser'

export interface ResumoItem {
  vagao: string
  mercadoria: string
  notaFiscal: string
  chaveNfe: string
  pesoRateio: string | number
  destinatarioNf: string
  remetenteNf?: string
  dataNf?: string
  isDesmembre?: boolean
}

export interface SobreRodasRow {
  matrizPlaca: string
  matrizNfe: string
  matrizRateio: string | number
  matrizIdExport: string
  matrizNomeExport: string
  matrizIdFornecedor: string
  matrizNomeFornecedor: string
  matrizOperacaoRds: string
  matrizProdutoDigitado: string
  matrizDataChegada: string
}

export interface ConfrontoResultItem {
  resumo: ResumoItem
  sobreRodas: SobreRodasRow | null
  placaMatch: boolean
  nfeMatch: boolean
  rateioMatch: boolean
  is100PercentMatch: boolean
  status: 'ok' | 'divergente' | 'nao_localizado'
  diffReason?: string
}

export interface ConfrontoSummary {
  totalResumo: number
  totalSobreRodas: number
  totalConfrontados: number
  total100PercentMatch: number
  totalDivergentes: number
  totalNaoLocalizados: number
  totalPesoResumo: number
  totalPesoSobreRodas: number
  desmembresCount: number
}

/**
 * Sanitiza identificador de placa/vagão (maiúsculo, remove hífens, espaços e caracteres especiais)
 */
export function sanitizeWagonPlate(str: any): string {
  if (!str) return ''
  return String(str)
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Sanitiza número de NF (remove série se presente com hífen/barra e remove zeros à esquerda)
 * Ex: "50-153207" -> "153207", "1-239166" -> "239166", "000153207" -> "153207"
 */
export function sanitizeNfeNumber(str: any): string {
  if (!str) return ''
  const s = String(str).trim()

  // Se tiver hífen (ex: "50-153207" ou "1 - 239166")
  if (s.includes('-')) {
    const parts = s.split('-').map((p) => p.replace(/\D/g, '').replace(/^0+/, ''))
    const last = parts[parts.length - 1]
    const first = parts[0]
    // A nota fiscal é o número principal (geralmente >= 3 dígitos ou maior que a série)
    if (last && (!first || last.length >= first.length)) {
      return last
    }
    if (first) return first
  }

  // Se tiver barra (ex: "50/153207" ou "153207/50")
  if (s.includes('/')) {
    const parts = s.split('/').map((p) => p.replace(/\D/g, '').replace(/^0+/, ''))
    const p1 = parts[0]
    const p2 = parts[1]
    if (p2 && p1 && p2.length >= p1.length) return p2
    if (p1) return p1
  }

  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || '0'
}

/**
 * Compara dois números de Nota Fiscal garantindo equivalência mesmo com série acoplada
 * Ex: "50-153207" é igual a "153207"
 */
export function isNfeEqual(val1: any, val2: any): boolean {
  if (!val1 || !val2) return false
  const s1 = sanitizeNfeNumber(val1)
  const s2 = sanitizeNfeNumber(val2)
  if (s1 && s2 && s1 === s2) return true

  // Verificação de sufixo caso a série de 1 a 3 dígitos esteja grudada sem separador (ex: "50153207" e "153207")
  const d1 = String(val1).replace(/\D/g, '').replace(/^0+/, '')
  const d2 = String(val2).replace(/\D/g, '').replace(/^0+/, '')
  if (d1 && d2) {
    if (d1 === d2) return true
    if (d1.length > d2.length && d1.endsWith(d2) && d1.length - d2.length <= 3) return true
    if (d2.length > d1.length && d2.endsWith(d1) && d2.length - d1.length <= 3) return true
  }

  return false
}

/**
 * Converte qualquer valor de peso/rateio para número float
 */
export function parseRateioNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const clean = String(val)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const num = parseFloat(clean)
  return isNaN(num) ? 0 : num
}

/**
 * Verifica se dois pesos são numericamente equivalentes (com tolerância de 0.5 kg para arredondamentos)
 */
export function isRateioEqual(v1: any, v2: any, tolerance: number = 0.5): boolean {
  const n1 = parseRateioNumber(v1)
  const n2 = parseRateioNumber(v2)
  if (n1 === 0 && n2 === 0) return true
  return Math.abs(n1 - n2) <= tolerance
}

/**
 * Extrai os itens do Resumo Composição a partir de aoaData da Rumo
 */
export function extractResumoItemsFromAoa(aoaData: string[][]): ResumoItem[] {
  if (!aoaData || aoaData.length <= 1) return []

  const rows = aoaData.slice(1)
  // Contar ocorrências de vagões para identificar desmembres
  const wagonCounts = new Map<string, number>()
  for (const r of rows) {
    const v = sanitizeWagonPlate(r[1])
    if (v) wagonCounts.set(v, (wagonCounts.get(v) || 0) + 1)
  }

  return rows.map((r) => {
    const rawPlate = (r[1] || '').trim()
    const cleanPlate = sanitizeWagonPlate(rawPlate)
    const isDesmembre = (wagonCounts.get(cleanPlate) || 0) > 1

    return {
      vagao: rawPlate,
      mercadoria: (r[9] || '').trim(),
      notaFiscal: (r[11] || '').trim(),
      chaveNfe: (r[12] || '').trim().replace(/\s/g, ''),
      dataNf: (r[13] || '').trim(),
      pesoRateio: (r[15] || '').trim(),
      remetenteNf: (r[16] || '').trim(),
      destinatarioNf: (r[17] || '').trim(),
      isDesmembre,
    }
  })
}

/**
 * Extrai os itens de composição a partir do resultado estruturado do Relatório Resumo VLI
 */
export function extractResumoItemsFromVli(vliResult: VliExtractionResult): ResumoItem[] {
  if (!vliResult || !vliResult.allRows || vliResult.allRows.length === 0) return []

  const desmembreSet = new Set(
    (vliResult.desmembreWagons || [])
      .map((v) => sanitizeWagonPlate(normalizeVliWagonPlate(v)))
      .filter(Boolean)
  )

  return vliResult.allRows.map((row) => {
    const normalizedVagao = normalizeVliWagonPlate(row.vagao)
    const cleanPlate = sanitizeWagonPlate(normalizedVagao)
    const isDesmembre = cleanPlate ? desmembreSet.has(cleanPlate) : false

    let pesoRateio: string | number = ''
    if (row.rateioNumeric !== undefined && row.rateioNumeric > 0) {
      pesoRateio = row.rateioNumeric
    } else if (row.rateio) {
      pesoRateio = row.rateio
    } else if (row.pesoNfNumeric !== undefined && row.pesoNfNumeric > 0) {
      pesoRateio = row.pesoNfNumeric
    } else if (row.pesoNf) {
      pesoRateio = row.pesoNf
    } else if (row.pesoLiquidoNumeric !== undefined && row.pesoLiquidoNumeric > 0) {
      pesoRateio = row.pesoLiquidoNumeric
    } else if (row.pesoLiquido) {
      pesoRateio = row.pesoLiquido
    }

    let mercadoria = (row.mercadoria || '').trim()
    if (!mercadoria && row.rawRow) {
      const mercKey = Object.keys(row.rawRow).find((k) => /mercadoria|produto/i.test(k))
      if (mercKey && row.rawRow[mercKey]) {
        mercadoria = String(row.rawRow[mercKey]).trim()
      }
    }

    const destinatarioNf = (
      row.destinatario ||
      (row.cnpjDestFormatted && row.cnpjDestFormatted !== '-' ? row.cnpjDestFormatted : '') ||
      row.cnpjDest ||
      ''
    ).trim()

    return {
      vagao: normalizedVagao,
      mercadoria,
      notaFiscal: (row.nfe || '').trim(),
      chaveNfe: (row.chaveNf || '').replace(/\s/g, '').trim(),
      dataNf: (row.dataNfe || '').trim(),
      pesoRateio,
      remetenteNf: (row.remetente || '').trim(),
      destinatarioNf,
      isDesmembre,
    }
  })
}

/**
 * Alinha a unidade do Peso Rateio quando o resumo está em toneladas (< 500) e o Sobre Rodas em kg (>= 500)
 */
export function alignResumoRateioUnits(
  resumoRows: ResumoItem[],
  sobreRodasRows: SobreRodasRow[]
): ResumoItem[] {
  if (!resumoRows.length || !sobreRodasRows.length) return resumoRows

  const srWeights = sobreRodasRows.map((r) => parseRateioNumber(r.matrizRateio)).filter((w) => w > 0)
  const resumoWeights = resumoRows.map((r) => parseRateioNumber(r.pesoRateio)).filter((w) => w > 0)

  if (srWeights.length === 0 || resumoWeights.length === 0) return resumoRows

  const hasKgSobreRodas = srWeights.some((w) => w >= 500)
  const allResumoInTons = resumoWeights.every((w) => w < 500)

  if (!hasKgSobreRodas || !allResumoInTons) return resumoRows

  return resumoRows.map((item) => {
    const n = parseRateioNumber(item.pesoRateio)
    if (n <= 0) return item
    return {
      ...item,
      pesoRateio: Math.round(n * 1000),
    }
  })
}

/**
 * Formata data e horário do Excel (seja objeto Date, número serial ou texto)
 */
function formatExcelDateAndHour(dateVal: any, timeVal?: any): string {
  if (!dateVal && !timeVal) return ''
  let dStr = ''
  let tStr = ''

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    const d = String(dateVal.getDate()).padStart(2, '0')
    const m = String(dateVal.getMonth() + 1).padStart(2, '0')
    const y = dateVal.getFullYear()
    dStr = `${d}/${m}/${y}`
  } else if (typeof dateVal === 'number' && dateVal > 30000 && dateVal < 60000) {
    try {
      const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000))
      const d = String(date.getUTCDate()).padStart(2, '0')
      const m = String(date.getUTCMonth() + 1).padStart(2, '0')
      const y = date.getUTCFullYear()
      dStr = `${d}/${m}/${y}`
    } catch {
      dStr = String(dateVal).trim()
    }
  } else if (dateVal !== undefined && dateVal !== null) {
    dStr = String(dateVal).trim()
  }

  if (timeVal !== undefined && timeVal !== null && timeVal !== '') {
    if (typeof timeVal === 'number' && timeVal >= 0 && timeVal < 1) {
      const totalSeconds = Math.round(timeVal * 86400)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      tStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    } else {
      tStr = String(timeVal).trim()
    }
  }

  if (dStr && tStr) {
    return dStr.includes(tStr) ? dStr : `${dStr} ${tStr}`
  }
  return dStr || tStr
}

/**
 * Lê e analisa a planilha Excel "Estoque Sobre Rodas"
 * Compatível tanto com a exportação padrão do terminal (Produto, Exportador, NomeExport, Placa, NF, Peso Nota Rateio, etc.)
 * quanto com planilhas já prefixadas com "Matriz ...".
 */
export function parseSobreRodasExcel(data: ArrayBuffer | Uint8Array): SobreRodasRow[] {
  const wb = XLSX.read(data, { type: 'array' })
  if (!wb.SheetNames || wb.SheetNames.length === 0) return []

  const ws = wb.Sheets[wb.SheetNames[0]]
  const sheetRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false })
  if (!sheetRows || sheetRows.length === 0) return []

  // Localizar linha de cabeçalho
  let headerIndex = -1
  let colMap: Record<string, number> = {}

  for (let r = 0; r < Math.min(sheetRows.length, 15); r++) {
    const row = sheetRows[r]
    if (!Array.isArray(row)) continue

    const normalizedRow = row.map((cell) =>
      String(cell || '')
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9\s]/g, '')
        .trim()
    )

    const hasPlaca = normalizedRow.some((c) => c === 'PLACA' || c.includes('PLACA') || c.includes('VAGAO') || c.includes('CARRETA'))
    const hasNfe = normalizedRow.some((c) => c === 'NF' || c === 'NFE' || c.includes('NOTA FISCAL') || c.includes('NUMERO NF'))
    const hasRateio = normalizedRow.some((c) => c === 'PESO NOTA RATEIO' || c.includes('RATEIO') || c.includes('PESO'))

    if (hasPlaca && (hasNfe || hasRateio)) {
      headerIndex = r
      normalizedRow.forEach((cell, idx) => {
        // 1. Placa / Vagão
        if (cell === 'PLACA' || cell === 'MATRIZ PLACA') {
          colMap.placa = idx
        } else if (cell === 'CARRETA 1' || cell === 'CARRETA1') {
          colMap.carreta1 = idx
        } else if (cell === 'CARRETA 2' || cell === 'CARRETA2') {
          colMap.carreta2 = idx
        } else if (!colMap.placa && (cell.includes('PLACA') || cell.includes('VAGAO'))) {
          colMap.placa = idx
        }

        // 2. NF / Nota Fiscal
        if (cell === 'NF' || cell === 'MATRIZ NFE' || cell === 'NFE' || cell === 'NOTA FISCAL' || cell === 'NUMERO NF') {
          colMap.nfe = idx
        } else if (!colMap.nfe && (cell.includes('NOTA') || cell.includes('NFE'))) {
          colMap.nfe = idx
        }

        // 3. Peso Nota Rateio (Matriz RATEIO)
        if (cell === 'PESO NOTA RATEIO' || cell === 'MATRIZ RATEIO' || cell === 'PESO RATEIO' || cell === 'RATEIO') {
          colMap.rateio = idx
        } else if (!colMap.rateio && cell.includes('RATEIO')) {
          colMap.rateio = idx
        }

        // 4. Exportador (Matriz ID EXPORT)
        if (cell === 'EXPORTADOR' || cell === 'MATRIZ ID EXPORT' || cell === 'ID EXPORT' || cell === 'COD EXPORT') {
          colMap.idExport = idx
        }

        // 5. NomeExport (Matriz NOME EXPORT)
        if (cell === 'NOMEEXPORT' || cell === 'NOME EXPORT' || cell === 'MATRIZ NOME EXPORT' || cell === 'NOME EXPORTADOR') {
          colMap.nomeExport = idx
        } else if (colMap.nomeExport === undefined && (cell.includes('EXPORT') && !cell.includes('ID') && cell !== 'EXPORTADOR')) {
          colMap.nomeExport = idx
        }

        // 6. Fornecedor (Matriz ID FORNECEDOR)
        if (cell === 'FORNECEDOR' || cell === 'MATRIZ ID FORNECEDOR' || cell === 'ID FORNECEDOR' || cell === 'COD FORNECEDOR') {
          colMap.idFornecedor = idx
        }

        // 7. NomeFornec (Matriz NOME FORNECEDOR)
        if (cell === 'NOMEFORNEC' || cell === 'NOME FORNEC' || cell === 'NOME FORNECEDOR' || cell === 'MATRIZ NOME FORNECEDOR') {
          colMap.nomeFornecedor = idx
        } else if (colMap.nomeFornecedor === undefined && (cell.includes('FORNEC') && !cell.includes('ID') && cell !== 'FORNECEDOR')) {
          colMap.nomeFornecedor = idx
        }

        // 8. Tipo Operacao (Matriz OPERACAO RDS)
        if (cell === 'TIPO OPERACAO' || cell === 'MATRIZ OPERACAO RDS' || cell === 'OPERACAO RDS' || cell === 'OPERACAO') {
          colMap.operacaoRds = idx
        }

        // 9. Descricao Produto (Matriz PRODUTO DIGITADO)
        if (cell === 'DESCRICAO PRODUTO' || cell === 'MATRIZ PRODUTO DIGITADO' || cell === 'PRODUTO DIGITADO') {
          colMap.produtoDigitado = idx
        } else if (colMap.produtoDigitado === undefined && (cell === 'DESCRICAO' || cell === 'PRODUTO')) {
          colMap.produtoDigitado = idx
        }

        // 10. Data Chegada + Horario Chegada (Matriz DATA CHEGADA)
        if (cell === 'DATA CHEGADA' || cell === 'MATRIZ DATA CHEGADA') {
          colMap.dataChegada = idx
        } else if (colMap.dataChegada === undefined && cell.includes('CHEGADA') && cell.includes('DATA')) {
          colMap.dataChegada = idx
        }

        if (cell === 'HORARIO CHEGADA' || cell === 'HORA CHEGADA' || cell === 'HORA') {
          colMap.horarioChegada = idx
        }
      })
      break
    }
  }

  if (headerIndex === -1) {
    // Fallback: assume primeira linha
    headerIndex = 0
    const row = sheetRows[0] || []
    row.forEach((cell, idx) => {
      const c = String(cell || '').toUpperCase()
      if (c === 'PLACA' || c.includes('PLACA') || c.includes('VAGAO')) colMap.placa = idx
      if (c === 'NF' || c.includes('NF') || c.includes('NOTA')) colMap.nfe = idx
      if (c.includes('RATEIO') || c.includes('PESO')) colMap.rateio = idx
    })
  }

  const results: SobreRodasRow[] = []

  for (let i = headerIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i]
    if (!Array.isArray(row) || row.length === 0) continue

    const getVal = (colIdx: number | undefined): string => {
      if (colIdx === undefined || colIdx < 0 || colIdx >= row.length) return ''
      const v = row[colIdx]
      if (v === null || v === undefined) return ''
      return String(v).trim()
    }

    let placaRaw = getVal(colMap.placa)
    if (!placaRaw && colMap.carreta1 !== undefined) {
      placaRaw = getVal(colMap.carreta1)
    }
    if (!placaRaw && colMap.carreta2 !== undefined) {
      placaRaw = getVal(colMap.carreta2)
    }

    const nfeRaw = getVal(colMap.nfe)
    const rateioRaw = getVal(colMap.rateio)

    // Pular linhas vazias
    if (!placaRaw && !nfeRaw && !rateioRaw) continue

    const dataChegadaFormatted = formatExcelDateAndHour(
      colMap.dataChegada !== undefined ? row[colMap.dataChegada] : undefined,
      colMap.horarioChegada !== undefined ? row[colMap.horarioChegada] : undefined
    )

    results.push({
      matrizPlaca: placaRaw,
      matrizNfe: nfeRaw,
      matrizRateio: rateioRaw,
      matrizIdExport: getVal(colMap.idExport),
      matrizNomeExport: getVal(colMap.nomeExport),
      matrizIdFornecedor: getVal(colMap.idFornecedor),
      matrizNomeFornecedor: getVal(colMap.nomeFornecedor),
      matrizOperacaoRds: getVal(colMap.operacaoRds),
      matrizProdutoDigitado: getVal(colMap.produtoDigitado),
      matrizDataChegada: dataChegadaFormatted,
    })
  }

  return results
}

/**
 * Realiza o confronto entre os registros da composição e o Estoque Sobre Rodas
 */
export function executeConfronto(
  resumoRows: ResumoItem[],
  sobreRodasRows: SobreRodasRow[]
): { items: ConfrontoResultItem[]; summary: ConfrontoSummary } {
  const matchedSobreRodasIndices = new Set<number>()
  const items: ConfrontoResultItem[] = []

  // Criar mapas indexados para busca rápida e precisa
  // 1. Chave composta: (placaSanitizada, nfeSanitizada) -> lista de índices
  const compositeMap = new Map<string, number[]>()
  // 2. Chave apenas por placa: placaSanitizada -> lista de índices
  const plateMap = new Map<string, number[]>()
  // 3. Chave apenas por NFE: nfeSanitizada -> lista de índices
  const nfeMap = new Map<string, number[]>()

  sobreRodasRows.forEach((sr, idx) => {
    const sPlate = sanitizeWagonPlate(sr.matrizPlaca)
    const sNfe = sanitizeNfeNumber(sr.matrizNfe)

    if (sPlate && sNfe) {
      const compKey = `${sPlate}__${sNfe}`
      if (!compositeMap.has(compKey)) compositeMap.set(compKey, [])
      compositeMap.get(compKey)!.push(idx)
    }

    if (sPlate) {
      if (!plateMap.has(sPlate)) plateMap.set(sPlate, [])
      plateMap.get(sPlate)!.push(idx)
    }

    if (sNfe) {
      if (!nfeMap.has(sNfe)) nfeMap.set(sNfe, [])
      nfeMap.get(sNfe)!.push(idx)
    }
  })

  // Para cada linha do Resumo
  for (const resumo of resumoRows) {
    const sResumoPlate = sanitizeWagonPlate(resumo.vagao)
    const sResumoNfe = sanitizeNfeNumber(resumo.notaFiscal)
    const resumoRateio = resumo.pesoRateio

    let matchedSobreRodas: SobreRodasRow | null = null
    let matchedIdx: number | null = null

    // 1. Tentar encontrar por Placa + NFE
    const compKey = `${sResumoPlate}__${sResumoNfe}`
    const compCandidates = compositeMap.get(compKey) || []

    if (compCandidates.length > 0) {
      // Se houver mais de uma (ex: desmembres com mesmo vagão e NF ou rateios), tentar casar pelo valor de rateio
      let bestCandidate = compCandidates.find(
        (ci) => !matchedSobreRodasIndices.has(ci) && isRateioEqual(resumoRateio, sobreRodasRows[ci].matrizRateio)
      )

      if (bestCandidate === undefined) {
        // Pegar o primeiro ainda não usado
        bestCandidate = compCandidates.find((ci) => !matchedSobreRodasIndices.has(ci))
      }

      if (bestCandidate === undefined) {
        // Se todos já foram usados, reutiliza o primeiro
        bestCandidate = compCandidates[0]
      }

      matchedIdx = bestCandidate
      matchedSobreRodas = sobreRodasRows[matchedIdx]
      matchedSobreRodasIndices.add(matchedIdx)
    } else {
      // 2. Fallback: procurar por Placa isolada
      const plateCandidates = plateMap.get(sResumoPlate) || []
      const unassignedPlateIdx = plateCandidates.find((ci) => !matchedSobreRodasIndices.has(ci))
      if (unassignedPlateIdx !== undefined) {
        matchedIdx = unassignedPlateIdx
        matchedSobreRodas = sobreRodasRows[matchedIdx]
        matchedSobreRodasIndices.add(matchedIdx)
      } else {
        // 3. Fallback: procurar por NFE isolada
        const nfeCandidates = nfeMap.get(sResumoNfe) || []
        const unassignedNfeIdx = nfeCandidates.find((ci) => !matchedSobreRodasIndices.has(ci))
        if (unassignedNfeIdx !== undefined) {
          matchedIdx = unassignedNfeIdx
          matchedSobreRodas = sobreRodasRows[matchedIdx]
          matchedSobreRodasIndices.add(matchedIdx)
        }
      }
    }

    // Avaliar correspondências
    let placaMatch = false
    let nfeMatch = false
    let rateioMatch = false

    if (matchedSobreRodas) {
      const sSrPlate = sanitizeWagonPlate(matchedSobreRodas.matrizPlaca)
      const sSrNfe = sanitizeNfeNumber(matchedSobreRodas.matrizNfe)

      placaMatch = Boolean(sResumoPlate && sSrPlate && sResumoPlate === sSrPlate)
      nfeMatch = isNfeEqual(resumo.notaFiscal, matchedSobreRodas.matrizNfe)
      rateioMatch = isRateioEqual(resumoRateio, matchedSobreRodas.matrizRateio)
    }

    const is100PercentMatch = placaMatch && nfeMatch && rateioMatch

    let status: 'ok' | 'divergente' | 'nao_localizado' = 'nao_localizado'
    let diffReason = ''

    if (!matchedSobreRodas) {
      status = 'nao_localizado'
      diffReason = 'Vagão / NFE não encontrado no Estoque Sobre Rodas'
    } else if (is100PercentMatch) {
      status = 'ok'
    } else {
      status = 'divergente'
      const diffs: string[] = []
      if (!placaMatch) diffs.push(`Placa divergente (${resumo.vagao} ≠ ${matchedSobreRodas.matrizPlaca})`)
      if (!nfeMatch) diffs.push(`NFE divergente (${resumo.notaFiscal} ≠ ${matchedSobreRodas.matrizNfe})`)
      if (!rateioMatch) diffs.push(`Rateio divergente (${resumo.pesoRateio} ≠ ${matchedSobreRodas.matrizRateio})`)
      diffReason = diffs.join(', ')
    }

    items.push({
      resumo,
      sobreRodas: matchedSobreRodas,
      placaMatch,
      nfeMatch,
      rateioMatch,
      is100PercentMatch,
      status,
      diffReason,
    })
  }

  // Resumo estatístico
  let total100PercentMatch = 0
  let totalDivergentes = 0
  let totalNaoLocalizados = 0
  let totalPesoResumo = 0
  let totalPesoSobreRodas = 0
  let desmembresCount = 0

  items.forEach((it) => {
    if (it.status === 'ok') total100PercentMatch++
    else if (it.status === 'divergente') totalDivergentes++
    else totalNaoLocalizados++

    totalPesoResumo += parseRateioNumber(it.resumo.pesoRateio)
    if (it.sobreRodas) {
      totalPesoSobreRodas += parseRateioNumber(it.sobreRodas.matrizRateio)
    }
    if (it.resumo.isDesmembre) {
      desmembresCount++
    }
  })

  const summary: ConfrontoSummary = {
    totalResumo: resumoRows.length,
    totalSobreRodas: sobreRodasRows.length,
    totalConfrontados: resumoRows.length,
    total100PercentMatch,
    totalDivergentes,
    totalNaoLocalizados,
    totalPesoResumo,
    totalPesoSobreRodas,
    desmembresCount,
  }

  return { items, summary }
}

/**
 * Exporta o resultado do confronto exatamente com as 3 seções do modelo da planilha enviada pelo usuário
 */
export function exportConfrontoExcel(
  items: ConfrontoResultItem[],
  trainOrFileName: string = 'confronto_sobre_rodas'
): void {
  const wb = XLSX.utils.book_new()

  // Montar array de arrays (AOA) com duas linhas de cabeçalho
  // Linha 1: Títulos de Seção Mesclados
  // Colunas A a F (0..5): RESUMO COMPOSIÇÃO
  // Colunas G a P (6..15): ESTOQUE SOBRE RODAS
  // Colunas Q a S (16..18): CONFRONTO
  const row1 = [
    'RESUMO COMPOSIÇÃO', '', '', '', '', '',
    'ESTOQUE SOBRE RODAS', '', '', '', '', '', '', '', '', '',
    'CONFRONTO', '', '',
  ]

  // Linha 2: Colunas Exatas da Imagem
  const row2 = [
    // Seção 1: RESUMO COMPOSIÇÃO
    'Vagão',
    'Mercadoria',
    'Nota Fiscal',
    'Chave NFE',
    'Peso Rateio',
    'Destinatário NF',
    // Seção 2: ESTOQUE SOBRE RODAS
    'Matriz PLACA',
    'Matriz NFE',
    'Matriz RATEIO',
    'Matriz ID EXPORT',
    'Matriz NOME EXPORT',
    'Matriz ID FORNECEDOR',
    'Matriz NOME FORNECEDOR',
    'Matriz OPERACAO RDS',
    'Matriz PRODUTO DIGITADO',
    'Matriz DATA CHEGADA',
    // Seção 3: CONFRONTO
    'PLACA',
    'NFE',
    'RATEIO',
  ]

  const dataRows = items.map((it) => {
    const res = it.resumo
    const sr = it.sobreRodas

    const formatRateio = (val: any) => {
      const num = parseRateioNumber(val)
      return isNaN(num) || num === 0 ? val : num
    }

    return [
      // RESUMO COMPOSIÇÃO
      res.vagao || '',
      res.mercadoria || '',
      res.notaFiscal || '',
      res.chaveNfe || '',
      formatRateio(res.pesoRateio),
      res.destinatarioNf || '',
      // ESTOQUE SOBRE RODAS
      sr?.matrizPlaca || '',
      sr?.matrizNfe || '',
      sr ? formatRateio(sr.matrizRateio) : '',
      sr?.matrizIdExport || '',
      sr?.matrizNomeExport || '',
      sr?.matrizIdFornecedor || '',
      sr?.matrizNomeFornecedor || '',
      sr?.matrizOperacaoRds || '',
      sr?.matrizProdutoDigitado || '',
      sr?.matrizDataChegada || '',
      // CONFRONTO (VERDADEIRO / FALSO)
      it.placaMatch ? 'VERDADEIRO' : 'FALSO',
      it.nfeMatch ? 'VERDADEIRO' : 'FALSO',
      it.rateioMatch ? 'VERDADEIRO' : 'FALSO',
    ]
  })

  const aoa = [row1, row2, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Mesclagens na Linha 1 (índice 0)
  ws['!merges'] = [
    // RESUMO COMPOSIÇÃO: Col 0 a 5, Linha 0
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    // ESTOQUE SOBRE RODAS: Col 6 a 15, Linha 0
    { s: { r: 0, c: 6 }, e: { r: 0, c: 15 } },
    // CONFRONTO: Col 16 a 18, Linha 0
    { s: { r: 0, c: 16 }, e: { r: 0, c: 18 } },
  ]

  // Larguras das Colunas
  ws['!cols'] = [
    { wch: 14 }, // Vagão
    { wch: 22 }, // Mercadoria
    { wch: 14 }, // Nota Fiscal
    { wch: 46 }, // Chave NFE
    { wch: 14 }, // Peso Rateio
    { wch: 32 }, // Destinatário NF
    { wch: 14 }, // Matriz PLACA
    { wch: 14 }, // Matriz NFE
    { wch: 14 }, // Matriz RATEIO
    { wch: 18 }, // Matriz ID EXPORT
    { wch: 24 }, // Matriz NOME EXPORT
    { wch: 18 }, // Matriz ID FORNECEDOR
    { wch: 24 }, // Matriz NOME FORNECEDOR
    { wch: 34 }, // Matriz OPERACAO RDS
    { wch: 30 }, // Matriz PRODUTO DIGITADO
    { wch: 20 }, // Matriz DATA CHEGADA
    { wch: 14 }, // PLACA
    { wch: 14 }, // NFE
    { wch: 14 }, // RATEIO
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Confronto Sobre Rodas')

  const cleanBaseName = trainOrFileName.replace(/\.pdf$/i, '').replace(/\.xlsx$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputName = cleanBaseName.startsWith('confronto_')
    ? `${cleanBaseName}.xlsx`
    : `confronto_sobre_rodas_${cleanBaseName}.xlsx`

  XLSX.writeFile(wb, outputName)
}

export function exportConfrontoPdf(
  items: ConfrontoResultItem[],
  trainOrFileName: string = 'confronto_sobre_rodas',
  reportTitle: string = 'Confronto Resumo Rumo x Estoque Sobre Rodas'
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 6
  const rowHeight = 7
  const sectionHeaderHeight = 7
  const headers = [
    'Vagao', 'Nota Fiscal', 'Chave NFE', 'Peso Rateio', 'Destinatario NF',
    'Matriz PLACA', 'Matriz NFE', 'Matriz RATEIO', 'Matriz ID EXPORT', 'Matriz NOME EXPORT',
    'Matriz NOME FORNECEDOR', 'Matriz OPERACAO RDS', 'Matriz DATA CHEGADA',
    'PLACA', 'NFE', 'RATEIO',
  ]
  const weights = [12, 12, 19, 12, 15, 12, 12, 12, 12, 16, 17, 15, 15, 10, 10, 10]
  const scale = (pageWidth - margin * 2) / weights.reduce((sum, weight) => sum + weight, 0)
  const widths = weights.map((weight) => weight * scale)
  const cleanBaseName = trainOrFileName.replace(/\.pdf$/i, '').replace(/\.xlsx$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputName = cleanBaseName.startsWith('confronto_') ? `${cleanBaseName}.pdf` : `confronto_sobre_rodas_${cleanBaseName}.pdf`

  const drawTableHeaders = (y: number) => {
    let x = margin
    const sectionHeaders = [
      { label: 'RESUMO COMPOSICAO', count: 5, color: [2, 132, 199] },
      { label: 'ESTOQUE SOBRE RODAS', count: 8, color: [147, 51, 234] },
      { label: 'CONFRONTO', count: 3, color: [5, 150, 105] },
    ]

    let offset = 0
    sectionHeaders.forEach((section) => {
      const sectionWidth = widths.slice(offset, offset + section.count).reduce((sum, width) => sum + width, 0)
      doc.setFillColor(section.color[0], section.color[1], section.color[2])
      doc.setDrawColor(255, 255, 255)
      doc.rect(margin + widths.slice(0, offset).reduce((sum, width) => sum + width, 0), y, sectionWidth, sectionHeaderHeight, 'FD')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.text(section.label, margin + widths.slice(0, offset).reduce((sum, width) => sum + width, 0) + sectionWidth / 2, y + 4.5, { align: 'center' })
      offset += section.count
    })

    y += sectionHeaderHeight
    x = margin
    doc.setFillColor(248, 250, 252)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.8)
    headers.forEach((header, index) => {
      doc.rect(x, y, widths[index], rowHeight, 'FD')
      const lines = doc.splitTextToSize(header.replace('Matriz ', ''), widths[index] - 1)
      doc.text(lines.slice(0, 2), x + widths[index] / 2, y + 3.1, { align: 'center' })
      x += widths[index]
    })

    return y + rowHeight
  }

  const drawTitle = () => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(24, 24, 27)
    doc.text(reportTitle, margin, 10)
    const okCount = items.filter((item) => item.status === 'ok').length
    const divergentCount = items.filter((item) => item.status === 'divergente').length
    const missingCount = items.filter((item) => item.status === 'nao_localizado').length
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(`Batidos: ${okCount}   Divergentes: ${divergentCount}   Nao encontrados: ${missingCount}   Total: ${items.length}`, margin, 15)
  }

  drawTitle()
  let y = drawTableHeaders(19)

  items.forEach((item) => {
    if (y + rowHeight > pageHeight - 8) {
      doc.addPage()
      y = drawTableHeaders(8)
    }

    const values = [
      item.resumo.vagao || '-',
      item.resumo.notaFiscal || '-',
      item.resumo.chaveNfe || '-',
      String(item.resumo.pesoRateio || '-'),
      item.resumo.destinatarioNf || '-',
      item.sobreRodas?.matrizPlaca || '-',
      item.sobreRodas?.matrizNfe || '-',
      String(item.sobreRodas?.matrizRateio || '-'),
      item.sobreRodas?.matrizIdExport || '-',
      item.sobreRodas?.matrizNomeExport || '-',
      item.sobreRodas?.matrizNomeFornecedor || '-',
      item.sobreRodas?.matrizOperacaoRds || '-',
      item.sobreRodas?.matrizDataChegada || '-',
      item.placaMatch ? 'VERDADEIRO' : 'FALSO',
      item.nfeMatch ? 'VERDADEIRO' : 'FALSO',
      item.rateioMatch ? 'VERDADEIRO' : 'FALSO',
    ]

    let x = margin
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(3.8)

    values.forEach((value, index) => {
      let fill: [number, number, number] = [255, 255, 255]
      if (item.status === 'divergente' && index < 13) fill = [255, 241, 242]
      if (item.status === 'nao_localizado' && index < 13) fill = [244, 244, 245]
      if (index >= 13) fill = value === 'VERDADEIRO' ? [209, 250, 229] : [255, 228, 230]

      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.setDrawColor(212, 212, 216)
      doc.rect(x, y, widths[index], rowHeight, 'FD')
      doc.setTextColor(value === 'FALSO' ? 190 : 39, value === 'FALSO' ? 18 : 39, value === 'FALSO' ? 60 : 42)

      const lines = doc.splitTextToSize(String(value), widths[index] - 0.8)
      doc.text(lines.slice(0, 3), x + widths[index] / 2, y + 3, { align: 'center' })
      x += widths[index]
    })

    y += rowHeight
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)
    doc.setFontSize(6)
    doc.setTextColor(113, 113, 122)
    doc.text(`Pagina ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' })
  }

  doc.save(outputName)
}
