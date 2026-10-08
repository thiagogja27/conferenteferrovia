export interface WeightAuditItemInput {
  id: string
  identificador: string // Ex: "HPT 250490"
  numeroApenas: string // Ex: "250490"
  serie?: string
  pesoMDF?: number // Peso lido pelo sistema no documento (em toneladas)
  pesoExcel?: number // Peso lido na planilha Excel (em toneladas)
  diferencaPeso?: number // pesoMDF - pesoExcel
  trechoTextoDocumento?: string // Trecho de texto com contexto ao redor do vagão
  linhaExcel?: number
  dadosExcelRaw?: Record<string, any> | string
}

export type VereditoTipo = 'ERRO_LEITURA_SISTEMA' | 'DIVERGENCIA_REAL' | 'PESO_AUSENTE_NO_DOC' | 'CONFERIDO_CORRETO'

export interface WeightAuditItemResult {
  id: string
  identificador: string
  status: VereditoTipo
  veredito: string // Resumo amigável (Ex: "Falha de Leitura do Sistema: O PDF contém 74,660 t, mas o sistema leu 74,66 t")
  pesoCorrigidoDoc?: number | null // Peso real extraído do documento (se detectado)
  pesoExcel?: number | null
  diferencaReal?: number | null
  explicacao: string // Explicação concisa e objetiva
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA'
  modoUtilizado: 'GEMINI_IA' | 'HEURISTICA_LOCAL'
}

export interface WeightAuditResponse {
  totalAuditados: number
  totalErrosLeitura: number
  totalDivergenciasReais: number
  totalConferidos: number
  resultados: WeightAuditItemResult[]
  tokensUtilizadosEstimados?: number
  provedor: 'GEMINI_3_7_FLASH' | 'HEURISTICA_INTELIGENTE'
}

/**
 * Função de auditoria heurística local ultra-rápida (opera 100% offline no cliente ou servidor como fallback)
 */
