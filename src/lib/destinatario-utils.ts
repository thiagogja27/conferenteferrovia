/**
 * Utilitários para higienização, normalização e agrupamento de Destinatários de Notas Fiscais (NF-e / DANFE).
 */

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
    // Retorna ex: "0002-41"
    return `${digits.slice(8, 12)}-${digits.slice(12, 14)}`
  }
  return digits.slice(-6) || ''
}

/**
 * Higieniza o nome do destinatário removendo rótulos residuais de formulário do DANFE/OCR
 * (ex: "CNPJ / CPF DATA DA EMISSÃO CARGILL AGRICOLA SA" -> "CARGILL AGRICOLA SA")
 * e normaliza grandes empresas conhecidas.
 */
export function sanitizeDestinatarioNome(
  rawNome?: string,
  rawCnpj?: string,
  fullText?: string
): string {
  let nome = (rawNome || '').trim()

  // 1. Remover ruídos de rótulos do cabeçalho do DANFE que possam ter sido lidos no mesmo bloco
  nome = nome
    .replace(
      /^(?:NOME\s*\/\s*RAZÃO\s*SOCIAL|NOME\s*RAZAO\s*SOCIAL|RAZÃO\s*SOCIAL|RAZAO\s*SOCIAL|CNPJ\s*\/\s*CPF|CNPJ|CPF|DATA\s*D[AE]\s*EMISS[ÃA]O|DATA\s*EMISS[ÃA]O|DATA\s*D[AE]\s*SA[IÍ]DA|DATA\s*SA[IÍ]DA|DESTINATÁRIO\s*\/\s*REMETENTE|DESTINATARIO\s*\/\s*REMETENTE|DESTINATÁRIO|DESTINATARIO|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|I\.E\.|IE|001|002|[\s\n\r\-\:\/\|\.\,])+/gi,
      ''
    )
    .trim()

  // Remover termos que ficaram no meio ou no fim após o nome real
  nome = nome
    .replace(
      /(?:CNPJ\s*\/\s*CPF|CNPJ|CPF|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\/\d{2}\/\d{4}\b|DATA\s*D[AE]\s*EMISS[ÃA]O|INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|ENDEREÇO|ENDEREC|BAIRRO|MUNICÍPIO|MUNICIPIO|UF|CEP|FONE|TELEFONE).*$/i,
      ''
    )
    .replace(/[:=\-.,;/]+$/, '')
    .trim()

  const combined = `${nome} ${rawCnpj || ''} ${fullText || ''}`.toUpperCase()

  // 2. Normalização corporativa de grandes clientes do setor agro / trading / usinas
  if (combined.includes('TIETE') || combined.includes('TIETÊ') || /51\.?843\.?514/i.test(combined)) {
    return 'TIETE AGROINDUSTRIAL S.A.'
  }
  if (combined.includes('ALCOESTE') || /43\.?545\.?284/i.test(combined)) {
    return 'ALCOESTE BIOENERGIA FERNANDOPOLIS S/A'
  }
  if (combined.includes('CARGILL') || /02\.?387\.?241/i.test(combined)) {
    return 'CARGILL AGRICOLA SA'
  }
  if (combined.includes('CORURIPE') || /12\.?229\.?415/i.test(combined)) {
    return 'S/A USINA CORURIPE ACUCAR E ALCOOL'
  }
  if (combined.includes('COPERSUCAR') || /60\.?643\.?236/i.test(combined)) {
    return 'COPERSUCAR S.A.'
  }
  if (combined.includes('RAIZEN') || combined.includes('RAÍZEN') || /08\.?070\.?508/i.test(combined)) {
    return 'RAIZEN ENERGIA S.A.'
  }
  if (combined.includes('SAO MARTINHO') || combined.includes('SÃO MARTINHO') || /51\.?466\.?860/i.test(combined)) {
    return 'USINA SAO MARTINHO S/A'
  }
  if (combined.includes('ADECOAGRO') || /05\.?950\.?358/i.test(combined)) {
    return 'ADECOAGRO VALE DO IVINHEMA S.A.'
  }
  if (combined.includes('ALTA MOGIANA') || /44\.?248\.?957/i.test(combined)) {
    return 'USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL'
  }
  if (combined.includes('BATATAIS') || /44\.?952\.?665/i.test(combined)) {
    return 'USINA BATATAIS S/A ACUCAR E ALCOOL'
  }
  if (combined.includes('TEREOS') || combined.includes('GUARANI') || /47\.?080\.?619/i.test(combined)) {
    return 'TEREOS ACUCAR E ENERGIA BRASIL S.A.'
  }
  if (combined.includes('BP BUNGE') || combined.includes('BIOENERGIA') || /10\.?779\.?985/i.test(combined)) {
    return 'BP BUNGE BIOENERGIA S.A.'
  }
  if (combined.includes('BOM FUTURO') || /01\.?249\.?863/i.test(combined)) {
    return 'BOM FUTURO AGRICOLA LTDA'
  }
  if (combined.includes('ADM DO BRASIL') || combined.includes('ADM ') || /02\.?012\.?862/i.test(combined)) {
    return 'ADM DO BRASIL LTDA'
  }
  if (combined.includes('LOUIS DREYFUS') || combined.includes('LDC') || /47\.?067\.?525/i.test(combined)) {
    return 'LOUIS DREYFUS COMPANY BRASIL S.A.'
  }
  if (combined.includes('BUNGE') || /84\.?046\.?101/i.test(combined)) {
    return 'BUNGE ALIMENTOS S.A.'
  }
  if (combined.includes('AMAGGI') || /00\.?299\.?056/i.test(combined)) {
    return 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'
  }
  if (combined.includes('COAMO') || /75\.?904\.?383/i.test(combined)) {
    return 'COAMO AGROINDUSTRIAL COOPERATIVA'
  }
  if (combined.includes('C.VALE') || combined.includes('C VALE') || /77\.?858\.?645/i.test(combined)) {
    return 'C.VALE COOPERATIVA AGROINDUSTRIAL'
  }
  if (combined.includes('VITERRA') || combined.includes('GLENCORE') || /02\.?638\.?994/i.test(combined)) {
    return 'VITERRA BRASIL S.A.'
  }
  if (combined.includes('COFCO') || /06\.?315\.?338/i.test(combined)) {
    return 'COFCO INTERNATIONAL BRASIL S.A.'
  }
  if (combined.includes('JALLES MACHADO') || /02\.?638\.?994/i.test(combined)) {
    return 'JALLES MACHADO S.A.'
  }
  if (combined.includes('AGROVALE') || /14\.?495\.?734/i.test(combined)) {
    return 'AGROVALE - AGRO INDUSTRIAS DO VALE DO SAO FRANCISCO S.A.'
  }
  if (combined.includes('SANTA FE') || combined.includes('SANTA FÉ') || /44\.?218\.?935/i.test(combined)) {
    return 'USINA SANTA FE S/A'
  }
  if (combined.includes('SANTA TEREZINHA') || combined.includes('USACUCAR') || /75\.?767\.?475/i.test(combined)) {
    return 'USINA SANTA TEREZINHA LTDA'
  }
  if (combined.includes('CAETE') || combined.includes('CAETÉ') || /12\.?200\.?749/i.test(combined)) {
    return 'USINA CAETE S/A'
  }

  // 3. Validações finais
  if (!nome || nome.length < 3 || /^(?:DESTINAT[AÁ]RIO|CLIENTE|EMPRESA|NAO INFORMADO|NÃO INFORMADO)$/i.test(nome)) {
    if (rawCnpj) {
      return `DESTINATÁRIO (${formatCNPJ(rawCnpj)})`
    }
    return 'Não informado'
  }

  return nome
}
