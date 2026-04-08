'use strict';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CFG = {
  umbral_diff_dist: 32,   // era 15 — mucho más alto para ignorar movimientos suaves
  umbral_acc_dist: 28,    // era 15
  umbral_diff_y: 30,      // era 15
  umbral_acc_y: 35,       // era 20
  consec_frames: 3,       // era 2 — requiere 3 frames consecutivos
  sound: true,
  notif: false,
  skeleton: true,
};

// MoveNet keypoint indices (17 keypoints)
const KP = {
  NOSE: 0, L_EYE: 1, R_EYE: 2, L_EAR: 3, R_EAR: 4,
  L_SHOULDER: 5, R_SHOULDER: 6,
  L_ELBOW: 7,  R_ELBOW: 8,
  L_WRIST: 9,  R_WRIST: 10,
  L_HIP: 11,   R_HIP: 12,
  L_KNEE: 13,  R_KNEE: 14,
  L_ANKLE: 15, R_ANKLE: 16,
};

const POSE_CONNECTIONS = [
  [KP.NOSE, KP.L_EYE],[KP.NOSE, KP.R_EYE],
  [KP.L_EYE, KP.L_EAR],[KP.R_EYE, KP.R_EAR],
  [KP.L_SHOULDER, KP.R_SHOULDER],
  [KP.L_SHOULDER, KP.L_ELBOW],[KP.L_ELBOW, KP.L_WRIST],
  [KP.R_SHOULDER, KP.R_ELBOW],[KP.R_ELBOW, KP.R_WRIST],
  [KP.L_SHOULDER, KP.L_HIP],[KP.R_SHOULDER, KP.R_HIP],
  [KP.L_HIP, KP.R_HIP],
  [KP.L_HIP, KP.L_KNEE],[KP.L_KNEE, KP.L_ANKLE],
  [KP.R_HIP, KP.R_KNEE],[KP.R_KNEE, KP.R_ANKLE],
];

// ─── STATE ───────────────────────────────────────────────────────────────────
let detector = null;
let animId = null;
let isRunning = false;
let fpsCounter = 0;
let fpsLast = Date.now();
let currentFps = 0;

const state = {
  prev_dist_right: null,
  prev_diff_dist_right: null,
  prev_y_wrist_right: null,
  prev_diff_y: null,
  counter_horizontal: 0,
  counter_vertical: 0,
  count_horiz: 0,
  count_vert: 0,
  alertLog: [],
  hourBuckets: new Array(24).fill(0),
};

// ─── DOM REFS ────────────────────────────────────────────────────────────────
const splash      = document.getElementById('splash');
const app         = document.getElementById('app');
const videoEl     = document.getElementById('videoEl');
const poseCanvas  = document.getElementById('poseCanvas');
const ctx         = poseCanvas.getContext('2d');
const noCamera    = document.getElementById('noCamera');
const alertOverlay    = document.getElementById('alertOverlay');
const alertOverlayTxt = document.getElementById('alertOverlayText');
const statusDot   = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const logEntries  = document.getElementById('logEntries');
const alertsList  = document.getElementById('alertsList');
// modal removed — now using toast
const fpsDisplay  = document.getElementById('fpsDisplay');
const hudTime     = document.getElementById('hudTime');
const hudRes      = document.getElementById('hudRes');
const hudPose     = document.getElementById('hudPose');
const sidebarTime = document.getElementById('sidebarTime');
const totalCountEl= document.getElementById('totalCount');
const statHoriz   = document.getElementById('statHoriz');
const statVert    = document.getElementById('statVert');
const evHoriz     = document.getElementById('evHoriz');
const evVert      = document.getElementById('evVert');
const evTotal     = document.getElementById('evTotal');

// ─── SPLASH → APP ────────────────────────────────────────────────────────────
setTimeout(() => {
  splash.classList.add('hidden');
  app.classList.remove('hidden');
  init();
}, 2000);

// ─── INIT ─────────────────────────────────────────────────────────────────
async function init() {
  setStatus('CARGANDO MODELO', 'default');
  tickClock();
  setInterval(tickClock, 1000);
  setupNav();
  setupSettings();
  setupSliders();
  // no modal
  document.getElementById('clearAlerts').addEventListener('click', clearAlerts);

  try {
    await tf.ready();
    const model = poseDetection.SupportedModels.MoveNet;
    detector = await poseDetection.createDetector(model, {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
    });
    setStatus('MODELO LISTO', 'default');
    startCamera();
  } catch (e) {
    console.error('Model load error:', e);
    setStatus('ERROR MODELO', 'alert');
  }
}

