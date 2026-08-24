import { GoogleGenAI, Type } from "@google/genai";
import { auditarHeuristicaLocal, type WeightAuditItemInput } from "../../src/lib/weight-ai-auditor";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
};

let genAiClient: GoogleGenAI | null = null;
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!genAiClient && apiKey) {
    genAiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAiClient;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const items: WeightAuditItemInput[] = body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Nenhum item informado para conferência de peso." });
    }

    const ai = getGenAI();

    // Se a chave GEMINI_API_KEY não estiver configurada nas variáveis da Vercel, usa heurística local
    if (!ai) {
      const fallbackResults = items.map(auditarHeuristicaLocal);
      return res.status(200).json({
        totalAuditados: fallbackResults.length,
        totalErrosLeitura: fallbackResults.filter((r) => r.status === "ERRO_LEITURA_SISTEMA").length,
        totalDivergenciasReais: fallbackResults.filter((r) => r.status === "DIVERGENCIA_REAL").length,
        totalConferidos: fallbackResults.filter((r) => r.status === "CONFERIDO_CORRETO").length,
        resultados: fallbackResults,
        tokensUtilizadosEstimados: 0,
        provedor: "HEURISTICA_INTELIGENTE",
        aviso: "GEMINI_API_KEY não configurada no ambiente Vercel. Processado com motor heurístico local.",
      });
    }

    const BATCH_SIZE = 50;
    const allAiParsedResults: any[] = [];
    let estimatedTokensTotal = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const promptPayload = batch.map((it) => ({
        id: it.id,
        identificador: it.identificador,
        numeroApenas: it.numeroApenas,
        pesoDocumentoLido: it.pesoMDF !== undefined ? `${it.pesoMDF} t` : "Não identificado",
        pesoExcelInformado: it.pesoExcel !== undefined ? `${it.pesoExcel} t` : "Não informado",
        diferencaApontada: it.diferencaPeso !== undefined ? `${it.diferencaPeso} t` : "N/A",
        trechoDocumentoOriginal: it.trechoTextoDocumento ? it.trechoTextoDocumento.substring(0, 1000) : "Sem trecho disponível",
        linhaExcel: it.linhaExcel || "N/A",
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
            systemInstruction:
              "Você é um auditor fiscal de pesagem e documentos fiscais preciso e analítico. Localize com precisão o valor real da coluna QUANT / QUANTIDADE da DANFE. Retorne estritamente um array JSON com todos os itens analisados.",
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
                    enum: ["ERRO_LEITURA_SISTEMA", "DIVERGENCIA_REAL", "PESO_AUSENTE_NO_DOC", "CONFERIDO_CORRETO"],
                  },
                  veredito: { type: Type.STRING, description: "Resumo em 1 linha com o valor real encontrado na coluna QUANT" },
                  pesoCorrigidoDoc: {
                    type: Type.NUMBER,
                    description: "Valor real da quantidade / peso em toneladas (t) extraído da coluna QUANT / Peso Líquido da DANFE",
                  },
                  pesoExcel: { type: Type.NUMBER, description: "Peso em toneladas informado na planilha" },
                  diferencaReal: { type: Type.NUMBER, description: "Diferença real entre o peso real do documento e o peso do Excel" },
                  explicacao: {
                    type: Type.STRING,
                    description: "Explicação clara indicando como o valor foi localizado na coluna QUANT e o que causou a divergência",
                  },
                  confianca: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
                },
                required: ["id", "identificador", "status", "veredito", "explicacao", "confianca"],
              },
            },
          },
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
        console.error("Erro no processamento do lote Gemini na Vercel:", batchErr);
        const fallbackBatch = batch.map(auditarHeuristicaLocal);
        allAiParsedResults.push(...fallbackBatch);
      }
    }

    const resultados = items.map((it) => {
      const aiResult = allAiParsedResults.find((r: any) => r.id === it.id || r.identificador === it.identificador);
      if (aiResult) {
        return {
          id: it.id,
          identificador: it.identificador,
          status: aiResult.status || "DIVERGENCIA_REAL",
          veredito: aiResult.veredito || "Conferido com IA",
          pesoCorrigidoDoc:
            aiResult.pesoCorrigidoDoc !== undefined && aiResult.pesoCorrigidoDoc !== null
              ? Number(aiResult.pesoCorrigidoDoc)
              : it.pesoMDF,
          pesoExcel:
            aiResult.pesoExcel !== undefined && aiResult.pesoExcel !== null
              ? Number(aiResult.pesoExcel)
              : it.pesoExcel,
          diferencaReal:
            aiResult.diferencaReal !== undefined && aiResult.diferencaReal !== null
              ? Number(aiResult.diferencaReal)
              : it.diferencaPeso,
          explicacao: aiResult.explicacao || "Analisado com modelo Gemini 3.7 Flash.",
          confianca: aiResult.confianca || "ALTA",
          modoUtilizado: "GEMINI_IA" as const,
        };
      }
      return auditarHeuristicaLocal(it);
    });

    return res.status(200).json({
      totalAuditados: resultados.length,
      totalErrosLeitura: resultados.filter((r: any) => r.status === "ERRO_LEITURA_SISTEMA").length,
      totalDivergenciasReais: resultados.filter((r: any) => r.status === "DIVERGENCIA_REAL").length,
      totalConferidos: resultados.filter((r: any) => r.status === "CONFERIDO_CORRETO").length,
      resultados,
      tokensUtilizadosEstimados: estimatedTokensTotal || 100 + resultados.length * 90,
      provedor: "GEMINI_3_7_FLASH",
    });
  } catch (err: any) {
    console.error("Erro geral no handler Vercel /api/gemini/verify-weight-divergence:", err);
    const items: WeightAuditItemInput[] = req.body?.items || [];
    const fallbackResults = Array.isArray(items) ? items.map(auditarHeuristicaLocal) : [];
    return res.status(200).json({
      totalAuditados: fallbackResults.length,
      totalErrosLeitura: fallbackResults.filter((r) => r.status === "ERRO_LEITURA_SISTEMA").length,
      totalDivergenciasReais: fallbackResults.filter((r) => r.status === "DIVERGENCIA_REAL").length,
      totalConferidos: fallbackResults.filter((r) => r.status === "CONFERIDO_CORRETO").length,
      resultados: fallbackResults,
      tokensUtilizadosEstimados: 0,
      provedor: "HEURISTICA_INTELIGENTE",
      aviso: "Processado com motor de auditoria heurística local após falha na requisição.",
    });
  }
}
