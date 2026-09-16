import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import {
  getDatabase,
  ref,
  set,
  update,
  push,
  onValue,
  off,
  serverTimestamp,
  onDisconnect,
  query,
  limitToLast,
  runTransaction,
  type Database,
} from 'firebase/database'

export interface FirebaseRealtimeConfig {
  databaseURL: string
  apiKey?: string
  projectId?: string
  authDomain?: string
}

export interface RealtimeActivity {
  id: string
  sessionId: string
  operatorName: string
  type:
    | 'session_start'
    | 'upload_nfe'
    | 'convert_pdf'
    | 'upload_excel'
    | 'upload_mdfe'
    | 'reconcile_mdf'
    | 'export_excel'
    | 'export_zip'
    | 'divergence_found'
    | 'view_tab'
    | 'test_ping'
  title: string
  description: string
  timestamp: number
  dateFormatted?: string
  timeFormatted?: string
  metadata?: Record<string, any>
}

export interface InputedFileRecord {
  id: string
  fileName: string
  fileType: 'XML_NFE' | 'PDF_DANFE' | 'EXCEL_PLANILHA' | 'XML_MDFE' | 'ZIP_LOTE'
  fileSize?: number
  itemsCount: number
  totalValor?: number
  divergencesCount?: number
  operatorName: string
  sessionId: string
  timestamp: number
  dateFormatted: string
  timeFormatted: string
  status: 'CONFERIDO' | 'COM_DIVERGENCIA' | 'PROCESSADO'
}

export interface OperatorPresence {
  sessionId: string
  operatorName: string
  online: boolean
  lastSeen: number
  currentModule: string
  deviceInfo: string
  joinedAt: number
}

export interface RealtimeMetrics {
  totalActions: number
  totalNotesProcessed: number
  totalDivergencesDetected: number
  lastUpdated: number
}

const STORAGE_KEY_CONFIG = 'vlic_firebase_rtdb_config'
const STORAGE_KEY_OPERATOR = 'vlic_operator_name'
const STORAGE_KEY_SESSION = 'vlic_session_id'
const STORAGE_KEY_ACTIVITIES = 'vlic_local_activities_history'
const STORAGE_KEY_INPUT_FILES = 'vlic_local_input_files_history'

export function formatDateBR(ts: number): string {
  const d = new Date(ts)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function formatTimeBR(ts: number): string {
  const d = new Date(ts)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

// Cria ou resgata ID de sessão persistente por aba
export function getSessionId(): string {
  let id = sessionStorage.getItem(STORAGE_KEY_SESSION)
  if (!id) {
    id = 'sess_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
    sessionStorage.setItem(STORAGE_KEY_SESSION, id)
  }
  return id
}

// Operador padrão ou salvo pelo usuário
export function getOperatorName(): string {
  const saved = localStorage.getItem(STORAGE_KEY_OPERATOR)
  if (saved && saved.trim()) return saved.trim()
  const defaultName = 'Operador-' + getSessionId().slice(-4).toUpperCase()
  return defaultName
}

export function setOperatorName(name: string): void {
  localStorage.setItem(STORAGE_KEY_OPERATOR, name.trim())
  // Atualiza presença imediatamente se conectado
  if (dbInstance) {
    updatePresence(undefined, name.trim())
  }
}

// Resgata configurações salvas ou de variáveis de ambiente
export function getFirebaseConfig(): FirebaseRealtimeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.databaseURL) return parsed
    }
  } catch (e) {
    console.warn('Erro ao ler config do Firebase do localStorage:', e)
  }

  // Fallback para variáveis de ambiente VITE_
  const envDbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL
  if (envDbUrl) {
    return {
      databaseURL: envDbUrl,
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoDummyKeyForPublicAccess',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vlic-telemetry',
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
    }
  }

  // Fallback para variáveis de ambiente em Next.js
  const nextEnvDbUrl = import.meta.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
  if (nextEnvDbUrl) {
    return {
      databaseURL: nextEnvDbUrl,
      apiKey: import.meta.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      projectId: import.meta.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      authDomain: import.meta.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    }
  }

  return null
}

export function saveFirebaseConfig(config: FirebaseRealtimeConfig): void {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config))
  // Reinicializa conexão
  resetFirebase()
}

export function clearFirebaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY_CONFIG)
  resetFirebase()
}

let appInstance: FirebaseApp | null = null
let dbInstance: Database | null = null
let presenceRefInstance: any = null
let isConnectedToRealtime = false
let connectionListeners: ((connected: boolean) => void)[] = []

