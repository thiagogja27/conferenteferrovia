export interface CNPJVerificationResult {
  chaveCnpj: string
  chaveCnpjRaw: string
  emitenteCnpjRaw: string
  destinatarioCnpjRaw: string
  matchesEmitente: boolean
  matchesDestinatario: boolean
  confrontoChaveXDest: "IGUAIS" | "DIVERGENTES" | "NÃO INFORMADO"
  confrontoChaveXEmit: "IGUAIS" | "DIVERGENTES" | "NÃO INFORMADO"
  isValid: boolean
  statusLabel: string
  details: string
}

export interface NFEData {
  tipo: "NFe" | "NFSe" | "Desconhecido"
  // Identificação
  numero: string
  serie: string
  dataEmissao: string
  horaEmissao: string
  dataEntradaSaida: string
  horaEntradaSaida: string
  chaveAcesso: string
  protocolo: string
  naturezaOperacao: string
  tipoOperacao: "0" | "1" // 0 = entrada, 1 = saída
  folha: string
  // Validação do CNPJ da Chave x Remetente/Destinatário
  verificacaoCNPJ?: CNPJVerificationResult
  // Campos extraídos das informações complementares
  terminalEntrega: string
  transbordo: string
  retirada: string
  tipoProduto: "SOJA" | "MILHO" | "ACUCAR" | "OUTRO"
  // Emitente
  emitente: {
    cnpj: string
    nome: string
    nomeFantasia: string
    endereco: string
    numero: string
    bairro: string
    cidade: string
    uf: string
    cep: string
    telefone: string
    inscricaoEstadual: string
    inscricaoEstadualST: string
  }
  // Destinatário
  destinatario: {
    cpfCnpj: string
    nome: string
    endereco: string
    numero: string
    bairro: string
    cidade: string
    uf: string
    cep: string
    telefone: string
    email: string
    inscricaoEstadual: string
  }
  // Transportador
  transportador: {
    nome: string
    cpfCnpj: string
    endereco: string
    cidade: string
    uf: string
    inscricaoEstadual: string
    fretePorConta: string // 0=emitente, 1=destinatario, etc
    codigoANTT: string
    placaVeiculo: string
    ufVeiculo: string
    // Volumes
    quantidade: number
    especie: string
    marca: string
    numeracao: string
    pesoLiquido: number
    pesoBruto: number
  }
  // Produtos/Serviços
  itens: Array<{
    numero: string
    codigo: string
    descricao: string
    ncm: string
    cst: string
    cfop: string
    unidade: string
    quantidade: number
    valorUnitario: number
    valorTotal: number
    baseICMS: number
    valorICMS: number
    aliqICMS: number
    aliqIPI: number
    valorIPI: number
  }>
  // Cálculo do imposto
  impostos: {
    baseCalcICMS: number
    valorICMS: number
    baseCalcICMSST: number
    valorICMSST: number
    valorFrete: number
    valorSeguro: number
    desconto: number
    outrasDesp: number
    valorIPI: number
    valorProdutos: number
    valorTotal: number
  }
  // Fatura / Duplicatas
  fatura: {
    numero: string
    valorOriginal: number
    valorDesconto: number
    valorLiquido: number
  }
  duplicatas: Array<{
    numero: string
    vencimento: string
    valor: number
  }>
  // Informações adicionais
  informacoesComplementares: string
  informacoesFisco: string
}

function getTextContent(doc: Document, tagName: string, parent?: Element): string {
  const context = parent || doc
  const elements = context.getElementsByTagName(tagName)
  if (elements.length > 0 && elements[0].textContent) {
    return elements[0].textContent.trim()
  }
  return ""
}

function parseNumber(value: string): number {
  const num = parseFloat(value.replace(",", "."))
  return isNaN(num) ? 0 : num
}

export function parseNFE(xmlString: string): NFEData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, "text/xml")

  // Detectar tipo de documento
  const isNFe = doc.getElementsByTagName("NFe").length > 0 || doc.getElementsByTagName("nfeProc").length > 0
  const isNFSe =
    doc.getElementsByTagName("CompNfse").length > 0 || doc.getElementsByTagName("Nfse").length > 0

  const tipo = isNFe ? "NFe" : isNFSe ? "NFSe" : "Desconhecido"

  if (isNFe) {
    return parseNFeData(doc, tipo)
  } else if (isNFSe) {
    return parseNFSeData(doc, tipo)
  }

  return parseGenericData(doc, tipo)
}

