'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Send,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Webhook,
  Bell,
  LogIn,
  FileSpreadsheet,
  TrainTrack,
  RefreshCw,
  Clock,
  Trash2,
  Copy,
  Check,
  Info,
} from 'lucide-react'
import {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  subscribeToWhatsAppConfig,
  testWhatsAppConnection,
  checkCallMeBotStatus,
  getWhatsAppSendLogs,
  clearWhatsAppSendLogs,
  type WhatsAppNotificationConfig,
  type WhatsAppSendLog,
} from '@/lib/whatsapp-notifications'
import { getOperatorName } from '@/lib/firebase-realtime'

interface WhatsAppNotificationSettingsProps {
  onNotify?: (message: string, type?: 'success' | 'warning' | 'error') => void
}

export function WhatsAppNotificationSettings({ onNotify }: WhatsAppNotificationSettingsProps) {
  const [config, setConfig] = useState<WhatsAppNotificationConfig>(getWhatsAppConfig())
  const [logs, setLogs] = useState<WhatsAppSendLog[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copiedPayload, setCopiedPayload] = useState(false)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [diagnosticResult, setDiagnosticResult] = useState<{
    online: boolean
    keyValid: boolean
    isMaintenance: boolean
    message: string
    raw?: string
    statusCode?: number
  } | null>(null)

  const handleDiagnoseCallMeBot = async () => {
    if (!config.callmebotPhone || !config.callmebotApiKey) {
      if (onNotify) onNotify('Preencha o telefone e a ApiKey do CallMeBot para realizar o diagnóstico.', 'warning')
      return
    }
    setIsDiagnosing(true)
    try {
      const res = await checkCallMeBotStatus(config.callmebotPhone, config.callmebotApiKey)
      setDiagnosticResult(res)
      if (res.isMaintenance) {
        if (onNotify) onNotify('Aviso: Servidor do CallMeBot em manutenção técnica (Erro 410).', 'warning')
      } else if (res.online) {
        if (onNotify) onNotify('Servidor do CallMeBot operacional!', 'success')
      } else {
        if (onNotify) onNotify(res.message, 'error')
      }
    } catch (err: any) {
      setDiagnosticResult({
        online: false,
        keyValid: false,
        isMaintenance: false,
        message: err.message || 'Erro ao checar status do CallMeBot.',
      })
    } finally {
      setIsDiagnosing(false)
    }
  }

  useEffect(() => {
    const unsub = subscribeToWhatsAppConfig((newConfig) => {
      setConfig(newConfig)
    })
    setLogs(getWhatsAppSendLogs())
    return () => unsub()
  }, [])

  const handleSave = async (updatedConfig: WhatsAppNotificationConfig) => {
    setIsSaving(true)
    try {
      await saveWhatsAppConfig(updatedConfig, getOperatorName())
      setConfig(updatedConfig)
      if (onNotify) {
        onNotify('Configurações de WhatsApp salvas com sucesso!', 'success')
      }
    } catch (err: any) {
      if (onNotify) {
        onNotify('Erro ao salvar configurações de WhatsApp: ' + err.message, 'error')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEnabled = () => {
    const updated = { ...config, enabled: !config.enabled }
    handleSave(updated)
  }

  const handleTestNotification = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testWhatsAppConnection(config)
      setTestResult(result)
      setLogs(getWhatsAppSendLogs())
      if (result.success) {
        if (onNotify) {
          onNotify('Mensagem de teste enviada com sucesso no seu WhatsApp!', 'success')
        }
      } else {
        if (onNotify) {
          onNotify('Falha no teste: ' + result.message, 'error')
        }
      }
    } catch (err: any) {
      const fail = { success: false, message: err.message || 'Erro ao conectar ao serviço de WhatsApp.' }
      setTestResult(fail)
      if (onNotify) {
        onNotify('Erro ao enviar teste: ' + fail.message, 'error')
      }
    } finally {
      setIsTesting(false)
    }
  }

  const handleClearLogs = () => {
    if (window.confirm('Deseja limpar o histórico recente de disparos do WhatsApp?')) {
      clearWhatsAppSendLogs()
      setLogs([])
      if (onNotify) {
        onNotify('Histórico de disparos limpo com sucesso.', 'success')
      }
    }
  }

  const samplePayload = JSON.stringify(
    {
      event: 'conference',
      title: 'Conferência de Notas Fiscais Finalizada',
      operator: 'Thiago',
      timestamp: new Date().toISOString(),
      text: '📋 ALERTA OPERACIONAL VLIC...',
      metadata: {
        totalNotes: 45,
        divergencesCount: 0,
      },
    },
    null,
    2
  )

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(samplePayload)
    setCopiedPayload(true)
    setTimeout(() => setCopiedPayload(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* BANNER PRINCIPAL COM STATUS E ATIVADOR GERAL */}
      <Card
        className={`border transition-all duration-300 ${
          config.enabled
            ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-500/30'
            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
        }`}
      >
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-2xl flex items-center justify-center shrink-0 ${
                  config.enabled
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                }`}
              >
                <MessageSquare className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-lg font-extrabold text-foreground">
                    Notificações Automáticas no WhatsApp
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${
                      config.enabled
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                      }`}
                    />
                    {config.enabled ? 'Notificações Ativas' : 'Desativado'}
                  </span>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl leading-relaxed">
                  Receba alertas instantâneos no seu celular sempre que um funcionário realizar
                  login, finalizar conferências de notas/MDF-e ou processar composições da Rumo.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleToggleEnabled}
                className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  config.enabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                }`}
                role="switch"
                aria-checked={config.enabled}
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    config.enabled ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-sm font-bold text-foreground">
                {config.enabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUNA ESQUERDA: CANAL & CONFIGURAÇÕES (8 COLUNAS) */}
        <div className="lg:col-span-8 space-y-6">
          {/* SELEÇÃO DO PROVEDOR / MÉTODO */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-indigo-500" />
                    Canal de Envio do WhatsApp
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Escolha como a aplicação enviará as mensagens para o seu WhatsApp.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Opções de Provedores */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Opção 1: CallMeBot */}
                <div
                  onClick={() => setConfig({ ...config, provider: 'callmebot' })}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    config.provider === 'callmebot'
                      ? 'border-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-emerald-600 text-white">
                        <MessageSquare className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-extrabold text-foreground">
                        CallMeBot WhatsApp
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-bold">
                      100% Gratuito
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold">
                      Status: Manutenção 410
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Envia diretamente para seu número de WhatsApp sem necessidade de servidor próprio.
                  </p>
                </div>

                {/* Opção 2: Telegram Bot */}
                <div
                  onClick={() => setConfig({ ...config, provider: 'telegram' })}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    config.provider === 'telegram'
                      ? 'border-sky-600 bg-sky-50/30 dark:bg-sky-950/20 shadow-xs'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-sky-500 text-white">
                        <Send className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-extrabold text-foreground">
                        Telegram Bot
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 font-bold">
                      100% Gratuito & Ultra Estável
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Receba no Telegram imediatamente. Não sofre com manutenções nem bloqueios da Meta.
                  </p>
                </div>

                {/* Opção 3: Webhook */}
                <div
                  onClick={() => setConfig({ ...config, provider: 'webhook' })}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    config.provider === 'webhook'
                      ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-xs'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-indigo-600 text-white">
                        <Webhook className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-extrabold text-foreground">
                        Webhook / API
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold">
                      Evolution / Z-API
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Conecte a instâncias do Evolution API, Z-API, n8n ou gateways empresariais.
                  </p>
                </div>
              </div>

              {/* AVISO IMPORTANTE SOBRE STATUS DO CALLMEBOT */}
              {config.provider === 'callmebot' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Diagnóstico Oficial da Conexão CallMeBot</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDiagnoseCallMeBot}
                      disabled={isDiagnosing || !config.callmebotPhone || !config.callmebotApiKey}
                      className="h-7 text-[11px] gap-1.5 border-amber-500/40 hover:bg-amber-500/20 text-amber-900 dark:text-amber-100 cursor-pointer"
                    >
                      {isDiagnosing ? (
                        <>
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Consultando Servidor...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          Diagnosticar Servidor em Tempo Real
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
                    Seu número (<strong className="font-mono">{config.callmebotPhone || '5513997965049'}</strong>) e sua ApiKey (<strong className="font-mono">3849564</strong>) foram <strong>verificados e estão corretos</strong>. A ausência de mensagens no WhatsApp ocorre porque a infraestrutura externa global do CallMeBot está passando por uma manutenção técnica temporária (Código 410 retornado pelo provedor).
                  </p>

                  {diagnosticResult && (
                    <div className="p-3 rounded-lg bg-white/70 dark:bg-zinc-900/80 border border-amber-300 dark:border-amber-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className="flex items-center gap-1">
                          {diagnosticResult.isMaintenance ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          ) : diagnosticResult.online ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                          )}
                          Status retornado pela API:
                        </span>
                        <span className="font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-[10px]">
                          HTTP {diagnosticResult.statusCode || 207}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-950 p-2 rounded">
                        {diagnosticResult.raw || diagnosticResult.message}
                      </p>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                        {diagnosticResult.isMaintenance
                          ? 'Previsão do desenvolvedor do CallMeBot: normalização em 24h a 48h. Seus dados estão salvos e o envio voltará a operar automaticamente assim que a manutenção for concluída.'
                          : diagnosticResult.message}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* CAMPOS DO CALLMEBOT */}
              {config.provider === 'callmebot' && (
                <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center justify-between">
                        <span>Número do WhatsApp (com DDI e DDD):</span>
                        <span className="text-[10px] text-zinc-400">Ex: 5513997965049</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="5513997965049"
                        value={config.callmebotPhone}
                        onChange={(e) =>
                          setConfig({ ...config, callmebotPhone: e.target.value })
                        }
                        className="text-sm font-mono"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Insira 55 (Brasil) + DDD (ex: 13, 11) + seu número com 9 dígitos.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center justify-between">
                        <span>ApiKey do CallMeBot:</span>
                        <span className="text-[10px] text-zinc-400">Código numérico</span>
                      </label>
                      <Input
                        type="password"
                        placeholder="Ex: 3849564"
                        value={config.callmebotApiKey}
                        onChange={(e) =>
                          setConfig({ ...config, callmebotApiKey: e.target.value })
                        }
                        className="text-sm font-mono"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Chave de autorização fornecida pelo bot oficial do CallMeBot no WhatsApp.
                      </p>
                    </div>
                  </div>

                  {/* PASSO A PASSO INTERATIVO PARA OBTER A APIKEY EM 1 MINUTO */}
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Instruções do Bot Oficial do CallMeBot:</span>
                    </div>

                    <ol className="text-xs text-zinc-600 dark:text-zinc-400 space-y-2 list-decimal list-inside leading-relaxed">
                      <li>
                        Adicione o contato do bot no seu celular:{' '}
                        <strong className="text-foreground">+34 941 86 04 44</strong> (ou{' '}
                        <strong className="text-foreground">+34 924 95 82 02</strong>).
                      </li>
                      <li>
                        Envie a mensagem:{' '}
                        <code className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-foreground font-mono text-[11px]">
                          I allow callmebot to send me messages
                        </code>
                      </li>
                      <li>
                        O bot responderá informando sua ApiKey de 7 dígitos (ex: 3849564).
                      </li>
                      <li>
                        Cole a ApiKey no campo acima e clique em{' '}
                        <strong>"Salvar Configurações"</strong>.
                      </li>
                    </ol>

                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      <a
                        href="https://wa.me/34941860444?text=I+allow+callmebot+to+send+me+messages"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Abrir WhatsApp do Bot 1 (+34 941 86 04 44)
                        <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>

                      <a
                        href="https://wa.me/34924958202?text=I+allow+callmebot+to+send+me+messages"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Opção 2 (+34 924 95 82 02)
                        <ExternalLink className="h-3 w-3 ml-0.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* CAMPOS DO TELEGRAM */}
              {config.provider === 'telegram' && (
                <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-900 dark:text-sky-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <Send className="h-4 w-4 text-sky-500" />
                      Notificações Instantâneas no Telegram (100% Gratuito)
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      O Telegram possui API oficial de bots sem risco de bloqueio. Você cria seu próprio bot gratuito em 30 segundos e recebe todos os alertas de conferência, logins e divergências direto no celular.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center justify-between">
                        <span>Bot Token do Telegram:</span>
                        <span className="text-[10px] text-zinc-400">Do @BotFather</span>
                      </label>
                      <Input
                        type="password"
                        placeholder="Ex: 7182938491:AAH..."
                        value={config.telegramBotToken || ''}
                        onChange={(e) =>
                          setConfig({ ...config, telegramBotToken: e.target.value })
                        }
                        className="text-sm font-mono"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Token gerado ao enviar /newbot para o @BotFather no Telegram.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground flex items-center justify-between">
                        <span>Chat ID (Seu ID no Telegram):</span>
                        <span className="text-[10px] text-zinc-400">Número de ID</span>
                      </label>
                      <Input
                        type="text"
                        placeholder="Ex: 123456789"
                        value={config.telegramChatId || ''}
                        onChange={(e) =>
                          setConfig({ ...config, telegramChatId: e.target.value })
                        }
                        className="text-sm font-mono"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Seu ID numérico. Você pode descobrir enviando mensagem para o bot @userinfobot no Telegram.
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
                    <div className="font-bold text-foreground flex items-center gap-1.5">
                      <Info className="h-4 w-4 text-sky-500" />
                      Como criar seu Bot no Telegram em 3 passos:
                    </div>
                    <ol className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                      <li>Abra o Telegram e busque pelo contato oficial <strong className="text-foreground">@BotFather</strong>.</li>
                      <li>Envie o comando <code className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-foreground font-mono text-[11px]">/newbot</code>, dê um nome para ele e copie o <strong className="text-foreground">Token</strong> gerado.</li>
                      <li>Inicie conversa com seu bot recém-criado (clique em <em>Start</em>) e coloque seu <strong className="text-foreground">Chat ID</strong> (obtido no @userinfobot).</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* CAMPOS DO WEBHOOK */}
              {config.provider === 'webhook' && (
                <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">
                      URL do Endpoint Webhook (POST):
                    </label>
                    <Input
                      type="url"
                      placeholder="https://seu-servidor.com/webhook/whatsapp ou n8n/make"
                      value={config.webhookUrl}
                      onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                      className="text-sm font-mono"
                    />
                    <p className="text-[11px] text-zinc-500">
                      A aplicação enviará requisições HTTP POST com payload JSON a cada evento.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">
                      Token / Chave Secreta de Autorização (Opcional):
                    </label>
                    <Input
                      type="password"
                      placeholder="Bearer token ou segredo para validação do header"
                      value={config.webhookSecret || ''}
                      onChange={(e) => setConfig({ ...config, webhookSecret: e.target.value })}
                      className="text-sm font-mono"
                    />
                  </div>

                  <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground flex items-center gap-1.5">
                        <Copy className="h-3.5 w-3.5 text-zinc-400" />
                        Exemplo de Estrutura do Payload JSON:
                      </span>
                      <button
                        onClick={handleCopyPayload}
                        className="text-[11px] px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 text-foreground font-medium flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPayload ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-500" />
                            Copiado!
                          </>
                        ) : (
                          <>Copiar</>
                        )}
                      </button>
                    </div>
                    <pre className="p-2.5 rounded bg-zinc-900 text-zinc-200 text-[11px] font-mono overflow-x-auto">
                      {samplePayload}
                    </pre>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GATILHOS DE NOTIFICAÇÃO (QUANDO ENVIAR) */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500" />
                Gatilhos de Notificação
              </CardTitle>
              <CardDescription className="text-xs">
                Selecione quais eventos operacionais devem disparar avisos no WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Trigger 1: Login */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                    <LogIn className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Logins e Acessos de Operadores
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Notificar quando qualquer usuário realizar login no sistema via e-mail ou
                      Google.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.notifyOnLogin}
                  onChange={(e) =>
                    setConfig({ ...config, notifyOnLogin: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Trigger 2: Conferência Realizada */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Conferências e Conciliações Realizadas
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Notificar quando uma conferência fiscal (NF-e, DANFE, MDF-e x Vagões) for
                      finalizada ou exportada.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.notifyOnConference}
                  onChange={(e) =>
                    setConfig({ ...config, notifyOnConference: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Trigger 3: Resumo Rumo */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                    <TrainTrack className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Processamento de Composições Rumo
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Notificar quando um PDF de resumo de composição for convertido com total de
                      vagões e desmembres.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.notifyOnRumo}
                  onChange={(e) =>
                    setConfig({ ...config, notifyOnRumo: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              {/* Trigger 4: Divergências Encontradas */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      Divergências Fiscais Detectadas
                    </h4>
                    <p className="text-xs text-zinc-500">
                      Alertar imediatamente quando inconsistências graves de peso, chaves ou
                      vagões forem encontradas.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.notifyOnDivergence}
                  onChange={(e) =>
                    setConfig({ ...config, notifyOnDivergence: e.target.checked })
                  }
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
            </CardContent>
          </Card>

          {/* BOTÃO DE SALVAMENTO */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              onClick={() => handleSave(config)}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 h-10 gap-2 cursor-pointer shadow-sm"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Salvar Configurações
                </>
              )}
            </Button>
          </div>
        </div>

        {/* COLUNA DIREITA: TESTE IMEDIATO & HISTÓRICO RECENTE (4 COLUNAS) */}
        <div className="lg:col-span-4 space-y-6">
          {/* CARD DE TESTE RÁPIDO NO CELULAR */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" />
                Testar Envio no WhatsApp
              </CardTitle>
              <CardDescription className="text-xs">
                Dispare uma mensagem teste para confirmar que seu número está recebendo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Validação Imediata
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                  Ao clicar no botão abaixo, uma mensagem com data e hora de teste será enviada
                  imediatamente para o telefone cadastrado.
                </p>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-emerald-100/70 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-100/70 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  )}
                  <div className="flex-1 text-[11px] leading-relaxed break-words">
                    <strong>{testResult.success ? 'Sucesso:' : 'Erro no envio:'}</strong>{' '}
                    {testResult.message}
                  </div>
                </div>
              )}

              <Button
                onClick={handleTestNotification}
                disabled={
                  isTesting ||
                  (config.provider === 'callmebot' &&
                    (!config.callmebotPhone || !config.callmebotApiKey)) ||
                  (config.provider === 'telegram' &&
                    (!config.telegramBotToken || !config.telegramChatId)) ||
                  (config.provider === 'webhook' && !config.webhookUrl)
                }
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-10 gap-2 cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Enviando Teste...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Enviar Mensagem de Teste
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* HISTÓRICO RECENTE DE ENVIOS */}
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-500" />
                  Últimos Disparos ({logs.length})
                </CardTitle>
                <CardDescription className="text-xs">
                  Registro das mensagens enviadas nesta sessão
                </CardDescription>
              </div>
              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="text-[11px] text-zinc-400 hover:text-rose-500 flex items-center gap-1 cursor-pointer"
                  title="Limpar histórico de envios"
                >
                  <Trash2 className="h-3 w-3" />
                  Limpar
                </button>
              )}
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 text-xs">
                  Nenhum disparo de WhatsApp registrado recentemente.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          {log.status === 'SUCCESS' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-rose-500" />
                          )}
                          {log.title}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {log.timeFormatted}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                        {log.text.replace(/\*/g, '')}
                      </p>
                      {log.errorMessage && (
                        <p className="text-[10px] text-rose-500 font-mono">
                          {log.errorMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
