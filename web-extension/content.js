// content.js - 內容腳本：作為 declarativeNetRequest 的備援機制
// 若 declarativeNetRequest 未能攔截，此腳本會在頁面載入時顯示封鎖覆蓋層

(async function () {
  // 防止在 blocked 頁面本身執行
  if (location.href.includes('blocked.html')) return;

  let currentUrl = location.href;
  let isActivelyBlocking = false;

  async function checkAndBlock() {
    if (isActivelyBlocking) return;

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

    isActivelyBlocking = true;

    // 立即停止頁面載入，阻止後續腳本執行
    window.stop();

    try {
      // 優先嘗試跳轉到擴充功能的封鎖頁面，這是最安全的做法（跳離原網域，原網站腳本無法干擾）
      const blockedPageUrl = browser.runtime.getURL(`blocked/blocked.html?url=${encodeURIComponent(location.href)}`);
      window.location.replace(blockedPageUrl);
    } catch (e) {
      // 備用方案：若無法重定向，則用強硬的方式替換當前頁面內容
      const blockHTML = `
        <head>
          <title>網頁已封鎖</title>
          <style>
            html, body {
              margin: 0 !important; padding: 0 !important; width: 100vw !important; height: 100vh !important;
              background: #f2f2f7 !important; display: flex !important; align-items: center !important; justify-content: center !important;
              font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; text-align: center !important;
              visibility: visible !important; opacity: 1 !important;
              position: fixed !important; top: 0 !important; left: 0 !important; z-index: 2147483647 !important;
              overflow: hidden !important;
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

      function enforceBlock() {
        if (!document.documentElement.innerHTML.includes('此網頁已被封鎖')) {
          document.documentElement.innerHTML = blockHTML;
        }
      }

      enforceBlock();

      // 鎖死 DOM，防止原網站的腳本重建畫面
      const observer = new MutationObserver(() => {
        observer.disconnect();
        enforceBlock();
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true
        });
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true
      });
    }
  }

  // 初始檢查
  await checkAndBlock();

  // 監聽 SPA (單頁應用) 的網址變化
  // 使用 setInterval 是最穩定的方式，能捕捉所有形式的網址變更 (pushState, replaceState, hashchange 等)
  setInterval(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      checkAndBlock();
    }
  }, 500);

})();
