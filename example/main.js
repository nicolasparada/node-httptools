import { createServer } from 'http'
import { contextFor, createRouter, pattern } from '../httptools.js'

const router = createRouter()
router.handle('GET', pattern`/hello/{name}`, greetHandler)

const server = createServer(router.handler)
server.listen(3000, () => {
    console.log('server running at http://localhost:3000')
})

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function greetHandler(req, res) {
    const ctx = contextFor(req)
    const params = ctx.get('params')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Hello, ${params.name}!`)
}
