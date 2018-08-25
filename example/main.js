import { createServer } from 'http';
import { contextFor, createRouter } from '../httptools.js';

const router = createRouter()
router.handle('GET', '/hello/{name}', greetHandler)

const server = createServer(router.handler)
server.listen(3000, () => console.log('Server running at http://localhost:3000/'))

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
function greetHandler(req, res) {
    const { name } = /** @type {{[x: string]: string}} */ (contextFor(req).get('params'))
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(`Hello, ${name}!`)
}
