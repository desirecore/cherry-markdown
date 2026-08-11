/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import mergeWith from 'lodash/mergeWith';
import { isBrowser } from '@/utils/env';
import { enqueueMermaidRender, getMermaidRenderRegistry, nextMermaidRenderId } from '@/utils/mermaid-render-queue';

const CHART_TYPES = [
  'flowchart',
  'sequence',
  'gantt',
  'journey',
  'timeline',
  'class',
  'state',
  'er',
  'pie',
  'quadrantChart',
  'xyChart',
  'requirement',
  'architecture',
  'mindmap',
  'kanban',
  'gitGraph',
  'c4',
  'sankey',
  'packet',
  'block',
  'radar',
];

const DEFAULT_OPTIONS = {
  theme: 'default',
  altFontFamily: 'sans-serif',
  fontFamily: 'sans-serif',
  themeCSS: '.label foreignObject { font-size: 90%; overflow: visible; } .label { font-family: sans-serif; }',
  startOnLoad: false,
  logLevel: 5,
  // An application-owned classic/UMD source. The Markdown input never controls it.
  src: '',
};

CHART_TYPES.forEach((type) => {
  DEFAULT_OPTIONS[type] = { useMaxWidth: false };
});

const MERMAID_SCRIPT_TIMEOUT = 15000;

function browserMermaid() {
  if (!isBrowser()) return { mermaid: null, mermaidAPI: null };
  return { mermaid: window.mermaid || null, mermaidAPI: window.mermaidAPI || null };
}

function normalizeMermaidScriptSrc(src) {
  if (!src || !isBrowser()) return false;
  try {
    const url = new URL(src, document.baseURI);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : false;
  } catch (_) {
    return false;
  }
}

function removeManagedMermaidScript(src) {
  if (!isBrowser()) return;
  Array.from(document.scripts)
    .filter((script) => script.dataset.cherryMermaidSrc === src)
    .forEach((script) => script.remove());
}

function hasManagedMermaidScript(src) {
  return isBrowser() && Array.from(document.scripts).some((script) => script.dataset.cherryMermaidSrc === src);
}

function clearStaleMermaidScriptRegistry(registry) {
  if (!registry.activeScriptSrc) return;
  const available = browserMermaid();
  if (!hasManagedMermaidScript(registry.activeScriptSrc) && !available.mermaid && !available.mermaidAPI) {
    registry.scriptLoads.delete(registry.activeScriptSrc);
    registry.activeScriptSrc = null;
  }
}

/**
 * A document-level loader shared through the Symbol.for registry. A failed load
 * is removed from the registry and DOM so a later call can retry safely.
 */
function loadMermaidScript(requestedSrc) {
  const src = normalizeMermaidScriptSrc(requestedSrc);
  if (!src) return Promise.reject(new Error('Invalid Mermaid script source.'));
  const registry = getMermaidRenderRegistry();
  clearStaleMermaidScriptRegistry(registry);
  if (registry.activeScriptSrc && registry.activeScriptSrc !== src) {
    return Promise.reject(new Error('A different Mermaid script is already loading.'));
  }
  if (registry.scriptLoads.has(src)) return registry.scriptLoads.get(src);

  registry.activeScriptSrc = src;
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.dataset.cherryMermaidSrc = src;

  const load = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };
    const fail = (error) => {
      cleanup();
      script.remove();
      registry.scriptLoads.delete(src);
      if (registry.activeScriptSrc === src) registry.activeScriptSrc = null;
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Timed out loading Mermaid.')), MERMAID_SCRIPT_TIMEOUT);
    script.onload = () => {
      cleanup();
      resolve();
    };
    script.onerror = () => fail(new Error('Unable to load Mermaid.'));
    document.head.appendChild(script);
  });
  registry.scriptLoads.set(src, load);
  return load;
}

