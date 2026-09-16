import { ref, get, set, onValue, type Database } from 'firebase/database'
import { getDatabaseInstance } from './firebase-realtime'

export type WhatsAppProvider = 'callmebot' | 'telegram' | 'webhook'
export type WhatsAppEventType = 'login' | 'conference' | 'rumo' | 'divergence' | 'test'

export interface WhatsAppNotificationConfig {
  enabled: boolean
  provider: WhatsAppProvider

  // CallMeBot (100% Gratuito)
  callmebotPhone: string // Ex: 5513999999999
  callmebotApiKey: string // Chave de API enviada pelo bot do CallMeBot

  // Telegram Bot (Alternativa 100% Estável, Gratuita e Oficial)
  telegramBotToken?: string // Token do Bot (@BotFather)
  telegramChatId?: string // ID do chat ou usuário

  // Webhook Personalizado (n8n, Make, Z-API, Evolution API, Zapier)
  webhookUrl: string
  webhookSecret?: string

  // Gatilhos de envio
  notifyOnLogin: boolean
  notifyOnConference: boolean
  notifyOnRumo: boolean
  notifyOnDivergence: boolean

  // Metadados
  lastUpdated?: number
  updatedBy?: string
}

export interface WhatsAppSendLog {
  id: string
  timestamp: number
  dateFormatted: string
  timeFormatted: string
  type: WhatsAppEventType
  title: string
  text: string
  status: 'SUCCESS' | 'ERROR'
  provider: WhatsAppProvider
  errorMessage?: string
}

const STORAGE_KEY_CONFIG = 'vlic_whatsapp_notification_config'
const STORAGE_KEY_LOGS = 'vlic_whatsapp_send_logs'
const RTDB_PATH_CONFIG = 'vlic_telemetry/whatsapp_config'

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppNotificationConfig = {
  enabled: false,
  provider: 'callmebot',
  callmebotPhone: '',
  callmebotApiKey: '',
  webhookUrl: '',
  webhookSecret: '',
  notifyOnLogin: true,
  notifyOnConference: true,
  notifyOnRumo: true,
  notifyOnDivergence: true,
}

let memoryConfig: WhatsAppNotificationConfig | null = null
const configListeners: Array<(config: WhatsAppNotificationConfig) => void> = []

export function getWhatsAppConfig(): WhatsAppNotificationConfig {
  if (memoryConfig) return memoryConfig

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG)
      if (stored) {
        memoryConfig = { ...DEFAULT_WHATSAPP_CONFIG, ...JSON.parse(stored) }
        return memoryConfig!
      }
    } catch (e) {
      console.warn('Erro ao carregar configuração de WhatsApp local:', e)
    }
  }

  memoryConfig = { ...DEFAULT_WHATSAPP_CONFIG }
  return memoryConfig
}

export async function saveWhatsAppConfig(
  config: WhatsAppNotificationConfig,
  operatorName: string = 'Administrador'
): Promise<void> {
  const updated: WhatsAppNotificationConfig = {
    ...config,
    lastUpdated: Date.now(),
    updatedBy: operatorName,
  }

  memoryConfig = updated

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated))
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e)
    }
  }

  // Notifica ouvintes locais
  configListeners.forEach((fn) => fn(updated))

  // Persiste no Firebase Realtime Database para sincronização entre administradores
  try {
    const db = getDatabaseInstance()
    if (db) {
      const configRef = ref(db, RTDB_PATH_CONFIG)
      await set(configRef, updated)
    }
  } catch (err) {
    console.warn('Aviso: Não foi possível salvar configuração de WhatsApp no Firebase Realtime:', err)
  }
}

export function subscribeToWhatsAppConfig(
  callback: (config: WhatsAppNotificationConfig) => void
): () => void {
  configListeners.push(callback)
  callback(getWhatsAppConfig())

  // Tenta sincronizar com Firebase Realtime Database
  let unsubRtdb: (() => void) | null = null
  try {
    const db = getDatabaseInstance()
    if (db) {
      const configRef = ref(db, RTDB_PATH_CONFIG)
      unsubRtdb = onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
          const rtdbVal = snapshot.val() as WhatsAppNotificationConfig
          if (rtdbVal && typeof rtdbVal === 'object') {
            const merged = { ...DEFAULT_WHATSAPP_CONFIG, ...rtdbVal }
            memoryConfig = merged
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(merged))
            }
            callback(merged)
          }
        }
      })
    }
  } catch (e) {
    console.warn('Erro ao assinar WhatsApp config no RTDB:', e)
  }

  return () => {
    const idx = configListeners.indexOf(callback)
    if (idx !== -1) configListeners.splice(idx, 1)
    if (unsubRtdb) unsubRtdb()
  }
}

