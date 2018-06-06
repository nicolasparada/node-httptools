const contexts = /** @type {WeakMap<any, Map>} */ (new WeakMap())

/**
 * @param {any} key
 */
export function contextFor(key) {
    if (contexts.has(key)) {
        return contexts.get(key)
    }

    const context = new Map()
    contexts.set(key, context)
    return context
}