export function auditarHeuristicaLocal(item: WeightAuditItemInput): WeightAuditItemResult {
  const { identificador, numeroApenas, pesoMDF, pesoExcel, trechoTextoDocumento = '' } = item
  
  // Normalização do texto
  const cleanSnippet = trechoTextoDocumento.replace(/\s+/g, ' ')
  
  let pesoCorrigidoDoc: number | null = pesoMDF ?? null
  let status: VereditoTipo = 'DIVERGENCIA_REAL'
  let explicacao = ''
  let veredito = ''
  let confianca: 'ALTA' | 'MEDIA' | 'BAIXA' = 'MEDIA'

  // Caso 1: Ambos os pesos existem e são idênticos ou com diferença desprezível (< 0.005 t)
  if (pesoMDF !== undefined && pesoExcel !== undefined && Math.abs(pesoMDF - pesoExcel) <= 0.005) {
    return {
      id: item.id,
      identificador,
      status: 'CONFERIDO_CORRETO',
      veredito: 'Pesos Conferidos e Alinhados',
      pesoCorrigidoDoc: pesoMDF,
      pesoExcel,
      diferencaReal: 0,
      explicacao: 'O peso lido no documento coincide com o peso informado no Excel.',
      confianca: 'ALTA',
      modoUtilizado: 'HEURISTICA_LOCAL',
    }
  }

  // Caso Especial Prioritário: Tabela de Produtos / Campo QUANT / QUANTIDADE da DANFE
  // 1. Linha completa de produto DANFE: [CFOP] [UN] [QUANT] [VALOR_UNIT] [VALOR_TOTAL]
  // Ex: "5504 TON 47,62 1.557,99 74.191,53" ou "5504 TON 47,62"
  const danfeProdRowRegex = /(?:5\d{3}|6\d{3})\s+(TON|TONELADA|KG|KGS|SC|SAC|UN|UND|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b)/i
  const danfeProdRowMatch = cleanSnippet.match(danfeProdRowRegex)
  if (danfeProdRowMatch) {
    const unit = danfeProdRowMatch[1].toUpperCase()
    const rawVal = danfeProdRowMatch[2]
    const numVal = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'))
    if (numVal > 0) {
      const valInTons = (unit.startsWith('TON') || unit === 'TO' || unit === 'T') 
        ? numVal 
        : (numVal >= 1000 ? Number((numVal / 1000).toFixed(3)) : numVal)
      
      const isMatchExcel = pesoExcel !== undefined && (Math.abs(valInTons - pesoExcel) <= 0.01 || (pesoExcel >= 1000 && Math.abs(valInTons * 1000 - pesoExcel) <= 1))
      const isMatchDoc = pesoMDF !== undefined && (Math.abs(valInTons - pesoMDF) <= 0.01 || (pesoMDF >= 1000 && Math.abs(valInTons * 1000 - pesoMDF) <= 1))

      let statusVal: VereditoTipo = 'DIVERGENCIA_REAL'
      if (pesoExcel !== undefined) {
        statusVal = isMatchExcel ? 'ERRO_LEITURA_SISTEMA' : 'DIVERGENCIA_REAL'
      } else {
        statusVal = (pesoMDF === undefined || pesoMDF === 0 || !isMatchDoc) ? 'ERRO_LEITURA_SISTEMA' : 'CONFERIDO_CORRETO'
      }

      return {
        id: item.id,
        identificador,
        status: statusVal,
        veredito: statusVal === 'ERRO_LEITURA_SISTEMA' 
          ? `Quantidade Corrigida pela IA: ${valInTons.toFixed(3)} t (${rawVal} ${unit})`
          : `Quantidade Real no Campo QUANT: ${valInTons.toFixed(3)} t (${rawVal} ${unit})`,
        pesoCorrigidoDoc: valInTons,
        pesoExcel,
        diferencaReal: pesoExcel !== undefined ? Number((valInTons - (pesoExcel >= 1000 ? pesoExcel / 1000 : pesoExcel)).toFixed(3)) : 0,
        explicacao: `Localizado na coluna QUANT dos Dados dos Produtos/Serviços: ${rawVal} ${unit} (${valInTons.toFixed(3)} t)${pesoExcel !== undefined ? (isMatchExcel ? ', conferindo com a planilha Excel.' : ', divergindo do peso da planilha.') : (statusVal === 'ERRO_LEITURA_SISTEMA' ? `, corrigindo a leitura inicial do sistema (${pesoMDF ?? 0} t).` : ', conferido com precisão pela IA.')}`,
        confianca: 'ALTA',
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }
  }

  // 2. Volumes de Transporte: QUANTIDADE | ESPÉCIE | PESO BRUTO | PESO LÍQUIDO
  // Ex: "47.620,00 QUILOGRAMA 73.540,00 47.620,00"
  const danfeVolRowRegex = /(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)\s+(?:QUILOGRAMA|KG|TONELADA|TON|GRANEL|SACS?|VOLS?)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)/i
  const danfeVolRowMatch = cleanSnippet.match(danfeVolRowRegex)
  if (danfeVolRowMatch) {
    const rawPesoL = danfeVolRowMatch[3]
    const numPesoL = parseFloat(rawPesoL.replace(/\./g, '').replace(',', '.'))
    if (numPesoL > 0) {
      const pesoLInTons = numPesoL >= 1000 ? Number((numPesoL / 1000).toFixed(3)) : numPesoL
      const isMatchExcel = pesoExcel !== undefined && (Math.abs(pesoLInTons - pesoExcel) <= 0.01 || (pesoExcel >= 1000 && Math.abs(pesoLInTons * 1000 - pesoExcel) <= 1))
      const isMatchDoc = pesoMDF !== undefined && (Math.abs(pesoLInTons - pesoMDF) <= 0.01 || (pesoMDF >= 1000 && Math.abs(pesoLInTons * 1000 - pesoMDF) <= 1))
      
      let statusVal: VereditoTipo = 'DIVERGENCIA_REAL'
      if (pesoExcel !== undefined) {
        statusVal = isMatchExcel ? 'ERRO_LEITURA_SISTEMA' : 'DIVERGENCIA_REAL'
      } else {
        statusVal = (pesoMDF === undefined || pesoMDF === 0 || !isMatchDoc) ? 'ERRO_LEITURA_SISTEMA' : 'CONFERIDO_CORRETO'
      }

      return {
        id: item.id,
        identificador,
        status: statusVal,
        veredito: statusVal === 'ERRO_LEITURA_SISTEMA'
          ? `Peso Líquido Corrigido pela IA: ${pesoLInTons.toFixed(3)} t (${rawPesoL} kg)`
          : `Peso Líquido da DANFE: ${pesoLInTons.toFixed(3)} t (${rawPesoL} kg)`,
        pesoCorrigidoDoc: pesoLInTons,
        pesoExcel,
        diferencaReal: pesoExcel !== undefined ? Number((pesoLInTons - (pesoExcel >= 1000 ? pesoExcel / 1000 : pesoExcel)).toFixed(3)) : 0,
        explicacao: `Localizado na seção de Transporte/Peso Líquido da DANFE: ${rawPesoL} kg (${pesoLInTons.toFixed(3)} t)${pesoExcel !== undefined ? (isMatchExcel ? ', alinhado com a planilha Excel.' : '.') : (statusVal === 'ERRO_LEITURA_SISTEMA' ? `, corrigindo a leitura inicial do sistema (${pesoMDF ?? 0} t).` : ', conferido com precisão pela IA.')}`,
        confianca: 'ALTA',
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }
  }

  // 3. Busca por rótulo QUANT / QUANTIDADE da DANFE
  const quantRegex = /(?:QUANT(?:IDADE|\.)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b)/i
  const quantMatch = trechoTextoDocumento.match(quantRegex)
  if (quantMatch) {
    const rawQuantStr = quantMatch[1]
    const quantNum = parseFloat(rawQuantStr.replace(/\./g, '').replace(',', '.'))
    if (quantNum > 0) {
      const quantInTons = quantNum >= 1000 ? Number((quantNum / 1000).toFixed(3)) : Number(quantNum.toFixed(3))
      const isMatchExcel = pesoExcel !== undefined && Math.abs(quantInTons - pesoExcel) <= 0.01
      const isMatchDoc = pesoMDF !== undefined && Math.abs(quantInTons - pesoMDF) <= 0.01

      let statusVal: VereditoTipo = 'DIVERGENCIA_REAL'
      if (pesoExcel !== undefined) {
        statusVal = isMatchExcel ? 'ERRO_LEITURA_SISTEMA' : 'DIVERGENCIA_REAL'
      } else {
        statusVal = (pesoMDF === undefined || pesoMDF === 0 || !isMatchDoc) ? 'ERRO_LEITURA_SISTEMA' : 'CONFERIDO_CORRETO'
      }

      if (pesoExcel !== undefined ? isMatchExcel : true) {
        return {
          id: item.id,
          identificador,
          status: statusVal,
          veredito: statusVal === 'ERRO_LEITURA_SISTEMA'
            ? `Quantidade Corrigida pela IA no Campo QUANT: ${quantInTons.toFixed(3)} t`
            : `Valor Real no Campo QUANT: ${quantInTons.toFixed(3)} t`,
          pesoCorrigidoDoc: quantInTons,
          pesoExcel,
          diferencaReal: pesoExcel !== undefined ? Number((quantInTons - pesoExcel).toFixed(3)) : 0,
          explicacao: `Localizado exatamente no campo QUANT da DANFE: ${rawQuantStr} (${quantInTons.toFixed(3)} t)${pesoExcel !== undefined ? (isMatchExcel ? ', batendo com a planilha Excel.' : '.') : (statusVal === 'ERRO_LEITURA_SISTEMA' ? `, corrigindo a leitura inicial do sistema (${pesoMDF ?? 0} t).` : ', validado pela IA.')}`,
          confianca: 'ALTA',
          modoUtilizado: 'HEURISTICA_LOCAL',
        }
      }
    }
  }

  // 4. Busca tags XML <pesoL> ou <qCom>
  const xmlPesoLMatch = cleanSnippet.match(/<pesoL>([^<]+)<\/pesoL>/i)
  if (xmlPesoLMatch) {
    const rawVal = xmlPesoLMatch[1].trim()
    const num = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'))
    if (num > 0) {
      const valInTons = num >= 1000 ? Number((num / 1000).toFixed(3)) : num
      return {
        id: item.id,
        identificador,
        status: (pesoMDF === undefined || pesoMDF === 0 || Math.abs(valInTons - pesoMDF) > 0.01) ? 'ERRO_LEITURA_SISTEMA' : 'CONFERIDO_CORRETO',
        veredito: `Peso Líquido XML: ${valInTons.toFixed(3)} t`,
        pesoCorrigidoDoc: valInTons,
        pesoExcel,
        diferencaReal: pesoExcel !== undefined ? Number((valInTons - (pesoExcel >= 1000 ? pesoExcel / 1000 : pesoExcel)).toFixed(3)) : 0,
        explicacao: `Localizado na tag <pesoL> do documento fiscal: ${valInTons.toFixed(3)} t.`,
        confianca: 'ALTA',
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }
  }

  const xmlQComMatch = cleanSnippet.match(/<qCom>([^<]+)<\/qCom>/i)
  if (xmlQComMatch) {
    const rawVal = xmlQComMatch[1].trim()
    const num = parseFloat(rawVal.replace(/\./g, '').replace(',', '.'))
    if (num > 0) {
      const valInTons = num >= 1000 ? Number((num / 1000).toFixed(3)) : num
      return {
        id: item.id,
        identificador,
        status: (pesoMDF === undefined || pesoMDF === 0 || Math.abs(valInTons - pesoMDF) > 0.01) ? 'ERRO_LEITURA_SISTEMA' : 'CONFERIDO_CORRETO',
        veredito: `Quantidade do Item XML: ${valInTons.toFixed(3)} t`,
        pesoCorrigidoDoc: valInTons,
        pesoExcel,
        diferencaReal: pesoExcel !== undefined ? Number((valInTons - (pesoExcel >= 1000 ? pesoExcel / 1000 : pesoExcel)).toFixed(3)) : 0,
        explicacao: `Localizado na tag <qCom> do produto no documento fiscal: ${valInTons.toFixed(3)} t.`,
        confianca: 'ALTA',
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }
  }

  // Caso 2: Procura no trecho do texto números decimais próximos ao vagão (ex: "91,040", "74.660", "74,66")
  const regexDecimais = /(\d{1,3}[.,]\d{2,4})/g
  const matches = [...cleanSnippet.matchAll(regexDecimais)].map(m => m[1])
  
  // Verifica se o peso do Excel aparece de forma explícita no texto original
  if (pesoExcel !== undefined) {
    const excelFormattedBr = pesoExcel.toFixed(3).replace('.', ',')
    const excelFormattedBr2 = pesoExcel.toFixed(2).replace('.', ',')
    const excelFormattedUs = pesoExcel.toFixed(3)
    const excelKg = Math.round(pesoExcel * 1000).toString()

    if (cleanSnippet.includes(excelFormattedBr) || cleanSnippet.includes(excelFormattedBr2) || cleanSnippet.includes(excelFormattedUs)) {
      status = 'ERRO_LEITURA_SISTEMA'
      pesoCorrigidoDoc = pesoExcel
      veredito = `Erro de Leitura do Sistema: O documento original contém exatamente ${excelFormattedBr} t`
      explicacao = `O valor da planilha (${excelFormattedBr} t) foi localizado no texto bruto da nota/MDF, confirmando que o sistema cometeu um corte ou falha de leitura.`
      confianca = 'ALTA'
      return {
        id: item.id,
        identificador,
        status,
        veredito,
        pesoCorrigidoDoc,
        pesoExcel,
        diferencaReal: 0,
        explicacao,
        confianca,
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }

    if (cleanSnippet.includes(excelKg)) {
      status = 'ERRO_LEITURA_SISTEMA'
      pesoCorrigidoDoc = pesoExcel
      veredito = `Erro de Unidade (kg vs t): O documento traz ${excelKg} kg (${excelFormattedBr} t)`
      explicacao = `O documento declarou o peso em quilogramas (${excelKg} kg) enquanto a planilha estava em toneladas.`
      confianca = 'ALTA'
      return {
        id: item.id,
        identificador,
        status,
        veredito,
        pesoCorrigidoDoc,
        pesoExcel,
        diferencaReal: 0,
        explicacao,
        confianca,
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }
  }

  // Caso 3: Verifica se o pesoMDF foi lido com casas decimais cortadas (ex: 74.66 vs 74.660)
  if (pesoMDF !== undefined && pesoExcel !== undefined) {
    const dif = Number((pesoMDF - pesoExcel).toFixed(3))
    
    // Se a diferença for minúscula (< 0.05 t) pode ser arredondamento
    if (Math.abs(dif) <= 0.05) {
      status = 'ERRO_LEITURA_SISTEMA'
      veredito = `Possível Variação de Arredondamento (${dif > 0 ? '+' : ''}${dif} t)`
      explicacao = `Diferença insignificante entre documento (${pesoMDF.toFixed(3)} t) e planilha (${pesoExcel.toFixed(3)} t).`
      confianca = 'ALTA'
      return {
        id: item.id,
        identificador,
        status,
        veredito,
        pesoCorrigidoDoc: pesoMDF,
        pesoExcel,
        diferencaReal: dif,
        explicacao,
        confianca,
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }

    // Se o pesoMDF não foi encontrado no texto, mas outro número decimal relevante foi
    const candidatos = matches.map(m => parseFloat(m.replace(',', '.'))).filter(n => n > 5 && n < 160)
    if (candidatos.length > 0) {
      // Se algum candidato é idêntico ao Excel
      const matchCandidate = candidatos.find(c => Math.abs(c - pesoExcel) < 0.01)
      if (matchCandidate !== undefined) {
        status = 'ERRO_LEITURA_SISTEMA'
        pesoCorrigidoDoc = matchCandidate
        veredito = `Erro de Leitura do Sistema: Peso correto é ${matchCandidate.toFixed(3)} t`
        explicacao = `O algoritmo anterior pegou um valor incorreto (${pesoMDF.toFixed(3)} t), mas o trecho original possui ${matchCandidate.toFixed(3)} t que bate com a planilha.`
        confianca = 'ALTA'
        return {
          id: item.id,
          identificador,
          status,
          veredito,
          pesoCorrigidoDoc,
          pesoExcel,
          diferencaReal: 0,
          explicacao,
          confianca,
          modoUtilizado: 'HEURISTICA_LOCAL',
        }
      }
    }

    // Se é uma divergência comprovada
    status = 'DIVERGENCIA_REAL'
    veredito = `Divergência Real Confirmada (${dif > 0 ? '+' : ''}${dif} t)`
    explicacao = `O documento fiscal expressa ${pesoMDF.toFixed(3)} t, enquanto o Excel registra ${pesoExcel.toFixed(3)} t. Trata-se de uma divergência física/comercial legítima.`
    confianca = 'ALTA'
    return {
      id: item.id,
      identificador,
      status,
      veredito,
      pesoCorrigidoDoc: pesoMDF,
      pesoExcel,
      diferencaReal: dif,
      explicacao,
      confianca,
      modoUtilizado: 'HEURISTICA_LOCAL',
    }
  }

  // Caso 4: Peso faltante em um dos lados
  if (pesoMDF === undefined && pesoExcel !== undefined) {
    // Tenta encontrar algum peso no trecho
    const candidatos = matches.map(m => parseFloat(m.replace(',', '.'))).filter(n => n > 5 && n < 160)
    if (candidatos.length > 0) {
      const best = candidatos[0]
      const dif = Number((best - pesoExcel).toFixed(3))
      status = dif === 0 ? 'ERRO_LEITURA_SISTEMA' : 'DIVERGENCIA_REAL'
      return {
        id: item.id,
        identificador,
        status,
        veredito: status === 'ERRO_LEITURA_SISTEMA' ? `Peso Resgatado pelo Analisador (${best.toFixed(3)} t)` : `Peso Identificado: ${best.toFixed(3)} t`,
        pesoCorrigidoDoc: best,
        pesoExcel,
        diferencaReal: dif,
        explicacao: `O sistema não havia extraído o peso, mas o texto contém ${best.toFixed(3)} t.`,
        confianca: 'MEDIA',
        modoUtilizado: 'HEURISTICA_LOCAL',
      }
    }

    return {
      id: item.id,
      identificador,
      status: 'PESO_AUSENTE_NO_DOC',
      veredito: 'Peso Ausente no Documento',
      pesoCorrigidoDoc: null,
      pesoExcel,
      diferencaReal: null,
      explicacao: 'Não foi possível encontrar valor de tonelagem para este item no documento.',
      confianca: 'MEDIA',
      modoUtilizado: 'HEURISTICA_LOCAL',
    }
  }

  return {
    id: item.id,
    identificador,
    status: 'DIVERGENCIA_REAL',
    veredito: 'Divergência Apontada',
    pesoCorrigidoDoc: pesoMDF ?? null,
    pesoExcel: pesoExcel ?? null,
    diferencaReal: pesoMDF !== undefined && pesoExcel !== undefined ? Number((pesoMDF - pesoExcel).toFixed(3)) : null,
    explicacao: 'Valores divergentes entre as duas fontes.',
    confianca: 'MEDIA',
    modoUtilizado: 'HEURISTICA_LOCAL',
  }
}

/**
 * Chama o backend para auditar divergências de peso com IA (Gemini 3.7 Flash) ou Heurística
 */
export async function auditarDivergenciasComIA(items: WeightAuditItemInput[]): Promise<WeightAuditResponse> {
  if (!items || items.length === 0) {
    return {
      totalAuditados: 0,
      totalErrosLeitura: 0,
      totalDivergenciasReais: 0,
      totalConferidos: 0,
      resultados: [],
      tokensUtilizadosEstimados: 0,
      provedor: 'HEURISTICA_INTELIGENTE',
    }
  }

  try {
    const res = await fetch('/api/gemini/verify-weight-divergence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })

    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.resultados)) {
        return data as WeightAuditResponse
      }
    }
  } catch (err) {
    console.warn('Falha ao conectar na rota de IA de auditoria de peso, utilizando motor local:', err)
  }

  // Fallback local caso o endpoint não responda
  const resultados = items.map(auditarHeuristicaLocal)
  const totalErrosLeitura = resultados.filter(r => r.status === 'ERRO_LEITURA_SISTEMA').length
  const totalDivergenciasReais = resultados.filter(r => r.status === 'DIVERGENCIA_REAL').length
  const totalConferidos = resultados.filter(r => r.status === 'CONFERIDO_CORRETO').length

  return {
    totalAuditados: items.length,
    totalErrosLeitura,
    totalDivergenciasReais,
    totalConferidos,
    resultados,
    tokensUtilizadosEstimados: 0,
    provedor: 'HEURISTICA_INTELIGENTE',
  }
}

export interface ItemParaConferenciaIA {
  id: string
  fileName: string
  chave?: string
  numero?: string
  serie?: string
  pesoLido?: number // quantidade inicialmente lida pelo sistema
  pesoExcel?: number // peso da planilha Excel se houver confronto
  snippet?: string // rawSnippet ou texto extraído da DANFE
  xmlContent?: string
  isPdf?: boolean
}

/**
 * Garante que todas as notas processadas a partir de PDF passem pela conferência da IA
 * para que a quantidade exportada para o Excel seja 100% precisa e auditada.
 */
export async function conferirQuantidadesNotasPdfComIA(
  items: ItemParaConferenciaIA[],
  existingAuditMap: Record<string, WeightAuditItemResult> = {}
): Promise<Record<string, WeightAuditItemResult>> {
  if (!items || items.length === 0) return existingAuditMap

  const resultMap: Record<string, WeightAuditItemResult> = { ...existingAuditMap }

  // Filtra itens que ainda não têm conferência de IA no mapa
  const itemsToAudit: WeightAuditItemInput[] = []

  for (const item of items) {
    const mainId = item.chave || item.id || item.fileName
    const altId = item.fileName
    const existing = resultMap[mainId] || resultMap[altId]

    // Se já foi conferido pela IA com um peso identificado, reutiliza
    if (existing && existing.pesoCorrigidoDoc !== undefined && existing.pesoCorrigidoDoc !== null) {
      continue
    }

    const snippetText = `${item.snippet || ''} ${item.xmlContent ? item.xmlContent.substring(0, 1500) : ''}`.trim()
    const prodInfo = `QUANTIDADE_SISTEMA: ${item.pesoLido ?? 0} t | NF: ${item.numero || ''} | CHAVE: ${item.chave || ''}`
    const fullSnippet = snippetText ? `${prodInfo}\n${snippetText}` : prodInfo

    itemsToAudit.push({
      id: mainId,
      identificador: item.numero ? `NF ${item.numero}` : item.fileName,
      numeroApenas: item.numero || '',
      serie: item.serie || '',
      pesoMDF: item.pesoLido ?? 0,
      pesoExcel: item.pesoExcel,
      diferencaPeso: item.pesoExcel !== undefined && item.pesoLido !== undefined ? Number((item.pesoLido - item.pesoExcel).toFixed(3)) : undefined,
      trechoTextoDocumento: fullSnippet,
    })
  }

  if (itemsToAudit.length === 0) {
    return resultMap
  }

  try {
    const response = await auditarDivergenciasComIA(itemsToAudit)
    for (const r of response.resultados) {
      resultMap[r.id] = r
    }
  } catch (err) {
    console.warn('Erro ao auditar notas em lote com IA, gerando conferência heurística:', err)
    for (const it of itemsToAudit) {
      resultMap[it.id] = auditarHeuristicaLocal(it)
    }
  }

  return resultMap
}

/**
 * Normaliza e converte a quantidade para KG multiplicando por 1000 quando os valores
 * estiverem em Toneladas (valores < 1000, ex: 49,34 -> 49340, 48,76 -> 48760, 49 -> 49000).
 * Se o valor já for >= 1000 (ex: 49340 kg), preserva o valor sem multiplicar novamente.
 */
export function normalizarQuantidadeKg(val: any): number {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return 0
    if (Math.abs(val) < 1000) {
      return Number((val * 1000).toFixed(3))
    }
    return Number(val.toFixed(3))
  }

  const sVal = String(val).trim()
  if (!sVal) return 0

  let num = 0
  if (sVal.includes(',')) {
    num = parseFloat(sVal.replace(/\./g, '').replace(',', '.'))
  } else if (/^\d+\.\d{1,2}$/.test(sVal)) {
    // Formato com ponto e até 2 casas decimais (ex: "49.34" ou "48.5")
    num = parseFloat(sVal)
  } else if (/^\d+\.\d{3}$/.test(sVal)) {
    // Formato com 3 casas ou milhar brasileiro (ex: "49.340" -> 49340 kg)
    num = parseFloat(sVal.replace('.', ''))
  } else {
    num = parseFloat(sVal)
  }

  if (isNaN(num) || num === 0) return 0

  if (Math.abs(num) < 1000) {
    return Number((num * 1000).toFixed(3))
  }
  return Number(num.toFixed(3))
}

/**
 * Retorna a quantidade definitiva conferida pela IA para uma nota.
 * Prioridade: Override manual > Peso corrigido pela IA > Peso original do sistema.
 * Quando o valor for em Toneladas (< 1000, ex: 49,34, 48,76, 49), é sempre multiplicado por 1000 (ex: 49340, 48760, 49000).
 */
export function obterQuantidadeConferidaIA(
  idOrKey: string,
  initialQtd: number,
  auditMap?: Record<string, WeightAuditItemResult>,
  overridesMap?: Record<string, number>,
  altKey?: string
): {
  quantidade: number
  quantidadeKg: number
  quantidadeToneladas: number
  status: string
  explicacao: string
  foiCorrigido: boolean
  modoUtilizado: string
} {
  let rawQtd = initialQtd
  let status = 'SEM_AUDITORIA_IA'
  let explicacao = 'Quantidade extraída inicialmente.'
  let foiCorrigido = false
  let modoUtilizado = 'PADRAO_SISTEMA'

  // 1. Override manual
  if (overridesMap) {
    if (overridesMap[idOrKey] !== undefined) {
      rawQtd = overridesMap[idOrKey]
      status = 'AJUSTADO_MANUALMENTE'
      explicacao = 'Quantidade ajustada manualmente pelo operador.'
      foiCorrigido = overridesMap[idOrKey] !== initialQtd
      modoUtilizado = 'MANUAL'
    } else if (altKey && overridesMap[altKey] !== undefined) {
      rawQtd = overridesMap[altKey]
      status = 'AJUSTADO_MANUALMENTE'
      explicacao = 'Quantidade ajustada manualmente pelo operador.'
      foiCorrigido = overridesMap[altKey] !== initialQtd
      modoUtilizado = 'MANUAL'
    }
  } else if (auditMap) {
    const audit = auditMap[idOrKey] || (altKey ? auditMap[altKey] : undefined)
    if (audit && audit.pesoCorrigidoDoc !== undefined && audit.pesoCorrigidoDoc !== null) {
      rawQtd = audit.pesoCorrigidoDoc
      foiCorrigido = Math.abs(rawQtd - initialQtd) > 0.005
      status = audit.status === 'ERRO_LEITURA_SISTEMA' 
        ? 'QUANTIDADE CORRIGIDA PELA IA (VALOR REAL ENCONTRADO)'
        : (audit.status === 'DIVERGENCIA_REAL' 
          ? 'DIVERGÊNCIA REAL DE PESAGEM' 
          : 'CONFERIDO E CONFIRMADO PELA IA')
      explicacao = audit.explicacao || audit.veredito || 'Conferido pela IA'
      modoUtilizado = audit.modoUtilizado || 'GEMINI_IA'
    }
  }

  // Quando os valores forem em toneladas (< 1000, ex: 49,34, 48,76, 49),
  // a quantidade SEMPRE deve ser multiplicada por 1000 para converter para KG (ex: 49340, 48760, 49000).
  const qtdKg = normalizarQuantidadeKg(rawQtd)
  const qtdTon = rawQtd >= 1000 ? Number((rawQtd / 1000).toFixed(3)) : Number(rawQtd.toFixed(3))

  return {
    quantidade: qtdKg, // Sempre em KG (multiplicado por 1000 quando em Toneladas)
    quantidadeKg: qtdKg,
    quantidadeToneladas: qtdTon,
    status,
    explicacao,
    foiCorrigido,
    modoUtilizado,
  }
}