function parseNFeData(doc: Document, tipo: "NFe" | "NFSe" | "Desconhecido"): NFEData {
  // Identificação
  const ide = doc.getElementsByTagName("ide")[0]
  const emit = doc.getElementsByTagName("emit")[0]
  const dest = doc.getElementsByTagName("dest")[0]
  const total = doc.getElementsByTagName("total")[0]
  const transp = doc.getElementsByTagName("transp")[0]
  const cobr = doc.getElementsByTagName("cobr")[0]
  const infAdic = doc.getElementsByTagName("infAdic")[0]
  const protNFe = doc.getElementsByTagName("protNFe")[0]

  // Parse itens
  const dets = doc.getElementsByTagName("det")
  const itens: NFEData["itens"] = []

  for (let i = 0; i < dets.length; i++) {
    const det = dets[i]
    const prod = det.getElementsByTagName("prod")[0]
    const imposto = det.getElementsByTagName("imposto")[0]
    const icms = imposto?.getElementsByTagName("ICMS")[0]
    const ipi = imposto?.getElementsByTagName("IPI")[0]
    
    // Encontrar o elemento ICMS específico (ICMS00, ICMS10, etc)
    let icmsElement: Element | undefined
    if (icms) {
      const icmsTypes = ["ICMS00", "ICMS10", "ICMS20", "ICMS30", "ICMS40", "ICMS41", "ICMS50", "ICMS51", "ICMS60", "ICMS70", "ICMS90", "ICMSSN101", "ICMSSN102", "ICMSSN201", "ICMSSN202", "ICMSSN500", "ICMSSN900"]
      for (const icmsType of icmsTypes) {
        const found = icms.getElementsByTagName(icmsType)[0]
        if (found) {
          icmsElement = found
          break
        }
      }
    }

    // Encontrar IPITrib
    let ipiElement: Element | undefined
    if (ipi) {
      ipiElement = ipi.getElementsByTagName("IPITrib")[0]
    }

    if (prod) {
      itens.push({
        numero: det.getAttribute("nItem") || String(i + 1),
        codigo: getTextContent(doc, "cProd", prod),
        descricao: getTextContent(doc, "xProd", prod),
        ncm: getTextContent(doc, "NCM", prod),
        cst: icmsElement ? (getTextContent(doc, "CST", icmsElement) || getTextContent(doc, "CSOSN", icmsElement)) : "",
        cfop: getTextContent(doc, "CFOP", prod),
        unidade: getTextContent(doc, "uCom", prod),
        quantidade: parseNumber(getTextContent(doc, "qCom", prod)),
        valorUnitario: parseNumber(getTextContent(doc, "vUnCom", prod)),
        valorTotal: parseNumber(getTextContent(doc, "vProd", prod)),
        baseICMS: icmsElement ? parseNumber(getTextContent(doc, "vBC", icmsElement)) : 0,
        valorICMS: icmsElement ? parseNumber(getTextContent(doc, "vICMS", icmsElement)) : 0,
        aliqICMS: icmsElement ? parseNumber(getTextContent(doc, "pICMS", icmsElement)) : 0,
        aliqIPI: ipiElement ? parseNumber(getTextContent(doc, "pIPI", ipiElement)) : 0,
        valorIPI: ipiElement ? parseNumber(getTextContent(doc, "vIPI", ipiElement)) : 0,
      })
    }
  }

  // Endereco emitente
  const enderEmit = emit?.getElementsByTagName("enderEmit")[0]
  const enderDest = dest?.getElementsByTagName("enderDest")[0]

  // Transportador
  const transporta = transp?.getElementsByTagName("transporta")[0]
  const veicTransp = transp?.getElementsByTagName("veicTransp")[0]
  const vol = transp?.getElementsByTagName("vol")[0]

  // Duplicatas
  const dups = cobr?.getElementsByTagName("dup") || []
  const duplicatas: NFEData["duplicatas"] = []
  for (let i = 0; i < dups.length; i++) {
    const dup = dups[i]
    duplicatas.push({
      numero: getTextContent(doc, "nDup", dup as Element),
      vencimento: formatDate(getTextContent(doc, "dVenc", dup as Element)),
      valor: parseNumber(getTextContent(doc, "vDup", dup as Element)),
    })
  }

  // Data e hora
const dhEmi = getTextContent(doc, "dhEmi", ide) || getTextContent(doc, "dEmi", ide)
  const dhSaiEnt = getTextContent(doc, "dhSaiEnt", ide) || getTextContent(doc, "dSaiEnt", ide)
  
  // Extrair informações complementares para análise
  const informacoesComplementares = infAdic
    ? (
        getTextContent(doc, "infCpl", infAdic as Element) + " " +
        getTextContent(doc, "infAdFisco", infAdic as Element) + " " +
        (infAdic.textContent || "")
      ).trim()
    : ""
  
  // Detectar tipo de produto baseado na descrição dos itens
  const descricaoProdutos = itens.map(i => i.descricao).join(" ")
  
  const infNFeEl = doc.getElementsByTagName("infNFe")[0]
  let chaveAcesso = protNFe ? getTextContent(doc, "chNFe", protNFe as Element) : ""
  if (!chaveAcesso && infNFeEl) {
    const idAttr = infNFeEl.getAttribute("Id") || infNFeEl.getAttribute("id") || ""
    chaveAcesso = idAttr.replace(/^NFe/i, "").trim()
  }
  if (!chaveAcesso) {
    const chNFeEl = doc.getElementsByTagName("chNFe")[0]
    if (chNFeEl && chNFeEl.textContent) {
      chaveAcesso = chNFeEl.textContent.trim()
    }
  }
  if (!chaveAcesso) {
    chaveAcesso = getTextContent(doc, "Id").replace(/^NFe/i, "").trim()
  }
  const emitCnpj = formatCNPJ(getTextContent(doc, "CNPJ", emit))
  const destCnpj = formatCPFCNPJ(
    getTextContent(doc, "CNPJ", dest) || getTextContent(doc, "CPF", dest)
  )
  const verificacaoCNPJ = verifyChaveCNPJ(chaveAcesso, emitCnpj, destCnpj)

  return {
  tipo,
  numero: getTextContent(doc, "nNF", ide),
  serie: getTextContent(doc, "serie", ide),
  dataEmissao: formatDate(dhEmi),
  horaEmissao: formatTime(dhEmi),
  dataEntradaSaida: formatDate(dhSaiEnt),
  horaEntradaSaida: formatTime(dhSaiEnt) || formatTime(getTextContent(doc, "hSaiEnt", ide)),
  chaveAcesso,
  verificacaoCNPJ,
  protocolo: protNFe ? getTextContent(doc, "nProt", protNFe as Element) : "",
  naturezaOperacao: getTextContent(doc, "natOp", ide),
  tipoOperacao: (getTextContent(doc, "tpNF", ide) as "0" | "1") || "1",
  folha: "1/1",
  // Campos extraídos das informações complementares
  terminalEntrega: extractTerminalEntrega(informacoesComplementares),
  transbordo: extractTransbordo(informacoesComplementares),
  retirada: extractRetirada(informacoesComplementares),
  tipoProduto: detectTipoProduto(descricaoProdutos, informacoesComplementares),
  emitente: {
      cnpj: emitCnpj,
      nome: getTextContent(doc, "xNome", emit),
      nomeFantasia: getTextContent(doc, "xFant", emit),
      endereco: getTextContent(doc, "xLgr", enderEmit),
      numero: getTextContent(doc, "nro", enderEmit),
      bairro: getTextContent(doc, "xBairro", enderEmit),
      cidade: getTextContent(doc, "xMun", enderEmit),
      uf: getTextContent(doc, "UF", enderEmit),
      cep: formatCEP(getTextContent(doc, "CEP", enderEmit)),
      telefone: formatPhone(getTextContent(doc, "fone", enderEmit)),
      inscricaoEstadual: getTextContent(doc, "IE", emit),
      inscricaoEstadualST: getTextContent(doc, "IEST", emit),
    },
    destinatario: {
      cpfCnpj: destCnpj,
      nome: getTextContent(doc, "xNome", dest),
      endereco: getTextContent(doc, "xLgr", enderDest),
      numero: getTextContent(doc, "nro", enderDest),
      bairro: getTextContent(doc, "xBairro", enderDest),
      cidade: getTextContent(doc, "xMun", enderDest),
      uf: getTextContent(doc, "UF", enderDest),
      cep: formatCEP(getTextContent(doc, "CEP", enderDest)),
      telefone: formatPhone(getTextContent(doc, "fone", enderDest)),
      email: getTextContent(doc, "email", dest),
      inscricaoEstadual: getTextContent(doc, "IE", dest),
    },
    transportador: {
      nome: transporta ? getTextContent(doc, "xNome", transporta) : "",
      cpfCnpj: transporta ? formatCPFCNPJ(getTextContent(doc, "CNPJ", transporta) || getTextContent(doc, "CPF", transporta)) : "",
      endereco: transporta ? getTextContent(doc, "xEnder", transporta) : "",
      cidade: transporta ? getTextContent(doc, "xMun", transporta) : "",
      uf: transporta ? getTextContent(doc, "UF", transporta) : "",
      inscricaoEstadual: transporta ? getTextContent(doc, "IE", transporta) : "",
      fretePorConta: getTextContent(doc, "modFrete", transp),
      codigoANTT: veicTransp ? getTextContent(doc, "RNTC", veicTransp) : "",
      placaVeiculo: veicTransp ? getTextContent(doc, "placa", veicTransp) : "",
      ufVeiculo: veicTransp ? getTextContent(doc, "UF", veicTransp) : "",
      quantidade: vol ? parseNumber(getTextContent(doc, "qVol", vol as Element)) : 0,
      especie: vol ? getTextContent(doc, "esp", vol as Element) : "",
      marca: vol ? getTextContent(doc, "marca", vol as Element) : "",
      numeracao: vol ? getTextContent(doc, "nVol", vol as Element) : "",
      pesoLiquido: vol ? parseNumber(getTextContent(doc, "pesoL", vol as Element)) : 0,
      pesoBruto: vol ? parseNumber(getTextContent(doc, "pesoB", vol as Element)) : 0,
    },
    itens,
    impostos: {
      baseCalcICMS: parseNumber(getTextContent(doc, "vBC", total)),
      valorICMS: parseNumber(getTextContent(doc, "vICMS", total)),
      baseCalcICMSST: parseNumber(getTextContent(doc, "vBCST", total)),
      valorICMSST: parseNumber(getTextContent(doc, "vST", total)),
      valorFrete: parseNumber(getTextContent(doc, "vFrete", total)),
      valorSeguro: parseNumber(getTextContent(doc, "vSeg", total)),
      desconto: parseNumber(getTextContent(doc, "vDesc", total)),
      outrasDesp: parseNumber(getTextContent(doc, "vOutro", total)),
      valorIPI: parseNumber(getTextContent(doc, "vIPI", total)),
      valorProdutos: parseNumber(getTextContent(doc, "vProd", total)),
      valorTotal: parseNumber(getTextContent(doc, "vNF", total)),
    },
    fatura: cobr ? {
      numero: getTextContent(doc, "nFat", cobr.getElementsByTagName("fat")[0] as Element),
      valorOriginal: parseNumber(getTextContent(doc, "vOrig", cobr.getElementsByTagName("fat")[0] as Element)),
      valorDesconto: parseNumber(getTextContent(doc, "vDesc", cobr.getElementsByTagName("fat")[0] as Element)),
      valorLiquido: parseNumber(getTextContent(doc, "vLiq", cobr.getElementsByTagName("fat")[0] as Element)),
    } : {
      numero: "",
      valorOriginal: 0,
      valorDesconto: 0,
      valorLiquido: 0,
    },
    duplicatas,
    informacoesComplementares: infAdic ? getTextContent(doc, "infCpl", infAdic as Element) : "",
    informacoesFisco: infAdic ? getTextContent(doc, "infAdFisco", infAdic as Element) : "",
  }
}

