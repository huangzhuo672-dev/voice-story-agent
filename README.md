# 🌙 声音克隆睡前故事 - 微信小程序

> 用你爱的人的声音，讲好听的睡前故事。

---

## 📁 项目结构

```
miniprogram/          ← 微信小程序前端（本目录）
├── app.js
├── app.json
├── app.wxss
├── project.config.json
├── sitemap.json
├── images/              ← tabBar 图标（已生成）
└── pages/
    ├── index/           ← 主页（录音/选主题/生成）
    └── history/         ← 历史记录页

backend/               ← 后端服务（需单独部署）
├── app.py              ← Flask 后端 API
├── requirements.txt
├── .env                ← 填入你的 API Key
├── uploads/
└── outputs/
```

---

## 🚀 三步上线

### 第 1 步：部署后端（必须，小程序要求 HTTPS）

**方式 A：部署到 Render.com（免费，推荐）**

1. 注册 https://render.com（用 GitHub 登录）
2. 新建 "Web Service"，连接你的 GitHub 仓库
3. 设置：
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python app.py`
   - 环境变量：添加 `DASHSCOPE_API_KEY=sk-你的key`
4. 部署完成后获得 `https://xxx.onrender.com` 地址

**方式 B：部署到 Railway（有免费额度）**

1. 注册 https://railway.app
2. 新建项目 → Deploy from GitHub repo
3. 添加环境变量 `DASHSCOPE_API_KEY`
4. 获得 `https://xxx.up.railway.app` 地址

---

### 第 2 步：修改小程序配置

拿到后端地址后，修改 `miniprogram/app.js` 第 7 行：

```js
// 把这行
apiUrl: 'https://your-backend-url.com',
// 改成你的后端地址，例如：
apiUrl: 'https://voice-story.onrender.com',
```

---

### 第 3 步：导入微信开发者工具

1. 下载微信开发者工具：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
2. 扫码登录
3. 导入项目 → 选择 `miniprogram` 文件夹
4. AppID 可以点「测试号」（正式发布才需要真实 AppID）
5. 点「编译」，就能在模拟器里看到效果了！

---

## 📱 使用流程

1. **上传声音样本**：点「录制声音」或「上传文件」，录 10~30 秒清晰人声
2. **选择故事主题**：点选标签，或输入自定义主题
3. **选择故事长度**：短篇/中篇/长篇
4. **点「开始生成故事」**：等 1~3 分钟
5. **聆听**：用克隆声音讲述的专属睡前故事 🎧

---

## ⚠️ 微信审核提醒

- 小程序提交审核时，「声音克隆」功能**可能被拒绝**（涉及 AI 语音合成）
- 建议审核时填写清楚说明：「本小程序使用用户自主上传的语音样本进行声音克隆，用于个人睡前故事播放，不涉及第三方权益侵犯」
- 如审核不通过，可以改用**企业主体**注册小程序

---

## 🔧 本地测试（不需部署）

如果想先在电脑上测试：

1. 启动后端：`cd backend && python app.py`
2. 修改 `app.js` 中的 `apiUrl` 为 `http://localhost:5000`
3. 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」
4. 编译运行

---

## 📦 后端 API 接口说明

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/upload-voice` | POST | 上传声音样本，返回 `voiceId` |
| `/api/generate-story` | POST | 生成故事，`{voiceId, theme, length}` → `{story, audioFile}` |
| `/output/<filename>` | GET | 获取生成的音频文件 |

---

## 🎉 打包完成

所有代码已就绪，按上面三步操作即可上线！

如有问题，检查：
1. 后端日志（Render/Railway 控制台）
2. 小程序调试器（微信开发者工具 → 调试器）
3. DashScope API Key 是否有效（https://dashscope.aliyun.com）
