// ============================================================
// 맵 저장/불러오기 — .블록세상 파일 (멀티플레이와 같은 형식)
//  + 브라우저 자동저장(이어하기) — 멀티플레이와 달리 로컬 저장소 사용
// ============================================================
const AUTOSAVE_KEY = 'ksms1play-autosave-v1';

// 새 빈 맵: 원본 게임의 기본 상태와 동일한 "빈 세계" (초록 평면 + 원본형 GridHelper만 보임)
function createFreshWorld() {
    worldData.fill(0);
    mediaInfo = {};
}

function worldToBlockObject() {
    const blockData = {};
    for (let i = 0; i < MAP_SIZE; i++) {
        const v = worldData[i];
        if (v > 0 && v <= 12) blockData[i] = v;
    }
    return blockData;
}

// 맵 파일 다운로드 (.블록세상)
function saveWorldToFile() {
    const blockData = worldToBlockObject();
    let prefix = '';
    try { prefix = window.prompt('저장할 맵 이름을 입력하세요 (비워두면 KSMS)', 'KSMS'); } catch (e) { prefix = 'KSMS'; }
    if (prefix === null) return; // 취소
    prefix = String(prefix).trim()
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!prefix) prefix = 'KSMS';
    prefix = prefix.slice(0, 60);
    const blob = new Blob([JSON.stringify(blockData)], { type: 'application/json' });
    const now = new Date(), yy = String(now.getFullYear()).slice(-2), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0'), hh = String(now.getHours()).padStart(2, '0'), min = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${prefix}-${yy}${mm}${dd}-${hh}${min}${ss}.블록세상`;
    link.click();
    try { URL.revokeObjectURL(link.href); } catch (e) {}
    showToast('맵을 저장했습니다', 0, 'success');
}

// 맵 파일 업로드 적용 — insertBlockMap은 .블록세상 객체를 파싱/적용하고 실패 시 false 반환
function insertBlockMap(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const fresh = new Uint8Array(MAP_SIZE);
    for (const idx in raw) {
        const n = Number(idx);
        if (!Number.isInteger(n) || n < 0 || n >= MAP_SIZE) continue;
        const v = raw[idx];
        let cid = null;
        if (v && typeof v === 'object') {
            cid = Number(v.c); // 구버전 미디어블록 포함 맵: 색상만 살려 로드
        } else {
            cid = Number(v);
        }
        if (!Number.isInteger(cid) || cid < 1 || cid > 12) continue;
        fresh[n] = cid;
    }
    worldData.set(fresh);
    return true;
}

function loadWorldFromFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
        try {
            const raw = JSON.parse(evt.target.result);
            if (!insertBlockMap(raw)) throw new Error('bad map');
            if (isEngineInitialized) updateInstancedMeshes();
            if (isEngineInitialized) liftCharacterOutOfBlocks();
            e.target.value = '';
            sfx.playPlace();
            showToast('맵을 불러왔습니다', 0, 'success');
            worldDirty = true; // 이어하기 자동저장에도 반영
        } catch (err) {
            showNoticeModal('맵 불러오기 실패', '올바르지 않은 맵 파일 형식입니다.');
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// ---------- 브라우저 자동저장 (이어하기) ----------
function saveAutosave() {
    if (!worldDirty) return;
    try {
        const data = { savedAt: Date.now(), blocks: worldToBlockObject() };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        worldDirty = false;
    } catch (e) { /* 저장소 가득 참 등 — 조용히 생략 */ }
}
function hasAutosave() {
    try { return !!localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return false; }
}
function autosaveInfo() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.blocks) return null;
        return { savedAt: parsed.savedAt || 0, count: Object.keys(parsed.blocks).length };
    } catch (e) { return null; }
}
function loadAutosave() {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!insertBlockMap(parsed.blocks)) return false;
        return true;
    } catch (e) { return false; }
}
function clearAutosave() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {}
}

// 맵 전체 초기화 (바닥만 새로 깔기)
function resetWorldToFresh() {
    createFreshWorld();
    if (isEngineInitialized) updateInstancedMeshes();
    worldDirty = true;
    saveAutosave();
}
