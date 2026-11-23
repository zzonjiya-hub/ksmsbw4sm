// ============================================================
// 캐릭터 생성·충돌·끼임 탈출
// ============================================================
function buildSteveCharacter(name, outfitId) {
    const group = new THREE.Group();
    const outfit = outfitById(outfitId || selectedOutfitId);
    const torsoHex = outfit.shirt;
    const pantsHex = outfit.pants;
    const headGeo = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3); softenBox(headGeo, 0.12);
    const head = new THREE.Mesh(headGeo, createSteveHeadTextures());
    head.position.y = 1.5; head.name = "head"; head.castShadow = true; group.add(head);

    const torsoGeo = new THREE.BoxGeometry(0.8, 0.6, 0.4, 2, 2, 2); softenBox(torsoGeo, 0.08);
    const torso = new THREE.Mesh(torsoGeo, new THREE.MeshLambertMaterial({ color: parseInt(torsoHex.slice(1), 16) }));
    torso.position.y = 0.7; torso.name = "torso"; torso.castShadow = true; group.add(torso);

    const legGeo = new THREE.BoxGeometry(0.38, 0.4, 0.4, 2, 2, 2); softenBox(legGeo, 0.06); legGeo.translate(0, -0.2, 0);
    const legMat = new THREE.MeshLambertMaterial({ color: parseInt(pantsHex.slice(1), 16) });
    const lL = new THREE.Mesh(legGeo, legMat); lL.position.set(-0.2, 0.4, 0); lL.name = "leftLeg"; lL.castShadow = true; group.add(lL);
    const rL = new THREE.Mesh(legGeo, legMat); rL.position.set(0.2, 0.4, 0); rL.name = "rightLeg"; rL.castShadow = true; group.add(rL);

    const armGeo = new THREE.BoxGeometry(0.24, 0.6, 0.35, 2, 2, 2); softenBox(armGeo, 0.05); armGeo.translate(0, -0.3, 0);
    const lA = new THREE.Mesh(armGeo, createSteveArmTextures(outfit.shirt)); lA.position.set(-0.5, 1.0, 0); lA.name = "leftArm"; lA.castShadow = true; group.add(lA);
    const rA = new THREE.Mesh(armGeo, createSteveArmTextures(outfit.shirt)); rA.position.set(0.5, 1.0, 0); rA.name = "rightArm"; rA.castShadow = true; group.add(rA);

    const np = createNameplate(name); np.position.y = 2.6; np.name = "nameplate"; group.add(np);

    if (scene) scene.add(group);
    return group;
}

function collectParts(g) {
    return {
        head: g.getObjectByName("head"), torso: g.getObjectByName("torso"),
        lL: g.getObjectByName("leftLeg"), rL: g.getObjectByName("rightLeg"),
        lA: g.getObjectByName("leftArm"), rA: g.getObjectByName("rightArm"),
        np: g.getObjectByName("nameplate")
    };
}

// 물리 충돌 판정 (블록 0보다 크면 단단함)
function checkCollision(px, py, pz, forceCrawlCheck = null, horizontalMargin = 0) {
    const r = 0.35 - horizontalMargin;
    const activeCrawling = (forceCrawlCheck !== null) ? forceCrawlCheck : charPhysics.isCrawling;
    const h = activeCrawling ? 0.85 : 1.95;
    const minX = Math.floor(px - r + HALF_WIDTH), maxX = Math.floor(px + r + HALF_WIDTH);
    const minY = Math.floor(py), maxY = Math.floor(py + h);
    const minZ = Math.floor(pz - r + HALF_DEPTH), maxZ = Math.floor(pz + r + HALF_DEPTH);
    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && z >= 0 && z < DEPTH) {
                    const idx = x + z * WIDTH + y * WIDTH * DEPTH;
                    const v = worldData[idx];
                    if (v > 0) return true;
                }
            }
        }
    }
    return false;
}

// 블록 안에 갇힌 캐릭터를 블록 위로 들어올림
function liftCharacterOutOfBlocks() {
    if (!isEngineInitialized) return false;
    const p = charPhysics.position;
    const isAtSpawn = (Math.abs(p.x) < 2 && Math.abs(p.z) < 2);
    const minX = isAtSpawn ? 59 : Math.max(0, Math.floor(p.x - 0.35 + HALF_WIDTH));
    const maxX = isAtSpawn ? 60 : Math.min(WIDTH - 1, Math.floor(p.x + 0.35 + HALF_WIDTH));
    const minZ = isAtSpawn ? 59 : Math.max(0, Math.floor(p.z - 0.35 + HALF_DEPTH));
    const maxZ = isAtSpawn ? 60 : Math.min(DEPTH - 1, Math.floor(p.z + 0.35 + HALF_DEPTH));

    const yStart = p.y;
    for (let guard = 0; guard < HEIGHT; guard++) {
        const bodyTop = p.y + (charPhysics.isCrawling ? 0.85 : 1.95);
        let maxOverlapY = -1;
        for (let y = 0; y < HEIGHT; y++) {
            if (y + 1 <= p.y - 1.0 || y >= bodyTop) continue;
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const idx = y * (WIDTH * DEPTH) + z * WIDTH + x;
                    if (worldData[idx] > 0) { if (y > maxOverlapY) maxOverlapY = y; }
                }
            }
        }
        if (maxOverlapY < 0 || p.y >= maxOverlapY + 1 - 0.03) break;
        p.y = maxOverlapY + 1.02;
    }
    if (p.y !== yStart) {
        charPhysics.velocity.set(0, 0, 0);
        charPhysics.isGrounded = true;
        return true;
    }
    return false;
}

// 최초 스폰 위치 (맵 중앙 기둥 기준 첫 빈틈)
function getSpawnPosition() {
    const SX = 60, SZ = 60;
    let gapY = -1, colTop = -1;
    for (let y = 0; y < HEIGHT - 1; y++) {
        const a = worldData[y * (WIDTH * DEPTH) + SZ * WIDTH + SX];
        const b = worldData[(y + 1) * (WIDTH * DEPTH) + SZ * WIDTH + SX];
        if (a > 0 && y > colTop) colTop = y;
        if (b > 0 && y + 1 > colTop) colTop = y + 1;
        if (!a && !b && gapY < 0) gapY = y;
    }
    if (gapY === 0) return { x: 0, y: 1.02, z: 0 };
    if (gapY > 0) return { x: 0, y: gapY + 0.02, z: 0 };
    if (colTop >= 0) return { x: 0, y: colTop + 1.02, z: 0 };
    return { x: 0, y: 1.02, z: 0 };
}
