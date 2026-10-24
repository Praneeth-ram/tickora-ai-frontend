import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileClock,
  House,
  LogOut,
  Menu,
  MessageSquare,
  PieChart,
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

function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function formatDateOrTime(raw: string): string {
  // ISO date-time or YYYY-MM-DD
  const isoDateMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (isoDateMatch) {
    const [, year, month, day, hours, minutes] = isoDateMatch
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const monthName = months[parseInt(month, 10) - 1] || month
    const dateFormatted = `${day} ${monthName} ${year}`
    if (hours !== undefined && minutes !== undefined) {
      const hr = parseInt(hours, 10)
      const ampm = hr >= 12 ? 'PM' : 'AM'
      const hr12 = hr % 12 || 12
      return `${dateFormatted}, ${String(hr12).padStart(2, '0')}:${minutes} ${ampm}`
    }
    return dateFormatted
  }

  // Time format: HH:MM:SS
  const timeMatch = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (timeMatch) {
    const [, hours, minutes] = timeMatch
    const hr = parseInt(hours, 10)
    const ampm = hr >= 12 ? 'PM' : 'AM'
    const hr12 = hr % 12 || 12
    return `${String(hr12).padStart(2, '0')}:${minutes} ${ampm}`
  }

  return raw
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    if (key.toLowerCase().includes('minute')) {
      return `${formatDuration(value)} (${value.toLocaleString()}m)`
    }
    return value.toLocaleString()
  }
  if (typeof value === 'string') {
    return formatDateOrTime(value)
  }
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
    'records',
    'items',
    'results',
    'attendance',
    'holidays',
    'requests',
    'timesheets',
    'schedules',
    'data',
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
  const status = String(value ?? '').trim()
  const normalized = status.toLowerCase()

  let tone = 'bg-slate-100 text-slate-700 ring-slate-200'
  if (/present|approved|completed|active|accepted|clocked in|on time/.test(normalized)) {
    tone = 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  } else if (/absent|rejected|failed|cancelled|denied|error/.test(normalized)) {
    tone = 'bg-rose-50 text-rose-700 ring-rose-200'
  } else if (/pending|partial|late|in progress|submitted|draft|half/.test(normalized)) {
    tone = 'bg-amber-50 text-amber-700 ring-amber-200'
  } else if (/holiday|weekend|off|wfh|remote/.test(normalized)) {
    tone = 'bg-sky-50 text-sky-700 ring-sky-200'
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {formatLabel(status || '—')}
    </span>
  )
}

interface AttendanceGroupItem {
  label: string
  count: number
  percent: number
  tone: 'emerald' | 'amber' | 'rose' | 'sky' | 'slate'
}

function parseGroupedAttendance(
  data: unknown,
): { groups: AttendanceGroupItem[]; total: number } | null {
  if (!Array.isArray(data) || data.length === 0) return null

  const isGroup = data.every((item) => {
    if (!isRecord(item)) return false
    const hasGroupKey =
      'group_value' in item || 'status' in item || 'attendance_status' in item
    const hasCountKey =
      'record_count' in item || 'count' in item || 'total' in item
    return hasGroupKey && hasCountKey
  })

  if (!isGroup) return null

  let total = 0
  const rawGroups: { label: string; count: number }[] = []

  for (const item of data as DataRecord[]) {
    const labelRaw = String(
      item.group_value ?? item.status ?? item.attendance_status ?? 'Unknown',
    )
    const countRaw = Number(item.record_count ?? item.count ?? item.total ?? 0)
    const count = isNaN(countRaw) ? 0 : countRaw
    total += count
    rawGroups.push({
      label: formatLabel(labelRaw),
      count,
    })
  }

  if (total === 0 && rawGroups.length === 0) return null

  const groups: AttendanceGroupItem[] = rawGroups.map((g) => {
    const lower = g.label.toLowerCase()
    let tone: AttendanceGroupItem['tone'] = 'slate'
    if (/present|completed|clocked in|on time/.test(lower)) tone = 'emerald'
    else if (/late|partial|half/.test(lower)) tone = 'amber'
    else if (/absent|missed|rejected/.test(lower)) tone = 'rose'
    else if (/leave|wfh|remote|holiday/.test(lower)) tone = 'sky'

    const percent = total > 0 ? Math.round((g.count / total) * 100) : 0
    return {
      label: g.label,
      count: g.count,
      percent,
      tone,
    }
  })

  return { groups, total }
}

