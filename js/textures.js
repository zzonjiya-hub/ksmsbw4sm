// ============================================================
// 캔버스 텍스처 생성 (블록·루빅·캐릭터) — 외부 이미지 없음
// ============================================================
function createBlockTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colorHex;
    ctx.fillRect(0, 0, 64, 64);
    // 상단·좌측 밝은 테두리 / 하단·우측 어두운 테두리
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(0, 0, 64, 2); ctx.fillRect(0, 0, 2, 64);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 62, 64, 2); ctx.fillRect(62, 0, 2, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    return texture;
}

// 구버전 맵 호환 렌더 전용: 큐브블록(11번) 얼굴 텍스처
function createRubikFaceTexture(faceHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const x = 1 + i * 21, y = 1 + j * 21;
            ctx.fillStyle = faceHex;
            ctx.fillRect(x, y, 19, 19);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.fillRect(x, y, 19, 2); ctx.fillRect(x, y, 2, 19);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.fillRect(x, y + 17, 19, 2); ctx.fillRect(x + 17, y, 2, 19);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    return texture;
}

// 구버전 맵 호환 렌더 전용: 미디어블록(12번) 얼굴 텍스처
function createMediaFaceTexture(faceHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(0, 0, 64, 64);
    const cells = [[1, 1], [33, 1], [1, 33], [33, 33]];
    for (const cp of cells) {
        const x = cp[0], y = cp[1];
        ctx.fillStyle = faceHex;
        ctx.fillRect(x, y, 30, 30);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.fillRect(x, y, 30, 2); ctx.fillRect(x, y, 2, 30);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(x, y + 28, 30, 2); ctx.fillRect(x + 28, y, 2, 30);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
    return texture;
}

// 박스 모서리를 부드럽게 (UV·재질그룹 유지)
function softenBox(geo, r) {
    const p = geo.parameters;
    const hx = p.width / 2 - r, hy = p.height / 2 - r, hz = p.depth / 2 - r;
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const qx = Math.max(-hx, Math.min(hx, v.x));
        const qy = Math.max(-hy, Math.min(hy, v.y));
        const qz = Math.max(-hz, Math.min(hz, v.z));
        const dx = v.x - qx, dy = v.y - qy, dz = v.z - qz;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > r && len > 1e-6) {
            const s = r / len;
            pos.setXYZ(i, qx + dx * s, qy + dy * s, qz + dz * s);
        }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
}

function createSteveHeadTextures() {
    const materials = [];
    const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const base = '#E8C1A2', hair = '#4a2c11', rim = '#B0BEC5', rimDark = '#78909C';
    faces.forEach(face => {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.scale(4, 4); // 64 좌표계 그대로 4배 해상도
        if (face === 'top') {
            ctx.fillStyle = hair; ctx.fillRect(0, 0, 64, 64);
        } else if (face === 'bottom') {
            ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
        } else if (face === 'front') {
            ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = hair;
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(64, 30);
            ctx.lineTo(52, 12); ctx.lineTo(12, 12); ctx.lineTo(0, 30);
            ctx.closePath(); ctx.fill();
            const eyes = [[19, 30], [45, 30]];
            eyes.forEach(([cx, cy]) => {
                ctx.fillStyle = rimDark;
                ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = rim;
                ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#212121';
                ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 3, cy - 5, 4, 4);
            });
            ctx.fillStyle = '#D89A6B';
            ctx.beginPath(); ctx.ellipse(32, 43, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(32, 47, 8, 0.4, Math.PI - 0.4); ctx.stroke();
        } else if (face === 'back') {
            ctx.fillStyle = hair; ctx.fillRect(0, 0, 64, 64);
        } else if (face === 'right' || face === 'left') {
            ctx.fillStyle = hair; ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = base;
            ctx.beginPath();
            if (face === 'right') { ctx.moveTo(0, 30); ctx.lineTo(0, 64); ctx.lineTo(44, 64); ctx.closePath(); }
            else { ctx.moveTo(64, 30); ctx.lineTo(64, 64); ctx.lineTo(20, 64); ctx.closePath(); }
            ctx.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
        materials.push(new THREE.MeshLambertMaterial({ map: texture }));
    });
    return materials;
}

function createSteveArmTextures(sleeveHex) {
    const materials = [];
    const faces = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    const sleeveColor = sleeveHex || '#00cbc9';
    const skinColor = '#E8C1A2';
    faces.forEach(face => {
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (face === 'top') { ctx.fillStyle = sleeveColor; ctx.fillRect(0, 0, 16, 32); }
        else if (face === 'bottom') { ctx.fillStyle = skinColor; ctx.fillRect(0, 0, 16, 32); }
        else {
            ctx.fillStyle = sleeveColor; ctx.fillRect(0, 0, 16, 13);
            ctx.fillStyle = skinColor; ctx.fillRect(0, 13, 16, 19);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        materials.push(new THREE.MeshLambertMaterial({ map: texture }));
    });
    return materials;
}

function drawRoundRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, width, height, radius); return; }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function createNameplate(name) {
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    ctx.font = `bold 33px "Noto Sans KR", "Noto Sans KR Latin", sans-serif`;
    const w = ctx.measureText(name).width + 32;
    canvas.width = w + 8; canvas.height = 72;
    ctx.font = `bold 33px "Noto Sans KR", "Noto Sans KR Latin", sans-serif`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    drawRoundRect(ctx, 4, 4, w, 56, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, canvas.width / 2, 32);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
    sprite.scale.set(0.618 * (canvas.width / canvas.height), 0.618, 1);
    return sprite;
}
