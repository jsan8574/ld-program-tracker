/* L&D Program Tracker — static dashboard backed by a shared database (Apps Script web app) */
(() => {
  'use strict';

  const CFG = Object.assign({ apiUrl: '', pollSeconds: 60 }, window.LD_CONFIG || {});
  const LS = { data: 'ldt.data.v1', settings: 'ldt.settings.v1', view: 'ldt.view.v1', ovFilter: 'ldt.ovfilter.v1' };

  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

  const settings = Object.assign({ name: '', passcode: '', apiUrl: '' }, lsGet(LS.settings, {}));
  const apiUrl = () => String(settings.apiUrl || CFG.apiUrl || '').trim();

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  // Section labels use Title Case; short joining words stay lowercase.
  const MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'by', 'for', 'in', 'of', 'on', 'to', 'vs', 'per', 'at']);
  const titleCase = (t) => String(t).split(' ').map((w, i) => (i > 0 && MINOR_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const normH = (s) => norm(s).replace(/\s+/g, ' ');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const uniq = (a) => Array.from(new Set(a.filter((x) => x !== '' && x != null)));
  const num = (v) => { const n = parseFloat(String(v).replace(/[,%]/g, '')); return isFinite(n) ? n : null; };
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const round1 = (n) => (n == null ? '–' : (Math.round(n * 10) / 10).toString());

  // ---------------------------------------------------------------- Schema
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const STEP_OPTS = ['Not Started', 'In Progress', 'Completed', 'N/A'];
  const PEOPLE_COLS = ['Email', 'Status', 'Country', 'Employee ID', 'Calling Name', 'Gender', 'Grade', 'Designation', 'Department', 'Process', 'Working Shift', 'Reporting To: Name', 'Manager: Name', 'SDL: Name', 'SBU Head: Name'];
  const SESSION_COLS = ['New Batch #', 'Date', 'Attendance', 'Duration', 'Remarks', 'Module', 'Group'];
  const SURVEY_Q = ['Overall, how would you rate this session?', 'The content was relevant to my role', 'The materials and examples helped me understand the topic', 'The facilitator explained the topic clearly and kept the session engaging'];
  const SURVEY_Q_SHORT = ['Overall rating', 'Relevant to role', 'Materials helped', 'Facilitator clarity'];
  const SURVEY_COMMENT = 'What would have made this session better for you? (Please be specific.)';

  const TASK_STATUS = ['Not Started', 'In Progress', 'Done', 'Blocked', 'N/A'];
  const TASK_CATS = ['Logistics', 'Communications', 'Content', 'Approval', 'Delivery', 'Assessment', 'Evaluation', 'Reporting', 'Recognition', 'Other'];
  // The team's L&D Activity Checklist: the default activities a topic's tasks are picked from.
  // [activity, category, days from the session date (negative = before; null = no set date), BAYB, CX360, Nexcellence, Learning Series, ELGP]
  const CHECKLIST_PROGRAMS = ['BAYB', 'CX360', 'Nexcellence', 'Learning Series', 'ELGP'];
  const ACTIVITY_CHECKLIST = [
    ['Coordination (Non-L&D Faci)', 'Logistics', -10, 'No', 'No', 'No', 'No', 'Yes'],
    ["Coordination (Participant's Supervisor and Managers)", 'Logistics', -7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Coordination (Participants)', 'Logistics', -5, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Pre-Event Communication', 'Communications', -7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Scheduling - Sending Meeting Invites', 'Communications', -7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Group Chat for Participants', 'Communications', -7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ["Manager's Observation Form (Pre)", 'Assessment', -5, 'Yes', 'N/A', 'N/A', 'N/A', 'N/A'],
    ['Pre-Session Self-Learning Workbook Activity', 'Content', -5, 'No', 'Yes', 'No', 'No', 'Yes'],
    ['Pre-Session Demo/Interview', 'Assessment', -3, 'N/A', 'N/A', 'Yes', 'N/A', 'N/A'],
    ['Pre-Assessment', 'Assessment', -1, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Email Reminders', 'Communications', -1, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Chat Reminders', 'Communications', -1, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Induction', 'Delivery', 0, 'Yes', 'Yes', 'Yes', 'No', 'Yes'],
    ['Attendance Tracking', 'Delivery', 0, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Mid-Event Communication', 'Communications', 0, 'No', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Session Quizzes', 'Assessment', 0, 'No', 'Yes', 'No', 'Yes', 'Yes'],
    ['Session Surveys', 'Evaluation', 0, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Daily Report', 'Reporting', 0, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Post-Assessment', 'Assessment', 1, 'Yes', 'Yes', 'Yes', 'No', 'Yes'],
    ['Sharing of Materials (PDF Copy)', 'Content', 1, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Post-Event Communication', 'Communications', 2, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Video Repository of Sessions', 'Content', 2, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Remove Expiration of Video Recording', 'Content', 2, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Testimonials (Written)', 'Evaluation', 3, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Videos (Participants - Testimonials)', 'Evaluation', 3, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Post-Event Report', 'Reporting', 5, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Weekly Report', 'Reporting', 7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Post-Session Demo/Interview', 'Assessment', 7, 'N/A', 'N/A', 'Yes', 'N/A', 'N/A'],
    ['Tracking of Takeaway Activities/Workbook Completion/Submission', 'Evaluation', 7, 'Yes', 'Yes', 'Yes', 'No', 'Yes'],
    ['Distribution of Certificates of Completion', 'Recognition', 7, 'Yes', 'Yes', 'Yes', 'Yes', 'Yes'],
    ['Felicitation', 'Recognition', 7, 'No', 'Yes', 'Yes', 'No', 'Yes'],
    ["Manager's Observation Form (Post)", 'Assessment', 30, 'Yes', 'N/A', 'N/A', 'N/A', 'N/A'],
    ['Mid-Assessment (Annual - Q1/2/3)', 'Assessment', null, 'No', 'N/A', 'Yes', 'No', 'Yes']
  ];
  const DS = {
    tracker: {
      label: 'Program Tracker', sheet: 'Training Activity Tracker', noun: 'program',
      columns: ['Month', 'Program Name', 'Topic', 'Audience', 'Method', 'Training Status', 'Program Owner', 'Implementation Date', 'Content Status', 'Content Count', 'Completed Contents', 'Approved (Internal)', 'Content Remarks', 'Promo Flyers', 'Invitations', 'Surveys', 'Assessment Status', 'Assessment Scores', 'Total Cost'],
      ignore: ['Days Remaining', 'Readiness %'],
      dates: ['Implementation Date'], numbers: ['Content Count', 'Completed Contents', 'Total Cost'], long: ['Content Remarks'],
      options: {
        Month: MONTHS, Method: ['VILT', 'ILT', 'Hybrid', 'SP', 'SP | VILT'],
        'Training Status': ['Not Started', 'In Progress', 'Completed', 'On Hold', 'Cancelled'],
        'Content Status': STEP_OPTS, 'Approved (Internal)': ['Not Started', 'In Progress', 'Pending for Approval', 'Approved', 'N/A'],
        'Promo Flyers': ['Not Started', 'In Progress', 'Sent', 'N/A'], Invitations: ['Not Started', 'In Progress', 'Sent', 'N/A'],
        Surveys: ['Not Started', 'In Progress', 'Sent', 'Completed', 'N/A'], 'Assessment Status': STEP_OPTS
      },
      groups: [['Program', ['Month', 'Program Name', 'Topic', 'Audience', 'Method', 'Program Owner', 'Implementation Date', 'Training Status']],
        ['Content & Readiness', ['Content Status', 'Content Count', 'Completed Contents', 'Approved (Internal)', 'Promo Flyers', 'Invitations', 'Surveys', 'Assessment Status', 'Assessment Scores', 'Content Remarks']],
        ['Budget', ['Total Cost']]],
      key: (r) => [r['Month'], r['Program Name'], r['Topic'], r['Audience']].map(norm).join('|'),
      title: (r) => [r['Program Name'], r['Topic'] && r['Topic'] !== '-' ? r['Topic'] : ''].filter(Boolean).join(' · ')
    },
    attendance: {
      label: 'Attendance', sheet: 'L&D Dashboard Data', noun: 'attendance record',
      columns: ['Program'].concat(PEOPLE_COLS, SESSION_COLS),
      dates: ['Date'], numbers: [], long: ['Remarks'],
      options: { Attendance: ['Present', 'Absent', '<1 hr 30 mins'], Status: ['Active', 'Inactive', 'Resigned'], 'Working Shift': ['Day', 'Night'], Gender: ['Male', 'Female'] },
      tableCols: ['Date', 'Program', 'Module', 'Group', 'New Batch #', 'Calling Name', 'Designation', 'Department', 'Country', 'Working Shift', 'Attendance', 'Duration', 'Remarks'],
      key: (r) => [r['Email'], r['Program'], r['Module'], r['Date']].map(norm).join('|'),
      title: (r) => [r['Calling Name'], r['Program'], r['Module']].filter(Boolean).join(' · ')
    },
    assessments: {
      label: 'Assessments', sheet: 'L&D Assessment + MOF Scores', noun: 'assessment record',
      columns: ['Program', 'Topic', 'Assessment Type'].concat(PEOPLE_COLS, SESSION_COLS, ['Score']),
      dates: ['Date'], numbers: ['Score'], long: ['Remarks'],
      options: { 'Assessment Type': ['Pre-Assessment', 'Mid-Assessment', 'Post-Assessment', 'Short Quiz', 'Pre-Session Managers Observation', 'Post-Session Managers Observation'], Attendance: ['Present', 'Absent', '<1 hr 30 mins'], 'Working Shift': ['Day', 'Night'] },
      tableCols: ['Date', 'Program', 'Topic', 'Assessment Type', 'Module', 'Calling Name', 'Designation', 'Department', 'Score', 'Attendance', 'Remarks'],
      key: (r) => [r['Email'], r['Program'], r['Topic'], r['Assessment Type'], r['Date']].map(norm).join('|'),
      title: (r) => [r['Calling Name'], r['Assessment Type'], r['Topic']].filter(Boolean).join(' · ')
    },
    survey: {
      label: 'Training Survey', sheet: 'L&D Training Survey', noun: 'survey response',
      columns: ['ID', 'Start time', 'Completion time', 'Email', 'Name'].concat(SURVEY_Q, [SURVEY_COMMENT, 'Survey Average', 'Date Conducted', 'Program Name', 'Module', 'Shift']),
      dates: ['Date Conducted'], datetimes: ['Start time', 'Completion time'], numbers: SURVEY_Q.concat(['Survey Average']), long: [SURVEY_COMMENT],
      options: { Shift: ['Day', 'Night'] },
      tableCols: ['Date Conducted', 'Program Name', 'Module', 'Shift', 'Name'].concat(SURVEY_Q, ['Survey Average', SURVEY_COMMENT]),
      headerAlias: Object.fromEntries(SURVEY_Q.map((q, i) => [q, SURVEY_Q_SHORT[i]]).concat([[SURVEY_COMMENT, 'Comment']])),
      key: (r) => [r['ID'], r['Email'], r['Start time'], r['Completion time'], r['Module'], r['Program Name']].map(norm).join('|'),
      title: (r) => [r['Name'] || 'Anonymous', r['Program Name'], r['Module']].filter(Boolean).join(' · ')
    },
    announcements: {
      label: 'Announcements', sheet: 'Announcements', noun: 'announcement',
      columns: ['Title', 'Message', 'Priority', 'Pinned', 'Status', 'Due Date', 'Posted By', 'Posted At', 'Addressed By', 'Addressed At', 'Replies'],
      dates: ['Due Date'], numbers: [], long: ['Message'],
      title: (r) => r.Title || 'Announcement'
    },
    tasks: {
      label: 'Tasks & Logistics', sheet: 'Tasks & Logistics', noun: 'task',
      columns: ['Topic ID', 'Program Name', 'Topic', 'Task', 'Category', 'Details / Requirements', 'Owner', 'Due Date', 'Status', 'Created By', 'Created At'],
      dates: ['Due Date'], long: ['Details / Requirements'],
      options: { Category: TASK_CATS, Status: TASK_STATUS },
      title: (r) => [r.Task, [r['Program Name'], r.Topic && r.Topic !== '-' ? r.Topic : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' — ')
    },
    timelog: {
      label: 'Time Log', sheet: 'Time Log', noun: 'time entry',
      columns: ['Person', 'Task', 'Program Name', 'Topic', 'Start Date', 'End Date', 'Hours per Day', 'Include Weekends', 'Working Days', 'Total Hours', 'Notes', 'Task ID', 'Topic ID', 'Logged By', 'Logged At'],
      dates: ['Start Date', 'End Date'], numbers: ['Hours per Day', 'Working Days', 'Total Hours'],
      title: (r) => `${r.Person || ''} · ${r.Task || ''}`
    },
    users: {
      label: 'Users', sheet: 'Users', noun: 'user',
      columns: ['Name', 'Role', 'Email'],
      title: (r) => r.Name || ''
    },
    activity: {
      label: 'Activity Log', sheet: 'Activity Log', noun: 'activity entry',
      columns: ['When', 'Who', 'Action', 'Area', 'Item', 'Details', 'Dataset', 'Item ID', 'Snapshot'],
      long: ['Details'],
      title: (r) => r.Item || ''
    }
  };
  const IMPORTABLE = ['tracker', 'attendance', 'assessments', 'survey'];
  const ALL_DS = ['tracker', 'tasks', 'timelog', 'attendance', 'assessments', 'survey', 'announcements', 'users', 'activity'];
  for (const k of ALL_DS) { const d = DS[k]; d.dates = d.dates || []; d.datetimes = d.datetimes || []; d.numbers = d.numbers || []; d.long = d.long || []; d.options = d.options || {}; d.ignore = (d.ignore || []).concat(['Last Updated By', 'Last Updated At']); }

  // ---------------------------------------------------------------- Dates
  const pad = (n) => String(n).padStart(2, '0');
  const todayDate = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const isoLocal = (d, withTime) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` + (withTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '');
  function serialToISO(n, withTime) {
    const d = new Date(Math.round((n - 25569) * 86400000));
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return withTime ? `${iso} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : iso;
  }
  function toISO(v, withTime) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return isNaN(v) ? '' : isoLocal(v, withTime);
    if (typeof v === 'number') return serialToISO(v, withTime);
    const s = String(v).trim();
    if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) return serialToISO(+s, withTime);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}` + (withTime && m[4] ? ` ${pad(m[4])}:${m[5]}` : '');
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?$/i);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
      let mo = a, da = b; if (a > 12) { da = a; mo = b; }
      let out = `${y}-${pad(mo)}-${pad(da)}`;
      if (withTime && m[4]) { let h = +m[4]; if (/pm/i.test(m[6] || '') && h < 12) h += 12; if (/am/i.test(m[6] || '') && h === 12) h = 0; out += ` ${pad(h)}:${m[5]}`; }
      return out;
    }
    if (/\d{4}/.test(s) && /[a-z]{3}/i.test(s)) { const d = new Date(s); if (!isNaN(d)) return isoLocal(d, withTime); }
    return s; // e.g. "TBD"
  }
  const parseISO = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const fmtDate = (s, opts) => { const d = parseISO(s); return d ? d.toLocaleDateString(undefined, opts || { day: 'numeric', month: 'short', year: 'numeric' }) : (s || ''); };
  const daysUntil = (s) => { const d = parseISO(s); return d ? Math.round((d - todayDate()) / 86400000) : null; };
  const fmtWhen = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  // ---------------------------------------------------------------- Status helpers
  function statusClass(v) {
    const s = norm(v);
    if (!s) return '';
    if (s === 'n/a' || s === 'na') return 'plain';
    if (/^(completed?|done|approved|sent|present|addressed|yes)$/.test(s)) return 'good';
    if (/cancel|absent|overdue|no.?show|blocked/.test(s)) return 'crit';
    if (/hold|late|<|partial|pending/.test(s)) return 'warn';
    if (/progress|ongoing|scheduled|review|draft/.test(s)) return 'prog';
    return '';
  }
  const pill = (v) => (v ? `<span class="pill ${statusClass(v)}">${esc(v)}</span>` : '<span class="row-meta">—</span>');

  function trackerInfo(r) {
    const st = norm(r['Training Status']);
    const done = st === 'completed';
    const cancelled = /cancel/.test(st);
    const days = daysUntil(r['Implementation Date']);
    const open = !done && !cancelled;
    return { done, cancelled, days, overdue: open && days != null && days < 0, soon: open && days != null && days >= 0 && days <= 7 };
  }
  function daysHtml(r) {
    const i = trackerInfo(r);
    if (i.done) return '<span class="days muted">Done</span>';
    if (i.cancelled) return '<span class="days muted">—</span>';
    if (i.days == null) return '<span class="days muted">TBD</span>';
    if (i.days < 0) return `<span class="days crit">${-i.days}d overdue</span>`;
    if (i.days === 0) return '<span class="days warn">Today</span>';
    return `<span class="days ${i.days <= 7 ? 'warn' : ''}">${i.days}d left</span>`;
  }
  function daysText(r) {
    const i = trackerInfo(r);
    if (i.done) return 'Completed';
    if (i.cancelled) return 'Cancelled';
    return i.days == null ? 'TBD' : i.days;
  }

  const READY = [['Content Status', 'Content'], ['Approved (Internal)', 'Internal approval'], ['Promo Flyers', 'Promo flyers'], ['Invitations', 'Invitations'], ['Surveys', 'Surveys'], ['Assessment Status', 'Assessment']];
  function stepState(v) {
    const s = norm(v);
    if (!s) return 'todo';
    if (s === 'n/a' || s === 'na' || s === 'not applicable') return 'na';
    if (/^(completed?|done|approved|sent|yes)$/.test(s)) return 'done';
    if (/progress|pending|draft|review/.test(s)) return 'prog';
    return 'todo';
  }
  function readiness(r) {
    const steps = READY.map(([k, l]) => ({ k, l, v: r[k], s: stepState(r[k]) }));
    const applicable = steps.filter((x) => x.s !== 'na');
    const done = applicable.filter((x) => x.s === 'done').length;
    return { steps, pct: applicable.length ? Math.round((done / applicable.length) * 100) : 100 };
  }
  function readyHtml(r) {
    const rd = readiness(r);
    const tip = rd.steps.map((x) => `${x.l}: ${x.v || 'Not started'}`).join('\n');
    return `<span class="ready" title="${esc(tip)}">${rd.steps.map((x) => `<i class="${x.s}"></i>`).join('')}<b>${rd.pct}%</b></span>`;
  }
  const splitPeople = (v) => String(v || '').split(/\s*(?:\||,|&|\/|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);

  // ---------------------------------------------------------------- State
  const emptyData = () => Object.fromEntries(ALL_DS.map((k) => [k, []]));
  const state = {
    data: Object.assign(emptyData(), lsGet(LS.data, {})),
    view: lsGet(LS.view, 'overview'),
    taskSel: new Set(),
    filters: { overview: lsGet(LS.ovFilter, {}), impact: { dim: 'designation' }, tracker: {}, tasks: { status: 'open' }, attendance: {}, assessments: {}, survey: {}, announcements: { status: 'Open' }, activity: {} },
    sort: {},
    trackerMode: 'table',
    sync: { mode: 'local', text: '' },
    pendingWrites: 0,
    dirty: false,
    currentRows: null
  };
  const persistLocal = () => lsSet(LS.data, state.data);
  const stamp = (row) => Object.assign(row, { _updatedBy: settings.name || 'Team member', _updatedAt: new Date().toISOString() });

  // ---------------------------------------------------------------- Sync (Apps Script)
  function setSync(mode, text) {
    state.sync = { mode, text: text || '' };
    const pill = $('#syncPill');
    pill.className = 'sync-pill ' + mode;
    const label = { local: 'Local only · not shared', ok: 'Database · synced', busy: 'Syncing…', err: 'Sync problem' }[mode] || mode;
    $('#syncText').textContent = label;
    pill.title = text || (mode === 'local' ? 'No shared database connected. Data is saved in this browser only.' : '');
  }

  async function api(action, payload) {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, key: settings.passcode, by: settings.name }, payload || {}))
    });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Unexpected reply. Check the web app URL and that access is set to "Anyone".'); }
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  async function loadRemote(quiet) {
    if (!apiUrl()) { setSync('local'); return; }
    if (!quiet) setSync('busy');
    try {
      const j = await api('all');
      if (state.pendingWrites > 0) return; // a save is in flight; the next poll picks it up
      const next = emptyData();
      for (const k of ALL_DS) next[k] = Array.isArray(j.data && j.data[k]) ? j.data[k] : [];
      state.usersUnsupported = !(j.data && Array.isArray(j.data.users));
      state.data = next;
      persistLocal();
      setSync('ok', 'Last synced ' + new Date().toLocaleTimeString());
      safeRender();
    } catch (e) {
      setSync('err', e.message);
      if (!quiet) toast('Could not reach the database: ' + e.message, true);
      if (/passcode/i.test(e.message) && !quiet) openSignIn(true);
    }
  }

  // ---------------------------------------------------------------- Activity log
  const short = (v, n) => { const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); n = n || 80; return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const itemTitle = (ds, r) => { try { return (DS[ds].title && DS[ds].title(r)) || r._id; } catch (e) { return r._id; } };
  function diffRows(a, b) {
    const keys = uniq(Object.keys(a).concat(Object.keys(b))).filter((k) => k[0] !== '_' && k !== 'Replies');
    const out = [];
    for (const k of keys) {
      const x = String(a[k] == null ? '' : a[k]), y = String(b[k] == null ? '' : b[k]);
      if (x !== y) out.push(`${k}: ${short(x, 60) || '(blank)'} → ${short(y, 60) || '(blank)'}`);
    }
    const ra = parseReplies(a), rb = parseReplies(b);
    if (rb.length > ra.length) out.push('Reply: ' + short(rb[rb.length - 1].text, 100));
    return out.join('; ');
  }
  // A Sheets cell holds 50,000 characters, so very large restore copies are dropped.
  function makeLog(ds, action, item, details, snapshot, itemId) {
    let snap = snapshot ? JSON.stringify(snapshot) : '';
    if (snap.length > 45000) { snap = ''; details = (details ? details + ' · ' : '') + 'Too large to keep a restore copy here. Ask your Admin to restore it from the database history, or use an export.'; }
    return { _id: uid(), When: new Date().toISOString(), Who: settings.name || 'Team member', Action: action, Area: DS[ds].label, Item: short(item, 140), Details: details || '', Dataset: ds, 'Item ID': itemId || '', Snapshot: snap };
  }
  function autoLog(ds, op, arg) {
    const list = state.data[ds];
    if (op === 'upsert') {
      const prev = list.find((r) => r._id === arg.row._id);
      if (!prev) return makeLog(ds, 'Added', itemTitle(ds, arg.row), '', null, arg.row._id);
      const d = diffRows(prev, arg.row);
      return d ? makeLog(ds, 'Updated', itemTitle(ds, arg.row), d, null, arg.row._id) : null;
    }
    if (op === 'delete') {
      const prev = list.find((r) => r._id === arg.id);
      return prev ? makeLog(ds, 'Deleted', itemTitle(ds, prev), '', { ds, rows: [prev] }, prev._id) : null;
    }
    return null;
  }

  // Applies a change locally, re-renders, then writes it to the shared database.
  // `log`: an activity entry spec ({action, item, details, snapshot, itemId}), false for none, or omitted to derive one.
  async function commit(ds, op, arg, log) {
    let entry = null;
    if (log !== false && ds !== 'activity') entry = log ? makeLog(ds, log.action, log.item, log.details, log.snapshot, log.itemId) : autoLog(ds, op, arg);
    const list = state.data[ds];
    if (op === 'upsert') {
      stamp(arg.row);
      const i = list.findIndex((r) => r._id === arg.row._id);
      if (i >= 0) list[i] = arg.row; else list.push(arg.row);
    } else if (op === 'upsertMany') {
      for (const row of arg.rows) {
        stamp(row);
        const i = list.findIndex((r) => r._id === row._id);
        if (i >= 0) list[i] = row; else list.push(row);
      }
    } else if (op === 'delete') {
      state.data[ds] = list.filter((r) => r._id !== arg.id);
    } else if (op === 'deleteMany') {
      const ids = new Set(arg.ids);
      state.data[ds] = list.filter((r) => !ids.has(r._id));
    } else if (op === 'replace') {
      state.data[ds] = arg.rows;
    }
    if (entry) state.data.activity.push(entry);
    persistLocal();
    render();
    if (!apiUrl()) return true;
    state.pendingWrites++;
    setSync('busy');
    try {
      await api(op, Object.assign({ dataset: ds }, arg));
      if (entry) await api('append', { dataset: 'activity', rows: [entry] });
      setSync('ok', 'Saved ' + new Date().toLocaleTimeString());
      return true;
    } catch (e) {
      setSync('err', e.message);
      toast('Not saved to the database: ' + e.message, true);
      return false;
    } finally {
      state.pendingWrites--;
    }
  }

  // ---------------------------------------------------------------- UI utilities
  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), isErr ? 6500 : 3200);
  }

  let modalCloseHook = null;
  function openModal(html, opts) {
    opts = opts || {};
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-back"><div class="modal ${opts.size || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const back = root.firstElementChild;
    if (!opts.locked) back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    modalCloseHook = opts.onClose || null;
    const first = root.querySelector('input:not([type=hidden]), select, textarea, button.primary');
    if (first) setTimeout(() => first.focus(), 30);
    return root.querySelector('.modal');
  }
  function closeModal() {
    $('#modalRoot').innerHTML = '';
    const hook = modalCloseHook; modalCloseHook = null;
    if (hook) hook();
    if (state.dirty) { state.dirty = false; render(); }
  }
  const modalOpen = () => !!($('#modalRoot').firstElementChild || $('#confirmRoot').firstElementChild);

  // Every delete goes through this: the person must type the confirm word before the button unlocks.
  function confirmDelete(opts) {
    const word = opts.word || 'DELETE';
    return new Promise((resolve) => {
      const root = $('#confirmRoot');
      root.innerHTML = `<div class="modal-back top"><div class="modal sm" role="alertdialog" aria-modal="true" aria-labelledby="cdTitle">
        <div class="modal-head"><h2 id="cdTitle">${esc(opts.title)}</h2></div>
        <div class="modal-body">
          <div class="callout crit">${opts.lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
          <label class="field" style="margin-top:14px">Type ${esc(word)} to confirm<input class="input" id="cdInput" autocomplete="off" spellcheck="false" aria-describedby="cdNote"></label>
          <p class="note" id="cdNote">This is recorded in the Activity Log with your name and the time, and can be restored from there.</p>
        </div>
        <div class="modal-foot"><button class="btn" id="cdCancel" type="button">Cancel</button><button class="btn danger-solid" id="cdOk" type="button" disabled>${esc(opts.okLabel || 'Delete')}</button></div></div></div>`;
      const input = $('#cdInput', root), ok = $('#cdOk', root);
      const finish = (v) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(v); };
      const valid = () => input.value.trim().toUpperCase() === word;
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
      document.addEventListener('keydown', onKey, true);
      input.addEventListener('input', () => { ok.disabled = !valid(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && valid()) finish(true); });
      ok.addEventListener('click', () => finish(true));
      $('#cdCancel', root).addEventListener('click', () => finish(false));
      root.firstElementChild.addEventListener('mousedown', (e) => { if (e.target === root.firstElementChild) finish(false); });
      setTimeout(() => input.focus(), 30);
    });
  }

  // ---------------------------------------------------------------- Charts
  const charts = [];
  const C = {
    ink2: '#48607a', ink3: '#5b6f82', grid: '#e6edf2',
    series: ['#2a7fc0', '#2e9c93', '#5aa65a', '#15385a', '#8eaab4'],
    status: { 'Completed': '#5aa65a', 'In Progress': '#3a86c0', 'Not Started': '#a7b1b8', 'On Hold': '#e6a532', 'Cancelled': '#d0504a' }
  };
  if (window.Chart) {
    Chart.defaults.font.family = '"Inter Tight", "Helvetica Neue", Arial, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = C.ink2;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.pointStyle = 'rectRounded';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = '#12304d';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.maintainAspectRatio = false;
  }
  function mkChart(el, cfg) {
    if (!window.Chart || !el) return null;
    const c = new Chart(el, cfg);
    charts.push(c);
    return c;
  }
  // Stop listening first, then destroy a moment later, so a mouse event Chart.js already queued
  // never lands on a destroyed chart.
  const destroyCharts = () => {
    while (charts.length) {
      const c = charts.pop();
      try { c.options.events = []; c.update('none'); } catch (e) { /* already gone */ }
      setTimeout(() => { try { c.destroy(); } catch (e) { /* already gone */ } }, 120);
    }
  };

  function barChart(el, { labels, datasets, horizontal, stacked, max, min, onClick, legend, valueFmt }) {
    const valueAxis = { beginAtZero: min == null, min, max, grid: { color: C.grid }, border: { display: false }, ticks: { precision: 0, color: C.ink3 }, stacked: !!stacked };
    const catAxis = { grid: { display: false }, border: { color: '#c9d5df' }, ticks: { color: C.ink2, autoSkip: false }, stacked: !!stacked };
    return mkChart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d, i) => Object.assign({
          backgroundColor: d.color || C.series[i % C.series.length],
          hoverBackgroundColor: d.color || C.series[i % C.series.length],
          borderColor: '#ffffff', borderWidth: stacked ? 1 : 0, borderRadius: 4, borderSkipped: stacked ? false : 'start',
          maxBarThickness: 26, categoryPercentage: 0.72, barPercentage: 0.9
        }, d))
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
        plugins: {
          legend: { display: legend !== false && datasets.length > 1, position: 'top', align: 'start' },
          tooltip: { mode: 'index', intersect: false, callbacks: valueFmt ? { label: (ctx) => `${ctx.dataset.label}: ${valueFmt(ctx.raw)}` } : {} }
        },
        interaction: { mode: 'index', axis: horizontal ? 'y' : 'x', intersect: false },
        onClick: onClick ? (evt, els, chart) => {
          const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
          // Navigate after Chart.js finishes handling this event; re-rendering destroys the chart.
          if (pts.length) { const lbl = labels[pts[0].index]; setTimeout(() => onClick(lbl), 0); }
        } : undefined,
        onHover: onClick ? (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } : undefined
      }
    });
  }
  const emptyBox = (title, text) => `<div class="empty"><div><strong>${esc(title)}</strong>${esc(text)}</div></div>`;

  // ---------------------------------------------------------------- Navigation
  const ICONS = {
    overview: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 11h8V3h-8z"/>',
    tracker: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    attendance: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4"/>',
    assessments: '<path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
    survey: '<path d="M12 17.3l-6.2 3.7 1.6-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7z"/>',
    announcements: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
    impact: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    tasks: '<path d="M9 11l2 2 4-4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>',
    activity: '<path d="M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v7h7"/>',
    data: '<path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'
  };
  const VIEWS = {
    overview: { title: 'Program Delivery', nav: 'Program Delivery', sub: () => 'What the L&D team is delivering: completion, deadlines, workload and tasks', render: renderOverview },
    impact: { title: 'Training Impact', nav: 'Training Impact', sub: () => 'Output, effectiveness and ROI of the training delivered', render: renderImpact },
    tracker: { title: 'Program Tracker', nav: 'Program Tracker', sub: () => 'Click a row to edit it, or change a status right in the table', render: renderTracker },
    tasks: { title: 'Tasks & Logistics', nav: 'Tasks', sub: () => 'Every task and logistics item across programs and topics', render: renderTasks },
    activity: { title: 'Activity Log', nav: 'Activity Log', sub: () => 'Every add, edit, delete and restore, with who did it and when', render: renderActivity },
    attendance: { title: 'Attendance', nav: 'Attendance', sub: () => 'Who attended each session', render: (el) => renderDataset(el, 'attendance') },
    assessments: { title: 'Assessments & MOF', nav: 'Assessments', sub: () => 'Pre, mid and post assessments, quizzes and manager observations', render: (el) => renderDataset(el, 'assessments') },
    survey: { title: 'Training Survey', nav: 'Survey', sub: () => 'Learner feedback after each session', render: (el) => renderDataset(el, 'survey') },
    announcements: { title: 'Team Board', nav: 'Team Board', sub: () => 'Announcements and items the team needs to address', render: renderAnnouncements },
    data: { title: 'Import & Data', nav: 'Import & Data', sub: () => 'Upload templates, export data, manage the connection', render: renderData }
  };
  const NAV_ORDER = ['overview', 'impact', 'sep', 'tracker', 'tasks', 'attendance', 'assessments', 'survey', 'sep', 'announcements', 'activity', 'data'];

  function renderNav() {
    const open = state.data.announcements.filter((a) => a.Status !== 'Addressed').length;
    const lateTasks = state.data.tasks.filter((t) => taskInfo(t).overdue).length;
    $('#nav').innerHTML = NAV_ORDER.map((k) => k === 'sep' ? '<div class="nav-sep"></div>' :
      `<button class="nav-btn ${state.view === k ? 'active' : ''}" data-view="${k}" type="button" ${state.view === k ? 'aria-current="page"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>
        ${esc(VIEWS[k].nav)}${k === 'announcements' && open ? `<span class="count">${open}</span>` : ''}${k === 'tasks' && lateTasks ? `<span class="count crit" title="Overdue tasks">${lateTasks}</span>` : ''}</button>`).join('');
    $('#mobileNav').innerHTML = NAV_ORDER.filter((k) => k !== 'sep').map((k) => `<button type="button" data-view="${k}" class="${state.view === k ? 'active' : ''}">${esc(VIEWS[k].nav)}${k === 'announcements' && open ? ` (${open})` : ''}</button>`).join('');
    $('#whoName').textContent = settings.name ? settings.name : '';
    $('#btnSettings').hidden = !isAdmin();
  }
  function go(view, filters) {
    if (!VIEWS[view]) view = 'overview';
    state.view = view;
    if (filters) state.filters[view] = Object.assign({}, state.filters[view] || {}, filters);
    lsSet(LS.view, view);
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    destroyCharts();
    const v = VIEWS[state.view] || VIEWS.overview;
    $('#viewTitle').textContent = v.title;
    $('#viewSub').textContent = v.sub();
    state.currentRows = null;
    const el = $('#view');
    el.innerHTML = '';
    v.render(el);
    renderNav();
  }
  // Re-render unless someone is mid-edit; then wait until they finish.
  function safeRender() {
    const a = document.activeElement;
    const typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#view').contains(a);
    if (modalOpen() || typing) { state.dirty = true; return; }
    render();
  }

  // ---------------------------------------------------------------- Overview filters
  // A topic's month and year come from its Implementation Date; topics without a date fall back to the Month column.
  const monthOf = (r) => { const d = parseISO(r['Implementation Date']); return d ? MONTHS[d.getMonth()] : (r.Month || ''); };
  const yearOf = (iso) => { const d = parseISO(iso); return d ? d.getFullYear() : null; };
  function matchPeriod(iso, monthFallback, f) {
    const d = parseISO(iso);
    if (f.year && (!d || d.getFullYear() !== +f.year)) return false;
    if (f.month) return d ? MONTHS[d.getMonth()] === f.month : monthFallback === f.month;
    return true;
  }
  // Learner datasets: [date column, program column] for each.
  const LEARN = { attendance: ['Date', 'Program'], assessments: ['Date', 'Program'], survey: ['Date Conducted', 'Program Name'] };
  function overviewScope() {
    const f = state.filters.overview;
    const byProg = (v) => !f.program || v === f.program;
    const tracker = state.data.tracker.filter((r) => byProg(r['Program Name']) && matchPeriod(r['Implementation Date'], r.Month, f));
    const ids = new Set(tracker.map((r) => r._id));
    const out = { f, tracker, programRows: state.data.tracker.filter((r) => byProg(r['Program Name'])), tasks: state.data.tasks.filter((t) => ids.has(t['Topic ID'])), learnByProgram: {} };
    for (const [k, [dc, pc]] of Object.entries(LEARN)) {
      out.learnByProgram[k] = state.data[k].filter((r) => byProg(r[pc]));
      out[k] = out.learnByProgram[k].filter((r) => matchPeriod(r[dc], '', f));
    }
    return out;
  }
  function overviewFilterBar(sc, mode) {
    const f = sc.f;
    const years = uniq(state.data.tracker.map((r) => yearOf(r['Implementation Date']))
      .concat(...Object.entries(LEARN).map(([k, [dc]]) => state.data[k].map((r) => yearOf(r[dc]))), [todayDate().getFullYear()])).sort((a, b) => b - a);
    const programs = uniq(state.data.tracker.map((r) => r['Program Name'])
      .concat(...Object.entries(LEARN).map(([k, [, pc]]) => state.data[k].map((r) => r[pc])))).sort();
    const opt = (v, sel, label) => `<option value="${esc(v)}" ${String(v) === String(sel || '') ? 'selected' : ''}>${esc(label == null ? v : label)}</option>`;
    const active = !!(f.year || f.month || f.program);
    const parts = [f.program, f.month, f.year].filter(Boolean).join(' · ');
    return `<div class="ov-filters" role="group" aria-label="Filter the overview">
      <span class="ov-label"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>Filter</span>
      <select class="select" id="ovYear" aria-label="Year">${opt('', f.year, 'All years')}${years.map((y) => opt(y, f.year)).join('')}</select>
      <select class="select" id="ovMonth" aria-label="Month">${opt('', f.month, 'All months')}${MONTHS.map((m) => opt(m, f.month)).join('')}</select>
      <select class="select" id="ovProgram" aria-label="Program">${opt('', f.program, 'All programs')}${programs.map((p) => opt(p, f.program)).join('')}</select>
      ${active ? '<button class="btn sm ghost" type="button" id="ovReset">Reset</button>' : ''}
      <span class="ov-summary">${mode === 'impact'
        ? (active ? `Showing <b>${esc(parts)}</b>: ` : 'All data: ') + `${sc.attendance.length} attendance · ${sc.assessments.length} assessment · ${sc.survey.length} survey records`
        : active ? `Showing <b>${esc(parts)}</b>: ${sc.tracker.length} of ${state.data.tracker.length} topics` : `All data: ${state.data.tracker.length} topics`}</span>
    </div>`;
  }
  function wireOverviewFilters(el) {
    const f = state.filters.overview;
    const set = (k) => (e) => { f[k] = e.target.value; lsSet(LS.ovFilter, f); render(); };
    $('#ovYear', el).addEventListener('change', set('year'));
    $('#ovMonth', el).addEventListener('change', set('month'));
    $('#ovProgram', el).addEventListener('change', set('program'));
    const r = $('#ovReset', el);
    if (r) r.addEventListener('click', () => { state.filters.overview = {}; lsSet(LS.ovFilter, {}); render(); });
  }

  // ---------------------------------------------------------------- Overview
  function renderOverview(el) {
    const sc = overviewScope();
    const rows = sc.tracker;
    const anns = state.data.announcements.filter((a) => a.Status !== 'Addressed')
      .sort((a, b) => annRank(b) - annRank(a) || String(b['Posted At']).localeCompare(String(a['Posted At']))).slice(0, 3);

    let html = '';
    if (anns.length) {
      html += `<div class="ann-banner">${anns.map((a) => `
        <div class="ann-strip ${esc(a.Priority)}" data-goto="announcements" role="button" tabindex="0">
          <span class="pill ${a.Priority === 'Urgent' ? 'crit' : a.Priority === 'Important' ? 'warn' : 'prog'}">${esc(a.Priority || 'Info')}</span>
          <div class="a-body"><div class="a-title">${esc(a.Title)}</div><div class="a-msg">${esc(a.Message)}</div></div>
          <span class="row-meta">${esc(a['Posted By'] || '')}</span>
        </div>`).join('')}</div>`;
    }

    if (!state.data.tracker.length) {
      html += `<div class="card">${emptyBox('No programs yet', ' Upload your Program Tracker workbook (or the blank template) to fill this dashboard.')}
        <div style="text-align:center;margin-top:14px"><button class="btn primary" data-act="upload" type="button">Upload Excel / CSV</button></div></div>`;
      el.innerHTML = html;
      wireCommon(el);
      return;
    }
    html += overviewFilterBar(sc);
    if (!rows.length) {
      html += `<div class="card">${emptyBox('No topics in this period', ' No program topics are dated in that period for that program. Change a filter or click Reset. Learner results for the period are on Training Impact.')}</div>`;
      el.innerHTML = html;
      wireOverviewFilters(el);
      wireCommon(el);
      return;
    }
    // Tiles drill into the tracker with the same program / month / year.
    const ctx = { program: sc.f.program || '', month: sc.f.month || '', year: sc.f.year || '' };

    const info = rows.map((r) => ({ r, i: trackerInfo(r) }));
    const count = (re) => rows.filter((r) => re.test(norm(r['Training Status']))).length;
    const overdue = info.filter((x) => x.i.overdue).length;
    const soon = info.filter((x) => x.i.soon).length;
    const openRows = info.filter((x) => !x.i.done && !x.i.cancelled);
    const avgReady = avg(openRows.map((x) => readiness(x.r).pct));

    const kpi = (label, value, hint, color, go) => `<div class="card kpi" style="--kpi-accent:${color}" ${go ? `data-goto="tracker" data-filter='${esc(JSON.stringify(Object.assign({}, ctx, go)))}' role="button" tabindex="0"` : ''}>
      <div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`;
    html += `<div class="grid kpis">
      ${kpi('Programs', uniq(rows.map((r) => r['Program Name'])).length, `${rows.length} topics / sessions`, 'var(--navy-800)')}
      ${kpi('Completed', count(/^completed$/), pctOf(count(/^completed$/), rows.length) + ' of all', 'var(--good)', { status: 'Completed' })}
      ${kpi('In progress', count(/progress/), 'being built or delivered', 'var(--primary)', { status: 'In Progress' })}
      ${kpi('Not started', count(/^not started$|^$/), 'waiting to begin', 'var(--neutral)', { status: 'Not Started' })}
      ${kpi('Overdue', overdue, 'date passed, not completed', 'var(--crit)', { due: 'overdue' })}
      ${kpi('Due in 7 days', soon, 'coming up this week', 'var(--warn)', { due: 'soon' })}
      ${kpi('Avg readiness', avgReady == null ? '–' : Math.round(avgReady) + '%', 'checklist done, open items', 'var(--accent)')}
      ${(() => { const open = sc.tasks.filter((t) => !taskInfo(t).done); const late = open.filter((t) => taskInfo(t).overdue).length;
        return `<div class="card kpi" style="--kpi-accent:var(--teal-400)" data-goto="tasks" role="button" tabindex="0"><div class="label">Open tasks</div><div class="value">${open.length}</div><div class="hint">${late ? `<b class="days crit">${late} overdue</b>` : 'none overdue'}</div></div>`; })()}
    </div>`;

    const chartYear = +sc.f.year || todayDate().getFullYear();
    html += `<div class="grid period-grid section">${periodCard('mtd', sc)}${periodCard('ytd', sc)}
      <div class="card"><div class="card-head"><h2>Completion by Month, ${chartYear}</h2><span class="sub">By implementation date · click a month to open it</span></div>
        <div class="chart-box"><canvas id="chMonths" aria-label="Sessions completed, overdue and coming up by month"></canvas></div></div></div>`;

    const programs = uniq(rows.map((r) => r['Program Name'] || '(No program)'));
    html += `<div class="grid cols-3-1 section">
      <div class="card"><div class="card-head"><h2>Training Status by Program</h2><span class="sub">Click a bar to open that program</span></div>
        <div class="chart-box" style="height:${Math.max(220, programs.length * 38 + 70)}px"><canvas id="chStatus" aria-label="Training status by program"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Overdue & Upcoming</h2><span class="sub">Next 30 days</span></div><div class="list" id="upcoming"></div></div>
    </div>`;

    html += `<div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Workload by Owner</h2><span class="sub">Open items each person co-owns</span></div><div class="chart-box" id="ownerBox"><canvas id="chOwner" aria-label="Open items by owner"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Tasks Needing Attention</h2><span class="sub">Overdue, blocked or due within 7 days</span></div><div class="list" id="attention"></div></div>
    </div>
    <div class="card section"><div class="card-head"><h2>Team Utilization</h2><span class="sub" id="utSub"></span></div><div id="util"></div></div>`;
    el.innerHTML = html;
    wireOverviewFilters(el);
    monthChart(sc, chartYear);

    // Status by program
    const statuses = orderedStatuses(rows);
    barChart($('#chStatus'), {
      labels: programs, horizontal: true, stacked: true,
      datasets: statuses.map((s) => ({ label: s, color: C.status[s] || C.series[3], data: programs.map((p) => rows.filter((r) => (r['Program Name'] || '(No program)') === p && (r['Training Status'] || 'Not Started') === s).length) })),
      onClick: (p) => go('tracker', Object.assign({}, ctx, { program: p === '(No program)' ? '' : p, status: '', due: '', owner: '', q: '' }))
    });

    // Upcoming
    const up = info.filter((x) => !x.i.done && !x.i.cancelled && x.i.days != null && x.i.days <= 30)
      .sort((a, b) => a.i.days - b.i.days).slice(0, 8);
    $('#upcoming').innerHTML = up.length ? up.map(({ r, i }) => {
      const d = parseISO(r['Implementation Date']);
      return `<div class="list-item" data-edit="${esc(r._id)}" role="button" tabindex="0">
        <div class="date-chip ${i.overdue ? 'over' : ''}"><b>${d.getDate()}</b><span>${d.toLocaleDateString(undefined, { month: 'short' })}</span></div>
        <div><div class="li-title">${esc(DS.tracker.title(r))}</div><div class="li-sub">${esc(r['Program Owner'] || 'No owner')} · ${esc(r['Audience'] || '')}</div></div>
        <div style="text-align:right">${daysHtml(r)}<div style="margin-top:4px">${pill(r['Training Status'])}</div></div></div>`;
    }).join('') : emptyBox('Nothing due', ' No open items in the next 30 days.');

    // Owners
    const owners = {};
    for (const { r, i } of openRows) {
      for (const p of splitPeople(r['Program Owner'])) {
        owners[p] = owners[p] || { 'In Progress': 0, 'Not Started': 0, Overdue: 0 };
        if (i.overdue) owners[p].Overdue++; else if (/progress/.test(norm(r['Training Status']))) owners[p]['In Progress']++; else owners[p]['Not Started']++;
      }
    }
    const ownerNames = Object.keys(owners).sort((a, b) => sumObj(owners[b]) - sumObj(owners[a]));
    if (ownerNames.length) {
      $('#ownerBox').style.height = Math.max(200, ownerNames.length * 40 + 70) + 'px';
      barChart($('#chOwner'), {
        labels: ownerNames, horizontal: true, stacked: true,
        datasets: [['Overdue', C.status.Cancelled], ['In Progress', C.status['In Progress']], ['Not Started', C.status['Not Started']]].map(([s, c]) => ({ label: s, color: c, data: ownerNames.map((o) => owners[o][s]) })),
        onClick: (o) => go('tracker', Object.assign({}, ctx, { owner: o, status: '', due: '', q: '' }))
      });
    } else {
      $('#ownerBox').innerHTML = emptyBox('No open items', ' Everything is completed.');
      $('#ownerBox').style.height = 'auto';
    }

    // Tasks needing attention
    const attention = sc.tasks.filter((t) => { const i = taskInfo(t); return !i.done && (i.overdue || i.blocked || i.soon); })
      .sort((a, b) => String(a['Due Date'] || '9999').localeCompare(String(b['Due Date'] || '9999')));
    $('#attention').innerHTML = attention.length ? attention.slice(0, 8).map((t) => {
      const parent = parentOf(t);
      return `<div class="list-item" data-task="${esc(t._id)}" role="button" tabindex="0" style="grid-template-columns:1fr auto">
        <div><div class="li-title">${esc(t.Task)}</div><div class="li-sub">${esc(parent ? itemTitle('tracker', parent) : t['Program Name'] || '')} · ${esc(t.Owner || 'No owner')}</div></div>
        <div style="text-align:right">${taskDue(t)}<div style="margin-top:4px">${pill(t.Status || 'Not Started')}</div></div></div>`;
    }).join('') + (attention.length > 8 ? `<button class="btn sm ghost" type="button" data-goto="tasks" style="margin-top:8px">See all ${attention.length} on the Tasks page</button>` : '')
      : emptyBox('All on track', ' No overdue, blocked or due-this-week tasks for these filters.');
    $$('[data-task]', el).forEach((n) => { const open = () => openTaskModal(n.dataset.task); n.addEventListener('click', open); n.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); }); });
    drawUtilization(sc);
    wireCommon(el);
  }
  // ---------------------------------------------------------------- Training Impact dashboard
  // Effectiveness and ROI, laid out on the four Kirkpatrick levels. Uses the same filters as Program Delivery.
  const costVal = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.-]/g, '')); return isFinite(n) ? n : null; };
  const fmtNum = (n, d) => (n == null ? '–' : n.toLocaleString(undefined, { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 }));
  function gainOf(ps) {
    if (!ps.length) return null;
    const pre = avg(ps.map((e) => e.pre)), post = avg(ps.map((e) => e.post));
    return { n: ps.length, pre, post, diff: post - pre, pct: pre ? ((post - pre) / pre) * 100 : null, improved: (ps.filter((e) => e.change > 0).length / ps.length) * 100 };
  }
  // Output, reaction, learning, behaviour and cost for one slice of data.
  function impactStats(tracker, attendance, survey, assessments) {
    const delivered = tracker.filter((r) => trackerInfo(r).done);
    const attended = attendance.filter((r) => norm(r.Attendance) !== 'absent');
    const learners = uniq(attended.map((r) => norm(r.Email || r['Calling Name'])));
    const mins = attended.map((r) => durationMin(r.Duration)).filter((x) => x != null);
    const hours = mins.length ? mins.reduce((a, b) => a + b, 0) / 60 : null;
    const costs = delivered.map((r) => costVal(r['Total Cost'])).filter((x) => x != null);
    const cost = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
    const sv = surveyStats(survey);
    return {
      planned: tracker.filter((r) => !trackerInfo(r).cancelled).length, delivered: delivered.length,
      attendances: attended.length, learners: learners.length, hours,
      att: attendanceStats(attendance), sv,
      l2: gainOf(pairScores(assessments, 'assessment').paired), l3: gainOf(pairScores(assessments, 'observation').paired),
      cost, costTopics: costs.length,
      perLearner: cost != null && learners.length ? cost / learners.length : null,
      perHour: cost != null && hours ? cost / hours : null
    };
  }

  // ---------------------------------------------------------------- Results by designation / SBU head
  const GROUP_DIMS = {
    designation: { label: 'Designation', cols: ['Designation'] },
    sbu: { label: 'SBU Head / COE Lead', cols: ['SBU Head: Name', 'COE Lead: Name', 'COE Lead'] }
  };
  const PEOPLE_FIELDS = ['Designation', 'SBU Head: Name', 'COE Lead: Name', 'COE Lead'];
  // Survey responses don't carry designation or SBU head, so they're matched to people by email
  // through the attendance and assessment records.
  function peopleDirectory() {
    const dir = new Map();
    for (const r of state.data.attendance.concat(state.data.assessments)) {
      const k = norm(r.Email);
      if (!k) continue;
      const e = dir.get(k) || {};
      for (const c of PEOPLE_FIELDS) if (r[c]) e[c] = r[c];
      dir.set(k, e);
    }
    return dir;
  }
  function groupValue(r, dim, dir) {
    const p = dir.get(norm(r.Email)) || {};
    for (const c of GROUP_DIMS[dim].cols) { const v = r[c] || p[c]; if (v) return String(v).trim(); }
    return '(Not set)';
  }
  function drawBreakdown(sc) {
    const dim = state.filters.impact.dim in GROUP_DIMS ? state.filters.impact.dim : 'designation';
    $('#bdTitle').textContent = 'Results by ' + GROUP_DIMS[dim].label;
    const dir = peopleDirectory();
    const g = (r) => groupValue(r, dim, dir);
    const survey = sc.survey.filter((r) => dir.has(norm(r.Email)));
    const groups = uniq(sc.attendance.concat(sc.assessments, survey).map(g));
    const rows = groups.map((name) => Object.assign({ name }, impactStats([], sc.attendance.filter((r) => g(r) === name), survey.filter((r) => g(r) === name), sc.assessments.filter((r) => g(r) === name))))
      .sort((a, b) => b.learners - a.learners || a.name.localeCompare(b.name));
    const box = $('#breakdown');
    if (!rows.length) { box.innerHTML = emptyBox('No learner records in this period', ' Change a filter or click Reset.'); return; }
    const maxL = Math.max(1, ...rows.map((r) => r.learners));
    const gain = (x) => (x ? `<span class="days ${x.diff > 0 ? 'up' : x.diff < 0 ? 'crit' : 'muted'}">${signed(x.diff)}</span> <span class="row-meta">(${x.n})</span>` : '<span class="row-meta">—</span>');
    const unmatched = sc.survey.length - survey.length;
    box.innerHTML = `<div class="table-wrap"><table class="data scorecard"><thead><tr>
        <th>${esc(GROUP_DIMS[dim].label)}</th><th>Learners</th><th>Attendances</th><th>Attendance</th><th>Learning Hours</th><th>L1 Reaction</th><th>L2 Learning Gain</th><th>L3 Behavior Change</th>
      </tr></thead><tbody>${rows.map((r) => `<tr style="cursor:default"><td><b>${esc(r.name)}</b></td>
        <td><span class="databar"><i style="width:${Math.round((r.learners / maxL) * 100)}%"></i></span>${fmtNum(r.learners)}</td>
        <td>${fmtNum(r.attendances)}</td><td>${r.att.rate == null ? '—' : Math.round(r.att.rate) + '%'}</td><td>${r.hours == null ? '—' : fmtNum(r.hours, 1)}</td>
        <td>${r.sv.avg == null ? '—' : `${round1(r.sv.avg)} <span class="row-meta">(${r.sv.total})</span>`}</td><td class="nowrap">${gain(r.l2)}</td><td class="nowrap">${gain(r.l3)}</td></tr>`).join('')}</tbody></table></div>
      <p class="note">${GROUP_DIMS[dim].label} comes from the attendance and assessment sheets${dim === 'sbu' ? ' (the "SBU Head: Name" column, or a "COE Lead" column if you add one)' : ''}. Survey answers are matched to people by email${unmatched ? `, so ${unmatched} anonymous or unmatched response${unmatched === 1 ? ' is' : 's are'} left out of L1 here` : ''}. Numbers in brackets are how many learners or responses each figure is based on.</p>`;
  }

  function renderImpact(el) {
    const sc = overviewScope();
    if (!state.data.tracker.length && !state.data.attendance.length && !state.data.survey.length && !state.data.assessments.length) {
      el.innerHTML = `<div class="card">${emptyBox('No training data yet', ' Upload attendance, assessment and survey sheets to measure training impact.')}
        <div style="text-align:center;margin-top:14px"><button class="btn primary" data-act="upload" type="button">Upload Excel / CSV</button></div></div>`;
      return wireCommon(el);
    }
    const s = impactStats(sc.tracker, sc.attendance, sc.survey, sc.assessments);
    const gainVal = (g) => (g ? signed(g.diff) : '–');
    const gainHint = (g, need) => (g ? `${round1(g.pre)} → ${round1(g.post)} · ${Math.round(g.improved)}% improved · ${g.n} learners` : need);
    const level = (n, name, q, value, unit, hint, view) => `<div class="card level" ${view ? `data-goto="${view}" role="button" tabindex="0"` : ''}>
      <div class="level-tag"><span>Level ${n}</span>${name}</div><div class="level-q">${q}</div>
      <div class="value">${value}${unit ? `<small>${unit}</small>` : ''}</div><div class="hint">${hint}</div></div>`;

    let html = overviewFilterBar(sc, 'impact');
    html += `<div class="grid kpis">
      ${kpiCard('Sessions delivered', s.delivered, `of ${s.planned} planned`, 'var(--navy-800)')}
      ${kpiCard('Learners trained', fmtNum(s.learners), `${fmtNum(s.attendances)} attendances`, 'var(--primary)')}
      ${kpiCard('Learning hours', s.hours == null ? '–' : fmtNum(s.hours, 1), 'learner-hours in session', 'var(--teal-400)')}
      ${kpiCard('Hours per learner', s.hours == null || !s.learners ? '–' : fmtNum(s.hours / s.learners, 1), 'average time in training', 'var(--teal-400)')}
      ${kpiCard('Attendance rate', s.att.rate == null ? '–' : Math.round(s.att.rate) + '%', `${s.att.partial} partial attendances`, 'var(--good)')}
      ${kpiCard('Cost per learner', s.perLearner == null ? '–' : fmtNum(s.perLearner), s.cost == null ? 'add Total Cost on topics' : `${fmtNum(s.cost)} total cost`, 'var(--accent)')}
    </div>
    <div class="grid levels section">
      ${level(1, 'Reaction', 'Did learners value it?', s.sv.avg == null ? '–' : round1(s.sv.avg), s.sv.avg == null ? '' : ' / 5', s.sv.total ? `${s.sv.total} responses · ${Math.round(s.sv.fourPlus)}% rated 4 or 5` : 'No survey responses in this period', 'survey')}
      ${level(2, 'Learning', 'Did they learn?', gainVal(s.l2), s.l2 ? ' pts' : '', gainHint(s.l2, 'Needs Pre- and Post-Assessment scores for the same learners'), 'assessments')}
      ${level(3, 'Behavior', 'Are they applying it?', gainVal(s.l3), s.l3 ? ' pts' : '', gainHint(s.l3, "Needs Pre- and Post-Session Managers' Observation scores"), 'assessments')}
      ${level(4, 'Results & ROI', 'Was it worth it?', s.perHour == null ? '–' : fmtNum(s.perHour), s.perHour == null ? '' : ' / hour',
        s.perHour == null ? 'Add Total Cost on delivered topics to see cost per learner and per learning hour' : `cost per learning hour · ${fmtNum(s.cost)} across ${s.costTopics} topics`)}
    </div>
    <div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Learners Trained by Month, ${+sc.f.year || todayDate().getFullYear()}</h2><span class="sub">Unique learners who attended</span></div>
        <div class="chart-box"><canvas id="chLearners" aria-label="Learners trained by month"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Learning Gain by Program</h2><span class="sub">Average Pre vs Post assessment, matched learners</span></div>
        <div class="chart-box" id="gainBox"><canvas id="chGain" aria-label="Average pre and post assessment by program"></canvas></div></div>
    </div>
    <div class="card section"><div class="card-head"><h2>Program Effectiveness Scorecard</h2><span class="sub">One row per program, for the filters above</span></div><div id="scorecard"></div></div>
    <div class="card section"><div class="card-head"><h2 id="bdTitle">Results by Designation</h2>
      <div class="seg" role="group" aria-label="Group by">${Object.entries(GROUP_DIMS).map(([k, g]) => `<button type="button" data-dim="${k}" class="${state.filters.impact.dim === k ? 'on' : ''}">${esc(g.label)}</button>`).join('')}</div></div>
      <div id="breakdown"></div></div>
    <div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Reaction by Module</h2><span class="sub">Survey average, scale 1–5</span></div><div class="chart-box" id="reactBox"><canvas id="chReact" aria-label="Survey average by module"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>What Learners Said</h2><span class="sub">Most recent first</span></div>
        <div class="comments" style="max-height:280px">${s.sv.comments.slice(0, 12).map((c) => `<div class="comment"><p>${esc(c.text)}</p><span>${esc(c.who)} · ${esc(c.module)} · ${esc(fmtDate(c.date))}</span></div>`).join('') || '<span class="note">No comments in this period.</span>'}</div></div>
    </div>`;
    el.innerHTML = html;
    wireOverviewFilters(el);
    drawBreakdown(sc);
    $$('[data-dim]', el).forEach((b) => b.addEventListener('click', () => {
      state.filters.impact.dim = b.dataset.dim;
      $$('[data-dim]', el).forEach((x) => x.classList.toggle('on', x === b));
      drawBreakdown(sc);
    }));

    // Learners per month for the chosen year (the month filter is ignored here so the trend stays visible).
    const y = +sc.f.year || todayDate().getFullYear();
    const perMonth = MONTHS.map((m, i) => uniq(sc.learnByProgram.attendance.filter((r) => { const d = parseISO(r.Date); return d && d.getFullYear() === y && d.getMonth() === i && norm(r.Attendance) !== 'absent'; }).map((r) => norm(r.Email || r['Calling Name']))).length);
    barChart($('#chLearners'), { labels: MONTHS.map((m) => m.slice(0, 3)), datasets: [{ label: 'Learners trained', color: C.series[0], data: perMonth }] });

    const pairs = pairScores(sc.assessments, 'assessment').paired;
    const progs = uniq(pairs.map((e) => e.program || '(blank)'));
    if (progs.length) {
      const mean = (p, side) => { const v = avg(pairs.filter((e) => (e.program || '(blank)') === p).map((e) => e[side])); return v == null ? null : Math.round(v * 10) / 10; };
      barChart($('#chGain'), { labels: progs, horizontal: progs.length > 4, datasets: [{ label: 'Pre', color: PREPOST.pre, data: progs.map((p) => mean(p, 'pre')) }, { label: 'Post', color: PREPOST.post, data: progs.map((p) => mean(p, 'post')) }] });
    } else {
      $('#gainBox').innerHTML = emptyBox('No matched scores yet', ' Add Pre-Assessment and Post-Assessment scores for the same learners to see the learning gain.');
      $('#gainBox').style.height = 'auto';
    }

    const mods = uniq(sc.survey.map((r) => r.Module || '(none)'));
    if (mods.length) {
      $('#reactBox').style.height = Math.max(220, mods.length * 36 + 60) + 'px';
      barChart($('#chReact'), { labels: mods, horizontal: true, min: 0, max: 5, datasets: [{ label: 'Survey average', color: C.series[1], data: mods.map((m) => { const a = avg(sc.survey.filter((r) => (r.Module || '(none)') === m).map(surveyAvg).filter((x) => x != null)); return a == null ? null : Math.round(a * 100) / 100; }) }] });
    } else {
      $('#reactBox').innerHTML = emptyBox('No survey responses', ' Nothing in this period.');
      $('#reactBox').style.height = 'auto';
    }

    // Scorecard: tracker uses "Program Name", learner sheets use "Program" (survey: "Program Name").
    const programs = uniq(sc.tracker.map((r) => r['Program Name']).concat(sc.attendance.map((r) => r.Program), sc.survey.map((r) => r['Program Name']), sc.assessments.map((r) => r.Program))).sort();
    const rowsHtml = programs.map((p) => {
      const t = impactStats(sc.tracker.filter((r) => r['Program Name'] === p), sc.attendance.filter((r) => r.Program === p), sc.survey.filter((r) => r['Program Name'] === p), sc.assessments.filter((r) => r.Program === p));
      const g = (x) => (x ? `<span class="days ${x.diff > 0 ? 'up' : x.diff < 0 ? 'crit' : 'muted'}">${signed(x.diff)}</span> <span class="row-meta">(${x.n})</span>` : '<span class="row-meta">—</span>');
      return `<tr style="cursor:default"><td class="nowrap"><b>${esc(p)}</b></td>
        <td>${t.delivered} <span class="row-meta">/ ${t.planned}</span></td><td>${fmtNum(t.learners)}</td><td>${t.hours == null ? '—' : fmtNum(t.hours, 1)}</td>
        <td>${t.att.rate == null ? '—' : Math.round(t.att.rate) + '%'}</td><td>${t.sv.avg == null ? '—' : round1(t.sv.avg)}</td>
        <td class="nowrap">${g(t.l2)}</td><td class="nowrap">${g(t.l3)}</td><td>${t.perLearner == null ? '—' : fmtNum(t.perLearner)}</td></tr>`;
    }).join('');
    $('#scorecard').innerHTML = programs.length ? `<div class="table-wrap"><table class="data scorecard"><thead><tr>
        <th>Program</th><th>Sessions Delivered</th><th>Learners</th><th>Learning Hours</th><th>Attendance</th><th>L1 Reaction</th><th>L2 Learning Gain</th><th>L3 Behavior Change</th><th>Cost per Learner</th>
      </tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <p class="note">Learning and behavior change are average Post minus Pre points, with the number of matched learners in brackets. When a month is selected, a learner's Pre and Post must both fall in that month to be matched.</p>`
      : emptyBox('No programs in this period', ' Change a filter or click Reset.');
    wireCommon(el);
  }

  // ---------------------------------------------------------------- MTD / YTD
  // Periods follow the calendar year and are based on each topic's Implementation Date.
  // With a Year / Month filter the cards show that month and year instead of the current ones.
  function periodBounds(kind, f) {
    f = f || {};
    const t = todayDate();
    const y = +f.year || t.getFullYear();
    if (kind === 'mtd') {
      const m = f.month ? MONTHS.indexOf(f.month) : t.getMonth();
      const start = new Date(y, m, 1);
      const current = y === t.getFullYear() && m === t.getMonth();
      return { start, end: new Date(y, m + 1, 0), current, title: current ? 'Month to Date' : 'Month', label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
    }
    const current = y === t.getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31), current, title: current ? 'Year to Date' : 'Full Year', label: current ? 'Jan – ' + t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : String(y) };
  }
  const inPeriod = (iso, b, toToday) => { const d = parseISO(iso); return !!d && d >= b.start && d <= (toToday ? todayDate() : b.end); };
  function periodStats(rows, b, learn) {
    learn = learn || state.data;
    const scoped = rows.filter((r) => !trackerInfo(r).cancelled && inPeriod(r['Implementation Date'], b));
    const done = scoped.filter((r) => trackerInfo(r).done).length;
    const overdue = scoped.filter((r) => trackerInfo(r).overdue).length;
    const upcoming = scoped.length - done - overdue;
    const att = learn.attendance.filter((r) => inPeriod(r.Date, b, true));
    const ids = new Set(scoped.map((r) => r._id));
    const tasks = state.data.tasks.filter((t) => ids.has(t['Topic ID']) && norm(t.Status) !== 'n/a');
    const open = scoped.filter((r) => !trackerInfo(r).done);
    return {
      total: scoped.length, done, overdue, upcoming,
      tasks: { total: tasks.length, done: tasks.filter((t) => norm(t.Status) === 'done').length, overdue: tasks.filter((t) => taskInfo(t).overdue).length, blocked: tasks.filter((t) => taskInfo(t).blocked).length },
      readiness: avg(open.map((r) => readiness(r).pct)),
      rate: done + overdue ? (done / (done + overdue)) * 100 : null,
      planPct: scoped.length ? (done / scoped.length) * 100 : null,
      att: attendanceStats(att),
      learners: uniq(att.filter((r) => norm(r.Attendance) !== 'absent').map((r) => norm(r.Email))).length,
      sv: surveyStats(learn.survey.filter((r) => inPeriod(r['Date Conducted'], b, true))),
      as: assessmentStats(learn.assessments.filter((r) => inPeriod(r.Date, b, true)))
    };
  }
  function periodCard(kind, sc) {
    const b = periodBounds(kind, sc.f);
    const s = periodStats(sc.programRows, b, sc.learnByProgram);
    const span = kind === 'mtd' ? 'month' : 'year';
    const seg = (n, cls, label) => (n ? `<i class="${cls}" style="flex:${n}" title="${label}: ${n}"></i>` : '');
    return `<div class="card period">
      <div class="card-head"><h2>${b.title}</h2><span class="sub">${esc(b.label)}${sc.f.program ? ' · ' + esc(sc.f.program) : ''}</span></div>
      <div class="period-top">
        <div><div class="value">${s.rate == null ? '–' : Math.round(s.rate) + '%'}</div><div class="hint">${s.done} of ${s.done + s.overdue} sessions due ${b.start > todayDate() ? 'yet' : 'so far'} are completed</div></div>
        <div class="period-plan"><b>${s.planPct == null ? '–' : Math.round(s.planPct) + '%'}</b><span>of ${s.total} planned this ${span}</span></div>
      </div>
      <div class="segbar" role="img" aria-label="${s.done} completed, ${s.overdue} overdue, ${s.upcoming} coming up">${seg(s.done, 'done', 'Completed')}${seg(s.overdue, 'over', 'Overdue')}${seg(s.upcoming, 'up', 'Coming up')}</div>
      <div class="legend"><span><i style="background:var(--good)"></i>Completed ${s.done}</span><span><i style="background:var(--crit)"></i>Overdue ${s.overdue}</span><span><i style="background:var(--mist-300)"></i>Coming up ${s.upcoming}</span></div>
      <div class="period-mini">
        <div><b>${s.tasks.total ? `${s.tasks.done}/${s.tasks.total}` : '–'}</b><span>tasks done</span></div>
        <div><b class="${s.tasks.overdue ? 'days crit' : ''}">${s.tasks.overdue}</b><span>tasks overdue</span></div>
        <div><b class="${s.tasks.blocked ? 'days crit' : ''}">${s.tasks.blocked}</b><span>tasks blocked</span></div>
        <div><b>${s.readiness == null ? '–' : Math.round(s.readiness) + '%'}</b><span>readiness of open topics</span></div>
      </div></div>`;
  }
  function monthChart(sc, y) {
    const per = MONTHS.map((m, i) => periodStats(sc.programRows, { start: new Date(y, i, 1), end: new Date(y, i + 1, 0) }, sc.learnByProgram));
    barChart($('#chMonths'), {
      labels: MONTHS.map((m) => m.slice(0, 3)), stacked: true,
      datasets: [['Completed', 'done', C.status.Completed], ['Overdue', 'overdue', C.status.Cancelled], ['Coming up', 'upcoming', '#a9bcc6']]
        .map(([label, k, color]) => ({ label, color, data: per.map((p) => p[k]) })),
      onClick: (lbl) => go('tracker', { month: MONTHS.find((m) => m.startsWith(lbl)), year: String(y), program: sc.f.program || '', status: '', due: '', owner: '', q: '' })
    });
  }
  function periodSummaryRows() {
    const m = periodStats(state.data.tracker, periodBounds('mtd'));
    const y = periodStats(state.data.tracker, periodBounds('ytd'));
    const pct = (v) => (v == null ? '' : Math.round(v) / 100);
    const n1 = (v) => (v == null ? '' : Math.round(v * 10) / 10);
    return [
      ['Metric', 'Month to date', 'Year to date'],
      ['Period', periodBounds('mtd').label, periodBounds('ytd').label],
      ['Sessions planned in period', m.total, y.total],
      ['Completed', m.done, y.done],
      ['Overdue (date passed, not completed)', m.overdue, y.overdue],
      ['Coming up', m.upcoming, y.upcoming],
      ['Completion rate (completed ÷ due so far)', pct(m.rate), pct(y.rate)],
      ['Progress vs plan (completed ÷ planned)', pct(m.planPct), pct(y.planPct)],
      ['Attendance rate', pct(m.att.rate), pct(y.att.rate)],
      ['Learners trained', m.learners, y.learners],
      ['Survey average (out of 5)', n1(m.sv.avg), n1(y.sv.avg)],
      ['Assessment average', n1(m.as.avg), n1(y.as.avg)],
      ['As of', isoLocal(todayDate()), isoLocal(todayDate())]
    ];
  }

  const pctOf = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '0%');
  const sumObj = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  function orderedStatuses(rows) {
    const base = ['Completed', 'In Progress', 'Not Started', 'On Hold', 'Cancelled'];
    const present = uniq(rows.map((r) => r['Training Status'] || 'Not Started'));
    return base.filter((s) => present.includes(s)).concat(present.filter((s) => !base.includes(s)));
  }
  const annRank = (a) => (a.Pinned === 'Yes' ? 10 : 0) + ({ Urgent: 3, Important: 2 }[a.Priority] || 1);

  // ---------------------------------------------------------------- Stats
  function attendanceStats(rows) {
    const total = rows.length;
    const present = rows.filter((r) => norm(r.Attendance) === 'present').length;
    const partial = rows.filter((r) => statusClass(r.Attendance) === 'warn').length;
    const mins = rows.map((r) => durationMin(r.Duration)).filter((x) => x != null);
    return { total, present, partial, rate: total ? (present / total) * 100 : null, learners: uniq(rows.map((r) => norm(r.Email))).length, avgMin: avg(mins) };
  }
  function durationMin(v) {
    const s = String(v || '');
    if (!s) return null;
    const h = s.match(/(\d+)\s*h/i), m = s.match(/(\d+)\s*m(?!s)/i), sec = s.match(/(\d+)\s*s/i);
    if (!h && !m && !sec) { const n = num(s); return n; }
    return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0) + (sec ? +sec[1] / 60 : 0);
  }
  function scoreVal(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    const f = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (f) return (+f[1] / +f[2]) * 100;
    const n = num(s);
    if (n == null) return null;
    return n > 0 && n <= 1 && s.indexOf('.') >= 0 ? n * 100 : n;
  }
  const isObservation = (r) => /observation/i.test(r['Assessment Type'] || '');
  function assessmentStats(rows) {
    const scored = rows.filter((r) => !isObservation(r)).map((r) => scoreVal(r.Score)).filter((x) => x != null);
    const a = avg(scored);
    return { total: rows.length, scored: scored.length, avg: a, pct: scored.some((x) => x > 10) };
  }
  function surveyAvg(r) {
    const v = num(r['Survey Average']);
    if (v != null) return v;
    return avg(SURVEY_Q.map((q) => num(r[q])).filter((x) => x != null));
  }
  function surveyStats(rows) {
    const vals = rows.map(surveyAvg).filter((x) => x != null);
    const junk = /^(nil|na|n\/a|none|no|-|\.|nothing|no comment|all good|good|ok|10)$/i;
    const comments = rows.filter((r) => { const c = String(r[SURVEY_COMMENT] || '').trim(); return c.length > 3 && !junk.test(c); })
      .sort((a, b) => String(b['Date Conducted'] || '').localeCompare(String(a['Date Conducted'] || '')))
      .map((r) => ({ text: r[SURVEY_COMMENT], who: r.Name || 'Anonymous', module: [r['Program Name'], r.Module].filter(Boolean).join(' · '), date: r['Date Conducted'] }));
    return { total: rows.length, avg: avg(vals), comments, fourPlus: vals.length ? (vals.filter((x) => x >= 4).length / vals.length) * 100 : null };
  }

  // ---------------------------------------------------------------- Tracker view
  function renderTracker(el) {
    const rows = state.data.tracker;
    const f = state.filters.tracker;
    const opts = (vals, sel, all) => `<option value="">${all}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const months = uniq(rows.map(monthOf).concat(f.month ? [f.month] : [])).sort((a, b) => MONTHS.indexOf(a) - MONTHS.indexOf(b));
    const years = uniq(rows.map((r) => yearOf(r['Implementation Date'])).concat(f.year ? [+f.year] : [])).sort((a, b) => b - a);
    const owners = uniq(rows.flatMap((r) => splitPeople(r['Program Owner']))).sort();
    el.innerHTML = `
      <div class="toolbar">
        <input class="input search" id="fSearch" type="search" placeholder="Search topic, audience, remarks…" value="${esc(f.q || '')}" aria-label="Search">
        <select class="select" id="fYear" aria-label="Year"><option value="">All years</option>${years.map((y) => `<option ${String(y) === String(f.year || '') ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <select class="select" id="fMonth" aria-label="Month">${opts(months, f.month, 'All months')}</select>
        <select class="select" id="fProgram" aria-label="Program">${opts(uniq(rows.map((r) => r['Program Name'])).sort(), f.program, 'All programs')}</select>
        <select class="select" id="fStatus" aria-label="Status">${opts(orderedStatuses(rows), f.status, 'All statuses')}</select>
        <select class="select" id="fOwner" aria-label="Owner">${opts(owners, f.owner, 'All owners')}</select>
        <select class="select" id="fDue" aria-label="Due">${[['', 'Any date'], ['overdue', 'Overdue'], ['soon', 'Due in 7 days'], ['tbd', 'Date TBD']].map(([v, l]) => `<option value="${v}" ${f.due === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="spacer"></span>
        <div class="seg" role="group" aria-label="Layout"><button type="button" data-mode="table" class="${state.trackerMode === 'table' ? 'on' : ''}">Table</button><button type="button" data-mode="board" class="${state.trackerMode === 'board' ? 'on' : ''}">Board</button></div>
        <button class="btn accent" id="btnAdd" type="button">+ Add program</button>
      </div>
      <div id="results"></div>`;
    const bind = (id, key) => $(id, el).addEventListener(id === '#fSearch' ? 'input' : 'change', (e) => { f[key] = e.target.value; drawTrackerResults(); });
    bind('#fSearch', 'q'); bind('#fYear', 'year'); bind('#fMonth', 'month'); bind('#fProgram', 'program'); bind('#fStatus', 'status'); bind('#fOwner', 'owner'); bind('#fDue', 'due');
    $$('[data-mode]', el).forEach((b) => b.addEventListener('click', () => { state.trackerMode = b.dataset.mode; render(); }));
    $('#btnAdd', el).addEventListener('click', () => openEditor('tracker', null));
    drawTrackerResults();
  }

  function filterTracker() {
    const f = state.filters.tracker;
    const q = norm(f.q);
    return state.data.tracker.filter((r) => {
      if ((f.month || f.year) && !matchPeriod(r['Implementation Date'], r.Month, f)) return false;
      if (f.program && r['Program Name'] !== f.program) return false;
      if (f.status && (r['Training Status'] || 'Not Started') !== f.status) return false;
      if (f.owner && !splitPeople(r['Program Owner']).includes(f.owner)) return false;
      if (f.due) {
        const i = trackerInfo(r);
        if (f.due === 'overdue' && !i.overdue) return false;
        if (f.due === 'soon' && !i.soon) return false;
        if (f.due === 'tbd' && (i.days != null || i.done)) return false;
      }
      if (q && !Object.keys(r).some((k) => k[0] !== '_' && norm(r[k]).includes(q))) return false;
      return true;
    });
  }

  function drawTrackerResults() {
    const box = $('#results');
    if (!box) return;
    const rows = filterTracker();
    state.currentRows = { ds: 'tracker', rows };
    if (!state.data.tracker.length) {
      box.innerHTML = `<div class="card">${emptyBox('No programs yet', ' Upload your tracker workbook or add a program by hand.')}</div>`;
      return;
    }
    if (state.trackerMode === 'board') return drawBoard(box, rows);
    const cols = [
      { k: 'Month', w: 'nowrap' }, { k: 'Program Name', w: 'nowrap' }, { k: 'Topic', w: 'topic' }, { k: 'Audience', w: 'aud' }, { k: 'Method', w: 'nowrap' },
      { k: 'Program Owner', w: 'nowrap' }, { k: 'Implementation Date', label: 'Date', w: 'nowrap', fmt: (r) => esc(r['Implementation Date'] ? fmtDate(r['Implementation Date']) : 'TBD') },
      { k: '_days', label: 'Days', w: 'nowrap', fmt: daysHtml, sortVal: (r) => { const i = trackerInfo(r); return i.done ? 1e6 : i.days == null ? 1e5 : i.days; } },
      { k: 'Training Status', w: 'nowrap', fmt: (r) => inlineSelect(r, 'Training Status') },
      { k: '_ready', label: 'Readiness', w: 'nowrap', fmt: readyHtml, sortVal: (r) => readiness(r).pct },
      { k: '_tasks', label: 'Tasks', w: 'nowrap', fmt: taskChip, sortVal: (r) => { const p = taskProgress(r._id); return p.total ? p.done / p.total : -1; } },
      { k: 'Content Status', w: 'nowrap', fmt: (r) => inlineSelect(r, 'Content Status') },
      { k: 'Content Remarks', w: 'wrap' }
    ];
    drawTable(box, 'tracker', rows, cols);
  }

  function inlineSelect(r, col, ds) {
    const v = r[col] || '';
    const opts = uniq((DS[ds || 'tracker'].options[col] || []).concat(v ? [v] : []));
    return `<select class="cell-select pill ${statusClass(v)}" data-inline="${esc(col)}" data-id="${esc(r._id)}" aria-label="${esc(col)}">
      ${v ? '' : '<option value="" selected>—</option>'}${opts.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  }

  function drawBoard(box, rows) {
    const lanes = uniq(['Not Started', 'In Progress', 'Completed'].concat(orderedStatuses(state.data.tracker)));
    box.innerHTML = `<div class="board">${lanes.map((s) => {
      const items = rows.filter((r) => (r['Training Status'] || 'Not Started') === s)
        .sort((a, b) => String(a['Implementation Date'] || '9').localeCompare(String(b['Implementation Date'] || '9')));
      return `<div class="lane" data-lane="${esc(s)}"><h3><span>${pill(s)}</span><span class="row-meta">${items.length}</span></h3>
        ${items.map((r) => `<div class="tile" draggable="true" data-edit="${esc(r._id)}" tabindex="0">
          <div class="t-prog">${esc(r['Program Name'] || '')}</div>
          <div class="t-topic">${esc(r.Topic && r.Topic !== '-' ? r.Topic : r['Audience'] || '')}</div>
          <div class="t-meta"><span>${esc(r['Implementation Date'] ? fmtDate(r['Implementation Date'], { day: 'numeric', month: 'short' }) : 'TBD')} · ${daysHtml(r)}</span>${readyHtml(r)}</div>
          <div class="t-meta" style="margin-top:4px"><span>${esc(r['Program Owner'] || '')}</span>${taskChip(r)}</div></div>`).join('')}</div>`;
    }).join('')}</div><p class="note">Drag a card to another column to change its training status.</p>`;
    $$('.tile', box).forEach((t) => {
      t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-ld-id', t.dataset.edit); e.dataTransfer.effectAllowed = 'move'; });
    });
    $$('.lane', box).forEach((lane) => {
      lane.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-ld-id')) { e.preventDefault(); lane.classList.add('drop'); } });
      lane.addEventListener('dragleave', () => lane.classList.remove('drop'));
      lane.addEventListener('drop', (e) => {
        e.preventDefault(); lane.classList.remove('drop');
        const id = e.dataTransfer.getData('text/x-ld-id');
        const r = state.data.tracker.find((x) => x._id === id);
        if (!r || (r['Training Status'] || 'Not Started') === lane.dataset.lane) return;
        commit('tracker', 'upsert', { row: Object.assign({}, r, { 'Training Status': lane.dataset.lane }) });
        toast(`Moved to ${lane.dataset.lane}`);
      });
    });
  }

  // ---------------------------------------------------------------- Generic table
  function drawTable(box, ds, rows, cols) {
    const s = state.sort[ds] || {};
    let sorted = rows.slice();
    if (s.col) {
      const c = cols.find((x) => x.k === s.col);
      const val = c && c.sortVal ? c.sortVal : (r) => r[s.col];
      sorted.sort((a, b) => {
        const va = val(a), vb = val(b);
        const na = typeof va === 'number' ? va : num(va), nb = typeof vb === 'number' ? vb : num(vb);
        let cmp;
        if (na != null && nb != null && !/[-/]/.test(String(va))) cmp = na - nb;
        else cmp = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), undefined, { numeric: true });
        return s.dir === 'desc' ? -cmp : cmp;
      });
    }
    const LIMIT = 500;
    const shown = sorted.slice(0, LIMIT);
    const alias = DS[ds].headerAlias || {};
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) =>
      `<th data-sort="${esc(c.k)}" title="${esc(c.k[0] === '_' ? c.label : c.k)}">${esc(c.label || alias[c.k] || c.k)}${s.col === c.k ? `<span class="arrow">${s.dir === 'desc' ? '↓' : '↑'}</span>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r) => `<tr data-edit="${esc(r._id)}">${cols.map((c) => {
        const v = c.fmt ? c.fmt(r) : cellHtml(ds, c.k, r[c.k]);
        return `<td class="${c.w || ''}">${v}</td>`;
      }).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--ink-3);padding:28px">No rows match these filters.</td></tr>`}</tbody></table></div>
      <div class="table-foot"><span>${rows.length === state.data[ds].length ? `${rows.length} rows` : `${rows.length} of ${state.data[ds].length} rows`}${rows.length > LIMIT ? ` · showing first ${LIMIT}, narrow the filters or export to see all` : ''}</span><span>Click a row to view or edit</span></div>`;
    $$('th[data-sort]', box).forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      state.sort[ds] = { col: k, dir: s.col === k && s.dir !== 'desc' ? 'desc' : 'asc' };
      drawTable(box, ds, rows, cols);
    }));
    $$('select[data-inline]', box).forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', () => {
        const r = state.data[ds].find((x) => x._id === sel.dataset.id);
        if (!r) return;
        commit(ds, 'upsert', { row: Object.assign({}, r, { [sel.dataset.inline]: sel.value }) });
        toast(`${sel.dataset.inline} set to ${sel.value}`);
      });
    });
  }
  function cellHtml(ds, col, v) {
    if (v == null || v === '') return '<span class="row-meta">—</span>';
    if (DS[ds].dates.includes(col)) return esc(fmtDate(v));
    if (/attendance|status/i.test(col) && statusClass(v)) return pill(v);
    return esc(v);
  }

  // ---------------------------------------------------------------- Attendance / Assessments / Survey views
  function renderDataset(el, ds) {
    const d = DS[ds];
    const rows = state.data[ds];
    const f = state.filters[ds];
    const progCol = ds === 'survey' ? 'Program Name' : 'Program';
    const modCol = ds === 'assessments' ? 'Assessment Type' : 'Module';
    const opts = (vals, sel, all) => `<option value="">${all}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const pre = rows.filter((r) => (!f.program || r[progCol] === f.program) && (!f.mod || r[modCol] === f.mod));

    let html = `<div class="toolbar">
      <select class="select" id="dProg" aria-label="Program">${opts(uniq(rows.map((r) => r[progCol])).sort(), f.program, 'All programs')}</select>
      <select class="select" id="dMod" aria-label="${esc(modCol)}">${opts(uniq(rows.map((r) => r[modCol])).sort(), f.mod, ds === 'assessments' ? 'All assessment types' : 'All modules')}</select>
      <span class="spacer"></span>
      ${rows.length ? '<button class="btn" id="btnBulk" type="button" title="Set one field on every row the filters show">Bulk update</button>' : ''}
      <button class="btn accent" id="btnAdd" type="button">+ Add ${esc(d.noun)}</button></div>`;

    if (!rows.length) {
      html += `<div class="card">${emptyBox('No ' + d.label.toLowerCase() + ' data yet', ` Upload a workbook with a "${d.sheet}" sheet, or use the blank template from Export.`)}
        <div style="text-align:center;margin-top:14px"><button class="btn primary" data-act="upload" type="button">Upload Excel / CSV</button></div></div>`;
      el.innerHTML = html;
      $('#btnAdd', el).addEventListener('click', () => openEditor(ds, null));
      wireCommon(el);
      return;
    }

    if (ds === 'attendance') html += attendanceSection(pre);
    const byProgram = rows.filter((r) => !f.program || r[progCol] === f.program);
    if (ds === 'assessments') { const parts = assessmentSection(pre).split('<!--charts-->'); html += parts[0] + compareSection(byProgram) + parts[1]; }
    if (ds === 'survey') html += surveySection(pre);

    html += `<div class="section card"><div class="toolbar" style="margin-bottom:10px">
      <input class="input search" id="dSearch" type="search" placeholder="Search name, email, remarks…" value="${esc(f.q || '')}" aria-label="Search">
      <label class="check"><input type="checkbox" id="dAll" ${f.allCols ? 'checked' : ''}> Show all columns</label></div>
      <div id="dTable"></div></div>`;
    el.innerHTML = html;

    $('#dProg', el).addEventListener('change', (e) => { f.program = e.target.value; render(); });
    $('#dMod', el).addEventListener('change', (e) => { f.mod = e.target.value; render(); });
    $('#dAll', el).addEventListener('change', (e) => { f.allCols = e.target.checked; drawDsTable(ds, pre); });
    $('#dSearch', el).addEventListener('input', (e) => { f.q = e.target.value; drawDsTable(ds, pre); });
    $('#btnAdd', el).addEventListener('click', () => openEditor(ds, null));
    $('#btnBulk', el).addEventListener('click', () => openBulkUpdate(ds));
    drawDsTable(ds, pre);

    if (ds === 'attendance') attendanceCharts(pre);
    if (ds === 'assessments') { assessmentCharts(pre); compareWire(byProgram); }
    if (ds === 'survey') surveyCharts(pre);
    wireCommon(el);
  }

  function drawDsTable(ds, pre) {
    const f = state.filters[ds];
    const q = norm(f.q);
    const rows = q ? pre.filter((r) => Object.keys(r).some((k) => k[0] !== '_' && norm(r[k]).includes(q))) : pre;
    state.currentRows = { ds, rows };
    const keys = f.allCols ? columnsFor(ds, state.data[ds]) : DS[ds].tableCols;
    drawTable($('#dTable'), ds, rows, keys.map((k) => ({ k, w: DS[ds].long.includes(k) ? 'wrap' : 'nowrap' })));
  }

  const kpiCard = (label, value, hint, color) => `<div class="card kpi" style="--kpi-accent:${color || 'var(--primary)'}"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint || ''}</div></div>`;

  function attendanceSection(rows) {
    const s = attendanceStats(rows);
    return `<div class="grid kpis">
      ${kpiCard('Records', rows.length, `${s.learners} unique learners`, 'var(--navy-800)')}
      ${kpiCard('Present', s.rate == null ? '–' : Math.round(s.rate) + '%', `${s.present} of ${s.total} records`, 'var(--good)')}
      ${kpiCard('Partial attendance', s.partial, 'left early or joined late', 'var(--warn)')}
      ${kpiCard('Avg time in session', s.avgMin == null ? '–' : fmtMin(s.avgMin), 'from the Duration column', 'var(--accent)')}
      ${kpiCard('Batches', uniq(rows.map((r) => r['New Batch #'])).length, `${uniq(rows.map((r) => r.Module)).length} modules`, 'var(--primary)')}
    </div>
    <div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Attendance by Module</h2></div><div class="chart-box"><canvas id="chAttMod" aria-label="Attendance outcome by module"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Learners by Department</h2></div><div class="chart-box"><canvas id="chAttDept" aria-label="Learners by department"></canvas></div></div>
    </div>`;
  }
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`);
  function attendanceCharts(rows) {
    const mods = uniq(rows.map((r) => r.Module || '(none)'));
    const outcome = (r) => { const c = statusClass(r.Attendance); return c === 'good' ? 'Present' : c === 'warn' ? 'Partial' : c === 'crit' ? 'Absent' : 'Other'; };
    const outs = [['Present', C.status.Completed], ['Partial', C.status['On Hold']], ['Absent', C.status.Cancelled], ['Other', C.status['Not Started']]].filter(([o]) => rows.some((r) => outcome(r) === o));
    barChart($('#chAttMod'), { labels: mods, stacked: true, datasets: outs.map(([o, c]) => ({ label: o, color: c, data: mods.map((m) => rows.filter((r) => (r.Module || '(none)') === m && outcome(r) === o).length) })) });
    const depts = countBy(rows, 'Department');
    barChart($('#chAttDept'), { labels: depts.map((x) => x[0]), horizontal: true, datasets: [{ label: 'Records', data: depts.map((x) => x[1]) }] });
  }
  const countBy = (rows, col) => Object.entries(rows.reduce((m, r) => { const k = r[col] || '(blank)'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12);

  function assessmentSection(rows) {
    const s = assessmentStats(rows);
    const scoredAll = rows.filter((r) => scoreVal(r.Score) != null).length;
    const byType = (re) => avg(rows.filter((r) => re.test(norm(r['Assessment Type']))).map((r) => scoreVal(r.Score)).filter((x) => x != null));
    const pre = byType(/^pre-assessment|^pre assessment/), post = byType(/^post-assessment|^post assessment/);
    const lift = pre != null && post != null ? post - pre : null;
    return `<div class="grid kpis">
      ${kpiCard('Records', rows.length, `${uniq(rows.map((r) => norm(r.Email))).length} learners`, 'var(--navy-800)')}
      ${kpiCard('Scored', scoredAll, scoredAll < rows.length ? `${rows.length - scoredAll} still need a score` : 'all records scored', 'var(--accent)')}
      ${kpiCard('Average score', s.avg == null ? '–' : round1(s.avg), 'assessments and quizzes, not observations', 'var(--primary)')}
      ${kpiCard('Pre → Post change', lift == null ? '–' : (lift > 0 ? '+' : '') + round1(lift), pre == null || post == null ? 'needs pre and post scores' : `${round1(pre)} → ${round1(post)}`, lift != null && lift < 0 ? 'var(--crit)' : 'var(--good)')}
    </div>
    <!--charts--><div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Average Score by Assessment Type</h2></div><div class="chart-box" id="asBox"><canvas id="chAsType" aria-label="Average score by assessment type"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Records by Assessment Type</h2></div><div class="chart-box"><canvas id="chAsCount" aria-label="Records by assessment type"></canvas></div></div>
    </div>`;
  }
  // ---------------------------------------------------------------- Pre vs Post
  // Pairs each learner's Pre and Post scores (same email + program); Mid-assessments and quizzes are left out.
  const CMP = {
    assessment: { label: 'Assessment', pre: /^pre[-\s]?assessment/, post: /^post[-\s]?assessment/, noun: 'Pre-Assessment and Post-Assessment' },
    observation: { label: "Managers' observation", pre: /^pre.*observation/, post: /^post.*observation/, noun: 'Pre-Session and Post-Session Managers Observation' }
  };
  const PREPOST = { pre: '#2aa198', post: '#2c6fa6' };
  function pairScores(rows, kind) {
    const c = CMP[kind];
    const map = new Map();
    for (const r of rows) {
      const t = norm(r['Assessment Type']);
      const side = c.pre.test(t) ? 'pre' : c.post.test(t) ? 'post' : null;
      const v = side ? scoreVal(r.Score) : null;
      if (v == null) continue;
      const k = norm(r.Email || r['Calling Name']) + '|' + norm(r.Program);
      const e = map.get(k) || { name: r['Calling Name'] || r.Email || '—', dept: r.Department || '', program: r.Program || '', group: r.Group || '', pre: [], post: [] };
      e[side].push(v);
      map.set(k, e);
    }
    const all = Array.from(map.values()).map((e) => Object.assign({}, e, { pre: avg(e.pre), post: avg(e.post) }));
    const paired = all.filter((e) => e.pre != null && e.post != null).map((e) => Object.assign(e, { change: e.post - e.pre }));
    return { paired, preOnly: all.filter((e) => e.post == null).length, postOnly: all.filter((e) => e.pre == null).length };
  }
  const signed = (n) => (n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + round1(Math.abs(n)));
  function compareSection(rows) {
    const kind = state.filters.assessments.cmp || 'assessment';
    const p = pairScores(rows, kind);
    const ps = p.paired;
    const tabs = `<div class="seg" role="group" aria-label="Compare">${Object.entries(CMP).map(([k, c]) => `<button type="button" data-cmp="${k}" class="${k === kind ? 'on' : ''}">${esc(c.label)}</button>`).join('')}</div>`;
    let body;
    if (!ps.length) {
      body = emptyBox('No matched pairs yet', ` Add a Score for the same learner (same email and program) on both the ${CMP[kind].noun}. Right now ${p.preOnly} learners have only a Pre score and ${p.postOnly} only a Post score.`);
    } else {
      const aPre = avg(ps.map((e) => e.pre)), aPost = avg(ps.map((e) => e.post)), diff = aPost - aPre;
      const up = ps.filter((e) => e.change > 0).length, down = ps.filter((e) => e.change < 0).length;
      body = `<div class="grid kpis">
          ${kpiCard('Matched learners', ps.length, `${p.preOnly} pre only · ${p.postOnly} post only`, 'var(--navy-800)')}
          ${kpiCard('Average pre', round1(aPre), 'baseline', PREPOST.pre)}
          ${kpiCard('Average post', round1(aPost), 'after training', PREPOST.post)}
          ${kpiCard('Average change', signed(diff), aPre ? `${signed((diff / aPre) * 100)}% vs pre` : '', diff >= 0 ? 'var(--good)' : 'var(--crit)')}
          ${kpiCard('Improved', Math.round((up / ps.length) * 100) + '%', `${up} up · ${ps.length - up - down} same · ${down} down`, 'var(--good)')}
        </div>
        <div class="grid cols-2" style="margin-top:16px">
          <div><div class="card-head"><h2 id="cmpChartTitle">Average Pre vs Post</h2></div><div class="chart-box"><canvas id="chCmp" aria-label="Average pre and post score"></canvas></div></div>
          <div><div class="card-head"><h2>Each Learner</h2><span class="sub">Biggest gains first</span></div>
            <div class="table-wrap" style="max-height:280px"><table class="data"><thead><tr><th>Learner</th><th>Department</th><th>Program</th><th>Pre</th><th>Post</th><th>Change</th></tr></thead><tbody>
            ${ps.slice().sort((a, b) => b.change - a.change).map((e) => `<tr style="cursor:default"><td class="nowrap">${esc(e.name)}</td><td class="nowrap">${esc(e.dept)}</td><td class="nowrap">${esc(e.program)}</td>
              <td>${round1(e.pre)}</td><td>${round1(e.post)}</td><td class="nowrap"><span class="days ${e.change > 0 ? 'up' : e.change < 0 ? 'crit' : 'muted'}">${e.change > 0 ? '▲' : e.change < 0 ? '▼' : '•'} ${signed(e.change)}</span></td></tr>`).join('')}
            </tbody></table></div></div>
        </div>`;
    }
    return `<div class="card section"><div class="card-head"><h2>Pre vs Post Comparison</h2>${tabs}</div>${body}</div>`;
  }
  function compareWire(rows) {
    $$('[data-cmp]').forEach((b) => b.addEventListener('click', () => { state.filters.assessments.cmp = b.dataset.cmp; render(); }));
    const el = $('#chCmp');
    if (!el) return;
    const ps = pairScores(rows, state.filters.assessments.cmp || 'assessment').paired;
    // Group by program; when only one program is in view, break it down by department instead.
    const dim = uniq(ps.map((e) => e.program)).length > 1 ? 'program' : 'dept';
    $('#cmpChartTitle').textContent = 'Average Pre vs Post by ' + (dim === 'program' ? 'Program' : 'Department');
    const cats = uniq(ps.map((e) => e[dim] || '(blank)'));
    const mean = (c, side) => { const v = avg(ps.filter((e) => (e[dim] || '(blank)') === c).map((e) => e[side])); return v == null ? null : Math.round(v * 10) / 10; };
    barChart(el, {
      labels: cats, horizontal: cats.length > 4,
      datasets: [{ label: 'Pre', color: PREPOST.pre, data: cats.map((c) => mean(c, 'pre')) }, { label: 'Post', color: PREPOST.post, data: cats.map((c) => mean(c, 'post')) }]
    });
  }
  function compareExportRows() {
    const out = [['Comparison', 'Learner', 'Department', 'Program', 'Pre', 'Post', 'Change']];
    for (const k of Object.keys(CMP)) {
      for (const e of pairScores(state.data.assessments, k).paired) out.push([CMP[k].label, e.name, e.dept, e.program, Math.round(e.pre * 10) / 10, Math.round(e.post * 10) / 10, Math.round(e.change * 10) / 10]);
    }
    return out;
  }

  function assessmentCharts(rows) {
    const types = uniq(rows.map((r) => r['Assessment Type'] || '(none)'));
    const avgs = types.map((t) => avg(rows.filter((r) => (r['Assessment Type'] || '(none)') === t).map((r) => scoreVal(r.Score)).filter((x) => x != null)));
    if (avgs.every((x) => x == null)) {
      $('#asBox').innerHTML = emptyBox('No scores yet', ' Add scores in the Score column (e.g. 85, 85% or 17/20) and they will chart here.');
    } else {
      barChart($('#chAsType'), { labels: types, horizontal: true, datasets: [{ label: 'Average score', data: avgs.map((x) => (x == null ? null : Math.round(x * 10) / 10)) }] });
    }
    const counts = types.map((t) => rows.filter((r) => (r['Assessment Type'] || '(none)') === t).length);
    barChart($('#chAsCount'), { labels: types, horizontal: true, datasets: [{ label: 'Records', color: C.series[1], data: counts }] });
  }

  function surveySection(rows) {
    const s = surveyStats(rows);
    return `<div class="grid kpis">
      ${kpiCard('Responses', rows.length, `${uniq(rows.map((r) => r['Date Conducted'])).length} sessions`, 'var(--navy-800)')}
      ${kpiCard('Survey average', s.avg == null ? '–' : round1(s.avg) + ' / 5', 'mean of the four rating questions', 'var(--primary)')}
      ${kpiCard('Rated 4 or higher', s.fourPlus == null ? '–' : Math.round(s.fourPlus) + '%', 'share of responses', 'var(--good)')}
      ${kpiCard('Written comments', s.comments.length, 'with useful detail', 'var(--accent)')}
    </div>
    <div class="grid cols-2 section">
      <div class="card"><div class="card-head"><h2>Average Rating by Question</h2><span class="sub">Scale 1–5</span></div><div class="chart-box"><canvas id="chSvQ" aria-label="Average rating by question"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Average by Module</h2><span class="sub">Scale 1–5</span></div><div class="chart-box"><canvas id="chSvMod" aria-label="Survey average by module"></canvas></div></div>
    </div>
    <div class="card section"><div class="card-head"><h2>What Learners Said</h2><span class="sub">Most recent first</span></div>
      <div class="comments">${s.comments.slice(0, 30).map((c) => `<div class="comment"><p>${esc(c.text)}</p><span>${esc(c.who)} · ${esc(c.module)} · ${esc(fmtDate(c.date))}</span></div>`).join('') || '<span class="note">No comments yet.</span>'}</div></div>`;
  }
  function surveyCharts(rows) {
    const qAvg = SURVEY_Q.map((q) => avg(rows.map((r) => num(r[q])).filter((x) => x != null)));
    barChart($('#chSvQ'), { labels: SURVEY_Q_SHORT, horizontal: true, min: 0, max: 5, datasets: [{ label: 'Average', data: qAvg.map((x) => (x == null ? null : Math.round(x * 100) / 100)) }] });
    const mods = uniq(rows.map((r) => r.Module || '(none)'));
    barChart($('#chSvMod'), { labels: mods, horizontal: true, min: 0, max: 5, datasets: [{ label: 'Survey average', color: C.series[2], data: mods.map((m) => { const a = avg(rows.filter((r) => (r.Module || '(none)') === m).map(surveyAvg).filter((x) => x != null)); return a == null ? null : Math.round(a * 100) / 100; }) }] });
  }

  // ---------------------------------------------------------------- Editor
  function columnsFor(ds, rows) {
    const base = DS[ds].columns.slice();
    const extra = [];
    for (const r of rows) for (const k of Object.keys(r)) if (k[0] !== '_' && !base.includes(k) && !extra.includes(k) && !DS[ds].ignore.includes(k)) extra.push(k);
    return base.concat(extra);
  }
  function fieldHtml(ds, col, v) {
    const d = DS[ds];
    const id = 'f_' + Math.random().toString(36).slice(2, 9);
    const alias = (d.headerAlias || {})[col];
    const label = `<span title="${esc(col)}">${esc(alias ? alias + ' — ' + col : col)}</span>`;
    v = v == null ? '' : v;
    if (d.long.includes(col)) return `<label class="field wide">${label}<textarea class="input" data-col="${esc(col)}">${esc(v)}</textarea></label>`;
    if (d.dates.includes(col)) {
      const iso = parseISO(v) ? v.slice(0, 10) : '';
      return `<label class="field">${label}<input class="input" type="date" data-col="${esc(col)}" value="${esc(iso)}">${!iso && v ? `<span class="note">Currently "${esc(v)}". Leave empty for TBD.</span>` : ds === 'tracker' ? '<span class="note">Leave empty for TBD</span>' : ''}</label>`;
    }
    const known = uniq((d.options[col] || []).concat(col === 'Program Owner' ? usersList().map((u) => u.Name) : [], state.data[ds].map((r) => r[col]).filter((x) => x && String(x).length < 60))).slice(0, 80);
    const list = known.length && !d.numbers.includes(col) ? `<datalist id="${id}">${known.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    return `<label class="field">${label}<input class="input" ${d.numbers.includes(col) ? 'inputmode="decimal"' : ''} data-col="${esc(col)}" value="${esc(v)}" ${list ? `list="${id}"` : ''} autocomplete="off">${list}</label>`;
  }

  function openEditor(ds, id, opts) {
    opts = opts || {};
    if (ds === 'tasks') return openTaskModal(id);
    if (ds === 'activity') return;
    const d = DS[ds];
    const existing = id ? state.data[ds].find((r) => r._id === id) : null;
    const row = existing ? Object.assign({}, existing) : { _id: uid() };
    if (!existing && ds === 'tracker') { row.Month = MONTHS[new Date().getMonth()]; row['Training Status'] = 'Not Started'; }
    const cols = columnsFor(ds, state.data[ds]);
    let body;
    if (d.groups) {
      const used = d.groups.flatMap((g) => g[1]);
      const rest = cols.filter((c) => !used.includes(c));
      body = d.groups.concat(rest.length ? [['Other Columns', rest]] : []).map(([g, cs]) => `<div class="form-group-title">${esc(g)}</div>${cs.map((c) => fieldHtml(ds, c, row[c])).join('')}`).join('');
    } else {
      body = cols.map((c) => fieldHtml(ds, c, row[c])).join('');
    }
    const withTasks = ds === 'tracker';
    const meta = existing && existing._updatedAt ? `Last updated by ${esc(existing._updatedBy || 'someone')} · ${esc(fmtWhen(existing._updatedAt))}` : '';
    const m = openModal(`
      <div class="modal-head"><div><h2>${esc(titleCase((existing ? 'Edit ' : 'Add ') + d.noun))}</h2>${existing ? `<div class="note">${esc(d.title(existing))}</div>` : ''}</div>
        <button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
      ${withTasks ? `<div class="modal-tabs" role="tablist">
        <button type="button" role="tab" data-etab="details" class="on" aria-selected="true">Details</button>
        <button type="button" role="tab" data-etab="tasks" aria-selected="false" ${existing ? '' : 'disabled title="Save the program first, then add its tasks"'}>Tasks & Logistics <span class="tab-count" id="edTaskCount">${existing ? esc(taskCountLabel(existing._id)) : ''}</span></button></div>` : ''}
      <form class="modal-body" id="edForm"><div class="form-grid">${body}</div></form>
      ${withTasks && existing ? '<div class="modal-body" id="edTasks" hidden></div>' : ''}
      <div class="modal-foot" id="edFoot"><span class="left">${meta}</span>
        ${existing ? '<button class="btn danger" id="edDel" type="button">Delete</button>' : ''}
        ${existing && ds === 'tracker' ? '<button class="btn" id="edDup" type="button" title="Copy this topic and its task list">Duplicate</button>' : ''}
        <button class="btn" data-close type="button">Cancel</button>
        <button class="btn primary" id="edSave" type="button">${existing ? 'Save changes' : 'Add'}</button></div>
      ${withTasks && existing ? '<div class="modal-foot" id="edFootTasks" hidden><span class="left">Tasks save as soon as you change them.</span><button class="btn" data-close type="button">Done</button></div>' : ''}`);
    const collect = () => {
      const out = Object.assign({}, row);
      $$('#edForm [data-col]', m).forEach((inp) => { out[inp.dataset.col] = inp.value.trim(); });
      if (ds === 'survey' && !out['Survey Average']) { const a = surveyAvg(out); if (a != null) out['Survey Average'] = String(Math.round(a * 100) / 100); }
      return out;
    };
    const showTab = (tab) => {
      $$('[data-etab]', m).forEach((b) => { const on = b.dataset.etab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      $('#edForm', m).hidden = tab !== 'details';
      $('#edFoot', m).hidden = tab !== 'details';
      if ($('#edTasks', m)) { $('#edTasks', m).hidden = tab !== 'tasks'; $('#edFootTasks', m).hidden = tab !== 'tasks'; }
    };
    $$('[data-etab]', m).forEach((b) => b.addEventListener('click', () => showTab(b.dataset.etab)));
    $('#edSave', m).addEventListener('click', async () => {
      const out = collect();
      closeModal();
      await commit(ds, 'upsert', { row: out });
      toast(existing ? 'Saved' : 'Added');
    });
    $('#edForm', m).addEventListener('submit', (e) => { e.preventDefault(); $('#edSave', m).click(); });
    if (!existing) return;
    $('#edDel', m).addEventListener('click', async () => {
      const kids = ds === 'tracker' ? tasksFor(existing._id) : [];
      const lines = [`"${d.title(existing)}" will be removed for the whole team.`];
      if (kids.length) lines.push(`Its ${kids.length} task${kids.length === 1 ? '' : 's'} will be removed too.`);
      if (!(await confirmDelete({ title: 'Delete this ' + d.noun + '?', lines }))) return;
      closeModal();
      if (ds === 'tracker') await deleteTopic(existing); else await commit(ds, 'delete', { id });
      toast('Deleted. You can restore it from the Activity Log.');
    });
    const dup = $('#edDup', m);
    if (dup) dup.addEventListener('click', async () => {
      const copy = Object.assign(collect(), { _id: uid() });
      copy.Topic = (copy.Topic || '') + ' (copy)';
      copy['Training Status'] = 'Not Started';
      const kids = tasksFor(existing._id).map((t) => Object.assign({}, t, { _id: uid(), 'Topic ID': copy._id, Topic: copy.Topic, Status: 'Not Started', 'Created By': settings.name || 'Team member', 'Created At': new Date().toISOString() }));
      closeModal();
      await commit('tracker', 'upsert', { row: copy }, { action: 'Added', item: itemTitle('tracker', copy), itemId: copy._id, details: `Duplicated from "${itemTitle('tracker', existing)}"${kids.length ? ` with ${kids.length} tasks` : ''}` });
      if (kids.length) await commit('tasks', 'upsertMany', { rows: kids }, false);
      openEditor('tracker', copy._id);
      toast('Copy created. Update its topic and date.');
    });
    if (withTasks) {
      renderTaskPanel($('#edTasks', m), existing);
      if (opts.tab === 'tasks') showTab('tasks');
    }
  }

  async function deleteTopic(row) {
    const kids = tasksFor(row._id);
    await commit('tracker', 'delete', { id: row._id }, {
      action: 'Deleted', item: itemTitle('tracker', row), itemId: row._id,
      details: kids.length ? `Also removed ${kids.length} task${kids.length === 1 ? '' : 's'}` : '',
      snapshot: { ds: 'tracker', rows: [row], children: { tasks: kids } }
    });
    if (kids.length) await commit('tasks', 'deleteMany', { ids: kids.map((k) => k._id) }, false);
  }

  // ---------------------------------------------------------------- Tasks & logistics
  const tasksFor = (topicId) => state.data.tasks.filter((t) => t['Topic ID'] === topicId)
    .sort((a, b) => String(a['Due Date'] || '9999').localeCompare(String(b['Due Date'] || '9999')) || String(a['Created At']).localeCompare(String(b['Created At'])));
  const parentOf = (t) => state.data.tracker.find((r) => r._id === t['Topic ID']);
  function taskInfo(t) {
    const st = norm(t.Status);
    const done = st === 'done' || st === 'n/a';
    const days = daysUntil(t['Due Date']);
    return { done, days, overdue: !done && days != null && days < 0, soon: !done && days != null && days >= 0 && days <= 7, blocked: st === 'blocked' };
  }
  function taskProgress(topicId) {
    const ts = tasksFor(topicId).filter((t) => norm(t.Status) !== 'n/a');
    return { total: ts.length, done: ts.filter((t) => norm(t.Status) === 'done').length, overdue: ts.filter((t) => taskInfo(t).overdue).length };
  }
  const taskCountLabel = (topicId) => { const p = taskProgress(topicId); return p.total ? `${p.done}/${p.total}` : ''; };
  function taskChip(r) {
    const p = taskProgress(r._id);
    return `<button type="button" class="task-chip ${p.overdue ? 'late' : p.total && p.done === p.total ? 'all' : ''}" data-tasks="${esc(r._id)}" title="${p.total ? `${p.done} of ${p.total} tasks done${p.overdue ? `, ${p.overdue} overdue` : ''}` : 'Add tasks'}">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>${p.total ? `${p.done}/${p.total}` : 'Add'}</button>`;
  }
  function taskDue(t) {
    if (!t['Due Date']) return '<span class="row-meta">No due date</span>';
    const i = taskInfo(t);
    const when = esc(fmtDate(t['Due Date'], { day: 'numeric', month: 'short' }));
    if (i.done) return `<span class="row-meta">Due ${when}</span>`;
    if (i.days < 0) return `<span class="days crit">Due ${when} · ${-i.days}d overdue</span>`;
    if (i.days === 0) return `<span class="days warn">Due today</span>`;
    return `<span class="days ${i.days <= 7 ? 'warn' : 'muted'}">Due ${when} · ${i.days}d</span>`;
  }
  const teamNames = () => uniq(usersList().map((u) => u.Name).concat(state.data.tracker.flatMap((r) => splitPeople(r['Program Owner'])), state.data.tasks.map((t) => t.Owner))).sort();

  function taskForm(t, isNew, topicPicker) {
    const v = (k) => esc(t[k] || '');
    const sel = (k, list) => `<select class="select" data-tf="${k}">${list.map((o) => `<option ${o === (t[k] || list[0]) ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    const topics = state.data.tracker.slice().sort((a, b) => itemTitle('tracker', a).localeCompare(itemTitle('tracker', b)));
    return `<div class="task-form" data-form="${esc(t._id)}">
      <div class="form-grid">
        ${topicPicker ? `<label class="field wide">Program / Topic<select class="select" data-tf="Topic ID"><option value="">Choose a topic…</option>${topics.map((r) => `<option value="${esc(r._id)}" ${r._id === t['Topic ID'] ? 'selected' : ''}>${esc(itemTitle('tracker', r))}${r['Implementation Date'] ? ' · ' + esc(fmtDate(r['Implementation Date'], { day: 'numeric', month: 'short' })) : ''}</option>`).join('')}</select></label>` : ''}
        <label class="field wide">Task<input class="input" data-tf="Task" value="${v('Task')}" placeholder="e.g. Book training room for 25 pax" maxlength="200"></label>
        <label class="field">Category${sel('Category', TASK_CATS)}</label>
        <label class="field">Status${sel('Status', TASK_STATUS)}</label>
        <label class="field">Owner<input class="input" data-tf="Owner" value="${v('Owner')}" list="teamList" autocomplete="off" placeholder="Who is doing it"></label>
        <label class="field">Due Date<input class="input" type="date" data-tf="Due Date" value="${v('Due Date')}"></label>
        <label class="field wide">Details / Requirements<textarea class="input" data-tf="Details / Requirements" placeholder="Specifics the team needs, e.g. room capacity, Teams link, printing count, approver, file location, dietary needs">${v('Details / Requirements')}</textarea></label>
      </div>
      <datalist id="teamList">${teamNames().map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      <div class="task-form-foot">
        ${isNew ? '' : `<span class="row-meta">${t['Created By'] ? `Added by ${esc(t['Created By'])} · ${esc(fmtWhen(t['Created At']))}` : ''}${t._updatedBy ? ` · last change ${esc(t._updatedBy)}, ${esc(fmtWhen(t._updatedAt))}` : ''}</span>`}
        <span style="flex:1"></span>
        ${isNew ? '' : `<button class="btn sm ghost danger" type="button" data-tdel="${esc(t._id)}">Delete</button>`}
        <button class="btn sm" type="button" data-tcancel>Cancel</button>
        <button class="btn sm primary" type="button" data-tsave="${esc(t._id)}">${isNew ? 'Add task' : 'Save'}</button>
      </div></div>`;
  }
  function readTaskForm(form, base) {
    const out = Object.assign({}, base);
    $$('[data-tf]', form).forEach((i) => { out[i.dataset.tf] = i.value.trim(); });
    const p = parentOf(out);
    if (p) { out['Program Name'] = p['Program Name'] || ''; out.Topic = p.Topic || ''; }
    if (!out['Created By']) { out['Created By'] = settings.name || 'Team member'; out['Created At'] = new Date().toISOString(); }
    return out;
  }
  function taskItem(t, selected) {
    const i = taskInfo(t);
    return `<div class="task ${i.done ? 'is-done' : ''} ${i.overdue ? 'is-late' : ''} ${selected ? 'is-sel' : ''}">
      <input type="checkbox" class="t-check" data-tsel="${esc(t._id)}" ${selected ? 'checked' : ''} aria-label="Select ${esc(t.Task)}">
      ${inlineSelect(t, 'Status', 'tasks')}
      <div class="t-main" data-tedit="${esc(t._id)}" role="button" tabindex="0">
        <div class="t-name">${esc(t.Task || '(untitled task)')}</div>
        <div class="t-meta"><span class="cat">${esc(t.Category || 'Other')}</span>${t.Owner ? `<span>${esc(t.Owner)}</span>` : '<span class="row-meta">No owner</span>'}${taskDue(t)}${timeChip(t)}</div>
        ${t['Details / Requirements'] ? `<div class="t-details">${esc(t['Details / Requirements'])}</div>` : ''}
      </div>
      <button class="icon-btn" type="button" data-tedit="${esc(t._id)}" aria-label="Edit task">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
    </div>`;
  }

  // The task checklist inside a topic. Every change saves on its own.
  function renderTaskPanel(box, parent, editId, adding, selection) {
    const sel = selection || new Set();
    const tasks = tasksFor(parent._id);
    for (const id of Array.from(sel)) if (!tasks.some((t) => t._id === id)) sel.delete(id);
    const p = taskProgress(parent._id);
    const seg = (n, cls) => (n > 0 ? `<i class="${cls}" style="flex:${n}"></i>` : '');
    box.innerHTML = `
      <div class="task-head">
        <div class="task-prog">
          <div class="segbar">${seg(p.done, 'done')}${seg(p.overdue, 'over')}${seg(p.total - p.done - p.overdue, 'up')}</div>
          <span>${p.total ? `<b>${p.done} of ${p.total}</b> done` : 'No tasks yet'}${p.overdue ? ` · <b class="days crit">${p.overdue} overdue</b>` : ''}</span>
        </div>
        <div class="task-actions">
          <button class="btn sm" type="button" data-tstd title="Pick from the L&D Activity Checklist">Add from checklist</button>
          <button class="btn sm primary" type="button" data-tadd>+ Add task</button>
        </div>
      </div>
      ${assignBarHtml(sel)}
      ${adding ? taskForm({ _id: uid(), 'Topic ID': parent._id, Status: 'Not Started', Category: 'Logistics' }, true) : ''}
      <div class="task-list">${tasks.map((t) => (t._id === editId ? taskForm(t, false) : taskItem(t, sel.has(t._id)))).join('') ||
        (adding ? '' : emptyBox('No tasks yet', ' Click Add from checklist to pick this topic\'s activities, or add tasks one by one.'))}</div>`;
    const redraw = (eid, add) => { renderTaskPanel(box, parent, eid, add, sel); const c = $('#edTaskCount'); if (c) c.textContent = taskCountLabel(parent._id); };
    box.onclick = async (e) => {
      const b = e.target.closest('[data-tadd],[data-tedit],[data-tcancel],[data-tsave],[data-tdel],[data-tstd],[data-ttime],[data-assign],[data-selclear]');
      if (!b) return;
      if (b.hasAttribute('data-ttime')) return openTimeLog(b.dataset.ttime, () => redraw());
      if (b.hasAttribute('data-selclear')) { sel.clear(); return redraw(); }
      if (b.hasAttribute('data-assign')) { await assignTasks(sel, $('[data-assignto]', box).value); sel.clear(); return redraw(); }
      if (b.hasAttribute('data-tadd')) return redraw(null, true);
      if (b.hasAttribute('data-tedit')) return redraw(b.dataset.tedit, false);
      if (b.hasAttribute('data-tcancel')) return redraw();
      if (b.hasAttribute('data-tsave')) {
        const form = b.closest('[data-form]');
        const base = state.data.tasks.find((t) => t._id === b.dataset.tsave) || { _id: b.dataset.tsave, 'Topic ID': parent._id };
        const row = readTaskForm(form, base);
        if (!row.Task) { $('[data-tf="Task"]', form).focus(); return toast('Give the task a name', true); }
        await commit('tasks', 'upsert', { row });
        return redraw();
      }
      if (b.hasAttribute('data-tdel')) {
        const t = state.data.tasks.find((x) => x._id === b.dataset.tdel);
        if (!t || !(await confirmDelete({ title: 'Delete this task?', lines: [`"${t.Task}" will be removed from ${itemTitle('tracker', parent)} for the whole team.`] }))) return;
        await commit('tasks', 'delete', { id: t._id });
        toast('Task deleted. You can restore it from the Activity Log.');
        return redraw();
      }
      if (b.hasAttribute('data-tstd')) {
        if (await openChecklistPicker(parent)) redraw();
      }
    };
    box.onkeydown = (e) => { if (e.key === 'Enter' && e.target.matches('.t-main')) e.target.click(); };
    box.onchange = async (e) => {
      if (e.target.matches('[data-tsel]')) { if (e.target.checked) sel.add(e.target.dataset.tsel); else sel.delete(e.target.dataset.tsel); return redraw(); }
      const st = e.target.closest('select[data-inline]');
      if (!st) return;
      const t = state.data.tasks.find((x) => x._id === st.dataset.id);
      if (!t) return;
      await commit('tasks', 'upsert', { row: Object.assign({}, t, { Status: st.value }) });
      redraw();
    };
  }

  // Which checklist column a program uses: "ELGP (Emerging Leaders Growth Point)" uses "ELGP".
  function checklistColumn(programName) {
    const n = norm(programName);
    const i = CHECKLIST_PROGRAMS.findIndex((c) => n === norm(c) || n.startsWith(norm(c) + ' ') || n.startsWith(norm(c) + '('));
    return i;
  }
  function checklistTiming(days) {
    if (days == null) return 'No set date';
    if (days === 0) return 'On the session day';
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days < 0 ? 'before' : 'after'}`;
  }
  // Pick activities from the L&D Activity Checklist. The ones marked Yes for the topic's program start ticked;
  // programs not in the checklist start with the activities every listed program does.
  function openChecklistPicker(parent) {
    return new Promise((resolve) => {
      const root = $('#confirmRoot');
      const col = checklistColumn(parent['Program Name']);
      const have = new Set(tasksFor(parent._id).map((t) => norm(t.Task)));
      const items = ACTIVITY_CHECKLIST.map(([name, cat, days, ...apply], i) => ({ i, name, cat, days, apply: col >= 0 ? apply[col] : null, all: apply.every((a) => a === 'Yes') }));
      const preTick = (it) => (col >= 0 ? it.apply === 'Yes' : it.all);
      const cats = uniq(items.map((it) => it.cat));
      root.innerHTML = `<div class="modal-back top"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="pkTitle">
        <div class="modal-head"><div><h2 id="pkTitle">Add from Checklist</h2><div class="note">${esc(itemTitle('tracker', parent))} · ${col >= 0 ? `activities marked Yes for <b>${esc(CHECKLIST_PROGRAMS[col])}</b> are ticked` : 'this program isn\'t in the checklist, so the activities every program does are ticked'}</div></div>
          <button class="icon-btn" type="button" data-pk="cancel" aria-label="Close">✕</button></div>
        <div class="modal-body picker">
          <div class="toolbar" style="margin-bottom:8px"><button class="btn sm" type="button" data-pk="default">Tick the defaults</button><button class="btn sm" type="button" data-pk="all">Tick all</button><button class="btn sm" type="button" data-pk="none">Clear</button></div>
          ${cats.map((cat) => `<div class="pk-group"><div class="form-group-title">${esc(cat)}</div>
            ${items.filter((it) => it.cat === cat).map((it) => {
              const already = have.has(norm(it.name));
              return `<label class="pk-item ${already ? 'is-have' : ''}"><input type="checkbox" value="${it.i}" data-def="${preTick(it) ? 1 : 0}" ${already ? 'disabled' : preTick(it) ? 'checked' : ''}>
                <span class="pk-name">${esc(it.name)}</span><span class="row-meta">${esc(checklistTiming(it.days))}</span>
                ${already ? '<span class="pill good">Already added</span>' : it.apply ? `<span class="pill ${it.apply === 'Yes' ? 'prog' : 'plain'}">${esc(it.apply)}</span>` : '<span></span>'}</label>`;
            }).join('')}</div>`).join('')}
        </div>
        <div class="modal-foot"><span class="left" id="pkCount"></span><button class="btn" type="button" data-pk="cancel">Cancel</button><button class="btn primary" type="button" data-pk="add">Add tasks</button></div></div></div>`;
      const boxes = () => $$('input[type=checkbox]:not(:disabled)', root);
      const count = () => { const n = boxes().filter((b) => b.checked).length; $('#pkCount', root).textContent = `${n} selected`; $('[data-pk="add"]', root).textContent = n ? `Add ${n} task${n === 1 ? '' : 's'}` : 'Add tasks'; };
      const finish = (v) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(0); } };
      document.addEventListener('keydown', onKey, true);
      root.addEventListener('change', count);
      root.firstElementChild.addEventListener('mousedown', (e) => { if (e.target === root.firstElementChild) finish(0); });
      $$('[data-pk]', root).forEach((b) => b.addEventListener('click', async () => {
        const k = b.dataset.pk;
        if (k === 'cancel') return finish(0);
        if (k === 'all') boxes().forEach((x) => { x.checked = true; });
        if (k === 'none') boxes().forEach((x) => { x.checked = false; });
        if (k === 'default') boxes().forEach((x) => { x.checked = x.dataset.def === '1'; });
        if (k === 'add') {
          const picked = boxes().filter((x) => x.checked).map((x) => items[+x.value]);
          if (!picked.length) return toast('Tick at least one activity', true);
          const base = parseISO(parent['Implementation Date']);
          const now = new Date().toISOString();
          const rows = picked.map((it) => ({
            _id: uid(), 'Topic ID': parent._id, 'Program Name': parent['Program Name'] || '', Topic: parent.Topic || '', Task: it.name, Category: it.cat, Status: 'Not Started',
            'Due Date': base && it.days != null ? isoLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + it.days)) : '', Owner: '', 'Details / Requirements': '',
            'Created By': settings.name || 'Team member', 'Created At': now
          }));
          await commit('tasks', 'upsertMany', { rows }, { action: 'Added', item: itemTitle('tracker', parent), itemId: parent._id, details: `From the activity checklist: ${rows.length} task${rows.length === 1 ? '' : 's'} added` });
          toast(`${rows.length} task${rows.length === 1 ? '' : 's'} added${base ? ', with due dates counted from the session date' : ''}`);
          return finish(rows.length);
        }
        count();
      }));
      count();
    });
  }

  // Stand-alone task form, used from the Tasks page.
  function openTaskModal(id, presetTopic) {
    const existing = id ? state.data.tasks.find((t) => t._id === id) : null;
    const t = existing ? Object.assign({}, existing) : { _id: uid(), 'Topic ID': presetTopic || '', Status: 'Not Started', Category: 'Logistics' };
    const m = openModal(`
      <div class="modal-head"><div><h2>${existing ? 'Edit Task' : 'Add Task'}</h2>${existing && parentOf(existing) ? `<div class="note">${esc(itemTitle('tracker', parentOf(existing)))}</div>` : ''}</div>
        <button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
      <div class="modal-body" id="tmBody">${taskForm(t, !existing, true)}</div>`);
    const body = $('#tmBody', m);
    const parent = parentOf(t);
    if (parent) {
      const foot = $('.task-form-foot', body);
      foot.insertAdjacentHTML('afterbegin', `<button class="btn sm ghost" type="button" data-openparent>Open topic</button>`);
    }
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-tcancel],[data-tsave],[data-tdel],[data-openparent]');
      if (!b) return;
      if (b.hasAttribute('data-tcancel')) return closeModal();
      if (b.hasAttribute('data-openparent')) { closeModal(); return openEditor('tracker', parent._id, { tab: 'tasks' }); }
      if (b.hasAttribute('data-tsave')) {
        const row = readTaskForm($('[data-form]', body), t);
        if (!row['Topic ID']) return toast('Choose the program / topic this task belongs to', true);
        if (!row.Task) return toast('Give the task a name', true);
        closeModal();
        await commit('tasks', 'upsert', { row });
        return toast(existing ? 'Task saved' : 'Task added');
      }
      if (b.hasAttribute('data-tdel')) {
        if (!(await confirmDelete({ title: 'Delete this task?', lines: [`"${t.Task}" will be removed for the whole team.`] }))) return;
        closeModal();
        await commit('tasks', 'delete', { id: t._id });
        toast('Task deleted. You can restore it from the Activity Log.');
      }
    });
  }

  // ---------------------------------------------------------------- Time log & utilization
  // Each entry: who worked on a task, from which date to which date, and roughly how many hours per day.
  // Totals count working days (Mon–Fri) unless the entry includes weekends.
  const HOURS_PER_DAY = 8; // capacity used for utilization
  const fmtH = (h) => (h == null ? '–' : (Math.round(h * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' h');
  function entryDates(startIso, endIso, weekends) {
    const a = parseISO(startIso), b = parseISO(endIso || startIso);
    if (!a || !b || b < a) return [];
    const out = [];
    for (const d = new Date(a); d <= b && out.length < 400; d.setDate(d.getDate() + 1)) {
      const w = d.getDay();
      if (weekends || (w !== 0 && w !== 6)) out.push(isoLocal(d));
    }
    return out;
  }
  const timeFor = (taskId) => state.data.timelog.filter((e) => e['Task ID'] === taskId)
    .sort((a, b) => String(b['Start Date']).localeCompare(String(a['Start Date'])));
  const entryHours = (e) => num(e['Total Hours']) || 0;
  const taskHours = (taskId) => timeFor(taskId).reduce((s, e) => s + entryHours(e), 0);
  const timeChip = (t) => { const h = taskHours(t._id); return `<button type="button" class="time-chip ${h ? 'has' : ''}" data-ttime="${esc(t._id)}" title="Log or view time spent">
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${h ? fmtH(h) : 'Log time'}</button>`; };

  // Log-time window for one task (stacks above the topic editor).
  function openTimeLog(taskId, onChange) {
    const t = state.data.tasks.find((x) => x._id === taskId);
    if (!t) return;
    const root = $('#confirmRoot');
    const entries = timeFor(taskId);
    const me = currentUser() ? currentUser().Name : settings.name;
    const names = uniq(usersList().map((u) => u.Name).concat(entries.map((e) => e.Person), [me]));
    const today = isoLocal(todayDate());
    const total = entries.reduce((s, e) => s + entryHours(e), 0);
    root.innerHTML = `<div class="modal-back top"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="tlTitle">
      <div class="modal-head"><div><h2 id="tlTitle">Time Spent</h2><div class="note">${esc(t.Task)} · ${esc(itemTitle('tracker', parentOf(t) || t))}</div></div>
        <button class="icon-btn" type="button" data-tl="close" aria-label="Close">✕</button></div>
      <div class="modal-body">
        <div class="callout info" style="margin-bottom:12px">Log each stretch of work: <b>from</b> and <b>to</b> dates and the <b>hours per day</b>. Work spread over several days, a few hours a day, is one entry. Totals count working days (Mon–Fri) unless you tick "Include weekends".</div>
        <div class="form-grid tl-form">
          <label class="field">Who worked on it<select class="select" id="tlPerson">${names.map((n) => `<option ${n === (t.Owner && names.includes(t.Owner) ? t.Owner : me) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
          <label class="field">Hours per day<input class="input" id="tlHours" type="number" min="0.25" max="24" step="0.25" value="1"></label>
          <label class="field">From<input class="input" id="tlFrom" type="date" value="${today}"></label>
          <label class="field">To<input class="input" id="tlTo" type="date" value="${today}"></label>
          <label class="field wide">Notes (optional)<input class="input" id="tlNotes" maxlength="200" placeholder="e.g. drafting slides, venue calls"></label>
          <label class="check wide"><input type="checkbox" id="tlWeekends"> Include weekends</label>
        </div>
        <div class="tl-sum" id="tlSum"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn primary" type="button" data-tl="add">Add time</button></div>
        <div class="form-group-title">Logged so far · ${fmtH(total)}</div>
        ${entries.length ? `<div class="table-wrap" style="max-height:240px;margin-top:8px"><table class="data"><thead><tr><th>Person</th><th>Dates</th><th>Per Day</th><th>Days</th><th>Total</th><th>Notes</th><th></th></tr></thead><tbody>
          ${entries.map((e) => `<tr style="cursor:default"><td class="nowrap">${esc(e.Person)}</td>
            <td class="nowrap">${esc(fmtDate(e['Start Date'], { day: 'numeric', month: 'short' }))}${e['End Date'] && e['End Date'] !== e['Start Date'] ? ' – ' + esc(fmtDate(e['End Date'], { day: 'numeric', month: 'short' })) : ''}</td>
            <td class="nowrap">${fmtH(num(e['Hours per Day']))}</td><td>${esc(e['Working Days'])}${e['Include Weekends'] === 'Yes' ? ' <span class="row-meta">incl. weekends</span>' : ''}</td>
            <td class="nowrap"><b>${fmtH(entryHours(e))}</b></td><td>${esc(e.Notes || '')}</td>
            <td><button class="btn sm ghost danger" type="button" data-tl="del" data-id="${esc(e._id)}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="note">No time logged yet.</p>'}
      </div>
      <div class="modal-foot"><button class="btn" type="button" data-tl="close">Done</button></div></div></div>`;
    const finish = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); if (onChange) onChange(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(); } };
    document.addEventListener('keydown', onKey, true);
    const calc = () => {
      const from = $('#tlFrom', root).value, to = $('#tlTo', root).value || from;
      const hours = num($('#tlHours', root).value);
      const days = entryDates(from, to, $('#tlWeekends', root).checked);
      const box = $('#tlSum', root);
      if (!from || (to && parseISO(to) < parseISO(from))) { box.innerHTML = '<span class="days crit">The "To" date must be on or after "From".</span>'; return null; }
      if (!days.length) { box.innerHTML = '<span class="days crit">No working days in this range. Tick "Include weekends" if you worked on a weekend.</span>'; return null; }
      if (!hours || hours <= 0 || hours > 24) { box.innerHTML = '<span class="days crit">Enter hours per day between 0.25 and 24.</span>'; return null; }
      box.innerHTML = `<b>${days.length}</b> day${days.length === 1 ? '' : 's'} × <b>${fmtH(hours)}</b> per day = <b>${fmtH(days.length * hours)}</b> total`;
      return { from, to, hours, days };
    };
    $$('#tlFrom,#tlTo,#tlHours,#tlWeekends', root).forEach((i) => i.addEventListener('input', calc));
    $('#tlWeekends', root).addEventListener('change', calc);
    calc();
    root.firstElementChild.addEventListener('mousedown', (e) => { if (e.target === root.firstElementChild) finish(); });
    $$('[data-tl]', root).forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.tl;
      if (k === 'close') return finish();
      if (k === 'add') {
        const c = calc();
        if (!c) return;
        const p = parentOf(t) || t;
        const person = $('#tlPerson', root).value;
        const row = {
          _id: uid(), 'Task ID': t._id, 'Topic ID': t['Topic ID'], 'Program Name': p['Program Name'] || '', Topic: p.Topic || '', Task: t.Task,
          Person: person, 'Start Date': c.from, 'End Date': c.to, 'Hours per Day': String(c.hours), 'Include Weekends': $('#tlWeekends', root).checked ? 'Yes' : 'No',
          'Working Days': String(c.days.length), 'Total Hours': String(Math.round(c.days.length * c.hours * 100) / 100), Notes: $('#tlNotes', root).value.trim(),
          'Logged By': settings.name || 'Team member', 'Logged At': new Date().toISOString()
        };
        await commit('timelog', 'upsert', { row }, { action: 'Added', item: t.Task, itemId: t._id, details: `${person}: ${fmtH(c.hours)}/day × ${c.days.length} days = ${fmtH(c.days.length * c.hours)} (${c.from} to ${c.to})` });
        toast(`${fmtH(c.days.length * c.hours)} logged for ${person}`);
        return openTimeLog(taskId, onChange);
      }
      if (k === 'del') {
        const e = state.data.timelog.find((x) => x._id === b.dataset.id);
        root.innerHTML = '';
        document.removeEventListener('keydown', onKey, true);
        if (e && (await confirmDelete({ title: 'Delete this time entry?', lines: [`${e.Person}: ${fmtH(entryHours(e))} on "${t.Task}" (${e['Start Date']} to ${e['End Date']}).`] }))) {
          await commit('timelog', 'delete', { id: e._id });
          toast('Time entry deleted');
        }
        return openTimeLog(taskId, onChange);
      }
    }));
  }

  // Assign several tasks to one person at once.
  async function assignTasks(ids, person) {
    const rows = state.data.tasks.filter((t) => ids.has(t._id) && t.Owner !== person).map((t) => Object.assign({}, t, { Owner: person }));
    if (!rows.length) return toast(`Already assigned to ${person}`);
    await commit('tasks', 'upsertMany', { rows }, { action: 'Updated', item: `${rows.length} task${rows.length === 1 ? '' : 's'}`, details: `Assigned to ${person}: ${rows.map((r) => short(r.Task, 40)).join('; ')}` });
    toast(`${rows.length} task${rows.length === 1 ? '' : 's'} assigned to ${person}`);
  }
  function assignBarHtml(sel) {
    if (!sel.size) return '';
    return `<div class="bulk-bar on"><b>${sel.size} selected</b><span class="spacer"></span>
      <label class="check">Assign to <select class="select" data-assignto style="min-height:32px;padding:4px 8px;width:auto">${teamNames().map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
      <button class="btn sm primary" type="button" data-assign>Assign</button><button class="btn sm ghost" type="button" data-selclear>Clear</button></div>`;
  }

  // Utilization: hours logged per person per day against an 8-hour working day.
  function utilPeriod(f) {
    const t = todayDate();
    const y = +f.year || t.getFullYear();
    if (f.month) { const m = MONTHS.indexOf(f.month); return { kind: 'month', start: new Date(y, m, 1), end: new Date(y, m + 1, 0), label: new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }; }
    if (f.year && y !== t.getFullYear()) return { kind: 'year', start: new Date(y, 0, 1), end: new Date(y, 11, 31), label: String(y) };
    return { kind: 'month', start: new Date(t.getFullYear(), t.getMonth(), 1), end: new Date(t.getFullYear(), t.getMonth() + 1, 0), label: t.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' (this month)' };
  }
  function drawUtilization(sc) {
    const box = $('#util');
    if (!box) return;
    const p = utilPeriod(sc.f);
    const today = isoLocal(todayDate());
    const startIso = isoLocal(p.start), endIso = isoLocal(p.end);
    const capEnd = p.end < todayDate() ? endIso : today;
    const capDays = p.start > todayDate() ? 0 : entryDates(startIso, capEnd, false).length;
    $('#utSub').textContent = `${p.label} · capacity ${HOURS_PER_DAY} h per working day`;
    // Spread each entry's hours over its days, keeping only days inside the period.
    const byPerson = {};
    const entries = state.data.timelog.filter((e) => !sc.f.program || e['Program Name'] === sc.f.program);
    for (const e of entries) {
      const per = num(e['Hours per Day']) || 0;
      for (const d of entryDates(e['Start Date'], e['End Date'], e['Include Weekends'] === 'Yes')) {
        if (d < startIso || d > endIso) continue;
        const who = e.Person || '(unknown)';
        byPerson[who] = byPerson[who] || {};
        byPerson[who][d] = (byPerson[who][d] || 0) + per;
      }
    }
    const people = uniq(usersList().map((u) => u.Name).concat(Object.keys(byPerson)));
    const rows = people.map((name) => {
      const days = byPerson[name] || {};
      const hours = Object.values(days).reduce((a, b) => a + b, 0);
      const cap = capDays * HOURS_PER_DAY;
      return { name, hours, today: days[today] || 0, daysLogged: Object.keys(days).length, util: cap ? (hours / cap) * 100 : null, avg: Object.keys(days).length ? hours / Object.keys(days).length : null };
    }).sort((a, b) => b.hours - a.hours);
    const anyTime = rows.some((r) => r.hours);
    box.innerHTML = `<div class="grid" style="grid-template-columns:1fr">
      <div><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>Person</th><th>Today</th><th>Hours Logged</th><th>Days Logged</th><th>Avg per Day</th><th>Utilization</th></tr></thead><tbody>
        ${rows.map((r) => `<tr style="cursor:default"><td class="nowrap"><b>${esc(r.name)}</b></td><td>${r.today ? fmtH(r.today) : '<span class="row-meta">—</span>'}</td>
          <td><b>${fmtH(r.hours)}</b></td><td>${r.daysLogged}</td><td>${r.avg == null ? '—' : fmtH(r.avg)}</td>
          <td class="nowrap">${r.util == null ? '—' : `<span class="databar"><i style="width:${Math.min(100, Math.round(r.util))}%;background:${r.util > 100 ? 'var(--crit)' : r.util >= 70 ? 'var(--good)' : 'var(--warn)'}"></i></span>${Math.round(r.util)}%`}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="note">Utilization = hours logged ÷ (${capDays} working day${capDays === 1 ? '' : 's'} so far × ${HOURS_PER_DAY} h). Log time from the clock button on any task.</p></div>
      <div class="chart-box" id="utChartBox" style="height:240px"><canvas id="chUtil" aria-label="Hours logged by person"></canvas></div></div>`;
    if (!anyTime) { $('#utChartBox').innerHTML = emptyBox('No time logged in this period', ' Use the clock button on a task to log hours.'); $('#utChartBox').style.height = 'auto'; return; }
    let labels, keyOf;
    if (p.kind === 'month') {
      const n = p.end.getDate();
      labels = Array.from({ length: n }, (_, i) => String(i + 1));
      keyOf = (i) => isoLocal(new Date(p.start.getFullYear(), p.start.getMonth(), i + 1));
    } else {
      labels = MONTHS.map((m) => m.slice(0, 3));
      keyOf = null;
    }
    const withTime = rows.filter((r) => r.hours).slice(0, 5);
    barChart($('#chUtil'), {
      labels, stacked: true,
      datasets: withTime.map((r, i) => ({
        label: r.name, color: C.series[i % C.series.length],
        data: labels.map((_, idx) => {
          const days = byPerson[r.name] || {};
          if (keyOf) return Math.round((days[keyOf(idx)] || 0) * 100) / 100;
          return Math.round(Object.entries(days).filter(([d]) => +d.slice(5, 7) === idx + 1).reduce((s, [, h]) => s + h, 0) * 100) / 100;
        })
      })),
      valueFmt: (v) => fmtH(v)
    });
  }

  // Bulk update: set one field on every participant row the current filters show.
  function openBulkUpdate(ds) {
    const rows = state.currentRows && state.currentRows.ds === ds ? state.currentRows.rows : state.data[ds];
    if (!rows.length) return toast('No rows match the current filters', true);
    const f = state.filters[ds];
    const cols = columnsFor(ds, state.data[ds]);
    const scope = [f.program, f.mod, f.q ? `search "${f.q}"` : ''].filter(Boolean).join(' · ') || 'all rows';
    const m = openModal(`
      <div class="modal-head"><div><h2>Bulk Update</h2><div class="note">${rows.length} ${esc(DS[ds].label.toLowerCase())} rows shown (${esc(scope)})</div></div><button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
      <div class="modal-body"><div class="form-grid" style="grid-template-columns:1fr">
        <p class="note" style="margin:0">Use the Program and Module filters and the search box to choose the rows first, e.g. one program's batch. Then set the value once for all of them.</p>
        <label class="field">Field to update<select class="select" id="buCol">${cols.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label class="field">New value<span id="buValWrap"></span></label>
        <div class="field">How
          <label class="check"><input type="radio" name="buMode" value="blank" checked> Only fill blank cells (keeps values already entered)</label>
          <label class="check"><input type="radio" name="buMode" value="all"> Replace the value in every row shown</label></div>
        <div class="tl-sum" id="buSum"></div>
      </div></div>
      <div class="modal-foot"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="buGo" type="button">Update</button></div>`, { size: 'sm' });
    const valInput = () => {
      const c = $('#buCol', m).value;
      const known = uniq(state.data[ds].map((r) => r[c]).filter((v) => v && String(v).length < 60)).slice(0, 60);
      $('#buValWrap', m).innerHTML = DS[ds].dates.includes(c) ? '<input class="input" id="buVal" type="date">'
        : `<input class="input" id="buVal" list="buList" autocomplete="off"><datalist id="buList">${known.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
      $('#buVal', m).addEventListener('input', sum);
    };
    const targets = () => {
      const c = $('#buCol', m).value, mode = $('input[name=buMode]:checked', m).value, v = ($('#buVal', m).value || '').trim();
      return { c, v, mode, hit: rows.filter((r) => (mode === 'all' ? String(r[c] || '') !== v : !String(r[c] || '').trim())) };
    };
    const sum = () => { const t = targets(); $('#buSum', m).innerHTML = t.v ? `Will set <b>${esc(t.c)}</b> to <b>${esc(t.v)}</b> on <b>${t.hit.length}</b> of ${rows.length} rows.` : 'Enter the new value.'; $('#buGo', m).textContent = t.v && t.hit.length ? `Update ${t.hit.length} row${t.hit.length === 1 ? '' : 's'}` : 'Update'; };
    $('#buCol', m).addEventListener('change', () => { valInput(); sum(); });
    $$('input[name=buMode]', m).forEach((r) => r.addEventListener('change', sum));
    valInput(); sum();
    $('#buGo', m).addEventListener('click', async () => {
      const t = targets();
      if (!t.v) return $('#buVal', m).focus();
      if (!t.hit.length) return toast('Nothing to change: those rows already have a value', true);
      closeModal();
      await commit(ds, 'upsertMany', { rows: t.hit.map((r) => Object.assign({}, r, { [t.c]: t.v })) },
        { action: 'Updated', item: DS[ds].label, details: `Bulk update: ${t.c} set to "${short(t.v, 40)}" on ${t.hit.length} rows (${t.mode === 'all' ? 'replaced' : 'blank cells only'}; ${scope})` });
      toast(`${t.hit.length} rows updated`);
    });
  }

  // ---------------------------------------------------------------- Tasks page
  function renderTasks(el) {
    const f = state.filters.tasks;
    const all = state.data.tasks;
    const opts = (vals, sel, label) => `<option value="">${label}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const open = all.filter((t) => !taskInfo(t).done);
    const late = open.filter((t) => taskInfo(t).overdue).length;
    const soon = open.filter((t) => taskInfo(t).soon).length;
    const blocked = open.filter((t) => taskInfo(t).blocked).length;
    const countable = all.filter((t) => norm(t.Status) !== 'n/a');
    const doneN = countable.filter((t) => norm(t.Status) === 'done').length;
    el.innerHTML = `
      <div class="grid kpis">
        ${kpiCard('Open tasks', open.length, `${all.length} in total`, 'var(--navy-800)')}
        ${kpiCard('Overdue', late, 'due date passed, not done', 'var(--crit)')}
        ${kpiCard('Due in 7 days', soon, 'coming up this week', 'var(--warn)')}
        ${kpiCard('Blocked', blocked, 'waiting on something', 'var(--crit)')}
        ${kpiCard('Done', countable.length ? Math.round((doneN / countable.length) * 100) + '%' : '–', `${doneN} of ${countable.length} tasks`, 'var(--good)')}
      </div>
      <div class="toolbar section">
        <input class="input search" id="tkSearch" type="search" placeholder="Search tasks, details, topics…" value="${esc(f.q || '')}" aria-label="Search tasks">
        <select class="select" id="tkProgram" aria-label="Program">${opts(uniq(all.map((t) => (parentOf(t) || t)['Program Name'])).sort(), f.program, 'All programs')}</select>
        <select class="select" id="tkStatus" aria-label="Status"><option value="">Any status</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>Open (not done)</option>${TASK_STATUS.map((s) => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select class="select" id="tkOwner" aria-label="Owner">${opts(uniq(all.map((t) => t.Owner)).sort(), f.owner, 'All owners')}</select>
        <select class="select" id="tkDue" aria-label="Due">${[['', 'Any due date'], ['overdue', 'Overdue'], ['soon', 'Due in 7 days'], ['none', 'No due date']].map(([v, l]) => `<option value="${v}" ${f.due === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="tkMine" ${f.mine ? 'checked' : ''}> Only mine</label>
        <span class="spacer"></span>
        <button class="btn accent" id="tkAdd" type="button" ${state.data.tracker.length ? '' : 'disabled title="Add a program first"'}>+ Add task</button>
      </div>
      <div id="tkBulk"></div>
      <div id="tkResults"></div>`;
    const bind = (id, key, ev) => $(id, el).addEventListener(ev || 'change', (e) => { f[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; drawTaskTable(); });
    $('#tkResults', el).addEventListener('change', (e) => {
      if (!e.target.matches('[data-ksel]')) return;
      if (e.target.checked) state.taskSel.add(e.target.value); else state.taskSel.delete(e.target.value);
      e.target.closest('tr').classList.toggle('is-sel', e.target.checked);
      drawTaskBulk();
    });
    $('#tkBulk', el).addEventListener('click', async (e) => {
      if (e.target.closest('[data-selclear]')) { state.taskSel.clear(); return drawTaskTable(); }
      if (e.target.closest('[data-assign]')) { const who = $('[data-assignto]', el).value; await assignTasks(state.taskSel, who); state.taskSel.clear(); }
    });
    bind('#tkSearch', 'q', 'input'); bind('#tkProgram', 'program'); bind('#tkStatus', 'status'); bind('#tkOwner', 'owner'); bind('#tkDue', 'due'); bind('#tkMine', 'mine');
    $('#tkAdd', el).addEventListener('click', () => openTaskModal(null));
    drawTaskTable();
    wireCommon(el);
  }
  function drawTaskTable() {
    const box = $('#tkResults');
    if (!box) return;
    const f = state.filters.tasks;
    const q = norm(f.q);
    const me = norm(settings.name);
    const rows = state.data.tasks.filter((t) => {
      const i = taskInfo(t), p = parentOf(t) || t;
      if (f.program && p['Program Name'] !== f.program) return false;
      if (f.status === 'open' ? i.done : f.status && t.Status !== f.status) return false;
      if (f.owner && t.Owner !== f.owner) return false;
      if (f.mine && !(me && splitPeople(t.Owner).some((o) => norm(o) === me))) return false;
      if (f.due === 'overdue' && !i.overdue) return false;
      if (f.due === 'soon' && !i.soon) return false;
      if (f.due === 'none' && t['Due Date']) return false;
      if (q && ![t.Task, t['Details / Requirements'], t.Owner, t.Category, p['Program Name'], p.Topic].some((v) => norm(v).includes(q))) return false;
      return true;
    });
    state.currentRows = { ds: 'tasks', rows };
    if (!state.data.tasks.length) {
      box.innerHTML = `<div class="card">${emptyBox('No tasks yet', ' Open a program in the Program Tracker and use its Tasks & logistics tab, or click + Add task.')}</div>`;
      return;
    }
    const topicOf = (t) => { const p = parentOf(t); return p ? itemTitle('tracker', p) : `${t['Program Name'] || ''} · ${t.Topic || ''} (topic removed)`; };
    for (const id of Array.from(state.taskSel)) if (!state.data.tasks.some((t) => t._id === id)) state.taskSel.delete(id);
    drawTaskBulk();
    drawTable(box, 'tasks', rows, [
      { k: '_sel', label: '✓', w: 'nowrap', fmt: (t) => `<input type="checkbox" class="t-check" data-ksel value="${esc(t._id)}" ${state.taskSel.has(t._id) ? 'checked' : ''} aria-label="Select ${esc(t.Task)}">`, sortVal: (t) => (state.taskSel.has(t._id) ? 0 : 1) },
      { k: 'Due Date', label: 'Due', w: 'nowrap', fmt: taskDue, sortVal: (t) => t['Due Date'] || '9999' },
      { k: 'Task', w: 'topic', fmt: (t) => `<b>${esc(t.Task)}</b>` },
      { k: '_topic', label: 'Program / Topic', w: 'topic', fmt: (t) => esc(topicOf(t)), sortVal: topicOf },
      { k: 'Category', w: 'nowrap' },
      { k: 'Owner', w: 'nowrap' },
      { k: 'Status', w: 'nowrap', fmt: (t) => inlineSelect(t, 'Status', 'tasks') },
      { k: '_hours', label: 'Time Spent', w: 'nowrap', fmt: timeChip, sortVal: (t) => taskHours(t._id) },
      { k: 'Details / Requirements', label: 'Details / Requirements', w: 'wrap' }
    ]);
  }
  function drawTaskBulk() { const b = $('#tkBulk'); if (b) b.innerHTML = assignBarHtml(state.taskSel); }

  // ---------------------------------------------------------------- Activity log page
  const ACTION_CLASS = { Deleted: 'crit', Cleared: 'crit', Restored: 'good', Added: 'prog', Updated: '', Imported: 'warn' };
  function snapshotOf(e) { try { const s = JSON.parse(e.Snapshot || ''); return s && Array.isArray(s.rows) ? s : null; } catch (err) { return null; } }
  function missingRows(snap) {
    const gone = (ds, rows) => (state.data[ds] ? rows.filter((r) => !state.data[ds].some((x) => x._id === r._id)) : []);
    return { main: gone(snap.ds, snap.rows), kids: Object.entries(snap.children || {}).map(([k, rows]) => [k, gone(k, rows || [])]) };
  }
  function renderActivity(el) {
    const f = state.filters.activity;
    const all = state.data.activity.slice().sort((a, b) => String(b.When).localeCompare(String(a.When)));
    const opts = (vals, sel, label) => `<option value="">${label}</option>` + vals.map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = all.filter((e) => new Date(e.When).getTime() >= weekAgo);
    el.innerHTML = `
      <div class="grid kpis">
        ${kpiCard('Changes this week', recent.length, `${uniq(recent.map((e) => e.Who)).length} people`, 'var(--navy-800)')}
        ${kpiCard('Deleted this week', recent.filter((e) => /Deleted|Cleared/.test(e.Action)).length, 'each one can be restored', 'var(--crit)')}
        ${kpiCard('Restored this week', recent.filter((e) => e.Action === 'Restored').length, '', 'var(--good)')}
        ${kpiCard('All entries', all.length, 'kept permanently', 'var(--teal-400)')}
      </div>
      <div class="toolbar section">
        <input class="input search" id="acSearch" type="search" placeholder="Search item or details…" value="${esc(f.q || '')}" aria-label="Search activity">
        <select class="select" id="acAction" aria-label="Action">${opts(uniq(all.map((e) => e.Action)).sort(), f.action, 'All actions')}</select>
        <select class="select" id="acArea" aria-label="Area">${opts(uniq(all.map((e) => e.Area)).sort(), f.area, 'All areas')}</select>
        <select class="select" id="acWho" aria-label="Person">${opts(uniq(all.map((e) => e.Who)).sort(), f.who, 'Everyone')}</select>
      </div>
      <div id="acResults"></div>
      <p class="note">The log can't be edited or deleted from the dashboard. Deleted items keep a copy here, so anyone on the team can restore them.</p>`;
    const bind = (id, key, ev) => $(id, el).addEventListener(ev || 'change', (e) => { f[key] = e.target.value; drawActivity(all); });
    bind('#acSearch', 'q', 'input'); bind('#acAction', 'action'); bind('#acArea', 'area'); bind('#acWho', 'who');
    drawActivity(all);
  }
  function drawActivity(all) {
    const box = $('#acResults');
    const f = state.filters.activity;
    const q = norm(f.q);
    const rows = all.filter((e) => (!f.action || e.Action === f.action) && (!f.area || e.Area === f.area) && (!f.who || e.Who === f.who) &&
      (!q || norm(e.Item).includes(q) || norm(e.Details).includes(q)));
    state.currentRows = { ds: 'activity', rows };
    if (!all.length) { box.innerHTML = `<div class="card">${emptyBox('No activity yet', ' Every add, edit, delete and restore will be listed here.')}</div>`; return; }
    const LIMIT = 500;
    box.innerHTML = `<div class="table-wrap"><table class="data activity"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>Item</th><th>Details</th><th></th></tr></thead><tbody>
      ${rows.slice(0, LIMIT).map((e) => {
        const snap = /Deleted|Cleared|Imported/.test(e.Action) ? snapshotOf(e) : null;
        let restore = '';
        if (snap) {
          const miss = missingRows(snap);
          const n = miss.main.length + miss.kids.reduce((s, [, r]) => s + r.length, 0);
          restore = n ? `<button class="btn sm" type="button" data-restore="${esc(e._id)}">Restore${snap.rows.length > 1 ? ` ${miss.main.length}` : ''}</button>` : '<span class="pill good">Restored</span>';
        }
        return `<tr class="${/Deleted|Cleared/.test(e.Action) ? 'is-del' : ''}" style="cursor:default">
          <td class="nowrap">${esc(fmtWhen(e.When))}</td><td class="nowrap">${esc(e.Who)}</td>
          <td class="nowrap"><span class="pill ${ACTION_CLASS[e.Action] || ''}">${esc(e.Action)}</span></td>
          <td class="nowrap">${esc(e.Area)}</td><td class="topic">${esc(e.Item)}</td><td class="wrap">${esc(e.Details)}</td><td class="nowrap">${restore}</td></tr>`;
      }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--ink-3);padding:28px">No entries match these filters.</td></tr>'}
      </tbody></table></div>
      <div class="table-foot"><span>${rows.length} entries${rows.length > LIMIT ? ` · showing the latest ${LIMIT}` : ''}</span><span>Newest first</span></div>`;
    $$('[data-restore]', box).forEach((b) => b.addEventListener('click', () => restoreEntry(state.data.activity.find((x) => x._id === b.dataset.restore))));
  }
  async function restoreEntry(e) {
    const snap = e && snapshotOf(e);
    if (!snap) return toast('This entry has no saved copy to restore', true);
    const miss = missingRows(snap);
    if (!miss.main.length && miss.kids.every(([, r]) => !r.length)) return toast('Already restored');
    const kidCount = miss.kids.reduce((s, [, r]) => s + r.length, 0);
    if (miss.main.length) {
      await commit(snap.ds, 'upsertMany', { rows: miss.main }, {
        action: 'Restored', item: e.Item, itemId: e['Item ID'],
        details: `${miss.main.length} row${miss.main.length === 1 ? '' : 's'}${kidCount ? ` and ${kidCount} task${kidCount === 1 ? '' : 's'}` : ''} restored, undoing the ${({ Deleted: 'delete', Cleared: 'clear', Imported: 'import' })[e.Action] || 'change'} by ${e.Who} on ${fmtWhen(e.When)}`
      });
    }
    for (const [k, rows] of miss.kids) if (rows.length) await commit(k, 'upsertMany', { rows }, miss.main.length ? false : { action: 'Restored', item: e.Item, itemId: e['Item ID'], details: `${rows.length} tasks restored` });
    toast('Restored');
  }

  // ---------------------------------------------------------------- Announcements
  function parseReplies(a) { try { const r = JSON.parse(a.Replies || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }

  function renderAnnouncements(el) {
    const f = state.filters.announcements;
    const all = state.data.announcements;
    const list = all.filter((a) => f.status === 'All' || (f.status === 'Addressed' ? a.Status === 'Addressed' : a.Status !== 'Addressed'))
      .sort((a, b) => annRank(b) - annRank(a) || String(b['Posted At']).localeCompare(String(a['Posted At'])));
    const counts = { Open: all.filter((a) => a.Status !== 'Addressed').length, Addressed: all.filter((a) => a.Status === 'Addressed').length, All: all.length };
    el.innerHTML = `<div class="ann-layout">
      <div>
        <div class="toolbar"><div class="seg" role="group" aria-label="Show">${['Open', 'Addressed', 'All'].map((s) => `<button type="button" data-st="${s}" class="${f.status === s ? 'on' : ''}">${s} (${counts[s]})</button>`).join('')}</div></div>
        <div id="annList">${list.map(annCard).join('') || `<div class="card">${emptyBox(f.status === 'Open' ? 'All clear' : 'Nothing here', f.status === 'Open' ? ' No open announcements. Post one on the right.' : ' No announcements in this list.')}</div>`}</div>
      </div>
      <div class="card composer"><div class="card-head"><h2>Post to the Team</h2></div>
        <form id="annForm">
          <label class="field">Title<input class="input" name="title" required maxlength="140" placeholder="e.g. Room change for CX360 M4"></label>
          <label class="field">Message<textarea class="input" name="msg" required placeholder="What does the team need to know or do?"></textarea></label>
          <div class="field" style="display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--ink-2)">Priority
            <div class="prio-pick">${['Info', 'Important', 'Urgent'].map((p, i) => `<label><input type="radio" name="prio" value="${p}" ${i === 0 ? 'checked' : ''}><span>${p}</span></label>`).join('')}</div></div>
          <label class="field">Needs action by (optional)<input class="input" type="date" name="due"></label>
          <label class="check"><input type="checkbox" name="pin"> Pin to the top of the Overview</label>
          <button class="btn primary" type="submit">Post announcement</button>
          <p class="note" style="margin:0">Posting as <b>${esc(settings.name || 'Team member')}</b>. Everyone with the dashboard link sees it.</p>
        </form></div></div>`;

    $$('[data-st]', el).forEach((b) => b.addEventListener('click', () => { f.status = b.dataset.st; render(); }));
    $('#annForm', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const row = {
        _id: uid(), Title: String(fd.get('title')).trim(), Message: String(fd.get('msg')).trim(), Priority: fd.get('prio') || 'Info',
        Pinned: fd.get('pin') ? 'Yes' : 'No', Status: 'Open', 'Due Date': fd.get('due') || '', 'Posted By': settings.name || 'Team member',
        'Posted At': new Date().toISOString(), 'Addressed By': '', 'Addressed At': '', Replies: '[]'
      };
      if (!row.Title || !row.Message) return;
      state.filters.announcements.status = 'Open';
      commit('announcements', 'upsert', { row });
      toast('Announcement posted');
    });
    $$('[data-ann]', el).forEach((b) => b.addEventListener('click', () => annAction(b.dataset.ann, b.dataset.id)));
    $$('form[data-reply]', el).forEach((form) => form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = form.elements.reply.value.trim();
      if (!text) return;
      const a = all.find((x) => x._id === form.dataset.reply);
      const replies = parseReplies(a).concat([{ by: settings.name || 'Team member', at: new Date().toISOString(), text }]);
      commit('announcements', 'upsert', { row: Object.assign({}, a, { Replies: JSON.stringify(replies) }) });
    }));
  }

  function annCard(a) {
    const replies = parseReplies(a);
    const done = a.Status === 'Addressed';
    const due = a['Due Date'] ? daysUntil(a['Due Date']) : null;
    return `<div class="card ann-card ${esc(a.Priority)} ${done ? 'addressed' : ''}">
      <div class="ann-head"><h3>${esc(a.Title)}</h3>
        ${a.Pinned === 'Yes' ? '<span class="pill copper plain">📌 Pinned</span>' : ''}
        <span class="pill ${a.Priority === 'Urgent' ? 'crit' : a.Priority === 'Important' ? 'warn' : 'prog'}">${esc(a.Priority || 'Info')}</span>
        ${done ? '<span class="pill good">Addressed</span>' : ''}</div>
      <div class="ann-msg">${esc(a.Message)}</div>
      <div class="ann-meta"><span>Posted by <b>${esc(a['Posted By'] || '—')}</b> · ${esc(fmtWhen(a['Posted At']))}</span>
        ${a['Due Date'] ? `<span class="${!done && due != null && due < 0 ? 'days crit' : ''}">Action by ${esc(fmtDate(a['Due Date']))}${!done && due != null && due < 0 ? ' (overdue)' : ''}</span>` : ''}
        ${done ? `<span>Addressed by <b>${esc(a['Addressed By'] || '—')}</b> · ${esc(fmtWhen(a['Addressed At']))}</span>` : ''}</div>
      <div class="ann-actions">
        <button class="btn sm ${done ? '' : 'primary'}" type="button" data-ann="toggle" data-id="${esc(a._id)}">${done ? 'Reopen' : '✓ Mark addressed'}</button>
        <button class="btn sm" type="button" data-ann="pin" data-id="${esc(a._id)}">${a.Pinned === 'Yes' ? 'Unpin' : 'Pin'}</button>
        <button class="btn sm" type="button" data-ann="edit" data-id="${esc(a._id)}">Edit</button>
        <button class="btn sm ghost danger" type="button" data-ann="delete" data-id="${esc(a._id)}">Delete</button></div>
      <div class="replies">${replies.map((r) => `<div class="reply"><div class="r-who">${esc(r.by)}<span>${esc(fmtWhen(r.at))}</span></div>${esc(r.text)}</div>`).join('')}
        <form class="reply-form" data-reply="${esc(a._id)}"><input class="input" name="reply" placeholder="Reply or add an update…" aria-label="Reply"><button class="btn sm" type="submit">Reply</button></form></div>
    </div>`;
  }

  async function annAction(act, id) {
    const a = state.data.announcements.find((x) => x._id === id);
    if (!a) return;
    if (act === 'toggle') {
      const done = a.Status === 'Addressed';
      commit('announcements', 'upsert', { row: Object.assign({}, a, done ? { Status: 'Open', 'Addressed By': '', 'Addressed At': '' } : { Status: 'Addressed', 'Addressed By': settings.name || 'Team member', 'Addressed At': new Date().toISOString() }) });
      toast(done ? 'Reopened' : 'Marked as addressed');
    } else if (act === 'pin') {
      commit('announcements', 'upsert', { row: Object.assign({}, a, { Pinned: a.Pinned === 'Yes' ? 'No' : 'Yes' }) });
    } else if (act === 'delete') {
      if (await confirmDelete({ title: 'Delete announcement?', lines: [`"${a.Title}" and its ${parseReplies(a).length} replies will be removed for everyone.`] })) {
        commit('announcements', 'delete', { id });
        toast('Deleted');
      }
    } else if (act === 'edit') {
      const m = openModal(`<div class="modal-head"><h2>Edit Announcement</h2><button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
        <div class="modal-body"><div class="form-grid">
          <label class="field wide">Title<input class="input" id="aeTitle" value="${esc(a.Title)}"></label>
          <label class="field wide">Message<textarea class="input" id="aeMsg">${esc(a.Message)}</textarea></label>
          <label class="field">Priority<select class="select" id="aePrio">${['Info', 'Important', 'Urgent'].map((p) => `<option ${a.Priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
          <label class="field">Needs action by<input class="input" type="date" id="aeDue" value="${esc(a['Due Date'] || '')}"></label></div></div>
        <div class="modal-foot"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="aeSave" type="button">Save</button></div>`, { size: 'sm' });
      $('#aeSave', m).addEventListener('click', () => {
        const row = Object.assign({}, a, { Title: $('#aeTitle', m).value.trim() || a.Title, Message: $('#aeMsg', m).value.trim() || a.Message, Priority: $('#aePrio', m).value, 'Due Date': $('#aeDue', m).value });
        closeModal();
        commit('announcements', 'upsert', { row });
        toast('Saved');
      });
    }
  }

  // ---------------------------------------------------------------- Import & data view
  function renderData(el) {
    const connected = !!apiUrl();
    el.innerHTML = `
      <div class="dropzone" id="dz" role="button" tabindex="0">
        <div class="dz-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V3m0 0-4 4m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg></div>
        <h2>Drag & Drop an Excel or CSV File Here</h2>
        <p>or click to browse. Every sheet is matched to a dataset by its column headers. You review the match before anything is saved.</p>
      </div>
      <div class="card section"><div class="card-head"><h2>Datasets</h2><span class="sub">${connected ? 'Stored in the shared database' : 'Stored in this browser only'}</span></div>
        <div class="ds-list">${ALL_DS.map((k) => {
          const rows = state.data[k];
          const last = rows.reduce((m, r) => (r._updatedAt && r._updatedAt > m ? r._updatedAt : m), '');
          return `<div class="ds-item"><b>${esc(DS[k].label)}</b><span>${rows.length} rows${last ? ' · updated ' + esc(fmtWhen(last)) : ''}</span>
            <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><button class="btn sm" type="button" data-exp="${k}">Export .xlsx</button>${rows.length && k !== 'activity' ? `<button class="btn sm ghost danger" type="button" data-clear="${k}">Clear</button>` : ''}</div></div>`;
        }).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" type="button" data-export="all-xlsx">Export everything (.xlsx)</button><button class="btn" type="button" data-export="template">Download blank template</button></div></div>
      <div class="grid cols-2 section">
        <div class="card"><div class="card-head"><h2>What the Importer Recognizes</h2></div>
          <ul class="steps">
            <li><b>Program Tracker</b>: a sheet like "Training Activity Tracker" with Program Name, Topic, Training Status, Implementation Date and so on. <i>Days Remaining</i> is recalculated every day, so you don't need to keep it up to date.</li>
            <li><b>Attendance</b>: "L&D Dashboard Data" with Email, Calling Name, Date, Attendance, Module and so on.</li>
            <li><b>Assessments</b>: "L&D Assessment + MOF Scores" with Assessment Type and Score.</li>
            <li><b>Survey</b>: a Microsoft Forms export with the four rating questions.</li>
          </ul>
          <p class="note">Header rows don't need to be on row 1, and extra columns are kept. Excel dates and CSV dates are both understood.</p></div>
        <div class="card"><div class="card-head"><h2>Shared Storage</h2><span class="pill ${connected ? 'good' : 'warn'}">${connected ? 'Connected' : 'Not connected'}</span></div>
          ${connected
            ? `<p style="margin-top:0">Everyone on the team reads and writes the same database. Changes show up for others within ${CFG.pollSeconds} seconds, or right away when they click Refresh.</p>`
            : '<div class="callout">Right now data lives only in this browser. Connect the team database so everyone sees the same thing. The setup steps are in the README, and take about 10 minutes.</div>'}
          <div style="margin-top:12px"><button class="btn" type="button" id="btnOpenSettings">Connection settings</button></div></div>
      </div>`;
    const dz = $('#dz', el);
    dz.addEventListener('click', () => $('#fileInput').click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } });
    $$('[data-exp]', el).forEach((b) => b.addEventListener('click', () => exportDataset(b.dataset.exp)));
    $$('[data-clear]', el).forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.clear;
      const n = state.data[k].length;
      if (await confirmDelete({ title: `Clear ${DS[k].label}?`, okLabel: 'Clear all rows', lines: [`All ${n} rows will be removed for the whole team.`, 'Export a copy first if you might need it.'] })) {
        commit(k, 'replace', { rows: [] }, { action: 'Cleared', item: DS[k].label, details: `${n} rows removed`, snapshot: { ds: k, rows: state.data[k] } });
        toast(DS[k].label + ' cleared');
      }
    }));
    const os = $('#btnOpenSettings', el);
    if (isAdmin()) os.addEventListener('click', () => openSettings()); else os.remove();
    wireCommon(el);
  }

  // ---------------------------------------------------------------- Import pipeline
  async function handleFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) return toast('Please choose an .xlsx, .xls or .csv file', true);
    if (!window.XLSX) return toast('The spreadsheet reader did not load. Check your internet connection and reload.', true);
    let wb;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array', raw: /\.csv$/i.test(file.name), cellDates: false });
    } catch (e) {
      return toast('Could not read that file: ' + e.message, true);
    }
    const sheets = wb.SheetNames.map((n) => {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
      return Object.assign({ name: n, aoa }, detect(n, aoa));
    }).filter((s) => s.aoa.length);
    if (!sheets.length) return toast('That file has no data', true);
    // Hide helper sheets (instructions, dropdown lists) when the file has recognized data sheets.
    const known = sheets.filter((s) => s.ds);
    const skipped = known.length ? sheets.filter((s) => !s.ds).map((s) => s.name) : [];
    openImportModal(file.name, known.length ? known : sheets, skipped);
  }

  function detect(sheetName, aoa) {
    let best = { ds: null, hr: -1, score: 0 };
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const hs = new Set(aoa[i].map(normH).filter(Boolean));
      if (hs.size < 3) continue;
      for (const k of IMPORTABLE) {
        const cols = new Set(DS[k].columns.concat(DS[k].ignore).map(normH));
        let matched = 0;
        cols.forEach((c) => { if (hs.has(c)) matched++; });
        if (matched < 3) continue;
        let extra = 0;
        hs.forEach((h) => { if (!cols.has(h)) extra++; });
        let score = matched - extra - 0.5 * (cols.size - matched);
        if (normH(sheetName) === normH(DS[k].sheet)) score += 2;
        if (score > best.score || best.ds == null) best = { ds: k, hr: i, score };
      }
    }
    if (best.ds == null) {
      // No match: fall back to the first non-empty row as the header so the person can still pick a dataset.
      const hr = aoa.findIndex((r) => r.filter((c) => c !== '').length >= 2);
      return { ds: null, hr: hr < 0 ? 0 : hr };
    }
    return { ds: best.ds, hr: best.hr };
  }

  function rowsFromSheet(ds, aoa, hr) {
    const d = DS[ds];
    const canon = new Map(d.columns.map((c) => [normH(c), c]));
    const ignore = new Set(d.ignore.map(normH));
    const header = aoa[hr].map((h) => {
      const n = normH(h);
      if (!n || ignore.has(n)) return null;
      return canon.get(n) || String(h).trim();
    });
    const out = [];
    for (const arr of aoa.slice(hr + 1)) {
      const o = {};
      let any = false;
      header.forEach((col, j) => {
        if (!col) return;
        const v = cleanValue(d, col, arr[j]);
        if (v !== '') any = true;
        o[col] = v;
      });
      if (!any) continue;
      if (ds === 'tracker' && !o['Program Name'] && !o['Topic']) continue;
      if (ds === 'survey' && !o['Survey Average']) { const a = surveyAvg(o); if (a != null) o['Survey Average'] = String(Math.round(a * 100) / 100); }
      out.push(o);
    }
    return out;
  }
  function cleanValue(d, col, v) {
    if (v == null) return '';
    if (d.dates.includes(col)) return toISO(v, false);
    if (d.datetimes.includes(col)) return toISO(v, true);
    if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v).replace(/\r\n/g, '\n').trim();
  }

  function openImportModal(fileName, sheets, skipped) {
    const dsOpts = (sel) => `<option value="">Skip this sheet</option>` + IMPORTABLE.map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(DS[k].label)}</option>`).join('');
    const m = openModal(`
      <div class="modal-head"><div><h2>Review Upload</h2><div class="note">${esc(fileName)}</div></div><button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
      <div class="modal-body">
        <div class="callout info" style="margin-bottom:12px"><b>Update & add</b> updates rows that already exist (same program and topic, or same person and session) and adds the new ones. Edits made in the dashboard to other rows are kept.</div>
        ${sheets.map((s, i) => `<div class="import-row" data-i="${i}">
          <div><div class="sheet-name">${esc(s.name)}</div><div class="sheet-sub" data-info>…</div></div>
          <label class="field">Load into<select class="select" data-ds>${dsOpts(s.ds)}</select></label>
          <label class="field">How<select class="select" data-mode><option value="merge">Update & add</option><option value="replace">Replace all rows</option><option value="append">Add all as new rows</option></select></label>
        </div>`).join('')}
        ${skipped && skipped.length ? `<p class="note" style="margin:10px 0 0">Not imported (no matching headers): ${esc(skipped.join(', '))}</p>` : ''}
      </div>
      <div class="modal-foot"><span class="left" id="impSum"></span><button class="btn" data-close type="button">Cancel</button><button class="btn primary" id="impGo" type="button">Import</button></div>`);
    const refresh = () => {
      let total = 0;
      $$('.import-row', m).forEach((row) => {
        const s = sheets[+row.dataset.i];
        const ds = $('[data-ds]', row).value;
        const info = $('[data-info]', row);
        if (!ds) { info.textContent = s.ds ? 'Will be skipped' : 'Not recognized. Pick a dataset to load it anyway.'; $('[data-mode]', row).disabled = true; return; }
        $('[data-mode]', row).disabled = false;
        s.rows = rowsFromSheet(ds, s.aoa, s.hr);
        total += s.rows.length;
        info.textContent = `${s.rows.length} rows found${s.ds === ds ? ' · matched by headers' : ''} · ${state.data[ds].length} rows already in ${DS[ds].label}`;
      });
      $('#impSum', m).textContent = `${total} rows ready`;
    };
    $$('select', m).forEach((s) => s.addEventListener('change', refresh));
    refresh();
    $('#impGo', m).addEventListener('click', async () => {
      const jobs = [];
      const seen = {};
      $$('.import-row', m).forEach((row) => {
        const s = sheets[+row.dataset.i];
        const ds = $('[data-ds]', row).value;
        if (!ds || !s.rows.length) return;
        jobs.push({ ds, mode: $('[data-mode]', row).value, rows: s.rows, first: !seen[ds] });
        seen[ds] = true;
      });
      if (!jobs.length) return toast('Nothing selected to import', true);
      closeModal();
      const replacing = jobs.filter((j) => j.mode === 'replace' && state.data[j.ds].length);
      if (replacing.length && !(await confirmDelete({
        title: 'Replace existing rows?', word: 'REPLACE', okLabel: 'Replace',
        lines: replacing.map((j) => `${DS[j.ds].label}: the ${state.data[j.ds].length} rows already there are replaced by the file. Rows that aren't in the file are removed, including edits made in the dashboard.`)
      }))) return;
      const summary = [];
      const modeLabel = { merge: 'Update & add', replace: 'Replace all rows', append: 'Add all as new rows' };
      for (const j of jobs) {
        const final = applyImport(j.ds, j.mode, j.rows);
        const details = `${modeLabel[j.mode]}: ${final.added} added, ${final.updated} updated${final.removed.length ? `, ${final.removed.length} removed` : ''}`;
        const ok = await commit(j.ds, 'replace', { rows: final.rows }, { action: 'Imported', item: fileName, details, snapshot: final.removed.length ? { ds: j.ds, rows: final.removed } : null });
        summary.push(`${DS[j.ds].label}: ${final.added} added, ${final.updated} updated${final.removed.length ? `, ${final.removed.length} removed` : ''}${ok ? '' : ' (not synced)'}`);
      }
      toast('Imported. ' + summary.join(' · '));
      if (jobs.length === 1) go(jobs[0].ds === 'tracker' ? 'tracker' : jobs[0].ds);
    });
  }

  function applyImport(ds, mode, incoming) {
    const now = new Date().toISOString();
    const by = settings.name || 'Team member';
    const fresh = (r) => Object.assign({ _id: uid(), _updatedBy: by, _updatedAt: now }, r);
    const keyFn = DS[ds].key;
    if (mode === 'replace') {
      // Matching rows keep their id, so tasks linked to a topic survive a replace.
      const ids = new Map();
      for (const r of state.data[ds]) if (!ids.has(keyFn(r))) ids.set(keyFn(r), r._id);
      let updated = 0;
      const rows = incoming.map((r) => {
        const o = fresh(r);
        const id = ids.get(keyFn(r));
        if (id) { o._id = id; ids.delete(keyFn(r)); updated++; }
        return o;
      });
      const kept = new Set(rows.map((r) => r._id));
      return { rows, added: rows.length - updated, updated, removed: state.data[ds].filter((r) => !kept.has(r._id)) };
    }
    const rows = state.data[ds].map((r) => Object.assign({}, r));
    if (mode === 'append') return { rows: rows.concat(incoming.map(fresh)), added: incoming.length, updated: 0, removed: [] };
    const index = new Map(rows.map((r, i) => [keyFn(r), i]));
    let added = 0, updated = 0;
    for (const r of incoming) {
      const k = keyFn(r);
      // Only match rows that were already saved, so duplicates inside one file are all kept.
      if (index.has(k)) {
        const i = index.get(k);
        index.delete(k);
        rows[i] = Object.assign(rows[i], r, { _updatedBy: by, _updatedAt: now });
        updated++;
      } else {
        rows.push(fresh(r));
        added++;
      }
    }
    return { rows, added, updated, removed: [] };
  }

  // ---------------------------------------------------------------- Export
  function sheetFor(ds, rows, opts) {
    opts = opts || {};
    const d = DS[ds];
    let cols = columnsFor(ds, rows);
    if (ds === 'tracker') { const i = cols.indexOf('Implementation Date'); cols.splice(i + 1, 0, 'Days Remaining'); if (!opts.template) cols.push('Readiness %'); }
    if (ds === 'announcements') cols = cols.filter((c) => c !== 'Replies').concat(opts.template ? [] : ['Replies']);
    if (ds === 'tasks') rows = rows.map((t) => { const p = parentOf(t); return p ? Object.assign({}, t, { 'Program Name': p['Program Name'], Topic: p.Topic }) : t; });
    const meta = opts.template ? [] : ['Last Updated By', 'Last Updated At'];
    const aoa = [cols.concat(meta)];
    if (!opts.template) {
      for (const r of rows) {
        aoa.push(cols.map((c) => {
          if (c === 'Days Remaining') return daysText(r);
          if (c === 'Readiness %') return readiness(r).pct;
          if (c === 'Replies') return parseReplies(r).map((x) => `${x.by} (${fmtWhen(x.at)}): ${x.text}`).join('\n');
          if (c === 'Snapshot') return String(r[c] || '').slice(0, 32000); // Excel's cell limit
          if (c === 'When') return r.When ? new Date(r.When) : '';
          const v = r[c] == null ? '' : r[c];
          if (d.dates.includes(c)) { const dt = parseISO(v); return dt || v; }
          if (d.datetimes.includes(c)) { const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : v; }
          if (d.numbers.includes(c) && v !== '' && num(v) != null && /^-?[\d.]+$/.test(String(v))) return Number(v);
          return v;
        }).concat([r._updatedBy || '', r._updatedAt ? new Date(r._updatedAt) : '']));
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd' });
    ws['!cols'] = aoa[0].map((c) => ({ wch: Math.min(42, Math.max(11, String(c).length + 2)) }));
    return ws;
  }
  const stampName = () => isoLocal(new Date());
  function writeBook(sheets, filename) {
    const wb = XLSX.utils.book_new();
    for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
    XLSX.writeFile(wb, filename, { compression: true });
  }
  function exportDataset(ds) {
    if (!window.XLSX) return toast('The spreadsheet library did not load', true);
    writeBook([[DS[ds].sheet, sheetFor(ds, state.data[ds])]], `LD ${DS[ds].label} ${stampName()}.xlsx`);
  }
  function doExport(kind) {
    if (!window.XLSX) return toast('The spreadsheet library did not load', true);
    if (kind === 'all-xlsx') {
      const sum = XLSX.utils.aoa_to_sheet(periodSummaryRows());
      sum['!cols'] = [{ wch: 44 }, { wch: 20 }, { wch: 24 }];
      for (const r of [7, 8, 9]) for (const c of ['B', 'C']) { const cell = sum[c + r]; if (cell && typeof cell.v === 'number') cell.z = '0%'; }
      const cmp = XLSX.utils.aoa_to_sheet(compareExportRows());
      cmp['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 9 }];
      writeBook([['MTD & YTD Summary', sum], ['Pre vs Post', cmp]].concat(ALL_DS.map((k) => [DS[k].sheet, sheetFor(k, state.data[k])])), `LD Tracker Export ${stampName()}.xlsx`);
      return toast('Exported every dataset');
    }
    if (kind === 'template') {
      const a = document.createElement('a');
      a.href = 'templates/LD%20Tracker%20Upload%20Template.xlsx';
      a.download = 'LD Tracker Upload Template.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    let ds, rows;
    if (state.view === 'announcements') { ds = 'announcements'; rows = state.data.announcements; }
    else if (state.currentRows) { ds = state.currentRows.ds; rows = state.currentRows.rows; }
    else return toast('Open Program Tracker, Attendance, Assessments, Survey or Team Board to export a view', true);
    const ws = sheetFor(ds, rows);
    if (kind === 'view-csv') {
      const csv = XLSX.utils.sheet_to_csv(ws, { dateNF: 'yyyy-mm-dd' });
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `LD ${DS[ds].label} ${stampName()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else {
      writeBook([[DS[ds].sheet, ws]], `LD ${DS[ds].label} ${stampName()}.xlsx`);
    }
    toast(`Exported ${rows.length} rows`);
  }

  // ---------------------------------------------------------------- Users & sign-in
  // The team list lives in the shared database ("Users" table). Until an admin changes it, these defaults are used.
  const DEFAULT_USERS = [
    { _id: 'user-1', Name: 'Jimmar San Buenaventura', Role: 'Admin', Email: '' },
    { _id: 'user-2', Name: 'Rekha Krishna', Role: 'Member', Email: '' },
    { _id: 'user-3', Name: 'Zameer Amanulla', Role: 'Member', Email: '' }
  ];
  const ROLES = ['Admin', 'Member'];
  const usersList = () => (state.data.users.length ? state.data.users : DEFAULT_USERS).slice().sort((a, b) => String(a.Name).localeCompare(String(b.Name)));
  const currentUser = () => usersList().find((u) => norm(u.Name) === norm(settings.name));
  const isAdmin = () => { const u = currentUser(); return !!u && u.Role === 'Admin'; };
  // The default list is saved to the database the first time an admin changes it.
  async function ensureUsers() {
    if (state.data.users.length) return true;
    return commit('users', 'replace', { rows: DEFAULT_USERS.map((u) => Object.assign({}, u)) }, { action: 'Added', item: 'Users', details: 'Default user list saved' });
  }

  // Everyone: choose your name from the team list (and enter the team passcode when the shared database is connected).
  function openSignIn(passcodeFocus) {
    const signedIn = !!currentUser();
    const users = usersList();
    const m = openModal(`
      <div class="modal-head"><h2>${signedIn ? 'Switch User' : 'Welcome'}</h2>${signedIn ? '<button class="icon-btn" data-close type="button" aria-label="Close">✕</button>' : ''}</div>
      <form class="modal-body" id="siForm"><div class="form-grid" style="grid-template-columns:1fr">
        <label class="field">Who are you?<select class="select" id="siName" required>
          <option value="">Choose your name…</option>${users.map((u) => `<option ${norm(u.Name) === norm(settings.name) ? 'selected' : ''}>${esc(u.Name)}</option>`).join('')}</select>
          <span class="note">Your name is shown on the updates and announcements you post. Not on the list? Ask an Admin to add you.</span></label>
        ${apiUrl() ? `<label class="field">Team passcode<input class="input" id="siPass" type="password" value="${esc(settings.passcode)}" autocomplete="off" placeholder="Ask your team lead"></label>` : ''}
        <div id="siMsg" class="note"></div>
      </div></form>
      <div class="modal-foot"><button class="btn primary" id="siGo" type="button">Continue</button></div>`, { size: 'sm', locked: !signedIn });
    if (passcodeFocus && $('#siPass', m)) setTimeout(() => $('#siPass', m).focus(), 40);
    const go = async () => {
      const name = $('#siName', m).value;
      if (!name) { $('#siName', m).focus(); return; }
      const pass = $('#siPass', m) ? $('#siPass', m).value : settings.passcode;
      const passChanged = pass !== settings.passcode;
      if (apiUrl() && passChanged) {
        $('#siMsg', m).textContent = 'Checking the passcode…';
        const prev = settings.passcode;
        settings.passcode = pass;
        try { await api('ping'); } catch (e) { settings.passcode = prev; $('#siMsg', m).innerHTML = `<span class="pill crit">${esc(e.message)}</span>`; return; }
      }
      settings.name = name;
      settings.passcode = pass;
      lsSet(LS.settings, settings);
      closeModal();
      render();
      if (apiUrl() && passChanged) loadRemote();
    };
    $('#siGo', m).addEventListener('click', go);
    $('#siForm', m).addEventListener('submit', (e) => { e.preventDefault(); go(); });
  }

  // Admins only: manage the team list and the connection.
  function openSettings() {
    if (!isAdmin()) return toast('Settings are available to Admins only', true);
    const users = usersList();
    const admins = users.filter((u) => u.Role === 'Admin').length;
    const m = openModal(`
      <div class="modal-head"><h2>Settings</h2><button class="icon-btn" data-close type="button" aria-label="Close">✕</button></div>
      <div class="modal-body">
        <div class="form-group-title" style="margin-top:0">Users</div>
        ${state.usersUnsupported ? '<div class="callout" style="margin:8px 0">The database connection needs updating before user changes can be saved for everyone. See the README.</div>' : ''}
        <div class="table-wrap" style="max-height:none;margin-top:8px"><table class="data"><thead><tr><th>Name</th><th>Role</th><th>Email (optional)</th><th></th></tr></thead><tbody>
          ${users.map((u) => `<tr style="cursor:default" data-uid="${esc(u._id)}">
            <td><b>${esc(u.Name)}</b>${norm(u.Name) === norm(settings.name) ? ' <span class="row-meta">(you)</span>' : ''}</td>
            <td><select class="select" data-urole style="min-height:32px;padding:4px 8px">${ROLES.map((r) => `<option ${r === u.Role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
            <td><input class="input" data-uemail value="${esc(u.Email || '')}" placeholder="name@company.com" style="min-height:32px;padding:4px 8px"></td>
            <td><button class="btn sm ghost danger" type="button" data-udel ${u.Role === 'Admin' && admins <= 1 ? 'disabled title="Keep at least one Admin"' : ''}>Remove</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="add-user">
          <input class="input" id="nuName" placeholder="Full name" maxlength="80">
          <select class="select" id="nuRole">${ROLES.map((r) => `<option ${r === 'Member' ? 'selected' : ''}>${r}</option>`).join('')}</select>
          <button class="btn primary" type="button" id="nuAdd">+ Add user</button>
        </div>
        <p class="note">Admins see Settings and manage this list. Everyone can upload data, edit and add entries.</p>

        <div class="form-group-title">Connection</div>
        <div class="form-grid" style="grid-template-columns:1fr;margin-top:8px">
          <label class="field">Team passcode (this browser)<input class="input" id="sPass" type="password" value="${esc(settings.passcode)}" autocomplete="off"></label>
          <label class="field">Database connection URL<input class="input" id="sUrl" value="${esc(settings.apiUrl || CFG.apiUrl)}" placeholder="https://…/exec">
            <span class="note">${CFG.apiUrl ? 'Already set for the team in config.js. Only change this for testing.' : 'Paste the database connection URL. Leave it empty to keep data in this browser only.'}</span></label>
          <div id="sTest" class="note"></div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn" id="sTestBtn" type="button">Test connection</button><button class="btn primary" id="sSave" type="button">Save</button></div>`);

    const userById = (id) => usersList().find((u) => u._id === id);
    const reopen = () => { closeModal(); openSettings(); };
    $$('[data-urole]', m).forEach((s) => s.addEventListener('change', async () => {
      const u = userById(s.closest('tr').dataset.uid);
      if (u.Role === 'Admin' && s.value !== 'Admin' && usersList().filter((x) => x.Role === 'Admin').length <= 1) { s.value = 'Admin'; return toast('Keep at least one Admin', true); }
      await ensureUsers();
      await commit('users', 'upsert', { row: Object.assign({}, state.data.users.find((x) => x._id === u._id) || u, { Role: s.value }) });
      toast(`${u.Name} is now ${s.value === 'Admin' ? 'an Admin' : 'a Member'}`);
      reopen();
    }));
    $$('[data-uemail]', m).forEach((inp) => inp.addEventListener('change', async () => {
      const u = userById(inp.closest('tr').dataset.uid);
      await ensureUsers();
      await commit('users', 'upsert', { row: Object.assign({}, state.data.users.find((x) => x._id === u._id) || u, { Email: inp.value.trim() }) });
      toast('Email saved');
    }));
    $$('[data-udel]', m).forEach((b) => b.addEventListener('click', async () => {
      const u = userById(b.closest('tr').dataset.uid);
      if (!(await confirmDelete({ title: 'Remove this user?', okLabel: 'Remove', lines: [`${u.Name} will no longer appear in the team list.`, 'Their past updates and announcements stay as they are.'] }))) return;
      await ensureUsers();
      await commit('users', 'delete', { id: u._id });
      toast(`${u.Name} removed`);
      reopen();
    }));
    $('#nuAdd', m).addEventListener('click', async () => {
      const name = $('#nuName', m).value.trim().replace(/\s+/g, ' ');
      if (!name) { $('#nuName', m).focus(); return; }
      if (usersList().some((u) => norm(u.Name) === norm(name))) return toast('That person is already on the list', true);
      await ensureUsers();
      await commit('users', 'upsert', { row: { _id: uid(), Name: name, Role: $('#nuRole', m).value, Email: '' } });
      toast(`${name} added`);
      reopen();
    });
    $('#nuName', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#nuAdd', m).click(); } });
    $('#sTestBtn', m).addEventListener('click', async () => {
      const prev = { url: settings.apiUrl, pass: settings.passcode };
      settings.apiUrl = $('#sUrl', m).value.trim() === CFG.apiUrl ? '' : $('#sUrl', m).value.trim();
      settings.passcode = $('#sPass', m).value;
      $('#sTest', m).textContent = 'Testing…';
      try { await api('ping'); $('#sTest', m).innerHTML = '<span class="pill good">Connected</span>'; } catch (e) { $('#sTest', m).innerHTML = `<span class="pill crit">${esc(e.message)}</span>`; }
      settings.apiUrl = prev.url; settings.passcode = prev.pass;
    });
    $('#sSave', m).addEventListener('click', () => {
      const url = $('#sUrl', m).value.trim();
      const changed = url !== (settings.apiUrl || CFG.apiUrl) || $('#sPass', m).value !== settings.passcode;
      settings.passcode = $('#sPass', m).value;
      settings.apiUrl = url === CFG.apiUrl ? '' : url;
      lsSet(LS.settings, settings);
      closeModal();
      renderNav();
      if (changed) { if (apiUrl()) loadRemote(); else setSync('local'); }
      toast('Settings saved');
    });
  }

  // ---------------------------------------------------------------- Shared wiring
  function wireCommon(el) {
    $$('[data-goto]', el).forEach((n) => {
      const act = () => {
        let filt = null;
        if (n.dataset.filter) { filt = Object.assign({ program: '', status: '', due: '', owner: '', month: '', year: '', q: '' }, JSON.parse(n.dataset.filter)); }
        go(n.dataset.goto, filt);
      };
      n.addEventListener('click', act);
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter') act(); });
    });
    $$('[data-act="upload"]', el).forEach((b) => b.addEventListener('click', () => $('#fileInput').click()));
    $$('[data-export]', el).forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));
  }

  function setupGlobal() {
    // Row clicks open the editor (tables, upcoming list, board tiles)
    $('#view').addEventListener('click', (e) => {
      const tt = e.target.closest('[data-ttime]');
      if (tt) { openTimeLog(tt.dataset.ttime, () => render()); return; }
      const tc = e.target.closest('[data-tasks]');
      if (tc) { openEditor('tracker', tc.dataset.tasks, { tab: 'tasks' }); return; }
      const t = e.target.closest('[data-edit]');
      if (!t || e.target.closest('select, button, a, input')) return;
      const ds = state.view === 'overview' ? 'tracker' : state.currentRows ? state.currentRows.ds : state.view;
      openEditor(ds, t.dataset.edit);
    });
    $('#view').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target.closest('[data-edit]');
      if (t && !e.target.closest('select, button, input')) t.click();
    });
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-view]');
      if (nav) go(nav.dataset.view);
      const menu = $('#exportMenu');
      if (e.target.closest('#btnExport')) { menu.classList.toggle('open'); $('#btnExport').setAttribute('aria-expanded', menu.classList.contains('open')); }
      else if (!e.target.closest('.menu-list')) menu.classList.remove('open');
    });
    $$('#exportMenu [data-export]').forEach((b) => b.addEventListener('click', () => { $('#exportMenu').classList.remove('open'); doExport(b.dataset.export); }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('#exportMenu').classList.remove('open');
        const back = $('#modalRoot .modal-back');
        if (back && back.querySelector('[data-close]') && !$('#confirmRoot').firstElementChild) closeModal();
      }
    });
    $('#btnUpload').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); });
    $('#btnSync').addEventListener('click', () => { if (apiUrl()) loadRemote(); else { toast('Not connected to the shared database yet. Data is saved in this browser.'); } });
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnSwitch').addEventListener('click', () => openSignIn());

    // Drag & drop a file anywhere
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; $('#dropOverlay').classList.add('show'); $('#dz') && $('#dz').classList.add('over'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) { $('#dropOverlay').classList.remove('show'); $('#dz') && $('#dz').classList.remove('over'); } });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0;
      $('#dropOverlay').classList.remove('show');
      handleFile(e.dataTransfer.files[0]);
    });

    // Keep everyone's view fresh
    setInterval(() => { if (apiUrl() && !document.hidden && state.pendingWrites === 0) loadRemote(true); }, Math.max(15, CFG.pollSeconds) * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && apiUrl()) loadRemote(true); });
  }

  // ---------------------------------------------------------------- Boot
  setupGlobal();
  setSync(apiUrl() ? 'busy' : 'local');
  render();
  if (!currentUser()) openSignIn();
  else if (apiUrl() && !settings.passcode) openSignIn(true);
  if (apiUrl()) loadRemote();
})();
