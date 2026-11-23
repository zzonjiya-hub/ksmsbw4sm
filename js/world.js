// ============================================================
// 월드 데이터·인스턴스 렌더링 (증분 갱신)
// ============================================================
const worldData = new Uint8Array(MAP_SIZE);
// 블록 변경 시 자동저장 트리거용 플래그
let worldDirty = false;
function markWorldDirty() { worldDirty = true; }

const instancedMeshes = [];
const blockSlot = new Int32Array(MAP_SIZE).fill(-1);
const colorSlotIndex = [];
const colorCounts = new Array(12).fill(0);
const dirtyColorSlots = [];
const cubeBlockMeshMap = new Map();   // 구버전 맵 호환 렌더 전용
const mediaBlockMeshMap = new Map();  // 구버전 맵 호환 렌더 전용
let cubeBlockGroup = null, cubeBlockGeo = null, rubikFaceMaterials = null;
let mediaBlockGroup = null, mediaFaceMaterials = null;
let incTempObject = null, incSwapMatrix = null;
for (let c = 1; c <= 10; c++) {
    colorSlotIndex[c] = new Int32Array(INITIAL_INSTANCES_PER_COLOR).fill(-1);
    dirtyColorSlots[c] = [];
}
dirtyColorSlots[11] = [];

function getIndex(x, y, z) {
    const xIdx = Math.floor(x + HALF_WIDTH);
    const yIdx = Math.floor(y);
    const zIdx = Math.floor(z + HALF_DEPTH);
    if (xIdx < 0 || xIdx >= WIDTH || yIdx < 0 || yIdx >= HEIGHT || zIdx < 0 || zIdx >= DEPTH) return -1;
    return xIdx + zIdx * WIDTH + yIdx * WIDTH * DEPTH;
}
function getPosFromIndex(idx) {
    const y = Math.floor(idx / (WIDTH * DEPTH));
    const rem = idx % (WIDTH * DEPTH);
    const z = Math.floor(rem / WIDTH);
    const x = rem % WIDTH;
    return { x: x - HALF_WIDTH + 0.5, y: y + 0.5, z: z - HALF_DEPTH + 0.5 };
}

// 색상별 InstancedMesh 용량 확장 (필요 개수만큼 함께 키움)
function ensureColorCapacity(c, need) {
    const old = instancedMeshes[c];
    if (!old) return false;
    const meshCap = old.userData.capacity || old.instanceMatrix.count || 0;
    const slotCap = colorSlotIndex[c] ? colorSlotIndex[c].length : 0;
    if (need <= meshCap && need <= slotCap) return true;
    let newCap = Math.max(meshCap, slotCap, INITIAL_INSTANCES_PER_COLOR);
    while (newCap < need) newCap = Math.ceil(newCap * 1.5);
    if (newCap > meshCap) {
        const grown = new THREE.InstancedMesh(old.geometry, old.material, newCap);
        grown.castShadow = old.castShadow;
        grown.receiveShadow = old.receiveShadow;
        grown.count = Math.min(old.count, newCap);
        if (old.count > 0) grown.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, old.count * 16));
        grown.instanceMatrix.needsUpdate = true;
        grown.userData = Object.assign({}, old.userData, { capacity: newCap });
        scene.remove(old);
        old.dispose();
        scene.add(grown);
        instancedMeshes[c] = grown;
    }
    if (newCap > slotCap) {
        const slots = new Int32Array(newCap).fill(-1);
        const src = colorSlotIndex[c];
        if (src) slots.set(src.subarray(0, Math.min(src.length, newCap)));
        colorSlotIndex[c] = slots;
    }
    return true;
}

function markDirtySlot(c, slot) { dirtyColorSlots[c].push(slot); }

