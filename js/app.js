// ============================================================
// 부트스트랩 — 페이지 진입 시 입장 화면 준비
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    initOutfitPicker();
    setupNameValidation();

    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', tryStart);

    // iOS/iPadOS 확대 차단
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((name) => {
        document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
    });
});
