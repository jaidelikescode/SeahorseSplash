(() => {
  // ========= Canvas + DPR-resize =========
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const btnStart = document.getElementById("btnStart");
  const btnMute = document.getElementById("btnMute");
  const centerUI = document.querySelector(".center");

  let dpr = 1;
  let W = 0, H = 0;

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);

    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ========= Game scaling (responsive rules) =========
  function scaleByScreen(x) {
    // Simple helper: scale values based on smaller screen dimension
    const base = Math.min(W, H);
    return x * (base / 700);
  }

  const GAME = {
    get gravity() { return scaleByScreen(1700); },
    get jumpVelocity() { return -scaleByScreen(560); },
    get obstacleSpeed() { return scaleByScreen(260); },
    get obstacleWidth() { return scaleByScreen(84); },
    get gap() { return scaleByScreen(210); },
    get spawnEvery() { return 1.15; },
    get groundPad() { return scaleByScreen(90); }, // sea floor-ish padding zone
  };

  // ========= Audio (simple, no libraries) =========
  // Put your audio files in the same folder OR update paths:
  // - music.mp3 (looping)
  // - jump.wav
  // - point.wav
  // - hit.wav
  const AudioSys = {
    enabled: true,
    started: false,
    music: new Audio("music.mp3"),
    sfx: {
      jump: new Audio("jump.wav"),
      point: new Audio("point.wav"),
      hit: new Audio("hit.wav"),
    },
    init() {
      this.music.loop = true;
      this.music.volume = 0.35;
      Object.values(this.sfx).forEach(a => (a.volume = 0.6));
    },
    async startIfNeeded() {
      // Browsers require a user gesture to start audio.
      if (this.started || !this.enabled) return;
      this.started = true;
      try {
        await this.music.play();
      } catch {
        // If autoplay fails, it will start on a later gesture.
      }
    },
    setEnabled(on) {
      this.enabled = on;
      btnMute.textContent = `Sound: ${on ? "On" : "Off"}`;
      btnMute.setAttribute("aria-pressed", String(!on));
      if (!on) {
        this.music.pause();
      } else if (this.started) {
        this.music.play().catch(() => {});
      }
    },
    playSfx(name) {
      if (!this.enabled) return;
      const a = this.sfx[name];
      if (!a) return;
      a.currentTime = 0;
      a.play().catch(() => {});
    },
  };
  AudioSys.init();

  btnMute.addEventListener("click", () => {
    AudioSys.setEnabled(!AudioSys.enabled);
  });

  // ========= State =========
  let state = "ready"; // "ready" | "playing" | "gameover"
  let lastT = 0;
  let spawnTimer = 0;
  let score = 0;
  let best = 0;

  const seahorse = {
    get x() { return Math.max(90, W * 0.22); },
    y: H * 0.45,
    r: 0,  // computed
    vy: 0,
  };

  let obstacles = []; // coral/seaweed pillars
  // obstacle: { x, gapY, scored, kind }

  // ========= Utility =========
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function reset() {
    state = "ready";
    spawnTimer = 0;
    score = 0;
    scoreEl.textContent = `Score: ${score}`;
    bestEl.textContent = `Best: ${best}`;
    centerUI.style.display = "block";

    seahorse.y = H * 0.45;
    seahorse.vy = 0;
    seahorse.r = Math.max(14, scaleByScreen(18));

    obstacles = [makeObstacle(W + 180)];
  }

  function start() {
    state = "playing";
    centerUI.style.display = "none";
    seahorse.vy = 0;
    swimUp();
  }

  function gameOver() {
    state = "gameover";
    best = Math.max(best, score);
    bestEl.textContent = `Best: ${best}`;
    centerUI.style.display = "block";
  }

  function swimUp() {
    if (state === "ready") start();
    if (state !== "playing") return;
    seahorse.vy = GAME.jumpVelocity;
    AudioSys.playSfx("jump");
  }

  function makeObstacle(x) {
    const minY = 90 + GAME.gap / 2;
    const maxY = (H - GAME.groundPad) - 90 - GAME.gap / 2;
    return {
      x,
      gapY: Math.random() * (maxY - minY) + minY,
      scored: false,
      // mix coral + seaweed for variety
      kind: Math.random() < 0.5 ? "coral" : "seaweed",
    };
  }

  function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= cr * cr;
  }

  function hitTest() {
    // ceiling / sea floor pad
    if (seahorse.y - seahorse.r <= 0) return true;
    if (seahorse.y + seahorse.r >= (H - GAME.groundPad)) return true;

    for (const o of obstacles) {
      const topH = o.gapY - GAME.gap / 2;
      const bottomY = o.gapY + GAME.gap / 2;
      const bottomH = (H - GAME.groundPad) - bottomY;

      if (circleRectCollide(seahorse.x, seahorse.y, seahorse.r, o.x, 0, GAME.obstacleWidth, topH)) return true;
      if (circleRectCollide(seahorse.x, seahorse.y, seahorse.r, o.x, bottomY, GAME.obstacleWidth, bottomH)) return true;
    }
    return false;
  }

  function updateScore() {
    for (const o of obstacles) {
      const mid = o.x + GAME.obstacleWidth / 2;
      if (!o.scored && mid < seahorse.x) {
        o.scored = true;
        score += 1;
        scoreEl.textContent = `Score: ${score}`;
        AudioSys.playSfx("point");
      }
    }
  }

  // ========= Underwater visuals =========
  const bubbles = [];
  function spawnBubble() {
    bubbles.push({
      x: Math.random() * W,
      y: H + 20,
      r: Math.random() * scaleByScreen(10) + scaleByScreen(4),
      vy: Math.random() * scaleByScreen(60) + scaleByScreen(40),
      a: Math.random() * 0.25 + 0.05,
    });
  }

  function drawBackground() {
    // underwater gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0a6fb3");
    g.addColorStop(0.55, "#064d7a");
    g.addColorStop(1, "#04263d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // light rays
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * W + Math.sin((performance.now() / 1400) + i) * 40;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 140, H);
      ctx.lineTo(x + 260, H);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    ctx.restore();

    // bubbles
    if (Math.random() < 0.18) spawnBubble();
    for (const b of bubbles) {
      ctx.save();
      ctx.globalAlpha = b.a;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSeaFloor() {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#072a2b";
    ctx.fillRect(0, H - GAME.groundPad, W, GAME.groundPad);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#0ea5a7";
    ctx.fillRect(0, H - GAME.groundPad, W, 4);
    ctx.restore();
  }

  function drawObstacle(o) {
    const w = GAME.obstacleWidth;

    // Colors
    const isCoral = o.kind === "coral";
    const main = isCoral ? "rgba(255, 130, 170, 0.95)" : "rgba(60, 220, 170, 0.95)";
    const dark = isCoral ? "rgba(210, 70, 125, 0.95)" : "rgba(20, 150, 115, 0.95)";

    const topH = o.gapY - GAME.gap / 2;
    const bottomY = o.gapY + GAME.gap / 2;
    const bottomH = (H - GAME.groundPad) - bottomY;

    // Top pillar
    ctx.fillStyle = main;
    ctx.fillRect(o.x, 0, w, topH);

    // Bottom pillar
    ctx.fillRect(o.x, bottomY, w, bottomH);

    // Decorative “fronds”/“polyps” near the gap
    ctx.fillStyle = dark;
    const lip = scaleByScreen(18);
    ctx.fillRect(o.x - lip * 0.35, topH - lip, w + lip * 0.7, lip);
    ctx.fillRect(o.x - lip * 0.35, bottomY, w + lip * 0.7, lip);

    // Seaweed wiggle lines (if seaweed)
    if (!isCoral) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#022c22";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const xx = o.x + (i + 1) * (w / 4);
        ctx.beginPath();
        for (let y = 0; y < topH; y += 18) {
          const wiggle = Math.sin((performance.now() / 240) + y / 30 + i) * 4;
          ctx.lineTo(xx + wiggle, y);
        }
        ctx.stroke();

        ctx.beginPath();
        for (let y = bottomY; y < bottomY + bottomH; y += 18) {
          const wiggle = Math.sin((performance.now() / 240) + y / 30 + i) * 4;
          ctx.lineTo(xx + wiggle, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSeahorse() {
    // Cute pastel pink seahorse built from simple shapes.
    const x = seahorse.x;
    const y = seahorse.y;
    const r = seahorse.r;

    // tilt based on velocity
    const angle = clamp(seahorse.vy / scaleByScreen(950), -0.7, 0.9);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Body (head + torso)
    ctx.fillStyle = "#ffc0da"; // pastel pink
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.beginPath();
    ctx.roundRect(r * 0.55, -r * 0.20, r * 0.85, r * 0.45, r * 0.2);
    ctx.fillStyle = "#ffb3d3";
    ctx.fill();

    // Belly highlight
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, r * 0.2, r * 0.45, r * 0.75, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Fin
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffd8ea";
    ctx.beginPath();
    ctx.ellipse(-r * 0.75, -r * 0.15, r * 0.35, r * 0.55, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tail curl
    ctx.strokeStyle = "#ff98c6";
    ctx.lineWidth = Math.max(3, r * 0.22);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r * 0.25, r * 1.05);
    ctx.quadraticCurveTo(-r * 0.95, r * 1.35, -r * 0.45, r * 1.75);
    ctx.quadraticCurveTo(0, r * 2.05, -r * 0.25, r * 1.85);
    ctx.stroke();

    // Eye
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(r * 0.25, -r * 0.30, r * 0.17, 0, Math.PI * 2);
    ctx.fill();

    // Eye sparkle
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r * 0.30, -r * 0.35, r * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ========= Game loop =========
  function update(dt) {
    // update bubbles
    for (const b of bubbles) b.y -= b.vy * dt;
    while (bubbles.length > 120) bubbles.shift();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].y + bubbles[i].r < -30) bubbles.splice(i, 1);
    }

    if (state === "ready") {
      // gentle float
      seahorse.y += Math.sin(performance.now() / 260) * 0.25;
      return;
    }

    if (state !== "playing") return;

    // Physics
    seahorse.vy += GAME.gravity * dt;
    seahorse.y += seahorse.vy * dt;

    // Spawn obstacles
    spawnTimer += dt;
    if (spawnTimer >= GAME.spawnEvery) {
      spawnTimer = 0;
      obstacles.push(makeObstacle(W + 20));
    }

    // Move obstacles
    for (const o of obstacles) o.x -= GAME.obstacleSpeed * dt;
    obstacles = obstacles.filter(o => o.x + GAME.obstacleWidth > -80);

    updateScore();

    if (hitTest()) {
      AudioSys.playSfx("hit");
      gameOver();
    }
  }

  function draw() {
    drawBackground();

    // Obstacles
    for (const o of obstacles) drawObstacle(o);

    // Sea floor
    drawSeaFloor();

    // Seahorse
    drawSeahorse();

    // Optional: small vignette
    ctx.save();
    ctx.globalAlpha = 0.12;
    const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.2, W/2, H/2, Math.max(W,H)*0.7);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function loop(ts) {
    const t = ts / 1000;
    const dt = Math.min(0.033, t - (lastT || t));
    lastT = t;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // ========= Input =========
  function handleUserAction(e) {
    if (e) e.preventDefault();
    AudioSys.startIfNeeded();
    if (state === "gameover") return;
    swimUp();
  }

  canvas.addEventListener("pointerdown", handleUserAction, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      handleUserAction();
    }
    if (e.key.toLowerCase() === "r") reset();
  });

  btnStart.addEventListener("click", async () => {
    await AudioSys.startIfNeeded();
    reset();
    start();
  });

  // ========= Boot =========
  reset();
  requestAnimationFrame(loop);
})();