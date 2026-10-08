'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Legend,
} from 'recharts'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Copy,
  Check,
  Download,
  Search,
  Filter,
  ArrowUpDown,
  Building2,
  FileText,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  Scale,
  Sparkles,
  Layers,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { verifyChaveCNPJ, parseNFE, type NFEData } from '@/lib/nfe-parser'
import {
  sanitizeDestinatarioNome,
  formatCNPJ,
  extractCNPJFilial,
  isCarrierCnpj,
} from '@/lib/destinatario-utils'

export interface ChaveDestinatarioItem {
  id: string
  fileName: string
  numero: string
  serie: string
  chave: string
  chaveCnpjRaw: string
  chaveCnpjFormatted: string
  dataEmissao: string
  emitNome: string
  emitCNPJ: string
  emitCNPJFormatted: string
  destNome: string
  destCNPJ: string
  destCNPJFormatted: string
  valorTotal: number
  valorFormatted: string
  confronto: 'IGUAIS' | 'DIVERGENTES' | 'NÃO INFORMADO'
  statusLabel: string
  statusDetails: string
  matchesEmitente: boolean
  matchesDestinatario: boolean
  rawFile: any
}

interface ChaveDestinatarioDashboardProps {
  files: any[]
  onSelectFile?: (file: any) => void
}

const STATUS_COLORS = {
  DIVERGENTES: '#f43f5e', // Rose/Vermelho vivo
  IGUAIS: '#10b981',      // Verde Esmeralda
  'NÃO INFORMADO': '#f59e0b', // Âmbar
}