function parseNFSeData(doc: Document, tipo: "NFe" | "NFSe" | "Desconhecido"): NFEData {
  const infNfse = doc.getElementsByTagName("InfNfse")[0]
  const prestador = doc.getElementsByTagName("PrestadorServico")[0] || doc.getElementsByTagName("Prestador")[0]
  const tomador = doc.getElementsByTagName("TomadorServico")[0] || doc.getElementsByTagName("Tomador")[0]
  const servico = doc.getElementsByTagName("Servico")[0]
  const valores = doc.getElementsByTagName("Valores")[0]

  const enderecoPrestador = prestador?.getElementsByTagName("Endereco")[0]
  const enderecoTomador = tomador?.getElementsByTagName("Endereco")[0]
  const identificacaoTomador = tomador?.getElementsByTagName("IdentificacaoTomador")[0]

  const valorServicos = parseNumber(getTextContent(doc, "ValorServicos", valores))
  
  return {
    tipo,
    numero: getTextContent(doc, "Numero", infNfse),
    serie: getTextContent(doc, "Serie", infNfse) || "1",
    dataEmissao: formatDate(getTextContent(doc, "DataEmissao", infNfse)),
    horaEmissao: formatTime(getTextContent(doc, "DataEmissao", infNfse)),
    dataEntradaSaida: "",
    horaEntradaSaida: "",
chaveAcesso: getTextContent(doc, "CodigoVerificacao", infNfse),
  protocolo: "",
  naturezaOperacao: "Prestacao de Servicos",
  tipoOperacao: "1",
  folha: "1/1",
  terminalEntrega: "",
  transbordo: "",
  retirada: "",
  tipoProduto: "OUTRO",
  emitente: {
      cnpj: formatCNPJ(getTextContent(doc, "Cnpj", prestador)),
      nome: getTextContent(doc, "RazaoSocial", prestador),
      nomeFantasia: getTextContent(doc, "NomeFantasia", prestador),
      endereco: getTextContent(doc, "Endereco", enderecoPrestador),
      numero: getTextContent(doc, "Numero", enderecoPrestador),
      bairro: getTextContent(doc, "Bairro", enderecoPrestador),
      cidade: getTextContent(doc, "Municipio", enderecoPrestador) || getTextContent(doc, "CodigoMunicipio", enderecoPrestador),
      uf: getTextContent(doc, "Uf", enderecoPrestador),
      cep: formatCEP(getTextContent(doc, "Cep", enderecoPrestador)),
      telefone: formatPhone(getTextContent(doc, "Telefone", prestador)),
      inscricaoEstadual: getTextContent(doc, "InscricaoMunicipal", prestador),
      inscricaoEstadualST: "",
    },
    destinatario: {
      cpfCnpj: formatCPFCNPJ(
        getTextContent(doc, "Cnpj", identificacaoTomador) || getTextContent(doc, "Cpf", identificacaoTomador)
      ),
      nome: getTextContent(doc, "RazaoSocial", tomador),
      endereco: getTextContent(doc, "Endereco", enderecoTomador),
      numero: getTextContent(doc, "Numero", enderecoTomador),
      bairro: getTextContent(doc, "Bairro", enderecoTomador),
      cidade: getTextContent(doc, "Municipio", enderecoTomador) || getTextContent(doc, "CodigoMunicipio", enderecoTomador),
      uf: getTextContent(doc, "Uf", enderecoTomador),
      cep: formatCEP(getTextContent(doc, "Cep", enderecoTomador)),
      telefone: formatPhone(getTextContent(doc, "Telefone", tomador)),
      email: getTextContent(doc, "Email", tomador),
      inscricaoEstadual: "",
    },
    transportador: {
      nome: "",
      cpfCnpj: "",
      endereco: "",
      cidade: "",
      uf: "",
      inscricaoEstadual: "",
      fretePorConta: "",
      codigoANTT: "",
      placaVeiculo: "",
      ufVeiculo: "",
      quantidade: 0,
      especie: "",
      marca: "",
      numeracao: "",
      pesoLiquido: 0,
      pesoBruto: 0,
    },
    itens: [
      {
        numero: "1",
        codigo: getTextContent(doc, "ItemListaServico", servico),
        descricao: getTextContent(doc, "Discriminacao", servico),
        ncm: "",
        cst: "",
        cfop: "",
        unidade: "SV",
        quantidade: 1,
        valorUnitario: valorServicos,
        valorTotal: valorServicos,
        baseICMS: 0,
        valorICMS: 0,
        aliqICMS: 0,
        aliqIPI: 0,
        valorIPI: 0,
      },
    ],
    impostos: {
      baseCalcICMS: 0,
      valorICMS: 0,
      baseCalcICMSST: 0,
      valorICMSST: 0,
      valorFrete: 0,
      valorSeguro: 0,
      desconto: parseNumber(getTextContent(doc, "DescontoIncondicionado", valores)),
      outrasDesp: 0,
      valorIPI: 0,
      valorProdutos: valorServicos,
      valorTotal: parseNumber(getTextContent(doc, "ValorLiquidoNfse", valores)) || valorServicos,
    },
    fatura: {
      numero: "",
      valorOriginal: 0,
      valorDesconto: 0,
      valorLiquido: 0,
    },
    duplicatas: [],
    informacoesComplementares: getTextContent(doc, "Discriminacao", servico),
    informacoesFisco: "",
  }
}

