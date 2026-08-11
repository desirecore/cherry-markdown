import * as vscode from 'vscode';

type WebviewResource = Pick<vscode.Webview, 'asWebviewUri' | 'cspSource'>;

function resourceUri(webview: WebviewResource, extensionUri: vscode.Uri, ...segments: string[]): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...segments));
}

/** The shell intentionally has no document content: it arrives only after the ready handshake. */
export function getWebviewContent(currentPanel: { webview: WebviewResource }, extensionUri: vscode.Uri): string {
  const { webview } = currentPanel;
  const resources = {
    baseCss: resourceUri(webview, extensionUri, 'web-resources', 'index.css'),
    cherryCss: resourceUri(webview, extensionUri, 'web-resources', 'dist', 'super-doc.min.css'),
    customCss: resourceUri(webview, extensionUri, 'web-resources', 'scripts', 'index.css'),
    cherry: resourceUri(webview, extensionUri, 'web-resources', 'dist', 'super-doc.js'),
    pinyin: resourceUri(webview, extensionUri, 'web-resources', 'scripts', 'pinyin', 'pinyin_dist.js'),
    webview: resourceUri(webview, extensionUri, 'web-resources', 'dist', 'index.js'),
    font: resourceUri(webview, extensionUri, 'web-resources', 'dist', 'fonts', 'ch-icon.woff2'),
  };
  return `<!DOCTYPE html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; img-src ${webview.cspSource} https: http: data:; script-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource};">
  <title>Cherry Markdown</title>
  <link rel="preload" as="font" href="${resources.font}" crossorigin="anonymous">
  <link rel="stylesheet" type="text/css" href="${resources.cherryCss}">
  <link rel="stylesheet" type="text/css" href="${resources.baseCss}">
  <link rel="stylesheet" type="text/css" href="${resources.customCss}">
</head>
<body>
  <div id="dom_mask"></div>
  <div id="markdown" class="markdown-preview-only"></div>
  <div id="webview-status" role="status" aria-live="polite" aria-atomic="true"></div>
  <script src="${resources.cherry}"></script>
  <script src="${resources.pinyin}"></script>
  <script src="${resources.webview}"></script>
</body>
</html>`;
}
