// ============================================================
// 입력 — 마우스/터치/키보드/조이스틱, 핫바, 블록 설치·삭제
// ============================================================

function handleJumpTrigger() {
    if (isFlightEnabled()) return; // 비행 모드: 점프 버튼은 상승 버튼
    if (charPhysics.isCrawling) return;
    if (charPhysics.isGrounded) {
        charPhysics.velocity.y = PHYS.JUMP_V; charPhysics.isGrounded = false;
    }
}

function selectHotbar(index) {
    activeHotbarIndex = index;
    document.querySelectorAll('.hotbar-slot').forEach(slot => slot.classList.remove('active'));
    const activeSlot = document.querySelector(`.hotbar-slot[data-index="${index}"]`);
    if (activeSlot) {
        activeSlot.classList.add('active');
        if (activeSlot.getAttribute('data-type') === 'eraser') {
            selectedToolType = 'eraser';
        } else {
            selectedToolType = 'block';
        }
    }
}

// 블록 설치/삭제 (5칸 이내)
function handleInteract() {
    if (!isEngineInitialized) return;
    raycaster.setFromCamera(mouse, camera);

    const intersectables = [floorMesh];
    for (let c = 1; c <= 12; c++) {
        if (instancedMeshes[c]) intersectables.push(instancedMeshes[c]);
    }
    if (cubeBlockGroup) intersectables.push(cubeBlockGroup);
    if (mediaBlockGroup) intersectables.push(mediaBlockGroup);

    const intersects = raycaster.intersectObjects(intersectables, true);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const targetPos = new THREE.Vector3();

        if (selectedToolType === 'eraser') {
            if (hit.object === floorMesh) return;
            if (hit.instanceId !== undefined && hit.object instanceof THREE.InstancedMesh) {
                const tempMatrix = new THREE.Matrix4();
                hit.object.getMatrixAt(hit.instanceId, tempMatrix);
                targetPos.setFromMatrixPosition(tempMatrix);
                targetPos.x = Math.floor(targetPos.x) + 0.5;
                targetPos.y = Math.floor(targetPos.y) + 0.5;
                targetPos.z = Math.floor(targetPos.z) + 0.5;
            } else if (cubeBlockGroup && hit.object.parent === cubeBlockGroup) {
                targetPos.copy(hit.object.position);
            } else if (mediaBlockGroup && hit.object.parent === mediaBlockGroup) {
                targetPos.copy(hit.object.position);
            } else return;
        } else {
            if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
                const tempMatrix = new THREE.Matrix4();
                hit.object.getMatrixAt(hit.instanceId, tempMatrix);
                const blockCenter = new THREE.Vector3();
                blockCenter.setFromMatrixPosition(tempMatrix);
                targetPos.copy(blockCenter).add(hit.face.normal);
            } else if (cubeBlockGroup && hit.object.parent === cubeBlockGroup) {
                targetPos.copy(hit.object.position).add(hit.face.normal);
            } else if (mediaBlockGroup && hit.object.parent === mediaBlockGroup) {
                targetPos.copy(hit.object.position).add(hit.face.normal);
            } else if (hit.object === floorMesh) {
                targetPos.copy(hit.point).add(hit.face.normal.clone().multiplyScalar(0.5));
            } else return;
            targetPos.x = Math.floor(targetPos.x) + 0.5;
            targetPos.y = Math.floor(targetPos.y) + 0.5;
            targetPos.z = Math.floor(targetPos.z) + 0.5;
            if (targetPos.y < 0.5) targetPos.y = 0.5;
        }

        if (targetPos.y >= 60.0) return;
        const idx = getIndex(targetPos.x, targetPos.y, targetPos.z);
        if (idx === -1) return;

        const distToChar = charPhysics.position.distanceTo(targetPos);
        if (distToChar <= 5.0) {
            if (selectedToolType !== 'eraser') {
                // 자기 몸과 겹치는 칸에는 블록을 설치할 수 없음 (갇힘 방지)
                const dx = Math.abs(charPhysics.position.x - targetPos.x);
                const dz = Math.abs(charPhysics.position.z - targetPos.z);
                const inY = (targetPos.y - 0.5 < charPhysics.position.y + 1.95) && (targetPos.y + 0.5 > charPhysics.position.y - 1.0);
                if (dx < 0.85 && dz < 0.85 && inY) {
                    showToast('자신과 겹치는 칸에는 블록을 설치할 수 없습니다!', 0, 'warning');
                    return;
                }
                if (checkCollision(charPhysics.position.x, charPhysics.position.y, charPhysics.position.z)) return;
            }
            const colorId = activeHotbarIndex + 1;
            applyBlockChange({ type: selectedToolType, index: idx, colorId: colorId });
            if (selectedToolType === 'eraser') sfx.playBreak(); else sfx.playPlace();
        }
    }
}

