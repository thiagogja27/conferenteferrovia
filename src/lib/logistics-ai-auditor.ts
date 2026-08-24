export interface LogisticsAuditInputItem {
  id: string
  numero?: string
  serie?: string
  chave?: string
  emitNome?: string
  destNome?: string
  destCNPJ?: string
  terminal?: string
  transbordo?: string
  produto?: string
  retirada?: string
  infCpl?: string
  rawSnippet?: string
  xmlContent?: string
}

export type LogisticsStatusTipo =
  | 'AJUSTADO_IA'
  | 'PARCIALMENTE_AJUSTADO'
  | 'DADOS_JA_COMPLETOS'
  | 'NAO_CONSTA_NO_DOC'

export interface LogisticsAuditResultItem {
  id: string
  numero?: string
  terminalCorrigido?: string
  transbordoCorrigido?: string
  destinatarioCorrigido?: string
  retiradaCorrigida?: string
  produtoCorrigido?: string
  status: LogisticsStatusTipo
  veredito: string
  explicacao: string
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA'
  modoUtilizado: 'GEMINI_IA' | 'HEURISTICA_LOCAL'
  camposAjustados: Array<'terminal' | 'transbordo' | 'destinatario' | 'retirada' | 'produto'>
}

export interface LogisticsAuditResponse {
  totalAuditados: number
  totalAjustados: number
  totalSemDados: number
  resultados: LogisticsAuditResultItem[]
  tokensUtilizadosEstimados?: number
  provedor: 'GEMINI_3_7_FLASH' | 'HEURISTICA_INTELIGENTE'
}

export interface NoteLogisticsOverride {
  terminal?: string
  transbordo?: string
  destNome?: string
  retirada?: string
  produto?: string
  auditResult?: LogisticsAuditResultItem
  appliedAt?: string
}

// ----------------------------------------------------
// Heurística Local Especializada para Logística DANFE
// ----------------------------------------------------

function isNaoInformado(val?: string | null): boolean {
  if (!val) return true
  const norm = val.trim().toUpperCase()
  return (
    norm === '' ||
    norm === 'NÃO INFORMADO' ||
    norm === 'NAO INFORMADO' ||
    norm === 'NÃO INFORMADA' ||
    norm === 'NAO INFORMADA' ||
    norm === 'NÃO IDENTIFICADO' ||
    norm === 'NAO IDENTIFICADO' ||
    norm === 'DESTINATÁRIO NÃO IDENTIFICADO' ||
    norm === 'DESTINATARIO NAO IDENTIFICADO' ||
    norm === 'OUTRO' ||
    norm === 'OUTROS' ||
    norm === '-'
  )
}

