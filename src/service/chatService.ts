const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const EMPLOYEE_CODE =
  import.meta.env.VITE_EMPLOYEE_CODE || 'EMP001'

// Keep the same ID for every message in this browser chat session.
// The backend uses it to connect clarification replies to the original question.
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
  const response = await fetch(
    `${API_BASE_URL}/api/chat/${encodeURIComponent(EMPLOYEE_CODE)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question, session_id: CHAT_SESSION_ID }),
    },
  )

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return response.json() as Promise<ChatResponse>
}
