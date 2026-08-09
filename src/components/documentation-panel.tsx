import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Search,
  MapPin,
  Volume2,
  Download,
  Sparkles,
  FileCode,
  Layers,
  ShieldCheck,
  ListChecks,
  ChevronRight,
  HelpCircle,
  Truck,
  Building2,
  ArrowRight,
  Info,
  Check,
  Filter
} from 'lucide-react'

export function DocumentationPanel() {
  const [activeTopic, setActiveTopic] = useState<'excel-conferencia' | 'pdf-to-xml' | 'conferencia-geral' | 'faq'>('excel-conferencia')
  const [searchDocQuery, setSearchDocQuery] = useState('')

  return (
    <div className="space-y-6">
      {/* Banner de Cabeçalho da Documentação */}
      <Card className="border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/50 dark:from-indigo-950/40 dark:via-zinc-900 dark:to-blue-950/20 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20 shrink-0 mt-0.5">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  Guia Oficial & Documentação do Sistema
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-200">
                    v2.5 Atualizado
                  </span>
                </CardTitle>
                <CardDescription className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
                  Instruções completas para conferência entre planilhas Excel e notas fiscais (PDF/XML), conversão de DANFE e auditoria logística.
                </CardDescription>
              </div>
            </div>

            {/* Busca Rápida na Documentação */}
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar no manual..."
                value={searchDocQuery}
                onChange={(e) => setSearchDocQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>
        </CardHeader>

        {/* Navegação por Capítulos */}
        <CardContent className="pt-0 border-t border-zinc-200/80 dark:border-zinc-800/80 mt-2">
          <div className="flex flex-wrap gap-2 pt-3">
            <button
              type="button"
              onClick={() => setActiveTopic('excel-conferencia')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTopic === 'excel-conferencia'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              1. Conferência Excel x Notas (Peso e Chaves)
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic('pdf-to-xml')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTopic === 'pdf-to-xml'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              2. Extração de PDF (DANFE) para XML
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic('conferencia-geral')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTopic === 'conferencia-geral'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              3. Audit. CNPJ, Áudio, Dashboard e Mapa
            </button>

            <button
              type="button"
              onClick={() => setActiveTopic('faq')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTopic === 'faq'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <HelpCircle className="h-4 w-4" />
              4. Perguntas Frequentes & Dicas
            </button>
          </div>
        </CardContent>
      </Card>

      {/* CONTEÚDO TÓPICO 1: CONFERÊNCIA EXCEL X NOTAS */}
      {activeTopic === 'excel-conferencia' && (
        <div className="space-y-6">
          <Card className="border-emerald-200 dark:border-emerald-900/40">
            <CardHeader className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-t-xl">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-base">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span>Como Fazer a Conferência de Chaves de Acesso e Pesos com Planilha Excel</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Esta funcionalidade permite importar qualquer controle logístico em Excel (.xlsx, .xls, .csv) e cruzar os dados instantaneamente com seus PDFs ou XMLs de notas fiscais.
              </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Fluxo em Passos Numerados */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 relative">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center mb-3">
                    1
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                    Carregar Planilha Excel
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Acesse o modo <strong>PDF para XML</strong> e clique ou arraste a sua planilha na caixa pontilhada de conferência. Não é necessário formatar a planilha: o sistema escaneia todas as abas e colunas.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 relative">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center mb-3">
                    2
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                    Importar Arquivos de Notas
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Arraste seus PDFs de DANFE, arquivos XML ou arquivos ZIP contendo várias notas fiscais. O parser processará os dados em segundo plano com suporte a paralelismo de alta velocidade.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 relative">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center mb-3">
                    3
                  </div>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                    Análise e Exportação
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Verifique os marcadores visuais de batimento, filtre notas divergentes de peso e baixe o <strong>Relatório Consolidado (.xlsx)</strong> com abas detalhadas.
                  </p>
                </div>
              </div>

              {/* Detalhes do Reconhecimento Automático do Excel */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  O que o sistema busca e reconhece automaticamente na sua planilha?
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80">
                    <p className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 mb-1">
                      <Check className="h-3.5 w-3.5 text-indigo-600" />
                      Chaves de Acesso (44 dígitos)
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      O sistema localiza sequências de 44 números em qualquer coluna ou formato de célula, rastreando a aba exata e o número da linha no Excel.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80">
                    <p className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 mb-1">
                      <Scale className="h-3.5 w-3.5 text-emerald-600" />
                      Peso Selecionado e Peso Nota Vagão
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      Extrai automaticamente o <em>"PESO_SELECIONADO"</em> e o <em>"PESO_NOTA_VAGAO"</em> (valor da nota após rateio quando um vagão possui múltiplas notas fiscais).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/80 sm:col-span-2 md:col-span-1">
                    <p className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                      <Truck className="h-3.5 w-3.5 text-amber-600" />
                      Peso Bruto (PESO_NOTA_VAGAO + Tara Rateada)
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      Calcula o <strong>Peso Bruto</strong> individual de cada nota adicionando a fração da <em>Tara do Vagão</em> rateada proporcionalmente entre todas as notas carregadas no mesmo vagão.
                    </p>
                  </div>
                </div>
              </div>

              {/* Regras de Confronto de Peso */}
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 space-y-3">
                <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-600" />
                  Como Funciona o Confronto do Peso Selecionado (Excel vs Nota)
                </h4>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  Para cada nota que consta na planilha Excel, o sistema compara a coluna <strong>Peso Selecionado</strong> da planilha com a <strong>Quantidade / Peso Líquido</strong> extraído do PDF da nota fiscal.
                </p>

                <div className="space-y-2 text-xs">
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/50">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">
                      PESO OK (CONFERE)
                    </span>
                    <p className="text-zinc-700 dark:text-zinc-300">
                      O peso do Excel e a quantidade da nota fiscal são exatamente iguais ou equivalentes em unidades de medida (ex: <strong>47,76 TON</strong> no Excel é reconhecido como equivalente a <strong>47.760 KG</strong> na Nota).
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-800">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 shrink-0">
                      DIVERGÊNCIA PESO (+ / -)
                    </span>
                    <p className="text-zinc-700 dark:text-zinc-300">
                      Apresenta uma diferença numérica real entre o Excel e a Nota. O badge exibe a diferença exata (ex: <em>+120 KG</em> ou <em>-1.500 KG</em>). É possível isolar apenas essas notas clicando no filtro <strong>"Divergência Peso"</strong>.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 shrink-0">
                      PESO EXCEL S/ DADO
                    </span>
                    <p className="text-zinc-700 dark:text-zinc-300">
                      Indica que a chave consta no Excel, porém a coluna de Peso Selecionado não estava preenchida naquela linha específica da planilha.
                    </p>
                  </div>
                </div>
              </div>

              {/* Estrutura do Relatório Exportado */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 space-y-3">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Download className="h-4 w-4 text-emerald-600" />
                  Abas do Relatório de Conferência Exportado (.xlsx)
                </h4>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="p-2.5 bg-white dark:bg-zinc-800/80 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400">1. Resumo Geral:</strong>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">Estatísticas, % de batimento, total de notas conferidas e contagem de divergências de peso.</p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-800/80 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400">2. Total Arquivos (Ord. Excel):</strong>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">Todas as notas importadas ordenadas exatamente pela posição da linha na planilha Excel de origem.</p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-800/80 rounded-lg border">
                    <strong className="text-emerald-600 dark:text-emerald-400">3. Notas Encontradas:</strong>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">Notas que constam no Excel com confronto de Peso Selecionado vs Qtd Nota, diferença e validação de CNPJ.</p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-800/80 rounded-lg border">
                    <strong className="text-red-600 dark:text-red-400">4. Notas Ausentes no Excel / Chaves Sem Arquivo:</strong>
                    <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">Mapeamento de inconsistências: notas que não estão na planilha ou chaves do Excel sem o arquivo PDF correspondente.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CONTEÚDO TÓPICO 2: EXTRAÇÃO DE PDF PARA XML */}
      {activeTopic === 'pdf-to-xml' && (
        <div className="space-y-6">
          <Card className="border-indigo-200 dark:border-indigo-900/40">
            <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 rounded-t-xl">
              <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-bold text-base">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <span>Conversor e Extrator Inteligente de PDF (DANFE) para XML NFe v4.00</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Extraia a estrutura completa de notas fiscais a partir de documentos em PDF e gere arquivos XML válidos prontos para importação em ERPs e sistemas fiscais.
              </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-indigo-600" />
                    Campos Extraídos do DANFE
                  </h4>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 list-disc pl-4">
                    <li><strong>Chave de Acesso:</strong> 44 dígitos extraídos por padrões avançados.</li>
                    <li><strong>Dados da Nota:</strong> Número da NF, Série, Data e Hora de Emissão.</li>
                    <li><strong>Emitente:</strong> Razão Social, CNPJ, Inscrição Estadual, Endereço, Bairro, Cidade, UF e CEP.</li>
                    <li><strong>Destinatário:</strong> Nome/Razão Social, CPF/CNPJ, Bairro, Cidade, UF e Email.</li>
                    <li><strong>Logística e Pesos:</strong> Quantidade, Peso Líquido, Peso Bruto e Espécie.</li>
                    <li><strong>Valores e Impostos:</strong> Valor Total da Nota (vNF), Valor dos Produtos (vProd).</li>
                    <li><strong>Terminais Logísticos:</strong> Identificação automática de TEG, TEAG, Transbordo e Retirada.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    Suporte a Processamento em Lote (ZIP/Pastas)
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Você pode arrastar uma pasta inteira ou um arquivo <strong>.ZIP</strong> contendo centenas de DANFEs em PDF. O sistema executa o parsing simultâneo em lotes otimizados e disponibiliza um botão para <strong>Baixar Todos os XMLs em ZIP</strong> mantendo a organização original.
                  </p>
                  <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 text-xs">
                    <strong>Recurso Exclusivo:</strong> Se o DANFE contiver o XML diretamente embutido na estrutura de anexos do PDF, o sistema extrai o XML original nativo com 100% de precisão fiscal.
                  </div>
                </div>
              </div>

              {/* Botões de Ação na Lista de Notas em PDF */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 space-y-3">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Opções Disponíveis para Cada Nota Convertida
                </h4>
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400">Baixar XML Individual:</strong>
                    <p className="text-zinc-500 mt-0.5">Salva o arquivo .xml com a estrutura NFe v4.00 formatada.</p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400">Ver / Copiar XML:</strong>
                    <p className="text-zinc-500 mt-0.5">Abre um modal com o código XML syntax-highlighted para cópia rápida.</p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400">Analisar no Painel:</strong>
                    <p className="text-zinc-500 mt-0.5">Envia o XML gerado diretamente para o Painel de Conferência Geral.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CONTEÚDO TÓPICO 3: CONFERÊNCIA GERAL, CNPJ, ÁUDIO E MAPA */}
      {activeTopic === 'conferencia-geral' && (
        <div className="space-y-6">
          <Card className="border-blue-200 dark:border-blue-900/40">
            <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20 rounded-t-xl">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold text-base">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <span>Auditoria Avançada, Validação de CNPJ, Alertas por Voz e Visões do Sistema</span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                Conheça todos os recursos de auditoria fiscal e visualização analítica disponíveis no Painel Principal.
              </p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Validação de CNPJ da Chave */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Validação do CNPJ Embutido na Chave de Acesso
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    A Chave de Acesso de 44 dígitos contém o CNPJ do emissor nas posições 7 a 20. O sistema valida automaticamente se esse CNPJ bate com o <strong>CNPJ do Emitente</strong> ou <strong>CNPJ do Destinatário</strong> informados nos dados da nota fiscal.
                  </p>
                  <div className="space-y-1.5 text-xs pt-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        CNPJ OK (EMITENTE)
                      </span>
                      <span className="text-zinc-500">CNPJ da Chave bate com o Emissor da NF</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        CNPJ OK (DESTINATÁRIO)
                      </span>
                      <span className="text-zinc-500">CNPJ da Chave bate com o Destinatário</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                        DIVERGÊNCIA CNPJ
                      </span>
                      <span className="text-zinc-500">CNPJ da Chave não pertence ao Emitente nem Destinatário</span>
                    </div>
                  </div>
                </div>

                {/* Filtro de Tipo de Arquivo a Processar */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Filter className="h-4 w-4 text-indigo-600" />
                    Filtro de Processamento de Arquivos
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Você pode escolher exatamente qual tipo de arquivo o Painel de Conferência deve processar para evitar leitura desnecessária de outros formatos:
                  </p>
                  <ul className="list-disc list-inside text-xs text-zinc-600 dark:text-zinc-400 space-y-1 pl-1">
                    <li><strong>Processar Todos (XML e PDF):</strong> Lê e converte tanto arquivos XML quanto DANFEs em PDF.</li>
                    <li><strong>Processar apenas XML:</strong> Ignora qualquer arquivo PDF e processa estritamente XMLs ou pacotes ZIP com XML.</li>
                    <li><strong>Processar apenas PDFs:</strong> Ignora arquivos XML e processa estritamente arquivos PDF ou pacotes ZIP com PDF.</li>
                  </ul>
                </div>

                {/* Alerta por Voz */}
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-amber-600" />
                    Alertas Sonoros e Sintetizador de Voz
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Ative a opção <strong>"Voz de Alerta"</strong> no cabeçalho. Sempre que o sistema detectar uma nota fiscal com divergência de CNPJ na Chave ou terminais críticos, o sintetizador emitirá um aviso falado em português orientando a equipe de conferência.
                  </p>
                  <p className="text-xs text-zinc-500 italic">
                    Dica: Você pode testar a voz a qualquer momento clicando no botão "Testar Áudio" ao lado da opção.
                  </p>
                </div>
              </div>

              {/* As 4 Abas Principais do Painel de Conferência */}
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 space-y-3">
                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  Visões Analíticas Disponíveis no Painel Principal
                </h4>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-1">
                      <FileText className="h-3.5 w-3.5" /> Lista de Notas
                    </strong>
                    <p className="text-zinc-600 dark:text-zinc-400">Exibição detalhada de cada nota, emitente, destinatário, itens e totais com expansão individual.</p>
                  </div>

                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-1">
                      <Layers className="h-3.5 w-3.5" /> Dashboard
                    </strong>
                    <p className="text-zinc-600 dark:text-zinc-400">Métricas consolidadas de faturamento total, quantidade, maiores emitentes e distribuição por tipo de produto.</p>
                  </div>

                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-1">
                      <Search className="h-3.5 w-3.5" /> Busca Avançada
                    </strong>
                    <p className="text-zinc-600 dark:text-zinc-400">Filtre notas por CNPJ, Razão Social, Chave de Acesso, Cidade ou Período com exportação direta.</p>
                  </div>

                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg border">
                    <strong className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 mb-1">
                      <MapPin className="h-3.5 w-3.5" /> Mapa Logístico
                    </strong>
                    <p className="text-zinc-600 dark:text-zinc-400">Visualização geográfica dos pontos de entrega, transbordos e terminais logísticos (TEG, TEAG, etc).</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CONTEÚDO TÓPICO 4: PERGUNTAS FREQUENTES & DICAS */}
      {activeTopic === 'faq' && (
        <div className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="bg-zinc-100/50 dark:bg-zinc-900/50 rounded-t-xl">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-indigo-600" />
                Perguntas Frequentes & Dicas de Uso
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 text-xs">
              <div className="p-3.5 rounded-lg border bg-white dark:bg-zinc-900 space-y-1">
                <strong className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  1. Qual formato de arquivo Excel posso utilizar na conferência?
                </strong>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Você pode usar planilhas nos formatos <strong>.XLSX</strong>, <strong>.XLS</strong> ou <strong>.CSV</strong>. O sistema processa automaticamente todas as abas e linhas sem exigir cabeçalhos rígidos.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-white dark:bg-zinc-900 space-y-1">
                <strong className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  2. Como nomear a coluna de peso no Excel para que o sistema reconheça?
                </strong>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  O sistema procura por colunas como <em>"Peso Selecionado"</em>, <em>"Peso Líquido"</em>, <em>"Peso"</em>, <em>"Peso Balança"</em> ou <em>"Quantidade"</em>. Caso sua coluna tenha um nome diferente, você pode renomear o cabeçalho para <strong>Peso Selecionado</strong> para garantir o preenchimento automático.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-white dark:bg-zinc-900 space-y-1">
                <strong className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  3. O sistema entende diferenças entre Toneladas (TON) e Quilogramas (KG)?
                </strong>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Sim! O algoritmo de confronto de pesos possui inteligência de conversão de unidades de medida. Se o Excel contiver <code>47,76</code> (TON) e a nota fiscal contiver <code>47760</code> (KG), o sistema identificará que são valores equivalentes e marcará como <strong>PESO CONFERE (OK)</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-white dark:bg-zinc-900 space-y-1">
                <strong className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  4. Posso importar arquivos ZIP com subpastas?
                </strong>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Sim! O leitor de ZIP é recursivo e extrai todos os arquivos PDF e XML presentes em qualquer nível de pasta ou subpasta dentro do arquivo ZIP.
                </p>
              </div>

              <div className="p-3.5 rounded-lg border bg-white dark:bg-zinc-900 space-y-1">
                <strong className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  5. Os dados das minhas notas e planilhas ficam salvos em algum servidor externo?
                </strong>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Não. Todo o processamento de leitura de PDF, parsing de XML e conferência com o Excel é realizado de forma segura diretamente no seu navegador, garantindo total privacidade e conformidade com a LGPD.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
