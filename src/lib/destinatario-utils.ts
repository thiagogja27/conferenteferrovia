/**
 * Utilitários para higienização, normalização e agrupamento de Destinatários de Notas Fiscais (NF-e / DANFE).
 */
import { matchDestinatarioFromTextOrCnpj } from '@/lib/cadastros-logisticos-service'

export function formatCNPJ(cnpj: string): string {
  const digits = (cnpj || '').replace(/\D/g, '')
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
  }
  return cnpj || ''
}

export function extractCNPJFilial(cnpj: string): string {
  const digits = (cnpj || '').replace(/\D/g, '')
  if (digits.length === 14) {
    return `${digits.slice(8, 12)}-${digits.slice(12, 14)}`
  }
  return digits.slice(-6) || ''
}

export function isCarrierCnpj(cnpj?: string, contextTranspCnpj?: string): boolean {
  const digits = (cnpj || '').replace(/\D/g, '')
  if (!digits) return false
  if (contextTranspCnpj && digits === contextTranspCnpj.replace(/\D/g, '')) {
    return true
  }
  return /^(?:02387241|10991380|49964752|13370835|52618139|04286197|04721589|00414545)/.test(digits)
}

export function isInvalidRecipientName(name?: string): boolean {
  if (!name) return true
  const trimmed = name.trim()
  if (trimmed.length < 3) return true
  // Se for UF + Inscrição Estadual (ex: "MG 3448766990054", "SP 123456789") ou apenas dígitos
  if (/^[A-Z]{2}\s+\d{6,16}$/i.test(trimmed)) return true
  if (/^\d{6,16}$/.test(trimmed.replace(/\s+/g, ''))) return true
  if (
    /^(?:NOME|RAZ[ÃA]O|SOCIAL|DESTINAT|REMETENT|ENDERE|BAIRRO|MUNIC|CNPJ|CPF|CEP|INSC|UF|TELEFONE|FONE|DATA|CÁLCULO|CALCULO|VALOR|QUANTIDADE|ESP[EÉ]CIE|PESO|MARCA|N[UÚ]MERO|VOLUMES|TRANSPORTADOR|FRETE|BASE|-?ENTRADA|-?SA[IÍ]DA|DOCUMENTOAUXILIAR)/i.test(
      trimmed
    )
  ) {
    return true
  }
  return false
}

export function sanitizeDestinatarioNome(
  rawNome?: string,
  rawCnpj?: string,
  _fullText?: string,
  fallbackEmitNome?: string,
  fallbackEmitCnpj?: string
): string {
  let nome = (rawNome || '')
    .trim()
    .replace(
      /^(?:NOME\s*\/\s*RAZÃO\s*SOCIAL|NOME\s*RAZAO\s*SOCIAL|RAZÃO\s*SOCIAL|RAZAO\s*SOCIAL|CNPJ\s*\/\s*CPF|CNPJ|CPF|DATA\s*D[AE]\s*EMISS[ÃA]O|DATA\s*EMISS[ÃA]O|DATA\s*D[AE]\s*SA[IÍ]DA|DATA\s*SA[IÍ]DA|DESTINATÁRIO\s*\/\s*REMETENTE|DESTINATARIO\s*\/\s*REMETENTE|REMETENTE\s*\/\s*DESTINATÁRIO|REMETENTE\s*\/\s*DESTINATARIO|DESTINATÁRIO|DESTINATARIO|REMETENTE|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|I\.E\.|IE|001|002|[\s\n\r\-\:\/\|\.\,])+/gi,
      ''
    )
    .replace(
      /(?:CNPJ\s*\/\s*CPF|CNPJ|CPF|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b|DATA\s*D[AE]\s*EMISS[ÃA]O|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE).*$/i,
      ''
    )
    .replace(/[:=\-.,;/]+$/, '')
    .trim()

  if (isInvalidRecipientName(nome)) {
    nome = ''
  }

  const catalogMatch = matchDestinatarioFromTextOrCnpj(nome, rawCnpj)
  if (catalogMatch) return catalogMatch

  const cnpjClean = (rawCnpj || '').replace(/\D/g, '')
  const emitCnpjClean = (fallbackEmitCnpj || '').replace(/\D/g, '')

  // Se o destinatário não foi identificado no campo OU é o mesmo do remetente
  // (ex: notas onde o cabeçalho é REMETENTE/DESTINATÁRIO ou DESTINATÁRIO/REMETENTE, ou remessas/transferências entre filiais)
  const isSameCompanyOrEmpty =
    !nome ||
    nome.length < 3 ||
    isInvalidRecipientName(nome) ||
    nome === 'DESTINATARIO NAO IDENTIFICADO' ||
    (cnpjClean && emitCnpjClean && (cnpjClean === emitCnpjClean || cnpjClean.slice(0, 8) === emitCnpjClean.slice(0, 8)))

  if (isSameCompanyOrEmpty) {
    if (emitCnpjClean.startsWith('60498706')) {
      return 'CARGILL AGRICOLA SA'
    }
    if (fallbackEmitNome) {
      const cleanEmit = fallbackEmitNome
        .trim()
        .replace(/[:=\-.,;/]+$/, '')
        .trim()
      if (cleanEmit.length >= 3 && !isInvalidRecipientName(cleanEmit)) {
        return cleanEmit.toUpperCase()
      }
    }
  }

  if (
    !nome ||
    nome.length < 3 ||
    isInvalidRecipientName(nome)
  ) {
    return 'Não informado'
  }

  return nome.toUpperCase()
}
