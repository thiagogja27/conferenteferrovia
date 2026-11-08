import React, { useState, useMemo, useRef } from 'react'
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
  Eye,
  Layers,
  Sparkles,
  FileCheck,
  FileDown,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ResumoItem,
  SobreRodasRow,
  ConfrontoResultItem,
  ConfrontoSummary,
  extractResumoItemsFromAoa,
  parseSobreRodasExcel,
  executeConfronto,
  exportConfrontoExcel,
  exportConfrontoPdf,
  filterSobreRodasRowsByArrival,
} from '@/lib/confronto-sobre-rodas-service'

interface ConfrontoSobreRodasViewProps {
  aoaData: string[][]
  trainName?: string | null
  prefixo?: string | null
  outputFileName?: string
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
  arrivalCutoff?: string
}

export const ConfrontoSobreRodasView: React.FC<ConfrontoSobreRodasViewProps> = ({
  aoaData,
  trainName,
  prefixo,
  outputFileName,
  onNotify,
  arrivalCutoff,
}) => {
  const [sobreRodasFile, setSobreRodasFile] = useState<{ name: string; rows: SobreRodasRow[] } | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [filterMode, setFilterMode] = useState<'todos' | 'desmembres' | 'divergentes' | 'batidos'>('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Extrair itens da composição do Resumo Rumo
  const resumoItems = useMemo(() => {
    return extractResumoItemsFromAoa(aoaData)
  }, [aoaData])

  // Executar confronto quando a planilha Sobre Rodas for carregada
  const confrontoData = useMemo(() => {
    if (!sobreRodasFile || !resumoItems.length) return null
    const filteredRows = arrivalCutoff
      ? filterSobreRodasRowsByArrival(sobreRodasFile.rows, arrivalCutoff)
      : sobreRodasFile.rows
    return executeConfronto(resumoItems, filteredRows)
  }, [resumoItems, sobreRodasFile, arrivalCutoff])

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
          'Nenhum registro reconhecido na planilha Sobre Rodas. Verifique se o arquivo possui as colunas de Placa, NFE e Rateio.',
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
        `Planilha Sobre Rodas "${file.name}" carregada com sucesso (${parsedRows.length} linhas)!`,
        'success'
      )
    } catch (err: any) {
      console.error('Erro ao ler planilha Sobre Rodas:', err)
      onNotify?.(`Erro ao ler planilha Sobre Rodas: ${err?.message || 'Arquivo corrompido ou ilegível'}`, 'error')
    } finally {
      setIsParsing(false)
    }
  }

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
  const getExportBaseName = () =>
    trainName || prefixo || outputFileName || 'confronto_sobre_rodas'

  const handleExportExcel = async () => {
    if (!confrontoData || confrontoData.items.length === 0) return
    await exportConfrontoExcel(confrontoData.items, getExportBaseName())
    onNotify?.('Planilha de Confronto exportada com sucesso (.xlsx)!', 'success')
  }

  const handleExportPdf = () => {
    if (!confrontoData || confrontoData.items.length === 0) return
    exportConfrontoPdf(confrontoData.items, getExportBaseName())
    onNotify?.('Relatório de Confronto exportado com sucesso (.pdf)!', 'success')
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Confronto */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">
              Confronto: Resumo Composição vs. Estoque Sobre Rodas
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
              Placa · NFE · Rateio
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Confronta automaticamente os vagões, notas e rateios extraídos do resumo com a matriz do Sobre Rodas.
          </p>
        </div>

        {confrontoData && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSobreRodasFile(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-xs h-8 cursor-pointer gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Trocar Planilha
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportPdf}
              className="text-xs h-8 cursor-pointer gap-1.5 shadow-xs border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
            >
              <FileDown className="h-3.5 w-3.5" />
              Exportar PDF
            </Button>
            <Button
              size="sm"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 cursor-pointer gap-1.5 shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Confronto (.xlsx)
            </Button>
          </div>
        )}
      </div>

      {/* Seção de Upload da Planilha Sobre Rodas se ainda não carregada */}
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
                Faça o upload do Excel exportado pelo terminal contendo as colunas de Placa, NFE, Rateio e dados de exportação para cruzar com o Resumo Rumo.
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
      ) : (
        confrontoData && (
          <div className="space-y-4">
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
                  Ausentes no Sobre Rodas
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

                      // Destaque visual: se for 100% OK fica neutro/limpo, se divergente destaca levemente em vermelho/amarelo
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
                        Nenhum registro encontrado com os filtros selecionados.
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
