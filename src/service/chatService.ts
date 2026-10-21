import {
  clearAuthSession,
  getAuthToken,
  getAuthenticatedEmployeeCode,
} from './authService'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

// Keep the same ID for every message in this browser chat session.
const CHAT_SESSION_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tickora-${Date.now()}-${Math.random().toString(36).slice(2)}`

export interface ChatResponse {
  success: boolean
  answer?: string
  intent?: string
  confidence?: number
  data?: unknown
  message?: string
  requested_metric?: string | null
  session_id?: string
  show_table?: boolean
}

export async function sendChatMessage(
  question: string,
): Promise<ChatResponse> {
  const token = getAuthToken()
  const employeeCode = getAuthenticatedEmployeeCode()

  if (!token || !employeeCode) {
    window.dispatchEvent(new Event('tickora:unauthorized'))
    throw new Error('Your session has expired. Please sign in again.')
  }

  const response = await fetch(
    `${API_BASE_URL}/api/chat/${encodeURIComponent(employeeCode)}`,
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

  if (response.status === 401) {
    clearAuthSession()
    window.dispatchEvent(new Event('tickora:unauthorized'))
    throw new Error('Your session has expired. Please sign in again.')
  }

  if (response.status === 403) {
    throw new Error(
      'You are not authorized to access this employee data.',
    )
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return response.json() as Promise<ChatResponse>
}
