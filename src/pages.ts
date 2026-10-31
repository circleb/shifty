import { escapeHtml } from "./util";

// All four pages are static shells. Data arrives from the JSON API and is inserted with textContent,
// so nothing a volunteer types is ever interpreted as HTML.

const CSS = String.raw`
:root{--bg:#F3F6FA;--surface:#FFFFFF;--ink:#14213D;--muted:#58647E;--line:#D8E0EB;--accent:#FFC53D;--accent-ink:#14213D;--hl:#FFD866;--danger:#B3261E;--ok:#1F7A4D;--focus:#2457D6;
--display:"Bricolage Grotesque","Avenir Next","Segoe UI",system-ui,sans-serif;--body:"Instrument Sans","Segoe UI",system-ui,sans-serif;--mono:"DM Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0E1526;--surface:#172039;--ink:#E8EEFA;--muted:#9AA8C6;--line:#2A3657;--hl:rgba(255,197,61,.38);--danger:#FF8A80;--ok:#6FD3A0;--focus:#8FB0FF;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 var(--body);padding:24px max(16px,env(safe-area-inset-right)) 56px max(16px,env(safe-area-inset-left))}
.wrap{max-width:720px;margin:0 auto}
.top{margin-bottom:24px}
.brand{font:700 .95rem var(--display);color:var(--muted);text-decoration:none;letter-spacing:.01em}
h1{font:800 clamp(1.8rem,6vw,2.6rem)/1.05 var(--display);letter-spacing:-.02em;margin:0 0 10px;text-wrap:balance}
h2{font:700 1.15rem/1.2 var(--display);margin:28px 0 10px}
.lead,.muted{color:var(--muted)}
.lead{margin:0 0 20px;max-width:56ch}
.small{font-size:.875rem}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
label{display:flex;flex-direction:column;gap:6px;font-weight:600;font-size:.92rem;margin-bottom:14px}
input,select,textarea{font:500 1rem var(--body);padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);width:100%;min-width:0}
textarea{resize:vertical}
.btn{font:600 .95rem var(--body);padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{border-color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.danger{color:var(--danger);border-color:var(--danger)}
.btn.small{padding:6px 12px;font-size:.85rem}
.btn[disabled]{opacity:.55;cursor:default}
.range{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid2 label{margin-bottom:12px}
.days{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
.day{flex-direction:row;align-items:center;gap:0;margin:0;font-weight:600}
.day input{position:absolute;opacity:0;width:0;height:0}
.day span{padding:7px 12px;border:1px solid var(--line);border-radius:999px;cursor:pointer;font-size:.88rem}
.day input:checked+span{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.day input:focus-visible+span{outline:2px solid var(--focus);outline-offset:2px}
.rangehead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.preview{font:500 .9rem var(--mono);color:var(--muted);margin:14px 0}
.warn,.err{color:var(--danger)}
.err{min-height:1.4em;margin:8px 0;font-size:.92rem}
.linkrow{display:flex;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 8px 8px 12px;margin:6px 0 16px}
.linkrow code{font:500 .85rem var(--mono);overflow-wrap:anywhere;flex:1;min-width:0}
.banner{background:var(--hl);color:var(--accent-ink);border-radius:12px;padding:12px 14px;margin:0 0 20px}
@media (prefers-color-scheme:dark){.banner{color:var(--ink)}}
.banner a{color:inherit;font-weight:600}
.dayhead{margin-top:26px}
.slots{list-style:none;margin:0;padding:0;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.slot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.slot:last-child{border-bottom:0}
.slot .when{font-weight:600}
.slot .who{color:var(--muted);font-size:.92rem;text-align:right;min-width:0;overflow-wrap:anywhere}
.slot.mine{background:var(--hl);color:var(--accent-ink)}
.slot.mine .who{color:inherit}
.slot.past{opacity:.55}
.stats{display:flex;gap:20px;flex-wrap:wrap;margin:0 0 6px;font-family:var(--mono);font-size:.9rem;color:var(--muted)}
dialog{border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);padding:22px;width:min(440px,calc(100vw - 32px))}
dialog::backdrop{background:rgba(10,16,32,.55)}
dialog h2{margin-top:0}
.row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.hint{font-size:.85rem;color:var(--muted);margin:0 0 6px}
@media (max-width:520px){.grid2{grid-template-columns:1fr}}
`;

