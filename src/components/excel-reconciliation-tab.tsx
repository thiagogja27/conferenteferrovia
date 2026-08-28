'use client'

import React, { useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { verifyChaveCNPJ, type NFEData } from '@/lib/nfe-parser'
import * as XLSX from 'xlsx'
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  FileCode,
  Search,
  Check,
  Copy,
  FileCheck2,
  XCircle,
  FileQuestion,
  Volume2,
  AlertTriangle,
  Scale,
  Bot,
  BrainCircuit,
  Zap,
  CheckCheck,
  Sparkles,
} from 'lucide-react'
import {
  auditarDivergenciasComIA,
  type WeightAuditItemInput,
  type WeightAuditItemResult,
  type WeightAuditResponse,
} from '@/lib/weight-ai-auditor'

interface ProcessedFile {
  fileName: string
  originalPath: string
  xmlContent: string
  nfeData: NFEData | null
  error: string | null
}

interface ExcelMatchInfo {
  row: number
  rawValue: string
  sheetName: string
  pesoSelecionado?: number | null
  pesoSelecionadoStr?: string
  pesoNotaVagao?: number | null
  pesoNotaVagaoStr?: string
  tara?: number | null
  taraStr?: string
  vagao?: string
  pesoBruto?: number | null
  pesoBrutoStr?: string
}

export interface WagonSummary {
  vagao: string
  sheetName: string
  qtdNotas: number
  somaPesoNotaVagao: number
  somaPesoNotaVagaoStr: string
  tara: number
  taraStr: string
  pesoBrutoTotal: number
  pesoBrutoTotalStr: string
  linhas: string
}

interface ExcelData {
  fileName: string
  totalRows: number
  keysMap: Map<string, ExcelMatchInfo>
  allKeysList: string[]
  sheets: string[]
  wagonSummaries?: WagonSummary[]
}

export function confrontWeights(
  matchInfo: ExcelMatchInfo | null | undefined,
  qtdNota: number
) {
  const pesoNotaVagaoStr = matchInfo?.pesoNotaVagaoStr || 'N/A'
  const taraStr = matchInfo?.taraStr || 'N/A'
  const vagao = matchInfo?.vagao || ''
  const pesoBrutoStr = matchInfo?.pesoBrutoStr || 'N/A'

  if (!matchInfo || matchInfo.pesoSelecionado === undefined || matchInfo.pesoSelecionado === null) {
    return {
      pesoExcel: null as number | null,
      pesoExcelStr: 'N/A',
      pesoNotaVagaoStr,
      taraStr,
      vagao,
      pesoBrutoStr,
      qtdNota,
      diferenca: 0,
      status: 'SEM_PESO_EXCEL' as const,
      statusLabel: 'S/ PESO EXCEL',
      detalhes: 'Coluna "Peso Selecionado" não encontrada ou sem valor no Excel',
    }
  }

  const pesoExcel = matchInfo.pesoSelecionado
  const pesoExcelStr = matchInfo.pesoSelecionadoStr || String(pesoExcel)

  let diff = Math.abs(pesoExcel - qtdNota)
  let isEquivalentUnit = false

  // Checar equivalência de unidades (TON vs KG, ex: 47,76 TON vs 47760 KG)
  if (diff > 0.01) {
    if (Math.abs(pesoExcel * 1000 - qtdNota) < 1) {
      isEquivalentUnit = true
      diff = 0
    } else if (Math.abs(pesoExcel - qtdNota * 1000) < 1) {
      isEquivalentUnit = true
      diff = 0
    }
  }

  if (diff <= 0.01) {
    return {
      pesoExcel,
      pesoExcelStr,
      pesoNotaVagaoStr,
      taraStr,
      vagao,
      pesoBrutoStr,
      qtdNota,
      diferenca: 0,
      status: 'CONFERE' as const,
      statusLabel: 'PESO CONFERE',
      detalhes: isEquivalentUnit
        ? `Valores equivalentes (Excel: ${pesoExcelStr} | Nota: ${qtdNota})`
        : `Valores batem (Excel: ${pesoExcelStr} | Nota: ${qtdNota})`,
    }
  }

  const diferencaReal = pesoExcel - qtdNota
  return {
    pesoExcel,
    pesoExcelStr,
    pesoNotaVagaoStr,
    taraStr,
    vagao,
    pesoBrutoStr,
    qtdNota,
    diferenca: diferencaReal,
    status: 'DIVERGENTE' as const,
    statusLabel: `DIVERGÊNCIA (${diferencaReal > 0 ? '+' : ''}${diferencaReal.toLocaleString('pt-BR', { maximumFractionDigits: 3 })})`,
    detalhes: `Excel (${pesoExcelStr}) ≠ Nota (${qtdNota.toLocaleString('pt-BR')}) | Dif: ${diferencaReal.toLocaleString('pt-BR')}`,
  }
}

const parseBRFloat = (val: string | number | undefined | null): number => {
  if (val === undefined || val === null) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const str = String(val).trim()
  if (!str) return 0
  if (str.includes(',')) {
    const cleanStr = str.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleanStr)
    return isNaN(num) ? 0 : num
  }
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

const getFileQuantidade = (f: ProcessedFile): number => {
  if (f.nfeData?.transportador?.pesoLiquido && Number(f.nfeData.transportador.pesoLiquido) > 0) {
    return Number(f.nfeData.transportador.pesoLiquido)
  }

  if (f.nfeData?.itens && f.nfeData.itens.length > 0) {
    const sumItens = f.nfeData.itens.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0)
    if (sumItens > 0) return sumItens
  }

  if (f.nfeData?.transportador?.quantidade) {
    const transpQtd = Number(f.nfeData.transportador.quantidade) || 0
    if (transpQtd > 0) return transpQtd
  }

  return 0
}

interface ExcelReconciliationTabProps {
  files: ProcessedFile[]
  speakText?: (text: string) => void
  onSelectFile?: (index: number) => void
}

