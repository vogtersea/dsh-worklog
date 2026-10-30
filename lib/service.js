/**
 * Business rules for dsh-worklog, ported from the FastAPI service so the
 * plugin answers the same questions the web app used to:
 *
 * - a task belongs to the week of its due date unless a week is chosen
 *   explicitly (explicit week > due date's week > today's week)
 * - completing a task archives it; any other status brings it back
 * - "soon" means due within N days, N stored as a setting
 * - routines generate one task per period, keyed so a period never doubles
 *
 * @module dsh-worklog/service
 */

/** Priority labels, index-aligned with the priority integer. */
export const PRIORITIES = [
  { value: 1, label: '低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
]

/** Status labels. */
export const STATUSES = [
  { value: 'todo', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
]

/**
 * Today as YYYY-MM-DD in local time.
 * @returns the date string.
 */
export function today() {
  const now = new Date()
  return isoDate(now)
}

/**
 * Format a Date as YYYY-MM-DD using local parts, not UTC.
 * @param date - the date.
 * @returns the date string.
 */
export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

/**
 * Parse YYYY-MM-DD strictly; anything else is "no date".
 * @param value - candidate string.
 * @returns a local Date or null.
 */
export function parseDate(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Monday of the week a date falls in.
 * @param value - Date or YYYY-MM-DD.
 * @returns YYYY-MM-DD of that Monday.
 */
export function weekStart(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : parseDate(value)
  const base = date ?? new Date()
  const day = (base.getDay() + 6) % 7
  base.setDate(base.getDate() - day)
  return isoDate(base)
}

/**
 * Add days to a YYYY-MM-DD string.
 * @param value - starting date.
 * @param days - signed day count.
 * @returns the shifted date string.
 */
export function addDays(value, days) {
  const date = parseDate(value) ?? new Date()
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

/**
 * Human label for a Monday, e.g. "10-19 周一".
 * @param value - Monday string.
 * @returns the label.
 */
export function weekLabel(value) {
  const date = parseDate(value)
  if (date === null) return value ?? ''
  const pad = (n) => String(n).padStart(2, '0')
  return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' 周一'
}

/** Timestamp for created_at / updated_at. */
function nowIso() {
  return new Date().toISOString()
}

/**
 * Coerce a priority to 1..3.
 * @param value - raw value.
 * @returns a valid priority.
 */
function cleanPriority(value) {
  const n = Number.parseInt(String(value ?? ''), 10)
  return n === 1 || n === 3 ? n : 2
}

/**
 * Coerce a status to a known one.
 * @param value - raw value.
 * @returns a valid status.
 */
function cleanStatus(value) {
  const text = String(value ?? '').trim()
  return STATUSES.some((s) => s.value === text) ? text : 'todo'
}

/**
 * Resolve the week a task belongs to.
 * @param explicit - week the person picked, if any.
 * @param dueDate - the task's due date, if any.
 * @returns YYYY-MM-DD of the Monday.
 */
export function resolveWeek(explicit, dueDate) {
  if (parseDate(explicit) !== null) return weekStart(explicit)
  if (parseDate(dueDate) !== null) return weekStart(dueDate)
  return weekStart(today())
}

/**
 * Status side effects: done archives, everything else revives.
 * @param status - target status.
 * @returns the columns to write.
 */
export function statusEffects(status) {
  return status === 'done'
    ? { completed_at: nowIso(), archived: 1 }
    : { completed_at: null, archived: 0 }
}

/**
 * List tasks by any combination of filters.
 * @param db - open handle.
 * @param options - filters.
 * @returns matching task rows ordered by urgency.
 */
export function listTasks(db, options = {}) {
  const { week, status, archived = 0, q, projectId, excludeRoutines = false, routineId } = options
  const where = ['t.archived = ?']
  const params = [Number(archived) === 1 ? 1 : 0]
  if (week) {
    where.push('t.week_start = ?')
    params.push(weekStart(week))
  }
  if (status) {
    where.push('t.status = ?')
    params.push(cleanStatus(status))
  }
  if (projectId) {
    where.push('t.project_id = ?')
    params.push(Number(projectId))
  }
  if (excludeRoutines) where.push('t.routine_id IS NULL')
  else if (routineId) {
    where.push('t.routine_id = ?')
    params.push(Number(routineId))
  }
  if (typeof q === 'string' && q.trim() !== '') {
    where.push('(t.title LIKE ? OR t.detail LIKE ? OR t.tags LIKE ?)')
    const like = '%' + q.trim() + '%'
    params.push(like, like, like)
  }
  const sql = `SELECT t.*, p.name AS project_name FROM tasks t
               LEFT JOIN projects p ON p.id = t.project_id
               WHERE ${where.join(' AND ')}
               ORDER BY
                 CASE WHEN t.due_date IS NULL OR t.due_date = '' THEN 1 ELSE 0 END,
                 t.due_date ASC,
                 t.priority DESC,
                 t.id DESC`
  return db.prepare(sql).all(...params)
}

/**
 * Read one task.
 * @param db - open handle.
 * @param id - task id.
 * @returns the row or undefined.
 */
export function getTask(db, id) {
  return db.prepare('SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?').get(Number(id))
}

/**
 * Create a task.
 * @param db - open handle.
 * @param input - form values.
 * @returns the new task id.
 */
export function createTask(db, input) {
  const dueDate = parseDate(input.dueDate) === null ? null : input.dueDate
  const week = resolveWeek(input.week, dueDate)
  const stamp = nowIso()
  const result = db
    .prepare(`INSERT INTO tasks
      (project_id, title, detail, done_criteria, due_date, due_time, status, priority, week_start, tags, completed_at, archived, created_at, updated_at, routine_id, period_key)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      input.projectId ? Number(input.projectId) : null,
      String(input.title ?? '').trim(),
      String(input.detail ?? ''),
      String(input.doneCriteria ?? ''),
      dueDate,
      input.dueTime ? String(input.dueTime) : null,
      cleanStatus(input.status),
      cleanPriority(input.priority),
      week,
      String(input.tags ?? ''),
      null,
      0,
      stamp,
      stamp,
      input.routineId ? Number(input.routineId) : null,
      input.periodKey ? String(input.periodKey) : null
    )
  return Number(result.lastInsertRowid)
}

/**
 * Update a task.
 * @param db - open handle.
 * @param id - task id.
 * @param patch - changed fields.
 */
export function updateTask(db, id, patch) {
  const current = getTask(db, id)
  if (current === undefined) return false
  const sets = {}
  if (patch.title !== undefined) sets.title = String(patch.title).trim()
  if (patch.detail !== undefined) sets.detail = String(patch.detail)
  if (patch.doneCriteria !== undefined) sets.done_criteria = String(patch.doneCriteria)
  if (patch.dueDate !== undefined) sets.due_date = parseDate(patch.dueDate) === null ? null : patch.dueDate
  if (patch.dueTime !== undefined) sets.due_time = patch.dueTime ? String(patch.dueTime) : null
  if (patch.priority !== undefined) sets.priority = cleanPriority(patch.priority)
  if (patch.tags !== undefined) sets.tags = String(patch.tags)
  if (patch.projectId !== undefined) sets.project_id = patch.projectId ? Number(patch.projectId) : null
  if (patch.week !== undefined) sets.week_start = resolveWeek(patch.week, sets.due_date ?? current.due_date)
  if (patch.status !== undefined) Object.assign(sets, { status: cleanStatus(patch.status) }, statusEffects(cleanStatus(patch.status)))
  sets.updated_at = nowIso()
  const columns = Object.keys(sets)
  db.prepare(`UPDATE tasks SET ${columns.map((c) => c + ' = ?').join(', ')} WHERE id = ?`)
    .run(...columns.map((c) => sets[c]), Number(id))
  return true
}

/**
 * Set a task's status, applying the archive side effect.
 * @param db - open handle.
 * @param id - task id.
 * @param status - target status.
 */
export function setStatus(db, id, status) {
  const next = cleanStatus(status)
  const effects = statusEffects(next)
  db.prepare('UPDATE tasks SET status = ?, completed_at = ?, archived = ?, updated_at = ? WHERE id = ?')
    .run(next, effects.completed_at, effects.archived, nowIso(), Number(id))
}

/**
 * Delete a task and its progress notes.
 * @param db - open handle.
 * @param id - task id.
 */
export function deleteTask(db, id) {
  db.prepare('DELETE FROM progress_entries WHERE task_id = ?').run(Number(id))
  db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(id))
}

/**
 * Append a progress note.
 * @param db - open handle.
 * @param taskId - owning task.
 * @param content - the note.
 */
export function addProgress(db, taskId, content) {
  db.prepare('INSERT INTO progress_entries(task_id, content, link, created_at) VALUES (?,?,?,?)')
    .run(Number(taskId), String(content ?? ''), null, nowIso())
}

/**
 * Read a task's progress notes, newest last.
 * @param db - open handle.
 * @param taskId - owning task.
 * @returns the notes.
 */
export function listProgress(db, taskId) {
  return db.prepare('SELECT * FROM progress_entries WHERE task_id = ? ORDER BY id ASC').all(Number(taskId))
}

/**
 * Days considered "soon". Stored so the window is adjustable without a rebuild.
 * @param db - open handle.
 * @returns the day count.
 */
export function soonDays(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'soon_days'").get()
  const n = Number.parseInt(String(row?.value ?? '3'), 10)
  return Number.isFinite(n) && n >= 0 ? n : 3
}

/**
 * The dashboard's buckets, computed in one pass.
 * @param db - open handle.
 * @returns bucket lists and their counts.
 */
export function buckets(db) {
  const t = today()
  const monday = weekStart(t)
  const horizon = addDays(t, soonDays(db))
  const active = listTasks(db, { archived: 0, excludeRoutines: true })
  const out = { overdue: [], today: [], soon: [], week: [], noDue: [] }
  for (const task of active) {
    const due = parseDate(task.due_date) === null ? null : task.due_date
    if (due === null) out.noDue.push(task)
    else if (due < t) out.overdue.push(task)
    else if (due === t) out.today.push(task)
    else if (due <= horizon) out.soon.push(task)
    else if (weekStart(due) === monday) out.week.push(task)
  }
  out.counts = {
    overdue: out.overdue.length,
    today: out.today.length,
    soon: out.soon.length,
    week: out.week.length,
    noDue: out.noDue.length,
  }
  out.activeTotal = active.length
  return out
}

/**
 * The seven days of a week, each with its tasks.
 * @param db - open handle.
 * @param week - any date inside the target week.
 * @returns day cells.
 */
export function weekCells(db, week) {
  const monday = weekStart(week)
  const tasks = listTasks(db, { week: monday, archived: 0, excludeRoutines: true })
  const days = []
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i)
    days.push({
      date,
      tasks: tasks.filter((task) => task.due_date === date),
      undated: i === 6 ? tasks.filter((task) => !task.due_date) : [],
    })
  }
  return { monday, days }
}

/**
 * Projects, newest activity first.
 * @param db - open handle.
 * @param includeArchived - whether archived projects are listed.
 * @returns the rows.
 */
export function listProjects(db, includeArchived = false) {
  return db
    .prepare('SELECT * FROM projects WHERE (? = 1 OR archived = 0) ORDER BY archived ASC, name ASC')
    .all(includeArchived ? 1 : 0)
}

/**
 * Create a project.
 * @param db - open handle.
 * @param name - project name.
 * @param color - accent colour.
 * @returns the new id, or 0 when the name already exists.
 */
export function createProject(db, name, color = '#6366f1') {
  const stamp = nowIso()
  try {
    const result = db.prepare('INSERT INTO projects(name, description, color, archived, created_at, updated_at) VALUES (?,?,?,0,?,?)')
      .run(String(name).trim(), '', String(color), stamp, stamp)
    return Number(result.lastInsertRowid)
  } catch {
    return 0
  }
}

/**
 * Routines, active first.
 * @param db - open handle.
 * @returns the rows.
 */
export function listRoutines(db) {
  return db.prepare('SELECT * FROM routines ORDER BY active DESC, id ASC').all()
}

/**
 * Create a routine template.
 * @param db - open handle.
 * @param input - template fields.
 * @returns the new id.
 */
export function createRoutine(db, input) {
  const stamp = nowIso()
  const result = db
    .prepare(`INSERT INTO routines (title, detail, done_criteria, freq, due_rule, due_day, due_time, priority, project_id, tags, active, start_date, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)`)
    .run(
      String(input.title ?? '').trim(),
      String(input.detail ?? ''),
      String(input.doneCriteria ?? ''),
      String(input.freq ?? 'weekly'),
      String(input.dueRule ?? 'period_end'),
      input.dueDay === undefined || input.dueDay === '' ? null : Number(input.dueDay),
      input.dueTime ? String(input.dueTime) : null,
      cleanPriority(input.priority),
      input.projectId ? Number(input.projectId) : null,
      String(input.tags ?? ''),
      input.startDate ?? today(),
      stamp,
      stamp
    )
  return Number(result.lastInsertRowid)
}

/**
 * Materialise this period's instances of every active routine.
 *
 * The key is (routine, period) and it is enforced by the period_key column, so
 * calling this on every page render is safe: a period that already exists is
 * left alone instead of duplicated.
 *
 * @param db - open handle.
 * @returns how many tasks were created.
 */
export function ensurePeriods(db) {
  const monday = weekStart(today())
  let created = 0
  for (const routine of listRoutines(db)) {
    if (Number(routine.active) !== 1) continue
    const periodKey = routine.freq === 'monthly' ? monday.slice(0, 7) : monday
    const existing = db.prepare('SELECT id FROM tasks WHERE routine_id = ? AND period_key = ?').get(routine.id, periodKey)
    if (existing !== undefined) continue
    const dueDate = routine.due_rule === 'period_end' ? addDays(monday, 6) : monday
    createTask(db, {
      title: routine.title,
      detail: routine.detail,
      doneCriteria: routine.done_criteria,
      dueDate,
      dueTime: routine.due_time,
      priority: routine.priority,
      tags: routine.tags,
      projectId: routine.project_id,
      week: monday,
      routineId: routine.id,
      periodKey,
    })
    created += 1
  }
  return created
}
