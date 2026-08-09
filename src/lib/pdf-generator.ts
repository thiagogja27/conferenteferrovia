import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import type { NFEData } from "./nfe-parser";

const MARGIN = 5;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_COLOR = [0, 0, 0] as const;
const HEADER_BG = [240, 240, 240] as const;

function generateBarcode(text: string): string {
  try {
    // Create a canvas element in memory
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, text, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 40, // Barcode height
    });
    // Return the barcode as a data URL
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("Barcode generation failed:", e);
    return "";
  }
}

function formatChaveAcesso(chave: string): string {
  if (!chave) return "";
  const cleaned = chave.replace(/\D/g, "");
  return cleaned.replace(/(\d{4})/g, "$1 ").trim();
}

function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function drawBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...LINE_COLOR);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);
}

function drawBoxWithLabel(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, fontSize = 6) {
  drawBox(doc, x, y, w, h);
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(label, x + 1, y + 3);
  doc.setFontSize(fontSize);
  doc.setFont("helvetica", "bold");
  doc.text(value || "", x + 1, y + h - 2);
}

export function generatePDF(data: NFEData): jsPDF {
  const doc = new jsPDF("p", "mm", "a4");
  let y = MARGIN;

  // ==================== CANHOTO ====================
  const canhotoHeight = 18;
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, canhotoHeight);

  // Divisoes do canhoto
  const canhotoTextWidth = CONTENT_WIDTH - 60;
  doc.setDrawColor(...LINE_COLOR);
  doc.line(MARGIN + canhotoTextWidth, y, MARGIN + canhotoTextWidth, y + canhotoHeight);
  doc.line(MARGIN + canhotoTextWidth + 30, y, MARGIN + canhotoTextWidth + 30, y + canhotoHeight);

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text(`RECEBEMOS DE ${data.emitente.nome || ""}`, MARGIN + 2, y + 4);
  doc.text("OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.", MARGIN + 2, y + 7);

  doc.setFontSize(5);
  doc.text("DATA DE RECEBIMENTO", MARGIN + 2, y + 11);
  doc.text("IDENTIFICACAO E ASSINATURA DO RECEBEDOR", MARGIN + 35, y + 11);

  // NF-e box
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("NF-e", MARGIN + canhotoTextWidth + 10, y + 5);
  doc.setFontSize(6);
  doc.text(`No ${data.numero || ""}`, MARGIN + canhotoTextWidth + 5, y + 10);
  doc.text(`SERIE: ${data.serie || ""}`, MARGIN + canhotoTextWidth + 5, y + 14);

  y += canhotoHeight + 1;

  // Linha pontilhada de corte
  doc.setLineDashPattern([1, 1], 0);
  doc.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
  doc.setLineDashPattern([], 0);
  y += 2;

  // ==================== CABECALHO PRINCIPAL ====================
  const headerHeight = 38;
  const danfeWidth = 35;
  const nfBoxWidth = 55;
  const emitWidth = CONTENT_WIDTH - danfeWidth - nfBoxWidth;

  // Box DANFE
  drawBox(doc, MARGIN, y, danfeWidth, headerHeight);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DANFE", MARGIN + danfeWidth / 2, y + 8, { align: "center" });
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.text("DOCUMENTO AUXILIAR", MARGIN + danfeWidth / 2, y + 12, { align: "center" });
  doc.text("DE NOTA FISCAL", MARGIN + danfeWidth / 2, y + 15, { align: "center" });
  doc.text("ELETRONICA", MARGIN + danfeWidth / 2, y + 18, { align: "center" });

  // Entrada/Saida
  doc.setFontSize(6);
  doc.text(data.tipoOperacao === "0" ? "0 - ENTRADA" : "1 - SAIDA", MARGIN + danfeWidth / 2, y + 24, { align: "center" });
  drawBox(doc, MARGIN + danfeWidth / 2 - 4, y + 26, 8, 5);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(data.tipoOperacao || "1", MARGIN + danfeWidth / 2, y + 30, { align: "center" });

  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.text(`FOLHA ${data.folha}`, MARGIN + danfeWidth / 2, y + 36, { align: "center" });

  // Box Emitente
  const emitX = MARGIN + danfeWidth;
  drawBox(doc, emitX, y, emitWidth, headerHeight);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(data.emitente.nome || "", emitX + emitWidth / 2, y + 7, { align: "center" });

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  const enderEmit = `${data.emitente.endereco || ""}, ${data.emitente.numero || ""} - ${data.emitente.bairro || ""}`;
  doc.text(enderEmit.substring(0, 70), emitX + emitWidth / 2, y + 13, { align: "center" });
  doc.text(`${data.emitente.cidade || ""} - ${data.emitente.uf || ""} CEP: ${data.emitente.cep || ""}`, emitX + emitWidth / 2, y + 18, { align: "center" });
  doc.text(`FONE: ${data.emitente.telefone || ""}`, emitX + emitWidth / 2, y + 23, { align: "center" });

  // Dados do emitente embaixo
  const emitDataY = y + 26;
  const emitDataH = headerHeight - 26;
  doc.line(emitX, emitDataY, emitX + emitWidth, emitDataY);

  const emitCol = emitWidth / 3;
  doc.line(emitX + emitCol, emitDataY, emitX + emitCol, y + headerHeight);
  doc.line(emitX + emitCol * 2, emitDataY, emitX + emitCol * 2, y + headerHeight);

  doc.setFontSize(5);
  doc.text("CNPJ", emitX + 1, emitDataY + 3);
  doc.text("INSCRICAO ESTADUAL", emitX + emitCol + 1, emitDataY + 3);
  doc.text("INSCRICAO ESTADUAL DE SUBST.", emitX + emitCol * 2 + 1, emitDataY + 3);

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text(data.emitente.cnpj || "", emitX + 1, emitDataY + 9);
  doc.text(data.emitente.inscricaoEstadual || "", emitX + emitCol + 1, emitDataY + 9);
  doc.text(data.emitente.inscricaoEstadualST || "", emitX + emitCol * 2 + 1, emitDataY + 9);

  // Box Barcode, NF Info, Chave de acesso
  const nfBoxX = MARGIN + danfeWidth + emitWidth;
  drawBox(doc, nfBoxX, y, nfBoxWidth, headerHeight);
  const nfBoxContentX = nfBoxX + 1;
  const nfBoxContentW = nfBoxWidth - 2;

  // Barcode
  if (data.chaveAcesso) {
    const barcodeData = generateBarcode(data.chaveAcesso);
    if (barcodeData) {
      doc.addImage(barcodeData, "PNG", nfBoxX + 2, y + 2, nfBoxContentW - 2, 12);
    }
  }

  // Chave de Acesso
  const chaveAcessoY = y + 15;
  const chaveAcessoH = 11;
  drawBox(doc, nfBoxX, chaveAcessoY, nfBoxWidth, chaveAcessoH);
  doc.setFontSize(5);
  doc.setFont("helvetica", "normal");
  doc.text("CHAVE DE ACESSO", nfBoxContentX, chaveAcessoY + 3);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  const formattedChave = formatChaveAcesso(data.chaveAcesso);
  const chaveLines = doc.splitTextToSize(formattedChave, nfBoxContentW);
  doc.text(chaveLines, nfBoxContentX, chaveAcessoY + 6);

  // Protocolo
  drawBoxWithLabel(doc, nfBoxX, y + 26, nfBoxWidth, headerHeight - 26, "PROTOCOLO DE AUTORIZACAO DE USO", data.protocolo, 6)


  y += headerHeight;

  // ==================== NATUREZA DA OPERACAO ====================
  const natOpHeight = 8;
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, natOpHeight)
  doc.setFontSize(5)
  doc.setFont("helvetica", "normal")
  doc.text("NATUREZA DA OPERACAO", MARGIN + 1, y + 3)
  doc.setFontSize(7)
  doc.setFont("helvetica", "bold")
  doc.text(data.naturezaOperacao || "", MARGIN + 1, y + 7)
  y += natOpHeight;


  // ==================== DESTINATARIO / REMETENTE ====================
  const destTitleH = 4;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_WIDTH, destTitleH, "F");
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, destTitleH);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("DESTINATARIO / REMETENTE", MARGIN + 1, y + 3);
  y += destTitleH;

  // Linha 1: Nome, CNPJ, Data Emissao
  const destH1 = 8;
  const destNameW = CONTENT_WIDTH * 0.55;
  const destCnpjW = CONTENT_WIDTH * 0.25;
  const destDateW = CONTENT_WIDTH * 0.20;

  drawBoxWithLabel(doc, MARGIN, y, destNameW, destH1, "NOME / RAZAO SOCIAL", data.destinatario.nome || "", 7);
  drawBoxWithLabel(doc, MARGIN + destNameW, y, destCnpjW, destH1, "CNPJ / CPF", data.destinatario.cpfCnpj || "", 7);
  drawBoxWithLabel(doc, MARGIN + destNameW + destCnpjW, y, destDateW, destH1, "DATA DA EMISSAO", data.dataEmissao, 6);
  y += destH1;

  // Linha 2: Endereco, Bairro, CEP
  const destAddrW = CONTENT_WIDTH * 0.50;
  const destBairroW = CONTENT_WIDTH * 0.25;
  const destCepW = CONTENT_WIDTH * 0.25;

  drawBoxWithLabel(doc, MARGIN, y, destAddrW, destH1, "ENDERECO", `${data.destinatario.endereco || ""}, ${data.destinatario.numero || ""}`, 6);
  drawBoxWithLabel(doc, MARGIN + destAddrW, y, destBairroW, destH1, "BAIRRO / DISTRITO", data.destinatario.bairro || "", 6);
  drawBoxWithLabel(doc, MARGIN + destAddrW + destBairroW, y, destCepW, destH1, "CEP", data.destinatario.cep || "", 7);
  y += destH1;

  // Linha 3: Municipio, Fone, UF, IE, Data Saida, Hora Saida
  const destMunW = CONTENT_WIDTH * 0.35;
  const destFoneW = CONTENT_WIDTH * 0.18;
  const destUfW = CONTENT_WIDTH * 0.07;
  const destIeW = CONTENT_WIDTH * 0.17;
  const destDateSW = CONTENT_WIDTH * 0.13;
  const destHoraSW = CONTENT_WIDTH * 0.10;

  drawBoxWithLabel(doc, MARGIN, y, destMunW, destH1, "MUNICIPIO", data.destinatario.cidade || "", 7);
  drawBoxWithLabel(doc, MARGIN + destMunW, y, destFoneW, destH1, "FONE / FAX", data.destinatario.telefone || "", 6);
  drawBoxWithLabel(doc, MARGIN + destMunW + destFoneW, y, destUfW, destH1, "UF", data.destinatario.uf || "", 7);
  drawBoxWithLabel(doc, MARGIN + destMunW + destFoneW + destUfW, y, destIeW, destH1, "INSCRICAO ESTADUAL", data.destinatario.inscricaoEstadual || "", 6);
  drawBoxWithLabel(doc, MARGIN + destMunW + destFoneW + destUfW + destIeW, y, destDateSW, destH1, "DATA SAIDA/ENTRADA", data.dataEntradaSaida || "", 6);
  drawBoxWithLabel(doc, MARGIN + destMunW + destFoneW + destUfW + destIeW + destDateSW, y, destHoraSW, destH1, "HORA SAIDA/ENTRADA", data.horaEntradaSaida || "", 5);
  y += destH1;

  // ==================== CALCULO DO IMPOSTO ====================
  const impTitleH = 4;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_WIDTH, impTitleH, "F");
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, impTitleH);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("CALCULO DO IMPOSTO", MARGIN + 1, y + 3);
  y += impTitleH;

  // Linha 1 impostos
  const impH = 8;
  const impColW = CONTENT_WIDTH / 5;

  drawBoxWithLabel(doc, MARGIN, y, impColW, impH, "BASE DE CALCULO DO ICMS", formatCurrency(data.impostos.baseCalcICMS), 6);
  drawBoxWithLabel(doc, MARGIN + impColW, y, impColW, impH, "VALOR DO ICMS", formatCurrency(data.impostos.valorICMS), 6);
  drawBoxWithLabel(doc, MARGIN + impColW * 2, y, impColW, impH, "BASE DE CALC. ICMS S.T.", formatCurrency(data.impostos.baseCalcICMSST), 6);
  drawBoxWithLabel(doc, MARGIN + impColW * 3, y, impColW, impH, "VALOR DO ICMS S.T.", formatCurrency(data.impostos.valorICMSST), 6);
  drawBoxWithLabel(doc, MARGIN + impColW * 4, y, impColW, impH, "V. TOTAL PRODUTOS", formatCurrency(data.impostos.valorProdutos), 6);
  y += impH;

  // Linha 2 impostos
  const impCol2W = CONTENT_WIDTH / 6;
  drawBoxWithLabel(doc, MARGIN, y, impCol2W, impH, "VALOR DO FRETE", formatCurrency(data.impostos.valorFrete), 6);
  drawBoxWithLabel(doc, MARGIN + impCol2W, y, impCol2W, impH, "VALOR DO SEGURO", formatCurrency(data.impostos.valorSeguro), 6);
  drawBoxWithLabel(doc, MARGIN + impCol2W * 2, y, impCol2W, impH, "DESCONTO", formatCurrency(data.impostos.desconto), 6);
  drawBoxWithLabel(doc, MARGIN + impCol2W * 3, y, impCol2W, impH, "OUTRAS DESPESAS", formatCurrency(data.impostos.outrasDesp), 6);
  drawBoxWithLabel(doc, MARGIN + impCol2W * 4, y, impCol2W, impH, "VALOR TOTAL IPI", formatCurrency(data.impostos.valorIPI), 6);
  drawBoxWithLabel(doc, MARGIN + impCol2W * 5, y, impCol2W, impH, "VALOR TOTAL DA NOTA", formatCurrency(data.impostos.valorTotal), 7);
  y += impH;

  // ==================== TRANSPORTADOR / VOLUMES ====================
  const transpTitleH = 4;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_WIDTH, transpTitleH, "F");
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, transpTitleH);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", MARGIN + 1, y + 3);
  y += transpTitleH;

  // Linha 1 transportador
  const transpH = 8;
  const transpNameW = CONTENT_WIDTH * 0.40;
  const transpFreteW = CONTENT_WIDTH * 0.15;
  const transpPlacaW = CONTENT_WIDTH * 0.15;
  const transpCnpjW = CONTENT_WIDTH * 0.30;

  const fretePorConta = data.transportador.fretePorConta === "0" ? "0-Emitente" : 
                        data.transportador.fretePorConta === "1" ? "1-Dest/Rem" : 
                        data.transportador.fretePorConta === "2" ? "2-Terceiros" : 
                        data.transportador.fretePorConta === "9" ? "9-Sem Frete" : "";

  drawBoxWithLabel(doc, MARGIN, y, transpNameW, transpH, "NOME / RAZAO SOCIAL", data.transportador.nome || "", 6);
  drawBoxWithLabel(doc, MARGIN + transpNameW, y, transpFreteW, transpH, "FRETE POR CONTA", fretePorConta, 6);
  drawBoxWithLabel(doc, MARGIN + transpNameW + transpFreteW, y, transpPlacaW, transpH, "PLACA DO VEICULO", `${data.transportador.placaVeiculo}-${data.transportador.ufVeiculo}`, 6);
  drawBoxWithLabel(doc, MARGIN + transpNameW + transpFreteW + transpPlacaW, y, transpCnpjW, transpH, "CNPJ / CPF", data.transportador.cpfCnpj || "", 6);
  y += transpH;

  // Linha 2 transportador
  const transpEndW = CONTENT_WIDTH * 0.60;
  const transpMunW = CONTENT_WIDTH * 0.25;
  const transpIeW = CONTENT_WIDTH * 0.15;

  drawBoxWithLabel(doc, MARGIN, y, transpEndW, transpH, "ENDERECO", data.transportador.endereco || "", 6);
  drawBoxWithLabel(doc, MARGIN + transpEndW, y, transpMunW, transpH, "MUNICIPIO", `${data.transportador.cidade}-${data.transportador.uf}`, 6);
  drawBoxWithLabel(doc, MARGIN + transpEndW + transpMunW, y, transpIeW, transpH, "INSCRICAO ESTADUAL", data.transportador.inscricaoEstadual || "", 6);
  y += transpH;

  // ==================== DADOS DOS PRODUTOS / SERVICOS ====================
  const prodTitleH = 4;
  doc.setFillColor(...HEADER_BG);
  doc.rect(MARGIN, y, CONTENT_WIDTH, prodTitleH, "F");
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, prodTitleH);
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DOS PRODUTOS / SERVICOS", MARGIN + 1, y + 3);
  y += prodTitleH;

  // Cabecalho da tabela de produtos
  const prodHeaderH = 6;
  const headers = [
      { title: "CÓD", width: 15 },
      { title: "DESCRIÇÃO", width: 70 },
      { title: "NCM", width: 15 },
      { title: "CFOP", width: 10 },
      { title: "UN", width: 8 },
      { title: "QTD", width: 17, align: 'right' },
      { title: "V.UNIT", width: 20, align: 'right' },
      { title: "V.TOTAL", width: 20, align: 'right' },
      { title: "V.IPI", width: 15, align: 'right' },
  ];

  let x = MARGIN;
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  headers.forEach(header => {
      drawBox(doc, x, y, header.width, prodHeaderH);
      doc.text(header.title, x + header.width / 2, y + 4, { align: "center" });
      x += header.width;
  });
  y += prodHeaderH;

  // Itens
  const itemH = 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);

  for (const item of data.itens) {
    if (y > 270) { // Page break check
      doc.addPage();
      y = MARGIN;
    }

    let x = MARGIN;
    const row = [
        { text: item.codigo, width: 15 },
        { text: item.descricao, width: 70 },
        { text: item.ncm, width: 15 },
        { text: item.cfop, width: 10 },
        { text: item.unidade, width: 8 },
        { text: formatNumber(item.quantidade, 2), width: 17, align: 'right' },
        { text: formatNumber(item.valorUnitario, 2), width: 20, align: 'right' },
        { text: formatNumber(item.valorTotal, 2), width: 20, align: 'right' },
        { text: formatNumber(item.valorIPI, 2), width: 15, align: 'right' },
    ];

    row.forEach(col => {
        drawBox(doc, x, y, col.width, itemH);
        const textX = col.align === 'right' ? x + col.width - 1 : x + 1;
        doc.text(String(col.text || '').substring(0, 45), textX, y + 3.5, { align: (col.align || 'left') as 'left' | 'right' | 'center' | 'justify', maxWidth: col.width - 2 });
        x += col.width;
    });
    y += itemH;
  }

  // ==================== DADOS ADICIONAIS ====================
  if (y > 250) {
    doc.addPage();
    y = MARGIN;
  }

  const dadosAdH = 25;
  drawBox(doc, MARGIN, y, CONTENT_WIDTH, dadosAdH);
  doc.setFontSize(5);
  doc.setFont("helvetica", "bold");
  doc.text("INFORMACOES COMPLEMENTARES", MARGIN + 1, y + 3);
  doc.setFont("helvetica", "normal");
  const infoComp = doc.splitTextToSize(data.informacoesComplementares || "", CONTENT_WIDTH - 2);
  doc.text(infoComp, MARGIN + 1, y + 6);

  return doc;
}
