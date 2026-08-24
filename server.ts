import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { PDFParse } from "pdf-parse";
import { GoogleGenAI, Type } from "@google/genai";
import { parseDanfeText, parseMultiDanfePdf } from "./src/lib/pdf-text-parser";
import { auditarHeuristicaLocal } from "./src/lib/weight-ai-auditor";
import { auditarLogisticaHeuristicaLocal } from "./src/lib/logistics-ai-auditor";

dotenv.config();

const app = express();
const PORT = 3000;

// Instância preguiçosa do cliente Gemini AI com cabeçalho de telemetria exigido
let genAiClient: GoogleGenAI | null = null;
function getGenAI() {
  if (!genAiClient && process.env.GEMINI_API_KEY) {
    genAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiClient;
}

// Configurar o parser para aumentar o limite do tamanho dos corpos JSON (PDFs codificados em base64)
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Helper para limpar caracteres de controle inválidos em strings extraídas de PDFs
function cleanControlChars(val: any): any {
  if (typeof val === 'string') {
    return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  if (Array.isArray(val)) {
    return val.map(cleanControlChars);
  }
  if (val && typeof val === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(val)) {
      cleaned[key] = cleanControlChars(val[key]);
    }
    return cleaned;
  }
  return val;
}

// Endpoint de saúde
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint da API para converter PDF em XML de NF-e usando Regras Locais (Processamento Local e 100% Gratuito)
app.post("/api/pdf-to-xml", async (req, res, next) => {
  try {
    const { fileBase64, fileName } = req.body || {};

    if (!fileBase64) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado no corpo da requisição." });
    }

    // Processamento local ultra rápido baseado em regras e extração de texto
    const pdfBuffer = Buffer.from(fileBase64, "base64");
    
    let text = "";
    let pages: { num: number; text: string }[] = [];

    try {
      const parser = new PDFParse({ data: pdfBuffer });
      try {
        const textResult = await parser.getText();
        text = textResult?.text || "";
        pages = (textResult?.pages as any) || [];
      } finally {
        await parser.destroy();
      }
    } catch (pdfErr: any) {
      console.error(`Erro ao ler buffer do PDF ${fileName}:`, pdfErr);
      return res.status(400).json({
        error: `Não foi possível extrair o texto do PDF "${fileName}". O arquivo pode estar protegido, corrompido ou em formato incompatível.`
      });
    }

    const { items, xml, data } = parseMultiDanfePdf(text, fileName, pages);
    const responseData = cleanControlChars({
      xml: xml,
      fileName: fileName ? fileName.replace(/\.pdf$/i, ".xml") : "convertido.xml",
      parsedData: data,
      items: items,
    });
    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error("Erro geral na rota de conversão:", err);
    return res.status(500).json({ error: err.message || "Erro ao processar conversão do PDF." });
  }
});

// Endpoint genérico para extração de texto de PDFs (DANFE, MDF-e, Conhecimento de Transporte, etc.)
app.post("/api/parse-pdf-text", async (req, res) => {
  try {
    const { fileBase64, fileName } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ error: "Nenhum arquivo PDF enviado no corpo da requisição." });
    }

    const pdfBuffer = Buffer.from(fileBase64, "base64");
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const textResult = await parser.getText();
      const text = textResult?.text || "";
      const pages = (textResult?.pages as any) || [];
      return res.status(200).json({
        text,
        pages,
        fileName: fileName || "documento.pdf",
      });
    } finally {
      await parser.destroy();
    }
  } catch (err: any) {
    console.error(`Erro ao extrair texto do PDF ${req.body?.fileName}:`, err);
    return res.status(500).json({ error: err.message || "Erro ao extrair texto do PDF." });
  }
});