function setupEventListeners() {
    let resetStuckInputs = () => { keys.w = keys.a = keys.s = keys.d = false; keys.flyUp = keys.flyDown = false; };
    window.addEventListener('blur', resetStuckInputs);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetStuckInputs(); });

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
            if (e.target.id !== 'zoom-slider') return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); e.target.blur(); }
        }
        const key = e.key.toLowerCase();
        if (key === 'w' || e.key === 'ArrowUp') keys.w = true;
        if (key === 's' || e.key === 'ArrowDown') keys.s = true;
        if (key === 'a' || e.key === 'ArrowLeft') keys.a = true;
        if (key === 'd' || e.key === 'ArrowRight') keys.d = true;
        if (e.key === ' ') {
            if (isFlightEnabled()) keys.flyUp = true;
            else { keys.flyUp = false; handleJumpTrigger(); }
            e.preventDefault();
        }
        if (e.key === 'Shift') { keys.flyDown = true; e.preventDefault(); }
        if (/[1-9]/.test(e.key)) selectHotbar(parseInt(e.key) - 1);
        else if (e.key === '0') selectHotbar(9);
        else if (e.key === '-' || e.key === '_' || e.key === '=' || e.key === '+') selectHotbar(10);
    });
    window.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w' || e.key === 'ArrowUp') keys.w = false;
        if (key === 's' || e.key === 'ArrowDown') keys.s = false;
        if (key === 'a' || e.key === 'ArrowLeft') keys.a = false;
        if (key === 'd' || e.key === 'ArrowRight') keys.d = false;
        if (e.key === ' ') keys.flyUp = false;
        if (e.key === 'Shift') keys.flyDown = false;
    });

    const canvas = document.getElementById('game-canvas');
    let isPointerActive = false, pointerStartX = 0, pointerStartY = 0, pointerMoved = false;
    let isTouchRotating = false, touchRotateStartX = 0, touchRotateStartY = 0, activeRotatePointerId = null;

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        isPointerActive = true; pointerMoved = false;
        pointerStartX = e.clientX; pointerStartY = e.clientY;
        if (e.pointerType === 'touch' && activeRotatePointerId === null) {
            activeRotatePointerId = e.pointerId; isTouchRotating = true;
            touchRotateStartX = e.clientX; touchRotateStartY = e.clientY;
            controls.enabled = false;
        }
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isPointerActive) return;
        const dx = e.clientX - pointerStartX, dy = e.clientY - pointerStartY;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) pointerMoved = true;
        if (isTouchRotating && e.pointerType === 'touch' && e.pointerId === activeRotatePointerId) {
            const deltaX = e.clientX - touchRotateStartX, deltaY = e.clientY - touchRotateStartY;
            touchRotateStartX = e.clientX; touchRotateStartY = e.clientY;
            const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            spherical.theta -= deltaX * 0.005; spherical.phi -= deltaY * 0.005;
            spherical.phi = Math.max(controls.minPolarAngle, Math.min(controls.maxPolarAngle, spherical.phi));
            spherical.makeSafe(); offset.setFromSpherical(spherical);
            camera.position.copy(controls.target).add(offset); camera.lookAt(controls.target);
        }
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    const endTouchRotation = (e) => {
        if (e && e.pointerId !== activeRotatePointerId) return;
        isPointerActive = false; if (isTouchRotating) { isTouchRotating = false; controls.enabled = true; }
        activeRotatePointerId = null;
    };

    canvas.addEventListener('pointerup', (e) => {
        if (!isPointerActive) return;
        const isTarget = (e.pointerId === activeRotatePointerId); endTouchRotation(e);
        if (!pointerMoved && (e.pointerType === 'mouse' || isTarget)) {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            handleInteract();
        }
    });

    canvas.addEventListener('pointercancel', endTouchRotation); canvas.addEventListener('pointerleave', endTouchRotation);

    const uiContainers = [
        document.getElementById('mobile-joystick'), document.getElementById('mobile-jump-btn'),
        document.getElementById('mobile-crouch-btn'), document.getElementById('hotbar-container'),
        document.getElementById('fullscreen-btn'), document.getElementById('capture-btn'),
        document.getElementById('photo-btn'), document.getElementById('save-btn'),
        document.getElementById('load-btn'), document.getElementById('reset-btn'),
        document.getElementById('zoom-slider'), document.getElementById('view-toggle-btn'),
        document.getElementById('quality-btn'), document.getElementById('flight-toggle-btn')
    ];
    uiContainers.forEach(el => {
        if (el) {
            el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('pointerup', e => e.stopPropagation());
            el.addEventListener('pointermove', e => e.stopPropagation()); el.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
        }
    });

    document.querySelectorAll('.hotbar-slot').forEach(slot => {
        slot.addEventListener('click', (e) => { e.stopPropagation(); selectHotbar(parseInt(slot.getAttribute('data-index'))); });
    });

    const zoomSlider = document.getElementById('zoom-slider');
    zoomSlider.addEventListener('input', (e) => {
        const targetDist = 19 - parseFloat(e.target.value);
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
        camera.position.copy(controls.target).addScaledVector(dir, targetDist);
        controls.update();
    });
    zoomSlider.addEventListener('change', (e) => { e.target.blur(); });

    // iPad 더블탭 확대 차단
    let lastTopBarTouchEnd = 0;
    const topBarEl = document.getElementById('top-bar');
    if (topBarEl) topBarEl.addEventListener('touchend', (e) => {
        const nowMs = Date.now();
        if (nowMs - lastTopBarTouchEnd < 350) e.preventDefault();
        lastTopBarTouchEnd = nowMs;
    }, { passive: false });

    document.getElementById('view-toggle-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        isFirstPerson = !isFirstPerson;
        characterGroup.visible = !isFirstPerson;
        const icon = document.getElementById('view-toggle-icon');
        if (isFirstPerson) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
            controls.minDistance = 0.01; controls.maxDistance = 0.01;
            controls.minPolarAngle = Math.PI * (1 / 180);
            controls.maxPolarAngle = Math.PI * (179 / 180);
            zoomSlider.disabled = true;
            zoomSlider.parentElement.style.opacity = '0.5';
            const rotY = characterGroup.rotation.y;
            const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)).normalize();
            const targetYOffset = lerp(1.5, 0.45, charPhysics.crawlProgress);
            const absoluteTarget = charPhysics.position.clone().add(new THREE.Vector3(0, targetYOffset, 0));
            controls.target.copy(absoluteTarget);
            camera.position.copy(absoluteTarget).addScaledVector(forward, -0.01);
            controls.update();
        } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
            controls.minDistance = 4; controls.maxDistance = 15;
            controls.minPolarAngle = Math.PI * (1 / 180);
            controls.maxPolarAngle = Math.PI * (75 / 180);
            zoomSlider.disabled = false;
            zoomSlider.parentElement.style.opacity = '1';
            const targetDist = 19 - parseFloat(zoomSlider.value);
            const rotY = characterGroup.rotation.y;
            const dir = new THREE.Vector3(-Math.sin(rotY), 0.3, -Math.cos(rotY)).normalize();
            const absoluteTarget = charPhysics.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            controls.target.copy(absoluteTarget);
            camera.position.copy(absoluteTarget).addScaledVector(dir, targetDist);
            controls.update();
        }
    });

    // 화질 토글 (저 → 중 → 고 순환)
    document.getElementById('quality-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const order = ['HIGH', 'MID', 'LOW'];
        const idx = order.indexOf(currentQuality);
        applyQuality(order[(idx + 1) % order.length]);
    });

    document.getElementById('capture-btn').addEventListener('click', (e) => {
        e.stopPropagation(); renderer.render(scene, camera);
        const now = new Date(), yy = String(now.getFullYear()).slice(-2), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0'), hh = String(now.getHours()).padStart(2, '0'), min = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
        const link = document.createElement('a'); link.href = renderer.domElement.toDataURL('image/png'); link.download = `KSMS-${yy}${mm}${dd}-${hh}${min}${ss}.png`; link.click();
    });

    document.getElementById('photo-btn').addEventListener('click', (e) => {
        e.stopPropagation(); renderer.render(scene, camera);
        const newTab = window.open();
        if (newTab) {
            newTab.document.write(`<html><body style="margin:0; background:#000; display:flex; align-items:center; justify-content:center; height:100vh;"><img src="${renderer.domElement.toDataURL('image/png')}" style="max-width:100%; max-height:100%;"/></body></html>`);
            newTab.document.close();
        }
    });

    const fsBtn = document.getElementById('fullscreen-btn');
    fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => { fsBtn.innerHTML = '<i class="fa-solid fa-compress text-sm"></i>'; }).catch(() => {});
        } else {
            document.exitFullscreen().then(() => { fsBtn.innerHTML = '<i class="fa-solid fa-expand text-sm"></i>'; }).catch(() => {});
        }
    });
    document.addEventListener('fullscreenchange', () => {
        fsBtn.innerHTML = document.fullscreenElement
            ? '<i class="fa-solid fa-compress text-sm"></i>'
            : '<i class="fa-solid fa-expand text-sm"></i>';
    });

    // 저장 / 불러오기 / 새 맵
    document.getElementById('save-btn').addEventListener('click', (e) => { e.stopPropagation(); saveWorldToFile(); });
    document.getElementById('load-btn').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('file-input').click(); });
    document.getElementById('file-input').addEventListener('change', loadWorldFromFile);
    document.getElementById('reset-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmModal('새 맵 만들기', '지금까지 만든 맵이 모두 사라지고 새 맵으로 시작합니다. 진행할까요?', () => {
            resetWorldToFresh();
            liftCharacterOutOfBlocks();
            showToast('새 맵을 시작했습니다', 0, 'success');
        });
    });

    // 비행/걷기 토글 (싱글플레이는 항상 비행 모드, 기본 비행 ON)
    applyFlightToggle();
    document.getElementById('flight-toggle-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isEngineInitialized) return;
        localFlightMode = (localFlightMode === 'fly') ? 'walk' : 'fly';
        applyFlightToggle();
        showToast(localFlightMode === 'fly' ? '비행 모드' : '걷기 모드', 0, 'info');
    });

    window.addEventListener('resize', onWindowResize);
}

