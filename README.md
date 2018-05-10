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
    res.end('Hello, world!')
})

const server = createServer(router.requestListener)
server.listen(80, '127.0.0.1', () => {
    console.log('Server running at http://localhost/ 🚀')
})
```

## URL Matching and Context

```js
import { contextFor } from '@nicolasparada/httptools'

router.handle('GET', '/hello/{name}', (req, res) => {
    const ctx = contextFor(req)
    const params = ctx.get('params')
    res.end(`Hello, ${params.name}!`)
})
```

Inside the request context, you'll find a "params" object with all the URL parameters.

## Sub-Routing

```js
const api = createRouter({ prefix: '/api' })
api.handle('GET', '/endpoint', handler)

const router = createRouter()
router.handle('*', '/api/*', api.requestListener)
```

You can create a router with a prefix and pass its requestListener as a handler.

## JSON Encoding

```js
import { respondJSON } from '@nicolasparada/httptools'

function handler(req, res) {
    respondJSON(res, { message: 'Hi' })
}
```

## JSON Decoding

```js
import { decodeJSON } from '@nicolasparada/http-tools'

async function handler(req, res) {
    let body
    try {
        body = await decodeJSON(req)
    } catch (err) {
        res.statusCode = err.statusCode || 400
        res.end(err.message)
        return
    }

    res.end()
}
```

## Middleware

```js
function withAuthUser(next) {
    return (req, res) => {
        const authUser = /* Get auth user somehow */
        contextFor(req).set('auth_user', authUser)
        return next(req, res)
    }
}

const handler = withAuthUser((req, res) => {
    const authUser = contextFor(req).get('auth_user')
    res.end()
})
```

Use function composition for middleware.
