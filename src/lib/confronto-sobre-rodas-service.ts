import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'

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
 * Mantém registros cuja Data Chegada seja igual ou posterior ao corte informado.
 * Aceita os formatos produzidos pelo parser de Excel e os formatos ISO.
 */
export function filterSobreRodasRowsByArrival(
  rows: SobreRodasRow[],
  cutoff: string
): SobreRodasRow[] {
  const cutoffDate = new Date(cutoff)
  if (Number.isNaN(cutoffDate.getTime())) return rows

  return rows.filter((row) => {
    const raw = String(row.matrizDataChegada || '').trim()
    if (!raw) return false

    let parsed: Date
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2})(?::\d{2})?)?/)
    const brMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}:\d{2}))?/)

    if (isoMatch) {
      parsed = new Date(raw.replace(' ', 'T'))
    } else if (brMatch) {
      const [, day, month, year, time = '00:00'] = brMatch
      parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}:00`)
    } else {
      parsed = new Date(raw)
    }

    return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= cutoffDate.getTime()
  })
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
 * Sanitiza número de NF (apenas dígitos, sem zeros à esquerda)
 */
export function sanitizeNfeNumber(str: any): string {
  const raw = String(str || '').trim()
  if (!raw) return ''

  const withoutSeries = raw.includes('-') ? raw.split('-').pop() || '' : raw
  const digits = withoutSeries.replace(/\D/g, '')
  if (!digits) return ''
  const trimmed = digits.replace(/^0+/, '')
  return trimmed || '0'
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
      nfeMatch = Boolean(sResumoNfe && sSrNfe && sResumoNfe === sSrNfe)
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
export async function exportConfrontoExcel(
  items: ConfrontoResultItem[],
  trainOrFileName: string = 'confronto_sobre_rodas'
): Promise<void> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = 'Conferente Ferrovia'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Confronto Sobre Rodas', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    autoFilter: 'A2:S2',
  })

  const headers = [
    'Vagão', 'Mercadoria', 'Nota Fiscal', 'Chave NFE', 'Peso Rateio', 'Destinatário NF',
    'Matriz PLACA', 'Matriz NFE', 'Matriz RATEIO', 'Matriz ID EXPORT', 'Matriz NOME EXPORT',
    'Matriz ID FORNECEDOR', 'Matriz NOME FORNECEDOR', 'Matriz OPERACAO RDS',
    'Matriz PRODUTO DIGITADO', 'Matriz DATA CHEGADA', 'PLACA', 'NFE', 'RATEIO',
  ]

  sheet.mergeCells('A1:F1')
  sheet.mergeCells('G1:P1')
  sheet.mergeCells('Q1:S1')
  sheet.getCell('A1').value = 'RESUMO COMPOSIÇÃO'
  sheet.getCell('G1').value = 'ESTOQUE SOBRE RODAS'
  sheet.getCell('Q1').value = 'CONFRONTO'

  sheet.addRow(headers)
  sheet.getRow(1).height = 28
  sheet.getRow(2).height = 38

  const sectionColors = ['0284C7', '9333EA', '059669']
  ;[1, 7, 17].forEach((column, index) => {
    const endColumn = index === 0 ? 6 : index === 1 ? 16 : 19
    for (let current = column; current <= endColumn; current++) {
      const cell = sheet.getRow(1).getCell(current)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${sectionColors[index]}` } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  })

  sheet.getRow(2).eachCell((cell, column) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: column <= 6 ? 'FFE0F2FE' : column <= 16 ? 'FFF3E8FF' : 'FFD1FAE5' } }
    cell.font = { bold: true, color: { argb: 'FF27272A' }, size: 9 }
    cell.alignment = { horizontal: column <= 6 || column >= 17 ? (column >= 17 ? 'center' : 'left') : 'left', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFA1A1AA' } } }
  })

  items.forEach((item) => {
    const row = sheet.addRow([
      item.resumo.vagao || '', item.resumo.mercadoria || '', item.resumo.notaFiscal || '', item.resumo.chaveNfe || '',
      parseRateioNumber(item.resumo.pesoRateio) || '', item.resumo.destinatarioNf || '',
      item.sobreRodas?.matrizPlaca || '', item.sobreRodas?.matrizNfe || '', item.sobreRodas ? parseRateioNumber(item.sobreRodas.matrizRateio) || '' : '',
      item.sobreRodas?.matrizIdExport || '', item.sobreRodas?.matrizNomeExport || '', item.sobreRodas?.matrizIdFornecedor || '',
      item.sobreRodas?.matrizNomeFornecedor || '', item.sobreRodas?.matrizOperacaoRds || '', item.sobreRodas?.matrizProdutoDigitado || '',
      item.sobreRodas?.matrizDataChegada || '', item.placaMatch ? 'VERDADEIRO' : 'FALSO',
      item.nfeMatch ? 'VERDADEIRO' : 'FALSO', item.rateioMatch ? 'VERDADEIRO' : 'FALSO',
    ])
    row.height = 22
    row.eachCell((cell, column) => {
      cell.font = { size: 9, bold: column === 1 || column === 3 }
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: column >= 17 ? 'center' : column === 5 || column === 9 ? 'right' : 'left' }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD4D4D8' } }, right: { style: 'hair', color: { argb: 'FFE4E4E7' } } }
      if (column >= 17) {
        const isMatch = String(cell.value) === 'VERDADEIRO'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isMatch ? 'FFD1FAE5' : 'FFFFE4E6' } }
        cell.font = { bold: true, color: { argb: isMatch ? 'FF166534' : 'FFBE123C' }, size: 9 }
      }
    })
  })

  const widths = [16, 24, 16, 48, 14, 32, 16, 16, 16, 18, 24, 18, 24, 34, 30, 22, 14, 14, 14]
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.autoFilter = { from: 'A2', to: 'S2' }

  const cleanBaseName = trainOrFileName.replace(/\.pdf$/i, '').replace(/\.xlsx$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputName = cleanBaseName.startsWith('confronto_') ? `${cleanBaseName}.xlsx` : `confronto_sobre_rodas_${cleanBaseName}.xlsx`
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = outputName
  link.click()
  URL.revokeObjectURL(url)
}

export function exportConfrontoPdf(
  items: ConfrontoResultItem[],
  trainOrFileName: string = 'confronto_sobre_rodas'
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
    sectionHeaders.forEach((section) => {
      const sectionWidth = widths.slice(x === margin ? 0 : sectionHeaders[0].count, 0).reduce((sum, width) => sum + width, 0)
      void sectionWidth
    })

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
    doc.text('Confronto Resumo Rumo x Estoque Sobre Rodas', margin, 10)
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
      item.resumo.vagao || '-', item.resumo.notaFiscal || '-', item.resumo.chaveNfe || '-',
      String(item.resumo.pesoRateio || '-'), item.resumo.destinatarioNf || '-', item.sobreRodas?.matrizPlaca || '-',
      item.sobreRodas?.matrizNfe || '-', String(item.sobreRodas?.matrizRateio || '-'), item.sobreRodas?.matrizIdExport || '-',
      item.sobreRodas?.matrizNomeExport || '-', item.sobreRodas?.matrizNomeFornecedor || '-',
      item.sobreRodas?.matrizOperacaoRds || '-', item.sobreRodas?.matrizDataChegada || '-',
      item.placaMatch ? 'VERDADEIRO' : 'FALSO', item.nfeMatch ? 'VERDADEIRO' : 'FALSO', item.rateioMatch ? 'VERDADEIRO' : 'FALSO',
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