export function ChaveDestinatarioDashboard({
  files,
  onSelectFile,
}: ChaveDestinatarioDashboardProps) {
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'DIVERGENTES' | 'IGUAIS' | 'NÃO INFORMADO'>('TODOS')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDestinatario, setSelectedDestinatario] = useState<string>('TODOS')
  const [selectedEmitente, setSelectedEmitente] = useState<string>('TODOS')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copiedListMsg, setCopiedListMsg] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'numero' | 'valor' | 'status'>('status')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Normalização e extração detalhada de cada nota fiscal
  const items: ChaveDestinatarioItem[] = useMemo(() => {
    if (!files || files.length === 0) return []

    return files.map((f, index) => {
      let nfe: NFEData | null = f.nfeData || null
      const parsed = f.parsedData
      const rawXml = f.xmlContent || f.xmlGerado || ''

      if (!nfe && rawXml) {
        try {
          nfe = parseNFE(rawXml)
        } catch (e) {
          // ignora falha de parse
        }
      }

      const numero = nfe?.numero || parsed?.nNF || `Doc-${index + 1}`
      const serie = nfe?.serie || parsed?.serie || '1'
      const chave = (nfe?.chaveAcesso || parsed?.chave || '').replace(/\D/g, '')
      const dataEmissao = nfe?.dataEmissao || parsed?.dhEmi || 'Não informada'

      // Emitente
      let emitNome = 'Não informado'
      if (nfe?.emitente?.nome && nfe.emitente.nome !== 'EMITENTE NÃO IDENTIFICADO') {
        emitNome = nfe.emitente.nome
      } else if (parsed?.emitNome) {
        emitNome = parsed.emitNome
      }
      const rawEmitCnpj = (nfe?.emitente?.cnpj || parsed?.emitCNPJ || '').replace(/\D/g, '')
      const emitCNPJFormatted = formatCNPJ(rawEmitCnpj)

      // Destinatário
      const rawDestNome =
        nfe?.destinatario?.nome && nfe.destinatario.nome !== 'DESTINATÁRIO NÃO IDENTIFICADO'
          ? nfe.destinatario.nome
          : parsed?.destNome && parsed.destNome !== 'DESTINATÁRIO NÃO IDENTIFICADO'
          ? parsed.destNome
          : ''

      let rawDestCnpj = (nfe?.destinatario?.cpfCnpj || parsed?.destCNPJ || '').replace(/\D/g, '')

      // Se o CNPJ pertencer a transportadora cadastrada (ex: 10.991.380 Liderança ou 02.387.241 Rumo), NÃO é destinatário!
      if (isCarrierCnpj(rawDestCnpj)) {
        if (rawDestNome && /SAO\s*MARTINHO/i.test(rawDestNome) && rawEmitCnpj) {
          rawDestCnpj = rawEmitCnpj
        } else {
          rawDestCnpj = ''
        }
      }

      const infCpl = `${nfe?.informacoesComplementares || ''} ${parsed?.infCpl || ''} ${rawXml} ${f.rawSnippet || ''}`
      let destNome = sanitizeDestinatarioNome(rawDestNome, rawDestCnpj, infCpl)

      // Se ainda contiver cabeçalho de volume, limpa
      if (/QUANTIDADE.*(?:ESP[EÉ]CIE|PESO|MARCA|N[UÚ]MERO)|PESO\s+BRUTO/i.test(destNome)) {
        destNome = 'Não informado'
      }

      const destCNPJFormatted = formatCNPJ(rawDestCnpj)

      // Extração de CNPJ da Chave (posições 7 a 20 da chave de 44 dígitos)
      let chaveCnpjRaw = ''
      let chaveCnpjFormatted = 'Sem Chave'
      if (chave.length === 44) {
        chaveCnpjRaw = chave.slice(6, 20)
        chaveCnpjFormatted = formatCNPJ(chaveCnpjRaw)
      }

      // Verificação oficial de CNPJ Chave vs Destinatário
      const vCNPJ = chave.length === 44
        ? verifyChaveCNPJ(chave, rawEmitCnpj, rawDestCnpj)
        : {
            confrontoChaveXDest: 'NÃO INFORMADO' as const,
            statusLabel: 'Chave incompleta ou sem 44 dígitos',
            details: 'A chave de acesso não possui 44 dígitos válidos para verificação do CNPJ.',
            matchesEmitente: false,
            matchesDestinatario: false,
          }

      // Valor
      let valorTotal = 0
      if (nfe?.impostos?.valorTotal) {
        valorTotal = nfe.impostos.valorTotal
      } else if (parsed?.vNF) {
        const pVal = parseFloat(parsed.vNF.replace('.', '').replace(',', '.'))
        valorTotal = isNaN(pVal) ? 0 : pVal
      }

      const valorFormatted =
        valorTotal > 0
          ? `R$ ${valorTotal.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`
          : '-'

      const id = `${chave ? `${chave}_` : ''}${f.fileName || 'file'}_${index}`

      return {
        id,
        fileName: f.fileName || `Nota_${numero}.xml`,
        numero,
        serie,
        chave,
        chaveCnpjRaw,
        chaveCnpjFormatted,
        dataEmissao,
        emitNome,
        emitCNPJ: rawEmitCnpj,
        emitCNPJFormatted,
        destNome,
        destCNPJ: rawDestCnpj,
        destCNPJFormatted,
        valorTotal,
        valorFormatted,
        confronto: vCNPJ.confrontoChaveXDest,
        statusLabel: vCNPJ.statusLabel,
        statusDetails: vCNPJ.details,
        matchesEmitente: vCNPJ.matchesEmitente,
        matchesDestinatario: vCNPJ.matchesDestinatario,
        rawFile: f,
      }
    })
  }, [files])

  // Métricas agregadas
  const stats = useMemo(() => {
    const total = items.length
    const divergentes = items.filter((i) => i.confronto === 'DIVERGENTES')
    const conformes = items.filter((i) => i.confronto === 'IGUAIS')
    const naoInformados = items.filter((i) => i.confronto === 'NÃO INFORMADO')

    const valorTotal = items.reduce((acc, i) => acc + i.valorTotal, 0)
    const valorDivergentes = divergentes.reduce((acc, i) => acc + i.valorTotal, 0)
    const valorConformes = conformes.reduce((acc, i) => acc + i.valorTotal, 0)

    const pctDivergentes = total > 0 ? (divergentes.length / total) * 100 : 0
    const pctConformes = total > 0 ? (conformes.length / total) * 100 : 0
    const pctNaoInformados = total > 0 ? (naoInformados.length / total) * 100 : 0

    // Agrupamento por Destinatário
    const destGroup: Record<
      string,
      { destNome: string; divergentes: number; conformes: number; total: number }
    > = {}

    items.forEach((item) => {
      const dKey = item.destNome || 'Não Informado'
      if (!destGroup[dKey]) {
        destGroup[dKey] = { destNome: dKey, divergentes: 0, conformes: 0, total: 0 }
      }
      destGroup[dKey].total++
      if (item.confronto === 'DIVERGENTES') destGroup[dKey].divergentes++
      if (item.confronto === 'IGUAIS') destGroup[dKey].conformes++
    })

    const destChartData = Object.values(destGroup)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((d) => ({
        name: d.destNome.length > 22 ? d.destNome.slice(0, 20) + '...' : d.destNome,
        fullName: d.destNome,
        Divergentes: d.divergentes,
        Conformes: d.conformes,
        Total: d.total,
      }))

    // Agrupamento por Emitente
    const emitGroup: Record<string, { emitNome: string; divergentes: number; conformes: number }> = {}
    items.forEach((item) => {
      const eKey = item.emitNome || 'Não Informado'
      if (!emitGroup[eKey]) {
        emitGroup[eKey] = { emitNome: eKey, divergentes: 0, conformes: 0 }
      }
      if (item.confronto === 'DIVERGENTES') emitGroup[eKey].divergentes++
      if (item.confronto === 'IGUAIS') emitGroup[eKey].conformes++
    })

    const emitChartData = Object.values(emitGroup)
      .sort((a, b) => b.divergentes + b.conformes - (a.divergentes + a.conformes))
      .slice(0, 6)
      .map((e) => ({
        name: e.emitNome.length > 22 ? e.emitNome.slice(0, 20) + '...' : e.emitNome,
        fullName: e.emitNome,
        Divergentes: e.divergentes,
        Conformes: e.conformes,
      }))

    // Dados do gráfico de Rosca (Status Geral)
    const donutData = [
      { name: 'Conforme (Chave = Destinatário)', value: conformes.length, color: STATUS_COLORS.IGUAIS },
      { name: 'Divergente (Chave ≠ Destinatário)', value: divergentes.length, color: STATUS_COLORS.DIVERGENTES },
      ...(naoInformados.length > 0
        ? [{ name: 'Não Informado / Sem CNPJ', value: naoInformados.length, color: STATUS_COLORS['NÃO INFORMADO'] }]
        : []),
    ].filter((d) => d.value > 0)

    return {
      total,
      divergentes,
      conformes,
      naoInformados,
      valorTotal,
      valorDivergentes,
      valorConformes,
      pctDivergentes,
      pctConformes,
      pctNaoInformados,
      destChartData,
      emitChartData,
      donutData,
    }
  }, [items])

  // Listas únicas de destinatários e emitentes para os selects de filtro
  const destinatariosOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => set.add(i.destNome))
    return Array.from(set).sort()
  }, [items])

  const emitentesOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => set.add(i.emitNome))
    return Array.from(set).sort()
  }, [items])

  // Filtragem e ordenação dos itens da tabela
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Filtro por status
        if (filterStatus !== 'TODOS' && item.confronto !== filterStatus) {
          return false
        }
        // Filtro por destinatário selecionado
        if (selectedDestinatario !== 'TODOS' && item.destNome !== selectedDestinatario) {
          return false
        }
        // Filtro por emitente selecionado
        if (selectedEmitente !== 'TODOS' && item.emitNome !== selectedEmitente) {
          return false
        }
        // Busca textual
        if (searchTerm.trim()) {
          const s = searchTerm.toLowerCase().trim()
          const matchChave = item.chave.toLowerCase().includes(s)
          const matchNum = item.numero.toLowerCase().includes(s)
          const matchDest = item.destNome.toLowerCase().includes(s)
          const matchEmit = item.emitNome.toLowerCase().includes(s)
          const matchCnpjChave = item.chaveCnpjRaw.includes(s) || item.chaveCnpjFormatted.toLowerCase().includes(s)
          const matchCnpjDest = item.destCNPJ.includes(s) || item.destCNPJFormatted.toLowerCase().includes(s)
          const matchCnpjEmit = item.emitCNPJ.includes(s) || item.emitCNPJFormatted.toLowerCase().includes(s)
          return (
            matchChave ||
            matchNum ||
            matchDest ||
            matchEmit ||
            matchCnpjChave ||
            matchCnpjDest ||
            matchCnpjEmit
          )
        }
        return true
      })
      .sort((a, b) => {
        let comp = 0
        if (sortBy === 'status') {
          // Prioriza divergentes primeiro por padrão
          const order = { DIVERGENTES: 1, 'NÃO INFORMADO': 2, IGUAIS: 3 }
          comp = (order[a.confronto] || 9) - (order[b.confronto] || 9)
        } else if (sortBy === 'valor') {
          comp = b.valorTotal - a.valorTotal
        } else if (sortBy === 'numero') {
          comp = a.numero.localeCompare(b.numero, undefined, { numeric: true })
        }
        return sortOrder === 'asc' ? comp : -comp
      })
  }, [items, filterStatus, selectedDestinatario, selectedEmitente, searchTerm, sortBy, sortOrder])

  // Ações de cópia
  const handleCopyKey = (chave: string) => {
    if (!chave) return
    navigator.clipboard.writeText(chave)
    setCopiedKey(chave)
    setTimeout(() => setCopiedKey(null), 2500)
  }

  const handleCopyDivergentKeys = () => {
    const keys = stats.divergentes
      .map((i) => i.chave)
      .filter(Boolean)
      .join('\n')
    if (!keys) return
    navigator.clipboard.writeText(keys)
    setCopiedListMsg(`Copiadas ${stats.divergentes.length} chaves divergentes!`)
    setTimeout(() => setCopiedListMsg(null), 3000)
  }

  const handleCopyConformeKeys = () => {
    const keys = stats.conformes
      .map((i) => i.chave)
      .filter(Boolean)
      .join('\n')
    if (!keys) return
    navigator.clipboard.writeText(keys)
    setCopiedListMsg(`Copiadas ${stats.conformes.length} chaves conformes!`)
    setTimeout(() => setCopiedListMsg(null), 3000)
  }

  // Exportação Excel (.xlsx) com layout de auditoria
  const handleExportExcel = () => {
    if (items.length === 0) return

    const rows = filteredItems.map((item) => ({
      Status:
        item.confronto === 'DIVERGENTES'
          ? 'DIVERGENTE (Chave ≠ Destinatário)'
          : item.confronto === 'IGUAIS'
          ? 'CONFORME (Chave = Destinatário)'
          : 'NÃO INFORMADO',
      'Número NF': item.numero,
      Série: item.serie,
      'Data Emissão': item.dataEmissao,
      'Valor Total (R$)': item.valorTotal,
      'Chave de Acesso (44 dígitos)': item.chave,
      'CNPJ na Chave': item.chaveCnpjFormatted,
      'CNPJ Destinatário': item.destCNPJFormatted || 'Não Informado',
      'Destinatário (Razão Social)': item.destNome,
      'CNPJ Emitente': item.emitCNPJFormatted || 'Não Informado',
      'Emitente (Razão Social)': item.emitNome,
      'Chave Pertence ao Emitente?': item.matchesEmitente ? 'SIM' : 'NÃO',
      'Diagnóstico / Detalhes': item.statusDetails,
      Arquivo: item.fileName,
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)

    // Ajuste de largura das colunas
    ws['!cols'] = [
      { wch: 30 }, // Status
      { wch: 12 }, // Número
      { wch: 8 },  // Série
      { wch: 14 }, // Data
      { wch: 16 }, // Valor
      { wch: 48 }, // Chave
      { wch: 22 }, // CNPJ Chave
      { wch: 22 }, // CNPJ Dest
      { wch: 35 }, // Destinatário
      { wch: 22 }, // CNPJ Emit
      { wch: 35 }, // Emitente
      { wch: 25 }, // Pertence Emitente?
      { wch: 50 }, // Diagnóstico
      { wch: 30 }, // Arquivo
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Chave_vs_Destinatario')

    // Aba adicional com resumo das métricas
    const resumoData = [
      { Métrica: 'Total de Notas Analisadas', Quantidade: stats.total, 'Valor (R$)': stats.valorTotal },
      {
        Métrica: 'Notas Conformes (Chave = Destinatário)',
        Quantidade: stats.conformes.length,
        'Valor (R$)': stats.valorConformes,
      },
      {
        Métrica: 'Notas Divergentes (Chave ≠ Destinatário)',
        Quantidade: stats.divergentes.length,
        'Valor (R$)': stats.valorDivergentes,
      },
      {
        Métrica: 'Notas Sem CNPJ / Não Informado',
        Quantidade: stats.naoInformados.length,
        'Valor (R$)': 0,
      },
      {
        Métrica: 'Índice de Conformidade (%)',
        Quantidade: `${stats.pctConformes.toFixed(1)}%`,
        'Valor (R$)': '-',
      },
    ]
    const wsResumo = XLSX.utils.json_to_sheet(resumoData)
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo_Auditoria')

    XLSX.writeFile(
      wb,
      `Auditoria_Chave_vs_Destinatario_${new Date().toISOString().slice(0, 10)}.xlsx`
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-indigo-950 to-zinc-900 text-white shadow-lg border border-indigo-900/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <Scale className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Divergência: Chave vs Destinatário
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              Auditoria Fiscal e Logística
            </span>
          </div>
          <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed">
            Confronto analítico entre o CNPJ embutido na Chave de Acesso (44 dígitos, posições 7 a 20)
            e o CNPJ do Destinatário da nota fiscal, apresentando com precisão as notas conformes e divergentes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <Button
            type="button"
            size="sm"
            onClick={handleExportExcel}
            disabled={items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Exportar Excel (.xlsx)
          </Button>

          {stats.divergentes.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyDivergentKeys}
              className="bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border-rose-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar Chaves Divergentes
            </Button>
          )}
        </div>
      </div>

      {/* Alerta de Cópia em Lote */}
      {copiedListMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{copiedListMsg}</span>
        </div>
      )}

      {/* Cards de Métricas Principais (KPIs Interativos) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total de Notas */}
        <Card
          className={`cursor-pointer transition-all hover:border-indigo-400 dark:hover:border-indigo-700 ${
            filterStatus === 'TODOS' ? 'ring-2 ring-indigo-500 shadow-md' : 'shadow-xs'
          }`}
          onClick={() => setFilterStatus('TODOS')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Total de Notas Analisadas
            </CardTitle>
            <Layers className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">
              {stats.total}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center justify-between">
              <span>{stats.valorTotal > 0 ? `R$ ${stats.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '100% dos documentos'}</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">Ver todas</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Divergentes (Chave ≠ Destinatário) */}
        <Card
          className={`cursor-pointer transition-all hover:border-rose-400 dark:hover:border-rose-700 bg-rose-50/20 dark:bg-rose-950/10 ${
            filterStatus === 'DIVERGENTES' ? 'ring-2 ring-rose-500 shadow-md' : 'shadow-xs'
          }`}
          onClick={() => setFilterStatus('DIVERGENTES')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <span>Divergentes (Chave ≠ Dest.)</span>
            </CardTitle>
            <div className="p-1 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 flex items-baseline gap-2">
              <span>{stats.divergentes.length}</span>
              <span className="text-xs font-semibold text-rose-600/80">
                ({stats.pctDivergentes.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[11px] text-rose-700 dark:text-rose-400 mt-1 flex items-center justify-between">
              <span>
                {stats.valorDivergentes > 0
                  ? `R$ ${stats.valorDivergentes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'CNPJ Chave diverge do Dest.'}
              </span>
              <span className="font-bold underline">Filtrar</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Conformes (Chave = Destinatário) */}
        <Card
          className={`cursor-pointer transition-all hover:border-emerald-400 dark:hover:border-emerald-700 bg-emerald-50/20 dark:bg-emerald-950/10 ${
            filterStatus === 'IGUAIS' ? 'ring-2 ring-emerald-500 shadow-md' : 'shadow-xs'
          }`}
          onClick={() => setFilterStatus('IGUAIS')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <span>Conformes (Chave = Dest.)</span>
            </CardTitle>
            <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 flex items-baseline gap-2">
              <span>{stats.conformes.length}</span>
              <span className="text-xs font-semibold text-emerald-600/80">
                ({stats.pctConformes.toFixed(1)}%)
              </span>
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 flex items-center justify-between">
              <span>
                {stats.valorConformes > 0
                  ? `R$ ${stats.valorConformes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : 'Chave confere com Destinatário'}
              </span>
              <span className="font-bold underline">Filtrar</span>
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Índice de Conformidade */}
        <Card className="shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Taxa de Conformidade
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
              {stats.pctConformes.toFixed(1)}%
            </div>
            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full mt-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${stats.pctConformes}%` }}
                title={`Conformes: ${stats.pctConformes.toFixed(1)}%`}
              />
              <div
                className="bg-rose-500 h-full transition-all duration-500"
                style={{ width: `${stats.pctDivergentes}%` }}
                title={`Divergentes: ${stats.pctDivergentes.toFixed(1)}%`}
              />
              <div
                className="bg-amber-400 h-full transition-all duration-500"
                style={{ width: `${stats.pctNaoInformados}%` }}
                title={`Não informados: ${stats.pctNaoInformados.toFixed(1)}%`}
              />
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5 flex justify-between">
              <span>{stats.conformes.length} conf.</span>
              <span>{stats.divergentes.length} div.</span>
              {stats.naoInformados.length > 0 && <span>{stats.naoInformados.length} s/ CNPJ</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos em Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico 1: Rosca de Status Geral */}
        <Card className="lg:col-span-4 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Proporção Geral</span>
              <span className="text-[11px] font-normal text-zinc-500">
                {stats.total} documento(s)
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Confronto direto Chave de Acesso x Destinatário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              {stats.donutData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  Nenhuma nota para exibir
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      cursor="pointer"
                      onClick={(entry) => {
                        if (entry.name.includes('Conforme')) setFilterStatus('IGUAIS')
                        else if (entry.name.includes('Divergente')) setFilterStatus('DIVERGENTES')
                        else setFilterStatus('NÃO INFORMADO')
                      }}
                    >
                      {stats.donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${value} nota(s) (${((Number(value) / (stats.total || 1)) * 100).toFixed(1)}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Legenda Customizada */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterStatus('IGUAIS')}
                className="w-full flex items-center justify-between text-left p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300">Conformes</span>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.conformes.length} ({stats.pctConformes.toFixed(0)}%)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterStatus('DIVERGENTES')}
                className="w-full flex items-center justify-between text-left p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-zinc-700 dark:text-zinc-300">Divergentes</span>
                </div>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {stats.divergentes.length} ({stats.pctDivergentes.toFixed(0)}%)
                </span>
              </button>

              {stats.naoInformados.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterStatus('NÃO INFORMADO')}
                  className="w-full flex items-center justify-between text-left p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-zinc-700 dark:text-zinc-300">Sem CNPJ / Não Informado</span>
                  </div>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {stats.naoInformados.length} ({stats.pctNaoInformados.toFixed(0)}%)
                  </span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Divergências por Destinatário */}
        <Card className="lg:col-span-8 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Confronto por Destinatário (Top 8)</span>
              <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400">
                Barras empilhadas (Conforme vs Divergente)
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Veja quais destinatários concentram as notas com chave divergente ou conforme
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[270px]">
              {stats.destChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-zinc-400">
                  Nenhum destinatário com dados suficientes
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.destChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    onClick={(entry: any) => {
                      if (entry && entry.activePayload && entry.activePayload.length > 0) {
                        const payload = entry.activePayload[0].payload
                        setSelectedDestinatario(payload.fullName)
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(val, name, props) => [
                        `${val} nota(s)`,
                        name === 'Divergentes' ? '❌ Divergentes' : '✅ Conformes',
                      ]}
                      labelFormatter={(label, payload) => {
                        if (payload && payload.length > 0) {
                          return payload[0].payload.fullName
                        }
                        return label
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="Conformes"
                      fill={STATUS_COLORS.IGUAIS}
                      stackId="a"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="Divergentes"
                      fill={STATUS_COLORS.DIVERGENTES}
                      stackId="a"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca em Tempo Real */}
      <Card className="shadow-xs border border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Toggles Rápidos de Status */}
            <div className="flex items-center gap-1.5 flex-wrap w-full md:w-auto">
              <Button
                type="button"
                size="sm"
                variant={filterStatus === 'TODOS' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('TODOS')}
                className={`text-xs h-8 cursor-pointer ${
                  filterStatus === 'TODOS' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold' : ''
                }`}
              >
                Todas ({stats.total})
              </Button>

              <Button
                type="button"
                size="sm"
                variant={filterStatus === 'DIVERGENTES' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('DIVERGENTES')}
                className={`text-xs h-8 cursor-pointer flex items-center gap-1.5 ${
                  filterStatus === 'DIVERGENTES'
                    ? 'bg-rose-600 hover:bg-rose-700 text-white font-bold'
                    : 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                }`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Divergentes ({stats.divergentes.length})
              </Button>

              <Button
                type="button"
                size="sm"
                variant={filterStatus === 'IGUAIS' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('IGUAIS')}
                className={`text-xs h-8 cursor-pointer flex items-center gap-1.5 ${
                  filterStatus === 'IGUAIS'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold'
                    : 'text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Conformes ({stats.conformes.length})
              </Button>

              {stats.naoInformados.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={filterStatus === 'NÃO INFORMADO' ? 'default' : 'outline'}
                  onClick={() => setFilterStatus('NÃO INFORMADO')}
                  className={`text-xs h-8 cursor-pointer ${
                    filterStatus === 'NÃO INFORMADO'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white font-bold'
                      : 'text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  Sem CNPJ ({stats.naoInformados.length})
                </Button>
              )}
            </div>

            {/* Ordenação */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <span className="text-xs text-zinc-500 whitespace-nowrap">Ordenar por:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
              >
                <option value="status">Status (Divergentes Primeiro)</option>
                <option value="numero">Número da NF</option>
                <option value="valor">Valor Total (R$)</option>
              </select>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="h-8 w-8 p-0 cursor-pointer"
                title={sortOrder === 'asc' ? 'Ordem Crescente' : 'Ordem Decrescente'}
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500" />
              </Button>
            </div>
          </div>

          {/* Campo de Busca e Filtros de Empresa */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-1">
            <div className="relative md:col-span-6">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Pesquisar por número NF, chave 44 dígitos, CNPJ ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-zinc-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedDestinatario}
                onChange={(e) => setSelectedDestinatario(e.target.value)}
                className="w-full text-xs h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 focus:outline-hidden text-zinc-700 dark:text-zinc-300"
              >
                <option value="TODOS">Todos os Destinatários ({destinatariosOptions.length})</option>
                {destinatariosOptions.map((dest, idx) => (
                  <option key={`dest-opt-${idx}-${dest}`} value={dest}>
                    {dest.length > 30 ? dest.slice(0, 28) + '...' : dest}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <select
                value={selectedEmitente}
                onChange={(e) => setSelectedEmitente(e.target.value)}
                className="w-full text-xs h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 focus:outline-hidden text-zinc-700 dark:text-zinc-300"
              >
                <option value="TODOS">Todos os Emitentes ({emitentesOptions.length})</option>
                {emitentesOptions.map((emit, idx) => (
                  <option key={`emit-opt-${idx}-${emit}`} value={emit}>
                    {emit.length > 30 ? emit.slice(0, 28) + '...' : emit}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista / Tabela Detalhada com Confronto Visual */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
          <span>
            Exibindo <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> nota(s) fiscal(is)
          </span>
          {(searchTerm || filterStatus !== 'TODOS' || selectedDestinatario !== 'TODOS' || selectedEmitente !== 'TODOS') && (
            <button
              type="button"
              onClick={() => {
                setFilterStatus('TODOS')
                setSearchTerm('')
                setSelectedDestinatario('TODOS')
                setSelectedEmitente('TODOS')
              }}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
            >
              Limpar todos os filtros
            </button>
          )}
        </div>

        {filteredItems.length === 0 ? (
          <Card className="text-center py-12 border-dashed">
            <CardContent className="space-y-2">
              <Scale className="h-10 w-10 text-zinc-400 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhuma nota fiscal encontrada para os filtros selecionados
              </p>
              <p className="text-xs text-zinc-500">
                Tente alterar o termo de busca ou selecionar &quot;Todas&quot; no filtro de status.
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((item, itemIdx) => {
            const isDivergent = item.confronto === 'DIVERGENTES'
            const isConforme = item.confronto === 'IGUAIS'
            const isExpanded = expandedId === item.id
            const isCopied = copiedKey === item.chave

            return (
              <Card
                key={item.id || `chave-card-${itemIdx}`}
                className={`transition-all shadow-xs border ${
                  isDivergent
                    ? 'border-rose-300 dark:border-rose-900 bg-rose-50/15 dark:bg-rose-950/10 hover:border-rose-400'
                    : isConforme
                    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/10 dark:bg-emerald-950/5 hover:border-emerald-300'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
              >
                <div className="p-4 space-y-3">
                  {/* Linha Superior: Status Badge + Dados Básicos da NF */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {/* Status Badge */}
                      {isDivergent ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs">
                          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          DIVERGENTE (Chave ≠ Destinatário)
                        </span>
                      ) : isConforme ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          CONFORME (Chave = Destinatário)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <HelpCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          NÃO INFORMADO (Sem CNPJ)
                        </span>
                      )}

                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        NF-e Nº {item.numero}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        Série: {item.serie}
                      </span>
                      <span className="text-[11px] text-zinc-400">•</span>
                      <span className="text-[11px] text-zinc-500">
                        Emissão: {item.dataEmissao}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {item.valorFormatted}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="h-7 px-2 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            Menos detalhes <ChevronUp className="h-3.5 w-3.5 ml-1" />
                          </>
                        ) : (
                          <>
                            Ver confronto <ChevronDown className="h-3.5 w-3.5 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Confronto Visual Lado a Lado dos 3 CNPJs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 p-3 rounded-xl bg-zinc-50/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80">
                    {/* Coluna 1: CNPJ na Chave de Acesso */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5">
                        <KeyRound className="h-3.5 w-3.5 text-indigo-500" />
                        <span>CNPJ na Chave de Acesso</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {item.chaveCnpjFormatted}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.chave.length === 44 ? (
                          item.matchesEmitente ? (
                            <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                              Pertence ao Emitente (Padrão NF-e)
                            </span>
                          ) : item.matchesDestinatario ? (
                            <span className="text-emerald-600 font-semibold">
                              Pertence ao Destinatário
                            </span>
                          ) : (
                            <span className="text-rose-600 font-semibold">
                              Diverge de Ambos
                            </span>
                          )
                        ) : (
                          'Chave incompleta'
                        )}
                      </div>
                    </div>

                    {/* Coluna 2: CNPJ do Destinatário */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                        <span>CNPJ Destinatário</span>
                      </div>
                      <div
                        className={`font-mono text-xs font-bold ${
                          isDivergent
                            ? 'text-rose-600 dark:text-rose-400'
                            : isConforme
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-zinc-900 dark:text-zinc-100'
                        }`}
                      >
                        {item.destCNPJFormatted || 'Não Informado'}
                      </div>
                      <div className="text-[11px] text-zinc-800 dark:text-zinc-200 font-medium truncate" title={item.destNome}>
                        {item.destNome}
                      </div>
                    </div>

                    {/* Coluna 3: CNPJ do Emitente */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>CNPJ Emitente</span>
                      </div>
                      <div className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        {item.emitCNPJFormatted || 'Não Informado'}
                      </div>
                      <div className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate" title={item.emitNome}>
                        {item.emitNome}
                      </div>
                    </div>
                  </div>

                  {/* Diagnóstico em linha */}
                  <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 gap-2">
                    <div className="flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="text-[11px]">{item.statusDetails}</span>
                    </div>

                    {/* Botão de Copiar Chave */}
                    {item.chave && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyKey(item.chave)}
                        className="h-6 px-2 text-[11px] font-mono text-zinc-500 hover:text-zinc-900 cursor-pointer shrink-0"
                      >
                        {isCopied ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-sans font-bold">
                            <Check className="h-3 w-3" /> Copiado!
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copiar Chave
                          </span>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Seção Expandida: Chave Completa e Justificativa Fiscal */}
                  {isExpanded && (
                    <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs animate-fadeIn">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">
                          Chave de Acesso Completa (44 Dígitos):
                        </span>
                        <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-900 font-mono text-xs text-zinc-800 dark:text-zinc-200 break-all select-all border border-zinc-200 dark:border-zinc-800">
                          {item.chave || 'Chave não informada no documento'}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1 p-2.5 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60">
                          <span className="font-bold text-zinc-700 dark:text-zinc-300 block">
                            Regra Fiscal da Chave de Acesso:
                          </span>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            No manual de integração da SEFAZ, os dígitos 07 a 20 da chave representam
                            o <strong>CNPJ do Emitente</strong> que gerou a NF-e. Em operações mercantis normais
                            de venda, a chave sempre levará o CNPJ da Usina/Emitente, gerando uma divergência técnica
                            com o CNPJ do comprador (destinatário).
                          </p>
                        </div>

                        <div className="space-y-1 p-2.5 rounded bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60">
                          <span className="font-bold text-zinc-700 dark:text-zinc-300 block">
                            Ação do Auditor / Conferente:
                          </span>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {isDivergent ? (
                              <span>
                                Se a operação for uma remessa interna ou transferência entre filiais onde a chave
                                deveria ser do destinatário, certifique-se da filial correta. Se for venda normal, a
                                divergência é justificada pela emissão própria da usina.
                              </span>
                            ) : (
                              <span>
                                Nota 100% conforme: O CNPJ emitente na chave coincide com a filial ou razão social
                                do destinatário declarado.
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {onSelectFile && (
                        <div className="pt-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onSelectFile(item.rawFile)}
                            className="text-xs h-7 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                          >
                            Abrir Nota na Lista Principal
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
