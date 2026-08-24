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

  // Caso Especial Prioritário: Campo QUANT / QUANTIDADE da DANFE
  // Busca padrões diretos do campo QUANT como: QUANT 47.420,00 ou UN: TON QUANT: 47.420,00 ou quebras "47.420,0 0"
  const quantRegex = /(?:QUANT(?:IDADE|\.)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b)/i
  const quantMatch = trechoTextoDocumento.match(quantRegex)
  if (quantMatch) {
    const rawQuantStr = quantMatch[1]
    const quantNum = parseFloat(rawQuantStr.replace(/\./g, '').replace(',', '.'))
    if (quantNum > 0) {
      // Se a quantidade estiver em kg (ex: 47420 ou 47420.00) e o Excel estiver em toneladas (ex: 47.420)
      const quantInTons = quantNum >= 1000 ? Number((quantNum / 1000).toFixed(3)) : Number(quantNum.toFixed(3))
      if (pesoExcel !== undefined && Math.abs(quantInTons - pesoExcel) <= 0.01) {
        return {
          id: item.id,
          identificador,
          status: 'ERRO_LEITURA_SISTEMA',
          veredito: `Valor Real no Campo QUANT: ${quantInTons.toFixed(3)} t`,
          pesoCorrigidoDoc: quantInTons,
          pesoExcel,
          diferencaReal: 0,
          explicacao: `Localizado exatamente no campo QUANT da DANFE: ${rawQuantStr} (${quantInTons.toFixed(3)} t), batendo com a planilha Excel.`,
          confianca: 'ALTA',
          modoUtilizado: 'HEURISTICA_LOCAL',
        }
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
