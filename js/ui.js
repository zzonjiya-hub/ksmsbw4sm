// ============================================================
// UI — 알림/모달/입장 화면/이어하기
// ============================================================
const NOTICE_COLORS = { success: '#22c55e', info: '#38bdf8', warning: '#f97316', error: '#ef4444' };

function showNotice(message, type = 'info', durationMs = 2500) {
    const toast = document.getElementById('toast');
    const textEl = document.getElementById('toast-text');
    if (!toast || !textEl) return;
    textEl.textContent = message;
    toast.style.borderWidth = '2px';
    toast.style.borderStyle = 'solid';
    toast.style.borderColor = NOTICE_COLORS[type] || NOTICE_COLORS.info;
    toast.classList.remove('opacity-0');
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(() => toast.classList.add('opacity-0'), durationMs || 2200);
}
function showToast(msg, durationMs, type = 'info') { showNotice(msg, type, durationMs); }

function showNoticeModal(title, message) {
    const modal = document.getElementById('notice-modal');
    const titleEl = document.getElementById('notice-title');
    const msgEl = document.getElementById('notice-message');
    const okBtn = document.getElementById('notice-ok-btn');
    if (!modal || !titleEl || !msgEl || !okBtn) return;
    titleEl.textContent = title || '안내';
    msgEl.textContent = message || '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    okBtn.onclick = () => { modal.classList.add('hidden'); modal.classList.remove('flex'); };
}

// 두 개의 버튼(확인/취소) 확인 모달 — onCancel도 선택적으로 받음
function showConfirmModal(title, message, onConfirm, onCancel) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const noBtn = document.getElementById('confirm-no-btn');
    if (!modal || !titleEl || !msgEl || !yesBtn || !noBtn) return;
    titleEl.textContent = title || '확인';
    msgEl.textContent = message || '';
    // 줄바꿈 표시 허용
    msgEl.style.whiteSpace = 'pre-line';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const close = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        yesBtn.onclick = noBtn.onclick = null;
    };
    yesBtn.onclick = () => { close(); if (typeof onConfirm === 'function') onConfirm(); };
    noBtn.onclick = () => { close(); if (typeof onCancel === 'function') onCancel(); };
}

// ---------- 입장 화면(의상 선택) ----------
function initOutfitPicker() {
    const picker = document.getElementById('outfit-picker');
    if (!picker) return;
    picker.innerHTML = '';
    OUTFITS.forEach(o => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.outfit = o.id;
        btn.title = o.label;
        btn.className = 'outfit-btn rounded-lg border-4 p-1 transition-all flex flex-col gap-1 bg-[#3d6328] border-[#2b471b] hover:border-yellow-400 active:scale-95 aspect-square';
        btn.innerHTML =
            `<span class="w-full flex-1 rounded-sm shadow-inner" style="background-color:${o.shirt};"></span>` +
            `<span class="w-full flex-1 rounded-sm shadow-inner" style="background-color:${o.pants};"></span>`;
        btn.addEventListener('click', () => selectOutfit(o.id));
        picker.appendChild(btn);
    });
    refreshOutfitPicker();
}
function selectOutfit(id) {
    selectedOutfitId = outfitById(id).id;
    try { localStorage.setItem('ksms1play-outfit', selectedOutfitId); } catch (e) {}
    refreshOutfitPicker();
}
function refreshOutfitPicker() {
    document.querySelectorAll('#outfit-picker .outfit-btn').forEach(b => {
        if (b.dataset.outfit === selectedOutfitId) {
            b.classList.remove('border-[#2b471b]');
            b.classList.add('border-yellow-400', 'scale-110', 'shadow-[0_0_12px_rgba(250,204,21,0.8)]');
        } else {
            b.classList.add('border-[#2b471b]');
            b.classList.remove('border-yellow-400', 'scale-110', 'shadow-[0_0_12px_rgba(250,204,21,0.8)]');
        }
    });
}

// ---------- 게임 시작 ----------
let gameStarted = false;

function launchGame() {
    // 이어하기 확인은 caller가 처리
    document.getElementById('setup-modal').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    if (!isEngineInitialized) {
        initEngine();
        setupEventListeners();
        setupTouchControls();
    }
    selectHotbar(activeHotbarIndex || 0);
    if (!animate.running) { animate.running = true; animate(); }
    setTimeout(onWindowResize, 100);
    setTimeout(onWindowResize, 300);
    // 자동저장 (45초 주기 + 페이지 이탈 시)
    setInterval(saveAutosave, 45000);
    window.addEventListener('pagehide', saveAutosave);
}

function tryStart() {
    const usernameInput = document.getElementById('username-input');
    const errorMsg = document.getElementById('error-msg');
    const inputName = usernameInput.value.trim();
    if (!inputName || !/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]+$/.test(inputName)) {
        usernameInput.classList.add('border-rose-500'); errorMsg.classList.remove('hidden'); usernameInput.focus(); return;
    }
    if (gameStarted) return;
    gameStarted = true;

    localPlayerName = inputName;
    sfx.init();
    localFlightMode = 'walk';

    const begin = () => {
        launchGame();
        applyFlightToggle();
        liftCharacterOutOfBlocks();
        showToast(`${inputName}님, 환영합니다!`, 0, 'success');
    };

    const info = autosaveInfo();
    if (hasAutosave() && info) {
        // 저장된 작업이 있으면 확인 후 결정
        const dt = info.savedAt ? new Date(info.savedAt) : null;
        const when = dt ? `${dt.getMonth() + 1}월 ${dt.getDate()}일 ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : '';
        showConfirmModal('이어하기',
            `이전에 저장된 작업(블록 ${info.count.toLocaleString()}개${when ? ', ' + when + ' 저장' : ''})이 있습니다.\n이어서 할까요?`,
            () => { if (loadAutosave()) worldDirty = true; begin(); },   // 이어하기
            () => { clearAutosave(); begin(); }                            // 새 맵
        );
        return;
    }
    begin();
}

// 이름 입력 유효성 실시간 표시
function setupNameValidation() {
    const usernameInput = document.getElementById('username-input');
    const errorMsg = document.getElementById('error-msg');
    if (!usernameInput || !errorMsg) return;
    usernameInput.addEventListener('input', () => {
        const v = usernameInput.value.trim();
        if (/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]+$/.test(v)) { errorMsg.classList.add('hidden'); usernameInput.classList.remove('border-rose-500'); }
    });
    usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryStart(); });
}
