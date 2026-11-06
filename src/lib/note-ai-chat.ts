export interface NoteChatContext {
  numero?: string
  chave?: string
  terminal?: string
  transbordo?: string
  destinatario?: string
  cnpjDestinatario?: string
  emitente?: string
  produto?: string
  textoDocumento?: string
}

export async function perguntarSobreNotas(question: string, notes: NoteChatContext[]): Promise<string> {
  const response = await fetch('/api/gemini/note-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, notes }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(error.error || 'Não foi possível consultar a IA.')
  }
  const data = await response.json() as { answer?: string }
  return data.answer || 'A IA não encontrou uma resposta objetiva nos documentos enviados.'
}
