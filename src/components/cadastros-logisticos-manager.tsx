'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Building2,
  Train,
  Plus,
  Search,
  Trash2,
  Edit2,
  CheckCircle2,
  Sparkles,
  Info,
  ShieldCheck,
  Copy,
  Check,
  ArrowRight,
  Database,
  Filter,
  RefreshCw,
  Tag,
  MapPin,
} from 'lucide-react'
import {
  getAllDestinatarios,
  getCustomDestinatarios,
  saveCustomDestinatario,
  deleteCustomDestinatario,
  getAllTransbordos,
  getCustomTransbordos,
  saveCustomTransbordo,
  deleteCustomTransbordo,
  subscribeCadastrosChanges,
  matchDestinatarioFromTextOrCnpj,
  matchTransbordoFromText,
  type CadastroDestinatario,
  type CadastroTransbordo,
} from '@/lib/cadastros-logisticos-service'
import { formatCNPJ } from '@/lib/destinatario-utils'

interface CadastrosLogisticosManagerProps {
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export function CadastrosLogisticosManager({ onNotify }: CadastrosLogisticosManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'destinatarios' | 'transbordos'>('destinatarios')
  const [searchFilter, setSearchFilter] = useState('')
  const [originFilter, setOriginFilter] = useState<'TODOS' | 'CUSTOM' | 'SISTEMA'>('TODOS')

  // Listas locais de dados
  const [destinatarios, setDestinatarios] = useState<CadastroDestinatario[]>([])
  const [transbordos, setTransbordos] = useState<CadastroTransbordo[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Modais de Criação / Edição
  const [isDestModalOpen, setIsDestModalOpen] = useState(false)
  const [isTransModalOpen, setIsTransModalOpen] = useState(false)
  const [editingDest, setEditingDest] = useState<CadastroDestinatario | null>(null)
  const [editingTrans, setEditingTrans] = useState<CadastroTransbordo | null>(null)

  // Formulário Destinatário
  const [destNome, setDestNome] = useState('')
  const [destCnpj, setDestCnpj] = useState('')
  const [destCnpjsAdicionais, setDestCnpjsAdicionais] = useState('')
  const [destAliases, setDestAliases] = useState('')
  const [destCidade, setDestCidade] = useState('')
  const [destUf, setDestUf] = useState('')
  const [destObservacoes, setDestObservacoes] = useState('')

  // Formulário Transbordo
  const [transNome, setTransNome] = useState('')
  const [transCnpj, setTransCnpj] = useState('')
  const [transCidade, setTransCidade] = useState('')
  const [transUf, setTransUf] = useState('')
  const [transOperadora, setTransOperadora] = useState<'RUMO' | 'VLI' | 'OUTRA' | string>('RUMO')
  const [transAliases, setTransAliases] = useState('')
  const [transObservacoes, setTransObservacoes] = useState('')

  // Simulador / Testador de Reconhecimento em Tempo Real
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState<{
    destMatch: string | null
    transMatch: string | null
  } | null>(null)

  // Carrega e assina atualizações
  const reloadData = () => {
    setDestinatarios(getAllDestinatarios())
    setTransbordos(getAllTransbordos())
  }

  useEffect(() => {
    reloadData()
    const unsubscribe = subscribeCadastrosChanges(() => {
      reloadData()
    })
    return () => unsubscribe()
  }, [])

  // Limpa formulário de Destinatário
  const openNewDestModal = () => {
    setEditingDest(null)
    setDestNome('')
    setDestCnpj('')
    setDestCnpjsAdicionais('')
    setDestAliases('')
    setDestCidade('')
    setDestUf('')
    setDestObservacoes('')
    setIsDestModalOpen(true)
  }

  const openEditDestModal = (dest: CadastroDestinatario) => {
    setEditingDest(dest)
    setDestNome(dest.nome)
    setDestCnpj(dest.cnpjPrincipal)
    setDestCnpjsAdicionais((dest.cnpjsAdicionais || []).join(', '))
    setDestAliases((dest.aliases || []).join(', '))
    setDestCidade(dest.cidade || '')
    setDestUf(dest.uf || '')
    setDestObservacoes(dest.observacoes || '')
    setIsDestModalOpen(true)
  }

  // Salvar Destinatário
  const handleSaveDestinatario = (e: React.FormEvent) => {
    e.preventDefault()
    if (!destNome.trim()) {
      onNotify?.('Informe o nome ou razão social do destinatário.', 'error')
      return
    }
    const cleanCnpj = destCnpj.replace(/\D/g, '')
    if (cleanCnpj.length !== 14 && cleanCnpj.length !== 11) {
      onNotify?.('Informe um CNPJ válido com 14 dígitos (ou CPF com 11 dígitos).', 'error')
      return
    }

    const adCnpjs = destCnpjsAdicionais
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const aliases = destAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    saveCustomDestinatario({
      id: editingDest?.id,
      nome: destNome.trim().toUpperCase(),
      cnpjPrincipal: formatCNPJ(destCnpj),
      cnpjsAdicionais: adCnpjs,
      aliases,
      cidade: destCidade.trim(),
      uf: destUf.trim().toUpperCase(),
      observacoes: destObservacoes.trim(),
      ativo: true,
    })

    setIsDestModalOpen(false)
    reloadData()
    onNotify?.(
      `Destinatário "${destNome.trim().toUpperCase()}" salvo com sucesso! O sistema passará a buscá-lo automaticamente nas notas.`,
      'success'
    )
  }

  // Deletar Destinatário
  const handleDeleteDestinatario = (id: string, nome: string) => {
    if (window.confirm(`Tem certeza que deseja remover o destinatário "${nome}" dos cadastros personalizados?`)) {
      deleteCustomDestinatario(id)
      reloadData()
      onNotify?.(`Destinatário "${nome}" removido com sucesso.`, 'info')
    }
  }

  // Limpa formulário de Transbordo
  const openNewTransModal = () => {
    setEditingTrans(null)
    setTransNome('')
    setTransCnpj('')
    setTransCidade('')
    setTransUf('')
    setTransOperadora('RUMO')
    setTransAliases('')
    setTransObservacoes('')
    setIsTransModalOpen(true)
  }

  const openEditTransModal = (trans: CadastroTransbordo) => {
    setEditingTrans(trans)
    setTransNome(trans.nome)
    setTransCnpj(trans.cnpj || '')
    setTransCidade(trans.cidade || '')
    setTransUf(trans.uf || '')
    setTransOperadora(trans.operadora || 'RUMO')
    setTransAliases((trans.aliases || []).join(', '))
    setTransObservacoes(trans.observacoes || '')
    setIsTransModalOpen(true)
  }

  // Salvar Transbordo
  const handleSaveTransbordo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!transNome.trim()) {
      onNotify?.('Informe o nome ou identificação do transbordo.', 'error')
      return
    }

    const aliases = transAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    saveCustomTransbordo({
      id: editingTrans?.id,
      nome: transNome.trim().toUpperCase(),
      cnpj: transCnpj ? formatCNPJ(transCnpj) : undefined,
      cidade: transCidade.trim(),
      uf: transUf.trim().toUpperCase(),
      operadora: transOperadora,
      aliases,
      observacoes: transObservacoes.trim(),
      ativo: true,
    })

    setIsTransModalOpen(false)
    reloadData()
    onNotify?.(
      `Transbordo "${transNome.trim().toUpperCase()}" salvo com sucesso! O sistema passará a reconhecê-lo automaticamente nas notas.`,
      'success'
    )
  }

