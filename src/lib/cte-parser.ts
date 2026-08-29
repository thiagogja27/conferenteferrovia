import { extractPdfTextWithPdfJs } from './client-pdf-parser'

export interface CteVagao {
  vagaoCompleto: string // Ex: "HTT-7538405" ou "HTT7538405"
  vagaoNormalizado: string // Ex: "HTT7538405"
  serie: string // Ex: "HTT"
  numero: string // Ex: "7538405"
  numeroApenas: string // Ex: "7538405"
  peso?: number
}

export interface CteDocumentoOriginario {
  tipo: string // "NFE" | "NF"
  chaveNfe?: string
  numeroNfe?: string
  serieNfe?: string
  cnpjEmitente?: string
}

export interface CteData {
  tipoDoc: 'DACTE' | 'CTE'
  chaveAcesso: string
  numero: string
  serie: string
  modelo: string
  dataEmissao: string
  // Expedidor (Transbordo)
  expedidor: {
    nome: string
    cnpjCpf: string
    cnpjCpfFormatado: string
    cnpjApenasDigitos: string
    ie?: string
    municipio?: string
    uf?: string
    endereco?: string
  }
  // Remetente
  remetente?: {
    nome: string
    cnpjCpf: string
    municipio?: string
    uf?: string
  }
  // Destinatário
  destinatario?: {
    nome: string
    cnpjCpf: string
    municipio?: string
    uf?: string
  }
  // Recebedor
  recebedor?: {
    nome: string
    cnpjCpf: string
    municipio?: string
    uf?: string
  }
  // Informações Ferroviárias e Vagões
  vagoes: CteVagao[]
  documentosOriginarios: CteDocumentoOriginario[]
  usoExclusivoEmissor?: string
  observacoes?: string
  fileName?: string
  rawText?: string
  rawXml?: string
}

export function formatCnpj(val: string): string {
  const digits = String(val || '').replace(/\D/g, '')
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  }
  return val
}

