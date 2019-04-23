# [@nicolasparada/httptools](https://www.npmjs.com/package/@nicolasparada/httptools)

This package provides some utilities to complement Node's HTTP server.

**Shipped like an ES module**

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
    console.log('Server running at http://localhost:3000 🚀')
})
```

You can register HTTP handlers for a given HTTP verb and URL pattern.

## Pattern Matching and Context

```js
import { contextFor, pattern } from '@nicolasparada/httptools'

router.handle('GET', pattern`/hello/{name}`, (req, res) => {
    const ctx = contextFor(req)
    const params = ctx.get('params')
    res.end(`Hello, ${params.name}!`)
})
```

You can create dynamic routes by passing a regular expression. `pattern()` is a tagged template literal function that converts the given pattern into a regular expression for simplicity. In this example, it's equivalent to `/^\/hello\/(?<name>[^\/]+)$/`.

You can capture parameters from the URL with a curly braces syntax as shown there. You can also use a wilcard `*` to capture anything.

Inside the request context, you'll find a "params" object with all the URL parameters.
Context can be filled with your own data. _See [middleware](#middleware) down below._ I do that to not mess with the Node.js API.

## Middleware

```js
router.handle('GET', '/auth_user', withAuthUser(authUserHandler))

function withAuthUser(next) {
    return (req, res) => {
        const token = extractToken(req)
        const authUser = decodeToken(token)
        const ctx = contextFor(req)
        ctx.set('auth_user', authUser)
        return next(req, res)
    }
}

function authUserHandler(req, res) {
    const ctx = contextFor(req)
    const authUser = ctx.get('auth_user')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(authUser))
}
```

`contextFor()` will give you a `WeakMap` in which you can save data scoped to the request.
Just use function composition for middleware.

## Sub-routing

```js
import { createRouter, pattern, stripPrefix } from '@nicolasparada/httptools'

const api = createRouter()
api.handle('GET', '/', handler)

const router = createRouter()
router.handle('*', pattern`/api/*`, stripPrefix('/api', api.handler))
```

`stripPrefix()` is a middleware that trims the given prefix from the request URL. That way, you can compose multiple routers.