  // Deletar Transbordo
  const handleDeleteTransbordo = (id: string, nome: string) => {
    if (window.confirm(`Tem certeza que deseja remover o transbordo "${nome}" dos cadastros personalizados?`)) {
      deleteCustomTransbordo(id)
      reloadData()
      onNotify?.(`Transbordo "${nome}" removido com sucesso.`, 'info')
    }
  }

  // Copiar CNPJ
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Simulador de Teste
  const handleRunTest = () => {
    if (!testInput.trim()) return
    const destMatch = matchDestinatarioFromTextOrCnpj(testInput, testInput, testInput)
    const transMatch = matchTransbordoFromText(testInput)
    setTestResult({ destMatch, transMatch })
  }

  // Filtragem dos Destinatários
  const filteredDestinatarios = useMemo(() => {
    return destinatarios.filter((d) => {
      if (originFilter === 'CUSTOM' && d.isSistema) return false
      if (originFilter === 'SISTEMA' && !d.isSistema) return false

      if (!searchFilter.trim()) return true
      const q = searchFilter.toUpperCase()
      const inNome = d.nome.toUpperCase().includes(q)
      const inCnpj = (d.cnpjPrincipal || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) || d.cnpjPrincipal.includes(q)
      const inAliases = (d.aliases || []).some((a) => a.toUpperCase().includes(q))
      const inCidade = (d.cidade || '').toUpperCase().includes(q)
      return inNome || inCnpj || inAliases || inCidade
    })
  }, [destinatarios, searchFilter, originFilter])

