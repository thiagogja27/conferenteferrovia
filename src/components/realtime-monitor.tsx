'use client'

import React, { useState, useEffect, useMemo } from 'react'
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
  BarChart3,
  FileSpreadsheet,
  Clock,
  Users,
  Calendar,
  Download,
  Printer,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileCode,
  FileArchive,
  ArrowUpDown,
  Sparkles,
  Trash2,
  TrainTrack,
  Check,
  X,
  ExternalLink,
  Laptop,
  ShieldCheck,
  Flame,
  Activity,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import * as XLSX from 'xlsx'
import {
  getOperatorName,
  setOperatorName,
  subscribeToActivities,
  subscribeToInputedFiles,
  subscribeToPresence,
  onConnectionStatusChange,
  logRealtimeActivity,
  seedDemoTelemetryData,
  clearAllTelemetryHistory,
  formatDateBR,
  formatTimeBR,
  type RealtimeActivity,
  type InputedFileRecord,
  type OperatorPresence,
} from '@/lib/firebase-realtime'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']

export function RealtimeMonitor() {
  const [activities, setActivities] = useState<RealtimeActivity[]>([])
  const [inputFiles, setInputFiles] = useState<InputedFileRecord[]>([])
  const [operators, setOperators] = useState<OperatorPresence[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [currentOperator, setCurrentOperator] = useState(getOperatorName())
  const [editingOperator, setEditingOperator] = useState(false)
  const [operatorInput, setOperatorInput] = useState(currentOperator)

  // Abas de Navegação do Monitor
  const [activeTab, setActiveTab] = useState<'dashboard' | 'files' | 'timeline' | 'operators'>('dashboard')

  // Filtros de Auditoria
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all')
  const [operatorFilter, setOperatorFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('ALL')

  // Modal de Impressão / Relatório Executivo
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

  // Assinaturas de telemetria
  useEffect(() => {
    const unsubConnection = onConnectionStatusChange((status) => {
      setIsConnected(status)
    })

    const unsubActivities = subscribeToActivities((acts) => {
      setActivities(acts)
    })

    const unsubFiles = subscribeToInputedFiles((files) => {
      setInputFiles(files)
    })

    const unsubPresence = subscribeToPresence((ops) => {
      setOperators(ops)
    })

    return () => {
      unsubConnection()
      unsubActivities()
      unsubFiles()
      unsubPresence()
    }
  }, [])

  // Lista única de operadores que já registraram atividades
  const availableOperators = useMemo(() => {
    const names = new Set<string>()
    activities.forEach((a) => {
      if (a.operatorName) names.add(a.operatorName)
    })
    inputFiles.forEach((f) => {
      if (f.operatorName) names.add(f.operatorName)
    })
    operators.forEach((o) => {
      if (o.operatorName) names.add(o.operatorName)
    })
    return Array.from(names).sort()
  }, [activities, inputFiles, operators])

  // Filtro de tempo em milissegundos
  const timeThreshold = useMemo(() => {
    const now = Date.now()
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
    const endOfYesterday = new Date(startOfToday.getTime() - 1)

    switch (periodFilter) {
      case 'today':
        return { start: startOfToday.getTime(), end: now }
      case 'yesterday':
        return { start: startOfYesterday.getTime(), end: endOfYesterday.getTime() }
      case '7days':
        return { start: now - 7 * 86400000, end: now }
      case '30days':
        return { start: now - 30 * 86400000, end: now }
      case 'all':
      default:
        return { start: 0, end: Infinity }
    }
  }, [periodFilter])

  // Atividades filtradas por período, operador e busca
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      // Período
      if (act.timestamp < timeThreshold.start || act.timestamp > timeThreshold.end) return false
      // Operador
      if (operatorFilter !== 'all' && act.operatorName !== operatorFilter) return false
      // Busca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = act.title?.toLowerCase().includes(q)
        const matchDesc = act.description?.toLowerCase().includes(q)
        const matchOp = act.operatorName?.toLowerCase().includes(q)
        if (!matchTitle && !matchDesc && !matchOp) return false
      }
      return true
    })
  }, [activities, timeThreshold, operatorFilter, searchQuery])

  // Arquivos inputados filtrados por período, operador, tipo e busca
  const filteredInputFiles = useMemo(() => {
    return inputFiles.filter((file) => {
      // Período
      if (file.timestamp < timeThreshold.start || file.timestamp > timeThreshold.end) return false
      // Operador
      if (operatorFilter !== 'all' && file.operatorName !== operatorFilter) return false
      // Tipo de Arquivo
      if (fileTypeFilter !== 'ALL' && file.fileType !== fileTypeFilter) return false
      // Busca
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = file.fileName?.toLowerCase().includes(q)
        const matchOp = file.operatorName?.toLowerCase().includes(q)
        if (!matchName && !matchOp) return false
      }
      return true
    })
  }, [inputFiles, timeThreshold, operatorFilter, fileTypeFilter, searchQuery])

  // KPIs Consolidados
  const kpis = useMemo(() => {
    // Conferências: soma de upload_nfe, convert_pdf e reconcile_mdf
    const totalConferencias = filteredActivities.filter(
      (a) => a.type === 'upload_nfe' || a.type === 'convert_pdf' || a.type === 'reconcile_mdf'
    ).length

    const totalArquivos = filteredInputFiles.length

    const totalItensNotas = filteredInputFiles.reduce((acc, f) => acc + (f.itemsCount || 1), 0)

    const totalValorRS = filteredInputFiles.reduce((acc, f) => acc + (f.totalValor || 0), 0)

    const totalDivergencias = filteredActivities.filter((a) => a.type === 'divergence_found').length +
      filteredInputFiles.filter((f) => f.status === 'COM_DIVERGENCIA').length

    // Operadores ativos no período
    const opsAtivos = new Set<string>()
    filteredActivities.forEach((a) => opsAtivos.add(a.operatorName))
    filteredInputFiles.forEach((f) => opsAtivos.add(f.operatorName))

    return {
      totalConferencias,
      totalArquivos,
      totalItensNotas,
      totalValorRS,
      totalDivergencias,
      totalOperadoresAtivos: opsAtivos.size,
    }
  }, [filteredActivities, filteredInputFiles])

  // Dados para Gráfico de Barras: Conferências e Arquivos por Data
  const chartDataByDate = useMemo(() => {
    const map = new Map<string, { date: string; timestamp: number; conferencias: number; arquivos: number; divergencias: number }>()

    // Mapeia atividades
    filteredActivities.forEach((act) => {
      const dateStr = act.dateFormatted || formatDateBR(act.timestamp)
      const existing = map.get(dateStr) || { date: dateStr, timestamp: act.timestamp, conferencias: 0, arquivos: 0, divergencias: 0 }
      if (act.type === 'upload_nfe' || act.type === 'convert_pdf' || act.type === 'reconcile_mdf') {
        existing.conferencias += 1
      }
      if (act.type === 'divergence_found') {
        existing.divergencias += 1
      }
      map.set(dateStr, existing)
    })

    // Mapeia arquivos
    filteredInputFiles.forEach((f) => {
      const dateStr = f.dateFormatted || formatDateBR(f.timestamp)
      const existing = map.get(dateStr) || { date: dateStr, timestamp: f.timestamp, conferencias: 0, arquivos: 0, divergencias: 0 }
      existing.arquivos += 1
      if (f.status === 'COM_DIVERGENCIA') {
        existing.divergencias += 1
      }
      map.set(dateStr, existing)
    })

    const arr = Array.from(map.values())
    // Ordena por data cronológica crescente para o gráfico
    arr.sort((a, b) => a.timestamp - b.timestamp)
    return arr
  }, [filteredActivities, filteredInputFiles])

  // Dados para Gráfico de Pizza: Distribuição por Tipo de Documento
  const chartDataByFileType = useMemo(() => {
    const counts: Record<string, number> = {
      'XML NF-e': 0,
      'PDF DANFE': 0,
      'Planilha Excel': 0,
      'Manifesto MDF-e': 0,
      'Lote ZIP': 0,
    }

    filteredInputFiles.forEach((f) => {
      if (f.fileType === 'XML_NFE') counts['XML NF-e'] += 1
      else if (f.fileType === 'PDF_DANFE') counts['PDF DANFE'] += 1
      else if (f.fileType === 'EXCEL_PLANILHA') counts['Planilha Excel'] += 1
      else if (f.fileType === 'XML_MDFE') counts['Manifesto MDF-e'] += 1
      else if (f.fileType === 'ZIP_LOTE') counts['Lote ZIP'] += 1
      else counts['XML NF-e'] += 1
    })

    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0)
  }, [filteredInputFiles])

  // Ranking e Tabela de Produtividade dos Funcionários
  const employeeProductivity = useMemo(() => {
    const stats: Record<
      string,
      {
        operatorName: string
        totalSessoes: number
        totalArquivos: number
        totalConferencias: number
        totalDivergencias: number
        ultimaAtividade: number
      }
    > = {}

    const initOp = (name: string) => {
      if (!stats[name]) {
        stats[name] = {
          operatorName: name,
          totalSessoes: 0,
          totalArquivos: 0,
          totalConferencias: 0,
          totalDivergencias: 0,
          ultimaAtividade: 0,
        }
      }
    }

    filteredActivities.forEach((a) => {
      initOp(a.operatorName)
      if (a.type === 'session_start') stats[a.operatorName].totalSessoes += 1
      if (a.type === 'upload_nfe' || a.type === 'convert_pdf' || a.type === 'reconcile_mdf') {
        stats[a.operatorName].totalConferencias += 1
      }
      if (a.type === 'divergence_found') stats[a.operatorName].totalDivergencias += 1
      if (a.timestamp > stats[a.operatorName].ultimaAtividade) {
        stats[a.operatorName].ultimaAtividade = a.timestamp
      }
    })

    filteredInputFiles.forEach((f) => {
      initOp(f.operatorName)
      stats[f.operatorName].totalArquivos += 1
      if (f.status === 'COM_DIVERGENCIA') stats[f.operatorName].totalDivergencias += 1
      if (f.timestamp > stats[f.operatorName].ultimaAtividade) {
        stats[f.operatorName].ultimaAtividade = f.timestamp
      }
    })

    const list = Object.values(stats)
    list.sort((a, b) => b.totalConferencias + b.totalArquivos - (a.totalConferencias + a.totalArquivos))
    return list
  }, [filteredActivities, filteredInputFiles])

  // Salvar novo nome de operador
  const handleSaveOperator = (e: React.FormEvent) => {
    e.preventDefault()
    if (operatorInput.trim()) {
      setOperatorName(operatorInput.trim())
      setCurrentOperator(operatorInput.trim())
      setEditingOperator(false)
      logRealtimeActivity('session_start', 'Identificação Atualizada', `Operador identificado como ${operatorInput.trim()}`)
    }
  }

  // Exportar Relatório Detalhado em Excel (.xlsx)
  const handleExportDetailedExcel = () => {
    const wb = XLSX.utils.book_new()
    const nowStr = `${formatDateBR(Date.now())} às ${formatTimeBR(Date.now())}`

    // 1. Aba Resumo Executivo
    const resumoData = [
      ['FERROVIA BRASIL - RELATÓRIO DE AUDITORIA E COMPROVAÇÃO DE USO'],
      ['Sistema:', 'VLIC Conferente Ferrovia - Módulos de Conferência Fiscal e Pátio'],
      ['Emissão do Relatório:', nowStr],
      ['Supervisor / Responsável:', currentOperator],
      ['Filtro de Período:', periodFilter.toUpperCase()],
      ['Filtro de Operador:', operatorFilter],
      [''],
      ['INDICADORES CONSOLIDADOS DO PERÍODO', ''],
      ['Total de Conferências Realizadas:', kpis.totalConferencias],
      ['Total de Arquivos Inputados:', kpis.totalArquivos],
      ['Total de Notas Fiscais e Itens Auditados:', kpis.totalItensNotas],
      ['Valor Fiscal Total Movimentado (R$):', kpis.totalValorRS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })],
      ['Divergências Fiscais e de Pátio Evitadas:', kpis.totalDivergencias],
      ['Funcionários com Atividade Registrada:', kpis.totalOperadoresAtivos],
      [''],
      ['RANKING DE PRODUTIVIDADE DOS FUNCIONÁRIOS'],
      ['Funcionário', 'Total de Arquivos', 'Conferências Realizadas', 'Divergências Evitadas', 'Última Atividade'],
      ...employeeProductivity.map((emp) => [
        emp.operatorName,
        emp.totalArquivos,
        emp.totalConferencias,
        emp.totalDivergencias,
        emp.ultimaAtividade ? `${formatDateBR(emp.ultimaAtividade)} ${formatTimeBR(emp.ultimaAtividade)}` : 'N/A',
      ]),
    ]
    const wsResumo = XLSX.utils.aoa_to_sheet(resumoData)
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo Executivo')

    // 2. Aba Arquivos Inputados por Data
    const arquivosData = filteredInputFiles.map((f, idx) => ({
      Item: idx + 1,
      Data: f.dateFormatted,
      Hora: f.timeFormatted,
      'Funcionário / Operador': f.operatorName,
      'Nome do Arquivo': f.fileName,
      Formato: f.fileType,
      'Volume (Notas/Itens)': f.itemsCount,
      'Valor Total R$': f.totalValor ? f.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
      Divergências: f.divergencesCount || 0,
      Status: f.status,
    }))
    const wsArquivos = XLSX.utils.json_to_sheet(arquivosData)
    XLSX.utils.book_append_sheet(wb, wsArquivos, 'Arquivos Inputados')

    // 3. Aba Rastreabilidade Cronológica (Timeline)
    const timelineData = filteredActivities.map((a, idx) => ({
      Sequência: idx + 1,
      Data: a.dateFormatted || formatDateBR(a.timestamp),
      Hora: a.timeFormatted || formatTimeBR(a.timestamp),
      'Funcionário / Operador': a.operatorName,
      'Tipo de Ação': a.type,
      'Título do Evento': a.title,
      'Descrição Detalhada': a.description,
      'Detalhes Técnicos': a.metadata ? JSON.stringify(a.metadata) : '',
    }))
    const wsTimeline = XLSX.utils.json_to_sheet(timelineData)
    XLSX.utils.book_append_sheet(wb, wsTimeline, 'Rastreabilidade Timeline')

    // 4. Aba Produtividade Detalhada
    const prodData = employeeProductivity.map((emp) => ({
      Funcionário: emp.operatorName,
      'Arquivos Carregados': emp.totalArquivos,
      'Conferências Realizadas': emp.totalConferencias,
      'Divergências Encontradas': emp.totalDivergencias,
      'Última Atividade Registrada': emp.ultimaAtividade ? `${formatDateBR(emp.ultimaAtividade)} ${formatTimeBR(emp.ultimaAtividade)}` : '-',
    }))
    const wsProd = XLSX.utils.json_to_sheet(prodData)
    XLSX.utils.book_append_sheet(wb, wsProd, 'Produtividade Funcionários')

    const dateFile = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Relatorio_Auditoria_Uso_Conferente_Ferrovia_${dateFile}.xlsx`)

    logRealtimeActivity(
      'export_excel',
      'Exportação de Relatório Detalhado de Uso',
      `O supervisor ${currentOperator} exportou a planilha de comprovação de uso com ${filteredActivities.length} eventos e ${filteredInputFiles.length} arquivos.`,
      { totalEventos: filteredActivities.length, totalArquivos: filteredInputFiles.length }
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header com Status & Controles de Auditoria */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Central de Auditoria & Monitoramento em Tempo Real
            </h1>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
                isConnected
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-ping' : 'bg-indigo-500'}`} />
              {isConnected ? 'Firebase Realtime Sincronizado' : 'Telemetria Operacional Ativa'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
            Comprovante executivo de produtividade dos funcionários, rastreabilidade fiscal de notas e conciliações de vagões para prestação de contas à chefia.
          </p>
        </div>

        {/* Ações Globais: Identificação do Usuário + Botões de Exportação */}
        <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto justify-end">
          {/* Identificação do Operador Ativo */}
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs">
            <span className="text-zinc-500 font-medium">Supervisor / Operador:</span>
            {editingOperator ? (
              <form onSubmit={handleSaveOperator} className="flex items-center gap-1">
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border rounded px-1.5 py-0.5 text-xs w-32 focus:outline-hidden"
                  autoFocus
                />
                <button type="submit" className="text-emerald-600 hover:text-emerald-700 cursor-pointer">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingOperator(false)}
                  className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setEditingOperator(true)}
                className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                title="Clique para alterar sua identificação"
              >
                <span>{currentOperator}</span>
                <span className="text-[10px] text-zinc-400 font-normal">(alterar)</span>
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            className="text-xs h-9 gap-1.5 cursor-pointer border-zinc-200 dark:border-zinc-700"
          >
            <Printer className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
            Relatório / Imprimir (PDF)
          </Button>

          <Button
            size="sm"
            onClick={handleExportDetailedExcel}
            className="text-xs h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
          >
            <Download className="h-4 w-4" />
            Exportar Relatório Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* Barra de Filtros Globais: Período, Funcionário e Pesquisa */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
        {/* Seletor de Período Rápido */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mr-1 flex items-center gap-1 shrink-0">
            <Calendar className="h-3.5 w-3.5" />
            Período:
          </span>
          <button
            onClick={() => setPeriodFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              periodFilter === 'all'
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Todo o Histórico
          </button>
          <button
            onClick={() => setPeriodFilter('today')}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              periodFilter === 'today'
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriodFilter('yesterday')}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              periodFilter === 'yesterday'
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Ontem
          </button>
          <button
            onClick={() => setPeriodFilter('7days')}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              periodFilter === '7days'
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Últimos 7 Dias
          </button>
          <button
            onClick={() => setPeriodFilter('30days')}
            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              periodFilter === '30days'
                ? 'bg-indigo-600 text-white font-bold'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Últimos 30 Dias
          </button>
        </div>

        {/* Filtro por Funcionário e Campo de Busca */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="bg-transparent text-foreground focus:outline-hidden cursor-pointer"
            >
              <option value="all">Todos os Funcionários</option>
              {availableOperators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 md:w-56">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar em arquivos, logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Botão para Limpar e Manter Apenas Dados Reais Operacionais */}
          <button
            onClick={() => {
              if (window.confirm('Deseja limpar todo o histórico e manter apenas dados 100% reais gerados pela sua equipe?')) {
                clearAllTelemetryHistory()
              }
            }}
            className="text-xs px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 flex items-center gap-1 shrink-0 cursor-pointer"
            title="Limpar telemetria e manter apenas dados reais"
          >
            <Trash2 className="h-3 w-3 text-zinc-500" />
            <span className="hidden sm:inline">Limpar Histórico</span>
          </button>
        </div>
      </div>

      {/* 4 Abas Principais de Visualização */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'dashboard'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Dashboard de Produtividade
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'files'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Arquivos Inputados por Data ({filteredInputFiles.length})
        </button>

        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'timeline'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Clock className="h-4 w-4" />
          Linha do Tempo de Uso ({filteredActivities.length})
        </button>

        <button
          onClick={() => setActiveTab('operators')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'operators'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          <Users className="h-4 w-4" />
          Presença dos Funcionários ({operators.length})
        </button>
      </div>

      {/* ABA 1: DASHBOARD DE CONFERÊNCIAS & PRODUTIVIDADE */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 5 Cards de KPIs Executivos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Conferências Realizadas</span>
                <CheckCircle2 className="h-4 w-4 text-indigo-500" />
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-foreground">{kpis.totalConferencias}</div>
              <p className="text-[11px] text-zinc-500 mt-1">Lotes e conciliações executados</p>
            </Card>

            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Arquivos Inputados</span>
                <FileText className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-foreground">{kpis.totalArquivos}</div>
              <p className="text-[11px] text-zinc-500 mt-1">XML, PDF, Excel e ZIP</p>
            </Card>

            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Notas & Vagões Auditados</span>
                <TrainTrack className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-foreground">{kpis.totalItensNotas}</div>
              <p className="text-[11px] text-zinc-500 mt-1">Volume de documentos e vagões</p>
            </Card>

            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Divergências Evitadas</span>
                <AlertTriangle className="h-4 w-4 text-rose-500" />
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
                {kpis.totalDivergencias}
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Bloqueios de erro fiscal / pátio</p>
            </Card>

            <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-zinc-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Funcionários Ativos</span>
                <Users className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl lg:text-3xl font-extrabold text-foreground">{kpis.totalOperadoresAtivos}</div>
              <p className="text-[11px] text-zinc-500 mt-1">Colaboradores no período</p>
            </Card>
          </div>

          {/* Seção Gráfica: Recharts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico 1: Volume por Data */}
            <Card className="lg:col-span-2 p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                    Evolução Diária de Conferências e Arquivos Inputados
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Volume comprovado de uso por data para comprovação à chefia
                  </p>
                </div>
              </div>

              {chartDataByDate.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
                  Nenhum dado registrado no período selecionado.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDataByDate} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="date" fontSize={11} tickLine={false} />
                      <YAxis fontSize={11} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(24, 24, 27, 0.95)',
                          borderColor: '#3f3f46',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="conferencias" name="Conferências" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="arquivos" name="Arquivos Inputados" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="divergencias" name="Divergências" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {/* Gráfico 2: Tipos de Documentos Inputados */}
            <Card className="p-5 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
              <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
                <FileCode className="h-4 w-4 text-emerald-500" />
                Formatos de Arquivos Inputados
              </h3>
              <p className="text-xs text-zinc-500 mb-4">Distribuição de insumos processados</p>

              {chartDataByFileType.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-zinc-400">
                  Sem arquivos no período.
                </div>
              ) : (
                <div className="h-64 w-full flex flex-col items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={chartDataByFileType}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={40}
                        paddingAngle={3}
                      >
                        {chartDataByFileType.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(24, 24, 27, 0.95)',
                          borderColor: '#3f3f46',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                    {chartDataByFileType.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="truncate">{item.name}:</span>
                        <strong className="text-foreground">{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Tabela de Produtividade dos Funcionários */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-500" />
                    Quadro de Produtividade dos Funcionários / Conferentes
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Demonstrativo individual de engajamento e volume de operações executadas
                  </CardDescription>
                </div>
                <span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                  {employeeProductivity.length} colaboradores
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold">
                    <th className="py-2.5 px-4">Funcionário / Conferente</th>
                    <th className="py-2.5 px-3">Arquivos Carregados</th>
                    <th className="py-2.5 px-3">Conferências Realizadas</th>
                    <th className="py-2.5 px-3">Divergências Evitadas</th>
                    <th className="py-2.5 px-4">Última Operação Registrada</th>
                    <th className="py-2.5 px-4 text-right">Nível de Utilização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {employeeProductivity.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-zinc-400">
                        Nenhum funcionário com atividade registrada no filtro atual.
                      </td>
                    </tr>
                  ) : (
                    employeeProductivity.map((emp) => {
                      const totalActions = emp.totalArquivos + emp.totalConferencias
                      const maxActions = Math.max(1, employeeProductivity[0]?.totalArquivos + employeeProductivity[0]?.totalConferencias || 1)
                      const pct = Math.min(100, Math.round((totalActions / maxActions) * 100))

                      return (
                        <tr key={emp.operatorName} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                          <td className="py-3 px-4 font-bold text-foreground flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                              {emp.operatorName.slice(0, 2).toUpperCase()}
                            </div>
                            <span>{emp.operatorName}</span>
                          </td>
                          <td className="py-3 px-3 font-semibold text-zinc-700 dark:text-zinc-300">
                            {emp.totalArquivos} arquivos
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                              {emp.totalConferencias} conferências
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {emp.totalDivergencias > 0 ? (
                              <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {emp.totalDivergencias}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">0 (100% OK)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                            {emp.ultimaAtividade
                              ? `${formatDateBR(emp.ultimaAtividade)} às ${formatTimeBR(emp.ultimaAtividade)}`
                              : 'Sem registro'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 w-8">
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 2: ARQUIVOS INPUTADOS POR DATA */}
      {activeTab === 'files' && (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
          <CardHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                  Registro de Arquivos Inputados por Data e Funcionário
                </CardTitle>
                <CardDescription className="text-xs">
                  Histórico completo com data, hora, responsável e volumes conferidos
                </CardDescription>
              </div>

              {/* Filtro por Formato de Arquivo */}
              <div className="flex items-center gap-1 overflow-x-auto text-xs">
                {['ALL', 'XML_NFE', 'PDF_DANFE', 'EXCEL_PLANILHA', 'XML_MDFE', 'ZIP_LOTE'].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFileTypeFilter(fmt)}
                    className={`px-2 py-1 rounded-md font-medium cursor-pointer transition-colors shrink-0 ${
                      fileTypeFilter === fmt
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                    }`}
                  >
                    {fmt === 'ALL'
                      ? 'Todos'
                      : fmt === 'XML_NFE'
                      ? 'XML NF-e'
                      : fmt === 'PDF_DANFE'
                      ? 'PDF DANFE'
                      : fmt === 'EXCEL_PLANILHA'
                      ? 'Excel'
                      : fmt === 'XML_MDFE'
                      ? 'MDF-e'
                      : 'ZIP'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold">
                  <th className="py-2.5 px-4">Data e Hora</th>
                  <th className="py-2.5 px-3">Funcionário / Operador</th>
                  <th className="py-2.5 px-4">Nome do Arquivo Inputado</th>
                  <th className="py-2.5 px-3">Formato</th>
                  <th className="py-2.5 px-3">Itens / Notas</th>
                  <th className="py-2.5 px-3">Valor Total R$</th>
                  <th className="py-2.5 px-4 text-right">Status da Conferência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {filteredInputFiles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-zinc-400">
                      Nenhum arquivo inputado encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredInputFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        <span className="font-bold text-foreground">{file.dateFormatted}</span> às {file.timeFormatted}
                      </td>
                      <td className="py-3 px-3 font-semibold text-zinc-800 dark:text-zinc-200">
                        {file.operatorName}
                      </td>
                      <td className="py-3 px-4 font-medium text-foreground flex items-center gap-1.5 max-w-xs truncate">
                        {file.fileType === 'EXCEL_PLANILHA' ? (
                          <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : file.fileType === 'PDF_DANFE' ? (
                          <FileText className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        ) : file.fileType === 'ZIP_LOTE' ? (
                          <FileArchive className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        ) : (
                          <FileCode className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        )}
                        <span className="truncate" title={file.fileName}>
                          {file.fileName}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          {file.fileType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-foreground">
                        {file.itemsCount} {file.itemsCount === 1 ? 'item' : 'itens'}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {file.totalValor && file.totalValor > 0
                          ? `R$ ${file.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {file.status === 'COM_DIVERGENCIA' ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 inline-flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Divergência
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Conferido OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ABA 3: RASTREABILIDADE / TIMELINE DE USO */}
      {activeTab === 'timeline' && (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
          <CardHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-500" />
                  Rastreabilidade de Uso por Data e Hora (Linha do Tempo)
                </CardTitle>
                <CardDescription className="text-xs">
                  Registro cronológico segundo a segundo de cada ação realizada pelos conferentes no sistema
                </CardDescription>
              </div>
              <span className="text-xs font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
                {filteredActivities.length} eventos
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-xs">
                Nenhuma atividade registrada no período selecionado.
              </div>
            ) : (
              <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-4 space-y-6">
                {filteredActivities.map((act) => {
                  const isDivergence = act.type === 'divergence_found'
                  const isUpload = act.type === 'upload_nfe' || act.type === 'convert_pdf'
                  const isMdf = act.type === 'reconcile_mdf' || act.type === 'upload_mdfe'
                  const isExport = act.type === 'export_excel' || act.type === 'export_zip'

                  return (
                    <div key={act.id} className="relative pl-6">
                      {/* Marcador do nó da linha do tempo */}
                      <span
                        className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900 ${
                          isDivergence
                            ? 'bg-rose-500'
                            : isUpload
                            ? 'bg-emerald-500'
                            : isMdf
                            ? 'bg-blue-500'
                            : isExport
                            ? 'bg-purple-500'
                            : 'bg-indigo-500'
                        }`}
                      />

                      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-foreground">{act.title}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                                isDivergence
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : isUpload
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : isMdf
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                              }`}
                            >
                              {act.type}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                              👤 {act.operatorName}
                            </span>
                            <span>•</span>
                            <span>
                              📅 {act.dateFormatted || formatDateBR(act.timestamp)} às{' '}
                              {act.timeFormatted || formatTimeBR(act.timestamp)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-300">{act.description}</p>

                        {act.metadata && Object.keys(act.metadata).length > 0 && (
                          <div className="mt-2 text-[11px] font-mono bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 flex flex-wrap gap-3">
                            {Object.entries(act.metadata).map(([k, v]) => (
                              <span key={k}>
                                <strong className="text-zinc-700 dark:text-zinc-300">{k}:</strong> {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ABA 4: OPERADORES & SESSÕES ONLINE */}
      {activeTab === 'operators' && (
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
          <CardHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              Sessões e Operadores Conectados no Sistema
            </CardTitle>
            <CardDescription className="text-xs">
              Monitoramento ativo de quem está utilizando o sistema neste momento
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {operators.length === 0 ? (
                <div className="col-span-3 text-center py-10 text-zinc-400 text-xs">
                  <Laptop className="h-8 w-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-700" />
                  Nenhum operador conectado neste instante.
                </div>
              ) : (
                operators.map((op) => (
                  <div
                    key={op.sessionId}
                    className={`p-4 rounded-xl border ${
                      op.operatorName === currentOperator
                        ? 'border-indigo-300 bg-indigo-50/40 dark:border-indigo-800 dark:bg-indigo-950/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            op.online ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                          }`}
                        />
                        {op.operatorName}
                      </span>
                      {op.operatorName === currentOperator && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                          Sua Sessão
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mb-1">
                      <strong>Módulo Ativo:</strong> {op.currentModule || 'Painel de Conferência'}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      <strong>Dispositivo:</strong> {op.deviceInfo || 'Web'}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-2 font-mono">
                      Visto às: {formatTimeBR(op.lastSeen)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL DE IMPRESSÃO / RELATÓRIO EXECUTIVO OFICIAL (PDF) */}
      <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:max-w-full print:p-0">
          <DialogHeader className="border-b pb-3 print:border-b-2">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  FERROVIA BRASIL - RELATÓRIO DE AUDITORIA OPERACIONAL
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Comprovante de utilização, conferência fiscal e produtividade dos colaboradores
                </DialogDescription>
              </div>
              <Button
                size="sm"
                onClick={() => window.print()}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer print:hidden"
              >
                <Printer className="h-4 w-4" />
                Imprimir / Salvar PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-4 text-xs">
            {/* Metadados do Relatório */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
              <div>
                <strong>Data de Emissão:</strong>
                <div>{formatDateBR(Date.now())} às {formatTimeBR(Date.now())}</div>
              </div>
              <div>
                <strong>Supervisor Emissor:</strong>
                <div>{currentOperator}</div>
              </div>
              <div>
                <strong>Período Auditado:</strong>
                <div>{periodFilter.toUpperCase()}</div>
              </div>
              <div>
                <strong>Status de Validação:</strong>
                <div className="text-emerald-600 font-bold">100% AUTÊNTICO</div>
              </div>
            </div>

            {/* Resumo Estatístico dos KPIs */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-500 mb-2">
                1. Totalizadores Consolidados
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <div className="p-3 border rounded-lg text-center">
                  <span className="text-zinc-500 text-[10px] block">Conferências</span>
                  <span className="text-lg font-bold text-foreground">{kpis.totalConferencias}</span>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <span className="text-zinc-500 text-[10px] block">Arquivos Inputados</span>
                  <span className="text-lg font-bold text-foreground">{kpis.totalArquivos}</span>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <span className="text-zinc-500 text-[10px] block">Notas/Itens</span>
                  <span className="text-lg font-bold text-foreground">{kpis.totalItensNotas}</span>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <span className="text-zinc-500 text-[10px] block">Divergências Evitadas</span>
                  <span className="text-lg font-bold text-rose-600">{kpis.totalDivergencias}</span>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <span className="text-zinc-500 text-[10px] block">Funcionários</span>
                  <span className="text-lg font-bold text-foreground">{kpis.totalOperadoresAtivos}</span>
                </div>
              </div>
            </div>

            {/* Tabela de Produtividade dos Funcionários */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-500 mb-2">
                2. Produtividade por Funcionário / Conferente
              </h4>
              <table className="w-full text-left border text-xs">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr>
                    <th className="p-2 border">Funcionário</th>
                    <th className="p-2 border">Arquivos</th>
                    <th className="p-2 border">Conferências</th>
                    <th className="p-2 border">Divergências</th>
                    <th className="p-2 border">Última Atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeProductivity.map((emp) => (
                    <tr key={emp.operatorName}>
                      <td className="p-2 border font-bold">{emp.operatorName}</td>
                      <td className="p-2 border">{emp.totalArquivos}</td>
                      <td className="p-2 border">{emp.totalConferencias}</td>
                      <td className="p-2 border">{emp.totalDivergencias}</td>
                      <td className="p-2 border font-mono">
                        {emp.ultimaAtividade ? `${formatDateBR(emp.ultimaAtividade)} ${formatTimeBR(emp.ultimaAtividade)}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabela de Amostra dos Arquivos Inputados */}
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-zinc-500 mb-2">
                3. Registro de Arquivos Inputados
              </h4>
              <table className="w-full text-left border text-xs">
                <thead className="bg-zinc-100 dark:bg-zinc-800">
                  <tr>
                    <th className="p-2 border">Data/Hora</th>
                    <th className="p-2 border">Funcionário</th>
                    <th className="p-2 border">Arquivo</th>
                    <th className="p-2 border">Tipo</th>
                    <th className="p-2 border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInputFiles.slice(0, 15).map((f) => (
                    <tr key={f.id}>
                      <td className="p-2 border font-mono">{f.dateFormatted} {f.timeFormatted}</td>
                      <td className="p-2 border">{f.operatorName}</td>
                      <td className="p-2 border truncate max-w-xs">{f.fileName}</td>
                      <td className="p-2 border">{f.fileType}</td>
                      <td className="p-2 border">{f.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInputFiles.length > 15 && (
                <p className="text-[10px] text-zinc-500 mt-1 italic">
                  * Exibindo os primeiros 15 registros de {filteredInputFiles.length}. O relatório Excel completo contém todos os registros.
                </p>
              )}
            </div>

            {/* Linha Formal de Assinatura */}
            <div className="pt-10 grid grid-cols-2 gap-10 text-center">
              <div>
                <div className="border-t border-zinc-400 pt-2 font-bold">{currentOperator}</div>
                <div className="text-[10px] text-zinc-500">Supervisor de Conferência Ferroviária</div>
              </div>
              <div>
                <div className="border-t border-zinc-400 pt-2 font-bold">Gerência / Diretoria de Operações</div>
                <div className="text-[10px] text-zinc-500">Aprovação e Visto de Produtividade</div>
              </div>
            </div>
          </div>

          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => setIsPrintModalOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
