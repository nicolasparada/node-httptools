# [httptools](https://www.npmjs.com/package/@nicolasparada/httptools)

This package provides with common tools to complement the Node's HTTP server.

**This package is shipped like an ES module. You'll need to run your app with [esm](https://www.npmjs.com/package/esm):**
```bash
npm i esm
node -r esm main.js
```

## Routing

```js
import { createServer } from 'http'
import { createRouter } from '@nicolasparada/httptools'

const router = createRouter()
router.handle('GET', '/', (req, res) => {
    res.end('Hello there 🙂')
})

const server = createServer(router.requestListener)
server.listen(3000, '127.0.0.1', () => {
    console.log('Server running at http://localhost:3000/ 🚀')
})
```

## Pattern Matching and Context

```js
import { contextFor } from '@nicolasparada/httptools'

router.handle('GET', '/hello/{name}', (req, res) => {
    const ctx = contextFor(req)
    const params = ctx.get('params')
    res.end(`Hello, ${params.name}!`)
})
```

Inside the request context, you'll find a "params" object with all the URL parameters.
Context can be filled with your own data. See [middleware](#middleware) below.

## Middleware

```js
router.handler('GET', '/', withAuthUser(handler))

function withAuthUser(next) {
    return (req, res) => {
        const authUser = { username: 'john_doe' }
        contextFor(req).set('auth_user', authUser)
        return next(req, res)
    }
}

function handler(req, res) => {
    const authUser = contextFor(req).get('auth_user')
    console.log(authUser) // { username: 'john_doe' }
    res.end()
}
```

Just use function composition for middleware.

## Sub-Routing

```js
const api = createRouter({ prefix: '/api' })
api.handle('GET', '/', handler)

const router = createRouter()
router.handle('*', '/api/*', api.requestListener)
```

You can create a router with a prefix and pass its requestListener as a handler.
