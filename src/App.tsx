import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  MessageCircle,
  LogOut,
  Send,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import { sendChatMessage } from './service/chatService'
import LoginPage from './LoginPage'
import {
  clearAuthSession,
  getAuthSession,
  type AuthSession,
  type Employee,
} from './service/authService'

type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  data?: unknown
  intent?: string
  requestedMetric?: string | null
  showTable?: boolean
}


type DataRecord = Record<string, unknown>

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function findRecordArray(value: unknown, depth = 0): DataRecord[] | null {
  if (depth > 3) return null
  if (Array.isArray(value)) {
    if (value.length === 0) return []
    if (value.every(isRecord)) return value
    return null
  }
  if (!isRecord(value)) return null

  const preferredKeys = [
    'records', 'items', 'results', 'attendance', 'holidays',
    'requests', 'timesheets', 'schedules', 'data',
  ]
  for (const key of preferredKeys) {
    if (key in value) {
      const found = findRecordArray(value[key], depth + 1)
      if (found !== null) return found
    }
  }
  for (const nested of Object.values(value)) {
    if (isRecord(nested) || Array.isArray(nested)) {
      const found = findRecordArray(nested, depth + 1)
      if (found !== null) return found
    }
  }
  return null
}

function StatusPill({ value }: { value: unknown }) {
  const status = formatValue(value)
  const normalized = status.toLowerCase()
  const tone =
    /present|approved|completed|active|accepted|clocked in/.test(normalized)
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : /absent|rejected|failed|cancelled|denied|error/.test(normalized)
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : /pending|partial|late|in progress/.test(normalized)
          ? 'bg-amber-50 text-amber-700 ring-amber-200'
          : 'bg-slate-100 text-slate-700 ring-slate-200'

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {status}
    </span>
  )
}