const COMMON_JS = String.raw`
var $ = function (s, r) { return (r || document).querySelector(s); };
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}
function api(path, opts) {
  return fetch(path, opts).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
      return d;
    });
  });
}
function post(path, body) {
  return api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
}
var fmtCache = {};
function fmt(tz, opts) {
  var key = tz + JSON.stringify(opts);
  return fmtCache[key] || (fmtCache[key] = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz }, opts)));
}
function dayKey(ts, tz) { return fmt(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts * 1000)); }
function dayLabel(ts, tz) { return fmt(tz, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(ts * 1000)); }
function timeLabel(ts, tz) { return fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(ts * 1000)); }
function rangeLabel(s, e, tz) { return timeLabel(s, tz) + ' to ' + timeLabel(e, tz); }
function groupDays(slots, tz) {
  var out = [], map = {};
  slots.forEach(function (s) {
    var k = dayKey(s.start, tz);
    if (!map[k]) { map[k] = { label: dayLabel(s.start, tz), slots: [] }; out.push(map[k]); }
    map[k].slots.push(s);
  });
  return out;
}
function copyText(text, btn) {
  var done = function () { var o = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = o; }, 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this link', text); });
  else window.prompt('Copy this link', text);
}
function linkRow(url) {
  var btn = el('button', { type: 'button', class: 'btn small', text: 'Copy' });
  btn.addEventListener('click', function () { copyText(url, btn); });
  return el('div', { class: 'linkrow' }, [el('code', { text: url }), btn]);
}
function remindText(m) { return m === 120 ? 'reminder 2 hours before' : m === 1440 ? 'reminder 1 day before' : 'no reminder'; }
function forgetShift(sheetId, token) {
  var key = 'ss:' + sheetId, mine = {};
  try { mine = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return; }
  if (!mine || typeof mine !== 'object') return;
  var changed = false;
  Object.keys(mine).forEach(function (id) { if (mine[id] === token) { delete mine[id]; changed = true; } });
  if (changed) { try { localStorage.setItem(key, JSON.stringify(mine)); } catch (e) {} }
}
`;

