# 考研英语错题复盘 — AI 服务部署说明

现有 GitHub Pages 网站保持不变。AI 分析服务使用 Cloudflare Workers 免费入门方案 + 单独计费的 OpenAI API。

## 1. 部署 Worker
1. 注册并登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 进入 **Workers & Pages** → **Create** → 创建 Worker，名称例如 `kaoyan-english-ai`。
3. 在 Worker 代码编辑器中粘贴本仓库 `worker/ai-worker.js` 的完整代码，点击 **Deploy**。
4. 在 Worker 的 **Settings → Variables and Secrets** 新增两个 **Secret**（必须选 Secret 而不是明文变量）：
   - `OPENAI_API_KEY`：你的 OpenAI API 密钥。
   - `APP_PASSWORD`：你自己生成的随机强口令（建议至少 24 字符）。
5. 保存并部署设置。复制 Cloudflare 显示的 `https://....workers.dev` URL。

**不要把任何密钥发给 ChatGPT、粘贴在 GitHub 文件里，或放在前端的“服务地址”里。**

## 2. 网站配置
访问 https://haoaisq.github.io/kaoyan-english-review/ ，打开 **AI 深度复盘** 页面；
粘贴 Worker URL，填写 APP_PASSWORD，并把题干、选项、文章关键段落和你当时的思路放进资料框；
点击“开始分析”。服务地址保存在当前浏览器；访问口令只存于当前标签页会话，关闭浏览器后可能需要重填。

## 3. 费用与安全
- ChatGPT Plus **不包含** OpenAI API 调用额度，需在 OpenAI API 平台单独启用计费。
- 模型使用 gpt-4.1-mini；每次上限 1600 输出 tokens；最多发送最近 6 条对话和截断后的题目资料。
- 口令校验放在 Worker 服务端，API 密钥不进入浏览器。
- 不要把 Worker 口令分享给其他人；公共网址不代表公共免费 AI 服务。
- CORS 只允许此仓库对应 GitHub Pages Origin，但 **CORS 不是防滥用防火墙**。生产长期使用建议在 Cloudflare 上进一步设置请求频率限制/安全规则，并给 OpenAI API 账户设使用预算提醒。费用上限与限流策略应在供应商控制台确认；当前代码不保证硬性金额封顶。
- 错题数据和 AI 分析记录仍保存在浏览器 localStorage；服务端不保存对话，跨设备不同步。敏感个人资料不应粘贴进公共设备。
- 可以在 OpenAI API 平台撤销 API key，在 Cloudflare 中禁用 Worker 以停止调用。

## 4. 测试
只输入年份/题号、不给原文时，AI 应明确提出补充原文而不是虚构答案。给出题干、正确答案、四选项、你选的答案及解题思路，AI 才能做针对性复盘。