// Carrega histórico local salvo (apenas registros reais)
function loadSavedLocalActivities(): RealtimeActivity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVITIES)
    if (raw) {
      const parsed: RealtimeActivity[] = JSON.parse(raw)
      // Filtra estritamente quaisquer registros fictícios com prefixo 'demo_'
      const real = parsed.filter((a) => a && !a.id.startsWith('demo_') && !a.id.includes('sample'))
      if (real.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(real))
      }
      return real
    }
  } catch (e) {
    console.warn('Erro ao ler atividades salvas:', e)
  }
  return []
}

function loadSavedLocalInputFiles(): InputedFileRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INPUT_FILES)
    if (raw) {
      const parsed: InputedFileRecord[] = JSON.parse(raw)
      // Filtra estritamente quaisquer registros fictícios com prefixo 'demo_'
      const real = parsed.filter((f) => f && !f.id.startsWith('demo_') && !f.id.includes('sample'))
      if (real.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY_INPUT_FILES, JSON.stringify(real))
      }
      return real
    }
  } catch (e) {
    console.warn('Erro ao ler arquivos inputados salvos:', e)
  }
  return []
}

// Armazenamento local em memória para fallback/demonstração quando offline ou sem config
const localActivities: RealtimeActivity[] = loadSavedLocalActivities()
const localInputFiles: InputedFileRecord[] = loadSavedLocalInputFiles()
const localPresences: Record<string, OperatorPresence> = {}
let localSubscribersActivities: ((acts: RealtimeActivity[]) => void)[] = []
let localSubscribersInputFiles: ((files: InputedFileRecord[]) => void)[] = []
let localSubscribersPresence: ((pres: OperatorPresence[]) => void)[] = []

function persistLocalActivities() {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(localActivities.slice(0, 500)))
  } catch (e) {
    console.warn('Erro ao persistir localActivities:', e)
  }
}

function persistLocalInputFiles() {
  try {
    localStorage.setItem(STORAGE_KEY_INPUT_FILES, JSON.stringify(localInputFiles.slice(0, 500)))
  } catch (e) {
    console.warn('Erro ao persistir localInputFiles:', e)
  }
}

function notifyConnectionStatus(status: boolean) {
  isConnectedToRealtime = status
  connectionListeners.forEach((cb) => cb(status))
}

export function onConnectionStatusChange(callback: (connected: boolean) => void): () => void {
  connectionListeners.push(callback)
  callback(isConnectedToRealtime)
  return () => {
    connectionListeners = connectionListeners.filter((cb) => cb !== callback)
  }
}

export function getDatabaseInstance(): Database | null {
  if (dbInstance) return dbInstance

  const config = getFirebaseConfig()
  if (!config || !config.databaseURL) {
    return null
  }

  try {
    const existingApps = getApps()
    appInstance = existingApps.length > 0 ? getApp() : initializeApp({
      databaseURL: config.databaseURL,
      apiKey: config.apiKey || 'AIzaSyDefaultPlaceholder',
      projectId: config.projectId || 'vlic-default',
      authDomain: config.authDomain,
    })

    dbInstance = getDatabase(appInstance)

    // Monitora status de conexão nativa do Firebase .info/connected
    const connectedRef = ref(dbInstance, '.info/connected')
    onValue(connectedRef, (snap) => {
      const isOnline = snap.val() === true
      notifyConnectionStatus(isOnline)
      if (isOnline) {
        initPresence()
      }
    })

    return dbInstance
  } catch (error) {
    console.error('Falha ao inicializar Firebase Realtime Database:', error)
    notifyConnectionStatus(false)
    return null
  }
}

export function resetFirebase() {
  dbInstance = null
  appInstance = null
  presenceRefInstance = null
  notifyConnectionStatus(false)
  getDatabaseInstance()
}