function parseGenericData(doc: Document, tipo: "NFe" | "NFSe" | "Desconhecido"): NFEData {
  return {
    tipo,
    numero: "",
    serie: "",
    dataEmissao: new Date().toLocaleDateString("pt-BR"),
    horaEmissao: "",
    dataEntradaSaida: "",
    horaEntradaSaida: "",
    chaveAcesso: "",
    protocolo: "",
    naturezaOperacao: "",
tipoOperacao: "1",
  folha: "1/1",
  terminalEntrega: "",
  transbordo: "",
  retirada: "",
  tipoProduto: "OUTRO",
  emitente: {
  cnpj: "",
  nome: "",
      nomeFantasia: "",
      endereco: "",
      numero: "",
      bairro: "",
      cidade: "",
      uf: "",
      cep: "",
      telefone: "",
      inscricaoEstadual: "",
      inscricaoEstadualST: "",
    },
    destinatario: {
      cpfCnpj: "",
      nome: "",
      endereco: "",
      numero: "",
      bairro: "",
      cidade: "",
      uf: "",
      cep: "",
      telefone: "",
      email: "",
      inscricaoEstadual: "",
    },
    transportador: {
      nome: "",
      cpfCnpj: "",
      endereco: "",
      cidade: "",
      uf: "",
      inscricaoEstadual: "",
      fretePorConta: "",
      codigoANTT: "",
      placaVeiculo: "",
      ufVeiculo: "",
      quantidade: 0,
      especie: "",
      marca: "",
      numeracao: "",
      pesoLiquido: 0,
      pesoBruto: 0,
    },
    itens: [],
    impostos: {
      baseCalcICMS: 0,
      valorICMS: 0,
      baseCalcICMSST: 0,
      valorICMSST: 0,
      valorFrete: 0,
      valorSeguro: 0,
      desconto: 0,
      outrasDesp: 0,
      valorIPI: 0,
      valorProdutos: 0,
      valorTotal: 0,
    },
    fatura: {
      numero: "",
      valorOriginal: 0,
      valorDesconto: 0,
      valorLiquido: 0,
    },
    duplicatas: [],
    informacoesComplementares: "",
    informacoesFisco: "",
  }
}

