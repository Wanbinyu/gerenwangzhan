# 万彬宇

个人主页。面向中文读者介绍 Agent 应用、RAG、Java / Python 后端、商业服务端与开源实践，保留原有轻量静态页面和 ASCII 视觉。

线上：<https://portfolio.wanbinxy.icu/>；GitHub Pages：<https://wanbinyu.github.io/gerenwangzhan/>。

2026-10-29 内容更新：Resume Fit AI 求职助手与 RAG 为重点，先说明用途和用法，再展开技术实现与评测。陪伴 Agent 标为 M0 PC 私有原型，启动器、公司知识库与墨香阁紧凑展示，其余项目按需展开。城市内容台与 GEO 线上已暂停。

2026-10-30 同步求职助手最新状态：个人介绍、首页 ASCII 文案和重点项目卡片改为 Agent 求职助手，说明简历体检、版本选择、完整 JD 对比、公司资料与手动投递跟进。分层重构与界面更新已在简历服务器发布；求职助手项目的公开 GitHub 仓库仍待同步。保留桌面原始 PDF 和既有简历资源指纹。

下载与贡献统计注明核验日期；不将特定评测样本结果写成普遍保证。两段工作经历均为陕西森豪齐创，页面不展示任职时间；项目卡片不直接链接个人 GitHub 项目仓库，保留个人主页和上游贡献核验入口。“查看简历”使用 2026-10-29 指定的最新版 PDF，按原文件复制到 `public/resume-ai.pdf`，不改文档内容，并使用内容指纹参数避免旧缓存。简历链接采用相对路径，兼容自定义域名与 GitHub Pages 项目子目录。

本地预览：

```bash
npm install
npm run dev
```

验证：`npm run build`（TypeScript 检查与 Vite 生产构建）。推送到 `main` 后，GitHub Actions 构建并发布到 GitHub Pages；该工作流不负责上述自定义域名的服务器版本。

自定义域名采用服务器静态版本目录与符号链接切换，独立于 GitHub Pages 发布；本次源码同步不更新该服务器。服务器部署脚本、凭据、临时核验文件和本地构建记录不随源码发布。
