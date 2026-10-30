/**
 * Host half of dsh-worklog: the whole application, carried by the plugin.
 *
 * Everything lives here - storage (node:sqlite), the business rules, the
 * server-rendered pages, and the agent tools. Nothing reaches a second process
 * or a second service, which is what lets a person install this plugin and use
 * it immediately.
 *
 * @module dsh-worklog
 */
import { parse as parseQuery } from 'node:querystring'
import { openDatabase } from './store.js'
import * as svc from './service.js'
import {
  BASE, esc, stylesheet, taskCard,
  dashboardPage, weekPage, listPage, taskPage, formPage, messagePage,
} from './views.js'

/** Cordis services this half needs. */
export const inject = ['webServer']

/** Plugin id, shared with the browser half. */
export const PLUGIN_ID = 'worklog-panel'

/** Route prefix owned by this plugin. */
export const ROUTE_PREFIX = '/worklog-plugin'

/** Lazily-opened database handle, shared by every route. */
let db = null

/** The database, opened on first use. */
function database() {
  if (db === null) db = openDatabase()
  return db
}

/** Read a request body as form fields. */
function readForm(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1000000) req.destroy()
    })
    req.on('end', () => {
      try { resolve(parseQuery(body)) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

/** Send an HTML page. */
function sendHtml(res, html, status = 200) {
  res.statusCode = status
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(html)
}

/** Redirect back into the plugin's own pages. */
function redirect(res, to) {
  res.statusCode = 303
  res.setHeader('location', BASE + to)
  res.end()
}

/** Today's date string. */
function todayText() {
  return svc.today()
}

/** Query string of a request, as an object. */
function queryOf(req) {
  return parseQuery(String(req.url ?? '').split('?')[1] ?? '')
}

/** Where a status change should return to. */
function backFrom(query) {
  const from = typeof query.from === 'string' ? query.from : ''
  return from === 'week' ? '/week' : from === 'archive' ? '/archive' : ''
}

/** Build every route this plugin answers. */
function routes() {
  const P = BASE.slice(ROUTE_PREFIX.length)
  const page = (render) => async (req, res) => {
    try {
      const html = await render(req, res)
      if (html !== null && html !== undefined) sendHtml(res, html)
    } catch (error) {
      sendHtml(res, messagePage('出错了', String(error && error.message ? error.message : error)), 500)
    }
  }

  return [
    [ROUTE_PREFIX + P + '/style.css', async (req, res) => {
      res.statusCode = 200
      res.setHeader('content-type', 'text/css; charset=utf-8')
      res.setHeader('cache-control', 'public, max-age=3600')
      res.end(stylesheet())
    }],

    [ROUTE_PREFIX + P + '/', page(async () => {
      const store = database()
      svc.ensurePeriods(store)
      const b = svc.buckets(store)
      return dashboardPage({
        buckets: b,
        todayText: todayText(),
        weekStartText: svc.weekStart(todayText()),
        weekLabelText: svc.weekLabel(svc.weekStart(todayText())),
        activeTotal: b.activeTotal,
      })
    })],

    [ROUTE_PREFIX + P, page(async () => {
      const store = database()
      svc.ensurePeriods(store)
      const b = svc.buckets(store)
      return dashboardPage({
        buckets: b,
        todayText: todayText(),
        weekStartText: svc.weekStart(todayText()),
        weekLabelText: svc.weekLabel(svc.weekStart(todayText())),
        activeTotal: b.activeTotal,
      })
    })],

    [ROUTE_PREFIX + P + '/week', page(async (req) => {
      const q = queryOf(req)
      const week = typeof q.w === 'string' && q.w !== '' ? q.w : todayText()
      const cells = svc.weekCells(database(), week)
      return weekPage({ monday: cells.monday, days: cells.days, todayText: todayText() })
    })],

    [ROUTE_PREFIX + P + '/archive', page(async () => {
      const store = database()
      const done = svc.listTasks(store, { archived: 1 })
      return listPage({
        title: '归档', active: 'archive',
        subtitle: '已完成 ' + done.length + ' 项',
        cards: [taskCard('已完成', done, todayText(), '还没有完成的工作')],
      })
    })],

    [ROUTE_PREFIX + P + '/routines', page(async () => {
      const store = database()
      const routines = svc.listRoutines(store)
      const rows = routines.length === 0
        ? '<div class="empty">还没有例行工作。例行会按周期自动生成本期任务。</div>'
        : routines.map((r) => '<div class="task"><div class="main"><div class="title">' + esc(r.title) +
            '</div><div class="meta"><span>' + esc(r.freq === 'monthly' ? '每月' : '每周') + '</span>' +
            '<span>截止 ' + esc(r.due_rule === 'period_end' ? '期末' : '期初') + '</span>' +
            (Number(r.active) === 1 ? '' : '<span class="pill">已停用</span>') + '</div></div></div>').join('')
      const form = '<section class="card"><header>新建例行</header><div class="body">' +
        '<form method="post" action="' + BASE + '/routine-save">' +
        '<label>标题</label><input type="text" name="title" required placeholder="例如：每周五交周报">' +
        '<div class="row"><div><label>频率</label><select name="freq"><option value="weekly">每周</option><option value="monthly">每月</option></select></div>' +
        '<div><label>截止</label><select name="dueRule"><option value="period_end">期末</option><option value="period_start">期初</option></select></div></div>' +
        '<div class="form-actions"><button class="btn primary">创建</button></div></form></div></section>'
      return listPage({
        title: '例行', active: 'routines', subtitle: '按周期自动生成本期任务',
        cards: ['<section class="card"><header>例行列表<span class="count">' + routines.length + '</span></header><div class="body">' + rows + '</div></section>', form],
      })
    })],

    [ROUTE_PREFIX + P + '/projects', page(async () => {
      const store = database()
      const projects = svc.listProjects(store)
      const rows = projects.length === 0
        ? '<div class="empty">还没有项目。</div>'
        : projects.map((p) => '<div class="task"><div class="main"><div class="title">' + esc(p.name) + '</div>' +
            '<div class="meta"><span>活跃工作 ' + svc.listTasks(store, { projectId: p.id, archived: 0 }).length + ' 项</span></div></div></div>').join('')
      const form = '<section class="card"><header>新建项目</header><div class="body">' +
        '<form method="post" action="' + BASE + '/project-save">' +
        '<label>名称</label><input type="text" name="name" required placeholder="例如：季度汇报">' +
        '<div class="form-actions"><button class="btn primary">创建</button></div></form></div></section>'
      return listPage({
        title: '项目', active: 'projects', subtitle: '把工作归到项目下',
        cards: ['<section class="card"><header>项目列表<span class="count">' + projects.length + '</span></header><div class="body">' + rows + '</div></section>', form],
      })
    })],

    [ROUTE_PREFIX + P + '/task', page(async (req) => {
      const store = database()
      const task = svc.getTask(store, queryOf(req).id)
      if (task === undefined) return messagePage('找不到', '这条工作不存在或已被删除。')
      return taskPage({ task, notes: svc.listProgress(store, task.id), todayText: todayText() })
    })],

    [ROUTE_PREFIX + P + '/new', page(async () =>
      formPage({ task: null, projects: svc.listProjects(database()), todayText: todayText() }))],

    [ROUTE_PREFIX + P + '/edit', page(async (req) => {
      const store = database()
      const task = svc.getTask(store, queryOf(req).id)
      if (task === undefined) return messagePage('找不到', '这条工作不存在或已被删除。')
      return formPage({ task, projects: svc.listProjects(store), todayText: todayText() })
    })],

    [ROUTE_PREFIX + P + '/save', async (req, res) => {
      try {
        const form = await readForm(req)
        const store = database()
        const fields = {
          title: form.title, detail: form.detail, doneCriteria: form.doneCriteria,
          dueDate: form.dueDate ?? '', dueTime: form.dueTime ?? '',
          priority: form.priority, status: form.status, tags: form.tags,
          projectId: form.projectId ?? '',
        }
        if (form.id) {
          svc.updateTask(store, form.id, fields)
          redirect(res, '/task?id=' + form.id)
        } else {
          redirect(res, '/task?id=' + svc.createTask(store, fields))
        }
      } catch {
        redirect(res, '')
      }
    }],

    [ROUTE_PREFIX + P + '/status', async (req, res) => {
      let back = ''
      try {
        const form = await readForm(req)
        svc.setStatus(database(), form.id, form.status)
        back = backFrom(form)
      } catch {
        /* a failed status change leaves the row as it was */
      }
      redirect(res, back)
    }],

    [ROUTE_PREFIX + P + '/delete', async (req, res) => {
      try {
        const form = await readForm(req)
        svc.deleteTask(database(), form.id)
      } catch {
        /* deleting twice is not worth showing */
      }
      redirect(res, '')
    }],

    [ROUTE_PREFIX + P + '/progress', async (req, res) => {
      let back = ''
      try {
        const form = await readForm(req)
        svc.addProgress(database(), form.id, form.content)
        back = '/task?id=' + form.id
      } catch {
        /* the note is lost, the page still opens */
      }
      redirect(res, back)
    }],

    [ROUTE_PREFIX + P + '/routine-save', async (req, res) => {
      try {
        const form = await readForm(req)
        const store = database()
        svc.createRoutine(store, { title: form.title, freq: form.freq, dueRule: form.dueRule })
        svc.ensurePeriods(store)
      } catch {
        /* the list page shows what exists */
      }
      redirect(res, '/routines')
    }],

    [ROUTE_PREFIX + P + '/project-save', async (req, res) => {
      try {
        const form = await readForm(req)
        svc.createProject(database(), form.name)
      } catch {
        /* a duplicate name is simply not created */
      }
      redirect(res, '/projects')
    }],

    [ROUTE_PREFIX + '/health', async (req, res) => {
      try {
        const row = database().prepare('SELECT count(*) AS n FROM tasks').get()
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true, tasks: Number(row.n) }))
      } catch (error) {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }))
      }
    }],
  ]
}

