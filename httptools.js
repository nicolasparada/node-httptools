import fs from 'fs';
import http from 'http';
import path from 'path';
import url from 'url';

const contexts = new WeakMap()
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg',
    '.txt': 'text/plain; charset=utf-8',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
}

/**
 * @param {string} pattern
 */
function paramRegexp(pattern) {
    let i = 1
    const groups = pattern
        .replace(/\./g, '\\.')
        .replace(/\{([\w_]+)\}/g, '(?<$1>[^\/]+)')
        .replace(/\*/g, () => `(?<wildCard${i++}>.*)`)
    return new RegExp(`^${groups}$`)
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
                : paramRegexp(pattern),
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

/**
 * @param {string} ext
 * @returns {string}
 */
function getContentType(ext) {
    return mimeTypes[ext] || 'application/octet-stream'
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
