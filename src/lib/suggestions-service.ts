import {
  getDatabaseInstance,
  getOperatorName,
  getSessionId,
  formatDateBR,
  formatTimeBR,
  logRealtimeActivity,
} from '@/lib/firebase-realtime'
import { ref, set, push, onValue, update, remove } from 'firebase/database'

export type SuggestionCategory =
  | 'sugestao'
  | 'duvida'
  | 'divergencia'
  | 'solicitacao'
  | 'outro'

export interface SuggestionMessage {
  id: string
  senderName: string
  contact?: string
  category: SuggestionCategory
  subject: string
  message: string
  status: 'pendente' | 'respondida'
  timestamp: number
  dateFormatted: string
  timeFormatted: string
  sessionId: string

  // Resposta da Supervisão / Monitor
  response?: string
  respondedBy?: string
  respondedAt?: number
  responseDateFormatted?: string
  responseTimeFormatted?: string
}

const STORAGE_KEY_SUGGESTIONS = 'vlic_local_suggestions_history'

// Carrega sugestões salvas no localStorage
function loadLocalSuggestions(): SuggestionMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUGGESTIONS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar sugestões locais:', e)
  }
  return []
}

let localSuggestions: SuggestionMessage[] = loadLocalSuggestions()
const localSubscribers: ((suggestions: SuggestionMessage[]) => void)[] = []

function persistLocalSuggestions() {
  try {
    localStorage.setItem(
      STORAGE_KEY_SUGGESTIONS,
      JSON.stringify(localSuggestions.slice(0, 300))
    )
  } catch (e) {
    console.warn('Erro ao persistir sugestões locais:', e)
  }
}

function notifySubscribers() {
  const sorted = [...localSuggestions].sort((a, b) => b.timestamp - a.timestamp)
  localSubscribers.forEach((cb) => cb(sorted))
}

/**
 * Envia uma nova sugestão/dúvida/mensagem a partir do Painel de Conferência
 */
export async function sendSuggestion(data: {
  senderName: string
  contact?: string
  category?: SuggestionCategory
  subject: string
  message: string
}): Promise<SuggestionMessage> {
  const now = Date.now()
  const db = getDatabaseInstance()
  const sessionId = getSessionId()

  const newSuggestion: SuggestionMessage = {
    id: 'sug_' + Math.random().toString(36).substring(2, 9) + '_' + now.toString(36),
    senderName: data.senderName.trim() || getOperatorName(),
    contact: data.contact?.trim() || '',
    category: data.category || 'sugestao',
    subject: data.subject.trim() || 'Sugestão Operacional',
    message: data.message.trim(),
    status: 'pendente',
    timestamp: now,
    dateFormatted: formatDateBR(now),
    timeFormatted: formatTimeBR(now),
    sessionId,
  }

  // 1. Atualiza memória local
  localSuggestions.unshift(newSuggestion)
  persistLocalSuggestions()
  notifySubscribers()

  // 2. Persiste no Firebase Realtime se disponível
  if (db) {
    try {
      const suggestionRef = ref(db, `vlic_telemetry/suggestions/${newSuggestion.id}`)
      await set(suggestionRef, newSuggestion)
    } catch (err) {
      console.warn('Falha ao salvar sugestão no Firebase Realtime:', err)
    }
  }

  // 3. Registra atividade na telemetria
  logRealtimeActivity(
    'upload_nfe', // Tipo genérico de atividade
    `Nova Sugestão: ${newSuggestion.subject}`,
    `O usuário ${newSuggestion.senderName} enviou uma sugestão/mensagem via Painel de Conferência.`,
    { suggestionId: newSuggestion.id, category: newSuggestion.category, sender: newSuggestion.senderName }
  )

  return newSuggestion
}

/**
 * Responde a uma sugestão existente a partir do Monitor Realtime
 */
export async function replyToSuggestion(
  suggestionId: string,
  responseText: string,
  supervisorName: string
): Promise<void> {
  const now = Date.now()
  const db = getDatabaseInstance()

  const replyData = {
    response: responseText.trim(),
    respondedBy: supervisorName.trim() || 'Supervisor',
    respondedAt: now,
    responseDateFormatted: formatDateBR(now),
    responseTimeFormatted: formatTimeBR(now),
    status: 'respondida' as const,
  }

  // 1. Atualiza localmente
  const index = localSuggestions.findIndex((s) => s.id === suggestionId)
  if (index !== -1) {
    localSuggestions[index] = {
      ...localSuggestions[index],
      ...replyData,
    }
    persistLocalSuggestions()
    notifySubscribers()
  }

  // 2. Atualiza no Firebase Realtime Database
  if (db) {
    try {
      const suggestionRef = ref(db, `vlic_telemetry/suggestions/${suggestionId}`)
      await update(suggestionRef, replyData)
    } catch (err) {
      console.warn('Erro ao atualizar resposta de sugestão no Firebase:', err)
    }
  }

  // 3. Registra na telemetria
  logRealtimeActivity(
    'test_ping',
    `Resposta à Sugestão (${suggestionId})`,
    `O supervisor ${supervisorName} respondeu à sugestão/mensagem no Monitor em tempo real.`,
    { suggestionId, supervisor: supervisorName }
  )
}

/**
 * Exclui uma sugestão (manutenção do supervisor)
 */
export async function deleteSuggestion(suggestionId: string): Promise<void> {
  const db = getDatabaseInstance()

  localSuggestions = localSuggestions.filter((s) => s.id !== suggestionId)
  persistLocalSuggestions()
  notifySubscribers()

  if (db) {
    try {
      const suggestionRef = ref(db, `vlic_telemetry/suggestions/${suggestionId}`)
      await remove(suggestionRef)
    } catch (err) {
      console.warn('Erro ao excluir sugestão no Firebase:', err)
    }
  }
}

/**
 * Assina a lista de sugestões em tempo real (Firebase com fallback local)
 */
export function subscribeToSuggestions(
  callback: (suggestions: SuggestionMessage[]) => void
): () => void {
  localSubscribers.push(callback)

  // Envia estado inicial local ordenado por mais recente
  const sorted = [...localSuggestions].sort((a, b) => b.timestamp - a.timestamp)
  callback(sorted)

  const db = getDatabaseInstance()
  let firebaseUnsub: (() => void) | null = null

  if (db) {
    try {
      const suggestionsRef = ref(db, 'vlic_telemetry/suggestions')
      const listener = onValue(
        suggestionsRef,
        (snapshot) => {
          const val = snapshot.val()
          if (val && typeof val === 'object') {
            const list: SuggestionMessage[] = Object.values(val)
            const cleanList = list.filter((s) => s && s.id)
            cleanList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))

            // Sincroniza memória local
            localSuggestions = cleanList
            persistLocalSuggestions()
            callback(cleanList)
          } else if (!val) {
            callback([])
          }
        },
        (err) => {
          console.warn('Erro ao escutar sugestões no Firebase:', err)
          callback([...localSuggestions].sort((a, b) => b.timestamp - a.timestamp))
        }
      )

      firebaseUnsub = () => {
        listener()
      }
    } catch (err) {
      console.warn('Falha ao conectar listener de sugestões:', err)
    }
  }

  return () => {
    const idx = localSubscribers.indexOf(callback)
    if (idx !== -1) {
      localSubscribers.splice(idx, 1)
    }
    if (firebaseUnsub) {
      firebaseUnsub()
    }
  }
}
