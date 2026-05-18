const API = 'https://o1z930ez5d.execute-api.ap-southeast-1.amazonaws.com/prod';

const SESSION_KEY = 'sas_session';

function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
  applyAuthState();
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  applyAuthState();
}
function logout() {
  clearSession();
  switchTab('auth', document.querySelector('nav button[data-tab="auth"]'));
}

function applyAuthState() {
  const sess = getSession();
  const role = sess?.user?.role;
  const loggedIn = !!sess;

  document.getElementById('who-box').style.display = loggedIn ? 'block' : 'none';
  document.getElementById('logout-btn').style.display = loggedIn ? 'inline-block' : 'none';
  if (loggedIn) {
    document.getElementById('who-name').textContent = sess.user.name || sess.user.userId;
    document.getElementById('who-role').textContent = role;
  }

  const show = (tab, on) => {
    const btn = document.querySelector(`nav button[data-tab="${tab}"]`);
    if (btn) btn.classList.toggle('hidden', !on);
  };
  show('auth', !loggedIn);
  show('checkin', role === 'admin');
  show('myattendance', role === 'student');
  show('attendance', role === 'admin');
  show('manage', role === 'admin');

  const banner = document.getElementById('checkin-user-banner');
  if (banner) {
    banner.style.display = loggedIn ? 'block' : 'none';
    if (loggedIn) document.getElementById('checkin-user-name').textContent = `${sess.user.name} (${sess.user.userId})`;
  }

  const activeBtn = document.querySelector('nav button.active');
  if (activeBtn && activeBtn.classList.contains('hidden')) {
    const firstVisible = document.querySelector('nav button:not(.hidden)');
    if (firstVisible) switchTab(firstVisible.dataset.tab, firstVisible);
  }
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
  if (name === 'attendance') {
    const dEl = document.getElementById('att-date');
    if (dEl && !dEl.value) dEl.value = today();
    loadAttendance();
  }
  if (name === 'manage') loadAllUsers();
  if (name === 'myattendance') {
    const today = new Date().toISOString().slice(0,10);
    if (!document.getElementById('my-from').value) document.getElementById('my-from').value = today;
    if (!document.getElementById('my-to').value) document.getElementById('my-to').value = today;
  }
}

function setStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status ' + type;
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit'
  });
}

function fmtDate(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
}

function setAuthMode(mode) {
  document.getElementById('auth-mode-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-mode-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-pane-login').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('auth-pane-register').style.display = mode === 'register' ? 'block' : 'none';
}

async function loginWithCreds() {
  const userId = document.getElementById('login-id').value.trim();
  const password = document.getElementById('login-pw').value;
  if (!userId || !password) {
    return setStatus('login-status', 'Enter your User ID and password.', 'error');
  }
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Signing in...';
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });
    const data = await res.json();
    if (res.ok) {
      setSession(data.token, data.user);
      document.getElementById('login-pw').value = '';
      const target = data.user.role === 'admin' ? 'checkin' : 'myattendance';
      const targetBtn = document.querySelector(`nav button[data-tab="${target}"]`);
      switchTab(target, targetBtn);
    } else {
      setStatus('login-status', data.error || 'Login failed.', 'error');
    }
  } catch {
    setStatus('login-status', 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
}

let loginStream = null;

function stopLoginCam() {
  if (loginStream) {
    loginStream.getTracks().forEach(t => t.stop());
    loginStream = null;
  }
  const v = document.getElementById('login-video');
  v.srcObject = null;
  v.style.display = 'none';
  document.getElementById('login-placeholder').style.display = 'flex';
  document.getElementById('login-snap-btn').disabled = true;
  document.getElementById('login-cam-toggle').textContent = 'Start Camera';
  document.getElementById('login-cam-wrap').classList.remove('scanning');
}

async function toggleLoginCam() {
  if (loginStream) { stopLoginCam(); return; }
  try {
    loginStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = document.getElementById('login-video');
    v.srcObject = loginStream;
    v.style.display = 'block';
    document.getElementById('login-placeholder').style.display = 'none';
    document.getElementById('login-snap-btn').disabled = false;
    document.getElementById('login-cam-toggle').textContent = 'Stop Camera';
  } catch {
    setStatus('login-status', 'Camera access denied.', 'error');
  }
}

async function loginWithFace() {
  const v = document.getElementById('login-video');
  const c = document.getElementById('login-canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const photoBase64 = c.toDataURL('image/jpeg').split(',')[1];

  const btn = document.getElementById('login-snap-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scanning...';
  document.getElementById('login-cam-wrap').classList.add('scanning');
  setStatus('login-status', 'Identifying face...', 'info');
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoBase64 }),
    });
    const data = await res.json();
    document.getElementById('login-cam-wrap').classList.remove('scanning');
    if (res.ok) {
      setSession(data.token, data.user);
      stopLoginCam();
      const target = data.user.role === 'admin' ? 'checkin' : 'myattendance';
      const targetBtn = document.querySelector(`nav button[data-tab="${target}"]`);
      switchTab(target, targetBtn);
    } else {
      setStatus('login-status', data.error || 'Face login failed.', 'error');
    }
  } catch {
    document.getElementById('login-cam-wrap').classList.remove('scanning');
    setStatus('login-status', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in with Face';
  }
}

