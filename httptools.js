import * as url from 'url'

const contexts = /** @type {WeakMap<any, Map>} */ (new WeakMap())

export function contextFor(key) {
    if (contexts.has(key)) {
        return contexts.get(key)
    }

    const context = new Map()
    contexts.set(key, context)
    return context
}

export function createRouter({
    errorHandler = defaultErrorHandler,
    notFoundhandler = defaultNotFoundHandler,
} = {}) {
    const routes = /** @type {Set<{method: string, pattern: string|RegExp, handler: function(import('http').IncomingMessage, import('http').ServerResponse): any}>} */ (new Set())

    /**
     * @param {string} method
     * @param {string|RegExp} pattern
     * @param {function(import('http').IncomingMessage, import('http').ServerResponse): any} handler
     */
    const handle = (method, pattern, handler) => {
        routes.add({ method, pattern, handler })
    }

    /**
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     */
    const handler = async (req, res) => {
        let handler = notFoundhandler
        const { pathname } = url.parse(req.url)

        for (const route of routes) {
            if (route.method !== req.method && route.method !== '*') {
                continue
            }

            if (typeof route.pattern === 'string') {
                if (route.pattern !== pathname) {
                    continue
                }

                handler = route.handler
                break
            }

            const match = route.pattern.exec(pathname)
            if (match === null) {
                continue
            }

            const params = match.slice(1).map(decodeURIComponent)
            if (isPlainObject(match.groups)) {
                for (const [k, v] of Object.entries(match.groups)) {
                    params[k] = decodeURIComponent(v)
                }
            }

            contextFor(req).set('params', params)
            handler = route.handler
            break
        }

        try {
            await handler(req, res)
        } catch (err) {
            errorHandler(req, res, err)
        }
    }

    return { handle, handler }
}

/**
 * @param {TemplateStringsArray} strings
 * @param {any[]} values
 */
export function pattern(strings, ...values) {
    const groups = values
        .reduce((acc, v, i) => acc + String(v) + strings[i + 1], strings[0])
        .replace(/\.g/, '\\.')
        .replace(/\{([^}]+)\}/g, '(?<$1>[^\/]+)')
        .replace(/\*/g, '(.*)')
    return new RegExp(`^${groups}$`)
}

function isPlainObject(x) {
    return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/**
 * @param {import('http').ServerResponse} res
 */
function defaultNotFoundHandler(_, res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not Found')
}

/**
 * @param {import('http').ServerResponse} res
 * @param {Error} err
 */
function defaultErrorHandler(_, res, err) {
    console.error(new Date().toJSON(), err)
    if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    }
    if (!res.finished) {
        res.end('Internal Server Error')
    }
}

/**
 * @param {string} prefix
 * @param {function(import('http').IncomingMessage, import('http').ServerResponse): any} handler
 * @returns {function(import('http').IncomingMessage, import('http').ServerResponse): any}
 */
export function stripPrefix(prefix, handler) {
    return (req, res) => {
        const parsed = url.parse(req.url)
        if (parsed.pathname.startsWith(prefix)) {
            parsed.pathname = parsed.pathname.substr(prefix.length)
            req.url = url.format(parsed)
        }
        return handler(req, res)
    }
}
