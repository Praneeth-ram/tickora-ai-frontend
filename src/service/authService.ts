
export interface Employee {
  employee_id: number
  employee_code: string
  full_name: string
  email: string
}

export interface AuthSession {
  access_token: string
  token_type: string
  employee: Employee
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const SESSION_KEY = 'tickora_auth_session'

export function getAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)

  if (!raw) return null

  try {
    const session = JSON.parse(raw) as AuthSession
    const payloadPart = session.access_token.split('.')[1]

    if (!payloadPart) throw new Error('Invalid token')

    const base64 = payloadPart
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const payload = JSON.parse(atob(base64)) as { exp?: number }

    if (!payload.exp || payload.exp * 1000 <= Date.now()) {
      clearAuthSession()
      return null
    }

    return session
  } catch {
    clearAuthSession()
    return null
  }
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('The email or password is incorrect.')
    }

    let detail = 'Unable to sign in. Please try again.'

    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // Keep the default error message.
    }

    throw new Error(detail)
  }

  const session = (await response.json()) as AuthSession

  if (!session.access_token || !session.employee?.employee_code) {
    throw new Error('The server returned an incomplete login response.')
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))

  return session
}

export function clearAuthSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getAuthToken(): string | null {
  return getAuthSession()?.access_token ?? null
}

export function getAuthenticatedEmployeeCode(): string | null {
  return getAuthSession()?.employee.employee_code ?? null
}