// Formatters
function formatDate(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString("pt-BR")
  } catch {
    return dateStr
  }
}

function formatTime(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    return date.toLocaleTimeString("pt-BR")
  } catch {
    return ""
  }
}

function formatCNPJ(cnpj: string): string {
  if (!cnpj) return ""
  const cleaned = cnpj.replace(/\D/g, "")
  if (cleaned.length !== 14) return cnpj
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
}

function formatCPFCNPJ(value: string): string {
  if (!value) return ""
  const cleaned = value.replace(/\D/g, "")
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  }
  if (cleaned.length === 14) {
    return formatCNPJ(value)
  }
  return value
}

function formatCEP(cep: string): string {
  if (!cep) return ""
  const cleaned = cep.replace(/\D/g, "")
  if (cleaned.length !== 8) return cep
  return cleaned.replace(/(\d{5})(\d{3})/, "$1-$2")
}

function formatPhone(phone: string): string {
  if (!phone) return ""
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length === 10) {
  return cleaned.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")
  }
  if (cleaned.length === 11) {
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
  }
  return phone
}

export function verifyChaveCNPJ(
  chaveAcesso: string,
  cnpjEmitente: string,
  cnpjDestinatario: string
): CNPJVerificationResult {
  const chaveDigits = (chaveAcesso || "").replace(/\D/g, "")
  let emitDigits = (cnpjEmitente || "").replace(/\D/g, "")
  let destDigits = (cnpjDestinatario || "").replace(/\D/g, "")

  let chaveCnpjRaw = ""
  let chaveCnpj = ""

  if (chaveDigits.length === 44) {
    chaveCnpjRaw = chaveDigits.slice(6, 20)
    chaveCnpj = formatCNPJ(chaveCnpjRaw)
  }

  // Se o destDigits for uma Inscrição Estadual (ex: 12 dígitos como 557061801119 ou 8-10 dígitos)
  // e não um CNPJ (14 dígitos) ou CPF (11 dígitos)
  const isDestIE = destDigits.length === 12 || (destDigits.length >= 8 && destDigits.length <= 10) || (destDigits.length > 11 && destDigits.length < 14)
  const isEmitIE = emitDigits.length === 12 || (emitDigits.length >= 8 && emitDigits.length <= 10) || (emitDigits.length > 11 && emitDigits.length < 14)

  if (isDestIE) {
    // Se recebemos a IE no lugar do CNPJ do destinatário, usar o CNPJ do emitente/chave como referência se for mesma empresa
    if (chaveCnpjRaw && (!emitDigits || emitDigits === chaveCnpjRaw)) {
      destDigits = chaveCnpjRaw
    }
  }

  if (isEmitIE && chaveCnpjRaw) {
    emitDigits = chaveCnpjRaw
  }

  // Se destDigits não foi informado ou é vazio, mas emitDigits bate com a chave
  if (!destDigits && emitDigits && emitDigits === chaveCnpjRaw) {
    destDigits = emitDigits
  }

  const matchesEmitente = !!(
    chaveCnpjRaw &&
    emitDigits &&
    (chaveCnpjRaw === emitDigits || emitDigits.includes(chaveCnpjRaw))
  )
  const matchesDestinatario = !!(
    chaveCnpjRaw &&
    destDigits &&
    (chaveCnpjRaw === destDigits || destDigits.includes(chaveCnpjRaw))
  )

  const confrontoChaveXDest: "IGUAIS" | "DIVERGENTES" | "NÃO INFORMADO" =
    !chaveCnpjRaw || !destDigits
      ? "NÃO INFORMADO"
      : matchesDestinatario
      ? "IGUAIS"
      : "DIVERGENTES"

  const confrontoChaveXEmit: "IGUAIS" | "DIVERGENTES" | "NÃO INFORMADO" =
    !chaveCnpjRaw || !emitDigits
      ? "NÃO INFORMADO"
      : matchesEmitente
      ? "IGUAIS"
      : "DIVERGENTES"

  const isValid = matchesDestinatario || matchesEmitente

  let statusLabel = ""
  let details = ""

  const formattedEmit = formatCNPJ(emitDigits) || "Não Informado"
  const formattedDest = formatCPFCNPJ(destDigits) || "Não Informado"

  if (!chaveCnpjRaw) {
    statusLabel = "Chave sem 44 dígitos"
    details = "Chave de Acesso não possui os 44 dígitos padrões para extração do CNPJ."
  } else if (!destDigits) {
    statusLabel = "Destinatário Sem CNPJ"
    details = `CNPJ da Chave (${chaveCnpj}) extraído. Destinatário sem CNPJ/CPF informado.`
  } else if (matchesDestinatario) {
    statusLabel = "IGUAIS (Chave = Destinatário)"
    details = `O CNPJ na Chave (${chaveCnpj}) é IGUAL ao CNPJ do Destinatário (${formattedDest}).`
  } else if (matchesEmitente) {
    statusLabel = "CONFERE COM EMITENTE"
    details = `O CNPJ na Chave (${chaveCnpj}) é do EMITENTE da NF-e (${formattedEmit}). Destinatário: ${formattedDest}.`
  } else {
    statusLabel = "DIVERGENTES (Chave ≠ Destinatário)"
    details = `O CNPJ na Chave (${chaveCnpj}) é DIVERGENTE do Destinatário (${formattedDest}). (CNPJ do Remetente: ${formattedEmit}).`
  }

  return {
    chaveCnpj,
    chaveCnpjRaw,
    emitenteCnpjRaw: emitDigits,
    destinatarioCnpjRaw: destDigits,
    matchesEmitente,
    matchesDestinatario,
    confrontoChaveXDest,
    confrontoChaveXEmit,
    isValid,
    statusLabel,
    details,
  }
}

