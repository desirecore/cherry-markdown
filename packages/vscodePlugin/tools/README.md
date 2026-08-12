# VSIX tooling lock

This private npm package locks only `@vscode/vsce` and `@vscode/test-electron` for the VSIX delivery workflow. It is intentionally separate from the root Yarn workspace: adding these delivery-only tools to the root lock would require a full workspace dependency resolution, while the workflow installs this directory with `npm ci --ignore-scripts` after the root's frozen, script-free Yarn install. The tooling requires Node 20.18.1+, so the workflows pin Node 20.20.0.

This directory is excluded from the VSIX archive. Update `package.json` and `package-lock.json` together with an explicit tooling review.