function resetMermaidScript(src) {
  const registry = getMermaidRenderRegistry();
  registry.scriptLoads.delete(src);
  if (registry.activeScriptSrc === src) registry.activeScriptSrc = null;
  removeManagedMermaidScript(src);
}

export default class MermaidCodeEngine {
  static TYPE = 'figure';

  static install(cherryOptions, ...args) {
    mergeWith(cherryOptions, {
      engine: { syntax: { codeBlock: { customRenderer: { mermaid: new MermaidCodeEngine(...args) } } } },
    });
  }

  mermaidAPIRefs = null;
  options = DEFAULT_OPTIONS;
  hasExplicitMermaid = false;
  mermaidCanvases = new WeakMap();
  asyncMermaidCanvases = new WeakMap();
  cleanupRegistered = new WeakSet();
  mermaidLoadPromises = new Map();

  /**
   * @param {Object} mermaidOptions
   * @param {Object} [mermaidOptions.mermaid]
   * @param {Object} [mermaidOptions.mermaidAPI]
   * @param {string} [mermaidOptions.src] Trusted host-controlled classic/UMD script URL.
   */
  constructor(mermaidOptions = {}) {
    const { mermaid, mermaidAPI } = mermaidOptions;
    this.options = { ...DEFAULT_OPTIONS, ...(mermaidOptions || {}) };
    this.hasExplicitMermaid = Boolean(mermaid || mermaidAPI);
    delete this.options.mermaid;
    delete this.options.mermaidAPI;
    if (this.hasExplicitMermaid) {
      this.resolveMermaidAPIRefs(mermaid, mermaidAPI);
    } else {
      const available = browserMermaid();
      this.resolveMermaidAPIRefs(available.mermaid, available.mermaidAPI);
    }
  }

  resolveMermaidAPIRefs(mermaid, mermaidAPI) {
    const modern = mermaid && typeof mermaid.render === 'function' ? mermaid : null;
    const legacy = mermaidAPI || mermaid?.mermaidAPI;
    const candidate = modern || legacy;
    if (!candidate || typeof candidate.render !== 'function') return false;
    // v10+ must use the module-level render API; old APIs use the callback facade.
    this.mermaidAPIRefs = modern && modern.render.length <= 3 ? modern : legacy || modern;
    return typeof this.mermaidAPIRefs.render === 'function';
  }

  tryResolveBrowserMermaid() {
    if (this.hasExplicitMermaid || this.mermaidAPIRefs) return Boolean(this.mermaidAPIRefs);
    const available = browserMermaid();
    return this.resolveMermaidAPIRefs(available.mermaid, available.mermaidAPI);
  }

  isAsyncRenderVersion() {
    return Boolean(this.mermaidAPIRefs && this.mermaidAPIRefs.render.length <= 3);
  }

  initializeMermaid() {
    try {
      this.mermaidAPIRefs?.initialize?.(this.options);
    } catch (_) {
      // Mermaid can report an already-initialised parser. Rendering remains safe.
    }
  }

  registerEngineCleanup($engine) {
    if (this.cleanupRegistered.has($engine)) return;
    this.cleanupRegistered.add($engine);
    $engine.onDestroy?.(() => {
      this.mermaidCanvases.get($engine)?.remove();
      this.mermaidCanvases.delete($engine);
      this.asyncMermaidCanvases.get($engine)?.forEach((canvas) => canvas.remove());
      this.asyncMermaidCanvases.delete($engine);
      this.cleanupRegistered.delete($engine);
    });
  }

  mountMermaidCanvas($engine) {
    this.registerEngineCleanup($engine);
    const oldCanvas = this.mermaidCanvases.get($engine);
    if (oldCanvas && document.body.contains(oldCanvas)) return oldCanvas;
    const canvas = document.createElement('div');
    canvas.style.cssText = 'width:1024px;opacity:0;position:fixed;top:100%;';
    const container = this.options.mermaidCanvasAppendDom || $engine.$cherry.wrapperDom || document.body;
    container.appendChild(canvas);
    this.mermaidCanvases.set($engine, canvas);
    return canvas;
  }

