// Utilitário especializado na extração, identificação e agrupamento de Vagões Ferroviários por Transbordo

export interface ExtractedVagao {
  identificador: string // Ex: "HPT-0329479" ou "0329479"
  serie?: string // Ex: "HPT"
  numero?: string // Ex: "0329479"
  origemDoc?: string // "DCL" | "DANFE" | "XML" | "PLACA" | "INF_CPL"
}

export interface VagaoGroupingItem {
  vagao: string // Ex: "HPT-0329479"
  serie?: string
  numero?: string
  transbordo: string // Ex: "RONDONOPOLIS"
  terminal: string // Ex: "TEG"
  totalNotas: number
  chavesNotas: string[]
  numerosNotas: string[]
  pesoTotalKg: number
  pesoTotalFormatted: string
  valorTotal: number
  valorTotalFormatted: string
  produtos: string[]
  destinatarios: string[]
  origemDoc?: string
}

export interface TransbordoVagaoStats {
  transbordo: string
  totalVagoes: number
  vagoes: VagaoGroupingItem[]
  totalNotas: number
  pesoTotalKg: number
  pesoTotalFormatted: string
  valorTotal: number
  valorTotalFormatted: string
  color?: string
}

// Prefixos comuns de vagões ferroviários no Brasil (Rumo, VLI, MRS, Vale, etc.)
const KNOWN_WAGON_PREFIXES = [
  'HPT', 'HTT', 'HPE', 'HFT', 'TDT', 'FCT', 'ACT', 'GDT', 'PRD',
  'FHD', 'HAD', 'HND', 'HSD', 'TSD', 'TCB', 'GHT', 'TPT', 'VAG',
  'FRG', 'VCD', 'VLS', 'VPE', 'MND', 'GND', 'ALL', 'RUM', 'VLI',
  'MRS', 'VAL', 'FNS'
]

/**
 * Extrai a chave canônica do numeral do vagão para deduplicação precisa.
 * Vagões com o mesmo numeral (ex: "HPT-0329479", "0329479", "329479", "HPT 0329479")
 * compartilham o mesmo numeral chave ("329479" / "0329479"), evitando duplicidades no dashboard e nos cards.
 */
export function getVagaoNumeralKey(raw: string): string {
  if (!raw) return ''
  const clean = raw.trim().toUpperCase()

  // Extrai sequência numérica com 4 a 10 dígitos (padrão de vagão ferroviário)
  const digitsMatch = clean.match(/(\d{4,10})/)
  if (digitsMatch) {
    const digits = digitsMatch[1]
    // Remove zeros à esquerda redundantes para unificar "0329479" e "329479"
    const trimmed = digits.replace(/^0+/, '')
    return trimmed || digits
  }

  // Fallback para strings alfanuméricas / nomes de pastas / lote (ex: "PASTA 1", "PASTA 2", "LOTE A")
  return clean.replace(/[^A-Z0-9]/g, '') || clean
}

/**
 * Extrai o nome da pasta / diretório inputado de um arquivo a partir de seu caminho relativo ou original
 */
export function extractFolderName(pathOrItem?: string | { fileName?: string; filePath?: string; originalPath?: string } | null): string | null {
  if (!pathOrItem) return null
  let raw = ''
  if (typeof pathOrItem === 'string') {
    raw = pathOrItem
  } else {
    raw = pathOrItem.originalPath || pathOrItem.filePath || pathOrItem.fileName || ''
  }
  if (!raw) return null

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim()
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length > 1) {
    // O último elemento é o nome do arquivo.
    // O elemento imediatamente anterior é o nome da pasta direta do arquivo.
    const parentFolder = parts[parts.length - 2].trim()
    if (parentFolder && parentFolder !== '.' && parentFolder !== '..' && parentFolder !== 'dist' && parentFolder !== 'public') {
      return parentFolder
    }
  }

  // Se não tem barra ou veio em nível raiz, verificar se o nome do arquivo começa com padrão de vagão/pasta numérica (ex: "0619604.pdf", "0619604_NF1.xml")
  const baseName = parts[parts.length - 1] || ''
  const cleanName = baseName.replace(/\.(xml|pdf|zip)$/i, '').trim()
  const matchNumWagon = cleanName.match(/^(\d{5,10})([-_ ].*)?$/)
  if (matchNumWagon) {
    return matchNumWagon[1]
  }

  const matchPrefixWagon = cleanName.match(/^([A-Za-z]{2,5})[-_ ]*(\d{4,10})([-_ ].*)?$/)
  if (matchPrefixWagon) {
    return `${matchPrefixWagon[1].toUpperCase()}-${matchPrefixWagon[2]}`
  }

  return null
}

