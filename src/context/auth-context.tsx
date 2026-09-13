import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  type User,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  getFirebaseAuth,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogleProvider,
  logoutFirebaseAuth,
  sendPasswordReset,
  loginDemoOperator,
  getDemoOperator,
  formatFirebaseAuthError,
  type AuthUserProfile,
  resetFirebaseAuth,
} from '@/lib/firebase-auth'
import {
  getFirebaseConfig,
  saveFirebaseConfig,
  type FirebaseRealtimeConfig,
  resetFirebase,
} from '@/lib/firebase-realtime'

interface AuthContextType {
  user: User | AuthUserProfile | null
  loading: boolean
  isAuthenticated: boolean
  isDemo: boolean
  isAuthModalOpen: boolean
  setIsAuthModalOpen: (open: boolean) => void
  requireLogin: boolean
  setRequireLogin: (required: boolean) => void
  signIn: (email: string, pass: string) => Promise<void>
  signUp: (name: string, email: string, pass: string) => Promise<void>
  signInGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
  sendReset: (email: string) => Promise<void>
  signInDemo: (name: string, email: string) => void
  updateFirebaseSettings: (config: FirebaseRealtimeConfig) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY_REQUIRE_LOGIN = 'vlic_require_login'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | AuthUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemo, setIsDemo] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [requireLogin, setRequireLoginState] = useState<boolean>(true)

  const setRequireLogin = (required: boolean) => {
    setRequireLoginState(required)
    localStorage.setItem(STORAGE_KEY_REQUIRE_LOGIN, required ? 'true' : 'false')
  }

  useEffect(() => {
    const auth = getFirebaseAuth()
    let unsubscribe = () => {}

    if (auth) {
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
          setUser(firebaseUser)
          setIsDemo(false)
          setLoading(false)
        } else {
          setUser(null)
          setIsDemo(false)
          setLoading(false)
        }
      })
    } else {
      setUser(null)
      setIsDemo(false)
      setLoading(false)
    }

    return () => unsubscribe()
  }, [])

  const signIn = async (email: string, pass: string) => {
    try {
      const loggedUser = await loginWithEmail(email, pass)
      setUser(loggedUser)
      setIsDemo(false)
      setIsAuthModalOpen(false)
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err))
    }
  }

  const signUp = async (name: string, email: string, pass: string) => {
    try {
      const newUser = await registerWithEmail(name, email, pass)
      setUser(newUser)
      setIsDemo(false)
      setIsAuthModalOpen(false)
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err))
    }
  }

  const signInGoogle = async () => {
    try {
      const googleUser = await loginWithGoogleProvider()
      setUser(googleUser)
      setIsDemo(false)
      setIsAuthModalOpen(false)
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err))
    }
  }

  const signOutUser = async () => {
    await logoutFirebaseAuth()
    setUser(null)
    setIsDemo(false)
  }

  const sendReset = async (email: string) => {
    try {
      await sendPasswordReset(email)
    } catch (err: any) {
      throw new Error(formatFirebaseAuthError(err))
    }
  }

  const signInDemo = (name: string, email: string) => {
    const demo = loginDemoOperator(name, email)
    setUser(demo)
    setIsDemo(true)
    setIsAuthModalOpen(false)
  }

  const updateFirebaseSettings = (config: FirebaseRealtimeConfig) => {
    saveFirebaseConfig(config)
    resetFirebaseAuth()
    resetFirebase()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        isDemo,
        isAuthModalOpen,
        setIsAuthModalOpen,
        requireLogin,
        setRequireLogin,
        signIn,
        signUp,
        signInGoogle,
        signOutUser,
        sendReset,
        signInDemo,
        updateFirebaseSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider')
  }
  return context
}