function addInstancedBlock(c, idx) {
    let imesh = instancedMeshes[c];
    if (!imesh) return;
    const slot = colorCounts[c];
    if (slot >= (colorSlotIndex[c] ? colorSlotIndex[c].length : 0)) {
        ensureColorCapacity(c, slot + 1);
        if (slot >= (colorSlotIndex[c] ? colorSlotIndex[c].length : 0)) return;
        imesh = instancedMeshes[c];
        if (!imesh) return;
    }
    if (!incTempObject) incTempObject = new THREE.Object3D();
    const pos = getPosFromIndex(idx);
    incTempObject.position.set(pos.x, pos.y, pos.z);
    incTempObject.updateMatrix();
    imesh.setMatrixAt(slot, incTempObject.matrix);
    colorSlotIndex[c][slot] = idx;
    blockSlot[idx] = slot;
    colorCounts[c] = slot + 1;
    imesh.count = colorCounts[c];
    markDirtySlot(c, slot);
}

function removeInstancedBlock(c, idx) {
    const imesh = instancedMeshes[c];
    if (!imesh) return;
    const slot = blockSlot[idx];
    if (slot < 0) return;
    const last = colorCounts[c] - 1;
    if (slot !== last) {
        const lastIdx = colorSlotIndex[c][last];
        if (!incSwapMatrix) incSwapMatrix = new THREE.Matrix4();
        imesh.getMatrixAt(last, incSwapMatrix);
        imesh.setMatrixAt(slot, incSwapMatrix);
        colorSlotIndex[c][slot] = lastIdx;
        blockSlot[lastIdx] = slot;
        colorSlotIndex[c][last] = -1;
        markDirtySlot(c, slot);
    }
    colorCounts[c] = last;
    imesh.count = last;
    blockSlot[idx] = -1;
}

function flushDirtyBlocks() {
    if (!isEngineInitialized) return;
    for (let c = 1; c <= 10; c++) {
        const list = dirtyColorSlots[c];
        if (!list || !list.length) continue;
        const n = list.length;
        const first = list[0];
        let minS = Infinity, maxS = -Infinity;
        for (let i = 0; i < n; i++) { const s = list[i]; if (s < minS) minS = s; if (s > maxS) maxS = s; }
        list.length = 0;
        const imesh = instancedMeshes[c];
        if (!imesh) continue;
        if (n === 1) {
            imesh.instanceMatrix.updateRange.offset = first * 16;
            imesh.instanceMatrix.updateRange.count = 16;
        } else {
            const span = maxS - minS + 1;
            if (span <= 1024) {
                imesh.instanceMatrix.updateRange.offset = minS * 16;
                imesh.instanceMatrix.updateRange.count = span * 16;
            } else {
                imesh.instanceMatrix.updateRange.offset = 0;
                imesh.instanceMatrix.updateRange.count = -1;
            }
        }
        imesh.instanceMatrix.needsUpdate = true;
    }
}