// Endpoint de Auditoria IA para Divergências de Peso (MDF-e / NF-e vs Excel)
// Processa TODAS as notas/vagões com divergência para identificar com precisão o valor real e a causa
app.post("/api/gemini/verify-weight-divergence", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Nenhum item informado para conferência de peso." });
    }

    const ai = getGenAI();

    // Se a IA não estiver configurada no ambiente, usa o motor de auditoria heurística local completo
    if (!ai) {
      const fallbackResults = items.map(auditarHeuristicaLocal);
      return res.json({
        totalAuditados: fallbackResults.length,
        totalErrosLeitura: fallbackResults.filter(r => r.status === 'ERRO_LEITURA_SISTEMA').length,
        totalDivergenciasReais: fallbackResults.filter(r => r.status === 'DIVERGENCIA_REAL').length,
        totalConferidos: fallbackResults.filter(r => r.status === 'CONFERIDO_CORRETO').length,
        resultados: fallbackResults,
        tokensUtilizadosEstimados: 0,
        provedor: 'HEURISTICA_INTELIGENTE',
        nota: 'Processado com motor de auditoria heurística local de alta precisão.',
      });
    }

    // Processa TODOS os itens sem corte de limite arbitrário (em lotes de até 50 para estabilidade de resposta)
    const BATCH_SIZE = 50;
    const allAiParsedResults: any[] = [];
    let estimatedTokensTotal = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const promptPayload = batch.map(it => ({
        id: it.id,
        identificador: it.identificador,
        numeroApenas: it.numeroApenas,
        pesoDocumentoLido: it.pesoMDF !== undefined ? `${it.pesoMDF} t` : 'Não identificado',
        pesoExcelInformado: it.pesoExcel !== undefined ? `${it.pesoExcel} t` : 'Não informado',
        diferencaApontada: it.diferencaPeso !== undefined ? `${it.diferencaPeso} t` : 'N/A',
        trechoDocumentoOriginal: it.trechoTextoDocumento ? it.trechoTextoDocumento.substring(0, 1000) : 'Sem trecho disponível',
        linhaExcel: it.linhaExcel || 'N/A',
        dadosExcelRaw: it.dadosExcelRaw || {},
      }));

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: `Você é um Auditor Sênior Especialista em Pesagem Fiscal, Transporte Ferroviário e Rodoviário (MDF-e / NF-e vs Planilha Excel).
Sua missão fundamental é conferir TODAS as notas/vagões com divergência para ACHAR O VALOR REAL DA QUANTIDADE / PESO focando diretamente no campo "QUANT" / "QUANTIDADE" da DANFE.

=======================================================
DIRETRIZES FUNDAMENTAIS PARA O CAMPO "QUANT" / "QUANTIDADE":
=======================================================
1) CAMPO ALVO OBRIGATÓRIO: Olhe expressamente para a coluna "QUANT" (ou "QUANTIDADE" / "QTD") da tabela de Dados dos Produtos/Serviços da DANFE (onde constam colunas típicas como: CÓDIGO | DESCRIÇÃO | NCM | CST | CFOP | UN | QUANT | VALOR UNIT | VALOR TOTAL).
2) QUEBRAS DE LINHA NO CAMPO QUANT: Em muitos layouts de DANFE, o último dígito decimal quebra para a linha de baixo (exemplo real: a coluna exibe "47.420,0" na primeira linha e "0" na linha de baixo -> o valor real da quantidade é 47.420,00 kg / 47.420 t). Se o sistema leu "47.42" ou truncou o zero, localize o valor integral "47.420".
3) UNIDADE DE MEDIDA (UN):
   - Se UN for KG ou QUILOS e QUANT for "47.420,00", o peso real em toneladas é 47.420 t.
   - Se UN for TON, T ou TONELADAS e QUANT for "47.420,00" ou "47.420", o peso real é 47.420 t.
4) DADOS DO TRANSPORTE: Verifique também o campo "PESO LÍQUIDO" e "PESO BRUTO" na seção de Transportador/Volumes Transportados para validar a consistência com o campo QUANT.

Classificação de Status:
1) "ERRO_LEITURA_SISTEMA": Se o algoritmo de extração cometeu uma falha ao ler o PDF/texto (por exemplo: perdeu o último decimal por quebra de linha na coluna QUANT como 47.420,0 + 0 = 47.420,00, leu unidade em kg em vez de toneladas, truncou 74.66 em vez de 74.660, ou cortou zeros à direita). Encontre no campo QUANT / Peso Líquido o valor REAL exato e preencha "pesoCorrigidoDoc" com a quantidade real em toneladas (t).
2) "DIVERGENCIA_REAL": O documento fiscal declara expressamente no campo QUANT / Peso Líquido um valor X e a planilha Excel declara um peso Y diferente (divergência física/comercial real na pesagem ou digitação). Indique o peso real declarado no documento em "pesoCorrigidoDoc".
3) "PESO_AUSENTE_NO_DOC": O documento realmente não contém quantidade nem peso declarado em nenhum campo.
4) "CONFERIDO_CORRETO": Os pesos estão alinhados quando convertidos para a mesma unidade ou consideradas as casas decimais corretas.

Seja analítico e encontre o valor real da quantidade em toneladas (t) com até 3 casas decimais.

Dados a auditar:
${JSON.stringify(promptPayload, null, 2)}`,
          config: {
            systemInstruction: "Você é um auditor fiscal de pesagem e documentos fiscais preciso e analítico. Localize com precisão o valor real da coluna QUANT / QUANTIDADE da DANFE. Retorne estritamente um array JSON com todos os itens analisados.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  identificador: { type: Type.STRING },
                  status: {
                    type: Type.STRING,
                    enum: ["ERRO_LEITURA_SISTEMA", "DIVERGENCIA_REAL", "PESO_AUSENTE_NO_DOC", "CONFERIDO_CORRETO"]
                  },
                  veredito: { type: Type.STRING, description: "Resumo em 1 linha com o valor real encontrado na coluna QUANT" },
                  pesoCorrigidoDoc: { type: Type.NUMBER, description: "Valor real da quantidade / peso em toneladas (t) extraído da coluna QUANT / Peso Líquido da DANFE" },
                  pesoExcel: { type: Type.NUMBER, description: "Peso em toneladas informado na planilha" },
                  diferencaReal: { type: Type.NUMBER, description: "Diferença real entre o peso real do documento e o peso do Excel" },
                  explicacao: { type: Type.STRING, description: "Explicação clara indicando como o valor foi localizado na coluna QUANT e o que causou a divergência" },
                  confianca: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] }
                },
                required: ["id", "identificador", "status", "veredito", "explicacao", "confianca"]
              }
            }
          }
        });

        let parsedJson: any[] = [];
        try {
          parsedJson = JSON.parse(response.text || "[]");
        } catch (parseErr) {
          console.warn("Erro ao fazer parse do JSON do Gemini no lote:", parseErr, response.text);
        }

        allAiParsedResults.push(...parsedJson);
        estimatedTokensTotal += 100 + batch.length * 90;
      } catch (batchErr) {
        console.error("Erro no processamento do lote Gemini:", batchErr);
        // Em caso de erro no lote, gera o fallback heurístico para os itens desse lote
        const fallbackBatch = batch.map(auditarHeuristicaLocal);
        allAiParsedResults.push(...fallbackBatch);
      }
    }

    const resultados = items.map(it => {
      const aiResult = allAiParsedResults.find((r: any) => r.id === it.id || r.identificador === it.identificador);
      if (aiResult) {
        return {
          id: it.id,
          identificador: it.identificador,
          status: aiResult.status || 'DIVERGENCIA_REAL',
          veredito: aiResult.veredito || 'Conferido com IA',
          pesoCorrigidoDoc: aiResult.pesoCorrigidoDoc !== undefined && aiResult.pesoCorrigidoDoc !== null ? Number(aiResult.pesoCorrigidoDoc) : it.pesoMDF,
          pesoExcel: aiResult.pesoExcel !== undefined && aiResult.pesoExcel !== null ? Number(aiResult.pesoExcel) : it.pesoExcel,
          diferencaReal: aiResult.diferencaReal !== undefined && aiResult.diferencaReal !== null ? Number(aiResult.diferencaReal) : it.diferencaPeso,
          explicacao: aiResult.explicacao || 'Analisado com modelo Gemini 3.7 Flash.',
          confianca: aiResult.confianca || 'ALTA',
          modoUtilizado: 'GEMINI_IA' as const,
        };
      }
      return auditarHeuristicaLocal(it);
    });

    return res.json({
      totalAuditados: resultados.length,
      totalErrosLeitura: resultados.filter((r: any) => r.status === 'ERRO_LEITURA_SISTEMA').length,
      totalDivergenciasReais: resultados.filter((r: any) => r.status === 'DIVERGENCIA_REAL').length,
      totalConferidos: resultados.filter((r: any) => r.status === 'CONFERIDO_CORRETO').length,
      resultados,
      tokensUtilizadosEstimados: estimatedTokensTotal || (100 + resultados.length * 90),
      provedor: 'GEMINI_3_7_FLASH',
    });
  } catch (err: any) {
    console.error("Erro na rota /api/gemini/verify-weight-divergence:", err);
    const { items } = req.body || {};
    const fallbackResults = Array.isArray(items) ? items.map(auditarHeuristicaLocal) : [];
    return res.json({
      totalAuditados: fallbackResults.length,
      totalErrosLeitura: fallbackResults.filter(r => r.status === 'ERRO_LEITURA_SISTEMA').length,
      totalDivergenciasReais: fallbackResults.filter(r => r.status === 'DIVERGENCIA_REAL').length,
      totalConferidos: fallbackResults.filter(r => r.status === 'CONFERIDO_CORRETO').length,
      resultados: fallbackResults,
      tokensUtilizadosEstimados: 0,
      provedor: 'HEURISTICA_INTELIGENTE',
      aviso: 'Processado com motor de auditoria heurística local.',
    });
  }
});

