/** 端到端验证：不需要任何外部服务，插件自己跑通全部功能。 */
import assert from 'node:assert'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-worklog-test-'))

const mod = await import('../lib/index.js')
console.log('✓ 宿主侧导出:', Object.keys(mod).sort().join(', '))

// 假 webServer：收集注册的路由
const table = new Map()
const fakeServer = { register({ kind, path, handler }) { table.set(path, handler); return () => table.delete(path) } }
const tools = []
const fakeCtx = {
  get(name) {
    if (name === 'webServer') return fakeServer
    if (name === 'tools') return { register: (spec) => { tools.push(spec); return () => {} } }
    return undefined
  },
  effect(factory) { return factory() },
}

const dispose = mod.apply(fakeCtx)
assert.equal(typeof dispose, 'function', 'apply 必须返回 disposer')
console.log('✓ 注册路由数:', table.size)
console.log('✓ 注册工具数:', tools.length, '->', tools.map((t) => t.name).join(', '))

/** 调一次路由。 */
async function call(fullPath, { method = 'GET', body = '' } = {}) {
  // 真实服务器按 pathname 匹配路由，查询串只进 req.url
  const path = fullPath.split('?')[0]
  const handler = table.get(path)
  assert.ok(handler, '路由未注册: ' + path)
  const req = new EventEmitter()
  req.method = method
  req.url = fullPath
  if (body !== '') {
    req.setEncoding = () => {}
  }
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k] = v },
    end(chunk) { this.body += chunk === undefined ? '' : String(chunk) },
  }
  const pending = handler(req, res)
  if (body !== '') {
    req.emit('data', body)
    req.emit('end')
  } else if (method === 'POST') {
    req.emit('end')
  }
  await pending
  return res
}

const P = '/worklog-plugin/app'
let r = await call(P)
assert.equal(r.statusCode, 200)
assert.ok(r.body.includes('仪表盘'), '仪表盘页应有标题')
console.log('✓ 仪表盘渲染:', r.body.length, '字节')

r = await call(P + '/style.css')
assert.equal(r.statusCode, 200)
assert.ok(r.body.includes('--brand'))
console.log('✓ 样式表:', r.body.length, '字节')

r = await call(P + '/new')
assert.ok(r.body.includes('新建工作'))
console.log('✓ 新建页渲染')

// 建一条工作
r = await call(P + '/save', { method: 'POST', body: 'title=' + encodeURIComponent('筹备季度工作会的汇报材料') + '&dueDate=2026-11-20&priority=3' })
assert.equal(r.statusCode, 303)
const loc = r.headers.location
console.log('✓ 创建成功，跳转:', loc)
const id = loc.split('id=')[1]

r = await call(P + '/task?id=' + id)
assert.ok(r.body.includes('筹备季度工作会'), '详情页应显示标题')
console.log('✓ 详情页渲染')

// 进展
await call(P + '/progress', { method: 'POST', body: 'id=' + id + '&content=' + encodeURIComponent('已完成初稿') })
r = await call(P + '/task?id=' + id)
assert.ok(r.body.includes('已完成初稿'))
console.log('✓ 进展记录写入并回显')

// 完成 -> 归档
await call(P + '/status', { method: 'POST', body: 'id=' + id + '&status=done' })
r = await call(P + '/archive')
assert.ok(r.body.includes('筹备季度工作会'), '归档页应包含已完成项')
console.log('✓ 完成后进入归档')

// 周视图
r = await call(P + '/week')
assert.ok(r.body.includes('周一'))
console.log('✓ 周视图渲染')

// 例行
await call(P + '/routine-save', { method: 'POST', body: 'title=' + encodeURIComponent('每周五交周报') + '&freq=weekly&dueRule=period_end' })
r = await call(P + '/routines')
assert.ok(r.body.includes('每周五交周报'))
console.log('✓ 例行创建并列出')

// 项目
await call(P + '/project-save', { method: 'POST', body: 'name=' + encodeURIComponent('季度汇报') })
r = await call(P + '/projects')
assert.ok(r.body.includes('季度汇报'))
console.log('✓ 项目创建并列出')

// 健康检查
r = await call('/worklog-plugin/health')
const health = JSON.parse(r.body)
assert.equal(health.ok, true)
console.log('✓ 健康检查:', JSON.stringify(health))

// 工具真的能操作数据
const add = tools.find((t) => t.name === 'worklog_add')
const added = await add.execute({ title: '通过工具新建的工作', dueDate: '2026-11-25', priority: 2 })
console.log('✓ 工具 worklog_add ->', JSON.stringify(added))

const list = tools.find((t) => t.name === 'worklog_list')
const listed = await list.execute({ q: '工具' })
console.log('✓ 工具 worklog_list -> 命中', listed.count, '项')

const summary = tools.find((t) => t.name === 'worklog_summary')
const sum = await summary.execute({})
console.log('✓ 工具 worklog_summary ->', JSON.stringify(sum.counts))

// 数据库文件真的落在 DSH_HOME 下
const dbFile = join(process.env.DSH_HOME, 'worklog', 'worklog.db')
assert.ok(existsSync(dbFile), '数据库文件应存在: ' + dbFile)
console.log('✓ 数据库落盘:', dbFile)

// disposer 可用
dispose()
console.log('✓ disposer 执行成功')

console.log('\n集成验证全部通过：不需要任何外部服务')
