import http from 'http'
import url from 'url'

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {void|Promise<void>}
 */
function defaultNotFoundHandler(req, res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(http.STATUS_CODES[404])
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {function(Error): void|Promise<void>}
 */
const defaultErrorHandler = (req, res) => err => {
    console.error(err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(http.STATUS_CODES[500])
}

export const createRouter = ({
    prefix = '',
    notFoundHandler = defaultNotFoundHandler,
    errorHandler = defaultErrorHandler,
} = {}) => {
    const routes = /** @type {Route[]} */ ([])

    /**
     * @param {string} method
     * @param {string|RegExp} pattern
     * @param {Handler} handler
     */
    function handle(method, pattern, handler) {
        routes.push({ method, pattern, handler })
    }

    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    function requestListener(req, res) {
        let { pathname } = url.parse(req.url)
        if (prefix !== '' && pathname.startsWith(prefix))
            pathname = pathname.substring(prefix.length)
        pathname = decodeURI(pathname)

        for (const route of routes) {
            if (route.method !== req.method && route.method !== '*')
                continue

            if (typeof route.pattern === 'string') {
                if (route.pattern !== pathname)
                    continue
                executeHandler(route.handler, req, res)
                return
            }

            const match = route.pattern.exec(pathname)
            if (match === null) continue

            contextFor(req).set('params', match.slice(1))
            executeHandler(route.handler, req, res)
            return
        }

        notFoundHandler(req, res)
    }

    /**
     * @param {Handler} handler
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    async function executeHandler(handler, req, res) {
        try {
            await handler(req, res)
        } catch (err) {
            errorHandler(req, res)(err)
        }
    }

    return { handle, requestListener }
}

const contexts = new WeakMap()

/**
 * @param {*} key
 * @returns {Map}
 */
export function contextFor(key) {
    /** @type {Map} */ let context
    if (contexts.has(key)) {
        context = contexts.get(key)
    } else {
        context = new Map()
        contexts.set(key, context)
    }
    return context
}

/**
 * @param {http.ServerResponse} res
 * @param {*} payload
 * @param {number} statusCode
 */
export function respondJSON(res, payload, statusCode) {
    let json
    try {
        json = JSON.stringify(payload)
    } catch (err) {
        respondInternalError(res, new Error('could not JSON stringify response payload: ' + err.message))
        return
    }
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(json)
}

/**
 * @param {http.ServerResponse} res
 * @param {Error} err
 */
export function respondInternalError(res, err) {
    console.error(err)
    respondJSON(res, { message: http.STATUS_CODES[500] }, 500)
}

/**
 * @param {http.IncomingMessage} req
 */
export const decodeJSON = req => new Promise((resolve, reject) => {
    let chunks = []
    req.on('data', chunk => {
        chunks.push(chunk)
    })
    req.once('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8')
        if (data === '') {
            resolve({})
            return
        }
        try {
            const json = JSON.parse(data)
            if (typeof json !== 'object' || json === null) {
                reject(new Error('could not parse request body as JSON: only objects allowed'))
                return
            }
            resolve(json)
        } catch (err) {
            reject(new Error('could not parse request body as JSON: ' + err.message))
        }
    })
    req.once('error', err => {
        reject(new Error('could not read request body: ' + err.message))
    })
    req.once('aborted', () => {
        reject(new Error('request aborted'))
    })
    req.once('close', () => {
        reject(new Error('request closed'))
    })
})

/**
 * @typedef Route
 * @property {string} method
 * @property {string|RegExp} pattern
 * @property {Handler} handler
 */

 /**
  * @typedef {function(http.IncomingMessage, http.ServerResponse): void|Promise<void>} Handler
  */
