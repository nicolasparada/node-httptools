import * as url from 'url';

/**
 * @param {string} prefix
 * @param {import('./router.js').Handler} handler
 * @returns {import('./router.js').Handler}
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