export function auditarLogisticaHeuristicaLocal(item: LogisticsAuditInputItem): LogisticsAuditResultItem {
  const fullText = `${item.infCpl || ''} ${item.rawSnippet || ''} ${item.xmlContent || ''} ${item.emitNome || ''} ${item.destNome || ''}`.toUpperCase()
  const camposAjustados: Array<'terminal' | 'transbordo' | 'destinatario' | 'retirada' | 'produto'> = []
  
  let terminalCorrigido = item.terminal
  let transbordoCorrigido = item.transbordo
  let destinatarioCorrigido = item.destNome
  let retiradaCorrigida = item.retirada
  let produtoCorrigido = item.produto

  // 1. Auditoria e Identificação de Terminal de Entrega
  if (isNaoInformado(item.terminal)) {
    if (/\bTEAG\b|TERMINAL.*EXPORTA[CÇ][AÃ]O.*A[CÇ][UÚ]CAR|ACUCAR.*GUARUJ[AÁ]|TEAG/i.test(fullText)) {
      terminalCorrigido = 'TEAG - TERMINAL DE ACUCAR DO GUARUJA'
      camposAjustados.push('terminal')
    } else if (/\bTEG\b|TERMINAL.*EXPORTADOR.*GUARUJ[AÁ]|TERM.*EXP.*GUARUJA/i.test(fullText)) {
      terminalCorrigido = 'TEG - TERMINAL EXPORTADOR DO GUARUJA'
      camposAjustados.push('terminal')
    } else if (/\bCLI\b|CORREDOR.*LOG[IÍ]STIC.*INTEGRAD/i.test(fullText)) {
      terminalCorrigido = 'CLI - CORREDOR LOGÍSTICA INTEGRADA'
      camposAjustados.push('terminal')
    } else if (/\bTGG\b|TERMINAL.*GR[AÃ]OS.*GUARUJ[AÁ]/i.test(fullText)) {
      terminalCorrigido = 'TGG - TERMINAL DE GRAOS DO GUARUJA'
      camposAjustados.push('terminal')
    } else if (/\bT-124\b|\bT124\b|TERMINAL.*124/i.test(fullText)) {
      terminalCorrigido = 'TERMINAL 124'
      camposAjustados.push('terminal')
    } else if (/SANTOS BRASIL/i.test(fullText)) {
      terminalCorrigido = 'SANTOS BRASIL'
      camposAjustados.push('terminal')
    } else if (/DP WORLD/i.test(fullText)) {
      terminalCorrigido = 'DP WORLD SANTOS'
      camposAjustados.push('terminal')
    } else if (/ECOPORTO/i.test(fullText)) {
      terminalCorrigido = 'ECOPORTO SANTOS'
      camposAjustados.push('terminal')
    } else if (/BTP|BRASIL TERMINAL PORTU/i.test(fullText)) {
      terminalCorrigido = 'BTP - BRASIL TERMINAL PORTUARIO'
      camposAjustados.push('terminal')
    } else if (/TIPLAM/i.test(fullText)) {
      terminalCorrigido = 'TIPLAM - TERMINAL INTEGRADO'
      camposAjustados.push('terminal')
    } else if (/TERMINAL RUMO|RUMO MALHA/i.test(fullText)) {
      terminalCorrigido = 'TERMINAL RUMO'
      camposAjustados.push('terminal')
    } else if (/TERMINAL VLI|VLI/i.test(fullText)) {
      terminalCorrigido = 'TERMINAL VLI'
      camposAjustados.push('terminal')
    } else if (/GUARUJ[AÁ]/i.test(fullText)) {
      terminalCorrigido = 'TEG - TERMINAL EXPORTADOR DO GUARUJA'
      camposAjustados.push('terminal')
    }
  }

  // 2. Auditoria e Identificação de Transbordo
  if (isNaoInformado(item.transbordo)) {
    if (/ITURAMA/i.test(fullText)) {
      transbordoCorrigido = 'ITURAMA'
      camposAjustados.push('transbordo')
    } else if (/PRAD[OÓ]POLIS/i.test(fullText)) {
      transbordoCorrigido = 'PRADOPOLIS'
      camposAjustados.push('transbordo')
    } else if (/NOVA\s*AGRI|NOVAAGRI/i.test(fullText)) {
      transbordoCorrigido = 'NOVA AGRI - ALTO TAQUARI'
      camposAjustados.push('transbordo')
    } else if (/ALTO\s*TAQUARI/i.test(fullText)) {
      transbordoCorrigido = 'ALTO TAQUARI'
      camposAjustados.push('transbordo')
    } else if (/RONDON[OÓ]POLIS/i.test(fullText)) {
      transbordoCorrigido = 'RONDONOPOLIS (RUMO)'
      camposAjustados.push('transbordo')
    } else if (/RIO\s*VERDE/i.test(fullText)) {
      transbordoCorrigido = 'RIO VERDE'
      camposAjustados.push('transbordo')
    } else if (/ARAGUARI/i.test(fullText)) {
      transbordoCorrigido = 'ARAGUARI (VLI)'
      camposAjustados.push('transbordo')
    } else if (/UBERABA|TIUB/i.test(fullText)) {
      transbordoCorrigido = 'UBERABA'
      camposAjustados.push('transbordo')
    } else if (/PEDERNEIRAS/i.test(fullText)) {
      transbordoCorrigido = 'PEDERNEIRAS (RUMO)'
      camposAjustados.push('transbordo')
    } else if (/GUAR[AÁ]/i.test(fullText)) {
      transbordoCorrigido = 'GUARA'
      camposAjustados.push('transbordo')
    } else if (/UBERL[AÂ]NDIA/i.test(fullText)) {
      transbordoCorrigido = 'UBERLANDIA'
      camposAjustados.push('transbordo')
    } else if (/S[AÃ]O\s*SIM[AÃ]O/i.test(fullText)) {
      transbordoCorrigido = 'SAO SIMAO'
      camposAjustados.push('transbordo')
    } else if (/CHAPAD[AÃ]O\s*DO\s*SUL/i.test(fullText)) {
      transbordoCorrigido = 'CHAPADAO DO SUL'
      camposAjustados.push('transbordo')
    } else if (/INOC[EÊ]NCIA/i.test(fullText)) {
      transbordoCorrigido = 'INOCENCIA'
      camposAjustados.push('transbordo')
    } else if (/ITIQUIRA/i.test(fullText)) {
      transbordoCorrigido = 'ITIQUIRA'
      camposAjustados.push('transbordo')
    }
  }

  // 3. Auditoria e Identificação de Destinatário
  if (isNaoInformado(item.destNome)) {
    if (/CORURIPE/i.test(fullText) || /12\.?229\.?415/i.test(fullText)) {
      destinatarioCorrigido = 'S/A USINA CORURIPE ACUCAR E ALCOOL'
      camposAjustados.push('destinatario')
    } else if (/CARGILL/i.test(fullText)) {
      destinatarioCorrigido = 'CARGILL AGRICOLA SA'
      camposAjustados.push('destinatario')
    } else if (/COPERSUCAR/i.test(fullText) || /10\.?265\.?949/i.test(fullText)) {
      destinatarioCorrigido = 'COPERSUCAR S.A.'
      camposAjustados.push('destinatario')
    } else if (/RA[IÍ]ZEN/i.test(fullText)) {
      destinatarioCorrigido = 'RAIZEN ENERGIA S.A.'
      camposAjustados.push('destinatario')
    } else if (/S[AÃ]O\s*MARTINHO/i.test(fullText)) {
      destinatarioCorrigido = 'USINA SAO MARTINHO S/A'
      camposAjustados.push('destinatario')
    } else if (/ADECOAGRO/i.test(fullText)) {
      destinatarioCorrigido = 'ADECOAGRO VALE DO IVINHEMA S.A.'
      camposAjustados.push('destinatario')
    } else if (/ALTA\s*MOGIANA/i.test(fullText)) {
      destinatarioCorrigido = 'USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL'
      camposAjustados.push('destinatario')
    } else if (/SANTA\s*TEREZINHA|USACUCAR/i.test(fullText)) {
      destinatarioCorrigido = 'USINA SANTA TEREZINHA LTDA'
      camposAjustados.push('destinatario')
    } else if (/BATATAIS/i.test(fullText)) {
      destinatarioCorrigido = 'USINA BATATAIS S/A ACUCAR E ALCOOL'
      camposAjustados.push('destinatario')
    } else if (/TEREOS|GUARANI/i.test(fullText)) {
      destinatarioCorrigido = 'TEREOS ACUCAR E ENERGIA BRASIL S.A.'
      camposAjustados.push('destinatario')
    } else if (/BP\s*BUNGE|BUNGE/i.test(fullText)) {
      destinatarioCorrigido = 'BP BUNGE BIOENERGIA S.A.'
      camposAjustados.push('destinatario')
    } else if (/COFCO/i.test(fullText)) {
      destinatarioCorrigido = 'COFCO INTERNATIONAL BRASIL S.A.'
      camposAjustados.push('destinatario')
    } else if (/LOUIS\s*DREYFUS|LDC/i.test(fullText)) {
      destinatarioCorrigido = 'LOUIS DREYFUS COMPANY BRASIL S.A.'
      camposAjustados.push('destinatario')
    } else if (/AMAGGI/i.test(fullText)) {
      destinatarioCorrigido = 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'
      camposAjustados.push('destinatario')
    } else if (/ADM\s*DO\s*BRASIL/i.test(fullText)) {
      destinatarioCorrigido = 'ADM DO BRASIL LTDA'
      camposAjustados.push('destinatario')
    } else if (item.destCNPJ) {
      destinatarioCorrigido = `DESTINATÁRIO (CNPJ ${item.destCNPJ})`
      camposAjustados.push('destinatario')
    }
  }

  // 4. Auditoria de Produto
  if (isNaoInformado(item.produto)) {
    if (/CRISTAL/i.test(fullText)) {
      produtoCorrigido = 'ACUCAR CRISTAL VHP'
      camposAjustados.push('produto')
    } else if (/A[CÇ][UÚ]CAR|VHP/i.test(fullText)) {
      produtoCorrigido = 'ACUCAR BRUTO VHP'
      camposAjustados.push('produto')
    } else if (/SOJA/i.test(fullText)) {
      produtoCorrigido = 'SOJA EM GRAOS'
      camposAjustados.push('produto')
    } else if (/MILHO/i.test(fullText)) {
      produtoCorrigido = 'MILHO EM GRAOS'
      camposAjustados.push('produto')
    } else if (/FARELO/i.test(fullText)) {
      produtoCorrigido = 'FARELO DE SOJA'
      camposAjustados.push('produto')
    }
  }

  let status: LogisticsStatusTipo = 'NAO_CONSTA_NO_DOC'
  let veredito = 'Dados Não Identificados no Documento'
  let explicacao = 'O documento fiscal não possui menção expressa aos dados logísticos faltantes.'

  if (camposAjustados.length > 0) {
    status = 'AJUSTADO_IA'
    const descCampos = camposAjustados.map(c => {
      if (c === 'terminal') return `Terminal: ${terminalCorrigido}`
      if (c === 'transbordo') return `Transbordo: ${transbordoCorrigido}`
      if (c === 'destinatario') return `Destinatário: ${destinatarioCorrigido}`
      if (c === 'produto') return `Produto: ${produtoCorrigido}`
      return c
    }).join(' | ')
    veredito = `Dados Identificados com Sucesso: ${descCampos}`
    explicacao = `Localizado a partir da análise dos dados adicionais e texto fiscal da DANFE (${camposAjustados.join(', ')}).`
  }

  return {
    id: item.id,
    numero: item.numero,
    terminalCorrigido: isNaoInformado(terminalCorrigido) ? undefined : terminalCorrigido,
    transbordoCorrigido: isNaoInformado(transbordoCorrigido) ? undefined : transbordoCorrigido,
    destinatarioCorrigido: isNaoInformado(destinatarioCorrigido) ? undefined : destinatarioCorrigido,
    retiradaCorrigida: isNaoInformado(retiradaCorrigida) ? undefined : retiradaCorrigida,
    produtoCorrigido: isNaoInformado(produtoCorrigido) ? undefined : produtoCorrigido,
    status,
    veredito,
    explicacao,
    confianca: camposAjustados.length > 0 ? 'ALTA' : 'BAIXA',
    modoUtilizado: 'HEURISTICA_LOCAL',
    camposAjustados,
  }
}

/**
 * Chama o backend com IA Gemini 3.7 Flash para auditar e preencher dados logísticos não informados
 */
export async function auditarLogisticaComIA(items: LogisticsAuditInputItem[]): Promise<LogisticsAuditResponse> {
  if (!items || items.length === 0) {
    return {
      totalAuditados: 0,
      totalAjustados: 0,
      totalSemDados: 0,
      resultados: [],
      provedor: 'HEURISTICA_INTELIGENTE',
    }
  }

  try {
    const response = await fetch('/api/gemini/audit-logistics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    })

    if (!response.ok) {
      throw new Error(`Erro na chamada da API: ${response.status} ${response.statusText}`)
    }

    const data: LogisticsAuditResponse = await response.json()
    return data
  } catch (err) {
    console.warn('[Logistics Auditor] Fallback heurístico inteligente:', err)
    const localResults = items.map(auditarLogisticaHeuristicaLocal)
    const totalAjustados = localResults.filter(r => r.camposAjustados.length > 0).length
    return {
      totalAuditados: items.length,
      totalAjustados,
      totalSemDados: items.length - totalAjustados,
      resultados: localResults,
      tokensUtilizadosEstimados: 0,
      provedor: 'HEURISTICA_INTELIGENTE',
    }
  }
}
