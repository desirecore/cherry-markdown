/* global globalThis */
/**
 * Mermaid keeps mutable configuration and DOM state on the Mermaid object.  The
 * registry deliberately lives on the JavaScript runtime rather than this module:
 * the core bundle and the separately-loaded add-on bundle must share it too.
 */
const REGISTRY_KEY = Symbol.for('desirecore.super-doc.mermaid-render-registry');

function getRegistry() {
  const runtime = /** @type {Record<PropertyKey, any>} */ (globalThis);
  if (!runtime[REGISTRY_KEY]) {
    runtime[REGISTRY_KEY] = {
      renderTails: new WeakMap(),
      renderSequence: 0,
      scriptLoads: new Map(),
      activeScriptSrc: null,
    };
  }
  return runtime[REGISTRY_KEY];
}

/**
 * Run work serially for one Mermaid object. Rejections do not poison later work.
 * @template T
 * @param {object} mermaid
 * @param {() => Promise<T> | T} render
 * @returns {Promise<T>}
 */
export function enqueueMermaidRender(mermaid, render) {
  const registry = getRegistry();
  const tail = registry.renderTails.get(mermaid) || Promise.resolve();
  const queued = tail.then(render, render);
  registry.renderTails.set(
    mermaid,
    queued.catch(() => undefined),
  );
  return queued;
}

/**
 * IDs must remain unique when core and add-on bundles are both in use.
 * @param {string} prefix
 */
export function nextMermaidRenderId(prefix) {
  const registry = getRegistry();
  registry.renderSequence += 1;
  return `${prefix}-${registry.renderSequence}`;
}

export function getMermaidRenderRegistry() {
  return getRegistry();
}
