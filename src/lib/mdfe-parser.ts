import { arrayBufferToBase64, extractPdfTextClientPure } from './client-pdf-parser'

export interface MdfeVagao {
  id: string
  serie: string
  numero: string
  vagaoCompleto: string // Ex: "HPT 250490" ou "250490"
  vagaoNormalizado: string // Ex: "HPT250490" (sem espaços/hífens)
  numeroApenas: string // Ex: "250490" (apenas dígitos)
  seq?: number
  tonUtil?: number // Em toneladas ou kg (ex: 91.04)
  tonUtilFormatado?: string // Ex: "91,040 t"
  origemArquivo?: string
}

export interface TremInfo {
  prefixo: string // Ex: "JDU9524"
  dataHora: string // Ex: "12/08/2026 18:19"
  origem: string // Ex: "ZXE"
  destino: string // Ex: "ICZ"
  qtdVagoesCarregados: number // Ex: 82
  qtdCte?: number // Ex: 89
  qtdNfe?: number
  pesoTotal?: number // Ex: 7850.34
  pesoTotalFormatado?: string
}

export interface MdfeData {
  tipoDoc: 'DAMDFE' | 'MDF-E'
  chaveAcesso: string
  numero: string
  serie: string
  modelo: string
  dataEmissao: string
  horaEmissao?: string
  protocolo?: string
  emitenteNome: string
  emitenteCnpj: string
  emitenteIe?: string
  emitenteUf?: string
  ufCarregamento?: string
  ufDescarregamento?: string
  trem: TremInfo
  vagoes: MdfeVagao[]
  chavesVinculadas: string[] // Chaves de CT-e ou NF-e listadas no MDF
  rawText?: string
  fileName?: string
}

export interface ExcelVagaoRow {
  rowIndex: number // Linha da planilha (1-indexed baseada no Excel)
  vagaoRaw: string // Conteúdo original da célula
  vagaoNormalizado: string // Sem espaços, hífens, uppercase
  numeroApenas: string // Apenas dígitos
  serie: string // Se extraída
  peso?: number
  pesoFormatado?: string
  dadosCompletos: Record<string, any>
}

export type StatusComparacao = 'CONFERIDO' | 'FALTA_NO_EXCEL' | 'FALTA_NO_MDF'

export interface ItemComparacao {
  id: string
  status: StatusComparacao
  vagaoMDF?: MdfeVagao
  vagaoExcel?: ExcelVagaoRow
  identificadorExibicao: string // Ex: "HPT 250490"
  numeroApenas: string
  serie?: string
  pesoMDF?: number
  pesoExcel?: number
  diferencaPeso?: number // pesoMDF - pesoExcel
  observacao?: string
}

export interface ResumoComparacao {
  totalMDF: number
  totalExcel: number
  totalConferidos: number
  totalFaltamExcel: number
  totalFaltamMDF: number
  percentualConferencia: number // Ex: 95.1%
  pesoTotalMDF: number
  pesoTotalExcel: number
  diferencaPesoTotal: number
}

// Removido setupPdfWorker - agora utiliza endpoint server-side estável e veloz

/**
 * Normaliza o identificador do vagão (remove espaços, hífens, pontuações, tudo em maiúsculo)
 */
export function normalizarVagao(val: string | number): string {
  if (val === null || val === undefined) return ''
  return String(val)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim()
}

/**
 * Extrai apenas os números do identificador do vagão
 */
export function extrairApenasDigitos(val: string | number): string {
  if (val === null || val === undefined) return ''
  const str = String(val).replace(/\D/g, '')
  // Remove zeros à esquerda excessivos se for um número de vagão (ex: 0250490 -> 250490)
  return str.replace(/^0+/, '') || str
}

/**
 * Extrai a série do vagão (letras iniciais se houver)
 */
export function extrairSerieVagao(val: string): string {
  if (!val) return ''
  const match = val.toUpperCase().match(/^([A-Z]{2,5})/)
  return match ? match[1] : ''
}

/**
 * Faz parse de texto de DAMDFE / MDF-e Ferroviário
 */