export function ExcelReconciliationTab({
  files,
  speakText,
  onSelectFile,
}: ExcelReconciliationTabProps) {
  const [excelData, setExcelData] = useState<ExcelData | null>(null)
  const [rawWorkbook, setRawWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [excelFileName, setExcelFileName] = useState<string>('')
  const [isExcelLoading, setIsExcelLoading] = useState<boolean>(false)
  const [availableExcelColumns, setAvailableExcelColumns] = useState<string[]>([])
  const [selectedExcelWeightCol, setSelectedExcelWeightCol] = useState<string>('auto')
  const [excelFilter, setExcelFilter] = useState<'all' | 'matched' | 'unmatched' | 'excel_only' | 'weight_divergent'>('all')
  const [excelSearchQuery, setExcelSearchQuery] = useState<string>('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Estados para Auditoria de IA
  const [auditResultsMap, setAuditResultsMap] = useState<Record<string, WeightAuditItemResult>>({})
  const [overrideWeightsMap, setOverrideWeightsMap] = useState<Record<string, number>>({})
  const [isAuditingAllWeights, setIsAuditingAllWeights] = useState<boolean>(false)
  const [auditingKey, setAuditingKey] = useState<string | null>(null)

  const excelInputRef = useRef<HTMLInputElement>(null)

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const processExcelWorkbook = (
    workbook: XLSX.WorkBook,
    fileName: string,
    weightColumnChoice: string = selectedExcelWeightCol
  ) => {
    const keysMap = new Map<string, ExcelMatchInfo>()
    const allKeysList: string[] = []
    let totalRows = 0
    const allColsSet = new Set<string>()

    const globalWagonMap = new Map<string, { vagao: string; sheetName: string; sumPeso: number; tara: number; count: number; rows: number[] }>()

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
      totalRows += rows.length

      // Coletar nomes de todas as colunas
      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const headerRow = rows[r]
        if (!headerRow) continue
        headerRow.forEach((c) => {
          const colName = String(c || '').trim()
          if (colName && colName.length < 80 && !allColsSet.has(colName)) {
            allColsSet.add(colName)
          }
        })
      }

      // Identificar colunas no cabeçalho
      let pesoColIndex = -1
      let pesoNotaVagaoColIndex = -1
      let taraColIndex = -1
      let vagaoColIndex = -1
      let brutoColIndex = -1

      for (let r = 0; r < Math.min(rows.length, 30); r++) {
        const headerRow = rows[r]
        if (!headerRow) continue
        for (let c = 0; c < headerRow.length; c++) {
          const cellStr = String(headerRow[c] || '').trim().toLowerCase()

          if (
            pesoNotaVagaoColIndex === -1 &&
            (cellStr.includes('peso_nota_vagao') ||
              cellStr.includes('peso nota vagao') ||
              cellStr.includes('peso_nota_vagão') ||
              cellStr.includes('peso nota vagão') ||
              cellStr.includes('peso_vagao') ||
              cellStr.includes('peso vagao') ||
              cellStr.includes('peso_rateado'))
          ) {
            pesoNotaVagaoColIndex = c
          }

          if (
            taraColIndex === -1 &&
            (cellStr === 'tara' ||
              cellStr.includes('tara_vagao') ||
              cellStr.includes('tara vagao') ||
              cellStr.includes('tara_vagão') ||
              cellStr.includes('tara(kg)') ||
              cellStr.includes('tara (kg)') ||
              cellStr.includes('tara (t)'))
          ) {
            taraColIndex = c
          }

          if (
            vagaoColIndex === -1 &&
            (cellStr === 'vagao' ||
              cellStr === 'vagão' ||
              cellStr.includes('vagao') ||
              cellStr.includes('vagão') ||
              cellStr.includes('n_vagao') ||
              cellStr.includes('num_vagao'))
          ) {
            vagaoColIndex = c
          }

          if (
            brutoColIndex === -1 &&
            (cellStr.includes('peso_bruto') ||
              cellStr.includes('peso bruto') ||
              cellStr.includes('bruto(kg)') ||
              cellStr.includes('bruto (kg)') ||
              cellStr.includes('bruto (t)'))
          ) {
            brutoColIndex = c
          }

          if (weightColumnChoice === 'none') {
            pesoColIndex = -999
          } else if (weightColumnChoice && weightColumnChoice !== 'auto') {
            if (String(headerRow[c] || '').trim().toLowerCase() === weightColumnChoice.trim().toLowerCase()) {
              pesoColIndex = c
            }
          } else if (
            pesoColIndex === -1 &&
            (cellStr.includes('peso_selecionado') ||
              cellStr.includes('peso selecionado') ||
              cellStr.includes('peso_liquido') ||
              cellStr.includes('peso liquido') ||
              cellStr.includes('peso_líquido') ||
              cellStr.includes('peso líquido') ||
              cellStr.includes('pesoliquido') ||
              cellStr.includes('peso_liq') ||
              cellStr.includes('peso liq') ||
              cellStr.includes('qtd_nota') ||
              cellStr.includes('quantidade'))
          ) {
            pesoColIndex = c
          }
        }
      }

      // Varredura das linhas da aba
      rows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 1
        if (!Array.isArray(row)) return

        let rowVagao = ''
        let rowPesoNotaVagao: number | null = null
        let rowTara: number | null = null
        let rowBruto: number | null = null

        if (vagaoColIndex !== -1 && row[vagaoColIndex] !== undefined && row[vagaoColIndex] !== null) {
          const vStr = String(row[vagaoColIndex]).trim()
          if (vStr) rowVagao = vStr
        }

        if (pesoNotaVagaoColIndex !== -1 && row[pesoNotaVagaoColIndex] !== undefined && row[pesoNotaVagaoColIndex] !== null) {
          const pVal = parseBRFloat(row[pesoNotaVagaoColIndex])
          if (pVal > 0) rowPesoNotaVagao = pVal
        }

        if (taraColIndex !== -1 && row[taraColIndex] !== undefined && row[taraColIndex] !== null) {
          const tVal = parseBRFloat(row[taraColIndex])
          if (tVal > 0) rowTara = tVal
        }

        if (brutoColIndex !== -1 && row[brutoColIndex] !== undefined && row[brutoColIndex] !== null) {
          const bVal = parseBRFloat(row[brutoColIndex])
          if (bVal > 0) rowBruto = bVal
        }

        if (rowVagao) {
          const vagaoKey = `${sheetName}_${rowVagao.toUpperCase()}`
          const existing = globalWagonMap.get(vagaoKey) || {
            vagao: rowVagao,
            sheetName,
            sumPeso: 0,
            tara: rowTara || 0,
            count: 0,
            rows: [],
          }
          if (rowPesoNotaVagao) {
            existing.sumPeso += rowPesoNotaVagao
          }
          if (rowTara && !existing.tara) {
            existing.tara = rowTara
          }
          existing.count += 1
          existing.rows.push(rowNumber)
          globalWagonMap.set(vagaoKey, existing)
        }

        // Buscar Chaves de 44 dígitos
        row.forEach((cell, colIndex) => {
          if (cell === undefined || cell === null) return
          const cellStr = String(cell).trim()
          if (cellStr.length < 40) return

          const cleanedForDigits = cellStr.replace(/\D/g, '')
          const potentialKeys: string[] = []

          if (cleanedForDigits.length === 44) {
            potentialKeys.push(cleanedForDigits)
          } else if (cleanedForDigits.length > 44) {
            const matches = cellStr.match(/\b\d{44}\b/g)
            if (matches) {
              matches.forEach(m => potentialKeys.push(m))
            } else {
              for (let i = 0; i <= cleanedForDigits.length - 44; i += 44) {
                potentialKeys.push(cleanedForDigits.substring(i, i + 44))
              }
            }
          }

          potentialKeys.forEach((cleanKey) => {
            if (cleanKey.length === 44 && !keysMap.has(cleanKey)) {
              let pesoSelecionado: number | null = null
              let pesoSelecionadoStr: string | undefined = undefined

              if (pesoColIndex >= 0 && row[pesoColIndex] !== undefined && row[pesoColIndex] !== null) {
                const rawP = String(row[pesoColIndex]).trim()
                const pNum = parseBRFloat(rawP)
                if (pNum > 0) {
                  pesoSelecionado = pNum
                  pesoSelecionadoStr = rawP
                }
              }

              const pesoNotaVagaoStr = rowPesoNotaVagao
                ? rowPesoNotaVagao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                : undefined
              const taraStr = rowTara
                ? rowTara.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                : undefined
              const pesoBrutoStr = rowBruto
                ? rowBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
                : (rowPesoNotaVagao && rowTara ? (rowPesoNotaVagao + rowTara).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : undefined)

              const matchInfo: ExcelMatchInfo = {
                row: rowNumber,
                rawValue: cellStr,
                sheetName,
                pesoSelecionado,
                pesoSelecionadoStr,
                pesoNotaVagao: rowPesoNotaVagao,
                pesoNotaVagaoStr,
                tara: rowTara,
                taraStr,
                vagao: rowVagao,
                pesoBruto: rowBruto,
                pesoBrutoStr,
              }

              keysMap.set(cleanKey, matchInfo)
              allKeysList.push(cleanKey)
            }
          })
        })
      })
    })

    const wagonSummariesList: WagonSummary[] = Array.from(globalWagonMap.values()).map((w) => {
      const pesoBrutoTotal = w.sumPeso + w.tara
      const somaPesoNotaVagaoStr = w.sumPeso > 0
        ? w.sumPeso.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const taraStr = w.tara > 0
        ? w.tara.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const pesoBrutoTotalStr = pesoBrutoTotal > 0
        ? pesoBrutoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
        : '0,00'
      const linhas = w.rows.length <= 8
        ? `Linhas ${w.rows.join(', ')}`
        : `Linhas ${w.rows.slice(0, 8).join(', ')}... (+${w.rows.length - 8})`

      return {
        vagao: w.vagao,
        sheetName: w.sheetName,
        qtdNotas: w.count,
        somaPesoNotaVagao: w.sumPeso,
        somaPesoNotaVagaoStr,
        tara: w.tara,
        taraStr,
        pesoBrutoTotal,
        pesoBrutoTotalStr,
        linhas,
      }
    })

    setAvailableExcelColumns(Array.from(allColsSet))
    setExcelData({
      fileName,
      totalRows,
      keysMap,
      allKeysList,
      sheets: workbook.SheetNames,
      wagonSummaries: wagonSummariesList,
    })
  }

  const parseExcelForKeys = async (file: File) => {
    setIsExcelLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      setRawWorkbook(workbook)
      setExcelFileName(file.name)
      processExcelWorkbook(workbook, file.name, selectedExcelWeightCol)
    } catch (err) {
      console.error('Erro ao ler planilha Excel:', err)
      alert('Falha ao ler o arquivo Excel. Verifique se o arquivo está no formato correto (.xlsx, .xls ou .csv).')
    } finally {
      setIsExcelLoading(false)
    }
  }

  const handleExcelWeightColChange = (newCol: string) => {
    setSelectedExcelWeightCol(newCol)
    if (rawWorkbook) {
      processExcelWorkbook(rawWorkbook, excelFileName, newCol)
    }
  }

  const handleExcelInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      parseExcelForKeys(e.target.files[0])
    }
  }

  const handleExcelDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.name.match(/\.(xlsx|xls|csv)$/i)) {
        parseExcelForKeys(file)
      } else {
        alert('Por favor, envie um arquivo Excel (.xlsx, .xls) ou CSV.')
      }
    }
  }

  const handleRemoveExcel = () => {
    setExcelData(null)
    setRawWorkbook(null)
    setExcelFileName('')
    setAvailableExcelColumns([])
    setSelectedExcelWeightCol('auto')
    setExcelFilter('all')
    setExcelSearchQuery('')
    if (excelInputRef.current) {
      excelInputRef.current.value = ''
    }
  }

  const validFiles = files.filter(f => f.nfeData !== null)

  const getNormalizedKey = (f: ProcessedFile): string => {
    return f.nfeData?.chaveAcesso || ''
  }

  const getExcelMatchInfo = (key: string): ExcelMatchInfo | null => {
    if (!excelData || !key) return null
    if (excelData.keysMap.has(key)) {
      return excelData.keysMap.get(key)!
    }
    if (key.length === 43 && excelData.keysMap.has('0' + key)) {
      return excelData.keysMap.get('0' + key)!
    }
    if (key.length === 44 && key.startsWith('0') && excelData.keysMap.has(key.substring(1))) {
      return excelData.keysMap.get(key.substring(1))!
    }
    return null
  }

  const matchedResults = validFiles.filter((f) => {
    const key = getNormalizedKey(f)
    return !!getExcelMatchInfo(key)
  })

  const unmatchedResults = validFiles.filter((f) => {
    const key = getNormalizedKey(f)
    return !getExcelMatchInfo(key)
  })

  const matchedExcelKeysSet = new Set<string>()

  validFiles.forEach((f) => {
    const key = getNormalizedKey(f)
    if (!key) return
    const matchInfo = getExcelMatchInfo(key)
    if (matchInfo && excelData) {
      for (const [eKey, info] of excelData.keysMap.entries()) {
        if (
          info === matchInfo ||
          eKey === key ||
          (eKey.length === 43 && '0' + eKey === key) ||
          (key.length === 43 && '0' + key === eKey)
        ) {
          matchedExcelKeysSet.add(eKey)
        }
      }
    }
  })

  const excelKeysWithoutFiles = excelData
    ? excelData.allKeysList.filter((k) => !matchedExcelKeysSet.has(k))
    : []

  const filteredResults = validFiles.filter((f) => {
    const key = getNormalizedKey(f)
    const matchInfo = getExcelMatchInfo(key)
    const isMatched = !!matchInfo

    if (excelFilter === 'matched' && !isMatched) return false
    if (excelFilter === 'unmatched' && isMatched) return false
    if (excelFilter === 'excel_only') return false

    if (excelFilter === 'weight_divergent') {
      const qtd = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtd)
      if (vWeight.status !== 'DIVERGENTE') return false
    }

    if (excelSearchQuery.trim().length > 0) {
      const query = excelSearchQuery.toLowerCase()
      const fileNameMatches = f.fileName.toLowerCase().includes(query)
      const keyMatches = key.includes(query)
      const nNFMatches = String(f.nfeData?.numero || '').includes(query)
      const emitMatches = String(f.nfeData?.emitente?.nome || '').toLowerCase().includes(query)
      const destMatches = String(f.nfeData?.destinatario?.nome || '').toLowerCase().includes(query)
      return fileNameMatches || keyMatches || nNFMatches || emitMatches || destMatches
    }

    return true
  })

  // Helper para criar e formatar largura das colunas das abas do Excel
  const createFormattedWorksheet = (rows: any[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Mensagem: 'Nenhum registro encontrado nesta categoria' }])
    if (rows.length > 0) {
      const maxLenMap: number[] = []
      rows.forEach((row) => {
        Object.keys(row).forEach((colKey, colIdx) => {
          const valStr = String(row[colKey] ?? '')
          maxLenMap[colIdx] = Math.max(maxLenMap[colIdx] || 0, valStr.length, colKey.length)
        })
      })
      ws['!cols'] = maxLenMap.map((len) => ({ wch: Math.min(Math.max(len + 3, 12), 65) }))
    }
    return ws
  }

  // Exportar Relatório Consolidado de Conferência em Excel com Múltiplas Abas (Formato Original Idêntico)
  const handleExportReconciliationReport = () => {
    if (!excelData && validFiles.length === 0) {
      alert('Carregue notas e/ou uma planilha Excel para gerar o relatório de conferência.')
      return
    }

    const wb = XLSX.utils.book_new()

    // 1. Resumo Geral
    const totalFilesCount = validFiles.length
    const matchedCount = matchedResults.length
    const unmatchedCount = unmatchedResults.length
    const totalExcelKeys = excelData ? excelData.allKeysList.length : 0
    const missingFilesCount = excelKeysWithoutFiles.length
    const matchPercentage = totalFilesCount > 0 ? Math.round((matchedCount / totalFilesCount) * 100) : 0

    const weightDivergentCount = validFiles.filter((f) => {
      const key = getNormalizedKey(f)
      const matchInfo = getExcelMatchInfo(key)
      const qtd = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtd)
      return vWeight.status === 'DIVERGENTE'
    }).length

    const weightMatchedCount = validFiles.filter((f) => {
      const key = getNormalizedKey(f)
      const matchInfo = getExcelMatchInfo(key)
      const qtd = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtd)
      return vWeight.status === 'CONFERE'
    }).length

    const summaryRows = [
      { 'Métrica / Indicador': 'Data e Hora da Conferência', 'Valor / Detalhe': new Date().toLocaleString('pt-BR') },
      { 'Métrica / Indicador': 'Planilha Excel de Origem', 'Valor / Detalhe': excelData?.fileName || excelFileName || 'Nenhuma planilha informada' },
      { 'Métrica / Indicador': 'Modo de Operação', 'Valor / Detalhe': 'XML para PDF (DANFE)' },
      { 'Métrica / Indicador': 'Total de Arquivos Importados (PDF/XML)', 'Valor / Detalhe': totalFilesCount },
      { 'Métrica / Indicador': 'Notas ENCONTRADAS na Planilha Excel', 'Valor / Detalhe': matchedCount },
      { 'Métrica / Indicador': 'Notas AUSENTES na Planilha Excel', 'Valor / Detalhe': unmatchedCount },
      { 'Métrica / Indicador': 'Total de Vagões Únicos Consolidados', 'Valor / Detalhe': excelData?.wagonSummaries?.length || 0 },
      { 'Métrica / Indicador': 'Notas com PESO CONFERIDO (Excel x Nota)', 'Valor / Detalhe': weightMatchedCount },
      { 'Métrica / Indicador': 'Notas com DIVERGÊNCIA DE PESO (Excel x Nota)', 'Valor / Detalhe': weightDivergentCount },
      { 'Métrica / Indicador': 'Total de Chaves de Acesso na Planilha Excel', 'Valor / Detalhe': totalExcelKeys },
      { 'Métrica / Indicador': 'Chaves no Excel Faltando Arquivo de Nota', 'Valor / Detalhe': missingFilesCount },
      { 'Métrica / Indicador': 'Taxa de Batimento / Batimento (%)', 'Valor / Detalhe': `${matchPercentage}%` },
    ]
    const wsSummary = createFormattedWorksheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Geral')

    // 2. ABA CONSOLIDAÇÃO POR VAGÃO (CÁLCULO TOTAL: SOMA DE PESO_NOTA_VAGAO + TARA)
    if (excelData && excelData.wagonSummaries && excelData.wagonSummaries.length > 0) {
      const wagonExportRows = excelData.wagonSummaries.map((w) => ({
        'Vagão': w.vagao,
        'Aba / Planilha de Origem': w.sheetName,
        'Qtd de Notas / Linhas no Vagão': w.qtdNotas,
        'Soma Total PESO_NOTA_VAGAO (kg/t)': w.somaPesoNotaVagaoStr,
        'Tara Única do Vagão (kg/t)': w.taraStr,
        'PESO BRUTO TOTAL DO VAGÃO (Soma + Tara)': w.pesoBrutoTotalStr,
        'Posição / Linhas no Excel': w.linhas,
      }))
      const wsWagons = createFormattedWorksheet(wagonExportRows)
      XLSX.utils.book_append_sheet(wb, wsWagons, 'Consolidação por Vagão')
    }

    // 3. ABA TOTAL DE ARQUIVOS (ORDENADOS CONFORME A ORDEM DAS CHAVES DA PLANILHA EXCEL)
    const orderedAllResults = [...validFiles].sort((a, b) => {
      const keyA = getNormalizedKey(a)
      const keyB = getNormalizedKey(b)
      const matchA = getExcelMatchInfo(keyA)
      const matchB = getExcelMatchInfo(keyB)

      if (matchA && matchB) {
        return matchA.row - matchB.row
      }
      if (matchA && !matchB) return -1
      if (!matchA && matchB) return 1
      return keyA.localeCompare(keyB)
    })

    const rowsTotalOrdered = orderedAllResults.map((f) => {
      const key = getNormalizedKey(f)
      const matchInfo = getExcelMatchInfo(key)
      const isMatched = !!matchInfo
      const destCNPJ = f.nfeData?.destinatario?.cpfCnpj || ''
      const emitCNPJ = f.nfeData?.emitente?.cnpj || ''
      const vCNPJ = f.nfeData?.verificacaoCNPJ || verifyChaveCNPJ(key, emitCNPJ, destCNPJ)
      const qtdNota = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtdNota)
      const itemAudit = auditResultsMap[key || f.fileName]
      const pesoIaEncontrado = itemAudit?.pesoCorrigidoDoc !== undefined && itemAudit?.pesoCorrigidoDoc !== null
        ? itemAudit.pesoCorrigidoDoc
        : (overrideWeightsMap[key || f.fileName] !== undefined ? overrideWeightsMap[key || f.fileName] : (vWeight.status === 'DIVERGENTE' ? 'Pendente de Auditoria IA' : 'N/A (Peso Correto)'))

      return {
        'Posição / Linha Excel': matchInfo ? `Linha ${matchInfo.row} (${matchInfo.sheetName})` : 'Fora da Planilha Excel',
        'Status Conferência Excel': isMatched ? 'CONSTA NA PLANILHA' : 'NÃO CONSTA NA PLANILHA',
        'Vagão (Excel)': matchInfo?.vagao || 'N/A',
        'Chave de Acesso': key,
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Validação CNPJ': vCNPJ.statusLabel,
        'Nº Nota (nNF)': f.nfeData?.numero || '',
        'Série': f.nfeData?.serie || '',
        'Peso Selecionado (Excel)': vWeight.pesoExcelStr,
        'Quantidade Extraída (Nota)': qtdNota,
        'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
        'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
        'Quantidade Encontrada pela IA (Valor Real)': pesoIaEncontrado,
        'Auditoria IA (Status / Causa)': itemAudit?.status === 'ERRO_LEITURA_SISTEMA'
          ? 'ERRO DE LEITURA DO SISTEMA (VALOR REAL ENCONTRADO)'
          : itemAudit?.status === 'DIVERGENCIA_REAL'
            ? 'DIVERGÊNCIA REAL DE PESAGEM'
            : itemAudit?.status === 'CONFERIDO_CORRETO'
              ? 'PESO CONFERIDO CORRETO'
              : (vWeight.status === 'DIVERGENTE' ? 'Divergência não auditada pela IA' : 'Peso correto'),
        'Explicação IA': itemAudit?.explicacao || '',
        'Valor Total (R$)': f.nfeData?.impostos?.valorTotal || 0,
        'Emitente': f.nfeData?.emitente?.nome || '',
        'CNPJ Emitente': emitCNPJ,
        'Destinatário': f.nfeData?.destinatario?.nome || '',
        'Nome do Arquivo': f.fileName,
        'Tipo Documento': f.xmlContent ? 'XML' : 'PDF',
      }
    })
    const wsTotalOrdered = createFormattedWorksheet(rowsTotalOrdered)
    XLSX.utils.book_append_sheet(wb, wsTotalOrdered, 'Total Arquivos (Ord. Excel)')

    // 4. ABA NOTAS ENCONTRADAS NA PLANILHA EXCEL
    const orderedMatchedResults = [...matchedResults].sort((a, b) => {
      const keyA = getNormalizedKey(a)
      const keyB = getNormalizedKey(b)
      const rowA = getExcelMatchInfo(keyA)?.row ?? 9999999
      const rowB = getExcelMatchInfo(keyB)?.row ?? 9999999
      return rowA - rowB
    })

    const rowsMatched = orderedMatchedResults.map((f) => {
      const key = getNormalizedKey(f)
      const matchInfo = getExcelMatchInfo(key)
      const destCNPJ = f.nfeData?.destinatario?.cpfCnpj || ''
      const emitCNPJ = f.nfeData?.emitente?.cnpj || ''
      const vCNPJ = f.nfeData?.verificacaoCNPJ || verifyChaveCNPJ(key, emitCNPJ, destCNPJ)
      const qtdNota = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtdNota)
      const itemAudit = auditResultsMap[key || f.fileName]
      const pesoIaEncontrado = itemAudit?.pesoCorrigidoDoc !== undefined && itemAudit?.pesoCorrigidoDoc !== null
        ? itemAudit.pesoCorrigidoDoc
        : (overrideWeightsMap[key || f.fileName] !== undefined ? overrideWeightsMap[key || f.fileName] : (vWeight.status === 'DIVERGENTE' ? 'Pendente de Auditoria IA' : 'N/A (Peso Correto)'))

      return {
        'Linha no Excel': matchInfo ? `Linha ${matchInfo.row}` : 'N/A',
        'Aba no Excel': matchInfo?.sheetName || '',
        'Status Conferência': 'CONSTA NA PLANILHA EXCEL',
        'Vagão (Excel)': matchInfo?.vagao || 'N/A',
        'Chave de Acesso': key,
        'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
        'Destinatário CNPJ': destCNPJ,
        'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
        'Validação CNPJ': vCNPJ.statusLabel,
        'Nº Nota (nNF)': f.nfeData?.numero || '',
        'Série': f.nfeData?.serie || '',
        'Peso Selecionado (Excel)': vWeight.pesoExcelStr,
        'Quantidade Extraída (Nota)': qtdNota,
        'Confronto Peso (Excel vs Nota)': vWeight.statusLabel,
        'Diferença de Peso (Excel - Nota)': vWeight.pesoExcel !== null ? vWeight.diferenca : 'N/A',
        'Quantidade Encontrada pela IA (Valor Real)': pesoIaEncontrado,
        'Auditoria IA (Status / Causa)': itemAudit?.status === 'ERRO_LEITURA_SISTEMA'
          ? 'ERRO DE LEITURA DO SISTEMA (VALOR REAL ENCONTRADO)'
          : itemAudit?.status === 'DIVERGENCIA_REAL'
            ? 'DIVERGÊNCIA REAL DE PESAGEM'
            : itemAudit?.status === 'CONFERIDO_CORRETO'
              ? 'PESO CONFERIDO CORRETO'
              : (vWeight.status === 'DIVERGENTE' ? 'Divergência não auditada pela IA' : 'Peso correto'),
        'Explicação IA': itemAudit?.explicacao || '',
        'Valor Total (R$)': f.nfeData?.impostos?.valorTotal || 0,
        'Emitente': f.nfeData?.emitente?.nome || '',
        'CNPJ Emitente': emitCNPJ,
        'Destinatário': f.nfeData?.destinatario?.nome || '',
        'Nome do Arquivo': f.fileName,
        'Tipo Documento': f.xmlContent ? 'XML' : 'PDF',
      }
    })
    const wsMatched = createFormattedWorksheet(rowsMatched)
    XLSX.utils.book_append_sheet(wb, wsMatched, 'Notas Encontradas')

    // 5. ABA NOTAS QUE NÃO CONSTAM NA PLANILHA EXCEL
    if (unmatchedResults.length > 0) {
      const rowsUnmatched = unmatchedResults.map((f) => {
        const key = getNormalizedKey(f)
        const destCNPJ = f.nfeData?.destinatario?.cpfCnpj || ''
        const emitCNPJ = f.nfeData?.emitente?.cnpj || ''
        const vCNPJ = f.nfeData?.verificacaoCNPJ || verifyChaveCNPJ(key, emitCNPJ, destCNPJ)
        const qtdNota = getFileQuantidade(f)

        return {
          'Status Conferência': 'NÃO CONSTA NA PLANILHA EXCEL',
          'Chave de Acesso': key,
          'CNPJ na Chave': vCNPJ.chaveCnpj || 'N/I',
          'Destinatário CNPJ': destCNPJ,
          'Confronto (Chave vs Destinatário)': vCNPJ.confrontoChaveXDest,
          'Validação CNPJ': vCNPJ.statusLabel,
          'Nº Nota (nNF)': f.nfeData?.numero || '',
          'Série': f.nfeData?.serie || '',
          'Quantidade Extraída (Nota)': qtdNota,
          'Valor Total (R$)': f.nfeData?.impostos?.valorTotal || 0,
          'Emitente': f.nfeData?.emitente?.nome || '',
          'CNPJ Emitente': emitCNPJ,
          'Destinatário': f.nfeData?.destinatario?.nome || '',
          'Nome do Arquivo': f.fileName,
          'Tipo Documento': f.xmlContent ? 'XML' : 'PDF',
          'Observação': 'Nota fiscal importada mas a chave de acesso não foi encontrada na planilha Excel',
        }
      })
      const wsUnmatched = createFormattedWorksheet(rowsUnmatched)
      XLSX.utils.book_append_sheet(wb, wsUnmatched, 'Notas Ausentes no Excel')
    }

    // 6. ABA CHAVES NA PLANILHA EXCEL SEM ARQUIVO CORRESPONDENTE
    if (excelKeysWithoutFiles.length > 0 && excelData) {
      const rowsExcelOnly = excelKeysWithoutFiles.map((key) => {
        const matchInfo = getExcelMatchInfo(key)
        return {
          'Linha no Excel': matchInfo ? `Linha ${matchInfo.row}` : 'N/A',
          'Aba no Excel': matchInfo?.sheetName || '',
          'Chave de Acesso (Excel)': key,
          'Vagão (Excel)': matchInfo?.vagao || 'N/A',
          'Peso Selecionado (Excel)': matchInfo?.pesoSelecionadoStr || 'N/A',
          'Conteúdo Original Célula': matchInfo?.rawValue || '',
          'Status': 'FALTANDO ARQUIVO DE NOTA (PDF/XML)',
          'Observação': 'Chave consta na planilha Excel, porém nenhum arquivo correspondente foi importado',
        }
      })
      const wsExcelOnly = createFormattedWorksheet(rowsExcelOnly)
      XLSX.utils.book_append_sheet(wb, wsExcelOnly, 'Chaves Excel Sem Arquivo')
    }

    // 7. ABA DIVERGÊNCIAS DE PESO
    const divergentWeightRows = validFiles
      .filter((f) => {
        const key = getNormalizedKey(f)
        const matchInfo = getExcelMatchInfo(key)
        const qtd = getFileQuantidade(f)
        const vWeight = confrontWeights(matchInfo, qtd)
        return vWeight.status === 'DIVERGENTE'
      })
      .map((f) => {
        const key = getNormalizedKey(f)
        const matchInfo = getExcelMatchInfo(key)
        const qtdNota = getFileQuantidade(f)
        const vWeight = confrontWeights(matchInfo, qtdNota)
        return {
          'Arquivo': f.fileName,
          'Nº Nota': f.nfeData?.numero || '',
          'Chave de Acesso': key,
          'Linha no Excel': matchInfo?.row || '',
          'Vagão': matchInfo?.vagao || '',
          'Peso na Nota': qtdNota,
          'Peso no Excel': matchInfo?.pesoSelecionadoStr || '',
          'Diferença': vWeight.diferenca,
          'Detalhes': vWeight.detalhes,
        }
      })
    if (divergentWeightRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, createFormattedWorksheet(divergentWeightRows), 'Divergências de Peso')
    }

    XLSX.writeFile(wb, `relatorio_conferencia_chaves_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Executar auditoria de divergências de peso com IA em lote
  const handleRunAiAuditAll = async () => {
    const divergentFiles = validFiles.filter((f) => {
      const key = getNormalizedKey(f)
      const matchInfo = getExcelMatchInfo(key)
      const qtd = getFileQuantidade(f)
      const vWeight = confrontWeights(matchInfo, qtd)
      return isMatchedWithDivergence(matchInfo, vWeight)
    })

    if (divergentFiles.length === 0) {
      alert('Nenhuma nota com divergência de peso encontrada para auditoria.')
      return
    }

    setIsAuditingAllWeights(true)
    try {
      const payload: WeightAuditItemInput[] = divergentFiles.map((f) => {
        const key = getNormalizedKey(f)
        const matchInfo = getExcelMatchInfo(key)
        const qtdNota = getFileQuantidade(f)
        const vWeight = confrontWeights(matchInfo, qtdNota)
        const prodInfo = `PESO_LIQ: ${f.nfeData?.transportador?.pesoLiquido || qtdNota} | PESO_BRUTO: ${f.nfeData?.transportador?.pesoBruto || ''} | QTD_VOL: ${f.nfeData?.transportador?.quantidade || ''}`
        const snippet = `${prodInfo}\nNF ${f.nfeData?.numero || ''} Emit: ${f.nfeData?.emitente?.nome || ''} Dest: ${f.nfeData?.destinatario?.nome || ''} Chave: ${key} DadosAdicionais: ${f.nfeData?.informacoesComplementares || ''}`

        return {
          id: key || f.fileName,
          identificador: f.nfeData?.numero ? `NF ${f.nfeData.numero}` : f.fileName,
          numeroApenas: f.nfeData?.numero || '',
          serie: f.nfeData?.serie || '',
          pesoMDF: overrideWeightsMap[key || f.fileName] !== undefined ? overrideWeightsMap[key || f.fileName] : qtdNota,
          pesoExcel: vWeight.pesoExcel || undefined,
          diferencaPeso: vWeight.diferenca || undefined,
          trechoTextoDocumento: snippet,
          linhaExcel: matchInfo?.row,
          dadosExcelRaw: matchInfo?.rawValue,
        }
      })

      const response: WeightAuditResponse = await auditarDivergenciasComIA(payload)
      const newAuditMap: Record<string, WeightAuditItemResult> = { ...auditResultsMap }
      response.resultados.forEach((res) => {
        newAuditMap[res.id] = res
      })
      setAuditResultsMap(newAuditMap)
    } catch (err) {
      console.error('Erro na auditoria de IA:', err)
      alert('Erro ao processar auditoria com IA.')
    } finally {
      setIsAuditingAllWeights(false)
    }
  }

  const isMatchedWithDivergence = (matchInfo: ExcelMatchInfo | null, vWeight: any) => {
    return !!matchInfo && vWeight.status === 'DIVERGENTE'
  }

  const divergentWeightCount = validFiles.filter((f) => {
    const key = getNormalizedKey(f)
    const matchInfo = getExcelMatchInfo(key)
    const qtd = getFileQuantidade(f)
    const vWeight = confrontWeights(matchInfo, qtd)
    return vWeight.status === 'DIVERGENTE'
  }).length

  return (
    <div className="space-y-6">
      {/* Card Principal da Planilha Excel */}
      <Card className="shadow-xs border-emerald-200 dark:border-emerald-900/60">
        <CardHeader className="bg-emerald-50/40 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/40 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-emerald-950 dark:text-emerald-200">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Conferência de Chaves & Pesos com Planilha Excel
              </CardTitle>
              <CardDescription className="text-xs text-emerald-800/80 dark:text-emerald-300/70 mt-0.5">
                Carregue sua planilha logística/financeira (.xlsx, .xls, .csv) para confrontar automaticamente Chaves de Acesso, Vagões e Pesos de Balança.
              </CardDescription>
            </div>

            {excelData && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleExportReconciliationReport}
                  size="sm"
                  variant="outline"
                  className="gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/40 text-xs font-semibold cursor-pointer"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Baixar Relatório Completo (.xlsx)
                </Button>
                <Button
                  onClick={handleRemoveExcel}
                  size="sm"
                  variant="ghost"
                  className="text-xs text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                >
                  <X className="h-4 w-4 mr-1" />
                  Remover Planilha
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Dropzone de Planilha */}
          {!excelData ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleExcelDrop}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-900/60 p-8 text-center bg-emerald-50/20 dark:bg-emerald-950/5 hover:border-emerald-500 transition-all cursor-pointer"
              onClick={() => excelInputRef.current?.click()}
            >
              <input
                type="file"
                ref={excelInputRef}
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleExcelInputChange}
              />
              <div className="rounded-full bg-emerald-100 p-3.5 text-emerald-600 dark:bg-emerald-950/60 mb-3">
                {isExcelLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-7 w-7" />
                )}
              </div>
              <p className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                Clique ou arraste aqui a planilha Excel para conferência das chaves e pesos
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">
                O sistema identificará de forma automática todas as chaves de acesso (44 dígitos), números de vagões e colunas de peso presentes em qualquer aba.
              </p>
            </div>
          ) : (
            <>
              {/* Barra de Status da Planilha Carregada */}
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <FileCheck2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-900 dark:text-emerald-200">
                      Planilha Ativa: {excelData.fileName}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 ml-2">
                      ({excelData.allKeysList.length} chaves de 44 dígitos encontradas em {excelData.totalRows} linhas)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 underline font-medium cursor-pointer"
                  >
                    Trocar planilha
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveExcel}
                    className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 font-medium cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
                <input
                  type="file"
                  ref={excelInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelInputChange}
                />
              </div>

              {/* Seletor da Coluna de Peso no Excel */}
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900/50 dark:border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      Coluna para Comparação de Peso no Excel:
                    </span>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Regra Estrita Ativa:</span> Se o valor não for encontrado na coluna selecionada, o sistema <strong>NÃO</strong> busca em nenhuma outra coluna.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <select
                    value={selectedExcelWeightCol}
                    onChange={(e) => handleExcelWeightColChange(e.target.value)}
                    aria-label="Coluna para comparação de peso no Excel"
                    className="w-full md:w-72 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="auto">🎯 Automático: Procura &quot;Peso Selecionado&quot;</option>
                    <option value="none">🚫 Não comparar peso (apenas chave)</option>
                    {availableExcelColumns.length > 0 && (
                      <optgroup label="Colunas detectadas no Excel">
                        {availableExcelColumns.map((col) => (
                          <option key={col} value={col}>
                            Coluna: {col}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Banner de Auditoria IA se houver divergências de peso */}
              {divergentWeightCount > 0 && (
                <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                      <BrainCircuit className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-purple-950 dark:text-purple-100">
                        {divergentWeightCount} Divergência{divergentWeightCount > 1 ? 's' : ''} de Peso Detectada{divergentWeightCount > 1 ? 's' : ''}
                      </h4>
                      <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80 mt-0.5">
                        Utilize a Auditoria com IA para analisar os textos originais das notas fiscais e identificar erros de digitação vs divergências reais.
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleRunAiAuditAll}
                    disabled={isAuditingAllWeights}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 cursor-pointer shrink-0"
                  >
                    {isAuditingAllWeights ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Auditando com IA...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Auditar Todas as Divergências com IA
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Cards de Métricas de Confronto */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                  <span className="text-zinc-500 font-medium block">Notas Carregadas</span>
                  <span className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5 block">
                    {validFiles.length}
                  </span>
                  <span className="text-[10px] text-zinc-400">arquivos no sistema</span>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium block">Conferidas no Excel</span>
                  <span className="text-lg font-extrabold text-emerald-800 dark:text-emerald-200 mt-0.5 block">
                    {matchedResults.length}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    {validFiles.length > 0 ? Math.round((matchedResults.length / validFiles.length) * 100) : 0}% de cobertura
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40">
                  <span className="text-rose-700 dark:text-rose-400 font-medium block">Ausentes no Excel</span>
                  <span className="text-lg font-extrabold text-rose-800 dark:text-rose-200 mt-0.5 block">
                    {unmatchedResults.length}
                  </span>
                  <span className="text-[10px] text-rose-600 dark:text-rose-400">chaves não localizadas</span>
                </div>

                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40">
                  <span className="text-indigo-700 dark:text-indigo-400 font-medium block">No Excel s/ Arquivo</span>
                  <span className="text-lg font-extrabold text-indigo-800 dark:text-indigo-200 mt-0.5 block">
                    {excelKeysWithoutFiles.length}
                  </span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400">chaves faltantes</span>
                </div>
              </div>

              {/* Filtros e Busca dos Resultados de Confronto */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setExcelFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      excelFilter === 'all'
                        ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900 shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    Todas ({validFiles.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setExcelFilter('matched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      excelFilter === 'matched'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Conferidas ({matchedResults.length})
                  </button>

                  {divergentWeightCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setExcelFilter('weight_divergent')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        excelFilter === 'weight_divergent'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      <Scale className="h-3.5 w-3.5" />
                      Divergência Peso ({divergentWeightCount})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setExcelFilter('unmatched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      excelFilter === 'unmatched'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300'
                    }`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Ausentes ({unmatchedResults.length})
                  </button>

                  {excelKeysWithoutFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExcelFilter('excel_only')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        excelFilter === 'excel_only'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300'
                      }`}
                    >
                      <FileQuestion className="h-3.5 w-3.5" />
                      No Excel sem Arquivo ({excelKeysWithoutFiles.length})
                    </button>
                  )}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Filtrar chave, nº nota, vagão..."
                    value={excelSearchQuery}
                    onChange={(e) => setExcelSearchQuery(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Tabela de Resultados do Confronto */}
              {excelFilter === 'excel_only' ? (
                <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 overflow-hidden bg-indigo-50/20 dark:bg-indigo-950/10">
                  <div className="p-3 bg-indigo-100/50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-900/50 flex items-center justify-between">
                    <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                      <FileQuestion className="h-4 w-4 text-indigo-600" />
                      Chaves de Acesso na planilha Excel sem arquivo correspondente ({excelKeysWithoutFiles.length})
                    </p>
                  </div>
                  <div className="divide-y divide-indigo-100 dark:divide-indigo-900/30 max-h-96 overflow-y-auto">
                    {excelKeysWithoutFiles.map((key, idx) => {
                      const matchInfo = getExcelMatchInfo(key)
                      return (
                        <div key={idx} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                              <span>{key}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(key)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                                title="Copiar chave"
                              >
                                {copiedKey === key ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <p className="text-[11px] text-zinc-500">
                              Encontrada na <span className="font-semibold">{matchInfo?.sheetName || 'Planilha'}</span> (Linha {matchInfo?.row})
                              {matchInfo?.vagao && <span className="ml-2 font-bold text-indigo-600">| Vagão: {matchInfo.vagao}</span>}
                              {matchInfo?.pesoSelecionadoStr && (
                                <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">
                                  | Peso Excel: {matchInfo.pesoSelecionadoStr}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 self-start sm:self-auto">
                            Arquivo Faltante / Não Processado
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : filteredResults.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <FileQuestion className="h-8 w-8 text-zinc-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                    Nenhum resultado encontrado para o filtro selecionado.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredResults.map((f, idx) => {
                    const key = getNormalizedKey(f)
                    const matchInfo = getExcelMatchInfo(key)
                    const isMatched = !!matchInfo
                    const qtdNota = getFileQuantidade(f)
                    const vWeight = confrontWeights(matchInfo, qtdNota)
                    const vCNPJ = f.nfeData?.verificacaoCNPJ || verifyChaveCNPJ(
                      f.nfeData?.chaveAcesso || '',
                      f.nfeData?.emitente?.cnpj || '',
                      f.nfeData?.destinatario?.cpfCnpj || ''
                    )

                    return (
                      <div
                        key={idx}
                        className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                          isMatched
                            ? 'bg-green-50/20 dark:bg-green-950/5 hover:bg-green-50/40'
                            : 'bg-red-50/20 dark:bg-red-950/5 hover:bg-red-50/40'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {isMatched ? (
                            <div className="rounded-full bg-green-100 p-2 text-green-700 dark:bg-green-950/60 dark:text-green-400 shrink-0 mt-0.5">
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="rounded-full bg-red-100 p-2 text-red-700 dark:bg-red-950/60 dark:text-red-400 shrink-0 mt-0.5">
                              <XCircle className="h-5 w-5" />
                            </div>
                          )}

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                                  isMatched
                                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                                    : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                }`}
                              >
                                {isMatched
                                  ? `CONSTA NA PLANILHA (Linha ${matchInfo?.row})`
                                  : 'NÃO CONSTA NA PLANILHA'}
                              </span>

                              {isMatched && (
                                <span
                                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                    vWeight.status === 'CONFERE'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : vWeight.status === 'DIVERGENTE'
                                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300'
                                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                                  }`}
                                  title={vWeight.detalhes}
                                >
                                  <Scale className="h-3 w-3" />
                                  {vWeight.status === 'CONFERE'
                                    ? `PESO OK (${vWeight.pesoExcelStr})`
                                    : vWeight.status === 'DIVERGENTE'
                                    ? `DIVERGÊNCIA PESO (Excel: ${vWeight.pesoExcelStr} vs Nota: ${vWeight.qtdNota})`
                                    : 'PESO EXCEL S/ DADO'}
                                </span>
                              )}

                              {vCNPJ.chaveCnpjRaw && (
                                <span
                                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                    vCNPJ.isValid
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {vCNPJ.isValid ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-rose-600" />}
                                  {vCNPJ.statusLabel}
                                </span>
                              )}

                              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 truncate">
                                NF {f.nfeData?.numero || 'S/N'} - {f.fileName}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">
                              <span className="font-semibold text-zinc-400">Chave:</span>
                              <span>{key || 'Chave não identificada'}</span>
                              {key && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(key)}
                                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-1 shrink-0 cursor-pointer"
                                  title="Copiar Chave de Acesso"
                                >
                                  {copiedKey === key ? (
                                    <Check className="h-3.5 w-3.5 text-green-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 pt-0.5">
                              {f.nfeData?.emitente?.nome && (
                                <span>
                                  Emitente: <b className="text-zinc-700 dark:text-zinc-200">{f.nfeData.emitente.nome}</b>
                                </span>
                              )}
                              {f.nfeData?.destinatario?.nome && (
                                <span>
                                  Destinatário: <b className="text-zinc-700 dark:text-zinc-200">{f.nfeData.destinatario.nome}</b>
                                </span>
                              )}
                              <span>
                                Qtd/Peso Nota: <b className="text-zinc-800 dark:text-zinc-100">{qtdNota.toLocaleString('pt-BR')}</b>
                              </span>
                              {isMatched && (
                                <>
                                  {matchInfo?.vagao && (
                                    <span>
                                      Vagão: <b className="text-indigo-700 dark:text-indigo-300">{matchInfo.vagao}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoSelecionadoStr && (
                                    <span>
                                      Peso Sel. Excel: <b className="text-emerald-700 dark:text-emerald-300">{matchInfo.pesoSelecionadoStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoNotaVagaoStr && (
                                    <span>
                                      Peso Nota Vagão: <b className="text-sky-700 dark:text-sky-300">{matchInfo.pesoNotaVagaoStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.taraStr && (
                                    <span>
                                      Tara: <b className="text-zinc-700 dark:text-zinc-300">{matchInfo.taraStr}</b>
                                    </span>
                                  )}
                                  {matchInfo?.pesoBrutoStr && (
                                    <span className="bg-amber-100/80 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-semibold">
                                      Peso Bruto: <b>{matchInfo.pesoBrutoStr}</b>
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Detalhes da Auditoria de IA para a Nota Individual */}
                            {(() => {
                              const itemAudit = auditResultsMap[key || f.fileName]
                              const hasDivergence = isMatched && vWeight.status === 'DIVERGENTE'
                              const isAuditingThis = auditingKey === (key || f.fileName) || (isAuditingAllWeights && hasDivergence)

                              if (itemAudit) {
                                return (
                                  <div className="mt-2 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/30 text-xs space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1">
                                        <Bot className="h-3.5 w-3.5 text-purple-600" />
                                        Auditoria IA:
                                      </span>
                                      {itemAudit.status === 'ERRO_LEITURA_SISTEMA' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200">
                                          Erro de Leitura do Sistema
                                        </span>
                                      )}
                                      {itemAudit.status === 'DIVERGENCIA_REAL' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200">
                                          Divergência Real
                                        </span>
                                      )}
                                      {itemAudit.status === 'CONFERIDO_CORRETO' && (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                                          Peso Correto
                                        </span>
                                      )}
                                      {itemAudit.pesoCorrigidoDoc !== undefined && itemAudit.pesoCorrigidoDoc !== null && (
                                        <span className="font-black text-purple-800 dark:text-purple-300">
                                          Valor Real: {itemAudit.pesoCorrigidoDoc.toLocaleString('pt-BR')} t
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-700 dark:text-zinc-300">
                                      {itemAudit.explicacao}
                                    </p>
                                    {itemAudit.status === 'ERRO_LEITURA_SISTEMA' && itemAudit.pesoCorrigidoDoc !== undefined && overrideWeightsMap[key || f.fileName] === undefined && (
                                      <button
                                        type="button"
                                        onClick={() => setOverrideWeightsMap(prev => ({ ...prev, [key || f.fileName]: itemAudit.pesoCorrigidoDoc! }))}
                                        className="text-[10px] font-bold px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded cursor-pointer inline-flex items-center gap-1"
                                      >
                                        <Check className="h-3 w-3" />
                                        Aplicar Valor Real ({itemAudit.pesoCorrigidoDoc} t)
                                      </button>
                                    )}
                                  </div>
                                )
                              }

                              if (hasDivergence) {
                                return (
                                  <div className="pt-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isAuditingThis}
                                      onClick={async () => {
                                        const itemId = key || f.fileName
                                        setAuditingKey(itemId)
                                        try {
                                          const prodInfo = `PESO_LIQ: ${f.nfeData?.transportador?.pesoLiquido || qtdNota} | PESO_BRUTO: ${f.nfeData?.transportador?.pesoBruto || ''}`
                                          const snippet = `${prodInfo}\nNF ${f.nfeData?.numero || ''} Emit: ${f.nfeData?.emitente?.nome || ''} Dest: ${f.nfeData?.destinatario?.nome || ''} Chave: ${key}`
                                          const singlePayload: WeightAuditItemInput[] = [{
                                            id: itemId,
                                            identificador: f.nfeData?.numero ? `NF ${f.nfeData.numero}` : f.fileName,
                                            numeroApenas: f.nfeData?.numero || '',
                                            serie: f.nfeData?.serie || '',
                                            pesoMDF: overrideWeightsMap[itemId] !== undefined ? overrideWeightsMap[itemId] : qtdNota,
                                            pesoExcel: vWeight.pesoExcel || undefined,
                                            diferencaPeso: vWeight.diferenca || undefined,
                                            trechoTextoDocumento: snippet,
                                            linhaExcel: matchInfo?.row,
                                            dadosExcelRaw: matchInfo?.rawValue,
                                          }]
                                          const response = await auditarDivergenciasComIA(singlePayload)
                                          if (response.resultados.length > 0) {
                                            setAuditResultsMap(prev => ({ ...prev, [itemId]: response.resultados[0] }))
                                          }
                                        } catch (err) {
                                          console.error('Erro ao auditar nota individual:', err)
                                        } finally {
                                          setAuditingKey(null)
                                        }
                                      }}
                                      className="h-6 px-2 text-[10px] font-semibold border-purple-300 text-purple-700 dark:border-purple-800 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/60 cursor-pointer flex items-center gap-1"
                                    >
                                      {isAuditingThis ? (
                                        <>
                                          <Loader2 className="h-3 w-3 animate-spin text-purple-600" />
                                          Conferindo com IA...
                                        </>
                                      ) : (
                                        <>
                                          <Bot className="h-3 w-3 text-purple-600" />
                                          Conferir Nota com IA
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                )
                              }

                              return null
                            })()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