function shell(appName: string, title: string, body: string, js: string): string {
  const name = escapeHtml(appName);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top"><a class="brand" href="/">${name}</a></header>
${body}
</div>
<script>${COMMON_JS}
${js}</script>
</body>
</html>`;
}

// ---------- create ----------

const CREATE_BODY = String.raw`
<main id="setup">
  <h1>Set up a shift sheet</h1>
  <p class="lead">Each range starts at a date and time and finishes at a date and time. Slots fill that span. You get one link to share. People choose their own slots. No accounts.</p>
  <form id="f" novalidate>
    <label for="title">Name<input id="title" maxlength="80" placeholder="Grandma and Grandpa shifts" autocomplete="off"></label>
    <label for="note">Note for volunteers (optional)<textarea id="note" maxlength="500" rows="2" placeholder="Anything people should know before they sign up"></textarea></label>
    <label for="tz">Timezone<select id="tz"></select></label>
    <h2>Ranges</h2>
    <div id="ranges"></div>
    <button type="button" class="btn" id="addRange">Add another range</button>
    <p id="preview" class="preview" aria-live="polite"></p>
    <p id="err" class="err" role="alert"></p>
    <button class="btn primary" id="go" type="submit">Create sheet</button>
  </form>
</main>
<main id="done" hidden>
  <h1>Your sheet is ready</h1>
  <h2>Share this link</h2>
  <p class="muted small">Send it in your group text. Anyone with it can pick a slot.</p>
  <div id="shareRow"></div>
  <h2>Your private admin link</h2>
  <p class="muted small">Keep this to yourself and bookmark it. It is the only way back to see who signed up, and anyone who has it can edit the sheet.</p>
  <div id="adminRow"></div>
  <a class="btn primary" id="openAdmin" href="#">Open admin view</a>
</main>
`;

const CREATE_JS = String.raw`
var SHIFTS = [[30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [360, '6 hours'], [480, '8 hours'], [720, '12 hours']];
function ymd(d) { var m = d.getMonth() + 1, day = d.getDate(); return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day; }

var zones = [];
try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) {}
var local = Intl.DateTimeFormat().resolvedOptions().timeZone;
if (zones.indexOf(local) < 0) zones.unshift(local);
zones.forEach(function (z) { $('#tz').appendChild(el('option', { value: z, text: z })); });
$('#tz').value = local;

var cards = [];
function rangeCard() {
  var today = ymd(new Date());
  var sd = el('input', { type: 'date', value: today, id: 'sd' + cards.length });
  var st = el('input', { type: 'time', value: '09:00', id: 'st' + cards.length });
  var ed = el('input', { type: 'date', value: today, id: 'ed' + cards.length });
  var et = el('input', { type: 'time', value: '17:00', id: 'et' + cards.length });
  var sh = el('select', { id: 'sh' + cards.length });
  SHIFTS.forEach(function (s) { sh.appendChild(el('option', { value: String(s[0]), text: s[1] })); });
  sh.value = '120';
  var rm = el('button', { type: 'button', class: 'btn small', text: 'Remove' });
  var card = el('div', { class: 'range' }, [
    el('div', { class: 'rangehead' }, [el('strong', { text: 'Range' }), rm]),
    el('div', { class: 'grid2' }, [
      el('label', { for: sd.id }, ['Start date', sd]),
      el('label', { for: st.id }, ['Start time', st])
    ]),
    el('div', { class: 'grid2' }, [
      el('label', { for: ed.id }, ['Finish date', ed]),
      el('label', { for: et.id }, ['Finish time', et])
    ]),
    el('label', { for: sh.id }, ['Slot length', sh])
  ]);
  card.get = function () {
    return {
      startDate: sd.value, startTime: st.value, endDate: ed.value, endTime: et.value,
      shiftMinutes: Number(sh.value)
    };
  };
  rm.addEventListener('click', function () {
    cards = cards.filter(function (c) { return c !== card; });
    card.remove(); syncRemove(); schedulePreview();
  });
  card.rm = rm;
  return card;
}
function syncRemove() { cards.forEach(function (c) { c.rm.hidden = cards.length < 2; }); }
function addRange() { var c = rangeCard(); cards.push(c); $('#ranges').appendChild(c); syncRemove(); schedulePreview(); }
function collect() { return cards.map(function (c) { return c.get(); }); }

var timer = null;
function schedulePreview() { clearTimeout(timer); timer = setTimeout(runPreview, 350); }
function runPreview() {
  var p = $('#preview'), tz = $('#tz').value;
  post('/api/preview', { tz: tz, ranges: collect() }).then(function (d) {
    p.className = 'preview';
    if (!d.count) { p.textContent = 'No slots yet.'; return; }
    p.textContent = d.count + ' slots. First: ' + dayLabel(d.first.start, tz) + ', ' + rangeLabel(d.first.start, d.first.end, tz) + '.';
  }).catch(function (e) { p.className = 'preview warn'; p.textContent = e.message; });
}
$('#ranges').addEventListener('input', schedulePreview);
$('#ranges').addEventListener('change', schedulePreview);
$('#tz').addEventListener('change', schedulePreview);
$('#addRange').addEventListener('click', addRange);

$('#f').addEventListener('submit', function (e) {
  e.preventDefault();
  var err = $('#err'), go = $('#go');
  err.textContent = '';
  if (!$('#title').value.trim()) { err.textContent = 'Give the sheet a name.'; $('#title').focus(); return; }
  go.disabled = true; go.textContent = 'Creating...';
  post('/api/sheets', { title: $('#title').value, note: $('#note').value, tz: $('#tz').value, ranges: collect() })
    .then(function (d) {
      $('#shareRow').appendChild(linkRow(d.shareUrl));
      $('#adminRow').appendChild(linkRow(d.adminUrl));
      $('#openAdmin').href = d.adminUrl;
      $('#setup').hidden = true; $('#done').hidden = false;
      window.scrollTo(0, 0);
    })
    .catch(function (x) { err.textContent = x.message; go.disabled = false; go.textContent = 'Create sheet'; });
});

addRange();
`;

export function createPage(appName: string): string {
  return shell(appName, `${appName}`, CREATE_BODY, CREATE_JS);
}

// ---------- volunteer ----------

const VOLUNTEER_BODY = String.raw`
<main>
  <h1 id="title">Loading...</h1>
  <p id="note" class="lead" hidden></p>
  <p id="tzNote" class="muted small"></p>
  <div id="banner" class="banner" hidden></div>
  <p id="err" class="err" role="alert"></p>
  <div id="days"></div>
</main>
<dialog id="dlg">
  <form id="claimForm" novalidate>
    <h2 id="dlgTitle">Take this shift</h2>
    <p id="dlgWhen" class="muted"></p>
    <label for="cName">Your name<input id="cName" maxlength="60" autocomplete="name"></label>
    <label for="cEmail">Email (optional)<input id="cEmail" type="email" maxlength="120" autocomplete="email"></label>
    <label for="cRemind">Reminder
      <select id="cRemind" disabled>
        <option value="0">No reminder</option>
        <option value="120">2 hours before</option>
        <option value="1440">1 day before</option>
      </select>
    </label>
    <p class="hint">Add an email to get a confirmation and a reminder.</p>
    <input class="hp" id="cWebsite" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p id="dlgErr" class="err" role="alert"></p>
    <div class="row">
      <button type="button" class="btn" id="dlgCancel">Never mind</button>
      <button type="submit" class="btn primary" id="dlgGo">Take this shift</button>
    </div>
  </form>
</dialog>
`;

const VOLUNTEER_JS = String.raw`
var pid = location.pathname.split('/')[2];
var data = null, active = null;
var mineKey = 'ss:' + pid;
var mine = {};
function loadMine() {
  mine = {};
  try {
    var raw = JSON.parse(localStorage.getItem(mineKey) || '{}');
    if (raw && typeof raw === 'object') mine = raw;
  } catch (e) {}
}
function saveMine() { try { localStorage.setItem(mineKey, JSON.stringify(mine)); } catch (e) {} }
function reconcileMine() {
  var changed = false;
  Object.keys(mine).forEach(function (id) {
    var slot = null;
    data.slots.forEach(function (s) { if (s.id === id) slot = s; });
    // A saved sign-up whose slot is open again was cancelled, or an admin cleared it.
    if (!slot || !slot.takenBy) { delete mine[id]; changed = true; }
  });
  if (changed) saveMine();
}
function syncBanner() {
  var b = $('#banner');
  if (!b || b.hidden) return;
  var link = b.querySelector('a');
  if (!link) return;
  var token = (link.getAttribute('href') || '').split('/').pop();
  var still = Object.keys(mine).some(function (id) { return mine[id] === token; });
  if (!still) { b.hidden = true; b.textContent = ''; }
}

function render() {
  if (!data) return;
  document.title = data.title;
  $('#title').textContent = data.title;
  var note = $('#note');
  note.textContent = data.note || ''; note.hidden = !data.note;
  $('#tzNote').textContent = 'Times are shown in ' + data.tz.replace('_', ' ') + '.';
  var wrap = $('#days');
  wrap.textContent = '';
  if (!data.slots.length) { wrap.appendChild(el('p', { class: 'muted', text: 'No upcoming shifts on this sheet.' })); return; }
  groupDays(data.slots, data.tz).forEach(function (g) {
    var ul = el('ul', { class: 'slots' });
    g.slots.forEach(function (s) {
      var li = el('li', { class: 'slot' + (mine[s.id] ? ' mine' : '') });
      li.appendChild(el('span', { class: 'when', text: rangeLabel(s.start, s.end, data.tz) }));
      if (mine[s.id]) {
        li.appendChild(el('span', { class: 'who' }, ['You are on this one. ', el('a', { href: '/c/' + mine[s.id], text: 'Cancel' })]));
      } else if (s.takenBy) {
        li.appendChild(el('span', { class: 'who', text: 'Taken by ' + s.takenBy }));
      } else {
        li.appendChild(el('button', { type: 'button', class: 'btn small primary', text: 'Take it', onclick: function () { openForm(s); } }));
      }
      ul.appendChild(li);
    });
    wrap.appendChild(el('h2', { class: 'dayhead', text: g.label }));
    wrap.appendChild(ul);
  });
}

function refresh() {
  return api('/api/s/' + pid).then(function (d) {
    data = d;
    loadMine();
    reconcileMine();
    $('#err').textContent = '';
    render();
    syncBanner();
  }).catch(function (e) { $('#title').textContent = 'Sheet not found'; $('#err').textContent = e.message; });
}

var dlg = $('#dlg');
function openForm(slot) {
  active = slot;
  $('#dlgWhen').textContent = dayLabel(slot.start, data.tz) + ', ' + rangeLabel(slot.start, slot.end, data.tz);
  $('#dlgErr').textContent = '';
  try { $('#cName').value = localStorage.getItem('ss:name') || ''; $('#cEmail').value = localStorage.getItem('ss:email') || ''; } catch (e) {}
  syncRemind();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeForm() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
function syncRemind() {
  var has = $('#cEmail').value.trim().length > 0;
  $('#cRemind').disabled = !has;
  if (!has) $('#cRemind').value = '0';
}
$('#cEmail').addEventListener('input', syncRemind);
$('#dlgCancel').addEventListener('click', closeForm);

$('#claimForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var go = $('#dlgGo'), err = $('#dlgErr');
  err.textContent = '';
  if (!$('#cName').value.trim()) { err.textContent = 'Enter your name.'; $('#cName').focus(); return; }
  go.disabled = true;
  var slot = active;
  post('/api/s/' + pid + '/claim', {
    slotId: slot.id, name: $('#cName').value, email: $('#cEmail').value,
    remind: Number($('#cRemind').value), website: $('#cWebsite').value
  }).then(function (d) {
    mine[slot.id] = d.cancelToken; saveMine();
    try { localStorage.setItem('ss:name', $('#cName').value.trim()); localStorage.setItem('ss:email', $('#cEmail').value.trim()); } catch (x) {}
    closeForm();
    var b = $('#banner');
    b.textContent = '';
    b.appendChild(document.createTextNode('You are signed up for ' + dayLabel(slot.start, data.tz) + ', ' + rangeLabel(slot.start, slot.end, data.tz) + '. '));
    if (d.emailed) b.appendChild(document.createTextNode('A confirmation is on its way to your email. '));
    b.appendChild(el('a', { href: '/c/' + d.cancelToken, text: 'Cancel this shift' }));
    b.hidden = false;
    window.scrollTo(0, 0);
    return refresh();
  }).catch(function (x) {
    err.textContent = x.message;
    if (/just took/.test(x.message)) refresh();
  }).then(function () { go.disabled = false; });
});

document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });
loadMine();
refresh();
`;

export function volunteerPage(appName: string): string {
  return shell(appName, appName, VOLUNTEER_BODY, VOLUNTEER_JS);
}

// ---------- admin ----------

const ADMIN_BODY = String.raw`
<main>
  <h1 id="title">Loading...</h1>
  <p id="note" class="lead" hidden></p>
  <h2>Share link</h2>
  <div id="shareRow"></div>
  <div class="stats" id="stats"></div>
  <p id="err" class="err" role="alert"></p>
  <div id="days"></div>
  <h2>Delete this sheet</h2>
  <p class="muted small">This removes the sheet, every slot and every sign-up. It can't be undone.</p>
  <button type="button" class="btn danger" id="del">Delete sheet</button>
