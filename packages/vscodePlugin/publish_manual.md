# 发布 VSIX

生产 Marketplace 发布的唯一入口是 GitHub Actions 的 **Publish Verified VSIX** 工作流。禁止使用全局 `vsce`、本地发布命令、PR preview 发布或其他分支上的工作流。

## 发布前提

1. 待发布提交必须位于 `main`。工作流会同时验证仓库为 `desirecore/super-doc`、ref 为 `refs/heads/main`，并要求手动填写 `confirm_publish=true`。
2. 先完成该提交的 **VSIX Delivery** 工作流。它必须已生成并验证归档、上传 artifact，并通过 VSIX 安装与 Extension Host smoke。
3. 在仓库设置中创建受保护的 `vscode-marketplace` Environment：
   - 配置外部环境 reviewers，要求发行负责人审批；
   - Deployment branches 只允许受保护的 `main`；
   - 只在该 Environment 中保存 `VSCE_PAT`，不要把 token 放到 repository 或 workflow secrets。
4. 确认 `packages/vscodePlugin/package.json` 的版本尚未在 Marketplace 发布。

## 操作

1. 在 GitHub Actions 选择 **Publish Verified VSIX**。
2. 选择 `main`，并将 `confirm_publish` 设为 `true`。
3. 等待 `vscode-marketplace` Environment 审批。工作流会用锁定的本地 VSCE 重新构建、验证并上传本次将发布的 artifact。
4. 仅在归档验证通过后，工作流才会使用该 artifact 和 Environment 中的 `VSCE_PAT` 执行 `vsce publish --packagePath`。

发布 workflow 不会自动触发，也不会从 fork、PR 或非 `main` ref 发布。
