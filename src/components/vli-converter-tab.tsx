import React, { useState, useMemo, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  TrainTrack,
  RefreshCw,
  AlertCircle,
  Layers,
  Square,
  CheckSquare,
  Building2,
  Filter,
  ArrowRight,
  Info,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  parseVliExcelData,
  exportVliExcelFile,
  VliExtractionResult,
  VliRowData,
} from '@/lib/vli-excel-parser'
import { notifyWhatsAppEvent } from '@/lib/whatsapp-notifications'
import { getOperatorName } from '@/lib/firebase-realtime'

interface VliConverterTabProps {
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
}

export const VliConverterTab: React.FC<VliConverterTabProps> = ({ onNotify }) => {
  // Estados de Upload e Processamento
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dados da extração ativa
  const [activeResult, setActiveResult] = useState<VliExtractionResult | null>(null)
  const [activeFileName, setActiveFileName] = useState<string | null>(null)

  // Filtros e conferência
  const [searchQuery, setSearchQuery] = useState('')
  const [viewFilter, setViewFilter] = useState<'desmembres' | 'todos'>('desmembres')
  const [completedRows, setCompletedRows] = useState<number[]>([])

  // Processa o arquivo Excel VLI
  const handleFileUpload = async (file: File) => {
    if (!file) return

    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
      setErrorMessage('Por favor, selecione uma planilha Excel (.xlsx ou .xls) do Resumo VLI.')
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setCompletedRows([])

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = parseVliExcelData(arrayBuffer, file.name)

      if (!result.allRows || result.allRows.length === 0) {
        throw new Error('Não foram encontrados registros de vagões válidos nesta planilha.')
      }

      setActiveResult(result)
      setActiveFileName(file.name)

      // Download automático do arquivo de desmembres gerado
      if (result.excelBase64) {
        downloadBase64(result.excelBase64, result.outputFileName)
      } else {
        exportVliExcelFile(
          result.allRows,
          result.desmembreRows,
          result.headers,
          result.metadata,
          result.outputFileName
        )
      }

      setSuccessMessage(
        `Planilha "${file.name}" processada com sucesso! ${result.totalUniqueWagons} vagões analisados e ${result.desmembreCount} vagão(ões) com desmembre por CNPJ Dest. identificado(s). Planilha de desmembres gerada automaticamente.`
      )

      if (onNotify) {
        onNotify(
          `Resumo VLI processado: ${result.desmembreCount} desmembre(s) detectados!`,
          'success'
        )
      }

      // Notificação opcional via WhatsApp
      notifyWhatsAppEvent({
        type: 'rumo',
        title: 'Resumo VLI Processado',
        description: `Planilha VLI processada com ${result.desmembreCount} vagão(ões) em desmembre (CNPJ Dest. divergentes).`,
        operatorName: getOperatorName(),
      }).catch(() => {})
    } catch (err: any) {
      console.error('Erro no processamento da planilha VLI:', err)
      setErrorMessage(err.message || 'Erro inesperado ao processar planilha Excel.')
      if (onNotify) {
        onNotify(`Erro ao processar VLI: ${err.message}`, 'error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const downloadBase64 = (base64Data: string, fileName: string) => {
    try {
      const linkSource = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Data}`
      const downloadLink = document.createElement('a')
      downloadLink.href = linkSource
      downloadLink.download = fileName
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    } catch (err) {
      console.error('Erro no download do Excel:', err)
    }
  }

  const handleToggleRowCheck = (index: number) => {
    setCompletedRows((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }

  // Filtragem dos dados
  const displayedRows = useMemo(() => {
    if (!activeResult) return []
    const sourceRows = viewFilter === 'desmembres' ? activeResult.desmembreRows : activeResult.allRows

    if (!searchQuery.trim()) return sourceRows

    const q = searchQuery.toLowerCase().trim()
    return sourceRows.filter((r) => {
      return (
        r.vagao.toLowerCase().includes(q) ||
        r.nfe.toLowerCase().includes(q) ||
        r.chaveNf.toLowerCase().includes(q) ||
        r.cnpjDest.toLowerCase().includes(q) ||
        r.cnpjDestFormatted.toLowerCase().includes(q) ||
        (r.destinatario && r.destinatario.toLowerCase().includes(q)) ||
        r.os.toLowerCase().includes(q)
      )
    })
  }, [activeResult, viewFilter, searchQuery])

  // Cores alternadas por agrupamento de vagão
  const colorClasses = [
    'bg-sky-50/60 dark:bg-sky-950/20 hover:bg-sky-100/60 dark:hover:bg-sky-900/30',
    'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-900/30',
  ]
  let currentGroupColor = 0
  let previousVagao: string | null = null

  return (
    <div className="space-y-6">
      {/* Banner Superior */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 shrink-0">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Desmembre Resumo VLI
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  Excel .xlsx
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Validação CNPJ Dest.
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  VLI Multimodal
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Importe a planilha do Relatório Resumo VLI (.xlsx) para identificar automaticamente
                os desmembres quando o <strong>CNPJ Dest.</strong> for diferente para o mesmo vagão único.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Caixa de Upload Drag & Drop */}
      <Card className="border-dashed border-2 border-sky-200 dark:border-sky-900/60 bg-white/60 dark:bg-zinc-900/60 hover:border-sky-400 transition-all">
        <CardContent className="p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragEnter={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setIsDragOver(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleFileUpload(file)
            }}
            className={`flex flex-col items-center justify-center p-6 text-center rounded-xl transition-all cursor-pointer ${
              isDragOver ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-500 scale-[0.99]' : ''
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFileUpload(file)
                e.target.value = ''
              }}
            />

            <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3 shadow-xs">
              {isProcessing ? (
                <RefreshCw className="h-7 w-7 animate-spin" />
              ) : (
                <Upload className="h-7 w-7" />
              )}
            </div>

            <h3 className="text-base font-bold text-foreground">
              {isProcessing
                ? 'Analisando Planilha Resumo VLI...'
                : 'Carregar Planilha Relatório Resumo VLI (.xlsx)'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg mt-1">
              Arraste e solte o arquivo Excel exportado da VLI aqui ou clique para selecionar. O
              sistema agrupará os vagões, detectará desmembres por CNPJ Dest. e exportará o arquivo
              de desmembres automaticamente.
            </p>

            {isProcessing && (
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
                <span className="animate-pulse">
                  Identificando vagões e verificando divergências de CNPJ Dest...
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {errorMessage && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          {activeResult && (
            <Button
              size="sm"
              onClick={() => {
                if (activeResult.excelBase64) {
                  downloadBase64(activeResult.excelBase64, activeResult.outputFileName)
                } else {
                  exportVliExcelFile(
                    activeResult.allRows,
                    activeResult.desmembreRows,
                    activeResult.headers,
                    activeResult.metadata,
                    activeResult.outputFileName
                  )
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar Novamente
            </Button>
          )}
        </div>
      )}

      {/* Resultados e Análise */}
      {activeResult && (
        <div className="space-y-6">
          {/* Cartões KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                Composição / Trem
              </span>
              <div className="text-base font-extrabold text-foreground truncate">
                {activeResult.metadata.prefixoTrem || 'Não Identificado'}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono mt-0.5">
                <span>{activeResult.metadata.origem || 'Origem'}</span>
                <ArrowRight className="h-3 w-3 text-zinc-400" />
                <span>{activeResult.metadata.destino || 'Destino'}</span>
              </div>
            </Card>

            <Card className="p-4 border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                Total de Vagões
              </span>
              <div className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">
                {activeResult.totalUniqueWagons}
              </div>
              <span className="text-[10px] text-zinc-500">
                {activeResult.allRows.length} linha(s) de rateio
              </span>
            </Card>

            <Card className="p-4 border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
              <span className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400 block mb-1">
                Vagões c/ Desmembre
              </span>
              <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                {activeResult.desmembreCount}
              </div>
              <span className="text-[10px] text-amber-800 dark:text-amber-300">
                {activeResult.desmembreRows.length} registro(s) desmembrados
              </span>
            </Card>

            <Card className="p-4 border-zinc-200 dark:border-zinc-800">
              <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                Exportar Desmembres
              </span>
              <Button
                size="sm"
                onClick={() => {
                  if (activeResult.excelBase64) {
                    downloadBase64(activeResult.excelBase64, activeResult.outputFileName)
                  } else {
                    exportVliExcelFile(
                      activeResult.allRows,
                      activeResult.desmembreRows,
                      activeResult.headers,
                      activeResult.metadata,
                      activeResult.outputFileName
                    )
                  }
                }}
                className="w-full mt-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5 cursor-pointer shadow-xs"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar .XLSX
              </Button>
            </Card>
          </div>

          {/* Ocorrências por CNPJ Destinatário */}
          {activeResult.desmembreCount > 0 && (
            <Card className="border-sky-200 dark:border-sky-900/60 bg-sky-50/30 dark:bg-sky-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-sky-900 dark:text-sky-200 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-sky-600" />
                  Desmembres Detectados por CNPJ Destinatário
                </CardTitle>
                <CardDescription className="text-xs text-sky-700 dark:text-sky-300">
                  Total de vagões desmembrados com CNPJs distintos:{' '}
                  <strong>{activeResult.desmembreCount}</strong>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {Object.keys(activeResult.desmembreCnpjCount).length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-bold uppercase text-sky-800 dark:text-sky-300 block">
                      Ocorrências por CNPJ Dest.:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {Object.entries(activeResult.desmembreCnpjCount).map(([cnpj, count]) => (
                        <div
                          key={cnpj}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-sky-100 dark:border-sky-900 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <Building2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                            <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                              {cnpj}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold font-mono text-[11px] shrink-0">
                            {count}x
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Barra de Ações: Filtro Desmembres vs Todos + Campo de Pesquisa */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setViewFilter('desmembres')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewFilter === 'desmembres'
                    ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                }`}
              >
                Apenas Desmembres ({activeResult.desmembreRows.length})
              </button>
              <button
                type="button"
                onClick={() => setViewFilter('todos')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewFilter === 'todos'
                    ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                }`}
              >
                Todos os Registros ({activeResult.allRows.length})
              </button>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs flex-1 max-w-md">
              <Search className="h-4 w-4 text-zinc-400 ml-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por vagão, NFe, chave, CNPJ Dest..."
                className="w-full bg-transparent border-none text-xs text-foreground placeholder:text-zinc-400 focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-zinc-400 hover:text-foreground px-2 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Dados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>
                  {viewFilter === 'desmembres'
                    ? 'Vagões Desmembrados (CNPJ Dest. Divergentes)'
                    : 'Todos os Registros da Planilha VLI'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 font-normal">
                  {displayedRows.length} linha(s) exibida(s)
                </span>
              </h3>
              <span className="text-[11px] text-zinc-500 hidden sm:inline">
                Marque a caixa para sinalizar item conferido
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs max-h-[600px] custom-scrollbar">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-center w-10">Status</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Vagão</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">OS</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Tara</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Peso Líq.</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Peso (TB)</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">NFe</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Data NFe</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Peso NF</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Rateio</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Valor NF</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap">Chave NF</th>
                    <th className="px-4 py-3 text-left whitespace-nowrap bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                      CNPJ Dest.
                    </th>
                    {displayedRows.some((r) => r.destinatario) && (
                      <th className="px-4 py-3 text-left whitespace-nowrap">Destinatário</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  {displayedRows.length > 0 ? (
                    displayedRows.map((row, idx) => {
                      if (previousVagao !== row.vagao) {
                        currentGroupColor = 1 - currentGroupColor
                        previousVagao = row.vagao
                      }

                      const isCompleted = completedRows.includes(row.originalRowIndex)
                      const isDesmembre = activeResult.desmembreWagons.includes(row.vagao)
                      const rowBg = isCompleted
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                        : colorClasses[currentGroupColor]

                      return (
                        <tr key={idx} className={`${rowBg} transition-colors`}>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleRowCheck(row.originalRowIndex)}
                              className="cursor-pointer text-sky-600 dark:text-sky-400 hover:opacity-80"
                            >
                              {isCompleted ? (
                                <CheckSquare className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Square className="h-4 w-4 text-zinc-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-bold text-zinc-900 dark:text-zinc-100">
                            <div className="flex items-center gap-1.5">
                              <span>{row.vagao}</span>
                              {isDesmembre && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-sans font-semibold">
                                  Desmembre
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.os || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.tara || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.pesoLiquido || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.pesoBruto || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-zinc-800 dark:text-zinc-200">
                            {row.nfe || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                            {row.dataNfe || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.pesoNf || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-sky-700 dark:text-sky-300">
                            {row.rateio || '-'}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                            {row.valorNf || '-'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[280px] truncate" title={row.chaveNf}>
                            {row.chaveNf || '-'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap font-bold text-amber-900 dark:text-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100">
                              {row.cnpjDestFormatted || row.cnpjDest || '-'}
                            </span>
                          </td>
                          {displayedRows.some((r) => r.destinatario) && (
                            <td className="px-4 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                              {row.destinatario || '-'}
                            </td>
                          )}
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={14} className="text-center py-8 text-zinc-400">
                        Nenhum registro encontrado com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
