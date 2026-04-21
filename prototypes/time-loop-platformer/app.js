(() => {
  "use strict";

  const WIDTH = 900;
  const HEIGHT = 420;
  const DT = 1 / 60;

  const INPUT_LEFT = 1 << 0;
  const INPUT_RIGHT = 1 << 1;
  const INPUT_JUMP = 1 << 2;
  const INPUT_USE = 1 << 3;

  const PHYSICS = {
    gravity: 0.8,
    maxFall: 14,
    groundAccel: 0.9,
    airAccel: 0.55,
    friction: 0.78,
    coyoteFrames: 6,
    jumpBufferFrames: 5
  };

  const THROW_WINDOW_FRAMES = 12;
  const THROW_COOLDOWN_FRAMES = 28;
  const THROW_LAUNCH_VX = 6.8;
  const THROW_LAUNCH_VY = -11.4;

  const CHARACTERS = {
    strong: {
      name: "Strong",
      width: 24,
      height: 34,
      maxSpeed: 3.6,
      jumpVel: -11.5,
      color: "#e74c3c",
      ghost: "rgba(231,76,60,0.35)"
    },
    agile: {
      name: "Agile",
      width: 20,
      height: 30,
      maxSpeed: 4.8,
      jumpVel: -13.3,
      color: "#3498db",
      ghost: "rgba(52,152,219,0.35)"
    },
    rope: {
      name: "Rope",
      width: 22,
      height: 32,
      maxSpeed: 3.7,
      jumpVel: -11.7,
      color: "#9b59b6",
      ghost: "rgba(155,89,182,0.35)"
    }
  };

  const CHARACTER_ORDER = ["rope", "strong", "agile"];

  const LEVEL = {
    spawn: { x: 80, y: 310 },
    platforms: [
      { x: 0, y: 360, w: 900, h: 60 },
      { x: 250, y: 270, w: 130, h: 20 },
      { x: 415, y: 220, w: 160, h: 20 },
      { x: 690, y: 150, w: 170, h: 20 }
    ],
    anchor: { x: 315, y: 165, radius: 18, ropeLength: 140 },
    exit: { x: 835, y: 100, w: 40, h: 48 }
  };

  const KEY_STATE = {
    left: false,
    right: false,
    jump: false,
    use: false
  };

  function createEntity(type, isEcho, runRef) {
    const def = CHARACTERS[type];
    return {
      type,
      isEcho,
      runRef,
      x: LEVEL.spawn.x,
      y: LEVEL.spawn.y,
      vx: 0,
      vy: 0,
      w: def.width,
      h: def.height,
      grounded: false,
      facing: 1,
      coyote: 0,
      jumpBuffer: 0,
      prevInput: 0,
      usedAbility: false,
      throwWindow: 0,
      throwCooldown: 0,
      onRope: false,
      label: runRef ? `${def.name} Echo` : def.name,
      launchedByFrame: -99999
    };
  }

  function createRun(characterType) {
    return {
      characterType,
      frameCount: 0,
      inputBuffer: new Uint8Array(512),
      capacity: 512,
      ropeFrame: -1,
      ropeActive: false
    };
  }

  const state = {
    loopNumber: 1,
    simFrame: 0,
    runWon: false,
    runs: [],
    echoes: [],
    activeCharacterType: CHARACTER_ORDER[0],
    selectedCharacterIndex: 0,
    activeRun: createRun(CHARACTER_ORDER[0]),
    activeEntity: null,
    ropeInstances: [],
    message: "Use Rope first, rewind, then Strong, then Agile.",
    accumulator: 0,
    lastTimestamp: 0
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const debugEl = document.getElementById("debug");

  function ensureRunCapacity(run, neededFrame) {
    if (neededFrame < run.capacity) {
      return;
    }
    let nextCap = run.capacity;
    while (neededFrame >= nextCap) {
      nextCap *= 2;
    }
    const next = new Uint8Array(nextCap);
    next.set(run.inputBuffer.subarray(0, run.frameCount));
    run.inputBuffer = next;
    run.capacity = nextCap;
  }

  function setActiveCharacterByIndex(index) {
    state.selectedCharacterIndex = (index + CHARACTER_ORDER.length) % CHARACTER_ORDER.length;
    state.activeCharacterType = CHARACTER_ORDER[state.selectedCharacterIndex];
    state.activeRun = createRun(state.activeCharacterType);
    resetSimulationFromTimeline();
    state.message = `Selected ${CHARACTERS[state.activeCharacterType].name} for current run.`;
  }

  function resetSimulationFromTimeline() {
    state.simFrame = 0;
    state.runWon = false;
    state.ropeInstances.length = 0;

    state.echoes = state.runs.map((run) => createEntity(run.characterType, true, run));
    state.activeEntity = createEntity(state.activeRun.characterType, false, state.activeRun);
  }

  function fullReset() {
    state.runs.length = 0;
    state.loopNumber = 1;
    state.selectedCharacterIndex = 0;
    state.activeCharacterType = CHARACTER_ORDER[0];
    state.activeRun = createRun(state.activeCharacterType);
    state.message = "Full reset. Start a new timeline.";
    resetSimulationFromTimeline();
  }

  function rewindAndCommit() {
    const run = state.activeRun;
    run.frameCount = state.simFrame;

    if (run.frameCount > 0) {
      state.runs.push(run);
      state.loopNumber += 1;
      state.selectedCharacterIndex = (state.selectedCharacterIndex + 1) % CHARACTER_ORDER.length;
      state.activeCharacterType = CHARACTER_ORDER[state.selectedCharacterIndex];
      state.message = `Rewind complete. New loop as ${CHARACTERS[state.activeCharacterType].name}.`;
    } else {
      state.message = "No input recorded in this loop.";
    }

    state.activeRun = createRun(state.activeCharacterType);
    resetSimulationFromTimeline();
  }

  function maskFromInputState() {
    let mask = 0;
    if (KEY_STATE.left) mask |= INPUT_LEFT;
    if (KEY_STATE.right) mask |= INPUT_RIGHT;
    if (KEY_STATE.jump) mask |= INPUT_JUMP;
    if (KEY_STATE.use) mask |= INPUT_USE;
    return mask;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function placeRopeIfValid(entity, inputMask) {
    if (entity.type !== "rope" || entity.usedAbility) {
      return;
    }
    if ((inputMask & INPUT_USE) === 0 || (entity.prevInput & INPUT_USE) !== 0) {
      return;
    }

    const centerX = entity.x + entity.w * 0.5;
    const centerY = entity.y + entity.h * 0.5;
    const dx = centerX - LEVEL.anchor.x;
    const dy = centerY - LEVEL.anchor.y;
    const distSq = dx * dx + dy * dy;
    const r = LEVEL.anchor.radius;

    if (distSq <= r * r) {
      const rope = {
        x: LEVEL.anchor.x - 5,
        y: LEVEL.anchor.y,
        w: 10,
        h: LEVEL.anchor.ropeLength,
        owner: entity.runRef || state.activeRun,
        ownerType: entity.type
      };
      state.ropeInstances.push(rope);
      entity.usedAbility = true;
      if (entity.runRef) {
        entity.runRef.ropeFrame = state.simFrame;
        entity.runRef.ropeActive = true;
      } else {
        state.activeRun.ropeFrame = state.simFrame;
        state.activeRun.ropeActive = true;
      }
    }
  }

  function triggerThrowWindow(entity, inputMask) {
    if (entity.type !== "strong") {
      return;
    }

    if (entity.throwCooldown > 0) {
      entity.throwCooldown -= 1;
    }

    const justPressed = (inputMask & INPUT_USE) !== 0 && (entity.prevInput & INPUT_USE) === 0;
    if (justPressed && entity.throwCooldown <= 0) {
      entity.throwWindow = THROW_WINDOW_FRAMES;
      entity.throwCooldown = THROW_COOLDOWN_FRAMES;
    }

    if (entity.throwWindow > 0) {
      entity.throwWindow -= 1;
    }
  }

  function onRopeAt(entity) {
    for (let i = 0; i < state.ropeInstances.length; i += 1) {
      const rope = state.ropeInstances[i];
      if (entity.x + entity.w > rope.x && entity.x < rope.x + rope.w) {
        if (entity.y + entity.h > rope.y && entity.y < rope.y + rope.h) {
          return rope;
        }
      }
    }
    return null;
  }

  function applyMovement(entity, inputMask) {
    const def = CHARACTERS[entity.type];

    const moveDir = ((inputMask & INPUT_RIGHT) ? 1 : 0) - ((inputMask & INPUT_LEFT) ? 1 : 0);
    if (moveDir !== 0) {
      entity.facing = moveDir > 0 ? 1 : -1;
    }

    const accel = entity.grounded ? PHYSICS.groundAccel : PHYSICS.airAccel;
    const target = moveDir * def.maxSpeed;
    entity.vx += (target - entity.vx) * accel;

    if (moveDir === 0 && entity.grounded) {
      entity.vx *= PHYSICS.friction;
      if (Math.abs(entity.vx) < 0.05) entity.vx = 0;
    }

    const rope = onRopeAt(entity);
    entity.onRope = false;
    if (rope && ((inputMask & INPUT_USE) !== 0 || (inputMask & INPUT_JUMP) !== 0)) {
      entity.onRope = true;
      entity.vy = 0;
      if (inputMask & INPUT_JUMP) entity.y -= 2.5;
      if (inputMask & INPUT_USE) entity.y += 2.0;
    }

    if (!entity.onRope) {
      entity.vy += PHYSICS.gravity;
      if (entity.vy > PHYSICS.maxFall) entity.vy = PHYSICS.maxFall;
    }

    if (entity.grounded) {
      entity.coyote = PHYSICS.coyoteFrames;
    } else if (entity.coyote > 0) {
      entity.coyote -= 1;
    }

    if (inputMask & INPUT_JUMP) {
      entity.jumpBuffer = PHYSICS.jumpBufferFrames;
    } else if (entity.jumpBuffer > 0) {
      entity.jumpBuffer -= 1;
    }

    const canJump = entity.coyote > 0 || entity.grounded || entity.onRope;
    if (entity.jumpBuffer > 0 && canJump) {
      entity.vy = def.jumpVel;
      entity.grounded = false;
      entity.coyote = 0;
      entity.jumpBuffer = 0;
      entity.onRope = false;
    }

    entity.x += entity.vx;
    collideHorizontal(entity);

    entity.y += entity.vy;
    collideVertical(entity);

    if (entity.x < 0) {
      entity.x = 0;
      entity.vx = 0;
    }
    if (entity.x + entity.w > WIDTH) {
      entity.x = WIDTH - entity.w;
      entity.vx = 0;
    }

    if (entity.y > HEIGHT + 50) {
      entity.x = LEVEL.spawn.x;
      entity.y = LEVEL.spawn.y;
      entity.vx = 0;
      entity.vy = 0;
      entity.grounded = false;
      entity.coyote = 0;
      entity.jumpBuffer = 0;
    }
  }

  function collideHorizontal(entity) {
    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      if (!rectsOverlap(entity, p)) continue;
      if (entity.vx > 0) {
        entity.x = p.x - entity.w;
      } else if (entity.vx < 0) {
        entity.x = p.x + p.w;
      }
      entity.vx = 0;
    }
  }

  function collideVertical(entity) {
    entity.grounded = false;
    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      if (!rectsOverlap(entity, p)) continue;
      if (entity.vy > 0) {
        entity.y = p.y - entity.h;
        entity.vy = 0;
        entity.grounded = true;
      } else if (entity.vy < 0) {
        entity.y = p.y + p.h;
        entity.vy = 0;
      }
    }
  }

  function processThrowInteractions() {
    const active = state.activeEntity;
    for (let i = 0; i < state.echoes.length; i += 1) {
      const echo = state.echoes[i];
      if (echo.type !== "strong" || echo.throwWindow <= 0) continue;
      if (!rectsOverlap(active, echo)) continue;
      if (state.simFrame - active.launchedByFrame < 8) continue;
      active.vx = echo.facing * THROW_LAUNCH_VX;
      active.vy = THROW_LAUNCH_VY;
      active.grounded = false;
      active.launchedByFrame = state.simFrame;
    }
  }

  function updateEntity(entity, inputMask) {
    placeRopeIfValid(entity, inputMask);
    triggerThrowWindow(entity, inputMask);
    applyMovement(entity, inputMask);
    entity.prevInput = inputMask;
  }

  function checkWin() {
    if (rectsOverlap(state.activeEntity, LEVEL.exit)) {
      state.runWon = true;
      state.message = `Exit reached on loop ${state.loopNumber}. Press Enter to restart or keep testing with R.`;
    }
  }

  function stepSimulation() {
    const liveMask = maskFromInputState();

    ensureRunCapacity(state.activeRun, state.simFrame);
    state.activeRun.inputBuffer[state.simFrame] = liveMask;

    for (let i = 0; i < state.echoes.length; i += 1) {
      const echo = state.echoes[i];
      const run = echo.runRef;
      const mask = state.simFrame < run.frameCount ? run.inputBuffer[state.simFrame] : 0;
      updateEntity(echo, mask);
    }

    updateEntity(state.activeEntity, liveMask);
    processThrowInteractions();
    checkWin();

    state.simFrame += 1;
  }

  function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawRect(0, 0, WIDTH, HEIGHT, "#d9ecff");

    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      drawRect(p.x, p.y, p.w, p.h, "#6f8c68");
    }

    const a = LEVEL.anchor;
    drawRect(a.x - 6, a.y - 6, 12, 12, "#222");

    for (let i = 0; i < state.ropeInstances.length; i += 1) {
      const rope = state.ropeInstances[i];
      drawRect(rope.x, rope.y, rope.w, rope.h, "rgba(255,255,255,0.9)");
      drawRect(rope.x + 2, rope.y, 2, rope.h, "rgba(130,80,40,0.7)");
      drawRect(rope.x + 6, rope.y, 2, rope.h, "rgba(130,80,40,0.7)");
    }

    drawRect(LEVEL.exit.x, LEVEL.exit.y, LEVEL.exit.w, LEVEL.exit.h, "rgba(20,200,80,0.7)");

    for (let i = 0; i < state.echoes.length; i += 1) {
      const e = state.echoes[i];
      const def = CHARACTERS[e.type];
      drawRect(e.x, e.y, e.w, e.h, def.ghost);
      if (e.type === "strong" && e.throwWindow > 0) {
        drawRect(e.x - 6, e.y + 4, e.w + 12, e.h - 8, "rgba(255,120,0,0.25)");
      }
    }

    const activeDef = CHARACTERS[state.activeEntity.type];
    drawRect(state.activeEntity.x, state.activeEntity.y, state.activeEntity.w, state.activeEntity.h, activeDef.color);

    if (state.runWon) {
      ctx.fillStyle = "rgba(0,0,0,0.68)";
      ctx.fillRect(220, 140, 460, 100);
      ctx.fillStyle = "#fff";
      ctx.font = "20px monospace";
      ctx.fillText("Room Cleared", 360, 185);
      ctx.font = "14px monospace";
      ctx.fillText("Keep experimenting with more loops or press Enter", 250, 214);
    }
  }

  function updateTextUi() {
    const charName = CHARACTERS[state.activeCharacterType].name;
    statusEl.innerHTML = [
      `<div class="stat"><strong>Loop:</strong> ${state.loopNumber} | <strong>Active Character:</strong> ${charName} | <strong>Stored Echo Runs:</strong> ${state.runs.length}</div>`,
      `<div class="stat"><strong>Objective:</strong> stack echoes to reach exit platform</div>`,
      `<div class="stat"><strong>Hint:</strong> rope run -> strong throw run -> agile finish run</div>`,
      `<div class="small">${state.message}</div>`
    ].join("");

    debugEl.innerHTML = [
      `<div>Sim frame: ${state.simFrame}</div>`,
      `<div>Active run buffer cap: ${state.activeRun.capacity}</div>`,
      `<div>Ropes this timeline: ${state.ropeInstances.length}</div>`
    ].join("");
  }

  function gameLoop(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaSec = Math.min(0.1, (timestamp - state.lastTimestamp) / 1000);
    state.lastTimestamp = timestamp;
    state.accumulator += deltaSec;

    while (state.accumulator >= DT) {
      stepSimulation();
      state.accumulator -= DT;
    }

    render();
    updateTextUi();
    requestAnimationFrame(gameLoop);
  }

  function handleKeyDown(ev) {
    const k = ev.key.toLowerCase();
    if (k === "a" || ev.key === "ArrowLeft") KEY_STATE.left = true;
    if (k === "d" || ev.key === "ArrowRight") KEY_STATE.right = true;
    if (ev.key === " ") KEY_STATE.jump = true;
    if (k === "e") KEY_STATE.use = true;

    if (k === "q" || ev.key === "Tab") {
      ev.preventDefault();
      setActiveCharacterByIndex(state.selectedCharacterIndex + 1);
      return;
    }

    if (k === "r") {
      rewindAndCommit();
      return;
    }

    if (ev.key === "Enter") {
      fullReset();
    }
  }

  function handleKeyUp(ev) {
    const k = ev.key.toLowerCase();
    if (k === "a" || ev.key === "ArrowLeft") KEY_STATE.left = false;
    if (k === "d" || ev.key === "ArrowRight") KEY_STATE.right = false;
    if (ev.key === " ") KEY_STATE.jump = false;
    if (k === "e") KEY_STATE.use = false;
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  resetSimulationFromTimeline();
  updateTextUi();
  requestAnimationFrame(gameLoop);
})();
