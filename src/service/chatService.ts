import {
  clearAuthSession,
  getApiBaseUrl,
  getAuthToken,
  getAuthenticatedEmployeeCode,
} from './authService'

// Keep the same ID for every message in this browser chat session.
const CHAT_SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tickora-${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface ChatResponse {
  success: boolean
  answer?: string
  intent?: string
  confidence?: number | null
  data?: unknown
  raw_data?: unknown
  message?: string
  requested_metric?: string | null
  requested_field?: string | null
  status?: string | null
  region?: string | null
  period?: { start_date?: string | null; end_date?: string | null } | null
  session_id?: string
  show_table?: boolean
}

export async function sendChatMessage(
  question: string,
  employeeCodeOverride?: string,
): Promise<ChatResponse> {
  const token = getAuthToken()
  const employeeCode = employeeCodeOverride || getAuthenticatedEmployeeCode()

  if (!token || !employeeCode) {
    clearAuthSession()
    window.dispatchEvent(new Event('tickora:unauthorized'))
    throw new Error('Your session has expired. Please sign in again.')
  }

  const baseUrl = getApiBaseUrl()

  let response: Response
  try {
    response = await fetch(
      `${baseUrl}/api/chat/${encodeURIComponent(employeeCode)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          session_id: CHAT_SESSION_ID,
        }),
      },
    )
  } catch (err) {
    throw new Error(
      'Unable to connect to the Tickora AI backend. Please check your network and ensure the backend is running.',
    )
  }

  if (response.status === 401) {
    clearAuthSession()
    window.dispatchEvent(new Event('tickora:unauthorized'))
    throw new Error('Your session has expired. Please sign in again.')
  }

  if (response.status === 403) {
    throw new Error('You are not authorized to access this employee’s records.')
  }

  if (response.status === 503) {
    let detail =
      'The Tickora AI inference model service is currently unavailable. Please verify the model server is running on port 8001.'
    try {
      const body = (await response.json()) as { detail?: string }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // keep default detail
    }
    throw new Error(detail)
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`
    try {
      const body = (await response.json()) as { detail?: string }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // keep default detail
    }
    throw new Error(detail)
  }

  return response.json() as Promise<ChatResponse>
}
