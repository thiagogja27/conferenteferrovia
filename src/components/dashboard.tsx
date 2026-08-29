"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseNFE, type NFEData } from "@/lib/nfe-parser"
import { type ParsedNFeData } from "@/lib/pdf-text-parser"
import {
  auditarLogisticaComIA,
  type LogisticsAuditInputItem,
  type LogisticsAuditResultItem,
  type NoteLogisticsOverride,
} from "@/lib/logistics-ai-auditor"
import {
  sanitizeDestinatarioNome,
  formatCNPJ,
  extractCNPJFilial,
} from "@/lib/destinatario-utils"

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
  Sparkles,
  Bot,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Wand2,
} from "lucide-react"
import * as XLSX from "xlsx"

export interface DashboardFileItem {
  fileName?: string
  filePath?: string
  originalPath?: string
  xmlContent?: string
  xmlGerado?: string
  rawSnippet?: string
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

export function getNoteDetails(
  f: DashboardFileItem,
  overrides?: Record<string, NoteLogisticsOverride>
) {
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

  const rawDestNome =
    nfe?.destinatario?.nome && nfe.destinatario.nome !== "DESTINATÁRIO NÃO IDENTIFICADO"
      ? nfe.destinatario.nome
      : parsed?.destNome && parsed.destNome !== "DESTINATÁRIO NÃO IDENTIFICADO"
      ? parsed.destNome
      : ""

  const rawDestCnpj = nfe?.destinatario?.cpfCnpj || parsed?.destCNPJ || ""
  const infCpl = nfe?.informacoesComplementares || parsed?.infCpl || rawXml || f.rawSnippet || ""

  let destNome = sanitizeDestinatarioNome(
    rawDestNome,
    rawDestCnpj,
    `${infCpl} ${rawXml} ${f.rawSnippet || ""}`
  )
  const destCNPJ = rawDestCnpj ? formatCNPJ(rawDestCnpj) : ""

  let produto = "Outros"
  if (nfe?.tipoProduto && nfe.tipoProduto !== "OUTRO") {
    produto = nfe.tipoProduto
  } else if (parsed?.prodNome) {
    produto = parsed.prodNome
  }

  let terminal = nfe?.terminalEntrega || parsed?.terminalEntrega || "Não Informado"
  let transbordo = nfe?.transbordo || parsed?.transbordo || "Não Informado"
  let retirada = parsed?.retirada || ""

  if (transbordo === "Não Informado" || !transbordo) {
    if (/ITURAMA/i.test(infCpl)) transbordo = "ITURAMA"
    else if (/PRADOPOLIS|PRADÓPOLIS/i.test(infCpl)) transbordo = "PRADOPOLIS"
    else if (/ALTO\s*TAQUARI/i.test(infCpl)) transbordo = "ALTO TAQUARI"
    else if (/RONDONOPOLIS|RONDONÓPOLIS/i.test(infCpl)) transbordo = "RONDONOPOLIS"
    else if (/RIO\s*VERDE/i.test(infCpl)) transbordo = "RIO VERDE"
    else if (/ARAGUARI/i.test(infCpl)) transbordo = "ARAGUARI"
    else if (/UBERABA/i.test(infCpl)) transbordo = "UBERABA"
    else if (/PEDERNEIRAS/i.test(infCpl)) transbordo = "PEDERNEIRAS"
    else if (/GUARA|GUARÁ/i.test(infCpl)) transbordo = "GUARA"
    else if (/UBERLANDIA|UBERLÂNDIA/i.test(infCpl)) transbordo = "UBERLANDIA"
    else if (/SAO\s*SIMAO|SÃO\s*SIMÃO/i.test(infCpl)) transbordo = "SAO SIMAO"
    else if (/CHAPADAO\s*DO\s*SUL|CHAPADÃO\s*DO\s*SUL/i.test(infCpl)) transbordo = "CHAPADAO DO SUL"
    else if (/INOCENCIA|INOCÊNCIA/i.test(infCpl)) transbordo = "INOCENCIA"
    else if (/ITIQUIRA/i.test(infCpl)) transbordo = "ITIQUIRA"
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

  // Identificador da nota para vincular com overrides da IA
  const noteKey = chave && chave !== "Sem Chave" ? chave : (f.fileName || `${numero}_${serie}`)
  const override = overrides
    ? overrides[noteKey] || (f.fileName ? overrides[f.fileName] : undefined) || (numero !== "S/N" ? overrides[numero] : undefined)
    : undefined

  let isAIAjustado = false
  const aiCamposAjustados: string[] = []

  if (override) {
    if (override.terminal && override.terminal !== terminal) {
      terminal = override.terminal
      isAIAjustado = true
      aiCamposAjustados.push("Terminal")
    }
    if (override.transbordo && override.transbordo !== transbordo) {
      transbordo = override.transbordo
      isAIAjustado = true
      aiCamposAjustados.push("Transbordo")
    }
    if (override.destNome && override.destNome !== destNome) {
      destNome = sanitizeDestinatarioNome(override.destNome, destCNPJ)
      isAIAjustado = true
      aiCamposAjustados.push("Destinatário")
    }
    if (override.produto && override.produto !== produto) {
      produto = override.produto
      isAIAjustado = true
      aiCamposAjustados.push("Produto")
    }
    if (override.retirada) {
      retirada = override.retirada
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

  const hasMissingLogistics =
    terminal === "Não Informado" ||
    transbordo === "Não Informado" ||
    destNome === "Não informado" ||
    destNome === "DESTINATÁRIO NÃO IDENTIFICADO" ||
    destNome.startsWith("DESTINATÁRIO (")

  return {
    noteKey,
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
    retirada,
    valorNum,
    valorFormatted,
    pesoNum,
    pesoFormatted,
    infCpl,
    placa,
    motorista,
    isAIAjustado,
    aiCamposAjustados,
    aiAuditResult: override?.auditResult,
    hasMissingLogistics,
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

  // Estado dos ajustes aplicados pela IA aos dados logísticos
  const [logisticsOverrides, setLogisticsOverrides] = useState<Record<string, NoteLogisticsOverride>>({})
  const [isAuditingLogistics, setIsAuditingLogistics] = useState(false)
  const [aiAuditNotification, setAiAuditNotification] = useState<{
    type: "success" | "info" | "warning"
    message: string
  } | null>(null)

  const stats = useMemo(() => {
    const validFiles = files.filter(
      (f) => f.nfeData !== null || (f.parsedData && f.parsedData !== null)
    )

    // Contadores e Listas de arquivos por chave
    const destinatarioGroupCounts: Record<string, number> = {}
    const destinatarioGroupFiles: Record<string, DashboardFileItem[]> = {}
    const destinatarioGroupMeta: Record<string, { destNome: string; destCNPJ: string }> = {}
    const destNomeToCnpjsMap = new Map<string, Set<string>>()

    const terminalCount: Record<string, number> = {}
    const terminalFiles: Record<string, DashboardFileItem[]> = {}

    const produtoCount: Record<string, number> = {}
    const produtoFiles: Record<string, DashboardFileItem[]> = {}

    const transbordoCount: Record<string, number> = {}
    const transbordoFiles: Record<string, DashboardFileItem[]> = {}

    let missingTerminalCount = 0
    let missingTransbordoCount = 0
    let missingDestinatarioCount = 0
    let totalNotesWithMissingData = 0

    validFiles.forEach((f) => {
      const details = getNoteDetails(f, logisticsOverrides)

      if (details.terminal === "Não Informado") missingTerminalCount++
      if (details.transbordo === "Não Informado") missingTransbordoCount++
      if (
        details.destNome === "Não informado" ||
        details.destNome === "DESTINATÁRIO NÃO IDENTIFICADO" ||
        details.destNome.startsWith("DESTINATÁRIO (")
      ) {
        missingDestinatarioCount++
      }
      if (details.hasMissingLogistics) {
        totalNotesWithMissingData++
      }

      // Destinatário: agrupado por nome + CNPJ para identificar filiais distintas
      const dNome = details.destNome
      const dCnpj = details.destCNPJ || ""
      const destGroupKey = dCnpj ? `${dNome}###${dCnpj}` : dNome

      destinatarioGroupCounts[destGroupKey] = (destinatarioGroupCounts[destGroupKey] || 0) + 1
      if (!destinatarioGroupFiles[destGroupKey]) destinatarioGroupFiles[destGroupKey] = []
      destinatarioGroupFiles[destGroupKey].push(f)
      destinatarioGroupMeta[destGroupKey] = { destNome: dNome, destCNPJ: dCnpj }

      if (!destNomeToCnpjsMap.has(dNome)) {
        destNomeToCnpjsMap.set(dNome, new Set())
      }
      if (dCnpj) {
        destNomeToCnpjsMap.get(dNome)!.add(dCnpj)
      }

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

    // Paleta rica de cores distintas para diferenciar destinatários e filiais com mesmo nome
    const DEST_BRANCH_COLORS = [
      "#2563eb", // Azul Royal
      "#10b981", // Verde Esmeralda
      "#f97316", // Laranja Vivo
      "#8b5cf6", // Violeta
      "#ec4899", // Rosa
      "#06b6d4", // Ciano
      "#eab308", // Amarelo Dourado
      "#14b8a6", // Teal / Verde Água
      "#6366f1", // Índigo
      "#84cc16", // Lima
      "#d946ef", // Fúcsia
      "#0284c7", // Azul Céu
    ]

    // Mapeia índices de cores para cada CNPJ de um mesmo destinatário
    const destCnpjColorIndexMap = new Map<string, number>()
    destNomeToCnpjsMap.forEach((cnpjs, nome) => {
      const cnpjsArr = Array.from(cnpjs)
      cnpjsArr.forEach((cnpj, idx) => {
        destCnpjColorIndexMap.set(`${nome}###${cnpj}`, idx)
      })
    })

    const destinatariosChartData = Object.entries(destinatarioGroupCounts)
      .map(([groupKey, value]) => {
        const meta = destinatarioGroupMeta[groupKey] || { destNome: groupKey, destCNPJ: "" }
        const { destNome, destCNPJ } = meta
        const cnpjsForThisNome = destNomeToCnpjsMap.get(destNome)
        const hasMultipleBranches = !!(cnpjsForThisNome && cnpjsForThisNome.size > 1)
        const isMissing =
          destNome === "Não Informado" ||
          destNome === "Não informado" ||
          destNome === "DESTINATÁRIO NÃO IDENTIFICADO" ||
          destNome.startsWith("DESTINATÁRIO (")

        let displayName = destNome
        if (hasMultipleBranches && destCNPJ) {
          const filialShort = extractCNPJFilial(destCNPJ)
          const baseTrunc = destNome.length > 20 ? destNome.substring(0, 18) + "..." : destNome
          displayName = `${baseTrunc} (${filialShort})`
        } else if (destNome.length > 30) {
          displayName = destNome.substring(0, 28) + "..."
        }

        const fullName = destCNPJ ? `${destNome} (CNPJ: ${destCNPJ})` : destNome

        // Cor da barra: quando o CNPJ for diferente para o mesmo nome, atribui cor diferente da paleta
        let barColor = "#2563eb"
        if (isMissing) {
          barColor = "#f59e0b"
        } else if (hasMultipleBranches && destCNPJ) {
          const colorIdx = destCnpjColorIndexMap.get(groupKey) ?? 0
          barColor = DEST_BRANCH_COLORS[colorIdx % DEST_BRANCH_COLORS.length]
        } else {
          barColor = "#2563eb"
        }

        return {
          name: displayName,
          fullName,
          destNome,
          destCNPJ,
          value,
          color: barColor,
          hasMultipleBranches,
          relatedFiles: destinatarioGroupFiles[groupKey] || [],
          isMissing,
        }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)

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
          isMissing:
            name === "Não Informado" ||
            name === "Não informado" ||
            name === "DESTINATÁRIO NÃO IDENTIFICADO" ||
            name.startsWith("DESTINATÁRIO ("),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)

    const totalAdjustedByAI = Object.keys(logisticsOverrides).length

    return {
      totalNotas: validFiles.length,
      allFiles: validFiles,
      destinatarios: destinatariosChartData,
      totalDestinatariosUnicos: Object.keys(destinatarioGroupCounts).length,
      terminais: toChartData(terminalCount, terminalFiles),
      produtos: toChartData(produtoCount, produtoFiles),
      transbordos: toChartData(transbordoCount, transbordoFiles),
      missingTerminalCount,
      missingTransbordoCount,
      missingDestinatarioCount,
      totalNotesWithMissingData,
      totalAdjustedByAI,
    }
  }, [files, logisticsOverrides])

  // Função para executar a auditoria com IA em notas com dados não informados
  const handleAuditMissingDataWithAI = async (targetFiles?: DashboardFileItem[]) => {
    const filesToAudit = targetFiles || stats.allFiles
    if (filesToAudit.length === 0) return

    // Filtrar apenas arquivos que contenham campos não informados ou auditar todos se solicitado
    const itemsToAudit: LogisticsAuditInputItem[] = []

    filesToAudit.forEach((f) => {
      const details = getNoteDetails(f, logisticsOverrides)
      // Se tiver dados faltantes ou for solicitação de auditoria direta
      if (details.hasMissingLogistics || targetFiles) {
        itemsToAudit.push({
          id: details.noteKey,
          numero: details.numero,
          serie: details.serie,
          chave: details.chave,
          emitNome: details.emitNome,
          destNome: details.destNome,
          destCNPJ: details.destCNPJ,
          terminal: details.terminal,
          transbordo: details.transbordo,
          produto: details.produto,
          retirada: details.retirada,
          infCpl: details.infCpl,
          rawSnippet: f.rawSnippet || details.infCpl,
          xmlContent: f.xmlContent || f.xmlGerado,
        })
      }
    })

    if (itemsToAudit.length === 0) {
      setAiAuditNotification({
        type: "info",
        message: "Todas as notas já possuem dados de Terminal, Transbordo e Destinatário preenchidos!",
      })
      return
    }

    setIsAuditingLogistics(true)
    setAiAuditNotification(null)

    try {
      const response = await auditarLogisticaComIA(itemsToAudit)

      const newOverrides = { ...logisticsOverrides }
      let adjustedCount = 0

      response.resultados.forEach((res) => {
        if (res.camposAjustados && res.camposAjustados.length > 0) {
          adjustedCount++
          newOverrides[res.id] = {
            terminal: res.terminalCorrigido,
            transbordo: res.transbordoCorrigido,
            destNome: res.destinatarioCorrigido,
            retirada: res.retiradaCorrigida,
            produto: res.produtoCorrigido,
            auditResult: res,
            appliedAt: new Date().toLocaleTimeString("pt-BR"),
          }
        }
      })

      setLogisticsOverrides(newOverrides)

      if (adjustedCount > 0) {
        setAiAuditNotification({
          type: "success",
          message: `✨ Sucesso! A IA analisou ${itemsToAudit.length} nota(s) e identificou dados logísticos em ${adjustedCount} nota(s). Os gráficos foram ajustados automaticamente!`,
        })
      } else {
        setAiAuditNotification({
          type: "warning",
          message: `A IA analisou ${itemsToAudit.length} nota(s), mas o texto das DANFEs não continha dados adicionais expressos para estes campos.`,
        })
      }
    } catch (err) {
      console.error("Erro na auditoria com IA:", err)
      setAiAuditNotification({
        type: "warning",
        message: "Ocorreu um erro ao comunicar com a IA. A auditoria heurística local foi acionada.",
      })
    } finally {
      setIsAuditingLogistics(false)
    }
  }

  const handleResetOverrides = () => {
    setLogisticsOverrides({})
    setAiAuditNotification({
      type: "info",
      message: "Dados restaurados para os valores originais lidos nos documentos.",
    })
  }

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
      const d = getNoteDetails(f, logisticsOverrides)
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
  }, [selectedGroup, modalSearch, logisticsOverrides])

  const handleExportGroupExcel = () => {
    if (!selectedGroup) return

    const dataToExport = filteredGroupFiles.map((f, idx) => {
      const d = getNoteDetails(f, logisticsOverrides)
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
        "Local de Retirada": d.retirada || "-",
        "Ajustado pela IA": d.isAIAjustado ? `SIM (${d.aiCamposAjustados.join(", ")})` : "NÃO",
        "Explicação IA": d.aiAuditResult?.explicacao || "-",
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
      {/* Banner de Auditoria e Ajuste com IA para Dados Não Informados */}
      <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-blue-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-2xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-1.5">
                IA Auditora de Dados Logísticos (Terminal, Transbordo & Destinatário)
              </h3>
              {stats.totalAdjustedByAI > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  {stats.totalAdjustedByAI} nota(s) ajustada(s)
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80 mt-1">
              {stats.totalNotesWithMissingData > 0 ? (
                <span>
                  Foram encontradas <strong>{stats.totalNotesWithMissingData} nota(s)</strong> com dados não informados nos gráficos (
                  {stats.missingTerminalCount > 0 && `${stats.missingTerminalCount} sem terminal, `}
                  {stats.missingTransbordoCount > 0 && `${stats.missingTransbordoCount} sem transbordo, `}
                  {stats.missingDestinatarioCount > 0 && `${stats.missingDestinatarioCount} sem destinatário`}
                  ). A IA analisa as Informações Complementares da DANFE para identificar e ajustar automaticamente os gráficos.
                </span>
              ) : (
                <span>
                  Todos os dados de Terminal, Transbordo e Destinatário estão 100% identificados e distribuídos nos gráficos!
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
          {stats.totalAdjustedByAI > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetOverrides}
              className="h-8 text-xs font-medium border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restaurar Originais
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={() => handleAuditMissingDataWithAI()}
            disabled={isAuditingLogistics}
            className="h-8 text-xs font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            {isAuditingLogistics ? (
              <>
                <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                Auditando com IA (Gemini)...
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5 text-yellow-300" />
                {stats.totalNotesWithMissingData > 0 ? "Auditar e Ajustar Gráficos com IA" : "Reauditar Todas as Notas com IA"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Notificação de Feedback da Auditoria */}
      {aiAuditNotification && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            aiAuditNotification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : aiAuditNotification.type === "warning"
              ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
              : "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {aiAuditNotification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            )}
            <span>{aiAuditNotification.message}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAiAuditNotification(null)}
            className="h-6 px-2 text-[11px] font-semibold cursor-pointer"
          >
            Fechar
          </Button>
        </div>
      )}

      {/* Banner explicativo de interação */}
      <div className="p-3.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-900 dark:text-indigo-200">
        <div className="flex items-center gap-2.5">
          <MousePointerClick className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 animate-bounce" />
          <span>
            <strong>Dica Interativa:</strong> Clique em qualquer barra ou fatia dos gráficos abaixo para abrir a lista detalhada com todas as notas fiscais correspondentes e ver os ajustes aplicados pela IA.
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
            <p className="text-[11px] text-zinc-500 mt-1">
              {stats.missingDestinatarioCount > 0 ? (
                <span className="text-amber-600 font-semibold">{stats.missingDestinatarioCount} não informado(s)</span>
              ) : (
                "100% identificados"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terminais</CardTitle>
            <MapPin className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.terminais.length}</div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {stats.missingTerminalCount > 0 ? (
                <span className="text-amber-600 font-semibold">{stats.missingTerminalCount} não informado(s)</span>
              ) : (
                "100% identificados"
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transbordos</CardTitle>
            <Truck className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.transbordos.length}</div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {stats.missingTransbordoCount > 0 ? (
                <span className="text-amber-600 font-semibold">{stats.missingTransbordoCount} não informado(s)</span>
              ) : (
                "100% identificados"
              )}
            </p>
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
              <span className="flex items-center gap-2">
                Notas por Destinatário
                {stats.missingDestinatarioCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {stats.missingDestinatarioCount} Não Informado
                  </span>
                )}
              </span>
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
                    width={170}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 z-50">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                              <span
                                className="inline-block w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: data.color || "#2563eb" }}
                              />
                              {data.destNome || data.fullName}
                            </div>
                            {data.destCNPJ && (
                              <div className="text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                                CNPJ / Filial: <span className="font-bold text-zinc-800 dark:text-zinc-200">{data.destCNPJ}</span>
                              </div>
                            )}
                            <div className="text-blue-600 dark:text-blue-400 font-semibold pt-0.5">
                              {data.value} nota(s) ({((data.value / (stats.totalNotas || 1)) * 100).toFixed(1)}%)
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
                    onClick={(entry) => handleChartClick("Destinatário", entry)}
                  >
                    {stats.destinatarios.map((entry, index) => (
                      <Cell
                        key={`dest-cell-${index}`}
                        fill={entry.isMissing ? "#f59e0b" : (entry.color || COLORS[index % COLORS.length])}
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
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                Notas por Terminal de Entrega
                {stats.missingTerminalCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {stats.missingTerminalCount} Não Informado
                  </span>
                )}
              </span>
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
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(entry) => handleChartClick("Terminal de Entrega", entry)}
                  >
                    {stats.terminais.map((entry, index) => (
                      <Cell
                        key={`term-cell-${index}`}
                        fill={entry.isMissing ? "#f59e0b" : "#00C49F"}
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
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                Notas por Transbordo
                {stats.missingTransbordoCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {stats.missingTransbordoCount} Não Informado
                  </span>
                )}
              </span>
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
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={(entry) => handleChartClick("Transbordo", entry)}
                  >
                    {stats.transbordos.map((entry, index) => (
                      <Cell
                        key={`trans-cell-${index}`}
                        fill={entry.isMissing ? "#f59e0b" : "#FFBB28"}
                      />
                    ))}
                  </Bar>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
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

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => selectedGroup && handleAuditMissingDataWithAI(selectedGroup.files)}
                  disabled={isAuditingLogistics}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isAuditingLogistics ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      Auditando com IA...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5 text-yellow-300" />
                      Auditar Este Grupo com IA
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={handleExportGroupExcel}
                  variant="outline"
                  size="sm"
                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-medium text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Exportar Excel (.xlsx)
                </Button>
              </div>
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
                const note = getNoteDetails(file, logisticsOverrides)
                const isExpanded = expandedIndex === idx

                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border transition-all shadow-xs space-y-2 ${
                      note.isAIAjustado
                        ? "border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20"
                        : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800/80 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 font-bold text-xs">
                          NF nº {note.numero} (Série {note.serie})
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Emissão: <strong>{note.dataEmissao}</strong>
                        </span>
                        {note.isAIAjustado && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-emerald-600" />
                            Ajustado pela IA ({note.aiCamposAjustados.join(", ")})
                          </span>
                        )}
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
                          className={`font-medium truncate ${
                            note.destNome === "Não informado" || note.destNome === "DESTINATÁRIO NÃO IDENTIFICADO"
                              ? "text-amber-600 dark:text-amber-400 font-bold"
                              : "text-zinc-800 dark:text-zinc-200"
                          }`}
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
                          <span
                            className={
                              note.terminal === "Não Informado"
                                ? "text-amber-600 dark:text-amber-400 font-bold"
                                : ""
                            }
                          >
                            {note.terminal}
                          </span>
                          {" / "}
                          <span
                            className={
                              note.transbordo === "Não Informado"
                                ? "text-amber-600 dark:text-amber-400 font-bold"
                                : ""
                            }
                          >
                            {note.transbordo}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Explicação da IA se tiver sido ajustada */}
                    {note.isAIAjustado && note.aiAuditResult && (
                      <div className="p-2 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 rounded-lg text-[11px] text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Diagnóstico da IA:</strong> {note.aiAuditResult.veredito}.{" "}
                          <span className="text-zinc-500 dark:text-zinc-400">{note.aiAuditResult.explicacao}</span>
                        </div>
                      </div>
                    )}

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
                        {note.retirada && (
                          <p>
                            <strong>Local de Retirada:</strong> {note.retirada}
                          </p>
                        )}
                        {note.infCpl && (
                          <div>
                            <strong className="block mb-0.5 text-zinc-500">
                              Informações Complementares / Texto Fiscal:
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
