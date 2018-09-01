import * as url from 'url';
import { contextFor } from './context.js';

/**
 * @typedef {function(import('http').IncomingMessage, import('http').ServerResponse): void|Promise<void>} Handler
 */

/**
 * @typedef Route
 * @property {string} method
 * @property {RegExp} pattern
 * @property {Handler} handler
 */

/**
 * @typedef Options
 * @property {Handler=} notFoundHandler
 * @property {function(import('http').IncomingMessage, import('http').ServerResponse, Error): void|Promise<void>=} errorHandler
 */

const _routes = Symbol('_routes')
const _executeHandler = Symbol('_executeHandler')

export class Router {
    /**
     * @param {Options=} opts
     */
    constructor(opts) {
        const withOpts = isObject(opts)
        this.notFoundHandler = withOpts && 'notFoundHandler' in opts ? opts.notFoundHandler : defaultNotFoundHandler
        this.errorHandler = withOpts && 'errorHandler' in opts ? opts.errorHandler : defaultErrorHandler

        this[_routes] = /** @type {Route[]} */ ([])

        this.handle = this.handle.bind(this)
        this.handler = this.handler.bind(this)
        this[_executeHandler] = this[_executeHandler].bind(this)
    }

    /**
     * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'|'*'} method
     * @param {string|RegExp} pattern
     * @param {Handler} handler
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
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     */
    handler(req, res) {
        const { pathname } = url.parse(req.url)
        for (const route of this[_routes]) {
            if (route.method !== req.method && route.method !== '*') {
                continue
            }

            const match = route.pattern.exec(pathname)
            if (match === null) {
                continue
            }

            const params = match.slice(1).map(decodeURIComponent)
            if (isObject(match.groups)) {
                for (const [k, v] of Object.entries(match.groups)) {
                    params[k] = decodeURIComponent(v)
                }
            }

            contextFor(req).set('params', params)
            this[_executeHandler](req, res, route.handler)
            return
        }

        this[_executeHandler](req, res)
    }

    /**
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     * @param {Handler} handler
     */
    async [_executeHandler](req, res, handler = this.notFoundHandler) {
        try {
            await handler(req, res)
        } catch (err) {
            this.errorHandler(req, res, err)
        }
    }
}

/**
 * @param {Options=} opts
 */
export function createRouter(opts) {
    return new Router(opts)
}

function isObject(obj) {
    return typeof obj === 'object' && obj !== null
}

/**
 * @param {string} pattern
 */
function paramRegExp(pattern) {
    const groups = pattern
        .replace(/\./g, '\\.')
        .replace(/\{([^}]+)\}/g, '(?<$1>[^\/]+)')
        .replace(/\*/g, () => `(?<_>.*)`)
    return new RegExp(`^${groups}$`)
}

/**
 * @param {import('http').ServerResponse} res
 */
function defaultNotFoundHandler(_, res) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end('Not Found')
}

/**
 * @param {import('http').ServerResponse} res
 * @param {Error} err
 */
function defaultErrorHandler(_, res, err) {
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
