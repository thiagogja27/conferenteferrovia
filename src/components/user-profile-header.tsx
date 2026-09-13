import React, { useState } from 'react'
import { useAuth } from '@/context/auth-context'
import {
  LogOut,
  ShieldCheck,
} from 'lucide-react'

export function UserProfileHeader() {
  const {
    user,
    isAuthenticated,
    signOutUser,
  } = useAuth()

  const [showDropdown, setShowDropdown] = useState(false)

  if (!isAuthenticated || !user) {
    return null
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Operador'
  const email = user.email || 'operador@sistema.local'
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 py-1 px-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 shadow-2xs transition-all cursor-pointer"
        >
          <div className="relative">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="h-6 w-6 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                {initials || 'OP'}
              </div>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
          </div>

          <div className="text-left hidden sm:block">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 block max-w-[130px]">
              {displayName}
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block -mt-0.5">
              Firebase Auth
            </span>
          </div>
        </button>

        {/* Menu Suspenso */}
        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 mt-1.5 w-56 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl z-50 p-2 text-xs animate-in fade-in-50 zoom-in-95">
              <div className="p-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl mb-1.5">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                  {displayName}
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate block">
                  {email}
                </span>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Conectado via Firebase Auth
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDropdown(false)
                  signOutUser()
                }}
                className="w-full text-left py-2 px-2.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 text-rose-600 dark:text-rose-400 font-medium cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair da Conta (Logout)</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Botão rápido de Logout no header */}
      <button
        type="button"
        onClick={() => signOutUser()}
        title="Sair da Conta (Logout)"
        className="p-1.5 rounded-xl text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer border border-zinc-200/80 dark:border-zinc-800"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  )
}
