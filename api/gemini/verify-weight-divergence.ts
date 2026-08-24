import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
  maxDuration: 60,
};

// Interface autossuficiente (sem dependência externa de src/)
export interface WeightAuditItemInput {
  id: string;
  identificador: string;
  numeroApenas: string;
  serie?: string;
  pesoMDF?: number;
  pesoExcel?: number;
  diferencaPeso?: number;
  trechoTextoDocumento?: string;
  linhaExcel?: number;
  dadosExcelRaw?: Record<string, any> | string;
}

export type VereditoTipo = "ERRO_LEITURA_SISTEMA" | "DIVERGENCIA_REAL" | "PESO_AUSENTE_NO_DOC" | "CONFERIDO_CORRETO";

export interface WeightAuditItemResult {
  id: string;
  identificador: string;
  status: VereditoTipo;
  veredito: string;
  pesoCorrigidoDoc?: number | null;
  pesoExcel?: number | null;
  diferencaReal?: number | null;
  explicacao: string;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  modoUtilizado: "GEMINI_IA" | "HEURISTICA_LOCAL";
}

export function auditarHeuristicaLocal(item: WeightAuditItemInput): WeightAuditItemResult {
  const { identificador, pesoMDF, pesoExcel, trechoTextoDocumento = "" } = item;
  const cleanSnippet = trechoTextoDocumento.replace(/\s+/g, " ");

  let pesoCorrigidoDoc: number | null = pesoMDF ?? null;
  let status: VereditoTipo = "DIVERGENCIA_REAL";
  let explicacao = "";
  let veredito = "";
  let confianca: "ALTA" | "MEDIA" | "BAIXA" = "MEDIA";

  // Caso 1: Ambos os pesos coincidem
  if (pesoMDF !== undefined && pesoExcel !== undefined && Math.abs(pesoMDF - pesoExcel) <= 0.005) {
    return {
      id: item.id,
      identificador,
      status: "CONFERIDO_CORRETO",
      veredito: "Pesos Conferidos e Alinhados",
      pesoCorrigidoDoc: pesoMDF,
      pesoExcel,
      diferencaReal: 0,
      explicacao: "O peso lido no documento coincide com o peso informado no Excel.",
      confianca: "ALTA",
      modoUtilizado: "HEURISTICA_LOCAL",
    };
  }

  // Caso Especial Prioritário: Campo QUANT / QUANTIDADE da DANFE
  const quantRegex = /(?:QUANT(?:IDADE|\.)?|QTD)\s*[:=-]?\s*(\d{1,3}(?:\.\d{3})+,\d{1,4}|\b\d+,\d{1,4}\b|\b\d{1,3}(?:\.\d{3})+\b|\b\d+\b)/i;
  const quantMatch = trechoTextoDocumento.match(quantRegex);
  if (quantMatch) {
    const rawQuantStr = quantMatch[1];
    const quantNum = parseFloat(rawQuantStr.replace(/\./g, "").replace(",", "."));
    if (quantNum > 0) {
      const quantInTons = quantNum >= 1000 ? Number((quantNum / 1000).toFixed(3)) : Number(quantNum.toFixed(3));
      if (pesoExcel !== undefined && Math.abs(quantInTons - pesoExcel) <= 0.01) {
        return {
          id: item.id,
          identificador,
          status: "ERRO_LEITURA_SISTEMA",
          veredito: `Valor Real no Campo QUANT: ${quantInTons.toFixed(3)} t`,
          pesoCorrigidoDoc: quantInTons,
          pesoExcel,
          diferencaReal: 0,
          explicacao: `Localizado exatamente no campo QUANT da DANFE: ${rawQuantStr} (${quantInTons.toFixed(3)} t), batendo com a planilha Excel.`,
          confianca: "ALTA",
          modoUtilizado: "HEURISTICA_LOCAL",
        };
      }
    }
  }

  if (pesoExcel !== undefined) {
    const excelFormattedBr = pesoExcel.toFixed(3).replace(".", ",");
    const excelFormattedBr2 = pesoExcel.toFixed(2).replace(".", ",");
    const excelFormattedUs = pesoExcel.toFixed(3);
    const excelKg = Math.round(pesoExcel * 1000).toString();

    if (cleanSnippet.includes(excelFormattedBr) || cleanSnippet.includes(excelFormattedBr2) || cleanSnippet.includes(excelFormattedUs)) {
      status = "ERRO_LEITURA_SISTEMA";
      pesoCorrigidoDoc = pesoExcel;
      veredito = `Erro de Leitura do Sistema: O documento original contém exatamente ${excelFormattedBr} t`;
      explicacao = `O valor da planilha (${excelFormattedBr} t) foi localizado no texto bruto da nota/MDF, confirmando que o sistema cometeu um corte ou falha de leitura.`;
      confianca = "ALTA";
      return {
        id: item.id,
        identificador,
        status,
        veredito,
        pesoCorrigidoDoc,
        pesoExcel,
        diferencaReal: 0,
        explicacao,
        confianca,
        modoUtilizado: "HEURISTICA_LOCAL",
      };
    }

    if (cleanSnippet.includes(excelKg)) {
      status = "ERRO_LEITURA_SISTEMA";
      pesoCorrigidoDoc = pesoExcel;
      veredito = `Erro de Unidade (kg vs t): O documento traz ${excelKg} kg (${excelFormattedBr} t)`;
      explicacao = `O documento declarou o peso em quilogramas (${excelKg} kg) enquanto a planilha estava em toneladas.`;
      confianca = "ALTA";
      return {
        id: item.id,
        identificador,
        status,
        veredito,
        pesoCorrigidoDoc,
        pesoExcel,
        diferencaReal: 0,
        explicacao,
        confianca,
        modoUtilizado: "HEURISTICA_LOCAL",
      };
    }
  }

  const dif = pesoMDF !== undefined && pesoExcel !== undefined ? Number((pesoMDF - pesoExcel).toFixed(3)) : null;
  return {
    id: item.id,
    identificador,
    status: pesoMDF === undefined ? "PESO_AUSENTE_NO_DOC" : "DIVERGENCIA_REAL",
    veredito:
      pesoMDF === undefined
        ? "Peso não localizado no documento"
        : `Divergência Real de Pesagem: Doc = ${pesoMDF} t | Excel = ${pesoExcel ?? "N/A"} t`,
    pesoCorrigidoDoc: pesoMDF,
    pesoExcel,
    diferencaReal: dif,
    explicacao:
      pesoMDF === undefined
        ? "O trecho do documento fiscal não apresenta peso legível para este item."
        : `O documento fiscal declara expressamente ${pesoMDF} t enquanto o Excel informa ${pesoExcel ?? "N/A"} t (diferença de ${dif ?? "N/A"} t).`,
    confianca: "MEDIA",
    modoUtilizado: "HEURISTICA_LOCAL",
  };
}

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
