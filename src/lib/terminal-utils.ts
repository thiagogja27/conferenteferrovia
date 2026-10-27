export type GuarujaTerminalCode = 'TEAG' | 'TEG'

/**
 * Desativado: o sistema não classifica mais por CNPJ, Ultrafertil, cidade ou conciliação.
 */
export function isUltrafertil(_text: string): boolean {
  return false
}

/**
 * Desativado: o sistema não classifica mais por atalhos explícitos de TEAG/TEG.
 */
export function getExplicitGuarujaTerminalCode(_text: string): GuarujaTerminalCode | null {
  return null
}

/**
 * Extrai o terminal de entrega de forma 100% mecânica:
 * Busca estritamente pelas até 15 palavras imediatamente após:
 * - "alfandegado"
 * - "afadegado"
 * - "entrega:" (e variações como "entrega em", "local de entrega", "terminal de entrega", "descarga no recinto", etc.)
 * 
 * O sistema NÃO classifica mais por TEG/TEAG, CNPJ, cidade ou conciliação.
 * O texto extraído mecanicamente É o valor do terminal.
 */
export function extractTerminalFromDeliveryRule(text: string): string | null {
  if (!text) return null

  const regex = /(?:INFORMA[ÇC][ÕO]ES\s+DO\s+LOCAL\s+DE\s+ENTREGA|LOCAL\s+DE\s+ENTREGA|RECINTO\s+ALFANDEGADO|RECINTO\s+AFADEGADO|\bALFANDEGADO\b|\bAFADEGADO\b|MERC\.?\s*ENTR\.?\s*ARM\.?\s*ALFANDEGADO|DESCARGA\s+NO\s+RECINTO|TERMINAL\s+(?:DE\s+)?ENTREGA|\bENTREGAR?\s+(?:EM|NO|NA)\b|\bENTREGA\s*[:=-])\s*[:=-]?\s*([\s\S]{1,500})/i

  const match = text.match(regex)
  if (!match || !match[1]) return null

  let chunk = match[1].trim()

  // Remove conectivos e rótulos de cabeçalho imediatos após o marcador
  chunk = chunk.replace(/^(?:\b(?:EM|DE|NO|NA|SERA|SERÁ|RECINTO|ALFANDEGADO|AFADEGADO|EMPRESA)\b\s*[:=-]?\s*)+/i, '')
  chunk = chunk.replace(/^(?:NOME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|ME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|RAZ[ÃA]O\s*SOCIAL|NOME|EMPRESA)\s*[:=-]?\s*/i, '').trim()

  // Palavras de parada que encerram o bloco do terminal
  const stopKeywords = [
    'TRANSBORDO', 'RETIRADA', 'PLACA', 'MOTORISTA', 'CONTRATO',
    'DESTINO', 'CNPJ', 'CPF', 'OBS', 'VALOR', 'PESO', 'QTD', 'QUANTIDADE',
    'TICKET', 'NAVIO', 'SAFRA', 'PEDIDO', 'NOTA FISCAL', 'CHAVE', 'DATA', 'CEP', 'IE'
  ]

  for (const kw of stopKeywords) {
    const rx = new RegExp(`\\b${kw}\\b`, 'i')
    const sm = chunk.match(rx)
    if (sm && sm.index !== undefined && sm.index > 0) {
      chunk = chunk.substring(0, sm.index).trim()
    }
  }

  // Pega estritamente até as primeiras 15 palavras imediatamente após o marcador
  const words = chunk.split(/\s+/).filter(Boolean).slice(0, 15)
  if (words.length === 0) return null

  let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim()
  val = val.replace(/^(?:NOME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|ME\s*\/\s*RAZ[ÃA]O\s*SOCIAL|RAZ[ÃA]O\s*SOCIAL|NOME|EMPRESA)\s*[:=-]?\s*/i, '').trim()

  if (val.length < 2 || /^\d+$/.test(val)) {
    return null
  }

  return val
}

