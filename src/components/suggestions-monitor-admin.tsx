import { useState, useEffect, useMemo } from 'react'
import {
  MessageSquareText,
  Send,
  CheckCircle2,
  Clock,
  User,
  Search,
  Tag,
  Sparkles,
  RefreshCw,
  Trash2,
  Edit3,
  Filter,
  Phone,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  subscribeToSuggestions,
  replyToSuggestion,
  deleteSuggestion,
  type SuggestionMessage,
  type SuggestionCategory,
} from '@/lib/suggestions-service'

interface SuggestionsMonitorAdminProps {
  currentSupervisor: string
  onNotify?: (msg: string, type: 'success' | 'info' | 'error') => void
}

export function SuggestionsMonitorAdmin({
  currentSupervisor,
  onNotify,
}: SuggestionsMonitorAdminProps) {
  const [suggestions, setSuggestions] = useState<SuggestionMessage[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'respondida'>('pendente')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Estado do formulário de resposta por item
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [supervisorNameInput, setSupervisorNameInput] = useState(currentSupervisor || 'Supervisor')
  const [isSubmittingReply, setIsSubmittingReply] = useState(false)

  useEffect(() => {
    const unsub = subscribeToSuggestions((list) => {
      setSuggestions(list)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (currentSupervisor) {
      setSupervisorNameInput(currentSupervisor)
    }
  }, [currentSupervisor])

  // Filtragem
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        item.senderName.toLowerCase().includes(term) ||
        item.subject.toLowerCase().includes(term) ||
        item.message.toLowerCase().includes(term) ||
        (item.contact && item.contact.toLowerCase().includes(term)) ||
        (item.response && item.response.toLowerCase().includes(term)) ||
        (item.respondedBy && item.respondedBy.toLowerCase().includes(term))
      )
    })
  }, [suggestions, statusFilter, categoryFilter, searchTerm])

  const pendingCount = suggestions.filter((s) => s.status === 'pendente').length
  const answeredCount = suggestions.filter((s) => s.status === 'respondida').length

  const handleOpenReply = (item: SuggestionMessage) => {
    setReplyingId(item.id)
    setReplyText(item.response || '')
    setSupervisorNameInput(currentSupervisor || item.respondedBy || 'Supervisor')
  }

  const handleSendReply = async (id: string) => {
    if (!replyText.trim()) {
      if (onNotify) {
        onNotify('Digite o texto da resposta antes de enviar.', 'error')
      }
      return
    }

    try {
      setIsSubmittingReply(true)
      await replyToSuggestion(id, replyText.trim(), supervisorNameInput.trim() || 'Supervisor')
      if (onNotify) {
        onNotify('Resposta enviada com sucesso ao Painel de Conferência!', 'success')
      }
      setReplyingId(null)
      setReplyText('')
    } catch (err: any) {
      alert('Erro ao responder: ' + (err.message || 'Falha de conexão'))
    } finally {
      setIsSubmittingReply(false)
    }
  }

  const handleDelete = async (id: string, senderName: string) => {
    if (window.confirm(`Deseja realmente remover a mensagem de "${senderName}"?`)) {
      await deleteSuggestion(id)
      if (onNotify) {
        onNotify('Mensagem removida com sucesso.', 'info')
      }
    }
  }

  const getCategoryLabel = (cat: SuggestionCategory) => {
    switch (cat) {
      case 'sugestao':
        return { label: 'Sugestão de Melhoria', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' }
      case 'duvida':
        return { label: 'Dúvida Operacional', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
      case 'divergencia':
        return { label: 'Divergência Fiscal', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800' }
      case 'solicitacao':
        return { label: 'Solicitação à Gestão', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800' }
      default:
        return { label: 'Geral', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700' }
    }
  }

  return (
    <div className="space-y-6">
      {/* Banner Superior com KPIs de Atendimento */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Total de Mensagens
              </p>
              <h3 className="text-2xl font-extrabold text-foreground mt-0.5">
                {suggestions.length}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
              <MessageSquareText className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Mensagens e dúvidas enviadas pelo Painel de Conferência
          </p>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Aguardando Resposta
              </p>
              <h3 className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
                {pendingCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Operadores aguardando retorno do supervisor no monitor
          </p>
        </Card>

        <Card className="p-4 bg-white dark:bg-zinc-900 border-emerald-200 dark:border-emerald-900/60 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Respondidas
              </p>
              <h3 className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {answeredCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Respostas entregues e disponíveis para consulta no painel
          </p>
        </Card>
      </div>

      {/* Caixa de Controle e Filtros */}
      <Card className="border-zinc-200 dark:border-zinc-800 shadow-xs">
        <CardHeader className="p-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Gestão de Sugestões & Atendimento Operacional
            </CardTitle>
            <CardDescription className="text-xs">
              Responda em tempo real às mensagens enviadas pelos conferentes. A resposta é sincronizada automaticamente na aba do usuário.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-zinc-500">Supervisor Ativo:</span>
            <span className="text-xs font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md">
              {currentSupervisor || 'Supervisor'}
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Barra de Filtros */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro Status */}
              <div className="inline-flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs font-semibold gap-1">
                <button
                  type="button"
                  onClick={() => setStatusFilter('pendente')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === 'pendente'
                      ? 'bg-amber-600 text-white shadow-xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Pendentes ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('respondida')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === 'respondida'
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Respondidas ({answeredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-indigo-600 text-white shadow-xs font-bold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  Todas ({suggestions.length})
                </button>
              </div>

              {/* Filtro Categoria */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-hidden cursor-pointer"
              >
                <option value="all">Todas Categorias</option>
                <option value="sugestao">Sugestões de Melhoria</option>
                <option value="duvida">Dúvidas Operacionais</option>
                <option value="divergencia">Divergências Fiscais</option>
                <option value="solicitacao">Solicitações</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            {/* Busca */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por colaborador, assunto..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Lista de Mensagens */}
          {filteredSuggestions.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-1">
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                Nenhuma mensagem encontrada neste filtro.
              </p>
              <p className="text-zinc-400">
                Assim que os conferentes enviarem sugestões pela aba do Painel, elas aparecerão aqui instantaneamente.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSuggestions.map((item) => {
                const catInfo = getCategoryLabel(item.category)
                const isAnswered = item.status === 'respondida'
                const isReplyingThis = replyingId === item.id

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isAnswered
                        ? 'bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800'
                        : 'bg-amber-50/20 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/50 shadow-xs'
                    }`}
                  >
                    {/* Header do Card */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                          <User className="h-3.5 w-3.5 text-indigo-500" />
                          <span>{item.senderName}</span>
                        </div>
                        {item.contact && (
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {item.contact}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {item.dateFormatted} às {item.timeFormatted}
                        </span>
                        {isAnswered ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            Respondida
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                            <Clock className="h-3 w-3 text-amber-600" />
                            Aguardando Resposta
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id, item.senderName)}
                          className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded transition-colors cursor-pointer"
                          title="Excluir mensagem"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Conteúdo da Mensagem */}
                    <div className="py-2.5 space-y-1">
                      <h4 className="text-xs font-bold text-foreground">
                        {item.subject}
                      </h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {item.message}
                      </p>
                    </div>

                    {/* Bloco de Resposta Atual (se já respondida) */}
                    {isAnswered && item.response && !isReplyingThis && (
                      <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-emerald-800 dark:text-emerald-300">
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Resposta enviada ao conferente</span>
                            <span className="text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                              (por <strong>{item.respondedBy || 'Supervisor'}</strong>)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.responseDateFormatted && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                {item.responseDateFormatted} às {item.responseTimeFormatted}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenReply(item)}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="h-3 w-3" />
                              Editar Resposta
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-emerald-950 dark:text-emerald-100 font-medium whitespace-pre-wrap leading-relaxed pl-4 border-l-2 border-emerald-400 dark:border-emerald-600">
                          {item.response}
                        </p>
                      </div>
                    )}

                    {/* Botão para Abrir Formulário de Resposta se não estiver respondendo */}
                    {!isReplyingThis && !isAnswered && (
                      <div className="mt-3 flex items-center justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenReply(item)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 px-3.5 gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Responder Conferente
                        </Button>
                      </div>
                    )}

                    {/* Formulário de Resposta Aberto */}
                    {isReplyingThis && (
                      <div className="mt-3 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-indigo-200 dark:border-indigo-800 space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            Redigir Resposta para {item.senderName}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <span>Respondendo como:</span>
                            <input
                              type="text"
                              value={supervisorNameInput}
                              onChange={(e) => setSupervisorNameInput(e.target.value)}
                              placeholder="Nome do supervisor"
                              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-0.5 text-xs font-bold text-foreground focus:outline-hidden w-36"
                            />
                          </div>
                        </div>

                        <textarea
                          rows={3}
                          autoFocus
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder={`Digite aqui sua resposta, esclarecimento ou orientação para ${item.senderName}. Esta resposta ficará visível para ele na aba "Painel de Conferência"...`}
                          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                        />

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-zinc-400">
                            Ao enviar, o status será marcado como <strong>"Respondida"</strong> no painel.
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReplyingId(null)
                                setReplyText('')
                              }}
                              className="text-xs h-8 px-3 cursor-pointer"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isSubmittingReply || !replyText.trim()}
                              onClick={() => handleSendReply(item.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-8 px-4 gap-1.5 cursor-pointer shadow-xs"
                            >
                              {isSubmittingReply ? (
                                <>
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  Salvando...
                                </>
                              ) : (
                                <>
                                  <Send className="h-3.5 w-3.5" />
                                  Enviar Resposta
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