</main>
`;

const ADMIN_JS = String.raw`
var token = location.pathname.split('/')[2];
var data = null;

function render() {
  document.title = data.title + ' (admin)';
  $('#title').textContent = data.title;
  var note = $('#note');
  note.textContent = data.note || ''; note.hidden = !data.note;
  var sr = $('#shareRow'); sr.textContent = ''; sr.appendChild(linkRow(data.shareUrl));

  var upcoming = data.slots.filter(function (s) { return s.end > data.now; });
  var taken = upcoming.filter(function (s) { return s.name; }).length;
  $('#stats').textContent = '';
  $('#stats').appendChild(el('span', { text: taken + ' of ' + upcoming.length + ' upcoming shifts taken' }));

  var wrap = $('#days'); wrap.textContent = '';
  groupDays(data.slots, data.tz).forEach(function (g) {
    var ul = el('ul', { class: 'slots' });
    g.slots.forEach(function (s) {
      var li = el('li', { class: 'slot' + (s.end <= data.now ? ' past' : '') });
      li.appendChild(el('span', { class: 'when', text: rangeLabel(s.start, s.end, data.tz) }));
      if (s.name) {
        var detail = s.name + (s.email ? ' (' + s.email + ', ' + remindText(s.remind) + ')' : '');
        li.appendChild(el('span', { class: 'who', text: detail }));
        li.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Clear', onclick: function () { clearSlot(s); } }));
      } else {
        li.appendChild(el('span', { class: 'who', text: 'Open' }));
      }
      ul.appendChild(li);
    });
    wrap.appendChild(el('h2', { class: 'dayhead', text: g.label }));
    wrap.appendChild(ul);
  });
}

