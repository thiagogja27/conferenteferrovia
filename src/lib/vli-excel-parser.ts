import * as XLSX from 'xlsx'

export interface VliMetadata {
  prefixoTrem?: string
  qtdVagoes?: string
  tu?: string
  origem?: string
  destino?: string
  dataInicio?: string
  dataFim?: string
}

export interface VliRowData {
  vagao: string
  os: string
  tara: string
  pesoLiquido: string
  pesoBruto: string
  nfe: string
  dataNfe: string
  pesoNf: string
  rateio: string
  valorNf: string
  chaveNf: string
  cnpjDest: string
  cnpjDestFormatted: string
  destinatario?: string
  rawRow: Record<string, any>
  originalRowIndex: number
}

export interface VliExtractionResult {
  metadata: VliMetadata
  allRows: VliRowData[]
  headers: string[]
  desmembreWagons: string[]
  desmembreRows: VliRowData[]
  desmembreCnpjCount: Record<string, number>
  totalUniqueWagons: number
  desmembreCount: number
  outputFileName: string
  excelBase64?: string
}

export function formatCnpj(rawCnpj: string | number | undefined | null): string {
  if (!rawCnpj) return ''
  const digits = String(rawCnpj).replace(/\D/g, '')
  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    )
  }
  return String(rawCnpj).trim()
}

export function cleanCnpjDigits(rawCnpj: string | number | undefined | null): string {
  if (!rawCnpj) return ''
  return String(rawCnpj).replace(/\D/g, '')
}

/**
 * Normaliza string para comparação sem acento e em minúsculas
 */
