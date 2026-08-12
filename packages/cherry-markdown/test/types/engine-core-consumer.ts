import CherryEngine, { enqueueMermaidRender } from '@desirecore/super-doc/dist/super-doc.engine.core.esm.js';

const engine = new CherryEngine({});

// The deep entry constructs Engine at runtime, so makeHtml must remain visible
// to TypeScript consumers of the published ESM entry.
const html: string | object = engine.makeHtml('# typed engine core');

// The constructor keeps the static API in addition to its Engine instance API.
CherryEngine.config.defaults;
CherryEngine.usePlugin;

void enqueueMermaidRender({}, async () => undefined);
void html;
