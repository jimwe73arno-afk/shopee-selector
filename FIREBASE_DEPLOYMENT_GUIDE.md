# Firebase 整合部署指南

本文档说明如何配置 Firebase 以启用身份→版本→次数三层数据架构。

---

## 🎯 架构概述

```
Firebase Firestore
 └── users/
      └── {email}/
           ├── tier: "FREE" | "PRO" | "MASTER"
           ├── quota: 5 | 20 | 50
           ├── usedToday: 0
           └── lastReset: "2025-11-24"
```

后端 `analyze.js` 会自动：
- 从 Firestore 读取用户 tier 和配额
- 检查配额是否足够
- 扣减使用次数
- 每日自动重置配额

---

## 📋 配置步骤

### 步骤 1: 启用 Firestore Database

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 选择项目 `brothergai-699d2`
3. 在左侧菜单点击 **"Firestore Database"**
4. 如果还没有创建，点击 **"创建数据库"**
5. 选择 **"以测试模式启动"**（稍后我们会设置安全规则）
6. 选择区域（建议选择 `asia-east1` 或 `us-central1`）
7. 点击 **"启用"**

### 步骤 2: 设置 Firestore 安全规则

1. 在 Firestore Database 页面，点击 **"规则"** 标签
2. 替换为以下规则：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 用户数据：允许已登录用户读取自己的数据，禁止前端写入
    match /users/{email} {
      allow read: if request.auth != null && request.auth.token.email == email;
      allow write: if false; // 只允许服务端（Firebase Admin）写入
    }
  }
}
```

3. 点击 **"发布"**

### 步骤 3: 创建 Service Account（用于后端）

1. 在 Firebase Console 中，点击左侧齿轮图标 → **"项目设置"**
2. 切换到 **"服务帐号"** 标签
3. 点击 **"生成新的私密金钥"**
4. 确认对话框（会下载一个 JSON 文件）
5. **重要**：保存这个 JSON 文件的内容，稍后需要设置到 Netlify

JSON 文件格式类似：
```json
{
  "type": "service_account",
  "project_id": "brothergai-699d2",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  ...
}
```

### 步骤 4: 在 Netlify 设置环境变量

1. 前往 Netlify Dashboard → 你的网站 `monumental-taiyaki-e878bd`
2. 点击 **"Site configuration"** → **"Environment variables"**
3. 添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `FIREBASE_SERVICE_ACCOUNT` | （粘贴完整的 JSON 内容，**作为单行字符串**） | Service Account JSON |

**重要提示**：
- 将 JSON 文件的**全部内容**复制粘贴到 `FIREBASE_SERVICE_ACCOUNT` 的值中
- 必须是**单行字符串**（不要换行）
- 或者你可以使用 JSON 转义工具将 JSON 转换为单行字符串

**示例**（使用单行字符串）：
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"brothergai-699d2",...}
```

4. 点击 **"Save"**
5. **触发重新部署**（在 Netlify Dashboard 中点击 "Deploys" → "Trigger deploy" → "Deploy site"）

### 步骤 5: 验证配置

1. 部署完成后，在浏览器中访问网站
2. 使用 Google 账号登录
3. 打开浏览器开发者工具（F12）→ Console
4. 你应该看到类似日志：
   ```
   ✅ 已登入: user@example.com
   ✅ 新用戶已建立: user@example.com
   📊 用戶資料已同步: {tier: "FREE", quota: 5, usedToday: 0, ...}
   ```

5. 在 Firebase Console → Firestore Database → Data 标签中，你应该看到：
   ```
   users/
     └── user@example.com/
          ├── tier: "FREE"
          ├── quota: 5
          ├── usedToday: 0
          └── lastReset: "2025-11-24"
   ```

---

## 🔧 手动设置用户 tier（测试用）

如果你需要在 Firestore 中手动设置某个用户为 PRO 或 MASTER：

1. 在 Firebase Console → Firestore Database → Data 标签
2. 找到 `users/{email}` 文档
3. 点击文档 → 编辑字段
4. 修改 `tier` 字段：
   - `"FREE"` → 免费版（5次/天）
   - `"PRO"` → 专业版（20次/天）
   - `"MASTER"` → 大师版（50次/天，需要后端白名单）

**注意**：MASTER 用户必须在后端代码的白名单中（`netlify/functions/analyze.js` 中的 `WHITELIST_EMAILS` 数组）

---

## 🐛 故障排除

### 问题 1: "Firebase Admin 初始化失敗"

**原因**：`FIREBASE_SERVICE_ACCOUNT` 环境变量格式错误

**解决方案**：
- 确保 JSON 是有效的单行字符串
- 检查 JSON 中的所有引号都已正确转义
- 可以在本地测试：将 JSON 保存为文件，使用 `JSON.parse()` 验证

### 问题 2: "用户数据没有自动创建"

**原因**：前端 `firebase-store.js` 或 `auth.js` 没有正确加载

**解决方案**：
- 检查浏览器 Console 是否有错误
- 确保 `firestore-compat.js` 已加载
- 确保 `firebase-store.js` 已加载

### 问题 3: "配額没有被扣减"

**原因**：后端 Firebase Admin 初始化失败或 Firestore 写入权限问题

**解决方案**：
- 检查 Netlify Function 日志（Netlify Dashboard → Functions → Logs）
- 确认 `FIREBASE_SERVICE_ACCOUNT` 环境变量已设置
- 确认 Firestore 安全规则允许服务端写入

### 问题 4: "每日配額沒有重置"

**原因**：`lastReset` 日期格式不匹配或时区问题

**解决方案**：
- 检查 `lastReset` 字段格式是否为 `"YYYY-MM-DD"`（例如 `"2025-11-24"`）
- 后端会自动在每天第一次使用时重置，如果日期不匹配

---

## 📝 测试清单

- [ ] Firestore Database 已启用
- [ ] Firestore 安全规则已设置
- [ ] Service Account 已创建
- [ ] Netlify 环境变量 `FIREBASE_SERVICE_ACCOUNT` 已设置
- [ ] 网站已重新部署
- [ ] 用户登录后能在 Firestore 看到用户记录
- [ ] 使用分析功能后，`usedToday` 会自动增加
- [ ] 第二天使用分析功能后，`usedToday` 会自动重置为 0

---

## 🔒 安全注意事项

1. **永远不要在前端代码中暴露 Service Account 私钥**
2. **Service Account JSON 文件只用于后端（Netlify Functions）**
3. **Firestore 安全规则禁止前端直接写入用户数据**
4. **所有配额扣减都在后端进行，前端只做预检查**

---

## 🎯 后续优化

1. 添加 Firebase Cloud Functions 自动重置配额（替代在每次请求时检查）
2. 添加配额使用历史记录（记录每次使用的时间戳）
3. 添加用户升级/降级通知机制
4. 集成 Stripe/ECPay 支付后自动更新 tier

---

## 📞 支持

如有问题，请检查：
1. Netlify Function 日志
2. 浏览器 Console 日志
3. Firebase Console → Firestore → 数据是否正常创建


