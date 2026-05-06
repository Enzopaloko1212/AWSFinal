const API = 'https://o1z930ez5d.execute-api.ap-southeast-1.amazonaws.com/prod';

// ── UTILS ────────────────────────────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'attendance') loadAttendance();
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit'
  });
}

// ── REGISTER WEBCAM ──────────────────────────────────────────────────────────

let regStream = null;
let regPhotoB64 = null;

async function startRegCam() {
  try {
    regStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const video = document.getElementById('reg-video');
    video.srcObject = regStream;
    video.style.display = 'block';
    document.getElementById('reg-cam-placeholder').style.display = 'none';
    document.getElementById('reg-snap-btn').disabled = false;
    document.getElementById('reg-preview-wrap').style.display = 'none';
    regPhotoB64 = null;
  } catch {
    setStatus('reg-status', 'Camera access denied — use file upload instead.', 'error');
  }
}

function snapRegPhoto() {
  const video  = document.getElementById('reg-video');
  const canvas = document.getElementById('reg-canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  regPhotoB64 = canvas.toDataURL('image/jpeg').split(',')[1];

  regStream && regStream.getTracks().forEach(t => t.stop());
  document.getElementById('reg-preview').src = canvas.toDataURL('image/jpeg');
  document.getElementById('reg-preview-wrap').style.display = 'block';
  document.getElementById('reg-video').style.display = 'none';
  document.getElementById('reg-cam-placeholder').style.display = 'flex';
  document.getElementById('reg-cam-placeholder').textContent = '✓ Photo captured';
  document.getElementById('reg-snap-btn').disabled = true;
  document.getElementById('reg-photo').value = '';
}

function previewUpload() {
  regPhotoB64 = null;
}

// ── REGISTER SUBMIT ──────────────────────────────────────────────────────────

async function registerStudent() {
  const id    = document.getElementById('reg-id').value.trim();
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const file  = document.getElementById('reg-photo').files[0];

  if (!id || !name || !email) {
    return setStatus('reg-status', 'Please fill in Student ID, Name, and Email.', 'error');
  }
  if (!regPhotoB64 && !file) {
    return setStatus('reg-status', 'Please capture or upload a photo.', 'error');
  }

  const btn = document.getElementById('reg-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Registering...';
  setStatus('reg-status', 'Processing photo and registering face...', 'info');

  try {
    const photoBase64 = regPhotoB64 || await toBase64(file);
    const res  = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id, name, email, photoBase64 }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatus('reg-status', `✓ ${name} registered successfully!`, 'success');
      ['reg-id', 'reg-name', 'reg-email'].forEach(i => document.getElementById(i).value = '');
      document.getElementById('reg-photo').value = '';
      document.getElementById('reg-preview-wrap').style.display = 'none';
      regPhotoB64 = null;
    } else {
      setStatus('reg-status', `Error: ${data.error}`, 'error');
    }
  } catch {
    setStatus('reg-status', 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Student';
  }
}

// ── CHECK IN WEBCAM ──────────────────────────────────────────────────────────

let checkinStream = null;

async function startCheckinCam() {
  try {
    checkinStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const video = document.getElementById('checkin-video');
    video.srcObject = checkinStream;
    video.style.display = 'block';
    document.getElementById('checkin-placeholder').style.display = 'none';
    document.getElementById('checkin-snap-btn').disabled = false;
  } catch {
    setStatus('checkin-status', 'Camera access denied — use file upload instead.', 'error');
  }
}

async function snapAndCheckin() {
  const video  = document.getElementById('checkin-video');
  const canvas = document.getElementById('checkin-canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  await doCheckin(canvas.toDataURL('image/jpeg').split(',')[1]);
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
    const res  = await fetch(`${API}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoBase64 }),
    });
    const data = await res.json();
    document.getElementById('checkin-cam-wrap').classList.remove('scanning');

    if (res.ok && data.matched) {
      const time = fmtTime(data.timestamp);
      setStatus('checkin-status',
        `✓ Welcome, ${data.name}! Marked present at ${time}. Confirmation email sent.`, 'success');
    } else {
      setStatus('checkin-status', data.error || 'Face not recognized. Please register first.', 'error');
    }
  } catch {
    document.getElementById('checkin-cam-wrap').classList.remove('scanning');
    setStatus('checkin-status', 'Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan Face';
  }
}

// ── ATTENDANCE TABLE ─────────────────────────────────────────────────────────

async function loadAttendance() {
  document.getElementById('att-tbody').innerHTML =
    '<tr><td colspan="5"><div class="empty-state">Loading...</div></td></tr>';
  document.getElementById('att-status').className = 'status';

  try {
    const t = today();

    // Fetch all students + today's check-ins in parallel
    const [studRes, logsRes] = await Promise.all([
      fetch(`${API}/students`),
      fetch(`${API}/records?from=${t}&to=${t}`),
    ]);

    const studData = await studRes.json();
    const logsData = logsRes.ok ? await logsRes.json() : { records: [] };

    const students = studData.students || [];

    // Build a map of who checked in today: studentId → first log entry
    const presentMap = {};
    (logsData.records || []).forEach(r => {
      if (!presentMap[r.studentId]) presentMap[r.studentId] = r;
    });

    // Stats
    const presentCount = Object.keys(presentMap).length;
    const absentCount  = Math.max(0, students.length - presentCount);
    document.getElementById('stat-total').textContent   = students.length || '—';
    document.getElementById('stat-present').textContent = presentCount;
    document.getElementById('stat-absent').textContent  = students.length ? absentCount : '—';

    if (students.length === 0) {
      document.getElementById('att-tbody').innerHTML =
        '<tr><td colspan="5"><div class="empty-state">No students registered yet.</div></td></tr>';
      return;
    }

    // Render: all students, present ones show time, absent ones show —
    document.getElementById('att-tbody').innerHTML = students.map((s, i) => {
      const log     = presentMap[s.studentId];
      const present = !!log;
      const timeIn  = present ? fmtTime(log.timestamp) : '—';
      const badge   = present
        ? '<span class="badge badge-present">Present</span>'
        : '<span class="badge badge-absent">Absent</span>';
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-family:monospace;font-size:0.84rem;">${s.studentId}</td>
        <td>${s.name}</td>
        <td>${badge}</td>
        <td class="time-cell">${timeIn}</td>
      </tr>`;
    }).join('');

  } catch (e) {
    setStatus('att-status', 'Failed to load attendance data.', 'error');
  }
}

// ── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  // nothing needed on load — attendance loads when tab is clicked
});
