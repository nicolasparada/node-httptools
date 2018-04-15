# [httptools](npm.im/@nicolasparada/httptools)

This package provides with common tools to complement the Node's HTTP server.

**This package is shipped like a ES module, so run your app with [esm](https://github.com/standard-things/esm):**
```bash
node -r esm main.js
```

## Usage
```js
import { createServer } from 'http'
import { contextFor, createRouter, respondJSON } from '@nicolasparada/httptools'

const api = createRouter({ prefix: '/api' })
api.handle('GET', /^\/hello\/([^\/]+)$/, helloHandler)

const router = createRouter()
router.handle('GET', '/', rootHandler)
router.handle('*', /^\/api\//, api.requestListener)

function rootHandler(req, res) {
    res.end('Hi')
}

function helloHandler(req, res) {
    const [name] = contextFor(req).get('params')
    respondJSON(res, { message: `Hello, ${name}!` }, 200)
}

const server = createServer(router.requestListener)
server.listen(80, '127.0.0.1', () => {
    console.log('Server running at http://localhost/ 🚀')
})
```

To get URL params, use regular expressions. Then you can get an array with all the parameters using `contextFor(req).get('params')`.

To group endpoints, you can create multiple router instances and pass the `requestListener` to other routers.

### Middlewares
```js
import { contextFor, decodeJSON, respondJSON } from '@nicolasparada/http-tools'

const withJSONBody = next => async (req, res) => {
    const ct = req.headers['content-type']
    if (typeof ct !== 'string' || !ct.startsWith('application/json')) {
        respondJSON(res, { message: 'JSON body required' }, 415)
        return
    }

    let body
    try {
        body = await decodeJSON(req)
    } catch (err) {
        respondJSON(res, { message: err.message }, 400)
        return
    }

    contextFor(req).set('body', body)
    return next(req, res)
}

router.handle('POST', '/endpoint', withJSONBody(handler))

function handler(req, res) {
    const body = contextFor(req).get('body')
    respondJSON(res, { body }, 200)
}
```

Middlewares are just function composition like so:
```js
const middleware = next => (req, res) => {
    return next(req, res)
}
```
Add values to the context like so: `contextFor(req).set('foo', 'bar')`.

`decodeJSON` and `respondJSON` are self explanatories.
