import { ref, set, get, onValue, update } from 'firebase/database'
import {
  getDatabaseInstance,
  logRealtimeActivity,
  getOperatorName,
} from './firebase-realtime'

export type UserDepartment = 'supervisor' | 'colaborador'

export interface UserDatabaseProfile {
  uid: string
  email: string
  displayName: string
  departamento: UserDepartment
  cargo?: string
  lastLogin?: number
  updatedAt?: number
  updatedBy?: string
}

export const DEFAULT_SUPERVISOR_EMAILS = [
  'thiago_gja27@hotmail.com',
  'thiago.gja27@hotmail.com',
  'thiago.viaembratelgja@gmail.com',
  'admin@tegporto.com.br',
]

const STORAGE_KEY_DEPT_PREFIX = 'vlic_user_dept_'
const STORAGE_KEY_ALL_USERS = 'vlic_cached_db_users'

export function sanitizeEmailForFirebase(email: string): string {
  return email.toLowerCase().trim().replace(/[\.\#\$\[\]@]/g, '_')
}

export function isDefaultSupervisor(email: string | null | undefined): boolean {
  if (!email) return false
  const clean = email.toLowerCase().trim()
  return DEFAULT_SUPERVISOR_EMAILS.some((adm) => adm.toLowerCase().trim() === clean)
}

/**
 * Resgata o departamento salvo localmente em caso de falha de conexão
 */
export function getLocalCachedDepartment(emailOrUid: string): UserDepartment | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_DEPT_PREFIX}${emailOrUid.toLowerCase().trim()}`)
    if (raw === 'supervisor' || raw === 'colaborador') return raw
  } catch (e) {
    // ignore
  }
  return null
}

export function setLocalCachedDepartment(emailOrUid: string, dept: UserDepartment): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_DEPT_PREFIX}${emailOrUid.toLowerCase().trim()}`, dept)
  } catch (e) {
    // ignore
  }
}

/**
 * Sincroniza ou cadastra o usuário no banco de dados na coleção vlic_telemetry/users
 * Retorna o departamento atual do usuário ('supervisor' ou 'colaborador')
 */
export async function syncUserInDatabase(user: {
  uid: string
  email: string | null
  displayName: string | null
}): Promise<UserDepartment> {
  const email = user.email ? user.email.toLowerCase().trim() : ''
  const cleanEmail = email ? sanitizeEmailForFirebase(email) : ''
  const displayName = user.displayName || email.split('@')[0] || 'Usuário'
  const isDefaultSup = isDefaultSupervisor(email)

  const db = getDatabaseInstance()

  // Se não há banco conectado, verifica cache local ou lista padrão
  if (!db) {
    const cached = (email && getLocalCachedDepartment(email)) || getLocalCachedDepartment(user.uid)
    if (cached) return cached
    const dept: UserDepartment = isDefaultSup ? 'supervisor' : 'colaborador'
    if (email) setLocalCachedDepartment(email, dept)
    setLocalCachedDepartment(user.uid, dept)
    return dept
  }

  try {
    // 1. Tenta buscar por UID
    const userRef = ref(db, `vlic_telemetry/users/${user.uid}`)
    const snap = await get(userRef)

    // 2. Busca pré-configuração direta por e-mail (user_departments)
    let deptFromEmail: UserDepartment | null = null
    if (cleanEmail) {
      const emailDeptRef = ref(db, `vlic_telemetry/user_departments/${cleanEmail}`)
      const emailSnap = await get(emailDeptRef)
      if (emailSnap.exists()) {
        const val = emailSnap.val()
        if (val === 'supervisor' || val === 'colaborador') {
          deptFromEmail = val
        }
      }
    }

    // 3. Avalia o departamento com estrita prioridade:
    // Se no banco (user_departments) estiver explicitamente como 'supervisor', É SUPERVISOR!
    // Se no nó users/${user.uid} estiver como 'supervisor', É SUPERVISOR!
    // Se for e-mail de supervisor padrão, É SUPERVISOR!
    let finalDept: UserDepartment = 'colaborador'

    if (deptFromEmail === 'supervisor' || isDefaultSup) {
      finalDept = 'supervisor'
    } else if (snap.exists()) {
      const existing = snap.val() as UserDatabaseProfile
      if (existing.departamento === 'supervisor') {
        finalDept = 'supervisor'
      } else if (deptFromEmail === 'colaborador') {
        finalDept = 'colaborador'
      } else {
        finalDept = existing.departamento || 'colaborador'
      }
    } else if (deptFromEmail === 'colaborador') {
      finalDept = 'colaborador'
    }

    if (snap.exists()) {
      // Atualiza login e sincroniza departamento
      await update(userRef, {
        displayName,
        email,
        departamento: finalDept,
        cargo: finalDept === 'supervisor' ? 'Supervisor Operacional' : 'Colaborador / Conferente',
        lastLogin: Date.now(),
      })
    } else {
      // Novo usuário no banco
      const newProfile: UserDatabaseProfile = {
        uid: user.uid,
        email,
        displayName,
        departamento: finalDept,
        cargo: finalDept === 'supervisor' ? 'Supervisor Operacional' : 'Colaborador / Conferente',
        lastLogin: Date.now(),
        updatedAt: Date.now(),
      }
      await set(userRef, newProfile)
    }

    // Garante que o mapa por e-mail também esteja atualizado
    if (cleanEmail) {
      const emailDeptRef = ref(db, `vlic_telemetry/user_departments/${cleanEmail}`)
      await set(emailDeptRef, finalDept)
      setLocalCachedDepartment(email, finalDept)
    }
    setLocalCachedDepartment(user.uid, finalDept)

    return finalDept
  } catch (err) {
    console.warn('Erro ao sincronizar departamento do usuário no banco:', err)
    const cached = (email && getLocalCachedDepartment(email)) || getLocalCachedDepartment(user.uid)
    const fallback: UserDepartment = cached || (isDefaultSup ? 'supervisor' : 'colaborador')
    return fallback
  }
}