/**
 * Normaliza o identificador do vagão para um padrão limpo (Ex: "HPT-0329479" ou "0329479")
 */
export function normalizarIdentificadorVagao(raw: string): string {
  if (!raw) return ''
  const clean = raw.trim().toUpperCase()

  // Se tem formato "HPT 0329479" ou "HPT-0329479" ou "HPT0329479"
  const prefixMatch = clean.match(/^([A-Z]{2,4})[- ]*(\d{4,10})$/)
  if (prefixMatch) {
    return `${prefixMatch[1]}-${prefixMatch[2]}`
  }

  // Se for apenas numérico (ex: "0329479")
  const numOnlyMatch = clean.match(/^(\d{4,10})$/)
  if (numOnlyMatch) {
    return numOnlyMatch[1]
  }

  return clean.replace(/\s+/g, '-')
}

/**
 * Extrai todos os vagões detectados em um texto, XML ou dados de frete,
 * garantindo deduplicação estrita por numeral de vagão.
 */
export function extractVagoesFromDocument(params: {
  text?: string
  xmlContent?: string
  placa?: string
  rawSnippet?: string
  infCpl?: string
}): ExtractedVagao[] {
  const { text = '', xmlContent = '', placa = '', rawSnippet = '', infCpl = '' } = params
  const combined = `${text} ${xmlContent} ${rawSnippet} ${infCpl}`.replace(/\r?\n/g, ' ')
  const foundMap = new Map<string, ExtractedVagao>()

  const addVagao = (id: string, serie?: string, numero?: string, origem?: string) => {
    const norm = normalizarIdentificadorVagao(id)
    if (!norm || norm.length < 4) return

    const numKey = getVagaoNumeralKey(numero || id)
    if (!numKey) return

    const newSerie = serie?.toUpperCase() || (norm.includes('-') ? norm.split('-')[0] : undefined)
    const newNumero = numero || (norm.includes('-') ? norm.split('-')[1] : norm)

    const existing = foundMap.get(numKey)
    if (existing) {
      // Se já existe e o novo dado traz uma Série (ex: "HPT") que o anterior não tinha, enriquece
      if (newSerie && (!existing.serie || existing.serie.length < newSerie.length)) {
        existing.serie = newSerie
        existing.numero = newNumero || existing.numero
        existing.identificador = `${newSerie}-${existing.numero}`
        existing.origemDoc = origem || existing.origemDoc
      }
      return
    }

    let displayId = norm
    if (newSerie && newNumero && !norm.includes('-')) {
      displayId = `${newSerie}-${newNumero}`
    }

    foundMap.set(numKey, {
      identificador: displayId,
      serie: newSerie,
      numero: newNumero,
      origemDoc: origem || 'DOCUMENTO',
    })
  }

  // 1. DCL / DANFE: "Série Vagão: HPT Cód. Vagão: 0329479" ou "Série Vagão: HPT ... Cód. Vagão: 0329479"
  const dclWagonRegex = /S[ée]rie\s+Vag[ãa]o\s*[:=-]?\s*([A-Za-z0-9]{2,5})[\s\S]{0,40}?C[óo]d(?:\.|ifica[çc][ãa]o)?\s*Vag[ãa]o\s*[:=-]?\s*([0-9]{4,10})/gi
  let match: RegExpExecArray | null
  while ((match = dclWagonRegex.exec(combined)) !== null) {
    const serie = match[1].trim()
    const num = match[2].trim()
    addVagao(`${serie}-${num}`, serie, num, 'DCL')
  }

  // 2. "Vagão: HPT 0329479" ou "Vagão HPT 0329479" ou "VAGAO HPT 0329479"
  const vagaoDirectRegex = /(?:VAG[ÃA]O|VAGAO|IDENTIFICACAO\s+DO\s+VAGAO|ID\s+VAGAO)\s*[:=-]?\s*([A-Za-z]{2,5})[- ]*([0-9]{4,10})/gi
  while ((match = vagaoDirectRegex.exec(combined)) !== null) {
    const serie = match[1].trim()
    const num = match[2].trim()
    addVagao(`${serie}-${num}`, serie, num, 'DANFE')
  }

  // 3. "Vagão: 0329479" ou "Vagão 0329479" (apenas numeral do vagão)
  const vagaoNumOnlyRegex = /(?:VAG[ÃA]O|VAGAO)\s*[:=-]?\s*([0-9]{5,10})/gi
  while ((match = vagaoNumOnlyRegex.exec(combined)) !== null) {
    const num = match[1].trim()
    addVagao(num, undefined, num, 'DANFE')
  }

  // 4. Placa com padrão ferroviário (ex: "HPT-0329479", "HPT0329479", "HTT 7538405")
  if (placa) {
    const cleanPlaca = placa.trim().toUpperCase()
    const isWagonPrefix = KNOWN_WAGON_PREFIXES.some(p => cleanPlaca.startsWith(p))
    const placaWagonMatch = cleanPlaca.match(/^([A-Z]{2,5})[- ]*(\d{5,10})$/)

    if (placaWagonMatch) {
      addVagao(`${placaWagonMatch[1]}-${placaWagonMatch[2]}`, placaWagonMatch[1], placaWagonMatch[2], 'PLACA')
    } else if (isWagonPrefix) {
      const matchWithKnownPrefix = cleanPlaca.match(/^([A-Z]{2,5})[- ]*(\d{4,10})$/)
      if (matchWithKnownPrefix) {
        addVagao(`${matchWithKnownPrefix[1]}-${matchWithKnownPrefix[2]}`, matchWithKnownPrefix[1], matchWithKnownPrefix[2], 'PLACA')
      } else {
        addVagao(cleanPlaca, undefined, undefined, 'PLACA')
      }
    }
  }

  // 5. Tags de XML de CTe/MDFe/NFe: <tpVag> e <nVag>
  if (xmlContent) {
    const xmlVagRegex = /<tpVag>([^<]+)<\/tpVag>[\s\S]{0,30}?<nVag>([^<]+)<\/nVag>/gi
    while ((match = xmlVagRegex.exec(xmlContent)) !== null) {
      const tp = match[1].trim()
      const nv = match[2].trim()
      addVagao(`${tp}-${nv}`, tp, nv, 'XML')
    }

    const xmlVagAltRegex = /<nVag>([^<]+)<\/nVag>[\s\S]{0,30}?<tpVag>([^<]+)<\/tpVag>/gi
    while ((match = xmlVagAltRegex.exec(xmlContent)) !== null) {
      const nv = match[1].trim()
      const tp = match[2].trim()
      addVagao(`${tp}-${nv}`, tp, nv, 'XML')
    }

    const xmlTagVagRegex = /<(?:serieVag|tpVag|serieVagao)>([^<]+)<\/(?:serieVag|tpVag|serieVagao)>[\s\S]{0,40}?<(?:numVag|codVag|nVag|codVagao)>([^<]+)<\/(?:numVag|codVag|nVag|codVagao)>/gi
    while ((match = xmlTagVagRegex.exec(xmlContent)) !== null) {
      const s = match[1].trim()
      const n = match[2].trim()
      addVagao(`${s}-${n}`, s, n, 'XML')
    }

    // Tag <obsCont xCampo="VAGAO"><xTexto>HPT 0329479</xTexto></obsCont>
    const obsVagRegex = /<obsCont[^>]*xCampo=["'](?:VAGAO|VAG[ÃA]O|VAGOES)["'][^>]*>[\s\S]*?<xTexto>([^<]+)<\/xTexto>/gi
    while ((match = obsVagRegex.exec(xmlContent)) !== null) {
      const txt = match[1].trim()
      const vm = txt.match(/([A-Za-z]{2,5})?[- ]*([0-9]{4,10})/)
      if (vm) {
        if (vm[1] && vm[2]) addVagao(`${vm[1]}-${vm[2]}`, vm[1], vm[2], 'XML_OBS')
        else if (vm[2]) addVagao(vm[2], undefined, vm[2], 'XML_OBS')
      }
    }
  }

  // 6. Busca de prefixos ferroviários conhecidos próximos a palavras de transporte
  const prefixGroup = KNOWN_WAGON_PREFIXES.join('|')
  const wagonPattern = new RegExp(`\\b(${prefixGroup})[- ]*(\\d{4,8})\\b`, 'gi')
  while ((match = wagonPattern.exec(combined)) !== null) {
    const s = match[1].trim()
    const n = match[2].trim()
    addVagao(`${s}-${n}`, s, n, 'INF_CPL')
  }

  return Array.from(foundMap.values())
}

/**
 * Paleta de cores para os transbordos no gráfico de vagões
 */
export const TRANSBORDO_VAGAO_COLORS = [
  '#f59e0b', // Amber / Ouro
  '#3b82f6', // Azul
  '#10b981', // Verde
  '#8b5cf6', // Violeta
  '#ec4899', // Rosa
  '#06b6d4', // Ciano
  '#f97316', // Laranja
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Lima
]