function normalizeHeader(str: string): string {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Lê e analisa a planilha do Relatório Resumo VLI
 */
export function parseVliExcelData(
  workbookData: ArrayBuffer | Uint8Array,
  fileName: string = 'resumo-vli.xlsx'
): VliExtractionResult {
  const wb = XLSX.read(workbookData, { type: 'array', cellDates: true })

  // Seleciona a primeira aba ou aba que contenha Resumo/Dados
  const sheetName =
    wb.SheetNames.find((name) =>
      /resumo|relat|dados|vli/i.test(name)
    ) || wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]
  if (!ws) {
    throw new Error('A planilha está vazia ou não contém abas válidas.')
  }

  // Converte a planilha em matriz 2D bruta
  const rawSheet: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'dd/mm/yyyy',
  })

  if (!rawSheet || rawSheet.length === 0) {
    throw new Error('A planilha selecionada está vazia.')
  }

  // 1. Extração de Metadados nos primeiros ~15 registros
  const metadata: VliMetadata = {}
  let headerRowIndex = -1

  for (let r = 0; r < Math.min(rawSheet.length, 25); r++) {
    const row = rawSheet[r]
    if (!row || !Array.isArray(row)) continue

    const fullRowText = row.map((c) => String(c || '').trim()).join(' ')

    // Busca prefixo do trem
    const prefixoMatch = fullRowText.match(/Prefixos?\s*Trem:?\s*([A-Za-z0-9_-]+)/i)
    if (prefixoMatch && !metadata.prefixoTrem) {
      metadata.prefixoTrem = prefixoMatch[1].trim()
    }

    // Quantidade de vagões
    const qtdMatch = fullRowText.match(/Quantidade\s*Vag[õo]es:?\s*(\d+)/i)
    if (qtdMatch && !metadata.qtdVagoes) {
      metadata.qtdVagoes = qtdMatch[1].trim()
    }

    // TU
    const tuMatch = fullRowText.match(/TU:?\s*([0-9.,]+)/i)
    if (tuMatch && !metadata.tu) {
      metadata.tu = tuMatch[1].trim()
    }

    // Origem
    const origMatch = fullRowText.match(/Origem:?\s*([A-Za-z0-9_-]+)/i)
    if (origMatch && !metadata.origem) {
      metadata.origem = origMatch[1].trim()
    }

    // Destino
    const destMatch = fullRowText.match(/Destino:?\s*([A-Za-z0-9_-]+)/i)
    if (destMatch && !metadata.destino) {
      metadata.destino = destMatch[1].trim()
    }

    // Data início
    const dataIniMatch = fullRowText.match(/Data\s*In[íi]cio\s*Carregamento:?\s*([0-9/.:\s-]+)/i)
    if (dataIniMatch && !metadata.dataInicio) {
      metadata.dataInicio = dataIniMatch[1].trim()
    }

    // Data fim
    const dataFimMatch = fullRowText.match(/Data\s*Fim\s*Carregamento:?\s*([0-9/.:\s-]+)/i)
    if (dataFimMatch && !metadata.dataFim) {
      metadata.dataFim = dataFimMatch[1].trim()
    }

    // Identificação da Linha de Cabeçalho da Tabela
    // Procuramos uma linha que contenha colunas típicas da VLI: 'Vagão' e 'OS' ou 'NFe' ou 'Rateio'
    const normalizedCells = row.map((c) => normalizeHeader(String(c)))
    const hasVagao = normalizedCells.some((c) => c === 'vagao' || c.startsWith('vagao'))
    const hasOsOrNfe = normalizedCells.some((c) => c === 'os' || c === 'nfe' || c === 'nf' || c === 'rateio')

    if (hasVagao && hasOsOrNfe) {
      headerRowIndex = r
      break
    }
  }

  // Se não achou de forma estrita, procura linha com 'vagao'
  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(rawSheet.length, 30); r++) {
      const row = rawSheet[r]
      if (!row) continue
      const normalizedCells = row.map((c) => normalizeHeader(String(c)))
      if (normalizedCells.some((c) => c.includes('vagao'))) {
        headerRowIndex = r
        break
      }
    }
  }

  if (headerRowIndex === -1) {
    throw new Error(
      'Não foi possível localizar o cabeçalho da tabela VLI (coluna "Vagão" não encontrada). Verifique o layout da planilha.'
    )
  }

  // 2. Mapeamento das Colunas pelo Cabeçalho
  const rawHeaders: string[] = rawSheet[headerRowIndex].map((c) => String(c || '').trim())
  const normalizedHeaders = rawHeaders.map((c) => normalizeHeader(c))

  let colVagao = -1
  let colOs = -1
  let colTara = -1
  let colPesoLiquido = -1
  let colPesoBruto = -1
  let colNfe = -1
  let colDataNfe = -1
  let colPesoNf = -1
  let colRateio = -1
  let colValorNf = -1
  let colChaveNf = -1
  let colCnpjDest = -1
  let colDestinatario = -1

  normalizedHeaders.forEach((header, idx) => {
    if (header === 'vagao' || header.startsWith('vagao')) {
      if (colVagao === -1) colVagao = idx
    } else if (header === 'os' || header === 'o.s.' || header.includes('ordem')) {
      if (colOs === -1) colOs = idx
    } else if (header === 'tara') {
      if (colTara === -1) colTara = idx
    } else if (header === 'peso liquido' || header === 'peso liq' || header === 'liquido') {
      if (colPesoLiquido === -1) colPesoLiquido = idx
    } else if (header === 'peso' || header === 'peso bruto' || header === 'tb') {
      if (colPesoBruto === -1) colPesoBruto = idx
    } else if (header === 'nfe' || header === 'nf' || header === 'nota fiscal' || header.startsWith('nfe')) {
      if (colNfe === -1) colNfe = idx
    } else if (header.includes('data') && (header.includes('nfe') || header.includes('nf'))) {
      if (colDataNfe === -1) colDataNfe = idx
    } else if (header === 'peso nf' || header === 'peso nfe') {
      if (colPesoNf === -1) colPesoNf = idx
    } else if (header === 'rateio' || header.includes('rateio')) {
      if (colRateio === -1) colRateio = idx
    } else if (header === 'valor nf' || header === 'valor nfe' || header === 'valor') {
      if (colValorNf === -1) colValorNf = idx
    } else if (header.includes('chave')) {
      if (colChaveNf === -1) colChaveNf = idx
    } else if (
      header.includes('cnpj') &&
      (header.includes('dest') || header.includes('destinatario'))
    ) {
      if (colCnpjDest === -1) colCnpjDest = idx
    } else if (
      header === 'destinatario' ||
      header === 'destinatário' ||
      header.includes('destinatario')
    ) {
      if (colDestinatario === -1) colDestinatario = idx
    }
  })

  // Se a coluna CNPJ Dest. não foi encontrada diretamente pelo nome exato:
  // Procura por qualquer coluna que contenha "cnpj" ou posicionada após a Chave NF
  if (colCnpjDest === -1) {
    normalizedHeaders.forEach((h, idx) => {
      if (h.includes('cnpj') && colCnpjDest === -1) {
        colCnpjDest = idx
      }
    })
  }

  // Se ainda não encontrou, inspeciona valores das primeiras linhas após o cabeçalho
  if (colCnpjDest === -1) {
    for (let r = headerRowIndex + 1; r < Math.min(rawSheet.length, headerRowIndex + 15); r++) {
      const row = rawSheet[r]
      if (!row) continue
      for (let c = 0; c < row.length; c++) {
        const val = cleanCnpjDigits(row[c])
        if (val.length === 14) {
          colCnpjDest = c
          break
        }
      }
      if (colCnpjDest !== -1) break
    }
  }

  if (colVagao === -1) {
    colVagao = 0 // Assume primeira coluna como fallback
  }

  // 3. Processa Linhas de Dados
  const allRows: VliRowData[] = []
  const wagonMap = new Map<string, VliRowData[]>()

  for (let r = headerRowIndex + 1; r < rawSheet.length; r++) {
    const row = rawSheet[r]
    if (!row || !Array.isArray(row)) continue

    const vagaoVal = String(row[colVagao] || '').trim()
    // Ignora linhas de totalização ou vazias
    if (!vagaoVal || /total|m[eé]dia|resumo/i.test(vagaoVal)) continue

    const osVal = colOs !== -1 ? String(row[colOs] || '').trim() : ''
    const taraVal = colTara !== -1 ? String(row[colTara] || '').trim() : ''
    const pesoLiqVal = colPesoLiquido !== -1 ? String(row[colPesoLiquido] || '').trim() : ''
    const pesoBrutoVal = colPesoBruto !== -1 ? String(row[colPesoBruto] || '').trim() : ''
    const nfeVal = colNfe !== -1 ? String(row[colNfe] || '').trim() : ''
    const dataNfeVal = colDataNfe !== -1 ? String(row[colDataNfe] || '').trim() : ''
    const pesoNfVal = colPesoNf !== -1 ? String(row[colPesoNf] || '').trim() : ''
    const rateioVal = colRateio !== -1 ? String(row[colRateio] || '').trim() : ''
    const valorNfVal = colValorNf !== -1 ? String(row[colValorNf] || '').trim() : ''
    const chaveNfVal = colChaveNf !== -1 ? String(row[colChaveNf] || '').replace(/\s/g, '').trim() : ''

    let cnpjDestVal = ''
    if (colCnpjDest !== -1) {
      cnpjDestVal = String(row[colCnpjDest] || '').trim()
    } else {
      // Fallback: tenta extrair CNPJ de colunas vizinhas
      for (let c = (colChaveNf !== -1 ? colChaveNf + 1 : 0); c < row.length; c++) {
        const raw = cleanCnpjDigits(row[c])
        if (raw.length === 14) {
          cnpjDestVal = String(row[c]).trim()
          break
        }
      }
    }

    const destinatarioVal = colDestinatario !== -1 ? String(row[colDestinatario] || '').trim() : ''

    const cleanCnpj = cleanCnpjDigits(cnpjDestVal)
    const formattedCnpj = cleanCnpj ? formatCnpj(cleanCnpj) : (cnpjDestVal || '-')

    // Monta o objeto de dados bruto indexado pelos cabeçalhos originais
    const rawRowObj: Record<string, any> = {}
    rawHeaders.forEach((headerName, idx) => {
      rawRowObj[headerName || `Coluna_${idx + 1}`] = row[idx] ?? ''
    })

    const parsedItem: VliRowData = {
      vagao: vagaoVal,
      os: osVal,
      tara: taraVal,
      pesoLiquido: pesoLiqVal,
      pesoBruto: pesoBrutoVal,
      nfe: nfeVal,
      dataNfe: dataNfeVal,
      pesoNf: pesoNfVal,
      rateio: rateioVal,
      valorNf: valorNfVal,
      chaveNf: chaveNfVal,
      cnpjDest: cleanCnpj || cnpjDestVal,
      cnpjDestFormatted: formattedCnpj,
      destinatario: destinatarioVal,
      rawRow: rawRowObj,
      originalRowIndex: r,
    }

    allRows.push(parsedItem)

    // Agrupa por vagão para detecção de desmembre
    const existing = wagonMap.get(vagaoVal) || []
    existing.push(parsedItem)
    wagonMap.set(vagaoVal, existing)
  }

  // 4. Identificação dos Desmembres
  // REGRA DO USUÁRIO: "sempre que o cnpj da coluna CNPJ Dest. for diferente por seu vagao unico aparecera os desmembres"
  const desmembreWagons: string[] = []
  const desmembreRows: VliRowData[] = []
  const desmembreCnpjCount: Record<string, number> = {}

  for (const [vagao, rows] of wagonMap.entries()) {
    // Coleta todos os CNPJs de destino distintos para esse vagão único
    const distinctCnpjs = new Set<string>()
    rows.forEach((item) => {
      const clean = cleanCnpjDigits(item.cnpjDest)
      if (clean) {
        distinctCnpjs.add(clean)
      } else if (item.cnpjDest && item.cnpjDest !== '-') {
        distinctCnpjs.add(item.cnpjDest.trim())
      }
    })

    // Se possui 2 ou mais CNPJs diferentes para o mesmo vagão, é um DESMEMBRE!
    if (distinctCnpjs.size > 1) {
      desmembreWagons.push(vagao)
      rows.forEach((item) => {
        desmembreRows.push(item)
        const key = item.cnpjDestFormatted || 'Não Informado'
        desmembreCnpjCount[key] = (desmembreCnpjCount[key] || 0) + 1
      })
    }
  }

  // Nome do arquivo de saída
  const prefixoPart = metadata.prefixoTrem ? `_${metadata.prefixoTrem}` : ''
  const baseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const outputFileName = `desmembre_vli${prefixoPart || `_${baseName}`}.xlsx`

  // Gera o workbook Excel
  const wbOut = generateVliWorkbook(allRows, desmembreRows, rawHeaders, metadata)
  const excelBase64 = XLSX.write(wbOut, { bookType: 'xlsx', type: 'base64' })

  return {
    metadata,
    allRows,
    headers: rawHeaders,
    desmembreWagons,
    desmembreRows,
    desmembreCnpjCount,
    totalUniqueWagons: wagonMap.size,
    desmembreCount: desmembreWagons.length,
    outputFileName,
    excelBase64,
  }
}

