// blocked.js - 封鎖頁面的邏輯

(function () {
  // 從 URL 參數取得被封鎖的網址
  const params = new URLSearchParams(location.search);
  const blockedUrl = params.get('url') || '';

  const urlEl = document.getElementById('blockedUrl');
  if (blockedUrl) {
    urlEl.textContent = blockedUrl;
  } else {
    urlEl.textContent = '（未知網址）';
  }

  // 若無法返回（直接開啟），顯示替代按鈕
  if (history.length <= 1) {
    const backBtn = document.querySelector('.btn-primary');
    if (backBtn) {
      backBtn.textContent = '關閉分頁';
      backBtn.onclick = () => window.close();
    }
  }
})();