function load() {
  return api('/api/a/' + token).then(function (d) { data = d; render(); })
    .catch(function (e) { $('#title').textContent = 'Link not valid'; $('#err').textContent = e.message; });
}
function clearSlot(s) {
  post('/api/a/' + token + '/clear', { slotId: s.id }).then(load).catch(function (e) { $('#err').textContent = e.message; });
}

var armed = false;
$('#del').addEventListener('click', function () {
  var b = $('#del');
  if (!armed) { armed = true; b.textContent = 'Really delete everything?'; setTimeout(function () { armed = false; b.textContent = 'Delete sheet'; }, 5000); return; }
  post('/api/a/' + token + '/delete').then(function () { location.href = '/'; }).catch(function (e) { $('#err').textContent = e.message; });
});

document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
load();
`;

export function adminPage(appName: string): string {
  return shell(appName, `${appName} admin`, ADMIN_BODY, ADMIN_JS);
}

// ---------- cancel ----------

const CANCEL_BODY = String.raw`
<main>
  <h1 id="title">Your shift</h1>
  <p id="when" class="lead"></p>
  <p id="err" class="err" role="alert"></p>
  <div id="actions" hidden>
    <button type="button" class="btn danger" id="cancel">Cancel this shift</button>
  </div>
  <p id="result" hidden></p>