// Funções para extrair informações das informações complementares
function extractTerminalEntrega(infComplementares: string): string {
  if (!infComplementares) return ""

  const uppercase = infComplementares.toUpperCase()

  // 1. Verificação por códigos/locais conhecidos em notas de exportação/agronegócio
  if (/\bTEAG\b/i.test(infComplementares) || uppercase.includes('TERMINAL DE ACUCAR DO GUARUJA') || uppercase.includes('TERMINAL EXPORTACAO DE ACUCAR') || uppercase.includes('TEAG')) {
    return 'TEAG - TERMINAL DE ACUCAR DO GUARUJA'
  }
  if (/\bTEG\b/i.test(infComplementares) || uppercase.includes('TERMINAL EXPORTADOR DO GUARUJA') || uppercase.includes('TERM EXP GUARUJA') || uppercase.includes('GUARUJA LTDA GUARUJA')) {
    return 'TEG - TERMINAL EXPORTADOR DO GUARUJA'
  }
  if (/\bTGG\b/i.test(infComplementares) || uppercase.includes('TERMINAL DE GRAIS DO GUARUJA') || uppercase.includes('TERMINAL DE GRAOS DO GUARUJA')) {
    return 'TGG - TERMINAL DE GRAIS DO GUARUJA'
  }
  if (/\bTAC\b/i.test(infComplementares) || uppercase.includes('TERMINAL DE ARMAZENS')) {
    return 'TAC - TERMINAL DE ARMAZENS'
  }
  if (/\bCLI\b/i.test(infComplementares) || uppercase.includes('CORREDOR LOGISTICO INTEGRADO')) {
    return 'CLI - CORREDOR LOGISTICO INTEGRADO'
  }
  if (uppercase.includes('SANTOS BRASIL')) return 'SANTOS BRASIL'
  if (uppercase.includes('DP WORLD')) return 'DP WORLD SANTOS'
  if (uppercase.includes('ECOPORTO')) return 'ECOPORTO SANTOS'
  if (uppercase.includes('BTP') || uppercase.includes('BRASIL TERMINAL PORTUARIO')) return 'BTP - BRASIL TERMINAL PORTUARIO'
  if (uppercase.includes('TIPLAM')) return 'TIPLAM - TERMINAL INTEGRADO'

  // 2. Trazer até 15 primeiras palavras depois de ALFANDEGADO, ALFADEGADO, RECINTO ou ENTREGA
  const regex = /(?:RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|ALFANDEGADO|ALFADEGADO|TERMINAL\s+DE\s+ENTREGA|TERMINAL\s+ENTREGA|LOCAL\s+DE\s+ENTREGA|LOCAL\s+DE\s+DESCARGA|DESCARGA\s+NO\s+RECINTO|TERMINAL\s+EXPORTADOR|ENTREGA\s+EM|TERMINAL|ENTREGA)\s*[:=-]?\s*([\s\S]{1,500})/i

  const match = infComplementares.match(regex)
  if (match && match[1]) {
    let chunk = match[1].trim()
    chunk = chunk.replace(/^(?:EM|DE|NO|NA|SERA|SERÁ|RECINTO|ALFANDEGADO|ALFADEGADO)\s*[:=-]?\s*/i, "")
    const stopKeywords = [
      "TRANSBORDO", "RETIRADA", "PLACA", "MOTORISTA", "CONTRATO",
      "DESTINO", "CNPJ", "CPF", "OBS", "VALOR", "PESO", "QTD", "QUANTIDADE",
      "TICKET", "NAVIO", "SAFRA", "PEDIDO", "NOTA FISCAL", "CHAVE", "DATA", "CEP", "IE"
    ]
    for (const kw of stopKeywords) {
      const idx = chunk.toUpperCase().indexOf(kw)
      if (idx > 0) {
        chunk = chunk.substring(0, idx).trim()
      }
    }
    const words = chunk.split(/\s+/).filter(Boolean).slice(0, 15)
    let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim()
    if (val.length > 2 && !/^\d+$/.test(val)) {
      return val
    }
  }

  if (uppercase.includes('GUARUJA') || uppercase.includes('GUARUJÁ')) return 'TEG - TERMINAL EXPORTADOR DO GUARUJA'
  if (uppercase.includes('SANTOS')) return 'TERMINAL SANTOS'
  return ""
}

