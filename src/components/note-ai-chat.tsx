import { FormEvent, useMemo, useState } from "react"
import { Bot, Send, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { perguntarSobreNotas, type NoteChatContext } from "@/lib/note-ai-chat"

export function NoteAiChat({ notes }: { notes: NoteChatContext[] }) {
  const [question, setQuestion] = useState("")
  type ChatMessage = { role: "user" | "assistant"; text: string }
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const noteCount = useMemo(() => notes.length, [notes.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || loading || noteCount === 0) return
    const currentQuestion = question.trim()
    setQuestion("")
    setMessages((current) => [...current, { role: "user" as const, text: currentQuestion }].slice(-8))
    setLoading(true)
    try {
      const answer = await perguntarSobreNotas(currentQuestion, notes)
      setMessages((current) => [...current, { role: "assistant" as const, text: answer }].slice(-8))
    } catch {
      setMessages((current) => [...current, { role: "assistant" as const, text: "Não consegui consultar a IA agora. Tente novamente." }].slice(-8))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900 dark:bg-indigo-950/30" aria-label="Chat de conferência das notas">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">Confirme os dados com a IA</h3>
          <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80">Pergunte sobre qualquer nota processada. A resposta é baseada nos documentos carregados.</p>
        </div>
      </div>
      {messages.length > 0 && (
        <div className="mb-3 max-h-52 space-y-2 overflow-y-auto rounded-lg bg-white/70 p-3 dark:bg-slate-950/40" aria-live="polite">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex gap-2 text-xs ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />}
              <p className={`max-w-[85%] rounded-lg px-3 py-2 ${message.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>{message.text}</p>
              {message.role === "user" && <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={noteCount ? "Ex.: qual é o terminal da nota 123?" : "Carregue notas para consultar"} disabled={loading || noteCount === 0} aria-label="Pergunta sobre as notas" />
        <Button type="submit" disabled={loading || !question.trim() || noteCount === 0} className="shrink-0 bg-indigo-600 hover:bg-indigo-700">
          <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {loading ? "Consultando" : "Perguntar"}
        </Button>
      </form>
    </section>
  )
}
