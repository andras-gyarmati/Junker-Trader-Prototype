(() => {
  "use strict";

  const WIDTH = 900;
  const HEIGHT = 420;
  const DT = 1 / 60;
  const INSTANT_REWIND_FRAMES = 60;
  const HOLD_REWIND_THRESHOLD_MS = 140;

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
      w: 16,
      h: 24,
      maxSpeed: 3.8,
      jumpVel: -8.2,
      color: "#e74c3c",
      ghost: "rgba(231,76,60,0.35)"
    },
    {
      id: "rope",
      name: "Rope",
      w: 16,
      h: 24,
      maxSpeed: 3.8,
      jumpVel: -8.2,
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
    chargeFrames: 18,
    activeFrames: 6,
    cooldownFrames: 26,
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
      { x: 350, y: 300, len: 120, topY: 265 },
      { x: 555, y: 238, len: 125, topY: 203 },
      { x: 620, y: 176, len: 125, topY: 141 },
      { x: 810, y: 120, len: 90, topY: 85 }
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
      throwCharge: 0,
      throwActive: 0,
      throwCooldown: 0
    };
  }

  const state = {
    frame: 0,
    frameCap: 2048,
    maxSimFrame: 0,
    activeChar: CHAR.THROWER,
    rewinding: false,
    pendingRewindTap: false,
    rewindDownAtMs: 0,
    autoReplay: false,
    autoReplayFrame: 0,
    won: false,
    msg: "Build timeline with both chars. Tap R = instant 1s rewind. Hold R = visual rewind.",
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
      throwActive: new Uint8Array(2048 * 2),
      throwCooldown: new Uint8Array(2048 * 2),
      ropeMask: new Uint8Array(2048),
      won: new Uint8Array(2048)
    },
    accumulator: 0,
    lastTs: 0
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const timelineCanvas = document.getElementById("timeline");
  const tctx = timelineCanvas.getContext("2d");
  const statusEl = document.getElementById("status");
  const debugEl = document.getElementById("debug");

  function idx(frame, charIdx) {
    return frame * 2 + charIdx;
  }

  function rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function horizontalOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x;
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
    state.snapshots.throwActive = grow(state.snapshots.throwActive, Uint8Array, 2);
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
      state.snapshots.throwWindow[p] = ch.throwCharge;
      state.snapshots.throwActive[p] = ch.throwActive;
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
      ch.throwCharge = state.snapshots.throwWindow[p];
      ch.throwActive = state.snapshots.throwActive[p];
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
    state.pendingRewindTap = false;
    state.rewindDownAtMs = 0;
    state.autoReplay = false;
    state.autoReplayFrame = 0;
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

  function tryClimbInstant(ch) {
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
      ch.throwCharge = THROW.chargeFrames;
      ch.throwCooldown = THROW.cooldownFrames;
    }

    if (ch.throwCharge > 0) {
      ch.throwCharge -= 1;
      if (ch.throwCharge === 0) {
        ch.throwActive = THROW.activeFrames;
      }
    } else if (ch.throwActive > 0) {
      ch.throwActive -= 1;
    }
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
    if (thrower.throwActive <= 0) return;

    const overlapNow = rectOverlap(thrower, rope);
    const onHeadNow =
      horizontalOverlap(thrower, rope) &&
      Math.abs((rope.y + rope.h) - thrower.y) <= 4;
    if (!overlapNow && !onHeadNow) return;

    rope.vx = 0;
    rope.vy = THROW.launchVY;
    rope.grounded = false;
  }

  function resolveCharacterCollision(a, b, prevAX, prevAY, prevBX, prevBY) {
    if (!rectOverlap(a, b)) return;

    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (overlapX <= 0 || overlapY <= 0) return;

    const aWasAbove = prevAY + a.h <= prevBY + 1;
    const bWasAbove = prevBY + b.h <= prevAY + 1;

    if (overlapY <= overlapX && (aWasAbove || bWasAbove)) {
      if (aWasAbove) {
        a.y = b.y - a.h;
        a.vy = 0;
        a.grounded = true;
      } else {
        b.y = a.y - b.h;
        b.vy = 0;
        b.grounded = true;
      }
      return;
    }

    if (overlapX <= overlapY) {
      if (a.x + a.w * 0.5 < b.x + b.w * 0.5) {
        a.x -= overlapX * 0.5;
        b.x += overlapX * 0.5;
      } else {
        a.x += overlapX * 0.5;
        b.x -= overlapX * 0.5;
      }
      a.vx = 0;
      b.vx = 0;
      return;
    }

    if (a.y + a.h * 0.5 < b.y + b.h * 0.5) {
      a.y -= overlapY * 0.5;
      b.y += overlapY * 0.5;
    } else {
      a.y += overlapY * 0.5;
      b.y -= overlapY * 0.5;
    }
    a.vy = 0;
    b.vy = 0;
  }

  function checkWinCondition() {
    const wasWon = state.won;
    const t = state.chars[CHAR.THROWER];
    const r = state.chars[CHAR.ROPE];
    const inA = rectOverlap(t, LEVEL.exit);
    const inB = rectOverlap(r, LEVEL.exit);
    state.won = inA && inB;
    if (state.won && !wasWon) {
      state.msg = "Both characters reached exit in same timeline. Level complete.";
      state.autoReplay = true;
      state.autoReplayFrame = 0;
    }
  }

  function stepAutoReplay() {
    if (!state.autoReplay) return;
    if (state.autoReplayFrame > state.maxSimFrame) {
      state.autoReplay = false;
      state.msg = "Auto replay finished. Press Enter to reset.";
      return;
    }
    state.frame = state.autoReplayFrame;
    loadSnapshot(state.frame);
    state.autoReplayFrame += 1;
  }

  function stepForward() {
    const liveMask = maskFromKeys();
    const frameInputA = charInputAt(CHAR.THROWER, state.frame, liveMask);
    const frameInputB = charInputAt(CHAR.ROPE, state.frame, liveMask);

    const chA = state.chars[CHAR.THROWER];
    const chB = state.chars[CHAR.ROPE];
    const prevAX = chA.x;
    const prevAY = chA.y;
    const prevBX = chB.x;
    const prevBY = chB.y;

    tryRopeAbility(chA, frameInputA);
    tryRopeAbility(chB, frameInputB);

    updateThrow(chA, frameInputA);
    updateThrow(chB, frameInputB);

    applyMovement(chA, frameInputA);
    applyMovement(chB, frameInputB);

    resolveCharacterCollision(chA, chB, prevAX, prevAY, prevBX, prevBY);

    handleThrowInteraction();

    tryClimbInstant(chA);
    tryClimbInstant(chB);

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

  function beginVisualRewind() {
    if (state.rewinding) return;
    state.rewinding = true;
    state.msg = "Visual rewind...";
  }

  function endRewindAndBranch(messageOverride) {
    state.rewinding = false;

    const activeTrack = state.tracks[state.activeChar];
    if (activeTrack.len > state.frame) {
      activeTrack.len = state.frame;
    }

    state.maxSimFrame = state.frame;
    state.msg =
      messageOverride ||
      `${CHARACTER_DEF[state.activeChar].name} track truncated at frame ${state.frame}. Branching forward.`;
  }

  function instantRewindAndBranch(frames) {
    const before = state.frame;
    const target = Math.max(0, state.frame - frames);
    state.frame = target;
    loadSnapshot(state.frame);
    endRewindAndBranch(`Instant rewind: ${before} -> ${target}`);
  }

  function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function timelineFrameToX(frame, maxFrame, width) {
    if (maxFrame <= 1) return 0;
    return (frame / maxFrame) * width;
  }

  function drawActionMarker(x, y, kind, color) {
    tctx.fillStyle = color;
    tctx.strokeStyle = color;
    tctx.lineWidth = 1;
    if (kind === "jump") {
      tctx.beginPath();
      tctx.moveTo(x, y - 5);
      tctx.lineTo(x - 4, y + 3);
      tctx.lineTo(x + 4, y + 3);
      tctx.closePath();
      tctx.fill();
      return;
    }
    if (kind === "throw") {
      tctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      return;
    }
    if (kind === "rope") {
      tctx.beginPath();
      tctx.arc(x, y, 3.5, 0, Math.PI * 2);
      tctx.fill();
    }
  }

  function renderTimeline() {
    const w = timelineCanvas.width;
    const h = timelineCanvas.height;
    tctx.fillStyle = "#f7f7f7";
    tctx.fillRect(0, 0, w, h);

    const pad = 16;
    const laneW = w - pad * 2;
    const laneH = 40;
    const laneGap = 26;
    const laneTopA = 26;
    const laneTopB = laneTopA + laneH + laneGap;

    const trA = state.tracks[CHAR.THROWER];
    const trB = state.tracks[CHAR.ROPE];
    const maxFrame = Math.max(state.maxSimFrame, trA.len, trB.len, state.frame + 1, 1);
    const playX = pad + timelineFrameToX(state.frame, maxFrame, laneW);

    function drawLane(charIdx, laneTop) {
      const tr = state.tracks[charIdx];
      const name = CHARACTER_DEF[charIdx].name;
      const color = CHARACTER_DEF[charIdx].color;

      tctx.fillStyle = "#e5e5e5";
      tctx.fillRect(pad, laneTop, laneW, laneH);

      const lenX = pad + timelineFrameToX(tr.len, maxFrame, laneW);
      tctx.fillStyle = "rgba(50,50,50,0.16)";
      tctx.fillRect(pad, laneTop, Math.max(0, lenX - pad), laneH);

      tctx.fillStyle = color;
      tctx.font = "12px monospace";
      tctx.fillText(name, pad, laneTop - 6);

      let prev = 0;
      for (let f = 0; f < tr.len; f += 1) {
        const cur = tr.input[f];
        const justJump = (cur & INPUT_JUMP) !== 0 && (prev & INPUT_JUMP) === 0;
        const justUse = (cur & INPUT_USE) !== 0 && (prev & INPUT_USE) === 0;
        if (justJump || justUse) {
          const x = pad + timelineFrameToX(f, maxFrame, laneW);
          const y = laneTop + laneH * 0.5;
          if (justJump) {
            drawActionMarker(x, y, "jump", "#333");
          }
          if (justUse) {
            if (charIdx === CHAR.THROWER) drawActionMarker(x, y + 10, "throw", "#b22222");
            else drawActionMarker(x, y + 10, "rope", "#5a2d91");
          }
        }
        prev = cur;
      }
    }

    drawLane(CHAR.THROWER, laneTopA);
    drawLane(CHAR.ROPE, laneTopB);

    tctx.strokeStyle = "#0c0c0c";
    tctx.lineWidth = 2;
    tctx.beginPath();
    tctx.moveTo(playX, 12);
    tctx.lineTo(playX, h - 8);
    tctx.stroke();
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

      if (c === CHAR.THROWER && ch.throwCharge > 0) {
        const p = 1 - (ch.throwCharge / THROW.chargeFrames);
        const grow = Math.floor(4 + p * 14);
        drawRect(ch.x - 3, ch.y - grow, ch.w + 6, ch.h + grow, "rgba(255,180,0,0.35)");
      } else if (c === CHAR.THROWER && ch.throwActive > 0) {
        drawRect(ch.x - 5, ch.y - 10, ch.w + 10, ch.h + 12, "rgba(255,90,0,0.45)");
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
      `<div class="stat"><strong>Active:</strong> ${activeName} | <strong>Frame:</strong> ${state.frame} | <strong>Rewinding:</strong> ${state.rewinding ? "YES" : "NO"} | <strong>Auto Replay:</strong> ${state.autoReplay ? "YES" : "NO"}</div>`,
      `<div class="stat"><strong>Win rule:</strong> both characters must overlap exit at same time</div>`,
      `<div class="small">${state.msg}</div>`
    ].join("");

    debugEl.innerHTML = [
      `<div>Thrower track len: ${state.tracks[0].len}</div>`,
      `<div>Rope track len: ${state.tracks[1].len}</div>`,
      `<div>Rope mask bits: ${state.ropeMask.toString(2).padStart(LEVEL.ropeAnchors.length, "0")}</div>`,
      `<div>Max frame reached: ${state.maxSimFrame}</div>`
    ].join("");
  }

  function tick(ts) {
    if (!state.lastTs) state.lastTs = ts;
    const delta = Math.min(0.1, (ts - state.lastTs) / 1000);
    state.lastTs = ts;
    state.accumulator += delta;

    if (KEY.rewind && state.pendingRewindTap && !state.rewinding) {
      if (ts - state.rewindDownAtMs >= HOLD_REWIND_THRESHOLD_MS) {
        state.pendingRewindTap = false;
        beginVisualRewind();
      }
    }

    while (state.accumulator >= DT) {
      if (state.autoReplay) {
        stepAutoReplay();
      } else if (state.rewinding) {
        stepRewind();
      } else {
        stepForward();
      }
      state.accumulator -= DT;
    }

    render();
    renderTimeline();
    updateUi();

    requestAnimationFrame(tick);
  }

  function onKeyDown(ev) {
    const k = ev.key.toLowerCase();

    if (state.autoReplay && ev.key !== "Enter") {
      return;
    }

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
      if (!ev.repeat) {
        KEY.rewind = true;
        state.pendingRewindTap = true;
        state.rewindDownAtMs = performance.now();
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
      if (state.rewinding) {
        endRewindAndBranch();
      } else if (state.pendingRewindTap) {
        instantRewindAndBranch(INSTANT_REWIND_FRAMES);
      }
      state.pendingRewindTap = false;
      return;
    }
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  resetAll();
  requestAnimationFrame(tick);
})();