export function parseMdfeFromText(rawText: string, fileName?: string): MdfeData {
  const text = rawText.replace(/\r\n/g, '\n')

  // 1. Chave de Acesso (44 dígitos)
  let chaveAcesso = ''
  const chaveMatch = text.match(/(?:CHAVE\s+DE\s+ACESSO|CHAVE)[\s\S]{0,100}?(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/i)
  if (chaveMatch) {
    chaveAcesso = chaveMatch[1].replace(/\s+/g, '')
  } else {
    const raw44 = text.match(/\b(35\d{42}|[1-5]\d{43})\b/)
    if (raw44) chaveAcesso = raw44[1]
  }

  // 2. Modelo, Série, Número
  let modelo = '58'
  let serie = ''
  let numero = ''

  const modMatch = text.match(/MODELO\s*[:=-]?\s*(\d{2})/i) || text.match(/\b58\b/)
  if (modMatch) modelo = modMatch[1] || '58'

  const serieMatch = text.match(/SÉRIE\s*[:=-]?\s*(\d+)/i) || text.match(/SERIE\s*[:=-]?\s*(\d+)/i)
  if (serieMatch) serie = serieMatch[1]

  const numMatch = text.match(/NÚMERO\s*[:=-]?\s*(\d+)/i) || text.match(/NUMERO\s*[:=-]?\s*(\d+)/i)
  if (numMatch) numero = numMatch[1]

  // Se chave existe e número/série não foram achados, extrai da chave
  if (chaveAcesso && chaveAcesso.length === 44) {
    if (!modelo) modelo = chaveAcesso.substring(20, 22)
    if (!serie) serie = String(parseInt(chaveAcesso.substring(22, 25), 10))
    if (!numero) numero = String(parseInt(chaveAcesso.substring(25, 34), 10))
  }

  // 3. Data de Emissão e Protocolo
  let dataEmissao = ''
  let horaEmissao = ''
  const dtMatch = text.match(/DATA\s+E\s+HORA\s+DE\s+EMISS[ÃA]O[\s\S]{0,50}?(\d{2}\/\d{2}\/\d{4})\s*(\d{2}:\d{2}(?::\d{2})?)?/i)
  if (dtMatch) {
    dataEmissao = dtMatch[1]
    horaEmissao = dtMatch[2] || ''
  }

  let protocolo = ''
  const protMatch = text.match(/PROTOCOLO\s+DE\s+AUTORIZA[ÇC][ÃA]O(?:\s+DE\s+USO)?[\s\S]{0,50}?(\d{10,20})/i)
  if (protMatch) protocolo = protMatch[1]

  // 4. Emitente (MRS, Rumo, VLI, etc.)
  let emitenteNome = 'EMITENTE NÃO IDENTIFICADO'
  let emitenteCnpj = ''
  let emitenteIe = ''
  let emitenteUf = ''

  if (/MRS\s+LOGISTICA/i.test(text)) {
    emitenteNome = 'MRS LOGÍSTICA S/A'
  } else if (/RUMO\s+MALHA/i.test(text) || /RUMO\s+LOGISTICA/i.test(text)) {
    emitenteNome = 'RUMO LOGÍSTICA S/A'
  } else if (/VLI\s+MULTIMODAL/i.test(text) || /FERROVIA\s+CENTRO/i.test(text)) {
    emitenteNome = 'VLI MULTIMODAL S.A.'
  } else {
    const emitMatch = text.match(/^(?:[A-Z0-9\.\s-]{3,60})\s+(?:S\/A|LTDA|S\.A\.)/im)
    if (emitMatch) emitenteNome = emitMatch[0].trim()
  }

  const cnpjMatch = text.match(/CNPJ\s*[:=-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/i)
  if (cnpjMatch) emitenteCnpj = cnpjMatch[1].replace(/\D/g, '')

  const ieMatch = text.match(/IE\s*[:=-]?\s*(\d{8,14})/i)
  if (ieMatch) emitenteIe = ieMatch[1]

  const ufCarregMatch = text.match(/UF\s+Carreg\.?\s*([A-Z]{2})/i)
  const ufDescarMatch = text.match(/UF\s+Descar\.?\s*([A-Z]{2})/i)
  const ufCarregamento = ufCarregMatch ? ufCarregMatch[1].toUpperCase() : ''
  const ufDescarregamento = ufDescarMatch ? ufDescarMatch[1].toUpperCase() : ''

  // 5. Composição do Trem
  let prefixoTrem = ''
  let dataHoraTrem = ''
  let origemTrem = ''
  let destinoTrem = ''
  let qtdVagoesDeclarada = 0
  let qtdCte = 0
  let qtdNfe = 0
  let pesoTotal = 0

  const prefMatch = text.match(/Prefixo\s+do\s+trem[\s\S]{0,80}?([A-Z0-9]{3,12})/i)
  if (prefMatch) prefixoTrem = prefMatch[1].toUpperCase()

  const tremOrigMatch = text.match(/Origem\s+do\s+trem[\s\S]{0,80}?([A-Z0-9]{2,8})/i)
  if (tremOrigMatch) origemTrem = tremOrigMatch[1].toUpperCase()

  const tremDestMatch = text.match(/Destino\s+do\s+trem[\s\S]{0,80}?([A-Z0-9]{2,8})/i)
  if (tremDestMatch) destinoTrem = tremDestMatch[1].toUpperCase()

  const qtdVagMatch = text.match(/Quantidade\s+de\s+vag[õo]es\s+carregados[\s\S]{0,80}?(\d+)/i)
  if (qtdVagMatch) qtdVagoesDeclarada = parseInt(qtdVagMatch[1], 10)

  const cteMatch = text.match(/Qtd\.?\s*CT-e[\s\S]{0,50}?(\d+)/i)
  if (cteMatch) qtdCte = parseInt(cteMatch[1], 10)

  const nfeMatch = text.match(/Qtd\.?\s*NF-e[\s\S]{0,50}?(\d+)/i)
  if (nfeMatch) qtdNfe = parseInt(nfeMatch[1], 10)

  const pesoMatch = text.match(/Peso\s+Total\s*\((?:Kg|kg|Ton|ton)\)[\s\S]{0,80}?(\d{1,4}(?:\.\d{3})*,\d{2,4}|\d+(?:,\d+)?)/i)
  if (pesoMatch) {
    const rawPeso = pesoMatch[1].replace(/\./g, '').replace(',', '.')
    pesoTotal = parseFloat(rawPeso) || 0
  }

  // 6. Extração dos Vagões (Tabela de Informações dos vagões - 2 Colunas Paralelas no DAMDFE)
  const vagoes: MdfeVagao[] = []
  const vagoesMap = new Map<string, MdfeVagao>()

  // Restringir a busca de vagões a partir de "Informações dos vagões" ou "Série de ident." se possível
  let vagoesSection = text
  const vagoesHeaderIdx = text.search(/Informa[çc][õo]es\s+dos\s+vag[õo]es|S[ée]rie\s+de\s+ident\.?\s*vag[ãa]o|N[úu]mero\s+de\s+ident\.?\s*vag[ãa]o/i)
  if (vagoesHeaderIdx !== -1) {
    const obsIdx = text.search(/Observa[çc][ãa]o|Informa[çc][õo]es\s+Complementares|DADOS\s+ADICIONAIS/i)
    if (obsIdx > vagoesHeaderIdx) {
      vagoesSection = text.substring(vagoesHeaderIdx, obsIdx)
    } else {
      vagoesSection = text.substring(vagoesHeaderIdx)
    }
  }

  // Função auxiliar para cadastrar um vagão identificado
  const registrarVagao = (serieVag: string, numVag: string, seqNum?: number, tonUtil?: number) => {
    serieVag = (serieVag || '').toUpperCase().trim()
    numVag = (numVag || '').trim()

    // Ignora termos de cabeçalho ou siglas de estado se numVag for muito curto
    if (['FL', 'SP', 'RJ', 'MG', 'PR', 'SC', 'RS', 'GO', 'MS', 'MT', 'ES', 'BA', 'DF', 'SE', 'TO', 'PA'].includes(serieVag) && numVag.length < 5) {
      return
    }

    if (numVag.length < 4 || numVag.length > 10) return

    const numDigitos = extrairApenasDigitos(numVag)
    if (!numDigitos || numDigitos.length < 4) return

    // Chave única: preferencialmente série + número ou apenas número
    const key = serieVag ? `${serieVag}${numDigitos}` : numDigitos

    if (!vagoesMap.has(key)) {
      const vagCompleto = serieVag ? `${serieVag} ${numVag}` : numVag
      const item: MdfeVagao = {
        id: `mdf-vag-${vagoes.length + 1}`,
        serie: serieVag,
        numero: numVag,
        vagaoCompleto: vagCompleto,
        vagaoNormalizado: normalizarVagao(vagCompleto),
        numeroApenas: numDigitos,
        seq: seqNum || vagoes.length + 1,
        tonUtil,
        tonUtilFormatado: tonUtil !== undefined ? `${tonUtil.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t` : undefined,
        origemArquivo: fileName,
      }
      vagoesMap.set(key, item)
      vagoes.push(item)
    }
  }

  // PASSO A: Padrão MRS/Rumo/VLI com duas colunas lado a lado:
  // Ex: "HPT 250490 91,040" ou "HFS 6110860 74,720" ou com sequência "HPT 250490 1 91,040"
  const wagonRegexGlobal = /\b([A-Z]{2,5})\s*[-_/\s]?\s*(\d{4,8})(?:\s+(\d{1,4}))?\s+(\d{1,4}(?:[,\.]\d{1,4})?)/g
  let wMatch: RegExpExecArray | null

  while ((wMatch = wagonRegexGlobal.exec(vagoesSection)) !== null) {
    const serieVag = wMatch[1]
    const numVag = wMatch[2]
    const seqStr = wMatch[3]
    const tonStr = wMatch[4]
    const tonUtil = tonStr ? parseFloat(tonStr.replace(/\./g, '').replace(',', '.')) : undefined
    const seqNum = seqStr ? parseInt(seqStr, 10) : undefined

    registrarVagao(serieVag, numVag, seqNum, tonUtil)
  }

  // PASSO B: Caso haja linhas com Série e Número sem o peso na mesma linha ou formato compacto
  // Ex: "HPT 250490" ou "HFS6110860" ou "HTT-7537778"
  const serieNumRegex = /\b([A-Z]{2,5})\s*[-_/\s]?\s*(\d{5,8})\b/g
  while ((wMatch = serieNumRegex.exec(vagoesSection)) !== null) {
    const serieVag = wMatch[1]
    const numVag = wMatch[2]
    registrarVagao(serieVag, numVag)
  }

  // PASSO C: Caso a coluna "Número de ident. vagão" venha com números de 5 a 8 dígitos e pesos associados
  // Ex: "250490 91,040" ou "6110860 74,720"
  if (vagoes.length < 5) {
    const numPesoRegex = /\b(\d{5,8})\s+(\d{1,4}(?:[,\.]\d{1,4})?)\b/g
    while ((wMatch = numPesoRegex.exec(vagoesSection)) !== null) {
      const numVag = wMatch[1]
      const tonStr = wMatch[2]
      const tonUtil = tonStr ? parseFloat(tonStr.replace(/\./g, '').replace(',', '.')) : undefined
      registrarVagao('', numVag, undefined, tonUtil)
    }
  }

  // PASSO D: Se o PDF organizou os textos em colunas separadas (todas as séries juntas, depois todos os números)
  if (vagoes.length < 5) {
    // Procura todos os números de vagões (5 a 8 dígitos) no texto
    const allNums = Array.from(vagoesSection.matchAll(/\b(\d{5,8})\b/g)).map(m => m[1])
    // Filtra para remover anos (ex: 2026), CNPJ parcial, números de protocolo
    const cleanNums = allNums.filter(n => {
      if (n.length === 8 && (n.startsWith('19') || n.startsWith('20'))) return false // provável data
      if (n === '01417222' || n === '9352600989') return false
      return true
    })

    if (cleanNums.length >= 5) {
      cleanNums.forEach(num => {
        registrarVagao('', num)
      })
    }
  }

  // PASSO E: Se ainda não tiver extraído todos os vagões declarados, varre todo o documento
  if (vagoes.length === 0) {
    const lineRegex = /\b([A-Z]{2,5})\s*[-_/\s]?\s*(\d{5,8})\b/g
    while ((wMatch = lineRegex.exec(text)) !== null) {
      registrarVagao(wMatch[1], wMatch[2])
    }
  }

  // PASSO F: Fallback final para números de 6 ou 7 dígitos
  if (vagoes.length === 0) {
    const fallbackDigits = Array.from(text.matchAll(/\b(\d{6,7})\b/g)).map(m => m[1])
    fallbackDigits.forEach(num => {
      registrarVagao('', num)
    })
  }

  // 7. Chaves vinculadas (NF-e / CT-e em Observação)
  const chavesVinculadas: string[] = []
  const allChaves = text.match(/\b(35\d{42}|[1-5]\d{43})\b/g) || []
  for (const ch of allChaves) {
    if (ch !== chaveAcesso && !chavesVinculadas.includes(ch)) {
      chavesVinculadas.push(ch)
    }
  }

  return {
    tipoDoc: 'DAMDFE',
    chaveAcesso,
    numero,
    serie,
    modelo,
    dataEmissao,
    horaEmissao,
    protocolo,
    emitenteNome,
    emitenteCnpj,
    emitenteIe,
    emitenteUf,
    ufCarregamento,
    ufDescarregamento,
    trem: {
      prefixo: prefixoTrem,
      dataHora: dataHoraTrem,
      origem: origemTrem,
      destino: destinoTrem,
      qtdVagoesCarregados: qtdVagoesDeclarada || vagoes.length,
      qtdCte,
      qtdNfe,
      pesoTotal,
      pesoTotalFormatado: pesoTotal > 0 ? `${pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t` : undefined,
    },
    vagoes,
    chavesVinculadas,
    rawText: text,
    fileName,
  }
}

/**
 * Faz parse de MDF-e XML (<mdfeProc> ou <infMDFe>)
 */
export function parseMdfeFromXml(xmlContent: string, fileName?: string): MdfeData {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlContent, 'text/xml')

  const getText = (tag: string, parent: Element | Document = doc) => {
    const el = parent.getElementsByTagName(tag)[0]
    return el?.textContent?.trim() || ''
  }

  const infMDFe = doc.getElementsByTagName('infMDFe')[0] || doc.documentElement
  const chaveAcesso = infMDFe?.getAttribute('Id')?.replace(/\D/g, '') || getText('chMDFe')

  const ide = doc.getElementsByTagName('ide')[0]
  const modelo = getText('mod', ide) || '58'
  const serie = getText('serie', ide) || '1'
  const numero = getText('nMDF', ide) || ''
  const dhEmi = getText('dhEmi', ide)
  const dataEmissao = dhEmi ? dhEmi.substring(0, 10).split('-').reverse().join('/') : ''
  const horaEmissao = dhEmi && dhEmi.length > 11 ? dhEmi.substring(11, 16) : ''

  const emit = doc.getElementsByTagName('emit')[0]
  const emitenteNome = getText('xNome', emit) || 'EMITENTE NÃO IDENTIFICADO'
  const emitenteCnpj = getText('CNPJ', emit)
  const emitenteIe = getText('IE', emit)
  const emitenteUf = getText('UF', emit)

  // Informações Ferroviárias
  const tremEl = doc.getElementsByTagName('trem')[0]
  const prefixoTrem = getText('xPref', tremEl)
  const origemTrem = getText('xOri', tremEl)
  const destinoTrem = getText('xDest', tremEl)
  const qtdVagStr = getText('qVag', tremEl)
  const qtdVagoesDeclarada = qtdVagStr ? parseInt(qtdVagStr, 10) : 0

  const pesoTotalStr = getText('qCarga', doc)
  const pesoTotal = pesoTotalStr ? parseFloat(pesoTotalStr) : 0

  // Vagões
  const vagoes: MdfeVagao[] = []
  const vagElements = doc.getElementsByTagName('vag')

  for (let i = 0; i < vagElements.length; i++) {
    const vagEl = vagElements[i]
    const serieVag = getText('serie', vagEl) || getText('tpVag', vagEl) || ''
    const numVag = getText('nVag', vagEl) || ''
    const tonStr = getText('pesoBC', vagEl) || getText('pesoR', vagEl) || getText('pesoL', vagEl) || ''
    const tonUtil = tonStr ? parseFloat(tonStr) : undefined
    const seqStr = getText('seq', vagEl)

    if (numVag) {
      vagoes.push({
        id: `mdf-xml-vag-${i + 1}`,
        serie: serieVag.toUpperCase(),
        numero: numVag,
        vagaoCompleto: serieVag ? `${serieVag.toUpperCase()} ${numVag}` : numVag,
        vagaoNormalizado: normalizarVagao(`${serieVag}${numVag}`),
        numeroApenas: extrairApenasDigitos(numVag),
        seq: seqStr ? parseInt(seqStr, 10) : i + 1,
        tonUtil,
        tonUtilFormatado: tonUtil ? `${tonUtil.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t` : undefined,
        origemArquivo: fileName,
      })
    }
  }

  // Chaves vinculadas
  const chavesVinculadas: string[] = []
  const infDoc = doc.getElementsByTagName('infDoc')[0]
  if (infDoc) {
    const chCTeEls = infDoc.getElementsByTagName('chCTe')
    for (let i = 0; i < chCTeEls.length; i++) {
      const ch = chCTeEls[i]?.textContent?.trim()
      if (ch && !chavesVinculadas.includes(ch)) chavesVinculadas.push(ch)
    }
    const chNFeEls = infDoc.getElementsByTagName('chNFe')
    for (let i = 0; i < chNFeEls.length; i++) {
      const ch = chNFeEls[i]?.textContent?.trim()
      if (ch && !chavesVinculadas.includes(ch)) chavesVinculadas.push(ch)
    }
  }

  return {
    tipoDoc: 'MDF-E',
    chaveAcesso,
    numero,
    serie,
    modelo,
    dataEmissao,
    horaEmissao,
    protocolo: getText('nProt', doc),
    emitenteNome,
    emitenteCnpj,
    emitenteIe,
    emitenteUf,
    trem: {
      prefixo: prefixoTrem,
      dataHora: dhEmi || '',
      origem: origemTrem,
      destino: destinoTrem,
      qtdVagoesCarregados: qtdVagoesDeclarada || vagoes.length,
      pesoTotal,
      pesoTotalFormatado: pesoTotal > 0 ? `${pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 3 })} t` : undefined,
    },
    vagoes,
    chavesVinculadas,
    fileName,
  }
}

/**
 * Lê e analisa PDF de DAMDFE utilizando o serviço de extração de texto ou fallback local seguro
 */
export async function parseMdfePdfClient(fileOrBuffer: File | ArrayBuffer | Uint8Array, fileName: string): Promise<MdfeData> {
  let arrayBuffer: ArrayBuffer
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer()
  } else if (fileOrBuffer instanceof Uint8Array) {
    arrayBuffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    ) as ArrayBuffer
  } else {
    arrayBuffer = fileOrBuffer
  }

  const base64 = arrayBufferToBase64(arrayBuffer)

  try {
    const response = await fetch('/api/parse-pdf-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: base64, fileName }),
    })

    const contentType = response.headers.get('content-type') || ''
    if (response.ok && contentType.includes('application/json')) {
      const res = await response.json()
      if (res && res.text) {
        return parseMdfeFromText(res.text, fileName)
      }
    }
  } catch (apiErr) {
    console.warn('API /api/parse-pdf-text indisponível, usando extração local para MDF-e...', apiErr)
  }

  // Fallback nativo 100% no navegador (Vercel / SPA)
  const localRes = await extractPdfTextClientPure(arrayBuffer)
  return parseMdfeFromText(localRes.text || '', fileName)
}