/**
 * Escuta em tempo real o departamento do usuário ativo no Firebase
 * Ouve tanto no nó vlic_telemetry/users/${user.uid} quanto em vlic_telemetry/user_departments/${cleanEmail}
 */
export function subscribeUserDepartment(
  user: { uid: string; email: string | null },
  onDeptChange: (dept: UserDepartment) => void
): () => void {
  const email = user.email ? user.email.toLowerCase().trim() : ''
  const cleanEmail = email ? sanitizeEmailForFirebase(email) : ''
  const isDefaultSup = isDefaultSupervisor(email)

  const db = getDatabaseInstance()
  if (!db) {
    const cached = (email && getLocalCachedDepartment(email)) || getLocalCachedDepartment(user.uid)
    onDeptChange(cached || (isDefaultSup ? 'supervisor' : 'colaborador'))
    return () => {}
  }

  let currentUidDept: UserDepartment | null = null
  let currentEmailDept: UserDepartment | null = null

  const evaluateAndNotify = () => {
    let chosen: UserDepartment = 'colaborador'
    if (currentEmailDept === 'supervisor' || currentUidDept === 'supervisor' || isDefaultSup) {
      chosen = 'supervisor'
    } else if (currentEmailDept === 'colaborador' || currentUidDept === 'colaborador') {
      chosen = 'colaborador'
    } else {
      chosen = isDefaultSup ? 'supervisor' : 'colaborador'
    }

    if (email) setLocalCachedDepartment(email, chosen)
    setLocalCachedDepartment(user.uid, chosen)
    onDeptChange(chosen)
  }

  // Listener 1: Nó específico do usuário por UID
  const userRef = ref(db, `vlic_telemetry/users/${user.uid}`)
  const unsubscribeUser = onValue(userRef, (snap) => {
    if (snap.exists()) {
      const data = snap.val()
      if (data?.departamento === 'supervisor' || data?.departamento === 'colaborador') {
        currentUidDept = data.departamento
      }
    }
    evaluateAndNotify()
  })

  // Listener 2: Nó direto do e-mail em user_departments
  let unsubscribeEmail = () => {}
  if (cleanEmail) {
    const emailDeptRef = ref(db, `vlic_telemetry/user_departments/${cleanEmail}`)
    unsubscribeEmail = onValue(emailDeptRef, (emailSnap) => {
      if (emailSnap.exists()) {
        const val = emailSnap.val()
        if (val === 'supervisor' || val === 'colaborador') {
          currentEmailDept = val
        }
      }
      evaluateAndNotify()
    })
  }

  return () => {
    unsubscribeUser()
    unsubscribeEmail()
  }
}

/**
 * Atualiza o departamento de um usuário no banco de dados (exclusivo para supervisores)
 */