</main>
`;

const CANCEL_JS = String.raw`
var token = location.pathname.split('/')[2];
var info = null;
api('/api/c/' + token).then(function (d) {
  info = d;
  document.title = 'Your shift';
  $('#title').textContent = d.title;
  $('#when').textContent = d.name + ', you are signed up for ' + dayLabel(d.start, d.tz) + ', ' + rangeLabel(d.start, d.end, d.tz) + '.';
  $('#actions').hidden = false;
}).catch(function (e) { $('#title').textContent = 'Nothing to cancel'; $('#err').textContent = e.message; });

$('#cancel').addEventListener('click', function () {
  var b = $('#cancel'); b.disabled = true;
  post('/api/c/' + token + '/cancel').then(function () {
    if (info && info.sheetId) forgetShift(info.sheetId, token);
    $('#actions').hidden = true;
    $('#when').textContent = '';
    var r = $('#result'); r.hidden = false;
    r.textContent = 'Cancelled. That slot is open again. ';
    r.appendChild(el('a', { href: '/s/' + info.sheetId, text: 'Back to the sheet' }));
  }).catch(function (e) { $('#err').textContent = e.message; b.disabled = false; });
});
`;

export function cancelPage(appName: string): string {
  return shell(appName, `${appName} shift`, CANCEL_BODY, CANCEL_JS);
}
