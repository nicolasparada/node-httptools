import http from 'http';
import url from 'url';
import { contextFor } from './context.js';

const _routes = Symbol('_routes')

export class Router {
    constructor({
        prefix = '',
        notFoundHandler = defaultNotFoundHandler,
        errorHandler = defaultErrorHandler,
    } = {}) {
        this.prefix = prefix
        this.notFoundHandler = notFoundHandler
        this.errorHandler = errorHandler

        this[_routes] = /** @type {Route[]} */ ([])

        this.handle = this.handle.bind(this)
        this.requestListener = this.requestListener.bind(this)
    }

    /**
     * @param {string} method
     * @param {string|RegExp} pattern
     * @param {function(http.IncomingMessage, http.ServerResponse): void|Promise<void>} handler
     */
    handle(method, pattern, handler) {
        this[_routes].push({
            method,
            pattern: pattern instanceof RegExp
                ? pattern
                : paramRegExp(pattern),
            handler,
        })
    }

    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    requestListener(req, res) {
        let { pathname } = url.parse(req.url)
        if (this.prefix !== '' && pathname.startsWith(this.prefix)) {
            pathname = pathname.substr(this.prefix.length)
        }

        for (const route of this[_routes]) {
            if (route.method !== req.method && route.method !== '*') {
                continue
            }

            const match = route.pattern.exec(pathname)
            if (match === null) {
                continue
            }

            const params = match.slice(1).map(decodeURIComponent)
            // @ts-ignore
            for (const [key, val] of Object.entries(match.groups || {})) {
                params[key] = decodeURIComponent(val)
            }

            contextFor(req).set('params', params)
            executeHandler(route.handler, this.errorHandler, req, res)
            return
        }

        executeHandler(this.notFoundHandler, this.errorHandler, req, res)
    }
}

export function createRouter({
    prefix = '',
    notFoundHandler = defaultNotFoundHandler,
    errorHandler = defaultErrorHandler,
} = {}) {
    return new Router({ prefix, notFoundHandler, errorHandler })
}

/**
 * @param {string} pattern
 */
function paramRegExp(pattern) {
    let i = 1
    const groups = pattern
        .replace(/\./g, '\\.')
        .replace(/\{([\w_]+)\}/g, '(?<$1>[^\/]+)')
        .replace(/\*/g, () => `(?<wildCard${i++}>.*)`)
    return new RegExp(`^${groups}$`)
}

/**
 * @param {function(http.IncomingMessage, http.ServerResponse): void|Promise<void>} handler
 * @param {function(Error, http.IncomingMessage, http.ServerResponse): void|Promise<void>} errorHandler
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function executeHandler(handler, errorHandler, req, res) {
    try {
        await handler(req, res)
    } catch (err) {
        errorHandler(err, req, res)
    }
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {void|Promise<void>}
 */
function defaultNotFoundHandler(req, res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end('Not Found')
}

/**
 * @param {Error} err
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {void|Promise<void>}
 */
function defaultErrorHandler(err, req, res) {
    console.error(err)
    if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('X-Content-Type-Options', 'nosniff')
    }
    if (!res.finished) {
        res.end('Internal Server Error')
    }
}

/**
 * @typedef Route
 * @property {string} method
 * @property {RegExp} pattern
 * @property {function(http.IncomingMessage, http.ServerResponse): void|Promise<void>} handler
 */