// ─── CAMERA ──────────────────────────────────────────────────────────────────
async function startCamera() {
  setStatus('CONECTANDO CÁMARA', 'default');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false,
    });
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = () => {
      noCamera.classList.add('hidden');
      hudRes.textContent = `${videoEl.videoWidth} × ${videoEl.videoHeight}`;
      setStatus('EN VIVO', 'online');
      isRunning = true;
      runLoop();
    };
  } catch (err) {
    console.error('Camera error:', err);
    setStatus('SIN CÁMARA', 'alert');
  }
}

// ─── DETECTION LOOP ──────────────────────────────────────────────────────────
async function runLoop() {
  if (!isRunning) return;

  fpsCounter++;
  const now = Date.now();
  if (now - fpsLast >= 1000) {
    currentFps = fpsCounter;
    fpsCounter = 0;
    fpsLast = now;
    fpsDisplay.textContent = `${currentFps} FPS`;
  }

  if (detector && videoEl.readyState >= 2) {
    try {
      const poses = await detector.estimatePoses(videoEl);
      resizeCanvas();
      ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

      if (poses.length > 0) {
        const kps = poses[0].keypoints;
        hudPose.textContent = `POSE: DETECTADA`;
        const punch = processPose(kps);
        drawPose(kps, punch);
        drawBoundingBox(kps, punch);
      } else {
        hudPose.textContent = `POSE: --`;
        resetPrevState();
      }
    } catch (e) {
      // skip frame
    }
  }

  animId = requestAnimationFrame(runLoop);
}

function resizeCanvas() {
  const rect = videoEl.getBoundingClientRect();
  if (poseCanvas.width !== rect.width || poseCanvas.height !== rect.height) {
    poseCanvas.width  = rect.width;
    poseCanvas.height = rect.height;
  }
}

// ─── PUNCH DETECTION (exact replica of Python script) ────────────────────────
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function processPose(kps) {
  const cw = poseCanvas.width;
  const ch = poseCanvas.height;

  // Scale from 0-1 space to canvas pixels
  // MoveNet returns {x, y} in pixel coords relative to input image
  // We need to map to canvas coords
  const scaleX = cw / videoEl.videoWidth;
  const scaleY = ch / videoEl.videoHeight;

  const rightWrist   = kps[KP.R_WRIST];
  const rightShoulder= kps[KP.R_SHOULDER];

  if (!rightWrist || !rightShoulder) return null;
  if (rightWrist.score < 0.25 || rightShoulder.score < 0.25) return null;

  const wx = rightWrist.x * scaleX;
  const wy = rightWrist.y * scaleY;
  const sx = rightShoulder.x * scaleX;
  const sy = rightShoulder.y * scaleY;

  const distRight = dist(wx, wy, sx, sy);
  let punchType = null;

  // ── Horizontal punch (wrist-shoulder distance acceleration) ──────────────
  if (state.prev_dist_right !== null) {
    const diffDist = distRight - state.prev_dist_right;
    if (state.prev_diff_dist_right !== null) {
      const accDist = diffDist - state.prev_diff_dist_right;
      if (diffDist > CFG.umbral_diff_dist && accDist > CFG.umbral_acc_dist) {
        state.counter_horizontal++;
      } else {
        state.counter_horizontal = 0;
      }
      if (state.counter_horizontal >= CFG.consec_frames) {
        punchType = 'PUÑETAZO HORIZONTAL';
        state.counter_horizontal = 0;
      }
    }
    state.prev_diff_dist_right = diffDist;
  }
  state.prev_dist_right = distRight;

  // ── Vertical punch (wrist Y acceleration) ─────────────────────────────────
  if (state.prev_y_wrist_right !== null) {
    const diffY = wy - state.prev_y_wrist_right;
    if (state.prev_diff_y !== null) {
      const accY = diffY - state.prev_diff_y;
      if (Math.abs(diffY) > CFG.umbral_diff_y && Math.abs(accY) > CFG.umbral_acc_y) {
        state.counter_vertical++;
      } else {
        state.counter_vertical = 0;
      }
      if (state.counter_vertical >= CFG.consec_frames) {
        punchType = diffY > 0 ? 'GOLPE: ARRIBA → ABAJO' : 'GOLPE: ABAJO → ARRIBA';
        state.counter_vertical = 0;
      }
    }
    state.prev_diff_y = diffY;
  }
  state.prev_y_wrist_right = wy;

  if (punchType) {
    triggerAlert(punchType);
    return punchType;
  }
  return null;
}

