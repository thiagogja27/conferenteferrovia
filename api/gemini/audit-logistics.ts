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
export interface LogisticsAuditInputItem {
  id: string;
  numero?: string;
  serie?: string;
  chave?: string;
  emitNome?: string;
  destNome?: string;
  destCNPJ?: string;
  terminal?: string;
  transbordo?: string;
  produto?: string;
  retirada?: string;
  infCpl?: string;
  rawSnippet?: string;
  xmlContent?: string;
}

export type LogisticsStatusTipo =
  | "AJUSTADO_IA"
  | "PARCIALMENTE_AJUSTADO"
  | "DADOS_JA_COMPLETOS"
  | "NAO_CONSTA_NO_DOC";

export interface LogisticsAuditResultItem {
  id: string;
  numero?: string;
  terminalCorrigido?: string;
  transbordoCorrigido?: string;
  destinatarioCorrigido?: string;
  retiradaCorrigida?: string;
  produtoCorrigido?: string;
  status: LogisticsStatusTipo;
  veredito: string;
  explicacao: string;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  modoUtilizado: "GEMINI_IA" | "HEURISTICA_LOCAL";
  camposAjustados: Array<"terminal" | "transbordo" | "destinatario" | "retirada" | "produto">;
}

function isNaoInformado(val?: string | null): boolean {
  if (!val) return true;
  const norm = val.trim().toUpperCase();
  return (
    norm === "" ||
    norm === "NÃO INFORMADO" ||
    norm === "NAO INFORMADO" ||
    norm === "NÃO INFORMADA" ||
    norm === "NAO INFORMADA" ||
    norm === "NÃO IDENTIFICADO" ||
    norm === "NAO IDENTIFICADO" ||
    norm === "DESTINATÁRIO NÃO IDENTIFICADO" ||
    norm === "DESTINATARIO NAO IDENTIFICADO" ||
    norm === "OUTRO" ||
    norm === "OUTROS" ||
    norm === "-"
  );
}