  createAsyncRenderCanvas($engine) {
    this.registerEngineCleanup($engine);
    const canvas = document.createElement('div');
    canvas.style.cssText = 'width:1024px;opacity:0;position:fixed;top:100%;';
    const container = this.options.mermaidCanvasAppendDom || $engine.$cherry.wrapperDom || document.body;
    container.appendChild(canvas);
    const canvases = this.asyncMermaidCanvases.get($engine) || new Set();
    canvases.add(canvas);
    this.asyncMermaidCanvases.set($engine, canvases);
    return canvas;
  }

  removeAsyncRenderCanvas($engine, canvas) {
    canvas.remove();
    const canvases = this.asyncMermaidCanvases.get($engine);
    canvases?.delete(canvas);
  }

  convertMermaidSvgToImg(svgCode, graphId, svg2img) {
    const injectSvgFallback = (svg) =>
      svg.replace('<svg ', '<svg style="max-width:100%;height:auto;font-family:sans-serif;" ');
    try {
      const svgDoc = /** @type {XMLDocument} */ (new DOMParser().parseFromString(svgCode, 'image/svg+xml'));
      const svgDom = /** @type {SVGSVGElement} */ (/** @type {any} */ (svgDoc.documentElement));
      if (svgDom.tagName.toLowerCase() !== 'svg') return injectSvgFallback(svgCode);
      svgDom.style.maxWidth = '100%';
      svgDom.style.height = 'auto';
      svgDom.style.fontFamily = 'sans-serif';
      const shadowSvg = /** @type {SVGSVGElement} */ (/** @type {any} */ (document.getElementById(graphId)));
      let svgBox = shadowSvg?.getBBox?.();
      if (!svgDom.hasAttribute('viewBox') && svgBox)
        svgDom.setAttribute('viewBox', `0 0 ${svgBox.width} ${svgBox.height}`);
      if (svgDom.hasAttribute('viewBox')) svgBox = svgDom.viewBox.baseVal;
      if (svgBox && svgDom.getAttribute('width') === '100%') svgDom.setAttribute('width', `${svgBox.width}`);
      if (svgBox && svgDom.getAttribute('height') === '100%') svgDom.setAttribute('height', `${svgBox.height}`);
      const html = svgDoc.documentElement.outerHTML;
      return svg2img
        ? `<img class="svg-img" style="max-width:100%;height:auto;" src="data:image/svg+xml,${encodeURIComponent(html)}" alt="${graphId}" />`
        : html;
    } catch (_) {
      return injectSvgFallback(svgCode);
    }
  }

  processSvgCode(svgCode, graphId, svg2img) {
    return this.convertMermaidSvgToImg(
      svgCode
        .replace(/\s*markerUnits="0"/g, '')
        .replace(/\s*x="NaN"/g, '')
        .replace(/<br>/g, '<br/>'),
      graphId,
      svg2img,
    );
  }

  isCurrentRender($engine, version) {
    return $engine.asyncRenderHandler.renderVersion === version;
  }

  handleAsyncRenderDone(graphId, sign, $engine, props, html, version) {
    if (!this.isCurrentRender($engine, version)) return;
    props.updateCache(html);
    if (isBrowser()) {
      const container = $engine.$cherry.wrapperDom || document.body;
      container.querySelectorAll(`[data-sign="${sign}"][data-type="codeBlock"]`).forEach((placeholder) => {
        placeholder.parentElement.innerHTML = html;
      });
    }
    $engine.asyncRenderHandler.done(graphId, {
      replacer: (md) => {
        const regex = new RegExp(
          `(<figure\\s+data-sign="${sign}"\\s+data-type="mermaid"[^>]*>)[\\s\\S]*?(<\\/figure>)`,
          'g',
        );
        return md.replace(regex, (_, opening, closing) => `${opening}${html}${closing}`);
      },
    });
  }

