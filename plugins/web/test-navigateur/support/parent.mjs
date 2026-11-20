// Starts the real relay, drives one navigation so the browser is up, prints
// "ready <relay pid>", then waits to be SIGKILLed. argv: relay, url.
import { client } from './client.mjs'

const [relay, url] = process.argv.slice(2)
const c = client(process.execPath, [relay], process.env)
await c.start()
await c.ask('tools/call', { name: 'browser_navigate', arguments: { url } })
process.stdout.write(`ready ${c.child.pid}\n`)
setInterval(() => {}, 1000)
