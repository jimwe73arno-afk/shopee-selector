const input = document.getElementById("imageInput");
const btn = document.getElementById("analyzeBtn");
const output = document.getElementById("output");
const promptBox = document.getElementById("prompt");
const btnText = document.getElementById("btnText");
const btnLoading = document.getElementById("btnLoading");
const imagePreview = document.getElementById("imagePreview");

// Base64 轉換
async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 圖片預覽
input.addEventListener('change', function() {
  imagePreview.innerHTML = '';
  const files = Array.from(this.files || []);
  
  if (files.length > 0) {
    imagePreview.style.display = 'grid';
    files.slice(0, 6).forEach(file => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      imagePreview.appendChild(img);
    });
  }
});

// 分析按鈕
btn.onclick = async () => {
  try {
    const files = Array.from(input.files || []);
    
    if (files.length === 0) {
      output.innerHTML = '<div class="error">❌ 請先上傳圖片</div>';
      return;
    }

    if (files.length > 6) {
      output.innerHTML = '<div class="error">❌ 最多上傳 6 張圖片</div>';
      return;
    }

    // 顯示載入狀態
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    output.innerHTML = '<div class="loading-message">🔄 正在分析圖片，請稍候...</div>';

    // 轉換圖片
    const images = await Promise.all(files.map(f => toBase64(f)));
    const prompt = promptBox.value || "請幫我分析這些蝦皮數據，給出選品建議";

    // 呼叫 API
    const res = await fetch("/.netlify/functions/gemini-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        images, 
        prompt,
        systemPrompt: "你是專業的蝦皮選品顧問，請根據數據給出具體建議。"
      }),
    });

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // 顯示結果
    output.innerHTML = `
      <div class="result-header">
        <div class="model-badge">${data.modelUsed || 'gemini-3-pro-preview'}</div>
        <div class="time-badge">⏱️ ${data.responseTime || '未知'}</div>
      </div>
      <div class="result-content">${formatResult(data.result)}</div>
    `;

  } catch (err) {
    output.innerHTML = `<div class="error">❌ 錯誤：${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
  }
};

// 格式化結果
function formatResult(text) {
  return text
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/#{1,3}\s+(.*?)(<br>|$)/g, '<h3>$1</h3>');
}

