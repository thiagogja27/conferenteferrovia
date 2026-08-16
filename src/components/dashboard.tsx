"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseNFE, type NFEData } from "@/lib/nfe-parser"
import { type ParsedNFeData } from "@/lib/pdf-text-parser"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  Building2,
  Truck,
  Package,
  MapPin,
  Search,
  Download,
  Copy,
  Check,
  MousePointerClick,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react"
import * as XLSX from "xlsx"

export interface DashboardFileItem {
  fileName?: string
  filePath?: string
  originalPath?: string
  xmlContent?: string
  xmlGerado?: string
  nfeData: NFEData | null
  parsedData?: ParsedNFeData | null
}

interface DashboardProps {
  files: DashboardFileItem[]
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884d8",
  "#82ca9d",
  "#ff7300",
  "#a4de6c",
  "#d0ed57",
  "#83a6ed",
]

function getNoteDetails(f: DashboardFileItem) {
  let nfe = f.nfeData
  const parsed = f.parsedData
  const rawXml = f.xmlContent || f.xmlGerado || ""

  if (!nfe && rawXml) {
    try {
      nfe = parseNFE(rawXml)
    } catch (e) {}
  }

  const numero = nfe?.numero || parsed?.nNF || "S/N"
  const serie = nfe?.serie || parsed?.serie || "1"
  const chave = nfe?.chaveAcesso || parsed?.chave || "Sem Chave"
  const dataEmissao = nfe?.dataEmissao || parsed?.dhEmi || "Não informada"

  let emitNome = "Não informado"
  if (nfe?.emitente?.nome && nfe.emitente.nome !== "EMITENTE NÃO IDENTIFICADO") {
    emitNome = nfe.emitente.nome
  } else if (parsed?.emitNome) {
    emitNome = parsed.emitNome
  }

  const emitCNPJ = nfe?.emitente?.cnpj || parsed?.emitCNPJ || ""

  let destNome = "Não informado"
  if (nfe?.destinatario?.nome && nfe.destinatario.nome !== "DESTINATÁRIO NÃO IDENTIFICADO") {
    destNome = nfe.destinatario.nome
  } else if (parsed?.destNome && parsed.destNome !== "DESTINATÁRIO NÃO IDENTIFICADO") {
    destNome = parsed.destNome
  }

  const destCNPJ = nfe?.destinatario?.cpfCnpj || parsed?.destCNPJ || ""
  const infCpl = nfe?.informacoesComplementares || parsed?.infCpl || rawXml || ""

  // Normalizações inteligentes para garantir exibição precisa no Dashboard
  if (/CORURIPE/i.test(destNome) || /12\.?229\.?415/i.test(destCNPJ) || /12229415/i.test(destCNPJ) || /CORURIPE/i.test(infCpl)) {
    destNome = "S/A USINA CORURIPE ACUCAR E ALCOOL"
  } else if (destNome === "Não informado" || destNome === "DESTINATÁRIO NÃO IDENTIFICADO" || /DESTINAT/i.test(destNome)) {
    if (/CARGILL/i.test(infCpl) || /CARGILL/i.test(rawXml)) {
      destNome = "CARGILL AGRICOLA SA"
    } else if (/COPERSUCAR/i.test(infCpl) || /COPERSUCAR/i.test(rawXml)) {
      destNome = "COPERSUCAR S.A."
    } else if (/RAIZEN|RAÍZEN/i.test(infCpl) || /RAIZEN/i.test(rawXml)) {
      destNome = "RAIZEN ENERGIA S.A."
    } else if (/SAO MARTINHO|SÃO MARTINHO/i.test(infCpl) || /SAO MARTINHO/i.test(rawXml)) {
      destNome = "USINA SAO MARTINHO S/A"
    } else if (/ADECOAGRO/i.test(infCpl) || /ADECOAGRO/i.test(rawXml)) {
      destNome = "ADECOAGRO VALE DO IVINHEMA S.A."
    } else if (/ALTA MOGIANA/i.test(infCpl) || /ALTA MOGIANA/i.test(rawXml)) {
      destNome = "USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL"
    } else if (/BATATAIS/i.test(infCpl) || /BATATAIS/i.test(rawXml)) {
      destNome = "USINA BATATAIS S/A ACUCAR E ALCOOL"
    } else if (/TEREOS|GUARANI/i.test(infCpl) || /TEREOS/i.test(rawXml)) {
      destNome = "TEREOS ACUCAR E ENERGIA BRASIL S.A."
    } else if (/BP BUNGE/i.test(infCpl) || /BP BUNGE/i.test(rawXml)) {
      destNome = "BP BUNGE BIOENERGIA S.A."
    } else if (destCNPJ) {
      destNome = `DESTINATÁRIO (${destCNPJ})`
    }
  }

  let produto = "Outros"
  if (nfe?.tipoProduto && nfe.tipoProduto !== "OUTRO") {
    produto = nfe.tipoProduto
  } else if (parsed?.prodNome) {
    produto = parsed.prodNome
  }

  let terminal = nfe?.terminalEntrega || parsed?.terminalEntrega || "Não Informado"
  let transbordo = nfe?.transbordo || parsed?.transbordo || "Não Informado"

  if (transbordo === "Não Informado" || !transbordo) {
    if (/ITURAMA/i.test(infCpl)) transbordo = "ITURAMA"
    else if (/ALTO\s*TAQUARI/i.test(infCpl)) transbordo = "ALTO TAQUARI"
    else if (/RONDONOPOLIS|RONDONÓPOLIS/i.test(infCpl)) transbordo = "RONDONOPOLIS"
    else if (/RIO\s*VERDE/i.test(infCpl)) transbordo = "RIO VERDE"
    else if (/ARAGUARI/i.test(infCpl)) transbordo = "ARAGUARI"
    else if (/UBERABA/i.test(infCpl)) transbordo = "UBERABA"
    else if (/PEDERNEIRAS/i.test(infCpl)) transbordo = "PEDERNEIRAS"
    else if (/GUARA|GUARÁ/i.test(infCpl)) transbordo = "GUARA"
  }

  if (terminal === "Não Informado" || !terminal) {
    if (/TEAG|TERM.*EXPORTACAO.*ACUCAR.*GUARU/i.test(infCpl)) {
      terminal = "TEAG - TERMINAL DE ACUCAR DO GUARUJA"
    } else if (/TEG\b|TERMINAL.*EXPORTADORES.*GRANDE/i.test(infCpl)) {
      terminal = "TEG - TERMINAL DE EXPORTAÇÃO DO GUARUJÁ"
    } else if (/CLI|TERMARES/i.test(infCpl)) {
      terminal = "CLI - CORREDOR LOGÍSTICA INTEGRADA"
    } else if (/T-124|T124/i.test(infCpl)) {
      terminal = "TERMINAL 124"
    } else if (/RUMO/i.test(infCpl)) {
      terminal = "TERMINAL RUMO"
    } else if (/VLI/i.test(infCpl)) {
      terminal = "TERMINAL VLI"
    }
  }

  let valorNum = 0
  if (nfe?.impostos?.valorTotal) {
    valorNum = nfe.impostos.valorTotal
  } else if (parsed?.vNF) {
    const parsedVal = parseFloat(parsed.vNF.replace(".", "").replace(",", "."))
    valorNum = isNaN(parsedVal) ? 0 : parsedVal
  }

  const valorFormatted =
    valorNum > 0
      ? `R$ ${valorNum.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : "-"

  let pesoNum = 0
  if (nfe?.transportador?.pesoBruto) {
    pesoNum = nfe.transportador.pesoBruto
  } else if (parsed?.transpPesoB) {
    const parsedPeso = parseFloat(parsed.transpPesoB.replace(".", "").replace(",", "."))
    pesoNum = isNaN(parsedPeso) ? 0 : parsedPeso
  }

  const pesoFormatted = pesoNum > 0 ? `${pesoNum.toLocaleString("pt-BR")} kg` : "-"

  const placa = nfe?.transportador?.placaVeiculo || ""
  const motorista = ""

  return {
    fileName: f.fileName || "Nota Fiscal",
    numero,
    serie,
    chave,
    dataEmissao,
    emitNome,
    emitCNPJ,
    destNome,
    destCNPJ,
    produto,
    terminal,
    transbordo,
    valorNum,
    valorFormatted,
    pesoNum,
    pesoFormatted,
    infCpl,
    placa,
    motorista,
  }
}

export function Dashboard({ files }: DashboardProps) {
  const [selectedGroup, setSelectedGroup] = useState<{
    category: string
    fullName: string
    files: DashboardFileItem[]
  } | null>(null)

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [modalSearch, setModalSearch] = useState("")
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const stats = useMemo(() => {
    const validFiles = files.filter(
      (f) => f.nfeData !== null || (f.parsedData && f.parsedData !== null)
    )

    // Contadores e Listas de arquivos por chave
    const destinatarioCount: Record<string, number> = {}
    const destinatarioFiles: Record<string, DashboardFileItem[]> = {}

    const terminalCount: Record<string, number> = {}
    const terminalFiles: Record<string, DashboardFileItem[]> = {}

    const produtoCount: Record<string, number> = {}
    const produtoFiles: Record<string, DashboardFileItem[]> = {}

    const transbordoCount: Record<string, number> = {}
    const transbordoFiles: Record<string, DashboardFileItem[]> = {}

    validFiles.forEach((f) => {
      const details = getNoteDetails(f)

      // Destinatário
      const destKey = details.destNome
      destinatarioCount[destKey] = (destinatarioCount[destKey] || 0) + 1
      if (!destinatarioFiles[destKey]) destinatarioFiles[destKey] = []
      destinatarioFiles[destKey].push(f)

      // Terminal
      const termKey = details.terminal
      terminalCount[termKey] = (terminalCount[termKey] || 0) + 1
      if (!terminalFiles[termKey]) terminalFiles[termKey] = []
      terminalFiles[termKey].push(f)

      // Produto
      const prodFullKey = details.produto
      produtoCount[prodFullKey] = (produtoCount[prodFullKey] || 0) + 1
      if (!produtoFiles[prodFullKey]) produtoFiles[prodFullKey] = []
      produtoFiles[prodFullKey].push(f)

      // Transbordo
      const transKey = details.transbordo
      transbordoCount[transKey] = (transbordoCount[transKey] || 0) + 1
      if (!transbordoFiles[transKey]) transbordoFiles[transKey] = []
      transbordoFiles[transKey].push(f)
    })

    const toChartData = (
      counts: Record<string, number>,
      filesMap: Record<string, DashboardFileItem[]>
    ) =>
      Object.entries(counts)
        .map(([name, value]) => ({
          name: name.length > 30 ? name.substring(0, 28) + "..." : name,
          fullName: name,
          value,
          relatedFiles: filesMap[name] || [],
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)

    return {
      totalNotas: validFiles.length,
      allFiles: validFiles,
      destinatarios: toChartData(destinatarioCount, destinatarioFiles),
      terminais: toChartData(terminalCount, terminalFiles),
      produtos: toChartData(produtoCount, produtoFiles),
      transbordos: toChartData(transbordoCount, transbordoFiles),
    }
  }, [files])

  const handleChartClick = (categoryLabel: string, entry: any) => {
    if (!entry) return
    const payload = entry.payload || entry
    const fullName = payload.fullName || payload.name || "Detalhes"
    const relatedFiles = payload.relatedFiles || []

    if (relatedFiles.length > 0) {
      setSelectedGroup({
        category: categoryLabel,
        fullName,
        files: relatedFiles,
      })
      setModalSearch("")
      setExpandedIndex(null)
    }
  }

  const handleCopyKey = (chave: string) => {
    if (!chave || chave === "Sem Chave") return
    navigator.clipboard.writeText(chave)
    setCopiedKey(chave)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const filteredGroupFiles = useMemo(() => {
    if (!selectedGroup) return []
    if (!modalSearch.trim()) return selectedGroup.files

    const term = modalSearch.toLowerCase().trim()
    return selectedGroup.files.filter((f) => {
      const d = getNoteDetails(f)
      return (
        d.numero.toLowerCase().includes(term) ||
        d.chave.toLowerCase().includes(term) ||
        d.emitNome.toLowerCase().includes(term) ||
        d.emitCNPJ.toLowerCase().includes(term) ||
        d.destNome.toLowerCase().includes(term) ||
        d.destCNPJ.toLowerCase().includes(term) ||
        d.produto.toLowerCase().includes(term) ||
        d.terminal.toLowerCase().includes(term) ||
        d.transbordo.toLowerCase().includes(term) ||
        d.infCpl.toLowerCase().includes(term)
      )
    })
  }, [selectedGroup, modalSearch])

  const handleExportGroupExcel = () => {
    if (!selectedGroup) return

    const dataToExport = filteredGroupFiles.map((f, idx) => {
      const d = getNoteDetails(f)
      return {
        Item: idx + 1,
        "Número da Nota": d.numero,
        Série: d.serie,
        "Chave de Acesso": d.chave,
        "Data de Emissão": d.dataEmissao,
        Emitente: d.emitNome,
        "CNPJ Emitente": d.emitCNPJ,
        Destinatário: d.destNome,
        "CNPJ Destinatário": d.destCNPJ,
        Produto: d.produto,
        "Terminal de Entrega": d.terminal,
        Transbordo: d.transbordo,
        "Valor Total (R$)": d.valorNum,
        "Peso Bruto (kg)": d.pesoNum,
        "Placa Veículo": d.placa,
        Motorista: d.motorista,
        "Informações Complementares": d.infCpl,
      }
    })

    const ws = XLSX.utils.json_to_sheet(dataToExport)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Notas do Gráfico")

    const cleanName = selectedGroup.fullName
      .replace(/[/\\?%*:|"<>]/g, "_")
      .substring(0, 20)
    XLSX.writeFile(
      wb,
      `notas_${selectedGroup.category.toLowerCase()}_${cleanName}.xlsx`
    )
  }

  if (files.filter((f) => f.nfeData !== null || (f.parsedData && f.parsedData !== null)).length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Banner explicativo de interação */}
      <div className="p-3.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-900 dark:text-indigo-200">
        <div className="flex items-center gap-2.5">
          <MousePointerClick className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-bounce" />
          <span>
            <strong>Dica Interativa:</strong> Clique em qualquer barra ou fatia dos gráficos abaixo para abrir a lista detalhada com todas as notas fiscais correspondentes.
          </span>
        </div>
        <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-indigo-900 px-2.5 py-1 rounded-md shadow-xs border border-indigo-200 dark:border-indigo-700 shrink-0">
          Interativo
        </span>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:border-indigo-400 transition-all shadow-xs"
          onClick={() => {
            if (stats.allFiles.length > 0) {
              setSelectedGroup({
                category: "Geral",
                fullName: "Todas as Notas Processadas",
                files: stats.allFiles,
              })
              setModalSearch("")
              setExpandedIndex(null)
            }
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Notas</CardTitle>
            <Package className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalNotas}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Clique para ver todas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Destinatários</CardTitle>
            <Building2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.destinatarios.length}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Top destinatários</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terminais</CardTitle>
            <MapPin className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.terminais.length}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Pontos de entrega</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transbordos</CardTitle>
            <Truck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.transbordos.length}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Locais identificados</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos em Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Gráfico de Produtos */}
        <Card className="hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Notas por Produto</span>
              <span className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">
                Clique na fatia
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.produtos}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={85}
                    fill="#8884d8"
                    dataKey="value"
                    className="cursor-pointer"
                    onClick={(entry) => handleChartClick("Produto", entry)}
                  >
                    {stats.produtos.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => handleChartClick("Produto", entry)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _, props) => [
                      `${value} nota(s)`,
                      props.payload.fullName,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Destinatários */}
        <Card className="hover:border-blue-300 dark:hover:border-blue-800 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Notas por Destinatário</span>
              <span className="text-[11px] font-normal text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                Clique na barra
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.destinatarios}
                  layout="vertical"
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload.length > 0) {
                      handleChartClick("Destinatário", state.activePayload[0].payload)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={160}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, _, props) => [
                      `${value} nota(s)`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    fill="#0088FE"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(entry) => handleChartClick("Destinatário", entry)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Terminais de Entrega */}
        <Card className="hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Notas por Terminal de Entrega</span>
              <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                Clique na barra
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.terminais}
                  layout="vertical"
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload.length > 0) {
                      handleChartClick("Terminal de Entrega", state.activePayload[0].payload)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={160}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, _, props) => [
                      `${value} nota(s)`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    fill="#00C49F"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(entry) => handleChartClick("Terminal de Entrega", entry)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Transbordos */}
        <Card className="hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Notas por Transbordo</span>
              <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded">
                Clique na barra
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.transbordos}
                  layout="vertical"
                  onClick={(state: any) => {
                    if (state && state.activePayload && state.activePayload.length > 0) {
                      handleChartClick("Transbordo", state.activePayload[0].payload)
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={160}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value, _, props) => [
                      `${value} nota(s)`,
                      props.payload.fullName,
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    fill="#FFBB28"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(entry) => handleChartClick("Transbordo", entry)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de Notas do Gráfico */}
      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6 overflow-hidden bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800">
          <DialogHeader className="pb-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pr-6">
              <div>
                <DialogTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    Notas de {selectedGroup?.category}:{" "}
                    <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                      {selectedGroup?.fullName}
                    </span>
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Exibindo {filteredGroupFiles.length} de {selectedGroup?.files.length} nota(s) fiscal(is) deste grupo.
                </DialogDescription>
              </div>

              <Button
                type="button"
                onClick={handleExportGroupExcel}
                variant="outline"
                size="sm"
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-medium text-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Exportar Lista Excel (.xlsx)
              </Button>
            </div>
          </DialogHeader>

          {/* Campo de Busca no Modal */}
          <div className="py-3 border-b border-zinc-100 dark:border-zinc-900">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="Filtrar por Número, Chave, Emitente, Destinatário, Produto, Terminal..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>

          {/* Lista de Notas do Modal */}
          <div className="flex-1 overflow-y-auto pr-1 py-2 space-y-3">
            {filteredGroupFiles.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                Nenhuma nota encontrada para o filtro &quot;{modalSearch}&quot;.
              </div>
            ) : (
              filteredGroupFiles.map((file, idx) => {
                const note = getNoteDetails(file)
                const isExpanded = expandedIndex === idx

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900 transition-all shadow-xs space-y-2"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 font-bold text-xs">
                          NF nº {note.numero} (Série {note.serie})
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Emissão: <strong>{note.dataEmissao}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {note.valorFormatted !== "-" && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                            {note.valorFormatted}
                          </span>
                        )}
                        {note.pesoFormatted !== "-" && (
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800">
                            {note.pesoFormatted}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                          className="h-7 px-2 text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              Menos Detalhes <ChevronUp className="h-3.5 w-3.5 ml-1" />
                            </>
                          ) : (
                            <>
                              Ver Detalhes <ChevronDown className="h-3.5 w-3.5 ml-1" />
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Dados principais */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                          Emitente
                        </span>
                        <p
                          className="font-medium text-zinc-800 dark:text-zinc-200 truncate"
                          title={note.emitNome}
                        >
                          {note.emitNome}
                        </p>
                        {note.emitCNPJ && (
                          <p className="text-[11px] text-zinc-500">CNPJ: {note.emitCNPJ}</p>
                        )}
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                          Destinatário
                        </span>
                        <p
                          className="font-medium text-zinc-800 dark:text-zinc-200 truncate"
                          title={note.destNome}
                        >
                          {note.destNome}
                        </p>
                        {note.destCNPJ && (
                          <p className="text-[11px] text-zinc-500">CNPJ: {note.destCNPJ}</p>
                        )}
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                          Produto
                        </span>
                        <p
                          className="font-medium text-zinc-800 dark:text-zinc-200 truncate"
                          title={note.produto}
                        >
                          {note.produto}
                        </p>
                      </div>

                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase font-bold">
                          Terminal / Transbordo
                        </span>
                        <p
                          className="font-medium text-zinc-800 dark:text-zinc-200 truncate"
                          title={`${note.terminal} | ${note.transbordo}`}
                        >
                          {note.terminal}{" "}
                          {note.transbordo !== "Não Informado" ? `/ ${note.transbordo}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Copiar Chave de Acesso */}
                    {note.chave && note.chave !== "Sem Chave" && (
                      <div className="pt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                          Chave: {note.chave}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyKey(note.chave)}
                          className="h-6 px-2 text-[10px] font-medium border-zinc-300 dark:border-zinc-700 cursor-pointer"
                        >
                          {copiedKey === note.chave ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600 mr-1" />
                              Copiada!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 text-zinc-500 mr-1" />
                              Copiar Chave
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Seção Expandida com Informações Adicionais */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950 p-3 rounded-lg">
                        {note.placa && (
                          <p>
                            <strong>Placa do Veículo:</strong> {note.placa}
                          </p>
                        )}
                        {note.motorista && (
                          <p>
                            <strong>Motorista:</strong> {note.motorista}
                          </p>
                        )}
                        {note.infCpl && (
                          <div>
                            <strong className="block mb-0.5 text-zinc-500">
                              Informações Complementares:
                            </strong>
                            <p className="bg-zinc-50 dark:bg-zinc-900 p-2 rounded text-[11px] font-mono whitespace-pre-wrap max-h-36 overflow-y-auto border border-zinc-200 dark:border-zinc-800">
                              {note.infCpl}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
