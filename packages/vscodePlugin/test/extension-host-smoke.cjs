const vscode = require('vscode');

exports.run = async () => {
  const extension = vscode.extensions.all.find(
    (candidate) =>
      candidate.packageJSON.name === 'cherry-markdown' &&
      candidate.packageJSON.publisher === 'cherryMarkdownPublisher',
  );

  if (!extension) {
    throw new Error('The packaged Cherry Markdown extension was not discovered by the Extension Host');
  }
  if (extension.extensionPath !== process.env.VSIX_EXTENSION_PATH) {
    throw new Error(`Extension Host selected ${extension.extensionPath}, not the unpacked verified VSIX payload`);
  }

  await extension.activate();
  if (!extension.isActive) {
    throw new Error('The packaged Cherry Markdown extension did not activate');
  }

  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes('cherrymarkdown.preview')) {
    throw new Error('The packaged Cherry Markdown preview command was not registered after activation');
  }

  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: '# VSIX Extension Host smoke',
  });
  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('cherrymarkdown.preview');
};
