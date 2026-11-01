# 离线本地翻译组件

专用英文到中文翻译模型：[Xenova/opus-mt-en-zh](https://huggingface.co/Xenova/opus-mt-en-zh)，来源于 Helsinki-NLP/opus-mt-en-zh。使用 Transformers.js 和量化 ONNX 权重在 CPU 上运行。

它是专用机器翻译模型，无需聊天 AI 账号，不把原文上传到外部服务。准备文件仍需联网下载一次。模型术语能力有限，专业译文应核对。

## 当前电脑

此目录已安装运行库并下载模型。双击同目录的 **启动离线翻译.cmd**，等它显示“离线翻译已就绪”，保持窗口开启。

然后在 Zotero 文译侧栏选择 **离线本地翻译**，选中英文。关闭命令窗口就停止本地服务。

启动脚本优先使用 PATH 中的 Node.js；当前电脑也可使用已有 Codex Node 运行时。这个后备路径仅为当前电脑方便使用，新电脑建议安装 Node.js。

## 其他电脑或 GitHub 源码首次准备

需要 Node.js 20 以上及 npm。在本目录执行：

```powershell
npm ci
node prepare.mjs
node server.mjs
```

`prepare.mjs` 下载专用模型到本目录 `models/` 并执行公开示例。量化模型权重合计约 113 MB，另有分词器、Node 运行库和依赖，实际磁盘占用更大。不要删除 `models/` 或 `node_modules/`。

`server.mjs` 设置 `env.allowRemoteModels=false` 和 `local_files_only=true`，只从已准备的文件加载。若模型未准备好，启动失败并明确提示；不会降级到云翻译。可在文件准备完成后断网验证。

服务只监听 `127.0.0.1:27184`，不监听局域网；不记录原文，不提供远程访问。当前译向固定为英文到中文。

## 开源许可

代码沿用项目 MIT 许可。Transformers.js 及运行库保留各自包内许可。模型权重遵循模型仓库／原模型的许可，下载权重不等于将其改为本项目 MIT 许可。
