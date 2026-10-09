'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  HardDrive,
  Database,
  Trash2,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Activity,
  FileSpreadsheet,
  Radio,
  Users,
  Lightbulb,
  Layers,
  ArrowRight,
  Info,
  Server,
  Zap,
  Monitor,
  BarChart3,
  CheckSquare,
  Square,
  Building2,
  Check,
} from 'lucide-react'
import {
  fetchDatabaseStorageStats,
  getInitialStorageStats,
  formatBytes,
  optimizeDatabaseSmart,
  purgeConferenceHistory,
  purgeInputFiles,
  purgeActivities,
  purgeOfflinePresence,
  purgeResolvedSuggestions,
  clearBrowserLocalStorage,
  purgeAllTelemetry,
  purgeSingleNode,
  purgeSelectedNodes,
  purgeAllTelemetryColumns,
  purgeEntireVlicTelemetryRoot,
  type DatabaseStorageStats,
  type StorageNodeMetric,
} from '@/lib/database-optimization-service'

interface DatabaseStorageManagerProps {
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error' | 'info') => void
}

export function DatabaseStorageManager({ onNotify }: DatabaseStorageManagerProps) {
  // Inicialização instantânea (0ms) a partir de métricas locais: a tela NUNCA fica travada
  const [stats, setStats] = useState<DatabaseStorageStats>(() => getInitialStorageStats())
  const [isLoading, setIsLoading] = useState(false)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null)

  // Seleção múltipla de colunas para limpeza em lote
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])

  // Modal para limpeza de uma única coluna
  const [nodeToPurge, setNodeToPurge] = useState<{ path: string; label: string; count: number; bytes: number } | null>(null)

  // Modal para limpeza de todas as colunas
  const [isBulkPurgeModalOpen, setIsBulkPurgeModalOpen] = useState(false)
  const [preserveUsersInBulk, setPreserveUsersInBulk] = useState(true)

  // Modal de Confirmação de Limpeza Total Raiz
  const [isDangerModalOpen, setIsDangerModalOpen] = useState(false)
  const [dangerConfirmText, setDangerConfirmText] = useState('')

  const loadStats = async () => {
    setIsLoading(true)
    try {
      const result = await fetchDatabaseStorageStats()
      if (result) {
        setStats(result)
      }
    } catch (e) {
      console.warn('Erro ao carregar estatísticas:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  // Otimização Inteligente em 1 Clique
  const handleSmartOptimization = async () => {
    setIsOptimizing(true)
    try {
      const res = await optimizeDatabaseSmart()
      await loadStats()
      onNotify?.(res.summary, 'success')
    } catch (err: any) {
      onNotify?.(`Erro na otimização: ${err?.message || 'Falha ao compactar banco.'}`, 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  // Ações Seletivas
  const handleAction = async (key: string, fn: () => Promise<any>, successMsg: string) => {
    setActionLoadingKey(key)
    try {
      const res = await fn()
      await loadStats()
      const freedStr = res?.freedBytes ? ` (${formatBytes(res.freedBytes)} liberados)` : ''
      onNotify?.(`${successMsg}${freedStr}`, 'success')
    } catch (err: any) {
      onNotify?.(`Erro: ${err?.message || 'Falha na operação.'}`, 'error')
    } finally {
      setActionLoadingKey(null)
    }
  }

  // Limpar Coluna Individual
  const handleConfirmPurgeSingle = async () => {
    if (!nodeToPurge) return
    const { path, label } = nodeToPurge
    setActionLoadingKey(path)
    try {
      const res = await purgeSingleNode(path)
      await loadStats()
      onNotify?.(`Coluna "${label}" limpa com sucesso! ${res.freedBytes ? `${formatBytes(res.freedBytes)} liberados.` : ''}`, 'success')
      setNodeToPurge(null)
    } catch (err: any) {
      onNotify?.(`Erro ao limpar coluna: ${err?.message || 'Falha na exclusão.'}`, 'error')
    } finally {
      setActionLoadingKey(null)
    }
  }

  // Limpar Colunas Selecionadas
  const handlePurgeSelected = async () => {
    if (selectedColumns.length === 0) return
    setIsOptimizing(true)
    try {
      const res = await purgeSelectedNodes(selectedColumns)
      await loadStats()
      setSelectedColumns([])
      onNotify?.(res.summary, 'success')
    } catch (err: any) {
      onNotify?.(`Erro ao limpar colunas selecionadas: ${err?.message || 'Falha.'}`, 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  // Limpeza de Todas as Colunas de Telemetria
  const handlePurgeAllColumns = async () => {
    setIsOptimizing(true)
    setIsBulkPurgeModalOpen(false)
    try {
      const res = await purgeAllTelemetryColumns(preserveUsersInBulk)
      await loadStats()
      setSelectedColumns([])
      onNotify?.(res.summary, 'success')
    } catch (err: any) {
      onNotify?.(`Erro ao limpar colunas: ${err?.message || 'Falha na exclusão.'}`, 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  // Limpeza Total Raiz (com confirmação digitada)
  const handlePurgeAllTelemetryRoot = async () => {
    if (dangerConfirmText.trim().toUpperCase() !== 'LIMPAR') {
      onNotify?.('Digite exatamente "LIMPAR" para confirmar a exclusão.', 'warning')
      return
    }

    setIsOptimizing(true)
    setIsDangerModalOpen(false)
    setDangerConfirmText('')

    try {
      const res = await purgeEntireVlicTelemetryRoot()
      await loadStats()
      setSelectedColumns([])
      onNotify?.(res.summary, 'success')
    } catch (err: any) {
      onNotify?.(`Erro ao limpar telemetria: ${err?.message || 'Falha na exclusão.'}`, 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  const toggleSelectColumn = (path: string) => {
    setSelectedColumns((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    )
  }

  const totalBytes = stats.totalBytes || 0
  const quotaBytes = stats?.quotaBytes || 1024 * 1024 * 1024
  const pctUsed = stats ? Math.min(stats.percentageUsed, 100) : 0
  const freeBytes = Math.max(0, quotaBytes - totalBytes)

  // Status de Saúde
  const isHealthy = pctUsed < 30
  const isWarning = pctUsed >= 30 && pctUsed < 70
  const isCritical = pctUsed >= 70

  // Lista de colunas sob vlic_telemetry exibidas na imagem do usuário
  const telemetryColumnsList: {
    key: string
    path: string
    title: string
    icon: any
    color: string
    bgLight: string
    bgDark: string
    metric?: StorageNodeMetric
  }[] = [
    {
      key: 'conference_dashboards',
      path: 'vlic_telemetry/conference_dashboards',
      title: 'conference_dashboards',
      icon: Radio,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgLight: 'bg-emerald-100',
      bgDark: 'dark:bg-emerald-950',
      metric: stats.sections.conferenceDashboards || stats.sections.conference_dashboards,
    },
    {
      key: 'latest_conference_dashboard',
      path: 'vlic_telemetry/latest_conference_dashboard',
      title: 'latest_conference_dashboard',
      icon: Activity,
      color: 'text-teal-600 dark:text-teal-400',
      bgLight: 'bg-teal-100',
      bgDark: 'dark:bg-teal-950',
      metric: stats.sections.latestConferenceDashboard || stats.sections.latest_conference_dashboard,
    },
    {
      key: 'metrics',
      path: 'vlic_telemetry/metrics',
      title: 'metrics',
      icon: BarChart3,
      color: 'text-amber-600 dark:text-amber-400',
      bgLight: 'bg-amber-100',
      bgDark: 'dark:bg-amber-950',
      metric: stats.sections.metrics,
    },
    {
      key: 'presence',
      path: 'vlic_telemetry/presence',
      title: 'presence',
      icon: Users,
      color: 'text-purple-600 dark:text-purple-400',
      bgLight: 'bg-purple-100',
      bgDark: 'dark:bg-purple-950',
      metric: stats.sections.presence,
    },
    {
      key: 'screens',
      path: 'vlic_telemetry/screens',
      title: 'screens',
      icon: Monitor,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgLight: 'bg-cyan-100',
      bgDark: 'dark:bg-cyan-950',
      metric: stats.sections.screens,
    },
    {
      key: 'suggestions',
      path: 'vlic_telemetry/suggestions',
      title: 'suggestions',
      icon: Lightbulb,
      color: 'text-amber-600 dark:text-amber-400',
      bgLight: 'bg-amber-100',
      bgDark: 'dark:bg-amber-950',
      metric: stats.sections.suggestions,
    },
    {
      key: 'input_files',
      path: 'vlic_telemetry/input_files',
      title: 'input_files',
      icon: FileSpreadsheet,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgLight: 'bg-indigo-100',
      bgDark: 'dark:bg-indigo-950',
      metric: stats.sections.inputFiles || stats.sections.input_files,
    },
    {
      key: 'activities',
      path: 'vlic_telemetry/activities',
      title: 'activities',
      icon: Activity,
      color: 'text-blue-600 dark:text-blue-400',
      bgLight: 'bg-blue-100',
      bgDark: 'dark:bg-blue-950',
      metric: stats.sections.activities,
    },
  ]

  // Detecta colunas dinâmicas adicionais
  const extraColumns = Object.keys(stats.sections).filter((k) => {
    const isStandard = [
      'conferenceDashboards',
      'conference_dashboards',
      'latestConferenceDashboard',
      'latest_conference_dashboard',
      'metrics',
      'presence',
      'screens',
      'suggestions',
      'inputFiles',
      'input_files',
      'activities',
      'users',
      'cadastrosLogisticos',
      'cadastros_logisticos',
      'localStorage',
    ].includes(k)
    return !isStandard
  })

  const allPurgeablePaths = telemetryColumnsList.map((col) => col.path)

  const handleSelectAll = () => {
    if (selectedColumns.length === allPurgeablePaths.length) {
      setSelectedColumns([])
    } else {
      setSelectedColumns([...allPurgeablePaths])
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-blue-950/40 border border-emerald-200/80 dark:border-emerald-900/60 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
              <HardDrive className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              Gestão de Consumo & Limpeza das Colunas do Banco
            </h2>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Conectado ao Firebase Realtime Database:{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-bold">
              {stats.databaseUrl || 'https://novoconferente-default-rtdb.firebaseio.com'}
            </code>
            . Você pode <strong>limpar qualquer coluna individualmente</strong> ou <strong>limpar todas de uma vez</strong> para otimizar o banco.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isLoading && (
            <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 bg-emerald-100/90 dark:bg-emerald-950/80 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 animate-pulse">
              <RefreshCw className="h-3 w-3 animate-spin text-emerald-600 dark:text-emerald-400" />
              <span>Sincronizando banco...</span>
            </span>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => setIsBulkPurgeModalOpen(true)}
            disabled={isOptimizing}
            className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5 h-9 px-3.5"
          >
            <Trash2 className="h-4 w-4" />
            Limpar Todas as Colunas
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSmartOptimization}
            disabled={isOptimizing}
            className="text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5 h-9 px-3.5"
          >
            {isOptimizing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 text-amber-300" />
            )}
            {isOptimizing ? 'Otimizando...' : 'Otimizar Banco'}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={loadStats}
            disabled={isLoading}
            className="text-xs h-9 px-2.5 cursor-pointer text-zinc-600 dark:text-zinc-300"
            title="Recalcular Métricas"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* PAINEL PRINCIPAL DE INDICADORES DE ARMAZENAMENTO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Consumo Atual vs Cota Spark */}
        <Card className="md:col-span-2 shadow-xs border border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
                <Database className="h-4 w-4 text-emerald-600" />
                <span>Armazenamento em Nuvem (Firebase RTDB • vlic_telemetry)</span>
              </CardTitle>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                stats?.isOnline
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}>
                {stats?.isOnline ? 'Online • Conectado ao Firebase' : 'Modo Offline / Local'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                  {formatBytes(totalBytes)}
                </span>
                <span className="text-xs text-zinc-400">
                  em uso de <strong>{formatBytes(quotaBytes)}</strong> (Cota Gratuita Spark)
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {pctUsed < 0.01 ? '< 0.01%' : `${pctUsed.toFixed(2)}%`} ocupado
              </span>
            </div>

            {/* Barra de Progresso do Armazenamento */}
            <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-3 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isCritical
                    ? 'bg-rose-500'
                    : isWarning
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                }`}
                style={{ width: `${Math.max(pctUsed, 0.8)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <span>
                Espaço Livre Restante: <strong>{formatBytes(freeBytes)}</strong>
              </span>
              <span>
                Total de Registros: <strong>{stats?.totalItems.toLocaleString('pt-BR')}</strong>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Diagnóstico de Saúde e Recomendação */}
        <Card className="shadow-xs border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-blue-600" />
              <span>Status do Banco</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-1 space-y-2 flex-1 flex flex-col justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {isHealthy ? 'Banco Otimizado & Veloz' : isWarning ? 'Atenção aos Logs' : 'Otimização Urgente'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Você pode apagar arquivos de cada coluna individualmente clicando em <strong>Limpar Coluna</strong>, ou selecionar múltiplas colunas para limpar tudo de uma vez.
              </p>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="text-[10px] text-zinc-400">
                Última checagem: {new Date(stats?.updatedAt || Date.now()).toLocaleTimeString('pt-BR')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DESTAQUE RÁPIDO PARA A MAIOR COLUNA: conference_dashboards */}
      {(stats.sections.conferenceDashboards?.count > 0 || stats.sections.conference_dashboards?.count > 0) && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white shrink-0 shadow-xs">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-950 dark:text-rose-100 flex items-center gap-2">
                <span>Coluna Principal:</span>
                <code className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/60 px-1.5 py-0.5 rounded">
                  vlic_telemetry/conference_dashboards
                </code>
                <span className="text-[11px] font-bold text-rose-800 dark:text-rose-200">
                  ({(stats.sections.conferenceDashboards?.count || stats.sections.conference_dashboards?.count || 0).toLocaleString('pt-BR')} registros • {formatBytes(stats.sections.conferenceDashboards?.bytes || stats.sections.conference_dashboards?.bytes || 0)})
                </span>
              </h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                Esta coluna contém os espelhos e históricos de sessões mostrados no seu Firebase. Clique ao lado para esvaziar todos os registros desta coluna diretamente no banco.
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() =>
              setNodeToPurge({
                path: 'vlic_telemetry/conference_dashboards',
                label: 'conference_dashboards',
                count: stats.sections.conferenceDashboards?.count || stats.sections.conference_dashboards?.count || 0,
                bytes: stats.sections.conferenceDashboards?.bytes || stats.sections.conference_dashboards?.bytes || 0,
              })
            }
            className="text-xs h-8.5 font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs shrink-0 flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Esvaziar conference_dashboards Agora
          </Button>
        </div>
      )}

      {/* BARRA DE AÇÕES EM LOTE DE COLUNAS */}
      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSelectAll}
            className="text-xs h-8 cursor-pointer text-zinc-700 dark:text-zinc-300"
          >
            {selectedColumns.length === allPurgeablePaths.length ? (
              <>
                <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                Desmarcar Todas
              </>
            ) : (
              <>
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Selecionar Todas ({allPurgeablePaths.length})
              </>
            )}
          </Button>

          {selectedColumns.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={handlePurgeSelected}
              disabled={isOptimizing}
              className="text-xs h-8 font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Limpar {selectedColumns.length} Coluna(s) Selecionada(s)
            </Button>
          )}

          <span className="text-xs text-zinc-500 hidden sm:inline">
            {selectedColumns.length === 0
              ? 'Selecione colunas pelas caixas de seleção abaixo para limpar em lote'
              : `${selectedColumns.length} de ${allPurgeablePaths.length} colunas marcadas para exclusão`}
          </span>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsBulkPurgeModalOpen(true)}
          className="text-xs h-8 font-bold border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Limpar Todas as Colunas de Telemetria
        </Button>
      </div>

      {/* SEÇÕES DETALHADAS DAS COLUNAS DO BANCO (vlic_telemetry) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-zinc-500" />
            <span>Colunas do Banco de Dados (vlic_telemetry)</span>
          </h3>
          <span className="text-[11px] text-zinc-400">
            Cada coluna pode ser esvaziada individualmente ou em lote
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {telemetryColumnsList.map((col) => {
            const Icon = col.icon
            const metric = col.metric
            const count = metric?.count || 0
            const bytes = metric?.bytes || 0
            const isSelected = selectedColumns.includes(col.path)
            const isCurrentActionLoading = actionLoadingKey === col.path

            return (
              <div
                key={col.path}
                className={`p-4 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-rose-400 dark:border-rose-700 bg-rose-50/20 dark:bg-rose-950/20 shadow-xs'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-2xs'
                } space-y-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    {/* Checkbox de seleção */}
                    <button
                      type="button"
                      onClick={() => toggleSelectColumn(col.path)}
                      className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer transition-colors border ${
                        isSelected
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 bg-white dark:bg-zinc-800'
                      }`}
                      title={isSelected ? 'Desmarcar' : 'Selecionar para limpeza'}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </button>

                    <div className={`p-2 rounded-lg ${col.bgLight} ${col.bgDark} ${col.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                          {col.title}
                        </code>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          ({col.path})
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-tight mt-0.5">
                        {metric?.description || `Coluna ${col.title} no Firebase Realtime Database.`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                      {formatBytes(bytes)}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {count} {count === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  {/* Botões específicos para espelhos */}
                  {col.key === 'conference_dashboards' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleAction(
                          'conf-5',
                          () => purgeConferenceHistory(5),
                          'Histórico compactado: mantidos os 5 espelhos mais recentes'
                        )
                      }
                      disabled={actionLoadingKey === 'conf-5' || count <= 5}
                      className="text-[11px] h-7 px-2 cursor-pointer text-zinc-700 dark:text-zinc-300"
                    >
                      Manter últimos 5
                    </Button>
                  )}

                  {/* Botões específicos para arquivos */}
                  {col.key === 'input_files' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleAction(
                          'files-50',
                          () => purgeInputFiles(50),
                          'Arquivos compactados: mantidos os 50 mais recentes'
                        )
                      }
                      disabled={actionLoadingKey === 'files-50' || count <= 50}
                      className="text-[11px] h-7 px-2 cursor-pointer text-zinc-700 dark:text-zinc-300"
                    >
                      Manter últimos 50
                    </Button>
                  )}

                  {/* Botão Direto de Limpar Esta Coluna */}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setNodeToPurge({
                        path: col.path,
                        label: col.title,
                        count,
                        bytes,
                      })
                    }
                    disabled={isCurrentActionLoading}
                    className="text-[11px] h-7 px-2.5 font-bold cursor-pointer text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    {isCurrentActionLoading ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Limpar Coluna
                  </Button>
                </div>
              </div>
            )
          })}

          {/* Colunas Extras Dinâmicas caso existam */}
          {extraColumns.map((k) => {
            const metric = stats.sections[k]
            if (!metric) return null
            const isSelected = selectedColumns.includes(metric.path)

            return (
              <div
                key={metric.path}
                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSelectColumn(metric.path)}
                      className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer border ${
                        isSelected ? 'bg-rose-600 border-rose-600 text-white' : 'border-zinc-300 dark:border-zinc-700'
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </button>
                    <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      <Database className="h-4 w-4" />
                    </div>
                    <div>
                      <code className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
                        {metric.label}
                      </code>
                      <p className="text-[11px] text-zinc-400">{metric.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-bold block">{formatBytes(metric.bytes)}</span>
                    <span className="text-[10px] text-zinc-400">{metric.count} itens</span>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setNodeToPurge({
                        path: metric.path,
                        label: metric.label,
                        count: metric.count,
                        bytes: metric.bytes,
                      })
                    }
                    className="text-[11px] h-7 px-2.5 font-bold text-rose-600 border-rose-200"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Limpar Coluna
                  </Button>
                </div>
              </div>
            )
          })}

          {/* Cache Local do Navegador */}
          {stats.sections.localStorage && (
            <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-2xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      Cache Local do Navegador (LocalStorage)
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Cópias em cache de arquivos e atividades offline armazenadas no navegador.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                    {formatBytes(stats.sections.localStorage.bytes)}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {stats.sections.localStorage.count} chaves locais
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const res = clearBrowserLocalStorage()
                    loadStats()
                    onNotify?.(`Cache local limpo (${formatBytes(res.freedBytes)} liberados)`, 'success')
                  }}
                  disabled={stats.sections.localStorage.bytes === 0}
                  className="text-[11px] h-7 px-2.5 cursor-pointer text-zinc-600 dark:text-zinc-300"
                >
                  Limpar Cache Local
                </Button>
              </div>
            </div>
          )}

          {/* Seções Protegidas (Cadastros & Usuários) */}
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/20 dark:bg-blue-950/10 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  Cadastros Logísticos & Usuários (Protegidos)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Preservados
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Os destinatários, CNPJs, transbordos cadastrados na aba Monitor e os perfis de operadores são preservados para não interromper a operação.
            </p>
            <div className="flex items-center gap-4 text-[11px] text-zinc-600 dark:text-zinc-400 pt-1 font-mono">
              <span>Cadastros: <strong>{formatBytes(stats?.sections?.cadastrosLogisticos?.bytes || 0)}</strong></span>
              <span>Usuários: <strong>{formatBytes(stats?.sections?.users?.bytes || 0)}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ZONA DE PERIGO: LIMPEZA COMPLETA DE TELEMETRIA */}
      <Card className="border border-rose-200 dark:border-rose-900/60 bg-rose-50/15 dark:bg-rose-950/10 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-xs">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <span>Reset Total da Raiz vlic_telemetry (Limpeza Completa)</span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 max-w-xl">
              Remove a árvore inteira <code>vlic_telemetry</code> do Firebase Realtime Database. Recomendado caso deseje iniciar o sistema do zero mantendo apenas os cadastros de destinatários/transbordos.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsDangerModalOpen(true)}
            className="text-xs h-8 px-3 font-bold border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950 cursor-pointer shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-600" />
            Reset Completo da Raiz
          </Button>
        </CardContent>
      </Card>

      {/* MODAL 1: CONFIRMAÇÃO DE LIMPEZA DE UMA COLUNA ESPECÍFICA */}
      <Dialog open={!!nodeToPurge} onOpenChange={(open) => !open && setNodeToPurge(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" />
              Limpar Coluna do Banco
            </DialogTitle>
            <DialogDescription className="text-xs">
              Você está prestes a apagar todos os dados armazenados na coluna:
            </DialogDescription>
          </DialogHeader>

          {nodeToPurge && (
            <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">Coluna:</span>
                <strong className="text-zinc-900 dark:text-zinc-100">{nodeToPurge.path}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tamanho Atual:</span>
                <strong className="text-rose-600">{formatBytes(nodeToPurge.bytes)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Total de Registros:</span>
                <strong>{nodeToPurge.count}</strong>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setNodeToPurge(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmPurgeSingle}
              disabled={!!actionLoadingKey}
              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              {actionLoadingKey ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Confirmar e Apagar Coluna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CONFIRMAÇÃO DE LIMPEZA DE TODAS AS COLUNAS */}
      <Dialog open={isBulkPurgeModalOpen} onOpenChange={setIsBulkPurgeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Limpar Todas as Colunas de Telemetria
            </DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação esvaziará todas as seguintes colunas do Firebase Realtime Database:
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800 space-y-1 text-xs">
            {telemetryColumnsList.map((col) => (
              <div key={col.path} className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-zinc-600 dark:text-zinc-400">• {col.path}</span>
                <span className="text-zinc-500">{formatBytes(col.metric?.bytes || 0)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="preserveUsersCheck"
              checked={preserveUsersInBulk}
              onChange={(e) => setPreserveUsersInBulk(e.target.checked)}
              className="rounded text-emerald-600 cursor-pointer h-4 w-4"
            />
            <label htmlFor="preserveUsersCheck" className="text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
              Preservar Usuários & Departamentos (recomendado)
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsBulkPurgeModalOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePurgeAllColumns}
              disabled={isOptimizing}
              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              {isOptimizing ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Limpar Todas as Colunas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: CONFIRMAÇÃO DE RESET TOTAL RAIZ (DIGITADO) */}
      <Dialog open={isDangerModalOpen} onOpenChange={setIsDangerModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Reset Completo de vlic_telemetry
            </DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação removerá completamente o nó raiz <code>vlic_telemetry</code> no Firebase.
              <strong> Cadastros de destinatários e transbordos NÃO serão afetados.</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              Para confirmar, digite <strong className="text-rose-600 font-mono">LIMPAR</strong> no campo abaixo:
            </p>
            <Input
              value={dangerConfirmText}
              onChange={(e) => setDangerConfirmText(e.target.value)}
              placeholder="Digite LIMPAR"
              className="text-xs uppercase font-mono font-bold"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsDangerModalOpen(false)
                setDangerConfirmText('')
              }}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={dangerConfirmText.trim().toUpperCase() !== 'LIMPAR'}
              onClick={handlePurgeAllTelemetryRoot}
              className="text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              Confirmar e Limpar Banco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