function setupTouchControls() {
    const joystick = document.getElementById('mobile-joystick');
    const knob = document.getElementById('joystick-knob');
    let isJoyDragging = false;

    const handleStart = (clientX, clientY) => {
        isJoyDragging = true; touchActive = true;
        if (controls) { controls.enableZoom = false; controls.enablePan = false; }
        const rect = joystick.getBoundingClientRect();
        joystickStart.x = clientX - (rect.left + rect.width / 2);
        joystickStart.y = clientY - (rect.top + rect.height / 2);
    };
    const handleMove = (clientX, clientY) => {
        if (!isJoyDragging) return;
        const rect = joystick.getBoundingClientRect();
        const curX = clientX - (rect.left + rect.width / 2), curY = clientY - (rect.top + rect.height / 2);
        let dx = curX - joystickStart.x, dy = curY - joystickStart.y;
        const maxDist = 48, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        joystickDir.x = dx / maxDist; joystickDir.y = -dy / maxDist;
    };
    const handleEnd = () => {
        isJoyDragging = false; touchActive = false;
        if (controls) { controls.enableZoom = true; controls.enablePan = true; }
        knob.style.transform = `translate(0px, 0px)`; joystickDir.x = 0; joystickDir.y = 0;
    };

    joystick.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); joystick.setPointerCapture(e.pointerId); handleStart(e.clientX, e.clientY); });
    joystick.addEventListener('pointermove', (e) => { if (!isJoyDragging) return; e.stopPropagation(); e.preventDefault(); handleMove(e.clientX, e.clientY); });
    const onPointerUp = (e) => { if (!isJoyDragging) return; e.stopPropagation(); e.preventDefault(); try { if (joystick.hasPointerCapture(e.pointerId)) joystick.releasePointerCapture(e.pointerId); } catch (_) {} handleEnd(); };
    joystick.addEventListener('pointerup', onPointerUp); joystick.addEventListener('pointercancel', onPointerUp);
    joystick.addEventListener('lostpointercapture', () => { if (isJoyDragging) handleEnd(); });
    window.addEventListener('blur', () => { handleEnd(); });

    const jumpBtn = document.getElementById('mobile-jump-btn');
    jumpBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (isFlightEnabled()) keys.flyUp = true;
        else { keys.flyUp = false; handleJumpTrigger(); }
    });
    const resetJump = (e) => { e.stopPropagation(); e.preventDefault(); keys.flyUp = false; };
    jumpBtn.addEventListener('pointerup', resetJump); jumpBtn.addEventListener('pointercancel', resetJump); jumpBtn.addEventListener('pointerleave', resetJump);

    const crouchBtn = document.getElementById('mobile-crouch-btn');
    crouchBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); keys.flyDown = true; });
    const resetCrouch = (e) => { e.stopPropagation(); e.preventDefault(); keys.flyDown = false; };
    crouchBtn.addEventListener('pointerup', resetCrouch); crouchBtn.addEventListener('pointercancel', resetCrouch); crouchBtn.addEventListener('pointerleave', resetCrouch);
}

// 비행/걷기 토글 버튼 표시·활성화 상태 갱신 (싱글플레이는 항상 표시)
function applyFlightToggle() {
    const btn = document.getElementById('flight-toggle-btn');
    const knob = document.getElementById('flight-toggle-knob');
    if (!btn || !knob) return;
    const show = true;
    btn.classList.toggle('hidden', !show);
    btn.classList.toggle('flex', show);
    const active = localFlightMode === 'fly';
    btn.classList.toggle('bg-[#800080]/60', active);
    btn.classList.toggle('bg-slate-850/40', !active);
    knob.classList.toggle('translate-x-8', active);
    knob.classList.toggle('translate-x-0', !active);
    const jumpBtn = document.getElementById('mobile-jump-btn');
    if (jumpBtn) jumpBtn.title = active ? '상승 (비행)' : '점프';
}
