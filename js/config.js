// ============================================================
// KSMS 블록세상 — 싱글플레이 (1play) : 전역 상수/설정
// 멀티플레이 관련 코드(접속번호·서버·다른 플레이어)는 존재하지 않습니다.
// ============================================================
'use strict';

const WIDTH = 120, DEPTH = 120, HEIGHT = 60;
const MAP_SIZE = WIDTH * DEPTH * HEIGHT;
const HALF_WIDTH = WIDTH / 2, HALF_DEPTH = DEPTH / 2;
const FLOOR_SIZE = 120;

// 블록 ID: 0=빈칸, 1~10=색 블록, 11=큐브(구버전 맵 호환 렌더 전용), 12=미디어(구버전 맵 호환 렌더 전용)
const colorPalette = [
    "#000000", "#FF0000", "#FFA500", "#FFFF00", "#008000", "#0000FF",
    "#800080", "#8B4512", "#FFFFFF", "#808080", "#222222", "#FFC0CB", "#16213A", "#FFFFFF"
];
// 단말기·주사율 동일 속도: 프레임 종속 상수를 "초당" 단위로 환산한 시간 기반 물리
const PHYS = {
    SPEED: 0.1 * 60,          // 6.0 블록/초
    FLY: 0.08 * 60,           // 4.8 블록/초
    GRAVITY: 0.007 * 60 * 60, // 25.2 블록/초²
    JUMP_V: 0.14 * 60,        // 8.4 블록/초
    FALL_MAX: 0.35 * 60       // 21 블록/초 낙하 종속도
};

const INITIAL_INSTANCES_PER_COLOR = 4096;
const MAX_Y = 61.0;          // 비행 천장
const GRASS_ID = 4;          // 초록 블록 (새 맵 바닥)

// 화질 3단계(저/중/고) — 안드로이드는 기본 '저', 그 외 '고'
const isAndroidDevice = /android/i.test(navigator.userAgent);
const defaultQuality = isAndroidDevice ? 'LOW' : 'HIGH';
let currentQuality = defaultQuality;
try {
    const savedQuality = localStorage.getItem('ksms1play-quality');
    if (savedQuality === 'LOW' || savedQuality === 'MID' || savedQuality === 'HIGH') currentQuality = savedQuality;
} catch (e) { /* 저장소 차단 환경 */ }
const QUALITY_LABELS = { LOW: '저', MID: '중', HIGH: '고' };
const QUALITY_ICONS = { LOW: 'fa-gauge-simple', MID: 'fa-gauge', HIGH: 'fa-gauge-high' };

function qualityPixelRatio(q) {
    const cap = (q === 'HIGH') ? 2 : (q === 'MID' ? 1.5 : 1.0);
    return Math.min(window.devicePixelRatio || 1, cap);
}
function qualityViewDistance(q) { return (q === 'HIGH') ? 200 : (q === 'MID' ? 130 : 85); }
function qualityFogDensity(q) { return (q === 'HIGH') ? 0.012 : (q === 'MID' ? 0.016 : 0.024); }
function qualityFrameInterval(q) { return (q === 'HIGH') ? 16.7 : 33.4; }

// 의상 6종 (무지개 순서: 빨·주·노·초·파·보)
const OUTFITS = [
    { id: 'red',    label: '빨강', shirt: '#E53935', pants: '#ECEFF1' },
    { id: 'orange', label: '주황', shirt: '#FB8C00', pants: '#5D4037' },
    { id: 'yellow', label: '노랑', shirt: '#FDD835', pants: '#283593' },
    { id: 'mint',   label: '초록', shirt: '#00E676', pants: '#1A237E' },
    { id: 'cyan',   label: '하늘', shirt: '#00CBC9', pants: '#3C4FA5' },
    { id: 'purple', label: '보라', shirt: '#9C27B0', pants: '#D7CCC8' },
];
const DEFAULT_OUTFIT_ID = 'cyan';
function outfitById(id) {
    return OUTFITS.find(o => o.id === id) || OUTFITS.find(o => o.id === DEFAULT_OUTFIT_ID);
}
let selectedOutfitId = DEFAULT_OUTFIT_ID;
try {
    const savedOutfit = localStorage.getItem('ksms1play-outfit');
    if (savedOutfit && OUTFITS.some(o => o.id === savedOutfit)) selectedOutfitId = savedOutfit;
} catch (e) { /* 저장소 차단 환경 */ }

// 공유 상태 (멀티플레이 필드 없음)
let scene, camera, renderer, controls;
let characterGroup, floorMesh, sunLight;
let isEngineInitialized = false;
let localPlayerName = "Player";
let selectedToolType = "block";   // "block" | "eraser"
let activeHotbarIndex = 0;
let isFirstPerson = false;
let localFlightMode = 'walk';     // 기본값 '걷기(OFF)' — 필요하면 비행/걷기 토글로 전환
// 걷기/비행 토글 가능 여부 — 싱글플레이는 항상 비행 모드 고정
function isFlightEnabled() { return localFlightMode === 'fly'; }

// 누적 프레임용 재사용 벡터 (GC 히칭 방지)
const tmpMove = new THREE.Vector3();
const tmpCamDir = new THREE.Vector3(), tmpCamRight = new THREE.Vector3(), tmpFinalDir = new THREE.Vector3();
const tmpCamTarget = new THREE.Vector3(), tmpCamOffset = new THREE.Vector3();

const keys = { w: false, a: false, s: false, d: false, flyUp: false, flyDown: false };
const charPhysics = {
    position: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    isCrawling: false, isGrounded: false, crawlProgress: 0
};
let lastPhysMs = 0;
let lastAutoLiftAt = 0;
let prevCharPos = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);
let touchActive = false;
let joystickStart = { x: 0, y: 0 }, joystickDir = { x: 0, y: 0 };

// 물리/렌더 프레임 공통 유틸
function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }
