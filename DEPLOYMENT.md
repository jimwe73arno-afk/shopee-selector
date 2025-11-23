# Deployment Guide - Map-Reduce Architecture

## 🚀 Quick Start

### 1. Environment Variables Setup

在 Netlify Dashboard 设置环境变量：

```
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

或者使用旧变量名（兼容性）：
```
GEMINI_API_KEY=your_api_key_here
```

### 2. API Route Configuration

前端调用：`POST /api/analyze`

Netlify 自动路由：
- `/api/analyze` → `/.netlify/functions/analyze`

已在 `netlify.toml` 中配置重定向规则。

### 3. Frontend Integration

```javascript
// 在前端 ask.js 中调用
fetch('/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN',  // 可选
    'X-User-Tier': 'pro'  // 或 'master', 'free' (用于测试)
  },
  body: JSON.stringify({
    textPrompt: "帮我看这些商品数据，接下来7天我该选什么？",
    images: ["base64_string_1", "base64_string_2"]  // 可选
  })
})
.then(res => res.json())
.then(data => {
  console.log(data.summary);
  console.log(data.recommendations);
  console.log(data.plan);
});
```

### 4. User Tier Implementation

当前使用 Mock 实现。要实现真实层级检查，修改 `checkUserTier()` 函数：

#### Option 1: JWT Token
```javascript
function checkUserTier(event) {
  const token = event.headers.authorization?.replace('Bearer ', '');
  if (!token) return 'free';
  
  // 解码 JWT
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded.tier; // 'free' | 'pro' | 'master'
}
```

#### Option 2: Database Query
```javascript
async function checkUserTier(event) {
  const userId = event.headers['x-user-id'];
  if (!userId) return 'free';
  
  const user = await db.users.findOne({ id: userId });
  return user.tier;
}
```

#### Option 3: Custom Header (用于测试)
```javascript
// 已在代码中实现
// 使用 Header: X-User-Tier: pro
```

### 5. Testing

#### Test Free Tier (Text Only)
```bash
curl -X POST https://your-site.netlify.app/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "textPrompt": "我在虾皮卖 eSIM，接下来该选什么？"
  }'
```

#### Test Pro Tier (1 Image)
```bash
curl -X POST https://your-site.netlify.app/api/analyze \
  -H "Content-Type: application/json" \
  -H "X-User-Tier: pro" \
  -d '{
    "textPrompt": "分析这张图",
    "images": ["base64_image_string"]
  }'
```

#### Test Master Tier (Multiple Images)
```bash
curl -X POST https://your-site.netlify.app/api/analyze \
  -H "Content-Type: application/json" \
  -H "X-User-Tier: master" \
  -d '{
    "textPrompt": "批量分析这些报表",
    "images": ["base64_1", "base64_2", "base64_3"]
  }'
```

### 6. Response Format

```json
{
  "summary": "基于您的商品数据，建议主推高毛利品类...",
  "recommendations": [
    "第一周：上架 3 款测试商品",
    "第二周：根据数据调整价格策略",
    "第三周：扩大热销品库存"
  ],
  "plan": "7-Day Execution Plan:\nDay 1-2: 选品确认\nDay 3-4: 上架测试\nDay 5-7: 数据分析与优化"
}
```

### 7. Error Handling

#### Tier Limit Exceeded (403)
```json
{
  "error": "Pro tier allows maximum 1 image. Upgrade to Master for batch processing.",
  "tier": "pro",
  "limit": 1
}
```

#### Missing API Key (500)
```json
{
  "error": "Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable"
}
```

#### Invalid Input (400)
```json
{
  "error": "Please provide textPrompt or images"
}
```

### 8. Performance Optimization

- **Map Phase**: 并行处理（Promise.all），大幅提升速度
- **Reduce Phase**: 单次深度推理，保证质量
- **Timeout**: 60 秒（Netlify Pro 限制）
- **Token Limits**: 
  - Flash: 1024 tokens (vision)
  - Pro: 2048 tokens (reasoning)

### 9. Monitoring

检查 Netlify Functions 日志：
- Netlify Dashboard → Functions → analyze → Logs

关键日志标记：
- `📊 Map Phase`: 并行处理开始
- `✅ Image X processed`: 单图处理完成
- `🧠 Reduce Phase`: 深度推理开始
- `✅ Success`: 完成处理

### 10. Troubleshooting

#### 超时错误
- 减少图片数量
- 检查图片大小（建议压缩）
- 升级到 Master tier（优先算力通道）

#### JSON 解析错误
- 函数已包含自动清理和容错
- 如果持续出现，检查 Gemini API 响应格式

#### CORS 错误
- 已在代码中设置 `Access-Control-Allow-Origin: *`
- 如需限制，修改 headers