let regStream = null;
let regPhotoB64 = null;

function stopRegCam() {
  if (regStream) {
    regStream.getTracks().forEach(t => t.stop());
    regStream = null;
  }
  const v = document.getElementById('reg-video');
  v.srcObject = null;
  v.style.display = 'none';
  const ph = document.getElementById('reg-cam-placeholder');
  ph.style.display = 'flex';
  ph.textContent = 'Click "Start Camera" to capture face';
  document.getElementById('reg-snap-btn').disabled = true;
  document.getElementById('reg-cam-toggle').textContent = 'Start Camera';
}

async function toggleRegCam() {
  if (regStream) { stopRegCam(); return; }
  try {
    regStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = document.getElementById('reg-video');
    v.srcObject = regStream;
    v.style.display = 'block';
    document.getElementById('reg-cam-placeholder').style.display = 'none';
    document.getElementById('reg-snap-btn').disabled = false;
    document.getElementById('reg-preview-wrap').style.display = 'none';
    document.getElementById('reg-cam-toggle').textContent = 'Stop Camera';
    regPhotoB64 = null;
  } catch {
    setStatus('reg-status', 'Camera access denied — use file upload instead.', 'error');
  }
}

function snapRegPhoto() {
  const v = document.getElementById('reg-video');
  const c = document.getElementById('reg-canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  regPhotoB64 = c.toDataURL('image/jpeg').split(',')[1];

  if (regStream) { regStream.getTracks().forEach(t => t.stop()); regStream = null; }
  document.getElementById('reg-preview').src = c.toDataURL('image/jpeg');
  document.getElementById('reg-preview-wrap').style.display = 'block';
  document.getElementById('reg-video').style.display = 'none';
  const ph = document.getElementById('reg-cam-placeholder');
  ph.style.display = 'flex';
  ph.textContent = '✓ Photo captured';
  document.getElementById('reg-snap-btn').disabled = true;
  document.getElementById('reg-cam-toggle').textContent = 'Start Camera';
  document.getElementById('reg-photo').value = '';
}

function previewUpload() { regPhotoB64 = null; }

async function registerUser() {
  const userId = document.getElementById('reg-id').value.trim();
  const name   = document.getElementById('reg-name').value.trim();
  const email  = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pw').value;
  const role   = document.getElementById('reg-role').value;
  const file   = document.getElementById('reg-photo').files[0];

  if (!userId || !name || !email || !password) {
    return setStatus('reg-status', 'Fill in User ID, Name, Email, and Password.', 'error');
  }
  if (!regPhotoB64 && !file) {
    return setStatus('reg-status', 'Capture or upload a face photo.', 'error');
  }

  const btn = document.getElementById('reg-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Creating account...';
  setStatus('reg-status', 'Indexing face & creating account...', 'info');
  try {
    const photoBase64 = regPhotoB64 || await toBase64(file);
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name, email, password, role, photoBase64 }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus('reg-status', `✓ ${name} registered as ${role}! You can now log in.`, 'success');
      ['reg-id','reg-name','reg-email','reg-pw'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('reg-photo').value = '';
      document.getElementById('reg-preview-wrap').style.display = 'none';
      regPhotoB64 = null;
    } else {
      setStatus('reg-status', `Error: ${data.error}`, 'error');
    }
  } catch {
    setStatus('reg-status', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

let checkinStream = null;

function stopCheckinCam() {
  if (checkinStream) {
    checkinStream.getTracks().forEach(t => t.stop());
    checkinStream = null;
  }
  const v = document.getElementById('checkin-video');
  v.srcObject = null;
  v.style.display = 'none';
  document.getElementById('checkin-placeholder').style.display = 'flex';
  document.getElementById('checkin-snap-btn').disabled = true;
  document.getElementById('checkin-cam-toggle').textContent = 'Start Camera';
  document.getElementById('checkin-cam-wrap').classList.remove('scanning');
}

async function toggleCheckinCam() {
  if (checkinStream) { stopCheckinCam(); return; }
  try {
    checkinStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = document.getElementById('checkin-video');
    v.srcObject = checkinStream;
    v.style.display = 'block';
    document.getElementById('checkin-placeholder').style.display = 'none';
    document.getElementById('checkin-snap-btn').disabled = false;
    document.getElementById('checkin-cam-toggle').textContent = 'Stop Camera';
  } catch {
    setStatus('checkin-status', 'Camera access denied — use file upload instead.', 'error');
  }
}

async function snapAndCheckin() {
  const v = document.getElementById('checkin-video');
  const c = document.getElementById('checkin-canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  await doCheckin(c.toDataURL('image/jpeg').split(',')[1]);
}

async function uploadAndCheckin() {
  const file = document.getElementById('checkin-photo').files[0];
  if (!file) return;
  await doCheckin(await toBase64(file));
}

async function doCheckin(photoBase64) {
  const btn = document.getElementById('checkin-snap-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scanning...';
  document.getElementById('checkin-cam-wrap').classList.add('scanning');
  setStatus('checkin-status', 'Identifying face...', 'info');
  try {
    const res = await fetch(`${API}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoBase64 }),
    });
    const data = await res.json();
    document.getElementById('checkin-cam-wrap').classList.remove('scanning');
    if (res.ok && data.matched) {
      const time = fmtTime(data.timestamp);
      const emailMsg = data.email === 'sent'
        ? 'Confirmation email sent.'
        : `Email NOT sent (${data.emailError || 'unknown reason'}).`;
      setStatus('checkin-status',
        `✓ Welcome, ${data.name}! Marked present at ${time}. ${emailMsg}`,
        data.email === 'sent' ? 'success' : 'info');
    } else {
      setStatus('checkin-status', data.error || 'Face not recognized.', 'error');
    }
  } catch {
    document.getElementById('checkin-cam-wrap').classList.remove('scanning');
    setStatus('checkin-status', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan Face';
  }
}

function getAttDate() {
  const el = document.getElementById('att-date');
  if (el && el.value) return el.value;
  const t = today();
  if (el) el.value = t;
  return t;
}

function shiftAttDate(days) {
  const el = document.getElementById('att-date');
  const base = new Date((el && el.value ? el.value : today()) + 'T00:00:00');
  base.setDate(base.getDate() + days);
  const next = base.toISOString().slice(0, 10);
  if (next > today()) return;
  el.value = next;
  loadAttendance();
}

function jumpAttToday() {
  document.getElementById('att-date').value = today();
  loadAttendance();
}

async function loadAttendance() {
  document.getElementById('att-tbody').innerHTML =
    '<tr><td colspan="6"><div class="empty-state">Loading...</div></td></tr>';
  document.getElementById('att-status').className = 'status';
  const t = getAttDate();
  const isToday = t === today();
  const lbl = document.getElementById('att-date-label');
  if (lbl) lbl.textContent = isToday ? 'Today' : fmtDate(t + 'T12:00:00');
  const plbl = document.getElementById('stat-present-lbl');
  if (plbl) plbl.textContent = isToday ? 'Present Today' : 'Present';
  const nextBtn = document.getElementById('att-next');
  if (nextBtn) nextBtn.disabled = isToday;
  try {
    const [studRes, logsRes] = await Promise.all([
      fetch(`${API}/students`),
      fetch(`${API}/records?from=${t}&to=${t}`),
    ]);
    const studData = await studRes.json();
    const logsData = logsRes.ok ? await logsRes.json() : { records: [] };
    const students = studData.students || [];
    const presentMap = {};
    (logsData.records || []).forEach(r => { if (!presentMap[r.studentId]) presentMap[r.studentId] = r; });
    const presentCount = Object.keys(presentMap).length;
    const absentCount  = Math.max(0, students.length - presentCount);
    document.getElementById('stat-total').textContent   = students.length || '—';
    document.getElementById('stat-present').textContent = presentCount;
    document.getElementById('stat-absent').textContent  = students.length ? absentCount : '—';
    if (students.length === 0) {
      document.getElementById('att-tbody').innerHTML =
        '<tr><td colspan="6"><div class="empty-state">No students registered yet.</div></td></tr>';
      return;
    }
    document.getElementById('att-tbody').innerHTML = students.map((s, i) => {
      const log = presentMap[s.studentId];
      const status = log ? (log.status || 'present') : 'absent';
      const timeIn = log ? fmtTime(log.timestamp) : '—';
      const badge = {
        present:  '<span class="badge badge-present">Present</span>',
        excused:  '<span class="badge badge-excused">Excused</span>',
        absent:   '<span class="badge badge-absent">Absent</span>',
      }[status];
      const sid = JSON.stringify(s.studentId);
      const actions = `
        <div class="row-actions">
          <button class="mini-btn mini-present" ${status === 'present' ? 'disabled' : ''} onclick="markAttendance(${sid}, 'present')">Present</button>
          <button class="mini-btn mini-excused" ${status === 'excused' ? 'disabled' : ''} onclick="markAttendance(${sid}, 'excused')">Excused</button>
          <button class="mini-btn mini-absent"  ${status === 'absent'  ? 'disabled' : ''} onclick="markAttendance(${sid}, 'absent')">Absent</button>
        </div>`;
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-family:monospace;font-size:0.84rem;">${s.studentId}</td>
        <td>${s.name}</td>
        <td>${badge}</td>
        <td class="time-cell">${timeIn}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  } catch {
    setStatus('att-status', 'Failed to load attendance data.', 'error');
  }
}

async function markAttendance(userId, status) {
  const date = getAttDate();
  setStatus('att-status', `Marking ${userId} as ${status} for ${date}...`, 'info');
  try {
    const res = await fetch(`${API}/attendance/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, status, date }),
    });
    const data = await res.json();
    if (res.ok) {
      const emailNote = data.email === 'sent'
        ? ' (notification sent)'
        : (data.emailError ? ` (email failed: ${data.emailError})` : '');
      setStatus('att-status', `✓ ${userId} marked ${status}${emailNote}`, data.email === 'sent' ? 'success' : 'info');
      await loadAttendance();
    } else {
      setStatus('att-status', `Error: ${data.error || 'failed'}`, 'error');
    }
  } catch {
    setStatus('att-status', 'Network error.', 'error');
  }
}

async function loadMyAttendance() {
  const sess = getSession();
  if (!sess) return;
  const from = document.getElementById('my-from').value || today();
  const to   = document.getElementById('my-to').value || today();
  document.getElementById('my-tbody').innerHTML =
    '<tr><td colspan="4"><div class="empty-state">Loading...</div></td></tr>';
  try {
    const res = await fetch(`${API}/records?from=${from}&to=${to}&studentId=${encodeURIComponent(sess.user.userId)}`);
    const data = await res.json();
    const records = data.records || [];
    if (records.length === 0) {
      document.getElementById('my-tbody').innerHTML =
        '<tr><td colspan="4"><div class="empty-state">No attendance in this range.</div></td></tr>';
      return;
    }
    document.getElementById('my-tbody').innerHTML = records.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${fmtDate(r.timestamp)}</td>
        <td class="time-cell">${fmtTime(r.timestamp)}</td>
        <td><span class="badge badge-present">Present</span></td>
      </tr>`).join('');
  } catch {
    setStatus('my-status', 'Failed to load.', 'error');
  }
}

let mgmtStream = null;
let mgmtPhotoB64 = null;

function stopMgmtCam() {
  if (mgmtStream) { mgmtStream.getTracks().forEach(t => t.stop()); mgmtStream = null; }
  const v = document.getElementById('mgmt-video');
  v.srcObject = null; v.style.display = 'none';
  const ph = document.getElementById('mgmt-cam-placeholder');
  ph.style.display = 'flex';
  ph.textContent = 'Click "Start Camera" to capture face';
  document.getElementById('mgmt-snap-btn').disabled = true;
  document.getElementById('mgmt-cam-toggle').textContent = 'Start Camera';
}

async function toggleMgmtCam() {
  if (mgmtStream) { stopMgmtCam(); return; }
  try {
    mgmtStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = document.getElementById('mgmt-video');
    v.srcObject = mgmtStream; v.style.display = 'block';
    document.getElementById('mgmt-cam-placeholder').style.display = 'none';
    document.getElementById('mgmt-snap-btn').disabled = false;
    document.getElementById('mgmt-preview-wrap').style.display = 'none';
    document.getElementById('mgmt-cam-toggle').textContent = 'Stop Camera';
    mgmtPhotoB64 = null;
  } catch {
    setStatus('mgmt-add-status', 'Camera access denied — use file upload instead.', 'error');
  }
}

function snapMgmtPhoto() {
  const v = document.getElementById('mgmt-video');
  const c = document.getElementById('mgmt-canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  mgmtPhotoB64 = c.toDataURL('image/jpeg').split(',')[1];
  if (mgmtStream) { mgmtStream.getTracks().forEach(t => t.stop()); mgmtStream = null; }
  document.getElementById('mgmt-preview').src = c.toDataURL('image/jpeg');
  document.getElementById('mgmt-preview-wrap').style.display = 'block';
  document.getElementById('mgmt-video').style.display = 'none';
  const ph = document.getElementById('mgmt-cam-placeholder');
  ph.style.display = 'flex'; ph.textContent = '✓ Photo captured';
  document.getElementById('mgmt-snap-btn').disabled = true;
  document.getElementById('mgmt-cam-toggle').textContent = 'Start Camera';
  document.getElementById('mgmt-photo').value = '';
}

function mgmtPreviewUpload() { mgmtPhotoB64 = null; }

async function adminAddStudent() {
  const userId   = document.getElementById('mgmt-id').value.trim();
  const name     = document.getElementById('mgmt-name').value.trim();
  const email    = document.getElementById('mgmt-email').value.trim();
  const password = document.getElementById('mgmt-pw').value;
  const file     = document.getElementById('mgmt-photo').files[0];

  if (!userId || !name || !email || !password) {
    return setStatus('mgmt-add-status', 'Fill in all fields.', 'error');
  }
  if (!mgmtPhotoB64 && !file) {
    return setStatus('mgmt-add-status', 'Capture or upload a face photo.', 'error');
  }

  const btn = document.getElementById('mgmt-add-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Adding student...';
  setStatus('mgmt-add-status', 'Indexing face & creating account...', 'info');

  try {
    const photoBase64 = mgmtPhotoB64 || await toBase64(file);
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, name, email, password, role: 'student', photoBase64 }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus('mgmt-add-status', `✓ ${name} added as student!`, 'success');
      ['mgmt-id','mgmt-name','mgmt-email','mgmt-pw'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('mgmt-photo').value = '';
      document.getElementById('mgmt-preview-wrap').style.display = 'none';
      mgmtPhotoB64 = null;
      loadAllUsers();
    } else {
      setStatus('mgmt-add-status', `Error: ${data.error}`, 'error');
    }
  } catch {
    setStatus('mgmt-add-status', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Student';
  }
}

async function loadAllUsers() {
  document.getElementById('manage-tbody').innerHTML =
    '<tr><td colspan="4"><div class="empty-state">Loading...</div></td></tr>';
  try {
    const res = await fetch(`${API}/students`);
    const data = await res.json();
    const users = data.students || [];
    if (users.length === 0) {
      document.getElementById('manage-tbody').innerHTML =
        '<tr><td colspan="4"><div class="empty-state">No users yet.</div></td></tr>';
      return;
    }
    document.getElementById('manage-tbody').innerHTML = users.map(u => `
      <tr>
        <td style="font-family:monospace;font-size:0.84rem;">${u.studentId}</td>
        <td>${u.name}</td>
        <td>${u.email || '—'}</td>
      </tr>`).join('');
  } catch {
    document.getElementById('manage-tbody').innerHTML =
      '<tr><td colspan="4"><div class="empty-state">Failed to load.</div></td></tr>';
  }
}

window.addEventListener('load', () => {
  applyAuthState();
  const sess = getSession();
  if (sess) {
    const target = sess.user.role === 'admin' ? 'checkin' : 'myattendance';
    const btn = document.querySelector(`nav button[data-tab="${target}"]`);
    if (btn) switchTab(target, btn);
  }
});
