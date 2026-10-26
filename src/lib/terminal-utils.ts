export type GuarujaTerminalCode = 'TEAG' | 'TEG'

export function isUltrafertil(text: string): boolean {
  if (!text) return false
  const upper = text.toUpperCase()
  return (
    /ULTRAFERTIL|ULTRAF[EÉ]RTIL/i.test(upper) ||
    upper.includes('02.476.026/0008-02') ||
    upper.includes('02476026000802') ||
    upper.includes('633174875112') ||
    upper.includes('633.174.875.112')
  )
}

/**
 * Extrai o terminal de entrega a partir das seções explícitas de entrega da DANFE/NF-e:
 * - INFORMAÇÕES DO LOCAL DE ENTREGA
 * - RECINTO ALFANDEGADO / ALFANDEGADO / MERC. ENTR. ARM. ALFANDEGADO
 * - LOCAL DE ENTREGA / DESCARGA NO RECINTO / TERMINAL DE ENTREGA / ENTREGA:
 * 
 * Regra: Trazer até as 15 primeiras palavras após a palavra ENTREGA, ALFANDEGADO, RECINTO, etc.
 * Sem qualquer atalho forçado para TEG ou TEAG!
 */
export function extractTerminalFromDeliveryRule(text: string): string | null {
  if (!text) return null

  // 1. Seção estruturada de local de entrega
  const regex = /(?:INFORMA[ÇC][ÕO]ES\s+DO\s+LOCAL\s+DE\s+ENTREGA|LOCAL\s+DE\s+ENTREGA|RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|\bALFANDEGADO\b|\bALFADEGADO\b|MERC\.?\s*ENTR\.?\s*ARM\.?\s*ALFANDEGADO|DESCARGA\s+NO\s+RECINTO|TERMINAL\s+DE\s+ENTREGA|TERMINAL\s+ENTREGA|\bENTREGA\s+EM\b|\bENTREGA\s*[:=-])\s*[:=-]?\s*([\s\S]{1,500})/i

  const match = text.match(regex)
  if (!match || !match[1]) return null

  let chunk = match[1].trim()
  chunk = chunk.replace(/^(?:\b(?:EM|DE|NO|NA|SERA|SERÁ|RECINTO|ALFANDEGADO|ALFADEGADO|EMPRESA)\b\s*[:=-]?\s*)+/i, '')
  chunk = chunk.replace(/^(?:NOME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|ME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|RAZ[ÃA]O\s*SOCIAL|NOME|EMPRESA)\s*[:=-]?\s*/i, '').trim()

  if (isUltrafertil(chunk)) {
    return 'ULTRAFERTIL'
  }

  const stopKeywords = [
    'TRANSBORDO', 'RETIRADA', 'PLACA', 'MOTORISTA', 'CONTRATO',
    'DESTINO', 'CNPJ', 'CPF', 'OBS', 'VALOR', 'PESO', 'QTD', 'QUANTIDADE',
    'TICKET', 'NAVIO', 'SAFRA', 'PEDIDO', 'NOTA FISCAL', 'CHAVE', 'DATA', 'CEP', 'IE'
  ]

  for (const kw of stopKeywords) {
    const idx = chunk.toUpperCase().indexOf(kw)
    if (idx > 0) {
      chunk = chunk.substring(0, idx).trim()
    }
  }

  const words = chunk.split(/\s+/).filter(Boolean).slice(0, 15)
  let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim()
  val = val.replace(/^(?:NOME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|ME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|RAZ[ÃA]O\s*SOCIAL|NOME|EMPRESA)\s*[:=-]?\s*/i, '').trim()

  if (isUltrafertil(val)) {
    return 'ULTRAFERTIL'
  }

  // Identificação de terminais específicos se presentes no texto extraído da seção de entrega
  if (/\bTEAG\b|TERMINAL.*EXPORTA[CÇ][AÃ]O.*A[CÇ][UÚ]CAR|04\.?721\.?589\/?0001-?78|BENTO\s*PEDRO/i.test(val)) {
    return 'TEAG - TERMINAL DE ACUCAR DO GUARUJA'
  }
  if (/\bTEG\b|TERMINAL.*EXPORTADOR.*GUARUJ[AÁ]|TERM.*EXP.*GUARUJA/i.test(val)) {
    return 'TEG - TERMINAL EXPORTADOR DO GUARUJA'
  }
  if (/\bTES\b|TERMINAL.*EXPORTADOR.*SANTOS/i.test(val)) {
    return 'TES - TERMINAL EXPORTADOR DE SANTOS'
  }
  if (/\bTGG\b|TERMINAL.*GR[AÃ]OS.*GUARUJ[AÁ]/i.test(val)) {
    return 'TGG - TERMINAL DE GRAOS DO GUARUJA'
  }
  if (/\bCLI\b|CORREDOR.*LOG[IÍ]STIC/i.test(val)) {
    return 'CLI - CORREDOR LOGÍSTICA INTEGRADA'
  }

  // Se o valor capturado for um transbordo conhecido, não é o terminal de entrega
  const valUpper = val.toUpperCase()
  const isTransbordoHub = /UBERABA|TIUB|FERNANDOPOLIS|FERNANDÓPOLIS|ATT\s*ARMAZENAGEM|RONDONOPOLIS|RIO VERDE|ARAGUARI|ITURAMA|PRADOPOLIS|PEDERNEIRAS|SAO SIMAO|UBERLANDIA|INOCENCIA|GUARA|PAULINIA/i.test(valUpper)
  if (!isTransbordoHub && val.length > 2 && !/^\d+$/.test(val)) {
    return val
  }

  return null
}

