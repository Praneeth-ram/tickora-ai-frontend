import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CalendarDays,
  Check,
  Clock3,
  FileClock,
  House,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
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
  DISABLE_AUTH_TEMPORARILY,
  MOCK_DEV_SESSION,
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


function ChatApp({
  employee,
  onLogout,
}: {
  employee: Employee
  onLogout: () => void
}) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content:
            error instanceof Error
              ? error.message
              : 'I couldn’t connect to Tickora AI. Please try again.',
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

  function startNewChat() {
    if (isLoading) return
    setMessages([])
    setInput('')
    setSidebarOpen(false)
  }

  return (
    <main className="flex h-dvh min-h-[560px] overflow-hidden bg-white text-slate-800">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/30 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-[76px] items-center gap-3 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Check size={23} strokeWidth={2.7} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              tickora
            </h1>
            <p className="text-xs text-slate-500">Employee workspace</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-200 md:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isLoading}
            className="flex w-full items-center gap-2.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <MessageSquare size={17} />
            New conversation
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Workspace
          </p>

          <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700">
            <Sparkles size={18} />
            AI Assistant
          </div>

          <p className="px-3 pb-2 pt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Ask Tickora
          </p>

          {[
            { icon: Clock3, label: 'Attendance' },
            { icon: CalendarDays, label: 'Leave & holidays' },
            { icon: FileClock, label: 'Timesheets' },
            { icon: House, label: 'Work from home' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setSidebarOpen(false)
                setInput(
                  label === 'Attendance'
                    ? 'Show my attendance records for this month'
                    : label === 'Leave & holidays'
                      ? 'Show my leave request status and upcoming holidays'
                      : label === 'Timesheets'
                        ? 'Show my timesheets for this month'
                        : 'Show my work from home request status',
                )
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              <Icon size={18} className="text-slate-500" />
              {label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
              {(employee.full_name || 'E')
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {employee.full_name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {employee.email}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                AI Assistant
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Your personal workday assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">
              Workspace
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 md:px-12">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col">
              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col justify-center py-8">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                    <Sparkles size={27} />
                  </div>

                  <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                    Tickora AI
                  </p>
                  <h1 className="mt-3 text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                    How can I help you today?
                  </h1>
                  <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-slate-500 sm:text-base">
                    Ask a question about your attendance, working hours, leave
                    requests, holidays or work schedule.
                  </p>

                  <div className="mt-9 grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        icon: Clock3,
                        title: 'My attendance',
                        description: 'Review your attendance records',
                        question: 'Show my attendance records for October 2026',
                      },
                      {
                        icon: Check,
                        title: 'Attendance summary',
                        description: 'See your attendance totals',
                        question:
                          'Give me my attendance summary for this month',
                      },
                      {
                        icon: CalendarDays,
                        title: 'Leave requests',
                        description: 'Check your request status',
                        question: 'Show my leave request status',
                      },
                      {
                        icon: FileClock,
                        title: 'Working hours',
                        description: 'Review your timesheets',
                        question: 'Show my timesheets for this month',
                      },
                    ].map(({ icon: Icon, title, description, question }) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => void handleSend(question)}
                        disabled={isLoading}
                        className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                          <Icon size={19} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800">
                            {title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">
                            {description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-7 pb-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === 'user'
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                          <Bot size={19} />
                        </div>
                      )}

                      <div
                        className={`min-w-0 max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${
                          message.role === 'user'
                            ? 'rounded-br-md bg-blue-600 text-white'
                            : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 shadow-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {message.content}
                        </p>

                        {message.role === 'assistant' &&
                          message.data !== undefined && (
                            <>
                              <StructuredResult
                                data={message.data}
                                intent={message.intent}
                                requestedMetric={message.requestedMetric}
                                showTable={message.showTable}
                              />
                              {message.data !== null &&
                                message.requestedMetric == null && (
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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <UserRound size={18} />
                        </div>
                      )}
                    </div>
                  ))}

                  {isLoading && (
                    <div
                      className="flex items-center gap-3 text-sm text-slate-500"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                        <Bot size={19} />
                      </div>
                      Tickora AI is thinking…
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-4 pt-3 sm:px-8">
            <form
              onSubmit={handleSubmit}
              className="mx-auto max-w-4xl"
            >
              <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50">
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
                  placeholder="Ask Tickora about your workday..."
                  rows={1}
                  disabled={isLoading}
                  aria-label="Your message"
                  className="max-h-32 min-h-11 min-w-0 flex-1 resize-y bg-transparent px-3 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  aria-label="Send message"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Tickora AI uses your authorized work records to answer questions.
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession())

  useEffect(() => {
    function handleUnauthorized() {
      if (DISABLE_AUTH_TEMPORARILY) return
      clearAuthSession()
      setSession(null)
    }

    window.addEventListener('tickora:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('tickora:unauthorized', handleUnauthorized)
  }, [])

  function handleLogout() {
    clearAuthSession()
    setSession(DISABLE_AUTH_TEMPORARILY ? MOCK_DEV_SESSION : null)
  }

  if (!session && !DISABLE_AUTH_TEMPORARILY) {
    return <LoginPage onLogin={setSession} />
  }

  return (
    <ChatApp
      employee={session?.employee ?? MOCK_DEV_SESSION.employee}
      onLogout={handleLogout}
    />
  )
}
