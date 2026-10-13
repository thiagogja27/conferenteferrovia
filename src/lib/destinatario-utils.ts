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

export function sanitizeDestinatarioNome(
  rawNome?: string,
  rawCnpj?: string,
  _fullText?: string
): string {
  const nome = (rawNome || '')
    .trim()
    .replace(
      /^(?:NOME\s*\/\s*RAZÃO\s*SOCIAL|NOME\s*RAZAO\s*SOCIAL|RAZÃO\s*SOCIAL|RAZAO\s*SOCIAL|CNPJ\s*\/\s*CPF|CNPJ|CPF|DATA\s*D[AE]\s*EMISS[ÃA]O|DATA\s*EMISS[ÃA]O|DATA\s*D[AE]\s*SA[IÍ]DA|DATA\s*SA[IÍ]DA|DESTINATÁRIO\s*\/\s*REMETENTE|DESTINATARIO\s*\/\s*REMETENTE|DESTINATÁRIO|DESTINATARIO|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|I\.E\.|IE|001|002|[\s\n\r\-\:\/\|\.\,])+/gi,
      ''
    )
    .replace(
      /(?:CNPJ\s*\/\s*CPF|CNPJ|CPF|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b|DATA\s*D[AE]\s*EMISS[ÃA]O|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE).*$/i,
      ''
    )
    .replace(/[:=\-.,;/]+$/, '')
    .trim()

  const catalogMatch = matchDestinatarioFromTextOrCnpj(nome, rawCnpj)
  if (catalogMatch) return catalogMatch

  if (
    !nome ||
    /QUANTIDADE|ESP[EÉ]CIE|PESO|MARCA|N[UÚ]MERO|VOLUMES|TRANSPORTADOR|FRETE|C[AÁ]LCULO|BASE|VALOR/i.test(nome)
  ) {
    return 'Não informado'
  }

  return 'Não informado'
}
