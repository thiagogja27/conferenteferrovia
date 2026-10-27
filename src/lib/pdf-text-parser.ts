import { sanitizeDestinatarioNome, isCarrierCnpj } from './destinatario-utils';
import { getExplicitGuarujaTerminalCode, isUltrafertil, extractTerminalFromDeliveryRule } from './terminal-utils';
import { resolveDestinatarioCadastro } from './cadastros-logisticos-service';

const DANFE_HEADER_REGEX = /\bDANFE\b|DOCUMENTO AUXILIAR\s+(?:DA|DE)\s+(?:NOTA(?:\s+FISCAL)?|NF-?E)/i;

export interface ParsedNFeData {
  chave: string;
  nNF: string;
  serie: string;
  cUF: string;
  cNF: string;
  cDV: string;
  natOp: string;
  dhEmi: string;
  emitCNPJ: string;
  emitNome: string;
  emitFant: string;
  emitIE: string;
  emitLgr: string;
  emitNro: string;
  emitBairro: string;
  emitMun: string;
  emitUF: string;
  emitCEP: string;
  emitFone: string;
  
  destCNPJ: string;
  destNome: string;
  destLgr: string;
  destNro: string;
  destBairro: string;
  destMun: string;
  destUF: string;
  destCEP: string;
  destIE: string;

  prodCodigo: string;
  prodNome: string;
  prodNCM: string;
  prodCFOP: string;
  prodUCom: string;
  prodQCom: number;
  prodVUnCom: number;
  prodVProd: number;

  vBC: string;
  vICMS: string;
  vProd: string;
  vFrete: string;
  vSeg: string;
  vDesc: string;
  vOutro: string;
  vNF: string;

  transpCNPJ: string;
  transpNome: string;
  transpIE: string;
  transpEnder: string;
  transpMun: string;
  transpUF: string;
  transpQVol: string;
  transpEsp: string;
  transpPesoL: string;
  transpPesoB: string;

  infCpl: string;
  terminalEntrega: string;
  transbordo: string;
  retirada: string;
  rawSnippet?: string;
}

export interface PDFDanfeItem {
  xml: string;
  fileName: string;
  parsedData: ParsedNFeData;
}

export function cleanNumeric(str: string): string {
  if (!str) return '0.00';
  const trimmed = str.trim();
  if (trimmed.includes(',') && trimmed.includes('.')) {
    return trimmed.replace(/\./g, '').replace(',', '.');
  }
  if (trimmed.includes(',')) {
    return trimmed.replace(',', '.');
  }
  return trimmed;
}

export function formatCNPJStr(cnpj: string): string {
  if (!cnpj) return '';
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

/**
  Valida se uma string de 44 dígitos numéricos atende a estrutura de uma Chave de Acesso NFe/CTe/NFCe
 */
export function isValidNFeKey(key: string): boolean {
  if (!key) return false;
  const digits = key.replace(/\D/g, '');
  if (digits.length !== 44) return false;

  // Valida UF (primeiros 2 dígitos) - Códigos de UF válidos do IBGE
  const uf = parseInt(digits.substring(0, 2), 10);
  const validUFs = [11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 35, 41, 42, 43, 50, 51, 52, 53];
  if (!validUFs.includes(uf)) return false;

  // Valida Modelo (dígitos 20 e 21) - Mod: 55 (NF-e), 65 (NFC-e), 57 (CT-e), 11, 67
  const mod = digits.substring(20, 22);
  const validMods = ['55', '65', '57', '11', '67'];
  if (!validMods.includes(mod)) return false;

  return true;
}

/**
  Encontra todas as Chaves de Acesso de 44 dígitos no texto extraído do PDF
 */
export function findKeysInText(text: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const addKey = (k: string) => {
    if (!k) return;
    const digits = k.replace(/\D/g, '');
    if (digits.length === 44 && !seen.has(digits) && isValidNFeKey(digits)) {
      seen.add(digits);
      keys.push(digits);
    }
  };

  if (!text) return keys;

  const clean = text.replace(/\s+/g, ' ');

  // 1. Procura preferencial no bloco "CHAVE DE ACESSO" ou "CHAVE" ou "CÓDIGO DE BARRAS"
  const matches1 = Array.from(clean.matchAll(/(?:CHAVE DE ACESSO|Chave de Acesso|CHAVE|CÓDIGO DE BARRAS|CODIGO DE BARRAS)[^\d]{0,80}((?:[0-9][\s\.\-]*){44})/gi));
  for (const m of matches1) {
    addKey(m[1]);
  }

  // 2. Chaves com 11 grupos de 4 dígitos separados por espaço, ponto ou traço
  // Ex: 5126 0760 4987 0600 3849 5505 0000 1313 3010 8421 9537
  const m2 = text.match(/\b(?:\d{4}[\s\.\-]+){10}\d{4}\b/g) || [];
  for (const matchStr of m2) {
    addKey(matchStr);
  }

  // 3. Chaves com 44 dígitos contínuos
  const m3 = text.match(/\b\d{44}\b/g) || [];
  for (const k of m3) {
    addKey(k);
  }

  // 4. Fallback: procurar qualquer sequência de 44 dígitos caso nenhuma tenha sido encontrada ainda
  if (keys.length === 0) {
    const m4 = text.match(/(?:\d[\s\.\-]*){44}/g) || [];
    for (const matchStr of m4) {
      addKey(matchStr);
    }
  }

  return keys;
}

/**
  Analisa um arquivo PDF que pode conter uma ou MÚLTIPLAS notas fiscais
 */
export function parseMultiDanfePdf(
  fullText: string,
  defaultFileName: string,
  pagesText?: Array<{ num: number; text: string }>
): { items: PDFDanfeItem[]; xml: string; data: ParsedNFeData } {
  const baseName = defaultFileName ? defaultFileName.replace(/\.pdf$/i, '') : 'nota';
  const allDocKeys = findKeysInText(fullText || '');

  if (!pagesText?.length && allDocKeys.length === 0 && !DANFE_HEADER_REGEX.test(fullText || '')) {
    throw new Error('O PDF informado não apresenta uma página de DANFE/NF-e e foi ignorado.');
  }

  // 1. Estratégia Principal: Agrupamento Inteligente por Páginas com Detecção de DANFE x DCL/Romaneio
  if (pagesText && pagesText.length > 0) {
    const groupedItems: { key: string; pagesText: string[] }[] = [];
    let currentGroup: { key: string; pagesText: string[] } | null = null;

    for (let pIdx = 0; pIdx < pagesText.length; pIdx++) {
      const page = pagesText[pIdx];
      const pText = page.text || '';
      const pageKeys = findKeysInText(pText);
      const isDCL = /\bDCL\b/i.test(pText) && /Documento de Carga|Fluxo Comercial|Rumo/i.test(pText);
      const isRomaneio = /Notas Fiscais Carregadas|Romaneio|Ticket de Pesagem/i.test(pText);
      const isDanfe = DANFE_HEADER_REGEX.test(pText) ||
        /(?:CHAVE DE ACESSO|DADOS DO PRODUTO|CÁLCULO DO IMPOSTO|DESTINATÁRIO\s*\/?\s*REMETENTE|DESTINATARIO\s*\/?\s*REMETENTE|Nº\s*\d{3}\.\d{3}\.\d{3})/i.test(pText);

      if (isDCL || isRomaneio) {
        // Folha de documento complementar / manifesto
        let attached = false;
        for (const g of groupedItems) {
          if (g.key && pageKeys.includes(g.key)) {
            g.pagesText.push(pText);
            attached = true;
          }
        }
        if (!attached && currentGroup) {
          currentGroup.pagesText.push(pText);
        }
        continue;
      }

      // Se a página contém Chave(s) de Acesso de 44 dígitos
      if (pageKeys.length > 0) {
        const firstKey = pageKeys[0];
        // Se já existe um grupo ativo e a chave é DIFERENTE da anterior:
        if (currentGroup && currentGroup.key && currentGroup.key !== firstKey) {
          // É uma nova nota fiscal!
          currentGroup = { key: firstKey, pagesText: [pText] };
          groupedItems.push(currentGroup);
        } else if (currentGroup && currentGroup.key === firstKey) {
          // É folha de continuação da mesma nota que repete a chave no cabeçalho
          currentGroup.pagesText.push(pText);
        } else {
          // Início do primeiro grupo ou grupo sem chave
          currentGroup = { key: firstKey, pagesText: [pText] };
          groupedItems.push(currentGroup);
        }
      } else {
        // Página sem Chave de Acesso explícita de 44 dígitos
        // Pode ser folha de continuação (itens/produtos) ou uma nova DANFE cujo código não foi extraído
        if (isDanfe && (!currentGroup || /(?:DANFE\b|DOCUMENTO AUXILIAR\s+(?:DA|DE)\s+NOTA)/i.test(pText))) {
          if (!currentGroup) {
            currentGroup = { key: '', pagesText: [pText] };
            groupedItems.push(currentGroup);
          } else {
            // Verificar se indica um novo número de nota fiscal diferente da nota anterior
            const nNFMatch = pText.match(/(?:Nº|N[úu]mero)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+|\d{3,9})/i);
            const prevText = currentGroup.pagesText.join(' ');
            const prevNFMatch = prevText.match(/(?:Nº|N[úu]mero)\s*[:.]?\s*(\d{1,3}(?:\.\d{3})+|\d{3,9})/i);
            if (nNFMatch && prevNFMatch && nNFMatch[1] !== prevNFMatch[1]) {
              currentGroup = { key: '', pagesText: [pText] };
              groupedItems.push(currentGroup);
            } else {
              currentGroup.pagesText.push(pText);
            }
          }
        } else if (currentGroup) {
          // Continuação de dados da nota atual
          currentGroup.pagesText.push(pText);
        } else {
          currentGroup = { key: '', pagesText: [pText] };
          groupedItems.push(currentGroup);
        }
      }
    }

    // Se há chaves únicas no documento que não ganharam um grupo próprio:
    if (allDocKeys.length > groupedItems.length && allDocKeys.length > 1) {
      const assignedKeys = new Set(groupedItems.map(g => g.key).filter(Boolean));
      for (const docKey of allDocKeys) {
        if (!assignedKeys.has(docKey)) {
          const matchingPages = pagesText.filter(p => {
            const raw = (p.text || '').replace(/\D/g, '');
            return raw.includes(docKey) || findKeysInText(p.text || '').includes(docKey);
          });
          if (matchingPages.length > 0) {
            groupedItems.push({
              key: docKey,
              pagesText: matchingPages.map(p => p.text),
            });
            assignedKeys.add(docKey);
          }
        }
      }
    }

    // Se conseguimos agrupar com sucesso e não há discrepância grave com chaves
    if (groupedItems.length > 1 || (groupedItems.length === 1 && allDocKeys.length <= 1)) {
      const items: PDFDanfeItem[] = [];
      for (let i = 0; i < groupedItems.length; i++) {
        const group = groupedItems[i];
        const combinedText = group.pagesText.join('\n\n--- PAGINA ---\n\n');
        const key = group.key || findKeysInText(combinedText)[0] || '';
        const { xml, data } = parseDanfeText(combinedText, defaultFileName, key);
        const fileName = `${baseName}_NF_${data.nNF || (i + 1)}.xml`;
        items.push({ xml, fileName, parsedData: data });
      }

      if (items.length > 0) {
        return {
          items,
          xml: items[0].xml,
          data: items[0].parsedData,
        };
      }
    }
  }

  // 2. Estratégia Secundária (Fallback / Segmentação por Chaves no Texto Bruto)
  const keys = allDocKeys.length > 0 ? allDocKeys : findKeysInText(fullText);

  if (keys.length <= 1) {
    const single = parseDanfeText(fullText, defaultFileName, keys[0]);
    const cleanName = defaultFileName ? defaultFileName.replace(/\.pdf$/i, '.xml') : 'convertido.xml';
    return {
      items: [{ xml: single.xml, fileName: cleanName, parsedData: single.data }],
      xml: single.xml,
      data: single.data,
    };
  }

  // Para PDFs com múltiplas notas no mesmo texto
  const items: PDFDanfeItem[] = [];

  const findKeyPos = (k: string) => {
    let pos = fullText.indexOf(k);
    if (pos !== -1) return pos;

    try {
      const pattern = k.split('').join('[\\s\\.\\-]*');
      const reg = new RegExp(pattern, 'i');
      const match = reg.exec(fullText);
      if (match) return match.index;
    } catch (e) {}

    const sub = k.substring(0, 8);
    return fullText.indexOf(sub);
  };

  const keyPositions = keys
    .map((k) => ({ key: k, pos: findKeyPos(k) }))
    .filter((kp) => kp.pos !== -1)
    .sort((a, b) => a.pos - b.pos);

  if (keyPositions.length === 0) {
    const single = parseDanfeText(fullText, defaultFileName, keys[0]);
    const cleanName = defaultFileName ? defaultFileName.replace(/\.pdf$/i, '.xml') : 'convertido.xml';
    return {
      items: [{ xml: single.xml, fileName: cleanName, parsedData: single.data }],
      xml: single.xml,
      data: single.data,
    };
  }

  for (let i = 0; i < keyPositions.length; i++) {
    const current = keyPositions[i];
    const prev = keyPositions[i - 1];
    const next = keyPositions[i + 1];

    let start = 0;
    if (i > 0 && prev) {
      start = current.pos > 1000 ? current.pos - 500 : Math.floor((prev.pos + current.pos) / 2);
    }

    let end = fullText.length;
    if (next) {
      end = Math.floor((current.pos + next.pos) / 2);
    }

    const chunkText = fullText.substring(Math.max(0, start), end);
    const { xml, data } = parseDanfeText(chunkText, defaultFileName, current.key);
    const fileName = `${baseName}_NF_${data.nNF || (i + 1)}.xml`;
    items.push({ xml, fileName, parsedData: data });
  }

  return {
    items,
    xml: items[0].xml,
    data: items[0].parsedData,
  };
}

