import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
  type Auth,
} from 'firebase/auth'
import { getApps, initializeApp, getApp, type FirebaseApp } from 'firebase/app'
import {
  getFirebaseConfig,
  saveFirebaseConfig,
  type FirebaseRealtimeConfig,
  setOperatorName,
  logRealtimeActivity,
} from './firebase-realtime'

export interface AuthUserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  createdAt?: string
  isDemo?: boolean
}

let authInstance: Auth | null = null

export function getFirebaseAuth(): Auth | null {
  if (authInstance) return authInstance

  try {
    const config = getFirebaseConfig()
    const existingApps = getApps()

    let app: FirebaseApp
    if (existingApps.length > 0) {
      app = getApp()
    } else {
      app = initializeApp({
        apiKey: config?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemoDummyKeyForAuthSetup',
        authDomain: config?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${config?.projectId || 'vlic-telemetry'}.firebaseapp.com`,
        projectId: config?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || 'vlic-telemetry',
        databaseURL: config?.databaseURL || import.meta.env.VITE_FIREBASE_DATABASE_URL,
      })
    }

    authInstance = getAuth(app)
    return authInstance
  } catch (err) {
    console.warn('Não foi possível inicializar Firebase Auth diretamente:', err)
    return null
  }
}

export function resetFirebaseAuth(): void {
  authInstance = null
}

/**
 * Traduz códigos de erro do Firebase Auth para mensagens amigáveis em português
 */
export function formatFirebaseAuthError(error: any): string {
  const code = error?.code || ''
  const message = error?.message || ''

  switch (code) {
    case 'auth/invalid-email':
      return 'O formato do e-mail digitado é inválido.'
    case 'auth/user-disabled':
      return 'Esta conta de usuário foi desativada no Firebase Console.'
    case 'auth/user-not-found':
      return 'Nenhum usuário cadastrado com este e-mail no Firebase.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Verifique suas credenciais.'
    case 'auth/email-already-in-use':
      return 'Este e-mail já está cadastrado no Firebase. Tente fazer login.'
    case 'auth/weak-password':
      return 'A senha é muito fraca. Ela deve conter no mínimo 6 caracteres.'
    case 'auth/operation-not-allowed':
      return 'O método de login (E-mail/Senha ou Google) não está ativado no Firebase Console > Authentication > Sign-in method.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas sem sucesso. Bloqueado temporariamente para proteção.'
    case 'auth/popup-closed-by-user':
      return 'A janela do Google foi fechada antes de concluir o login.'
    case 'auth/popup-blocked':
      return 'O pop-up de login foi bloqueado pelo navegador. Permita pop-ups para este site.'
    case 'auth/network-request-failed':
      return 'Falha de comunicação com o Firebase. Verifique sua conexão com a internet.'
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Chave de acesso ao Firebase inválida ou serviço indisponível.'
    default:
      if (message.includes('API key')) {
        return 'Chave de acesso ao Firebase não configurada ou inválida.'
      }
      return message || 'Ocorreu um erro ao comunicar com a autenticação do Firebase.'
  }
}

/**
 * Login com E-mail e Senha no Firebase Auth
 */
export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const auth = getFirebaseAuth()
  if (!auth) {
    throw new Error('Firebase Auth não pôde ser inicializado. Verifique a configuração do seu projeto.')
  }

  const cred = await signInWithEmailAndPassword(auth, email.trim(), pass)
  const user = cred.user

  // Atualiza nome do operador na aplicação e registra atividade no Realtime
  const opName = user.displayName || user.email?.split('@')[0] || 'Operador'
  setOperatorName(opName)
  logRealtimeActivity(
    'session_start',
    'Login de Operador',
    `Operador ${opName} (${user.email}) autenticou-se via Firebase Auth.`,
    { uid: user.uid, email: user.email }
  )

  return user
}

/**
 * Cadastro de Novo Usuário no Firebase Auth
 */
export async function registerWithEmail(name: string, email: string, pass: string): Promise<User> {
  const auth = getFirebaseAuth()
  if (!auth) {
    throw new Error('Firebase Auth não pôde ser inicializado. Verifique a configuração do seu projeto.')
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass)
  const user = cred.user

  if (name.trim()) {
    try {
      await updateProfile(user, { displayName: name.trim() })
    } catch (e) {
      console.warn('Aviso ao atualizar displayName no Firebase:', e)
    }
  }

  const opName = name.trim() || user.email?.split('@')[0] || 'Operador'
  setOperatorName(opName)
  logRealtimeActivity(
    'session_start',
    'Novo Cadastro de Operador',
    `Novo operador ${opName} (${user.email}) cadastrado e autenticado via Firebase Auth.`,
    { uid: user.uid, email: user.email }
  )

  return user
}

/**
 * Login com Google via Popup
 */
export async function loginWithGoogleProvider(): Promise<User> {
  const auth = getFirebaseAuth()
  if (!auth) {
    throw new Error('Firebase Auth não pôde ser inicializado.')
  }

  const provider = new GoogleAuthProvider()
  const cred = await signInWithPopup(auth, provider)
  const user = cred.user

  const opName = user.displayName || user.email?.split('@')[0] || 'Operador'
  setOperatorName(opName)
  logRealtimeActivity(
    'session_start',
    'Login via Google',
    `Operador ${opName} (${user.email}) autenticado com conta Google no Firebase.`,
    { uid: user.uid, email: user.email }
  )

  return user
}

/**
 * Envia e-mail de redefinição de senha
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth()
  if (!auth) {
    throw new Error('Firebase Auth não pôde ser inicializado.')
  }
  await sendPasswordResetEmail(auth, email.trim())
}

/**
 * Desconectar da conta (Logout)
 */
export async function logoutFirebaseAuth(): Promise<void> {
  const auth = getFirebaseAuth()
  if (auth && auth.currentUser) {
    const user = auth.currentUser
    logRealtimeActivity(
      'session_start',
      'Logout de Operador',
      `Operador ${user.displayName || user.email} encerrou a sessão.`,
      { uid: user.uid }
    )
    await signOut(auth)
  }
  // Remove dados de sessão local de demonstração se houver
  sessionStorage.removeItem('vlic_demo_user')
}

/**
 * Login modo demonstração/contingência (para quando o Firebase Auth ainda não possui API Key configurada)
 */
export function loginDemoOperator(name: string, email: string): AuthUserProfile {
  const demoProfile: AuthUserProfile = {
    uid: 'demo_' + Date.now().toString(36),
    email: email.trim(),
    displayName: name.trim() || email.split('@')[0],
    photoURL: null,
    createdAt: new Date().toISOString(),
    isDemo: true,
  }
  sessionStorage.setItem('vlic_demo_user', JSON.stringify(demoProfile))
  setOperatorName(demoProfile.displayName || 'Operador')
  logRealtimeActivity(
    'session_start',
    'Acesso Operacional Concedido',
    `Operador ${demoProfile.displayName} (${demoProfile.email}) ingressou no sistema.`,
    { isDemo: true }
  )
  return demoProfile
}

export function getDemoOperator(): AuthUserProfile | null {
  try {
    const raw = sessionStorage.getItem('vlic_demo_user')
    if (raw) return JSON.parse(raw)
  } catch (e) {
    return null
  }
  return null
}