  // Filtragem dos Transbordos
  const filteredTransbordos = useMemo(() => {
    return transbordos.filter((t) => {
      if (originFilter === 'CUSTOM' && t.isSistema) return false
      if (originFilter === 'SISTEMA' && !t.isSistema) return false

      if (!searchFilter.trim()) return true
      const q = searchFilter.toUpperCase()
      const inNome = t.nome.toUpperCase().includes(q)
      const inCnpj = t.cnpj ? t.cnpj.includes(q) : false
      const inAliases = (t.aliases || []).some((a) => a.toUpperCase().includes(q))
      const inCidade = (t.cidade || '').toUpperCase().includes(q)
      return inNome || inCnpj || inAliases || inCidade
    })
  }, [transbordos, searchFilter, originFilter])

  const customDestCount = destinatarios.filter((d) => !d.isSistema).length
  const customTransCount = transbordos.filter((t) => !t.isSistema).length

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 border border-blue-200/80 dark:border-blue-900/60 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-100">
              Cadastros Logísticos (Destinatários & Transbordos)
            </h2>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
            Consulte a lista completa de empresas e transbordos que o sistema já identifica automaticamente nas notas fiscais,
            ou <strong>cadastre novos Destinatários e Transbordos</strong> para que notas marcadas como <em>&quot;Não Informado&quot;</em> passem a ser resolvidas instantaneamente.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            size="sm"
            onClick={activeSubTab === 'destinatarios' ? openNewDestModal : openNewTransModal}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs flex items-center gap-1.5 h-9 px-3.5"
          >
            <Plus className="h-4 w-4" />
            {activeSubTab === 'destinatarios' ? 'Novo Destinatário' : 'Novo Transbordo'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={reloadData}
            className="text-xs h-9 px-2.5 cursor-pointer text-zinc-600 dark:text-zinc-300"
            title="Recarregar cadastros"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Caixa de Simulação / Teste Rápido de Reconhecimento */}
      <Card className="border border-indigo-100 dark:border-indigo-950/60 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-2xs">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <span>Simulador de Reconhecimento em Tempo Real</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Cole um CNPJ, razão social ou trecho de informação complementar da nota para testar se os cadastros ativos já conseguem identificá-lo:
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Input
              value={testInput}
              onChange={(e) => {
                setTestInput(e.target.value)
                if (testResult) setTestResult(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRunTest()
              }}
              placeholder="Ex: 04.626.426/0001-90, USINA TIETE, ou 'TRANSBORDO EM UBERABA TIUB'..."
              className="text-xs h-9 bg-white dark:bg-zinc-900"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleRunTest}
              className="text-xs h-9 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
            >
              Testar Reconhecimento
            </Button>
          </div>