// Inicia batimento cardíaco / presença do operador
export function initPresence(moduleName: string = 'Painel de Conferência'): void {
  const db = getDatabaseInstance()
  const sessionId = getSessionId()
  const operatorName = getOperatorName()
  const deviceInfo = typeof navigator !== 'undefined'
    ? `${navigator.platform || 'Web'} - ${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'}`
    : 'Web Client'

  const currentPresence: OperatorPresence = {
    sessionId,
    operatorName,
    online: true,
    lastSeen: Date.now(),
    currentModule: moduleName,
    deviceInfo,
    joinedAt: Date.now(),
  }

  if (db) {
    try {
      const myPresenceRef = ref(db, `vlic_telemetry/presence/${sessionId}`)
      presenceRefInstance = myPresenceRef

      set(myPresenceRef, {
        ...currentPresence,
        lastSeen: serverTimestamp(),
        joinedAt: serverTimestamp(),
      })

      // Ao desconectar, marca como offline ou remove
      onDisconnect(myPresenceRef).set({
        ...currentPresence,
        online: false,
        lastSeen: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Erro ao configurar presença no Firebase:', err)
    }
  } else {
    // Modo local
    localPresences[sessionId] = currentPresence
    localSubscribersPresence.forEach((cb) => cb(Object.values(localPresences)))
  }
}

// Atualiza o módulo ou nome do operador ativo
export function updatePresence(moduleName?: string, newOperatorName?: string): void {
  const db = getDatabaseInstance()
  const sessionId = getSessionId()
  const operatorName = newOperatorName || getOperatorName()

  if (db) {
    try {
      const myPresenceRef = ref(db, `vlic_telemetry/presence/${sessionId}`)
      const updates: any = {
        operatorName,
        online: true,
        lastSeen: serverTimestamp(),
      }
      if (moduleName) {
        updates.currentModule = moduleName
      }
      set(myPresenceRef, updates)
    } catch (err) {
      console.warn('Erro ao atualizar presença no Firebase:', err)
    }
  } else {
    if (localPresences[sessionId]) {
      if (moduleName) localPresences[sessionId].currentModule = moduleName
      localPresences[sessionId].operatorName = operatorName
      localPresences[sessionId].lastSeen = Date.now()
      localPresences[sessionId].online = true
      localSubscribersPresence.forEach((cb) => cb(Object.values(localPresences)))
    }
  }
}

// Registra uma atividade em tempo real
export async function logRealtimeActivity(
  type: RealtimeActivity['type'],
  title: string,
  description: string,
  metadata?: Record<string, any>
): Promise<void> {
  const sessionId = getSessionId()
  const operatorName = getOperatorName()
  const now = Date.now()

  const activity: RealtimeActivity = {
    id: 'act_' + now + '_' + Math.random().toString(36).substring(2, 6),
    sessionId,
    operatorName,
    type,
    title,
    description,
    timestamp: now,
    dateFormatted: formatDateBR(now),
    timeFormatted: formatTimeBR(now),
    metadata,
  }

  const db = getDatabaseInstance()
  if (db) {
    try {
      const activitiesRef = ref(db, 'vlic_telemetry/activities')
      const newActRef = push(activitiesRef)
      await set(newActRef, {
        ...activity,
        id: newActRef.key || activity.id,
        timestamp: serverTimestamp(),
      })

      // Atualiza contadores globais em vlic_telemetry/metrics
      if (metadata?.filesCount) {
        const metricsRef = ref(db, `vlic_telemetry/metrics/totalNotesProcessed`)
        // Envia incremento assíncrono simples
        runTransaction(metricsRef, (currentVal) => (currentVal || 0) + (metadata.filesCount || 0)).catch(() => {})
      }
      if (type === 'divergence_found') {
        const divRef = ref(db, `vlic_telemetry/metrics/totalDivergencesDetected`)
        runTransaction(divRef, (currentVal) => (currentVal || 0) + (metadata?.divergentCount || 1)).catch(() => {})
      }
      // Salva localmente também para visualização offline / rápida
      pushLocalActivity(activity)
    } catch (err) {
      console.warn('Erro ao registrar log no Firebase Realtime:', err)
      // Grava localmente como contingência
      pushLocalActivity(activity)
    }
  } else {
    pushLocalActivity(activity)
  }

  // Notificação assíncrona para WhatsApp (CallMeBot / Webhook)
  try {
    let waType: 'login' | 'conference' | 'divergence' | null = null
    if (type === 'session_start') {
      waType = 'login'
    } else if (type === 'reconcile_mdf' || type === 'export_excel' || type === 'export_zip') {
      waType = 'conference'
    } else if (type === 'divergence_found') {
      waType = 'divergence'
    }

    if (waType) {
      import('./whatsapp-notifications')
        .then(({ notifyWhatsAppEvent }) => {
          notifyWhatsAppEvent({
            type: waType!,
            title,
            description,
            operatorName,
            metadata,
          }).catch(() => {})
        })
        .catch(() => {})
    }
  } catch {
    // Ignora silenciosamente para não interromper fluxo principal
  }
}

function pushLocalActivity(activity: RealtimeActivity) {
  if (!activity.dateFormatted) activity.dateFormatted = formatDateBR(activity.timestamp)
  if (!activity.timeFormatted) activity.timeFormatted = formatTimeBR(activity.timestamp)
  localActivities.unshift(activity)
  if (localActivities.length > 500) localActivities.pop()
  persistLocalActivities()
  localSubscribersActivities.forEach((cb) => cb([...localActivities]))
}

// Registra arquivos inputados no sistema (XMLs, PDFs, Excel, etc.)
export async function logInputedFiles(
  files: Omit<InputedFileRecord, 'id' | 'timestamp' | 'dateFormatted' | 'timeFormatted' | 'sessionId' | 'operatorName'>[]
): Promise<void> {
  if (!files || files.length === 0) return
  const sessionId = getSessionId()
  const operatorName = getOperatorName()
  const now = Date.now()
  const dateFormatted = formatDateBR(now)
  const timeFormatted = formatTimeBR(now)

  const records: InputedFileRecord[] = files.map((f, i) => ({
    ...f,
    id: 'file_' + (now + i) + '_' + Math.random().toString(36).substring(2, 6),
    sessionId,
    operatorName,
    timestamp: now + i,
    dateFormatted,
    timeFormatted,
  }))

  // Atualiza local primeiro
  records.forEach((rec) => {
    localInputFiles.unshift(rec)
  })
  if (localInputFiles.length > 2000) {
    localInputFiles.length = 2000
  }
  persistLocalInputFiles()
  localSubscribersInputFiles.forEach((cb) => cb([...localInputFiles]))

  // Envia para o Firebase em lote atômico se conectado
  const db = getDatabaseInstance()
  if (db) {
    try {
      const filesRef = ref(db, 'vlic_telemetry/input_files')
      const updates: Record<string, any> = {}

      for (const rec of records) {
        const newRef = push(filesRef)
        const key = newRef.key || rec.id
        updates[`vlic_telemetry/input_files/${key}`] = {
          ...rec,
          id: key,
          timestamp: serverTimestamp(),
        }
      }

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates)
      }

      // Atualiza contador consolidado de notas em metrics de forma atômica
      try {
        const totalItemsInBatch = records.reduce((acc, r) => acc + (r.itemsCount || 1), 0)
        const metricsRef = ref(db, 'vlic_telemetry/metrics/totalNotesProcessed')
        runTransaction(metricsRef, (curr) => (curr || 0) + totalItemsInBatch).catch(() => {})
      } catch (e) {
        // non-blocking
      }
    } catch (err) {
      console.warn('Erro ao registrar arquivos inputados no Firebase:', err)
    }
  }
}

