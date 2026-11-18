import React, { useState, useMemo, useRef, useEffect } from 'react'
import {
  FileSpreadsheet,
  Upload,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Filter,
  Calendar,
  Clock,
  ArrowRight,
  Layers,
  Edit2,
  ListFilter,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ResumoItem,
  SobreRodasRow,
  ConfrontoResultItem,
  ConfrontoSummary,
  extractResumoItemsFromAoa,
  alignResumoRateioUnits,
  parseSobreRodasExcel,
  executeConfronto,
  exportConfrontoExcel,
  exportConfrontoPdf,
} from '@/lib/confronto-sobre-rodas-service'

interface ConfrontoSobreRodasViewProps {
  aoaData?: string[][]
  resumoItems?: ResumoItem[]
  sourceLabel?: string
  trainName?: string | null
  prefixo?: string | null
  outputFileName?: string
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
}

export const ConfrontoSobreRodasView: React.FC<ConfrontoSobreRodasViewProps> = ({
  aoaData,
  resumoItems: resumoItemsProp,
  sourceLabel,
  trainName,
  prefixo,
  outputFileName,
  onNotify,
}) => {
  // Estado do arquivo Sobre Rodas carregado
  const [sobreRodasFile, setSobreRodasFile] = useState<{ name: string; rows: SobreRodasRow[] } | null>(null)
  const [isParsing, setIsParsing] = useState(false)

  // Estado da seleção de data e hora de chegada
  const [selectedArrivalDateTime, setSelectedArrivalDateTime] = useState<string | null>(null)
  const [isChangingDateTime, setIsChangingDateTime] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('')

  // Filtros da tabela
  const [filterMode, setFilterMode] = useState<'todos' | 'desmembres' | 'divergentes' | 'batidos'>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Extrair itens da composição (Rumo aoaData ou VLI pré-estruturado)
  const resumoItems = useMemo(() => {
    if (resumoItemsProp) return resumoItemsProp
    return extractResumoItemsFromAoa(aoaData || [])
  }, [resumoItemsProp, aoaData])

  // Identificar todas as datas/horários de chegada presentes no arquivo Sobre Rodas
  const availableArrivals = useMemo(() => {
    if (!sobreRodasFile?.rows) return []
    const map = new Map<string, number>()
    for (const r of sobreRodasFile.rows) {
      const dt = (r.matrizDataChegada || '').trim()
      if (dt) {
        map.set(dt, (map.get(dt) || 0) + 1)
      }
    }
    return Array.from(map.entries())
      .map(([dateTime, count]) => ({ dateTime, count }))
      .sort((a, b) => b.count - a.count)
  }, [sobreRodasFile])

  // Quando um novo arquivo é carregado, pré-preencher com a data/hora mais comum
  useEffect(() => {
    if (availableArrivals.length > 0) {
      const top = availableArrivals[0].dateTime
      const parts = top.split(/\s+/)
      setCustomDate(parts[0] || '')
      setCustomTime(parts[1] || '')
    } else {
      setCustomDate('')
      setCustomTime('')
    }
    setSelectedArrivalDateTime(null)
    setIsChangingDateTime(false)
  }, [availableArrivals])

  // Upload e leitura do arquivo Sobre Rodas
  const handleFileUpload = async (file: File) => {
    if (!file) return
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    if (!hasValidExt) {
      onNotify?.('Formato inválido. Por favor envie um arquivo Excel (.xlsx ou .xls) do Estoque Sobre Rodas.', 'error')
      return
    }

    setIsParsing(true)
    try {
      const buffer = await file.arrayBuffer()
      const parsedRows = parseSobreRodasExcel(buffer)

      if (parsedRows.length === 0) {
        onNotify?.(
          'Nenhum registro reconhecido na planilha Sobre Rodas. Verifique se o arquivo possui as colunas de Placa, NF e Peso Nota Rateio.',
          'warning'
        )
        setIsParsing(false)
        return
      }

      setSobreRodasFile({
        name: file.name,
        rows: parsedRows,
      })

      onNotify?.(
        `Planilha Sobre Rodas "${file.name}" carregada com sucesso (${parsedRows.length} linhas)! Agora selecione a data e horário de chegada.`,
        'success'
      )
    } catch (err: any) {
      console.error('Erro ao ler planilha Sobre Rodas:', err)
      onNotify?.(`Erro ao ler planilha Sobre Rodas: ${err?.message || 'Arquivo corrompido ou ilegível'}`, 'error')
    } finally {
      setIsParsing(false)
    }
  }

  // Confirmar filtro de Data e Hora de Chegada
  const handleConfirmDateTime = (chosen?: string) => {
    let finalValue = ''
    if (chosen) {
      finalValue = chosen
    } else {
      const d = customDate.trim()
      const t = customTime.trim()
      if (d && t) {
        finalValue = `${d} ${t}`
      } else if (d) {
        finalValue = d
      } else if (t) {
        finalValue = t
      } else {
        finalValue = 'ALL'
      }
    }

    setSelectedArrivalDateTime(finalValue)
    setIsChangingDateTime(false)

    if (finalValue === 'ALL') {
      onNotify?.('Confronto renderizado considerando todas as datas e horários da planilha.', 'success')
    } else {
      onNotify?.(`Confronto renderizado filtrando para a chegada: ${finalValue}`, 'success')
    }
  }

  // Filtrar as linhas do Sobre Rodas pela data e hora de chegada selecionada
  const activeSobreRodasRows = useMemo(() => {
    if (!sobreRodasFile?.rows || !selectedArrivalDateTime) return []
    if (selectedArrivalDateTime === 'ALL') return sobreRodasFile.rows

    const target = selectedArrivalDateTime.trim().toLowerCase()
    const targetParts = target.split(/\s+/).filter(Boolean)

    return sobreRodasFile.rows.filter((r) => {
      const dt = (r.matrizDataChegada || '').trim().toLowerCase()
      if (!dt) return false
      return targetParts.every((part) => dt.includes(part))
    })
  }, [sobreRodasFile, selectedArrivalDateTime])

  // Executar o confronto das linhas do resumo contra as linhas filtradas do Sobre Rodas
  const confrontoData = useMemo(() => {
    if (!selectedArrivalDateTime || !resumoItems.length) return null
    const alignedResumoItems = alignResumoRateioUnits(resumoItems, activeSobreRodasRows)
    return executeConfronto(alignedResumoItems, activeSobreRodasRows)
  }, [resumoItems, activeSobreRodasRows, selectedArrivalDateTime])

  // Filtragem dos itens para a tabela
  const filteredItems = useMemo(() => {
    if (!confrontoData) return []
    let list = confrontoData.items

    // Filtro por modo
    if (filterMode === 'desmembres') {
      list = list.filter((it) => it.resumo.isDesmembre)
    } else if (filterMode === 'divergentes') {
      list = list.filter((it) => it.status !== 'ok')
    } else if (filterMode === 'batidos') {
      list = list.filter((it) => it.status === 'ok')
    }

    // Busca textual
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (it) =>
          it.resumo.vagao?.toLowerCase().includes(q) ||
          it.resumo.notaFiscal?.includes(q) ||
          it.resumo.chaveNfe?.includes(q) ||
          it.resumo.mercadoria?.toLowerCase().includes(q) ||
          it.resumo.destinatarioNf?.toLowerCase().includes(q) ||
          it.sobreRodas?.matrizNomeExport?.toLowerCase().includes(q) ||
          it.sobreRodas?.matrizNomeFornecedor?.toLowerCase().includes(q)
      )
    }

    return list
  }, [confrontoData, filterMode, searchQuery])

  // Exportar Excel
  const handleExportExcel = () => {
    if (!confrontoData || confrontoData.items.length === 0) return
    const baseName = trainName || prefixo || outputFileName || 'confronto_sobre_rodas'
    const suffix = selectedArrivalDateTime && selectedArrivalDateTime !== 'ALL'
      ? `_${selectedArrivalDateTime.replace(/[^0-9]/g, '_')}`
      : ''
    exportConfrontoExcel(confrontoData.items, `${baseName}${suffix}`)
    onNotify?.('Planilha de Confronto exportada com sucesso (.xlsx)!', 'success')
  }

  // Exportar PDF
  const handleExportPdf = () => {
    if (!confrontoData || confrontoData.items.length === 0) return
    const baseName = trainName || prefixo || outputFileName || 'confronto_sobre_rodas'
    const suffix = selectedArrivalDateTime && selectedArrivalDateTime !== 'ALL'
      ? `_${selectedArrivalDateTime.replace(/[^0-9]/g, '_')}`
      : ''
    const pdfTitle = sourceLabel
      ? `Confronto ${sourceLabel} x Estoque Sobre Rodas`
      : 'Confronto Resumo Rumo x Estoque Sobre Rodas'
    exportConfrontoPdf(confrontoData.items, `${baseName}${suffix}`, pdfTitle)
    onNotify?.('Relatório de Confronto exportado com sucesso (.pdf)!', 'success')
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Confronto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">
              Confronto: {sourceLabel || 'Resumo Composição'} vs. Estoque Sobre Rodas
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
              Placa · NFE · Rateio
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cruza automaticamente vagões, notas fiscais e rateios por data/hora de chegada do Sobre Rodas.
          </p>
        </div>

        {sobreRodasFile && selectedArrivalDateTime && !isChangingDateTime && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsChangingDateTime(true)}
              className="text-xs h-8 cursor-pointer gap-1.5 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300"
            >
              <Clock className="h-3.5 w-3.5" />
              Filtrar Outra Chegada
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSobreRodasFile(null)
                setSelectedArrivalDateTime(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Trocar Planilha
            </Button>
            <Button
              size="sm"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 cursor-pointer gap-1.5 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar (.xlsx)
            </Button>
            <Button
              size="sm"
              onClick={handleExportPdf}
              variant="outline"
              className="border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950 text-xs h-8 cursor-pointer gap-1.5 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar (.pdf)
            </Button>
          </div>
        )}
      </div>

      {/* ETAPA 1: Upload da Planilha Sobre Rodas se ainda não carregada */}
      {!sobreRodasFile ? (
        <Card className="border-dashed border-2 border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-zinc-900/40 hover:border-indigo-400 transition-all">
          <CardContent className="p-8">
            <div
              className="flex flex-col items-center justify-center text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) handleFileUpload(file)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-xs">
                {isParsing ? (
                  <div className="h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-7 w-7" />
                )}
              </div>
              <h4 className="text-sm font-bold text-foreground">
                Inserir Planilha "Estoque Sobre Rodas" (.xlsx / .xls)
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md">
                Faça o upload da planilha do terminal. Em seguida, você escolherá a data e o horário de chegada para filtrar e renderizar o confronto.
              </p>
              <Button
                size="sm"
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 cursor-pointer gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Selecionar Planilha Sobre Rodas
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (!selectedArrivalDateTime || isChangingDateTime) ? (
        /* ETAPA 2: Perguntar Data e Hora do Confronto antes de renderizar */
        <Card className="border-purple-200 dark:border-purple-900/60 bg-white dark:bg-zinc-900 shadow-sm">
          <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    Definir Data e Hora de Chegada do Sobre Rodas
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 mt-0.5">
                    Planilha carregada: <strong>{sobreRodasFile.name}</strong> ({sobreRodasFile.rows.length} registros no total).
                    O confronto será renderizado para a data e hora informadas abaixo:
                  </CardDescription>
                </div>
              </div>
              {selectedArrivalDateTime && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsChangingDateTime(false)}
                  className="text-xs h-8 text-zinc-500 hover:text-foreground cursor-pointer"
                >
                  Voltar ao Confronto Atual
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Opções Rápidas Detectadas na Planilha */}
            {availableArrivals.length > 0 && (
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <ListFilter className="h-3.5 w-3.5 text-purple-600" />
                  Chegadas Identificadas no Arquivo (clique para selecionar):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableArrivals.map((arr, idx) => {
                    const isSelected =
                      customDate && customTime && `${customDate} ${customTime}` === arr.dateTime
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const parts = arr.dateTime.split(/\s+/)
                          setCustomDate(parts[0] || '')
                          setCustomTime(parts[1] || '')
                        }}
                        className={`p-2.5 text-left rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-900 dark:text-purple-200 font-bold shadow-xs ring-1 ring-purple-600'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:border-purple-300'
                        }`}
                      >
                        <span className="font-mono">{arr.dateTime}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-sans">
                          {arr.count} vagão(ões)
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Campos de Input Manual */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-purple-600" />
                  Data de Chegada (DD/MM/AAAA)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 03/11/2026"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-purple-600" />
                  Horário de Chegada (HH:mm)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 12:45"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleConfirmDateTime('ALL')}
                className="text-xs text-zinc-500 hover:text-foreground cursor-pointer underline underline-offset-4"
              >
                Confrontar todas as chegadas (sem filtro de data/hora)
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSobreRodasFile(null)
                    setSelectedArrivalDateTime(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-xs h-9 cursor-pointer"
                >
                  Cancelar / Trocar Planilha
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleConfirmDateTime()}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-9 px-4 font-bold cursor-pointer gap-2 shadow-xs"
                >
                  <span>Confirmar e Renderizar Confronto</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ETAPA 3: Renderizar Tabela de Confronto Filtrada */
        confrontoData && (
          <div className="space-y-4">
            {/* Banner de Chegada Ativa */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 text-xs">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-600" />
                <span className="font-semibold text-purple-900 dark:text-purple-200">
                  Chegada Filtrada:
                </span>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                  {selectedArrivalDateTime === 'ALL' ? 'Todas as Chegadas' : selectedArrivalDateTime}
                </span>
                <span className="text-purple-800 dark:text-purple-300 text-[11px]">
                  ({activeSobreRodasRows.length} registro(s) no Sobre Rodas para esta chegada)
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsChangingDateTime(true)}
                className="text-xs h-7 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer gap-1"
              >
                <Edit2 className="h-3 w-3" />
                Alterar Data/Hora
              </Button>
            </div>

            {/* Cards com Métricas do Confronto */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3.5 border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Total Confrontados
                </span>
                <div className="text-xl font-extrabold text-foreground">
                  {confrontoData.summary.totalConfrontados} linhas
                </div>
                <span className="text-[10px] text-zinc-500">
                  {confrontoData.summary.desmembresCount} em desmembre
                </span>
              </Card>

              <Card className="p-3.5 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                  100% Batidos (Verdadeiro)
                </span>
                <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {confrontoData.summary.total100PercentMatch}
                </div>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300">
                  Placa, NFE e Rateio idênticos
                </span>
              </Card>

              <Card className={`p-3.5 border-amber-200 dark:border-amber-900/60 ${confrontoData.summary.totalDivergentes > 0 ? 'bg-amber-50/50 dark:bg-amber-950/30' : 'bg-white dark:bg-zinc-900'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block mb-1">
                  Divergências
                </span>
                <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">
                  {confrontoData.summary.totalDivergentes}
                </div>
                <span className="text-[10px] text-amber-800 dark:text-amber-300">
                  Placa, NFE ou Rateio divergente
                </span>
              </Card>

              <Card className="p-3.5 border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Não Localizados
                </span>
                <div className="text-xl font-extrabold text-zinc-600 dark:text-zinc-300">
                  {confrontoData.summary.totalNaoLocalizados}
                </div>
                <span className="text-[10px] text-zinc-500">
                  Ausentes nesta chegada
                </span>
              </Card>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                <span className="text-xs font-semibold text-zinc-500 mr-1 flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Filtrar:
                </span>
                <button
                  onClick={() => setFilterMode('todos')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    filterMode === 'todos'
                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-2xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Todos ({confrontoData.items.length})
                </button>
                <button
                  onClick={() => setFilterMode('desmembres')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    filterMode === 'desmembres'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-100 shadow-2xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Apenas Desmembres ({confrontoData.summary.desmembresCount})
                </button>
                <button
                  onClick={() => setFilterMode('divergentes')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    filterMode === 'divergentes'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-100 shadow-2xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Divergentes ({confrontoData.summary.totalDivergentes + confrontoData.summary.totalNaoLocalizados})
                </button>
                <button
                  onClick={() => setFilterMode('batidos')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    filterMode === 'batidos'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-100 shadow-2xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  100% Batidos ({confrontoData.summary.total100PercentMatch})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por placa, NF, chave..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* TABELA DE CONFRONTO EM 3 SEÇÕES (IDENTICA AO MODELO EXCEL) */}
            <div className="overflow-x-auto rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm max-h-[600px] overflow-y-auto">
              <table className="min-w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-20 select-none">
                  {/* Linha 1: Seções Mescladas com as cores exatas da imagem do usuário */}
                  <tr className="text-white text-center font-bold tracking-wider text-xs">
                    {/* SEÇÃO 1: RESUMO COMPOSIÇÃO (AZUL) */}
                    <th
                      colSpan={6}
                      className="py-2.5 px-3 bg-[#38761D] bg-gradient-to-r from-sky-600 to-blue-600 border-r border-white/20"
                    >
                      RESUMO COMPOSIÇÃO
                    </th>
                    {/* SEÇÃO 2: ESTOQUE SOBRE RODAS (ROXO / MAGENTA) */}
                    <th
                      colSpan={10}
                      className="py-2.5 px-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 border-r border-white/20"
                    >
                      ESTOQUE SOBRE RODAS
                    </th>
                    {/* SEÇÃO 3: CONFRONTO (VERDE) */}
                    <th
                      colSpan={3}
                      className="py-2.5 px-3 bg-gradient-to-r from-emerald-600 to-green-600"
                    >
                      CONFRONTO
                    </th>
                  </tr>

                  {/* Linha 2: Nomes das Colunas */}
                  <tr className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 text-[10px] font-bold uppercase tracking-tight divide-x divide-zinc-200 dark:divide-zinc-700 border-b border-zinc-300 dark:border-zinc-700">
                    {/* RESUMO COMPOSIÇÃO */}
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40">Vagão</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40">Mercadoria</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40">Nota Fiscal</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40">Chave NFE</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40">Peso Rateio</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-sky-50/80 dark:bg-sky-950/40 border-r-2 border-zinc-400 dark:border-zinc-600">Destinatário NF</th>

                    {/* ESTOQUE SOBRE RODAS */}
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz PLACA</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz NFE</th>
                    <th className="py-2 px-2.5 text-right whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz RATEIO</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz ID EXPORT</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz NOME EXPORT</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz ID FORNECEDOR</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz NOME FORNECEDOR</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz OPERACAO RDS</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40">Matriz PRODUTO DIGITADO</th>
                    <th className="py-2 px-2.5 text-left whitespace-nowrap bg-purple-50/80 dark:bg-purple-950/40 border-r-2 border-zinc-400 dark:border-zinc-600">Matriz DATA CHEGADA</th>

                    {/* CONFRONTO */}
                    <th className="py-2 px-2.5 text-center whitespace-nowrap bg-emerald-50/80 dark:bg-emerald-950/40">PLACA</th>
                    <th className="py-2 px-2.5 text-center whitespace-nowrap bg-emerald-50/80 dark:bg-emerald-950/40">NFE</th>
                    <th className="py-2 px-2.5 text-center whitespace-nowrap bg-emerald-50/80 dark:bg-emerald-950/40">RATEIO</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono text-[11px]">
                  {filteredItems.length > 0 ? (
                    filteredItems.map((item, idx) => {
                      const res = item.resumo
                      const sr = item.sobreRodas

                      const rowBg =
                        item.status === 'ok'
                          ? idx % 2 === 0
                            ? 'bg-white dark:bg-zinc-900'
                            : 'bg-zinc-50/60 dark:bg-zinc-800/30'
                          : item.status === 'divergente'
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : 'bg-zinc-100/70 dark:bg-zinc-800/50'

                      return (
                        <tr key={idx} className={`${rowBg} hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80 transition-colors divide-x divide-zinc-200 dark:divide-zinc-800`}>
                          {/* RESUMO COMPOSIÇÃO */}
                          <td className="py-2 px-2.5 font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {res.vagao}
                              {res.isDesmembre && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-sans font-bold">
                                  DESMEMBRE
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                            {res.mercadoria || '-'}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                            {res.notaFiscal || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-500 font-mono text-[10px] whitespace-nowrap max-w-[200px] truncate" title={res.chaveNfe}>
                            {res.chaveNfe || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {res.pesoRateio || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-600 dark:text-zinc-300 whitespace-nowrap max-w-[180px] truncate border-r-2 border-zinc-400 dark:border-zinc-600" title={res.destinatarioNf}>
                            {res.destinatarioNf || '-'}
                          </td>

                          {/* ESTOQUE SOBRE RODAS */}
                          <td className="py-2 px-2.5 text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                            {sr?.matrizPlaca || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                            {sr?.matrizNfe || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-bold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                            {sr?.matrizRateio || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-500 text-[10px] whitespace-nowrap">
                            {sr?.matrizIdExport || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[160px] truncate" title={sr?.matrizNomeExport}>
                            {sr?.matrizNomeExport || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-500 text-[10px] whitespace-nowrap">
                            {sr?.matrizIdFornecedor || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-[160px] truncate" title={sr?.matrizNomeFornecedor}>
                            {sr?.matrizNomeFornecedor || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-600 dark:text-zinc-300 text-[10px] whitespace-nowrap max-w-[180px] truncate" title={sr?.matrizOperacaoRds}>
                            {sr?.matrizOperacaoRds || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-600 dark:text-zinc-300 whitespace-nowrap max-w-[180px] truncate" title={sr?.matrizProdutoDigitado}>
                            {sr?.matrizProdutoDigitado || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-zinc-500 whitespace-nowrap border-r-2 border-zinc-400 dark:border-zinc-600">
                            {sr?.matrizDataChegada || '-'}
                          </td>

                          {/* CONFRONTO: PLACA, NFE, RATEIO */}
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.placaMatch
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {item.placaMatch ? 'VERDADEIRO' : 'FALSO'}
                            </span>
                          </td>

                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.nfeMatch
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {item.nfeMatch ? 'VERDADEIRO' : 'FALSO'}
                            </span>
                          </td>

                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.rateioMatch
                                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                              }`}
                            >
                              {item.rateioMatch ? 'VERDADEIRO' : 'FALSO'}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={19} className="py-8 text-center text-zinc-500">
                        Nenhum registro encontrado com os filtros selecionados para esta data/horário de chegada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