function getKnownTransbordo(str: string): string | null {
  if (!str) return null
  const upper = str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  if (upper.includes('NOVA AGRI') || upper.includes('NOVAAGRI') || upper.includes('NOVA-AGRI')) {
    if (upper.includes('ALTO TAQUARI')) return 'NOVA AGRI - ALTO TAQUARI'
    return 'NOVA AGRI'
  }
  if (upper.includes('PRADOPOLIS') || upper.includes('PRADOPOLIS-SP') || upper.includes('PRADOPOLIS - SP')) return 'PRADOPOLIS'
  if (upper.includes('ALTO TAQUARI')) return 'ALTO TAQUARI'
  if (upper.includes('ALTO ARAGUAIA') || (upper.includes('ARAGUAIA') && !upper.includes('ARAGUARI'))) return 'ALTO ARAGUAIA'
  if (upper.includes('RONDONOPOLIS')) {
    return (upper.includes('RUMO') || upper.includes('MALHA') || upper.includes('TRANSBORDO')) ? 'RONDONOPOLIS (RUMO)' : 'RONDONOPOLIS'
  }
  if (upper.includes('RIO VERDE')) return 'RIO VERDE'
  if (upper.includes('DOM AQUINO')) return 'DOM AQUINO'
  if (upper.includes('ITURAMA')) return 'ITURAMA'
  if (upper.includes('ITIQUIRA')) return 'ITIQUIRA'
  if (upper.includes('UBERLANDIA')) return 'UBERLANDIA'
  if (upper.includes('SAO SIMAO')) return 'SAO SIMAO'
  if (upper.includes('CHAPADAO DO SUL')) return 'CHAPADAO DO SUL'
  if (upper.includes('INOCENCIA')) return 'INOCENCIA'
  if (upper.includes('RIO PRETO') || upper.includes('SAO JOSE DO RIO PRETO')) return 'RIO PRETO'
  if (upper.includes('GUARA')) return 'GUARA'
  if (upper.includes('PEDERNEIRAS')) return 'PEDERNEIRAS (RUMO)'
  if (upper.includes('ARAGUARI')) return 'ARAGUARI (VLI)'
  if (upper.includes('UBERABA') || upper.includes('TIUB')) return 'UBERABA'
  if (upper.includes('COMPANHIA AUXILIAR') || upper.includes('CIA AUXILIAR')) return 'COMPANHIA AUXILIAR DE ARMAZENS GERAIS'

  return null
}

