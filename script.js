(function(){
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const legend = document.getElementById('legend');
  const progressBar = document.getElementById('progressBar');
  const timerEl = document.getElementById('timer');
  const titleScreen = document.getElementById('titleScreen');
  const gameoverScreen = document.getElementById('gameoverScreen');
  const clearScreen = document.getElementById('clearScreen');
  const stageList = document.getElementById('stageList');
  const retryBtn = document.getElementById('retryBtn');
  const nextBtn = document.getElementById('nextBtn');
  const backBtnOver = document.getElementById('backBtnOver');
  const backBtnClear = document.getElementById('backBtnClear');
  const clearTimeEl = document.getElementById('clearTime');
  const needleName = document.getElementById('needleName');

  let W, H, cx, cy, R, safeBand, needleOffset;
  const N_BUCKETS = 360;
  const CLEAR_PAUSE_MS = 200; // beat of stillness once the last stroke lands
  const CLEAR_LIFT_MS = 800;  // the piece lifting free of its mold
  const INNER_WARN_PX = 5;    // a shallow dip past the line warns (yellow) instead of failing outright

  // ---- stage shapes ----
  // Every shape is expressed as targetRadius(theta, R): given a canvas-space
  // angle (atan2(dy,dx), y-down) and the base radius R, return how far the
  // guide line sits from the center in that direction. A plain circle is
  // just a constant; heart/star vary by angle.
  function heartRadius(theta, Rb){
    const phi = -theta; // convert canvas angle to standard math (y-up) angle
    const s = Math.sin(phi), c = Math.cos(phi);
    const r = 2 - 2*s + s*Math.sqrt(Math.abs(c))/(s + 1.4);
    return (r / 4) * Rb * 1.18;
  }
  function starRadius(theta, Rb){
    const points = 5;
    const step = Math.PI / points;
    let t = theta + Math.PI/2; // rotate so one point faces up
    t = ((t % (2*step)) + (2*step)) % (2*step);
    if(t > step) t = (2*step) - t;
    const Router = Rb * 1.12, Rinner = Rb * 0.46;
    const xA = Router, yA = 0;
    const xB = Rinner * Math.cos(step), yB = Rinner * Math.sin(step);
    const C = -xA * (yB - yA);
    const denom = Math.sin(t) * (xB - xA) - Math.cos(t) * (yB - yA);
    return C / denom;
  }

  const STAGES = [
    { name:'日の丸',   shapeFn:(th,Rb)=>Rb,          fill:'188,0,45'   },
    { name:'ハート',   shapeFn:heartRadius,            fill:'255,63,110' },
    { name:'星',       shapeFn:starRadius,             fill:'255,196,42' }
  ];
  let currentStageIndex = 0;
  let targetRCache = new Float32Array(N_BUCKETS);
  let shapePts = [];
  let shapePath = null;

  function buildStageCache(){
    const stage = STAGES[currentStageIndex];
    shapePts = [];
    shapePath = new Path2D();
    for(let i = 0; i < N_BUCKETS; i++){
      const a = (i / N_BUCKETS) * Math.PI * 2;
      const r = stage.shapeFn(a, R);
      targetRCache[i] = r;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      shapePts.push({x, y});
      if(i === 0) shapePath.moveTo(x, y); else shapePath.lineTo(x, y);
    }
    shapePath.closePath();
  }

  function renderStageList(){
    stageList.innerHTML = '';
    STAGES.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = 'stageBtn';
      btn.innerHTML = '<span class="num">' + (i+1) + '</span><span>' + s.name + '</span>';
      btn.addEventListener('click', () => startGame(i));
      stageList.appendChild(btn);
    });
  }

  // Break the current shape's outline into wedge-shaped shards (center ->
  // two neighboring outline points) that fly outward for the "shatter" effect.
  function buildShards(){
    shards = [];
    const segs = 24;
    const step = Math.max(1, Math.floor(N_BUCKETS / segs));
    for(let i = 0; i < N_BUCKETS; i += step){
      const i2 = Math.min(i + step, N_BUCKETS - 1);
      const p0 = shapePts[i], p1 = shapePts[i2];
      if(!p0 || !p1) continue;
      const midAngle = ((i + i2) / 2 / N_BUCKETS) * Math.PI * 2;
      const speed = W * 0.22 + Math.random() * W * 0.28;
      shards.push({
        p0, p1,
        vx: Math.cos(midAngle) * speed,
        vy: Math.sin(midAngle) * speed,
        rotSpeed: (Math.random() - 0.5) * 5
      });
    }
  }

  // A few sugar crumbs that fall away at the moment the piece detaches —
  // kept small and sparse on purpose, not a particle-effects show.
  function spawnDust(){
    dust = [];
    const n = 4 + Math.floor(Math.random() * 2); // 4-5
    for(let i = 0; i < n; i++){
      const idx = Math.floor(Math.random() * N_BUCKETS);
      const pt = shapePts[idx] || {x: cx, y: cy + R};
      dust.push({
        x: pt.x, y: pt.y,
        vx: (Math.random() - 0.5) * W * 0.06,
        vy: W * 0.04 + Math.random() * W * 0.04,
        size: W * 0.006 + Math.random() * W * 0.005,
        born: performance.now()
      });
    }
  }

  function resize(){
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.86;
    canvas.width = size * devicePixelRatio;
    canvas.height = size * devicePixelRatio;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    W = size; H = size;
    cx = W/2; cy = H/2;
    R = W * 0.30;
    safeBand = W * 0.0223;
    needleOffset = W * 0.16;
    buildStageCache();
    draw();
  }
  window.addEventListener('resize', resize);

  // ---- state ----
  let mode = 'title'; // title | playing | gameover | clearReveal | clear
  let traced = new Array(N_BUCKETS).fill(false);
  let tracedCount = 0;
  let currentState = null; // 'green' | 'yellow' | 'red' | null
  let needle = null; // {x,y} = visible tip position (offset above finger)
  let handlePos = null; // {x,y} = actual finger/touch position
  let startTime = null;
  let elapsed = 0;
  let failPoint = null;
  let rafId = null;
  let shards = [];
  let shardBornAt = 0;
  let clearPhaseStart = null; // timestamp when the clear "detach" sequence began
  let liftTiltSign = 1;
  let liftTriggered = false;
  let dust = [];

  function vibrate(pattern){
    if(navigator.vibrate){ try{ navigator.vibrate(pattern); }catch(e){} }
  }

  // ---- carving sound (synthesized "kari-kari" scratch, no audio files needed) ----
  let audioCtx = null;
  let noiseBuffer = null;
  let lastScratchAt = 0;
  function initAudio(){
    if(audioCtx) return;
    try{
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const len = audioCtx.sampleRate * 0.25;
      noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for(let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }catch(e){ audioCtx = null; }
  }
  function playScratch(){
    if(!audioCtx || !noiseBuffer) return;
    const now = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700 + Math.random() * 1600;
    bp.Q.value = 7;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    src.connect(bp); bp.connect(gain); gain.connect(audioCtx.destination);
    src.start(now);
    src.stop(now + 0.06);
  }

  // Soft "コトッ・カリッ" detach click for the moment the piece pops free —
  // a small tonal "tock" plus a faint texture tick, not the sharp "パキッ" crack.
  function playDetachClick(){
    if(!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now); osc.stop(now + 0.1);

    if(noiseBuffer){
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 5;
      const g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(0.08, now + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      src.connect(bp); bp.connect(g2); g2.connect(audioCtx.destination);
      src.start(now); src.stop(now + 0.04);
    }
  }

  function resetGame(){
    traced.fill(false);
    tracedCount = 0;
    currentState = null;
    needle = null;
    handlePos = null;
    startTime = null;
    elapsed = 0;
    failPoint = null;
    shards = [];
    clearPhaseStart = null;
    liftTriggered = false;
    dust = [];
    progressBar.style.width = '0%';
    timerEl.textContent = '0.0s';
  }

  function showScreen(el){
    [titleScreen, gameoverScreen, clearScreen].forEach(s => s.classList.add('hidden'));
    if(el) el.classList.remove('hidden');
  }

  function startGame(stageIndex){
    if(typeof stageIndex === 'number') currentStageIndex = stageIndex;
    buildStageCache();
    resetGame();
    mode = 'playing';
    needleName.textContent = STAGES[currentStageIndex].name;
    showScreen(null);
    hud.classList.remove('hidden');
    legend.classList.remove('hidden');
    loop();
  }

  function goToStageSelect(){
    mode = 'title';
    hud.classList.add('hidden');
    legend.classList.add('hidden');
    showScreen(titleScreen);
  }

  function gameOver(x, y){
    mode = 'gameover';
    failPoint = {x, y};
    needle = null;
    handlePos = null;
    shardBornAt = performance.now();
    buildShards();
    vibrate([0, 60, 30, 90]);
    setTimeout(() => {
      hud.classList.add('hidden');
      legend.classList.add('hidden');
      showScreen(gameoverScreen);
    }, 650);
  }

  function clearGame(){
    mode = 'clearReveal';
    needle = null;
    handlePos = null;
    clearPhaseStart = performance.now();
    liftTriggered = false;
    dust = [];
    liftTiltSign = Math.random() < 0.5 ? -1 : 1;
    hud.classList.add('hidden');
    legend.classList.add('hidden');
    setTimeout(() => {
      mode = 'clear';
      clearTimeEl.textContent = elapsed.toFixed(2) + 's';
      const isLast = currentStageIndex === STAGES.length - 1;
      nextBtn.textContent = isLast ? 'さいしょのステージへ' : 'つぎのステージへ';
      showScreen(clearScreen);
    }, CLEAR_PAUSE_MS + CLEAR_LIFT_MS);
  }

  // ---- input ----
  function pointerPos(e){
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function handleMove(e){
    if(mode !== 'playing') return;
    e.preventDefault();
    if(!audioCtx) initAudio();
    const p = pointerPos(e);
    handlePos = p;

    // Tip is offset above the finger so the fingertip never covers the
    // point that actually gets judged. Near the top edge, shrink the
    // offset so the tip stays on-canvas instead of clamping (which would
    // make the tip "stick" under the finger).
    const maxOffset = Math.max(0, p.y - W*0.06);
    const offset = Math.min(needleOffset, maxOffset);
    const rawTip = { x: p.x, y: p.y - offset };

    if(startTime === null) startTime = performance.now();

    let dx = rawTip.x - cx, dy = rawTip.y - cy;
    let dist = Math.hypot(dx, dy);
    const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const diffRaw = dist - targetR;

    // Magnetic assist: within a capture range around the line, gently pull
    // the tip toward it so small hand tremor doesn't throw off the trace.
    const magnetRange = safeBand * 2.4;
    let snappedDist = dist;
    if(dist > 0.001 && Math.abs(diffRaw) < magnetRange){
      const pull = 1 - Math.abs(diffRaw) / magnetRange; // 0..1, stronger near the line
      snappedDist = dist - diffRaw * pull * 0.72;
    }
    const dirX = dist > 0.001 ? dx / dist : 1;
    const dirY = dist > 0.001 ? dy / dist : 0;
    const tip = { x: cx + dirX * snappedDist, y: cy + dirY * snappedDist };
    needle = tip;

    const diff = snappedDist - targetR;

    // Outside the line is always forgiving (yellow, never fails). Inside,
    // a shallow dip just past the safe band still only warns (yellow) —
    // only a deeper intrusion counts as a real break (red).
    let newState;
    if(Math.abs(diff) <= safeBand) newState = 'green';
    else if(diff > safeBand) newState = 'yellow';
    else if(diff > -(safeBand + INNER_WARN_PX)) newState = 'yellow';
    else newState = 'red';

    if(newState !== currentState){
      currentState = newState;
      if(newState === 'green') vibrate([0, 18, 20, 12]);
      else if(newState === 'yellow') vibrate(6);
      else if(newState === 'red') vibrate(40);
    }

    if(newState === 'green'){
      const base = Math.round(angleDeg);
      for(let i = -2; i <= 2; i++){
        const b = (base + i + N_BUCKETS) % N_BUCKETS;
        if(!traced[b]){ traced[b] = true; tracedCount++; }
      }
      const pct = (tracedCount / N_BUCKETS) * 100;
      progressBar.style.width = pct.toFixed(1) + '%';

      // continuous "kari-kari" scratch sound + light vibration while carving
      const now = performance.now();
      if(now - lastScratchAt > 90){
        lastScratchAt = now;
        playScratch();
        vibrate(5);
      }

      // Clear condition is intentionally strict: every bucket of the line
      // must be traced. No partial-completion shortcut.
      if(tracedCount >= N_BUCKETS){
        elapsed = (performance.now() - startTime) / 1000;
        clearGame();
      }
    } else if(newState === 'red'){
      gameOver(tip.x, tip.y);
    }
  }

  function handleEnd(){
    if(mode !== 'playing') return;
    needle = null;
    handlePos = null;
    currentState = null;
  }

  canvas.addEventListener('touchstart', handleMove, {passive:false});
  canvas.addEventListener('touchmove', handleMove, {passive:false});
  canvas.addEventListener('touchend', handleEnd, {passive:false});
  canvas.addEventListener('mousedown', handleMove);
  canvas.addEventListener('mousemove', (e)=>{ if(e.buttons===1) handleMove(e); });
  canvas.addEventListener('mouseup', handleEnd);

  retryBtn.addEventListener('click', () => startGame(currentStageIndex));
  nextBtn.addEventListener('click', () => {
    const next = (currentStageIndex + 1) % STAGES.length;
    startGame(next);
  });
  backBtnOver.addEventListener('click', goToStageSelect);
  backBtnClear.addEventListener('click', goToStageSelect);
  renderStageList();

  // ---- drawing ----
  function draw(){
    ctx.clearRect(0,0,W,H);

    const now = performance.now();
    const isShattering = mode === 'gameover' && shards.length > 0;

    // ---- clear "detach" timeline ----
    let liftProgress = 0; // 0..1 across the lift phase only (pause phase = 0)
    if(clearPhaseStart !== null){
      const t = now - clearPhaseStart;
      if(t > CLEAR_PAUSE_MS){
        liftProgress = Math.min(1, (t - CLEAR_PAUSE_MS) / CLEAR_LIFT_MS);
      }
    }
    const liftEase = 1 - Math.pow(1 - liftProgress, 3); // ease-out cubic
    if(liftProgress > 0 && !liftTriggered){
      liftTriggered = true;
      playDetachClick();
      vibrate(16);
      spawnDust();
    }
    // gentle whole-screen zoom that breathes in then back out across the lift
    const zoomScale = clearPhaseStart !== null ? 1 + 0.045 * Math.sin(Math.PI * liftProgress) : 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-cx, -cy);

    // candy base plate (washi paper look)
    const plateR = R + safeBand + W*0.09;
    const grad = ctx.createRadialGradient(cx, cy - plateR*0.2, plateR*0.1, cx, cy, plateR);
    grad.addColorStop(0, '#fffaf0');
    grad.addColorStop(1, '#e7d9ad');
    ctx.beginPath();
    ctx.arc(cx, cy, plateR, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,90,40,0.25)';
    ctx.stroke();

    // the socket left behind once the piece starts lifting free
    if(!isShattering && shapePath && liftEase > 0){
      ctx.save();
      ctx.globalAlpha = 0.85 * liftEase;
      const holeGrad = ctx.createRadialGradient(cx, cy, R*0.1, cx, cy, R*1.05);
      holeGrad.addColorStop(0, 'rgba(40,26,10,0.55)');
      holeGrad.addColorStop(1, 'rgba(40,26,10,0.15)');
      ctx.fillStyle = holeGrad;
      ctx.fill(shapePath);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(40,26,10,0.35)';
      ctx.stroke(shapePath);
      ctx.restore();
    }

    if(!isShattering && shapePath){
      const maxLiftPx = Math.min(20, Math.max(10, W*0.045));
      const liftPx = maxLiftPx * liftEase;
      const tiltRad = (6 * Math.PI/180) * liftTiltSign * liftEase;

      ctx.save();
      ctx.translate(cx, cy - liftPx);
      ctx.rotate(tiltRad);
      ctx.translate(-cx, -cy);

      // Stage 0 (日の丸): once cleared, fade in a crisp white flag field
      // behind the red disc so it reads as an actual flag being revealed.
      if(currentStageIndex === 0 && liftEase > 0){
        ctx.save();
        ctx.globalAlpha = liftEase;
        const rw = R * 2.9, rh = R * 1.9;
        const rx = cx - rw/2, ry = cy - rh/2, rad = W*0.02;
        ctx.beginPath();
        ctx.moveTo(rx+rad, ry);
        ctx.arcTo(rx+rw, ry, rx+rw, ry+rh, rad);
        ctx.arcTo(rx+rw, ry+rh, rx, ry+rh, rad);
        ctx.arcTo(rx, ry+rh, rx, ry, rad);
        ctx.arcTo(rx, ry, rx+rw, ry, rad);
        ctx.closePath();
        ctx.fillStyle = '#fdfdf6';
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = W*0.03;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // shape fill: deepens with progress while playing, then finishes as
      // a fully solid, glossy "real" surface as it lifts free.
      const fillRGB = STAGES[currentStageIndex].fill;
      const baseAlpha = 0.10 + 0.55 * (tracedCount/N_BUCKETS);
      const alpha = baseAlpha + (1 - baseAlpha) * liftEase;
      ctx.fillStyle = 'rgba(' + fillRGB + ',' + alpha + ')';
      ctx.fill(shapePath);

      if(liftEase > 0){
        ctx.save();
        ctx.globalAlpha = 0.4 * liftEase;
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(cx-R*0.35, cy-R*0.5, R*0.05, cx-R*0.35, cy-R*0.5, R*1.0);
        gg.addColorStop(0,'rgba(255,255,255,0.95)');
        gg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle = gg;
        ctx.fill(shapePath);
        ctx.restore();
      }

      // guide line: only shown while still in the mold, pre-clear
      if(clearPhaseStart === null && shapePts.length === N_BUCKETS){
        for(let i = 0; i < N_BUCKETS; i++){
          const p0 = shapePts[i];
          const p1 = shapePts[(i+1) % N_BUCKETS];
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          if(traced[i]){
            ctx.strokeStyle = 'rgba(63,224,138,0.9)';
            ctx.lineWidth = 5;
          } else {
            ctx.strokeStyle = 'rgba(120,60,20,0.35)';
            ctx.lineWidth = 2;
          }
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // needle: a bamboo-skewer stick from the finger (handle) up to the
    // tip that actually gets judged, so the tip stays visible above the hand.
    if(needle && handlePos){
      let col = '#ffffff';
      if(currentState === 'green') col = '#3fe08a';
      else if(currentState === 'yellow') col = '#ffd23f';
      else if(currentState === 'red') col = '#ff3b3b';

      // stick shaft
      ctx.beginPath();
      ctx.moveTo(handlePos.x, handlePos.y);
      ctx.lineTo(needle.x, needle.y);
      ctx.lineWidth = W*0.012;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d8b978';
      ctx.stroke();

      // grip circle at the finger position
      ctx.beginPath();
      ctx.arc(handlePos.x, handlePos.y, W*0.024, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(216,185,120,0.55)';
      ctx.fill();

      // glowing tip (this is the point being judged)
      ctx.beginPath();
      ctx.arc(needle.x, needle.y, W*0.015, 0, Math.PI*2);
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // a few sugar crumbs falling away at the moment of detachment
    if(dust.length){
      const g = W * 0.6;
      dust.forEach(d => {
        const ts = (now - d.born) / 1000;
        if(ts > 0.6 || ts < 0) return;
        const a = 1 - ts/0.6;
        const x = d.x + d.vx*ts;
        const y = d.y + d.vy*ts + 0.5*g*ts*ts;
        ctx.beginPath();
        ctx.arc(x, y, d.size, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(216,185,120,' + (a*0.85) + ')';
        ctx.fill();
      });
    }

    // shatter: the whole shape breaks into wedges that fly outward and fade
    if(isShattering){
      const t = Math.min(1, (now - shardBornAt) / 700);
      const fillRGB = STAGES[currentStageIndex].fill;
      shards.forEach(s => {
        const dx = s.vx * t;
        const dy = s.vy * t + (t*t) * W*0.16;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.translate(cx + dx, cy + dy);
        ctx.rotate(s.rotSpeed * t);
        ctx.translate(-cx, -cy);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(s.p0.x, s.p0.y);
        ctx.lineTo(s.p1.x, s.p1.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(' + fillRGB + ',0.6)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
        ctx.restore();
      });
    }

    // crack effect
    if(mode === 'gameover' && failPoint){
      ctx.strokeStyle = 'rgba(255,59,59,0.85)';
      ctx.lineWidth = 2;
      for(let i=0;i<7;i++){
        const ang = Math.random()*Math.PI*2;
        const len = W*0.05 + Math.random()*W*0.12;
        ctx.beginPath();
        ctx.moveTo(failPoint.x, failPoint.y);
        ctx.lineTo(failPoint.x + Math.cos(ang)*len, failPoint.y + Math.sin(ang)*len);
        ctx.stroke();
      }
    }

    ctx.restore(); // zoom
  }

  function loop(){
    if(mode === 'playing'){
      if(startTime !== null){
        elapsed = (performance.now() - startTime) / 1000;
        timerEl.textContent = elapsed.toFixed(1) + 's';
      }
      draw();
      rafId = requestAnimationFrame(loop);
    } else if(mode === 'gameover' || mode === 'clearReveal'){
      draw();
      rafId = requestAnimationFrame(loop);
    }
  }

  resize();
})();
