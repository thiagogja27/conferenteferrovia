/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './context/auth-context'
import { XMLConverter } from './components/xml-converter'
import { LoginScreen } from './components/login-screen'
import { ErrorBoundary } from './components/error-boundary'
import { RefreshCw } from 'lucide-react'

function AuthGate() {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
          <p className="text-xs text-zinc-500">
            Carregando...
          </p>
        </div>
      </div>
    )
  }

  // Se não estiver logado, a tela de login aparece primeiro e bloqueia o acesso ao site
  if (!isAuthenticated || !user) {
    return <LoginScreen isModal={false} />
  }

  // Após autenticado pelo Firebase, libera o acesso ao sistema
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <XMLConverter />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  )
}