// 전체 재동기화 (맵 로드/초기화 후 호출)
function updateInstancedMeshes() {
    if (!isEngineInitialized) return;
    const colorLists = Array.from({ length: 14 }, () => []);
    for (let i = 0; i < MAP_SIZE; i++) {
        const val = worldData[i];
        if (val > 0 && val <= 13) colorLists[val].push(i);
    }
    const tempObject = new THREE.Object3D();
    for (let c = 1; c <= 13; c++) {
        let imesh = instancedMeshes[c];
        if (!imesh) continue;
        const indices = colorLists[c];
        if (indices.length > 0) {
            ensureColorCapacity(c, indices.length);
            imesh = instancedMeshes[c];
            if (!imesh) continue;
        }
        const count = indices.length;
        imesh.count = count;
        for (let i = 0; i < count; i++) {
            const pos = getPosFromIndex(indices[i]);
            tempObject.position.set(pos.x, pos.y, pos.z);
            tempObject.updateMatrix();
            imesh.setMatrixAt(i, tempObject.matrix);
        }
        imesh.instanceMatrix.needsUpdate = true;
    }
    // 구버전 맵 호환: 큐브(11)·미디어(12) 개별 메시 재구성
    if (cubeBlockGroup && cubeBlockGeo && rubikFaceMaterials) {
        while (cubeBlockGroup.children.length > 0) cubeBlockGroup.remove(cubeBlockGroup.children[0]);
        cubeBlockMeshMap.clear();
        for (const i of colorLists[11]) {
            const pos = getPosFromIndex(i);
            const block = new THREE.Mesh(cubeBlockGeo, rubikFaceMaterials);
            block.position.set(pos.x, pos.y, pos.z);
            block.castShadow = true; block.receiveShadow = true;
            cubeBlockGroup.add(block);
            cubeBlockMeshMap.set(i, block);
        }
    }
    if (mediaBlockGroup && cubeBlockGeo && mediaFaceMaterials) {
        while (mediaBlockGroup.children.length > 0) mediaBlockGroup.remove(mediaBlockGroup.children[0]);
        mediaBlockMeshMap.clear();
        for (const i of colorLists[12]) {
            const pos = getPosFromIndex(i);
            const block = new THREE.Mesh(cubeBlockGeo, mediaFaceMaterials);
            block.position.set(pos.x, pos.y, pos.z);
            block.userData = { colorId: 12, worldIdx: i };
            block.castShadow = true; block.receiveShadow = true;
            mediaBlockGroup.add(block);
            mediaBlockMeshMap.set(i, block);
        }
    }
    // 증분 구조 재동기화
    blockSlot.fill(-1);
    for (let c = 1; c <= 10; c++) {
        const live = colorLists[c];
        if (live.length > 0) ensureColorCapacity(c, live.length);
        const n = live.length;
        colorCounts[c] = n;
        colorSlotIndex[c].fill(-1);
        for (let s = 0; s < n; s++) {
            blockSlot[live[s]] = s;
            colorSlotIndex[c][s] = live[s];
        }
        dirtyColorSlots[c].length = 0;
        if (instancedMeshes[c]) instancedMeshes[c].instanceMatrix.updateRange.count = -1;
    }
    dirtyColorSlots[11].length = 0;
}

// 블록 1개 적용 (설치/삭제) — 멀티플레이와 동일한 증분 규칙
function applyBlockChange(data) {
    const idx = data.index;
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAP_SIZE) return;
    const isErase = data.type === 'eraser';
    const oldVal = worldData[idx];
    const newVal = isErase ? 0 : data.colorId;
    if (oldVal === newVal) return;

    if (oldVal === 11 && cubeBlockGroup) {
        const mesh = cubeBlockMeshMap.get(idx);
        if (mesh) { cubeBlockGroup.remove(mesh); cubeBlockMeshMap.delete(idx); }
    } else if (oldVal === 12 && mediaBlockGroup) {
        const mesh = mediaBlockMeshMap.get(idx);
        if (mesh) { mediaBlockGroup.remove(mesh); mediaBlockMeshMap.delete(idx); }
    } else if (oldVal >= 1 && oldVal <= 10) {
        removeInstancedBlock(oldVal, idx);
    }
    if (newVal === 11 && cubeBlockGroup && cubeBlockGeo && rubikFaceMaterials) {
        const pos = getPosFromIndex(idx);
        const block = new THREE.Mesh(cubeBlockGeo, rubikFaceMaterials);
        block.position.set(pos.x, pos.y, pos.z);
        block.castShadow = true; block.receiveShadow = true;
        cubeBlockGroup.add(block);
        cubeBlockMeshMap.set(idx, block);
    } else if (newVal === 12 && mediaBlockGroup && cubeBlockGeo && mediaFaceMaterials) {
        const pos = getPosFromIndex(idx);
        const block = new THREE.Mesh(cubeBlockGeo, mediaFaceMaterials);
        block.position.set(pos.x, pos.y, pos.z);
        block.userData = { colorId: 12, worldIdx: idx };
        block.castShadow = true; block.receiveShadow = true;
        mediaBlockGroup.add(block);
        mediaBlockMeshMap.set(idx, block);
    } else if (newVal >= 1 && newVal <= 10) {
        addInstancedBlock(newVal, idx);
    }
    worldData[idx] = newVal;
    markWorldDirty();
}