export function auditarLogisticaHeuristicaLocal(item: LogisticsAuditInputItem): LogisticsAuditResultItem {
  const fullText = `${item.infCpl || ""} ${item.rawSnippet || ""} ${item.xmlContent || ""} ${item.emitNome || ""} ${item.destNome || ""}`.toUpperCase();
  const camposAjustados: Array<"terminal" | "transbordo" | "destinatario" | "retirada" | "produto"> = [];

  let terminalCorrigido = item.terminal;
  let transbordoCorrigido = item.transbordo;
  let destinatarioCorrigido = item.destNome;
  let retiradaCorrigida = item.retirada;
  let produtoCorrigido = item.produto;

  // 1. Auditoria e Identificação de Terminal de Entrega
  if (isNaoInformado(item.terminal)) {
    if (/\bTEAG\b|TERMINAL.*EXPORTA[CÇ][AÃ]O.*A[CÇ][UÚ]CAR|ACUCAR.*GUARUJ[AÁ]|TEAG/i.test(fullText)) {
      terminalCorrigido = "TEAG - TERMINAL DE ACUCAR DO GUARUJA";
      camposAjustados.push("terminal");
    } else if (/\bTEG\b|TERMINAL.*EXPORTADOR.*GUARUJ[AÁ]|TERM.*EXP.*GUARUJA/i.test(fullText)) {
      terminalCorrigido = "TEG - TERMINAL EXPORTADOR DO GUARUJA";
      camposAjustados.push("terminal");
    } else if (/\bCLI\b|CORREDOR.*LOG[IÍ]STIC.*INTEGRAD/i.test(fullText)) {
      terminalCorrigido = "CLI - CORREDOR LOGÍSTICA INTEGRADA";
      camposAjustados.push("terminal");
    } else if (/\bTGG\b|TERMINAL.*GR[AÃ]OS.*GUARUJ[AÁ]/i.test(fullText)) {
      terminalCorrigido = "TGG - TERMINAL DE GRAOS DO GUARUJA";
      camposAjustados.push("terminal");
    } else if (/\bT-124\b|\bT124\b|TERMINAL.*124/i.test(fullText)) {
      terminalCorrigido = "TERMINAL 124";
      camposAjustados.push("terminal");
    } else if (/SANTOS BRASIL/i.test(fullText)) {
      terminalCorrigido = "SANTOS BRASIL";
      camposAjustados.push("terminal");
    } else if (/DP WORLD/i.test(fullText)) {
      terminalCorrigido = "DP WORLD SANTOS";
      camposAjustados.push("terminal");
    } else if (/ECOPORTO/i.test(fullText)) {
      terminalCorrigido = "ECOPORTO SANTOS";
      camposAjustados.push("terminal");
    } else if (/BTP|BRASIL TERMINAL PORTU/i.test(fullText)) {
      terminalCorrigido = "BTP - BRASIL TERMINAL PORTUARIO";
      camposAjustados.push("terminal");
    } else if (/TIPLAM/i.test(fullText)) {
      terminalCorrigido = "TIPLAM - TERMINAL INTEGRADO";
      camposAjustados.push("terminal");
    } else if (/TERMINAL RUMO|RUMO MALHA/i.test(fullText)) {
      terminalCorrigido = "TERMINAL RUMO";
      camposAjustados.push("terminal");
    } else if (/TERMINAL VLI|VLI/i.test(fullText)) {
      terminalCorrigido = "TERMINAL VLI";
      camposAjustados.push("terminal");
    } else if (/GUARUJ[AÁ]/i.test(fullText)) {
      terminalCorrigido = "TEG - TERMINAL EXPORTADOR DO GUARUJA";
      camposAjustados.push("terminal");
    }
  }

  // 2. Auditoria e Identificação de Transbordo
  if (isNaoInformado(item.transbordo)) {
    if (/ITURAMA/i.test(fullText)) {
      transbordoCorrigido = "ITURAMA";
      camposAjustados.push("transbordo");
    } else if (/PRAD[OÓ]POLIS|PRADOPOLIS/i.test(fullText)) {
      transbordoCorrigido = "PRADOPOLIS";
      camposAjustados.push("transbordo");
    } else if (/ALTO TAQUARI|NOVA AGRI/i.test(fullText)) {
      transbordoCorrigido = "ALTO TAQUARI";
      camposAjustados.push("transbordo");
    } else if (/RONDON[OÓ]POLIS/i.test(fullText)) {
      transbordoCorrigido = "RONDONOPOLIS (RUMO)";
      camposAjustados.push("transbordo");
    } else if (/RIO VERDE/i.test(fullText)) {
      transbordoCorrigido = "RIO VERDE";
      camposAjustados.push("transbordo");
    } else if (/ARAGUARI/i.test(fullText)) {
      transbordoCorrigido = "ARAGUARI (VLI)";
      camposAjustados.push("transbordo");
    } else if (/UBERABA|TIUB/i.test(fullText)) {
      transbordoCorrigido = "UBERABA";
      camposAjustados.push("transbordo");
    } else if (/PEDERNEIRAS/i.test(fullText)) {
      transbordoCorrigido = "PEDERNEIRAS (RUMO)";
      camposAjustados.push("transbordo");
    } else if (/GUARA|GUARÁ/i.test(fullText)) {
      transbordoCorrigido = "GUARA";
      camposAjustados.push("transbordo");
    } else if (/UBERL[AÂ]NDIA/i.test(fullText)) {
      transbordoCorrigido = "UBERLANDIA";
      camposAjustados.push("transbordo");
    } else if (/S[AÃ]O SIM[AÃ]O/i.test(fullText)) {
      transbordoCorrigido = "SAO SIMAO";
      camposAjustados.push("transbordo");
    } else if (/CHAPAD[AÃ]O DO SUL/i.test(fullText)) {
      transbordoCorrigido = "CHAPADAO DO SUL";
      camposAjustados.push("transbordo");
    } else if (/INOC[EÊ]NCIA/i.test(fullText)) {
      transbordoCorrigido = "INOCENCIA";
      camposAjustados.push("transbordo");
    } else if (/ITIQUIRA/i.test(fullText)) {
      transbordoCorrigido = "ITIQUIRA";
      camposAjustados.push("transbordo");
    }
  }

  // 3. Auditoria e Identificação de Destinatário
  if (isNaoInformado(item.destNome)) {
    if (/USINA.*CORURIPE|CORURIPE/i.test(fullText)) {
      destinatarioCorrigido = "S/A USINA CORURIPE ACUCAR E ALCOOL";
      camposAjustados.push("destinatario");
    } else if (/CARGILL/i.test(fullText)) {
      destinatarioCorrigido = "CARGILL AGRICOLA SA";
      camposAjustados.push("destinatario");
    } else if (/COPERSUCAR/i.test(fullText)) {
      destinatarioCorrigido = "COPERSUCAR S.A.";
      camposAjustados.push("destinatario");
    } else if (/RAIZEN|RAÍZEN/i.test(fullText)) {
      destinatarioCorrigido = "RAIZEN ENERGIA S.A.";
      camposAjustados.push("destinatario");
    } else if (/SAO MARTINHO|SÃO MARTINHO/i.test(fullText)) {
      destinatarioCorrigido = "USINA SAO MARTINHO S/A";
      camposAjustados.push("destinatario");
    } else if (/ADECOAGRO/i.test(fullText)) {
      destinatarioCorrigido = "ADECOAGRO VALE DO IVINHEMA S.A.";
      camposAjustados.push("destinatario");
    } else if (/ALTA MOGIANA/i.test(fullText)) {
      destinatarioCorrigido = "USINA ALTA MOGIANA S/A - ACUCAR E ALCOOL";
      camposAjustados.push("destinatario");
    } else if (/SANTA TEREZINHA/i.test(fullText)) {
      destinatarioCorrigido = "USINA SANTA TEREZINHA LTDA";
      camposAjustados.push("destinatario");
    } else if (/BATATAIS/i.test(fullText)) {
      destinatarioCorrigido = "USINA BATATAIS S/A ACUCAR E ALCOOL";
      camposAjustados.push("destinatario");
    } else if (/TEREOS/i.test(fullText)) {
      destinatarioCorrigido = "TEREOS ACUCAR E ENERGIA BRASIL S.A.";
      camposAjustados.push("destinatario");
    } else if (/BP BUNGE|BUNGE/i.test(fullText)) {
      destinatarioCorrigido = "BP BUNGE BIOENERGIA S.A.";
      camposAjustados.push("destinatario");
    } else if (/COFCO/i.test(fullText)) {
      destinatarioCorrigido = "COFCO INTERNATIONAL BRASIL S.A.";
      camposAjustados.push("destinatario");
    } else if (/DREYFUS|LDC/i.test(fullText)) {
      destinatarioCorrigido = "LOUIS DREYFUS COMPANY BRASIL S.A.";
      camposAjustados.push("destinatario");
    } else if (/AMAGGI/i.test(fullText)) {
      destinatarioCorrigido = "AMAGGI EXPORTACAO E IMPORTACAO LTDA";
      camposAjustados.push("destinatario");
    } else if (/ADM DO BRASIL|\bADM\b/i.test(fullText)) {
      destinatarioCorrigido = "ADM DO BRASIL LTDA";
      camposAjustados.push("destinatario");
    }
  }

  // 4. Auditoria de Produto
  if (isNaoInformado(item.produto)) {
    if (/A[CÇ][UÚ]CAR/i.test(fullText)) {
      produtoCorrigido = "AÇÚCAR";
      camposAjustados.push("produto");
    } else if (/SOJA/i.test(fullText)) {
      produtoCorrigido = "SOJA";
      camposAjustados.push("produto");
    } else if (/MILHO/i.test(fullText)) {
      produtoCorrigido = "MILHO";
      camposAjustados.push("produto");
    } else if (/FARELO/i.test(fullText)) {
      produtoCorrigido = "FARELO DE SOJA";
      camposAjustados.push("produto");
    }
  }

  const isAjustado = camposAjustados.length > 0;
  const status: LogisticsStatusTipo = isAjustado ? "AJUSTADO_IA" : "NAO_CONSTA_NO_DOC";
  const veredito = isAjustado
    ? `Dados recuperados via heurística fiscal: ${camposAjustados.join(", ")}`
    : "Campos mantidos conforme documento";

  const explicacao = isAjustado
    ? `Identificado automaticamente no texto do documento: ${camposAjustados.map((c) => {
        if (c === "terminal") return `Terminal '${terminalCorrigido}'`;
        if (c === "transbordo") return `Transbordo '${transbordoCorrigido}'`;
        if (c === "destinatario") return `Destinatário '${destinatarioCorrigido}'`;
        if (c === "produto") return `Produto '${produtoCorrigido}'`;
        return c;
      }).join("; ")}.`
    : "Não foram encontrados novos dados logísticos conclusivos no texto bruto.";

  return {
    id: item.id,
    numero: item.numero,
    terminalCorrigido,
    transbordoCorrigido,
    destinatarioCorrigido,
    retiradaCorrigida,
    produtoCorrigido,
    status,
    veredito,
    explicacao,
    confianca: isAjustado ? "ALTA" : "BAIXA",
    modoUtilizado: "HEURISTICA_LOCAL",
    camposAjustados,
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

    const items: LogisticsAuditInputItem[] = body?.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Array de 'items' é obrigatório." });
    }

    const ai = getGenAI();

    // Se a chave GEMINI_API_KEY não estiver configurada no ambiente Vercel, usa heurística local
    if (!ai) {
      const fallbackResults = items.map(auditarLogisticaHeuristicaLocal);
      const totalAjustados = fallbackResults.filter((r) => r.camposAjustados.length > 0).length;
      return res.status(200).json({
        totalAuditados: fallbackResults.length,
        totalAjustados,
        totalSemDados: fallbackResults.length - totalAjustados,
        resultados: fallbackResults,
        tokensUtilizadosEstimados: 0,
        provedor: "HEURISTICA_INTELIGENTE",
        aviso: "GEMINI_API_KEY não configurada no ambiente Vercel. Processado com motor heurístico local.",
      });
    }

    const BATCH_SIZE = 40;
    const allAiParsedResults: any[] = [];
    let estimatedTokensTotal = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);

      const promptPayload = batch.map((it) => ({
        id: it.id,
        numero: it.numero,
        serie: it.serie,
        chave: it.chave,
        emitenteAtual: it.emitNome || "Não informado",
        destinatarioAtual: it.destNome || "Não informado",
        destinatarioCNPJ: it.destCNPJ || "",
        terminalAtual: it.terminal || "Não informado",
        transbordoAtual: it.transbordo || "Não informado",
        produtoAtual: it.produto || "Não informado",
        retiradaAtual: it.retirada || "Não informado",
        informacoesComplementares: (it.infCpl || "").substring(0, 1500),
        trechoDocumentoOriginal: (it.rawSnippet || "").substring(0, 2000),
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
            systemInstruction:
              "Você é um auditor logístico e fiscal analítico e infalível. Localize terminais, transbordos e destinatários reais a partir do texto do documento. Retorne estritamente um array JSON com todos os itens analisados.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  terminalCorrigido: {
                    type: Type.STRING,
                    description: "Nome normalizado do Terminal de Entrega identificado no documento, ou vazio se não houver",
                  },
                  transbordoCorrigido: {
                    type: Type.STRING,
                    description: "Nome do Transbordo/Pátio identificado no documento, ou vazio se não houver",
                  },
                  destinatarioCorrigido: {
                    type: Type.STRING,
                    description: "Nome/Razão Social real do Destinatário identificado no documento, ou vazio se não houver",
                  },
                  produtoCorrigido: {
                    type: Type.STRING,
                    description: "Nome do Produto identificado no documento, ou vazio se não houver",
                  },
                  retiradaCorrigida: {
                    type: Type.STRING,
                    description: "Local de Retirada identificado no documento, ou vazio se não houver",
                  },
                  status: {
                    type: Type.STRING,
                    enum: ["AJUSTADO_IA", "PARCIALMENTE_AJUSTADO", "DADOS_JA_COMPLETOS", "NAO_CONSTA_NO_DOC"],
                  },
                  veredito: { type: Type.STRING, description: "Resumo em 1 linha dos dados encontrados" },
                  explicacao: {
                    type: Type.STRING,
                    description: "Explicação objetiva de onde os dados foram encontrados no documento fiscal",
                  },
                  confianca: { type: Type.STRING, enum: ["ALTA", "MEDIA", "BAIXA"] },
                },
                required: ["id", "status", "veredito", "explicacao", "confianca"],
              },
            },
          },
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
        console.error("Erro no processamento do lote Gemini de logística na Vercel:", batchErr);
        const fallbackBatch = batch.map(auditarLogisticaHeuristicaLocal);
        allAiParsedResults.push(...fallbackBatch);
      }
    }

    const resultados = items.map((it) => {
      const aiResult = allAiParsedResults.find((r: any) => r.id === it.id);
      if (aiResult) {
        const camposAjustados: Array<"terminal" | "transbordo" | "destinatario" | "retirada" | "produto"> = [];
        if (aiResult.terminalCorrigido && (!it.terminal || /N[AÃ]O\s*INFORMADO/i.test(it.terminal))) {
          camposAjustados.push("terminal");
        }
        if (aiResult.transbordoCorrigido && (!it.transbordo || /N[AÃ]O\s*INFORMADO/i.test(it.transbordo))) {
          camposAjustados.push("transbordo");
        }
        if (
          aiResult.destinatarioCorrigido &&
          (!it.destNome || /N[AÃ]O\s*INFORMADO|N[AÃ]O\s*IDENTIFICADO/i.test(it.destNome))
        ) {
          camposAjustados.push("destinatario");
        }
        if (aiResult.produtoCorrigido && (!it.produto || /OUTRO|N[AÃ]O\s*INFORMADO/i.test(it.produto))) {
          camposAjustados.push("produto");
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
          status: isAjustado ? aiResult.status || "AJUSTADO_IA" : "NAO_CONSTA_NO_DOC",
          veredito: aiResult.veredito || (isAjustado ? "Dados Identificados pela IA" : "Sem alterações adicionais"),
          explicacao: aiResult.explicacao || "Analisado com modelo Gemini 3.7 Flash.",
          confianca: aiResult.confianca || "ALTA",
          modoUtilizado: "GEMINI_IA" as const,
          camposAjustados,
        };
      }
      return auditarLogisticaHeuristicaLocal(it);
    });

    const totalAjustados = resultados.filter((r: any) => r.camposAjustados.length > 0).length;

    return res.status(200).json({
      totalAuditados: resultados.length,
      totalAjustados,
      totalSemDados: resultados.length - totalAjustados,
      resultados,
      tokensUtilizadosEstimados: estimatedTokensTotal || 120 + resultados.length * 100,
      provedor: "GEMINI_3_7_FLASH",
    });
  } catch (err: any) {
    console.error("Erro no handler Vercel /api/gemini/audit-logistics:", err);
    const items: LogisticsAuditInputItem[] = req.body?.items || [];
    const fallbackResults = Array.isArray(items) ? items.map(auditarLogisticaHeuristicaLocal) : [];
    const totalAjustados = fallbackResults.filter((r) => r.camposAjustados.length > 0).length;
    return res.status(200).json({
      totalAuditados: fallbackResults.length,
      totalAjustados,
      totalSemDados: fallbackResults.length - totalAjustados,
      resultados: fallbackResults,
      tokensUtilizadosEstimados: 0,
      provedor: "HEURISTICA_INTELIGENTE",
      aviso: "Processado com motor de auditoria heurística local após falha na requisição.",
    });
  }
}
