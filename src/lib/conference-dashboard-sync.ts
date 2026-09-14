import {
  parseNFE,
  verifyChaveCNPJ,
  type NFEData,
} from '@/lib/nfe-parser'
import {
  sanitizeDestinatarioNome,
  formatCNPJ,
  extractCNPJFilial,
} from '@/lib/destinatario-utils'
import {
  extractVagoesFromDocument,
  extractFolderName,
  getVagaoNumeralKey,
  TRANSBORDO_VAGAO_COLORS,
  type ExtractedVagao,
} from '@/lib/vagao-utils'
import {
  getDatabaseInstance,
  getOperatorName,
  getSessionId,
  formatDateBR,
  formatTimeBR,
} from '@/lib/firebase-realtime'
import { ref, set, push, onValue, off, query, limitToLast, remove } from 'firebase/database'

export interface ConferenceNoteSummary {
  fileName: string
  numero: string
  serie: string
  chave: string
  dataEmissao: string
  emitNome: string
  emitCNPJ: string
  destNome: string
  destCNPJ: string
  produto: string
  terminal: string
  transbordo: string
  retirada?: string
  valorNum: number
  valorFormatted: string
  pesoNum: number
  pesoFormatted: string
  vagoes: { identificador: string; serie?: string; numero?: string; origemDoc?: string }[]
  primaryVagao: string
  allVagoesStr: string
  placa?: string
  motorista?: string
  infCpl?: string
  confrontoChaveXDest?: 'IGUAIS' | 'DIVERGENTES' | 'NÃO INFORMADO'
  isDivergentCNPJ?: boolean
  hasMissingLogistics?: boolean
  isAIAjustado?: boolean
  aiCamposAjustados?: string[]
}

export interface VagaoDetailItem {
  vagao: string
  serie?: string
  origemDoc?: string
  isFolder?: boolean
  totalNotas: number
  pesoKg: number
  pesoFormatted: string
  valorTotal: number
  valorFormatted: string
  notas: string[]
}

export interface VagaoTransbordoSummary {
  name: string
  fullName: string
  transbordo: string
  totalVagoes: number
  vagoesList: string[]
  totalNotas: number
  pesoTotalKg: number
  pesoTotalFormatted: string
  valorTotal: number
  valorTotalFormatted: string
  color: string
  isMissing?: boolean
  vagoesDetails: VagaoDetailItem[]
}

export interface ChartCategoryItem {
  name: string
  fullName: string
  value: number
  destNome?: string
  destCNPJ?: string
  color?: string
  hasMultipleBranches?: boolean
  isMissing?: boolean
}

export interface ConferenceDashboardSnapshot {
  id: string
  sessionId: string
  operatorName: string
  operatorEmail?: string
  title?: string
  timestamp: number
  dateFormatted: string
  timeFormatted: string
  
  // KPIs & Agregações Gerais
  totalNotas: number
  totalValor: number
  valorTotalFormatted: string
  totalPesoKg: number
  pesoTotalFormatted: string
  totalVagoesUnicos: number
  totalDestinatariosUnicos: number
  totalTerminaisUnicos: number
  totalTransbordosUnicos: number
  totalDivergenciasCNPJ: number
  missingTerminalCount: number
  missingTransbordoCount: number
  missingDestinatarioCount: number
  missingDataCount: number
  isDerivedFromFolders: boolean
  hasFolderDerivedWagons: boolean
  hasDocExtractedWagons: boolean

  // Conjuntos de dados para os Gráficos
  destinatarios: ChartCategoryItem[]
  terminais: ChartCategoryItem[]
  produtos: ChartCategoryItem[]
  transbordos: ChartCategoryItem[]
  vagoesPorTransbordo: VagaoTransbordoSummary[]

  // Lista de todas as notas fiscais resumidas da sessão para drilldown e busca
  notes: ConferenceNoteSummary[]
}

const STORAGE_KEY_LATEST = 'vlic_latest_conference_dashboard'
const STORAGE_KEY_HISTORY = 'vlic_conference_dashboards_history'
const BROADCAST_CHANNEL_NAME = 'vlic_conference_mirror_channel'

const DEST_BRANCH_COLORS = [
  '#2563eb',
  '#10b981',
  '#f97316',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#eab308',
  '#14b8a6',
  '#6366f1',
  '#84cc16',
  '#d946ef',
  '#0284c7',
]

