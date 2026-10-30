/**
 * 验收测试：证明在「未安装外部工作志服务」的环境中，只装本插件即可完成原有功能，
 * 且运行时不产生任何对外部工作志服务的网络依赖。
 */
import assert from 'node:assert'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { execSync } from 'node:child_process'

// 1) 干净的家目录：模拟全新安装
const HOME = mkdtempSync(join(tmpdir(), 'worklog-accept-'))
process.env.DSH_HOME = HOME
console.log('干净环境 DSH_HOME =', HOME)

// 2) 确认本机此刻没有工作志服务在跑
let running = ''
try {
  running = execSync('netstat -ano | findstr LISTENING | findstr ":8080 :8099 :15468"', { encoding: 'utf8', shell: 'cmd.exe' })
} catch {
  running = ''
}
assert.equal(running.trim(), '', '验收前提：不应有任何工作志服务在监听，实际: ' + running)
console.log('✓ 前提成立：没有任何工作志服务在运行')

// 3) 只加载插件
const mod = await import('../lib/index.js')
const table = new Map()
const tools = []
const ctx = {
  get: (n) => (n === 'webServer'
    ? { register: ({ path, handler }) => { table.set(path, handler); return () => table.delete(path) } }
    : n === 'tools' ? { register: (s) => { tools.push(s); return () => {} } } : undefined),
  effect: (f) => f(),
}
mod.apply(ctx)
console.log('✓ 插件加载：路由', table.size, '条 / 工具', tools.length, '个')

async function call(fullPath, { method = 'GET', body = '' } = {}) {
  const handler = table.get(fullPath.split('?')[0])
  assert.ok(handler, '路由缺失: ' + fullPath)
  const req = new EventEmitter()
  req.method = method
  req.url = fullPath
  const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k] = v }, end(c) { this.body += c === undefined ? '' : String(c) } }
  const p = handler(req, res)
  if (body !== '') { req.emit('data', body); req.emit('end') } else req.emit('end')
  await p
  return res
}

const P = '/worklog-plugin/app'
const pages = [
  ['仪表盘', P], ['周视图', P + '/week'], ['归档', P + '/archive'],
  ['例行', P + '/routines'], ['项目', P + '/projects'], ['新建', P + '/new'], ['样式', P + '/style.css'],
]
for (const [name, path] of pages) {
  const r = await call(path)
  assert.equal(r.statusCode, 200, name + ' 状态码')
  assert.ok(r.body.length > 100, name + ' 内容')
  console.log('✓ ' + name + ' 可用 (' + r.body.length + ' 字节)')
}

// 4) 完整跑一遍写操作
let r = await call(P + '/save', { method: 'POST', body: 'title=' + encodeURIComponent('验收测试工作') + '&dueDate=2026-11-15&priority=3' })
assert.equal(r.statusCode, 303)
const id = r.headers.location.split('id=')[1]
console.log('✓ 新建工作 id =', id)

await call(P + '/progress', { method: 'POST', body: 'id=' + id + '&content=' + encodeURIComponent('验收进展') })
r = await call(P + '/task?id=' + id)
assert.ok(r.body.includes('验收进展'))
console.log('✓ 进展记录可写可读')

await call(P + '/status', { method: 'POST', body: 'id=' + id + '&status=done' })
r = await call(P + '/archive')
assert.ok(r.body.includes('验收测试工作'))
console.log('✓ 完成并归档')

// 5) AI 工具闭环
const add = tools.find((t) => t.name === 'worklog_add')
const done = tools.find((t) => t.name === 'worklog_done')
const summary = tools.find((t) => t.name === 'worklog_summary')
const created = await add.execute({ title: 'AI 建的工作', dueDate: '2026-11-10', priority: 1 })
console.log('✓ AI 建工作:', JSON.stringify(created))
const finished = await done.execute({ id: created.id })
console.log('✓ AI 完成工作:', JSON.stringify(finished))
const sum = await summary.execute({})
console.log('✓ AI 概览:', JSON.stringify(sum.counts))

// 6) 数据确实落在本机
const dbFile = join(HOME, 'worklog', 'worklog.db')
assert.ok(existsSync(dbFile), '数据库应存在')
console.log('✓ 数据落盘:', dbFile, '(' + (readdirSync(join(HOME, 'worklog')).join(', ')) + ')')

// 7) 源码里没有任何外部网络调用
const { readFileSync } = await import('node:fs')
const dir = '../lib'
for (const file of readdirSync(dir)) {
  const text = readFileSync(join(dir, file), 'utf8')
  assert.ok(!/https?:\/\//.test(text), file + ' 不应含外部 URL')
  assert.ok(!/(^|[^.\w])fetch\(/.test(text), file + ' 不应发起 fetch')
}
console.log('✓ 全部源文件零外部 URL、零 fetch')

console.log('\n========== 验收通过 ==========')
console.log('在没有任何外部工作志服务的环境中，仅安装本插件即可完成全部功能，')
console.log('运行时不存在对外部工作志服务的网络依赖。')