function parseAggregateResult(
  data: unknown,
): { title: string; main: string; subtitle?: string } | null {
  if (!isRecord(data)) return null

  // Worked minutes sum: {"field": "worked_minutes", "total": 9600}
  if ('field' in data && 'total' in data && typeof data.total === 'number') {
    const fieldName = formatLabel(String(data.field))
    if (String(data.field).toLowerCase().includes('minute')) {
      const duration = formatDuration(data.total)
      return {
        title: `Total ${fieldName}`,
        main: duration,
        subtitle: `${data.total.toLocaleString()} total minutes recorded`,
      }
    }
    return {
      title: `Total ${fieldName}`,
      main: data.total.toLocaleString(),
      subtitle: `Sum across matching records`,
    }
  }

  // Count response: {"count": 14}
  if (
    'count' in data &&
    typeof data.count === 'number' &&
    Object.keys(data).length <= 2
  ) {
    return {
      title: 'Total Matching Records',
      main: data.count.toLocaleString(),
      subtitle: 'record(s) found in database',
    }
  }

  return null
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

  // 1. Grouped Attendance Breakdown (e.g., 14 present, 2 late, 16 total)
  const groupedAttendance = parseGroupedAttendance(data)
  if (groupedAttendance) {
    const { groups, total } = groupedAttendance

    const toneStyles = {
      emerald: {
        border: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
        badge: 'bg-emerald-100 text-emerald-800',
        bar: 'bg-emerald-500',
      },
      amber: {
        border: 'border-amber-200 bg-amber-50/70 text-amber-900',
        badge: 'bg-amber-100 text-amber-800',
        bar: 'bg-amber-500',
      },
      rose: {
        border: 'border-rose-200 bg-rose-50/70 text-rose-900',
        badge: 'bg-rose-100 text-rose-800',
        bar: 'bg-rose-500',
      },
      sky: {
        border: 'border-sky-200 bg-sky-50/70 text-sky-900',
        badge: 'bg-sky-100 text-sky-800',
        bar: 'bg-sky-500',
      },
      slate: {
        border: 'border-slate-200 bg-slate-50 text-slate-800',
        badge: 'bg-slate-200 text-slate-700',
        bar: 'bg-slate-400',
      },
    }

    return (
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <PieChart size={15} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Attendance Summary
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
            <CheckCircle2 size={13} />
            {total} Total Records
          </span>
        </div>

        {/* Group summary cards */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {groups.map((group) => {
            const styles = toneStyles[group.tone]
            return (
              <div
                key={group.label}
                className={`rounded-xl border p-3 ${styles.border}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium opacity-80">
                    {group.label}
                  </p>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${styles.badge}`}
                  >
                    {group.percent}%
                  </span>
                </div>
                <p className="mt-1.5 text-2xl font-bold tracking-tight">
                  {group.count}
                </p>
              </div>
            )
          })}

          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-blue-900">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-blue-700">Total</p>
              <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                100%
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-blue-950">
              {total}
            </p>
          </div>
        </div>

        {/* Visual progress distribution bar */}
        {total > 0 && (
          <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
            {groups.map((group) => (
              <div
                key={group.label}
                style={{ width: `${group.percent}%` }}
                title={`${group.label}: ${group.count} (${group.percent}%)`}
                className={toneStyles[group.tone].bar}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // 2. Aggregate Results (e.g. worked minutes sum, total counts)
  const aggregate = parseAggregateResult(data)
  if (aggregate) {
    return (
      <div className="mt-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
            <Clock3 size={17} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-600">
              {aggregate.title}
            </p>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">
              {aggregate.main}
            </p>
          </div>
        </div>
        {aggregate.subtitle && (
          <p className="mt-2 text-xs text-slate-500">{aggregate.subtitle}</p>
        )}
      </div>
    )
  }

  if (showTable === false || requestedMetric) return null

  // 3. Table Records (Attendance, Leave, WFH, Timesheet, Holidays)
  const records = findRecordArray(data)

  if (records && records.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3.5 text-slate-500">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
          <CalendarDays size={18} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-700">
            No records found
          </p>
          <p className="text-[11px] text-slate-400">
            No records matched this query or date range.
          </p>
        </div>
      </div>
    )
  }

  if (records && records.length > 0) {
    const HIDDEN_COLUMNS = new Set([
      'id',
      'employee_id',
      'attendance_id',
      'leave_request_id',
      'wfh_request_id',
      'timesheet_id',
      'created_at',
      'updated_at',
    ])

    const allKeys = Array.from(new Set(records.flatMap((r) => Object.keys(r))))
    const columns = allKeys.filter((k) => !HIDDEN_COLUMNS.has(k.toLowerCase()))

    const priorityKeys = [
      'work_date',
      'attendance_date',
      'date',
      'holiday_date',
      'period_start',
      'period_end',
      'start_date',
      'end_date',
      'leave_type',
      'holiday_name',
      'name',
      'status',
      'submission_status',
      'check_in_at',
      'check_in',
      'check_out_at',
      'check_out',
      'worked_minutes',
      'total_hours',
      'reason',
      'applied_at',
      'requested_at',
      'region',
    ]

    columns.sort((a, b) => {
      const idxA = priorityKeys.indexOf(a.toLowerCase())
      const idxB = priorityKeys.indexOf(b.toLowerCase())
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
    })

    return (
      <div className="mt-3 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <p className="text-xs font-semibold text-slate-800">
            {formatLabel(intent || 'records')}
          </p>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            {records.length} {records.length === 1 ? 'record' : 'records'}
          </span>
        </div>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-b border-slate-200 px-3.5 py-2 font-semibold text-slate-600"
                  >
                    {formatLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, rowIndex) => (
                <tr
                  key={String(
                    record.id ??
                      record.attendance_id ??
                      record.leave_request_id ??
                      rowIndex,
                  )}
                  className="transition hover:bg-slate-50/60 odd:bg-white even:bg-slate-50/40"
                >
                  {columns.map((column) => {
                    const value = record[column]
                    const isStatus =
                      /status|state|approval/i.test(column) &&
                      typeof value === 'string'
                    return (
                      <td
                        key={column}
                        className="whitespace-nowrap border-b border-slate-100 px-3.5 py-2.5 text-slate-700 last:border-b-0"
                      >
                        {isStatus ? (
                          <StatusPill value={value} />
                        ) : (
                          formatValue(column, value)
                        )}
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

  // 4. Key-value stats cards
  if (isRecord(data)) {
    const entries = Object.entries(data).filter(
      ([key, value]) =>
        ![
          'answer',
          'message',
          'success',
          'intent',
          'confidence',
          'raw_data',
        ].includes(key.toLowerCase()) &&
        (typeof value !== 'object' || value === null),
    )

    if (entries.length > 0) {
      return (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {formatLabel(key)}
              </p>
              <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                {formatValue(key, value)}
              </p>
            </div>
          ))}
        </div>
      )
    }
  }

  return null
}

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
      // Use logged in employee's actual employee_code
      const result = await sendChatMessage(text, employee.employee_code)

      const reply: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content:
          result.answer ??
          result.message ??
          (result.success
            ? 'Your request was processed.'
            : 'I could not process that request.'),
        data: result.data ?? result.raw_data,
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

      {/* Sidebar */}
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

        {/* User profile footer */}
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
                {employee.employee_code} · {employee.email}
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

      {/* Main chat section */}
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
                Logged in as {employee.full_name} ({employee.employee_code})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">
              Online
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
                    Ask questions about your attendance records, leave requests,
                    working hours, timesheets, or holidays.
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
                        description: 'See your attendance breakdown',
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
                        description: 'Review your timesheet records',
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

          {/* Chat input form */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-4 pt-3 sm:px-8">
            <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
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
                  placeholder="Ask Tickora about your attendance, leaves, or timesheets..."
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
  const [session, setSession] = useState<AuthSession | null>(() =>
    getAuthSession(),
  )
  const [noticeMessage, setNoticeMessage] = useState<string>('')

  useEffect(() => {
    function handleUnauthorized() {
      clearAuthSession()
      setSession(null)
      setNoticeMessage('Your session has expired. Please sign in again.')
    }

    window.addEventListener('tickora:unauthorized', handleUnauthorized)
    return () =>
      window.removeEventListener('tickora:unauthorized', handleUnauthorized)
  }, [])

  function handleLogout() {
    clearAuthSession()
    setSession(null)
    setNoticeMessage('')
  }

  function handleLogin(newSession: AuthSession) {
    setSession(newSession)
    setNoticeMessage('')
  }

  if (!session) {
    return <LoginPage onLogin={handleLogin} noticeMessage={noticeMessage} />
  }

  return (
    <ChatApp
      employee={session.employee}
      onLogout={handleLogout}
    />
  )
}