/**
 * Constrói um snapshot completo dos dashboards gerados a partir da lista de notas
 * processadas na sessão do Painel de Conferência.
 */
export function buildConferenceDashboardSnapshot(
  files: any[],
  operatorNameInput?: string,
  logisticsOverridesInput?: Record<string, any>,
  operatorEmailInput?: string,
  sessionIdInput?: string
): ConferenceDashboardSnapshot {
  const operatorName = operatorNameInput || getOperatorName()
  const sessionId = sessionIdInput || getSessionId()
  const now = Date.now()
  const id = 'cdash_' + now + '_' + Math.random().toString(36).substring(2, 7)

  const validFiles = files.filter(
    (f) => f && (f.nfeData !== null || (f.parsedData && f.parsedData !== null) || f.xmlContent)
  )

  const destinatarioGroupCounts: Record<string, number> = {}
  const destinatarioGroupMeta: Record<string, { destNome: string; destCNPJ: string }> = {}
  const destNomeToCnpjsMap = new Map<string, Set<string>>()

  const terminalCount: Record<string, number> = {}
  const produtoCount: Record<string, number> = {}
  const transbordoCount: Record<string, number> = {}

  const transbordoVagoesMap = new Map<
    string,
    Map<
      string,
      {
        identificador: string
        serie?: string
        numero?: string
        origemDoc?: string
        totalNotas: number
        pesoTotal: number
        valorTotal: number
        notas: string[]
      }
    >
  >()

  const allUniqueVagoesGlobal = new Set<string>()
  let hasFolderDerivedWagons = false
  let hasDocExtractedWagons = false

  let totalValorAcumulado = 0
  let totalPesoKgAcumulado = 0
  let totalDivergenciasCNPJ = 0
  let missingTerminalCount = 0
  let missingTransbordoCount = 0
  let missingDestinatarioCount = 0
  let totalNotesWithMissingData = 0

  const notesList: ConferenceNoteSummary[] = []

  validFiles.forEach((f) => {
    let nfe: NFEData | null = f.nfeData || null
    const parsed = f.parsedData || null
    const rawXml = f.xmlContent || f.xmlGerado || ''

    if (!nfe && rawXml) {
      try {
        nfe = parseNFE(rawXml)
      } catch (e) {}
    }

    const numero = nfe?.numero || parsed?.nNF || 'S/N'
    const serie = nfe?.serie || parsed?.serie || '1'
    const chave = nfe?.chaveAcesso || parsed?.chave || 'Sem Chave'
    const dataEmissao = nfe?.dataEmissao || parsed?.dhEmi || 'Não informada'

    let emitNome = 'Não informado'
    if (nfe?.emitente?.nome && nfe.emitente.nome !== 'EMITENTE NÃO IDENTIFICADO') {
      emitNome = nfe.emitente.nome
    } else if (parsed?.emitNome) {
      emitNome = parsed.emitNome
    }
    const emitCNPJ = nfe?.emitente?.cnpj || parsed?.emitCNPJ || ''

    const rawDestNome =
      nfe?.destinatario?.nome && nfe.destinatario.nome !== 'DESTINATÁRIO NÃO IDENTIFICADO'
        ? nfe.destinatario.nome
        : parsed?.destNome && parsed.destNome !== 'DESTINATÁRIO NÃO IDENTIFICADO'
        ? parsed.destNome
        : ''
    const rawDestCnpj = nfe?.destinatario?.cpfCnpj || parsed?.destCNPJ || ''
    const infCpl = nfe?.informacoesComplementares || parsed?.infCpl || rawXml || f.rawSnippet || ''

    let destNome = sanitizeDestinatarioNome(
      rawDestNome,
      rawDestCnpj,
      `${infCpl} ${rawXml} ${f.rawSnippet || ''}`
    )
    const destCNPJ = rawDestCnpj ? formatCNPJ(rawDestCnpj) : ''

    let produto = 'Outros'
    if (nfe?.tipoProduto && nfe.tipoProduto !== 'OUTRO') {
      produto = nfe.tipoProduto
    } else if (parsed?.prodNome) {
      produto = parsed.prodNome
    }

    let terminal = nfe?.terminalEntrega || parsed?.terminalEntrega || 'Não Informado'
    let transbordo = nfe?.transbordo || parsed?.transbordo || 'Não Informado'
    const retirada = parsed?.retirada || ''

    if (logisticsOverridesInput && chave && logisticsOverridesInput[chave]) {
      const ov = logisticsOverridesInput[chave]
      if (ov.terminal) terminal = ov.terminal
      if (ov.transbordo) transbordo = ov.transbordo
      if (ov.destinatario) destNome = ov.destinatario
    }

    let valorNum = 0
    if (nfe?.impostos?.valorTotal) {
      valorNum = nfe.impostos.valorTotal
    } else if (parsed?.vNF) {
      const parsedVal = parseFloat(String(parsed.vNF).replace(/\./g, '').replace(',', '.'))
      valorNum = isNaN(parsedVal) ? 0 : parsedVal
    }

    let pesoNum = 0
    if (nfe?.transportador?.pesoBruto) {
      pesoNum = nfe.transportador.pesoBruto
    } else if (nfe?.transportador?.pesoLiquido) {
      pesoNum = nfe.transportador.pesoLiquido
    } else if (parsed?.transpPesoB) {
      const parsedPeso = parseFloat(String(parsed.transpPesoB).replace(/\./g, '').replace(',', '.'))
      pesoNum = isNaN(parsedPeso) ? 0 : parsedPeso
    }

    totalValorAcumulado += valorNum
    totalPesoKgAcumulado += pesoNum

    const placa = nfe?.transportador?.placaVeiculo || ''

    let vagoes: ExtractedVagao[] = extractVagoesFromDocument({
      text: `${f.fileName || ''} ${f.rawSnippet || ''}`,
      xmlContent: f.xmlContent || f.xmlGerado,
      placa,
      rawSnippet: f.rawSnippet,
      infCpl,
    })

    const folderName = extractFolderName(f)
    if (vagoes.length === 0 && folderName) {
      const vagoesFromFolder = extractVagoesFromDocument({ text: folderName })
      if (vagoesFromFolder.length > 0) {
        vagoes = vagoesFromFolder
      } else {
        vagoes = [
          {
            identificador: folderName,
            serie: 'PASTA',
            numero: folderName,
            origemDoc: 'PASTA_INPUT',
          },
        ]
      }
    }

    const primaryVagao = vagoes.length > 0 ? vagoes[0].identificador : ''
    const allVagoesStr = vagoes.map((v) => v.identificador).join(', ')

    // Validação Chave x CNPJ Destinatário
    let isDivergentCNPJ = false
    let confrontoChaveXDest: 'IGUAIS' | 'DIVERGENTES' | 'NÃO INFORMADO' = 'NÃO INFORMADO'
    if (chave && emitCNPJ && rawDestCnpj) {
      const vCNPJ = verifyChaveCNPJ(chave, emitCNPJ, rawDestCnpj)
      confrontoChaveXDest = vCNPJ.confrontoChaveXDest
      if (confrontoChaveXDest === 'DIVERGENTES') {
        isDivergentCNPJ = true
        totalDivergenciasCNPJ++
      }
    }

    const hasMissingLogistics =
      terminal === 'Não Informado' ||
      transbordo === 'Não Informado' ||
      destNome === 'Não informado' ||
      destNome === 'DESTINATÁRIO NÃO IDENTIFICADO' ||
      destNome.startsWith('DESTINATÁRIO (')

    if (terminal === 'Não Informado') missingTerminalCount++
    if (transbordo === 'Não Informado') missingTransbordoCount++
    if (
      destNome === 'Não informado' ||
      destNome === 'DESTINATÁRIO NÃO IDENTIFICADO' ||
      destNome.startsWith('DESTINATÁRIO (')
    ) {
      missingDestinatarioCount++
    }
    if (hasMissingLogistics) {
      totalNotesWithMissingData++
    }

    // Vagões por Transbordo
    const transKey = transbordo
    if (vagoes && vagoes.length > 0) {
      if (!transbordoVagoesMap.has(transKey)) {
        transbordoVagoesMap.set(transKey, new Map())
      }
      const vagoesMapForTransbordo = transbordoVagoesMap.get(transKey)!
      const processedVagKeysInNote = new Set<string>()

      vagoes.forEach((vag) => {
        if (vag.origemDoc === 'PASTA_INPUT') {
          hasFolderDerivedWagons = true
        } else {
          hasDocExtractedWagons = true
        }

        const numKey = getVagaoNumeralKey(vag.numero || vag.identificador)
        if (!numKey || processedVagKeysInNote.has(numKey)) return
        processedVagKeysInNote.add(numKey)
        allUniqueVagoesGlobal.add(numKey)

        if (!vagoesMapForTransbordo.has(numKey)) {
          vagoesMapForTransbordo.set(numKey, {
            identificador: vag.identificador,
            serie: vag.serie,
            numero: vag.numero,
            origemDoc: vag.origemDoc,
            totalNotas: 0,
            pesoTotal: 0,
            valorTotal: 0,
            notas: [],
          })
        }
        const entry = vagoesMapForTransbordo.get(numKey)!
        if (vag.serie && vag.serie !== 'PASTA' && (!entry.serie || entry.serie.length < vag.serie.length)) {
          entry.identificador = vag.identificador
          entry.serie = vag.serie
          entry.origemDoc = vag.origemDoc
        }
        entry.totalNotas += 1
        entry.pesoTotal += pesoNum
        entry.valorTotal += valorNum
        if (numero && numero !== 'S/N' && !entry.notas.includes(numero)) {
          entry.notas.push(numero)
        }
      })
    }

    // Destinatário
    const destGroupKey = destCNPJ ? `${destNome}###${destCNPJ}` : destNome
    destinatarioGroupCounts[destGroupKey] = (destinatarioGroupCounts[destGroupKey] || 0) + 1
    destinatarioGroupMeta[destGroupKey] = { destNome, destCNPJ }
    if (!destNomeToCnpjsMap.has(destNome)) {
      destNomeToCnpjsMap.set(destNome, new Set())
    }
    if (destCNPJ) {
      destNomeToCnpjsMap.get(destNome)!.add(destCNPJ)
    }

    // Terminal
    terminalCount[terminal] = (terminalCount[terminal] || 0) + 1

    // Produto
    produtoCount[produto] = (produtoCount[produto] || 0) + 1

    // Transbordo
    transbordoCount[transKey] = (transbordoCount[transKey] || 0) + 1

    notesList.push({
      fileName: f.fileName || 'Nota Fiscal',
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
      valorFormatted:
        valorNum > 0
          ? `R$ ${valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '-',
      pesoNum,
      pesoFormatted: pesoNum > 0 ? `${pesoNum.toLocaleString('pt-BR')} kg` : '-',
      vagoes: vagoes.map((v) => ({
        identificador: v.identificador,
        serie: v.serie,
        numero: v.numero,
        origemDoc: v.origemDoc,
      })),
      primaryVagao,
      allVagoesStr,
      placa,
      infCpl: infCpl.substring(0, 300),
      confrontoChaveXDest,
      isDivergentCNPJ,
      hasMissingLogistics,
    })
  })

  // Monta dados dos gráficos
  const destCnpjColorIndexMap = new Map<string, number>()
  destNomeToCnpjsMap.forEach((cnpjs, nome) => {
    Array.from(cnpjs).forEach((cnpj, idx) => {
      destCnpjColorIndexMap.set(`${nome}###${cnpj}`, idx)
    })
  })

  const destinatariosChartData: ChartCategoryItem[] = Object.entries(destinatarioGroupCounts)
    .map(([groupKey, value]) => {
      const meta = destinatarioGroupMeta[groupKey] || { destNome: groupKey, destCNPJ: '' }
      const { destNome, destCNPJ } = meta
      const cnpjsForThisNome = destNomeToCnpjsMap.get(destNome)
      const hasMultipleBranches = !!(cnpjsForThisNome && cnpjsForThisNome.size > 1)
      const isMissing =
        destNome === 'Não Informado' ||
        destNome === 'Não informado' ||
        destNome === 'DESTINATÁRIO NÃO IDENTIFICADO' ||
        destNome.startsWith('DESTINATÁRIO (')

      let displayName = destNome
      if (hasMultipleBranches && destCNPJ) {
        const filialShort = extractCNPJFilial(destCNPJ)
        const baseTrunc = destNome.length > 20 ? destNome.substring(0, 18) + '...' : destNome
        displayName = `${baseTrunc} (${filialShort})`
      } else if (destNome.length > 30) {
        displayName = destNome.substring(0, 28) + '...'
      }

      let barColor = '#2563eb'
      if (isMissing) {
        barColor = '#f59e0b'
      } else if (hasMultipleBranches && destCNPJ) {
        const colorIdx = destCnpjColorIndexMap.get(groupKey) ?? 0
        barColor = DEST_BRANCH_COLORS[colorIdx % DEST_BRANCH_COLORS.length]
      }

      return {
        name: displayName,
        fullName: destCNPJ ? `${destNome} (CNPJ: ${destCNPJ})` : destNome,
        destNome,
        destCNPJ,
        value,
        color: barColor,
        hasMultipleBranches,
        isMissing,
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)

  const toChartData = (counts: Record<string, number>): ChartCategoryItem[] =>
    Object.entries(counts)
      .map(([name, value]) => ({
        name: name.length > 30 ? name.substring(0, 28) + '...' : name,
        fullName: name,
        value,
        isMissing:
          name === 'Não Informado' ||
          name === 'Não informado' ||
          name === 'TRANSBORDO NÃO INFORMADO',
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12)

  const vagoesPorTransbordo: VagaoTransbordoSummary[] = Array.from(transbordoVagoesMap.entries())
    .map(([transbordo, vagoesMap], index) => {
      const vagoesEntries = Array.from(vagoesMap.values())
      const totalVagoes = vagoesEntries.length
      const vagoesList = vagoesEntries.map((v) => v.identificador)
      let pesoTotalKg = 0
      let valorTotal = 0
      let totalNotas = 0

      vagoesEntries.forEach((e) => {
        pesoTotalKg += e.pesoTotal
        valorTotal += e.valorTotal
        totalNotas += e.totalNotas
      })

      const isMissing =
        transbordo === 'Não Informado' ||
        transbordo === 'Não informado' ||
        transbordo === 'TRANSBORDO NÃO INFORMADO'
      const color = isMissing ? '#f59e0b' : TRANSBORDO_VAGAO_COLORS[index % TRANSBORDO_VAGAO_COLORS.length]

      return {
        name: transbordo.length > 25 ? transbordo.substring(0, 23) + '...' : transbordo,
        fullName: transbordo,
        transbordo,
        totalVagoes,
        vagoesList,
        totalNotas,
        pesoTotalKg,
        pesoTotalFormatted: pesoTotalKg > 0 ? `${pesoTotalKg.toLocaleString('pt-BR')} kg` : '-',
        valorTotal,
        valorTotalFormatted:
          valorTotal > 0
            ? `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '-',
        color,
        isMissing,
        vagoesDetails: vagoesEntries.map((entry) => ({
          vagao: entry.identificador,
          serie: entry.serie,
          origemDoc: entry.origemDoc,
          isFolder: entry.origemDoc === 'PASTA_INPUT',
          totalNotas: entry.totalNotas,
          pesoKg: entry.pesoTotal,
          pesoFormatted: entry.pesoTotal > 0 ? `${entry.pesoTotal.toLocaleString('pt-BR')} kg` : '-',
          valorTotal: entry.valorTotal,
          valorFormatted:
            entry.valorTotal > 0
              ? `R$ ${entry.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '-',
          notas: entry.notas,
        })),
      }
    })
    .filter((t) => t.totalVagoes > 0)
    .sort((a, b) => b.totalVagoes - a.totalVagoes)

  return {
    id,
    sessionId,
    operatorName,
    operatorEmail: operatorEmailInput,
    title: `Conferência Fiscal - ${validFiles.length} nota(s)`,
    timestamp: now,
    dateFormatted: formatDateBR(now),
    timeFormatted: formatTimeBR(now),
    totalNotas: validFiles.length,
    totalValor: totalValorAcumulado,
    valorTotalFormatted:
      totalValorAcumulado > 0
        ? `R$ ${totalValorAcumulado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : 'R$ 0,00',
    totalPesoKg: totalPesoKgAcumulado,
    pesoTotalFormatted: totalPesoKgAcumulado > 0 ? `${totalPesoKgAcumulado.toLocaleString('pt-BR')} kg` : '0 kg',
    totalVagoesUnicos: allUniqueVagoesGlobal.size,
    totalDestinatariosUnicos: Object.keys(destinatarioGroupCounts).length,
    totalTerminaisUnicos: Object.keys(terminalCount).length,
    totalTransbordosUnicos: Object.keys(transbordoCount).length,
    totalDivergenciasCNPJ,
    missingTerminalCount,
    missingTransbordoCount,
    missingDestinatarioCount,
    missingDataCount: totalNotesWithMissingData,
    isDerivedFromFolders: hasFolderDerivedWagons && !hasDocExtractedWagons,
    hasFolderDerivedWagons,
    hasDocExtractedWagons,
    destinatarios: destinatariosChartData,
    terminais: toChartData(terminalCount),
    produtos: toChartData(produtoCount),
    transbordos: toChartData(transbordoCount),
    vagoesPorTransbordo,
    notes: notesList,
  }
}

// -------------------------------------------------------------
// Sincronização Local & Firebase
// -------------------------------------------------------------

function getStoredLatestSnapshot(): ConferenceDashboardSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LATEST)
    if (raw) {
      const parsed: ConferenceDashboardSnapshot = JSON.parse(raw)
      if (parsed && !parsed.id?.startsWith('demo_') && !parsed.id?.includes('demo')) {
        return parsed
      } else {
        localStorage.removeItem(STORAGE_KEY_LATEST)
      }
    }
  } catch (e) {
    console.warn('Erro ao ler último snapshot de dashboard:', e)
  }
  return null
}

function getStoredHistory(): ConferenceDashboardSnapshot[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY)
    if (raw) {
      const parsed: ConferenceDashboardSnapshot[] = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const real = parsed.filter((item) => item && !item.id?.startsWith('demo_') && !item.id?.includes('demo'))
        if (real.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(real))
        }
        return real
      }
    }
  } catch (e) {
    console.warn('Erro ao ler histórico de dashboards:', e)
  }
  return []
}

function saveLocalSnapshot(snapshot: ConferenceDashboardSnapshot) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_LATEST, JSON.stringify(snapshot))
    const currentHistory = getStoredHistory().filter((item) => item.id !== snapshot.id)
    const updatedHistory = [snapshot, ...currentHistory].slice(0, 100) // Guarda até 100 sessões passadas
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory))
  } catch (e) {
    console.warn('Erro ao salvar snapshot localmente:', e)
  }
}

// Canal de comunicação cross-tab nativo
let broadcastChannel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  } catch (e) {
    console.warn('BroadcastChannel não suportado no ambiente:', e)
  }
}

let latestListeners: ((snap: ConferenceDashboardSnapshot | null) => void)[] = []
let historyListeners: ((history: ConferenceDashboardSnapshot[]) => void)[] = []

/**
 * Publica um novo snapshot gerado no Painel de Conferência para ser espelhado em tempo real
 */
export async function publishConferenceDashboard(
  snapshot: ConferenceDashboardSnapshot
): Promise<void> {
  // 1. Salva localmente
  saveLocalSnapshot(snapshot)

  // 2. Notifica ouvintes locais
  const updatedHistory = getStoredHistory()
  latestListeners.forEach((cb) => cb(snapshot))
  historyListeners.forEach((cb) => cb(updatedHistory))

  // 3. Notifica abas via BroadcastChannel
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type: 'DASHBOARD_UPDATED', snapshot, history: updatedHistory })
    } catch (e) {}
  }

  // 4. Salva no Firebase Realtime Database para sincronização com outros operadores / rede
  const db = getDatabaseInstance()
  if (db) {
    try {
      const latestRef = ref(db, 'vlic_telemetry/latest_conference_dashboard')
      await set(latestRef, snapshot)

      const historyItemRef = ref(db, `vlic_telemetry/conference_dashboards/${snapshot.id}`)
      await set(historyItemRef, snapshot)
    } catch (err) {
      console.warn('Falha ao enviar snapshot de dashboard ao Firebase:', err)
    }
  }
}

/**
 * Escuta em tempo real o último dashboard gerado no Painel de Conferência (Espelho Ao Vivo)
 */
export function subscribeToLatestConferenceDashboard(
  callback: (snapshot: ConferenceDashboardSnapshot | null) => void
): () => void {
  latestListeners.push(callback)
  
  // Dispara valor imediato salvo local
  const current = getStoredLatestSnapshot()
  callback(current)

  // Escuta BroadcastChannel para atualizações de outras abas
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'DASHBOARD_UPDATED' && event.data.snapshot) {
      callback(event.data.snapshot)
    }
  }
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage)
  }

  // Escuta Firebase Realtime Database
  const db = getDatabaseInstance()
  let unsubFirebase: (() => void) | null = null

  if (db) {
    try {
      const latestRef = ref(db, 'vlic_telemetry/latest_conference_dashboard')
      unsubFirebase = onValue(
        latestRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.val() as ConferenceDashboardSnapshot
            if (data && !data.id?.startsWith('demo_') && !data.id?.includes('demo')) {
              callback(data)
            } else {
              callback(null)
            }
          } else {
            callback(null)
          }
        },
        (err) => {
          console.warn('Erro ao escutar latest_conference_dashboard no Firebase:', err)
        }
      )
    } catch (e) {}
  }

  return () => {
    latestListeners = latestListeners.filter((cb) => cb !== callback)
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage)
    }
    if (unsubFirebase) {
      unsubFirebase()
    }
  }
}

/**
 * Escuta o histórico de todos os dashboards gerados para permitir consultas passadas (apenas dados reais)
 */
export function subscribeToConferenceDashboardHistory(
  callback: (history: ConferenceDashboardSnapshot[]) => void,
  limitCount: number = 50
): () => void {
  historyListeners.push(callback)

  // Dispara histórico local imediato (somente conferências reais)
  const localHist = getStoredHistory()
  callback(localHist)

  // Escuta BroadcastChannel
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'DASHBOARD_UPDATED' && event.data.history) {
      const realHistory = event.data.history.filter(
        (item: ConferenceDashboardSnapshot) => item && !item.id?.startsWith('demo_') && !item.id?.includes('demo')
      )
      callback(realHistory)
    }
  }
  if (broadcastChannel) {
    broadcastChannel.addEventListener('message', handleMessage)
  }

  // Escuta Firebase
  const db = getDatabaseInstance()
  let unsubFirebase: (() => void) | null = null

  if (db) {
    try {
      const historyQuery = query(ref(db, 'vlic_telemetry/conference_dashboards'), limitToLast(limitCount))
      unsubFirebase = onValue(
        historyQuery,
        (snap) => {
          if (!snap.exists()) {
            callback(getStoredHistory())
            return
          }
          const val = snap.val()
          const list: ConferenceDashboardSnapshot[] = Object.keys(val)
            .map((k) => val[k])
            .filter((item) => item && !item.id?.startsWith('demo_') && !item.id?.includes('demo'))
          list.sort((a, b) => b.timestamp - a.timestamp)
          callback(list)
        },
        (err) => {
          console.warn('Erro ao ler histórico de dashboards no Firebase:', err)
          callback(getStoredHistory())
        }
      )
    } catch (e) {}
  }

  return () => {
    historyListeners = historyListeners.filter((cb) => cb !== callback)
    if (broadcastChannel) {
      broadcastChannel.removeEventListener('message', handleMessage)
    }
    if (unsubFirebase) {
      unsubFirebase()
    }
  }
}

/**
 * Remove uma sessão histórica específica
 */
export async function deleteConferenceDashboardSession(id: string): Promise<void> {
  const currentHistory = getStoredHistory().filter((item) => item.id !== id)
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(currentHistory))
  }
  historyListeners.forEach((cb) => cb(currentHistory))

  const db = getDatabaseInstance()
  if (db) {
    try {
      const itemRef = ref(db, `vlic_telemetry/conference_dashboards/${id}`)
      await remove(itemRef)
    } catch (e) {}
  }
}

/**
 * Limpa todo o histórico de sessões
 */
export async function clearConferenceDashboardHistory(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_HISTORY)
    localStorage.removeItem(STORAGE_KEY_LATEST)
  }
  historyListeners.forEach((cb) => cb([]))
  latestListeners.forEach((cb) => cb(null))

  const db = getDatabaseInstance()
  if (db) {
    try {
      await remove(ref(db, 'vlic_telemetry/conference_dashboards'))
      await remove(ref(db, 'vlic_telemetry/latest_conference_dashboard'))
    } catch (e) {}
  }
}