/**
 * Executa a conciliação completa entre a lista de vagões do MDF-e e a lista do Excel
 */
export function executarComparacaoMdfeExcel(
  vagoesMdf: MdfeVagao[],
  vagoesExcel: ExcelVagaoRow[]
): {
  itens: ItemComparacao[]
  resumo: ResumoComparacao
} {
  const itens: ItemComparacao[] = []
  const excelUtilizados = new Set<number>() // Guarda rowIndex dos vagões do excel que já deram match

  // Mapas de busca rápida para o Excel
  // 1. Busca por normalizado exato (ex: "HPT250490")
  const excelByNorm = new Map<string, ExcelVagaoRow[]>()
  // 2. Busca por número apenas (ex: "250490")
  const excelByNumber = new Map<string, ExcelVagaoRow[]>()

  vagoesExcel.forEach((row) => {
    if (row.vagaoNormalizado) {
      if (!excelByNorm.has(row.vagaoNormalizado)) excelByNorm.set(row.vagaoNormalizado, [])
      excelByNorm.get(row.vagaoNormalizado)!.push(row)
    }
    if (row.numeroApenas) {
      if (!excelByNumber.has(row.numeroApenas)) excelByNumber.set(row.numeroApenas, [])
      excelByNumber.get(row.numeroApenas)!.push(row)
    }
  })

  // 1. Iterar sobre os vagões do MDF-e
  vagoesMdf.forEach((vagMdf) => {
    let matchExcel: ExcelVagaoRow | undefined

    // Passo A: Tentar match exato com normalizado
    if (vagMdf.vagaoNormalizado && excelByNorm.has(vagMdf.vagaoNormalizado)) {
      const candidates = excelByNorm.get(vagMdf.vagaoNormalizado)!
      matchExcel = candidates.find((c) => !excelUtilizados.has(c.rowIndex))
    }

    // Passo B: Tentar match apenas pelo número do vagão
    if (!matchExcel && vagMdf.numeroApenas && excelByNumber.has(vagMdf.numeroApenas)) {
      const candidates = excelByNumber.get(vagMdf.numeroApenas)!
      matchExcel = candidates.find((c) => !excelUtilizados.has(c.rowIndex))
    }

    if (matchExcel) {
      excelUtilizados.add(matchExcel.rowIndex)
      const pesoM = vagMdf.tonUtil
      const pesoE = matchExcel.peso
      const difPeso = pesoM !== undefined && pesoE !== undefined ? Number((pesoM - pesoE).toFixed(3)) : undefined

      itens.push({
        id: `match-${vagMdf.id}`,
        status: 'CONFERIDO',
        vagaoMDF: vagMdf,
        vagaoExcel: matchExcel,
        identificadorExibicao: vagMdf.vagaoCompleto,
        numeroApenas: vagMdf.numeroApenas,
        serie: vagMdf.serie || matchExcel.serie,
        pesoMDF: pesoM,
        pesoExcel: pesoE,
        diferencaPeso: difPeso,
        observacao: difPeso && Math.abs(difPeso) > 0.05 ? `Divergência de peso: ${difPeso > 0 ? '+' : ''}${difPeso} t` : 'OK (Conferido)',
      })
    } else {
      // Vagão presente no MDF mas NÃO encontrado no Excel
      itens.push({
        id: `missing-excel-${vagMdf.id}`,
        status: 'FALTA_NO_EXCEL',
        vagaoMDF: vagMdf,
        identificadorExibicao: vagMdf.vagaoCompleto,
        numeroApenas: vagMdf.numeroApenas,
        serie: vagMdf.serie,
        pesoMDF: vagMdf.tonUtil,
        observacao: 'Consta no MDF-e, mas não foi encontrado no arquivo Excel.',
      })
    }
  })

  // 2. Iterar sobre os vagões do Excel que NÃO deram match (Sobrando no Excel / Faltando no MDF)
  vagoesExcel.forEach((rowExcel) => {
    if (!excelUtilizados.has(rowExcel.rowIndex)) {
      itens.push({
        id: `missing-mdf-${rowExcel.rowIndex}`,
        status: 'FALTA_NO_MDF',
        vagaoExcel: rowExcel,
        identificadorExibicao: rowExcel.vagaoRaw,
        numeroApenas: rowExcel.numeroApenas,
        serie: rowExcel.serie,
        pesoExcel: rowExcel.peso,
        observacao: `Consta na Linha ${rowExcel.rowIndex} do Excel, mas não está manifestado no MDF-e.`,
      })
    }
  })

  // Cálculos do Resumo
  const totalMDF = vagoesMdf.length
  const totalExcel = vagoesExcel.length
  const totalConferidos = itens.filter((i) => i.status === 'CONFERIDO').length
  const totalFaltamExcel = itens.filter((i) => i.status === 'FALTA_NO_EXCEL').length
  const totalFaltamMDF = itens.filter((i) => i.status === 'FALTA_NO_MDF').length

  const percentualConferencia = totalMDF > 0 ? Number(((totalConferidos / totalMDF) * 100).toFixed(1)) : 0

  const pesoTotalMDF = vagoesMdf.reduce((acc, v) => acc + (v.tonUtil || 0), 0)
  const pesoTotalExcel = vagoesExcel.reduce((acc, v) => acc + (v.peso || 0), 0)
  const diferencaPesoTotal = Number((pesoTotalMDF - pesoTotalExcel).toFixed(3))

  const resumo: ResumoComparacao = {
    totalMDF,
    totalExcel,
    totalConferidos,
    totalFaltamExcel,
    totalFaltamMDF,
    percentualConferencia,
    pesoTotalMDF: Number(pesoTotalMDF.toFixed(3)),
    pesoTotalExcel: Number(pesoTotalExcel.toFixed(3)),
    diferencaPesoTotal,
  }

  return { itens, resumo }
}