          {testResult && (
            <div className="mt-2 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1">
                <span className="font-bold text-zinc-700 dark:text-zinc-300">Resultado da Simulação:</span>
                <span className="text-[10px] text-zinc-400 font-mono">Motor de Busca Ativo</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800/60">
                  <span className="font-semibold text-zinc-500 block mb-0.5">Destinatário Identificado:</span>
                  {testResult.destMatch ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {testResult.destMatch}
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">Nenhum destinatário correspondente encontrado</span>
                  )}
                </div>
                <div className="p-2 rounded bg-zinc-50 dark:bg-zinc-800/60">
                  <span className="font-semibold text-zinc-500 block mb-0.5">Transbordo Identificado:</span>
                  {testResult.transMatch ? (
                    <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {testResult.transMatch}
                    </span>
                  ) : (
                    <span className="text-zinc-400 italic">Nenhum transbordo correspondente encontrado</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sub-Abas: Destinatários vs Transbordos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('destinatarios')
              setSearchFilter('')
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'destinatarios'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Destinatários & CNPJs ({destinatarios.length})</span>
            {customDestCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'destinatarios' ? 'bg-blue-500 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                +{customDestCount} novos
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('transbordos')
              setSearchFilter('')
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'transbordos'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Train className="h-4 w-4" />
            <span>Transbordos & Pátios ({transbordos.length})</span>
            {customTransCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeSubTab === 'transbordos' ? 'bg-blue-500 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                +{customTransCount} novos
              </span>
            )}
          </button>
        </div>

        {/* Filtros de Busca e Origem */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={`Filtrar ${activeSubTab === 'destinatarios' ? 'destinatários' : 'transbordos'}...`}
              className="pl-8 text-xs h-8 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            />
          </div>

          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as any)}
            className="text-xs h-8 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 text-zinc-700 dark:text-zinc-300 focus:outline-hidden"
          >
            <option value="TODOS">Todos</option>
            <option value="CUSTOM">Apenas Personalizados</option>
            <option value="SISTEMA">Apenas Padrão</option>
          </select>
        </div>
      </div>

      {/* CONTEÚDO DA ABA 1: DESTINATÁRIOS */}
      {activeSubTab === 'destinatarios' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Exibindo <strong>{filteredDestinatarios.length}</strong> de <strong>{destinatarios.length}</strong> destinatário(s) cadastrado(s)
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewDestModal}
              className="text-xs h-7 cursor-pointer text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar Destinatário
            </Button>
          </div>

          {filteredDestinatarios.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2">
              <Building2 className="h-10 w-10 text-zinc-400 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhum destinatário encontrado com os filtros atuais
              </p>
              <p className="text-xs text-zinc-500">
                Clique no botão &quot;Novo Destinatário&quot; para cadastrar uma nova empresa e seu CNPJ.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDestinatarios.map((dest) => {
                const isCustom = !dest.isSistema
                const isCopied = copiedId === dest.id

                return (
                  <div
                    key={dest.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 shadow-2xs ${
                      isCustom
                        ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/15 dark:bg-emerald-950/10 hover:border-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {dest.nome}
                          </span>
                          {isCustom ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Personalizado
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              Padrão Sistema
                            </span>
                          )}
                        </div>

                        {(dest.cidade || dest.uf) && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-400" />
                            <span>{[dest.cidade, dest.uf].filter(Boolean).join(' - ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação para Itens Personalizados */}
                      {isCustom && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditDestModal(dest)}
                            className="p-1 rounded text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Editar Destinatário"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDestinatario(dest.id, dest.nome)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Excluir Destinatário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CNPJ Principal */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                          CNPJ Principal:
                        </span>
                        <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                          {dest.cnpjPrincipal}
                        </span>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopy(dest.cnpjPrincipal, dest.id)}
                        className="h-6 px-2 text-[10px] text-zinc-500 cursor-pointer"
                      >
                        {isCopied ? (
                          <span className="text-emerald-600 flex items-center gap-1 font-bold">
                            <Check className="h-3 w-3" /> Copiado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copiar
                          </span>
                        )}
                      </Button>
                    </div>

                    {/* CNPJs Adicionais / Filiais se houver */}
                    {dest.cnpjsAdicionais && dest.cnpjsAdicionais.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400">
                          Filiais / CNPJs Adicionais:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {dest.cnpjsAdicionais.map((c, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]"
                            >
                              {formatCNPJ(c)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Aliases e Palavras-Chave de Busca */}
                    {dest.aliases && dest.aliases.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          Termos Reconhecidos na Nota:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {dest.aliases.map((al, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-medium border border-blue-200 dark:border-blue-900"
                            >
                              {al}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {dest.observacoes && (
                      <p className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        {dest.observacoes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: TRANSBORDOS */}
      {activeSubTab === 'transbordos' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Exibindo <strong>{filteredTransbordos.length}</strong> de <strong>{transbordos.length}</strong> transbordo(s) cadastrado(s)
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={openNewTransModal}
              className="text-xs h-7 cursor-pointer text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar Transbordo
            </Button>
          </div>

          {filteredTransbordos.length === 0 ? (
            <div className="p-12 text-center border border-dashed rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/50 space-y-2">
              <Train className="h-10 w-10 text-zinc-400 mx-auto opacity-50" />
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhum transbordo encontrado com os filtros atuais
              </p>
              <p className="text-xs text-zinc-500">
                Clique no botão &quot;Novo Transbordo&quot; para cadastrar um novo pátio/local de transbordo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTransbordos.map((trans) => {
                const isCustom = !trans.isSistema

                return (
                  <div
                    key={trans.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 shadow-2xs ${
                      isCustom
                        ? 'border-emerald-300 dark:border-emerald-900 bg-emerald-50/15 dark:bg-emerald-950/10 hover:border-emerald-400'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 hover:border-blue-300 dark:hover:border-blue-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                            {trans.nome}
                          </span>
                          {trans.operadora && (
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              trans.operadora === 'RUMO'
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : trans.operadora === 'VLI'
                                ? 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 border border-teal-300 dark:border-teal-800'
                                : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}>
                              {trans.operadora}
                            </span>
                          )}
                          {isCustom ? (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              Personalizado
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              Padrão Sistema
                            </span>
                          )}
                        </div>

                        {(trans.cidade || trans.uf) && (
                          <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-zinc-400" />
                            <span>{[trans.cidade, trans.uf].filter(Boolean).join(' - ')}</span>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação para Itens Personalizados */}
                      {isCustom && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditTransModal(trans)}
                            className="p-1 rounded text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
                            title="Editar Transbordo"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransbordo(trans.id, trans.nome)}
                            className="p-1 rounded text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                            title="Excluir Transbordo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CNPJ se houver */}
                    {trans.cnpj && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800/60 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                            CNPJ do Armazém / Transbordo:
                          </span>
                          <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {trans.cnpj}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(trans.cnpj!, trans.id)}
                          className="h-6 px-2 text-[10px] text-zinc-500 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Aliases e Palavras-Chave de Busca */}
                    {trans.aliases && trans.aliases.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold text-zinc-400 flex items-center gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          Termos Buscados nas Notas (InfCpl / Dados Adicionais):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {trans.aliases.map((al, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-medium border border-amber-200 dark:border-amber-900"
                            >
                              {al}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {trans.observacoes && (
                      <p className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        {trans.observacoes}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CADASTRO / EDIÇÃO DE DESTINATÁRIO */}
      <Dialog open={isDestModalOpen} onOpenChange={setIsDestModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              {editingDest ? 'Editar Destinatário' : 'Cadastrar Novo Destinatário'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Preencha os dados da empresa. O sistema passará a buscá-la tanto pelo CNPJ quanto por seu nome ou termos alternativos em todas as notas.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDestinatario} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Razão Social / Nome de Exibição <span className="text-rose-500">*</span>
              </label>
              <Input
                value={destNome}
                onChange={(e) => setDestNome(e.target.value)}
                placeholder="Ex: SUCRES ET DENREES BRASIL S.A."
                required
                className="text-xs uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                CNPJ Principal (14 dígitos) <span className="text-rose-500">*</span>
              </label>
              <Input
                value={destCnpj}
                onChange={(e) => setDestCnpj(e.target.value)}
                placeholder="Ex: 00.000.000/0001-00"
                required
                className="text-xs font-mono"
              />
              <span className="text-[10px] text-zinc-400">
                Pode digitar com ou sem pontos/barras.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                CNPJs Adicionais / Outras Filiais (opcional)
              </label>
              <Input
                value={destCnpjsAdicionais}
                onChange={(e) => setDestCnpjsAdicionais(e.target.value)}
                placeholder="Separados por vírgula: 00.000.000/0002-00, 00.000.000/0003-00"
                className="text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Termos / Aliases de Busca nas Notas (opcional)
              </label>
              <Input
                value={destAliases}
                onChange={(e) => setDestAliases(e.target.value)}
                placeholder="Ex: SUCDEN, SUCRES, DENREES (separados por vírgula)"
                className="text-xs"
              />
              <span className="text-[10px] text-zinc-400">
                Palavras-chave que podem aparecer no campo de informações complementares quando o nome oficial estiver cortado.
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Cidade (opcional)
                </label>
                <Input
                  value={destCidade}
                  onChange={(e) => setDestCidade(e.target.value)}
                  placeholder="Ex: Santos"
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  UF
                </label>
                <Input
                  value={destUf}
                  onChange={(e) => setDestUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  className="text-xs uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Observações Operacionais (opcional)
              </label>
              <Input
                value={destObservacoes}
                onChange={(e) => setDestObservacoes(e.target.value)}
                placeholder="Ex: Cliente com entrega prioritária no armazém"
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDestModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editingDest ? 'Salvar Alterações' : 'Cadastrar Destinatário'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CADASTRO / EDIÇÃO DE TRANSBORDO */}
      <Dialog open={isTransModalOpen} onOpenChange={setIsTransModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Train className="h-5 w-5 text-blue-600" />
              {editingTrans ? 'Editar Transbordo' : 'Cadastrar Novo Transbordo'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre o nome do pátio, pátio rodoferroviário ou armazém de transbordo para identificação automática em dados adicionais e relatórios.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTransbordo} className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
                Nome do Transbordo / Pátio <span className="text-rose-500">*</span>
              </label>
              <Input
                value={transNome}
                onChange={(e) => setTransNome(e.target.value)}
                placeholder="Ex: NOVO TERMINAL ARMAZENAGEM"
                required
                className="text-xs uppercase font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  CNPJ do Armazém / Transbordo (opcional)
                </label>
                <Input
                  value={transCnpj}
                  onChange={(e) => setTransCnpj(e.target.value)}
                  placeholder="Ex: 00.000.000/0001-00"
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Operadora
                </label>
                <select
                  value={transOperadora}
                  onChange={(e) => setTransOperadora(e.target.value)}
                  className="w-full text-xs h-9 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 text-zinc-700 dark:text-zinc-300 focus:outline-hidden"
                >
                  <option value="RUMO">Rumo Logística</option>
                  <option value="VLI">VLI Multimodal</option>
                  <option value="OUTRA">Outra / Rodoviária</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Cidade (opcional)
                </label>
                <Input
                  value={transCidade}
                  onChange={(e) => setTransCidade(e.target.value)}
                  placeholder="Ex: Paulínia"
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  UF
                </label>
                <Input
                  value={transUf}
                  onChange={(e) => setTransUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  className="text-xs uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Termos / Aliases de Busca no Texto da Nota
              </label>
              <Input
                value={transAliases}
                onChange={(e) => setTransAliases(e.target.value)}
                placeholder="Ex: PATIO PAULINIA, TRANSBORDO PAULINIA (separados por vírgula)"
                className="text-xs"
              />
              <span className="text-[10px] text-zinc-400">
                Se algum destes termos aparecer no campo &quot;Informações Complementares&quot;, o transbordo será preenchido automaticamente.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                Observações (opcional)
              </label>
              <Input
                value={transObservacoes}
                onChange={(e) => setTransObservacoes(e.target.value)}
                placeholder="Ex: Transbordo com balança integrada"
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTransModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
              >
                {editingTrans ? 'Salvar Alterações' : 'Cadastrar Transbordo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
