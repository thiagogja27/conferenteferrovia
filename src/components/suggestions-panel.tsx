import { useState, useEffect, useMemo } from 'react'
import {
  MessageSquarePlus,
  Send,
  CheckCircle2,
  Clock,
  MessageCircle,
  HelpCircle,
  Sparkles,
  AlertCircle,
  Search,
  User,
  Phone,
  Tag,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  subscribeToSuggestions,
  sendSuggestion,
  type SuggestionMessage,
  type SuggestionCategory,
} from '@/lib/suggestions-service'
import { getOperatorName } from '@/lib/firebase-realtime'
import { useAuth } from '@/context/auth-context'

interface SuggestionsPanelProps {
  onClose?: () => void
  onNotify?: (msg: string, type: 'success' | 'info' | 'error') => void
}

export function SuggestionsPanel({ onClose, onNotify }: SuggestionsPanelProps) {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState<SuggestionMessage[]>([])
  const [activeSubTab, setActiveSubTab] = useState<'send' | 'history'>('send')

  // Formulário de Nova Sugestão
  const defaultSender = user?.displayName || user?.email?.split('@')[0] || getOperatorName() || 'Colaborador'
  const [senderName, setSenderName] = useState(defaultSender)
  const [contact, setContact] = useState('')
  const [category, setCategory] = useState<SuggestionCategory>('sugestao')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)

  // Filtros de Consulta
  const [statusFilter, setStatusFilter] = useState<'all' | 'respondida' | 'pendente'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const unsub = subscribeToSuggestions((list) => {
      setSuggestions(list)
    })
    return () => unsub()
  }, [])

  // Auto-preenche o remetente se o usuário logar depois
  useEffect(() => {
    if (user?.displayName || user?.email) {
      const name = user.displayName || user.email?.split('@')[0] || ''
      if (name && senderName === 'Colaborador') {
        setSenderName(name)
      }
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) {
      if (onNotify) {
        onNotify('Por favor, preencha o assunto e a mensagem.', 'error')
      }
      return
    }

    try {
      setIsSending(true)
      const res = await sendSuggestion({
        senderName: senderName.trim() || 'Colaborador',
        contact: contact.trim(),
        category,
        subject: subject.trim(),
        message: message.trim(),
      })

      setSendSuccess(`Sua mensagem #${res.id.slice(-5).toUpperCase()} foi entregue à supervisão!`)
      if (onNotify) {
        onNotify('Mensagem enviada com sucesso para o Monitor em tempo real.', 'success')
      }

      // Limpa os campos
      setSubject('')
      setMessage('')
      setTimeout(() => {
        setSendSuccess(null)
        setActiveSubTab('history')
      }, 1800)
    } catch (err: any) {
      alert('Erro ao enviar mensagem: ' + (err.message || 'Falha de conexão'))
    } finally {
      setIsSending(false)
    }
  }

  // Filtragem de mensagens para consulta
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase()
      return (
        s.senderName.toLowerCase().includes(term) ||
        s.subject.toLowerCase().includes(term) ||
        s.message.toLowerCase().includes(term) ||
        (s.response && s.response.toLowerCase().includes(term)) ||
        (s.respondedBy && s.respondedBy.toLowerCase().includes(term))
      )
    })
  }, [suggestions, statusFilter, searchTerm])

  const answeredCount = suggestions.filter((s) => s.status === 'respondida').length
  const pendingCount = suggestions.filter((s) => s.status === 'pendente').length

  const getCategoryLabel = (cat: SuggestionCategory) => {
    switch (cat) {
      case 'sugestao':
        return { label: 'Sugestão de Melhoria', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' }
      case 'duvida':
        return { label: 'Dúvida Operacional', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800' }
      case 'divergencia':
        return { label: 'Divergência / Fiscal', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800' }
      case 'solicitacao':
        return { label: 'Solicitação à Gestão', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800' }
      default:
        return { label: 'Geral', color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700' }
    }
  }

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      <CardHeader className="bg-zinc-50/70 dark:bg-zinc-900/60 border-b border-zinc-200/80 dark:border-zinc-800 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                Caixa de Sugestões & Atendimento Operacional
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Envie dúvidas, ideias e mensagens para o supervisor responder diretamente pelo Monitor em tempo real.
              </CardDescription>
            </div>
          </div>

          {/* Sub-abas: Enviar vs Consultar Respostas */}
          <div className="inline-flex bg-zinc-200/80 dark:bg-zinc-800 p-1 rounded-xl text-xs font-bold gap-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab('send')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'send'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              Nova Mensagem
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer relative ${
                activeSubTab === 'history'
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Consultar Respostas</span>
              {answeredCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                  {answeredCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        {activeSubTab === 'send' ? (
          /* FORMULÁRIO DE ENVIO */
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
            {sendSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2.5 animate-fadeIn">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{sendSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Nome do Usuário */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-indigo-500" />
                  Seu Nome / Identificação <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Ex: João da Silva / Operador 01"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Telefone / Ramal / WhatsApp (Opcional) */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                  Telefone / WhatsApp ou Ramal <span className="text-zinc-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Ex: (13) 99999-9999 ou Ramal 402"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5 text-indigo-500" />
                  Tipo de Mensagem
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="sugestao">💡 Sugestão de Melhoria</option>
                  <option value="duvida">❓ Dúvida Operacional / Conferência</option>
                  <option value="divergencia">⚠️ Reporte de Divergência Fiscal</option>
                  <option value="solicitacao">📋 Solicitação para a Gestão</option>
                  <option value="outro">💬 Outro Assunto</option>
                </select>
              </div>

              {/* Assunto */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                  Assunto da Mensagem <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex: Dúvida sobre conferência de transbordo"
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Texto da Mensagem */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                Detalhes da sua Sugestão ou Pergunta <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva detalhadamente sua sugestão, problema ou dúvida. A mensagem será enviada em tempo real para a tela do Monitor e os supervisores poderão responder diretamente por lá..."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden resize-y"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-zinc-400">
                A resposta do supervisor ficará visível na aba <strong>"Consultar Respostas"</strong>.
              </span>
              <Button
                type="submit"
                disabled={isSending || !subject.trim() || !message.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9 px-4 gap-2 cursor-pointer shadow-xs"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Enviando ao Monitor...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Enviar ao Supervisor
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          /* CONSULTA DE SUGESTÕES & RESPOSTAS */
          <div className="space-y-4">
            {/* Barra de Filtros da Consulta */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl">
              {/* Filtro de Status */}
              <div className="inline-flex bg-white dark:bg-zinc-800 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium gap-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  Todas ({suggestions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('respondida')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'respondida'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Respondidas ({answeredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pendente')}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'pendente'
                      ? 'bg-amber-600 text-white font-bold shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Aguardando ({pendingCount})
                </button>
              </div>

              {/* Campo de Busca */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Pesquisar mensagens ou respostas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Lista de Sugestões e Respostas */}
            {filteredSuggestions.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs space-y-2">
                <MessageCircle className="h-8 w-8 mx-auto text-zinc-400 opacity-60" />
                <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Nenhuma mensagem encontrada para os filtros selecionados.
                </p>
                <p className="text-zinc-400">
                  Clique na aba "Nova Mensagem" acima para enviar uma sugestão ou dúvida aos supervisores!
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredSuggestions.map((item) => {
                  const catInfo = getCategoryLabel(item.category)
                  const isAnswered = item.status === 'respondida'

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isAnswered
                          ? 'bg-white dark:bg-zinc-900/90 border-emerald-200 dark:border-emerald-800/80 shadow-xs'
                          : 'bg-white dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {/* Topo do Card: Remetente, Data, Categoria e Status */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-indigo-500" />
                            {item.senderName}
                          </span>
                          {item.contact && (
                            <span className="text-[11px] text-zinc-400 font-medium">
                              • Contato: {item.contact}
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
                              Aguardando Supervisor
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Conteúdo da Mensagem do Usuário */}
                      <div className="py-2.5 space-y-1">
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>{item.subject}</span>
                        </h4>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {item.message}
                        </p>
                      </div>

                      {/* Bloco de Resposta do Supervisor do Monitor */}
                      {isAnswered && item.response ? (
                        <div className="mt-3 p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1.5 animate-fadeIn">
                          <div className="flex items-center justify-between gap-2 flex-wrap text-emerald-800 dark:text-emerald-300">
                            <div className="flex items-center gap-1.5 text-xs font-bold">
                              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Resposta da Supervisão (Monitor)</span>
                              <span className="text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                                — por <strong>{item.respondedBy || 'Supervisor'}</strong>
                              </span>
                            </div>
                            {item.responseDateFormatted && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                {item.responseDateFormatted} às {item.responseTimeFormatted}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-emerald-950 dark:text-emerald-100 font-medium whitespace-pre-wrap leading-relaxed pl-5 border-l-2 border-emerald-400 dark:border-emerald-600">
                            {item.response}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-zinc-400 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-amber-500" />
                          <span>Esta mensagem está na fila de atendimento do Monitor. Assim que o supervisor responder, a resposta aparecerá aqui automaticamente.</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
