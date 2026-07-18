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
  const remainingEl = document.createElement('div');
  remainingEl.id = 'remainingSpots';
  remainingEl.style.cssText = 'font-size:11px; font-weight:700; color:#ffd23f; text-align:right; ' +
    'margin-top:2px; letter-spacing:0.5px; min-height:14px;';
  document.getElementById('progressWrap').insertAdjacentElement('afterend', remainingEl);

  const carveHelpBtn = document.createElement('button');
  carveHelpBtn.id = 'carveHelpBtn';
  carveHelpBtn.type = 'button';
  carveHelpBtn.textContent = '🔍 残りを探す';
  carveHelpBtn.style.cssText = 'display:none;position:fixed;left:50%;bottom:calc(54px + env(safe-area-inset-bottom));' +
    'transform:translateX(-50%);z-index:60;margin:0;padding:8px 14px;border-radius:999px;' +
    'border:1px solid rgba(255,210,90,.55);background:rgba(25,16,12,.88);color:#ffe39a;' +
    'font-size:12px;font-weight:900;letter-spacing:.4px;box-shadow:0 6px 16px rgba(0,0,0,.28);';
  remainingEl.insertAdjacentElement('afterend', carveHelpBtn);
  carveHelpBtn.addEventListener('click', showRemainingHelp);

  function updateProgress(){
    const pct = (erodedCount / N_BUCKETS) * 100;
    progressBar.style.width = pct.toFixed(1) + '%';
    const left = N_BUCKETS - erodedCount;
    remainingEl.textContent = left > 0 ? ('削り残し あと' + left + '箇所') : '';
  }

  let W, H, cx, cy, R, safeBand, needleOffset, plateR;
  const N_BUCKETS = 360;
  const CLEAR_PAUSE_MS = 200; // beat of stillness once the last stroke lands
  const CLEAR_LIFT_MS = 800;  // the piece lifting free of its mold
  const CELEBRATION_MS = 1300; // festival scene fade-in before the result screen
  const DRAGON_FREEZE_MS = 260; // 龍(secret)だけ: パチスロ風フリーズ→プチュン暗転の長さ

  // ---- stage shapes ----
  // Every shape is expressed as targetRadius(theta, R): given a canvas-space
  // angle (atan2(dy,dx), y-down) and the base radius R, return how far the
  // guide line sits from the center in that direction. A plain circle is
  // just a constant; everything else varies by angle.
  function toRad(deg){ return deg * Math.PI / 180; }
  function angDiff(a, b){
    let d = (a - b) % (Math.PI*2);
    if(d > Math.PI) d -= Math.PI*2;
    if(d < -Math.PI) d += Math.PI*2;
    return d;
  }
  // Distance from center to a rounded-square boundary at angle theta, given
  // the square's edge-midpoint half-width S. Higher n = sharper corners;
  // n=5 reads clearly as "square" while keeping the corners soft/rounded.
  const PLATE_SQUIRCLE_N = 5;
  function squircleRadius(theta, S, n){
    const c = Math.abs(Math.cos(theta)), s = Math.abs(Math.sin(theta));
    return S / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1/n);
  }
  // Smooth localized bump (0..1) centered on centerDeg, used to add small
  // features (a handle, a knot, a fin) without making the outline jagged.
  function bump(theta, centerDeg, widthDeg){
    const c = toRad(centerDeg), w = toRad(widthDeg);
    const d = angDiff(theta, c);
    return Math.exp(-(d*d) / (2*w*w));
  }
  // Flat-topped bump (0..1): stays at 1 across the "halfWidthDeg" core, then
  // eases down to 0 over "edgeDeg". Used for handles/sticks/caps that should
  // read as a straight rod with a rounded end, not a soft Gaussian thorn —
  // matching the design sheet's clean, deliberate strokes.
  function plateauBump(theta, centerDeg, halfWidthDeg, edgeDeg){
    const c = toRad(centerDeg);
    const d = Math.abs(angDiff(theta, c));
    const hw = toRad(halfWidthDeg), edge = toRad(edgeDeg);
    if(d <= hw) return 1;
    if(d >= hw + edge) return 0;
    const t = (d - hw) / edge;
    return 1 - (t*t*(3 - 2*t)); // smoothstep falloff
  }

  // うちわ: traced directly from the clear-illustration artwork itself
  // (images/clear_uchiwa.png), so the judgment outline is pixel-matched to
  // that picture's fan+handle silhouette rather than an approximated curve.
  // 360 values = ratio of boundary-distance to the fan circle's own radius,
  // one per degree, measured by ray-casting the image's alpha mask.
  const UCHIWA_SHAPE_RATIOS = [1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0068,1.0068,1.0068,1.0068,1.0045,1.0045,1.0045,1.0068,1.0068,1.0068,1.0068,1.0068,1.0068,1.0068,1.0091,1.0114,1.0136,1.0136,1.0136,1.0091,1.0091,1.0068,1.0068,1.0068,1.0068,1.0068,1.0068,1.0068,1.0091,1.0091,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0091,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0,1.0,1.0,1.0,1.0,1.0023,1.0068,1.0068,1.0068,1.0068,1.0068,1.0045,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0068,1.0068,1.0068,1.0068,1.0068,1.0091,1.0091,1.0136,1.0886,1.2591,1.4068,1.4659,1.4773,1.5045,1.5273,1.5273,1.5295,1.5318,1.5318,1.5318,1.5295,1.5136,1.5091,1.4886,1.4273,1.3705,1.2409,1.1159,1.0295,1.0182,1.0136,1.0091,1.0023,1.0023,1.0023,1.0023,1.0,1.0,1.0023,1.0045,1.0045,1.0045,1.0045,1.0,1.0,1.0,1.0045,1.0045,1.0045,1.0045,1.0068,1.0091,1.0114,1.0136,1.0136,1.0136,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0182,1.0205,1.0205,1.0205,1.0205,1.0205,1.0205,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0068,1.0068,1.0068,1.0091,1.0091,1.0091,1.0091,1.0091,1.0091,1.0091,1.0091,1.0091,1.0091,1.0045,1.0045,1.0045,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0068,1.0045,1.0045,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0,1.0,1.0,1.0,1.0,0.9977,1.0,1.0,1.0,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0023,1.0,1.0,1.0,1.0,1.0,1.0023,1.0023,1.0023,1.0023,1.0,0.9977,0.9977,0.9977,0.9909,0.9909,0.9909,0.9909,0.9909,0.9909,0.9909,0.9932,0.9932,0.9932,1.0,1.0,1.0,0.9932,0.9932,0.9932,0.9932,0.9932,0.9932,0.9932,0.9955,0.9977,0.9977,1.0045,1.0045,1.0045,1.0045,1.0068,1.0068,1.0114,1.0114,1.0114,1.0114,1.0114,1.0045,1.0068,1.0068,1.0068,1.0114,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0114,1.0136,1.0136,1.0136,1.0159,1.0159,1.0182,1.0182,1.0182,1.0182,1.0182,1.0182,1.0182,1.0182,1.0182,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0159,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0136,1.0114,1.0091,1.0091,1.0091,1.0091,1.0091,1.0114,1.0114,1.0114,1.0114];
  function uchiwaRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * UCHIWA_SHAPE_RATIOS[idx];
  }
  const CHOCHIN_SHAPE_RATIOS = [0.8093,0.8093,0.8093,0.8093,0.8093,0.8093,0.8118,0.8118,0.8143,0.8168,0.8193,0.8218,0.8243,0.8268,0.8318,0.8344,0.8394,0.8444,0.8469,0.8494,0.8544,0.8619,0.8669,0.8719,0.8769,0.8845,0.8895,0.8945,0.8995,0.907,0.9145,0.9195,0.9271,0.9346,0.9396,0.9446,0.9521,0.9571,0.9621,0.9671,0.9722,0.9797,0.9822,0.9872,0.9897,0.9947,0.9972,0.9997,1.0047,1.0072,1.0097,1.0122,1.0122,1.0173,1.0173,1.0198,1.0198,1.0223,1.0223,1.0223,1.0223,1.0198,1.0198,1.0198,1.0198,1.0373,1.0799,1.1175,1.1475,1.1626,1.1726,1.1751,1.1776,1.1776,1.1776,1.1776,1.1776,1.1776,1.1776,1.1776,1.1751,1.1751,1.1751,1.1751,1.1751,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1726,1.1751,1.1751,1.1751,1.1776,1.1776,1.1776,1.1776,1.1801,1.1801,1.1801,1.1776,1.1776,1.1776,1.1776,1.1751,1.1651,1.1526,1.125,1.0874,1.0473,1.0223,1.0223,1.0223,1.0223,1.0223,1.0223,1.0223,1.0223,1.0198,1.0198,1.0173,1.0148,1.0122,1.0097,1.0072,1.0047,1.0022,0.9972,0.9947,0.9897,0.9872,0.9797,0.9797,0.9722,0.9697,0.9621,0.9571,0.9521,0.9496,0.9421,0.9346,0.9296,0.9246,0.9195,0.912,0.907,0.8995,0.8945,0.8895,0.8845,0.8795,0.8744,0.8669,0.8644,0.8594,0.8544,0.8494,0.8444,0.8419,0.8394,0.8344,0.8318,0.8268,0.8243,0.8218,0.8193,0.8168,0.8168,0.8143,0.8118,0.8118,0.8118,0.8093,0.8093,0.8093,0.8093,0.8093,0.8118,0.8118,0.8118,0.8143,0.8168,0.8168,0.8193,0.8218,0.8243,0.8268,0.8318,0.8344,0.8394,0.8419,0.8469,0.8519,0.8569,0.8619,0.8669,0.8744,0.8795,0.887,0.892,0.897,0.9045,0.912,0.917,0.9246,0.9296,0.9346,0.9421,0.9471,0.9521,0.9596,0.9646,0.9697,0.9747,0.9797,0.9847,0.9897,0.9922,0.9972,0.9997,1.0022,1.0047,1.0072,1.0097,1.0097,1.0122,1.0148,1.0148,1.0173,1.0173,1.0173,1.0173,1.0173,1.0173,1.0148,1.0148,1.0148,1.0148,1.0373,1.0749,1.1175,1.14,1.1475,1.1501,1.1526,1.1526,1.2052,1.2327,1.2501,1.2528,1.2545,1.2556,1.2561,1.2561,1.2567,1.2572,1.2572,1.2572,1.2572,1.2572,1.2572,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2578,1.2572,1.2567,1.2567,1.2556,1.2545,1.2517,1.2453,1.2252,1.1952,1.1501,1.1501,1.1501,1.1425,1.1275,1.0924,1.0523,1.0173,1.0173,1.0173,1.0173,1.0173,1.0173,1.0173,1.0173,1.0173,1.0148,1.0148,1.0148,1.0122,1.0097,1.0072,1.0072,1.0022,0.9997,0.9997,0.9947,0.9897,0.9872,0.9822,0.9772,0.9747,0.9697,0.9621,0.9596,0.9546,0.9446,0.9421,0.9371,0.9296,0.922,0.917,0.9095,0.9045,0.897,0.8895,0.882,0.8795,0.8719,0.8669,0.8619,0.8544,0.8494,0.8469,0.8419,0.8369,0.8344,0.8293,0.8268,0.8243,0.8218,0.8193,0.8168,0.8143,0.8143,0.8118,0.8118,0.8093,0.8093,0.8093];
  function lanternRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * CHOCHIN_SHAPE_RATIOS[idx];
  }

  const OMEN_SHAPE_RATIOS = [0.8875,0.8875,0.8875,0.8875,0.8875,0.8875,0.8875,0.8897,0.8897,0.892,0.892,0.8965,0.8965,0.8965,0.901,0.9033,0.9055,0.9078,0.91,0.91,0.9146,0.9168,0.9191,0.9213,0.9259,0.9281,0.9304,0.9326,0.9349,0.9371,0.9394,0.9439,0.9462,0.9484,0.953,0.9552,0.9575,0.962,0.9665,0.9688,0.971,0.9733,0.9778,0.9801,0.9846,0.9846,0.9891,0.9913,0.9936,0.9981,1.0004,1.0072,1.0072,1.0117,1.0139,1.0184,1.0207,1.0252,1.0275,1.0297,1.032,1.0365,1.0388,1.041,1.0455,1.0501,1.0523,1.0546,1.0591,1.0613,1.0659,1.0681,1.0726,1.0749,1.0772,1.0817,1.0839,1.0862,1.0884,1.0907,1.0952,1.0952,1.0975,1.102,1.102,1.1043,1.1065,1.1065,1.1088,1.1088,1.111,1.111,1.111,1.111,1.111,1.1088,1.1088,1.1065,1.1065,1.1043,1.102,1.0975,1.0975,1.093,1.0907,1.0884,1.0862,1.0817,1.0794,1.0749,1.0726,1.0681,1.0659,1.0636,1.0591,1.0546,1.0523,1.0478,1.0455,1.041,1.0365,1.0342,1.0297,1.0252,1.0207,1.0184,1.0139,1.0117,1.0072,1.0049,1.0004,0.9981,0.9959,0.9936,0.9891,0.9846,0.9823,0.9778,0.9755,0.9733,0.9688,0.9665,0.962,0.9597,0.9552,0.953,0.9507,0.9484,0.9439,0.9417,0.9394,0.9349,0.9326,0.9304,0.9259,0.9236,0.9213,0.9168,0.9146,0.9123,0.9078,0.9078,0.9033,0.901,0.8988,0.8965,0.8965,0.892,0.8897,0.8897,0.8875,0.8875,0.8852,0.8852,0.883,0.8807,0.8807,0.8807,0.8807,0.8807,0.8807,0.8807,0.8807,0.8807,0.883,0.883,0.8852,0.8897,0.892,0.8942,0.8965,0.8988,0.9033,0.9055,0.91,0.9146,0.9191,0.9236,0.9304,0.9349,0.9417,0.9484,0.9552,0.962,0.9688,0.9755,0.9846,0.9936,1.0004,1.0094,1.0184,1.0275,1.0388,1.0478,1.0591,1.0704,1.0794,1.0907,1.102,1.1155,1.1291,1.1404,1.1517,1.163,1.1765,1.1878,1.2014,1.2149,1.2262,1.2397,1.2507,1.2537,1.2567,1.2597,1.2621,1.2651,1.2671,1.2696,1.2696,1.2696,1.2696,1.2676,1.2636,1.2562,1.2397,1.1946,1.1404,1.0884,1.0275,0.9665,0.91,0.8491,0.7881,0.7294,0.6752,0.6729,0.6729,0.6729,0.6729,0.6729,0.6729,0.6707,0.6707,0.6707,0.6707,0.6684,0.6684,0.6684,0.6684,0.6684,0.6684,0.6662,0.6662,0.6639,0.6639,0.6639,0.6616,0.6616,0.6594,0.6594,0.6594,0.6594,0.6594,0.6594,0.6594,0.6594,0.6729,0.7339,0.7971,0.8581,0.9236,0.9823,1.0433,1.0997,1.1562,1.2081,1.2502,1.2582,1.2636,1.2676,1.2681,1.2681,1.2681,1.2681,1.2661,1.2631,1.2602,1.2572,1.2547,1.2517,1.242,1.2307,1.2172,1.2036,1.1901,1.1788,1.1652,1.1517,1.1404,1.1291,1.1178,1.1088,1.0952,1.0862,1.0749,1.0659,1.0546,1.0455,1.0342,1.0252,1.0162,1.0072,1.0004,0.9913,0.9823,0.9778,0.9688,0.962,0.9575,0.9507,0.9439,0.9394,0.9326,0.9281,0.9236,0.9191,0.9146,0.9123,0.9078,0.9055,0.901,0.8988,0.8965,0.8942,0.892,0.892,0.8897,0.8897,0.8875,0.8875];
  function maskRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * OMEN_SHAPE_RATIOS[idx];
  }

  const KAZAGURUMA_SHAPE_RATIOS = [0.7693,0.7569,0.7446,0.7353,0.726,0.7168,0.7075,0.6951,0.6859,0.6735,0.6673,0.6581,0.6488,0.6488,0.6488,0.6488,0.6642,0.7013,0.7322,0.7724,0.8249,0.8651,0.9176,0.9701,1.035,1.0999,1.1678,1.2111,1.2327,1.2327,1.2327,1.2327,1.2296,1.2235,1.2142,1.2049,1.1956,1.1864,1.174,1.1648,1.1524,1.1431,1.1339,1.1215,1.1153,1.1061,1.0937,1.0875,1.0752,1.069,1.0597,1.0474,1.0381,1.0319,1.0226,1.0134,1.001,0.9948,0.9825,0.9732,0.967,0.9578,0.9423,0.9361,0.9269,0.9145,0.9052,0.896,0.8867,0.8774,0.8682,0.8558,0.8465,0.8404,0.828,0.8187,0.8095,0.8002,0.8002,0.8002,0.8002,0.8712,0.9794,1.1184,1.2618,1.3189,1.3849,1.3917,1.3944,1.3944,1.3944,1.3944,1.393,1.3889,1.3536,1.2781,1.1462,0.9825,0.862,0.7662,0.689,0.6364,0.6334,0.6303,0.6272,0.6241,0.6148,0.6117,0.6086,0.6055,0.6025,0.5994,0.5994,0.5994,0.5994,0.689,0.7909,0.9114,1.0288,1.14,1.1771,1.1926,1.1956,1.1956,1.1956,1.1956,1.1895,1.1833,1.1802,1.1709,1.1648,1.1617,1.1524,1.1493,1.14,1.1339,1.1246,1.1184,1.1122,1.103,1.0937,1.0875,1.0813,1.0721,1.0659,1.0566,1.0504,1.0412,1.0319,1.0257,1.0195,1.0103,1.001,0.9917,0.9856,0.9794,0.9732,0.9639,0.9578,0.9485,0.9423,0.933,0.9269,0.9176,0.9114,0.9021,0.896,0.8898,0.8805,0.8743,0.8682,0.8589,0.8527,0.8434,0.8373,0.8311,0.8249,0.8187,0.8125,0.8033,0.7971,0.7909,0.7847,0.7817,0.7724,0.7662,0.7631,0.7538,0.7508,0.7446,0.7415,0.7353,0.7291,0.723,0.7199,0.7137,0.7106,0.7044,0.6982,0.6982,0.6921,0.6859,0.6859,0.6859,0.6859,0.7384,0.8033,0.8712,0.9608,1.0659,1.2049,1.2707,1.2822,1.2843,1.2843,1.2843,1.2843,1.2829,1.2815,1.2788,1.2768,1.2748,1.2727,1.2707,1.268,1.2659,1.2639,1.2618,1.2591,1.2564,1.255,1.2523,1.2482,1.2389,1.2265,1.2173,1.2049,1.1956,1.1864,1.174,1.1617,1.1493,1.14,1.1246,1.1122,1.0999,1.0875,1.0721,1.0597,1.0474,1.035,1.0195,1.0072,0.9948,0.9825,0.9701,0.9578,0.9423,0.9299,0.9176,0.9083,0.896,0.8805,0.8682,0.8589,0.8465,0.8373,0.828,0.8156,0.8033,0.794,0.7817,0.7755,0.7693,0.7569,0.7477,0.7415,0.7353,0.7291,0.7168,0.7137,0.7044,0.6982,0.689,0.6859,0.6797,0.6735,0.6642,0.6581,0.655,0.6488,0.6488,0.6488,0.6488,0.726,0.8496,0.967,1.0844,1.1802,1.2544,1.2666,1.2727,1.2734,1.2734,1.2734,1.2734,1.2713,1.2693,1.2666,1.2645,1.2618,1.2598,1.2571,1.255,1.253,1.2516,1.2451,1.2358,1.2265,1.2204,1.208,1.2018,1.1926,1.1833,1.174,1.1648,1.1586,1.1493,1.14,1.1308,1.1184,1.1091,1.0999,1.0906,1.0782,1.069,1.0566,1.0474,1.035,1.0257,1.0072,0.9979,0.9856,0.9732,0.9608,0.9485,0.9361,0.9238,0.9114,0.8991,0.8836,0.8743,0.8589,0.8496,0.8373,0.8249,0.8125,0.8002,0.7909,0.7786];
  // BUILD 73: 風ぐるま専用の輪郭スムージング。
  // 元画像から取った360点をそのまま丸めて参照すると、細い持ち手部分で
  // 1度ごとの段差がノコギリ状の判定になっていた。5点ガウス平均と
  // 線形補間を重ね、見た目と判定を滑らかにつなぐ。
  const KAZAGURUMA_SMOOTH_RATIOS = KAZAGURUMA_SHAPE_RATIOS.map((_, i) => {
    const n = KAZAGURUMA_SHAPE_RATIOS.length;
    const at = off => KAZAGURUMA_SHAPE_RATIOS[(i + off + n) % n];
    return (at(-2) + 4*at(-1) + 6*at(0) + 4*at(1) + at(2)) / 16;
  });
  function pinwheelRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const i0 = Math.floor(deg) % 360;
    const i1 = (i0 + 1) % 360;
    const t = deg - Math.floor(deg);
    let ratio = KAZAGURUMA_SMOOTH_RATIOS[i0] +
      (KAZAGURUMA_SMOOTH_RATIOS[i1] - KAZAGURUMA_SMOOTH_RATIOS[i0]) * t;

    // BUILD 74: 持ち手だけは画像由来の点列を使わず、真っ直ぐな棒として
    // 数式で作る。下方向90°を中心に、左右が平行で先端が水平な輪郭になる。
    // これで真っ直ぐ針を動かした時に判定線が左右へ蛇行しない。
    const handleDelta = Math.abs(angDiff(theta, Math.PI / 2));
    const handleOuter = toRad(10);
    if(handleDelta <= handleOuter){
      const halfWidth = Rb * 0.13;
      const bottomY = Rb * 1.40;
      const c = Math.abs(Math.cos(theta));
      const s = Math.max(0.0001, Math.sin(theta));
      const sideR = c < 0.0001 ? Infinity : halfWidth / c;
      const bottomR = bottomY / s;
      const straightHandleR = Math.min(sideR, bottomR);

      // 端の2°だけ元の羽根へ滑らかにつなぎ、角で急に跳ねないようにする。
      const blendStart = toRad(8);
      let mix = 1;
      if(handleDelta > blendStart){
        const u = (handleOuter - handleDelta) / (handleOuter - blendStart);
        mix = u*u*(3 - 2*u);
      }
      ratio = ratio * (1 - mix) + (straightHandleR / Rb) * mix;
    }
    return Rb * ratio;
  }

  const RINGOAME_SHAPE_RATIOS = [0.9231,0.9231,0.9201,0.9201,0.9141,0.9111,0.9111,0.9111,0.905,0.905,0.902,0.902,0.899,0.896,0.896,0.893,0.893,0.89,0.89,0.884,0.884,0.884,0.881,0.881,0.878,0.875,0.875,0.872,0.869,0.869,0.869,0.866,0.866,0.863,0.8599,0.8599,0.8569,0.8569,0.8569,0.8539,0.8539,0.8509,0.8479,0.8479,0.8449,0.8449,0.8419,0.8419,0.8389,0.8389,0.8389,0.8389,0.8389,0.8329,0.8329,0.8329,0.8329,0.8329,0.8329,0.8329,0.8389,0.8479,0.8569,0.866,0.866,0.866,0.866,0.863,0.863,0.8569,0.8569,0.8479,0.8389,0.8329,0.8209,0.8148,0.8148,0.8148,0.8148,0.863,0.9291,1.0343,1.1606,1.2667,1.315,1.3831,1.4275,1.4334,1.4367,1.4367,1.4367,1.4367,1.4347,1.4301,1.4176,1.3329,1.2793,1.1877,1.0404,0.9231,0.8389,0.8058,0.8058,0.8058,0.8058,0.8118,0.8209,0.8329,0.8419,0.8509,0.8569,0.8569,0.8599,0.863,0.863,0.863,0.863,0.8599,0.8569,0.8479,0.8389,0.8299,0.8269,0.8269,0.8269,0.8299,0.8299,0.8329,0.8329,0.8329,0.8359,0.8389,0.8389,0.8419,0.8419,0.8449,0.8449,0.8479,0.8479,0.8509,0.8509,0.8539,0.8539,0.8569,0.8569,0.8569,0.863,0.863,0.863,0.869,0.869,0.872,0.872,0.872,0.875,0.878,0.878,0.881,0.881,0.884,0.89,0.89,0.89,0.893,0.896,0.899,0.899,0.902,0.902,0.905,0.9081,0.9111,0.9141,0.9141,0.9171,0.9201,0.9201,0.9231,0.9261,0.9291,0.9291,0.9321,0.9321,0.9351,0.9381,0.9411,0.9411,0.9441,0.9471,0.9501,0.9501,0.9562,0.9562,0.9562,0.9592,0.9622,0.9622,0.9652,0.9652,0.9682,0.9712,0.9712,0.9742,0.9772,0.9772,0.9772,0.9802,0.9802,0.9802,0.9832,0.9862,0.9862,0.9862,0.9862,0.9862,0.9862,0.9892,0.9892,0.9892,0.9892,0.9922,0.9922,0.9953,0.9953,1.0073,1.0283,1.1215,1.1486,1.1696,1.1787,1.1817,1.1817,1.1817,1.1817,1.1757,1.1727,1.1666,1.1606,1.1546,1.1486,1.1456,1.1396,1.1366,1.1306,1.1276,1.1215,1.1155,1.1095,1.1065,1.1035,1.0975,1.0945,1.0885,1.0855,1.0824,1.0764,1.0704,1.0674,1.0614,1.0554,1.0524,1.0464,1.0434,1.0373,1.0313,1.0283,1.0193,1.0163,1.0103,1.0013,1.0013,1.0013,1.0013,1.0043,1.0103,1.0163,1.0193,1.0253,1.0313,1.0373,1.0434,1.0464,1.0524,1.0584,1.0614,1.0674,1.0704,1.0764,1.0824,1.0855,1.0945,1.0975,1.1035,1.1095,1.1155,1.1215,1.1276,1.1336,1.1366,1.1426,1.1516,1.1576,1.1606,1.1666,1.1727,1.1817,1.1847,1.1877,1.1907,1.1907,1.1907,1.1907,1.1787,1.1666,1.1366,1.0313,1.0073,0.9983,0.9953,0.9953,0.9922,0.9922,0.9892,0.9892,0.9862,0.9862,0.9832,0.9802,0.9802,0.9802,0.9802,0.9802,0.9772,0.9742,0.9742,0.9742,0.9712,0.9712,0.9682,0.9682,0.9652,0.9652,0.9622,0.9592,0.9592,0.9562,0.9562,0.9501,0.9501,0.9501,0.9471,0.9441,0.9411,0.9411,0.9381,0.9381,0.9321,0.9321,0.9291,0.9261];
  function candyAppleRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * RINGOAME_SHAPE_RATIOS[idx];
  }

  const WATAGASHI_SHAPE_RATIOS = [1.0306,1.0306,1.0306,1.0306,1.0282,1.0258,1.0234,1.0186,1.0115,1.0091,1.0019,0.9923,0.9828,0.9756,0.9636,0.9517,0.9517,0.9517,0.9517,0.9541,0.9612,0.966,0.9708,0.978,0.978,0.9804,0.9804,0.9804,0.9804,0.9804,0.9804,0.978,0.9732,0.9732,0.9684,0.9612,0.9565,0.9541,0.9541,0.9541,0.9541,0.9589,0.966,0.9732,0.9756,0.9804,0.9828,0.9852,0.9876,0.9876,0.9876,0.9876,0.9876,0.9876,0.9876,0.9852,0.9852,0.9828,0.978,0.9756,0.9732,0.9708,0.966,0.9612,0.9565,0.9517,0.9469,0.9397,0.9349,0.9254,0.9206,0.911,0.9039,0.8967,0.8943,0.8943,0.8943,0.8943,0.9015,0.9063,0.9063,0.9086,0.9086,0.9134,1.0473,1.2517,1.2985,1.3038,1.3064,1.3069,1.3069,1.3069,1.3069,1.3048,1.3001,1.2654,1.1238,0.9636,0.911,0.911,0.9086,0.9086,0.9039,0.8967,0.8967,0.8967,0.8967,0.8991,0.9063,0.9158,0.923,0.9302,0.9373,0.9445,0.9517,0.9565,0.9612,0.9684,0.9732,0.978,0.9828,0.9828,0.9876,0.9899,0.9923,0.9947,0.9947,0.9947,0.9947,0.9947,0.9947,0.9947,0.9923,0.9923,0.9852,0.9828,0.9804,0.978,0.9684,0.9612,0.9541,0.9541,0.9541,0.9541,0.9589,0.966,0.9708,0.9732,0.9756,0.978,0.9828,0.9828,0.9828,0.9828,0.9828,0.9828,0.9804,0.978,0.9756,0.9732,0.966,0.9612,0.9612,0.9612,0.9612,0.9612,0.9732,0.9804,0.9876,0.9947,1.0019,1.0043,1.0115,1.0139,1.0162,1.0186,1.0234,1.0258,1.0258,1.0282,1.0282,1.0282,1.0282,1.0282,1.0282,1.0282,1.0282,1.0258,1.0234,1.0186,1.0139,1.0067,0.9995,0.9899,0.978,0.978,0.978,0.978,0.9852,0.9876,0.9947,0.9947,0.9947,0.9947,0.9947,0.9923,0.9852,0.9804,0.9732,0.966,0.9589,0.9589,0.9589,0.9589,0.9589,0.9589,0.9541,0.9493,0.9421,0.9421,0.9421,0.9421,0.9421,0.9565,0.9708,0.9804,0.9899,0.9995,1.0043,1.0091,1.0139,1.0186,1.021,1.0234,1.0234,1.0234,1.0234,1.0234,1.0186,1.0186,1.0139,1.0115,1.0067,1.0019,0.9971,0.9899,0.9828,0.9756,0.966,0.9565,0.9565,0.9565,0.9565,0.9565,0.9708,0.9876,0.9995,1.0115,1.0234,1.033,1.0425,1.0521,1.0593,1.0665,1.0712,1.076,1.0832,1.0856,1.0904,1.0928,1.0928,1.0952,1.0952,1.0952,1.0952,1.0952,1.0928,1.0928,1.0904,1.088,1.0832,1.0784,1.0688,1.0641,1.0569,1.0473,1.0378,1.0258,1.0115,1.0019,0.9852,0.9708,0.9565,0.9349,0.9349,0.9349,0.9349,0.9397,0.9541,0.966,0.978,0.9899,0.9971,1.0043,1.0115,1.0162,1.021,1.0234,1.0282,1.0282,1.0282,1.0282,1.0282,1.0258,1.0234,1.0186,1.0115,1.0091,1.0019,0.9971,0.9876,0.978,0.9684,0.9589,0.9469,0.9421,0.9421,0.9421,0.9421,0.9541,0.9636,0.9708,0.9756,0.9804,0.9852,0.9876,0.9899,0.9899,0.9899,0.9899,0.9899,0.9876,0.9852,0.9804,0.9756,0.9756,0.9756,0.9756,0.9876,0.9947,1.0043,1.0139,1.0186,1.0234,1.0258,1.0282,1.0306,1.0306,1.0306,1.0306];
  function cottonCandyRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * WATAGASHI_SHAPE_RATIOS[idx];
  }

  const MIZUFUSEN_SHAPE_RATIOS = [0.9864,0.989,0.989,0.9916,0.9916,0.9941,0.9941,0.9967,0.9967,0.9993,0.9993,0.9993,1.0018,1.0018,1.0044,1.0044,1.0044,1.007,1.007,1.007,1.007,1.007,1.0096,1.0096,1.0096,1.0096,1.0096,1.0096,1.0096,1.0096,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0147,1.0121,1.0121,1.0121,1.0121,1.0121,1.0096,1.0096,1.007,1.007,1.007,1.0044,1.0044,1.0044,1.0044,1.0044,1.0018,1.0018,1.0018,0.9993,0.9993,0.9967,0.9967,0.9941,0.9941,0.9941,0.9941,0.9941,0.9916,0.9916,0.9916,0.989,0.989,0.989,0.989,0.989,0.989,0.989,0.989,0.989,0.9864,0.9864,0.9864,0.9864,0.9864,0.9864,0.989,0.989,0.989,0.989,0.989,0.989,0.989,0.989,0.9916,0.9916,0.9916,0.9916,0.9916,0.9941,0.9941,0.9941,0.9967,0.9967,0.9967,0.9993,0.9993,0.9993,1.0018,1.0018,1.0018,1.0018,1.0018,1.0018,1.0044,1.0044,1.0044,1.0044,1.0044,1.007,1.0096,1.0096,1.0096,1.0096,1.0096,1.0096,1.0096,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0121,1.0096,1.0096,1.0096,1.007,1.007,1.007,1.007,1.0044,1.0044,1.0018,1.0018,0.9993,0.9993,0.9993,0.9993,0.9993,0.9967,0.9941,0.9941,0.9941,0.9916,0.989,0.989,0.9864,0.9864,0.9839,0.9839,0.9839,0.9813,0.9813,0.9787,0.9787,0.9787,0.9762,0.9736,0.971,0.971,0.9685,0.9685,0.9659,0.9659,0.9633,0.9633,0.9607,0.9607,0.9582,0.9582,0.9556,0.9556,0.9556,0.953,0.953,0.9505,0.9505,0.9505,0.9479,0.9479,0.9479,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9479,0.9479,0.9479,0.9479,0.9479,0.9479,0.9505,0.9505,0.953,0.953,0.953,0.9556,0.9582,0.9607,0.9607,0.9607,0.9633,0.9659,0.9685,0.971,0.9762,0.9787,0.9839,0.989,0.9941,0.9993,1.0044,1.0147,1.025,1.0378,1.0481,1.0661,1.0866,1.1072,1.1226,1.1354,1.1457,1.1534,1.156,1.1585,1.1585,1.1585,1.1585,1.1585,1.156,1.1534,1.1457,1.1354,1.1252,1.1097,1.0892,1.0661,1.0481,1.0352,1.0224,1.0147,1.0018,0.9967,0.989,0.9839,0.9787,0.9736,0.971,0.9659,0.9659,0.9633,0.9607,0.9582,0.9556,0.9556,0.953,0.953,0.953,0.9505,0.9505,0.9479,0.9479,0.9479,0.9479,0.9479,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9453,0.9479,0.9479,0.9479,0.9479,0.9479,0.9505,0.9505,0.953,0.953,0.9556,0.9556,0.9556,0.9556,0.9582,0.9582,0.9607,0.9607,0.9633,0.9659,0.9659,0.9659,0.9659,0.9685,0.971,0.971,0.971,0.9736,0.9762,0.9762,0.9762,0.9787,0.9813,0.9813,0.9839,0.9839,0.9864];
  function balloonRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * MIZUFUSEN_SHAPE_RATIOS[idx];
  }

  const KINGYO_SHAPE_RATIOS = [0.925,0.899,0.8788,0.8586,0.8354,0.821,0.8181,0.8123,0.8065,0.7979,0.7834,0.7718,0.7632,0.7632,0.7632,0.7632,0.795,0.8239,0.847,0.873,0.8933,0.9106,0.9279,0.9308,0.9829,1.0494,1.1563,1.1968,1.2055,1.2055,1.2055,1.2055,1.1997,1.1997,1.1997,1.1997,1.2315,1.2669,1.2726,1.2726,1.2726,1.2726,1.2694,1.265,1.258,1.2504,1.2055,1.1708,1.1621,1.1476,1.1303,1.1101,1.084,1.0522,1.0176,0.5435,0.5435,0.5435,0.5435,0.6475,0.7834,0.8007,0.821,0.925,0.9395,0.9482,0.9482,0.9482,0.9482,0.9482,0.9453,0.9453,0.9424,0.9366,0.9279,0.925,0.9164,0.9106,0.9048,0.8933,0.8846,0.8759,0.8701,0.8701,0.8701,0.8701,1.0869,1.1101,1.1274,1.1361,1.1419,1.1419,1.1419,1.1419,1.1419,1.139,1.1361,1.1361,1.1303,1.1274,1.1216,1.1158,1.1101,1.1014,1.0956,1.0898,1.0812,1.0754,1.0667,1.058,1.0494,1.0378,1.0262,1.0147,1.0031,0.9886,0.9771,0.9597,0.9424,0.9308,0.9164,0.9048,0.8961,0.8961,0.8961,0.8961,0.9019,0.9077,0.9135,0.9193,0.925,0.9308,0.9337,0.9395,0.9453,0.9511,0.9568,0.9626,0.9684,0.9742,0.98,0.9829,0.9886,0.9944,1.0002,1.006,1.0118,1.0176,1.0233,1.0262,1.032,1.0378,1.0407,1.0436,1.0494,1.0522,1.058,1.0638,1.0667,1.0696,1.0754,1.0812,1.0869,1.0927,1.0985,1.1043,1.1072,1.1158,1.1187,1.1274,1.1361,1.1679,1.1881,1.1939,1.1939,1.1939,1.1939,1.1939,1.1939,1.1939,1.1968,1.1968,1.1968,1.1968,1.1939,1.1823,1.165,1.1447,1.1187,1.0956,1.0754,1.0609,1.058,1.0494,1.0465,1.0436,1.0378,1.032,1.0262,1.0204,1.0176,1.0118,1.006,1.0002,0.9973,0.9886,0.9829,0.9771,0.9713,0.9626,0.9568,0.9482,0.9424,0.9366,0.9308,0.925,0.9164,0.9106,0.9048,0.899,0.8933,0.8875,0.8788,0.8759,0.873,0.8643,0.8586,0.8586,0.8586,0.8586,0.8586,0.873,0.8817,0.8875,0.899,0.9077,0.9193,0.9279,0.9395,0.9453,0.9568,0.9655,0.9742,0.98,0.9915,1.0031,1.0089,1.0204,1.0262,1.0378,1.0465,1.0551,1.0638,1.0725,1.0812,1.0898,1.0985,1.1072,1.1158,1.1216,1.1303,1.1361,1.1447,1.1505,1.1505,1.1505,1.1505,1.1476,1.1419,1.1245,1.1072,1.0869,1.0522,0.9858,0.98,0.9771,0.9684,0.9626,0.9568,0.9453,0.9395,0.9337,0.925,0.9164,0.9106,0.899,0.8933,0.8846,0.8759,0.8672,0.8586,0.8499,0.8441,0.8325,0.8268,0.8181,0.8094,0.8036,0.7921,0.7834,0.7776,0.7718,0.7603,0.7574,0.7458,0.7371,0.7256,0.714,0.4799,0.477,0.477,0.477,0.477,0.477,0.477,0.477,0.477,0.4799,0.4857,1.0985,1.1621,1.2141,1.2523,1.2618,1.2707,1.2796,1.286,1.2917,1.2917,1.2917,1.2917,1.2885,1.2841,1.279,1.2707,1.265,1.2637,1.2637,1.2625,1.2593,1.2555,1.2504,1.2315,1.2228,1.2112,1.1968,1.1794,1.1621,1.139,1.1129,1.0869,1.0494,1.0436,1.0378,1.0262,1.0118,0.9973,0.98,0.9597,0.9395];
  function goldfishRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * KINGYO_SHAPE_RATIOS[idx];
  }

  const FURIN_SHAPE_RATIOS = [1.0783,1.0783,1.0826,1.0826,1.0868,1.0868,1.0868,1.091,1.091,1.0952,1.0952,1.0995,1.0995,1.0995,1.0995,1.1037,1.1037,1.1037,1.1037,1.1037,1.0995,1.0995,1.0995,1.0995,1.0952,1.0952,1.0952,1.091,1.091,1.091,1.091,1.091,1.091,1.091,1.091,1.0952,1.0952,1.0952,1.0952,1.0952,1.0868,1.0741,1.0656,1.0614,1.0445,1.0403,1.0276,1.0191,1.0107,1.0022,0.9938,0.9853,0.9768,0.9684,0.9599,0.9557,0.9472,0.943,0.9345,0.9303,0.9219,0.9176,0.9134,0.9049,0.9007,0.8965,0.8923,0.888,0.8838,0.8796,0.8753,0.8753,0.8711,0.8669,0.8669,0.8627,0.8584,0.8584,0.8542,0.85,0.85,0.85,0.85,0.85,0.8457,0.8457,0.8457,0.85,1.6067,1.643,1.6597,1.6597,1.6597,1.6597,1.6579,1.6569,0.8542,0.8542,0.8542,0.8542,0.8584,0.8584,0.8584,0.8627,0.8669,0.8711,0.8711,0.8753,0.8796,0.8838,0.8838,0.8923,0.8965,0.9007,0.9049,0.9134,0.9176,0.9261,0.9261,0.9388,0.943,0.9472,0.9557,0.9599,0.9684,0.9726,0.9853,0.9938,1.0022,1.0107,1.0149,1.0234,1.036,1.0445,1.053,1.0656,1.0699,1.0783,1.0868,1.0952,1.0952,1.0952,1.0952,1.0952,1.0868,1.0741,1.0741,1.0741,1.0741,1.0741,1.0741,1.0783,1.0783,1.0783,1.0783,1.0783,1.0783,1.0783,1.0783,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0826,1.0783,1.0783,1.0783,1.0741,1.0741,1.0741,1.0741,1.0699,1.0699,1.0699,1.0656,1.0656,1.0614,1.0614,1.0572,1.0572,1.0572,1.0572,1.0487,1.0487,1.0487,1.0445,1.0445,1.0403,1.036,1.036,1.036,1.0318,1.0276,1.0234,1.0234,1.0191,1.0149,1.0149,1.0149,1.0107,1.0064,1.0064,1.0022,0.998,0.998,0.9938,0.9938,0.9895,0.9895,0.9853,0.9853,0.9811,0.9811,0.9768,0.9768,0.9768,0.9726,0.9684,0.9684,0.9642,0.9642,0.9599,0.9557,0.9557,0.9515,0.9515,0.9515,0.9515,0.9472,0.9472,0.943,0.943,0.943,0.9388,0.9388,0.9345,0.9345,0.9345,0.9303,0.9303,0.9303,0.9261,0.9261,0.9261,0.9261,0.9261,0.9219,0.9219,0.9219,0.9219,0.9219,0.9219,0.9557,0.9768,1.1122,1.1418,1.1587,1.1587,1.1587,1.1587,1.146,1.1164,0.9768,0.9515,0.9219,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9176,0.9219,0.9219,0.9219,0.9219,0.9219,0.9219,0.9261,0.9261,0.9261,0.9303,0.9303,0.9303,0.9303,0.9345,0.9345,0.9388,0.9388,0.9388,0.9472,0.9472,0.9472,0.9515,0.9515,0.9557,0.9557,0.9557,0.9599,0.9642,0.9642,0.9642,0.9684,0.9726,0.9726,0.9768,0.9768,0.9853,0.9853,0.9853,0.9895,0.9938,0.9938,0.998,1.0022,1.0022,1.0064,1.0064,1.0107,1.0107,1.0149,1.0191,1.0234,1.0234,1.0276,1.0276,1.0318,1.0318,1.036,1.0403,1.0403,1.0445,1.0445,1.0487,1.0487,1.053,1.0572,1.0572,1.0572,1.0614,1.0614,1.0656,1.0699,1.0699,1.0699,1.0741];
  function furinRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * FURIN_SHAPE_RATIOS[idx];
  }

  // ---- difficulty mode: EASY (line-tracing, forgiving both ways) /
  // NORMAL (line-tracing, safe line sits exactly on the mold's outer edge —
  // any dip inside is instant out) / HARD (free scraping, no snap at all).
  const MODE_STORAGE_KEY = 'kok_game_mode_v2';
  let gameMode = 'normal';
  try{
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if(saved === 'easy' || saved === 'normal' || saved === 'hard') gameMode = saved;
  }catch(e){}
  function setGameMode(v){
    gameMode = v;
    try{ localStorage.setItem(MODE_STORAGE_KEY, v); }catch(e){}
  }

  const CLEAR_STORAGE_KEY = 'kok_cleared_stages_v1';
  function loadClearedStages(){
    try{
      const raw = localStorage.getItem(CLEAR_STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    }catch(e){ return new Set(); }
  }
  function markStageCleared(key){
    try{
      const set = loadClearedStages();
      if(set.has(key)) return false; // already recorded, nothing changed
      set.add(key);
      localStorage.setItem(CLEAR_STORAGE_KEY, JSON.stringify([...set]));
      return true;
    }catch(e){ return false; }
  }


  // ---- developer mode (BUILD 76) ----
  // Prototype-only preview switches. These never write fake clear records,
  // ranking times, album entries, XP, or achievements.
  const DEV_SETTINGS_STORAGE_KEY = 'kok_dev_settings_v1';
  function loadDevSettings(){
    try{
      const raw = localStorage.getItem(DEV_SETTINGS_STORAGE_KEY);
      return raw ? Object.assign({ unlockAll:false, festivalFrame:false, starTip:false }, JSON.parse(raw))
        : { unlockAll:false, festivalFrame:false, starTip:false };
    }catch(e){ return { unlockAll:false, festivalFrame:false, starTip:false }; }
  }
  let devSettings = loadDevSettings();
  function saveDevSettings(){
    try{ localStorage.setItem(DEV_SETTINGS_STORAGE_KEY, JSON.stringify(devSettings)); }catch(e){}
  }
  function devToast(message){
    const t = document.createElement('div');
    t.className = 'kokToast';
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 1800);
  }

  // ---- stage unlock progression (BUILD 67) ----
  // EASY keeps its current route: stages 1-5 start open, then stages 6-10
  // unlock one by one. Clearing all 10 EASY stages opens every NORMAL stage.
  // Clearing all 10 NORMAL stages then opens every HARD stage.
  const EASY_INITIAL_UNLOCK_COUNT = 5; // 日の丸〜提灯
  function regularStages(){ return STAGES.filter(stage => !stage.secret); }
  function hasClearedAllStages(modeKey){
    const album = loadAlbum(modeKey);
    return regularStages().every(stage => !!album[stage.key]);
  }
  function isStageUnlocked(stageIndex, modeKey){
    const m = modeKey || gameMode;
    if(devSettings.unlockAll) return stageIndex >= 0 && stageIndex < STAGES.length;
    if(stageIndex < 0 || stageIndex >= STAGES.length) return false;
    const stage = STAGES[stageIndex];
    if(stage && stage.secret){
      return m === 'hard' && allModesAllStagesCleared();
    }
    if(m === 'easy'){
      if(stageIndex < EASY_INITIAL_UNLOCK_COUNT) return true;
      const easyAlbum = loadAlbum('easy');
      const prev = STAGES[stageIndex - 1];
      return !!(prev && easyAlbum[prev.key]);
    }
    if(m === 'normal') return hasClearedAllStages('easy');
    if(m === 'hard') return hasClearedAllStages('normal');
    return false;
  }
  function unlockMessage(stageIndex, modeKey){
    const m = modeKey || gameMode;
    const stage = STAGES[stageIndex];
    if(stage && stage.secret) return '全30ステージ制覇で解放';
    if(m === 'easy') return '前のEASYステージをクリアで解放';
    if(m === 'normal') return 'EASY全10ステージクリアで解放';
    return 'NORMAL全10ステージクリアで解放';
  }
  function findNextUnlockedStageIndex(fromIndex, modeKey){
    for(let step = 1; step <= STAGES.length; step++){
      const idx = (fromIndex + step) % STAGES.length;
      if(isStageUnlocked(idx, modeKey)) return idx;
    }
    return -1;
  }
  function allModesAllStagesCleared(){
    return ['easy','normal','hard'].every(m => {
      const album = loadAlbum(m);
      return regularStages().every(s => !!album[s.key]);
    });
  }

  // ---- needle-tip rewards ----
  // The hit test always remains a single center point. Skins change only
  // the visible marker, so rewards never alter difficulty or fairness.
  const TIP_SKIN_STORAGE_KEY = 'kok_tip_skin_v1';
  const TIP_REWARD_STORAGE_KEY = 'kok_tip_rewards_v1';
  function loadTipRewards(){
    try{
      const raw = localStorage.getItem(TIP_REWARD_STORAGE_KEY);
      return raw ? Object.assign({ star:false }, JSON.parse(raw)) : { star:false };
    }catch(e){ return { star:false }; }
  }
  let tipRewards = loadTipRewards();
  let selectedTipSkin = 'circle';
  try{
    const savedTip = localStorage.getItem(TIP_SKIN_STORAGE_KEY);
    if(savedTip === 'star' && tipRewards.star) selectedTipSkin = 'star';
  }catch(e){}
  function saveTipRewardState(){
    try{
      localStorage.setItem(TIP_REWARD_STORAGE_KEY, JSON.stringify(tipRewards));
      localStorage.setItem(TIP_SKIN_STORAGE_KEY, selectedTipSkin);
    }catch(e){}
  }
  function syncTipRewardsFromProgress(){
    if(hasClearedAllStages('normal') && !tipRewards.star){
      tipRewards.star = true;
      selectedTipSkin = 'star';
      saveTipRewardState();
      return true;
    }
    return false;
  }
  function showStarTipRewardToast(){
    const t = document.createElement('div');
    t.className = 'kokToast kokRecordToast';
    t.innerHTML = '<div class="recordTitle">NORMAL COMPLETE</div>' +
      '<div style="font-size:34px;line-height:1.2;margin:6px 0;color:#ffd23f;text-shadow:0 0 14px rgba(255,210,63,.75)">★</div>' +
      '<div class="recordTime" style="font-size:17px">星の針先を獲得</div>' +
      '<div class="recordSub">自動で装備しました</div>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 4300);
  }
  // ---- HARD clear reward: festival album frame ----
  // Once every HARD stage is cleared, this cosmetic frame is applied to
  // every saved album work across EASY, NORMAL and HARD. The original
  // screenshots stay untouched; the frame is layered in the album UI.
  const ALBUM_FRAME_REWARD_STORAGE_KEY = 'kok_album_frame_rewards_v1';
  const HARD_ALBUM_FRAME_SRC = 'data:image/webp;base64,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';
  function loadAlbumFrameRewards(){
    try{
      const raw = localStorage.getItem(ALBUM_FRAME_REWARD_STORAGE_KEY);
      return raw ? Object.assign({ festival:false }, JSON.parse(raw)) : { festival:false };
    }catch(e){ return { festival:false }; }
  }
  let albumFrameRewards = loadAlbumFrameRewards();
  function saveAlbumFrameRewards(){
    try{ localStorage.setItem(ALBUM_FRAME_REWARD_STORAGE_KEY, JSON.stringify(albumFrameRewards)); }catch(e){}
  }
  function syncAlbumFrameRewardFromProgress(){
    if(hasClearedAllStages('hard') && !albumFrameRewards.festival){
      albumFrameRewards.festival = true;
      saveAlbumFrameRewards();
      return true;
    }
    return false;
  }
  function hasFestivalAlbumFrame(){ return !!albumFrameRewards.festival || !!devSettings.festivalFrame; }
  function albumPhotoMarkup(rec, stage, detail){
    const noPhoto = detail
      ? `<div class="albumPhotoBase albumNoPhotoBig" style="background:rgba(${stage.fill},0.35)">写真は保存容量の都合で<br>今回は残せませんでした</div>`
      : `<span class="albumPhotoBase albumNoPhoto" style="background:rgba(${stage.fill},0.35)">記録のみ</span>`;
    const base = rec.image
      ? `<img class="albumPhotoBase" src="${rec.image}" alt="${rec.name || stage.name}">`
      : noPhoto;
    const framed = hasFestivalAlbumFrame();
    return `<div class="albumPhotoWrap${detail ? ' detail' : ''}${framed ? ' hardFrameEquipped' : ''}">` +
      base +
      (framed ? `<img class="hardAlbumFrame" src="${HARD_ALBUM_FRAME_SRC}" alt="" aria-hidden="true">` : '') +
      `</div>`;
  }
  function showHardAlbumFrameRewardToast(){
    const t = document.createElement('div');
    t.className = 'kokToast kokRecordToast hardFrameRewardToast';
    t.innerHTML = '<div class="recordTitle">HARD COMPLETE</div>' +
      '<div style="font-size:30px;line-height:1.2;margin:7px 0;color:#ffcf70;text-shadow:0 0 16px rgba(255,150,40,.8)">▣</div>' +
      '<div class="recordTime" style="font-size:17px">夜祭りの豪華額を獲得</div>' +
      '<div class="recordSub">アルバムの全作品に装着しました</div>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 4700);
  }

  function drawTipMarker(x, y, radius, color){
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    if(selectedTipSkin === 'star' && (tipRewards.star || devSettings.starTip)){
      const outer = radius * 1.35;
      const inner = outer * 0.46;
      ctx.beginPath();
      for(let i = 0; i < 10; i++){
        const a = -Math.PI/2 + i * Math.PI/5;
        const r = i % 2 === 0 ? outer : inner;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = Math.max(1, radius * 0.16);
      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.stroke();
    }else{
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- プレイヤープロフィール: level, XP, titles, lifetime stats.
  // Separate localStorage key — existing clear/album/mode data is untouched.
  const PROFILE_STORAGE_KEY = 'kok_profile_v1';
  const DEFAULT_PROFILE = {
    name: 'ななしの型抜き職人',
    level: 1,
    xp: 0,
    totalPlays: 0,
    totalClears: 0,
    totalFails: 0,
    excellentCount: 0,
    noBreakCount: 0,
    perfectCount: 0,
    fastestTime: null,
    selectedTitle: null, // null = auto (level-based); reserved for future manual titles
    grandRewardUnlocked: false
  };
  function loadProfile(){
    try{
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      return Object.assign({}, DEFAULT_PROFILE, saved); // fills in any missing fields safely
    }catch(e){ return Object.assign({}, DEFAULT_PROFILE); }
  }
  let profile = loadProfile();
  function saveProfile(){
    try{ localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile)); }catch(e){}
  }

  // 称号テーブル: level -> title. Event/achievement titles can be appended
  // to this same array later (e.g. {minLevel:0,maxLevel:999,name:'...',
  // requires:'someFlag'}) without changing how titleForLevel() is called.
  const TITLES = [
    { minLevel: 1,  maxLevel: 4,        name: '型抜き見習い' },
    { minLevel: 5,  maxLevel: 9,        name: '駄菓子屋の常連' },
    { minLevel: 10, maxLevel: 19,       name: '飴削り職人' },
    { minLevel: 20, maxLevel: 29,       name: '縁日の名人' },
    { minLevel: 30, maxLevel: 49,       name: '型抜き王' },
    { minLevel: 50, maxLevel: Infinity, name: 'KING OF KATANUKI' }
  ];
  function titleForLevel(lv){
    const t = TITLES.find(t => lv >= t.minLevel && lv <= t.maxLevel);
    return t ? t.name : TITLES[0].name;
  }
  function currentTitle(){
    return profile.selectedTitle || titleForLevel(profile.level);
  }

  // 必要経験値: flat 100 for now. Swap this one function out later (e.g. a
  // per-level table, or lv*80+50) without touching anything that calls it.
  function xpNeededForLevel(lv){ return 100; }
  function addXP(amount){
    profile.xp += amount;
    let leveledUp = false;
    while(profile.xp >= xpNeededForLevel(profile.level)){
      profile.xp -= xpNeededForLevel(profile.level);
      profile.level++;
      leveledUp = true;
    }
    saveProfile();
    return leveledUp;
  }

  // 仮の「Perfect」判定用しきい値(難易度ベース)。実際のベンチマークが
  // 取れたら差し替えやすいよう、1関数にまとめてある。
  function perfectTimeThreshold(stage){
    return 12 + stage.difficulty * 6; // seconds — placeholder, easy to retune
  }

  // ---- ランキング(試作・仮データ) ----------------------------------------
  // getRankingData() is the ONLY function that needs to change when this
  // moves to a real backend (Supabase/Firebase/etc). renderRanking() just
  // displays whatever array it's given — it never generates data itself.
  const RANKING_NAME_POOL = [
    '祭りの達人','飴職人タケ','金魚すくい王','型抜き小僧','夏祭りハナ',
    'KATANUKI_7','縁日の記憶','りんご飴','提灯マスター','夜店の主',
    '風鈴ガール','わたがし部長','屋台の帝王','宵宮太郎','花火師ミサキ',
    'ゆかたの少女','的屋の息子','金魚姫','おこづかい500円','夏の夜風',
    '型抜き二段','浴衣コレクター','縁側のねこ','夜市の案内人','飴細工師',
    'たません党','射的名人','輪投げ王子','おまつり係長','KATANUKI_MASTER'
  ];
  const rankingCache = {}; // 'stageKey_mode' -> sorted [{name,time,isPlayer?}]
  function seededRandom(seed){
    let s = seed % 2147483647; if(s <= 0) s += 2147483646;
    return function(){ s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
  }
  function hashSeed(str){
    let h = 0;
    for(let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }
  function generateDummyRanking(stageKey, modeKey){
    const stage = STAGES.find(s => s.key === stageKey);
    const modeFactor = modeKey === 'easy' ? 1.3 : modeKey === 'hard' ? 0.85 : 1;
    const baseline = perfectTimeThreshold(stage) * modeFactor;
    const rnd = seededRandom(hashSeed(stageKey + '_' + modeKey));
    const shuffled = RANKING_NAME_POOL
      .map(n => ({ n, r: rnd() }))
      .sort((a, b) => a.r - b.r)
      .slice(0, 26)
      .map(x => x.n);
    const entries = shuffled.map(name => ({
      name, time: +(baseline * (0.6 + rnd() * 0.9)).toFixed(2)
    }));
    entries.sort((a, b) => a.time - b.time);
    return entries;
  }
  // period is accepted but currently ignored (demo data doesn't change by
  // day/week) — kept in the signature so a real backend can filter by it
  // without callers needing to change.
  function getRankingData(stageKey, modeKey, period){
    const cacheKey = stageKey + '_' + modeKey;
    if(!rankingCache[cacheKey]) rankingCache[cacheKey] = generateDummyRanking(stageKey, modeKey);
    return rankingCache[cacheKey];
  }
  function setPlayerRankingEntry(stageKey, modeKey, time){
    const cacheKey = stageKey + '_' + modeKey;
    const data = getRankingData(stageKey, modeKey).filter(e => !e.isPlayer);
    data.push({ name: profile.name, time: +time.toFixed(2), isPlayer: true });
    data.sort((a, b) => a.time - b.time);
    rankingCache[cacheKey] = data;
  }
  function rankForTime(stageKey, modeKey, time){
    const data = getRankingData(stageKey, modeKey).filter(e => !e.isPlayer);
    let rank = 1;
    for(const e of data) if(e.time < time) rank++;
    return rank;
  }

  // ---- 作品アルバム (My Page): one keepsake photo per stage, kept in the
  // browser via localStorage. Not a scoreboard — a small collection of
  // "this came out nicely" moments the player can look back on. Kept
  // separate per difficulty mode, since an EASY clear and a HARD clear of
  // the same stage are very different achievements.
  const ALBUM_STORAGE_PREFIX = 'kok_album_v1_';
  function loadAlbum(m){
    try{
      const raw = localStorage.getItem(ALBUM_STORAGE_PREFIX + (m || gameMode));
      return raw ? JSON.parse(raw) : {};
    }catch(e){ return {}; }
  }
  function gradeForRun(fails, oneStroke, isPerfect){
    if(fails === 0 && oneStroke && isPerfect){
      return { label: 'Excellent Clear', cls: 'excellent' };
    }
    if(fails === 0){
      return { label: 'No Break Clear', cls: 'perfect' };
    }
    if(fails <= 2){
      return { label: 'Perfect Clear', cls: 'perfect' };
    }
    return { label: 'Clear', cls: 'clear' };
  }
  function captureThumbnail(){
    try{
      const THUMB = 240;
      const off = document.createElement('canvas');
      off.width = THUMB; off.height = THUMB;
      const octx = off.getContext('2d');
      octx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, THUMB, THUMB);
      return off.toDataURL('image/jpeg', 0.55);
    }catch(e){
      // A tainted canvas (or any other snapshot hiccup) must never take the
      // rest of the save down with it — the record still needs to count.
      return null;
    }
  }
  // Tries to persist the album as-is; if the browser's storage quota is
  // full, it never lets the numeric record (time/grade) get lost — first
  // it drops this save's own photo, then it starts freeing space by
  // dropping the oldest photos already stored, retrying each time.
  function writeAlbumWithFallback(modeKey, album, justSavedKey){
    const storageKey = ALBUM_STORAGE_PREFIX + modeKey;
    try{
      localStorage.setItem(storageKey, JSON.stringify(album));
      return;
    }catch(e){ /* likely QuotaExceededError — fall through and free space */ }

    // This is a photo album first — the photo just taken is worth more than
    // an old stat line, so free space by dropping other entries' photos
    // (oldest first), not this one, before ever touching the new photo.
    const byDateOldestFirst = Object.keys(album)
      .filter(k => k !== justSavedKey && album[k].image)
      .sort((a, b) => new Date(album[a].date) - new Date(album[b].date));
    for(const k of byDateOldestFirst){
      album[k].image = null;
      try{
        localStorage.setItem(storageKey, JSON.stringify(album));
        return;
      }catch(e){ /* keep freeing space */ }
    }

    // Every other photo in this mode's album is already gone and it still
    // doesn't fit — only now give up on this one photo, keeping its numbers.
    if(album[justSavedKey]) album[justSavedKey].image = null;
    try{
      localStorage.setItem(storageKey, JSON.stringify(album));
      return;
    }catch(e){ /* truly out of room — the record stays in memory for this session at least */ }
  }

  function saveToAlbum(){
    const stage = STAGES[currentStageIndex];
    const hadStarTipBeforeSave = tipRewards.star;
    const hadHardFrameBeforeSave = hasFestivalAlbumFrame();
    const noBreak = sessionFailCount === 0;
    const oneStroke = strokeReleaseCount <= 1;
    const isPerfect = elapsed <= perfectTimeThreshold(stage);
    const isExcellent = noBreak && oneStroke && isPerfect;
    const grade = gradeForRun(sessionFailCount, oneStroke, isPerfect);

    try{
      profile.totalClears++;
      let xpGain = 20;
      if(noBreak){ profile.noBreakCount++; xpGain += 30; }
      if(isPerfect){ profile.perfectCount++; xpGain += 50; }
      if(isExcellent){ profile.excellentCount++; xpGain += 20; }
      if(profile.fastestTime === null || elapsed < profile.fastestTime) profile.fastestTime = elapsed;
      addXP(xpGain);
    }catch(e){ /* stats are best-effort — never let this block the album save below */ }

    let record = null, isNewRecord = false, prevTime = null;
    try{
      const snapshot = captureThumbnail();
      const album = loadAlbum(gameMode);
      const prevRecord = album[stage.key];
      isNewRecord = !prevRecord || elapsed < prevRecord.time;
      prevTime = prevRecord ? prevRecord.time : null;

      record = {
        key: stage.key, name: stage.name,
        image: snapshot || (prevRecord ? prevRecord.image : null), // keep the old photo rather than lose the record
        grade: grade.label, gradeCls: grade.cls,
        difficulty: stage.difficulty,
        time: elapsed,
        date: new Date().toISOString(),
        fails: sessionFailCount,
        oneStroke: oneStroke,
        releaseCount: strokeReleaseCount
      };
      album[stage.key] = record;
      writeAlbumWithFallback(gameMode, album, stage.key);
      if(gameMode === 'normal' && syncTipRewardsFromProgress() && !hadStarTipBeforeSave){
        setTimeout(showStarTipRewardToast, 500);
      }
      if(gameMode === 'hard' && syncAlbumFrameRewardFromProgress() && !hadHardFrameBeforeSave){
        setTimeout(showHardAlbumFrameRewardToast, 650);
      }
    }catch(e){
      showDebugToast('album save failed: ' + (e && e.message ? e.message : e));
      return;
    }

    try{
      if(isNewRecord){
        const rankBefore = prevTime !== null ? rankForTime(stage.key, gameMode, prevTime) : null;
        setPlayerRankingEntry(stage.key, gameMode, elapsed);
        const rankAfter = rankForTime(stage.key, gameMode, elapsed);
        showNewRecordToast(prevTime, elapsed, rankBefore, rankAfter);
      } else {
        showSavedToast();
      }
    }catch(e){ showDebugToast('ranking update failed: ' + (e && e.message ? e.message : e)); }

    try{
      renderAlbumGrid();
      refreshAlbumButton();
      refreshMyPage();
      if(allModesAllStagesCleared() && !profile.grandRewardUnlocked){
        profile.grandRewardUnlocked = true;
        saveProfile();
        showGrandRewardToast();
      }
    }catch(e){ showDebugToast('screen refresh failed: ' + (e && e.message ? e.message : e)); }
  }
  // Temporary diagnostic toast — shows the real error message on screen so
  // a silent failure can actually be screenshotted and fixed, instead of
  // just disappearing. Safe to remove once everything's confirmed solid.
  function showDebugToast(msg){
    const t = document.createElement('div');
    t.className = 'kokToast show';
    t.style.cssText += 'bottom:22%; background:rgba(120,20,20,0.95); max-width:88vw; white-space:normal; text-align:left;';
    t.textContent = '⚠ ' + msg;
    document.body.appendChild(t);
    setTimeout(() => { t.remove(); }, 8000);
  }
  function showSavedToast(){
    const t = document.createElement('div');
    t.className = 'kokToast';
    t.textContent = 'アルバムに保存しました';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2200);
  }

  function showGrandRewardToast(){
    const t = document.createElement('div');
    t.className = 'kokToast kokRecordToast';
    t.innerHTML = '<div class="recordTitle">ALL COMPLETE</div>' +
      '<div class="recordTime">豪華報酬 解放</div>' +
      '<div class="recordSub">EASY・NORMAL・HARD 全ステージ制覇</div>';
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 4200);
  }
  function showNewRecordToast(prevTime, newTime, rankBefore, rankAfter){
    const t = document.createElement('div');
    t.className = 'kokToast kokRecordToast';
    const diff = prevTime !== null ? (prevTime - newTime).toFixed(2) : null;
    let html = '<div class="recordTitle">NEW RECORD</div>' +
      '<div class="recordTime">' + newTime.toFixed(2) + 's</div>';
    if(prevTime !== null){
      html += '<div class="recordSub">前回記録 ' + prevTime.toFixed(2) + 's ／ ' + diff + '秒更新</div>';
    }
    if(rankBefore !== null && rankAfter !== null && rankBefore !== rankAfter){
      html += '<div class="recordSub">ランキング ' + rankBefore + '位 → ' + rankAfter + '位</div>';
    } else if(rankAfter !== null){
      html += '<div class="recordSub">ランキング ' + rankAfter + '位</div>';
    }
    t.innerHTML = html;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 3200);
  }

  // ---- album screen (built once, toggled with .hidden like the other overlays) ----
  let albumScreen, albumGrid, albumDetail, albumTabsEl;
  let rankingScreen, myPageScreen, navBar;
  let tutorialScreen, tutorialStep = 0;
  let albumViewMode = 'normal';
  const MODE_LABELS = { easy:'EASY', normal:'NORMAL', hard:'HARD' };
  function buildAlbumScreen(){
    albumScreen = document.createElement('div');
    albumScreen.className = 'overlay hidden';
    albumScreen.id = 'albumScreen';
    albumScreen.innerHTML = `
      <div class="albumHeader">
        <span class="stageLabel">作品アルバム</span>
        <button class="albumCloseBtn" id="albumCloseBtn">閉じる</button>
      </div>
      <div class="modeToggleWrap" id="albumTabs"></div>
      <div class="albumGrid" id="albumGrid"></div>
    `;
    document.getElementById('stage').appendChild(albumScreen);

    albumDetail = document.createElement('div');
    albumDetail.className = 'overlay hidden';
    albumDetail.id = 'albumDetail';
    document.getElementById('stage').appendChild(albumDetail);

    albumGrid = document.getElementById('albumGrid');
    albumTabsEl = document.getElementById('albumTabs');
    ['easy','normal','hard'].forEach(m => {
      const b = document.createElement('button');
      b.className = 'modeBtn';
      b.textContent = MODE_LABELS[m];
      b.dataset.mode = m;
      b.addEventListener('click', () => {
        albumViewMode = m;
        renderAlbumGrid();
      });
      albumTabsEl.appendChild(b);
    });
    document.getElementById('albumCloseBtn').addEventListener('click', () => {
      albumScreen.classList.add('hidden');
      showScreen(titleScreen);
    });
  }
  function renderAlbumGrid(){
    if(!albumGrid) return;
    albumTabsEl.querySelectorAll('.modeBtn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === albumViewMode);
    });
    const album = loadAlbum(albumViewMode);
    albumGrid.innerHTML = '';
    STAGES.forEach(s => {
      if(s.secret && albumViewMode !== 'hard') return;
      const rec = album[s.key];
      const card = document.createElement('button');
      card.className = 'albumCard' + (rec ? '' : ' locked');
      if(rec){
        const photo = albumPhotoMarkup(rec, s, false);
        card.innerHTML = `${photo}
          <span class="albumCardName">${s.name}</span>
          <span class="albumCardGrade ${rec.gradeCls}">${rec.grade}</span>`;
        card.addEventListener('click', () => openAlbumDetail(rec, s));
      } else {
        card.innerHTML = `<span class="albumLockedIcon"><span class="lockShackle"></span><span class="lockBody"></span></span>
          <span class="albumCardName">${s.name}</span>
          <span class="albumCardGrade">未クリア</span>`;
      }
      albumGrid.appendChild(card);
    });
  }
  function openAlbumDetail(rec, stage){
    const stars = '★'.repeat(stage.difficulty) + '☆'.repeat(5 - stage.difficulty);
    const d = new Date(rec.date);
    const dateStr = d.getFullYear() + '/' + (d.getMonth()+1) + '/' + d.getDate() + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    const photo = albumPhotoMarkup(rec, stage, true);
    albumDetail.innerHTML = `
      <button class="albumCloseBtn albumDetailClose" id="albumDetailClose">閉じる</button>
      ${photo}
      <div class="albumDetailInfo">
        <div class="albumDetailName">${rec.name}</div>
        <div class="albumCardGrade big ${rec.gradeCls}">${rec.grade}</div>
        <div class="albumDetailStars">${stars}</div>
        <div class="albumDetailRow">クリアタイム: ${rec.time.toFixed(2)}s</div>
        <div class="albumDetailRow">${dateStr}</div>
        <div class="albumTitlesRow">称号 — 今後追加予定</div>
      </div>
    `;
    document.getElementById('albumDetailClose').addEventListener('click', () => {
      albumDetail.classList.add('hidden');
    });
    albumDetail.classList.remove('hidden');
  }

  // ---- ランキング画面 ----
  let rankingStageKey = null; // defaults to the first stage once STAGES exists
  let rankingModeKey = 'normal';
  let rankingPeriod = 'alltime';
  function buildRankingScreen(){
    rankingScreen = document.createElement('div');
    rankingScreen.className = 'overlay hidden';
    rankingScreen.id = 'rankingScreen';
    rankingScreen.innerHTML = `
      <div class="albumHeader">
        <span class="stageLabel">全国ランキング <span class="demoTag">DEMO RANKING</span></span>
      </div>
      <div class="modeToggleWrap" id="rankPeriodTabs">
        <button class="modeBtn" data-p="today">今日</button>
        <button class="modeBtn" data-p="week">今週</button>
        <button class="modeBtn" data-p="alltime">歴代</button>
        <button class="modeBtn" data-p="me">自分</button>
      </div>
      <div class="rankStageRow" id="rankStageRow"></div>
      <div class="modeToggleWrap" id="rankModeTabs">
        <button class="modeBtn" data-mode="easy">EASY</button>
        <button class="modeBtn" data-mode="normal">NORMAL</button>
        <button class="modeBtn" data-mode="hard">HARD</button>
      </div>
      <div class="rankList" id="rankList"></div>
      <div class="rankMeBar" id="rankMeBar"></div>
    `;
    document.getElementById('stage').appendChild(rankingScreen);

    const stageRow = rankingScreen.querySelector('#rankStageRow');
    STAGES.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'rankStageChip';
      chip.textContent = s.name;
      chip.dataset.key = s.key;
      chip.addEventListener('click', () => { rankingStageKey = s.key; renderRanking(); });
      stageRow.appendChild(chip);
    });
    rankingScreen.querySelectorAll('#rankPeriodTabs .modeBtn').forEach(b => {
      b.addEventListener('click', () => { rankingPeriod = b.dataset.p; renderRanking(); });
    });
    rankingScreen.querySelectorAll('#rankModeTabs .modeBtn').forEach(b => {
      b.addEventListener('click', () => { rankingModeKey = b.dataset.mode; renderRanking(); });
    });
    rankingStageKey = STAGES[currentStageIndex] ? STAGES[currentStageIndex].key : STAGES[0].key;
    rankingModeKey = gameMode;
  }
  // renderRanking() only ever reads from getRankingData() — swapping that
  // function out for a real API call later needs no changes here.
  function renderRanking(){
    if(!rankingScreen) return;
    rankingScreen.querySelectorAll('#rankPeriodTabs .modeBtn').forEach(b =>
      b.classList.toggle('active', b.dataset.p === rankingPeriod));
    rankingScreen.querySelectorAll('#rankModeTabs .modeBtn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === rankingModeKey));
    rankingScreen.querySelectorAll('.rankStageChip').forEach(c =>
      c.classList.toggle('active', c.dataset.key === rankingStageKey));

    const list = rankingScreen.querySelector('#rankList');
    const meBar = rankingScreen.querySelector('#rankMeBar');
    list.innerHTML = '';

    if(rankingPeriod === 'me'){
      list.classList.add('meMode');
      STAGES.forEach(s => {
        const data = getRankingData(s.key, rankingModeKey, rankingPeriod);
        const mine = data.find(e => e.isPlayer);
        const row = document.createElement('div');
        row.className = 'rankRow';
        row.innerHTML = `<span class="rankPos">${s.name}</span>
          <span class="rankName">${mine ? currentTitle() : '未挑戦'}</span>
          <span class="rankTime">${mine ? mine.time.toFixed(2) + 's' : '--'}</span>`;
        list.appendChild(row);
      });
      meBar.innerHTML = '';
      return;
    }
    list.classList.remove('meMode');

    const data = getRankingData(rankingStageKey, rankingModeKey, rankingPeriod);
    data.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'rankRow' + (e.isPlayer ? ' isMe' : '');
      row.innerHTML = `<span class="rankPos">${i+1}位</span>
        <span class="rankName">${e.name}</span>
        <span class="rankTime">${e.time.toFixed(2)}s</span>`;
      list.appendChild(row);
    });

    const mine = data.find(e => e.isPlayer);
    if(mine){
      const idx = data.indexOf(mine);
      const next = idx > 0 ? data[idx-1] : null;
      const gap = next ? (mine.time - next.time).toFixed(2) : '0.00';
      meBar.innerHTML =
        '<div>あなたの順位 <b>' + (idx+1) + '位</b></div>' +
        '<div>あなたの記録 <b>' + mine.time.toFixed(2) + 's</b></div>' +
        (next ? '<div>次の順位まで あと <b>' + gap + 's</b></div>' : '<div>堂々の1位です</div>');
    } else {
      meBar.innerHTML = '<div>このステージ・モードはまだ記録がありません</div>';
    }
  }

  // ---- マイページ ----
  function buildMyPageScreen(){
    myPageScreen = document.createElement('div');
    myPageScreen.className = 'overlay hidden';
    myPageScreen.id = 'myPageScreen';
    myPageScreen.innerHTML = `
      <div class="mpNameRow">
        <input class="mpNameInput" id="mpNameInput" maxlength="12" value="">
      </div>
      <div class="mpTitle" id="mpTitleText"></div>
      <div class="mpLevelRow">
        <span id="mpLevelText"></span>
        <div class="mpXpTrack"><div class="mpXpFill" id="mpXpFill"></div></div>
        <span class="mpXpText" id="mpXpText"></span>
      </div>
      <div class="mpStatsGrid" id="mpStatsGrid"></div>
      <button id="openDevModeBtn" type="button" style="margin:18px auto 0;padding:9px 16px;border-radius:999px;border:1px solid rgba(255,205,120,.32);background:rgba(255,255,255,.05);color:rgba(251,243,223,.7);font-size:11px;font-weight:800;letter-spacing:1px;">DEV MODE</button>
    `;
    document.getElementById('stage').appendChild(myPageScreen);
    const input = myPageScreen.querySelector('#mpNameInput');
    input.addEventListener('change', () => {
      const v = input.value.trim().slice(0, 12);
      profile.name = v || DEFAULT_PROFILE.name;
      saveProfile();
      refreshMyPage();
    });
    myPageScreen.querySelector('#openDevModeBtn').addEventListener('click', openDeveloperPanel);
  }

  let developerPanelEl = null;
  function openDeveloperPanel(){
    if(!developerPanelEl){
      developerPanelEl = document.createElement('div');
      developerPanelEl.id = 'developerPanel';
      developerPanelEl.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(4,3,8,.86);display:flex;align-items:center;justify-content:center;padding:22px;';
      developerPanelEl.innerHTML = `
        <div style="width:min(88vw,360px);background:linear-gradient(155deg,#251b15,#100d12);border:1px solid rgba(255,205,120,.38);border-radius:20px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.6);color:#fbf3df;">
          <div style="font-size:18px;font-weight:900;letter-spacing:1px;margin-bottom:5px;">開発者モード</div>
          <div style="font-size:11px;opacity:.62;line-height:1.6;margin-bottom:16px;">クリア記録やランキングには影響しないプレビュー機能です。</div>
          <button class="devToggleBtn" data-dev="festivalFrame"></button>
          <button class="devToggleBtn" data-dev="starTip"></button>
          <button class="devToggleBtn" data-dev="unlockAll"></button>
          <button id="devCloseBtn" style="width:100%;margin-top:12px;padding:11px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#fbf3df;font-weight:800;">閉じる</button>
        </div>`;
      developerPanelEl.querySelectorAll('.devToggleBtn').forEach(btn => {
        btn.style.cssText = 'display:block;width:100%;margin:8px 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,205,120,.25);background:rgba(255,255,255,.055);color:#fbf3df;text-align:left;font-size:13px;font-weight:800;';
        btn.addEventListener('click', () => {
          const key = btn.dataset.dev;
          devSettings[key] = !devSettings[key];
          if(key === 'starTip') selectedTipSkin = devSettings.starTip ? 'star' : (tipRewards.star ? 'star' : 'circle');
          saveDevSettings();
          refreshDeveloperPanel();
          renderStageList();
          renderAlbumGrid();
          refreshMyPage();
          devToast(devSettings[key] ? 'プレビューをONにしました' : 'プレビューをOFFにしました');
        });
      });
      developerPanelEl.querySelector('#devCloseBtn').addEventListener('click', () => developerPanelEl.style.display = 'none');
      document.body.appendChild(developerPanelEl);
    }
    refreshDeveloperPanel();
    developerPanelEl.style.display = 'flex';
  }
  function refreshDeveloperPanel(){
    if(!developerPanelEl) return;
    const labels = {
      festivalFrame:'豪華額プレビュー',
      starTip:'星の針先プレビュー',
      unlockAll:'全ステージ解放プレビュー'
    };
    developerPanelEl.querySelectorAll('.devToggleBtn').forEach(btn => {
      const on = !!devSettings[btn.dataset.dev];
      btn.textContent = labels[btn.dataset.dev] + '　' + (on ? 'ON' : 'OFF');
      btn.style.borderColor = on ? 'rgba(255,205,120,.85)' : 'rgba(255,205,120,.25)';
      btn.style.color = on ? '#ffd27a' : '#fbf3df';
    });
  }
  function refreshMyPage(){
    if(!myPageScreen) return;
    myPageScreen.querySelector('#mpNameInput').value = profile.name;
    myPageScreen.querySelector('#mpTitleText').textContent = currentTitle();
    myPageScreen.querySelector('#mpLevelText').textContent = 'Lv.' + profile.level;
    const need = xpNeededForLevel(profile.level);
    myPageScreen.querySelector('#mpXpFill').style.width = Math.min(100, (profile.xp/need)*100) + '%';
    myPageScreen.querySelector('#mpXpText').textContent = profile.xp + ' / ' + need;
    const albumTotal = Object.keys(loadAlbum('easy')).length + Object.keys(loadAlbum('normal')).length + Object.keys(loadAlbum('hard')).length;
    const stats = [
      ['アルバム', albumTotal + ' / ' + (STAGES.length*3)],
      ['総クリア数', profile.totalClears + '回'],
      ['Excellent Clear', profile.excellentCount + '回'],
      ['No Break', profile.noBreakCount + '回'],
      ['Perfect', profile.perfectCount + '回'],
      ['最速記録', profile.fastestTime !== null ? profile.fastestTime.toFixed(2) + 's' : '--'],
      ['プレイ回数', profile.totalPlays + '回'],
      ['失敗回数', profile.totalFails + '回']
    ];
    myPageScreen.querySelector('#mpStatsGrid').innerHTML = stats.map(([label, val]) =>
      '<div class="mpStatCard"><div class="mpStatLabel">' + label + '</div><div class="mpStatVal">' + val + '</div></div>'
    ).join('');
  }

  // ---- 画面下部ナビゲーション ----
  function buildNavBar(){
    navBar = document.createElement('div');
    navBar.className = 'navBar';
    navBar.innerHTML = `
      <button class="navBtn active" data-nav="play"><span class="navIcon navIconPlay"></span>遊ぶ</button>
      <button class="navBtn" data-nav="album"><span class="navIcon navIconBook"></span>アルバム</button>
      <button class="navBtn" data-nav="ranking"><span class="navIcon navIconCup"></span>ランキング</button>
      <button class="navBtn" data-nav="mypage"><span class="navIcon navIconPerson"></span>マイページ</button>
    `;
    document.getElementById('stage').appendChild(navBar);
    navBar.querySelectorAll('.navBtn').forEach(b => {
      b.addEventListener('click', () => {
        navBar.querySelectorAll('.navBtn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const which = b.dataset.nav;
        if(which === 'play'){ renderStageList(); showScreen(titleScreen); }
        else if(which === 'album'){ albumViewMode = gameMode; renderAlbumGrid(); showScreen(albumScreen); }
        else if(which === 'ranking'){ renderRanking(); showScreen(rankingScreen); }
        else if(which === 'mypage'){ refreshMyPage(); showScreen(myPageScreen); }
      });
    });
  }

  // Luxury dark-glass restyle for the stage list — injected here so
  // everything stays in this one file.
  (function injectClearBadgeStyles(){
    const style = document.createElement('style');
    style.textContent = `
      .stageBtn{
        position: relative;
        background: linear-gradient(155deg, rgba(40,28,18,0.9), rgba(18,12,10,0.92)) !important;
        border: 1px solid rgba(255,205,120,0.28) !important;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .stageBtn.isCleared{ border-color: rgba(255,205,120,0.6) !important; }
      .stageBtn .num{
        background: linear-gradient(180deg, #ffcf7a, #c98a2e) !important;
        color:#1a0e04 !important;
        box-shadow: 0 0 6px rgba(255,205,120,0.5);
      }
      .stageBestTime{
        display:block; font-size:10px; letter-spacing:1px;
        color: rgba(255,210,140,0.75); margin-top:2px; font-weight:700;
      }
      .stageClearStamp{
        display:none;
        position:absolute; top:8px; right:10px;
        font-size:9px; font-weight:900; letter-spacing:1.5px;
        color:#2a1608;
        background: linear-gradient(180deg, #ffe9b8, #d9a54a);
        padding:2px 7px; border-radius:5px;
        box-shadow: 0 0 8px rgba(255,205,120,0.5);
        transform: rotate(4deg);
      }
      .stageBtn.isCleared .stageClearStamp{ display:block; }
      .stageBtn.isLocked{
        opacity:0.48;
        filter:saturate(0.45);
      }
      .stageBtn.isLocked .num{
        background:rgba(255,255,255,0.16) !important;
        color:rgba(255,255,255,0.55) !important;
        box-shadow:none;
      }
      .stageLockText{
        display:block; margin-top:3px; font-size:9px; line-height:1.25;
        color:rgba(251,243,223,0.72); letter-spacing:0.2px;
      }
      .stageLockBadge{
        position:absolute; top:8px; right:10px; font-size:9px; font-weight:900;
        color:#fbf3df; border:1px solid rgba(255,255,255,0.25);
        background:rgba(12,9,16,0.78); padding:2px 7px; border-radius:5px;
      }

      .albumOpenBtn{
        margin-top:2px; margin-bottom:10px;
        width:min(84vw, 320px);
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        font-family:'Zen Kaku Gothic New', sans-serif;
        font-weight:700; font-size:12px; letter-spacing:1px;
        padding:11px 16px; border-radius:14px;
        border:1px solid rgba(255,205,120,0.4);
        background: linear-gradient(155deg, rgba(40,28,18,0.9), rgba(18,12,10,0.92));
        color:#fbf3df;
      }
      .albumOpenBtn .albumProgressTrack{
        flex:1; height:5px; border-radius:99px; background:rgba(255,255,255,0.1);
        margin:0 10px; overflow:hidden;
      }
      .albumOpenBtn .albumProgressFill{
        height:100%; background: linear-gradient(90deg, #d9a54a, #ffe9b8);
      }
      .modeToggleWrap{
        display:flex; gap:4px; margin-bottom:14px; width:min(84vw, 320px);
        background:rgba(255,255,255,0.06); border-radius:999px; padding:4px;
      }
      .modeBtn{
        flex:1;
        font-family:'Zen Kaku Gothic New', sans-serif;
        font-weight:700; font-size:11px; letter-spacing:0.5px;
        padding:7px 6px; border-radius:999px; border:none;
        background:transparent; color:rgba(251,243,223,0.6);
      }
      .modeBtn.active{
        background: linear-gradient(180deg, var(--lantern,#ff8a3d), #d95d16);
        color:#1a0e04;
      }
      #albumScreen{ padding:20px 18px calc(90px + env(safe-area-inset-bottom)); overflow-y:auto; align-items:stretch; justify-content:flex-start; background:linear-gradient(180deg,#11111d 0%,#090a12 100%) !important; }
      #titleScreen{
        padding-bottom: calc(120px + env(safe-area-inset-bottom));
        overflow-y: auto;
        justify-content: flex-start;
      }
      .albumHeader{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
      .albumCloseBtn{
        font-family:'Zen Kaku Gothic New', sans-serif; font-size:12px; font-weight:700;
        background:rgba(255,255,255,0.08); color:#fbf3df; border:1px solid rgba(255,255,255,0.2);
        padding:7px 14px; border-radius:999px;
      }
      .albumGrid{
        display:grid; grid-template-columns:repeat(2, 1fr); gap:12px;
        overflow-y:auto; padding-bottom:20px;
      }
      .albumCard{
        display:flex; flex-direction:column; align-items:center; gap:4px;
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12);
        border-radius:16px; padding:8px; text-align:center;
      }
      .albumPhotoWrap{
        position:relative; width:100%; aspect-ratio:1/1; flex:none;
        display:flex; align-items:center; justify-content:center;
      }
      .albumPhotoWrap .albumPhotoBase{
        position:absolute; inset:0; width:100%; height:100%; object-fit:cover;
        border-radius:10px;
      }
      .albumPhotoWrap.hardFrameEquipped .albumPhotoBase{
        left:23.1%; top:22.8%; width:53.8%; height:53.8%;
        border-radius:7%;
      }
      .hardAlbumFrame{
        position:absolute; inset:0; width:100%; height:100%; object-fit:contain;
        pointer-events:none; z-index:2;
        filter:drop-shadow(0 4px 7px rgba(0,0,0,.42));
      }
      .albumPhotoWrap.detail{
        width:min(88vw,390px); margin:4px auto 14px;
      }
      .albumPhotoWrap.detail:not(.hardFrameEquipped){ width:min(78vw,340px); }
      .albumPhotoWrap.detail .albumPhotoBase{ border-radius:18px; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
      .albumPhotoWrap.detail.hardFrameEquipped .albumPhotoBase{
        left:23.1%; top:22.8%; width:53.8%; height:53.8%;
        border-radius:7%; box-shadow:none;
      }
      .albumNoPhoto{
        display:flex; align-items:center; justify-content:center;
        width:100%; aspect-ratio:1/1; border-radius:10px;
        font-size:11px; font-weight:700; color:rgba(251,243,223,0.8); text-align:center;
      }
      .albumNoPhotoBig{
        display:flex; align-items:center; justify-content:center;
        font-size:13px; line-height:1.7; text-align:center; color:rgba(251,243,223,0.85);
      }
      .albumCard.locked{ opacity:0.45; }
      .albumLockedIcon{
        display:flex; align-items:center; justify-content:center;
        flex-direction:column; padding:22px 0 26px;
      }
      .lockShackle{
        width:16px; height:12px; border:2.5px solid rgba(251,243,223,0.55);
        border-bottom:none; border-radius:10px 10px 0 0; margin-bottom:-2px;
      }
      .lockBody{
        width:24px; height:18px; border-radius:3px;
        background: rgba(251,243,223,0.5);
      }
      .albumCardName{ font-size:12px; font-weight:700; color:#fbf3df; }
      .albumCardGrade{ font-size:10px; font-weight:900; letter-spacing:0.5px; color:#ffd23f; }
      .albumCardGrade.excellent{ color:#ffd23f; }
      .albumCardGrade.perfect{ color:#8fe0ff; }
      .albumCardGrade.clear{ color:#9fd6a8; }
      .albumCardGrade.big{ font-size:14px; margin:4px 0; }

      .albumBtnLabel{ white-space:nowrap; }
      .albumBtnCount{ font-size:11px; opacity:0.85; white-space:nowrap; }

      #albumDetail{ padding:24px; background:rgba(8,9,16,.98) !important; }
      .albumDetailImg{ width:min(78vw,340px); aspect-ratio:1/1; object-fit:cover; border-radius:18px; margin-bottom:14px; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
      .hardFrameRewardToast{ border-color:rgba(255,155,55,.85); box-shadow:0 0 38px rgba(255,95,20,.3); }
      .albumDetailInfo{ text-align:center; }
      .albumDetailName{ font-family:'Yuji Syuku',serif; font-size:22px; margin-bottom:6px; }
      .albumDetailStars{ font-size:14px; letter-spacing:2px; color:var(--lantern-dim,#ffb066); margin:6px 0; }
      .albumDetailRow{ font-size:12px; opacity:0.75; margin-top:3px; }
      .albumDetailClose{ position:absolute; top:16px; right:16px; }
      .albumTitlesRow{
        margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.12);
        font-size:10px; letter-spacing:1px; opacity:0.5;
      }

      .kokToast{
        position:fixed; left:50%; bottom:14%; transform:translate(-50%, 12px);
        background:rgba(20,14,10,0.92); color:#fff6df; border:1px solid rgba(255,200,140,0.4);
        padding:10px 18px; border-radius:999px; font-size:13px; font-weight:700;
        opacity:0; transition:opacity 0.35s ease, transform 0.35s ease; z-index:99999;
        pointer-events:none;
      }
      .kokToast.show{ opacity:1; transform:translate(-50%, 0); }
      .kokRecordToast{
        border-radius:18px; text-align:center; padding:16px 26px;
        border:1px solid rgba(255,215,140,0.6);
        box-shadow:0 0 30px rgba(255,180,90,0.25);
      }
      .kokRecordToast .recordTitle{
        font-family:'Yuji Syuku',serif; font-size:15px; letter-spacing:3px;
        color:#ffd23f; text-shadow:0 0 10px rgba(255,180,60,0.6);
      }
      .kokRecordToast .recordTime{ font-size:22px; font-weight:900; margin:4px 0; }
      .kokRecordToast .recordSub{ font-size:11px; opacity:0.8; margin-top:2px; }

      /* ---- bottom navigation ---- */
      .navBar{
        position:fixed; left:0; right:0; bottom:0; z-index:40;
        display:flex; justify-content:space-around;
        background:rgba(12,9,16,0.92); backdrop-filter:blur(6px);
        border-top:1px solid rgba(255,205,120,0.18);
        padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      }
      .navBtn{
        flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;
        background:none; border:none; color:rgba(251,243,223,0.5);
        font-family:'Zen Kaku Gothic New', sans-serif; font-size:10px; font-weight:700;
        padding:4px 2px;
      }
      .navBtn.active{ color:#ffcf7a; }
      .navIcon{ width:20px; height:20px; position:relative; }
      .navIconPlay::before{
        content:''; position:absolute; left:5px; top:2px;
        border-style:solid; border-width:8px 0 8px 13px;
        border-color:transparent transparent transparent currentColor;
      }
      .navIconBook::before{
        content:''; position:absolute; left:2px; top:3px; width:16px; height:13px;
        border:2px solid currentColor; border-radius:2px;
      }
      .navIconBook::after{
        content:''; position:absolute; left:10px; top:3px; width:1.5px; height:13px;
        background:currentColor;
      }
      .navIconCup::before{
        content:''; position:absolute; left:5px; top:2px; width:10px; height:9px;
        border:2px solid currentColor; border-top:none; border-radius:0 0 5px 5px;
      }
      .navIconCup::after{
        content:''; position:absolute; left:8px; top:11px; width:4px; height:5px;
        background:currentColor;
      }
      .navIconPerson::before{
        content:''; position:absolute; left:7px; top:2px; width:6px; height:6px;
        border-radius:50%; background:currentColor;
      }
      .navIconPerson::after{
        content:''; position:absolute; left:3px; top:10px; width:14px; height:7px;
        border-radius:8px 8px 0 0; background:currentColor;
      }

      /* ---- ranking screen ---- */
      #rankingScreen{ padding:20px 18px calc(90px + env(safe-area-inset-bottom)); overflow-y:auto; align-items:stretch; justify-content:flex-start; }
      .demoTag{
        font-size:9px; font-weight:900; letter-spacing:1px; color:#1a0e04;
        background: linear-gradient(180deg, #ffe9b8, #d9a54a);
        padding:2px 6px; border-radius:5px; margin-left:8px; vertical-align:middle;
      }
      .rankStageRow{
        display:flex; gap:6px; overflow-x:auto; padding:4px 0 10px;
        -webkit-overflow-scrolling:touch;
      }
      .rankStageChip{
        flex:none; font-family:'Zen Kaku Gothic New', sans-serif; font-size:11px; font-weight:700;
        padding:7px 13px; border-radius:999px; white-space:nowrap;
        border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:rgba(251,243,223,0.7);
      }
      .rankStageChip.active{
        background: linear-gradient(180deg, var(--lantern,#ff8a3d), #d95d16);
        color:#1a0e04; border-color:transparent;
      }
      .rankList{ display:flex; flex-direction:column; gap:6px; margin-top:10px; }
      .rankRow{
        display:flex; align-items:center; gap:10px;
        background: linear-gradient(155deg, rgba(40,28,18,0.85), rgba(18,12,10,0.88));
        border:1px solid rgba(255,255,255,0.1);
        border-radius:12px; padding:9px 14px; font-size:13px;
      }
      .rankRow.isMe{ border-color:rgba(255,205,120,0.75); background: linear-gradient(155deg, rgba(70,45,18,0.9), rgba(30,18,10,0.9)); }
      .rankPos{ width:46px; flex:none; font-weight:900; color:#ffd23f; font-size:12px; }
      .rankName{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .rankTime{ flex:none; font-variant-numeric:tabular-nums; opacity:0.85; }
      .rankList.meMode .rankPos{ width:auto; color:#fbf3df; font-weight:700; }
      .rankMeBar{
        margin-top:14px; padding:12px 16px; border-radius:14px;
        background:rgba(255,205,120,0.08); border:1px solid rgba(255,205,120,0.3);
        font-size:12px; line-height:1.9;
      }
      .rankMeBar b{ color:#ffd23f; }

      /* ---- my page ---- */
      #myPageScreen{ padding:28px 20px calc(90px + env(safe-area-inset-bottom)); overflow-y:auto; justify-content:flex-start; }
      .mpNameRow{ display:flex; justify-content:center; margin-bottom:6px; }
      .mpNameInput{
        text-align:center; font-family:'Yuji Syuku',serif; font-size:20px;
        background:none; border:none; border-bottom:1px solid rgba(255,205,120,0.4);
        color:#fbf3df; padding:4px 8px; width:min(70vw, 260px);
      }
      .mpTitle{
        text-align:center; font-size:12px; letter-spacing:2px; color:#ffd23f;
        margin-bottom:16px;
      }
      .mpLevelRow{
        display:flex; align-items:center; gap:8px; width:min(88vw,340px);
        margin: 0 auto 22px;
        font-size:12px; font-weight:700;
      }
      .mpXpTrack{ flex:1; height:7px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; }
      .mpXpFill{ height:100%; background: linear-gradient(90deg, #d9a54a, #ffe9b8); }
      .mpXpText{ font-size:10px; opacity:0.7; white-space:nowrap; }
      .mpStatsGrid{
        display:grid; grid-template-columns:repeat(2,1fr); gap:10px;
        width:min(90vw, 380px); margin:0 auto;
      }
      .mpStatCard{
        background: linear-gradient(155deg, rgba(40,28,18,0.85), rgba(18,12,10,0.88));
        border:1px solid rgba(255,205,120,0.22); border-radius:14px;
        padding:12px; text-align:center;
      }
      .mpStatLabel{ font-size:10px; opacity:0.65; margin-bottom:4px; }
      .mpStatVal{ font-size:16px; font-weight:900; color:#fbf3df; }

      /* The base page disables all touch scrolling so dragging the needle
         never pans the page during gameplay — but that same rule was
         silently blocking scrolling inside every menu screen too. Opt
         these back in to vertical panning only. */
      .overlay, .stageList, .albumGrid, .rankList, .rankStageRow{
        touch-action: pan-y !important;
      }
      /* .stageList used to scroll independently inside #titleScreen, which
         (now that #titleScreen itself also scrolls) created two nested
         scroll containers fighting each other on iOS — scrolling would
         snap back before a tap could land. One unified scroll area fixes it. */
      .stageList{ max-height:none !important; overflow-y:visible !important; }
      .albumGrid{ overflow-y:visible !important; }
      /* iOS Safari's address bar collapses/expands while scrolling, and
         100vh recalculates every time that happens — mid-scroll, this
         reshuffles the whole layout and makes it look like the page
         "snaps back". 100dvh tracks the real visible viewport instead. */
      #stage{ height: 100dvh !important; }
      html, body{ height: 100dvh !important; }

      .stageBtn.secretStageBtn{
        border-color:rgba(255,178,55,.88) !important;
        background:linear-gradient(155deg,rgba(82,34,10,.95),rgba(17,9,13,.96)) !important;
        box-shadow:0 0 22px rgba(255,115,20,.2), inset 0 1px 0 rgba(255,235,180,.08);
      }
      .stageBtn.secretStageBtn .num{
        background:linear-gradient(180deg,#fff0a8,#ff7a18) !important;
        box-shadow:0 0 12px rgba(255,135,30,.8);
      }
      .stageBtn.secretStageBtn .stageName{ color:#ffd38a; }
      .stageListCredit{
        text-align:center; font-size:11px; letter-spacing:2px;
        color:rgba(251,243,223,0.4); margin-top:14px; padding-bottom:10px;
        font-family:'Zen Kaku Gothic New', sans-serif;
      }
    `;
    document.head.appendChild(style);
  })();


  // ---- SECRET STAGE: 龍 ----
  // BUILD 79: the first attempt converted a concave full-body dragon into a
  // one-radius-per-angle outline, which collapsed into an unreadable blob.
  // The gameplay engine is radial, so the playable mold is now a purpose-built
  // star-convex dragon-head crest: long snout, two horns and a flowing mane.
  // 龍(secret): a coiled dragon medallion — not a literal trace of a
  // sprawling reference pose, but built the same way as 風鈴/風ぐるま
  // (a base ring plus named bump()/plateauBump() features). A dragon that
  // stretches diagonally across the whole canvas can't be captured as a
  // single-valued radius-per-angle curve (this engine's shapes are all
  // "one distance per angle from one center"); coiling the body into a
  // ring — head and mane at top, one leg on each side, tail sweeping back
  // around to the head — keeps it a valid, playable outline while still
  // reading as head + mane + legs + tail. 0°=画面右, 時計回り(canvas y-down)。
  function dragonRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const th = toRad(deg);
    let ratio = 0.80; // thin coiled body ring
    ratio += 0.05 * Math.sin(th*2 + toRad(60));  // long, gentle S-undulation
    ratio += 0.02 * Math.sin(th*4 - toRad(30));

    // head + pointed snout (upper-left)
    ratio += 0.34 * plateauBump(th, 200, 9, 14);
    ratio += 0.18 * plateauBump(th, 186, 4, 7);
    ratio -= 0.07 * bump(th, 214, 5); // shallow throat dip before the mane

    // mane: 6 spikes fanning back from the head
    const maneAngles = [222,233,244,255,266,277];
    maneAngles.forEach((a, i) => {
      const h = 0.30 - i*0.028;
      ratio += h * plateauBump(th, a, 2, 5);
    });
    ratio -= 0.05 * bump(th, 292, 6); // shallow neck dip before the body

    // front leg, 3 short claws
    const legA = 320;
    ratio += 0.30 * plateauBump(th, legA, 4, 7);
    [-4,0,4].forEach(off => { ratio += 0.05 * bump(th, legA+off, 1.6); });
    ratio -= 0.045 * bump(th, legA-13, 5);

    // back leg, 3 short claws
    const legB = 345;
    ratio += 0.24 * plateauBump(th, legB, 4, 6);
    [-3.5,0,3.5].forEach(off => { ratio += 0.045 * bump(th, legB+off, 1.4); });
    ratio -= 0.04 * bump(th, legB-12, 5);

    // tail sweeps far out, closing back toward the head; simple 2-3 point fin tip
    ratio += 0.72 * plateauBump(th, 15, 14, 20);
    [2,15,28].forEach(a => { ratio += 0.10 * bump(th, a, 3); });
    ratio -= 0.05 * bump(th, 355, 7);
    ratio -= 0.04 * bump(th, 178, 5); // closes the ring back toward the snout

    return Rb * ratio;
  }

  // PROJECT ENNICHI 第一弾: 縁日
  const STAGES = [
    { name:'日の丸',   key:'hinomaru',   shapeFn:(th,Rb)=>Rb,     fill:'188,0,45',   difficulty:1 },
    { name:'水風船',   key:'mizufusen',  shapeFn:balloonRadius,    fill:'110,190,255',difficulty:1 },
    { name:'わたがし', key:'watagashi',  shapeFn:cottonCandyRadius,fill:'255,170,210',difficulty:2 },
    { name:'お面',     key:'omen',       shapeFn:maskRadius,       fill:'250,225,190',difficulty:2 },
    { name:'提灯',     key:'chochin',    shapeFn:lanternRadius,    fill:'255,138,61', difficulty:2 },
    { name:'風鈴',     key:'furin',      shapeFn:furinRadius,      fill:'90,170,220', difficulty:3 },
    { name:'うちわ',   key:'uchiwa',     shapeFn:uchiwaRadius,     fill:'255,150,90', difficulty:3 },
    { name:'りんご飴', key:'ringoame',   shapeFn:candyAppleRadius, fill:'210,30,25',  difficulty:3 },
    { name:'風ぐるま', key:'kazaguruma', shapeFn:pinwheelRadius,   fill:'255,205,60', difficulty:4 },
    { name:'金魚',     key:'kingyo',     shapeFn:goldfishRadius,   fill:'255,120,70', difficulty:5 },
    { name:'龍',       key:'dragon',     shapeFn:dragonRadius,     fill:'255,165,45', difficulty:5, secret:true }
  ];

  // ---- clear-scene image assets ----
  // Real illustrations, loaded from the images/ folder. Any stage without a
  // matching file just keeps the flat-color procedural look — nothing breaks
  // while artwork is still being rolled out one stage at a time.
  const CLEAR_IMG_BASE = 'images/';
  const clearImages = {}; // stage name -> {img, loaded}
  STAGES.forEach(s => {
    const rec = { img: new Image(), loaded: false };
    rec.img.crossOrigin = 'anonymous'; // keeps the canvas untainted so the album snapshot never silently fails
    rec.img.onload = () => { rec.loaded = true; };
    rec.img.onerror = () => { rec.loaded = false; };
    rec.img.src = CLEAR_IMG_BASE + 'clear_' + s.key + '.png';
    clearImages[s.name] = rec;
  });
  const festivalBg = { img: new Image(), loaded: false };
  festivalBg.img.crossOrigin = 'anonymous';
  festivalBg.img.onload = () => { festivalBg.loaded = true; };
  festivalBg.img.onerror = () => { festivalBg.loaded = false; };
  festivalBg.img.src = CLEAR_IMG_BASE + 'festival_bg.png';

  // Precise placement for illustrations whose shape function was traced
  // directly from that same image (see UCHIWA_SHAPE_RATIOS above): draw the
  // image at exactly the scale/offset used during tracing, so the artwork
  // lines up pixel-for-pixel with the math shape instead of an approximate
  // "cover" fit. cxImg/cyImg = the traced shape's center in source pixels,
  // rImg = the reference radius (1.0 in the ratio table) in source pixels.
  const clearImageAlign = {
    'うちわ': { cxImg: 625, cyImg: 520, rImg: 440 },
    '提灯': { cxImg: 505.2, cyImg: 850.7, rImg: 399.1 },
    'お面': { cxImg: 513.8, cyImg: 836.5, rImg: 442.8 },
    '風ぐるま': { cxImg: 516.4, cyImg: 726.3, rImg: 323.7 },
    'りんご飴': { cxImg: 501.7, cyImg: 663.6, rImg: 332.6 },
    'わたがし': { cxImg: 511.6, cyImg: 740.5, rImg: 418.2 },
    '水風船': { cxImg: 511.9, cyImg: 800.8, rImg: 389.3 },
    '金魚': { cxImg: 530.8, cyImg: 692.3, rImg: 345.9 },
    '風鈴': { cxImg: 511.1, cyImg: 436.3, rImg: 236.5 },
    '龍': { cxImg: 661.4, cyImg: 691.6, rImg: 480 }
  };

  // Draw an image "cover"-fit (like CSS background-size:cover) into a square
  // of the given side length, centered at (ccx, ccy). An optional crop (in
  // 0..1 fractions of the source image) lets us skip transparent padding.
  function drawImageCover(image, ccx, ccy, side, crop){
    const iw = image.naturalWidth, ih = image.naturalHeight;
    if(!iw || !ih) return;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if(crop){
      sx = crop.x0 * iw; sy = crop.y0 * ih;
      sw = (crop.x1 - crop.x0) * iw; sh = (crop.y1 - crop.y0) * ih;
    }
    const scale = Math.max(side / sw, side / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(image, sx, sy, sw, sh, ccx - dw/2, ccy - dh/2, dw, dh);
  }

  // Draw an image using the exact scale/offset recorded when its shape was
  // traced, so it lines up pixel-for-pixel with the math shapePath.
  function drawImageAligned(image, align){
    const scale = R / align.rImg;
    const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
    const dx = cx - align.cxImg * scale, dy = cy - align.cyImg * scale;
    ctx.drawImage(image, dx, dy, dw, dh);
  }

  let currentStageIndex = 0;
  let targetRCache = new Float32Array(N_BUCKETS);
  let plateEdgeCache = new Float32Array(N_BUCKETS);
  let plateEdgePath = null;
  let shapePts = [];
  let shapePath = null;

  function buildStageCache(){
    const stage = STAGES[currentStageIndex];
    shapePts = [];
    shapePath = new Path2D();
    let maxR = 0;
    for(let i = 0; i < N_BUCKETS; i++){
      const a = (i / N_BUCKETS) * Math.PI * 2;
      const r = stage.shapeFn(a, R);
      targetRCache[i] = r;
      if(r > maxR) maxR = r;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      shapePts.push({x, y});
      if(i === 0) shapePath.moveTo(x, y); else shapePath.lineTo(x, y);
    }
    shapePath.closePath();
    // The candy sits centered and large, with the shape resting inside it.
    // A squircle's farthest axis-aligned reach is exactly S, at the flat
    // edge midpoint (the corners, despite being radially farther, project
    // to a *smaller* x/y extent) — so the only real constraint is S itself
    // staying under the canvas half-width. Start from a generous rim
    // thickness and shrink it only if that would run past the edge.
    const maxEdge = W*0.48;
    let S = maxR + safeBand + W*0.09;
    if(S > maxEdge) S = maxEdge;
    S = Math.max(S, maxR + safeBand + W*0.01); // last-resort: never clip the shape
    plateR = S;
    plateEdgePath = new Path2D();
    for(let i = 0; i < N_BUCKETS; i++){
      const a = (i / N_BUCKETS) * Math.PI * 2;
      const er = squircleRadius(a, plateR, PLATE_SQUIRCLE_N);
      plateEdgeCache[i] = er;
      const x = cx + er * Math.cos(a), y = cy + er * Math.sin(a);
      if(i === 0) plateEdgePath.moveTo(x, y); else plateEdgePath.lineTo(x, y);
    }
    plateEdgePath.closePath();
  }

  // Small silhouette preview drawn inside each stage-select button.
  function drawStageThumb(canvasEl, stage){
    const dpr = window.devicePixelRatio || 1;
    const size = canvasEl.clientWidth || 40;
    canvasEl.width = size * dpr;
    canvasEl.height = size * dpr;
    const tctx = canvasEl.getContext('2d');
    tctx.setTransform(dpr,0,0,dpr,0,0);
    tctx.clearRect(0,0,size,size);
    const tcx = size/2, tcy = size/2, tR = size*0.30;
    const path = new Path2D();
    for(let i = 0; i <= 72; i++){
      const a = (i/72) * Math.PI*2;
      const r = stage.shapeFn(a, tR);
      const x = tcx + r*Math.cos(a), y = tcy + r*Math.sin(a);
      if(i === 0) path.moveTo(x,y); else path.lineTo(x,y);
    }
    path.closePath();

    // glazed candy base — deepens toward the rim, like poured hard candy
    const glaze = tctx.createRadialGradient(tcx - tR*0.3, tcy - tR*0.35, tR*0.1, tcx, tcy, tR*1.15);
    glaze.addColorStop(0, 'rgba(' + stage.fill + ',0.98)');
    glaze.addColorStop(0.7, 'rgba(' + stage.fill + ',0.92)');
    glaze.addColorStop(1, 'rgba(0,0,0,0.35)');
    tctx.fillStyle = glaze;
    tctx.fill(path);

    // thin gold rim
    tctx.lineWidth = size*0.02;
    tctx.strokeStyle = 'rgba(255,205,120,0.55)';
    tctx.stroke(path);

    // glass gloss highlight, upper-left
    tctx.save();
    tctx.clip(path);
    const gloss = tctx.createRadialGradient(tcx - tR*0.4, tcy - tR*0.5, 1, tcx - tR*0.4, tcy - tR*0.5, tR*0.9);
    gloss.addColorStop(0, 'rgba(255,255,255,0.55)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    tctx.fillStyle = gloss;
    tctx.fillRect(0, 0, size, size);
    tctx.restore();
  }

  function renderStageList(){
    stageList.innerHTML = '';
    const album = loadAlbum(gameMode);
    STAGES.forEach((s, i) => {
      if(s.secret && gameMode !== 'hard') return;
      const unlocked = isStageUnlocked(i, gameMode);
      const rec = album[s.key];
      const btn = document.createElement('button');
      btn.className = 'stageBtn' + (s.secret ? ' secretStageBtn' : '') +
        (rec ? ' isCleared' : '') + (unlocked ? '' : ' isLocked');
      btn.disabled = !unlocked;
      const stars = '★'.repeat(s.difficulty) + '☆'.repeat(5 - s.difficulty);
      const bestTime = rec ? rec.time.toFixed(2) + 's' : '--';
      const lockLine = unlocked ? '' : '<span class="stageLockText">' + unlockMessage(i, gameMode) + '</span>';
      btn.innerHTML =
        '<span class="num">' + (s.secret ? 'S' : (i+1)) + '</span>' +
        '<canvas class="thumb"></canvas>' +
        '<span class="stageInfo">' +
          '<span class="stageName">' + (s.secret ? 'シークレットステージ' : s.name) + '</span>' +
          '<span class="stageStars">' + stars + '</span>' +
          '<span class="stageBestTime">BEST ' + bestTime + '</span>' +
          lockLine +
        '</span>' +
        '<span class="stageClearStamp">CLEAR</span>' +
        (unlocked ? '' : '<span class="stageLockBadge">LOCK</span>');
      if(unlocked) btn.addEventListener('click', () => startGame(i));
      stageList.appendChild(btn);
      drawStageThumb(btn.querySelector('canvas.thumb'), s);
    });
    const credit = document.createElement('div');
    credit.className = 'stageListCredit';
    credit.textContent = 'produce by RIVUP';
    stageList.appendChild(credit);
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

  // One or two small candy-shell fragments knocked loose at the spot the
  // player just carved — this is what sells "you're breaking the candy
  // around the mold", not just tracing a line.
  function spawnChipFragment(bucket, now, atR){
    if(!shapePts.length) return;
    const a = (bucket / N_BUCKETS) * Math.PI * 2;
    const innerR = targetRCache[bucket];
    const edgeR = plateEdgeCache[bucket];
    const originR = (typeof atR === 'number')
      ? atR
      : innerR + (edgeR - innerR) * (0.35 + Math.random()*0.3);
    const x = cx + originR * Math.cos(a);
    const y = cy + originR * Math.sin(a);
    const outDirX = Math.cos(a), outDirY = Math.sin(a);
    const n = 1 + (Math.random() < 0.4 ? 1 : 0); // mostly 1, sometimes 2
    for(let k = 0; k < n; k++){
      chipFrags.push({
        x, y,
        vx: outDirX * (W*0.05 + Math.random()*W*0.05) + (Math.random()-0.5)*W*0.03,
        vy: outDirY * (W*0.05 + Math.random()*W*0.05) + (Math.random()-0.5)*W*0.03,
        size: W*0.005 + Math.random()*W*0.006,
        born: now
      });
    }
  }

  // ---- sound-effect hooks -------------------------------------------------
  // Every game sound is funneled through one of these named functions, each
  // synthesized with Web Audio so no external files are required. To swap
  // in real recorded SFX later, just replace a function body with something
  // like `new Audio('sfx/chip.mp3').play()` — call sites elsewhere never
  // need to change.
  function playChipBreak(){
    if(!audioCtx || !noiseBuffer) return;
    const now = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200 + Math.random() * 2200;
    bp.Q.value = 4;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    src.connect(bp); bp.connect(gain); gain.connect(audioCtx.destination);
    src.start(now);
    src.stop(now + 0.06);
  }

  function resize(){
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.95;
    canvas.width = size * devicePixelRatio;
    canvas.height = size * devicePixelRatio;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    W = size; H = size;
    cx = W/2; cy = H/2;
    R = W * 0.26; // bigger, more confident shape size
    // safeBand is kept proportional to R (not W) so shrinking the shape
    // doesn't change the actual difficulty — same relative tolerance as before.
    safeBand = R * 0.065;
    needleOffset = W * 0.20;
    buildStageCache();
    draw();
  }
  let resizeDebounceId = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeDebounceId);
    resizeDebounceId = setTimeout(resize, 120);
  });

  // ---- state ----
  let mode = 'title'; // title | playing | gameover | clearReveal | clear
  let erosion = new Float32Array(N_BUCKETS); // 0 = full candy at this angle, 1 = fully scraped down to the mold
  let lastErodeAt = new Float32Array(N_BUCKETS);
  let cutAccum = new Float32Array(N_BUCKETS); // progress toward the next "break" at this angle (HARD mode)
  let fullyEroded = new Uint8Array(N_BUCKETS); // 1 once that bucket first reached "done", for counting
  let erodedCount = 0;
  let currentState = null; // 'green' | 'yellow' | 'red' | null
  let needle = null; // {x,y} = visible tip position (offset above finger)
  let handlePos = null; // {x,y} = actual finger/touch position
  let startTime = null;
  let elapsed = 0;
  let failPoint = null;
  let failSnapshot = null;
  let failMagnifierEl = null;
  let failDepth = 0;
  let rafId = null;
  let shards = [];
  let shardBornAt = 0;
  let clearPhaseStart = null; // timestamp when the clear "detach" sequence began
  let liftTiltSign = 1;
  let liftTriggered = false;
  let celebTriggered = false;
  let freezeTriggered = false; // 龍(secret) だけ: フリーズ演出のクリック/振動を1回だけ鳴らす
  let fireworks = [];
  let dust = [];
  let chipFrags = []; // small candy-shell fragments flying off as it's scraped
  const EROSION_STEP = 0.07;   // how much one "tick" of scraping wears away
  const EROSION_TICK_MS = 45;  // minimum time between ticks on the same spot
  const EROSION_DONE = 0.97;   // treat a bucket as fully cleared past this
  let sessionFailCount = 0;    // fails since this stage was last freshly picked (survives retries)
  let albumSaved = false;      // guards against saving the same clear twice


  // ---- BUILD 57: fair input tracking ----
  let lastRawTip = null;
  let strokeActive = false;
  let strokeReleaseCount = 0;
  let strokeHasCarved = false;
  let failCracks = [];
  let lastEasyBucket = null;
  let remainingHelpEl = null;
  let remainingHelpTimer = null;

  function inputSampleStep(){
    return Math.max(1.5, Math.min(3, safeBand * 0.34));
  }

  function vibrate(pattern){
    if(navigator.vibrate){ try{ navigator.vibrate(pattern); }catch(e){} }
  }

  // ---- carving sound (synthesized "kari-kari" scratch, no audio files needed) ----
  let audioCtx = null;
  let noiseBuffer = null;
  let lastScratchAt = 0;
  let lastChipBreakAt = 0;
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

  // Bright little "ta-da" for the moment the festival scene opens up —
  // a quick ascending three-note chime, distinct from the softer detach click.
  function playCelebrationChime(){
    if(!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = [660, 880, 1320];
    notes.forEach((freq, i) => {
      const t0 = now + i * 0.07;
      const osc = audioCtx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.34);
    });
    if(noiseBuffer){
      const src = audioCtx.createBufferSource();
      src.buffer = noiseBuffer;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 3500;
      const g3 = audioCtx.createGain();
      g3.gain.setValueAtTime(0, now);
      g3.gain.linearRampToValueAtTime(0.10, now + 0.01);
      g3.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      src.connect(bp); bp.connect(g3); g3.connect(audioCtx.destination);
      src.start(now); src.stop(now + 0.16);
    }
  }

  // A couple of simple firework bursts for the festival celebration —
  // short radiating streaks that expand and fade, nothing elaborate.
  function spawnFireworks(cx0, cy0, now){
    const n = 22 + Math.floor(Math.random() * 6);
    const hueSets = [
      ['255,196,90', '255,138,61'],
      ['255,120,150', '255,196,90'],
      ['140,220,255', '255,255,255']
    ];
    const colors = hueSets[Math.floor(Math.random() * hueSets.length)];
    const particles = [];
    for(let i = 0; i < n; i++){
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      particles.push({
        ang,
        speed: 0.55 + Math.random() * 0.35,
        color: colors[i % colors.length]
      });
    }
    fireworks.push({ x: cx0, y: cy0, born: now, particles });
  }

  function resetGame(){
    erosion.fill(0);
    lastErodeAt.fill(0);
    cutAccum.fill(0);
    fullyEroded.fill(0);
    erodedCount = 0;
    currentState = null;
    needle = null;
    handlePos = null;
    lastRawTip = null;
    strokeActive = false;
    strokeReleaseCount = 0;
    strokeHasCarved = false;
    failCracks = [];
    lastEasyBucket = null;
    if(remainingHelpTimer){ clearTimeout(remainingHelpTimer); remainingHelpTimer = null; }
    if(remainingHelpEl) remainingHelpEl.style.display = 'none';
    carveHelpBtn.style.display = 'none';
    startTime = null;
    elapsed = 0;
    failPoint = null;
    failSnapshot = null;
    failDepth = 0;
    if(failMagnifierEl) failMagnifierEl.style.display = 'none';
    shards = [];
    clearPhaseStart = null;
    liftTriggered = false;
    celebTriggered = false;
    freezeTriggered = false;
    fireworks = [];
    dust = [];
    chipFrags = [];
    albumSaved = false;
    progressBar.style.width = '0%';
    remainingEl.textContent = '';
    timerEl.textContent = '0.0s';
    lastScratchAt = 0;
    lastChipBreakAt = 0;
  }

  function showScreen(el){
    [titleScreen, gameoverScreen, clearScreen].forEach(s => s.classList.add('hidden'));
    if(albumScreen) albumScreen.classList.add('hidden');
    if(albumDetail) albumDetail.classList.add('hidden');
    if(rankingScreen) rankingScreen.classList.add('hidden');
    if(myPageScreen) myPageScreen.classList.add('hidden');
    if(tutorialScreen) tutorialScreen.classList.add('hidden');
    if(el) el.classList.remove('hidden');
    // The canvas sits underneath every menu screen and can visually bleed
    // through the translucent overlay background — make sure it never also
    // steals taps meant for the buttons on top of it while a menu is open.
    canvas.style.pointerEvents = el ? 'none' : 'auto';
  }

  let lastStageIndexStarted = -1;
  function startGame(stageIndex){
    if(typeof stageIndex === 'number' && !isStageUnlocked(stageIndex, gameMode)){
      showDebugToast(unlockMessage(stageIndex, gameMode));
      return;
    }
    if(rafId !== null){
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if(typeof stageIndex === 'number'){
      if(stageIndex !== lastStageIndexStarted){
        sessionFailCount = 0;
        profile.totalPlays++;
        addXP(5);
        refreshMyPage();
      }
      lastStageIndexStarted = stageIndex;
      currentStageIndex = stageIndex;
    }
    buildStageCache();
    resetGame();
    mode = 'playing';
    needleName.textContent = STAGES[currentStageIndex].secret ? 'シークレットステージ' : STAGES[currentStageIndex].name;
    showScreen(null);
    hud.classList.remove('hidden');
    legend.classList.remove('hidden');
    carveHelpBtn.style.display = 'block';
    navBar.classList.add('hidden');
    loop();
  }

  function goToStageSelect(){
    mode = 'title';
    hud.classList.add('hidden');
    legend.classList.add('hidden');
    carveHelpBtn.style.display = 'none';
    navBar.classList.remove('hidden');
    setNavActive('play');
    renderStageList();
    showScreen(titleScreen);
  }

  function findRemainingBucket(){
    if(erodedCount >= N_BUCKETS) return -1;
    // Prefer the center of the longest unfinished cluster, because that is
    // usually the gap the player is actually struggling to see.
    let bestStart = -1, bestLen = 0;
    let runStart = -1, runLen = 0;
    for(let k = 0; k < N_BUCKETS * 2; k++){
      const i = k % N_BUCKETS;
      const unfinished = !fullyEroded[i] && erosion[i] < EROSION_DONE;
      if(unfinished){
        if(runLen === 0) runStart = k;
        runLen++;
        if(runLen > bestLen && runLen <= N_BUCKETS){
          bestLen = runLen;
          bestStart = runStart;
        }
      }else{
        runLen = 0;
      }
      if(k >= N_BUCKETS && runLen === 0) break;
    }
    if(bestStart < 0) return -1;
    return (bestStart + Math.floor(bestLen / 2)) % N_BUCKETS;
  }

  function showRemainingHelp(){
    if(mode !== 'playing') return;
    const bucket = findRemainingBucket();
    if(bucket < 0){
      remainingEl.textContent = '削り残しはありません';
      return;
    }

    if(!remainingHelpEl){
      remainingHelpEl = document.createElement('div');
      remainingHelpEl.id = 'remainingHelpLoupe';
      remainingHelpEl.style.cssText = 'position:fixed;left:50%;top:13%;transform:translateX(-50%);z-index:75;' +
        'display:none;flex-direction:column;align-items:center;gap:7px;pointer-events:none;';
      remainingHelpEl.innerHTML =
        '<div style="width:min(48vw,190px);aspect-ratio:1/1;border-radius:50%;padding:5px;' +
        'background:linear-gradient(145deg,#fff2bf,#b77927);box-shadow:0 12px 30px rgba(0,0,0,.5),0 0 22px rgba(255,205,70,.3);">' +
        '<canvas class="remainingHelpCanvas" style="display:block;width:100%;height:100%;border-radius:50%;background:#171016;"></canvas></div>' +
        '<div style="padding:6px 12px;border-radius:999px;background:rgba(12,9,14,.88);border:1px solid rgba(255,210,70,.5);' +
        'color:#ffe48f;font-size:12px;font-weight:900;">このあたりが残っています</div>';
      document.body.appendChild(remainingHelpEl);
    }

    const loupe = remainingHelpEl.querySelector('.remainingHelpCanvas');
    const cssSize = 190;
    const dpr = window.devicePixelRatio || 1;
    loupe.width = cssSize * dpr;
    loupe.height = cssSize * dpr;
    const lctx = loupe.getContext('2d');
    lctx.setTransform(dpr,0,0,dpr,0,0);
    lctx.clearRect(0,0,cssSize,cssSize);

    const focus = shapePts[bucket];
    const cropLogical = W * 0.22;
    const sx = Math.max(0, Math.min(W - cropLogical, focus.x - cropLogical/2));
    const sy = Math.max(0, Math.min(H - cropLogical, focus.y - cropLogical/2));
    const sourceDpr = canvas.width / W;
    lctx.drawImage(canvas,
      sx * sourceDpr, sy * sourceDpr, cropLogical * sourceDpr, cropLogical * sourceDpr,
      0, 0, cssSize, cssSize);

    // Highlight the unfinished edge itself, not a generic crosshair.
    const prev = shapePts[(bucket - 3 + N_BUCKETS) % N_BUCKETS];
    const next = shapePts[(bucket + 3) % N_BUCKETS];
    const mapX = x => (x - sx) / cropLogical * cssSize;
    const mapY = y => (y - sy) / cropLogical * cssSize;
    lctx.save();
    lctx.lineCap = 'round';
    lctx.lineWidth = 7;
    lctx.strokeStyle = 'rgba(255,210,63,.98)';
    lctx.shadowColor = 'rgba(255,210,63,1)';
    lctx.shadowBlur = 12;
    lctx.beginPath();
    lctx.moveTo(mapX(prev.x), mapY(prev.y));
    lctx.quadraticCurveTo(mapX(focus.x), mapY(focus.y), mapX(next.x), mapY(next.y));
    lctx.stroke();
    lctx.restore();

    remainingHelpEl.style.display = 'flex';
    if(remainingHelpTimer) clearTimeout(remainingHelpTimer);
    remainingHelpTimer = setTimeout(() => {
      if(remainingHelpEl) remainingHelpEl.style.display = 'none';
      remainingHelpTimer = null;
    }, 2800);
  }

  function captureFailSnapshot(){
    try{
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext('2d');
      octx.drawImage(canvas, 0, 0);
      return off;
    }catch(e){ return null; }
  }

  function renderFailMagnifier(){
    if(!failPoint || !failSnapshot) return;

    if(!failMagnifierEl){
      failMagnifierEl = document.createElement('div');
      failMagnifierEl.id = 'failMagnifier';
      failMagnifierEl.style.cssText =
        'display:none; flex-direction:column; align-items:center; gap:8px; ' +
        'margin:0 auto 12px; pointer-events:none; animation:failLoupeIn .34s ease-out both;';
      failMagnifierEl.innerHTML =
        '<div class="failLoupeRing" style="position:relative; width:min(52vw,210px); aspect-ratio:1/1; ' +
        'border-radius:50%; padding:6px; background:linear-gradient(145deg,#fff0c5,#a86a20); ' +
        'box-shadow:0 12px 30px rgba(0,0,0,.48),0 0 22px rgba(255,185,80,.28);">' +
          '<canvas class="failLoupeCanvas" style="display:block;width:100%;height:100%;border-radius:50%;background:#181016;"></canvas>' +
          '<span style="position:absolute;width:54px;height:14px;right:-34px;bottom:8px;border-radius:12px; ' +
          'background:linear-gradient(90deg,#b9792d,#6e3f16);transform:rotate(42deg);transform-origin:left center; ' +
          'box-shadow:0 5px 9px rgba(0,0,0,.35);"></span>' +
        '</div>' +
        '<div class="failLoupeText" style="font-size:12px;font-weight:900;letter-spacing:.5px;color:#ffe4a6; ' +
        'text-align:center;text-shadow:0 2px 5px rgba(0,0,0,.8);">ここで境界線の内側に入りました</div>';
      const style = document.createElement('style');
      style.textContent = '@keyframes failLoupeIn{0%{opacity:0;transform:scale(.72) translateY(14px)}100%{opacity:1;transform:scale(1) translateY(0)}}';
      document.head.appendChild(style);
      gameoverScreen.insertBefore(failMagnifierEl, gameoverScreen.firstChild);
    }

    failMagnifierEl.style.display = 'flex';
    failMagnifierEl.style.animation = 'none';
    void failMagnifierEl.offsetWidth;
    failMagnifierEl.style.animation = 'failLoupeIn .34s ease-out both';

    const loupe = failMagnifierEl.querySelector('.failLoupeCanvas');
    const cssSize = 210;
    const dpr = window.devicePixelRatio || 1;
    loupe.width = cssSize * dpr;
    loupe.height = cssSize * dpr;
    const lctx = loupe.getContext('2d');
    lctx.setTransform(dpr,0,0,dpr,0,0);
    lctx.clearRect(0,0,cssSize,cssSize);

    const sourceDpr = canvas.width / W;
    const cropLogical = W * 0.24;
    const sx = Math.max(0, Math.min(W - cropLogical, failPoint.x - cropLogical/2));
    const sy = Math.max(0, Math.min(H - cropLogical, failPoint.y - cropLogical/2));
    lctx.drawImage(
      failSnapshot,
      sx * sourceDpr, sy * sourceDpr, cropLogical * sourceDpr, cropLogical * sourceDpr,
      0, 0, cssSize, cssSize
    );

    // The loupe itself is enough to explain the failure point; a bright red
    // crosshair made the review screen feel noisy and over-directed, so the
    // close-up now stays clean and lets the enlarged breach speak for itself.

    const text = failMagnifierEl.querySelector('.failLoupeText');
    text.textContent = failDepth > 0.5
      ? 'ここで内側に入りました  約' + failDepth.toFixed(1) + 'px'
      : 'ここで境界線の内側に入りました';
  }

  function gameOver(x, y){
    mode = 'gameover';
    sessionFailCount++;
    profile.totalFails++;
    saveProfile();
    failPoint = {x, y};
    // Paint the final red failure state once before taking the review image.
    // Without this, the loupe can capture the previous yellow frame even
    // though the actual judged state has already become red.
    draw();
    failSnapshot = captureFailSnapshot();
    const fdx = x - cx, fdy = y - cy;
    const fdist = Math.hypot(fdx, fdy);
    const fdeg = ((Math.atan2(fdy, fdx) * 180 / Math.PI) + 360) % 360;
    const fbucket = Math.round(fdeg) % N_BUCKETS;
    failDepth = Math.max(0, targetRCache[fbucket] - fdist);
    failCracks = [];
    for(let i = 0; i < 7; i++){
      failCracks.push({
        angle: Math.random() * Math.PI * 2,
        length: W * 0.05 + Math.random() * W * 0.12,
        branch: Math.random() < 0.55,
        branchSide: Math.random() < 0.5 ? -1 : 1
      });
    }
    needle = null;
    handlePos = null;
    lastRawTip = null;
    shardBornAt = performance.now();
    buildShards();
    vibrate([0, 60, 30, 90]);
    setTimeout(() => {
      hud.classList.add('hidden');
      legend.classList.add('hidden');
      carveHelpBtn.style.display = 'none';
      showScreen(gameoverScreen);
      renderFailMagnifier();
    }, 650);
  }

  function clearGame(){
    mode = 'clearReveal';
    markStageCleared(STAGES[currentStageIndex].key);
    needle = null;
    handlePos = null;
    clearPhaseStart = performance.now();
    liftTriggered = false;
    celebTriggered = false;
    freezeTriggered = false;
    albumSaved = false;
    fireworks = [];
    dust = [];
    liftTiltSign = Math.random() < 0.5 ? -1 : 1;
    hud.classList.add('hidden');
    legend.classList.add('hidden');
    carveHelpBtn.style.display = 'none';
    setTimeout(() => {
      mode = 'clear';
      clearTimeEl.textContent = elapsed.toFixed(2) + 's';
      const isLast = currentStageIndex === STAGES.length - 1;
      nextBtn.textContent = isLast ? 'さいしょのステージへ' : 'つぎのステージへ';
      showScreen(clearScreen);
    }, CLEAR_PAUSE_MS + CLEAR_LIFT_MS + CELEBRATION_MS);
  }

  // ---- input ----
  // BUILD 57: fill the gaps between browser touch events so fast
  // movement cannot skip a dangerous section or leave invisible holes.
  function processInterpolatedMove(rawTip){
    if(mode !== 'playing') return;
    if(!lastRawTip){
      judgeTipSample(rawTip);
      lastRawTip = { x: rawTip.x, y: rawTip.y };
      return;
    }
    const dx = rawTip.x - lastRawTip.x;
    const dy = rawTip.y - lastRawTip.y;
    const distance = Math.hypot(dx, dy);
    const samples = Math.max(1, Math.ceil(distance / inputSampleStep()));
    for(let i = 1; i <= samples; i++){
      if(mode !== 'playing') break;
      const t = i / samples;
      judgeTipSample({
        x: lastRawTip.x + dx * t,
        y: lastRawTip.y + dy * t
      });
    }
    lastRawTip = { x: rawTip.x, y: rawTip.y };
  }

  function judgeTipSample(rawTip){
    if(gameMode === 'easy') handleMoveEasy(rawTip);
    else if(gameMode === 'normal') handleMoveNormal(rawTip);
    else handleMoveHard(rawTip);
  }

  function pointerPos(e){
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function handleMove(e){
    if(mode !== 'playing') return;
    e.preventDefault();
    if(!audioCtx){
      initAudio();
    }else if(audioCtx.state === 'suspended'){
      audioCtx.resume().catch(() => {});
    }
    const p = pointerPos(e);
    handlePos = p;
    const maxOffset = Math.max(0, p.y - W*0.06);
    const offset = Math.min(needleOffset, maxOffset);
    const rawTip = { x: p.x, y: p.y - offset };
    if(startTime === null) startTime = performance.now();
    strokeActive = true;
    processInterpolatedMove(rawTip);
  }

  // ハードモード: BUILD 72 makes the former NORMAL judgment the new HARD.
  // It still offers a small visual magnet so the trace remains readable, but
  // the inward tolerance is narrow and any deeper breach turns red and fails.
  function handleMoveHard(rawTip){
    const dx0 = rawTip.x - cx, dy0 = rawTip.y - cy;
    const dist0 = Math.hypot(dx0, dy0);
    if(dist0 < 0.001){ needle = rawTip; return; }
    const angleDeg = ((Math.atan2(dy0, dx0) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const rawDiff = dist0 - targetR;

    const isPinwheel = STAGES[currentStageIndex].key === 'kazaguruma';
    // 龍(secret): playable difficulty sits between NORMAL and HARD — a long,
    // deliberate line to trace rather than a punishing one. Widen the inward
    // fail margin, magnet pull, and outward green band versus stock HARD.
    const isDragonSecret = STAGES[currentStageIndex].key === 'dragon';
    const innerFail = safeBand * (isPinwheel ? 0.62 : isDragonSecret ? 0.70 : 0.42);
    if(rawDiff < -innerFail){
      needle = rawTip;
      if(currentState !== 'red'){ currentState = 'red'; vibrate(40); }
      gameOver(rawTip.x, rawTip.y);
      return;
    }
    if(rawDiff < 0){
      needle = rawTip;
      if(currentState !== 'yellow'){
        currentState = 'yellow';
        vibrate(5);
      }
      return;
    }

    const magnetRange = safeBand * (isDragonSecret ? 2.5 : 2.2);
    let snappedDist = dist0;
    if(rawDiff <= magnetRange){
      const proximity = 1 - rawDiff / magnetRange;
      snappedDist = Math.max(targetR, dist0 - rawDiff * proximity * proximity * 0.52);
    }
    const tip = { x: cx + dx0/dist0*snappedDist, y: cy + dy0/dist0*snappedDist };
    needle = tip;
    const newState = (snappedDist - targetR <= safeBand * (isDragonSecret ? 1.15 : 1)) ? 'green' : 'yellow';
    if(newState !== currentState){
      currentState = newState;
      vibrate(newState === 'green' ? [0,12] : 5);
    }
    if(newState !== 'green') return;

    const now = performance.now();
    let scraped = false;
    const b = bucket;
    if(now - lastErodeAt[b] >= EROSION_TICK_MS){
      lastErodeAt[b] = now;
      const wasDone = erosion[b] >= EROSION_DONE;
      erosion[b] = 1;
      scraped = true;
      strokeHasCarved = true;
      if(!wasDone && !fullyEroded[b]){
        fullyEroded[b] = 1;
        erodedCount++;
      }
      if(Math.random() < 0.30) spawnChipFragment(b, now, snappedDist);
    }
    if(!scraped) return;
    updateProgress();
    if(now - lastScratchAt > 82){ lastScratchAt = now; playScratch(); vibrate(4); }
    if(now - lastChipBreakAt > 240){ lastChipBreakAt = now; playChipBreak(); }
    if(erodedCount >= N_BUCKETS){
      elapsed = (performance.now() - startTime) / 1000;
      clearGame();
    }
  }

  // イージーモード: the original line-tracing feel — the needle gently
  // snaps toward the mold's outline, with forgiving room on both sides of
  // the line, and a shallow dip inside still only warns before it fails.
  function handleMoveEasy(rawTip){
    const dx0 = rawTip.x - cx, dy0 = rawTip.y - cy;
    const dist0 = Math.hypot(dx0, dy0);
    if(dist0 < 0.001){ needle = rawTip; return; }
    const angleDeg = ((Math.atan2(dy0, dx0) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const rawDiff = dist0 - targetR;
    const isPinwheel = STAGES[currentStageIndex].key === 'kazaguruma';
    const pinwheelDeg = ((Math.atan2(dy0, dx0) * 180 / Math.PI) + 360) % 360;
    const onPinwheelHandle = isPinwheel && pinwheelDeg >= 80 && pinwheelDeg <= 100;
    const innerWarning = safeBand * (onPinwheelHandle ? 0.82 : isPinwheel ? 0.62 : 0.42);
    const innerFail = safeBand * (onPinwheelHandle ? 1.80 : isPinwheel ? 1.38 : 1.05);

    if(rawDiff < -innerFail){
      needle = rawTip;
      if(currentState !== 'red'){ currentState = 'red'; vibrate(40); }
      gameOver(rawTip.x, rawTip.y);
      return;
    }

    const magnetRange = safeBand * (onPinwheelHandle ? 3.5 : isPinwheel ? 3.0 : 2.5);
    let snappedDist = dist0;
    if(Math.abs(rawDiff) <= magnetRange){
      const proximity = 1 - Math.abs(rawDiff) / magnetRange;
      snappedDist = dist0 - rawDiff * proximity * proximity * 0.56;
    }
    snappedDist = Math.max(targetR - innerWarning, snappedDist);
    const tip = { x: cx + dx0/dist0*snappedDist, y: cy + dy0/dist0*snappedDist };
    needle = tip;
    const diff = snappedDist - targetR;
    const newState = (diff >= -innerWarning && diff <= safeBand*1.15) ? 'green' : 'yellow';
    if(newState !== currentState){
      currentState = newState;
      vibrate(newState === 'green' ? [0,12] : 5);
    }
    if(newState !== 'green') return;

    const now = performance.now();
    let scraped = false;
    // BUILD 66: EASY uses a four-bucket moving brush. NORMAL still clears
    // three buckets, while EASY keeps one extra bucket on the direction of
    // travel. This narrows the old five-bucket sweep without collapsing the
    // two modes into the same difficulty.
    let moveDir = 1;
    if(lastEasyBucket !== null){
      let delta = bucket - lastEasyBucket;
      if(delta > N_BUCKETS/2) delta -= N_BUCKETS;
      if(delta < -N_BUCKETS/2) delta += N_BUCKETS;
      if(delta < 0) moveDir = -1;
    }
    lastEasyBucket = bucket;
    const easyOffsets = isPinwheel
      ? (moveDir > 0 ? [-2,-1,0,1,2] : [-2,-1,0,1,2])
      : (moveDir > 0 ? [-1,0,1,2] : [-2,-1,0,1]);
    for(const i of easyOffsets){
      const b = (bucket + i + N_BUCKETS) % N_BUCKETS;
      if(now - lastErodeAt[b] < EROSION_TICK_MS) continue;
      lastErodeAt[b] = now;
      const wasDone = erosion[b] >= EROSION_DONE;
      erosion[b] = 1;
      scraped = true;
      strokeHasCarved = true;
      if(!wasDone && !fullyEroded[b]){
        fullyEroded[b] = 1;
        erodedCount++;
      }
      if(Math.random() < (i === 0 ? 0.30 : Math.abs(i) === 1 ? 0.16 : 0.08)) spawnChipFragment(b, now, snappedDist);
    }
    if(!scraped) return;
    updateProgress();
    if(now - lastScratchAt > 88){ lastScratchAt = now; playScratch(); vibrate(4); }
    if(now - lastChipBreakAt > 260){ lastChipBreakAt = now; playChipBreak(); }
    if(erodedCount >= N_BUCKETS){
      elapsed = (performance.now() - startTime) / 1000;
      clearGame();
    }
  }

  // ノーマルモード: BUILD 72 sits halfway between EASY and the former
  // NORMAL. It allows a small inward green corridor, gives a wider yellow
  // warning zone before failure, and uses slightly stronger magnet support.
  function handleMoveNormal(rawTip){
    const dx0 = rawTip.x - cx, dy0 = rawTip.y - cy;
    const dist0 = Math.hypot(dx0, dy0);
    if(dist0 < 0.001){ needle = rawTip; return; }
    const angleDeg = ((Math.atan2(dy0, dx0) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const rawDiff = dist0 - targetR;

    const isPinwheel = STAGES[currentStageIndex].key === 'kazaguruma';
    const innerGreen = safeBand * (isPinwheel ? 0.45 : 0.32);
    const innerFail = safeBand * (isPinwheel ? 1.35 : 1.00);

    if(rawDiff < -innerFail){
      needle = rawTip;
      if(currentState !== 'red'){ currentState = 'red'; vibrate(40); }
      gameOver(rawTip.x, rawTip.y);
      return;
    }

    // Between the green corridor and the fail line is warning only.
    if(rawDiff < -innerGreen){
      needle = rawTip;
      if(currentState !== 'yellow'){
        currentState = 'yellow';
        vibrate(5);
      }
      return;
    }

    const magnetRange = safeBand * (isPinwheel ? 3.0 : 2.65);
    let snappedDist = dist0;
    if(Math.abs(rawDiff) <= magnetRange){
      const proximity = 1 - Math.abs(rawDiff) / magnetRange;
      snappedDist = dist0 - rawDiff * proximity * proximity * 0.60;
    }
    snappedDist = Math.max(targetR - innerGreen, snappedDist);

    const tip = { x: cx + dx0/dist0*snappedDist, y: cy + dy0/dist0*snappedDist };
    needle = tip;
    const diff = snappedDist - targetR;
    const newState = (diff >= -innerGreen && diff <= safeBand*1.20) ? 'green' : 'yellow';
    if(newState !== currentState){
      currentState = newState;
      vibrate(newState === 'green' ? [0,12] : 5);
    }
    if(newState !== 'green') return;

    const now = performance.now();
    let scraped = false;
    // Two buckets keeps NORMAL more forgiving than HARD's exact one-bucket
    // trace, while remaining clearly narrower than EASY's four-bucket brush.
    const offsets = [-1, 0, 1];
    for(const i of offsets){
      const b = (bucket + i + N_BUCKETS) % N_BUCKETS;
      if(now - lastErodeAt[b] < EROSION_TICK_MS) continue;
      lastErodeAt[b] = now;
      const wasDone = erosion[b] >= EROSION_DONE;
      erosion[b] = 1;
      scraped = true;
      strokeHasCarved = true;
      if(!wasDone && !fullyEroded[b]){
        fullyEroded[b] = 1;
        erodedCount++;
      }
      if(Math.random() < (i === 0 ? 0.30 : 0.16)) spawnChipFragment(b, now, snappedDist);
    }
    if(!scraped) return;
    updateProgress();
    if(now - lastScratchAt > 84){ lastScratchAt = now; playScratch(); vibrate(4); }
    if(now - lastChipBreakAt > 245){ lastChipBreakAt = now; playChipBreak(); }
    if(erodedCount >= N_BUCKETS){
      elapsed = (performance.now() - startTime) / 1000;
      clearGame();
    }
  }

  function handleEnd(){
    if(mode !== 'playing') return;
    if(strokeActive && strokeHasCarved) strokeReleaseCount++;
    strokeActive = false;
    strokeHasCarved = false;
    needle = null;
    handlePos = null;
    currentState = null;
    lastRawTip = null;
  }

  canvas.addEventListener('touchstart', handleMove, {passive:false});
  canvas.addEventListener('touchmove', handleMove, {passive:false});
  canvas.addEventListener('touchend', handleEnd, {passive:false});
  canvas.addEventListener('mousedown', handleMove);
  canvas.addEventListener('mousemove', (e)=>{ if(e.buttons===1) handleMove(e); });
  canvas.addEventListener('mouseup', handleEnd);

  retryBtn.addEventListener('click', () => startGame(currentStageIndex));
  nextBtn.addEventListener('click', () => {
    const next = findNextUnlockedStageIndex(currentStageIndex, gameMode);
    if(next >= 0) startGame(next);
    else goToStageSelect();
  });
  backBtnOver.addEventListener('click', goToStageSelect);
  backBtnClear.addEventListener('click', goToStageSelect);
  renderStageList();

  // ---- album init: build the screen, wire up an entry button on the title ----
  buildAlbumScreen();
  renderAlbumGrid();
  let albumOpenBtn;
  function refreshAlbumButton(){
    if(!albumOpenBtn) return;
    const n = Object.keys(loadAlbum(gameMode)).length;
    const pct = Math.round((n / STAGES.length) * 100);
    albumOpenBtn.innerHTML =
      '<span class="albumBtnLabel">作品アルバム</span>' +
      '<span class="albumProgressTrack"><span class="albumProgressFill" style="width:' + pct + '%"></span></span>' +
      '<span class="albumBtnCount">' + n + ' / ' + STAGES.length + '</span>';
  }
  (function addAlbumOpenButton(){
    albumOpenBtn = document.createElement('button');
    albumOpenBtn.className = 'albumOpenBtn';
    albumOpenBtn.addEventListener('click', () => {
      albumViewMode = gameMode;
      renderAlbumGrid();
      setNavActive('album');
      showScreen(albumScreen);
    });
    // sits between the title and the stage list
    titleScreen.insertBefore(albumOpenBtn, stageList);
    refreshAlbumButton();
  })();

  // ---- difficulty mode toggle ----
  (function addModeToggle(){
    const wrap = document.createElement('div');
    wrap.className = 'modeToggleWrap';
    wrap.innerHTML =
      '<button class="modeBtn" data-mode="easy">EASY</button>' +
      '<button class="modeBtn" data-mode="normal">NORMAL</button>' +
      '<button class="modeBtn" data-mode="hard">HARD</button>';
    const btns = wrap.querySelectorAll('.modeBtn');
    function refresh(){
      btns.forEach(b => b.classList.toggle('active', b.dataset.mode === gameMode));
    }
    btns.forEach(b => b.addEventListener('click', () => {
      setGameMode(b.dataset.mode);
      refresh();
      renderStageList();
      refreshAlbumButton();
    }));
    refresh();
    titleScreen.insertBefore(wrap, stageList);
  })();


  // ---- first-play tutorial -------------------------------------------------
  // Kept as its own small state machine so future app onboarding, unlock
  // explanations and controller-specific hints can be added without touching
  // the carving engine itself.
  const TUTORIAL_STORAGE_KEY = 'kok_tutorial_seen_v1';
  const TUTORIAL_STEPS = [
    {
      kicker:'STEP 1 / 4', title:'針を動かそう',
      body:'画面を指でなぞると、針先が指の少し上についてきます。',
      visual:'needle'
    },
    {
      kicker:'STEP 2 / 4', title:'緑のラインを削ろう',
      body:'型の縁をなぞると緑の線が伸びます。緑を一周つなげれば成功です。',
      visual:'green'
    },
    {
      kicker:'STEP 3 / 4', title:'内側は割れる',
      body:'針先が型の内側へ入ると失敗。外側から縁を狙うのがコツです。',
      visual:'red'
    },
    {
      kicker:'STEP 4 / 4', title:'一周できたら型抜き成功',
      body:'まずはEASY「日の丸」で、カリカリする感触を試してみよう。',
      visual:'clear'
    }
  ];

  function tutorialVisual(kind){
    if(kind === 'needle') return '<div class="tutDemo tutNeedle"><span class="tutFinger"></span><span class="tutShaft"></span><span class="tutTip"></span><span class="tutArrow">↑</span></div>';
    if(kind === 'green') return '<div class="tutDemo"><span class="tutRing base"></span><span class="tutRing progress"></span><span class="tutDot green"></span></div>';
    if(kind === 'red') return '<div class="tutDemo"><span class="tutRing base"></span><span class="tutDot red"></span><span class="tutCrack">×</span></div>';
    return '<div class="tutDemo"><span class="tutRing gold"></span><span class="tutPiece">抜</span><span class="tutSpark s1">✦</span><span class="tutSpark s2">✦</span></div>';
  }

  function renderTutorialStep(){
    if(!tutorialScreen) return;
    const step = TUTORIAL_STEPS[tutorialStep];
    tutorialScreen.querySelector('.tutKicker').textContent = step.kicker;
    tutorialScreen.querySelector('.tutTitle').textContent = step.title;
    tutorialScreen.querySelector('.tutBody').textContent = step.body;
    tutorialScreen.querySelector('.tutVisual').innerHTML = tutorialVisual(step.visual);
    tutorialScreen.querySelector('.tutBack').style.visibility = tutorialStep === 0 ? 'hidden' : 'visible';
    tutorialScreen.querySelector('.tutNext').textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'やってみる' : 'つぎへ';
    tutorialScreen.querySelectorAll('.tutPageDot').forEach((d,i) => d.classList.toggle('active', i === tutorialStep));
  }

  function openTutorial(force){
    if(!tutorialScreen) return;
    if(!force){
      try{ if(localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1') return; }catch(e){}
    }
    tutorialStep = 0;
    renderTutorialStep();
    showScreen(tutorialScreen);
    if(navBar) navBar.classList.add('hidden');
  }

  function finishTutorial(){
    try{ localStorage.setItem(TUTORIAL_STORAGE_KEY, '1'); }catch(e){}
    setGameMode('easy');
    renderStageList();
    refreshAlbumButton();
    startGame(0);
  }

  function buildTutorialScreen(){
    tutorialScreen = document.createElement('div');
    tutorialScreen.id = 'tutorialScreen';
    tutorialScreen.className = 'overlay hidden';
    tutorialScreen.innerHTML = `
      <button class="tutSkip">スキップ</button>
      <div class="tutCard">
        <div class="tutKicker"></div>
        <div class="tutVisual"></div>
        <div class="tutTitle"></div>
        <div class="tutBody"></div>
        <div class="tutDots">${TUTORIAL_STEPS.map((_,i)=>'<span class="tutPageDot" data-i="'+i+'"></span>').join('')}</div>
        <div class="tutActions">
          <button class="tutBack">もどる</button>
          <button class="tutNext">つぎへ</button>
        </div>
      </div>`;
    document.getElementById('stage').appendChild(tutorialScreen);
    tutorialScreen.querySelector('.tutSkip').addEventListener('click', finishTutorial);
    tutorialScreen.querySelector('.tutBack').addEventListener('click', () => {
      tutorialStep = Math.max(0, tutorialStep - 1); renderTutorialStep();
    });
    tutorialScreen.querySelector('.tutNext').addEventListener('click', () => {
      if(tutorialStep < TUTORIAL_STEPS.length - 1){ tutorialStep++; renderTutorialStep(); }
      else finishTutorial();
    });
    tutorialScreen.querySelectorAll('.tutPageDot').forEach(d => d.addEventListener('click', () => {
      tutorialStep = Number(d.dataset.i) || 0; renderTutorialStep();
    }));

    const style = document.createElement('style');
    style.textContent = `
      #tutorialScreen{z-index:80;padding:22px 18px calc(26px + env(safe-area-inset-bottom));background:radial-gradient(circle at 50% 30%,rgba(79,42,78,.96),rgba(10,8,16,.99) 70%);}
      .tutSkip{position:absolute;top:18px;right:18px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:rgba(255,255,255,.72);border-radius:999px;padding:7px 13px;font-weight:700;font-size:11px;}
      .tutCard{width:min(88vw,370px);padding:24px 22px 20px;border-radius:24px;background:linear-gradient(160deg,rgba(47,31,25,.96),rgba(17,12,17,.97));border:1px solid rgba(255,205,120,.34);box-shadow:0 24px 60px rgba(0,0,0,.48);text-align:center;}
      .tutKicker{font-size:10px;letter-spacing:2px;color:#d9a54a;font-weight:900;margin-bottom:8px;}
      .tutVisual{height:190px;display:flex;align-items:center;justify-content:center;}
      .tutTitle{font-family:'Yuji Syuku',serif;font-size:23px;color:#fff4d9;margin:2px 0 8px;}
      .tutBody{font-size:13px;line-height:1.75;color:rgba(255,247,229,.78);min-height:48px;}
      .tutDots{display:flex;justify-content:center;gap:7px;margin:18px 0 14px;}
      .tutPageDot{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.2);transition:.2s;}
      .tutPageDot.active{width:21px;border-radius:999px;background:#ffb347;}
      .tutActions{display:flex;gap:10px;}
      .tutActions button{flex:1;border-radius:14px;padding:12px 8px;font-weight:900;font-size:13px;}
      .tutBack{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#fff4d9;}
      .tutNext{border:none;background:linear-gradient(180deg,#ff9b45,#e86717);color:#1c0e04;box-shadow:0 7px 0 #8f3a0d;transform:translateY(-3px);}
      .tutDemo{position:relative;width:150px;height:150px;}
      .tutRing{position:absolute;inset:18px;border-radius:50%;border:8px solid rgba(255,236,190,.35);}
      .tutRing.progress{border-color:#3fe08a;border-left-color:rgba(255,236,190,.25);filter:drop-shadow(0 0 8px rgba(63,224,138,.65));transform:rotate(18deg);}
      .tutRing.gold{border-color:#ffd77f;box-shadow:0 0 25px rgba(255,190,80,.45);}
      .tutDot{position:absolute;width:18px;height:18px;border-radius:50%;left:66px;top:9px;box-shadow:0 0 12px currentColor;}
      .tutDot.green{background:#3fe08a;color:#3fe08a;}
      .tutDot.red{background:#ff3b3b;color:#ff3b3b;left:57px;top:38px;}
      .tutCrack{position:absolute;left:61px;top:46px;color:#ff3b3b;font-size:34px;font-weight:900;text-shadow:0 0 10px rgba(255,59,59,.7);}
      .tutNeedle .tutFinger{position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(255,210,165,.35);left:51px;bottom:5px;}
      .tutNeedle .tutShaft{position:absolute;width:9px;height:112px;border-radius:9px;background:#d8b978;left:71px;bottom:28px;transform:rotate(-8deg);transform-origin:bottom;}
      .tutNeedle .tutTip{position:absolute;width:18px;height:18px;border-radius:50%;background:#3fe08a;left:58px;top:7px;box-shadow:0 0 16px #3fe08a;}
      .tutArrow{position:absolute;right:8px;top:48px;color:#ffd77f;font-size:34px;animation:tutFloat .8s ease-in-out infinite alternate;}
      .tutPiece{position:absolute;left:49px;top:48px;width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(188,0,45,.88);color:white;font-family:'Yuji Syuku',serif;font-size:22px;animation:tutLift 1.2s ease-in-out infinite alternate;}
      .tutSpark{position:absolute;color:#ffd77f;font-size:24px;animation:tutTwinkle .7s ease-in-out infinite alternate;}.tutSpark.s1{left:16px;top:25px}.tutSpark.s2{right:12px;top:48px;animation-delay:.25s}
      .tutorialReplayBtn{width:min(84vw,320px);margin:0 0 10px;padding:10px 14px;border-radius:14px;border:1px solid rgba(255,205,120,.28);background:rgba(255,255,255,.04);color:#fbf3df;font-weight:800;font-size:12px;letter-spacing:1px;}
      @keyframes tutFloat{to{transform:translateY(-10px)}} @keyframes tutLift{to{transform:translateY(-14px) rotate(4deg)}} @keyframes tutTwinkle{to{opacity:.25;transform:scale(.72)}}
    `;
    document.head.appendChild(style);
    renderTutorialStep();
  }

  function addTutorialReplayButton(){
    const btn = document.createElement('button');
    btn.className = 'tutorialReplayBtn';
    btn.textContent = '遊び方を見る';
    btn.addEventListener('click', () => openTutorial(true));
    titleScreen.insertBefore(btn, stageList);
  }

  // ---- drawing ----
  function draw(){
    ctx.clearRect(0,0,W,H);

    const now = performance.now();
    const isShattering = mode === 'gameover' && shards.length > 0;
    const isDragonSecret = STAGES[currentStageIndex] && STAGES[currentStageIndex].secret;

    // ---- clear "detach" timeline ----
    let liftProgress = 0; // 0..1 across the lift phase only (pause phase = 0)
    if(clearPhaseStart !== null){
      const t = now - clearPhaseStart;
      if(t > CLEAR_PAUSE_MS){
        liftProgress = Math.min(1, (t - CLEAR_PAUSE_MS) / CLEAR_LIFT_MS);
      }
    }
    const liftEase = 1 - Math.pow(1 - liftProgress, 3); // ease-out cubic
    if(liftProgress > 0 && !liftTriggered && !isDragonSecret){
      liftTriggered = true;
      playDetachClick();
      vibrate(16);
      spawnDust();
    }

    // ---- festival celebration timeline (starts once the lift finishes) ----
    let celebT = 0;
    if(clearPhaseStart !== null){
      const tSinceLift = now - (clearPhaseStart + CLEAR_PAUSE_MS + CLEAR_LIFT_MS);
      if(tSinceLift > 0) celebT = Math.min(1, tSinceLift / 900);
    }
    if(celebT > 0 && !celebTriggered){
      celebTriggered = true;
      playCelebrationChime();
      vibrate([0, 12, 40, 12]);
      spawnFireworks(cx - W*0.14, cy - W*0.18, now);
      setTimeout(() => { if(mode === 'clearReveal') spawnFireworks(cx + W*0.15, cy - W*0.11, performance.now()); }, 320);
      setTimeout(() => { if(mode === 'clearReveal') spawnFireworks(cx - W*0.02, cy - W*0.22, performance.now()); }, 640);
    }
    if(celebT >= 0.9 && !albumSaved){
      albumSaved = true;
      // wait one frame so this fully-lit frame (fireworks included) has
      // actually been painted before we grab it as the keepsake image
      requestAnimationFrame(() => {
        try{ saveToAlbum(); }
        catch(e){ showDebugToast('save trigger failed: ' + (e && e.message ? e.message : e)); }
      });
    }
    // gentle float once the piece is fully lifted and the festival opens up
    const celebBob = celebT > 0 ? Math.sin(now / 420) * W*0.012 * celebT : 0;

    // gentle whole-screen zoom that breathes in then back out across the lift
    const zoomScale = clearPhaseStart !== null ? 1 + 0.045 * Math.sin(Math.PI * liftProgress) : 1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-cx, -cy);

    // 龍(secret): PAUSE の間は他ステージと同じく完成した削り跡をそのまま見せ、
    // PAUSE が終わった瞬間にパチスロのフリーズ風の暗転カットを挟んでから、
    // 提灯点灯→龍の発光という夜祭りの reveal に入る。
    const tSincePhaseStart = clearPhaseStart !== null ? (now - clearPhaseStart) : -1;
    const inSecretFreezeOrReveal = isDragonSecret && clearPhaseStart !== null && tSincePhaseStart > CLEAR_PAUSE_MS;
    if(inSecretFreezeOrReveal){
      const freezeT = (tSincePhaseStart - CLEAR_PAUSE_MS) / DRAGON_FREEZE_MS;
      if(freezeT < 1){
        if(!freezeTriggered){
          freezeTriggered = true;
          playDetachClick();
          vibrate([0, 10, 30, 40]);
          // 内部的にここで型抜き画像(削り跡データ)をリセットする
          erosion.fill(0);
          fullyEroded.fill(0);
          erodedCount = 0;
        }
        drawDragonShutdownFreeze(Math.min(1, Math.max(0, freezeT)));
      } else {
        const revealT2 = Math.min(1, (tSincePhaseStart - CLEAR_PAUSE_MS - DRAGON_FREEZE_MS) /
          Math.max(1, CLEAR_LIFT_MS - DRAGON_FREEZE_MS));
        drawDragonSecretBackdrop(revealT2, celebT, now, true);
      }
    } else if(celebT > 0){
      drawFestivalScene(celebT, now);
    } else {
    // surrounding candy: drawn as 360 individual wedges (one per bucket) so
    // each one can crumble away independently as the player carves past it,
    // instead of the whole plate fading uniformly. The outer rim follows a
    // rounded square rather than a circle.
    const grad = ctx.createRadialGradient(cx, cy - plateR*0.2, plateR*0.1, cx, cy, plateR*1.18);
    grad.addColorStop(0, '#fffaf0');
    grad.addColorStop(1, '#e7d9ad');
    if(shapePts.length === N_BUCKETS){
      for(let i = 0; i < N_BUCKETS; i++){
        const innerR = targetRCache[i];
        const edgeR = plateEdgeCache[i];

        // BUILD 60 visual assist: EASY makes the surrounding shell collapse
        // farther around the traced point than the actual progress buckets.
        // This is presentation only. Completion still uses fullyEroded[], so
        // the game stays honest while the plate stops feeling like busywork.
        let visualErosion = erosion[i];
        if(gameMode === 'easy' && visualErosion < 1){
          const VISUAL_SPREAD = 7;
          for(let d = 1; d <= VISUAL_SPREAD; d++){
            const left = erosion[(i - d + N_BUCKETS) % N_BUCKETS];
            const right = erosion[(i + d) % N_BUCKETS];
            const neighbor = Math.max(left, right);
            if(neighbor <= 0) continue;
            const falloff = 1 - (d / (VISUAL_SPREAD + 1));
            visualErosion = Math.max(visualErosion, neighbor * (0.72 + 0.28 * falloff));
          }
          if(visualErosion > 0.82) visualErosion = 1;
        }
        const outerR = edgeR - (edgeR - innerR) * visualErosion;
        if(outerR <= innerR + 0.5) continue; // that wedge's candy is fully gone
        const a0 = (i / N_BUCKETS) * Math.PI * 2;
        const a1 = ((i + 1.02) / N_BUCKETS) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + innerR*Math.cos(a0), cy + innerR*Math.sin(a0));
        ctx.lineTo(cx + outerR*Math.cos(a0), cy + outerR*Math.sin(a0));
        ctx.lineTo(cx + outerR*Math.cos(a1), cy + outerR*Math.sin(a1));
        ctx.lineTo(cx + innerR*Math.cos(a1), cy + innerR*Math.sin(a1));
        ctx.arc(cx, cy, innerR, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        if(outerR < edgeR - 1){
          // a crumbling wedge shows a rougher, darker broken edge
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(120,60,20,0.4)';
          ctx.beginPath();
          ctx.moveTo(cx + outerR*Math.cos(a0), cy + outerR*Math.sin(a0));
          ctx.lineTo(cx + outerR*Math.cos(a1), cy + outerR*Math.sin(a1));
          ctx.stroke();
        }
        if(erosion[i] < EROSION_DONE && erodedCount / N_BUCKETS > 0.9){
          // Close to finished — a bright pulsing outline so even a hair-thin
          // remaining sliver (easy to miss in a tricky concave spot) stays
          // clearly visible instead of disappearing to the eye. Only shown
          // near the end so it doesn't distract during normal play.
          const pulse = 0.5 + 0.5 * Math.sin(now / 220);
          ctx.save();
          ctx.globalAlpha = 0.55 + 0.35 * pulse;
          ctx.lineWidth = 2.4;
          ctx.strokeStyle = 'rgba(255,205,60,1)';
          ctx.shadowColor = 'rgba(255,205,60,0.9)';
          ctx.shadowBlur = 6 + 4*pulse;
          ctx.beginPath();
          ctx.moveTo(cx + outerR*Math.cos(a0), cy + outerR*Math.sin(a0));
          ctx.lineTo(cx + outerR*Math.cos(a1), cy + outerR*Math.sin(a1));
          ctx.stroke();
          ctx.restore();
        }
      }
    } else if(plateEdgePath){
      // fallback (very first frame before the stage cache exists)
      ctx.fillStyle = grad;
      ctx.fill(plateEdgePath);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(120,90,40,0.18)';
    if(plateEdgePath) ctx.stroke(plateEdgePath);

    // BUILD 61 trace map: keep the mold edge visible at all times.
    // Completed buckets stay green, unfinished buckets remain as a faint guide,
    // and the last hidden gaps pulse yellow near completion. This is display
    // only; the real clear judgment still comes from fullyEroded[].
    if(mode === 'playing' && shapePts.length === N_BUCKETS){
      const completion = erodedCount / N_BUCKETS;
      const pulse = 0.5 + 0.5 * Math.sin(now / 210);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for(let i = 0; i < N_BUCKETS; i++){
        const j = (i + 1) % N_BUCKETS;
        const p0 = shapePts[i];
        const p1 = shapePts[j];
        const done = fullyEroded[i] === 1 || erosion[i] >= EROSION_DONE;

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);

        if(done){
          ctx.lineWidth = Math.max(2.8, W * 0.009);
          ctx.strokeStyle = 'rgba(63,224,138,0.96)';
          ctx.shadowColor = 'rgba(63,224,138,0.72)';
          ctx.shadowBlur = W * 0.012;
        }else if(completion >= 0.88){
          ctx.globalAlpha = 0.68 + 0.30 * pulse;
          ctx.lineWidth = Math.max(3.2, W * 0.010);
          ctx.strokeStyle = 'rgba(255,210,63,1)';
          ctx.shadowColor = 'rgba(255,210,63,0.9)';
          ctx.shadowBlur = W * (0.012 + 0.008 * pulse);
        }else{
          ctx.globalAlpha = 1;
          ctx.lineWidth = Math.max(1.7, W * 0.0055);
          ctx.strokeStyle = 'rgba(110,82,38,0.48)';
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // candy-shell fragments knocked loose as the surrounding candy chips away
    if(chipFrags.length){
      const g = W * 0.7;
      chipFrags = chipFrags.filter(f => (now - f.born) < 550);
      chipFrags.forEach(f => {
        const ts = (now - f.born) / 1000;
        const a = Math.max(0, 1 - ts/0.55);
        const x = f.x + f.vx*ts;
        const y = f.y + f.vy*ts + 0.5*g*ts*ts;
        ctx.beginPath();
        ctx.arc(x, y, f.size, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(231,217,173,' + (a*0.9) + ')';
        ctx.fill();
      });
    }
    }

    // the socket left behind once the piece starts lifting free (fades out
    // once the festival scene takes over — there's no more candy to show a hole in)
    if(!isShattering && shapePath && liftEase > 0 && celebT < 1){
      ctx.save();
      ctx.globalAlpha = 0.85 * liftEase * (1 - celebT);
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
      const liftPx = maxLiftPx * liftEase + celebBob;
      const tiltRad = (6 * Math.PI/180) * liftTiltSign * liftEase;

      ctx.save();
      ctx.translate(cx, cy - liftPx);
      ctx.rotate(tiltRad);
      ctx.translate(-cx, -cy);

      const stageImg = clearImages[STAGES[currentStageIndex].name];
      const useImage = celebT > 0 && stageImg && stageImg.loaded;
      const secretImageAlpha = isDragonSecret ? Math.min(1, celebT * 1.45) : celebT;

      // Stage 0 (日の丸): once cleared, fade in a crisp white flag field
      // behind the red disc so it reads as an actual flag being revealed
      // (skipped once a real illustration takes over for this stage).
      if(currentStageIndex === 0 && liftEase > 0 && !useImage){
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
      // a fully solid, glossy "real" surface as it lifts free. Once the
      // festival celebration opens up, swap in the real illustration for
      // this stage if it's been uploaded — clipped exactly to the shape.
      if(useImage){
        ctx.save();
        ctx.clip(shapePath);
        ctx.globalAlpha = secretImageAlpha;
        const align = clearImageAlign[STAGES[currentStageIndex].name];
        if(align) drawImageAligned(stageImg.img, align);
        else drawImageCover(stageImg.img, cx, cy, R * 2.5);
        ctx.restore();
      } else {
        const fillRGB = STAGES[currentStageIndex].fill;
        const baseAlpha = 0.10 + 0.55 * (erodedCount/N_BUCKETS);
        const alpha = baseAlpha + (1 - baseAlpha) * liftEase;
        ctx.fillStyle = 'rgba(' + fillRGB + ',' + alpha + ')';
        ctx.fill(shapePath);
      }

      if(liftEase > 0 && !useImage){
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

      // golden glowing rim once the festival scene has opened up — this is
      // the "your own mold made this world appear" moment
      if(celebT > 0){
        ctx.save();
        ctx.globalAlpha = celebT;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,225,150,0.95)';
        ctx.shadowColor = 'rgba(255,200,110,0.95)';
        ctx.shadowBlur = W*(isDragonSecret ? 0.065 : 0.035) * celebT;
        ctx.lineWidth = W*(isDragonSecret ? 0.015 : 0.01);
        ctx.stroke(shapePath);
        ctx.shadowBlur = 0;
        ctx.restore();
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

      // glowing tip skin (the actual judgment remains the center point)
      drawTipMarker(needle.x, needle.y, W*0.015, col);
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

    // crack effect — generated once at failure, so it no longer flickers
    if(mode === 'gameover' && failPoint && failCracks.length){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,59,59,0.85)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      failCracks.forEach(crack => {
        const ex = failPoint.x + Math.cos(crack.angle) * crack.length;
        const ey = failPoint.y + Math.sin(crack.angle) * crack.length;
        ctx.beginPath();
        ctx.moveTo(failPoint.x, failPoint.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if(crack.branch){
          const bx = failPoint.x + Math.cos(crack.angle) * crack.length * 0.55;
          const by = failPoint.y + Math.sin(crack.angle) * crack.length * 0.55;
          const branchAngle = crack.angle + crack.branchSide * 0.55;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(
            bx + Math.cos(branchAngle) * crack.length * 0.28,
            by + Math.sin(branchAngle) * crack.length * 0.28
          );
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // festival fireworks — radiating streaks that expand and fade, with a
    // bright core flash and glowing tips for a richer burst
    if(fireworks.length){
      fireworks = fireworks.filter(fw => (now - fw.born) < 950);
      fireworks.forEach(fw => {
        const t = (now - fw.born) / 950;
        const alpha = Math.max(0, 1 - t);
        const dist = t * W * 0.32;

        if(t < 0.18){
          const flashA = (1 - t/0.18) * 0.8;
          ctx.beginPath();
          ctx.arc(fw.x, fw.y, W*0.05, 0, Math.PI*2);
          ctx.fillStyle = 'rgba(255,250,235,' + flashA + ')';
          ctx.fill();
        }

        fw.particles.forEach(p => {
          const x1 = fw.x + Math.cos(p.ang) * dist * p.speed;
          const y1 = fw.y + Math.sin(p.ang) * dist * p.speed;
          const x0 = fw.x + Math.cos(p.ang) * dist * p.speed * 0.68;
          const y0 = fw.y + Math.sin(p.ang) * dist * p.speed * 0.68;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(' + p.color + ',' + alpha + ')';
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x1, y1, W*0.004, 0, Math.PI*2);
          ctx.fillStyle = 'rgba(' + p.color + ',' + alpha + ')';
          ctx.shadowColor = 'rgba(' + p.color + ',0.9)';
          ctx.shadowBlur = W*0.018;
          ctx.fill();
          ctx.shadowBlur = 0;
        });
      });
    }

    ctx.restore(); // zoom

    // brief bright flash the instant the festival scene opens up
    if(clearPhaseStart !== null){
      const tSinceLift = now - (clearPhaseStart + CLEAR_PAUSE_MS + CLEAR_LIFT_MS);
      if(tSinceLift >= 0 && tSinceLift < 220){
        const flashA = Math.max(0, 1 - tSinceLift/220) * 0.55;
        ctx.fillStyle = 'rgba(255,247,225,' + flashA + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }


  // パチスロのフリーズ演出のような、型抜き完成の瞬間にプチュンと画面が
  // 落ちる暗転カット。t: 0..1。前半は一瞬の白フラッシュ(電力サージ風)、
  // 後半は画面が横一本の輝線に収縮して消える、ブラウン管の電源断のような動き。
  function drawDragonShutdownFreeze(t){
    ctx.save();
    if(t < 0.22){
      const flashT = t / 0.22;
      const a = Math.sin(flashT * Math.PI); // 0 -> 1 -> 0, 一瞬だけ光る
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,' + (a*0.92).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    } else {
      const cT = (t - 0.22) / 0.78; // 0..1 収縮フェーズ
      const ease = cT*cT; // 加速しながら潰れる
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const lineW = Math.max(0, W * 1.05 * (1 - ease));
      const lineH = Math.max(0.6, H * 0.05 * (1 - cT));
      ctx.globalAlpha = Math.max(0, 1 - cT * 0.25);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#bfe8ff';
      ctx.shadowBlur = W * 0.05 * (1 - cT);
      ctx.fillRect(cx - lineW/2, cy - lineH/2, lineW, lineH);
    }
    ctx.restore();
  }

  function drawDragonSecretBackdrop(revealT, celebT, now, instantDark){
    ctx.save();
    const dark = instantDark ? 1 : Math.min(1, revealT / 0.28);
    const bg = ctx.createRadialGradient(cx, cy, R*0.1, cx, cy, plateR*1.55);
    bg.addColorStop(0, 'rgba(18,8,10,' + dark + ')');
    bg.addColorStop(0.58, 'rgba(5,4,12,' + dark + ')');
    bg.addColorStop(1, 'rgba(0,0,4,' + dark + ')');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    // Lanterns ignite one after another before the dragon appears.
    const lanternBase = Math.max(0, Math.min(1, (revealT - 0.18) / 0.48));
    const pulse = 0.88 + Math.sin(now/240)*0.12;
    const lanterns = [
      {x:cx-W*0.30,y:cy-W*0.17,delay:0},
      {x:cx+W*0.30,y:cy-W*0.17,delay:0.16},
      {x:cx-W*0.37,y:cy+W*0.10,delay:0.27},
      {x:cx+W*0.37,y:cy+W*0.10,delay:0.38}
    ];
    lanterns.forEach((l, idx) => {
      const lit = Math.max(0, Math.min(1, (lanternBase - l.delay) / 0.34));
      if(lit <= 0) return;
      const glow = ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,W*0.13);
      glow.addColorStop(0,'rgba(255,185,70,'+(0.42*lit*pulse)+')');
      glow.addColorStop(1,'rgba(255,110,20,0)');
      ctx.fillStyle=glow;
      ctx.beginPath(); ctx.arc(l.x,l.y,W*0.13,0,Math.PI*2); ctx.fill();

      ctx.save();
      ctx.translate(l.x,l.y);
      ctx.globalAlpha=lit;
      ctx.fillStyle='#ff7a24';
      ctx.shadowColor='#ffb347';
      ctx.shadowBlur=W*0.045;
      ctx.beginPath();
      ctx.ellipse(0,0,W*0.035,W*0.052,0,0,Math.PI*2);
      ctx.fill();
      ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(255,225,150,.85)';
      ctx.lineWidth=1.4;
      for(let k=-1;k<=1;k++){
        ctx.beginPath();
        ctx.moveTo(k*W*0.013,-W*0.047);
        ctx.quadraticCurveTo(k*W*0.022,0,k*W*0.013,W*0.047);
        ctx.stroke();
      }
      ctx.fillStyle='#d79b3a';
      ctx.fillRect(-W*0.025,-W*0.057,W*0.05,W*0.009);
      ctx.fillRect(-W*0.025,W*0.048,W*0.05,W*0.009);
      ctx.beginPath();
      ctx.moveTo(0,W*0.057); ctx.lineTo(0,W*0.083); ctx.stroke();
      ctx.restore();
    });

    // A dim golden halo anticipates the dragon before the illustration fades in.
    const dragonGlow = Math.max(0, Math.min(1, (revealT - 0.48) / 0.45));
    if(dragonGlow > 0 && shapePath){
      ctx.save();
      ctx.globalAlpha = dragonGlow * (0.55 + 0.2*Math.sin(now/180));
      ctx.lineWidth = W*0.018;
      ctx.strokeStyle = 'rgba(255,176,55,.95)';
      ctx.shadowColor = 'rgba(255,100,20,1)';
      ctx.shadowBlur = W*0.055;
      ctx.stroke(shapePath);
      ctx.restore();
    }

    if(celebT > 0.15){
      const titleA = Math.min(1,(celebT-0.15)/0.45);
      ctx.save();
      ctx.globalAlpha=titleA;
      ctx.textAlign='center';
      ctx.font='900 '+Math.round(W*0.048)+'px serif';
      ctx.fillStyle='#ffe2a0';
      ctx.shadowColor='#ff6b1a';
      ctx.shadowBlur=18;
      ctx.fillText('DRAGON AWAKENED',cx,cy+plateR*1.24);
      ctx.restore();
    }
    ctx.restore();
  }

  // A procedural night-festival backdrop: deep gradient sky, a distant torii
  // gate for depth, a string of layered-glow lanterns, warmly-lit stalls and
  // onlookers — drawn to replace the candy plate once a stage is cleared.
  function drawFestivalScene(celebT, now){
    const a = celebT;
    ctx.save();
    ctx.globalAlpha = a;

    const skyR = plateR * 1.35;

    if(festivalBg.loaded){
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, skyR, 0, Math.PI*2);
      ctx.clip();
      drawImageCover(festivalBg.img, cx, cy, skyR * 2.05);
      ctx.restore();
      ctx.restore();
      return;
    }

    const sky = ctx.createRadialGradient(cx, cy - skyR*0.15, skyR*0.1, cx, cy, skyR*1.05);
    sky.addColorStop(0, '#3a2668');
    sky.addColorStop(0.42, '#26184f');
    sky.addColorStop(0.75, '#3d2258');
    sky.addColorStop(1, '#7a3350');
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI*2);
    ctx.fillStyle = sky;
    ctx.fill();

    // a warm horizon glow near the bottom, like distant festival light
    const horizon = ctx.createRadialGradient(cx, cy + skyR*0.55, skyR*0.05, cx, cy + skyR*0.55, skyR*0.85);
    horizon.addColorStop(0, 'rgba(255,150,80,0.35)');
    horizon.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI*2);
    ctx.fillStyle = horizon;
    ctx.fill();

    // distant torii gate — a simple iconic silhouette for depth/place
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    const tx = cx, ty = cy + skyR*0.18, tw = skyR*0.30, th = skyR*0.34;
    ctx.strokeStyle = 'rgba(15,8,20,0.9)';
    ctx.lineWidth = skyR*0.028;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx - tw*0.42, ty + th); ctx.lineTo(tx - tw*0.5, ty - th*0.15);
    ctx.moveTo(tx + tw*0.42, ty + th); ctx.lineTo(tx + tw*0.5, ty - th*0.15);
    ctx.moveTo(tx - tw*0.62, ty - th*0.25); ctx.lineTo(tx + tw*0.62, ty - th*0.25);
    ctx.moveTo(tx - tw*0.55, ty - th*0.45); ctx.lineTo(tx + tw*0.55, ty - th*0.45);
    ctx.stroke();
    ctx.restore();

    // lanterns strung along the top, warm layered glow (bloom via 2 passes)
    const nLan = 6;
    for(let i = 0; i < nLan; i++){
      const t = (i + 0.5) / nLan;
      const lx = cx - skyR*0.78 + t * skyR*1.56;
      const ly = cy - skyR*0.60 + Math.sin(t*Math.PI)*skyR*0.08;
      const hue = i % 2 === 0 ? '255,140,60' : '255,95,95';
      // outer soft bloom
      ctx.beginPath();
      ctx.ellipse(lx, ly, skyR*0.10, skyR*0.13, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(' + hue + ',0.22)';
      ctx.fill();
      // lantern body
      ctx.beginPath();
      ctx.ellipse(lx, ly, skyR*0.052, skyR*0.072, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(' + hue + ',0.97)';
      ctx.shadowColor = 'rgba(' + hue + ',1)';
      ctx.shadowBlur = skyR*0.09;
      ctx.fill();
      ctx.shadowBlur = 0;
      // thin cap lines top/bottom
      ctx.strokeStyle = 'rgba(30,15,10,0.6)';
      ctx.lineWidth = skyR*0.006;
      ctx.beginPath();
      ctx.moveTo(lx - skyR*0.03, ly - skyR*0.065); ctx.lineTo(lx + skyR*0.03, ly - skyR*0.065);
      ctx.moveTo(lx - skyR*0.03, ly + skyR*0.065); ctx.lineTo(lx + skyR*0.03, ly + skyR*0.065);
      ctx.stroke();
    }

    // stalls near the bottom, with a warm lit-interior glow
    for(let i = 0; i < 3; i++){
      const sx = cx - skyR*0.55 + i * skyR*0.55;
      const sy = cy + skyR*0.78;
      const sw = skyR*0.30, sh = skyR*0.22;
      ctx.beginPath();
      ctx.ellipse(sx, sy - sh*0.5, sw*0.75, sh*0.9, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,150,70,0.16)';
      ctx.fill();
      ctx.fillStyle = 'rgba(20,14,28,0.88)';
      ctx.fillRect(sx - sw/2, sy - sh, sw, sh);
      ctx.fillStyle = 'rgba(255,170,90,0.55)';
      ctx.fillRect(sx - sw*0.42, sy - sh*0.92, sw*0.84, sh*0.14);
      ctx.beginPath();
      ctx.moveTo(sx - sw*0.62, sy - sh);
      ctx.lineTo(sx, sy - sh*1.55);
      ctx.lineTo(sx + sw*0.62, sy - sh);
      ctx.closePath();
      ctx.fillStyle = 'rgba(20,14,28,0.88)';
      ctx.fill();
    }

    // small onlooker silhouettes
    for(let i = 0; i < 4; i++){
      const px = cx - skyR*0.5 + i * skyR*0.33 + Math.sin(i*2)*skyR*0.03;
      const py = cy + skyR*0.92;
      const ph = skyR*0.11;
      ctx.fillStyle = 'rgba(15,10,20,0.8)';
      ctx.beginPath();
      ctx.arc(px, py - ph, ph*0.32, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - ph*0.28, py);
      ctx.quadraticCurveTo(px, py - ph*0.85, px + ph*0.28, py);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function loop(){
    rafId = null;
    if(mode === 'playing'){
      if(startTime !== null){
        elapsed = (performance.now() - startTime) / 1000;
        timerEl.textContent = elapsed.toFixed(1) + 's';
      }
      draw();
      rafId = requestAnimationFrame(loop);
      return;
    }
    if(mode === 'gameover' || mode === 'clearReveal'){
      draw();
      rafId = requestAnimationFrame(loop);
    }
  }

  // ---- ランキング・マイページ・ナビゲーション init ----
  function setNavActive(which){
    if(!navBar) return;
    navBar.querySelectorAll('.navBtn').forEach(b => b.classList.toggle('active', b.dataset.nav === which));
  }
  buildTutorialScreen();
  addTutorialReplayButton();
  buildRankingScreen();
  buildMyPageScreen();
  buildNavBar();
  refreshMyPage();
  // seed the ranking cache with any best times already saved from before
  // this feature existed, across every stage and mode
  ['easy','normal','hard'].forEach(m => {
    const album = loadAlbum(m);
    Object.keys(album).forEach(key => setPlayerRankingEntry(key, m, album[key].time));
  });

  // Backfill the reward for players who had already completed NORMAL
  // before this build was installed. It equips silently on first load.
  syncTipRewardsFromProgress();
  // Backfill the HARD reward for existing full-HARD clear data.
  syncAlbumFrameRewardFromProgress();
  if(devSettings.starTip) selectedTipSkin = 'star';

  // Small on-screen build tag — purely so it's possible to confirm at a
  // glance (no dev tools needed) whether the deployed script.js is actually
  // this version. Bump BUILD_TAG any time a new script.js is handed off.
  const BUILD_TAG = 'BUILD 79 — DRAGON CREST: readable radial mold';
  const buildTagEl = document.createElement('div');
  buildTagEl.textContent = BUILD_TAG;
  buildTagEl.style.cssText = 'position:fixed; bottom:4px; right:6px; font-size:10px; ' +
    'color:rgba(255,255,255,0.4); z-index:9999; font-family:sans-serif; pointer-events:none;';
  document.body.appendChild(buildTagEl);

  canvas.style.pointerEvents = 'none'; // page loads straight into the title screen
  resize();
  setTimeout(() => openTutorial(false), 180);
})();
