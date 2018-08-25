# [@nicolasparada/httptools](https://www.npmjs.com/package/@nicolasparada/httptools)

This package provides some utilities to complement Node's HTTP server.

**Shipped like an ES module. You'll need to run your app with [esm](https://www.npmjs.com/package/esm):**
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

const server = createServer(router.handler)
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
router.handle('GET', '/auth_user', withAuthUser(authUserHandler))

function withAuthUser(next) {
    return (req, res) => {
        const authUser = { username: 'john_doe' }
        contextFor(req).set('auth_user', authUser)
        return next(req, res)
    }
}

function authUserHandler(req, res) {
    const authUser = contextFor(req).get('auth_user')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(authUser)) // { username: 'john_doe' }
}
```

Just use function composition for middleware.

## Sub-Routing

```js
import { createRouter, stripPrefix } from '@nicolasparada/httptools'

const api = createRouter()
api.handle('GET', '/messages', messagesHandler) // Handles GET /api/messages.

const router = createRouter()
router.handle('*', '/api/*', stripPrefix('/api', api.handler))
```

`stripPrefix` is a middleware that strips the given prefix from the request URL. That way you can compose multiple routers.
