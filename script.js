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
  function pinwheelRadius(theta, Rb){
    const deg = ((theta * 180 / Math.PI) + 360) % 360;
    const idx = Math.round(deg) % 360;
    return Rb * KAZAGURUMA_SHAPE_RATIOS[idx];
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


  // ---- stage unlock progression (BUILD 59) ----
  // EASY starts with stages 1-5 open. From stage 6 onward, each stage opens
  // after the previous EASY stage is cleared. NORMAL and HARD open per stage
  // once that same stage has been cleared on EASY.
  const EASY_INITIAL_UNLOCK_COUNT = 5; // 日の丸〜提灯
  function isStageUnlocked(stageIndex, modeKey){
    const m = modeKey || gameMode;
    if(stageIndex < 0 || stageIndex >= STAGES.length) return false;
    const easyAlbum = loadAlbum('easy');
    if(m === 'easy'){
      if(stageIndex < EASY_INITIAL_UNLOCK_COUNT) return true;
      const prev = STAGES[stageIndex - 1];
      return !!(prev && easyAlbum[prev.key]);
    }
    const stage = STAGES[stageIndex];
    return !!(stage && easyAlbum[stage.key]);
  }
  function unlockMessage(stageIndex, modeKey){
    const m = modeKey || gameMode;
    if(m === 'easy') return '前のEASYステージをクリアで解放';
    return 'このステージのEASYクリアで解放';
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
      return STAGES.every(s => !!album[s.key]);
    });
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
      const rec = album[s.key];
      const card = document.createElement('button');
      card.className = 'albumCard' + (rec ? '' : ' locked');
      if(rec){
        const photo = rec.image
          ? `<img src="${rec.image}" alt="${s.name}">`
          : `<span class="albumNoPhoto" style="background:rgba(${s.fill},0.35)">記録のみ</span>`;
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
    const photo = rec.image
      ? `<img class="albumDetailImg" src="${rec.image}" alt="${rec.name}">`
      : `<div class="albumDetailImg albumNoPhotoBig" style="background:rgba(${stage.fill},0.35)">写真は保存容量の都合で<br>今回は残せませんでした</div>`;
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
    `;
    document.getElementById('stage').appendChild(myPageScreen);
    const input = myPageScreen.querySelector('#mpNameInput');
    input.addEventListener('change', () => {
      const v = input.value.trim().slice(0, 12);
      profile.name = v || DEFAULT_PROFILE.name;
      saveProfile();
      refreshMyPage();
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
      #albumScreen{ padding: 20px 18px calc(90px + env(safe-area-inset-bottom)); overflow-y:auto; align-items:stretch; justify-content:flex-start; }
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
      .albumCard img{ width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:10px; }
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

      #albumDetail{ padding:24px; }
      .albumDetailImg{ width:min(78vw,340px); aspect-ratio:1/1; object-fit:cover; border-radius:18px; margin-bottom:14px; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
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
      .stageListCredit{
        text-align:center; font-size:11px; letter-spacing:2px;
        color:rgba(251,243,223,0.4); margin-top:14px; padding-bottom:10px;
        font-family:'Zen Kaku Gothic New', sans-serif;
      }
    `;
    document.head.appendChild(style);
  })();

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
    { name:'金魚',     key:'kingyo',     shapeFn:goldfishRadius,   fill:'255,120,70', difficulty:5 }
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
    '風鈴': { cxImg: 511.1, cyImg: 436.3, rImg: 236.5 }
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
      const unlocked = isStageUnlocked(i, gameMode);
      const rec = album[s.key];
      const btn = document.createElement('button');
      btn.className = 'stageBtn' + (rec ? ' isCleared' : '') + (unlocked ? '' : ' isLocked');
      btn.disabled = !unlocked;
      const stars = '★'.repeat(s.difficulty) + '☆'.repeat(5 - s.difficulty);
      const bestTime = rec ? rec.time.toFixed(2) + 's' : '--';
      const lockLine = unlocked ? '' : '<span class="stageLockText">' + unlockMessage(i, gameMode) + '</span>';
      btn.innerHTML =
        '<span class="num">' + (i+1) + '</span>' +
        '<canvas class="thumb"></canvas>' +
        '<span class="stageInfo">' +
          '<span class="stageName">' + s.name + '</span>' +
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
  let rafId = null;
  let shards = [];
  let shardBornAt = 0;
  let clearPhaseStart = null; // timestamp when the clear "detach" sequence began
  let liftTiltSign = 1;
  let liftTriggered = false;
  let celebTriggered = false;
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
    startTime = null;
    elapsed = 0;
    failPoint = null;
    shards = [];
    clearPhaseStart = null;
    liftTriggered = false;
    celebTriggered = false;
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
    needleName.textContent = STAGES[currentStageIndex].name;
    showScreen(null);
    hud.classList.remove('hidden');
    legend.classList.remove('hidden');
    navBar.classList.add('hidden');
    loop();
  }

  function goToStageSelect(){
    mode = 'title';
    hud.classList.add('hidden');
    legend.classList.add('hidden');
    navBar.classList.remove('hidden');
    setNavActive('play');
    renderStageList();
    showScreen(titleScreen);
  }

  function gameOver(x, y){
    mode = 'gameover';
    sessionFailCount++;
    profile.totalFails++;
    saveProfile();
    failPoint = {x, y};
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
      showScreen(gameoverScreen);
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
    albumSaved = false;
    fireworks = [];
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

  // ハードモード: free scraping — no snapping, the surrounding candy wears
  // away wherever the tip actually reaches, breaching the mold fails.
  function handleMoveHard(tip){
    needle = tip;
    const dx = tip.x - cx, dy = tip.y - cy;
    const dist = Math.hypot(dx, dy);
    if(dist < 0.001) return;
    const angleDeg = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const edgeR = plateEdgeCache[bucket];

    // Breaching the mold's edge — zero tolerance in HARD mode. The true
    // outline is the wall; there's no give on the inside at all.
    if(dist < targetR){
      currentState = 'red';
      gameOver(tip.x, tip.y);
      return;
    }

    const now = performance.now();
    let scraped = false;

    // ---- score-then-break model (matches real katanuki) ----
    // The needle scores the candy at its own position. After a few
    // kari-kari ticks at roughly the same depth, the candy OUTSIDE that
    // exact point snaps off — so the visible removal and flying debris
    // happen precisely at the needle tip, never at some distant edge.
    const BREAK_TICKS = 4; // scoring passes needed before a piece snaps off
    const BRUSH_RADIUS = 0; // BUILD 58: only the bucket directly under the needle is scored
    for(let i = -BRUSH_RADIUS; i <= BRUSH_RADIUS; i++){
      const b = (bucket + i + N_BUCKETS) % N_BUCKETS;
      const strength = i === 0 ? 1 : 0.5; // full right under the tip, half just beside it
      const bTarget = targetRCache[b];
      const bEdge = plateEdgeCache[b];
      if(dist < bTarget - 0.5) continue; // inside that bucket's mold — skip, not a fail
      const span = bEdge - bTarget;
      const curSurf = bEdge - span * erosion[b]; // current outer surface of remaining candy
      if(dist > curSurf + 1) continue; // in open air beyond the candy — nothing to score
      if(now - lastErodeAt[b] < EROSION_TICK_MS) continue; // pace the scraping rate

      lastErodeAt[b] = now;
      scraped = true;
      cutAccum[b] += strength / BREAK_TICKS;
      if(Math.random() < 0.25) spawnChipFragment(b, now, dist); // fine dust while scoring

      if(cutAccum[b] >= 1){
        cutAccum[b] = 0;
        // the piece outside the scored line snaps off: the surface drops
        // to exactly where the needle is. Very close to the mold counts
        // as fully cleared so a hair-thin film can't linger invisibly.
        let newErosion = (bEdge - dist) / span;
        if(dist - bTarget < span * 0.12) newErosion = 1;
        if(newErosion > erosion[b]){
          const wasDone = erosion[b] >= EROSION_DONE;
          erosion[b] = Math.min(1, newErosion);
          strokeHasCarved = true;
          if(!wasDone && erosion[b] >= EROSION_DONE && !fullyEroded[b]){
            fullyEroded[b] = 1;
            erodedCount++;
          }
          // the actual break — a burst of debris right at the cut
          spawnChipFragment(b, now, dist);
          spawnChipFragment(b, now, Math.min(bEdge, dist + span*0.2));
          playChipBreak();
          vibrate(9);
        }
      }
    }

    currentState = scraped ? 'green' : 'yellow';

    if(scraped){
      updateProgress();

      // continuous "kari-kari" scratch sound + light vibration while scoring
      if(now - lastScratchAt > 90){
        lastScratchAt = now;
        playScratch();
        vibrate(5);
      }

      // Clear condition is intentionally strict: every bucket's candy must
      // be fully scraped away. No partial-completion shortcut.
      if(erodedCount >= N_BUCKETS){
        elapsed = (performance.now() - startTime) / 1000;
        clearGame();
      }
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
    const innerWarning = safeBand * 0.42;
    const innerFail = safeBand * 1.05;

    if(rawDiff < -innerFail){
      needle = rawTip;
      if(currentState !== 'red'){ currentState = 'red'; vibrate(40); }
      gameOver(rawTip.x, rawTip.y);
      return;
    }

    const magnetRange = safeBand * 2.5;
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
    // BUILD 60: EASY clears a wider five-bucket trail. The player should
    // be able to follow the outline once without doing fussy cleanup passes.
    // Judgment remains based on the needle tip, but completion is generous.
    for(let i = -2; i <= 2; i++){
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

  // ノーマルモード: the same gentle line-tracing feel as Easy, but the safe
  // line sits exactly on the mold's outer edge — any dip inside is instant
  // out, no shallow-warning buffer. Outside stays exactly as forgiving.
  function handleMoveNormal(rawTip){
    const dx0 = rawTip.x - cx, dy0 = rawTip.y - cy;
    const dist0 = Math.hypot(dx0, dy0);
    if(dist0 < 0.001){ needle = rawTip; return; }
    const angleDeg = ((Math.atan2(dy0, dx0) * 180 / Math.PI) + 360) % 360;
    const bucket = Math.round(angleDeg) % N_BUCKETS;
    const targetR = targetRCache[bucket];
    const rawDiff = dist0 - targetR;

    // Judge the real, unassisted tip first. Magnetism must never rescue
    // a genuine inside breach.
    if(rawDiff < 0){
      needle = rawTip;
      if(currentState !== 'red'){ currentState = 'red'; vibrate(40); }
      gameOver(rawTip.x, rawTip.y);
      return;
    }

    const magnetRange = safeBand * 2.2;
    let snappedDist = dist0;
    if(rawDiff <= magnetRange){
      const proximity = 1 - rawDiff / magnetRange;
      snappedDist = Math.max(targetR, dist0 - rawDiff * proximity * proximity * 0.52);
    }
    const tip = { x: cx + dx0/dist0*snappedDist, y: cy + dy0/dist0*snappedDist };
    needle = tip;
    const newState = (snappedDist - targetR <= safeBand) ? 'green' : 'yellow';
    if(newState !== currentState){
      currentState = newState;
      vibrate(newState === 'green' ? [0,12] : 5);
    }
    if(newState !== 'green') return;

    const now = performance.now();
    let scraped = false;
    // BUILD 58: NORMAL removes only the exact angular bucket touched by
    // the needle tip. This makes the outside candy peel away as a thin,
    // precise trail instead of disappearing in a three-degree band.
    {
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

    if(celebT > 0){
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
        ctx.globalAlpha = celebT;
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
        ctx.shadowBlur = W*0.035 * celebT;
        ctx.lineWidth = W*0.01;
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

  // Small on-screen build tag — purely so it's possible to confirm at a
  // glance (no dev tools needed) whether the deployed script.js is actually
  // this version. Bump BUILD_TAG any time a new script.js is handed off.
  const BUILD_TAG = 'BUILD 60 — EASY SNAP: wider trace, faster outer-shell collapse';
  const buildTagEl = document.createElement('div');
  buildTagEl.textContent = BUILD_TAG;
  buildTagEl.style.cssText = 'position:fixed; bottom:4px; right:6px; font-size:10px; ' +
    'color:rgba(255,255,255,0.4); z-index:9999; font-family:sans-serif; pointer-events:none;';
  document.body.appendChild(buildTagEl);

  canvas.style.pointerEvents = 'none'; // page loads straight into the title screen
  resize();
})();