export async function setUserDepartment(
  targetUid: string,
  targetEmail: string,
  newDept: UserDepartment,
  updatedBy: string,
  displayName?: string
): Promise<void> {
  const email = targetEmail.toLowerCase().trim()
  const cleanEmail = sanitizeEmailForFirebase(email)

  const db = getDatabaseInstance()
  if (db) {
    const userRef = ref(db, `vlic_telemetry/users/${targetUid}`)
    const updates: Partial<UserDatabaseProfile> = {
      departamento: newDept,
      cargo: newDept === 'supervisor' ? 'Supervisor Operacional' : 'Colaborador / Conferente',
      updatedAt: Date.now(),
      updatedBy,
    }
    if (displayName) updates.displayName = displayName
    if (email) updates.email = email

    await update(userRef, updates)

    if (cleanEmail) {
      const emailDeptRef = ref(db, `vlic_telemetry/user_departments/${cleanEmail}`)
      await set(emailDeptRef, newDept)
    }
  }

  if (email) setLocalCachedDepartment(email, newDept)
  setLocalCachedDepartment(targetUid, newDept)

  // Registra no histórico de auditoria operacional
  logRealtimeActivity(
    'session_start',
    'Alteração de Departamento / Acesso',
    `O supervisor ${updatedBy} alterou o departamento do usuário ${displayName || email} para ${newDept.toUpperCase()} no banco de dados.`,
    {
      targetUid,
      targetEmail: email,
      newDepartment: newDept,
      updatedBy,
    }
  )
}

/**
 * Cadastra ou pré-define o departamento de um usuário por e-mail no banco de dados
 */
export async function predefineDepartmentByEmail(
  email: string,
  dept: UserDepartment,
  updatedBy: string,
  suggestedName?: string
): Promise<void> {
  const clean = email.toLowerCase().trim()
  const cleanKey = sanitizeEmailForFirebase(clean)
  const virtualUid = 'user_' + cleanKey

  const db = getDatabaseInstance()
  if (db) {
    // Define no mapa por e-mail
    const emailDeptRef = ref(db, `vlic_telemetry/user_departments/${cleanKey}`)
    await set(emailDeptRef, dept)

    // Cria/atualiza o registro do usuário
    const userRef = ref(db, `vlic_telemetry/users/${virtualUid}`)
    await set(userRef, {
      uid: virtualUid,
      email: clean,
      displayName: suggestedName || clean.split('@')[0],
      departamento: dept,
      cargo: dept === 'supervisor' ? 'Supervisor Operacional' : 'Colaborador / Conferente',
      updatedAt: Date.now(),
      updatedBy,
    })
  }

  setLocalCachedDepartment(clean, dept)
}

/**
 * Escuta todos os usuários cadastrados no banco de dados para gestão de acessos
 */
export function subscribeAllUsersWithDepartments(
  callback: (users: UserDatabaseProfile[]) => void
): () => void {
  const db = getDatabaseInstance()
  if (!db) {
    // Fallback com usuários locais ou default
    const defaults: UserDatabaseProfile[] = DEFAULT_SUPERVISOR_EMAILS.map((em, idx) => ({
      uid: `default_sup_${idx}`,
      email: em,
      displayName: em.split('@')[0],
      departamento: 'supervisor',
      cargo: 'Supervisor Operacional',
      lastLogin: Date.now(),
    }))
    callback(defaults)
    return () => {}
  }

  const usersRef = ref(db, 'vlic_telemetry/users')
  const unsub = onValue(usersRef, (snap) => {
    if (snap.exists()) {
      const data = snap.val()
      const userList: UserDatabaseProfile[] = Object.values(data)
      // Ordena: supervisores primeiro, depois por nome
      userList.sort((a, b) => {
        if (a.departamento === 'supervisor' && b.departamento !== 'supervisor') return -1
        if (b.departamento === 'supervisor' && a.departamento !== 'supervisor') return 1
        return (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '')
      })
      try {
        localStorage.setItem(STORAGE_KEY_ALL_USERS, JSON.stringify(userList))
      } catch (e) {
        // ignore
      }
      callback(userList)
    } else {
      // Nenhum usuário no banco ainda, gera lista padrão com os supervisores iniciais
      const defaults: UserDatabaseProfile[] = DEFAULT_SUPERVISOR_EMAILS.map((em, idx) => ({
        uid: `default_sup_${idx}`,
        email: em,
        displayName: em.split('@')[0],
        departamento: 'supervisor',
        cargo: 'Supervisor Operacional',
        lastLogin: Date.now(),
      }))
      callback(defaults)
    }
  })

  return () => unsub()
}