export function parseDanfeText(text: string, defaultFileName: string = '', forcedKey?: string): { xml: string; data: ParsedNFeData } {
  // Separar números/valores que ficaram grudados em sequências de 14 dígitos (como no layout Copersucar em PDF)
  text = text.replace(/(\d+,\d{2})(\d{14})/g, '$1 $2');
  const cleanText = text.replace(/\s+/g, ' ');

  // 1. Chave de acesso: 44 dígitos
  let chave = forcedKey || '';
  if (!chave || chave.length !== 44) {
    const foundKeys = findKeysInText(text);
    if (foundKeys.length > 0) {
      chave = foundKeys[0];
    }
  }

  // Tentar encontrar CNPJ emitente no texto para síntese de chave caso não tenha encontrado 44 dígitos
  let foundEmitCNPJInText = '';
  const cnpjMatchInText = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || text.match(/\b\d{14}\b/);
  if (cnpjMatchInText) {
    foundEmitCNPJInText = cnpjMatchInText[0].replace(/\D/g, '');
  }

  if (chave.length !== 44) {
    const cnpj = foundEmitCNPJInText.length === 14 ? foundEmitCNPJInText : '62359529000153';
    chave = `352607${cnpj}550010000025231000053124`;
  }

  // Dissecando a Chave de Acesso
  // Na regra do SEFAZ:
  // pos  0..2  : cUF (ex: 35)
  // pos  2..6  : AAMM (ex: 2607)
  // pos  6..20 : CNPJ Emitente (14 dígitos)
  // pos 20..22 : mod (ex: 55)
  // pos 22..25 : serie (ex: 001)
  // pos 25..34 : nNF (ex: 000002523 -> 2523)
  // pos 34..43 : cNF (ex: 100005312)
  // pos 43     : cDV
  const cUF = chave.substring(0, 2) || '35';
  const emitCNPJRaw = chave.substring(6, 20); // GARANTE 100% de sincronismo com a Chave!
  const emitCNPJ = formatCNPJStr(emitCNPJRaw);
  const serie = parseInt(chave.substring(22, 25) || '1', 10).toString();
  const nNF = parseInt(chave.substring(25, 34) || '1', 10).toString();
  const cNF = chave.substring(34, 43) || '00053124';
  const cDV = chave.substring(43) || '0';

  // 2. Natureza da Operação
  let natOp = 'REM.P/FORMACAO LOTE - EXPORTACAO';
  const natOpMatch = text.match(/(?:NATUREZA DA OPERAÇÃO|NATUREZA DA OPERACAO)[^\w]{1,10}([A-ZÀ-Ú0-9\s\.\-]{4,80})/i);
  if (natOpMatch) {
    natOp = natOpMatch[1].trim().replace(/\s+-$/, '');
  }

  // 3. Emitente
  let emitNome = '';
  const reciboMatch = cleanText.match(/RECEBEMOS\s+DE\s+([A-ZÀ-Ú0-9\s\.\,\-\/&]{3,80}?)\s+(?:OS PRODUTOS|DANFE|NF-e|CNPJ)/i);
  if (reciboMatch) {
    emitNome = reciboMatch[1].trim().replace(/[:=\-.,;]+$/, '').trim();
  }

  // Verificar se o nome capturado é ruído de cabeçalho do formulário
  const isBoilerplate = (n: string) => !n || n.length < 4 ||
    /^(?:INSCRI[ÇC][ÃA]O|IDENTIFICA[ÇC][ÃA]O|DOCUMENTO|DANFE|EMPRESA EMITENTE|SUBST|TRIBUT|CHAVE|PROTOCOLO|-?ENTRADA|-?SA[IÍ]DA|S[EÉ]RIE|DOC\s*AUX|FOLHA|FL\b)/i.test(n) ||
    /DOCUMENTOAUXILIAR|SAÍDADAC|-ENTRADA1-SAÍDA/i.test(n);

  if (isBoilerplate(emitNome)) {
    // Buscar pelo CNPJ do emitente (raiz) ou no texto fiscal antes dos dados adicionais
    // para não confundir com municípios e terminais citados nas observações/infCpl
    if (emitCNPJRaw.startsWith('61149589') || /USINA SAO JOSE|Cooperativa Prod/i.test(cleanText.substring(0, 800))) {
      emitNome = 'COOPERATIVA PROD DE CANA-DE-ACUCAR (USINA SAO JOSE)';
    } else if (emitCNPJRaw.startsWith('60498706') || /CARGILL/i.test(cleanText.substring(0, 800))) {
      emitNome = 'CARGILL AGRICOLA SA';
    } else if (emitCNPJRaw.startsWith('47067525') || /LOUIS\s*DREYFUS|LDC\b/i.test(cleanText.substring(0, 800))) {
      emitNome = 'LOUIS DREYFUS COMPANY BRASIL S.A.';
    } else if (emitCNPJRaw.startsWith('51843514')) {
      emitNome = 'TIETE AGROINDUSTRIAL S.A.';
    } else if (emitCNPJRaw.startsWith('43545284')) {
      emitNome = 'ALCOESTE BIOENERGIA FERNANDOPOLIS S/A';
    } else if (emitCNPJRaw.startsWith('12229415')) {
      emitNome = 'S/A USINA CORURIPE ACUCAR E ALCOOL';
    } else if (emitCNPJRaw.startsWith('51466860')) {
      emitNome = 'USINA SAO MARTINHO S/A';
    } else if (emitCNPJRaw.startsWith('60643236')) {
      emitNome = 'COPERSUCAR S.A.';
    } else {
      const topMatch = cleanText.match(/([A-ZÀ-Ú0-9\s\.\-&]{5,70})\s+DANFE/i);
      if (topMatch && !isBoilerplate(topMatch[1].trim())) {
        emitNome = topMatch[1].trim();
      } else {
        const emitMatchBeforeNat = cleanText.match(/([A-ZÀ-Ú0-9\s\.\-&]{5,70})\s+(?:NATUREZA DA OPERAÇÃO|NATUREZA DA OPERACAO)/i);
        if (emitMatchBeforeNat && !isBoilerplate(emitMatchBeforeNat[1].trim())) {
          emitNome = emitMatchBeforeNat[1].trim();
        } else {
          emitNome = 'COOPERATIVA / USINA EMITENTE';
        }
      }
    }
  }

  let emitIE = '';
  const emitIEMatch = text.match(/(?:INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|INSC\.?\s*ESTADUAL|I\.E\.|IE)[^\d]{1,15}(\d{8,15})/i);
  if (emitIEMatch) {
    emitIE = emitIEMatch[1].trim();
  }

  // 4. Destinatário
  let destCNPJ = '';
  let destNome = '';
  let destIE = '';

  // Isolar o texto estritamente fiscal antes de DADOS ADICIONAIS / INFORMAÇÕES COMPLEMENTARES
  // Isso impede categoricamente que CNPJ de terminal portuário, armazém, operador ou cliente logístico citado
  // nos dados adicionais seja indevidamente assumido como o CNPJ do Destinatário da nota.
  const dadosAdicionaisIdx = text.search(/(?:INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|INFORMAC[ÕO]ES\s+COMPLEMENTARES|INFORMACOES\s+COMPLEMENTARES|DADOS\s+ADICIONAIS|INF\.\s*CONTRIBUINTE|RESERVADO\s+AO\s+FISCO)/i);
  const textFiscal = dadosAdicionaisIdx > 0 ? text.substring(0, dadosAdicionaisIdx) : text;

  // Bloco de transportador para identificar e ignorar o CNPJ da transportadora
  let transpBlockCNPJ = '';
  const transpAdjacentMatch = textFiscal.match(/(?:TRANSPORTES?|LOGISTICA|CARGAS?)[\s\S]{0,80}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{14})/i);
  if (transpAdjacentMatch) {
    const candidateTransp = transpAdjacentMatch[1].replace(/\D/g, '');
    if (candidateTransp !== emitCNPJRaw) {
      transpBlockCNPJ = candidateTransp;
    }
  }

  if (!transpBlockCNPJ) {
    const transpBlockMatch = textFiscal.match(/(?:TRANSPORTADOR\s*\/?\s*VOLUMES\s+TRANSPORTADOS|TRANSPORTADOR|DADOS\s+DO\s+TRANSPORTE)([\s\S]{1,600})/i);
    if (transpBlockMatch) {
      const allCnpjs = transpBlockMatch[1].match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g) || [];
      for (const m of allCnpjs) {
        const candidateTransp = m.replace(/\D/g, '');
        if (candidateTransp !== emitCNPJRaw) {
          transpBlockCNPJ = candidateTransp;
          break;
        }
      }
    }
  }

  // Identificar explicitamente CNPJs de LOCAL DE RETIRADA e LOCAL DE ENTREGA para NUNCA confundi-los com o Destinatário da NF-e
  let retiradaCNPJ = '';
  const retMatch = textFiscal.match(/(?:INF\.?\s*DO\s*LOCAL\s*DE\s*RETIRADA|LOCAL\s*DE\s*RETIRADA)[\s\S]{0,200}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{14}\b)/i);
  if (retMatch) {
    retiradaCNPJ = retMatch[1].replace(/\D/g, '');
  }

  let entregaCNPJ = '';
  const entMatch = textFiscal.match(/(?:INF\.?\s*DO\s*LOCAL\s*DE\s*ENTREGA|LOCAL\s*DE\s*ENTREGA)[\s\S]{0,200}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{14}\b)/i);
  if (entMatch) {
    entregaCNPJ = entMatch[1].replace(/\D/g, '');
  }

  // Em alguns DANFEs o título DESTINATÁRIO/REMETENTE é impresso na vertical.
  // O extrator pode devolver uma letra por linha, então normalizamos apenas esse rótulo antes de procurar o bloco.
  const recipientTextForMatching = textFiscal
    .replace(/D\s*E\s*S\s*T\s*I\s*N\s*A\s*T\s*[ÁA]\s*R\s*I\s*O\s*[\/-]?\s*R\s*E\s*M\s*E\s*T\s*E\s*N\s*T\s*E/gi, 'DESTINATÁRIO/REMETENTE')
    .replace(/R\s*E\s*M\s*E\s*T\s*E\s*N\s*T\s*E\s*[\/-]?\s*D\s*E\s*S\s*T\s*I\s*N\s*A\s*T\s*[ÁA]\s*R\s*I\s*O/gi, 'REMETENTE/DESTINATÁRIO');

  const destBlockMatch = recipientTextForMatching.match(/(?:DESTINAT[AÁ]RIO\s*[\/\-]\s*REMETENTE|REMETENTE\s*[\/\-]\s*DESTINAT[AÁ]RIO|DADOS\s+DO\s+DESTINAT[AÁ]RIO|DADOS\s+DO\s+REMETENTE|DESTINAT[AÁ]RIO|DESTINATARIO)([\s\S]+)/i);
  if (destBlockMatch) {
    const rawBlock = destBlockMatch[1];
    // Delimitar com rigor o bloco do destinatário antes de qualquer outra seção da DANFE
    const endBlockIdx = rawBlock.search(/(?:INF\.?\s*DO\s*LOCAL\s*DE\s*RETIRADA|LOCAL\s*DE\s*RETIRADA|INF\.?\s*DO\s*LOCAL\s*DE\s*ENTREGA|LOCAL\s*DE\s*ENTREGA|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|DADOS\s+ADICIONAIS|TRANSPORTADOR|DADOS\s+DO\s+TRANSPORTE|VOLUMES\s+TRANSPORTADOS|C[ÁA]LCULO\s+DO\s+IMPOSTO|CALCULO\s+DO\s+IMPOSTO)/i);
    const block = endBlockIdx > 0 ? rawBlock.substring(0, endBlockIdx) : rawBlock;

    // Extrair Inscrição Estadual específica do destinatário no bloco
    const destIEMatch = block.match(/(?:INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|INSC\.?\s*ESTADUAL|I\.E\.|IE)[^\d]{1,15}(\d{8,15})/i);
    if (destIEMatch) {
      destIE = destIEMatch[1].trim();
    }

    // Extrair Nome / Razão Social do Destinatário
    const nameMatch = block.match(/(?:NOME\s*\/\s*RAZÃO\s*SOCIAL|NOME\s*RAZAO\s*SOCIAL|RAZÃO\s*SOCIAL|RAZAO\s*SOCIAL|NOME)?[\s\n\r:-]*([A-ZÀ-Ú0-9\s\.\,\-\/&]{3,80})/i);
    if (nameMatch) {
      let raw = nameMatch[1].trim();
      const stopIdx = raw.search(/(?:AVENIDA|AV\.|RUA|ROD|RODOVIA|ALAMEDA|ESTRADA|PRACA|PRAÇA|ENDEREÇO|ENDEREC|BAIRRO|CNPJ|CPF|CEP|MUNICÍPIO|MUNICIPIO|UF|FONE|TELEFONE|INSCRIÇÃO|INSCRICAO|DATA|ENTRADA|SAIDA|SAÍDA|INSC|FASE|CÓDIGO|CODIGO)/i);
      if (stopIdx > 0) {
        raw = raw.substring(0, stopIdx).trim();
      }
      const candidate = raw.replace(/[:=\-.,;]+$/, '').trim();
      if (candidate && candidate.length > 2 && !/^(?:NOME|RAZ[ÃA]O|SOCIAL|DESTINAT[AÁ]RIO|REMETENTE)/i.test(candidate)) {
        destNome = candidate;
      }
    } else {
      // Fallback: pegar as primeiras linhas não vazias do bloco de destinatário que não sejam rótulos
      const blockLines = block.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 3);
      for (const line of blockLines) {
        if (!/^(?:DESTINAT|REMETENT|ENDERE|BAIRRO|MUNIC|CNPJ|CPF|CEP|INSC|UF|TELEFONE|FONE|DATA|CÁLCULO|CALCULO|VALOR)/i.test(line)) {
          const stopIdx = line.search(/(?:ROD|RODOVIA|RUA|AV|AVENIDA|ALAMEDA|CNPJ|CPF|CEP)/i);
          const candidateLine = (stopIdx > 0 ? line.substring(0, stopIdx) : line).trim();
          if (candidateLine.length > 3 && !/^(?:NOME|RAZ[ÃA]O|SOCIAL)/i.test(candidateLine)) {
            destNome = candidateLine;
            break;
          }
        }
      }
    }

    // 1. Buscar CNPJ/CPF explicitamente rotulado no bloco delimitado (NUNCA busca além de block!)
    const labelledCnpj = block.match(/\bCNPJ(?:\s*\/\s*CPF)?[^\d]{0,20}(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}|\d{14})/i);
    const labelledCpf = block.match(/\bCPF\b[^\d]{0,20}(\d{3}\.?\d{3}\.?\d{3}\-?\d{2}|\d{11})/i);
    const labelledIdentity = labelledCnpj || labelledCpf;
    if (labelledIdentity) {
      const candidate = labelledIdentity[1].replace(/\D/g, '');
      if ((candidate.length === 14 || (labelledIdentity === labelledCpf && candidate.length === 11)) &&
          candidate !== destIE && candidate !== emitIE && candidate !== '12' &&
          !isCarrierCnpj(candidate) && candidate !== transpBlockCNPJ && candidate !== retiradaCNPJ && candidate !== entregaCNPJ) {
        destCNPJ = candidate;
      }
    }

    // 2. Buscar CNPJs formatados ou contínuos no bloco delimitado
    if (!destCNPJ) {
      const formattedCnpjs = block.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) || [];
      const formattedCpfs = block.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || [];

      for (const m of formattedCnpjs) {
        const candidate = m.replace(/\D/g, '');
        if (!isCarrierCnpj(candidate) && candidate !== emitIE && candidate !== destIE &&
            candidate !== transpBlockCNPJ && candidate !== retiradaCNPJ && candidate !== entregaCNPJ) {
          destCNPJ = candidate;
          break;
        }
      }
      if (!destCNPJ && formattedCpfs.length > 0 && /(?:CNPJ\s*\/\s*CPF|\bCPF\b)/i.test(block)) {
        const explicitCpf = block.match(/\bCPF\b[^\d]{0,40}(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})/i);
        if (explicitCpf) destCNPJ = explicitCpf[1].replace(/\D/g, '');
      }

      // Buscar qualquer sequência de 14 dígitos contínuos no bloco delimitado de destinatário
      if (!destCNPJ) {
        const allBlock14 = block.match(/(?:^|\D)(\d{14})(?:\D|$)/g) || [];
        const validCandidates: string[] = [];
        for (const m of allBlock14) {
          const candidate = m.replace(/\D/g, '');
          if (
            candidate.length === 14 &&
            candidate !== emitIE &&
            candidate !== destIE &&
            !isCarrierCnpj(candidate) &&
            candidate !== transpBlockCNPJ &&
            candidate !== retiradaCNPJ &&
            candidate !== entregaCNPJ
          ) {
            validCandidates.push(candidate);
          }
        }
        // Se houver candidato diferente do emitente, priorizá-lo; se não houver ou se emitente=destinatário (ex: remessa/transferência/formação de lote), aceitar o candidato encontrado no bloco de destinatário
        const distinct = validCandidates.find((c) => c !== emitCNPJRaw);
        if (distinct) {
          destCNPJ = distinct;
        } else if (validCandidates.length > 0) {
          destCNPJ = validCandidates[0];
        }
      }
    }

    // Limpar e sanitizar nome inicial capturado
    destNome = sanitizeDestinatarioNome(destNome, destCNPJ, textFiscal, emitNome, emitCNPJRaw);
  }

  // 3. Buscar CNPJ imediatamente adjacente à Data de Emissão/Saída no cabeçalho fiscal (como no layout Copersucar e LDC)
  if (!destCNPJ) {
    const destPos = textFiscal.search(/DESTINAT[AÁ]RIO|REMETENTE/i);
    const searchScope = destPos > 0 ? textFiscal.substring(destPos) : textFiscal;
    const dateAdjacentMatch = searchScope.match(/(?:^|\D)(\d{14}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\s+\d{2}\/\d{2}\/\d{2,4}/);
    if (dateAdjacentMatch) {
      const candidate = dateAdjacentMatch[1].replace(/\D/g, '');
      if (
        candidate.length === 14 &&
        candidate !== destIE &&
        candidate !== emitIE &&
        !isCarrierCnpj(candidate) &&
        candidate !== transpBlockCNPJ &&
        candidate !== retiradaCNPJ &&
        candidate !== entregaCNPJ
      ) {
        destCNPJ = candidate;
      }
    }
  }

  // 3.5. Fallback para Cadastros Logísticos APENAS se o destinatário NÃO for a mesma empresa do emitente
  // Se for a mesma empresa/grupo (ex: filial/transferência/formação de lote), o CNPJ deve ser emitCNPJRaw, NUNCA inventar outra filial aleatória de cadastros!
  if (!destCNPJ && destNome) {
    const isSameEntityName = emitNome && (
      destNome.toUpperCase().includes(emitNome.toUpperCase()) ||
      emitNome.toUpperCase().includes(destNome.toUpperCase()) ||
      (/LOUIS\s*DREYFUS|LDC\b/i.test(destNome) && /LOUIS\s*DREYFUS|LDC\b/i.test(emitNome)) ||
      (/CARGILL/i.test(destNome) && /CARGILL/i.test(emitNome))
    );
    if (isSameEntityName && emitCNPJRaw) {
      destCNPJ = emitCNPJRaw;
    } else {
      const resolved = resolveDestinatarioCadastro(destNome);
      if (resolved && resolved.cnpj) {
        destCNPJ = resolved.cnpj;
      }
    }
  }

  // 4. Verificar se há destinatário distinto explicitamente identificado na nota
  const hasDistinctDest = Boolean(
    destNome &&
    destNome !== 'Não informado' &&
    destNome !== 'DESTINATÁRIO NÃO IDENTIFICADO' &&
    destNome.length > 3 &&
    !destNome.includes(emitNome) &&
    !emitNome.includes(destNome)
  );

  // Se o destinatário for o próprio emitente/remetente (ex: transferência entre filiais ou o campo compartilhado sem outro cliente)
  const isSameEntityOrMissing =
    !hasDistinctDest &&
    (!destCNPJ ||
     destCNPJ === destIE ||
     destCNPJ === emitIE ||
     destCNPJ.length === 12 ||
     isCarrierCnpj(destCNPJ) ||
     destCNPJ === retiradaCNPJ ||
     destCNPJ === entregaCNPJ ||
     (destCNPJ && emitCNPJRaw && (destCNPJ === emitCNPJRaw || destCNPJ.slice(0, 8) === emitCNPJRaw.slice(0, 8))));

  if (isSameEntityOrMissing && emitNome) {
    if (!destNome || destNome === 'Não informado' || destNome === 'DESTINATÁRIO NÃO IDENTIFICADO') {
      destNome = emitNome.toUpperCase();
    }
    if (!destCNPJ || isCarrierCnpj(destCNPJ) || destCNPJ === retiradaCNPJ || destCNPJ === entregaCNPJ) {
      destCNPJ = emitCNPJRaw;
    }
  }

  if (!destIE && emitIE) {
    destIE = emitIE;
  }

  // Sanitização final com fallback do emitente garantido apenas quando não há destinatário
  destNome = sanitizeDestinatarioNome(destNome, destCNPJ, textFiscal, emitNome, emitCNPJRaw);

  if ((!destNome || destNome === 'Não informado') && emitNome) {
    destNome = emitNome.toUpperCase();
  }

  // Format CNPJs
  const emitCNPJFormatted = formatCNPJStr(emitCNPJRaw);
  const destCNPJFormatted = formatCNPJStr(destCNPJ);

  // Pre-processar texto para corrigir quebras de números separadas por quebra de linha ou espaço
  // Ex: "47.140,0\n0" -> "47.140,00", "47.140,0 0" -> "47.140,00", "47.140, 00" -> "47.140,00"
  const cleanedText = text
    .replace(/(\d{1,3}(?:\.\d{3})+,\d{1,3})\s*[\r\n]+\s*(\d+)\b/g, '$1$2')
    .replace(/(\b\d+,\d{1,3})\s*[\r\n]+\s*(\d+)\b/g, '$1$2')
    .replace(/(\d{1,3}(?:\.\d{3})+)\s*,\s*[\r\n]+\s*(\d+)\b/g, '$1,$2')
    .replace(/(\d{1,3}(?:\.\d{3})+)\s*[\r\n]+\s*,\s*(\d+)\b/g, '$1,$2')
    .replace(/(\d{1,3}(?:\.\d{3})+)\s*[\r\n]+\s*(\d{2,4})\b/g, '$1,$2')
    .replace(/(\d{1,3}(?:\.\d{3})+,\d)\s+(\d)\b/g, '$1$2')
    .replace(/(\b\d+,\d)\s+(\d)\b/g, '$1$2')
    .replace(/(\d{1,3}(?:\.\d{3})+)\s*,\s*(\d{2,4})\b/g, '$1,$2')
    .replace(/(\d{1,3})\s*\.\s*(\d{3})\s*,\s*(\d{2,4})/g, '$1.$2,$3');

  // 5. Quantidade / Peso / Valor Total
  let prodQCom = 0;
  let prodVProd = 0;
  let prodUCom = 'KG';
  let prodCodigo = '000000000020000011';
  let prodCFOP = '5504';
  let prodNCM = '17011400';

  // Valor Total da Nota
  const vNFMatch = cleanedText.match(/(?:VALOR TOTAL DA NOTA|VALOR TOTAL DOS PRODUTOS|VALOR TOTAL)[^\d]{1,20}(\d[\d\.]*,\d{2})/i);
  if (vNFMatch) {
    prodVProd = parseFloat(cleanNumeric(vNFMatch[1]));
  }

  // Quantidade / Peso Líquido / Peso Bruto
  let transpPesoLStr = '';
  let transpPesoBStr = '';
  let transpQVolStr = '';
  let transpEspStr = 'GRANEL';

  // 1. Extração Específica de Tabela de Volumes em qualquer lugar da DANFE (inclusive no rodapé)
  // Ex: "QUANTIDADE ESPÉCIE PESO BRUTO PESO LÍQUIDO \n 47.020,00 QUILOGRAMA 73.800,00 47.020,00"
  // Ex: "QUANTIDADE ESPÉCIE PESO BRUTO PESO LÍQUIDO \n - null 73.340,00 47.140,00"
  const vol4ColMatch = cleanedText.match(/(?:QUANTIDADE\s+ESP[EÉ]CIE(?:\s+MARCA)?\s+PESO\s+BRUTO\s+PESO\s+L[ÍI]QUIDO)[\s\S]{1,160}?(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)\s+([A-Za-zÀ-Ú]+|\bnull\b|-)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)/i);
  if (vol4ColMatch) {
    transpQVolStr = vol4ColMatch[1].trim();
    const espCandidate = vol4ColMatch[2].trim();
    if (espCandidate && !/^(?:null|-)$/i.test(espCandidate)) {
      transpEspStr = espCandidate.toUpperCase();
    }
    transpPesoBStr = vol4ColMatch[3].trim();
    transpPesoLStr = vol4ColMatch[4].trim();
  }

  if (!transpPesoLStr) {
    const vol2ColMatch = cleanedText.match(/(?:PESO\s+BRUTO\s+PESO\s+L[ÍI]QUIDO|PESO\s+BRUTO\s+L[ÍI]QUIDO)[\s\S]{1,120}?(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)/i);
    if (vol2ColMatch) {
      transpPesoBStr = vol2ColMatch[1].trim();
      transpPesoLStr = vol2ColMatch[2].trim();
    }
  }

  if (!transpPesoLStr) {
    const volHeaderMatch = cleanedText.match(/(?:QUANTIDADE\s+ESP[EÉ]CIE\s+PESO\s+BRUTO\s+PESO\s+L[ÍI]QUIDO|QUANTIDADE\s+ESP[EÉ]CIE\s+MARCA\s+PESO\s+BRUTO\s+PESO\s+L[ÍI]QUIDO)[\s\S]{1,120}?(?:-|\bnull\b|\bgranel\b|\d+)?\s*(?:-|\bnull\b|\bgranel\b|[A-Za-zÀ-Ú]+)?\s*(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d{2,6},\d{2}\b)/i);
    if (volHeaderMatch) {
      transpPesoBStr = volHeaderMatch[1].trim();
      transpPesoLStr = volHeaderMatch[2].trim();
    }
  }

  // Extrair região do Transportador / Volumes
  let transpText = '';
  const transpMatch = cleanedText.match(/(?:TRANSPORTADOR|VOLUMES\s+TRANSPORTADOS|PESO\s+BRUTO|PESO\s+(?:LÍQUIDO|LIQUIDO))[\s\S]{1,700}/i);
  if (transpMatch) {
    transpText = transpMatch[0];
    const cutIdx = transpText.search(/(?:DADOS\s+DOS?\s+PRODUTOS?|CÓDIGO\s+DO\s+PRODUTO|DESCRIÇÃO|VALOR\s+UNIT|V\.UNIT|VL\.UNIT|VALOR\s+TOTAL|VL\.TOTAL|CÁLCULO\s+DO\s+IMPOSTO)/i);
    if (cutIdx > 0) {
      transpText = transpText.substring(0, cutIdx);
    }
  }

  if (transpText) {
    // Limpar ruídos de endereço (como "KM 22,8", "KM 150", CEP, CNPJ, etc) de transpText antes de buscar números
    const transpTextClean = transpText
      .replace(/\bKM\b\s*[:=-]?\s*[\d\.,]+/gi, '')
      .replace(/\b(?:RODOVIA|ESTRADA|RUA|AV|AVENIDA|ALAMEDA)\b[^\n\r]*?[\d\.,]+/gi, '')
      .replace(/\b(?:CEP|CNPJ|CPF|IE|FONE|FAX|TEL|Nº|NR|SERIE|SÉRIE)\b[^\n\r]*/gim, '');

    // Busca por cabeçalhos e linhas de transporte: QUANTIDADE | ESPÉCIE | PESO BRUTO | PESO LÍQUIDO
    // Ex: "47.620,00 QUILOGRAMA 73.540,00 47.620,00"
    const volRowMatch = transpTextClean.match(/(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)\s+([A-Za-zÀ-Ú]+)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)/i);
    if (volRowMatch) {
      if (!transpQVolStr) transpQVolStr = volRowMatch[1].trim();
      if (!transpEspStr || transpEspStr === 'GRANEL') transpEspStr = volRowMatch[2].trim().toUpperCase();
      if (!transpPesoBStr) transpPesoBStr = volRowMatch[3].trim();
      if (!transpPesoLStr) transpPesoLStr = volRowMatch[4].trim();
    }

    // Busca por rótulo direto PESO LÍQUIDO e PESO BRUTO
    const netLabelMatch = transpTextClean.match(/(?:PESO\s+(?:LÍQUIDO|LIQUIDO|LIQ|LÍQ)|P\.\s*(?:LÍQ|LIQ|LÍQUIDO|LIQUIDO))\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)/i);
    const grossLabelMatch = transpTextClean.match(/(?:PESO\s+BRUTO|P\.\s*BRUTO)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)/i);

    if (netLabelMatch && !transpPesoLStr) transpPesoLStr = netLabelMatch[1].trim();
    if (grossLabelMatch && !transpPesoBStr) transpPesoBStr = grossLabelMatch[1].trim();

    // Se os rótulos não tiverem valores imediatamente adjacentes (ex: cabeçalhos de tabela)
    if (!transpPesoLStr || !transpPesoBStr) {
      const rawNums = transpTextClean.match(/\b\d{1,3}(?:\.\d{3})+,\d{1,4}\b|\b\d{2,6},\d{1,4}\b|\b\d{4,6}\b/g) || [];
      const validNums = rawNums
        .map(n => ({ str: n.trim(), val: parseFloat(cleanNumeric(n)) }))
        .filter(w => w.val > 0 && w.val < 1000000);

      if (validNums.length >= 2) {
        // Ordena: o MENOR valor é o PESO LÍQUIDO e o MAIOR é o PESO BRUTO
        validNums.sort((a, b) => a.val - b.val);
        if (!transpPesoLStr) transpPesoLStr = validNums[0].str;
        if (!transpPesoBStr) transpPesoBStr = validNums[validNums.length - 1].str;
      } else if (validNums.length === 1) {
        if (!transpPesoLStr) transpPesoLStr = validNums[0].str;
        if (!transpPesoBStr) transpPesoBStr = validNums[0].str;
      }
    }
  }

  // Fallback se não achou no transpText: procurar em todo o cleanedText por PESO LÍQUIDO (ignorando trechos com KM)
  if (!transpPesoLStr) {
    const cleanedGlobalText = cleanedText.replace(/\bKM\b\s*[:=-]?\s*[\d\.,]+/gi, '');
    const globalNetMatch = cleanedGlobalText.match(/(?:PESO\s+(?:LÍQUIDO|LIQUIDO|LIQ|LÍQ)|P\.\s*(?:LÍQ|LIQ|LÍQUIDO|LIQUIDO))\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b|\b\d{2,6}\b)/i);
    if (globalNetMatch) {
      transpPesoLStr = globalNetMatch[1].trim();
    }
  }

  // 2. Extração Específica de Linhas de Produto na DANFE inteira
  // Busca 1: Linha completa de produto com código, descrição, NCM, CFOP, Unidade, Quantidade, Valor Unitário, Valor Total
  // Ex: "2P ACUCAR VHP 17011400 5504 TON 47,02 1.557,99 73.256,73"
  // Ex: "2P ACUCAR VHP 17011400 041 5504 TON 47,62 1.557,99 74.191,53"
  const lines = cleanedText.split(/[\r\n]+/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length < 10) continue;

    // Linha com NCM e CFOP
    const rowMatch = trimmedLine.match(/(?:([A-Z0-9]{1,20})\s+)?([A-ZÀ-Ú0-9\s\.\,\-\/\*]{3,60}?)\s+(\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+(?:\d{2,4}\s+)?(\d{4})\s+(TON|TONELADA|TONELADAS|KG|KGS|QUILOGRAMA|SC|SAC|SACO|SACOS|UN|UND|UNID|UNIDADE|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\.\d{1,4}\b)(?:\s+(\d{1,3}(?:\.\d{3})+,\d{2,4}|\b\d+,\d{2,4}\b))?(?:\s+(\d{1,3}(?:\.\d{3})+,\d{2,4}|\b\d+,\d{2,4}\b))?/i);
    if (rowMatch) {
      if (rowMatch[1]) prodCodigo = rowMatch[1].trim();
      if (rowMatch[3]) prodNCM = rowMatch[3].replace(/\./g, '').trim();
      if (rowMatch[4]) prodCFOP = rowMatch[4].trim();
      if (rowMatch[5]) {
        const u = rowMatch[5].trim().toUpperCase();
        prodUCom = (u.startsWith('TON') || u === 'TO' || u === 'T') ? 'TON' : u;
      }
      if (rowMatch[6]) {
        prodQCom = parseFloat(cleanNumeric(rowMatch[6]));
      }
      if (rowMatch[8]) {
        const vTot = parseFloat(cleanNumeric(rowMatch[8]));
        if (vTot > 0) prodVProd = vTot;
      }
      if (prodQCom > 0) break;
    }
  }

  // Busca 2: Padrão NCM + CFOP + UN + QUANTIDADE em qualquer lugar do texto
  if (prodQCom === 0) {
    const globalNcmCfopQuantMatch = cleanedText.match(/(?:\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+(?:\d{2,4}\s+)?(\d{4})\s+(TON|TONELADA|TONELADAS|KG|KGS|QUILOGRAMA|SC|SAC|SACO|SACOS|UN|UND|UNID|UNIDADE|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\.\d{1,4}\b)/i);
    if (globalNcmCfopQuantMatch) {
      if (globalNcmCfopQuantMatch[1]) prodCFOP = globalNcmCfopQuantMatch[1].trim();
      const u = globalNcmCfopQuantMatch[2].trim().toUpperCase();
      prodUCom = (u.startsWith('TON') || u === 'TO' || u === 'T') ? 'TON' : u;
      prodQCom = parseFloat(cleanNumeric(globalNcmCfopQuantMatch[3]));
    }
  }

  // Busca 3: Padrão CFOP + UN + QUANTIDADE em qualquer lugar do texto
  // Ex: "5504 TON 47,02" ou "5504 TON 47,62" ou "5504 TON 47.140,00"
  if (prodQCom === 0) {
    const cfopUnMatch = cleanedText.match(/\b(5504|5502|6505|5505|5102|6102|5905|6905)\s+(TON|TONELADA|TONELADAS|KG|KGS|QUILOGRAMA|SC|SAC|SACO|SACOS|UN|UND|UNID|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\.\d{1,4}\b)/i);
    if (cfopUnMatch) {
      prodCFOP = cfopUnMatch[1].trim();
      const u = cfopUnMatch[2].trim().toUpperCase();
      prodUCom = (u.startsWith('TON') || u === 'TO' || u === 'T') ? 'TON' : u;
      prodQCom = parseFloat(cleanNumeric(cfopUnMatch[3]));
    }
  }

  // Busca 4: Padrão UN + QUANTIDADE + VALOR UNIT
  // Ex: "TON 47,02 1.557,99"
  if (prodQCom === 0) {
    const unQuantMatch = cleanedText.match(/\b(TON|TONELADA|KG|KGS|SC|SAC|UN|UND|TO|T)\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b)\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\b\d+,\d{2}\b)/i);
    if (unQuantMatch) {
      const u = unQuantMatch[1].trim().toUpperCase();
      prodUCom = (u.startsWith('TON') || u === 'TO' || u === 'T') ? 'TON' : u;
      prodQCom = parseFloat(cleanNumeric(unQuantMatch[2]));
    }
  }

  // Busca 5: QUANTIDADE antes da unidade
  // Ex: "17011400 5504 47,62 TON"
  if (prodQCom === 0) {
    const quantBeforeUnMatch = cleanedText.match(/(?:\d{4}\.?\d{2}\.?\d{2}|\d{8})\s+(?:\d{2,4}\s+)?(\d{4})\s+(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\.\d{1,4}\b)\s*(TON|TONELADA|TONELADAS|KG|KGS|QUILOGRAMA|SC|SAC|SACO|SACOS|UN|UND|UNID|UNIDADE|TO|T)/i);
    if (quantBeforeUnMatch) {
      if (quantBeforeUnMatch[1]) prodCFOP = quantBeforeUnMatch[1].trim();
      prodQCom = parseFloat(cleanNumeric(quantBeforeUnMatch[2]));
      const u = quantBeforeUnMatch[3].trim().toUpperCase();
      prodUCom = (u.startsWith('TON') || u === 'TO' || u === 'T') ? 'TON' : u;
    }
  }

  // Busca 6: Rótulo direto QUANTIDADE
  if (prodQCom === 0) {
    const directQuantMatch = cleanedText.match(/(?:QUANT(?:IDADE|\.)?|QTD\.?)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\.\d{1,4}\b)/i);
    if (directQuantMatch) {
      const qVal = parseFloat(cleanNumeric(directQuantMatch[1]));
      if (qVal > 0) {
        prodQCom = qVal;
      }
    }
  }

  // Fallback: Se não encontrou na tabela de produtos, usar o Peso Líquido do Transporte
  if (prodQCom === 0 && transpPesoLStr) {
    const pL = parseFloat(cleanNumeric(transpPesoLStr));
    if (pL > 0) prodQCom = pL;
  }

  // Se transpPesoLStr não estava preenchido mas prodQCom foi encontrado
  if (!transpPesoLStr && prodQCom > 0) {
    transpPesoLStr = prodUCom === 'TON' ? (prodQCom * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : prodQCom.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  // Garantia física: Peso Líquido jamais pode ser superior ao Peso Bruto
  const numL = transpPesoLStr ? parseFloat(cleanNumeric(transpPesoLStr)) : 0;
  const numB = transpPesoBStr ? parseFloat(cleanNumeric(transpPesoBStr)) : 0;
  if (numL > 0 && numB > 0 && numL > numB) {
    const tmp = transpPesoLStr;
    transpPesoLStr = transpPesoBStr;
    transpPesoBStr = tmp;
  }

  if (prodQCom === 0 && prodVProd > 0) {
    prodQCom = 1;
  }

  const prodVUnCom = prodQCom > 0 ? Number((prodVProd / prodQCom).toFixed(4)) : prodVProd;

  // Produto Nome
  let prodNome = 'ACUCAR BRUTO VHP';
  const textUpper = text.toUpperCase();
  if (textUpper.includes('CRISTAL')) {
    prodNome = 'ACUCAR CRISTAL VHP';
  } else if (textUpper.includes('ACUCAR') || textUpper.includes('AÇÚCAR') || textUpper.includes('ACUCAR BRUTO') || textUpper.includes('VHP')) {
    prodNome = 'ACUCAR BRUTO, DE CANA, SEM ADICAO DE AROMATIZANTES OU DE CORANTES, TIPO VHP';
  } else if (textUpper.includes('SOJA')) {
    prodNome = 'SOJA EM GRAOS';
  } else if (textUpper.includes('MILHO')) {
    prodNome = 'MILHO EM GRAOS';
  } else if (textUpper.includes('FARELO')) {
    prodNome = 'FARELO DE SOJA';
  }

  prodNCM = '17011400';
  if (prodNome.includes('SOJA')) prodNCM = '12019000';
  if (prodNome.includes('MILHO')) prodNCM = '10059010';

  prodCFOP = '5504';
  const cfopMatch = text.match(/\b(5504|5502|6505|5505|5102|6102|5905|6905)\b/);
  if (cfopMatch) {
    prodCFOP = cfopMatch[1];
  }

  // Transportador
  let transpNome = '';
  let transpCNPJ = transpBlockCNPJ || '';
  let transpPlaca = '';

  const transCarrierMatch = textFiscal.match(/([A-ZÀ-Ú0-9\s\.\-]{3,60}?(?:TRANSPORTES?|LOGISTICA|CARGAS?|LTDA|EIRELI|S\/A|S\.A\.))[\s\S]{0,40}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d{14})/i);
  if (transCarrierMatch) {
    const rawName = transCarrierMatch[1].trim();
    const cleanLines = rawName.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 3);
    const lastLine = cleanLines[cleanLines.length - 1] || rawName;
    if (!lastLine.includes(destNome) && !lastLine.includes(emitNome)) {
      transpNome = lastLine;
      const c = transCarrierMatch[2].replace(/\D/g, '');
      if (c !== emitCNPJRaw && c !== destCNPJ) {
        transpCNPJ = c;
      }
    }
  }

  if (!transpNome) {
    if (textUpper.includes('GUARDIA') || textUpper.includes('GAMA LOGISTICA')) {
      transpNome = 'TRANSPORTADORA GUARDIA - GAMA LOGISTICA LTDA';
      transpCNPJ = transpCNPJ || '49964752000161';
    } else if (textUpper.includes('TRANSMAION')) {
      transpNome = 'TRANSMAION TRANSPORTES DE CARGAS LTDA';
      transpCNPJ = transpCNPJ || '06948119000177';
    } else if (textUpper.includes('COPERSUCAR') && !destNome.includes('COPERSUCAR')) {
      transpNome = 'COPERSUCAR S.A.';
      transpCNPJ = transpCNPJ || '10265949004164';
    }
  }

  const placaMatch = text.match(/(?:PLACA DO VEÍCULO|PLACA DO VEICULO|PLACA)[^\w]{1,10}([A-Z]{3}[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}[0-9]{4})/i);
  if (placaMatch) {
    transpPlaca = placaMatch[1].toUpperCase();
  }

  // Locais
  let infCpl = '';
  const infMatch = text.match(/(?:INFORMAÇÕES COMPLEMENTARES|INFORMACÕES COMPLEMENTARES|INFORMACOES COMPLEMENTARES|DADOS ADICIONAIS|Inf\. Contribuinte:?)([\s\S]+)/i);
  if (infMatch) {
    infCpl = infMatch[1].replace(/\s+/g, ' ').trim();
  } else {
    infCpl = text.length > 3000 ? text.slice(-3000).replace(/\s+/g, ' ').trim() : text.replace(/\s+/g, ' ').trim();
  }

  const terminalEntrega = extractTerminalEntrega(text);
  const transbordo = extractTransbordo(text);
  const retirada = extractRetirada(text);

  const parserData: ParsedNFeData = {
    chave,
    nNF,
    serie,
    cUF,
    cNF,
    cDV,
    natOp,
    dhEmi: new Date().toISOString().split('T')[0] + 'T12:00:00-03:00',
    emitCNPJ: emitCNPJFormatted,
    emitNome,
    emitFant: emitNome,
    emitIE,
    emitLgr: '',
    emitNro: '',
    emitBairro: '',
    emitMun: '',
    emitUF: 'SP',
    emitCEP: '',
    emitFone: '',
    destCNPJ: destCNPJFormatted,
    destNome,
    destLgr: '',
    destNro: '',
    destBairro: '',
    destMun: '',
    destUF: 'SP',
    destCEP: '',
    destIE: destIE || emitIE || '',
    prodCodigo: prodCodigo || '000000000020000011',
    prodNome,
    prodNCM: prodNCM || '17011400',
    prodCFOP: prodCFOP || '5504',
    prodUCom: prodUCom || 'KG',
    prodQCom,
    prodVUnCom,
    prodVProd,
    vBC: '0.00',
    vICMS: '0.00',
    vProd: prodVProd.toFixed(2),
    vFrete: '0.00',
    vSeg: '0.00',
    vDesc: '0.00',
    vOutro: '0.00',
    vNF: prodVProd.toFixed(2),
    transpCNPJ: formatCNPJStr(transpCNPJ),
    transpNome,
    transpIE: '',
    transpEnder: '',
    transpMun: '',
    transpUF: 'SP',
    transpQVol: transpQVolStr || (prodQCom > 0 ? (prodUCom === 'TON' ? (prodQCom * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : prodQCom.toString()) : ''),
    transpEsp: transpEspStr || 'GRANEL',
    transpPesoL: transpPesoLStr || (prodQCom > 0 ? (prodUCom === 'TON' ? (prodQCom * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : prodQCom.toString()) : ''),
    transpPesoB: transpPesoBStr || transpPesoLStr || (prodQCom > 0 ? (prodUCom === 'TON' ? (prodQCom * 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : prodQCom.toString()) : ''),
    infCpl,
    terminalEntrega,
    transbordo,
    retirada,
    rawSnippet: cleanedText.length > 2500 ? cleanedText.substring(0, 2500) : cleanedText,
  };

  const xml = generateNFeXML(parserData);
  return { xml, data: parserData };
}

function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateNFeXML(p: ParsedNFeData): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${p.chave}" versao="4.00">
      <ide>
        <cUF>${p.cUF}</cUF>
        <cNF>${p.cNF}</cNF>
        <natOp>${escapeXml(p.natOp)}</natOp>
        <mod>55</mod>
        <serie>${p.serie}</serie>
        <nNF>${p.nNF}</nNF>
        <dhEmi>${p.dhEmi}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>2</idDest>
        <cMunFG>3512304</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${p.cDV}</cDV>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>1.0</verProc>
      </ide>
      <emit>
        <CNPJ>${p.emitCNPJ.replace(/\D/g, '')}</CNPJ>
        <xNome>${escapeXml(p.emitNome)}</xNome>
        <xFant>${escapeXml(p.emitFant)}</xFant>
        <enderEmit>
          <xLgr>${escapeXml(p.emitLgr || 'LOGRADOURO EMITENTE')}</xLgr>
          <nro>${escapeXml(p.emitNro || 'SN')}</nro>
          <xBairro>${escapeXml(p.emitBairro || 'CENTRO')}</xBairro>
          <cMun>3512304</cMun>
          <xMun>${escapeXml(p.emitMun || 'SAO PAULO')}</xMun>
          <UF>${escapeXml(p.emitUF || 'SP')}</UF>
          <CEP>${p.emitCEP.replace(/\D/g, '') || '00000000'}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderEmit>
        <IE>${escapeXml(p.emitIE || '000000000')}</IE>
      </emit>
      <dest>
        <CNPJ>${p.destCNPJ.replace(/\D/g, '')}</CNPJ>
        <xNome>${escapeXml(p.destNome)}</xNome>
        <enderDest>
          <xLgr>${escapeXml(p.destLgr || 'LOGRADOURO DESTINATARIO')}</xLgr>
          <nro>${escapeXml(p.destNro || 'SN')}</nro>
          <xBairro>${escapeXml(p.destBairro || 'CENTRO')}</xBairro>
          <cMun>3512304</cMun>
          <xMun>${escapeXml(p.destMun || 'SAO PAULO')}</xMun>
          <UF>${escapeXml(p.destUF || 'SP')}</UF>
          <CEP>${p.destCEP.replace(/\D/g, '') || '00000000'}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderDest>
        <indIEDest>1</indIEDest>
        <IE>${escapeXml(p.destIE || '000000000')}</IE>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>${escapeXml(p.prodCodigo)}</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>${escapeXml(p.prodNome)}</xProd>
          <NCM>${escapeXml(p.prodNCM)}</NCM>
          <CFOP>${escapeXml(p.prodCFOP)}</CFOP>
          <uCom>${escapeXml(p.prodUCom)}</uCom>
          <qCom>${p.prodQCom.toFixed(4)}</qCom>
          <vUnCom>${p.prodVUnCom.toFixed(4)}</vUnCom>
          <vProd>${p.prodVProd.toFixed(2)}</vProd>
          <cEANTrib>SEM GTIN</cEANTrib>
          <uTrib>${escapeXml(p.prodUCom)}</uTrib>
          <qTrib>${p.prodQCom.toFixed(4)}</qTrib>
          <vUnTrib>${p.prodVUnCom.toFixed(4)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS40>
              <orig>0</orig>
              <CST>41</CST>
            </ICMS40>
          </ICMS>
          <IPI>
            <cEnq>999</cEnq>
            <IPINT>
              <CST>53</CST>
            </IPINT>
          </IPI>
          <PIS>
            <PISNT>
              <CST>08</CST>
            </PISNT>
          </PIS>
          <COFINS>
            <COFINSNT>
              <CST>08</CST>
            </COFINSNT>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>${p.vBC}</vBC>
          <vICMS>${p.vICMS}</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${p.vProd}</vProd>
          <vFrete>${p.vFrete}</vFrete>
          <vSeg>${p.vSeg}</vSeg>
          <vDesc>${p.vDesc}</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>${p.vOutro}</vOutro>
          <vNF>${p.vNF}</vNF>
          <vTotTrib>0.00</vTotTrib>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>0</modFrete>
        <transporta>
          <CNPJ>${p.transpCNPJ.replace(/\D/g, '')}</CNPJ>
          <xNome>${escapeXml(p.transpNome)}</xNome>
          <IE>${escapeXml(p.transpIE)}</IE>
          <xEnder>${escapeXml(p.transpEnder)}</xEnder>
          <xMun>${escapeXml(p.transpMun)}</xMun>
          <UF>${escapeXml(p.transpUF)}</UF>
        </transporta>
        <vol>
          <qVol>${escapeXml(p.transpQVol)}</qVol>
          <esp>${escapeXml(p.transpEsp)}</esp>
          <pesoL>${escapeXml(p.transpPesoL)}</pesoL>
          <pesoB>${escapeXml(p.transpPesoB)}</pesoB>
        </vol>
      </transp>
      <infAdic>
        <infCpl>${escapeXml(p.infCpl)}</infCpl>
      </infAdic>
    </infNFe>
  </NFe>
</nfeProc>`;
}

export function extractDataFromXML(xml: string, fileName: string): ParsedNFeData {
  const getTagValue = (tag: string): string => {
    const match = xml.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
  };

  const chaveMatch = xml.match(/Id="NFe(\d{44})"/i) || xml.match(/<infNFe\s+[^>]*Id="NFe(\d{44})"/i) || xml.match(/NFe(\d{44})/);
  const chave = chaveMatch ? chaveMatch[1] : '';

  const nNF = getTagValue('nNF');
  const serie = getTagValue('serie');
  const cUF = getTagValue('cUF');
  const cNF = getTagValue('cNF');
  const cDV = getTagValue('cDV');
  const natOp = getTagValue('natOp');
  const dhEmi = getTagValue('dhEmi');

  const emitCNPJMatch = xml.match(/<emit>[\s\S]*?<CNPJ>(\d+?)<\/CNPJ>/i);
  const emitCNPJ = emitCNPJMatch ? formatCNPJStr(emitCNPJMatch[1]) : '';

  const emitNomeMatch = xml.match(/<emit>[\s\S]*?<xNome>([\s\S]*?)<\/xNome>/i);
  const emitNome = emitNomeMatch ? emitNomeMatch[1] : '';

  const destCNPJMatch = xml.match(/<dest>[\s\S]*?<CNPJ>(\d+?)<\/CNPJ>/i);
  const destCNPJ = destCNPJMatch ? formatCNPJStr(destCNPJMatch[1]) : '';

  const destNomeMatch = xml.match(/<dest>[\s\S]*?<xNome>([\s\S]*?)<\/xNome>/i);
  const destNome = destNomeMatch ? destNomeMatch[1] : '';

  const prodNomeMatch = xml.match(/<prod>[\s\S]*?<xProd>([\s\S]*?)<\/xProd>/i);
  const prodNome = prodNomeMatch ? prodNomeMatch[1] : '';

  const prodQComMatch = xml.match(/<prod>[\s\S]*?<qCom>([\s\S]*?)<\/qCom>/i);
  const prodQCom = prodQComMatch ? parseFloat(prodQComMatch[1]) : 0;

  const prodVUnComMatch = xml.match(/<prod>[\s\S]*?<vUnCom>([\s\S]*?)<\/vUnCom>/i);
  const prodVUnCom = prodVUnComMatch ? parseFloat(prodVUnComMatch[1]) : 0;

  const prodVProdMatch = xml.match(/<prod>[\s\S]*?<vProd>([\s\S]*?)<\/vProd>/i);
  const prodVProd = prodVProdMatch ? parseFloat(prodVProdMatch[1]) : 0;

  const vNF = getTagValue('vNF');
  const infCpl = getTagValue('infCpl');
  const transpPesoL = getTagValue('pesoL');
  const transpPesoB = getTagValue('pesoB');

  let terminalEntrega = extractTerminalEntrega(infCpl || xml);
  let transbordo = extractTransbordo(infCpl || xml);
  let retirada = extractRetirada(infCpl || xml);

  return {
    chave,
    nNF,
    serie,
    cUF,
    cNF,
    cDV,
    natOp,
    dhEmi,
    emitCNPJ,
    emitNome,
    emitFant: emitNome,
    emitIE: '',
    emitLgr: '',
    emitNro: '',
    emitBairro: '',
    emitMun: '',
    emitUF: '',
    emitCEP: '',
    emitFone: '',
    destCNPJ,
    destNome,
    destLgr: '',
    destNro: '',
    destBairro: '',
    destMun: '',
    destUF: '',
    destCEP: '',
    destIE: '',
    prodCodigo: '',
    prodNome,
    prodNCM: '',
    prodCFOP: '',
    prodUCom: '',
    prodQCom,
    prodVUnCom,
    prodVProd,
    vBC: '',
    vICMS: '',
    vProd: vNF,
    vFrete: '',
    vSeg: '',
    vDesc: '',
    vOutro: '',
    vNF,
    transpCNPJ: '',
    transpNome: '',
    transpIE: '',
    transpEnder: '',
    transpMun: '',
    transpUF: '',
    transpQVol: '',
    transpEsp: '',
    transpPesoL,
    transpPesoB,
    infCpl,
    terminalEntrega,
    transbordo,
    retirada
  };
}

function extractTerminalEntrega(text: string): string {
  if (!text) return '';

  // Extração 100% mecânica pelas até 15 palavras imediatamente após "alfandegado", "afadegado", "entrega:" e marcadores
  const fromDeliveryRule = extractTerminalFromDeliveryRule(text);
  if (fromDeliveryRule) {
    return fromDeliveryRule;
  }

  return '';
}

function getKnownTransbordo(str: string): string | null {
  if (!str) return null;
  const upper = str.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (upper.includes('NOVA AGRI') || upper.includes('NOVAAGRI') || upper.includes('NOVA-AGRI')) {
    if (upper.includes('ALTO TAQUARI')) return 'NOVA AGRI - ALTO TAQUARI';
    return 'NOVA AGRI';
  }
  if (upper.includes('PRADOPOLIS') || upper.includes('PRADOPOLIS-SP') || upper.includes('PRADOPOLIS - SP')) return 'PRADOPOLIS';
  if (upper.includes('ALTO TAQUARI')) return 'ALTO TAQUARI';
  if (upper.includes('ALTO ARAGUAIA') || (upper.includes('ARAGUAIA') && !upper.includes('ARAGUARI'))) return 'ALTO ARAGUAIA';
  if (upper.includes('RONDONOPOLIS')) {
    return (upper.includes('RUMO') || upper.includes('MALHA') || upper.includes('TRANSBORDO')) ? 'RONDONOPOLIS (RUMO)' : 'RONDONOPOLIS';
  }
  if (upper.includes('RIO VERDE')) return 'RIO VERDE';
  if (upper.includes('DOM AQUINO')) return 'DOM AQUINO';
  if (upper.includes('ITURAMA')) return 'ITURAMA';
  if (upper.includes('ITIQUIRA')) return 'ITIQUIRA';
  if (upper.includes('UBERLANDIA')) return 'UBERLANDIA';
  if (upper.includes('SAO SIMAO')) return 'SAO SIMAO';
  if (upper.includes('CHAPADAO DO SUL')) return 'CHAPADAO DO SUL';
  if (upper.includes('INOCENCIA')) return 'INOCENCIA';
  if (upper.includes('RIO PRETO') || upper.includes('SAO JOSE DO RIO PRETO')) return 'RIO PRETO';
  if (upper.includes('GUARA')) return 'GUARA';
  if (upper.includes('PEDERNEIRAS')) return 'PEDERNEIRAS (RUMO)';
  if (upper.includes('ARAGUARI')) return 'ARAGUARI (VLI)';
  if (upper.includes('UBERABA') || upper.includes('TIUB')) return 'UBERABA';
  if (upper.includes('COMPANHIA AUXILIAR') || upper.includes('CIA AUXILIAR')) return 'COMPANHIA AUXILIAR DE ARMAZENS GERAIS';

  return null;
}

function extractTransbordo(text: string): string {
  if (!text) return '';
  const uppercase = text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Isolar bloco de Informações Complementares / Dados Adicionais se existir
  let infCpl = text;
  const infMatch = text.match(/(?:INFORMAÇÕES COMPLEMENTARES|INFORMACÕES COMPLEMENTARES|INFORMACOES COMPLEMENTARES|DADOS ADICIONAIS|Inf\. Contribuinte:?)([\s\S]+)/i);
  if (infMatch) {
    infCpl = infMatch[1];
  }

  // 2. Procurar por trechos específicos perto das palavras-chave indicadas (CIDADE:, ALFANDEGADO, ALFADEGADO, LOCAL DE TRANSBORDO, TRANSBORDO, LOCAL DE ENTREGA, ENTREGA)
  const transbordoKeywordsRegex = /(?:TRANSBORDO|ALFANDEGADO|ALFADEGADO|CIDADE DE TRANSBORDO|LOCAL DE TRANSBORDO|LOCAL DE ENTREGA|TERMINAL DE ENTREGA|RECINTO ALFANDEGADO|RECINTO ALFADEGADO|ENTREGA EM|CIDADE\s*:)\s*[:=-]?\s*([\s\S]{1,300})/gi;

  let match: RegExpExecArray | null;
  // Procurar primeiro nas informações complementares
  while ((match = transbordoKeywordsRegex.exec(infCpl)) !== null) {
    const chunk = match[1];
    const known = getKnownTransbordo(chunk);
    if (known) return known;
  }

  // 3. Se não encontrou nos trechos de palavras-chave do infCpl, verificar se há um local conhecido em infCpl inteiro
  const knownInInf = getKnownTransbordo(infCpl);
  if (knownInInf) return knownInInf;

  // 4. Procurar nas palavras-chave no texto total
  transbordoKeywordsRegex.lastIndex = 0;
  while ((match = transbordoKeywordsRegex.exec(text)) !== null) {
    const chunk = match[1];
    const known = getKnownTransbordo(chunk);
    if (known) return known;
  }

  // 5. Se houver menção explícita após palavas-chave sem local pré-mapeado, extrair texto limpo
  const explicitMatch = infCpl.match(/(?:SOFRERA\s+TRANSBORDO|MERCADORIA\s+SOFRERA\s+TRANSBORDO|LOCAL\s+DE\s+TRANSBORDO|LOCAL\s+TRANSBORDO|TRANSBORDO\s+NA|TRANSBORDO\s+EM|TRANSBORDO\s+DE|TRANSBORDO\s+NO|TRANSBORDO|RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|ALFANDEGADO|ALFADEGADO|LOCAL\s+DE\s+ENTREGA)\s*[:=-]?\s*([\s\S]{1,300})/i);

  if (explicitMatch && explicitMatch[1]) {
    let chunk = explicitMatch[1].trim();
    chunk = chunk.replace(/^(?:EM|DE|NA|NO|SERA|SERÁ|MERCADORIA|CIDADE)\s*[:=-]?\s*/i, '');

    const stopKeywords = [
      "TERMINAL", "ENTREGA", "RETIRADA", "PLACA", "MOTORISTA", "CONTRATO",
      "DESTINO", "CNPJ", "CPF", "OBS", "VALOR", "PESO", "QTD", "QUANTIDADE",
      "TICKET", "NAVIO", "SAFRA", "PEDIDO", "NOTA FISCAL", "CHAVE", "DATA", "CEP", "IE", "RECINTO", "EMITENTE", "DESTINATARIO"
    ];
    for (const kw of stopKeywords) {
      const idx = chunk.toUpperCase().indexOf(kw);
      if (idx > 0) {
        chunk = chunk.substring(0, idx).trim();
      }
    }

    const words = chunk.split(/\s+/).filter(Boolean).slice(0, 10);
    let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim();
    if (val.length > 2 && !/^\d+$/.test(val) && !['NÃO', 'NAO', 'DE', 'EM', 'SP', 'MT', 'MS', 'GO', 'MG', 'PR'].includes(val.toUpperCase())) {
      if (uppercase.includes('RUMO') || uppercase.includes('MALHA NORTE')) {
        return val.toUpperCase().includes('RUMO') ? val : `${val} (RUMO)`;
      }
      if (uppercase.includes('VLI')) {
        return val.toUpperCase().includes('VLI') ? val : `${val} (VLI)`;
      }
      return val;
    }
  }

  // 6. Fallback final: verificar se qualquer local conhecido de transbordo aparece no texto todo
  const knownGlobal = getKnownTransbordo(text);
  if (knownGlobal) return knownGlobal;

  return '';
}

function extractRetirada(text: string): string {
  if (!text) return '';
  const match = text.match(/(?:LOCAL DE RETIRADA|RETIRADA EM|RETIRADA)\s*[:=-]?\s*([^;\n\r\.]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}