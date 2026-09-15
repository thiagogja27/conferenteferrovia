import * as XLSX from 'xlsx'

export interface RumoExtractionResult {
  aoaData: string[][]
  desmembreCount: number
  desmembreRows: string[][]
  desmembreRemetenteCount: Record<string, number>
  cnpjData: string[][]
  prefixo: string | null
  trainName: string | null
  outputFileName: string
  totalWagons: number
  totalWeightKg: number
}

export interface RumoFileEntry {
  id: string
  originalName: string
  name: string
  createdAt: string
  prefixo?: string | null
  trainName?: string | null
  desmembreCount?: number
  desmembreRemetenteCount?: Record<string, number>
  tableData: string[][]
  desmembreRows: string[][]
  cnpjData: string[][]
}

export function convertWeightValue(value: string): string {
  if (!value) return ''
  const cleanedValue = value.replace(/\./g, '').replace(/,/g, '.')
  const number = parseFloat(cleanedValue)
  if (isNaN(number)) {
    return value
  }
  // Se o valor parece estar em toneladas (ex: 50.400 ou 50.4), converte para kg
  const finalValue = Math.round(number * 1000)
  return finalValue.toString()
}

export function processRumoExtractedText(text: string, originalFileName: string = 'resumo.pdf'): RumoExtractionResult {
  const prefixoRegex = /Prefixo\s*-\s*OS:\s*([^\n\r]*?)(?:\s{2,}|\n|\r)/
  const prefixoMatch = text.match(prefixoRegex)
  const prefixo = prefixoMatch ? prefixoMatch[1].trim() : null

  const trainRegex = /(?:Nome do Trem|Trem):\s*([^\n\r]+)/i
  const trainMatch = text.match(trainRegex)
  const trainName = trainMatch ? trainMatch[1].trim() : null

  const mainHeader = [
    'Seq.',
    'Vagão',
    'Num. CT-e',
    'Tara',
    'TU',
    'TB',
    'Ticket Tara',
    'Ticket TU',
    'Ticket TB',
    'Mercadoria',
    'Data Carregamento',
    'Nota Fiscal (NF)',
    'Chave NFE',
    'Data NF',
    'Peso Total NF',
    'Peso Rateio',
    'Remetente NF',
    'Destinatário NF',
  ]
  const desmembreHeader = ['Vagão', 'TB', 'Chave NFE', 'Remetente NF', 'Data NF', 'Peso Rateio', 'Exportador']
  const cnpjHeader = ['Vagão', 'CNPJ Remetente']

  const aoaData: string[][] = [mainHeader]
  const desmembreRows: string[][] = [desmembreHeader]
  const cnpjData: string[][] = [cnpjHeader]
  const desmembreRemetenteCount: Record<string, number> = {}

  // Regex para separar cada registro de vagão
  // Quebra por linhas iniciadas com sequência numérica e placa de vagão
  const recordSplitRegex = /(?:^|\r?\n)\s*(?=\d{1,3}\.?\s+[A-Z0-9-]{6,14})/m
  const records = text.split(recordSplitRegex).filter((r) => r.trim() !== '')

  const wagonRegex = /^(\d{1,3})\.?\s+([A-Z0-9-]{6,14})\s+(.*)/s
  const nfBoundaryRegex = /(\S+)\s+([\d\s]{40,60})\s+(\d{2}\s*[/|-]\s*\d{2}\s*[/|-]\s*\d{2,4})/g

  const wagonCounts = new Map<string, number>()
  const uniqueDesmembres = new Set<string>()

  // Primeira passagem: detectar vagões com desmembres (duplicados)
  for (const record of records) {
    const wagonMatch = record.match(wagonRegex)
    if (wagonMatch) {
      const rawPlate = wagonMatch[2].trim().toUpperCase()
      const sanitizedPlate = rawPlate.replace(/O/g, '0').replace(/I/g, '1')
      if ((wagonCounts.get(sanitizedPlate) || 0) > 0) {
        uniqueDesmembres.add(sanitizedPlate)
      }
      wagonCounts.set(sanitizedPlate, (wagonCounts.get(sanitizedPlate) || 0) + 1)
    }
  }

  const desmembreCount = uniqueDesmembres.size
  let totalWeightKg = 0
  const countedWeightWagons = new Set<string>()

  // Segunda passagem: extrair dados detalhados
  for (const record of records) {
    const wagonMatch = record.match(wagonRegex)
    if (!wagonMatch) continue

    const seq = wagonMatch[1].trim()
    const rawPlate = wagonMatch[2].trim().toUpperCase()
    const sanitizedPlate = rawPlate.replace(/O/g, '0').replace(/I/g, '1')
    let restOfRecord = wagonMatch[3] || ''
    const isDesmembre = uniqueDesmembres.has(sanitizedPlate)
    const wagonDisplay = sanitizedPlate

    const footerTerminator = /Tota(l)?|Qntd|Ticket|Recebemos|Assinatura/i
    const footerMatchIndex = restOfRecord.search(footerTerminator)
    if (footerMatchIndex !== -1) {
      restOfRecord = restOfRecord.substring(0, footerMatchIndex)
    }

    const allNfMatches = [...restOfRecord.matchAll(nfBoundaryRegex)]
    if (allNfMatches.length === 0) continue

    const firstNfMatch = allNfMatches[0]
    const wagonInfoString = restOfRecord.substring(0, firstNfMatch.index).trim()

    let numCte = '',
      tara = '',
      tu = '',
      tb = '',
      ticketTara = '',
      ticketTu = '',
      ticketTb = '',
      mercadoria = '',
      dataCarregamento = ''

    const dateRegex = /(\d{2}[/|-]\d{2}[/|-]\d{2,4}\s+\d{2}:\d{2}:\d{2})\s*$/
    const dateMatch = wagonInfoString.match(dateRegex)

    let stringToParse = wagonInfoString
    if (dateMatch) {
      dataCarregamento = dateMatch[0].trim()
      stringToParse = wagonInfoString.substring(0, dateMatch.index).trim()
    }

    const parts = stringToParse.split(/\s+/).filter(Boolean)
    const mercadoriaParts: string[] = []
    let firstMerchandiseIndex = parts.length

    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (/[a-zA-Z]/.test(part) && isNaN(parseFloat(part))) {
        mercadoriaParts.unshift(part)
        firstMerchandiseIndex = i
      } else {
        if (mercadoriaParts.length > 0) break
      }
    }

    mercadoria = mercadoriaParts.join(' ')

    const numberParts = parts.slice(0, firstMerchandiseIndex)
    numCte = `${numberParts[0] || ''} ${numberParts[1] || ''}`.trim()
    tara = convertWeightValue(numberParts[2] || '')
    tu = convertWeightValue(numberParts[3] || '')
    tb = convertWeightValue(numberParts[4] || '')
    ticketTara = numberParts[5] || ''
    ticketTu = numberParts[6] || ''
    ticketTb = numberParts[7] || ''

    if (tu && !countedWeightWagons.has(wagonDisplay)) {
      const tuNum = parseFloat(tu)
      if (!isNaN(tuNum)) {
        totalWeightKg += tuNum
        countedWeightWagons.add(wagonDisplay)
      }
    }

    const nfParser = /(\S+)\s+([\d\s]{40,60})\s+(\d{2}\s*[/|-]\s*\d{2}\s*[/|-]\s*\d{2,4})\s+(.*)/

    for (let i = 0; i < allNfMatches.length; i++) {
      const match = allNfMatches[i]
      const startIndex = match.index || 0
      const endIndex = i + 1 < allNfMatches.length ? allNfMatches[i + 1].index || restOfRecord.length : restOfRecord.length
      const nfBlock = restOfRecord.substring(startIndex, endIndex)
      const singleLineNfBlock = nfBlock.replace(/[\r\n]+/g, ' ').trim()
      const finalNfMatch = singleLineNfBlock.match(nfParser)
      if (!finalNfMatch) continue

      const numNf = finalNfMatch[1].trim()
      const chaveNfe = finalNfMatch[2].replace(/\s/g, '')
      const dataNf = finalNfMatch[3].replace(/\s/g, '').replace(/-/g, '/')
      const restOfNfRaw = finalNfMatch[4]

      const cnpjRemetente = chaveNfe.length >= 20 ? chaveNfe.substring(6, 20) : ''
      cnpjData.push([wagonDisplay, cnpjRemetente])

      const restOfNfLine = restOfNfRaw.trim().split(/\s+/).filter(Boolean)

      let pesoTotalNf = ''
      let pesoRateio = ''
      let clientStartIndex = 0

      if (restOfNfLine.length > 0) {
        const potentialWeight1 = convertWeightValue(restOfNfLine[0])
        if (/^\d+$/.test(potentialWeight1)) {
          pesoTotalNf = potentialWeight1
          clientStartIndex = 1
        }
      }

      if (clientStartIndex === 1 && restOfNfLine.length > 1) {
        const potentialWeight2 = convertWeightValue(restOfNfLine[1])
        if (/^\d+$/.test(potentialWeight2)) {
          pesoRateio = potentialWeight2
          clientStartIndex = 2
        }
      }

      const clienteParts = restOfNfLine.slice(clientStartIndex)
      const mid = Math.ceil(clienteParts.length / 2)
      const remetenteNf = clienteParts.slice(0, mid).join(' ')
      const destinatarioNf = clienteParts.slice(mid).join(' ')

      const completeRow = [
        seq,
        wagonDisplay,
        numCte,
        tara,
        tu,
        tb,
        ticketTara,
        ticketTu,
        ticketTb,
        mercadoria,
        dataCarregamento,
        numNf,
        chaveNfe,
        dataNf,
        pesoTotalNf,
        pesoRateio,
        remetenteNf,
        destinatarioNf,
      ]
      aoaData.push(completeRow)

      if (isDesmembre) {
        const desmembreWagonDisplay = `${sanitizedPlate}`
        const fornecedorCnpj = chaveNfe.length >= 20 ? chaveNfe.substring(6, 20) : ''
        const desmembreSummaryRow = [
          desmembreWagonDisplay,
          tb,
          chaveNfe,
          remetenteNf,
          dataNf,
          pesoRateio,
          fornecedorCnpj,
        ]
        desmembreRows.push(desmembreSummaryRow)
        if (remetenteNf) {
          desmembreRemetenteCount[remetenteNf] = (desmembreRemetenteCount[remetenteNf] || 0) + 1
        }
      }
    }
  }

  const sanitizedTrainName = trainName ? trainName.replace(/[^a-zA-Z0-9-]/g, '_').replace(/\s/g, '-') : null
  const sanitizedPrefix = prefixo ? prefixo.replace(/[^a-zA-Z0-9-]/g, '_').replace(/\s/g, '-') : null
  const baseName = originalFileName.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputFileName = sanitizedTrainName
    ? `${sanitizedTrainName}.xlsx`
    : sanitizedPrefix
      ? `${sanitizedPrefix}.xlsx`
      : `${baseName || 'resumo-composicao'}.xlsx`

  return {
    aoaData,
    desmembreCount,
    desmembreRows,
    desmembreRemetenteCount,
    cnpjData,
    prefixo,
    trainName,
    outputFileName,
    totalWagons: wagonCounts.size,
    totalWeightKg,
  }
}

export function generateRumoWorkbook(
  tableData: string[][],
  desmembreRows: string[][],
  cnpjData: string[][]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  if (tableData && tableData.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet(tableData)
    XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  }

  if (desmembreRows && desmembreRows.length > 1) {
    const wsDesmembre = XLSX.utils.aoa_to_sheet(desmembreRows)
    XLSX.utils.book_append_sheet(wb, wsDesmembre, 'Desmembres')
  }

  if (cnpjData && cnpjData.length > 1) {
    const wsCnpj = XLSX.utils.aoa_to_sheet(cnpjData)
    XLSX.utils.book_append_sheet(wb, wsCnpj, 'CNPJ')
  }

  return wb
}

export function exportRumoExcelFile(
  tableData: string[][],
  desmembreRows: string[][],
  cnpjData: string[][],
  fileName: string
) {
  const wb = generateRumoWorkbook(tableData, desmembreRows, cnpjData)
  XLSX.writeFile(wb, fileName || 'resumo-composicao.xlsx')
}

export function buildRumoExcelBase64(wb: XLSX.WorkBook): string {
  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
}
