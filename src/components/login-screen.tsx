import React, { useState } from 'react'
import { useAuth } from '@/context/auth-context'
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  TrainTrack,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'

interface LoginScreenProps {
  isModal?: boolean
  onClose?: () => void
}

export function LoginScreen({ isModal = false, onClose }: LoginScreenProps) {
  const { signIn, sendReset } = useAuth()

  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const clearMessages = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()

    if (!email.trim() || !password) {
      setErrorMessage('Preencha o e-mail e a senha.')
      return
    }

    setLoading(true)
    try {
      await signIn(email, password)
      if (onClose) onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao autenticar.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    clearMessages()

    if (!email.trim()) {
      setErrorMessage('Digite seu e-mail para recuperar a senha.')
      return
    }

    setLoading(true)
    try {
      await sendReset(email)
      setSuccessMessage('Link de redefinição enviado para seu e-mail.')
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao enviar e-mail de recuperação.')
    } finally {
      setLoading(false)
    }
  }

  const containerClasses = isModal
    ? 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200'
    : 'min-h-screen w-full flex items-center justify-center p-4 bg-zinc-950'

  return (
    <div className={containerClasses}>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 relative">
        {/* Cabeçalho Limpo e Direto */}
        <div className="text-center mb-6 pt-2">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 mb-3">
            <TrainTrack className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Conferente Ferrovia
          </h1>
        </div>

        {mode === 'login' && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="mb-2 font-semibold text-amber-300">Acesso temporário</p>
            <p>
              E-mail:{' '}
              <span className="select-text font-medium text-zinc-100">portaria_balanca@tegporto.com.br</span>
            </p>
            <p>
              Senha: <span className="select-text font-medium text-zinc-100">@Bal120826</span>
            </p>
          </div>
        )}

        {/* Mensagens de Alerta / Sucesso */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* MODO LOGIN */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => {
                    clearMessages()
                    setMode('forgot')
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        )}

        {/* MODO ESQUECEU A SENHA */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                E-mail para recuperação
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@empresa.com"
                  required
                  className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  clearMessages()
                  setMode('login')
                }}
                className="flex-1 py-2 px-3 rounded-xl border border-zinc-700 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