export function normalizarVagao(val: string | number): string {
  if (val === null || val === undefined) return ''
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

export function extrairApenasDigitosVagao(val: string | number): string {
  if (val === null || val === undefined) return ''
  const str = String(val).replace(/\D/g, '')
  return str.replace(/^0+/, '') || str
}

/**
 * Parser de XML de CT-e (Conhecimento de Transporte Eletrônico)
 */
export function parseCteXml(xmlContent: string, fileName?: string): CteData | null {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml')

    const isCte = xmlDoc.getElementsByTagName('CTe').length > 0 || xmlDoc.getElementsByTagName('cteProc').length > 0
    if (!isCte && !xmlContent.includes('<infCte') && !xmlContent.includes('xmlns="http://www.portalfiscal.inf.br/cte"')) {
      return null
    }

    const getTag = (parent: Element | Document, tag: string): string => {
      const el = parent.getElementsByTagName(tag)[0]
      return el && el.textContent ? el.textContent.trim() : ''
    }

    const infCte = xmlDoc.getElementsByTagName('infCte')[0]
    const ide = xmlDoc.getElementsByTagName('ide')[0]
    const exped = xmlDoc.getElementsByTagName('exped')[0]
    const rem = xmlDoc.getElementsByTagName('rem')[0]
    const dest = xmlDoc.getElementsByTagName('dest')[0]
    const recebf = xmlDoc.getElementsByTagName('receb')[0]

    let chaveAcesso = ''
    if (infCte) {
      chaveAcesso = (infCte.getAttribute('Id') || '').replace(/\D/g, '')
    }
    if (!chaveAcesso) {
      const chCteEl = xmlDoc.getElementsByTagName('chCTe')[0]
      if (chCteEl && chCteEl.textContent) chaveAcesso = chCteEl.textContent.trim().replace(/\D/g, '')
    }

    const numero = ide ? getTag(ide, 'nCT') : ''
    const serie = ide ? getTag(ide, 'serie') : ''
    const modelo = ide ? getTag(ide, 'mod') : '57'
    const dataEmissao = ide ? getTag(ide, 'dhEmi') || getTag(ide, 'dEmi') : ''

    // Expedidor
    let expedNome = ''
    let expedCnpj = ''
    let expedIe = ''
    let expedMun = ''
    let expedUf = ''
    let expedEnd = ''

    if (exped) {
      expedNome = getTag(exped, 'xNome')
      expedCnpj = getTag(exped, 'CNPJ') || getTag(exped, 'CPF')
      expedIe = getTag(exped, 'IE')
      const enderExped = exped.getElementsByTagName('enderExped')[0]
      if (enderExped) {
        expedMun = getTag(enderExped, 'xMun')
        expedUf = getTag(enderExped, 'UF')
        expedEnd = `${getTag(enderExped, 'xLgr')} ${getTag(enderExped, 'nro')} ${getTag(enderExped, 'xBairro')}`.trim()
      }
    }

    // Informações Ferroviárias / Vagões
    const vagoes: CteVagao[] = []
    const ferrovNodes = xmlDoc.getElementsByTagName('ferrov')
    for (let i = 0; i < ferrovNodes.length; i++) {
      const fNode = ferrovNodes[i]
      const vagNodes = fNode.getElementsByTagName('vag')
      for (let j = 0; j < vagNodes.length; j++) {
        const vNode = vagNodes[j]
        const nVag = getTag(vNode, 'nVag')
        const tpVag = getTag(vNode, 'tpVag')
        const pesoBC = parseFloat(getTag(vNode, 'pesoBC') || '0')
        const vagaoCompleto = tpVag && nVag ? `${tpVag}${nVag}` : nVag || tpVag
        if (vagaoCompleto) {
          vagoes.push({
            vagaoCompleto,
            vagaoNormalizado: normalizarVagao(vagaoCompleto),
            serie: tpVag,
            numero: nVag,
            numeroApenas: extrairApenasDigitosVagao(nVag),
            peso: isNaN(pesoBC) ? undefined : pesoBC,
          })
        }
      }
    }

    // Documentos originários (NF-es vinculadas)
    const documentosOriginarios: CteDocumentoOriginario[] = []
    const infNFeNodes = xmlDoc.getElementsByTagName('infNFe')
    for (let i = 0; i < infNFeNodes.length; i++) {
      const chave = getTag(infNFeNodes[i], 'chave').replace(/\D/g, '')
      if (chave) {
        documentosOriginarios.push({
          tipo: 'NFE',
          chaveNfe: chave,
          numeroNfe: chave.length >= 34 ? chave.substring(25, 34).replace(/^0+/, '') : '',
          cnpjEmitente: chave.length >= 20 ? chave.substring(6, 20) : '',
        })
      }
    }

    const infNFNodes = xmlDoc.getElementsByTagName('infNF')
    for (let i = 0; i < infNFNodes.length; i++) {
      const nDoc = getTag(infNFNodes[i], 'nDoc')
      const serieDoc = getTag(infNFNodes[i], 'serie')
      if (nDoc) {
        documentosOriginarios.push({
          tipo: 'NF',
          numeroNfe: nDoc.replace(/^0+/, ''),
          serieNfe: serieDoc,
        })
      }
    }

    // Observações / Uso Exclusivo
    let usoExclusivo = ''
    let observacoes = ''
    const compl = xmlDoc.getElementsByTagName('compl')[0]
    if (compl) {
      observacoes = getTag(compl, 'xObs')
      const obsContNodes = compl.getElementsByTagName('ObsCont')
      for (let i = 0; i < obsContNodes.length; i++) {
        const xCampo = obsContNodes[i].getAttribute('xCampo') || ''
        const xTexto = getTag(obsContNodes[i], 'xTexto')
        if (xCampo.toUpperCase().includes('USO') || xCampo.toUpperCase().includes('EXCLUSIVO')) {
          usoExclusivo = xTexto
        }
        if (xTexto && !usoExclusivo && (xTexto.includes('|') || xTexto.includes('-'))) {
          usoExclusivo = xTexto
        }
      }
    }

    // Se nenhum vagão foi extraído nas tags <ferrov>, tenta extrair do usoExclusivo ou observações
    if (vagoes.length === 0 && (usoExclusivo || observacoes)) {
      const combined = `${usoExclusivo} ${observacoes}`
      // Padrão: 02/09/2026|HTT-7538405-|CNT112 ou HTT-7538405 ou HTT 7538405
      const vagaoRegex = /\b([A-Z]{2,4})[- ]*(\d{5,8})\b/gi
      let vagMatch: RegExpExecArray | null
      while ((vagMatch = vagaoRegex.exec(combined)) !== null) {
        const serie = vagMatch[1].toUpperCase()
        const numero = vagMatch[2]
        const vagaoCompleto = `${serie}${numero}`
        vagoes.push({
          vagaoCompleto: `${serie}-${numero}`,
          vagaoNormalizado: normalizarVagao(vagaoCompleto),
          serie,
          numero,
          numeroApenas: extrairApenasDigitosVagao(numero),
        })
      }
    }

    return {
      tipoDoc: 'CTE',
      chaveAcesso,
      numero,
      serie,
      modelo,
      dataEmissao,
      expedidor: {
        nome: expedNome,
        cnpjCpf: expedCnpj,
        cnpjCpfFormatado: formatCnpj(expedCnpj),
        cnpjApenasDigitos: expedCnpj.replace(/\D/g, ''),
        ie: expedIe,
        municipio: expedMun,
        uf: expedUf,
        endereco: expedEnd,
      },
      remetente: rem
        ? {
            nome: getTag(rem, 'xNome'),
            cnpjCpf: getTag(rem, 'CNPJ') || getTag(rem, 'CPF'),
            municipio: rem.getElementsByTagName('enderReme')[0] ? getTag(rem.getElementsByTagName('enderReme')[0], 'xMun') : '',
            uf: rem.getElementsByTagName('enderReme')[0] ? getTag(rem.getElementsByTagName('enderReme')[0], 'UF') : '',
          }
        : undefined,
      destinatario: dest
        ? {
            nome: getTag(dest, 'xNome'),
            cnpjCpf: getTag(dest, 'CNPJ') || getTag(dest, 'CPF'),
            municipio: dest.getElementsByTagName('enderDest')[0] ? getTag(dest.getElementsByTagName('enderDest')[0], 'xMun') : '',
            uf: dest.getElementsByTagName('enderDest')[0] ? getTag(dest.getElementsByTagName('enderDest')[0], 'UF') : '',
          }
        : undefined,
      recebedor: recebf
        ? {
            nome: getTag(recebf, 'xNome'),
            cnpjCpf: getTag(recebf, 'CNPJ') || getTag(recebf, 'CPF'),
            municipio: recebf.getElementsByTagName('enderReceb')[0] ? getTag(recebf.getElementsByTagName('enderReceb')[0], 'xMun') : '',
            uf: recebf.getElementsByTagName('enderReceb')[0] ? getTag(recebf.getElementsByTagName('enderReceb')[0], 'UF') : '',
          }
        : undefined,
      vagoes,
      documentosOriginarios,
      usoExclusivoEmissor: usoExclusivo,
      observacoes,
      fileName,
      rawXml: xmlContent,
    }
  } catch (err) {
    console.error('Erro no parser XML de CT-e:', err)
    return null
  }
}

