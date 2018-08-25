const contexts = /** @type {WeakMap<any, Map>} */ (new WeakMap())

/**
 * @param {any} key
 * @returns {Map}
 */
export function contextFor(key) {
    if (contexts.has(key)) {
        return contexts.get(key)
    }

    const context = new Map()
    contexts.set(key, context)
    return context
}
