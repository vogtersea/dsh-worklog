/** 临时开发服务器：只把插件自己的路由挂到 node:http 上，用于浏览器验证。 */
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-worklog-dev-'))
const mod = await import('../lib/index.js')

const table = new Map()
const fakeServer = { register({ path, handler }) { table.set(path, handler); return () => {} } }
mod.apply({ get: (n) => (n === 'webServer' ? fakeServer : undefined) })

const server = createServer((req, res) => {
  const path = String(req.url ?? '/').split('?')[0]
  const handler = table.get(path)
  if (handler === undefined) {
    res.statusCode = 404
    res.end('not found: ' + path)
    return
  }
  handler(req, res).catch(() => { res.statusCode = 500; res.end('error') })
})
server.listen(8091, '127.0.0.1', () => console.log('dev server on http://127.0.0.1:8091/worklog-plugin/app'))
