/**
 * L&D Program Tracker — shared data store.
 *
 * Bind this script to a Google Sheet (Extensions → Apps Script), set the
 * team passcode (Sheet menu: L&D Tracker → Set team passcode), then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone). See README.md for the full steps.
 *
 * Each dataset lives in its own tab. Every row carries _id, _updatedBy and
 * _updatedAt so edits from different team members land on the right row.
 */

var TABS = {
  tracker: 'Program Tracker',
  tasks: 'Tasks & Logistics',
  attendance: 'Attendance',
  assessments: 'Assessments',
  survey: 'Training Survey',
  announcements: 'Announcements',
  users: 'Users',
  activity: 'Activity Log'
};
// The activity log is append-only: the dashboard can add entries but never edit or remove them.
var APPEND_ONLY = { activity: true };
var META = ['_id', '_updatedBy', '_updatedAt'];
var LOG_TAB = '_Change Log';

// Adds an "L&D Tracker" menu to the Sheet so the owner can set or change the team passcode.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('L&D Tracker').addItem('Set team passcode', 'setTeamPasscode').addToUi();
}

function setTeamPasscode() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt('Team passcode', 'Enter the passcode the L&D team will type into the dashboard (at least 6 characters).', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var value = res.getResponseText().trim();
  if (value.length < 6) { ui.alert('Please use at least 6 characters.'); return; }
  PropertiesService.getScriptProperties().setProperty('TEAM_PASSCODE', value);
  ui.alert('Passcode saved. Share it with the L&D team; everyone types it once in the dashboard.');
}

function doGet() {
  return json_({ ok: true, service: 'L&D Program Tracker', note: 'Use POST requests from the dashboard.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request' });
  }

  var passcode = PropertiesService.getScriptProperties().getProperty('TEAM_PASSCODE');
  if (!passcode) return json_({ ok: false, error: 'The team passcode is not set yet. In the Google Sheet, use L&D Tracker → Set team passcode.' });
  if (String(req.key || '') !== passcode) return json_({ ok: false, error: 'Wrong team passcode' });

  try {
    if (req.action === 'ping') return json_({ ok: true });
    if (req.action === 'all') return json_({ ok: true, data: readAll_(), serverTime: new Date().toISOString() });

    var ds = req.dataset;
    if (!TABS[ds]) throw new Error('Unknown dataset: ' + ds);
    if (APPEND_ONLY[ds] && req.action !== 'append') throw new Error('The activity log can only be added to');

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (req.action === 'upsert') upsert_(ds, req.row);
      else if (req.action === 'upsertMany') (req.rows || []).forEach(function (r) { upsert_(ds, r); });
      else if (req.action === 'delete') remove_(ds, req.id);
      else if (req.action === 'deleteMany') (req.ids || []).forEach(function (id) { remove_(ds, id); });
      else if (req.action === 'replace') replace_(ds, req.rows || []);
      else if (req.action === 'append') append_(ds, req.rows || []);
      else throw new Error('Unknown action: ' + req.action);
      if (!APPEND_ONLY[ds]) log_(req);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---------------------------------------------------------------- reads

function readAll_() {
  var out = {};
  Object.keys(TABS).forEach(function (ds) { out[ds] = readRows_(sheet_(ds)); });
  return out;
}

function readRows_(sh) {
  var last = sh.getLastRow();
  var cols = sh.getLastColumn();
  if (last < 2 || cols < 1) return [];
  var values = sh.getRange(1, 1, last, cols).getDisplayValues();
  var header = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    var o = {};
    for (var j = 0; j < header.length; j++) if (header[j]) o[header[j]] = r[j];
    rows.push(o);
  }
  return rows;
}

// ---------------------------------------------------------------- writes

function sheet_(ds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TABS[ds]);
  if (!sh) {
    sh = ss.insertSheet(TABS[ds]);
    sh.getRange(1, 1, 1, META.length).setValues([META]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function header_(sh) {
  var cols = sh.getLastColumn();
  return cols ? sh.getRange(1, 1, 1, cols).getDisplayValues()[0] : [];
}

function ensureColumns_(sh, keys) {
  var header = header_(sh);
  var changed = false;
  META.concat(keys).forEach(function (k) {
    if (header.indexOf(k) < 0) { header.push(k); changed = true; }
  });
  if (changed) sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  return header;
}

function toRow_(header, obj) {
  return header.map(function (h) { return obj[h] == null ? '' : String(obj[h]); });
}

function writeRows_(sh, startRow, rows) {
  if (!rows.length) return;
  var range = sh.getRange(startRow, 1, rows.length, rows[0].length);
  range.setNumberFormat('@'); // keep dates and IDs exactly as the dashboard sent them
  range.setValues(rows);
}

function findRow_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function upsert_(ds, row) {
  if (!row || !row._id) throw new Error('Row is missing _id');
  var sh = sheet_(ds);
  var header = ensureColumns_(sh, Object.keys(row));
  var at = findRow_(sh, row._id);
  writeRows_(sh, at > 0 ? at : sh.getLastRow() + 1, [toRow_(header, row)]);
}

function append_(ds, rows) {
  if (!rows.length) return;
  var sh = sheet_(ds);
  var keys = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
  var header = ensureColumns_(sh, keys);
  writeRows_(sh, sh.getLastRow() + 1, rows.map(function (r) { return toRow_(header, r); }));
}

function remove_(ds, id) {
  var sh = sheet_(ds);
  var at = findRow_(sh, id);
  if (at > 0) sh.deleteRow(at);
}

function replace_(ds, rows) {
  var sh = sheet_(ds);
  var keys = [];
  rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
  var header = META.concat(keys.filter(function (k) { return META.indexOf(k) < 0; }));
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  writeRows_(sh, 2, rows.map(function (r) { return toRow_(header, r); }));
}

function log_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(LOG_TAB);
    sh.appendRow(['When', 'Who', 'Action', 'Dataset', 'Row / count']);
    sh.setFrozenRows(1);
  }
  var detail = req.rows ? req.rows.length + ' rows' : req.ids ? req.ids.length + ' rows' : (req.row ? req.row._id : req.id);
  sh.appendRow([new Date(), req.by || '', req.action, TABS[req.dataset] || req.dataset, detail]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
