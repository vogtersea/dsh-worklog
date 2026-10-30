/**
 * Server-rendered views for dsh-worklog.
 *
 * The plugin serves its own pages from its own route, so the panel needs only a
 * same-origin iframe — nothing here reaches outside the plugin. Keeping the
 * rendering on this side (rather than a client-side React tree) means the whole
 * app is a handful of files with no build step.
 *
 * @module dsh-worklog/views
 */

/** Route prefix every link and form in these views points at. */
export const BASE = '/worklog-plugin/app'

/**
 * Escape text for HTML.
 * @param value - raw value.
 * @returns the escaped string.
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CSS = `
:root {
  --bg: #f6f7f9; --surface: #ffffff; --surface-2: #f1f3f6; --text: #1a1d23;
  --muted: #6b7280; --border: #e5e7eb; --brand: #3b5bdb; --brand-soft: #eef1ff;
  --danger: #dc2626; --ok: #16a34a; --warn: #d97706;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a; --surface: #1c1f25; --surface-2: #22262e; --text: #e8eaed;
    --muted: #9aa1ad; --border: #2e3239; --brand: #7c93ff; --brand-soft: #222a45;
    --danger: #f87171; --ok: #4ade80; --warn: #fbbf24;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text); font-size: 14px;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  line-height: 1.6;
}
a { color: var(--brand); text-decoration: none; }
a:hover { text-decoration: underline; }
.top { display: flex; align-items: center; gap: 14px; padding: 10px 18px; background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; }
.nav { display: flex; gap: 4px; flex-wrap: wrap; }
.nav a { padding: 5px 11px; border-radius: 7px; color: var(--muted); font-size: 13px; }
.nav a:hover { background: var(--surface-2); text-decoration: none; }
.nav a.on { background: var(--brand-soft); color: var(--brand); font-weight: 600; }
.spacer { flex: 1 1 auto; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 18px; }
h1 { font-size: 20px; margin: 0 0 4px; }
.sub { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 14px; overflow: hidden; }
.card > header { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 14px; }
.card > header .count { margin-left: auto; font-size: 12px; color: var(--muted); background: var(--surface-2); border-radius: 99px; padding: 1px 9px; }
.card .body { padding: 12px 16px; }
.empty { color: var(--muted); font-size: 13px; text-align: center; padding: 14px 0; }
.task { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px dashed var(--border); }
.task:last-child { border-bottom: 0; }
.task .main { flex: 1 1 auto; min-width: 0; }
.task .title { font-weight: 500; word-break: break-word; }
.task .meta { color: var(--muted); font-size: 12px; margin-top: 2px; display: flex; gap: 8px; flex-wrap: wrap; }
.pill { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 11px; border: 1px solid var(--border); color: var(--muted); }
.pill.high { color: var(--danger); border-color: currentColor; }
.pill.mid { color: var(--warn); border-color: currentColor; }
.pill.over { color: var(--danger); border-color: currentColor; font-weight: 600; }
.pill.today { color: var(--warn); border-color: currentColor; font-weight: 600; }
.actions { display: flex; gap: 6px; flex: 0 0 auto; }
.btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn:hover { background: var(--surface-2); text-decoration: none; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn.primary:hover { filter: brightness(1.06); }
.btn.danger { color: var(--danger); border-color: currentColor; }
.btn.sm { padding: 3px 9px; font-size: 11px; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 860px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
.day { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
.day > header { padding: 7px 12px; background: var(--surface-2); font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; }
.day.today > header { background: var(--brand-soft); color: var(--brand); }
.day .body { padding: 8px 12px; min-height: 40px; }
label { display: block; font-size: 12px; color: var(--muted); margin: 10px 0 4px; }
input[type=text], input[type=date], input[type=time], textarea, select {
  width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font-family: inherit; font-size: 13px;
}
textarea { min-height: 78px; resize: vertical; }
.row { display: flex; gap: 10px; }
.row > * { flex: 1 1 0; min-width: 0; }
.form-actions { display: flex; gap: 8px; margin-top: 16px; align-items: center; }
.note { border-left: 3px solid var(--border); padding: 2px 0 2px 10px; margin: 7px 0; font-size: 13px; }
.note .when { color: var(--muted); font-size: 11px; }
`

/**
 * Wrap page content in the shared shell.
 * @param options - page inputs.
 * @returns a complete HTML document.
 */