/**
 * Retorna o código do terminal de Guarujá APENAS se explicitamente citado.
 * NUNCA utiliza atalhos por cidade 'Guarujá' ou tipo de carga!
 */
export function getExplicitGuarujaTerminalCode(text: string): GuarujaTerminalCode | null {
  if (!text || isUltrafertil(text)) return null

  // O terminal só pode ser concluído quando aparece no contexto do local de
  // entrega. Não basta encontrar TEAG/TEG, cidade, CNPJ ou razão social em
  // qualquer ponto da nota, pois esses dados também aparecem no emitente,
  // destinatário e no transbordo.
  const deliveryMarker = /(?:INFORMA[ÇC][ÕO]ES\s+DO\s+LOCAL\s+DE\s+ENTREGA|LOCAL\s+DE\s+ENTREGA|RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|\bALFANDEGADO\b|\bALFADEGADO\b|MERC\.?\s*ENTR\.?\s*ARM\.?\s*ALFANDEGADO|DESCARGA\s+NO\s+RECINTO|TERMINAL\s+DE\s+ENTREGA|TERMINAL\s+ENTREGA|\bENTREGA\s+EM\b|\bENTREGA\s*[:=-])/gi
  const contexts: string[] = []
  let marker: RegExpExecArray | null
  while ((marker = deliveryMarker.exec(text)) !== null) {
    // Limita a leitura ao campo de entrega; uma janela longa pode capturar
    // TEAG/TEG em observações, destinatário ou transbordo e gerar falso positivo.
    const remainder = text.slice(marker.index, marker.index + 360)
    const nextSection = remainder.search(
      /(?:DESTINAT[AÁ]RIO|REMETENTE|TRANSPORTADOR|DADOS ADICIONAIS|OBSERVA[CÇ][OÕ]ES|TRANSBORDO|VOLUME|CARGA|FRETE)\s*[:=-]?/i,
    )
    contexts.push(nextSection > 0 ? remainder.slice(0, nextSection) : remainder)
  }

  if (contexts.length === 0) return null

  // PDFs/DANFEs podem quebrar palavras, inserir hífens ou remover acentos.
  const normalized = contexts.join(' ')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (
    /\bTEAG\b/.test(normalized) ||
    /TERMINAL\s+(?:DE\s+)?(?:EXPORT(?:ACAO)?|EXP)\s+DE?\s*ACUCAR/.test(normalized) ||
    /TERMINAL\s+DE\s+ACUCAR\s+DO\s+GUARUJA/.test(normalized) ||
    /04721589000178|BENTO\s+PEDRO\s+DA\s+COSTA/.test(normalized)
  ) return 'TEAG'

  if (
    /\bTEG\b/.test(normalized) ||
    /TERMINAL\s+EXPORTADOR\s+(?:DO\s+)?GUARUJA/.test(normalized) ||
    /TERM\s+EXP\s+GUARUJA/.test(normalized) ||
    /02836436000120/.test(normalized)
  ) return 'TEG'

  return null
}

