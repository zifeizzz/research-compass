# 研途导航 · Research Compass

公开科研导航版，提供论文检索、古地磁、GIS、地学数据、模型与科研工具入口。

访客页面只读。站长通过 GitHub 身份验证后，可直接在网页中添加、编辑、删除链接；修改写入 `sites.json` 并触发 GitHub Pages 自动发布。

## 站长管理

打开网站底部的“站长管理”，或访问 `https://zifeizzz.github.io/research-compass/#admin`。

使用 GitHub 账号 `zifeizzz` 创建一个 Fine-grained personal access token，仅选择 `research-compass` 仓库，将 Contents 权限设为 Read and write。将令牌粘贴到管理页的密码输入框后验证。令牌只保存在当前页面内存中，不写入仓库、localStorage 或 sessionStorage；刷新或关闭后需重新验证。

保存和删除均直接修改共享清单。GitHub 的仓库权限负责校验写入权限，页面同时校验账号是否为站长。更新使用文件 SHA 避免多处编辑互相覆盖；冲突时重新载入后重试。提交后自动发布，通常需要数分钟；访客也会尝试直接读取 GitHub 最新清单。

旧版本保存在浏览器中的个人修改不会自动公开。站长可在同一浏览器中用“导出旧本机清单”保存备份。

## GitHub Pages

推送到 `main` 分支后，GitHub Actions 会自动发布到 GitHub Pages。
