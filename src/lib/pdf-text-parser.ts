// Utilitário de análise de texto de DANFE para conversão em XML (Processamento Local e Sem IA)

import { sanitizeDestinatarioNome } from './destinatario-utils';

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
  return str.replace(/\./g, '').replace(',', '.').trim();
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

  // 1. Estratégia Principal: Agrupamento Inteligente por Páginas com Detecção de DANFE x DCL/Romaneio
  if (pagesText && pagesText.length > 0) {
    const groupedItems: { key: string; pagesText: string[] }[] = [];
    let currentGroup: { key: string; pagesText: string[] } | null = null;

    for (const page of pagesText) {
      const pText = page.text || '';
      const isDanfe = /DANFE|DOCUMENTO AUXILIAR DA NOTA|DOCUMENTO AUXILIAR/i.test(pText);
      const isDCL = /\bDCL\b/i.test(pText) && /Documento de Carga|Fluxo Comercial|Rumo/i.test(pText);
      const isRomaneio = /Notas Fiscais Carregadas|Romaneio|Ticket de Pesagem/i.test(pText);

      const pageKeys = findKeysInText(pText);

      if (isDanfe) {
        // Encontrou página de DANFE legítima
        const mainKey = pageKeys[0] || '';
        if (mainKey) {
          currentGroup = { key: mainKey, pagesText: [pText] };
          groupedItems.push(currentGroup);
        } else if (currentGroup) {
          currentGroup.pagesText.push(pText);
        } else {
          currentGroup = { key: '', pagesText: [pText] };
          groupedItems.push(currentGroup);
        }
      } else if (isDCL || isRomaneio || pageKeys.length > 1) {
        // É página de DCL, Romaneio ou Manifesto que referencia múltiplas chaves
        // Anexa o texto do DCL/Romaneio a todos os grupos de notas correspondentes
        let matchedAnyGroup = false;
        for (const g of groupedItems) {
          if (g.key && pageKeys.includes(g.key)) {
            g.pagesText.push(pText);
            matchedAnyGroup = true;
          }
        }
        if (!matchedAnyGroup) {
          if (currentGroup) {
            currentGroup.pagesText.push(pText);
          } else if (pageKeys.length > 0) {
            // Se for um DCL puro sem páginas DANFE anteriores, cria grupos para as chaves
            for (const k of pageKeys) {
              groupedItems.push({ key: k, pagesText: [pText] });
            }
          } else {
            currentGroup = { key: '', pagesText: [pText] };
            groupedItems.push(currentGroup);
          }
        }
      } else if (pageKeys.length === 1) {
        const k = pageKeys[0];
        if (!currentGroup || currentGroup.key !== k) {
          currentGroup = { key: k, pagesText: [pText] };
          groupedItems.push(currentGroup);
        } else {
          currentGroup.pagesText.push(pText);
        }
      } else {
        // Página sem chave expressa (continuação)
        if (currentGroup) {
          currentGroup.pagesText.push(pText);
        } else {
          currentGroup = { key: '', pagesText: [pText] };
          groupedItems.push(currentGroup);
        }
      }
    }

    if (groupedItems.length > 0) {
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

  // 2. Estratégia Secundária (Fallback): Análise do Texto Bruto Concatenado
  const keys = findKeysInText(fullText);

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
  const reciboMatch = text.match(/RECEBEMOS DE\s+([A-ZÀ-Ú0-9\s\.\,\-\/&]{3,80}?)\s+(?:OS PRODUTOS|DANFE|NF-e|CNPJ)/i);
  if (reciboMatch) {
    emitNome = reciboMatch[1].trim();
  }

  if (!emitNome || emitNome === 'EMPRESA EMITENTE S/A') {
    const topMatch = text.match(/([A-ZÀ-Ú0-9\s\.\-&]{5,70})\s+DANFE/i);
    if (topMatch) {
      emitNome = topMatch[1].trim();
    } else {
      const emitMatchBeforeNat = text.match(/([A-ZÀ-Ú0-9\s\.\-&]{5,70})\s+(?:NATUREZA DA OPERAÇÃO|NATUREZA DA OPERACAO)/i);
      if (emitMatchBeforeNat) {
        emitNome = emitMatchBeforeNat[1].trim();
      } else if (/CORURIPE/i.test(text)) {
        emitNome = 'S/A USINA CORURIPE ACUCAR E ALCOOL';
      } else {
        emitNome = 'EMPRESA EMITENTE S/A';
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

  const destBlockMatch = text.match(/(?:DESTINATÁRIO\/REMETENTE|DESTINATARIO\/REMETENTE|DESTINATÁRIO|DESTINATARIO)([\s\S]{1,900})/i);
  if (destBlockMatch) {
    let block = destBlockMatch[1];
    const endBlockIdx = block.search(/(?:CÁLCULO\s+DO\s+IMPOSTO|CALCULO\s+DO\s+IMPOSTO|BASE\s+DE\s+CÁLCULO|TRANSPORTADOR|DADOS\s+DOS\s+PRODUTOS)/i);
    if (endBlockIdx > 0) {
      block = block.substring(0, endBlockIdx);
    }

    // Extrair Inscrição Estadual específica do destinatário no bloco
    const destIEMatch = block.match(/(?:INSCRIÇÃO\s*ESTADUAL|INSCRICAO\s*ESTADUAL|INSC\.?\s*ESTADUAL|I\.E\.|IE)[^\d]{1,15}(\d{8,15})/i);
    if (destIEMatch) {
      destIE = destIEMatch[1].trim();
    }

    // Extrair Nome / Razão Social do Destinatário
    const nameMatch = block.match(/(?:NOME\s*\/\s*RAZÃO\s*SOCIAL|NOME\s*RAZAO\s*SOCIAL|RAZÃO\s*SOCIAL|RAZAO\s*SOCIAL|NOME)[\s\n\r:-]*([A-ZÀ-Ú0-9\s\.\,\-\/&]{3,80})/i);
    if (nameMatch) {
      let raw = nameMatch[1].trim();
      const stopIdx = raw.search(/(?:ENDEREÇO|ENDEREC|BAIRRO|CNPJ|CPF|CEP|MUNICÍPIO|MUNICIPIO|UF|FONE|TELEFONE|INSCRIÇÃO|INSCRICAO|DATA|ENTRADA|SAIDA|SAÍDA|INSC|FASE)/i);
      if (stopIdx > 0) {
        raw = raw.substring(0, stopIdx).trim();
      }
      destNome = raw.replace(/[:=\-.,;]+$/, '').trim();
    }

    // Limpar e sanitizar nome inicial capturado
    destNome = sanitizeDestinatarioNome(destNome, '', text);

    // Buscar CNPJ/CPF formatado especificamente no bloco (com pontuação)
    const formattedCnpjs = block.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g);
    const formattedCpfs = block.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g);

    if (formattedCnpjs && formattedCnpjs.length > 0) {
      destCNPJ = formattedCnpjs[0].replace(/\D/g, '');
    } else if (formattedCpfs && formattedCpfs.length > 0) {
      destCNPJ = formattedCpfs[0].replace(/\D/g, '');
    } else {
      // Buscar após rótulo CNPJ / CPF garantindo não capturar Inscrição Estadual (IE)
      const cnpjsInBlock = block.match(/(?:CNPJ\s*\/\s*CPF|CNPJ|CPF)[^\d]{1,50}(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{14}|\d{11})/i);
      if (cnpjsInBlock) {
        const candidate = cnpjsInBlock[1].replace(/\D/g, '');
        // Garantir que não é a Inscrição Estadual
        if (candidate !== destIE && candidate !== emitIE && candidate.length !== 12) {
          destCNPJ = candidate;
        }
      }
    }
  }

  // Se o destCNPJ ainda não foi encontrado ou pegou a IE por engano, buscar em todo o texto
  if (!destCNPJ || destCNPJ === destIE || destCNPJ === emitIE || destCNPJ.length === 12) {
    const allCnpjsInText = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g);
    if (allCnpjsInText && allCnpjsInText.length > 0) {
      // Se tiver mais de um, e o primeiro for o emitente, pegar o segundo (destinatário) ou o primeiro se for a mesma empresa
      destCNPJ = allCnpjsInText.length > 1 ? allCnpjsInText[1].replace(/\D/g, '') : allCnpjsInText[0].replace(/\D/g, '');
    }
  }

  // Se o destinatário for da mesma empresa do emitente (ex: São Martinho, remessa para exportação, transferência, etc)
  if (!destCNPJ || destCNPJ === destIE || destCNPJ === emitIE || destCNPJ.length === 12) {
    if (emitCNPJRaw && emitCNPJRaw.length === 14) {
      destCNPJ = emitCNPJRaw;
    }
  }

  if (!destIE && emitIE) {
    destIE = emitIE;
  }

  // Se não foi encontrado nome de destinatário ou ficou genérico/sujo
  destNome = sanitizeDestinatarioNome(destNome, destCNPJ, text);

  // Format CNPJs
  const emitCNPJFormatted = formatCNPJStr(emitCNPJRaw);
  const destCNPJFormatted = formatCNPJStr(destCNPJ);

  // Pre-processar texto para corrigir quebras de números separadas por quebra de linha ou espaço
  // Ex: "47.420,0\n0" -> "47.420,00", "47.420,0 0" -> "47.420,00"
  const cleanedText = text
    .replace(/(\d{1,3}(?:\.\d{3})+,\d{1,3})\s*[\r\n]+\s*(\d+)\b/g, '$1$2')
    .replace(/(\b\d+,\d{1,3})\s*[\r\n]+\s*(\d+)\b/g, '$1$2')
    .replace(/(\d{1,3}(?:\.\d{3})+)\s*,\s*[\r\n]+\s*(\d+)\b/g, '$1,$2')
    .replace(/(\d{1,3}(?:\.\d{3})+,\d)\s+(\d)\b/g, '$1$2')
    .replace(/(\b\d+,\d)\s+(\d)\b/g, '$1$2');

  // 5. Quantidade / Peso / Valor Total
  let prodQCom = 0;
  let prodVProd = 0;

  // Valor Total da Nota
  const vNFMatch = cleanedText.match(/(?:VALOR TOTAL DA NOTA|VALOR TOTAL DOS PRODUTOS|VALOR TOTAL)[^\d]{1,20}(\d[\d\.]*,\d{2})/i);
  if (vNFMatch) {
    prodVProd = parseFloat(cleanNumeric(vNFMatch[1]));
  }

  // Quantidade / Peso Líquido / Peso Bruto
  let transpPesoLStr = '';
  let transpPesoBStr = '';

  // 1. Extrair região do Transportador / Volumes (cortando estritamente antes da tabela de produtos)
  let transpText = '';
  const transpMatch = cleanedText.match(/(?:TRANSPORTADOR|VOLUMES\s+TRANSPORTADOS|PESO\s+BRUTO|PESO\s+(?:LÍQUIDO|LIQUIDO))[\s\S]{1,600}/i);
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

    // Busca por rótulo direto PESO LÍQUIDO e PESO BRUTO
    const netLabelMatch = transpTextClean.match(/PESO\s+(?:LÍQUIDO|LIQUIDO|LIQ)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)/i);
    const grossLabelMatch = transpTextClean.match(/PESO\s+BRUTO\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)/i);

    if (netLabelMatch) transpPesoLStr = netLabelMatch[1].trim();
    if (grossLabelMatch) transpPesoBStr = grossLabelMatch[1].trim();

    // Se os rótulos não tiverem valores imediatamente adjacentes (ex: cabeçalhos de tabela)
    if (!transpPesoLStr || !transpPesoBStr) {
      const rawNums = transpTextClean.match(/\b\d{1,3}(?:\.\d{3})+,\d{1,4}\b|\b\d{2,6},\d{1,4}\b/g) || [];
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
    const globalNetMatch = cleanedGlobalText.match(/PESO\s+(?:LÍQUIDO|LIQUIDO|LIQ)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d{2,6},\d{1,4}\b)/i);
    if (globalNetMatch) {
      transpPesoLStr = globalNetMatch[1].trim();
    }
  }

  // Garantia física: Peso Líquido jamais pode ser superior ao Peso Bruto
  const numL = transpPesoLStr ? parseFloat(cleanNumeric(transpPesoLStr)) : 0;
  const numB = transpPesoBStr ? parseFloat(cleanNumeric(transpPesoBStr)) : 0;
  if (numL > 0 && numB > 0 && numL > numB) {
    const tmp = transpPesoLStr;
    transpPesoLStr = transpPesoBStr;
    transpPesoBStr = tmp;
  }

  // 3. Definir a Quantidade da Nota (prodQCom) e Unidade (prodUCom)
  // PRIORIDADE ABSOLUTA: Usar o PESO LÍQUIDO da Nota Fiscal como quantidade principal
  let prodUCom = 'KG';
  if (transpPesoLStr) {
    const pL = parseFloat(cleanNumeric(transpPesoLStr));
    if (pL > 0) prodQCom = pL;
  }

  const prodSectionMatch = cleanedText.match(/(?:DADOS\s+DOS?\s+PRODUTOS?|CÓDIGO\s+PRODUTO|DESCRIÇÃO\s+DO\s+PRODUTO)[\s\S]+/i);
  const prodSectionText = prodSectionMatch ? prodSectionMatch[0] : cleanedText;

  // Busca a coluna QUANT / QUANTIDADE na tabela de produtos
  const directQuantMatch = prodSectionText.match(/(?:QUANT(?:IDADE|\.)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b)/i);
  if (directQuantMatch) {
    const qVal = parseFloat(cleanNumeric(directQuantMatch[1]));
    if (qVal > 0 && (prodQCom === 0 || Math.abs(prodQCom - qVal) > 0.01)) {
      prodQCom = qVal;
    }
  }

  // Busca a unidade de medida na tabela de produtos
  const unitMatch = prodSectionText.match(/\b(TON|TONELADA|KG|KGS|SC|SAC|SACO|SACOS|UN|UND|UNID|UNIDADE|CX|CAIXA|M3|L|LITRO|LITROS|BAG|M2|PC|PCT|PACOTE|FD|FARDO)\b\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b)/i);
  if (unitMatch) {
    const rawUnit = unitMatch[1].toUpperCase();
    prodUCom = rawUnit.startsWith('TON') ? 'TON' : rawUnit.substring(0, 6);
    if (prodQCom === 0) {
      const qVal = parseFloat(cleanNumeric(unitMatch[2]));
      if (qVal > 0) prodQCom = qVal;
    }
  }

  // Se ainda não encontrou quantidade, buscar rótulo QUANT / QTD
  if (prodQCom === 0) {
    const quantMatch = prodSectionText.match(/(?:QUANT(?:IDADE)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d+\b)/i);
    if (quantMatch) {
      const qVal = parseFloat(cleanNumeric(quantMatch[1]));
      if (qVal > 0) prodQCom = qVal;
    }
  }

  // Fallback: Se não encontrou na tabela de produtos, usar o Peso Líquido do Transporte
  if (prodQCom === 0 && transpPesoLStr) {
    const pL = parseFloat(cleanNumeric(transpPesoLStr));
    if (pL > 0) prodQCom = pL;
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
  } else if (textUpper.includes('ACUCAR') || textUpper.includes('AÇÚCAR') || textUpper.includes('ACUCAR BRUTO')) {
    prodNome = 'ACUCAR BRUTO, DE CANA, SEM ADICAO DE AROMATIZANTES OU DE CORANTES, TIPO VHP';
  } else if (textUpper.includes('SOJA')) {
    prodNome = 'SOJA EM GRAOS';
  } else if (textUpper.includes('MILHO')) {
    prodNome = 'MILHO EM GRAOS';
  } else if (textUpper.includes('FARELO')) {
    prodNome = 'FARELO DE SOJA';
  }

  let prodNCM = '17011400';
  if (prodNome.includes('SOJA')) prodNCM = '12019000';
  if (prodNome.includes('MILHO')) prodNCM = '10059010';

  let prodCFOP = '5504';
  const cfopMatch = text.match(/\b(5504|5502|6505|5505|5102|6102|5905|6905)\b/);
  if (cfopMatch) {
    prodCFOP = cfopMatch[1];
  }

  // Transportador
  let transpNome = '';
  let transpCNPJ = '';
  let transpPlaca = '';

  if (textUpper.includes('COPERSUCAR')) {
    transpNome = 'COPERSUCAR S.A.';
    transpCNPJ = '10265949004164';
  } else if (textUpper.includes('GUARDIA') || textUpper.includes('GAMA LOGISTICA')) {
    transpNome = 'TRANSPORTADORA GUARDIA - GAMA LOGISTICA LTDA';
    transpCNPJ = '49964752000161';
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
    prodCodigo: '000000000020000011',
    prodNome,
    prodNCM,
    prodCFOP,
    prodUCom,
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
    transpQVol: prodQCom.toString(),
    transpEsp: 'GRANEL',
    transpPesoL: transpPesoLStr || (prodQCom > 0 ? prodQCom.toString() : ''),
    transpPesoB: transpPesoBStr || (prodQCom > 0 ? prodQCom.toString() : ''),
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
  const uppercase = text.toUpperCase();

  // 1. Verificação por códigos/locais conhecidos em notas de exportação/agronegócio
  if (/\bTEAG\b/i.test(text) || uppercase.includes('TERMINAL DE ACUCAR DO GUARUJA') || uppercase.includes('TERMINAL EXPORTACAO DE ACUCAR') || uppercase.includes('TEAG')) {
    return 'TEAG - TERMINAL DE ACUCAR DO GUARUJA';
  }
  if (/\bTEG\b/i.test(text) || uppercase.includes('TERMINAL EXPORTADOR DO GUARUJA') || uppercase.includes('TERM EXP GUARUJA') || uppercase.includes('GUARUJA LTDA GUARUJA')) {
    return 'TEG - TERMINAL EXPORTADOR DO GUARUJA';
  }
  if (/\bTGG\b/i.test(text) || uppercase.includes('TERMINAL DE GRAIS DO GUARUJA') || uppercase.includes('TERMINAL DE GRAOS DO GUARUJA')) {
    return 'TGG - TERMINAL DE GRAIS DO GUARUJA';
  }
  if (/\bTAC\b/i.test(text) || uppercase.includes('TERMINAL DE ARMAZENS')) {
    return 'TAC - TERMINAL DE ARMAZENS';
  }
  if (/\bCLI\b/i.test(text) || uppercase.includes('CORREDOR LOGISTICO INTEGRADO')) {
    return 'CLI - CORREDOR LOGISTICO INTEGRADO';
  }
  if (uppercase.includes('SANTOS BRASIL')) return 'SANTOS BRASIL';
  if (uppercase.includes('DP WORLD')) return 'DP WORLD SANTOS';
  if (uppercase.includes('ECOPORTO')) return 'ECOPORTO SANTOS';
  if (uppercase.includes('BTP') || uppercase.includes('BRASIL TERMINAL PORTUARIO')) return 'BTP - BRASIL TERMINAL PORTUARIO';
  if (uppercase.includes('TIPLAM')) return 'TIPLAM - TERMINAL INTEGRADO';

  // 2. Trazer até 15 primeiras palavras depois de ALFANDEGADO, ALFADEGADO, RECINTO ou ENTREGA
  const regex = /(?:RECINTO\s+ALFANDEGADO|RECINTO\s+ALFADEGADO|ALFANDEGADO|ALFADEGADO|TERMINAL\s+DE\s+ENTREGA|TERMINAL\s+ENTREGA|LOCAL\s+DE\s+ENTREGA|LOCAL\s+DE\s+DESCARGA|DESCARGA\s+NO\s+RECINTO|TERMINAL\s+EXPORTADOR|ENTREGA\s+EM|TERMINAL|ENTREGA)\s*[:=-]?\s*([\s\S]{1,500})/i;
  const match = text.match(regex);
  if (match && match[1]) {
    let chunk = match[1].trim();
    chunk = chunk.replace(/^(?:EM|DE|NO|NA|SERA|SERÁ|RECINTO|ALFANDEGADO|ALFADEGADO)\s*[:=-]?\s*/i, '');
    const stopKeywords = [
      "TRANSBORDO", "RETIRADA", "PLACA", "MOTORISTA", "CONTRATO",
      "DESTINO", "CNPJ", "CPF", "OBS", "VALOR", "PESO", "QTD", "QUANTIDADE",
      "TICKET", "NAVIO", "SAFRA", "PEDIDO", "NOTA FISCAL", "CHAVE", "DATA", "CEP", "IE"
    ];
    for (const kw of stopKeywords) {
      const idx = chunk.toUpperCase().indexOf(kw);
      if (idx > 0) {
        chunk = chunk.substring(0, idx).trim();
      }
    }
    const words = chunk.split(/\s+/).filter(Boolean).slice(0, 15);
    let val = words.join(' ').replace(/[:=\-.,;]+$/, '').trim();
    if (val.length > 2 && !/^\d+$/.test(val)) {
      return val;
    }
  }

  if (uppercase.includes('GUARUJA') || uppercase.includes('GUARUJÁ')) return 'TEG - TERMINAL EXPORTADOR DO GUARUJA';
  if (uppercase.includes('SANTOS')) return 'TERMINAL SANTOS';

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
