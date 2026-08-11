import * as path from 'path';
import * as vscode from 'vscode';
import { getTheme, getUsageMode, migrateImageUploadMode, migrateTheme, THEME_STATE_KEY } from './config';
import { uploadFileHandler } from './handler/uploadFile';
import { parseWebviewMessage, type EditorState, type ExtensionToWebviewMessage } from './protocol';
import { calculateTextReplacement } from './textEdit';
import { getWebviewContent } from './webview';

const MAX_PNG_BYTES = 50 * 1024 * 1024;

function sameUri(left: vscode.Uri | undefined, right: vscode.Uri | undefined): boolean {
  return left?.toString() === right?.toString();
}

function uriDirectory(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: path.posix.dirname(uri.path), query: '', fragment: '' });
}

class CherryMarkdownPreview implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private targetEditor: vscode.TextEditor | undefined;
  private messageDisposable: vscode.Disposable | undefined;
  private webviewReady = false;
  private suppressEditorScroll = false;
  private scrollTimeout: ReturnType<typeof setTimeout> | undefined;
  private pendingWebviewText: string | undefined;
  private editQueue: Promise<void> = Promise.resolve();
  private panelGeneration = 0;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  register(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand('cherrymarkdown.preview', () => this.show(true)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.handleActiveEditorChange(editor)),
      vscode.workspace.onDidChangeTextDocument((event) => this.handleDocumentChange(event)),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.handleVisibleRangesChange(event)),
      vscode.workspace.onDidChangeConfiguration((event) => this.handleConfigurationChange(event)),
    );
    void this.handleActiveEditorChange(vscode.window.activeTextEditor);
  }

  dispose(): void {
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.messageDisposable?.dispose();
    this.panel?.dispose();
  }

  private async show(manual: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.languageId === 'markdown') this.targetEditor = editor;
    if (!this.targetEditor || (!manual && getUsageMode(this.targetEditor.document.uri) !== 'active')) return;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      this.updateResourceRoots();
      await this.postEditorState('editor-change');
      return;
    }

    this.panel = vscode.window.createWebviewPanel('cherrymarkdown.preview', this.getTitle(), vscode.ViewColumn.Two, {
      enableScripts: true,
      enableForms: false,
      retainContextWhenHidden: false,
      localResourceRoots: this.getResourceRoots(),
    });
    this.panelGeneration += 1;
    this.panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'favicon.ico');
    this.panel.webview.html = getWebviewContent(this.panel, this.context.extensionUri);
    this.webviewReady = false;
    this.panel.onDidDispose(() => this.resetPanel(), undefined, this.context.subscriptions);
    this.panel.onDidChangeViewState(
      ({ webviewPanel }) => {
        if (webviewPanel.visible && this.webviewReady) void this.postEditorState('editor-change');
      },
      undefined,
      this.context.subscriptions,
    );
    this.registerWebviewMessages();
  }

  private resetPanel(): void {
    this.panelGeneration += 1;
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.messageDisposable?.dispose();
    this.messageDisposable = undefined;
    this.panel = undefined;
    this.webviewReady = false;
    this.pendingWebviewText = undefined;
    this.suppressEditorScroll = false;
  }

  private registerWebviewMessages(): void {
    if (!this.panel) return;
    this.messageDisposable?.dispose();
    this.messageDisposable = this.panel.webview.onDidReceiveMessage((raw: unknown) => {
      const message = parseWebviewMessage(raw);
      if (!message) {
        this.output.appendLine('[protocol] Ignored invalid Webview message.');
        return;
      }
      switch (message.type) {
        case 'ready':
          this.webviewReady = true;
          void this.postEditorState('editor-init').then(() =>
            this.postMessage({ cmd: this.isEditEnabled() ? 'enable-edit' : 'disable-edit', data: {} }),
          );
          return;
        case 'preview-scroll':
          this.revealEditorLine(message.data);
          return;
        case 'change-theme':
          void this.updateTheme(message.data);
          return;
        case 'editor-change':
          this.editQueue = this.editQueue
            .then(() => this.applyWebviewEdit(message.data))
            .catch(async (error: unknown) => {
              this.reportError('editor-change', error);
              await this.postOperationError(
                'editor-change',
                vscode.l10n.t('Unable to apply the preview edit.'),
                message.data.requestId,
              );
              await this.postEditorState('editor-change');
            });
          return;
        case 'show-message':
          void vscode.window.showInformationMessage(message.data);
          return;
        case 'upload-file':
          if (!this.targetEditor || this.targetEditor.document.uri.toString() !== message.data.documentUri) {
            void this.postOperationError(
              'upload-file',
              vscode.l10n.t('The upload document is no longer active.'),
              message.data.requestId,
            );
            return;
          }
          void this.uploadFile(message.data, this.targetEditor.document.uri);
          return;
        case 'open-url':
          void this.openUrl(message.data);
          return;
        case 'export-png':
          void this.exportPng(message.data);
          return;
      }
    });
  }

  private async handleActiveEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
    if (editor?.document.languageId === 'markdown') {
      this.targetEditor = editor;
      if (this.panel) {
        this.updateResourceRoots();
        await this.postMessage({ cmd: 'enable-edit', data: {} });
        await this.postEditorState('editor-change');
      } else if (getUsageMode(editor.document.uri) === 'active') {
        await this.show(false);
      }
      return;
    }
    if (this.panel) await this.postMessage({ cmd: 'disable-edit', data: {} });
  }

  private isEditEnabled(): boolean {
    const active = vscode.window.activeTextEditor;
    return Boolean(
      active?.document.languageId === 'markdown' &&
      this.targetEditor &&
      sameUri(active.document.uri, this.targetEditor.document.uri),
    );
  }

  private async handleDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    if (!this.targetEditor || !sameUri(event.document.uri, this.targetEditor.document.uri)) return;
    if (this.pendingWebviewText === event.document.getText()) {
      this.pendingWebviewText = undefined;
      return;
    }
    this.pendingWebviewText = undefined;
    await this.postEditorState('editor-change');
  }

  private handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (
      !this.panel ||
      !this.targetEditor ||
      !sameUri(event.textEditor.document.uri, this.targetEditor.document.uri) ||
      this.suppressEditorScroll ||
      event.visibleRanges.length === 0
    )
      return;
    void this.postMessage({ cmd: 'editor-scroll', data: event.visibleRanges[0].start.line });
  }

  private async handleConfigurationChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
    if (!this.targetEditor) return;
    if (
      !this.panel &&
      event.affectsConfiguration('cherryMarkdown.Usage', this.targetEditor.document.uri) &&
      getUsageMode(this.targetEditor.document.uri) === 'active'
    )
      await this.show(false);
  }

  private async applyWebviewEdit(data: {
    documentUri: string;
    baseVersion: number;
    requestId: number;
    markdown: string;
  }): Promise<void> {
    if (!this.isEditEnabled()) {
      await this.postOperationError(
        'editor-change',
        vscode.l10n.t('The preview document is no longer active.'),
        data.requestId,
      );
      await this.postEditorState('editor-change');
      return;
    }
    const editor = this.targetEditor;
    if (!editor || editor.document.uri.toString() !== data.documentUri) {
      await this.postOperationError(
        'editor-change',
        vscode.l10n.t('The preview document is no longer active.'),
        data.requestId,
      );
      await this.postEditorState('editor-change');
      return;
    }
    const { document } = editor;
    if (document.version !== data.baseVersion) {
      await this.postOperationError(
        'editor-change',
        vscode.l10n.t('The document changed outside the preview.'),
        data.requestId,
      );
      await this.postEditorState('editor-change');
      return;
    }
    const markdown = data.markdown.replace(/\r?\n/g, document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
    const replacement = calculateTextReplacement(document.getText(), markdown);
    if (!replacement) {
      await this.postMessage({
        cmd: 'editor-ack',
        data: { requestId: data.requestId, documentVersion: document.version, text: document.getText() },
      });
      return;
    }
    this.pendingWebviewText = markdown;
    if (
      !(await editor.edit((editBuilder) => {
        editBuilder.replace(
          new vscode.Range(document.positionAt(replacement.startOffset), document.positionAt(replacement.endOffset)),
          replacement.text,
        );
      }))
    ) {
      this.pendingWebviewText = undefined;
      await this.postOperationError(
        'editor-change',
        vscode.l10n.t('Unable to apply the preview edit.'),
        data.requestId,
      );
      await this.postEditorState('editor-change');
      return;
    }
    await this.postMessage({
      cmd: 'editor-ack',
      data: { requestId: data.requestId, documentVersion: document.version, text: document.getText() },
    });
  }

  private revealEditorLine(line: number): void {
    if (!this.targetEditor) return;
    const lastLine = Math.max(0, this.targetEditor.document.lineCount - 1);
    const position = new vscode.Position(line < 0 ? lastLine : Math.min(Math.floor(line), lastLine), 0);
    this.suppressEditorScroll = true;
    this.targetEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.suppressEditorScroll = false;
    }, 150);
  }

  private async updateTheme(theme: string): Promise<void> {
    await this.context.globalState.update(THEME_STATE_KEY, theme);
    await this.postEditorState('editor-change');
  }

  private async uploadFile(file: Parameters<typeof uploadFileHandler>[0], resource: vscode.Uri): Promise<void> {
    const panel = this.panel;
    const generation = this.panelGeneration;
    try {
      const result = await uploadFileHandler(file, resource);
      if (
        generation === this.panelGeneration &&
        panel === this.panel &&
        sameUri(resource, this.targetEditor?.document.uri)
      )
        await this.postMessage({ cmd: 'upload-file-result', data: result }, panel);
    } catch (error: unknown) {
      this.reportError('upload-file', error);
      if (generation === this.panelGeneration && panel === this.panel) {
        await this.postOperationError('upload-file', vscode.l10n.t('Upload failed.'), file.requestId, panel);
      }
    }
  }

  private async openUrl(rawUrl: string): Promise<void> {
    if (!rawUrl) return void vscode.window.showErrorMessage(vscode.l10n.t('The link is invalid.'));
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawUrl);
    } catch {
      return void vscode.window.showErrorMessage(vscode.l10n.t('The link is invalid.'));
    }
    if (/^https?:\/\//i.test(rawUrl)) {
      try {
        const url = new URL(rawUrl);
        if (!url.hostname || /[\u0000-\u001f]/.test(rawUrl)) throw new Error('Invalid URL');
        await vscode.env.openExternal(vscode.Uri.parse(rawUrl));
      } catch {
        await vscode.window.showErrorMessage(vscode.l10n.t('The link is invalid.'));
      }
      return;
    }
    if (decoded.startsWith('#')) return;
    if (/^[a-z][a-z\d+.-]*:/i.test(decoded) && !path.win32.isAbsolute(decoded)) {
      await vscode.window.showErrorMessage(vscode.l10n.t('This link protocol is not allowed.'));
      return;
    }
    if (!this.targetEditor) return;
    const reference = vscode.Uri.parse(decoded);
    const target =
      path.win32.isAbsolute(reference.fsPath) || path.posix.isAbsolute(reference.path)
        ? vscode.Uri.file(reference.fsPath)
        : vscode.Uri.joinPath(uriDirectory(this.targetEditor.document.uri), reference.path);
    await vscode.commands.executeCommand(
      'vscode.open',
      target.with({ query: reference.query, fragment: reference.fragment }),
      { preview: true },
    );
  }

  private async exportPng(data: string): Promise<void> {
    if (data === 'export-fail')
      return void vscode.window.showErrorMessage(vscode.l10n.t('Unable to export the preview as PNG.'));
    const base64 = data.slice('data:image/png;base64,'.length);
    if (
      Math.floor((base64.length * 3) / 4) > MAX_PNG_BYTES ||
      base64.length % 4 !== 0 ||
      !/^[A-Za-z\d+/]*={0,2}$/.test(base64)
    ) {
      await vscode.window.showErrorMessage(vscode.l10n.t('Unable to export the preview as PNG.'));
      return;
    }
    const uri = await vscode.window.showSaveDialog({
      filters: { Images: ['png'] },
      saveLabel: vscode.l10n.t('Save PNG'),
    });
    if (!uri) return;
    try {
      const buffer = Buffer.from(base64, 'base64');
      if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Not PNG');
      await vscode.workspace.fs.writeFile(uri, buffer);
      await vscode.window.showInformationMessage(vscode.l10n.t('Image saved successfully.'));
    } catch (error: unknown) {
      this.reportError('export-png', error);
      await vscode.window.showErrorMessage(vscode.l10n.t('Unable to save the PNG.'));
    }
  }

  private getEditorState(): EditorState | undefined {
    const editor = this.targetEditor;
    if (editor?.document.languageId !== 'markdown' || !this.panel) return undefined;
    const { document } = editor;
    return {
      text: document.getText(),
      theme: getTheme(this.context.globalState, document.uri),
      documentUri: document.uri.toString(),
      documentVersion: document.version,
      resourceUri: this.panel.webview.asWebviewUri(document.uri).toString(),
    };
  }

  private async postEditorState(cmd: 'editor-init' | 'editor-change'): Promise<void> {
    const state = this.getEditorState();
    if (!state || !this.webviewReady) return;
    if (this.panel) this.panel.title = this.getTitle();
    await this.postMessage({ cmd, data: state });
  }

  private async postOperationError(
    operation: string,
    message: string,
    requestId?: number,
    panel = this.panel,
  ): Promise<void> {
    await this.postMessage({ cmd: 'operation-error', data: { operation, message, requestId } }, panel);
  }

  private async postMessage(message: ExtensionToWebviewMessage, panel = this.panel): Promise<boolean> {
    return (await panel?.webview.postMessage(message)) ?? false;
  }

  private updateResourceRoots(): void {
    if (!this.panel) return;
    this.panel.webview.options = {
      enableScripts: true,
      enableForms: false,
      localResourceRoots: this.getResourceRoots(),
    };
  }

  private getResourceRoots(): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, 'web-resources')];
    if (!this.targetEditor) return roots;
    roots.push(
      vscode.workspace.getWorkspaceFolder(this.targetEditor.document.uri)?.uri ??
        uriDirectory(this.targetEditor.document.uri),
    );
    return roots;
  }

  private getTitle(): string {
    return this.targetEditor
      ? `${vscode.l10n.t('Preview')} ${path.posix.basename(this.targetEditor.document.uri.path)} · Cherry Markdown`
      : 'Cherry Markdown';
  }

  private reportError(operation: string, error: unknown): void {
    this.output.appendLine(`[${operation}] ${error instanceof Error ? error.message : String(error)}`);
  }
}

let preview: CherryMarkdownPreview | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cherry Markdown');
  preview = new CherryMarkdownPreview(context, output);
  preview.register();
  context.subscriptions.push(output, preview);
  void migrateTheme(context.globalState);
  void migrateImageUploadMode(context.globalState);
}

export function deactivate(): void {
  preview?.dispose();
  preview = undefined;
}