function resetPrevState() {
  state.prev_dist_right = null;
  state.prev_diff_dist_right = null;
  state.prev_y_wrist_right = null;
  state.prev_diff_y = null;
  state.counter_horizontal = 0;
  state.counter_vertical = 0;
}

// ─── DRAW ─────────────────────────────────────────────────────────────────────
function drawPose(kps, punch) {
  if (!CFG.skeleton) return;
  const cw = poseCanvas.width;
  const ch = poseCanvas.height;
  const scaleX = cw / videoEl.videoWidth;
  const scaleY = ch / videoEl.videoHeight;

  const color = punch ? '#c0392b' : 'rgba(240,240,240,0.7)';

  // Connections
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  for (const [a, b] of POSE_CONNECTIONS) {
    const kpA = kps[a], kpB = kps[b];
    if (!kpA || !kpB) continue;
    if (kpA.score < 0.25 || kpB.score < 0.25) continue;
    ctx.beginPath();
    ctx.moveTo(kpA.x * scaleX, kpA.y * scaleY);
    ctx.lineTo(kpB.x * scaleX, kpB.y * scaleY);
    ctx.stroke();
  }

  // Keypoints
  ctx.globalAlpha = 1;
  for (const kp of kps) {
    if (!kp || kp.score < 0.25) continue;
    ctx.beginPath();
    ctx.arc(kp.x * scaleX, kp.y * scaleY, 3, 0, Math.PI * 2);
    ctx.fillStyle = punch ? '#c0392b' : '#f0f0f0';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBoundingBox(kps, punch) {
  const cw = poseCanvas.width;
  const ch = poseCanvas.height;
  const scaleX = cw / videoEl.videoWidth;
  const scaleY = ch / videoEl.videoHeight;

  const valid = kps.filter(k => k && k.score >= 0.2);
  if (valid.length === 0) return;

  const xs = valid.map(k => k.x * scaleX);
  const ys = valid.map(k => k.y * scaleY);
  const xMin = Math.min(...xs) - 10;
  const yMin = Math.min(...ys) - 10;
  const xMax = Math.max(...xs) + 10;
  const yMax = Math.max(...ys) + 10;

  ctx.strokeStyle = punch ? '#c0392b' : '#27ae60';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
  ctx.globalAlpha = 1;
}

// ─── ALERT SYSTEM ─────────────────────────────────────────────────────────────
let alertCooldown = false;
let overlayTimeout = null;
let borderTimeout = null;

function triggerAlert(type) {
  if (alertCooldown) return;
  alertCooldown = true;
  setTimeout(() => { alertCooldown = false; }, 3000); // 3s cooldown — evita spam

  const ts = getTimeStr();
  const hour = new Date().getHours();

  // Update counters
  if (type.includes('HORIZONTAL')) state.count_horiz++;
  else state.count_vert++;

  const total = state.count_horiz + state.count_vert;
  state.hourBuckets[hour]++;

  // Log entry
  addLogEntry(type, ts);

  // Alerts history
  addAlertItem(type, ts);

  // Update counter displays
  statHoriz.textContent   = pad3(state.count_horiz);
  statVert.textContent    = pad3(state.count_vert);
  totalCountEl.textContent= pad3(total);
  evHoriz.textContent = state.count_horiz;
  evVert.textContent  = state.count_vert;
  evTotal.textContent = total;

  // Sidebar dot
  statusDot.className = 'status-dot alert';
  setTimeout(() => { statusDot.className = 'status-dot online'; }, 2500);

  // Red border on video container (via class)
  const vc = document.getElementById('videoContainer');
  vc.classList.add('punch-active');
  clearTimeout(borderTimeout);
  borderTimeout = setTimeout(() => vc.classList.remove('punch-active'), 2500);

  // Small overlay label (top-left, no backdrop)
  alertOverlayTxt.textContent = type;
  alertOverlay.classList.remove('hidden');
  clearTimeout(overlayTimeout);
  overlayTimeout = setTimeout(() => alertOverlay.classList.add('hidden'), 2500);

  // Sound
  if (CFG.sound) playBeep();

  // Toast notification (small, bottom-right)
  showToast(type, ts);

  // System notification
  if (CFG.notif && Notification.permission === 'granted') {
    new Notification('VISEON — ALERTA', { body: type, silent: true });
  }

  // Refresh chart
  renderChart();
}

let toastTimeout = null;
function showToast(type, ts) {
  const toast = document.getElementById('alertToast');
  const toastType = document.getElementById('toastType');
  const toastTime = document.getElementById('toastTime');
  toastType.textContent = type;
  toastTime.textContent = ts;
  toast.classList.remove('hidden', 'toast-out');
  toast.classList.add('toast-in');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-in');
    toast.classList.add('toast-out');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3500);
}

function addLogEntry(type, ts) {
  const empty = logEntries.querySelector('.log-empty');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<div class="log-entry-type">${type}</div><div class="log-entry-time">${ts}</div>`;
  logEntries.prepend(el);

  // Keep max 50
  const entries = logEntries.querySelectorAll('.log-entry');
  if (entries.length > 50) entries[entries.length - 1].remove();
}

function addAlertItem(type, ts) {
  const empty = alertsList.querySelector('.empty-state');
  if (empty) empty.remove();

  const el = document.createElement('div');
  el.className = 'alert-item';
  el.innerHTML = `
    <div class="alert-item-info">
      <div class="alert-item-title">${type}</div>
      <div class="alert-item-sub">CAM-01 — MOVIMIENTO AGRESIVO DETECTADO</div>
    </div>
    <div class="alert-item-time">${ts}</div>
  `;
  alertsList.prepend(el);

  // Keep max 200
  const items = alertsList.querySelectorAll('.alert-item');
  if (items.length > 200) items[items.length - 1].remove();
}

function clearAlerts() {
  alertsList.innerHTML = '<div class="empty-state">No hay alertas registradas.</div>';
}

// ─── CHART ────────────────────────────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('chartCanvas');
  const c = canvas.getContext('2d');
  const W = canvas.parentElement.offsetWidth - 48;
  const H = 200;
  canvas.width  = W;
  canvas.height = H;

  c.clearRect(0, 0, W, H);

  const buckets = state.hourBuckets;
  const maxVal  = Math.max(...buckets, 1);
  const barW    = (W - 48) / 24;
  const padL    = 24;
  const padB    = 28;
  const chartH  = H - padB - 8;

  // Grid lines
  c.strokeStyle = '#222';
  c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 8 + chartH - (i / 4) * chartH;
    c.beginPath();
    c.moveTo(padL, y);
    c.lineTo(W - 24, y);
    c.stroke();
  }

  // Bars
  for (let i = 0; i < 24; i++) {
    const val = buckets[i];
    const barH = val === 0 ? 1 : (val / maxVal) * chartH;
    const x = padL + i * barW;
    const y = 8 + chartH - barH;

    c.fillStyle = val > 0 ? '#c0392b' : '#222';
    c.fillRect(x + 1, y, barW - 2, barH);

    // Hour labels (every 4h)
    if (i % 4 === 0) {
      c.fillStyle = '#555';
      c.font = '9px Share Tech Mono, monospace';
      c.textAlign = 'center';
      c.fillText(`${String(i).padStart(2, '0')}h`, x + barW / 2, H - 8);
    }
  }
}

// ─── SOUND ────────────────────────────────────────────────────────────────────
let audioCtx = null;

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain= audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch (e) { /* no audio */ }
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
function setupNav() {
  const btns  = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.view;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      views.forEach(v => {
        v.classList.toggle('hidden', v.id !== `view-${target}`);
        v.classList.toggle('active',  v.id === `view-${target}`);
      });
      if (target === 'events') renderChart();
    });
  });
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function setupSettings() {
  const toggleSound = document.getElementById('toggle_sound');
  const toggleNotif = document.getElementById('toggle_notif');
  const toggleSkel  = document.getElementById('toggle_skeleton');

  toggleSound.addEventListener('change', () => { CFG.sound = toggleSound.checked; });
  toggleSkel.addEventListener('change',  () => { CFG.skeleton = toggleSkel.checked; });
  toggleNotif.addEventListener('change', () => {
    CFG.notif = toggleNotif.checked;
    if (CFG.notif && Notification.permission === 'default') Notification.requestPermission();
  });
}

function setupSliders() {
  const sliders = ['umbral_diff_dist', 'umbral_acc_dist', 'umbral_diff_y', 'umbral_acc_y', 'consec_frames'];
  sliders.forEach(id => {
    const el  = document.getElementById(id);
    const val = document.getElementById(`val_${id}`);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseInt(el.value);
      val.textContent = v;
      if (id === 'consec_frames') CFG.consec_frames = v;
      else CFG[id] = v;
    });
  });
}

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function getTimeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tickClock() {
  const t = getTimeStr();
  sidebarTime.textContent = t;
  hudTime.textContent = t;
}

function pad(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }

function setStatus(label, type) {
  statusLabel.textContent = label;
  statusDot.className = `status-dot${type === 'online' ? ' online' : type === 'alert' ? ' alert' : ''}`;
}

// ─── SERVICE WORKER ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.warn);
  });
}