// Assinatura de lista de arquivos inputados (por padrão ilimitado ou com limite configurável)
export function subscribeToInputedFiles(
  callback: (files: InputedFileRecord[]) => void,
  limitCount: number = 0
): () => void {
  const db = getDatabaseInstance()
  if (db) {
    try {
      const filesRef =
        limitCount && limitCount > 0
          ? query(ref(db, 'vlic_telemetry/input_files'), limitToLast(limitCount))
          : ref(db, 'vlic_telemetry/input_files')

      const unsubscribe = onValue(
        filesRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([...localInputFiles])
            return
          }
          const data = snapshot.val()
          const list: InputedFileRecord[] = []
          Object.keys(data).forEach((key) => {
            const item = data[key]
            const ts = typeof item.timestamp === 'number' ? item.timestamp : Date.now()
            list.push({
              ...item,
              id: key,
              timestamp: ts,
              dateFormatted: item.dateFormatted || formatDateBR(ts),
              timeFormatted: item.timeFormatted || formatTimeBR(ts),
            })
          })
          list.sort((a, b) => b.timestamp - a.timestamp)
          callback(list)
        },
        (error) => {
          console.error('Erro na escuta de arquivos inputados do Firebase:', error)
          callback([...localInputFiles])
        }
      )
      return () => {
        off(filesRef)
      }
    } catch (e) {
      console.warn('Falha ao subscrever arquivos no Firebase:', e)
    }
  }

  localSubscribersInputFiles.push(callback)
  callback([...localInputFiles])
  return () => {
    localSubscribersInputFiles = localSubscribersInputFiles.filter((cb) => cb !== callback)
  }
}