export function getWhatsAppSendLogs(): WhatsAppSendLog[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function addWhatsAppSendLog(log: WhatsAppSendLog): void {
  if (typeof window === 'undefined') return
  try {
    const current = getWhatsAppSendLogs()
    const updated = [log, ...current].slice(0, 50)
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updated))
  } catch (e) {
    console.warn('Erro ao salvar log de WhatsApp:', e)
  }
}

export function clearWhatsAppSendLogs(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY_LOGS)
  } catch (e) {
    console.warn('Erro ao limpar logs de WhatsApp:', e)
  }
}

/**
 * Envia uma mensagem via WhatsApp (através do endpoint seguro /api/send-whatsapp com fallback)
 */
export async function sendWhatsAppMessage(
  text: string,
  customConfig?: WhatsAppNotificationConfig,
  eventType: WhatsAppEventType = 'test',
  metadata?: any
): Promise<{ success: boolean; message: string }> {
  const config = customConfig || getWhatsAppConfig()

  if (!config.enabled && eventType !== 'test') {
    return { success: false, message: 'Notificações de WhatsApp estão desativadas nas configurações.' }
  }

  const now = new Date()
  const dateFormatted = now.toLocaleDateString('pt-BR')
  const timeFormatted = now.toLocaleTimeString('pt-BR')

  let success = false
  let responseMsg = ''

  try {
    if (config.provider === 'callmebot') {
      const phone = config.callmebotPhone.replace(/[^0-9+]/g, '')
      const apiKey = config.callmebotApiKey.trim()

      if (!phone || !apiKey) {
        throw new Error('Telefone e ApiKey do CallMeBot são obrigatórios para envio.')
      }

      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'callmebot',
          phone,
          apiKey,
          text,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        success = true
        responseMsg = data.message || 'Mensagem enviada com sucesso no WhatsApp!'
      } else {
        throw new Error(data.error || 'Falha ao enviar mensagem via CallMeBot.')
      }
    } else if (config.provider === 'telegram') {
      if (!config.telegramBotToken || !config.telegramChatId) {
        throw new Error('Token do Bot e Chat ID do Telegram são obrigatórios para envio.')
      }

      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'telegram',
          telegramBotToken: config.telegramBotToken,
          telegramChatId: config.telegramChatId,
          text,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        success = true
        responseMsg = data.message || 'Mensagem enviada com sucesso no Telegram!'
      } else {
        throw new Error(data.error || 'Falha ao enviar mensagem no Telegram.')
      }
    } else if (config.provider === 'webhook') {
      if (!config.webhookUrl || !config.webhookUrl.startsWith('http')) {
        throw new Error('URL de Webhook inválida.')
      }

      const payload = {
        event: eventType,
        text,
        timestamp: now.toISOString(),
        date: dateFormatted,
        time: timeFormatted,
        metadata: metadata || {},
      }

      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'webhook',
          webhookUrl: config.webhookUrl,
          webhookSecret: config.webhookSecret,
          payload,
        }),
      })

      const data = await res.json()
      if (res.ok && (data.success || data.status < 400)) {
        success = true
        responseMsg = 'Webhook disparado com sucesso!'
      } else {
        throw new Error(data.error || 'Falha ao acionar Webhook.')
      }
    }

    addWhatsAppSendLog({
      id: 'wa_' + Date.now(),
      timestamp: Date.now(),
      dateFormatted,
      timeFormatted,
      type: eventType,
      title: getEventTitle(eventType),
      text,
      status: 'SUCCESS',
      provider: config.provider,
    })

    return { success: true, message: responseMsg || 'Mensagem enviada com sucesso!' }
  } catch (err: any) {
    const errorMsg = err.message || 'Erro inesperado ao enviar mensagem no WhatsApp.'
    addWhatsAppSendLog({
      id: 'wa_' + Date.now(),
      timestamp: Date.now(),
      dateFormatted,
      timeFormatted,
      type: eventType,
      title: getEventTitle(eventType),
      text,
      status: 'ERROR',
      provider: config.provider,
      errorMessage: errorMsg,
    })
    return { success: false, message: errorMsg }
  }
}

