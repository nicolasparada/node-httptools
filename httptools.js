import fs from 'fs';
import http from 'http';
import path from 'path';
import url from 'url';

const contexts = new WeakMap()
const paramRegexp = /\{([^\}]+)\}/gu
const starRegexp = /\*/g
const starReplace = '.*'

/**
 * @param {string} param
 */
function paramReplacer(_, param) {
    return `(?<${param}>[^\/]+)`
}

/**
 * @param {string} pattern
 */
function patternToRegexp(pattern) {
    const patternString = pattern
        .replace(paramRegexp, paramReplacer)
        .replace(starRegexp, starReplace)
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
        respondInternalError(res, err)
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
        routes.push({
            method,
            pattern: pattern instanceof RegExp
                ? pattern
                : patternToRegexp(pattern),
            handler,
        })
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
 * @param {string} text
 * @param {number=} statusCode
 */
export function respondText(res, text, statusCode = 200) {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end(text)
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
    try {
        const json = JSON.parse(data)
        if (typeof json !== 'object' || json === null || Array.isArray(json))
            throw new Error('only plain objects allowed')
        return json
    } catch (err) {
        throw new Error('could not parse request body: ' + err.message)
    }
}

/**
 * @param {string} dir
 * @param {boolean=} fallback
 */
export function createStaticHandler(dir, fallback = false) {
    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     * @param {string} filepath
     * @param {fs.Stats} stats
     */
    function serveFile(req, res, filepath, stats) {
        const modifiedSinceHeader = req.headers['if-modified-since']
        if (typeof modifiedSinceHeader === 'string') {
            const modifiedSince = new Date(modifiedSinceHeader)
            if (!isNaN(modifiedSince.valueOf()) && modifiedSince <= stats.mtime) {
                res.statusCode = 304
                res.end()
                return
            }
        }

        res.setHeader('Content-Length', stats.size)
        res.setHeader('Content-Type', getContentType(path.extname(filepath)))
        res.setHeader('Last-Modified', stats.mtime.toJSON())
        fs.createReadStream(filepath).pipe(res)
    }

    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    return async function asyncHandler(req, res) {
        const { pathname } = url.parse(req.url)
        const filepath = path.join(dir, pathname.endsWith('/') ? pathname + 'index.html' : pathname)
        let stats
        try {
            // @ts-ignore
            stats = await fs.promises.stat(filepath)
        } catch (_) {
            if (!fallback) {
                defaultNotFoundHandler(req, res)
                return
            }

            const filepath = path.join(dir, '/index.html')
            try {
                // @ts-ignore
                stats = await fs.promises.stat(filepath)
            } catch (err) {
                defaultErrorHandler(req, res)(new Error(`no fallback "${filepath}" found`))
                return
            }

            serveFile(req, res, filepath, stats)
            return
        }

        if (!stats.isFile()) {
            defaultNotFoundHandler(req, res)
            return
        }

        serveFile(req, res, filepath, stats)
    }
}

function getContentType(ext) {
    switch (ext) {
        case '.css': return 'text/css; charset=utf-8'
        case '.gif': return 'image/gif'
        case '.html': return 'text/html; charset=utf-8'
        case '.jpeg': return 'image/jpeg'
        case '.jpg': return 'image/jpeg'
        case '.js': return 'application/javascript; charset=utf-8'
        case '.json': return 'application/json; charset=utf-8'
        case '.ico': return 'image/x-icon'
        case '.md': return 'text/markdown; charset=utf-8'
        case '.mjs': return 'application/javascript; charset=utf-8'
        case '.mp4': return 'video/mp4'
        case '.png': return 'image/png'
        case '.svg': return 'image/svg'
        case '.txt': return 'text/plain; charset=utf-8'
        case '.webm': return 'video/webm'
        case '.woff': return 'font/woff'
        case '.woff2': return 'font/woff2'
        default: return 'application/octet-stream'
    }
}


export default {
    createRouter,
    contextFor,
    respondJSON,
    respondText,
    respondInternalError,
    decodeJSON,
    createStaticHandler
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
