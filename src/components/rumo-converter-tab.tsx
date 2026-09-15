import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  BarChart3,
  History,
  TrainTrack,
  RefreshCw,
  AlertCircle,
  Clock,
  Layers,
  FileText,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  Building2,
  Scale,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getDatabaseInstance } from '@/lib/firebase-realtime'
import { ref, onValue, push, remove } from 'firebase/database'
import {
  RumoFileEntry,
  RumoExtractionResult,
  exportRumoExcelFile,
  processRumoExtractedText,
  generateRumoWorkbook,
  buildRumoExcelBase64,
} from '@/lib/rumo-pdf-parser'
import { extractPdfTextWithPdfJs } from '@/lib/client-pdf-parser'

const RUMO_STORAGE_KEY = 'rumo_conversor_historico_v1'

interface RumoConverterTabProps {
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
}

export const RumoConverterTab: React.FC<RumoConverterTabProps> = ({ onNotify }) => {
  // Sub-abas internas
  const [subTab, setSubTab] = useState<'conversao' | 'dashboard' | 'historico'>('conversao')

  // Estados de Upload e Processamento
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Dados da extração ativa
  const [activeResult, setActiveResult] = useState<RumoExtractionResult | null>(null)
  const [activeFileName, setActiveFileName] = useState<string | null>(null)
  const [activeFileBase64Excel, setActiveFileBase64Excel] = useState<string | null>(null)

  // Filtros de busca e controle de linhas concluídas (conferência)
  const [searchQuery, setSearchQuery] = useState('')
  const [completedDesmembreRows, setCompletedDesmembreRows] = useState<number[]>([])

  // Histórico de Envios
  const [historyFiles, setHistoryFiles] = useState<RumoFileEntry[]>([])

  // Dashboard de BI
  const [selectedTrainId, setSelectedTrainId] = useState<string>('')

  // 1. Carregar histórico do localStorage e sincronizar com Firebase Realtime Database
  useEffect(() => {
    // Carrega do localStorage primeiro (fallback instantâneo)
    try {
      const stored = localStorage.getItem(RUMO_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setHistoryFiles(parsed)
        }
      }
    } catch (e) {
      console.error('Erro ao ler histórico Rumo local:', e)
    }

    // Sincroniza com Firebase Realtime Database
    const db = getDatabaseInstance()
    if (db) {
      try {
        const filesRef = ref(db, 'rumo_files')
        const unsubscribe = onValue(
          filesRef,
          (snapshot) => {
            const data = snapshot.val()
            if (data && typeof data === 'object') {
              const list: RumoFileEntry[] = Object.keys(data).map((key) => ({
                id: key,
                ...data[key],
              }))
              list.sort(
                (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              )
              setHistoryFiles(list)
              try {
                localStorage.setItem(RUMO_STORAGE_KEY, JSON.stringify(list))
              } catch {
                // ignore quota
              }
            }
          },
          (err) => {
            console.warn('Conexão Firebase offline para rumo_files, usando storage local:', err)
          }
        )
        return () => unsubscribe()
      } catch (err) {
        console.warn('Erro ao configurar listener Firebase para rumo_files:', err)
      }
    }
  }, [])

  // 2. Salvar novo registro de trem no Firebase e LocalStorage
  const saveEntryToStorage = async (entry: Omit<RumoFileEntry, 'id'>) => {
    const localId = `rumo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const newEntry: RumoFileEntry = {
      id: localId,
      ...entry,
    }

    setHistoryFiles((prev) => {
      const updated = [newEntry, ...prev.filter((item) => item.name !== newEntry.name)]
      try {
        localStorage.setItem(RUMO_STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })

    // Sincroniza com Firebase se disponível
    const db = getDatabaseInstance()
    if (db) {
      try {
        const filesRef = ref(db, 'rumo_files')
        await push(filesRef, entry)
      } catch (err) {
        console.warn('Não foi possível persistir no Firebase rumo_files:', err)
      }
    }
  }

  // 3. Processar arquivo PDF (Client-First com Fallback de Servidor e Tratamento Seguro de JSON)
  const handlePdfUpload = async (file: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Por favor, selecione um arquivo no formato PDF de Composição Rumo.')
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    setCompletedDesmembreRows([])

    try {
      let extractionResult: RumoExtractionResult | null = null
      let excelBase64: string | null = null

      // ESTRATÉGIA 1: Extração Direta no Navegador (Client-Side First - 100% compatível com Vercel)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const { text } = await extractPdfTextWithPdfJs(arrayBuffer)

        if (text && text.trim().length > 30) {
          const clientResult = processRumoExtractedText(text, file.name)
          if (clientResult.aoaData && clientResult.aoaData.length > 1) {
            extractionResult = clientResult
            const wb = generateRumoWorkbook(
              clientResult.aoaData,
              clientResult.desmembreRows,
              clientResult.cnpjData
            )
            excelBase64 = buildRumoExcelBase64(wb)
          }
        }
      } catch (clientErr) {
        console.warn('Tentativa client-side de leitura do PDF falhou, tentando endpoint backend:', clientErr)
      }

      // ESTRATÉGIA 2: Fallback para o Endpoint /api/parse-rumo-pdf (se o client-side não extraiu registros)
      if (!extractionResult) {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const resultStr = reader.result as string
            resolve(resultStr.split(',')[1] || resultStr)
          }
          reader.onerror = (e) => reject(e)
          reader.readAsDataURL(file)
        })

        const response = await fetch('/api/parse-rumo-pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileBase64: base64Data,
            fileName: file.name,
          }),
        })

        const responseText = await response.text()
        let data: any = null
        if (responseText && responseText.trim().startsWith('{')) {
          try {
            data = JSON.parse(responseText)
          } catch (jsonErr) {
            console.warn('Erro ao parsear JSON da resposta:', jsonErr)
          }
        }

        if (!response.ok || !data || data.error) {
          throw new Error(
            data?.error ||
              `Falha na resposta do servidor (HTTP ${response.status}). Verifique se o arquivo é um PDF legível.`
          )
        }

        extractionResult = {
          aoaData: data.tableData || [],
          desmembreCount: data.desmembreCount || 0,
          desmembreRows: data.desmembreRows || [],
          desmembreRemetenteCount: data.desmembreRemetenteCount || {},
          cnpjData: data.cnpjData || [],
          prefixo: data.prefixo || null,
          trainName: data.trainName || null,
          outputFileName: data.fileName || 'resumo-composicao.xlsx',
          totalWagons: data.totalWagons || 0,
          totalWeightKg: data.totalWeightKg || 0,
        }
        excelBase64 = data.fileData || null
      }

      if (!extractionResult || !extractionResult.aoaData || extractionResult.aoaData.length <= 1) {
        throw new Error(
          'Não foi possível encontrar dados de vagões neste PDF. Verifique se o arquivo é um Resumo de Composição Rumo/TEAG.'
        )
      }

      setActiveResult(extractionResult)
      setActiveFileName(file.name)
      setActiveFileBase64Excel(excelBase64)

      // Salva no histórico local e Firebase Realtime
      await saveEntryToStorage({
        originalName: file.name,
        name: extractionResult.outputFileName,
        createdAt: new Date().toISOString(),
        prefixo: extractionResult.prefixo,
        trainName: extractionResult.trainName,
        desmembreCount: extractionResult.desmembreCount,
        desmembreRemetenteCount: extractionResult.desmembreRemetenteCount,
        tableData: extractionResult.aoaData,
        desmembreRows: extractionResult.desmembreRows,
        cnpjData: extractionResult.cnpjData,
      })

      // Download automático do Excel gerado
      if (excelBase64) {
        downloadBase64Excel(excelBase64, extractionResult.outputFileName)
      } else {
        exportRumoExcelFile(
          extractionResult.aoaData,
          extractionResult.desmembreRows,
          extractionResult.cnpjData,
          extractionResult.outputFileName
        )
      }

      setSuccessMessage(
        `Arquivo "${file.name}" processado com sucesso! Planilha "${extractionResult.outputFileName}" gerada com ${extractionResult.aoaData.length - 1} registro(s) e ${extractionResult.desmembreCount} desmembre(s).`
      )
      if (onNotify) {
        onNotify(`Composição Rumo extraída com sucesso!`, 'success')
      }
    } catch (err: any) {
      console.error('Erro no processamento do PDF Rumo:', err)
      setErrorMessage(err.message || 'Erro inesperado ao converter PDF.')
      if (onNotify) {
        onNotify(`Erro ao processar PDF: ${err.message}`, 'error')
      }
    } finally {
      setIsProcessing(false)
    }
  }

  // 4. Download de base64 Excel
  const downloadBase64Excel = (base64Data: string, fileName: string) => {
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

  // 5. Toggle de conferência de linhas de desmembre
  const handleToggleDesmembreCheck = (rowIndex: number) => {
    setCompletedDesmembreRows((prev) =>
      prev.includes(rowIndex) ? prev.filter((idx) => idx !== rowIndex) : [...prev, rowIndex]
    )
  }

  // 6. Dados tabulares filtrados
  const mainTableHeader = activeResult?.aoaData?.[0] || []
  const mainTableBody = activeResult?.aoaData?.slice(1) || []

  const desmembreHeader = activeResult?.desmembreRows?.[0] || []
  const desmembreBody = activeResult?.desmembreRows?.slice(1) || []

  const filteredMainBody = useMemo(() => {
    if (!searchQuery.trim()) return mainTableBody
    const q = searchQuery.toLowerCase()
    return mainTableBody.filter((row) =>
      row.some((cell) => cell && cell.toLowerCase().includes(q))
    )
  }, [mainTableBody, searchQuery])

  const filteredDesmembreBody = useMemo(() => {
    if (!searchQuery.trim()) return desmembreBody
    const q = searchQuery.toLowerCase()
    return desmembreBody.filter((row) =>
      row.some((cell) => cell && cell.toLowerCase().includes(q))
    )
  }, [desmembreBody, searchQuery])

  // Cores alternadas para desmembres
  let lastWagonId: string | null = null
  let colorIndex = 0
  const colorClasses = [
    'bg-amber-50/70 dark:bg-amber-950/20',
    'bg-blue-50/70 dark:bg-blue-950/20',
  ]

  // 7. Agregações para o Dashboard Operacional (Trens por mês, Vagões por Destinatário, Peso por Mês)
  const { monthlyData, monthlyWeightData, consigneeData, trainOptions } = useMemo(() => {
    if (historyFiles.length === 0) {
      return {
        monthlyData: [],
        monthlyWeightData: [],
        consigneeData: [],
        trainOptions: [],
      }
    }

    const monthlyTrainCounts: Record<string, number> = {}
    const consigneeTotalWagons: Record<string, number> = {}
    const monthlyWeight: Record<string, number> = {}

    historyFiles.forEach((file) => {
      const date = file.createdAt ? new Date(file.createdAt) : new Date()
      const month = date.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })
      monthlyTrainCounts[month] = (monthlyTrainCounts[month] || 0) + 1

      if (file.tableData && file.tableData.length > 1) {
        const header = file.tableData[0] || []
        const consigneeIndex = header.indexOf('Destinatário NF')
        const wagonIndex = header.indexOf('Vagão')
        const tuIndex = header.indexOf('TU')

        const wagonsInThisFileForConsignee: Record<string, Set<string>> = {}
        const uniqueWagonsInFileForWeight = new Map<string, number>()

        if (consigneeIndex > -1 && wagonIndex > -1) {
          file.tableData.slice(1).forEach((row) => {
            const consignee = row[consigneeIndex]?.trim()
            const wagon = row[wagonIndex]?.trim()
            if (consignee && wagon) {
              if (!wagonsInThisFileForConsignee[consignee]) {
                wagonsInThisFileForConsignee[consignee] = new Set<string>()
              }
              wagonsInThisFileForConsignee[consignee].add(wagon)
            }
          })
        }

        if (wagonIndex > -1 && tuIndex > -1) {
          file.tableData.slice(1).forEach((row) => {
            const wagon = row[wagonIndex]?.trim()
            const pesoStr = row[tuIndex]?.trim()
            if (wagon && pesoStr) {
              const peso = parseFloat(pesoStr.replace(/\./g, '').replace(',', '.'))
              if (!isNaN(peso)) {
                uniqueWagonsInFileForWeight.set(wagon, peso)
              }
            }
          })
        }

        for (const consignee in wagonsInThisFileForConsignee) {
          const uniqueWagonCountForFile = wagonsInThisFileForConsignee[consignee].size
          consigneeTotalWagons[consignee] =
            (consigneeTotalWagons[consignee] || 0) + uniqueWagonCountForFile
        }

        let totalWeightForFile = 0
        for (const peso of uniqueWagonsInFileForWeight.values()) {
          totalWeightForFile += peso
        }
        monthlyWeight[month] = (monthlyWeight[month] || 0) + totalWeightForFile
      }
    })

    const monthly = Object.entries(monthlyTrainCounts).map(([month, trens]) => ({
      month,
      trens,
    }))

    const weightData = Object.entries(monthlyWeight).map(([month, pesoKg]) => ({
      month,
      peso: parseFloat((pesoKg / 1000).toFixed(2)), // em Toneladas
    }))

    const consignee = Object.entries(consigneeTotalWagons)
      .map(([name, totalCount]) => ({
        name: name.length > 25 ? `${name.substring(0, 23)}...` : name,
        fullName: name,
        value: totalCount,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15) // Top 15 destinatários para visualização limpa

    const options = historyFiles.map((f) => ({
      id: f.id,
      name: f.name || f.originalName,
      createdAt: f.createdAt,
      totalWagons: f.tableData ? f.tableData.length - 1 : 0,
    }))

    return {
      monthlyData: monthly,
      monthlyWeightData: weightData,
      consigneeData: consignee,
      trainOptions: options,
    }
  }, [historyFiles])

  // Detalhes de vagões do trem selecionado no dropdown de análise
  const selectedTrainWagonData = useMemo(() => {
    if (!selectedTrainId) return []
    const train = historyFiles.find((f) => f.id === selectedTrainId)
    if (!train || !train.tableData || train.tableData.length <= 1) return []

    const header = train.tableData[0] || []
    const wagonIndex = header.indexOf('Vagão')
    const consigneeIndex = header.indexOf('Destinatário NF')
    const nfIndex = header.indexOf('Nota Fiscal (NF)')
    const tuIndex = header.indexOf('TU')
    const mercadoriaIndex = header.indexOf('Mercadoria')

    return train.tableData.slice(1).map((row, idx) => ({
      index: idx + 1,
      wagon: row[wagonIndex] || '-',
      consignee: row[consigneeIndex] || 'Não Informado',
      nf: row[nfIndex] || '-',
      peso: row[tuIndex] ? `${row[tuIndex]} kg` : '-',
      mercadoria: row[mercadoriaIndex] || '-',
    }))
  }, [selectedTrainId, historyFiles])

  // 8. Re-carregar um envio anterior para o painel principal
  const handleLoadHistoricFile = (file: RumoFileEntry) => {
    setActiveResult({
      aoaData: file.tableData || [],
      desmembreCount: file.desmembreCount || (file.desmembreRows ? file.desmembreRows.length - 1 : 0),
      desmembreRows: file.desmembreRows || [],
      desmembreRemetenteCount: file.desmembreRemetenteCount || {},
      cnpjData: file.cnpjData || [],
      prefixo: file.prefixo || null,
      trainName: file.trainName || null,
      outputFileName: file.name || 'resumo-composicao.xlsx',
      totalWagons: file.tableData ? file.tableData.length - 1 : 0,
      totalWeightKg: 0,
    })
    setActiveFileName(file.originalName)
    setSubTab('conversao')
    setSuccessMessage(`Composição "${file.name}" carregada no painel para análise.`)
  }

  // 9. Re-exportar Excel de um envio do histórico
  const handleExportHistoric = (file: RumoFileEntry) => {
    exportRumoExcelFile(file.tableData, file.desmembreRows, file.cnpjData, file.name)
    if (onNotify) {
      onNotify(`Download do arquivo "${file.name}" iniciado.`, 'success')
    }
  }

  // 10. Excluir item do histórico
  const handleDeleteHistoric = async (id: string) => {
    setHistoryFiles((prev) => {
      const updated = prev.filter((f) => f.id !== id)
      try {
        localStorage.setItem(RUMO_STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // ignore
      }
      return updated
    })

    const db = getDatabaseInstance()
    if (db) {
      try {
        const itemRef = ref(db, `rumo_files/${id}`)
        await remove(itemRef)
      } catch (e) {
        console.warn('Erro ao remover do Firebase:', e)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner / Cabeçalho da Aba */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs transition-all">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 shrink-0">
              <TrainTrack className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-foreground tracking-tight">
                  Conversor Resumo Rumo
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  PDF para Excel + BI
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  TEAG & Baltech
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Extração inteligente de composições ferroviárias, conferência e identificação de
                desmembres com geração de planilhas e dashboard operacional.
              </p>
            </div>
          </div>

          {/* Sub-menu de navegação interna */}
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800/80 p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60 self-start md:self-auto">
            <button
              onClick={() => setSubTab('conversao')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                subTab === 'conversao'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Conversão & Desmembres</span>
            </button>

            <button
              onClick={() => setSubTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                subTab === 'dashboard'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Dashboard BI</span>
            </button>

            <button
              onClick={() => setSubTab('historico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                subTab === 'historico'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Últimos Envios</span>
              {historyFiles.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-600">
                  {historyFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-ABA 1: CONVERSÃO & DESMEMBRES                                         */}
      {/* ========================================================================= */}
      {subTab === 'conversao' && (
        <div className="space-y-6">
          {/* Caixa de Upload Drag & Drop */}
          <Card className="border-dashed border-2 border-indigo-200 dark:border-indigo-900/60 bg-white/60 dark:bg-zinc-900/60 hover:border-indigo-400 transition-all">
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
                  if (file) handlePdfUpload(file)
                }}
                className={`flex flex-col items-center justify-center p-6 text-center rounded-xl transition-all cursor-pointer ${
                  isDragOver
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 scale-[0.99]'
                    : ''
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handlePdfUpload(file)
                    e.target.value = ''
                  }}
                />

                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-xs">
                  {isProcessing ? (
                    <RefreshCw className="h-7 w-7 animate-spin" />
                  ) : (
                    <Upload className="h-7 w-7" />
                  )}
                </div>

                <h3 className="text-base font-bold text-foreground">
                  {isProcessing
                    ? 'Processando Composição Ferroviária...'
                    : 'Carregar PDF de Composição Rumo'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mt-1">
                  Arraste e solte o arquivo PDF aqui ou clique para selecionar. O sistema extrairá
                  todos os vagões, CT-e, pesos, desmembres e gerará a planilha Excel (.xlsx).
                </p>

                {isProcessing && (
                  <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    <span className="animate-pulse">Extraindo tabelas e gerando Excel...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mensagens de Alerta / Sucesso */}
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
              {activeFileBase64Excel && activeResult && (
                <Button
                  size="sm"
                  onClick={() =>
                    downloadBase64Excel(activeFileBase64Excel, activeResult.outputFileName)
                  }
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 gap-1.5 cursor-pointer shadow-xs self-start sm:self-auto"
                >
                  <Download className="h-3.5 w-3.5" />
                  Baixar Excel Novamente
                </Button>
              )}
            </div>
          )}

          {/* Painel com Dados Extraídos */}
          {activeResult && (
            <div className="space-y-6">
              {/* KPIs da Composição */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4 border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                    Composição / Trem
                  </span>
                  <div className="text-base font-extrabold text-foreground truncate">
                    {activeResult.trainName || activeResult.prefixo || 'Não Identificado'}
                  </div>
                  {activeResult.prefixo && (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      OS: {activeResult.prefixo}
                    </span>
                  )}
                </Card>

                <Card className="p-4 border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                    Total de Vagões
                  </span>
                  <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    {activeResult.totalWagons}
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    {activeResult.aoaData.length - 1} registro(s) no total
                  </span>
                </Card>

                <Card className="p-4 border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
                  <span className="text-[11px] font-bold uppercase text-amber-700 dark:text-amber-400 block mb-1">
                    Desmembres Detectados
                  </span>
                  <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                    {activeResult.desmembreCount}
                  </div>
                  <span className="text-[10px] text-amber-800 dark:text-amber-300">
                    {activeResult.desmembreRows.length > 1
                      ? `${activeResult.desmembreRows.length - 1} ocorrência(s)`
                      : 'Nenhum desmembre'}
                  </span>
                </Card>

                <Card className="p-4 border-zinc-200 dark:border-zinc-800">
                  <span className="text-[11px] font-bold uppercase text-zinc-400 block mb-1">
                    Exportação Excel
                  </span>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (activeFileBase64Excel) {
                        downloadBase64Excel(activeFileBase64Excel, activeResult.outputFileName)
                      } else {
                        exportRumoExcelFile(
                          activeResult.aoaData,
                          activeResult.desmembreRows,
                          activeResult.cnpjData,
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

              {/* Resumo de Desmembres */}
              {activeResult.desmembreCount > 0 && (
                <Card className="border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-indigo-600" />
                      Resumo de Desmembres da Composição
                    </CardTitle>
                    <CardDescription className="text-xs text-indigo-700 dark:text-indigo-300">
                      Total de vagões desmembrados: <strong>{activeResult.desmembreCount}</strong>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {activeResult.desmembreRemetenteCount &&
                      Object.keys(activeResult.desmembreRemetenteCount).length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-bold uppercase text-indigo-800 dark:text-indigo-300 block">
                            Ocorrências por Remetente:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {Object.entries(activeResult.desmembreRemetenteCount).map(
                              ([remetente, count]) => (
                                <div
                                  key={remetente}
                                  className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-indigo-100 dark:border-indigo-900 text-xs shadow-2xs"
                                >
                                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                                    {remetente}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold font-mono text-[11px] shrink-0">
                                    {count}x
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
              )}

              {/* Barra de Pesquisa Geral */}
              <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                <Search className="h-4 w-4 text-zinc-400 ml-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por vagão, nota fiscal, chave NFE, remetente, destinatário..."
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

              {/* Tabela de Detalhes dos Desmembres com Checkbox de Conferência */}
              {desmembreBody.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <span>Detalhes dos Desmembres</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-normal">
                        {filteredDesmembreBody.length} item(ns)
                      </span>
                    </h3>
                    <span className="text-[11px] text-zinc-500">
                      Marque a caixa para sinalizar vagão conferido
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 uppercase text-[10px] font-bold tracking-wider">
                        <tr>
                          <th className="px-4 py-3 text-left whitespace-nowrap">Concluído</th>
                          {desmembreHeader.map((col, idx) => (
                            <th key={idx} className="px-4 py-3 text-left whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                        {filteredDesmembreBody.length > 0 ? (
                          filteredDesmembreBody.map((row, rowIndex) => {
                            const currentWagonId = row[0]
                            if (rowIndex === 0 || currentWagonId !== lastWagonId) {
                              if (rowIndex > 0) colorIndex = 1 - colorIndex
                              lastWagonId = currentWagonId
                            }

                            const isCompleted = completedDesmembreRows.includes(rowIndex)
                            const rowBg = isCompleted
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                              : colorClasses[colorIndex]

                            return (
                              <tr key={rowIndex} className={`${rowBg} transition-colors`}>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDesmembreCheck(rowIndex)}
                                    className="cursor-pointer text-indigo-600 dark:text-indigo-400 hover:opacity-80"
                                  >
                                    {isCompleted ? (
                                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                      <Square className="h-4 w-4 text-zinc-400" />
                                    )}
                                  </button>
                                </td>
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={cellIndex}
                                    className={`px-4 py-2.5 whitespace-nowrap ${
                                      isCompleted
                                        ? 'text-zinc-400 line-through'
                                        : cellIndex === 0
                                          ? 'font-bold text-zinc-900 dark:text-zinc-100'
                                          : 'text-zinc-700 dark:text-zinc-300'
                                    }`}
                                  >
                                    {cell || '-'}
                                  </td>
                                ))}
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={desmembreHeader.length + 1}
                              className="text-center py-6 text-zinc-400"
                            >
                              Nenhum desmembre encontrado com o filtro aplicado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tabela de Todos os Dados Extraídos */}
              {mainTableBody.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <span>Todos os Dados Extraídos da Composição</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-normal">
                        {filteredMainBody.length} de {mainTableBody.length} linha(s)
                      </span>
                    </h3>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs max-h-[600px] custom-scrollbar">
                    <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                        <tr>
                          {mainTableHeader.map((col, idx) => (
                            <th key={idx} className="px-4 py-3 text-left whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {filteredMainBody.length > 0 ? (
                          filteredMainBody.map((row, rowIndex) => (
                            <tr
                              key={rowIndex}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                            >
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className={`px-4 py-2.5 whitespace-nowrap ${
                                    cellIndex === 1
                                      ? 'font-mono font-bold text-indigo-600 dark:text-indigo-400'
                                      : 'text-zinc-700 dark:text-zinc-300'
                                  }`}
                                >
                                  {cell || '-'}
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={mainTableHeader.length}
                              className="text-center py-6 text-zinc-400"
                            >
                              Nenhum resultado encontrado para a pesquisa.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 2: DASHBOARD OPERACIONAL BI                                       */}
      {/* ========================================================================= */}
      {subTab === 'dashboard' && (
        <div className="space-y-6">
          {historyFiles.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-2 border-zinc-200 dark:border-zinc-800">
              <BarChart3 className="h-10 w-10 text-zinc-400 mx-auto mb-2" />
              <h3 className="text-base font-bold text-foreground">Nenhum trem registrado ainda</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Faça o upload do primeiro PDF de composição ferroviária na aba "Conversão &
                Desmembres" para alimentar as métricas do dashboard operacional.
              </p>
              <Button
                size="sm"
                onClick={() => setSubTab('conversao')}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs cursor-pointer"
              >
                Fazer Upload de Composição
              </Button>
            </Card>
          ) : (
            <>
              {/* Gráficos em Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico 1: Trens por Mês */}
                <Card className="lg:col-span-2 border-zinc-200 dark:border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <TrainTrack className="h-4 w-4 text-indigo-600" />
                        Trens Processados por Mês
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">
                        Total: {historyFiles.length} trens
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={monthlyData}
                          margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            formatter={(val) => [`${val} trem(ns)`, 'Trens']}
                            contentStyle={{
                              borderRadius: '8px',
                              fontSize: '12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                            }}
                          />
                          <Bar
                            dataKey="trens"
                            fill="#4F46E5"
                            radius={[6, 6, 0, 0]}
                            name="Nº de Trens"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Gráfico 2: Vagões por Destinatário */}
                <Card className="border-zinc-200 dark:border-zinc-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                        Vagões por Destinatário (Geral)
                      </span>
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      Vagões únicos por trem somados
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={consigneeData}
                          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip
                            formatter={(val, _, props) => [
                              `${val} vagões`,
                              props.payload.fullName || 'Destinatário',
                            ]}
                            contentStyle={{
                              borderRadius: '8px',
                              fontSize: '12px',
                              backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            }}
                          />
                          <Bar
                            dataKey="value"
                            fill="#00C49F"
                            radius={[0, 6, 6, 0]}
                            name="Nº de Vagões"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Gráfico 3: Peso Líquido Total por Mês (Toneladas) */}
              <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-amber-600" />
                      Peso Líquido Total por Mês (Toneladas)
                    </span>
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Soma de TU sem duplicidade de vagão na mesma composição
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlyWeightData}
                        margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(val: any) => [
                            `${Number(val).toLocaleString('pt-BR')} t`,
                            'Peso Total',
                          ]}
                          contentStyle={{
                            borderRadius: '8px',
                            fontSize: '12px',
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          }}
                        />
                        <Bar
                          dataKey="peso"
                          fill="#FF8042"
                          radius={[6, 6, 0, 0]}
                          name="Peso (t)"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Seletor Interativo: Análise de Destinatários por Trem */}
              <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrainTrack className="h-4 w-4 text-indigo-600" />
                    Análise Detalhada de Destinatários por Trem
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Selecione uma composição específica para inspecionar os vagões e seus
                    destinatários
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="w-full md:w-1/2">
                    <select
                      value={selectedTrainId}
                      onChange={(e) => setSelectedTrainId(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Selecione um trem para inspecionar...</option>
                      {trainOptions.map((train) => (
                        <option key={train.id} value={train.id}>
                          {train.name} ({train.totalWagons} registros -{' '}
                          {new Date(train.createdAt).toLocaleDateString('pt-BR')})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedTrainId && selectedTrainWagonData.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 max-h-[400px] custom-scrollbar">
                      <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 uppercase text-[10px] font-bold sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-left">#</th>
                            <th className="px-4 py-3 text-left">Vagão</th>
                            <th className="px-4 py-3 text-left">Destinatário NF</th>
                            <th className="px-4 py-3 text-left">Nota Fiscal</th>
                            <th className="px-4 py-3 text-left">Peso (TU)</th>
                            <th className="px-4 py-3 text-left">Mercadoria</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                          {selectedTrainWagonData.map((item) => (
                            <tr
                              key={item.index}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            >
                              <td className="px-4 py-2 font-mono text-zinc-400">{item.index}</td>
                              <td className="px-4 py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {item.wagon}
                              </td>
                              <td className="px-4 py-2 font-medium text-zinc-800 dark:text-zinc-200">
                                {item.consignee}
                              </td>
                              <td className="px-4 py-2 font-mono text-zinc-600 dark:text-zinc-400">
                                {item.nf}
                              </td>
                              <td className="px-4 py-2 font-mono text-zinc-600 dark:text-zinc-400">
                                {item.peso}
                              </td>
                              <td className="px-4 py-2 text-zinc-500">{item.mercadoria}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-ABA 3: ÚLTIMOS ENVIOS (HISTÓRICO)                                     */}
      {/* ========================================================================= */}
      {subTab === 'historico' && (
        <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-indigo-600" />
                Últimos Envios & Histórico de Composições
              </CardTitle>
              <CardDescription className="text-xs">
                Todos os arquivos processados e salvos para consulta e download imediato do Excel
              </CardDescription>
            </div>
            {historyFiles.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('Deseja limpar o histórico local de envios do Conversor Rumo?')) {
                    setHistoryFiles([])
                    localStorage.removeItem(RUMO_STORAGE_KEY)
                  }
                }}
                className="text-xs text-red-600 hover:text-red-700 h-8 cursor-pointer gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar Histórico Local
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {historyFiles.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-xs">
                Nenhum arquivo enviado até o momento.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-300 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-3 px-4 text-left">Arquivo Original</th>
                      <th className="py-3 px-4 text-left">Nome do Excel Gerado</th>
                      <th className="py-3 px-4 text-left">Data de Envio</th>
                      <th className="py-3 px-4 text-left">Vagões / Desmembres</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {historyFiles.map((file) => (
                      <tr
                        key={file.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                          <span className="truncate max-w-[200px]">{file.originalName}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-300">
                          {file.name}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                          {file.createdAt
                            ? new Date(file.createdAt).toLocaleString('pt-BR')
                            : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-bold">
                              {file.tableData ? file.tableData.length - 1 : 0} reg.
                            </span>
                            {file.desmembreCount && file.desmembreCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                {file.desmembreCount} desmembres
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleLoadHistoricFile(file)}
                              className="h-7 text-[11px] px-2.5 gap-1 cursor-pointer"
                              title="Visualizar tabelas no painel"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Visualizar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleExportHistoric(file)}
                              className="h-7 text-[11px] px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
                              title="Baixar arquivo Excel (.xlsx)"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Exportar Excel
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteHistoric(file.id)}
                              className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600 cursor-pointer"
                              title="Remover do histórico"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
