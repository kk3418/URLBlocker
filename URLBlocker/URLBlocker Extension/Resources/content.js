// content.js - 內容腳本：作為 declarativeNetRequest 的備援機制
// 若 declarativeNetRequest 未能攔截，此腳本會在頁面載入時顯示封鎖覆蓋層

(async function () {
  // 防止在 blocked 頁面本身執行
  if (location.href.includes('blocked.html')) return;

  // 向 background 查詢此 URL 是否應被封鎖
  let isBlocked = false;
  try {
    const response = await browser.runtime.sendMessage({
      action: 'isBlocked',
      url: location.href
    });
    isBlocked = response && response.blocked;
  } catch (e) {
    // background 尚未就緒時靜默失敗
    return;
  }

  if (!isBlocked) return;

  // 立即阻止頁面渲染
  document.documentElement.style.visibility = 'hidden';

  // 等待 DOM 準備好後顯示封鎖覆蓋層
  function showBlockOverlay() {
    document.documentElement.style.visibility = 'visible';

    // 清空 body
    document.body.innerHTML = '';
    document.body.style.cssText = `
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
      background: #f2f2f7;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      text-align: center;
      padding: 40px 24px;
      max-width: 360px;
    `;

    container.innerHTML = `
      <div style="
        width: 80px;
        height: 80px;
        background: #ff3b30;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px;
        font-size: 40px;
      ">🚫</div>
      <h1 style="
        font-size: 24px;
        font-weight: 700;
        color: #1c1c1e;
        margin: 0 0 12px;
      ">此網頁已被封鎖</h1>
      <p style="
        font-size: 16px;
        color: #8e8e93;
        line-height: 1.5;
        margin: 0 0 32px;
      ">您已將此網址加入封鎖清單：<br>
      <strong style="color: #3a3a3c; word-break: break-all;">${location.hostname}</strong></p>
      <button onclick="history.back()" style="
        display: block;
        width: 100%;
        padding: 14px;
        background: #007aff;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 17px;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: 12px;
      ">返回上一頁</button>
    `;

    document.body.appendChild(container);
    document.title = '網頁已封鎖';
  }

  if (document.body) {
    showBlockOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', showBlockOverlay);
  }
})();
