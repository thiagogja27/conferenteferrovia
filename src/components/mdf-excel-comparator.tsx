'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  parseMdfePdfClient,
  parseMdfeFromXml,
  parseMdfeFromText,
  executarComparacaoMdfeExcel,
  normalizarVagao,
  extrairApenasDigitos,
  extrairSerieVagao,
  type MdfeData,
  type MdfeVagao,
  type ExcelVagaoRow,
  type ItemComparacao,
  type ResumoComparacao,
  type StatusComparacao,
} from '@/lib/mdfe-parser'
import {
  TrainTrack,
  FileSpreadsheet,
  FileText,
  Upload,
  Download,
  Copy,
  Check,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRightLeft,
  Truck,
  Hash,
  Scale,
  ExternalLink,
  ShieldCheck,
  ClipboardPaste,
  ClipboardList,
  FileCode,
} from 'lucide-react'
import * as XLSX from 'xlsx'

interface MDFExcelComparatorProps {
  onOpenDoc?: () => void
}

export function MDFExcelComparator({ onOpenDoc }: MDFExcelComparatorProps) {
  // Estado dos arquivos do MDF
  const [mdfeList, setMdfeList] = useState<MdfeData[]>([])
  const [isProcessingMdf, setIsProcessingMdf] = useState(false)
  const [mdfError, setMdfError] = useState<string | null>(null)
  const [isDraggingMdf, setIsDraggingMdf] = useState(false)

  // Estado da Planilha Excel
  const [excelFileName, setExcelFileName] = useState<string>('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [rawExcelRows, setRawExcelRows] = useState<any[]>([])
  const [excelColumns, setExcelColumns] = useState<string[]>([])
  const [selectedWagonColumn, setSelectedWagonColumn] = useState<string>('')
  const [selectedSecondaryWagonColumn, setSelectedSecondaryWagonColumn] = useState<string>('')
  const [selectedWeightColumn, setSelectedWeightColumn] = useState<string>('')
  const [isProcessingExcel, setIsProcessingExcel] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const [isDraggingExcel, setIsDraggingExcel] = useState(false)

  // Estados de Interface e Filtros
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<'TODOS' | 'CONFERIDO' | 'FALTA_NO_EXCEL' | 'FALTA_NO_MDF'>('TODOS')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedWagons, setCopiedWagons] = useState(false)
  const [showMdfDetails, setShowMdfDetails] = useState(false)
  const [showNfeKeys, setShowNfeKeys] = useState(false)

  // Estado de Colar Texto do MDF-e (Entrada direta sem PDF)
  const [directPasteText, setDirectPasteText] = useState('')
  const [pastedTextTitle, setPastedTextTitle] = useState('DAMDFE')

  // Processar texto colado diretamente do DAMDFE
  const handleProcessPastedText = (customText?: string) => {
    const textToProcess = customText !== undefined ? customText : directPasteText
    if (!textToProcess.trim()) return
    setIsProcessingMdf(true)
    setMdfError(null)
    try {
      const parsed = parseMdfeFromText(textToProcess, pastedTextTitle || 'DAMDFE Copiado')
      if (parsed.vagoes.length === 0) {
        setMdfError('Não foi possível identificar vagões no texto colado. Cole o conteúdo do DAMDFE ou a listagem dos vagões.')
      } else {
        setMdfeList([parsed])
        setMdfError(null)
      }
    } catch (err: any) {
      setMdfError(err.message || 'Erro ao processar o texto colado.')
    } finally {
      setIsProcessingMdf(false)
    }
  }

  const handleClearMdf = () => {
    setMdfeList([])
    setDirectPasteText('')
    setMdfError(null)
  }

  // -------------------------------------------------------------
  // 2. PROCESSAMENTO DO ARQUIVO EXCEL (.xlsx, .xls, .csv)
  // -------------------------------------------------------------
  const processExcelFile = useCallback(async (file: File) => {
    setIsProcessingExcel(true)
    setExcelError(null)
    setExcelFileName(file.name)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      setWorkbook(wb)

      const sheets = wb.SheetNames
      setAvailableSheets(sheets)
      const firstSheet = sheets[0] || ''
      setSelectedSheet(firstSheet)

      loadSheetData(wb, firstSheet)
    } catch (err: any) {
      console.error('Erro ao ler planilha Excel:', err)
      setExcelError(err.message || 'Falha ao ler o arquivo Excel.')
    } finally {
      setIsProcessingExcel(false)
    }
  }, [])

  const loadSheetData = (wb: XLSX.WorkBook, sheetName: string) => {
    try {
      const sheet = wb.Sheets[sheetName]
      if (!sheet) return

      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' })
      if (!jsonData || jsonData.length === 0) {
        setRawExcelRows([])
        setExcelColumns([])
        setExcelError('A aba selecionada na planilha está vazia.')
        return
      }

      setRawExcelRows(jsonData)

      // Identificar todas as colunas
      const cols = Object.keys(jsonData[0] || {})
      setExcelColumns(cols)

      // Priorização e Auto-detecção das Colunas de Vagão
      // Procura com máxima prioridade por "Número de ident.", "Numero de ident", "Número de ident. vagão", etc.
      const isIdentWagonColumn = (c: string) => {
        const cLower = c.toLowerCase().trim()
        return (
          cLower.includes('número de ident') ||
          cLower.includes('numero de ident') ||
          cLower.includes('num. ident') ||
          cLower.includes('num ident') ||
          cLower.includes('nº ident') ||
          cLower.includes('nr ident') ||
          cLower.includes('ident. vag') ||
          cLower.includes('identifica') ||
          cLower.includes('vag') ||
          cLower.includes('wagon') ||
          cLower.includes('carro') ||
          cLower.includes('prefixo') ||
          cLower.includes('equipamento') ||
          cLower.includes('veiculo') ||
          cLower.includes('veículo')
        )
      }

      const wagonCandidates = cols.filter(isIdentWagonColumn)

      let detectedCol1 = wagonCandidates[0] || ''
      let detectedCol2 = wagonCandidates.length > 1 ? wagonCandidates[1] : ''

      // Se não achou pelos nomes, inspeciona valores das primeiras 10 linhas
      if (!detectedCol1) {
        for (const col of cols) {
          const isLikelyWagon = jsonData.slice(0, 10).some((row) => {
            const val = String(row[col] || '').trim()
            return /^[A-Z]{2,4}\s*\d{4,8}$/i.test(val) || /^\d{5,8}$/.test(val)
          })
          if (isLikelyWagon) {
            detectedCol1 = col
            break
          }
        }
      }

      setSelectedWagonColumn(detectedCol1 || cols[0] || '')
      setSelectedSecondaryWagonColumn(detectedCol2 || '')

      // Auto-detectar coluna de Peso (se existir)
      const detectedWeightCol = cols.find((c) => {
        if (c === detectedCol1 || c === detectedCol2) return false
        const cLower = c.toLowerCase().trim()
        return (
          cLower.includes('peso') ||
          cLower.includes('ton') ||
          cLower.includes('liquido') ||
          cLower.includes('líquido') ||
          cLower.includes('bruto') ||
          cLower.includes('carga') ||
          cLower.includes('qtde') ||
          cLower.includes('volume')
        )
      })
      if (detectedWeightCol) {
        setSelectedWeightColumn(detectedWeightCol)
      } else {
        setSelectedWeightColumn('')
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados da aba:', err)
      setExcelError('Erro ao ler linhas da aba selecionada.')
    }
  }

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName)
    if (workbook) {
      loadSheetData(workbook, sheetName)
    }
  }

  // -------------------------------------------------------------
  // 3. EXTRAÇÃO ESTRUTURADA DOS VAGÕES DO EXCEL (SUPORTA 1 OU 2 COLUNAS DE IDENTIFICAÇÃO)
  // -------------------------------------------------------------
  const excelVagoesList = useMemo<ExcelVagaoRow[]>(() => {
    if (!selectedWagonColumn || rawExcelRows.length === 0) return []

    const list: ExcelVagaoRow[] = []

    rawExcelRows.forEach((row, idx) => {
      // 1. Extração da Coluna Principal de Vagão
      const rawVal1 = row[selectedWagonColumn]
      if (rawVal1 !== undefined && rawVal1 !== null && String(rawVal1).trim() !== '') {
        const cleanStr1 = String(rawVal1).replace(/\.0+$/, '').trim()
        const norm1 = normalizarVagao(cleanStr1)
        const digits1 = extrairApenasDigitos(cleanStr1)
        const serie1 = extrairSerieVagao(cleanStr1)

        let peso1: number | undefined
        if (selectedWeightColumn && row[selectedWeightColumn] !== undefined) {
          const rawWeight = String(row[selectedWeightColumn]).replace(/\./g, '').replace(',', '.')
          const parsed = parseFloat(rawWeight)
          if (!isNaN(parsed) && parsed > 0) {
            peso1 = parsed
          }
        }

        if (norm1.length > 0 || digits1.length > 0) {
          list.push({
            rowIndex: idx + 2, // Linha 1 no Excel é cabeçalho
            vagaoRaw: cleanStr1,
            vagaoNormalizado: norm1,
            numeroApenas: digits1,
            serie: serie1,
            peso: peso1,
            pesoFormatado: peso1 ? `${peso1.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t` : undefined,
            dadosCompletos: row,
          })
        }
      }

      // 2. Extração da Segunda Coluna de Vagão (Continuação, se houver)
      if (selectedSecondaryWagonColumn && selectedSecondaryWagonColumn !== selectedWagonColumn) {
        const rawVal2 = row[selectedSecondaryWagonColumn]
        if (rawVal2 !== undefined && rawVal2 !== null && String(rawVal2).trim() !== '') {
          const cleanStr2 = String(rawVal2).replace(/\.0+$/, '').trim()
          const norm2 = normalizarVagao(cleanStr2)
          const digits2 = extrairApenasDigitos(cleanStr2)
          const serie2 = extrairSerieVagao(cleanStr2)

          if (norm2.length > 0 || digits2.length > 0) {
            list.push({
              rowIndex: idx + 2,
              vagaoRaw: cleanStr2,
              vagaoNormalizado: norm2,
              numeroApenas: digits2,
              serie: serie2,
              dadosCompletos: row,
            })
          }
        }
      }
    })

    return list
  }, [rawExcelRows, selectedWagonColumn, selectedSecondaryWagonColumn, selectedWeightColumn])

  // -------------------------------------------------------------
  // 4. CONSOLIDAÇÃO DE TODOS OS VAGÕES DOS MDF-es
  // -------------------------------------------------------------
  const allMdfVagoes = useMemo<MdfeVagao[]>(() => {
    const list: MdfeVagao[] = []
    mdfeList.forEach((mdf) => {
      list.push(...mdf.vagoes)
    })
    return list
  }, [mdfeList])

  // -------------------------------------------------------------
  // 5. MOTOR DE CONCILIAÇÃO MDF-e x EXCEL
  // -------------------------------------------------------------
  const { itens: comparisonItems, resumo } = useMemo(() => {
    if (allMdfVagoes.length === 0 && excelVagoesList.length === 0) {
      return {
        itens: [],
        resumo: {
          totalMDF: 0,
          totalExcel: 0,
          totalConferidos: 0,
          totalFaltamExcel: 0,
          totalFaltamMDF: 0,
          percentualConferencia: 0,
          pesoTotalMDF: 0,
          pesoTotalExcel: 0,
          diferencaPesoTotal: 0,
        },
      }
    }

    return executarComparacaoMdfeExcel(allMdfVagoes, excelVagoesList)
  }, [allMdfVagoes, excelVagoesList])

  // -------------------------------------------------------------
  // 6. FILTRAGEM E BUSCA INTERATIVA
  // -------------------------------------------------------------
  const filteredItems = useMemo(() => {
    let result = comparisonItems

    // Filtro de status
    if (activeFilter !== 'TODOS') {
      result = result.filter((item) => item.status === activeFilter)
    }

    // Busca textual
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      result = result.filter((item) => {
        const idMatch = item.identificadorExibicao.toLowerCase().includes(q)
        const numMatch = item.numeroApenas.includes(q)
        const serieMatch = item.serie?.toLowerCase().includes(q)
        const obsMatch = item.observacao?.toLowerCase().includes(q)
        const rowMatch = item.vagaoExcel ? String(item.vagaoExcel.rowIndex).includes(q) : false

        return idMatch || numMatch || serieMatch || obsMatch || rowMatch
      })
    }

    return result
  }, [comparisonItems, activeFilter, searchTerm])

  // -------------------------------------------------------------
  // 8. EXPORTAÇÃO EXCEL DA CONCILIAÇÃO
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    if (comparisonItems.length === 0) return

    const wb = XLSX.utils.book_new()

    // Aba 1: Resumo Executivo
    const resumoData = [
      ['RELATÓRIO DE CONCILIAÇÃO FERROVIÁRIA: MDF-e X PLANILHA EXCEL', ''],
      ['Data de Geração:', new Date().toLocaleString('pt-BR')],
      ['', ''],
      ['INFORMAÇÕES DO MDF-E', ''],
      ['Emitente:', mdfeList[0]?.emitenteNome || 'N/A'],
      ['CNPJ Emitente:', mdfeList[0]?.emitenteCnpj || 'N/A'],
      ['Número do MDF-e / Série:', `${mdfeList[0]?.numero || 'N/A'} / ${mdfeList[0]?.serie || 'N/A'}`],
      ['Prefixo do Trem:', mdfeList[0]?.trem?.prefixo || 'N/A'],
      ['Origem ➔ Destino:', `${mdfeList[0]?.trem?.origem || 'N/A'} ➔ ${mdfeList[0]?.trem?.destino || 'N/A'}`],
      ['Chave MDF-e:', mdfeList[0]?.chaveAcesso || 'N/A'],
      ['', ''],
      ['RESULTADOS DA CONCILIAÇÃO', ''],
      ['Total de Vagões no MDF-e:', resumo.totalMDF],
      ['Total de Vagões na Planilha Excel:', resumo.totalExcel],
      ['Vagões Conferidos (Em Ambos):', resumo.totalConferidos],
      ['Vagões Faltando no Excel (Apenas no MDF):', resumo.totalFaltamExcel],
      ['Vagões Faltando no MDF (Apenas no Excel):', resumo.totalFaltamMDF],
      ['Taxa de Assertividade / Match:', `${resumo.percentualConferencia}%`],
      ['Peso Total MDF (t):', resumo.pesoTotalMDF],
      ['Peso Total Excel (t):', resumo.pesoTotalExcel],
      ['Diferença de Peso (t):', resumo.diferencaPesoTotal],
    ]
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData)
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Geral')

    // Aba 2: Todos os Vagões (Consolidado)
    const todosData = comparisonItems.map((item, idx) => ({
      Item: idx + 1,
      Status: item.status === 'CONFERIDO' ? 'CONFERIDO (OK)' : item.status === 'FALTA_NO_EXCEL' ? 'FALTA NO EXCEL' : 'FALTA NO MDF',
      Vagão: item.identificadorExibicao,
      Série: item.serie || '',
      Número: item.numeroApenas,
      'Seq MDF': item.vagaoMDF?.seq || '',
      'Peso MDF (t)': item.pesoMDF ?? '',
      'Linha Excel': item.vagaoExcel?.rowIndex || '',
      'Peso Excel (t)': item.pesoExcel ?? '',
      'Dif Peso (t)': item.diferencaPeso ?? '',
      Observação: item.observacao || '',
    }))
    const wsTodos = XLSX.utils.json_to_sheet(todosData)
    XLSX.utils.book_append_sheet(wb, wsTodos, 'Consolidado')

    // Aba 3: Apenas Divergências (Falta no Excel)
    const faltamExcelData = comparisonItems
      .filter((i) => i.status === 'FALTA_NO_EXCEL')
      .map((item, idx) => ({
        Item: idx + 1,
        Vagão: item.identificadorExibicao,
        Série: item.serie || '',
        Número: item.numeroApenas,
        'Seq MDF': item.vagaoMDF?.seq || '',
        'Peso MDF (t)': item.pesoMDF ?? '',
        Observação: 'Consta no MDF-e mas NÃO encontrado no Excel',
      }))
    if (faltamExcelData.length > 0) {
      const wsFaltaExcel = XLSX.utils.json_to_sheet(faltamExcelData)
      XLSX.utils.book_append_sheet(wb, wsFaltaExcel, 'Faltam no Excel')
    }

    // Aba 4: Apenas Divergências (Falta no MDF)
    const faltamMdfData = comparisonItems
      .filter((i) => i.status === 'FALTA_NO_MDF')
      .map((item, idx) => ({
        Item: idx + 1,
        'Linha Excel': item.vagaoExcel?.rowIndex || '',
        Vagão: item.identificadorExibicao,
        'Peso Excel (t)': item.pesoExcel ?? '',
        Observação: 'Consta no Excel mas NÃO manifestado no MDF-e',
      }))
    if (faltamMdfData.length > 0) {
      const wsFaltaMdf = XLSX.utils.json_to_sheet(faltamMdfData)
      XLSX.utils.book_append_sheet(wb, wsFaltaMdf, 'Faltam no MDF')
    }

    const tremPref = mdfeList[0]?.trem?.prefixo || 'TREM'
    XLSX.writeFile(wb, `Conciliacao_Vagoes_MDFe_${tremPref}_${Date.now()}.xlsx`)
  }

  // -------------------------------------------------------------
  // 9. COPIAR VAGÕES DIVERGENTES PARA O CLIPBOARD
  // -------------------------------------------------------------
  const handleCopyDivergences = () => {
    const faltamExcel = comparisonItems.filter((i) => i.status === 'FALTA_NO_EXCEL').map((i) => i.identificadorExibicao)
    const faltamMdf = comparisonItems.filter((i) => i.status === 'FALTA_NO_MDF').map((i) => i.identificadorExibicao)

    const textToCopy = `=== RELATÓRIO DE DIVERGÊNCIAS DE VAGÕES ===
Trem: ${mdfeList[0]?.trem?.prefixo || 'N/A'} | MDF-e: ${mdfeList[0]?.numero || 'N/A'}

[ VAGÕES QUE CONSTAM NO MDF-E MAS FALTAM NO EXCEL (${faltamExcel.length}) ]
${faltamExcel.length > 0 ? faltamExcel.join(', ') : 'Nenhum'}

[ VAGÕES QUE CONSTAM NO EXCEL MAS FALTAM NO MDF-E (${faltamMdf.length}) ]
${faltamMdf.length > 0 ? faltamMdf.join(', ') : 'Nenhum'}
`
    navigator.clipboard.writeText(textToCopy)
    setCopiedWagons(true)
    setTimeout(() => setCopiedWagons(false), 2500)
  }

  const handleCopyKey = (key: string) => {
    if (!key) return
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleReset = () => {
    setMdfeList([])
    setExcelFileName('')
    setWorkbook(null)
    setAvailableSheets([])
    setSelectedSheet('')
    setRawExcelRows([])
    setExcelColumns([])
    setSelectedWagonColumn('')
    setSelectedWeightColumn('')
    setSearchTerm('')
    setMdfError(null)
    setExcelError(null)
  }

  return (
    <div className="space-y-6">
      {/* ÁREA DE ENTRADA: MDF-E (APENAS COLAR) E PLANILHA EXCEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LADO 1: ENTRADA DO MDF-E (APENAS OPÇÃO DE COLAR TEXTO) */}
        <Card
          className={`border transition-all ${
            allMdfVagoes.length > 0
              ? 'border-indigo-500/40 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-xs'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs'
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ClipboardPaste className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                1. Entrada do MDF-e / DAMDFE (Colar Texto)
              </CardTitle>
              {allMdfVagoes.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {allMdfVagoes.length} vagões carregados
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearMdf}
                    className="h-6 px-2 text-[11px] text-zinc-500 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    Limpar
                  </Button>
                </div>
              )}
            </div>
            <CardDescription className="text-xs">
              Cole o texto do DAMDFE ou a lista de vagões diretamente no campo abaixo
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {mdfeList.length > 0 && (
              <div className="space-y-3">
                {mdfeList.map((mdf, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-zinc-900 shadow-xs space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                      <div className="flex items-center gap-2">
                        <TrainTrack className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {mdf.fileName || `MDF-e nº ${mdf.numero || 'Manifesto'}`}
                        </span>
                      </div>
                      {mdf.dataEmissao && (
                        <span className="text-[11px] font-mono text-zinc-500">
                          {mdf.dataEmissao} {mdf.horaEmissao}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                        <span className="text-zinc-400 block font-semibold text-[10px] uppercase">Emitente</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate block" title={mdf.emitenteNome}>
                          {mdf.emitenteNome || 'Identificado no texto'}
                        </span>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                        <span className="text-zinc-400 block font-semibold text-[10px] uppercase">Trem / Rota</span>
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">
                          {mdf.trem.prefixo || 'N/A'} ({mdf.trem.origem || 'Origem'} ➔ {mdf.trem.destino || 'Destino'})
                        </span>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                        <span className="text-zinc-400 block font-semibold text-[10px] uppercase">Qtd Vagões</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {mdf.vagoes.length} vagões
                        </span>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded-lg">
                        <span className="text-zinc-400 block font-semibold text-[10px] uppercase">Peso Total</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">
                          {mdf.trem.pesoTotalFormatado || `${(mdf.vagoes.reduce((a, b) => a + (b.tonUtil || 0), 0)).toFixed(3)} t`}
                        </span>
                      </div>
                    </div>

                    {mdf.chaveAcesso && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[280px]">
                          Chave: {mdf.chaveAcesso}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyKey(mdf.chaveAcesso)}
                          className="h-6 px-2 text-[10px] text-zinc-600 dark:text-zinc-400 cursor-pointer"
                        >
                          {copiedKey === mdf.chaveAcesso ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500 mr-1" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copiar Chave
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Caixa de Texto Direta para Colar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ClipboardPaste className="h-3.5 w-3.5 text-indigo-600" />
                  {mdfeList.length > 0 ? 'Colar ou substituir texto do MDF-e:' : 'Cole o texto do MDF-e / DAMDFE:'}
                </label>
                {directPasteText.trim() && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDirectPasteText('')}
                    className="h-5 px-1.5 text-[10px] text-zinc-400 hover:text-zinc-600"
                  >
                    Limpar campo
                  </Button>
                )}
              </div>

              <textarea
                value={directPasteText}
                onChange={(e) => setDirectPasteText(e.target.value)}
                rows={mdfeList.length > 0 ? 4 : 8}
                placeholder={`Cole aqui o texto copiado do DAMDFE ou a lista de vagões. Exemplo:&#10;HPT 250490 91,040 HFS 6110860 74,720&#10;HFS 6202250 74,660 HFS 6215301 74,900`}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 p-3 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-y"
              />

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-zinc-400">
                  {directPasteText.trim() ? `${directPasteText.trim().split('\n').length} linhas no campo` : 'Copie o texto do documento e cole aqui.'}
                </span>

                <Button
                  type="button"
                  size="sm"
                  disabled={!directPasteText.trim() || isProcessingMdf}
                  onClick={() => handleProcessPastedText()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 cursor-pointer flex items-center gap-1.5 h-8"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {isProcessingMdf ? 'Processando...' : mdfeList.length > 0 ? 'Atualizar Vagões' : 'Processar Texto e Extrair Vagões'}
                </Button>
              </div>
            </div>

            {isProcessingMdf && (
              <div className="text-xs text-indigo-600 flex items-center gap-2 animate-pulse pt-1">
                <TrainTrack className="h-4 w-4 animate-spin" />
                Extraindo dados e vagões do texto...
              </div>
            )}

            {mdfError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {mdfError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* LADO 2: UPLOAD DA PLANILHA EXCEL (.XLSX / .CSV) COM DRAG & DROP */}
        <Card
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingExcel(true)
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingExcel(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingExcel(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingExcel(false)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              processExcelFile(e.dataTransfer.files[0])
            }
          }}
          className={`border-2 transition-all relative ${
            isDraggingExcel
              ? 'border-emerald-600 ring-4 ring-emerald-500/30 bg-emerald-100/50 dark:bg-emerald-950/80 shadow-lg scale-[1.01]'
              : excelVagoesList.length > 0
              ? 'border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/20'
              : 'border-dashed border-zinc-300 dark:border-zinc-800'
          }`}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                2. Planilha Excel (.xlsx / .csv)
              </CardTitle>
              {excelVagoesList.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {excelVagoesList.length} vagões lidos
                </span>
              )}
            </div>
            <CardDescription className="text-xs">
              Arraste e solte a planilha com a coluna "Número de ident." dos vagões
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!workbook && rawExcelRows.length === 0 ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDraggingExcel(true)
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDraggingExcel(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDraggingExcel(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDraggingExcel(false)
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processExcelFile(e.dataTransfer.files[0])
                  }
                }}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isDraggingExcel
                    ? 'border-emerald-600 bg-emerald-100/60 dark:bg-emerald-900/60 scale-[1.02]'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-400 bg-zinc-50/60 dark:bg-zinc-900/40'
                }`}
              >
                <FileSpreadsheet className={`h-8 w-8 mb-2 transition-transform ${isDraggingExcel ? 'text-emerald-600 scale-125 animate-bounce' : 'text-emerald-500'}`} />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 text-center">
                  {isDraggingExcel ? 'Solte a planilha Excel aqui!' : 'Clique ou arraste e solte a planilha (.xlsx, .xls ou .csv)'}
                </span>
                <span className="text-[11px] text-zinc-400 mt-1 text-center">
                  A coluna de vagões ("Número de ident.") é detectada automaticamente
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => e.target.files?.[0] && processExcelFile(e.target.files[0])}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-zinc-900 shadow-xs space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[220px]">
                        {excelFileName}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                      {rawExcelRows.length} linhas ({excelVagoesList.length} vagões)
                    </span>
                  </div>

                  {/* Seletor de Aba (se houver mais de uma) */}
                  {availableSheets.length > 1 && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">
                        Aba da Planilha:
                      </label>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="w-full h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                      >
                        {availableSheets.map((sh) => (
                          <option key={sh} value={sh}>
                            {sh}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Seletores de Colunas (Coluna 1, Coluna 2 Continuação, Peso) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                        Coluna de Vagão (Principal):
                      </label>
                      <select
                        value={selectedWagonColumn}
                        onChange={(e) => setSelectedWagonColumn(e.target.value)}
                        className="w-full h-8 px-2 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                      >
                        {excelColumns.map((col) => (
                          <option key={col} value={col}>
                            {col} {col === selectedWagonColumn ? '✓' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                        2ª Coluna Vagão (Continuação):
                      </label>
                      <select
                        value={selectedSecondaryWagonColumn}
                        onChange={(e) => setSelectedSecondaryWagonColumn(e.target.value)}
                        className={`w-full h-8 px-2 text-xs rounded-lg border transition-colors ${
                          selectedSecondaryWagonColumn
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold'
                            : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <option value="">-- Nenhuma (Apenas 1 Coluna) --</option>
                        {excelColumns.map((col) => (
                          <option key={col} value={col}>
                            {col} {col === selectedSecondaryWagonColumn ? '✓ (2ª Coluna)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                        Coluna de Peso (Opcional):
                      </label>
                      <select
                        value={selectedWeightColumn}
                        onChange={(e) => setSelectedWeightColumn(e.target.value)}
                        className="w-full h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                      >
                        <option value="">-- Não comparar peso --</option>
                        {excelColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer inline-flex items-center gap-1">
                    <Upload className="h-3.5 w-3.5" />
                    Trocar ou arrastar outra planilha Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => e.target.files?.[0] && processExcelFile(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {isProcessingExcel && (
              <div className="text-xs text-emerald-600 flex items-center gap-2 animate-pulse">
                <FileSpreadsheet className="h-4 w-4 animate-spin" />
                Lendo planilha Excel...
              </div>
            )}

            {excelError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {excelError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DETALHES EXPANSÍVEIS DO TREM E CHAVES VINCULADAS */}
      {showMdfDetails && mdfeList.length > 0 && (
        <Card className="border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
              <span>Informações Detalhadas do Trem & Documentos Fiscais Vinculados</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowNfeKeys(!showNfeKeys)}
                className="h-7 text-xs bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 cursor-pointer"
              >
                {showNfeKeys ? 'Ocultar Chaves CT-e/NF-e' : `Ver Chaves Vinculadas (${mdfeList.reduce((a, m) => a + m.chavesVinculadas.length, 0)})`}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {mdfeList.map((mdf, idx) => (
              <div key={idx} className="space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-zinc-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-950">
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-bold">Prefixo do Trem</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{mdf.trem.prefixo || 'Não informado'}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-bold">Origem / Destino</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{mdf.trem.origem} ➔ {mdf.trem.destino}</p>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-bold">Vagões Declarados</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{mdf.trem.qtdVagoesCarregados} vagões</p>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px] uppercase font-bold">Protocolo Sefaz</span>
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 truncate" title={mdf.protocolo}>{mdf.protocolo || 'N/A'}</p>
                  </div>
                </div>

                {showNfeKeys && mdf.chavesVinculadas.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        Chaves de Acesso Vinculadas ({mdf.chavesVinculadas.length})
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(mdf.chavesVinculadas.join('\n'))
                          setCopiedKey('all-nfe')
                          setTimeout(() => setCopiedKey(null), 2000)
                        }}
                        className="h-6 text-[10px] cursor-pointer"
                      >
                        {copiedKey === 'all-nfe' ? 'Todas Copiadas!' : 'Copiar Todas'}
                      </Button>
                    </div>
                    <div className="max-h-32 overflow-y-auto font-mono text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg space-y-1">
                      {mdf.chavesVinculadas.map((k, kIdx) => (
                        <div key={kIdx} className="flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-900 px-1 rounded">
                          <span>{k}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyKey(k)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* DASHBOARD DE MÉTRICAS / KPIS DA CONCILIAÇÃO */}
      {comparisonItems.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Card 1: Total MDF */}
            <Card
              className={`cursor-pointer transition-all ${activeFilter === 'TODOS' ? 'ring-2 ring-indigo-500' : 'hover:border-indigo-300'}`}
              onClick={() => setActiveFilter('TODOS')}
            >
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-[11px] font-bold uppercase tracking-wider">No MDF-e</span>
                  <TrainTrack className="h-4 w-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{resumo.totalMDF}</div>
                <p className="text-[10px] text-zinc-400 font-medium">
                  {resumo.pesoTotalMDF > 0 ? `${resumo.pesoTotalMDF.toLocaleString('pt-BR')} t total` : 'vagões listados'}
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Total Excel */}
            <Card
              className={`cursor-pointer transition-all ${activeFilter === 'TODOS' ? 'ring-2 ring-emerald-500' : 'hover:border-emerald-300'}`}
              onClick={() => setActiveFilter('TODOS')}
            >
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-zinc-500">
                  <span className="text-[11px] font-bold uppercase tracking-wider">No Excel</span>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{resumo.totalExcel}</div>
                <p className="text-[10px] text-zinc-400 font-medium">
                  {resumo.pesoTotalExcel > 0 ? `${resumo.pesoTotalExcel.toLocaleString('pt-BR')} t total` : 'vagões na planilha'}
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Conferidos (Match) */}
            <Card
              className={`cursor-pointer transition-all ${activeFilter === 'CONFERIDO' ? 'ring-2 ring-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40' : 'hover:border-emerald-400'}`}
              onClick={() => setActiveFilter('CONFERIDO')}
            >
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Conferidos (OK)</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{resumo.totalConferidos}</div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-300 font-bold">
                  {resumo.percentualConferencia}% de conformidade
                </p>
              </CardContent>
            </Card>

            {/* Card 4: Faltam no Excel */}
            <Card
              className={`cursor-pointer transition-all ${activeFilter === 'FALTA_NO_EXCEL' ? 'ring-2 ring-rose-600 bg-rose-50/50 dark:bg-rose-950/40' : 'hover:border-rose-300'}`}
              onClick={() => setActiveFilter('FALTA_NO_EXCEL')}
            >
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Faltam no Excel</span>
                  <XCircle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="text-2xl font-black text-rose-700 dark:text-rose-400">{resumo.totalFaltamExcel}</div>
                <p className="text-[10px] text-rose-500 font-medium">
                  {resumo.totalFaltamExcel === 0 ? 'Nenhuma pendência' : 'Apenas no MDF-e'}
                </p>
              </CardContent>
            </Card>

            {/* Card 5: Faltam no MDF */}
            <Card
              className={`cursor-pointer transition-all ${activeFilter === 'FALTA_NO_MDF' ? 'ring-2 ring-amber-600 bg-amber-50/50 dark:bg-amber-950/40' : 'hover:border-amber-300'}`}
              onClick={() => setActiveFilter('FALTA_NO_MDF')}
            >
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
                  <span className="text-[11px] font-bold uppercase tracking-wider">Faltam no MDF</span>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-700 dark:text-amber-400">{resumo.totalFaltamMDF}</div>
                <p className="text-[10px] text-amber-600 font-medium">
                  {resumo.totalFaltamMDF === 0 ? 'Nenhum excedente' : 'Apenas na planilha'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* BARRA DE AÇÕES E EXPORTAÇÃO */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                onClick={handleExportExcel}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar Relatório Completo (.xlsx)
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopyDivergences}
                className="text-xs font-semibold border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
              >
                {copiedWagons ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Lista Copiada!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-zinc-500" />
                    Copiar Lista de Divergências
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-xs text-zinc-500 hover:text-red-600 cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpar e Nova Conciliação
              </Button>
            </div>
          </div>

          {/* TABELA PRINCIPAL DE CONCILIAÇÃO COM BUSCA E FILTROS */}
          <Card className="border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <CardHeader className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Abas Rápidas de Filtragem */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveFilter('TODOS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeFilter === 'TODOS'
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200'
                    }`}
                  >
                    Todos ({comparisonItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('CONFERIDO')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      activeFilter === 'CONFERIDO'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Conferidos ({resumo.totalConferidos})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('FALTA_NO_EXCEL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      activeFilter === 'FALTA_NO_EXCEL'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100'
                    }`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Faltam no Excel ({resumo.totalFaltamExcel})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('FALTA_NO_MDF')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      activeFilter === 'FALTA_NO_MDF'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Faltam no MDF ({resumo.totalFaltamMDF})
                  </button>
                </div>

                {/* Input de Busca */}
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                  <Input
                    type="text"
                    placeholder="Buscar por vagão, série, número ou linha..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-9 text-xs bg-white dark:bg-zinc-950"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="text-[11px] uppercase font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/80 sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-xs">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Identificação do Vagão</th>
                      <th className="py-2.5 px-3">Série / Nº</th>
                      <th className="py-2.5 px-3">MDF-e (Seq / Ton)</th>
                      <th className="py-2.5 px-3">Excel (Linha / Peso)</th>
                      <th className="py-2.5 px-3">Divergência / Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-zinc-400 text-xs">
                          Nenhum registro encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => {
                        const isMatch = item.status === 'CONFERIDO'
                        const isFaltaExcel = item.status === 'FALTA_NO_EXCEL'
                        const isFaltaMdf = item.status === 'FALTA_NO_MDF'

                        return (
                          <tr
                            key={item.id || idx}
                            className={`transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/80 ${
                              isFaltaExcel
                                ? 'bg-rose-50/20 dark:bg-rose-950/10'
                                : isFaltaMdf
                                ? 'bg-amber-50/20 dark:bg-amber-950/10'
                                : ''
                            }`}
                          >
                            {/* Status */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              {isMatch && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  CONFERIDO
                                </span>
                              )}
                              {isFaltaExcel && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  <XCircle className="h-3.5 w-3.5" />
                                  FALTA NO EXCEL
                                </span>
                              )}
                              {isFaltaMdf && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  FALTA NO MDF
                                </span>
                              )}
                            </td>

                            {/* Identificação do Vagão */}
                            <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                              <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                                {item.identificadorExibicao}
                              </span>
                            </td>

                            {/* Série / Nº */}
                            <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {item.serie || '-'}
                              </span>{' '}
                              <span className="font-mono">{item.numeroApenas}</span>
                            </td>

                            {/* MDF-e (Seq / Ton) */}
                            <td className="py-2.5 px-3">
                              {item.vagaoMDF ? (
                                <div>
                                  <span className="text-zinc-500 font-mono text-[11px]">
                                    Seq: #{item.vagaoMDF.seq || '-'}
                                  </span>
                                  {item.pesoMDF !== undefined && (
                                    <span className="ml-2 font-bold text-zinc-900 dark:text-zinc-100">
                                      {item.pesoMDF.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-400 italic">Não consta</span>
                              )}
                            </td>

                            {/* Excel (Linha / Peso) */}
                            <td className="py-2.5 px-3">
                              {item.vagaoExcel ? (
                                <div>
                                  <span className="text-zinc-500 font-mono text-[11px]">
                                    Linha {item.vagaoExcel.rowIndex}
                                  </span>
                                  {item.pesoExcel !== undefined && (
                                    <span className="ml-2 font-bold text-zinc-900 dark:text-zinc-100">
                                      {item.pesoExcel.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-zinc-400 italic">Não consta</span>
                              )}
                            </td>

                            {/* Observações / Divergências */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`text-[11px] font-medium ${
                                  isFaltaExcel
                                    ? 'text-rose-700 dark:text-rose-300 font-semibold'
                                    : isFaltaMdf
                                    ? 'text-amber-700 dark:text-amber-300 font-semibold'
                                    : item.diferencaPeso && Math.abs(item.diferencaPeso) > 0.05
                                    ? 'text-amber-600 font-bold'
                                    : 'text-zinc-500 dark:text-zinc-400'
                                }`}
                              >
                                {item.observacao}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
