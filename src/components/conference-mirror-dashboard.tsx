import React, { useState, useMemo, useEffect } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Package,
  Building2,
  MapPin,
  Truck,
  TrendingUp,
  Download,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  History,
  Radio,
  Clock,
  User,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  TrainFront,
  TrainTrack,
  Folder,
  MousePointerClick,
  RefreshCw,
  Trash2,
  Maximize2,
  Info,
  Layers,
  ArrowUpDown,
  Loader2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  type ConferenceDashboardSnapshot,
  type ConferenceNoteSummary,
  type VagaoTransbordoSummary,
  type ChartCategoryItem,
  subscribeToLatestConferenceDashboard,
  subscribeToConferenceDashboardHistory,
  deleteConferenceDashboardSession,
  deleteLiveConferenceDashboard,
  clearConferenceDashboardHistory,
} from '@/lib/conference-dashboard-sync'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const PIE_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#3b82f6',
  '#14b8a6',
  '#f97316',
  '#84cc16',
]

interface SelectedGroupModal {
  category: string
  fullName: string
  notes: ConferenceNoteSummary[]
}

interface DeleteConfirmationState {
  type: 'live' | 'session' | 'all'
  id: string
  title: string
  operator?: string
  date?: string
  notasCount?: number
}

export function ConferenceMirrorDashboard() {
  const [latestLiveSnapshot, setLatestLiveSnapshot] = useState<ConferenceDashboardSnapshot | null>(null)
  const [historyList, setHistoryList] = useState<ConferenceDashboardSnapshot[]>([])
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | 'LIVE'>('LIVE')
  const [isLiveMode, setIsLiveMode] = useState<boolean>(true)
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false)

  // Estado para confirmação de exclusão em modal (sem window.confirm)
  const [confirmDelete, setConfirmDelete] = useState<DeleteConfirmationState | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null)

  // Filtros de busca no histórico
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('')
  const [historyOperatorFilter, setHistoryOperatorFilter] = useState<string>('all')

  // Filtros e busca de notas na tabela
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('')
  const [divergenceFilter, setDivergenceFilter] = useState<'all' | 'divergent' | 'ok'>('all')

  // Estado para o Modal Interativo de Clique nos Gráficos (Drilldown)
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroupModal | null>(null)
  const [modalSearch, setModalSearch] = useState<string>('')
  const [expandedNoteIndex, setExpandedNoteIndex] = useState<number | null>(null)

  // Modal para exibir a DANFE / ficha completa de uma nota específica
  const [viewingNote, setViewingNote] = useState<ConferenceNoteSummary | null>(null)

  // Inscrição em tempo real ao último dashboard gerado e ao histórico
  useEffect(() => {
    const unsubLatest = subscribeToLatestConferenceDashboard((snap) => {
      setLatestLiveSnapshot(snap)
    })

    const unsubHistory = subscribeToConferenceDashboardHistory((hist) => {
      setHistoryList(hist)
    })

    return () => {
      unsubLatest()
      unsubHistory()
    }
  }, [])

  // Snapshot ativo para visualização: Ao Vivo ou uma sessão histórica selecionada
  const activeSnapshot: ConferenceDashboardSnapshot | null = useMemo(() => {
    if (selectedSnapshotId === 'LIVE' || isLiveMode) {
      return latestLiveSnapshot
    }
    const found = historyList.find((h) => h.id === selectedSnapshotId)
    return found || null
  }, [isLiveMode, selectedSnapshotId, latestLiveSnapshot, historyList])

  // Executa a exclusão solicitada no modal
  const handleExecuteDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      if (confirmDelete.type === 'live') {
        await deleteLiveConferenceDashboard()
        setLatestLiveSnapshot(null)
        setSelectedSnapshotId('LIVE')
        setIsLiveMode(true)
        setDeleteSuccessMessage('Espelho ao vivo excluído com sucesso!')
      } else if (confirmDelete.type === 'session') {
        await deleteConferenceDashboardSession(confirmDelete.id)
        if (selectedSnapshotId === confirmDelete.id) {
          setSelectedSnapshotId('LIVE')
          setIsLiveMode(true)
        }
        setDeleteSuccessMessage('Sessão histórica excluída com sucesso!')
      } else if (confirmDelete.type === 'all') {
        await clearConferenceDashboardHistory()
        setLatestLiveSnapshot(null)
        setHistoryList([])
        setSelectedSnapshotId('LIVE')
        setIsLiveMode(true)
        setDeleteSuccessMessage('Todos os espelhos foram removidos com sucesso!')
      }
    } catch (err) {
      console.error('Erro ao excluir espelho de conferência:', err)
    } finally {
      setIsDeleting(false)
      setConfirmDelete(null)
      setTimeout(() => {
        setDeleteSuccessMessage(null)
      }, 4000)
    }
  }

  // Lista de operadores disponíveis no histórico para o filtro
  const availableOperators = useMemo(() => {
    const ops = new Set<string>()
    historyList.forEach((h) => {
      if (h.operatorName) ops.add(h.operatorName)
    })
    return Array.from(ops)
  }, [historyList])

  // Histórico filtrado
  const filteredHistory = useMemo(() => {
    return historyList.filter((h) => {
      if (historyOperatorFilter !== 'all' && h.operatorName !== historyOperatorFilter) {
        return false
      }
      if (!historySearchQuery.trim()) return true
      const q = historySearchQuery.toLowerCase()
      return (
        (h.title && h.title.toLowerCase().includes(q)) ||
        (h.operatorName && h.operatorName.toLowerCase().includes(q)) ||
        (h.dateFormatted && h.dateFormatted.includes(q)) ||
        (Array.isArray(h.vagoesPorTransbordo) && h.vagoesPorTransbordo.some((t) => t?.fullName && t.fullName.toLowerCase().includes(q))) ||
        (Array.isArray(h.destinatarios) && h.destinatarios.some((d) => d?.fullName && d.fullName.toLowerCase().includes(q)))
      )
    })
  }, [historyList, historyOperatorFilter, historySearchQuery])

  // Notas filtradas da tabela principal do snapshot ativo
  const filteredNotes = useMemo(() => {
    if (!activeSnapshot || !Array.isArray(activeSnapshot.notes)) return []
    return activeSnapshot.notes.filter((n) => {
      if (!n) return false
      if (divergenceFilter === 'divergent' && !n.isDivergentCNPJ) return false
      if (divergenceFilter === 'ok' && n.isDivergentCNPJ) return false

      if (!tableSearchQuery.trim()) return true
      const q = tableSearchQuery.toLowerCase()
      return (
        (n.numero && n.numero.toLowerCase().includes(q)) ||
        (n.chave && n.chave.toLowerCase().includes(q)) ||
        (n.emitNome && n.emitNome.toLowerCase().includes(q)) ||
        (n.destNome && n.destNome.toLowerCase().includes(q)) ||
        (n.produto && n.produto.toLowerCase().includes(q)) ||
        (n.terminal && n.terminal.toLowerCase().includes(q)) ||
        (n.transbordo && n.transbordo.toLowerCase().includes(q)) ||
        (n.allVagoesStr && n.allVagoesStr.toLowerCase().includes(q)) ||
        (n.destCNPJ && n.destCNPJ.toLowerCase().includes(q)) ||
        (n.placa && n.placa.toLowerCase().includes(q))
      )
    })
  }, [activeSnapshot, tableSearchQuery, divergenceFilter])

  // Manipulador de clique interativo nos gráficos
  const handleChartClick = (category: string, item: any) => {
    if (!activeSnapshot || !Array.isArray(activeSnapshot.notes)) return

    let matchingNotes: ConferenceNoteSummary[] = []
    const itemName = item?.fullName || item?.name || ''

    if (category === 'Produto') {
      matchingNotes = activeSnapshot.notes.filter((n) => n.produto === item?.fullName || n.produto === item?.name)
    } else if (category === 'Destinatário') {
      matchingNotes = activeSnapshot.notes.filter((n) => {
        if (item?.destCNPJ && n.destCNPJ) {
          return n.destCNPJ === item.destCNPJ
        }
        return n.destNome === item?.destNome || n.destNome === item?.name
      })
    } else if (category === 'Terminal de Entrega') {
      matchingNotes = activeSnapshot.notes.filter((n) => n.terminal === item?.fullName || n.terminal === item?.name)
    } else if (category === 'Transbordo') {
      matchingNotes = activeSnapshot.notes.filter((n) => n.transbordo === item?.fullName || n.transbordo === item?.name)
    } else if (category === 'Vagões no Transbordo') {
      matchingNotes = activeSnapshot.notes.filter(
        (n) => (n.transbordo === item?.transbordo || n.transbordo === item?.fullName) && Array.isArray(n.vagoes) && n.vagoes.length > 0
      )
    }

    if (matchingNotes.length > 0) {
      setSelectedGroup({
        category,
        fullName: itemName || category,
        notes: matchingNotes,
      })
      setModalSearch('')
      setExpandedNoteIndex(null)
    }
  }

  // Exportação para Excel (.xlsx) das notas do modal de drilldown
  const exportModalToExcel = () => {
    if (!selectedGroup) return
    const exportData = (selectedGroup.notes || []).map((n) => {
      const chaveCnpj = n.chave && n.chave.length === 44 
        ? n.chave.substring(6, 20).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') 
        : 'N/I'

      return {
        Número: n.numero,
        Série: n.serie,
        'Data Emissão': n.dataEmissao,
        'Chave de Acesso': n.chave,
        'CNPJ na Chave': chaveCnpj,
        'Destinatário CNPJ': n.destCNPJ,
        'Destinatário': n.destNome,
        'Confronto Chave x Destinatário': n.confrontoChaveXDest,
        Emitente: n.emitNome,
        'CNPJ Emitente': n.emitCNPJ,
        Produto: n.produto,
        'Terminal Entrega': n.terminal,
        Transbordo: n.transbordo,
        'Vagão(ões)': n.allVagoesStr || '-',
        'Peso Bruto (kg)': n.pesoNum,
        'Valor Total (R$)': n.valorNum,
        'Placa Veículo': n.placa || '-',
        'Info Complementar': n.infCpl || '-',
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Notas do Gráfico')
    const cleanName = (selectedGroup.fullName || 'grupo').replace(/[/\\?%*:|"<>]/g, '_').substring(0, 20)
    XLSX.writeFile(wb, `espelho_notas_${(selectedGroup.category || 'dados').toLowerCase()}_${cleanName}.xlsx`)
  }

  // Exportação completa da sessão de dashboard ativa
  const exportFullSessionToExcel = () => {
    if (!activeSnapshot) return
    const exportData = (activeSnapshot.notes || []).map((n) => {
      const chaveCnpj = n.chave && n.chave.length === 44 
        ? n.chave.substring(6, 20).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') 
        : 'N/I'

      return {
        Número: n.numero,
        Série: n.serie,
        'Data Emissão': n.dataEmissao,
        'Chave de Acesso': n.chave,
        'CNPJ na Chave': chaveCnpj,
        'Destinatário CNPJ': n.destCNPJ,
        'Destinatário': n.destNome,
        'Status Chave x Destinatário': n.confrontoChaveXDest,
        Emitente: n.emitNome,
        'CNPJ Emitente': n.emitCNPJ,
        Produto: n.produto,
        'Terminal Entrega': n.terminal,
        Transbordo: n.transbordo,
        'Vagões Ferroviários': n.allVagoesStr || '-',
        'Peso Bruto (kg)': n.pesoNum,
        'Valor Total (R$)': n.valorNum,
        'Placa Veículo': n.placa || '-',
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório Geral')

    // Aba de resumo por transbordo/vagões
    const wsVagoes = XLSX.utils.json_to_sheet(
      (activeSnapshot.vagoesPorTransbordo || []).map((v) => ({
        Transbordo: v.fullName || '',
        'Total Vagões': v.totalVagoes || 0,
        'Vagões Identificados': Array.isArray(v.vagoesList) ? v.vagoesList.join(', ') : '',
        'Total Notas': v.totalNotas || 0,
        'Peso Total (kg)': v.pesoTotalKg || 0,
        'Valor Total (R$)': v.valorTotal || 0,
      }))
    )
    XLSX.utils.book_append_sheet(wb, wsVagoes, 'Resumo Vagões Transbordo')

    const dateStr = (activeSnapshot.dateFormatted || '').replace(/\//g, '-')
    const timeStr = (activeSnapshot.timeFormatted || '').replace(/:/g, '')
    XLSX.writeFile(wb, `espelho_dashboard_conferencia_${dateStr}_${timeStr}.xlsx`)
  }

  return (
    <div className="space-y-6">
      {/* Alerta de Feedback de Sucesso ao Excluir */}
      {deleteSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 shadow-xs animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-semibold">{deleteSuccessMessage}</span>
          </div>
          <button
            onClick={() => setDeleteSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CABEÇALHO DO ESPELHO: STATUS AO VIVO vs CONSULTA HISTÓRICA                */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`p-2.5 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                isLiveMode
                  ? 'bg-emerald-500 text-white animate-pulse'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              {isLiveMode ? <Radio className="h-6 w-6" /> : <History className="h-6 w-6" />}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  Espelho do Painel de Conferência
                </h2>
                {isLiveMode ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-0.5" />
                    Ao Vivo (Tempo Real)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <History className="h-3 w-3 mr-0.5" />
                    Consulta Histórica Anterior
                  </span>
                )}
              </div>

              {activeSnapshot ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                    <User className="h-3.5 w-3.5 text-indigo-500" />
                    Gerado por: <strong>{activeSnapshot.operatorName}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    {activeSnapshot.dateFormatted} às {activeSnapshot.timeFormatted}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5 text-indigo-400" />
                    {activeSnapshot.totalNotas} nota(s) fiscal(is)
                  </span>
                  <span className="flex items-center gap-1">
                    <TrainFront className="h-3.5 w-3.5 text-amber-500" />
                    {activeSnapshot.totalVagoesUnicos} vagão(ões)
                  </span>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 mt-1">
                  Aguardando upload ou geração de dashboard no Painel de Conferência...
                </p>
              )}
            </div>
          </div>

          {/* Botões de Ação do Cabeçalho */}
          <div className="flex flex-wrap items-center gap-2">
            {!isLiveMode && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setIsLiveMode(true)
                  setSelectedSnapshotId('LIVE')
                }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                Voltar ao Modo Ao Vivo
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistoryPanel((prev) => !prev)}
              className={`text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                showHistoryPanel
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 text-indigo-700 dark:text-indigo-300'
                  : ''
              }`}
            >
              <History className="h-3.5 w-3.5 text-indigo-500" />
              <span>Consultar Dashboards Anteriores</span>
              <span className="bg-zinc-200 dark:bg-zinc-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {historyList.length}
              </span>
              {showHistoryPanel ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>

            {activeSnapshot && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportFullSessionToExcel}
                  className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                  title="Exportar planilha Excel completa deste dashboard espelhado"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Exportar Excel</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConfirmDelete({
                      type: isLiveMode ? 'live' : 'session',
                      id: activeSnapshot.id,
                      title: activeSnapshot.title || 'Espelho de Conferência',
                      operator: activeSnapshot.operatorName,
                      date: `${activeSnapshot.dateFormatted} às ${activeSnapshot.timeFormatted}`,
                      notasCount: activeSnapshot.totalNotas,
                    })
                  }}
                  className="bg-red-50/80 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900/60 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title={isLiveMode ? "Excluir espelho ao vivo em exibição" : "Excluir esta sessão histórica"}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                  <span>Excluir Espelho</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PAINEL EXPANSÍVEL DE CONSULTAS HISTÓRICAS DE DASHBOARDS ANTERIORES        */}
        {/* ========================================================================= */}
        {showHistoryPanel && (
          <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  Sessões de Dashboards Geradas Anteriormente
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Selecione qualquer conferência realizada para espelhar instantaneamente todos os seus gráficos, vagões e notas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setConfirmDelete({
                      type: 'all',
                      id: 'ALL',
                      title: 'Limpar Todo o Histórico de Espelhos',
                    })
                  }}
                  className="text-[11px] text-zinc-500 hover:text-red-600 flex items-center gap-1 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md cursor-pointer transition-colors"
                  title="Limpar histórico de dashboards"
                >
                  <Trash2 className="h-3 w-3" />
                  Limpar Histórico
                </button>
              </div>
            </div>

            {/* Barra de Filtros de Histórico */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-8 relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar histórico por operador, transbordo, destinatário, data..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-4 flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <select
                  value={historyOperatorFilter}
                  onChange={(e) => setHistoryOperatorFilter(e.target.value)}
                  className="w-full bg-transparent text-foreground focus:outline-hidden cursor-pointer"
                >
                  <option value="all">Todos os Funcionários</option>
                  {availableOperators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grade de Sessões Históricas para Seleção */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredHistory.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
                  Nenhuma sessão de dashboard encontrada com os filtros atuais.
                </div>
              ) : (
                filteredHistory.map((item) => {
                  const isSelected = !isLiveMode && selectedSnapshotId === item.id
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedSnapshotId(item.id)
                        setIsLiveMode(false)
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/50 shadow-xs ring-1 ring-indigo-500'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-indigo-300 dark:hover:border-indigo-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {item.title || `Conferência (${item.totalNotas} notas)`}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono">
                            {item.dateFormatted} às {item.timeFormatted}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">
                            {item.operatorName}
                          </span>
                          {isSelected && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                              Visualizando Agora
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span>
                            <strong>{item.totalNotas}</strong> notas
                          </span>
                          <span>•</span>
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">
                            <strong>{item.totalVagoesUnicos}</strong> vagões
                          </span>
                          <span>•</span>
                          <span>
                            Peso: <strong>{item.pesoTotalFormatted}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Valor: <strong>{item.valorTotalFormatted}</strong>
                          </span>
                          {item.transbordos.length > 0 && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-xs text-zinc-400">
                                Transbordos: {item.transbordos.map((t) => t.name).join(', ')}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <Button
                          variant={isSelected ? 'default' : 'outline'}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedSnapshotId(item.id)
                            setIsLiveMode(false)
                          }}
                          className={`text-xs h-7 px-2.5 font-medium cursor-pointer ${
                            isSelected ? 'bg-indigo-600 text-white' : ''
                          }`}
                        >
                          {isSelected ? 'Em Exibição' : 'Visualizar Espelho'}
                        </Button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete({
                              type: 'session',
                              id: item.id,
                              title: item.title || 'Sessão Histórica',
                              operator: item.operatorName,
                              date: `${item.dateFormatted} às ${item.timeFormatted}`,
                              notasCount: item.totalNotas,
                            })
                          }}
                          className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors cursor-pointer"
                          title="Excluir sessão"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Se não houver nenhum snapshot carregado ainda */}
      {!activeSnapshot ? (
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-2xl p-10 sm:p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400 shadow-xs">
            <Package className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
              Nenhum Espelho de Conferência em Exibição
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              Assim que qualquer operador realizar uma conferência ou abrir a aba "Gráficos / Dashboard", o espelho ao vivo será transmitido aqui em tempo real.
            </p>
          </div>

          {historyList.length > 0 && (
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedSnapshotId(historyList[0].id)
                  setIsLiveMode(false)
                }}
                className="text-xs font-semibold gap-1.5 cursor-pointer bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                <History className="h-3.5 w-3.5 text-indigo-500" />
                Visualizar Última Sessão Salva ({historyList[0].dateFormatted})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryPanel(true)}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 gap-1 cursor-pointer"
              >
                Consultar Histórico ({historyList.length})
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* BARRA INFORMATIVA DE INTERAÇÃO DRILLDOWN                                  */}
          {/* ========================================================================= */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-950 dark:text-indigo-200">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-bounce" />
              <span>
                <strong>Espelho Interativo:</strong> Clique em qualquer barra ou fatia dos gráficos abaixo para abrir a lista completa de notas fiscais do grupo correspondente e exportar para Excel.
              </span>
            </div>
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-indigo-900 px-2.5 py-0.5 rounded-md shadow-xs border border-indigo-200 dark:border-indigo-700 shrink-0">
              Drilldown Ativo
            </span>
          </div>

          {/* ========================================================================= */}
          {/* 5 CARDS DE RESUMO / KPIS PRINCIPAIS                                       */}
          {/* ========================================================================= */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* Total de Notas */}
            <Card
              className="cursor-pointer hover:border-indigo-400 transition-all shadow-xs"
              onClick={() => {
                if (activeSnapshot.notes.length > 0) {
                  setSelectedGroup({
                    category: 'Geral',
                    fullName: 'Todas as Notas do Espelho',
                    notes: activeSnapshot.notes,
                  })
                  setModalSearch('')
                  setExpandedNoteIndex(null)
                }
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Total de Notas
                </CardTitle>
                <Package className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {activeSnapshot.totalNotas}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {activeSnapshot.valorTotalFormatted}
                </p>
              </CardContent>
            </Card>

            {/* Destinatários */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Destinatários & Filiais
                </CardTitle>
                <Building2 className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {Array.isArray(activeSnapshot.destinatarios) ? activeSnapshot.destinatarios.length : 0}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {(activeSnapshot.missingDestinatarioCount || 0) > 0 ? (
                    <span className="text-amber-600 font-semibold">
                      {activeSnapshot.missingDestinatarioCount} não informado(s)
                    </span>
                  ) : (
                    '100% identificados'
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Terminais */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Terminais de Entrega
                </CardTitle>
                <MapPin className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {Array.isArray(activeSnapshot.terminais) ? activeSnapshot.terminais.length : 0}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {(activeSnapshot.missingTerminalCount || 0) > 0 ? (
                    <span className="text-amber-600 font-semibold">
                      {activeSnapshot.missingTerminalCount} não informado(s)
                    </span>
                  ) : (
                    '100% identificados'
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Transbordos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  Transbordos
                </CardTitle>
                <Truck className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {Array.isArray(activeSnapshot.transbordos) ? activeSnapshot.transbordos.length : 0}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {(activeSnapshot.missingTransbordoCount || 0) > 0 ? (
                    <span className="text-amber-600 font-semibold">
                      {activeSnapshot.missingTransbordoCount} não informado(s)
                    </span>
                  ) : (
                    '100% identificados'
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Vagões Detectados / Pastas */}
            <Card
              className="cursor-pointer hover:border-amber-400 transition-all shadow-xs"
              onClick={() => {
                const allNotes = Array.isArray(activeSnapshot.notes) ? activeSnapshot.notes : []
                const notesWithWagons = allNotes.filter((n) => Array.isArray(n.vagoes) && n.vagoes.length > 0)
                if (notesWithWagons.length > 0) {
                  setSelectedGroup({
                    category: activeSnapshot.isDerivedFromFolders ? 'Pastas (Vagões)' : 'Vagões Ferroviários',
                    fullName: activeSnapshot.isDerivedFromFolders
                      ? 'Notas agrupadas por Pastas Inputadas'
                      : 'Notas com Vagões Ferroviários Identificados',
                    notes: notesWithWagons,
                  })
                  setModalSearch('')
                  setExpandedNoteIndex(null)
                }
              }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  {activeSnapshot.isDerivedFromFolders ? 'Vagões / Pastas' : 'Vagões Detectados'}
                </CardTitle>
                {activeSnapshot.isDerivedFromFolders ? (
                  <Folder className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <TrainFront className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {activeSnapshot.totalVagoesUnicos || 0}
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {Array.isArray(activeSnapshot.vagoesPorTransbordo) && activeSnapshot.vagoesPorTransbordo.length > 0
                    ? `${activeSnapshot.vagoesPorTransbordo.length} transbordo(s)`
                    : 'Sem vagões'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Banner de Auditoria de Divergências Fiscais se houver */}
          {(activeSnapshot.totalDivergenciasCNPJ || 0) > 0 && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                <span>
                  <strong>Atenção Fiscal:</strong> Identificada(s) <strong>{activeSnapshot.totalDivergenciasCNPJ}</strong> divergência(s) de CNPJ na Chave de Acesso em relação ao Destinatário informado nesta sessão.
                </span>
              </div>
              <button
                onClick={() => setDivergenceFilter('divergent')}
                className="text-[11px] font-bold underline cursor-pointer text-red-700 dark:text-red-300"
              >
                Filtrar Divergentes
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* CARD DEDICADO: QUANTIDADE DE VAGÕES POR TRANSBORDO (FERROVIA)             */}
          {/* ========================================================================= */}
          <Card className="border border-amber-200 dark:border-amber-900/60 shadow-xs bg-gradient-to-b from-white to-amber-50/20 dark:from-zinc-950 dark:to-amber-950/10">
            <CardHeader className="pb-3 border-b border-amber-100 dark:border-amber-900/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                    <TrainFront className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100 flex-wrap">
                      <span>Quantidade de Vagões por Transbordo</span>
                      {(activeSnapshot.totalVagoesUnicos || 0) > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          {activeSnapshot.totalVagoesUnicos} vagão(ões) único(s)
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {activeSnapshot.isDerivedFromFolders
                        ? 'Contagem calculada a partir das pastas inputadas no Painel de Conferência'
                        : 'Distribuição e volume de vagões ferroviários identificados em cada ponto de transbordo'}
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800 shrink-0">
                  Clique nas barras para filtrar
                </span>
              </div>
            </CardHeader>

            <CardContent className="pt-4 space-y-5">
              {!Array.isArray(activeSnapshot.vagoesPorTransbordo) || activeSnapshot.vagoesPorTransbordo.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-xl bg-zinc-50/50 dark:bg-zinc-900/50 border border-dashed border-zinc-200 dark:border-zinc-800">
                  <TrainTrack className="h-8 w-8 text-zinc-400 mx-auto mb-2 opacity-60" />
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Nenhum vagão ferroviário identificado nesta conferência.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Gráfico de Barras de Vagões por Transbordo */}
                  <div className="lg:col-span-6 h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={activeSnapshot.vagoesPorTransbordo || []}
                        layout="vertical"
                        onClick={(state: any) => {
                          if (state && state.activePayload && state.activePayload.length > 0) {
                            handleChartClick('Vagões no Transbordo', state.activePayload[0].payload)
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length > 0) {
                              const data = payload[0].payload as VagaoTransbordoSummary
                              return (
                                <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5 z-50 max-w-xs">
                                  <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                    <span
                                      className="inline-block w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: data.color || '#f59e0b' }}
                                    />
                                    Transbordo: {data.fullName}
                                  </div>
                                  <div className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                                    {data.totalVagoes} vagão(ões) único(s)
                                  </div>
                                  <div className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                                    {data.totalNotas} nota(s) vinculada(s) • {data.pesoTotalFormatted} • {data.valorTotalFormatted}
                                  </div>
                                  {Array.isArray(data.vagoesList) && data.vagoesList.length > 0 && (
                                    <div className="pt-1 border-t border-zinc-100 dark:border-zinc-800">
                                      <span className="text-[10px] text-zinc-400 uppercase font-semibold block mb-1">
                                        Vagões:
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {data.vagoesList.slice(0, 10).map((v, i) => (
                                          <span
                                            key={i}
                                            className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]"
                                          >
                                            {v}
                                          </span>
                                        ))}
                                        {data.vagoesList.length > 10 && (
                                          <span className="text-[10px] text-zinc-400">
                                            +{data.vagoesList.length - 10} mais...
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                        <Bar
                          dataKey="totalVagoes"
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={(entry) => handleChartClick('Vagões no Transbordo', entry)}
                        >
                          {(activeSnapshot.vagoesPorTransbordo || []).map((entry, index) => (
                            <Cell key={`vag-trans-cell-${index}`} fill={entry.color || '#f59e0b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Resumo e Lista de Vagões Identificados */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
                      <span>Detalhamento por Ponto de Transbordo</span>
                      <span className="text-[11px] text-zinc-400">
                        {(activeSnapshot.vagoesPorTransbordo || []).length} local(is)
                      </span>
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {(activeSnapshot.vagoesPorTransbordo || []).map((trans, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleChartClick('Vagões no Transbordo', trans)}
                          className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 hover:border-amber-400 dark:hover:border-amber-700 transition-all cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: trans.color }}
                              />
                              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                                {trans.fullName}
                              </span>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-mono">
                              {trans.totalVagoes} vagão(ões)
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>{trans.totalNotas} nota(s)</span>
                            <span>•</span>
                            <span>{trans.pesoTotalFormatted}</span>
                            <span>•</span>
                            <span>{trans.valorTotalFormatted}</span>
                          </div>

                          <div className="flex flex-wrap gap-1 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                            {(trans.vagoesList || []).map((vag, vIdx) => (
                              <span
                                key={vIdx}
                                className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[10px] font-mono font-medium border border-zinc-200 dark:border-zinc-700"
                              >
                                {vag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ========================================================================= */}
          {/* GRADE DE GRÁFICOS SECUNDÁRIOS: PRODUTOS, DESTINATÁRIOS, TERMINAIS, ETC.  */}
          {/* ========================================================================= */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico de Produtos */}
            <Card className="hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Notas por Produto</span>
                  <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                    Clique na fatia
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeSnapshot.produtos || []}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        className="cursor-pointer"
                        onClick={(entry) => handleChartClick('Produto', entry)}
                      >
                        {(activeSnapshot.produtos || []).map((entry, index) => (
                          <Cell
                            key={`cell-prod-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleChartClick('Produto', entry)}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, _, props) => [`${value} nota(s)`, props.payload?.fullName || '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Destinatários */}
            <Card className="hover:border-blue-300 dark:hover:border-blue-800 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Notas por Destinatário
                    {(activeSnapshot.missingDestinatarioCount || 0) > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {activeSnapshot.missingDestinatarioCount} Não Informado
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                    Clique na barra
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeSnapshot.destinatarios || []}
                      layout="vertical"
                      onClick={(state: any) => {
                        if (state && state.activePayload && state.activePayload.length > 0) {
                          handleChartClick('Destinatário', state.activePayload[0].payload)
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={160} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length > 0) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 z-50">
                                <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                  <span
                                    className="inline-block w-3 h-3 rounded-full shrink-0"
                                    style={{ backgroundColor: data.color || '#2563eb' }}
                                  />
                                  {data.destNome || data.fullName}
                                </div>
                                {data.destCNPJ && (
                                  <div className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                                    CNPJ / Filial: <span className="font-bold">{data.destCNPJ}</span>
                                  </div>
                                )}
                                <div className="text-blue-600 dark:text-blue-400 font-semibold pt-0.5">
                                  {data.value} nota(s) ({((data.value / (activeSnapshot.totalNotas || 1)) * 100).toFixed(1)}%)
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar
                        dataKey="value"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(entry) => handleChartClick('Destinatário', entry)}
                      >
                        {(activeSnapshot.destinatarios || []).map((entry, index) => (
                          <Cell
                            key={`dest-cell-${index}`}
                            fill={entry.isMissing ? '#f59e0b' : entry.color || '#2563eb'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Terminais de Entrega */}
            <Card className="hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Notas por Terminal de Entrega
                    {(activeSnapshot.missingTerminalCount || 0) > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {activeSnapshot.missingTerminalCount} Não Informado
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                    Clique na barra
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeSnapshot.terminais || []}
                      layout="vertical"
                      onClick={(state: any) => {
                        if (state && state.activePayload && state.activePayload.length > 0) {
                          handleChartClick('Terminal de Entrega', state.activePayload[0].payload)
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value, _, props) => [`${value} nota(s)`, props.payload?.fullName || '']} />
                      <Bar
                        dataKey="value"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(entry) => handleChartClick('Terminal de Entrega', entry)}
                      >
                        {(activeSnapshot.terminais || []).map((entry, index) => (
                          <Cell
                            key={`term-cell-${index}`}
                            fill={entry.isMissing ? '#f59e0b' : '#00C49F'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Gráfico de Transbordos */}
            <Card className="hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Notas por Transbordo
                    {(activeSnapshot.missingTransbordoCount || 0) > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {activeSnapshot.missingTransbordoCount} Não Informado
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
                    Clique na barra
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={activeSnapshot.transbordos || []}
                      layout="vertical"
                      onClick={(state: any) => {
                        if (state && state.activePayload && state.activePayload.length > 0) {
                          handleChartClick('Transbordo', state.activePayload[0].payload)
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value, _, props) => [`${value} nota(s)`, props.payload?.fullName || '']} />
                      <Bar
                        dataKey="value"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(entry) => handleChartClick('Transbordo', entry)}
                      >
                        {(activeSnapshot.transbordos || []).map((entry, index) => (
                          <Cell
                            key={`trans-cell-${index}`}
                            fill={entry.isMissing ? '#f59e0b' : '#FFBB28'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ========================================================================= */}
          {/* TABELA / LISTA DE NOTAS FISCAIS DA SESSÃO ESPELHADA                       */}
          {/* ========================================================================= */}
          <Card className="border border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Notas Fiscais do Dashboard Espelhado ({filteredNotes.length})
                  </CardTitle>
                </div>

                {/* Filtros e Busca de Notas */}
                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-64">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Buscar número, chave, vagão..."
                      value={tableSearchQuery}
                      onChange={(e) => setTableSearchQuery(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <select
                    value={divergenceFilter}
                    onChange={(e: any) => setDivergenceFilter(e.target.value)}
                    className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs text-foreground focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">Todas as Notas</option>
                    <option value="divergent">Com Divergência CNPJ</option>
                    <option value="ok">Conformes / Sem Divergência</option>
                  </select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[420px] custom-scrollbar">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 font-semibold border-b border-zinc-200 dark:border-zinc-700 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Nota / Série</th>
                      <th className="py-2.5 px-3">Emissão</th>
                      <th className="py-2.5 px-3">Destinatário</th>
                      <th className="py-2.5 px-3">Terminal</th>
                      <th className="py-2.5 px-3">Transbordo</th>
                      <th className="py-2.5 px-3">Vagão</th>
                      <th className="py-2.5 px-3 text-right">Peso (kg)</th>
                      <th className="py-2.5 px-3 text-right">Valor (R$)</th>
                      <th className="py-2.5 px-3 text-center">Chave x CNPJ</th>
                      <th className="py-2.5 px-3 text-center">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {filteredNotes.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-xs text-zinc-400">
                          Nenhuma nota fiscal encontrada nesta consulta.
                        </td>
                      </tr>
                    ) : (
                      filteredNotes.map((note, index) => (
                        <tr
                          key={index}
                          className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
                        >
                          <td className="py-2 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {note.numero} <span className="text-zinc-400 font-normal">S.{note.serie}</span>
                          </td>
                          <td className="py-2 px-3 text-zinc-500 whitespace-nowrap">
                            {note.dataEmissao}
                          </td>
                          <td className="py-2 px-3 max-w-[180px]">
                            <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate" title={note.destNome}>
                              {note.destNome}
                            </div>
                            {note.destCNPJ && (
                              <div className="font-mono text-[10px] text-zinc-400">
                                {note.destCNPJ}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 max-w-[140px] truncate text-zinc-700 dark:text-zinc-300" title={note.terminal}>
                            {note.terminal}
                          </td>
                          <td className="py-2 px-3 max-w-[140px] truncate text-zinc-700 dark:text-zinc-300" title={note.transbordo}>
                            {note.transbordo}
                          </td>
                          <td className="py-2 px-3">
                            {note.primaryVagao ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-mono text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                                {note.primaryVagao}
                              </span>
                            ) : (
                              <span className="text-zinc-400">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                            {note.pesoFormatted}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                            {note.valorFormatted}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {note.isDivergentCNPJ ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                Divergente
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Conforme
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => setViewingNote(note)}
                              className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 p-1 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded cursor-pointer"
                              title="Visualizar detalhes completos da nota"
                            >
                              <Maximize2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL INTERATIVO: NOTAS DO GRUPO SELECIONADO NO GRÁFICO (DRILLDOWN)       */}
      {/* ========================================================================= */}
      <Dialog open={!!selectedGroup} onOpenChange={() => setSelectedGroup(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          {selectedGroup && (
            <>
              <DialogHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {selectedGroup.category}
                    </span>
                    <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      <span>{selectedGroup.fullName}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-mono">
                        {selectedGroup.notes.length} nota(s)
                      </span>
                    </DialogTitle>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={exportModalToExcel}
                      variant="outline"
                      size="sm"
                      className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-600" />
                      Exportar Excel (.xlsx)
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              {/* Busca dentro do modal */}
              <div className="pt-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Filtrar notas por número, emitente, chave..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Lista de notas com acordeão detalhado */}
              <div className="overflow-y-auto flex-1 space-y-2 py-2 pr-1 custom-scrollbar">
                {(selectedGroup.notes || [])
                  .filter((n) => {
                    if (!n) return false
                    if (!modalSearch.trim()) return true
                    const q = modalSearch.toLowerCase()
                    return (
                      (n.numero && n.numero.toLowerCase().includes(q)) ||
                      (n.chave && n.chave.toLowerCase().includes(q)) ||
                      (n.emitNome && n.emitNome.toLowerCase().includes(q)) ||
                      (n.destNome && n.destNome.toLowerCase().includes(q)) ||
                      (n.allVagoesStr && n.allVagoesStr.toLowerCase().includes(q))
                    )
                  })
                  .map((note, idx) => {
                    const isExpanded = expandedNoteIndex === idx
                    return (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:border-indigo-300 transition-all space-y-2"
                      >
                        <div
                          className="flex items-center justify-between gap-2 cursor-pointer"
                          onClick={() => setExpandedNoteIndex(isExpanded ? null : idx)}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 font-mono">
                              NF-e {note.numero}
                            </span>
                            <span className="text-[11px] text-zinc-500">• {note.destNome}</span>
                            {note.primaryVagao && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-bold">
                                Vagão: {note.primaryVagao}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-emerald-600">
                              {note.valorFormatted}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-zinc-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                        </div>

                        {/* Detalhes expandidos */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs space-y-2 animate-in fade-in duration-150">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-zinc-400">Chave: </span>
                                <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all select-all">
                                  {note.chave}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400">Emitente: </span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                  {note.emitNome} ({note.emitCNPJ})
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400">Terminal: </span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                  {note.terminal}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400">Transbordo: </span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                  {note.transbordo}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400">Peso Bruto: </span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-mono font-bold">
                                  {note.pesoFormatted}
                                </span>
                              </div>
                              <div>
                                <span className="text-zinc-400">Status Fiscal: </span>
                                <span
                                  className={
                                    note.isDivergentCNPJ
                                      ? 'text-red-600 font-bold'
                                      : 'text-emerald-600 font-medium'
                                  }
                                >
                                  {note.confrontoChaveXDest || 'Conforme'}
                                </span>
                              </div>
                            </div>

                            {note.allVagoesStr && (
                              <div className="pt-1 text-[11px]">
                                <span className="text-zinc-400">Vagões Ferroviários: </span>
                                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                  {note.allVagoesStr}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL FICHA CADASTRAL / DETALHES COMPLETOS DA NOTA                        */}
      {/* ========================================================================= */}
      <Dialog open={!!viewingNote} onOpenChange={() => setViewingNote(null)}>
        <DialogContent className="max-w-xl p-6">
          {viewingNote && (
            <>
              <DialogHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <DialogTitle className="text-base font-bold flex items-center justify-between">
                  <span>Nota Fiscal Eletrônica nº {viewingNote.numero}</span>
                  <span className="text-xs font-mono font-normal text-zinc-500">
                    Série {viewingNote.serie}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-xs py-2">
                <div className="space-y-1">
                  <span className="text-zinc-400 block text-[11px]">Chave de Acesso (44 dígitos):</span>
                  <div className="p-2 rounded bg-zinc-100 dark:bg-zinc-800 font-mono text-[11px] break-all select-all font-semibold text-zinc-900 dark:text-zinc-100">
                    {viewingNote.chave}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Emitente</span>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {viewingNote.emitNome}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">{viewingNote.emitCNPJ}</div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Destinatário</span>
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {viewingNote.destNome}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">{viewingNote.destCNPJ}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Produto</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{viewingNote.produto}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Terminal</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                      {viewingNote.terminal}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60">
                    <span className="text-[10px] text-zinc-400 block">Transbordo</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                      {viewingNote.transbordo}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                    <span className="text-[10px] text-amber-700 dark:text-amber-300 block">Vagão</span>
                    <span className="font-mono font-bold text-amber-800 dark:text-amber-200">
                      {viewingNote.primaryVagao || '-'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Peso Bruto Total</span>
                    <span className="font-mono font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {viewingNote.pesoFormatted}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Valor Total</span>
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                      {viewingNote.valorFormatted}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE ESPELHO (SEM window.confirm)          */}
      {/* ========================================================================= */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && !isDeleting && setConfirmDelete(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 flex items-center justify-center shrink-0 text-red-600 dark:text-red-400">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {confirmDelete?.type === 'all'
                    ? 'Limpar Todo o Histórico de Espelhos?'
                    : confirmDelete?.type === 'live'
                    ? 'Excluir Espelho em Tempo Real?'
                    : 'Excluir Sessão Histórica do Espelho?'}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {confirmDelete?.type === 'all'
                    ? 'Esta ação apagará permanentemente todos os espelhos e históricos salvos no banco de dados e sincronizará com todas as abas.'
                    : 'Esta ação removerá permanentemente o espelho e todas as suas notas fiscais conferidas deste painel.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {confirmDelete && confirmDelete.type !== 'all' && (
            <div className="my-2 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Sessão:</span>
                <span className="font-bold text-foreground truncate max-w-[220px]">{confirmDelete.title}</span>
              </div>
              {confirmDelete.operator && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Operador:</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{confirmDelete.operator}</span>
                </div>
              )}
              {confirmDelete.date && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Data / Hora:</span>
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{confirmDelete.date}</span>
                </div>
              )}
              {typeof confirmDelete.notasCount === 'number' && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Notas Fiscais:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{confirmDelete.notasCount} notas</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setConfirmDelete(null)}
              className="text-xs cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={handleExecuteDelete}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Excluindo...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>
                    {confirmDelete?.type === 'all'
                      ? 'Sim, Limpar Tudo'
                      : 'Sim, Excluir Espelho'}
                  </span>
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
