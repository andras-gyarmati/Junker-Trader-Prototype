(() => {
  "use strict";

  const WIDTH = 900;
  const HEIGHT = 420;
  const DT = 1 / 60;

  const INPUT_LEFT = 1 << 0;
  const INPUT_RIGHT = 1 << 1;
  const INPUT_JUMP = 1 << 2;
  const INPUT_USE = 1 << 3;

  const CHAR = {
    THROWER: 0,
    ROPE: 1
  };

  const CHARACTER_DEF = [
    {
      id: "thrower",
      name: "Thrower",
      w: 24,
      h: 34,
      maxSpeed: 3.8,
      jumpVel: -11.6,
      color: "#e74c3c",
      ghost: "rgba(231,76,60,0.35)"
    },
    {
      id: "rope",
      name: "Rope",
      w: 22,
      h: 32,
      maxSpeed: 3.8,
      jumpVel: -11.6,
      color: "#8e44ad",
      ghost: "rgba(142,68,173,0.35)"
    }
  ];

  const PHYS = {
    gravity: 0.78,
    maxFall: 13,
    groundAccel: 0.85,
    airAccel: 0.52,
    friction: 0.78,
    coyoteFrames: 6,
    jumpBufferFrames: 5
  };

  const THROW = {
    windowFrames: 12,
    cooldownFrames: 26,
    launchVX: 6.9,
    launchVY: -11.8
  };

  const LEVEL = {
    spawn: [
      { x: 70, y: 334 },
      { x: 115, y: 334 }
    ],
    platforms: [
      { x: 0, y: 368, w: 900, h: 52 },
      { x: 220, y: 300, w: 130, h: 20 },
      { x: 415, y: 238, w: 140, h: 20 },
      { x: 620, y: 176, w: 150, h: 20 },
      { x: 810, y: 120, w: 90, h: 16 }
    ],
    ropeAnchors: [
      { x: 334, y: 300, len: 120, topY: 265 },
      { x: 538, y: 238, len: 125, topY: 203 },
      { x: 742, y: 176, len: 125, topY: 141 }
    ],
    exit: { x: 835, y: 72, w: 46, h: 48 }
  };

  const KEY = {
    left: false,
    right: false,
    jump: false,
    use: false,
    rewind: false
  };

  function makeTrack() {
    return {
      len: 0,
      cap: 1024,
      input: new Uint8Array(1024)
    };
  }

  function makeChar(i) {
    const d = CHARACTER_DEF[i];
    return {
      i,
      x: LEVEL.spawn[i].x,
      y: LEVEL.spawn[i].y,
      vx: 0,
      vy: 0,
      w: d.w,
      h: d.h,
      grounded: false,
      coyote: 0,
      jumpBuffer: 0,
      prevInput: 0,
      facing: 1,
      throwWindow: 0,
      throwCooldown: 0
    };
  }

  const state = {
    frame: 0,
    frameCap: 2048,
    maxSimFrame: 0,
    activeChar: CHAR.THROWER,
    rewinding: false,
    won: false,
    msg: "Build timeline with both chars. Hold R to rewind. Release R to branch.",
    tracks: [makeTrack(), makeTrack()],
    chars: [makeChar(0), makeChar(1)],
    ropeMask: 0,
    snapshots: {
      x: new Float32Array(2048 * 2),
      y: new Float32Array(2048 * 2),
      vx: new Float32Array(2048 * 2),
      vy: new Float32Array(2048 * 2),
      grounded: new Uint8Array(2048 * 2),
      coyote: new Uint8Array(2048 * 2),
      jumpBuffer: new Uint8Array(2048 * 2),
      prevInput: new Uint8Array(2048 * 2),
      facing: new Int8Array(2048 * 2),
      throwWindow: new Uint8Array(2048 * 2),
      throwCooldown: new Uint8Array(2048 * 2),
      ropeMask: new Uint8Array(2048),
      won: new Uint8Array(2048)
    },
    accumulator: 0,
    lastTs: 0
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const debugEl = document.getElementById("debug");

  function idx(frame, charIdx) {
    return frame * 2 + charIdx;
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function ensureTrackCap(track, frame) {
    if (frame < track.cap) return;
    let next = track.cap;
    while (frame >= next) next *= 2;
    const arr = new Uint8Array(next);
    arr.set(track.input.subarray(0, track.len));
    track.input = arr;
    track.cap = next;
  }

  function ensureFrameCap(frameNeeded) {
    if (frameNeeded < state.frameCap) return;
    let nextCap = state.frameCap;
    while (frameNeeded >= nextCap) nextCap *= 2;

    function grow(old, Ctor, mult) {
      const n = new Ctor(nextCap * mult);
      n.set(old);
      return n;
    }

    state.snapshots.x = grow(state.snapshots.x, Float32Array, 2);
    state.snapshots.y = grow(state.snapshots.y, Float32Array, 2);
    state.snapshots.vx = grow(state.snapshots.vx, Float32Array, 2);
    state.snapshots.vy = grow(state.snapshots.vy, Float32Array, 2);
    state.snapshots.grounded = grow(state.snapshots.grounded, Uint8Array, 2);
    state.snapshots.coyote = grow(state.snapshots.coyote, Uint8Array, 2);
    state.snapshots.jumpBuffer = grow(state.snapshots.jumpBuffer, Uint8Array, 2);
    state.snapshots.prevInput = grow(state.snapshots.prevInput, Uint8Array, 2);
    state.snapshots.facing = grow(state.snapshots.facing, Int8Array, 2);
    state.snapshots.throwWindow = grow(state.snapshots.throwWindow, Uint8Array, 2);
    state.snapshots.throwCooldown = grow(state.snapshots.throwCooldown, Uint8Array, 2);
    state.snapshots.ropeMask = grow(state.snapshots.ropeMask, Uint8Array, 1);
    state.snapshots.won = grow(state.snapshots.won, Uint8Array, 1);

    state.frameCap = nextCap;
  }

  function saveSnapshot(frame) {
    ensureFrameCap(frame);
    for (let c = 0; c < 2; c += 1) {
      const ch = state.chars[c];
      const p = idx(frame, c);
      state.snapshots.x[p] = ch.x;
      state.snapshots.y[p] = ch.y;
      state.snapshots.vx[p] = ch.vx;
      state.snapshots.vy[p] = ch.vy;
      state.snapshots.grounded[p] = ch.grounded ? 1 : 0;
      state.snapshots.coyote[p] = ch.coyote;
      state.snapshots.jumpBuffer[p] = ch.jumpBuffer;
      state.snapshots.prevInput[p] = ch.prevInput;
      state.snapshots.facing[p] = ch.facing;
      state.snapshots.throwWindow[p] = ch.throwWindow;
      state.snapshots.throwCooldown[p] = ch.throwCooldown;
    }
    state.snapshots.ropeMask[frame] = state.ropeMask;
    state.snapshots.won[frame] = state.won ? 1 : 0;
  }

  function loadSnapshot(frame) {
    for (let c = 0; c < 2; c += 1) {
      const ch = state.chars[c];
      const p = idx(frame, c);
      ch.x = state.snapshots.x[p];
      ch.y = state.snapshots.y[p];
      ch.vx = state.snapshots.vx[p];
      ch.vy = state.snapshots.vy[p];
      ch.grounded = state.snapshots.grounded[p] === 1;
      ch.coyote = state.snapshots.coyote[p];
      ch.jumpBuffer = state.snapshots.jumpBuffer[p];
      ch.prevInput = state.snapshots.prevInput[p];
      ch.facing = state.snapshots.facing[p] || 1;
      ch.throwWindow = state.snapshots.throwWindow[p];
      ch.throwCooldown = state.snapshots.throwCooldown[p];
    }
    state.ropeMask = state.snapshots.ropeMask[frame];
    state.won = state.snapshots.won[frame] === 1;
  }

  function resetAll() {
    state.frame = 0;
    state.maxSimFrame = 0;
    state.activeChar = CHAR.THROWER;
    state.rewinding = false;
    state.won = false;
    state.msg = "Full reset. Create a new shared timeline.";

    for (let c = 0; c < 2; c += 1) {
      state.tracks[c] = makeTrack();
      state.chars[c] = makeChar(c);
    }

    state.ropeMask = 0;
    saveSnapshot(0);
  }

  function maskFromKeys() {
    let m = 0;
    if (KEY.left) m |= INPUT_LEFT;
    if (KEY.right) m |= INPUT_RIGHT;
    if (KEY.jump) m |= INPUT_JUMP;
    if (KEY.use) m |= INPUT_USE;
    return m;
  }

  function charInputAt(charIdx, frame, liveMask) {
    const tr = state.tracks[charIdx];

    if (charIdx === state.activeChar) {
      ensureTrackCap(tr, frame);
      tr.input[frame] = liveMask;
      if (frame >= tr.len) tr.len = frame + 1;
      return liveMask;
    }

    if (frame < tr.len) {
      return tr.input[frame];
    }

    ensureTrackCap(tr, frame);
    tr.input[frame] = 0;
    tr.len = frame + 1;
    return 0;
  }

  function collideHorizontal(ch) {
    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      if (!rectOverlap(ch, p)) continue;
      if (ch.vx > 0) ch.x = p.x - ch.w;
      else if (ch.vx < 0) ch.x = p.x + p.w;
      ch.vx = 0;
    }
  }

  function collideVertical(ch) {
    ch.grounded = false;
    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      if (!rectOverlap(ch, p)) continue;
      if (ch.vy > 0) {
        ch.y = p.y - ch.h;
        ch.vy = 0;
        ch.grounded = true;
      } else if (ch.vy < 0) {
        ch.y = p.y + p.h;
        ch.vy = 0;
      }
    }
  }

  function isOnRope(ch) {
    for (let i = 0; i < LEVEL.ropeAnchors.length; i += 1) {
      if ((state.ropeMask & (1 << i)) === 0) continue;
      const a = LEVEL.ropeAnchors[i];
      const ropeRect = { x: a.x - 4, y: a.y, w: 8, h: a.len };
      if (rectOverlap(ch, ropeRect)) return i;
    }
    return -1;
  }

  function tryRopeAbility(ch, inputMask) {
    if (ch.i !== CHAR.ROPE) return;

    const justUse = (inputMask & INPUT_USE) !== 0 && (ch.prevInput & INPUT_USE) === 0;
    if (!justUse) return;

    for (let i = 0; i < LEVEL.ropeAnchors.length; i += 1) {
      const a = LEVEL.ropeAnchors[i];
      const cx = ch.x + ch.w * 0.5;
      const cy = ch.y + ch.h * 0.5;
      const dx = Math.abs(cx - a.x);
      const dy = Math.abs(cy - a.y);
      if (dx < 18 && dy < 28) {
        state.ropeMask |= (1 << i);
        state.msg = `Rope anchor ${i + 1} placed in timeline.`;
        return;
      }
    }
  }

  function tryClimbInstant(ch, inputMask) {
    const justUse = (inputMask & INPUT_USE) !== 0 && (ch.prevInput & INPUT_USE) === 0;
    if (!justUse) return;

    const ropeIdx = isOnRope(ch);
    if (ropeIdx < 0) return;
    const a = LEVEL.ropeAnchors[ropeIdx];

    ch.x = a.x - ch.w * 0.5;
    ch.y = a.topY - ch.h;
    ch.vx = 0;
    ch.vy = 0;
    ch.grounded = true;
  }

  function updateThrow(ch, inputMask) {
    if (ch.i !== CHAR.THROWER) return;

    if (ch.throwCooldown > 0) ch.throwCooldown -= 1;

    const justUse = (inputMask & INPUT_USE) !== 0 && (ch.prevInput & INPUT_USE) === 0;
    if (justUse && ch.throwCooldown <= 0) {
      ch.throwWindow = THROW.windowFrames;
      ch.throwCooldown = THROW.cooldownFrames;
    }

    if (ch.throwWindow > 0) ch.throwWindow -= 1;
  }

  function applyMovement(ch, inputMask) {
    const def = CHARACTER_DEF[ch.i];
    const dir = ((inputMask & INPUT_RIGHT) ? 1 : 0) - ((inputMask & INPUT_LEFT) ? 1 : 0);
    const target = dir * def.maxSpeed;
    const accel = ch.grounded ? PHYS.groundAccel : PHYS.airAccel;

    if (dir !== 0) ch.facing = dir > 0 ? 1 : -1;

    ch.vx += (target - ch.vx) * accel;

    if (dir === 0 && ch.grounded) {
      ch.vx *= PHYS.friction;
      if (Math.abs(ch.vx) < 0.05) ch.vx = 0;
    }

    if (ch.grounded) ch.coyote = PHYS.coyoteFrames;
    else if (ch.coyote > 0) ch.coyote -= 1;

    if (inputMask & INPUT_JUMP) ch.jumpBuffer = PHYS.jumpBufferFrames;
    else if (ch.jumpBuffer > 0) ch.jumpBuffer -= 1;

    const ropeIdx = isOnRope(ch);
    const onRope = ropeIdx >= 0;
    if (onRope && (inputMask & INPUT_USE)) {
      ch.vy = 0;
    } else {
      ch.vy += PHYS.gravity;
      if (ch.vy > PHYS.maxFall) ch.vy = PHYS.maxFall;
    }

    if (ch.jumpBuffer > 0 && (ch.coyote > 0 || ch.grounded || onRope)) {
      ch.vy = def.jumpVel;
      ch.jumpBuffer = 0;
      ch.grounded = false;
      ch.coyote = 0;
    }

    ch.x += ch.vx;
    collideHorizontal(ch);

    ch.y += ch.vy;
    collideVertical(ch);

    if (ch.x < 0) {
      ch.x = 0;
      ch.vx = 0;
    }
    if (ch.x + ch.w > WIDTH) {
      ch.x = WIDTH - ch.w;
      ch.vx = 0;
    }

    if (ch.y > HEIGHT + 50) {
      ch.x = LEVEL.spawn[ch.i].x;
      ch.y = LEVEL.spawn[ch.i].y;
      ch.vx = 0;
      ch.vy = 0;
      ch.grounded = false;
      ch.coyote = 0;
      ch.jumpBuffer = 0;
    }
  }

  function handleThrowInteraction() {
    const thrower = state.chars[CHAR.THROWER];
    const rope = state.chars[CHAR.ROPE];
    if (thrower.throwWindow <= 0) return;
    if (!rectOverlap(thrower, rope)) return;

    rope.vx = thrower.facing * THROW.launchVX;
    rope.vy = THROW.launchVY;
    rope.grounded = false;
  }

  function checkWinCondition() {
    const t = state.chars[CHAR.THROWER];
    const r = state.chars[CHAR.ROPE];
    const inA = rectOverlap(t, LEVEL.exit);
    const inB = rectOverlap(r, LEVEL.exit);
    state.won = inA && inB;
    if (state.won) {
      state.msg = "Both characters reached exit in same timeline. Level complete.";
    }
  }

  function stepForward() {
    const liveMask = maskFromKeys();
    const frameInputA = charInputAt(CHAR.THROWER, state.frame, liveMask);
    const frameInputB = charInputAt(CHAR.ROPE, state.frame, liveMask);

    const chA = state.chars[CHAR.THROWER];
    const chB = state.chars[CHAR.ROPE];

    tryRopeAbility(chA, frameInputA);
    tryRopeAbility(chB, frameInputB);

    updateThrow(chA, frameInputA);
    updateThrow(chB, frameInputB);

    applyMovement(chA, frameInputA);
    applyMovement(chB, frameInputB);

    handleThrowInteraction();

    tryClimbInstant(chA, frameInputA);
    tryClimbInstant(chB, frameInputB);

    chA.prevInput = frameInputA;
    chB.prevInput = frameInputB;

    checkWinCondition();

    state.frame += 1;
    if (state.frame > state.maxSimFrame) state.maxSimFrame = state.frame;
    saveSnapshot(state.frame);
  }

  function stepRewind() {
    if (state.frame <= 0) {
      state.frame = 0;
      loadSnapshot(0);
      return;
    }
    state.frame -= 1;
    loadSnapshot(state.frame);
  }

  function beginRewind() {
    state.rewinding = true;
    state.msg = "Rewinding timeline... release R to branch.";
  }

  function endRewindAndBranch() {
    state.rewinding = false;

    const activeTrack = state.tracks[state.activeChar];
    if (activeTrack.len > state.frame) {
      activeTrack.len = state.frame;
    }

    state.maxSimFrame = state.frame;
    state.msg = `${CHARACTER_DEF[state.activeChar].name} track truncated at frame ${state.frame}. Branching forward.`;
  }

  function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function render() {
    drawRect(0, 0, WIDTH, HEIGHT, "#d7edff");

    for (let i = 0; i < LEVEL.platforms.length; i += 1) {
      const p = LEVEL.platforms[i];
      drawRect(p.x, p.y, p.w, p.h, "#6e8a6a");
    }

    for (let i = 0; i < LEVEL.ropeAnchors.length; i += 1) {
      const a = LEVEL.ropeAnchors[i];
      drawRect(a.x - 5, a.y - 5, 10, 10, "#222");

      if ((state.ropeMask & (1 << i)) !== 0) {
        drawRect(a.x - 4, a.y, 8, a.len, "rgba(255,255,255,0.9)");
      } else {
        drawRect(a.x - 3, a.y, 6, 18, "rgba(40,40,40,0.35)");
      }
    }

    drawRect(LEVEL.exit.x, LEVEL.exit.y, LEVEL.exit.w, LEVEL.exit.h, "rgba(40,220,90,0.75)");

    for (let c = 0; c < 2; c += 1) {
      const ch = state.chars[c];
      const d = CHARACTER_DEF[c];
      const isActive = c === state.activeChar;
      drawRect(ch.x, ch.y, ch.w, ch.h, isActive ? d.color : d.ghost);

      if (c === CHAR.THROWER && ch.throwWindow > 0) {
        drawRect(ch.x - 4, ch.y - 8, ch.w + 8, ch.h + 10, "rgba(255,120,0,0.35)");
      }

      ctx.fillStyle = "#111";
      ctx.font = "12px monospace";
      ctx.fillText(isActive ? `${d.name} (YOU)` : `${d.name} (Replay)`, ch.x - 4, ch.y - 8);
    }

    if (state.won) {
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(200, 140, 500, 95);
      ctx.fillStyle = "#fff";
      ctx.font = "20px monospace";
      ctx.fillText("LEVEL COMPLETE", 335, 178);
      ctx.font = "13px monospace";
      ctx.fillText("Both characters in exit together. Enter = reset", 265, 206);
    }

    if (state.rewinding) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(8, 8, 130, 26);
      ctx.fillStyle = "#fff";
      ctx.font = "14px monospace";
      ctx.fillText("REWINDING", 18, 26);
    }
  }

  function updateUi() {
    const activeName = CHARACTER_DEF[state.activeChar].name;
    statusEl.innerHTML = [
      `<div class="stat"><strong>Active:</strong> ${activeName} | <strong>Frame:</strong> ${state.frame} | <strong>Rewinding:</strong> ${state.rewinding ? "YES" : "NO"}</div>`,
      `<div class="stat"><strong>Win rule:</strong> both characters must overlap exit at same time</div>`,
      `<div class="small">${state.msg}</div>`
    ].join("");

    debugEl.innerHTML = [
      `<div>Thrower track len: ${state.tracks[0].len}</div>`,
      `<div>Rope track len: ${state.tracks[1].len}</div>`,
      `<div>Rope mask bits: ${state.ropeMask.toString(2).padStart(3, "0")}</div>`,
      `<div>Max frame reached: ${state.maxSimFrame}</div>`
    ].join("");
  }

  function tick(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const delta = Math.min(0.1, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    state.accumulator += delta;

    while (state.accumulator >= DT) {
      if (state.rewinding) stepRewind();
      else stepForward();
      state.accumulator -= DT;
    }

    render();
    updateUi();

    requestAnimationFrame(tick);
  }

  function onKeyDown(ev) {
    const k = ev.key.toLowerCase();

    if (k === "a" || ev.key === "ArrowLeft") KEY.left = true;
    if (k === "d" || ev.key === "ArrowRight") KEY.right = true;
    if (ev.key === " ") KEY.jump = true;
    if (k === "e") KEY.use = true;

    if (k === "q" || ev.key === "Tab") {
      ev.preventDefault();
      state.activeChar = state.activeChar === CHAR.THROWER ? CHAR.ROPE : CHAR.THROWER;
      state.msg = `Switched control to ${CHARACTER_DEF[state.activeChar].name}.`;
      return;
    }

    if (k === "r") {
      if (!KEY.rewind) {
        KEY.rewind = true;
        beginRewind();
      }
      return;
    }

    if (ev.key === "Enter") {
      resetAll();
    }
  }

  function onKeyUp(ev) {
    const k = ev.key.toLowerCase();

    if (k === "a" || ev.key === "ArrowLeft") KEY.left = false;
    if (k === "d" || ev.key === "ArrowRight") KEY.right = false;
    if (ev.key === " ") KEY.jump = false;
    if (k === "e") KEY.use = false;

    if (k === "r") {
      KEY.rewind = false;
      endRewindAndBranch();
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  resetAll();
  requestAnimationFrame(tick);
})();
