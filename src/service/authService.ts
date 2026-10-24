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

const SESSION_KEY = 'tickora_auth_session'

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  return 'http://127.0.0.1:8000'
}

export function getAuthSession(): AuthSession | null {
  const raw =
    localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const session = JSON.parse(raw) as AuthSession
    if (!session?.access_token || !session?.employee?.employee_code) {
      clearAuthSession()
      return null
    }

    const payloadPart = session.access_token.split('.')[1]
    if (payloadPart) {
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64)) as { exp?: number }

      if (payload.exp && payload.exp * 1000 <= Date.now()) {
        clearAuthSession()
        return null
      }
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
  const baseUrl = getApiBaseUrl()

  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
      }),
    })
  } catch (err) {
    throw new Error(
      'Unable to connect to the Tickora AI backend. Please check if the server is running.',
    )
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('The email or password is incorrect.')
    }

    if (response.status === 403) {
      throw new Error('This account is disabled. Please contact your administrator.')
    }

    let detail = 'Unable to sign in. Please try again.'
    try {
      const body = (await response.json()) as { detail?: string | unknown }
      if (typeof body.detail === 'string') {
        detail = body.detail
      } else if (body.detail) {
        detail = JSON.stringify(body.detail)
      }
    } catch {
      // Keep default message
    }

    throw new Error(detail)
  }

  const session = (await response.json()) as AuthSession

  if (!session.access_token || !session.employee?.employee_code) {
    throw new Error('The server returned an incomplete login response.')
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function clearAuthSession(): void {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
}

export function getAuthToken(): string | null {
  return getAuthSession()?.access_token ?? null
}

export function getAuthenticatedEmployeeCode(): string | null {
  return getAuthSession()?.employee?.employee_code ?? null
}