/** Register the agent tools over the same ledger the pages show. */
function registerTools(ctx) {
  let tools
  let effect
  try {
    tools = ctx.get('tools')
    effect = ctx.effect
  } catch {
    return
  }
  if (tools === null || tools === undefined || typeof tools.register !== 'function') return
  if (typeof effect !== 'function') return

  const register = (spec) => {
    try { effect.call(ctx, () => tools.register(spec)) } catch { /* one capability less */ }
  }

  register({
    name: 'worklog_list',
    description: '列出工作志里的工作项，可按周、状态、关键词筛选。',
    parameters: {
      type: 'object',
      properties: {
        week: { type: 'string', description: '周内任意一天 YYYY-MM-DD' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        q: { type: 'string', description: '标题/详情/标签关键词' },
        archived: { type: 'boolean', description: '只看已归档' },
        limit: { type: 'number', description: '最多返回条数，默认 50' },
      },
      additionalProperties: false,
    },
    output: {
      presentationMeta: (_a, v) => ({ kind: 'worklog-list', count: v.count }),
      schema: { type: 'object', properties: { count: { type: 'number' }, items: { type: 'array', items: { type: 'object' } } } },
      render: (_a, v) => [{ type: 'text', text: '工作志 - ' + v.count + ' 项' }],
    },
    execute: async (args) => {
      const rows = svc.listTasks(database(), {
        week: args?.week, status: args?.status, q: args?.q, archived: args?.archived ? 1 : 0,
      })
      const limit = Number.isFinite(Number(args?.limit)) ? Math.max(1, Number(args.limit)) : 50
      const items = rows.slice(0, limit).map((t) => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority,
        due: t.due_date ?? null, project: t.project_name ?? null, archived: Number(t.archived) === 1,
      }))
      return { count: items.length, items }
    },
  })

  register({
    name: 'worklog_add',
    description: '在工作志里新建一条工作。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '标题' },
        detail: { type: 'string' },
        doneCriteria: { type: 'string', description: '完成条件' },
        dueDate: { type: 'string', description: '截止日期 YYYY-MM-DD' },
        priority: { type: 'number', enum: [1, 2, 3], description: '1 低 / 2 中 / 3 高' },
        tags: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    output: {
      presentationMeta: (_a, v) => ({ kind: 'worklog-add', id: v.id }),
      schema: { type: 'object', properties: { id: { type: 'number' }, title: { type: 'string' } } },
      render: (_a, v) => [{ type: 'text', text: '已记下：' + v.title }],
    },
    execute: async (args) => ({
      id: svc.createTask(database(), {
        title: args?.title, detail: args?.detail, doneCriteria: args?.doneCriteria,
        dueDate: args?.dueDate ?? '', priority: args?.priority, tags: args?.tags,
      }),
      title: String(args?.title ?? ''),
    }),
  })

  register({
    name: 'worklog_done',
    description: '把一条工作标记为已完成。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number', description: '工作项 id' } },
      required: ['id'],
      additionalProperties: false,
    },
    output: {
      presentationMeta: () => ({ kind: 'worklog-done' }),
      schema: { type: 'object', properties: { ok: { type: 'boolean' }, title: { type: 'string' } } },
      render: (_a, v) => [{ type: 'text', text: v.ok ? '已完成：' + v.title : '没找到这条工作' }],
    },
    execute: async (args) => {
      const store = database()
      const task = svc.getTask(store, args?.id)
      if (task === undefined) return { ok: false, title: '' }
      svc.setStatus(store, args.id, 'done')
      return { ok: true, title: task.title }
    },
  })

  register({
    name: 'worklog_progress',
    description: '给一条工作追加一条进展记录。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number' }, content: { type: 'string' } },
      required: ['id', 'content'],
      additionalProperties: false,
    },
    output: {
      presentationMeta: () => ({ kind: 'worklog-progress' }),
      schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      render: () => [{ type: 'text', text: '已记录进展' }],
    },
    execute: async (args) => {
      const store = database()
      if (svc.getTask(store, args?.id) === undefined) return { ok: false }
      svc.addProgress(store, args.id, args.content)
      return { ok: true }
    },
  })

  register({
    name: 'worklog_summary',
    description: '工作志概览：逾期、今日到期、临期、本周、无截止日期的数量。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      presentationMeta: (_a, v) => ({ kind: 'worklog-summary', overdue: v.counts.overdue }),
      schema: { type: 'object', properties: { counts: { type: 'object' }, activeTotal: { type: 'number' } } },
      render: (_a, v) => [{ type: 'text', text: '逾期 ' + v.counts.overdue + ' - 今日 ' + v.counts.today + ' - 本周 ' + v.counts.week }],
    },
    execute: async () => {
      const store = database()
      svc.ensurePeriods(store)
      const b = svc.buckets(store)
      return { counts: b.counts, activeTotal: b.activeTotal }
    },
  })
}

/** Mount every route and the tools. */
export function apply(ctx) {
  registerTools(ctx)

  let server
  try { server = ctx?.get?.('webServer') } catch { server = undefined }
  if (server === undefined || server === null || typeof server.register !== 'function') return undefined

  const disposers = []
  for (const [path, handler] of routes()) {
    try {
      const dispose = server.register({ kind: 'exact', path, handler })
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch {
      /* one missing route is better than a failed boot */
    }
  }
  return () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch { /* already disposed */ }
    }
    try { if (db !== null) db.close() } catch { /* fine */ }
    db = null
  }
}

export { BASE }
