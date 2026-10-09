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
    // Retorna ex: "0002-41"
    return `${digits.slice(8, 12)}-${digits.slice(12, 14)}`
  }
  return digits.slice(-6) || ''
}

/**
 * Identifica se um determinado CNPJ pertence a uma transportadora conhecida ou terminal portuário
 * para evitar que seja indevidamente atribuído como destinatário da mercadoria.
 */
export function isCarrierCnpj(cnpj?: string): boolean {
  const digits = (cnpj || '').replace(/\D/g, '')
  if (!digits) return false
  // 02.387.241 (Rumo S.A.)
  // 10.991.380 (Liderança Transportes Iturama Ltda)
  // 49.964.752 (Transportadora Guardia - Gama Logística)
  // 13.370.835 / 52.618.139 (JSL / Julio Simoes)
  // 04.286.197 (VLI Multimodal)
  // 04.721.589 (TEAG - Terminal de Exportação de Açúcar do Guarujá)
  // 00.414.545 (TEG - Terminal Exportador do Guarujá)
  return /^(?:02387241|10991380|49964752|13370835|52618139|04286197|04721589|00414545)/.test(digits)
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

  // 0. Rejeitar ou limpar ruídos graves de tabelas do DANFE (volumes, transporte, frete)
  if (
    /QUANTIDADE.*(?:ESP[EÉ]CIE|PESO|MARCA|N[UÚ]MERO)|PESO\s+BRUTO\s+PESO\s+L[ÍI]QUIDO|PESO\s+BRUTO\s+PESO\s+LIQUIDO/i.test(
      nome
    ) ||
    /^(?:QUANTIDADE|ESP[EÉ]CIE|MARCA|N[UÚ]MERO|PESO\s+BRUTO|PESO\s+L[ÍI]QUIDO|PESO\s+LIQUIDO|VOLUMES\s+TRANSPORTADOS|FRETE\s+POR\s+CONTA|DADOS\s+DO\s+TRANSPORTADOR|TRANSPORTE\s+[\/\-]?\s+VOLUMES|DADOS\s+DOS\s+PRODUTOS)\b/i.test(
      nome
    )
  ) {
    nome = ''
  }

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

  // -1. Consulta o catálogo de Cadastros Logísticos (personalizados pelo usuário e padrão)
  const catalogMatch = matchDestinatarioFromTextOrCnpj(nome, rawCnpj, fullText)
  if (catalogMatch) {
    return catalogMatch
  }

  // Função auxiliar de correspondência corporativa
  const matchCompany = (target: string): string | null => {
    if (!target) return null
    if (target.includes('BTG PACTUAL') || target.includes('SERTRADING') || /04\.?626\.?426/i.test(target)) {
      return 'BTG PACTUAL COMMODITIES SERTRADING S.A.'
    }
    if (target.includes('TIETE') || target.includes('TIETÊ') || /51\.?843\.?514/i.test(target)) {
      return 'TIETE AGROINDUSTRIAL S.A.'
    }
    if (target.includes('ALCOESTE') || /43\.?545\.?284/i.test(target)) {
      return 'ALCOESTE BIOENERGIA FERNANDOPOLIS S/A'
    }
    // CRÍTICO: Cargill é CNPJ 44.934.648. O CNPJ 02.387.241 é da RUMO S.A. (transportadora) e NUNCA deve ser Cargill!
    if (target.includes('CARGILL') || /44\.?934\.?648/i.test(target)) {
      return 'CARGILL AGRICOLA SA'
    }
    if (target.includes('CORURIPE') || /12\.?229\.?415/i.test(target)) {
      return 'S/A USINA CORURIPE ACUCAR E ALCOOL'
    }
    if (target.includes('COPERSUCAR') || /60\.?643\.?236/i.test(target)) {
      return 'COPERSUCAR S.A.'
    }
    if (target.includes('RAIZEN') || target.includes('RAÍZEN') || /08\.?070\.?508/i.test(target)) {
      return 'RAIZEN ENERGIA S.A.'
    }
    if (target.includes('SAO MARTINHO') || target.includes('SÃO MARTINHO') || /51\.?466\.?860/i.test(target)) {
      return 'USINA SAO MARTINHO S/A'
    }
    if (target.includes('ADECOAGRO') || /05\.?950\.?358/i.test(target)) {
      return 'ADECOAGRO VALE DO IVINHEMA S.A.'
    }
    if (target.includes('ALTA MOGIANA') || /44\.?248\.?957/i.test(target)) {
      return 'USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL'
    }
    if (target.includes('BATATAIS') || /44\.?952\.?665/i.test(target)) {
      return 'USINA BATATAIS S/A ACUCAR E ALCOOL'
    }
    if (target.includes('TEREOS') || target.includes('GUARANI') || /47\.?080\.?619/i.test(target)) {
      return 'TEREOS ACUCAR E ENERGIA BRASIL S.A.'
    }
    if (target.includes('BP BUNGE') || (target.includes('BIOENERGIA') && !target.includes('ALCOESTE')) || /10\.?779\.?985/i.test(target)) {
      return 'BP BUNGE BIOENERGIA S.A.'
    }
    if (target.includes('BOM FUTURO') || /01\.?249\.?863/i.test(target)) {
      return 'BOM FUTURO AGRICOLA LTDA'
    }
    if (target.includes('ADM DO BRASIL') || (target.includes('ADM ') && !target.includes('ADMINISTR')) || /02\.?012\.?862/i.test(target)) {
      return 'ADM DO BRASIL LTDA'
    }
    if (target.includes('LOUIS DREYFUS') || target.includes('LOUIS DREUFUS') || target.includes('DREYFUS') || target.includes('LDC') || /47\.?067\.?525/i.test(target)) {
      return 'LOUIS DREYFUS COMPANY BRASIL S.A.'
    }
    if (target.includes('BUNGE') || /84\.?046\.?101/i.test(target)) {
      return 'BUNGE ALIMENTOS S.A.'
    }
    if (target.includes('AMAGGI') || /00\.?299\.?056/i.test(target)) {
      return 'AMAGGI EXPORTACAO E IMPORTACAO LTDA'
    }
    if (target.includes('COAMO') || /75\.?904\.?383/i.test(target)) {
      return 'COAMO AGROINDUSTRIAL COOPERATIVA'
    }
    if (target.includes('C.VALE') || target.includes('C VALE') || /77\.?858\.?645/i.test(target)) {
      return 'C.VALE COOPERATIVA AGROINDUSTRIAL'
    }
    if (target.includes('VITERRA') || target.includes('GLENCORE') || /02\.?638\.?994/i.test(target)) {
      return 'VITERRA BRASIL S.A.'
    }
    if (target.includes('COFCO') || /06\.?315\.?338/i.test(target)) {
      return 'COFCO INTERNATIONAL BRASIL S.A.'
    }
    if (target.includes('JALLES MACHADO') || /02\.?635\.?522/i.test(target)) {
      return 'JALLES MACHADO S.A.'
    }
    if (target.includes('AGROVALE') || /14\.?495\.?734/i.test(target)) {
      return 'AGROVALE - AGRO INDUSTRIAS DO VALE DO SAO FRANCISCO S.A.'
    }
    if (target.includes('SANTA FE') || target.includes('SANTA FÉ') || /44\.?218\.?935/i.test(target)) {
      return 'USINA SANTA FE S/A'
    }
    if (target.includes('SANTA TEREZINHA') || target.includes('USACUCAR') || /75\.?767\.?475/i.test(target)) {
      return 'USINA SANTA TEREZINHA LTDA'
    }
    if (target.includes('CAETE') || target.includes('CAETÉ') || /12\.?200\.?749/i.test(target)) {
      return 'USINA CAETE S/A'
    }
    return null
  }

  // 2. Prioridade 1: Identificar a partir do nome ou CNPJ direto do destinatário
  const directTarget = `${nome} ${rawCnpj || ''}`.toUpperCase().trim()
  const directMatch = matchCompany(directTarget)
  if (directMatch) {
    return directMatch
  }

  // Se o nome capturado já é legítimo (não é boilerplate) e possui tamanho suficiente, manter o nome
  const isGenericOrBoilerplate =
    !nome ||
    nome.length < 3 ||
    /^(?:DESTINAT[AÁ]RIO(?:\s*[\/\-]?\s*REMETENTE)?|CLIENTE|EMPRESA|NAO INFORMADO|NÃO INFORMADO|DESTINAT[AÁ]RIO N[ÃA]O IDENTIFICADO|N[ÃA]O IDENTIFICADO|NAO IDENTIFICADO|SEM DESTINAT[AÁ]RIO)$/i.test(
      nome
    ) ||
    /QUANTIDADE|ESP[EÉ]CIE|PESO\s+BRUTO|PESO\s+L[ÍI]QUIDO|PESO\s+LIQUIDO|VOLUMES\s+TRANSPORTADOS|FRETE\s+POR\s+CONTA|DADOS\s+DO\s+TRANSPORTADOR|TRANSPORTE\s+[\/\-]?\s+VOLUMES/i.test(
      nome
    )

  // 3. Prioridade 2: Se o nome estiver vazio/boilerplate, ou se houver cliente explícito nos dados adicionais
  // Verificar se há indicação explícita de cliente em dados adicionais (ex: "ALOCAR NO ESPAÇO DO CLIENTE ...")
  if (fullText) {
    const clienteEspacoMatch = fullText.match(/(?:ALOCAR\s+NO\s+ESPA[ÇC]O\s+DO\s+CLIENTE|ESPA[ÇC]O\s+DO\s+CLIENTE|CLIENTE\s*[:=-])\s*([A-ZÀ-Ú0-9\s\.\,\-\/&]{3,80})/i)
    if (clienteEspacoMatch) {
      const clienteEspaco = clienteEspacoMatch[1].toUpperCase()
      const clienteEspacoCompany = matchCompany(clienteEspaco)
      if (clienteEspacoCompany) {
        // Se o destinatário era genérico ou a própria usina emitente, o cliente comercial pode ser aproveitado
        if (isGenericOrBoilerplate) {
          return clienteEspacoCompany
        }
      }
    }

    if (isGenericOrBoilerplate) {
      // Buscar nos dados completos sem deixar CNPJ de transportador interferir
      const textUpper = (fullText || '').toUpperCase()
      const fullMatch = matchCompany(textUpper)
      if (fullMatch) {
        return fullMatch
      }
    }
  }

  // 4. Validações finais
  if (isGenericOrBoilerplate) {
    if (rawCnpj && !isCarrierCnpj(rawCnpj)) {
      return `DESTINATÁRIO (${formatCNPJ(rawCnpj)})`
    }
    return 'Não informado'
  }

  return nome
}