/**
 * Parser de DACTE (PDF de Conhecimento de Transporte Eletrônico) a partir de texto
 */
export function parseDacteFromText(rawText: string, fileName?: string): CteData {
  const text = rawText.replace(/\r\n/g, '\n')

  // 1. Chave de Acesso do CT-e (44 dígitos)
  let chaveAcesso = ''
  const chaveMatch = text.match(/(?:CHAVE\s+DE\s+ACESSO|CHAVE)[\s\S]{0,120}?(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/i)
  if (chaveMatch) {
    chaveAcesso = chaveMatch[1].replace(/\s+/g, '')
  } else {
    const raw44 = text.match(/\b(35\d{42}|[1-5]\d{43})\b/)
    if (raw44) chaveAcesso = raw44[1]
  }

  // 2. Modelo, Série, Número do CT-e
  let modelo = '57'
  let serie = ''
  let numero = ''

  const modMatch = text.match(/MODELO[\s:]*(\d{2})/i) || text.match(/\b57\b/)
  if (modMatch) modelo = modMatch[1] || '57'

  const serieMatch = text.match(/SÉRIE[\s:]*(\d+)/i) || text.match(/SERIE[\s:]*(\d+)/i)
  if (serieMatch) serie = serieMatch[1]

  const numMatch = text.match(/N[ÚU]MERO[\s:]*(\d+)/i) || text.match(/NRO\.?\s*DOCUMENTO[\s:]*(\d+)/i)
  if (numMatch) numero = numMatch[1]

  // Data de Emissão
  let dataEmissao = ''
  const dataMatch = text.match(/DATA\s+(?:E\s+HORA\s+)?DE\s+EMISS[ÃA]O[\s:]*([0-9/.\- :]{10,20})/i)
  if (dataMatch) dataEmissao = dataMatch[1].trim()

  // 3. EXPEDIDOR (CNPJ, Razão Social, Município, UF)
  let expedNome = ''
  let expedCnpj = ''
  let expedMun = ''
  let expedUf = ''
  let expedEnd = ''
  let expedIe = ''

  // Extração inteligente do Expedidor (Transbordo):
  // No DACTE o bloco EXPEDIDOR fica no quadro central à esquerda, abaixo de REMETENTE e acima de TOMADOR DO SERVIÇO.
  // Exemplos:
  // - CLI SUL S/A | PRADOPOLIS | 43.514.079/0003-43
  // - LDC - LOUIS DREYFUS | PEDERNEIRAS | 47.067.525/0145-91
  const expedIdx = text.search(/\bEXPEDIDOR\b/i)
  if (expedIdx !== -1) {
    // Pegar o trecho a partir de EXPEDIDOR até cerca de 800 caracteres
    const snippet = text.substring(expedIdx, expedIdx + 800)

    // Razão social do Expedidor
    const nomeM = snippet.match(/EXPEDIDOR\s*[:=-]?\s*([^\n\r]+)/i)
    if (nomeM) {
      expedNome = nomeM[1]
        .replace(/RECEBEDOR[\s\S]*$/i, '')
        .replace(/ENDERE[ÇC]O[\s\S]*$/i, '')
        .trim()
    }

    // CNPJ do Expedidor:
    // 1º Tentar padrão com label "CNPJ/CPF:" dentro do trecho do expedidor
    const cnpjComLabelM = snippet.match(/(?:CNPJ(?:\/CPF)?|CPF)\s*[:=-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/i)
    if (cnpjComLabelM) {
      expedCnpj = cnpjComLabelM[1].trim()
    } else {
      // 2º Tentar primeiro CNPJ formatado encontrado após a palavra EXPEDIDOR
      const allCnpjs = snippet.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)
      if (allCnpjs && allCnpjs.length > 0) {
        expedCnpj = allCnpjs[0]
      }
    }

    // Município do Expedidor
    const munM = snippet.match(/MUNIC[ÍI]PIO\s*[:=-]?\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+)(?=CEP|UF|INSCR|$)/i)
    if (munM) expedMun = munM[1].replace(/RECEBEDOR[\s\S]*$/i, '').trim()

    // UF do Expedidor
    const ufM = snippet.match(/\bUF\s*[:=-]?\s*([A-Z]{2})\b/i)
    if (ufM) expedUf = ufM[1].toUpperCase()

    // Inscrição Estadual do Expedidor
    const ieM = snippet.match(/INSCR(?:\.?\s*EST\.?|I[ÇC][ÃA]O\s+ESTADUAL)\s*[:=-]?\s*(\d+)/i)
    if (ieM) expedIe = ieM[1]
  }

  // Heurísticas de reforço para Transbordos Comuns (Pradópolis, Pederneiras, etc.)
  if (/PRAD[OÓ]POLIS/i.test(text) || /CLI\s*SUL/i.test(text) || /43\.?514\.?079\/?0003-?43/.test(text)) {
    if (!expedCnpj) expedCnpj = '43.514.079/0003-43'
    if (!expedNome) expedNome = 'CLI SUL S/A'
    if (!expedMun) expedMun = 'PRADOPOLIS'
    if (!expedUf) expedUf = 'SP'
  } else if (/PEDERNEIRAS/i.test(text) || /LOUIS\s*DREYFUS/i.test(text) || /LDC/i.test(text) || /47\.?067\.?525\/?0145-?91/.test(text)) {
    if (!expedCnpj) expedCnpj = '47.067.525/0145-91'
    if (!expedNome) expedNome = 'LDC - LOUIS DREYFUS'
    if (!expedMun) expedMun = 'PEDERNEIRAS'
    if (!expedUf) expedUf = 'SP'
  }

  // Fallback caso não tenha encontrado pelo bloco específico:
  if (!expedCnpj) {
    const directMatch = text.match(/EXPEDIDOR[\s\S]{0,350}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/i)
    if (directMatch) {
      expedCnpj = directMatch[1].trim()
    }
  }

  // 4. VAGÃO E SÉRIE DO VAGÃO (Uso Exclusivo do Emissor / Informações Ferroviárias)
  const vagoes: CteVagao[] = []
  let usoExclusivo = ''
  let observacoes = ''

  // Bloco USO EXCLUSIVO DO EMISSOR DO CT-e
  const usoExclusivoMatch = text.match(/USO\s+EXCLUSIVO\s+DO\s+EMISSOR\s+DO\s+CT-?E[\s\S]{1,300}?(?=RESERVADO\s+AO\s+FISCO|INFORMA[ÇC][ÕO]ES\s+ESPEC[ÍI]FICAS|OBSERVA[ÇC][ÕO]ES|$)/i)
  if (usoExclusivoMatch) {
    usoExclusivo = usoExclusivoMatch[0].replace(/USO\s+EXCLUSIVO\s+DO\s+EMISSOR\s+DO\s+CT-?E/i, '').trim()
  }

  // Bloco Observações
  const obsMatch = text.match(/OBSERVA[ÇC][ÕO]ES\s+GERAIS[\s\S]{1,800}?(?=INFORMA[ÇC][ÕO]ES\s+ESPEC[ÍI]FICAS|USO\s+EXCLUSIVO|$)/i)
  if (obsMatch) {
    observacoes = obsMatch[0].replace(/OBSERVA[ÇC][ÕO]ES\s+GERAIS/i, '').trim()
  }

  // Buscar padrões de vagão: "HTT-7538405", "HTT 7538405", "HTT7538405", "FPT-123456"
  const searchSources = [usoExclusivo, text, observacoes]
  const vagaoPattern = /\b([A-Z]{2,4})[- ]*(\d{5,8})\b/g

  for (const src of searchSources) {
    if (!src) continue
    let m: RegExpExecArray | null
    while ((m = vagaoPattern.exec(src)) !== null) {
      const serieCandidate = m[1].toUpperCase()
      const numeroCandidate = m[2]
      const vagaoCompleto = `${serieCandidate}${numeroCandidate}`
      const vagaoNormalizado = normalizarVagao(vagaoCompleto)
      const numeroApenas = extrairApenasDigitosVagao(numeroCandidate)

      // Evitar falsos positivos com siglas de estados ou palavras comuns
      if (['SP', 'RJ', 'MG', 'PR', 'RS', 'SC', 'MT', 'MS', 'GO', 'BA', 'DF', 'ES', 'BR', 'CE', 'PE'].includes(serieCandidate) && numeroCandidate.length < 6) {
        continue
      }

      if (!vagoes.some((v) => v.vagaoNormalizado === vagaoNormalizado || v.numeroApenas === numeroApenas)) {
        vagoes.push({
          vagaoCompleto: `${serieCandidate}-${numeroCandidate}`,
          vagaoNormalizado,
          serie: serieCandidate,
          numero: numeroCandidate,
          numeroApenas,
        })
      }
    }
  }

  // 5. DOCUMENTOS ORIGINÁRIOS (NF-es vinculadas)
  const documentosOriginarios: CteDocumentoOriginario[] = []

  // Extrair chaves de 44 dígitos no texto todo
  const all44Keys = text.match(/\b\d{44}\b/g) || []
  for (const key of all44Keys) {
    if (key !== chaveAcesso && !documentosOriginarios.some((d) => d.chaveNfe === key)) {
      documentosOriginarios.push({
        tipo: 'NFE',
        chaveNfe: key,
        numeroNfe: key.substring(25, 34).replace(/^0+/, ''),
        cnpjEmitente: key.substring(6, 20),
      })
    }
  }

  // Padrão em tabela DOCUMENTOS ORIGINÁRIOS: "NFE 08110543000173 001 000209966"
  const docOrigPattern = /NF-?E?\s+(\d{11,14})\s+(\d{1,4})\s+(\d{1,9})/gi
  let docM: RegExpExecArray | null
  while ((docM = docOrigPattern.exec(text)) !== null) {
    const cnpjEmit = docM[1]
    const serieDoc = docM[2]
    const numDoc = docM[3].replace(/^0+/, '')
    if (!documentosOriginarios.some((d) => d.numeroNfe === numDoc)) {
      documentosOriginarios.push({
        tipo: 'NFE',
        numeroNfe: numDoc,
        serieNfe: serieDoc,
        cnpjEmitente: cnpjEmit,
      })
    }
  }

  return {
    tipoDoc: 'DACTE',
    chaveAcesso,
    numero,
    serie,
    modelo,
    dataEmissao,
    expedidor: {
      nome: expedNome,
      cnpjCpf: expedCnpj,
      cnpjCpfFormatado: formatCnpj(expedCnpj),
      cnpjApenasDigitos: expedCnpj.replace(/\D/g, ''),
      ie: expedIe,
      municipio: expedMun,
      uf: expedUf,
      endereco: expedEnd,
    },
    vagoes,
    documentosOriginarios,
    usoExclusivoEmissor: usoExclusivo,
    observacoes,
    fileName,
    rawText: text,
  }
}

/**
 * Processador genérico de arquivo CT-e (aceita PDF ou XML em ArrayBuffer/string)
 */
export async function processCteFile(file: File): Promise<CteData | null> {
  const fileName = file.name
  const isXml = fileName.toLowerCase().endsWith('.xml')
  const isPdf = fileName.toLowerCase().endsWith('.pdf')

  if (isXml) {
    const text = await file.text()
    return parseCteXml(text, fileName)
  }

  if (isPdf) {
    const arrayBuffer = await file.arrayBuffer()
    const extracted = await extractPdfTextWithPdfJs(arrayBuffer)
    if (extracted && extracted.text) {
      return parseDacteFromText(extracted.text, fileName)
    }
  }

  return null
}