// Endpoint de Auditoria e Preenchimento de Logística (Terminal, Transbordo, Destinatário) com Gemini 3.7 Flash
app.post("/api/gemini/audit-logistics", async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array de 'items' é obrigatório." });
    }

    const ai = getGenAI();
    if (!ai) {
      const fallbackResults = items.map(auditarLogisticaHeuristicaLocal);
      const totalAjustados = fallbackResults.filter(r => r.camposAjustados.length > 0).length;
      return res.json({
        totalAuditados: fallbackResults.length,
        totalAjustados,
        totalSemDados: fallbackResults.length - totalAjustados,
        resultados: fallbackResults,
        tokensUtilizadosEstimados: 0,
        provedor: 'HEURISTICA_INTELIGENTE',
        nota: 'Processado com motor de auditoria heurística local de alta precisão.',
      });
    }

    const BATCH_SIZE = 40;
    const allAiParsedResults: any[] = [];
    let estimatedTokensTotal = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const promptPayload = batch.map(it => ({
        id: it.id,
        numero: it.numero,
        serie: it.serie,
        chave: it.chave,
        emitenteAtual: it.emitNome || 'Não informado',
        destinatarioAtual: it.destNome || 'Não informado',
        destinatarioCNPJ: it.destCNPJ || '',
        terminalAtual: it.terminal || 'Não informado',
        transbordoAtual: it.transbordo || 'Não informado',
        produtoAtual: it.produto || 'Não informado',
        retiradaAtual: it.retirada || 'Não informado',
        informacoesComplementares: (it.infCpl || '').substring(0, 1500),
        trechoDocumentoOriginal: (it.rawSnippet || '').substring(0, 2000),
      }));

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: `Você é um Auditor Sênior Especialista em Logística Portuária, Ferroviária e Fiscal de DANFE/NF-e (Exportação de Açúcar, Grãos, Soja, Milho, Farelo e Cargas Industriais).
Sua missão fundamental é analisar as notas fiscais onde TERMINAL DE ENTREGA, TRANSBORDO ou DESTINATÁRIO estão "Não Informado" e ENCONTRAR OS VALORES REAIS declarados no texto da DANFE/Informações Complementares para ajustar o Dashboard.

=======================================================
REGRAS E PADRÕES DE MAPEAMENTO LOGÍSTICO:
=======================================================
1) TERMINAIS DE ENTREGA (Especialmente Porto de Santos e Terminais de Exportação):
   - "TEAG - TERMINAL DE ACUCAR DO GUARUJA" (se mencionar TEAG, Term. Açúcar Guarujá, Terminal Exportação Açúcar)
   - "TEG - TERMINAL EXPORTADOR DO GUARUJA" (se mencionar TEG, Terminal Exportadores Grande, Term. Exportador Guarujá)
   - "CLI - CORREDOR LOGÍSTICA INTEGRADA" (se mencionar CLI, Corredor Logístico Integrado, Termares)
   - "TGG - TERMINAL DE GRAOS DO GUARUJA" (se mencionar TGG, Grãos do Guarujá)
   - "TERMINAL 124" (se mencionar T-124, T124, Terminal 124)
   - "SANTOS BRASIL" (se mencionar Santos Brasil, Tecon Santos)
   - "DP WORLD SANTOS" (se mencionar DP World, Embraport)
   - "BTP - BRASIL TERMINAL PORTUARIO" (se mencionar BTP)
   - "ECOPORTO SANTOS" (se mencionar Ecoporto)
   - "TIPLAM - TERMINAL INTEGRADO" (se mencionar TIPLAM, VLI Tiplam)
   - "TERMINAL RUMO" (se mencionar Rumo, Terminal Rumo Malha)
   - "TERMINAL VLI" (se mencionar VLI)

2) TRANSBORDOS E PÁTIOS RODOFERROVIÁRIOS:
   - "ITURAMA" (se mencionar Iturama, Pátio Iturama)
   - "PRADOPOLIS" (se mencionar Pradópolis, Pradopolis, ZXE, Usina São Martinho Pradópolis)
   - "ALTO TAQUARI" ou "NOVA AGRI - ALTO TAQUARI" (se mencionar Alto Taquari, Nova Agri)
   - "RONDONOPOLIS (RUMO)" (se mencionar Rondonópolis, Rondonopolis, Malha Norte)
   - "RIO VERDE" (se mencionar Rio Verde)
   - "ARAGUARI (VLI)" (se mencionar Araguari)
   - "UBERABA" (se mencionar Uberaba, TIUB)
   - "PEDERNEIRAS (RUMO)" (se mencionar Pederneiras)
   - "GUARA" (se mencionar Guará, Guara)
   - "UBERLANDIA", "SAO SIMAO", "CHAPADAO DO SUL", "INOCENCIA", "ITIQUIRA", "RIO PRETO"

3) DESTINATÁRIO (Identificar quando não preenchido ou genérico):
   - Razões sociais comuns: "S/A USINA CORURIPE ACUCAR E ALCOOL", "CARGILL AGRICOLA SA", "COPERSUCAR S.A.", "RAIZEN ENERGIA S.A.", "USINA SAO MARTINHO S/A", "ADECOAGRO VALE DO IVINHEMA S.A.", "USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL", "USINA SANTA TEREZINHA LTDA", "USINA BATATAIS S/A ACUCAR E ALCOOL", "TEREOS ACUCAR E ENERGIA BRASIL S.A.", "BP BUNGE BIOENERGIA S.A.", "COFCO INTERNATIONAL BRASIL S.A.", "LOUIS DREYFUS COMPANY BRASIL S.A.", "AMAGGI EXPORTACAO E IMPORTACAO LTDA", "ADM DO BRASIL LTDA", etc.

Analise cada nota com atenção aos campos infCpl e trechoDocumentoOriginal. Se encontrar dados novos para preencher ou corrigir, informe os valores.

Dados a auditar:
${JSON.stringify(promptPayload, null, 2)}`,
          config: {
            systemInstruction: "Você é um auditor logístico e fiscal analítico e infalível. Localize terminais, transbordos e destinatários reais a partir do texto do documento. Retorne estritamente um array JSON com todos os itens analisados.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  terminalCorrigido: { type: Type.STRING, description: "Nome normalizado do Terminal de Entrega identificado no documento, ou vazio se não houver" },
                  transbordoCorrigido: { type: Type.STRING, description: "Nome do Transbordo/Pátio identificado no documento, ou vazio se não houver" },
                  destinatarioCorrigido: { type: Type.STRING, description: "Nome/Razão Social real do Destinatário identificado no documento, ou vazio se não houver" },
                  produtoCorrigido: { type: Type.STRING, description: "Nome do Produto identificado no documento, ou vazio se não houver" },
                  retiradaCorrigida: { type: Type.STRING, description: "Local de Retirada identificado no documento, ou vazio se não houver" },
                  status: {
                    type: Type.STRING,
                    enum: ["AJUSTADO_IA", "PARCIALMENTE_AJUSTADO", "DADOS_JA_COMPLETOS", "NAO_CONSTA_NO_DOC"]
                  },
                  veredito: { type: Type.STRING, description: "Resumo em 1 linha dos dados encontrados" },
                  explicacao: { type: Type.STRING, description: "Explicação objetiva de onde os dados foram encontrados no documento fiscal" },
                  confianca: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] }
                },
                required: ["id", "status", "veredito", "explicacao", "confianca"]
              }
            }
          }
        });

        let parsedJson: any[] = [];
        try {
          parsedJson = JSON.parse(response.text || "[]");
        } catch (parseErr) {
          console.warn("Erro ao fazer parse do JSON do Gemini no lote de logística:", parseErr, response.text);
        }

        allAiParsedResults.push(...parsedJson);
        estimatedTokensTotal += 120 + batch.length * 100;
      } catch (batchErr) {
        console.error("Erro no processamento do lote Gemini de logística:", batchErr);
        const fallbackBatch = batch.map(auditarLogisticaHeuristicaLocal);
        allAiParsedResults.push(...fallbackBatch);
      }
    }

    const resultados = items.map(it => {
      const aiResult = allAiParsedResults.find((r: any) => r.id === it.id);
      if (aiResult) {
        const camposAjustados: Array<'terminal' | 'transbordo' | 'destinatario' | 'retirada' | 'produto'> = [];
        if (aiResult.terminalCorrigido && (!it.terminal || /N[AÃ]O\s*INFORMADO/i.test(it.terminal))) {
          camposAjustados.push('terminal');
        }
        if (aiResult.transbordoCorrigido && (!it.transbordo || /N[AÃ]O\s*INFORMADO/i.test(it.transbordo))) {
          camposAjustados.push('transbordo');
        }
        if (aiResult.destinatarioCorrigido && (!it.destNome || /N[AÃ]O\s*INFORMADO|N[AÃ]O\s*IDENTIFICADO/i.test(it.destNome))) {
          camposAjustados.push('destinatario');
        }
        if (aiResult.produtoCorrigido && (!it.produto || /OUTRO|N[AÃ]O\s*INFORMADO/i.test(it.produto))) {
          camposAjustados.push('produto');
        }

        const isAjustado = camposAjustados.length > 0;
        return {
          id: it.id,
          numero: it.numero,
          terminalCorrigido: aiResult.terminalCorrigido || it.terminal,
          transbordoCorrigido: aiResult.transbordoCorrigido || it.transbordo,
          destinatarioCorrigido: aiResult.destinatarioCorrigido || it.destNome,
          retiradaCorrigida: aiResult.retiradaCorrigida || it.retirada,
          produtoCorrigido: aiResult.produtoCorrigido || it.produto,
          status: isAjustado ? (aiResult.status || 'AJUSTADO_IA') : 'NAO_CONSTA_NO_DOC',
          veredito: aiResult.veredito || (isAjustado ? 'Dados Identificados pela IA' : 'Sem alterações adicionais'),
          explicacao: aiResult.explicacao || 'Analisado com modelo Gemini 3.7 Flash.',
          confianca: aiResult.confianca || 'ALTA',
          modoUtilizado: 'GEMINI_IA' as const,
          camposAjustados,
        };
      }
      return auditarLogisticaHeuristicaLocal(it);
    });

    const totalAjustados = resultados.filter((r: any) => r.camposAjustados.length > 0).length;

    return res.json({
      totalAuditados: resultados.length,
      totalAjustados,
      totalSemDados: resultados.length - totalAjustados,
      resultados,
      tokensUtilizadosEstimados: estimatedTokensTotal || (120 + resultados.length * 100),
      provedor: 'GEMINI_3_7_FLASH',
    });
  } catch (err: any) {
    console.error("Erro na rota /api/gemini/audit-logistics:", err);
    const { items } = req.body || {};
    const fallbackResults = Array.isArray(items) ? items.map(auditarLogisticaHeuristicaLocal) : [];
    const totalAjustados = fallbackResults.filter(r => r.camposAjustados.length > 0).length;
    return res.json({
      totalAuditados: fallbackResults.length,
      totalAjustados,
      totalSemDados: fallbackResults.length - totalAjustados,
      resultados: fallbackResults,
      tokensUtilizadosEstimados: 0,
      provedor: 'HEURISTICA_INTELIGENTE',
      aviso: 'Processado com motor de auditoria heurística local.',
    });
  }
});

// Middleware global para garantia de resposta em JSON em caso de erro no Express
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Express Error Handler]", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || "Erro no servidor ao processar requisição.",
  });
});

// Configurar o Vite como middleware para servir a aplicação React em desenvolvimento
// Em produção, servirá os arquivos estáticos compilados na pasta 'dist'
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Rodando em http://localhost:${PORT}`);
  });
}

startServer();
