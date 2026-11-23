// ============================================================
// Three.js 엔진 초기화·물리·프레임 루프 (비행모드 고정)
// ============================================================
function onWindowResize() {
    const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!camera || !renderer) return;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
}

function applyQuality(q) {
    currentQuality = q;
    try { localStorage.setItem('ksms1play-quality', q); } catch (e) {}
    if (renderer && camera) {
        renderer.setPixelRatio(qualityPixelRatio(q));
        camera.far = qualityViewDistance(q);
        camera.updateProjectionMatrix();
        if (scene.fog) scene.fog.density = qualityFogDensity(q);
        onWindowResize();
    }
    if (sunLight) {
        const shadowsOn = (q === 'HIGH');
        sunLight.castShadow = shadowsOn;
        if (renderer) renderer.shadowMap.enabled = shadowsOn;
        scene.traverse((obj) => {
            if (obj.material) {
                (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => { m.needsUpdate = true; });
            }
        });
    }
    const qIcon = document.getElementById('quality-icon');
    const qLabel = document.getElementById('quality-label');
    if (qIcon && qLabel) {
        qIcon.className = `fa-solid ${QUALITY_ICONS[q]} text-sm`;
        qLabel.innerText = QUALITY_LABELS[q];
    }
}

function initEngine() {
    const canvas = document.getElementById('game-canvas');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8bcbf9);
    scene.fog = new THREE.FogExp2(0x8bcbf9, 0.012);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, qualityViewDistance(currentQuality));
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !isAndroidDevice, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.maxDistance = 15; controls.minDistance = 4;
    controls.maxPolarAngle = Math.PI * (75 / 180); controls.minPolarAngle = Math.PI * (1 / 180);
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: null };

    const startDist = 9.5, rad30 = Math.PI / 6;
    camera.position.set(0, startDist * Math.sin(rad30) + 1.5, startDist * Math.cos(rad30));
    controls.target.set(0, 1, 0); controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    sunLight = new THREE.DirectionalLight(0xffffff, 0.85);
    sunLight.position.set(20, 60, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 150;
    const d = 40;
    sunLight.shadow.camera.left = -d; sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d; sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    floorMesh = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_SIZE, 1, FLOOR_SIZE), new THREE.MeshLambertMaterial({ color: 0x59893d }));
    floorMesh.position.y = -0.5; floorMesh.receiveShadow = true; scene.add(floorMesh);

    // 원본 게임과 동일한 격자 선 (y=0.01, 원본 빈 세계 기본 상태)
    const gridHelper = new THREE.GridHelper(FLOOR_SIZE, FLOOR_SIZE, 0x466d2e, 0x4d7535);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    // 블록 공유 지오메트리 + 구버전(큐브/미디어) 호환 렌더 자원
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const rubikFaceColors = [colorPalette[1], colorPalette[3], colorPalette[8], colorPalette[2], colorPalette[4], colorPalette[5]];
    rubikFaceMaterials = rubikFaceColors.map(hex => new THREE.MeshLambertMaterial({ map: createRubikFaceTexture(hex) }));
    cubeBlockGeo = cubeGeo;
    cubeBlockGroup = new THREE.Group(); scene.add(cubeBlockGroup);
    mediaFaceMaterials = rubikFaceColors.map(hex => new THREE.MeshLambertMaterial({ map: createMediaFaceTexture(hex) }));
    mediaBlockGroup = new THREE.Group(); scene.add(mediaBlockGroup);

    for (let c = 1; c <= 13; c++) {
        if (c === 11 || c === 12) continue; // 큐브·미디어는 별도 그룹
        const texture = createBlockTexture(colorPalette[c]);
        const mat = new THREE.MeshLambertMaterial({ map: texture });
        const imesh = new THREE.InstancedMesh(cubeGeo, mat, INITIAL_INSTANCES_PER_COLOR);
        imesh.count = 0;
        imesh.userData = { capacity: INITIAL_INSTANCES_PER_COLOR };
        imesh.castShadow = true;
        imesh.receiveShadow = true;
        scene.add(imesh);
        instancedMeshes[c] = imesh;
    }

    // 월드가 비어 있으면 새 맵(바닥 초록 1층) 생성
    let empty = true;
    for (let i = 0; i < MAP_SIZE; i++) { if (worldData[i] > 0) { empty = false; break; } }
    if (empty) createFreshWorld();

    characterGroup = buildSteveCharacter(localPlayerName, selectedOutfitId);
    characterGroup.position.set(0, 1.02, 0); // 엔진 준비 후 getSpawnPosition()으로 재배치
    prevCharPos.copy(characterGroup.position);
    const spawnPos = getSpawnPosition();
    charPhysics.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    charPhysics.velocity.set(0, 0, 0);
    charPhysics.isCrawling = false;
    characterGroup.position.copy(charPhysics.position);

    isEngineInitialized = true;
    updateInstancedMeshes();
    liftCharacterOutOfBlocks();
    applyQuality(currentQuality);
}