export function layout({ title, body, active = '', subtitle = '' }) {
  const navItem = (href, label, key) =>
    '<a href="' + BASE + href + '"' + (active === key ? ' class="on"' : '') + '>' + label + '</a>'
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + ' · 工作志</title>' +
    '<link rel="stylesheet" href="' + BASE + '/style.css">' +
    '</head><body>' +
    '<div class="top"><div class="brand">' + logo() + '工作志</div><nav class="nav">' +
    navItem('', '仪表盘', 'dashboard') +
    navItem('/week', '周视图', 'week') +
    navItem('/routines', '例行', 'routines') +
    navItem('/projects', '项目', 'projects') +
    navItem('/archive', '归档', 'archive') +
    '</nav><div class="spacer"></div>' +
    '<a class="btn" href="' + BASE + '" title="刷新">刷新</a>' +
    '<a class="btn primary" href="' + BASE + '/new">+ 新建工作</a></div>' +
    '<div class="wrap"><h1>' + esc(title) + '</h1>' +
    (subtitle === '' ? '' : '<div class="sub">' + subtitle + '</div>') +
    body + '</div></body></html>'
}

/** Inline brand mark, so the page needs no image request. */
function logo() {
  return '<svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#5C7CFF"/><stop offset="1" stop-color="#2F49B3"/></linearGradient></defs>' +
    '<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#g)"/>' +
    '<rect x="14" y="9" width="36" height="46" rx="6" fill="#fff"/>' +
    '<g fill="#3A5ADC"><rect x="21" y="18" width="22" height="4" rx="2"/>' +
    '<rect x="21" y="27" width="18" height="4" rx="2"/><rect x="21" y="36" width="13" height="4" rx="2"/></g>' +
    '<path d="M33 45 L38.5 50.5 L47 38" fill="none" stroke="#34C76E" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

/** Stylesheet body, served once and cached by the browser. */
export function stylesheet() {
  return CSS
}

/**
 * Render one task row.
 * @param task - the task row.
 * @param todayText - today, for the overdue badge.
 * @returns the row HTML.
 */
export function taskRow(task, todayText) {
  const due = task.due_date
  const isOver = typeof due === 'string' && due !== '' && due < todayText && task.status !== 'done'
  const isToday = due === todayText
  const prioClass = Number(task.priority) === 3 ? 'pill high' : Number(task.priority) === 1 ? 'pill' : 'pill mid'
  const prioLabel = Number(task.priority) === 3 ? '高' : Number(task.priority) === 1 ? '低' : '中'
  const meta = []
  if (isOver) meta.push('<span class="pill over">逾期</span>')
  else if (isToday) meta.push('<span class="pill today">今天</span>')
  if (due) meta.push('<span>截止 ' + esc(due) + '</span>')
  meta.push('<span class="' + prioClass + '">优先' + prioLabel + '</span>')
  if (task.project_name) meta.push('<span>' + esc(task.project_name) + '</span>')
  if (task.routine_id) meta.push('<span class="pill">例行</span>')
  return '<div class="task"><div class="main">' +
    '<div class="title"><a href="' + BASE + '/task?id=' + task.id + '">' + esc(task.title) + '</a></div>' +
    '<div class="meta">' + meta.join('') + '</div></div>' +
    '<div class="actions">' +
    (task.status === 'done'
      ? '<form method="post" action="' + BASE + '/status"><input type="hidden" name="id" value="' + task.id + '"><input type="hidden" name="status" value="todo"><button class="btn sm">恢复</button></form>'
      : '<form method="post" action="' + BASE + '/status"><input type="hidden" name="id" value="' + task.id + '"><input type="hidden" name="status" value="done"><button class="btn sm">完成</button></form>') +
    '</div></div>'
}

/**
 * Render a card holding a task list.
 * @param title - card heading.
 * @param tasks - rows.
 * @param todayText - today.
 * @param hint - empty-state text.
 * @returns the card HTML.
 */
export function taskCard(title, tasks, todayText, hint = '暂无') {
  return '<section class="card"><header>' + esc(title) +
    '<span class="count">' + tasks.length + '</span></header><div class="body">' +
    (tasks.length === 0 ? '<div class="empty">' + esc(hint) + '</div>' : tasks.map((t) => taskRow(t, todayText)).join('')) +
    '</div></section>'
}

/**
 * Dashboard page.
 * @param model - prepared view model.
 * @returns the HTML document.
 */
export function dashboardPage(model) {
  const { buckets, todayText, weekStartText, weekLabelText, activeTotal } = model
  const body =
    '<div class="grid3">' +
    taskCard('逾期', buckets.overdue, todayText, '没有逾期的工作') +
    taskCard('今日到期', buckets.today, todayText, '今天没有到期的工作') +
    taskCard('临期', buckets.soon, todayText, '近期没有到期的工作') +
    '</div><div class="grid2">' +
    taskCard('本周', buckets.week, todayText, '本周没有安排') +
    taskCard('无截止日期', buckets.noDue, todayText, '没有未登记日期的工作') +
    '</div>'
  return layout({
    title: '仪表盘',
    active: 'dashboard',
    subtitle: esc(todayText) + ' · 本周自 ' + esc(weekStartText) + '（' + esc(weekLabelText) + '） · 活跃工作 ' + activeTotal + ' 项' +
      ' · <a href="' + BASE + '/week">周视图</a> · <a href="' + BASE + '/archive">归档</a>',
    body,
  })
}

/**
 * Week view page.
 * @param model - prepared view model.
 * @returns the HTML document.
 */
export function weekPage(model) {
  const { monday, days, todayText } = model
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const cells = days
    .map((day, index) => {
      const on = day.date === todayText
      return '<div class="day' + (on ? ' today' : '') + '"><header><span>' + names[index] + '</span><span>' +
        esc(day.date) + (on ? ' · 今天' : '') + '</span></header><div class="body">' +
        (day.tasks.length === 0 ? '<div class="empty">无</div>' : day.tasks.map((t) => taskRow(t, todayText)).join('')) +
        '</div></div>'
    })
    .join('')
  const prev = addDaysText(monday, -7)
  const next = addDaysText(monday, 7)
  const nav = '<div style="display:flex;gap:8px;margin-bottom:14px">' +
    '<a class="btn" href="' + BASE + '/week?w=' + prev + '">← 上一周</a>' +
    '<a class="btn" href="' + BASE + '/week">本周</a>' +
    '<a class="btn" href="' + BASE + '/week?w=' + next + '">下一周 →</a></div>'
  return layout({
    title: '周视图 · ' + (monday === weekStartOf(todayText) ? '本周' : weekLabelText2(monday)),
    active: 'week',
    subtitle: esc(monday) + ' 起 · 活跃工作 ' + days.reduce((sum, d) => sum + d.tasks.length, 0) + ' 项',
    body: nav + '<div class="grid2">' + cells + '</div>',
  })
}

/** Small date helpers kept local so views do not import the service layer. */
function addDaysText(value, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const d = m === null ? new Date() : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function weekStartOf(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
  const d = m === null ? new Date() : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
function weekLabelText2(monday) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(monday))
  return m === null ? monday : m[2] + '-' + m[3] + ' 周'
}

/**
 * Generic list page (archive, routines, projects).
 * @param options - page inputs.
 * @returns the HTML document.
 */
export function listPage({ title, active, subtitle, cards }) {
  return layout({ title, active, subtitle, body: cards.join('') })
}

/**
 * Task detail page.
 * @param model - task, progress notes, today.
 * @returns the HTML document.
 */
export function taskPage(model) {
  const { task, notes, todayText } = model
  const notesHtml = notes.length === 0
    ? '<div class="empty">还没有进展记录</div>'
    : notes.map((n) => '<div class="note"><div>' + esc(n.content) + '</div><div class="when">' + esc(n.created_at.slice(0, 16).replace('T', ' ')) + '</div></div>').join('')
  const body =
    '<section class="card"><header>工作信息</header><div class="body">' +
    taskRow(task, todayText) +
    (task.detail ? '<label>详情</label><div>' + esc(task.detail) + '</div>' : '') +
    (task.done_criteria ? '<label>完成条件</label><div>' + esc(task.done_criteria) + '</div>' : '') +
    '<div class="form-actions">' +
    '<a class="btn" href="' + BASE + '/edit?id=' + task.id + '">编辑</a>' +
    '<form method="post" action="' + BASE + '/delete" onsubmit="return confirm(\'确定删除这条工作？\')">' +
    '<input type="hidden" name="id" value="' + task.id + '"><button class="btn danger">删除</button></form>' +
    '</div></div></section>' +
    '<section class="card"><header>进展记录</header><div class="body">' + notesHtml +
    '<form method="post" action="' + BASE + '/progress"><input type="hidden" name="id" value="' + task.id + '">' +
    '<label>新增一条</label><textarea name="content" placeholder="今天推进了什么…" required></textarea>' +
    '<div class="form-actions"><button class="btn primary">记录</button></div></form>' +
    '</div></section>'
  return layout({ title: task.title, active: '', subtitle: '截止 ' + esc(task.due_date || '未设置') + ' · 状态 ' + esc(task.status), body })
}

/**
 * Create / edit form.
 * @param model - task (null for create) and projects.
 * @returns the HTML document.
 */
export function formPage(model) {
  const { task, projects, todayText } = model
  const editing = task !== null && task !== undefined
  const options = ['<option value="">（无）</option>']
    .concat(projects.map((p) => '<option value="' + p.id + '"' + (editing && task.project_id === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>'))
    .join('')
  const prio = (v, label) => '<option value="' + v + '"' + (editing && Number(task.priority) === v ? ' selected' : '') + '>' + label + '</option>'
  const body =
    '<form method="post" action="' + BASE + '/save"><section class="card"><div class="body">' +
    (editing ? '<input type="hidden" name="id" value="' + task.id + '">' : '') +
    '<label>标题</label><input type="text" name="title" required value="' + esc(editing ? task.title : '') + '" placeholder="例如：整理周会纪要">' +
    '<label>详情</label><textarea name="detail" placeholder="要做什么、怎么做">' + esc(editing ? task.detail : '') + '</textarea>' +
    '<label>完成条件</label><textarea name="doneCriteria" placeholder="什么算做完">' + esc(editing ? task.done_criteria : '') + '</textarea>' +
    '<div class="row"><div><label>截止日期</label><input type="date" name="dueDate" value="' + esc(editing ? task.due_date || '' : '') + '"></div>' +
    '<div><label>截止时间</label><input type="time" name="dueTime" value="' + esc(editing ? task.due_time || '' : '') + '"></div></div>' +
    '<div class="row"><div><label>优先级</label><select name="priority">' + prio(3, '高') + prio(2, '中') + prio(1, '低') + '</select></div>' +
    '<div><label>状态</label><select name="status">' +
    '<option value="todo"' + (editing && task.status === 'todo' ? ' selected' : '') + '>待办</option>' +
    '<option value="doing"' + (editing && task.status === 'doing' ? ' selected' : '') + '>进行中</option>' +
    '<option value="done"' + (editing && task.status === 'done' ? ' selected' : '') + '>已完成</option>' +
    '</select></div></div>' +
    '<div class="row"><div><label>项目</label><select name="projectId">' + options + '</select></div>' +
    '<div><label>标签</label><input type="text" name="tags" value="' + esc(editing ? task.tags : '') + '" placeholder="逗号分隔"></div></div>' +
    '<div class="form-actions"><button class="btn primary" type="submit">' + (editing ? '保存' : '创建') + '</button>' +
    '<a class="btn" href="' + BASE + (editing ? '/task?id=' + task.id : '') + '">取消</a></div>' +
    '</div></section></form>'
  return layout({ title: editing ? '编辑工作' : '新建工作', active: '', subtitle: esc(todayText), body })
}

/**
 * A short message page, used after destructive actions.
 * @param title - heading.
 * @param message - explanation.
 * @returns the HTML document.
 */
export function messagePage(title, message) {
  return layout({ title, active: '', body: '<section class="card"><div class="body">' + esc(message) + '</div></section>' })
}
