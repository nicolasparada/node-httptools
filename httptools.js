import http from 'http';
import url from 'url';

const contexts = new WeakMap()
const paramRegexp = /\{([^\}]+)\}/gu
const starRegexp = /\*/g

/**
 * @param {string} pattern
 */
function patternToRegexp(pattern) {
    const patternString = pattern
        .replace(paramRegexp, (_, param) => `(?<${param}>[^\/]+)`)
        .replace(starRegexp, '.*')
    return new RegExp(`^${patternString}$`, 'u')
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {void|Promise<void>}
 */
function defaultNotFoundHandler(req, res) {
    respondText(res, http.STATUS_CODES[404], 404)
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {function(Error): void|Promise<void>}
 */
function defaultErrorHandler(req, res) {
    return err => {
        console.error(err)
        respondText(res, http.STATUS_CODES[500], 500)
    }
}

export function createRouter({
    prefix = '',
    notFoundHandler = defaultNotFoundHandler,
    errorHandler = defaultErrorHandler,
} = {}) {
    const routes = /** @type {Route[]} */ ([])

    /**
     * @param {string} method
     * @param {string|RegExp} pattern
     * @param {Handler} handler
     */
    function handle(method, pattern, handler) {
        if (typeof pattern === 'string')
            pattern = patternToRegexp(pattern)
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

            const match = route.pattern.exec(pathname)
            if (match === null) continue

            contextFor(req).set('params', match['groups'] || {})
            executeHandler(route.handler, req, res)
            return
        }

        executeHandler(notFoundHandler, req, res)
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

/**
 * @param {*} key
 * @returns {Map}
 */
export function contextFor(key) {
    if (contexts.has(key))
        return contexts.get(key)
    const context = new Map()
    contexts.set(key, context)
    return context
}

/**
 * @param {http.ServerResponse} res
 * @param {*} object
 * @param {number=} statusCode
 */
export function respondJSON(res, object, statusCode = 200) {
    let json
    try {
        json = JSON.stringify(object)
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
    respondText(res, http.STATUS_CODES[500], 500)
}

/**
 * @param {http.ServerResponse} res
 * @param {string} text
 * @param {number=} statusCode
 */
export function respondText(res, text, statusCode = 200) {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(text)
}

/**
 * @param {http.IncomingMessage} req
 */
export async function decodeJSON(req) {
    const ct = req.headers['content-type']
    if (typeof ct !== 'string' || !ct.startsWith('application/json')) {
        const err = new Error('could not parse request body: content-type of "application/json" required')
        err['statusCode'] = 415
        throw err
    }
    req.setEncoding('utf-8')
    let data = ''
    // @ts-ignore
    for await (const chunk of req)
        data += chunk
    if (data === '')
        return {}
    let json
    try {
        json = JSON.parse(data)
    } catch (err) {
        throw new Error('could not parse request body: ' + err.message)
    }
    if (typeof json !== 'object' || json === null)
        throw new Error('could not parse request body: only objects allowed')
    return json
}

/**
 * @typedef Route
 * @property {string} method
 * @property {RegExp} pattern
 * @property {Handler} handler
 */

 /**
  * @typedef {function(http.IncomingMessage, http.ServerResponse): void|Promise<void>} Handler
  */