// ============================================================
// 물리 (비행/걷기 하위 모드 + 중력) — 프레임 독립 dt 기반
// ============================================================
function updatePhysics() {
    if (!isEngineInitialized) return;
    prevCharPos.copy(charPhysics.position);
    const now = Date.now();
    let dt = (now - lastPhysMs) / 1000;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    lastPhysMs = now;

    const isFreeFly = (localFlightMode === 'fly');

    // ---- 수직 ----
    if (isFreeFly) {
        charPhysics.velocity.y = 0; charPhysics.isGrounded = false;
        let vMove = 0;
        if (keys.flyUp && !charPhysics.isCrawling) vMove = PHYS.FLY * dt;
        else if (keys.flyDown) vMove = -PHYS.FLY * dt;

        if (vMove !== 0) {
            let tY = charPhysics.position.y + vMove;
            if (tY < 0.0) { tY = 0.0; charPhysics.isGrounded = true; }
            else if (checkCollision(charPhysics.position.x, tY, charPhysics.position.z, null, 0.02)) tY = charPhysics.position.y;
            charPhysics.position.y = tY;
        }
        const isOnGround = (charPhysics.position.y <= 0.01) || checkCollision(charPhysics.position.x, charPhysics.position.y - 0.1, charPhysics.position.z, false);
        const cannotStandUp = checkCollision(charPhysics.position.x, charPhysics.position.y, charPhysics.position.z, false);
        if (keys.flyDown && isOnGround || cannotStandUp) charPhysics.isCrawling = true;
        else charPhysics.isCrawling = false;
    } else {
        const cannotStandUp = checkCollision(charPhysics.position.x, charPhysics.position.y, charPhysics.position.z, false);
        charPhysics.isCrawling = (keys.flyDown || cannotStandUp);
        charPhysics.velocity.y -= PHYS.GRAVITY * dt;
        if (charPhysics.velocity.y < -PHYS.FALL_MAX) charPhysics.velocity.y = -PHYS.FALL_MAX;
        let tY = charPhysics.position.y + charPhysics.velocity.y * dt;

        if (tY < 0.0) {
            tY = 0.0; charPhysics.velocity.y = 0; charPhysics.isGrounded = true;
        } else {
            if (charPhysics.velocity.y < 0 && checkCollision(charPhysics.position.x, tY, charPhysics.position.z, null, 0.02)) {
                const snappedY = Math.floor(charPhysics.position.y);
                let hasSupport = false;
                if (snappedY > 0) {
                    const r = 0.35;
                    const szi0 = Math.floor(charPhysics.position.z - r + HALF_DEPTH), szi1 = Math.floor(charPhysics.position.z + r + HALF_DEPTH);
                    const sxi0 = Math.floor(charPhysics.position.x - r + HALF_WIDTH), sxi1 = Math.floor(charPhysics.position.x + r + HALF_WIDTH);
                    for (let x = sxi0; x <= sxi1 && !hasSupport; x++)
                        for (let z = szi0; z <= szi1 && !hasSupport; z++) {
                            if (x < 0 || x >= WIDTH || z < 0 || z >= DEPTH) continue;
                            const sv = worldData[(snappedY - 1) * (WIDTH * DEPTH) + z * WIDTH + x];
                            if (sv > 0) hasSupport = true;
                        }
                }
                if (hasSupport) { tY = snappedY; charPhysics.velocity.y = 0; charPhysics.isGrounded = true; }
                else { charPhysics.velocity.y = 0; tY = charPhysics.position.y; charPhysics.isGrounded = false; }
            } else if (charPhysics.velocity.y > 0 && checkCollision(charPhysics.position.x, tY, charPhysics.position.z, null, 0.02)) {
                charPhysics.velocity.y = 0; tY = charPhysics.position.y;
            } else charPhysics.isGrounded = false;
        }
        charPhysics.position.y = tY;
    }

    if (charPhysics.position.y > MAX_Y) {
        charPhysics.position.y = MAX_Y;
        if (charPhysics.velocity.y > 0) charPhysics.velocity.y = 0;
    }

    // ---- 수평 ----
    let moveX = 0, moveZ = 0;
    if (keys.w) moveZ -= 1; if (keys.s) moveZ += 1; if (keys.a) moveX -= 1; if (keys.d) moveX += 1;
    if (touchActive) { moveX = joystickDir.x; moveZ = -joystickDir.y; }

    const moveVector = tmpMove.set(moveX, 0, moveZ);
    const isMoving = moveVector.lengthSq() > 0;

    // 🌟 [수정] 일반 캐릭터 자동 계단 오르기 제거 — 멀티(index.html)와 동일하게
    //    이동 중 블록과 겹쳐도 자동으로 위로 올리지 않음 (1칸 계단은 점프로만 올라감)
    //    초기화·맵 불러오기 시의 liftCharacterOutOfBlocks() 호출은 그대로 유지 (파묻힘 해소)

    if (isMoving) {
        moveVector.normalize();
        const camDir = tmpCamDir; camera.getWorldDirection(camDir); camDir.y = 0;
        if (camDir.lengthSq() < 0.0001) camDir.set(0, 0, -1); else camDir.normalize();
        const camRight = tmpCamRight.crossVectors(camera.up, camDir).normalize().negate();
        const finalDir = tmpFinalDir.addScaledVector(camDir, -moveZ).addScaledVector(camRight, moveX).normalize();

        const speedBase = charPhysics.isCrawling ? PHYS.SPEED * 0.5 : PHYS.SPEED;
        const step = speedBase * dt;
        const targetX = charPhysics.position.x + finalDir.x * step;
        const targetZ = charPhysics.position.z + finalDir.z * step;

        if (!checkCollision(targetX, charPhysics.position.y, targetZ)) {
            charPhysics.position.x = targetX; charPhysics.position.z = targetZ;
        } else {
            if (!checkCollision(targetX, charPhysics.position.y, charPhysics.position.z)) charPhysics.position.x = targetX;
            if (!checkCollision(charPhysics.position.x, charPhysics.position.y, targetZ)) charPhysics.position.z = targetZ;
        }
        if (checkCollision(charPhysics.position.x, charPhysics.position.y, charPhysics.position.z)) {
            const nudge = 0.1;
            const dirs = [{ x: nudge, z: 0 }, { x: -nudge, z: 0 }, { x: 0, z: nudge }, { x: 0, z: -nudge }];
            for (const d of dirs) {
                if (!checkCollision(charPhysics.position.x + d.x, charPhysics.position.y, charPhysics.position.z + d.z)) {
                    charPhysics.position.x += d.x; charPhysics.position.z += d.z; break;
                }
            }
        }
        characterGroup.rotation.y = Math.atan2(finalDir.x, finalDir.z);
    }

    const edgeLimit = FLOOR_SIZE / 2 - 1;
    if (charPhysics.position.x > edgeLimit) charPhysics.position.x = edgeLimit;
    if (charPhysics.position.x < -edgeLimit) charPhysics.position.x = -edgeLimit;
    if (charPhysics.position.z > edgeLimit) charPhysics.position.z = edgeLimit;
    if (charPhysics.position.z < -edgeLimit) charPhysics.position.z = -edgeLimit;

    characterGroup.position.copy(charPhysics.position);

    if (sunLight && characterGroup) {
        sunLight.position.set(charPhysics.position.x + 30, charPhysics.position.y + 60, charPhysics.position.z + 15);
        sunLight.target = characterGroup;
    }

    const cp = charPhysics.crawlProgress = lerp(charPhysics.crawlProgress, charPhysics.isCrawling ? 1.0 : 0.0, 0.15);
    const P = characterGroup.userData.parts || (characterGroup.userData.parts = collectParts(characterGroup));
    const head = P.head, torso = P.torso, lL = P.lL, rL = P.rL, lA = P.lA, rA = P.rA, np = P.np;
    const swing = isMoving ? Math.sin(now * 0.012) * 0.5 : 0;
    const crawlSwing = swing * lerp(1.0, 0.5, cp);

    if (torso && head && lL && rL && lA && rA) {
        torso.scale.set(1, lerp(1.0, 0.5, cp), 1);
        torso.position.y = lerp(0.7, 0.22, cp); torso.position.z = lerp(0, -0.1, cp); torso.rotation.x = lerp(0, Math.PI / 2, cp);
        head.position.y = lerp(1.5, 0.45, cp); head.position.z = lerp(0, 0.4, cp); head.rotation.x = lerp(0, -Math.PI / 12, cp);
        lL.scale.set(1, lerp(1.0, 0.5, cp), 1); rL.scale.set(1, lerp(1.0, 0.5, cp), 1);
        lL.position.y = lerp(0.4, 0.22, cp); rL.position.y = lerp(0.4, 0.22, cp);
        lL.position.z = lerp(0, -0.15, cp); rL.position.z = lerp(0, -0.15, cp);
        lA.position.y = lerp(1.0, 0.22, cp); rA.position.y = lerp(1.0, 0.22, cp);
        lA.position.z = lerp(0, 0.35, cp); rA.position.z = lerp(0, 0.35, cp);
        if (np) { np.position.y = lerp(2.6, 1.2, cp); np.position.z = lerp(0, 0.4, cp); np.quaternion.copy(camera.quaternion); }
        lL.rotation.x = lerp(0, Math.PI / 2, cp) + crawlSwing;
        rL.rotation.x = lerp(0, Math.PI / 2, cp) - crawlSwing;
        lA.rotation.x = lerp(0, -Math.PI / 2, cp) - crawlSwing;
        rA.rotation.x = lerp(0, -Math.PI / 2, cp) + crawlSwing;
    }

    const targetYOffset = isFirstPerson ? lerp(1.5, 0.45, charPhysics.crawlProgress) : 1.0;
    const absoluteTarget = tmpCamTarget.copy(charPhysics.position); absoluteTarget.y += targetYOffset;
    const offset = tmpCamOffset.subVectors(camera.position, controls.target);
    if (isFirstPerson) offset.normalize().multiplyScalar(0.01);
    controls.target.copy(absoluteTarget); camera.position.copy(absoluteTarget).add(offset);

    const zSlider = document.getElementById('zoom-slider');
    if (zSlider && document.activeElement !== zSlider && !isFirstPerson) zSlider.value = Math.round(19 - offset.length());
}

let lastRenderTime = 0;
function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    if (controls) controls.update();
    const nowMs = performance.now();
    if (nowMs - lastRenderTime < qualityFrameInterval(currentQuality)) return;
    lastRenderTime = nowMs;
    flushDirtyBlocks();
    if (scene && camera && renderer) renderer.render(scene, camera);
}
