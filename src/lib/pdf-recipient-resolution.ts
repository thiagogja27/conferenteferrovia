import {
  resolveDestinatarioCadastro,
  resolveSavedNoteDestinatario,
} from './cadastros-logisticos-service'
import type { NFEData } from './nfe-parser'
import {
  generateNFeXML,
  formatCNPJStr,
  type ParsedNFeData,
} from './pdf-text-parser'

export function normalizeNfeRecipient<T extends NFEData>(nfeData: T): T {
  const rawCnpj = nfeData.destinatario?.cpfCnpj || ''
  if (rawCnpj.replace(/\D/g, '').length !== 14) return nfeData

  const recipient = resolveDestinatarioCadastro(undefined, rawCnpj)
  if (!recipient) return nfeData

  return {
    ...nfeData,
    destinatario: {
      ...nfeData.destinatario,
      nome: recipient.nome,
      cpfCnpj: formatCNPJStr(recipient.cnpj),
    },
  }
}

export async function prioritizeSavedRecipient<T extends {
  xml?: string
  parsedData?: ParsedNFeData
}>(item: T): Promise<T> {
  const parsedData = item.parsedData
  if (!parsedData) return item

  const recipient =
    resolveDestinatarioCadastro(parsedData.destNome, parsedData.destCNPJ) ||
    (await resolveSavedNoteDestinatario(
      parsedData.destNome,
      parsedData.destCNPJ,
      parsedData.rawSnippet
    ))

  const hasExtractedCnpj = Boolean(
    parsedData.destCNPJ && parsedData.destCNPJ.replace(/\D/g, '').length === 14
  )

  const updatedData = recipient
    ? {
        ...parsedData,
        destNome: recipient.nome || parsedData.destNome,
        destCNPJ: hasExtractedCnpj
          ? formatCNPJStr(parsedData.destCNPJ)
          : recipient.cnpj
          ? formatCNPJStr(recipient.cnpj)
          : '',
      }
    : {
        ...parsedData,
        destNome: parsedData.destNome || 'Não informado',
        destCNPJ: parsedData.destCNPJ || '',
      }

  return {
    ...item,
    parsedData: updatedData,
    xml: generateNFeXML(updatedData),
  }
}
