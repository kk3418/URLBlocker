// content.js - 內容腳本：作為 declarativeNetRequest 的備援機制

// Chrome/Safari browser API 相容性
if (typeof browser === 'undefined') var browser = chrome;

(async function () {
  // 防止在 blocked 頁面本身執行
  if (location.href.includes('blocked.html')) return;

  let currentUrl = location.href;

  async function checkAndBlock() {
    // 直接從 storage 讀取（不依賴 service worker 是否存活）
    let blockedUrls, blockingEnabled;
    try {
      const data = await browser.storage.local.get(['blockedUrls', 'blockingEnabled']);
      blockedUrls = data.blockedUrls || [];
      blockingEnabled = data.blockingEnabled !== false;
    } catch (e) {
      return;
    }

    if (!blockingEnabled || blockedUrls.length === 0) return;

    const isBlocked = blockedUrls.some(url => urlMatchesRule(location.href, url));
    if (!isBlocked) return;

    // 停止頁面載入
    window.stop();

    // 透過 background 導航（Chrome 不允許 content script 直接導向 chrome-extension:// 頁面）
    try {
      await browser.runtime.sendMessage({
        action: 'navigateToBlocked',
        url: location.href
      });
    } catch (e) {
      // background 無回應時，用備援方案直接替換頁面內容
      showFallbackBlock();
    }
  }

  function showFallbackBlock() {
    const blockHTML = `
      <head>
        <title>網頁已封鎖</title>
        <style>
          html, body {
            margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important;
            background: #f2f2f7 !important; display: flex !important; align-items: center !important; justify-content: center !important;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; text-align: center !important;
            position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important;
          }
        </style>
      </head>
      <body>
        <div>
          <div style="font-size: 60px; margin-bottom: 20px;">🚫</div>
          <h2 style="color: #1c1c1e; margin: 0 0 12px; font-size: 24px;">此網頁已被封鎖</h2>
          <p style="color: #8e8e93; font-size: 16px; margin: 0;">${location.hostname}</p>
        </div>
      </body>
    `;
    document.documentElement.innerHTML = blockHTML;
  }

  // 初始檢查
  await checkAndBlock();

  // 監聽 SPA (單頁應用) 的網址變化
  setInterval(async () => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      await checkAndBlock();
    }
  }, 500);

  // 檢查 URL 是否符合封鎖規則（與 background.js 保持一致）
  function urlMatchesRule(currentUrl, blockedUrl) {
    try {
      const normalizedBlocked = blockedUrl.startsWith('http')
        ? blockedUrl
        : `https://${blockedUrl}`;
      const blockedParsed = new URL(normalizedBlocked);
      const currentParsed = new URL(currentUrl);

      if (!currentParsed.hostname.endsWith(blockedParsed.hostname)) {
        return false;
      }

      if (blockedParsed.pathname && blockedParsed.pathname !== '/') {
        return currentParsed.pathname.startsWith(blockedParsed.pathname);
      }

      return true;
    } catch {
      return currentUrl.includes(blockedUrl);
    }
  }

})();