function StructuredResult({
  data,
  intent,
  requestedMetric,
  showTable,
}: {
  data: unknown
  intent?: string
  requestedMetric?: string | null
  showTable?: boolean
}) {
  if (data === null || data === undefined) return null
  if (showTable === false) return null

  // For scalar/count questions, the answer text is sufficient.
  // Avoid duplicating the full summary cards or records table.
  if (requestedMetric) return null

  const records = findRecordArray(data)
  if (records && records.length > 0) {
    const columns = Array.from(
      new Set(records.flatMap((record) => Object.keys(record))),
    ).filter((key) => !['employee_id', 'attendance_id'].includes(key.toLowerCase()))

    return (
      <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-700">
            {formatLabel(intent || 'results')} <span className="font-normal text-slate-500">· {records.length} {records.length === 1 ? 'record' : 'records'}</span>
          </p>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-left text-xs">
            <thead className="bg-white text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="whitespace-nowrap border-b border-slate-100 px-3 py-2 font-semibold">
                    {formatLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, rowIndex) => (
                <tr key={String(record.id ?? record.attendance_id ?? record.leave_request_id ?? rowIndex)} className="odd:bg-white even:bg-slate-50/70">
                  {columns.map((column) => {
                    const value = record[column]
                    const isStatus = /status|state|approval/i.test(column)
                    return (
                      <td key={column} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 text-slate-700 last:border-b-0">
                        {isStatus ? <StatusPill value={value} /> : formatValue(value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (records && records.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        No records to display.
      </div>
    )
  }

  if (isRecord(data)) {
    const entries = Object.entries(data).filter(
      ([key, value]) =>
        !['answer', 'message', 'success', 'intent', 'confidence'].includes(key.toLowerCase()) &&
        (typeof value !== 'object' || value === null),
    )

    if (entries.length > 0) {
      return (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {entries.map(([key, value]) => (
            <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {formatLabel(key)}
              </p>
              <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                {formatValue(value)}
              </p>
            </div>
          ))}
        </div>
      )
    }
  }

  if (Array.isArray(data) && data.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
        No records to display.
      </div>
    )
  }

  return null
}

const suggestions = [
  {
    icon: Clock3,
    title: 'My attendance',
    question: 'Show my attendance records for October 2026',
  },
  {
    icon: CalendarDays,
    title: 'Leave requests',
    question: 'Show my leave request status',
  },
  {
    icon: Check,
    title: 'Attendance summary',
    question: 'Give me my attendance summary for this month',
  },
]

function ChatApp({ employee, onLogout }: { employee: Employee; onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const messageEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function handleSend(question?: string) {
    const text = (question ?? input).trim()

    if (!text || isLoading) return

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: text,
    }

    setMessages((previous) => [...previous, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const result = await sendChatMessage(text)

      const reply: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content:
          result.answer ??
          result.message ??
          (result.success
            ? 'Your request was processed.'
            : 'I could not process that request.'),
        data: result.data,
        intent: result.intent,
        requestedMetric: result.requested_metric,
        showTable: result.show_table,
      }

      setMessages((previous) => [...previous, reply])
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content:
            'I couldn’t connect to Tickora AI. Please check that the backend is running and try again.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSend()
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 md:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Check size={22} strokeWidth={2.8} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">tickora</h1>
            <p className="text-xs text-slate-500">Attendance management</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-800">{employee.full_name}</p>
            <p className="text-xs text-slate-500">{employee.email}</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Workspace
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            aria-label="Sign out"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-12 md:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Sparkles size={30} />
          </div>

          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
            Meet your AI assistant
          </p>

          <h2 className="text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
            Your workday,
            <span className="text-blue-600"> simplified.</span>
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-500">
            Ask questions about your attendance, timesheets, leave requests,
            holidays and work schedule — all in one place.
          </p>

          <button
            onClick={() => setIsOpen(true)}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
          >
            <MessageCircle size={18} />
            Chat with Tickora AI
          </button>
        </div>

        <div className="mx-auto mt-16 grid max-w-3xl gap-4 sm:grid-cols-3">
          {[
            {
              icon: Clock3,
              title: 'Attendance',
              description: 'Review clock-ins, clock-outs and attendance history.',
            },
            {
              icon: CalendarDays,
              title: 'Leave & holidays',
              description: 'Check leave request statuses and upcoming holidays.',
            },
            {
              icon: Check,
              title: 'Work insights',
              description: 'Get summaries of your work records and schedules.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <item.icon className="mb-4 text-blue-600" size={23} />
              <h3 className="font-semibold text-slate-800">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {isOpen && (
        <section
          aria-label="Tickora AI chat"
          className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(700px,calc(100dvh-130px))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-slate-200"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Bot size={24} />
                <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Tickora AI</h2>
                <p className="mt-0.5 text-xs text-emerald-600">
                  Your work assistant
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4">
            {messages.length === 0 && (
              <div className="pt-4">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Sparkles size={21} />
                </div>

                <h3 className="text-xl font-bold text-slate-900">
                  Hi there! 👋
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  What would you like to know about your workday?
                </p>

                <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Try asking
                </p>

                <div className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.title}
                      onClick={() => void handleSend(suggestion.question)}
                      disabled={isLoading}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <suggestion.icon
                        size={19}
                        className="shrink-0 text-blue-600"
                      />
                      <span className="flex-1 text-sm font-medium text-slate-700">
                        {suggestion.title}
                      </span>
                      <ChevronDown
                        size={15}
                        className="-rotate-90 text-slate-400"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2.5 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                    <Bot size={18} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'rounded-br-md bg-blue-600 text-white'
                      : 'rounded-bl-md border border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>

                  {message.role === 'assistant' && message.data !== undefined && (
                    <>
                      <StructuredResult
                        data={message.data}
                        intent={message.intent}
                        requestedMetric={message.requestedMetric}
                        showTable={message.showTable}
                      />
                      {message.data !== null && message.requestedMetric == null && (
                        <details className="mt-3 border-t border-slate-100 pt-2">
                          <summary className="cursor-pointer text-xs font-semibold text-blue-600">
                            View raw data
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
                            {JSON.stringify(message.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                    <UserRound size={17} />
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Bot size={18} />
                </div>
                Tickora AI is thinking…
              </div>
            )}

            <div ref={messageEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t border-slate-100 bg-white p-4 sm:rounded-b-2xl"
          >
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
                placeholder="Ask about your workday..."
                rows={1}
                disabled={isLoading}
                aria-label="Your message"
                className="max-h-28 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send size={17} />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              Tickora AI · Attendance information assistant
            </p>
          </form>
        </section>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open Tickora AI chat"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-200 transition hover:-translate-y-1 hover:bg-blue-700"
        >
          <MessageCircle size={25} />
        </button>
      )}
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession())

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthSession()
      setSession(null)
    }

    window.addEventListener('tickora:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('tickora:unauthorized', handleUnauthorized)
  }, [])

  function handleLogout() {
    clearAuthSession()
    setSession(null)
  }

  if (!session) {
    return <LoginPage onLogin={setSession} />
  }

  return (
    <ChatApp
      employee={session.employee}
      onLogout={handleLogout}
    />
  )
}