  async renderResolved(graphId, src, sign, $engine, props, version) {
    const api = this.mermaidAPIRefs;
    if (!api) throw new Error('Mermaid is unavailable.');
    await enqueueMermaidRender(api, async () => {
      if (!this.isCurrentRender($engine, version)) return;
      this.initializeMermaid();
      const svg2img = props.mermaidConfig?.svg2img ?? false;
      let svgCode;
      if (this.isAsyncRenderVersion()) {
        const canvas = this.createAsyncRenderCanvas($engine);
        try {
          const result = await api.render(graphId, src, canvas);
          svgCode = result.svg;
        } finally {
          this.removeAsyncRenderCanvas($engine, canvas);
        }
      } else {
        const canvas = this.mountMermaidCanvas($engine);
        svgCode = await new Promise((resolve, reject) => {
          try {
            api.render(graphId, src, (svg) => resolve(svg), canvas);
          } catch (error) {
            reject(error);
          }
        });
      }
      if (!this.isCurrentRender($engine, version)) return;
      this.handleAsyncRenderDone(
        graphId,
        sign,
        $engine,
        props,
        this.processSvgCode(svgCode, graphId, svg2img),
        version,
      );
    });
  }

  ensureMermaidLoaded(src) {
    if (this.mermaidAPIRefs) return Promise.resolve(true);
    const normalizedSrc = normalizeMermaidScriptSrc(src);
    if (!normalizedSrc || this.hasExplicitMermaid) return null;
    if (this.mermaidLoadPromises.has(normalizedSrc)) return this.mermaidLoadPromises.get(normalizedSrc);
    const loading = loadMermaidScript(normalizedSrc)
      .then(() => {
        if (!this.tryResolveBrowserMermaid()) {
          resetMermaidScript(normalizedSrc);
          throw new Error('Loaded Mermaid script did not expose an API.');
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.mermaidLoadPromises.delete(normalizedSrc);
      });
    this.mermaidLoadPromises.set(normalizedSrc, loading);
    return loading;
  }

  asyncRender(graphId, src, sign, $engine, props) {
    const version = $engine.asyncRenderHandler.renderVersion;
    const fallback = () => props.fallback();
    const finishFallback = () => this.handleAsyncRenderDone(graphId, sign, $engine, props, fallback(), version);
    $engine.asyncRenderHandler.add(graphId);
    const render = () => this.renderResolved(graphId, src, sign, $engine, props, version).catch(finishFallback);
    if (this.mermaidAPIRefs) {
      render();
    } else {
      const loading = this.ensureMermaidLoaded(props.mermaidConfig?.src || this.options.src);
      if (loading) loading.then((available) => (available ? render() : finishFallback()));
      else finishFallback();
    }
    return fallback();
  }

  syncRender(graphId, src, $engine, props) {
    this.initializeMermaid();
    const canvas = this.mountMermaidCanvas($engine);
    let svgCode;
    try {
      this.mermaidAPIRefs.render(
        graphId,
        src,
        (svg) => {
          svgCode = svg;
        },
        canvas,
      );
      if (!svgCode) return props.fallback();
      return this.processSvgCode(svgCode, graphId, props.mermaidConfig?.svg2img ?? false);
    } catch (_) {
      return props.fallback();
    }
  }

  render(src, sign, $engine, props = {}) {
    const $sign = sign || Math.round(Math.random() * 100000000);
    const graphId = `mermaid-${$sign}-${nextMermaidRenderId('graph')}`;
    // Legacy Mermaid invokes its callback synchronously. Preserve the public
    // custom-renderer contract for explicitly available v9 APIs; no async work
    // can interleave during this JavaScript call.
    if (this.mermaidAPIRefs && !this.isAsyncRenderVersion()) {
      return this.syncRender(graphId, src, $engine, props);
    }
    return this.asyncRender(graphId, src, $sign, $engine, props);
  }
}