// Assinatura de lista de atividades em tempo real (por padrão sem limite ou com limite configurável)
export function subscribeToActivities(
  callback: (activities: RealtimeActivity[]) => void,
  limitCount: number = 0
): () => void {
  const db = getDatabaseInstance()
  if (db) {
    try {
      const activitiesRef =
        limitCount && limitCount > 0
          ? query(ref(db, 'vlic_telemetry/activities'), limitToLast(limitCount))
          : ref(db, 'vlic_telemetry/activities')

      const unsubscribe = onValue(
        activitiesRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([])
            return
          }
          const data = snapshot.val()
          const list: RealtimeActivity[] = []
          Object.keys(data).forEach((key) => {
            const item = data[key]
            list.push({
              ...item,
              id: key,
              timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
            })
          })
          // Ordena do mais recente para o mais antigo
          list.sort((a, b) => b.timestamp - a.timestamp)
          callback(list)
        },
        (error) => {
          console.error('Erro na escuta de atividades do Firebase:', error)
          callback(localActivities)
        }
      )

      return () => {
        off(activitiesRef)
      }
    } catch (e) {
      console.warn('Falha ao subscrever Firebase, usando fallback local:', e)
    }
  }

  // Fallback local
  localSubscribersActivities.push(callback)
  callback([...localActivities])
  return () => {
    localSubscribersActivities = localSubscribersActivities.filter((cb) => cb !== callback)
  }
}

// Assinatura de lista de operadores online em tempo real
export function subscribeToPresence(
  callback: (operators: OperatorPresence[]) => void
): () => void {
  const db = getDatabaseInstance()
  if (db) {
    try {
      const presenceRef = ref(db, 'vlic_telemetry/presence')
      const unsubscribe = onValue(
        presenceRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            callback([])
            return
          }
          const data = snapshot.val()
          const now = Date.now()
          const list: OperatorPresence[] = []

          Object.keys(data).forEach((key) => {
            const item = data[key]
            const lastSeenTime = typeof item.lastSeen === 'number' ? item.lastSeen : now
            // Considera online se a flag for true e tiver sido visto nos últimos 3 minutos
            const isActuallyOnline = item.online === true && (now - lastSeenTime) < 180000
            list.push({
              ...item,
              online: isActuallyOnline,
              lastSeen: lastSeenTime,
            })
          })

          // Ordena: online primeiro, depois mais recente
          list.sort((a, b) => {
            if (a.online === b.online) return b.lastSeen - a.lastSeen
            return a.online ? -1 : 1
          })

          callback(list)
        },
        (error) => {
          console.error('Erro ao escutar presenças no Firebase:', error)
          callback(Object.values(localPresences))
        }
      )

      return () => {
        off(presenceRef)
      }
    } catch (e) {
      console.warn('Falha ao subscrever presença no Firebase, usando fallback:', e)
    }
  }

  // Fallback local
  localSubscribersPresence.push(callback)
  callback(Object.values(localPresences))
  return () => {
    localSubscribersPresence = localSubscribersPresence.filter((cb) => cb !== callback)
  }
}

// Testa a conexão direta com o Realtime Database informando sucesso ou mensagem de erro clara
export async function testFirebaseConnection(config: FirebaseRealtimeConfig): Promise<{
  success: boolean
  message: string
}> {
  try {
    let cleanUrl = config.databaseURL.trim()
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl
    }
    // Remove barra no final
    cleanUrl = cleanUrl.replace(/\/+$/, '')

    // Testa via REST ping direto com timeout rápido para testar conectividade e regras
    const testEndpoint = `${cleanUrl}/vlic_telemetry/connection_test.json${config.apiKey ? `?auth=${config.apiKey}` : ''}`
    
    const response = await fetch(testEndpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testedAt: new Date().toISOString(),
        tester: getOperatorName(),
        status: 'ok',
      }),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message:
            'Acesso Negado (Permissão). Seu Realtime Database rejeitou a gravação. Verifique na aba "Rules" (Regras) do Firebase Console se as regras de leitura e escrita estão liberadas (ex: { "rules": { ".read": true, ".write": true } }).',
        }
      }
      return {
        success: false,
        message: `Falha na requisição ao Firebase Realtime (HTTP ${response.status}): ${response.statusText}`,
      }
    }

    return {
      success: true,
      message: 'Conexão estabelecida com sucesso! O Realtime Database está pronto para gravar e monitorar.',
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Não foi possível alcançar o servidor do Firebase. Verifique a URL informada.',
    }
  }
}

// Limpa histórico de telemetria local e purga quaisquer dados demo anteriores
export function clearAllTelemetryHistory(): void {
  localActivities.length = 0
  localInputFiles.length = 0
  try {
    localStorage.removeItem(STORAGE_KEY_ACTIVITIES)
    localStorage.removeItem(STORAGE_KEY_INPUT_FILES)
  } catch (e) {
    console.warn('Erro ao limpar storage:', e)
  }
  localSubscribersActivities.forEach((cb) => cb([]))
  localSubscribersInputFiles.forEach((cb) => cb([]))
}

// Operação estritamente baseada em dados reais (sem dados fictícios)
export function seedDemoTelemetryData(): void {
  // Mantido para compatibilidade. O sistema opera exclusivamente com dados reais gerados durante as operações.
}
