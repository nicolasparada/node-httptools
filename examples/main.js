import { createServer } from 'http';
import { contextFor, createRouter, respondText } from '../httptools.js';

const router = createRouter()

router.handle('GET', '/', (req, res) => {
    respondText(res, 'Hello there 👋', 200)
})

router.handle('GET', '/hello/{name}', (req, res) => {
    const { name } = contextFor(req).get('params')
    respondText(res, `Hello, ${name}!`, 200)
})

const server = createServer(router.requestListener)
server.listen(80, '127.0.0.1', () => {
    console.log('Server running at http://localhost/ 🚀')
})