function extractTransbordo(infComplementares: string): string {
  if (!infComplementares) return ""

  const uppercase = infComplementares.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // 1. Procurar por trechos específicos perto das palavras-chave indicadas (CIDADE:, ALFANDEGADO, ALFADEGADO, LOCAL DE TRANSBORDO, TRANSBORDO, LOCAL DE ENTREGA, ENTREGA)
  const transbordoKeywordsRegex = /(?:TRANSBORDO|ALFANDEGADO|ALFADEGADO|CIDADE DE TRANSBORDO|LOCAL DE TRANSBORDO|LOCAL DE ENTREGA|TERMINAL DE ENTREGA|RECINTO ALFANDEGADO|RECINTO ALFADEGADO|ENTREGA EM|CIDADE\s*:)\s*[:=-]?\s*([\s\S]{1,300})/gi

  let match: RegExpExecArray | null
  while ((match = transbordoKeywordsRegex.exec(infComplementares)) !== null) {
    const chunk = match[1]
    const known = getKnownTransbordo(chunk)
    if (known) return known
  }

  // 2. Se não encontrou no chunk das palavras-chave, verificar em infComplementares inteira
  const knownInInf = getKnownTransbordo(infComplementares)
  if (knownInInf) return knownInInf

  // 3. Se houver menção explícita após palavras-chave sem local pré-mapeado, extrair texto limpo
  const explicitMatch = infComplementares.match(/(?:SOFRERA\s+TRANSBORDO|MERCADORIA\s+SOFRERA\s+TRANSBORDO|LOCAL\s+DE\s+TRANSBORDO|LOCAL\s+TRANSBORDO|TRANSBORDO\s+NA|TRANSBORDO\s+EM|TRANSBORDO\s+DE|TRANSBORDO\s+NO|TRANSBORDO|RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|ALFANDEGADO|ALFADEGADO|LOCAL\s+DE\s+ENTREGA)\s*[:=-]?\s*([\s\S]{1,300})/i)

  if (explicitMatch && explicitMatch[1]) {
    let chunk = explicitMatch[1].trim()
    chunk = chunk.replace(/^(?:EM|DE|NA|NO|SERA|SERÁ|MERCADORIA|CIDADE)\s*[:=-]?\s*/i, '')

    const stopKeywords = [
      "TERMINAL", "ENTREGA", "RETIRADA", "PLACA", "MOTORISTA", "CONTRATO",
      "DESTINO", "CNPJ", "CPF", "OBS", "VALOR", "PESO", "QTD", "QUANTIDADE",
      "TICKET", "NAVIO", "SAFRA", "PEDIDO", "NOTA FISCAL", "CHAVE", "DATA", "CEP", "IE", "RECINTO", "EMITENTE", "DESTINATARIO"
    ]
    for (const kw of stopKeywords) {
      const idx = chunk.toUpperCase().indexOf(kw)
      if (idx > 0) {
        chunk = chunk.substring(0, idx).trim()
      }
    }

    const words = chunk.split(/\s+/).filter(Boolean).slice(0, 10)
    let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim()
    if (val.length > 2 && !/^\d+$/.test(val) && !['NÃO', 'NAO', 'DE', 'EM', 'SP', 'MT', 'MS', 'GO', 'MG', 'PR'].includes(val.toUpperCase())) {
      if (uppercase.includes('RUMO') || uppercase.includes('MALHA NORTE')) {
        return val.toUpperCase().includes('RUMO') ? val : `${val} (RUMO)`
      }
      if (uppercase.includes('VLI')) {
        return val.toUpperCase().includes('VLI') ? val : `${val} (VLI)`
      }
      return val
    }
  }

  return ""
}

function extractRetirada(infComplementares: string): string {
  if (!infComplementares) return ""

  const text = infComplementares.replace(/\s+/g, " ")

  const regex = /(?:LOCAL\s+DE\s+RETIRADA|RETIRADA\s+EM|RETIRADA)\s*[:=-]?\s*([^\n;,]+)/i

  const match = text.match(regex)
  let val = ""

  if (match && match[1]) {
    val = match[1].trim()
    val = val.replace(/^(?:EM|DE)\s+[:=-]?\s*/i, "")

    const stopKeywords = [
      "TRANSBORDO", "TERMINAL", "ENTREGA", "PLACA", "MOTORISTA", "CONTRATO",
      "DESTINO", "CNPJ", "CPF", "OBS", "VALOR", "PESO", "QTD", "QUANTIDADE",
      "TICKET", "NAVIO", "SAFRA", "PEDIDO", "NOTA FISCAL", "CHAVE", "DATA"
    ]

    for (const kw of stopKeywords) {
      const idx = val.toUpperCase().indexOf(kw)
      if (idx > 0) {
        val = val.substring(0, idx).trim()
      }
    }

    val = val.replace(/[:=\-.,;]+$/, "").trim()
  }

  if (!val || /^\d+$/.test(val)) {
    const fallbackMatch = text.match(/(SAO\s+SIMAO|SÃO\s+SIMÃO|JATAI|JATAÍ|RIO\s+VERDE|QUERENCIA|SORRISO)/i)
    if (fallbackMatch) {
      return fallbackMatch[1].trim()
    }
    return ""
  }

  return val
}

function detectTipoProduto(descricaoProduto: string, infComplementares: string): "SOJA" | "MILHO" | "ACUCAR" | "OUTRO" {
  const texto = (descricaoProduto + " " + infComplementares).toUpperCase()
  
  if (texto.includes("SOJA")) return "SOJA"
  if (texto.includes("MILHO")) return "MILHO"
  if (texto.includes("ACUCAR") || texto.includes("AÇUCAR") || texto.includes("AÇÚCAR")) return "ACUCAR"
  
  return "OUTRO"
}

// Alteração para teste de deploy
