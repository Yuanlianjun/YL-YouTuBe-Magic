# YouTube Knowledge Bridge (MVP)

一个 Manifest V3 Chrome 侧边栏扩展原型：YouTube 字幕获取、中文翻译、AI 摘要、脑图和 Obsidian Markdown 导出。

## 安装
1. 解压此文件夹到固定目录。
2. Chrome 打开 `chrome://extensions/`。
3. 打开“开发者模式” → “加载已解压的扩展程序” → 选择此文件夹。
4. 打开 YouTube 普通视频，点击扩展图标打开侧边栏。
5. 在“设置”中填写 Supadata API Key、OpenAI-compatible API 地址/Key/模型，以及 Obsidian Vault 名称。

## API 设置
- 字幕：Supadata API，默认调用 `https://api.supadata.ai/v1/transcript`。
- AI：兼容 OpenAI Chat Completions 的 API。默认 `https://api.openai.com/v1`，模型默认为 `gpt-4o-mini`。也可填写其他兼容服务的 base URL 和模型。
- Obsidian：使用官方 `obsidian://new` URI 创建笔记。长内容或 URI 受限时，使用“下载 Markdown”再放入 Vault。

## 当前 MVP 限制
- 获取字幕时优先请求英语（lang=en、mode=auto）；无可用字幕时尝试 Supadata AI 转录，并处理异步 job。若自动结果为非英语，会尝试 mode=generate 的英语转录。AI 转录会消耗服务额度，且不能保证所有视频都可识别。
- AI 总结按“三个核心要点（观点+证据+时间戳）+层级大纲+关键结论”输出。超长字幕仍可能触及模型上下文限制，建议先用短视频验证。\n- 脑图可导出为 Markdown；在 XMind 中选择“文件 > 导入 > Markdown”生成可编辑的 XMind 风格思维导图。此功能导出的是 Markdown 文件，不是原生 .xmind 文件。
- 这是未经真实账号和真实视频端到端测试的原型，可能需要按 Supadata 当前 API 响应格式微调。
- API Key 保存在本地 Chrome storage；不要共享扩展配置或把密钥提交到 GitHub。
- Obsidian URI 创建笔记需要已安装 Obsidian 桌面版，并允许浏览器打开 `obsidian://` 链接。

## 安全与许可证
该原型为独立实现，未复制 YouTube Digest 源代码。请遵守 YouTube、Supadata、AI 服务及 Obsidian 的条款。