/**
 * Constrói a planilha Excel com aba de Desmembres e Dados Completos
 */
export function generateVliWorkbook(
  allRows: VliRowData[],
  desmembreRows: VliRowData[],
  originalHeaders: string[],
  metadata: VliMetadata
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // 1. Aba de Desmembres (Principal)
  const desmembreHeader = [
    'Vagão',
    'OS',
    'Tara',
    'Peso Líquido',
    'Peso (TB)',
    'NFe',
    'Data NFe',
    'Peso NF',
    'Rateio',
    'Valor NF',
    'Chave NF',
    'CNPJ Dest.',
    'Destinatário',
  ]

  const desmembreTableData: string[][] = [desmembreHeader]
  desmembreRows.forEach((row) => {
    desmembreTableData.push([
      row.vagao,
      row.os,
      row.tara,
      row.pesoLiquido,
      row.pesoBruto,
      row.nfe,
      row.dataNfe,
      row.pesoNf,
      row.rateio,
      row.valorNf,
      row.chaveNf,
      row.cnpjDestFormatted || row.cnpjDest,
      row.destinatario || '',
    ])
  })

  const wsDesmembres = XLSX.utils.aoa_to_sheet(desmembreTableData)
  // Configura largura das colunas
  wsDesmembres['!cols'] = [
    { wch: 12 }, // Vagão
    { wch: 12 }, // OS
    { wch: 10 }, // Tara
    { wch: 14 }, // Peso Liq
    { wch: 12 }, // Peso Bruto
    { wch: 12 }, // NFe
    { wch: 14 }, // Data NFe
    { wch: 12 }, // Peso NF
    { wch: 12 }, // Rateio
    { wch: 14 }, // Valor NF
    { wch: 48 }, // Chave NF
    { wch: 22 }, // CNPJ Dest.
    { wch: 30 }, // Destinatário
  ]
  XLSX.utils.book_append_sheet(wb, wsDesmembres, 'Desmembres')

  // 2. Aba de Todos os Registros
  const allRowsTableData: string[][] = [desmembreHeader]
  allRows.forEach((row) => {
    allRowsTableData.push([
      row.vagao,
      row.os,
      row.tara,
      row.pesoLiquido,
      row.pesoBruto,
      row.nfe,
      row.dataNfe,
      row.pesoNf,
      row.rateio,
      row.valorNf,
      row.chaveNf,
      row.cnpjDestFormatted || row.cnpjDest,
      row.destinatario || '',
    ])
  })
  const wsAll = XLSX.utils.aoa_to_sheet(allRowsTableData)
  wsAll['!cols'] = wsDesmembres['!cols']
  XLSX.utils.book_append_sheet(wb, wsAll, 'Dados Completos')

  // 3. Aba de Resumo Metadados e CNPJs
  const metaRows: string[][] = [
    ['RELATÓRIO RESUMO VLI - CONTROLE DE DESMEMBRES'],
    ['Prefixo Trem', metadata.prefixoTrem || '-'],
    ['Quantidade Vagões', metadata.qtdVagoes || '-'],
    ['TU Total', metadata.tu || '-'],
    ['Origem', metadata.origem || '-'],
    ['Destino', metadata.destino || '-'],
    ['Data Início Carregamento', metadata.dataInicio || '-'],
    ['Data Fim Carregamento', metadata.dataFim || '-'],
    [''],
    ['Total Vagões Analisados', String(new Set(allRows.map((r) => r.vagao)).size)],
    ['Total Vagões com Desmembre', String(new Set(desmembreRows.map((r) => r.vagao)).size)],
    ['Total Linhas Desmembradas', String(desmembreRows.length)],
  ]
  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows)
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Resumo')

  return wb
}

/**
 * Função utilitária para exportar e baixar o arquivo .xlsx
 */
export function exportVliExcelFile(
  allRows: VliRowData[],
  desmembreRows: VliRowData[],
  originalHeaders: string[],
  metadata: VliMetadata,
  fileName: string = 'desmembre_vli.xlsx'
) {
  const wb = generateVliWorkbook(allRows, desmembreRows, originalHeaders, metadata)
  XLSX.writeFile(wb, fileName)
}