function getEventTitle(type: WhatsAppEventType): string {
  switch (type) {
    case 'login':
      return 'Login de Operador'
    case 'conference':
      return 'Conferência Realizada'
    case 'rumo':
      return 'Composição Rumo'
    case 'divergence':
      return 'Divergência Detectada'
    case 'test':
    default:
      return 'Mensagem de Teste'
  }
}

/**
 * Dispara evento formatado para o WhatsApp com checagem de regras e de triggers
 */
export async function notifyWhatsAppEvent(event: {
  type: WhatsAppEventType
  title: string
  description: string
  operatorName?: string
  metadata?: Record<string, any>
}): Promise<void> {
  const config = getWhatsAppConfig()
  if (!config.enabled) return

  // Valida regras de gatilho
  if (event.type === 'login' && !config.notifyOnLogin) return
  if (event.type === 'conference' && !config.notifyOnConference) return
  if (event.type === 'rumo' && !config.notifyOnRumo) return
  if (event.type === 'divergence' && !config.notifyOnDivergence) return

  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR')
  const timeStr = now.toLocaleTimeString('pt-BR')
  const op = event.operatorName || 'Sistema / Operador'

  let icon = '🔔'
  if (event.type === 'login') icon = '🔐'
  if (event.type === 'conference') icon = '📋'
  if (event.type === 'rumo') icon = '🚂'
  if (event.type === 'divergence') icon = '⚠️'

  let message = `${icon} *ALERTA OPERACIONAL VLIC*\n`
  message += `━━━━━━━━━━━━━━━━━━━━\n`
  message += `📌 *Evento:* ${event.title}\n`
  message += `👤 *Operador:* ${op}\n`
  message += `🕒 *Horário:* ${dateStr} às ${timeStr}\n`
  message += `📝 *Resumo:* ${event.description}\n`

  if (event.metadata) {
    if (event.metadata.trainName || event.metadata.prefixo) {
      message += `🚂 *Composição:* ${event.metadata.trainName || event.metadata.prefixo}\n`
    }
    if (event.metadata.totalVagoes !== undefined) {
      message += `📦 *Vagões:* ${event.metadata.totalVagoes}\n`
    }
    if (event.metadata.desmembreCount !== undefined) {
      message += `⚡ *Desmembres:* ${event.metadata.desmembreCount}\n`
    }
    if (event.metadata.filesCount !== undefined) {
      message += `📄 *Notas/Chaves:* ${event.metadata.filesCount}\n`
    }
    if (event.metadata.divergentCount !== undefined) {
      message += `⚠️ *Divergências:* ${event.metadata.divergentCount}\n`
    }
    if (event.metadata.totalValorFormatted) {
      message += `💰 *Valor Total:* ${event.metadata.totalValorFormatted}\n`
    }
  }

  message += `━━━━━━━━━━━━━━━━━━━━\n`
  message += `Sistema de Conferência Fiscal & Telemetria`

  // Disparo assíncrono não bloqueante
  sendWhatsAppMessage(message, config, event.type, event.metadata).catch((err) => {
    console.warn('Erro silencioso ao enviar notificação WhatsApp:', err)
  })
}

/**
 * Envia uma mensagem de teste para validar se o telefone e as chaves estão operacionais
 */
export async function testWhatsAppConnection(
  config: WhatsAppNotificationConfig
): Promise<{ success: boolean; message: string }> {
  const now = new Date()
  let channelName = 'CallMeBot WhatsApp'
  if (config.provider === 'telegram') channelName = 'Telegram Bot Oficial'
  else if (config.provider === 'webhook') channelName = 'Webhook Customizado'

  const testMessage =
    `✅ *TESTE DE INTEGRAÇÃO - VLIC*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Seu canal de notificações para o sistema de conferência fiscal foi configurado!\n\n` +
    `🕒 *Data/Hora:* ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}\n` +
    `📡 *Canal:* ${channelName}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Você receberá alertas automáticos sobre logins, conferências e processamento de composições conforme configurado.`

  return await sendWhatsAppMessage(testMessage, config, 'test')
}

/**
 * Consulta em tempo real o status dos servidores do CallMeBot
 */
export async function checkCallMeBotStatus(
  phone: string,
  apiKey: string
): Promise<{
  online: boolean
  keyValid: boolean
  isMaintenance: boolean
  message: string
  raw?: string
  statusCode?: number
}> {
  try {
    const res = await fetch('/api/check-callmebot-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, apiKey }),
    })
    const data = await res.json()
    return data
  } catch (err: any) {
    return {
      online: false,
      keyValid: false,
      isMaintenance: false,
      message: err.message || 'Falha ao consultar status do CallMeBot.',
    }
  }
}

