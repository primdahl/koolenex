'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const fs = require('fs');

let server, baseUrl, db;

async function req(method, urlPath, body) {
  const url = baseUrl + urlPath;
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  db = require('../server/db');
  await db.init();
  const routes = require('../server/routes');
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}/api`;
      resolve();
    });
  });
});

after(() => { server?.close(); });

// ── Projects ─────────────────────────────────────────────────────────────────

describe('Projects', () => {
  let projectId;

  it('POST /projects creates a project and inserts a row', async () => {
    const { status, data } = await req('POST', '/projects', { name: 'Test Project' });
    assert.equal(status, 200);
    projectId = data.id;

    const row = db.get('SELECT * FROM projects WHERE id=?', [projectId]);
    assert(row, 'project row should exist in database');
    assert.equal(row.name, 'Test Project');
    assert(row.created_at, 'should have created_at timestamp');
  });

  it('POST /projects rejects empty name without inserting', async () => {
    const countBefore = db.get('SELECT count(*) as c FROM projects').c;
    const { status } = await req('POST', '/projects', { name: '' });
    assert.equal(status, 400);
    const countAfter = db.get('SELECT count(*) as c FROM projects').c;
    assert.equal(countAfter, countBefore, 'no row should be inserted on validation failure');
  });

  it('PUT /projects/:id updates the name in the database', async () => {
    await req('PUT', `/projects/${projectId}`, { name: 'Renamed' });
    const row = db.get('SELECT * FROM projects WHERE id=?', [projectId]);
    assert.equal(row.name, 'Renamed');
  });

  it('DELETE /projects/:id removes the row from the database', async () => {
    await req('DELETE', `/projects/${projectId}`);
    const row = db.get('SELECT * FROM projects WHERE id=?', [projectId]);
    assert.equal(row, null, 'project row should be gone');
  });
});

// ── Devices ──────────────────────────────────────────────────────────────────

describe('Devices', () => {
  let pid, did;

  before(async () => {
    const { data } = await req('POST', '/projects', { name: 'Device Tests' });
    pid = data.id;
  });

  after(async () => { await req('DELETE', `/projects/${pid}`); });

  it('POST creates a device row with correct columns', async () => {
    const { data } = await req('POST', `/projects/${pid}/devices`, {
      individual_address: '1.1.1', name: 'Switch Actuator',
      manufacturer: 'ABB', model: 'SA/S4.16.6.2',
      area: 1, line: 1, device_type: 'actuator',
    });
    did = data.id;

    const row = db.get('SELECT * FROM devices WHERE id=?', [did]);
    assert(row, 'device row should exist');
    assert.equal(row.project_id, pid);
    assert.equal(row.individual_address, '1.1.1');
    assert.equal(row.name, 'Switch Actuator');
    assert.equal(row.manufacturer, 'ABB');
    assert.equal(row.model, 'SA/S4.16.6.2');
    assert.equal(row.area, 1);
    assert.equal(row.line, 1);
    assert.equal(row.device_type, 'actuator');
    assert.equal(row.status, 'unassigned');
  });

  it('PUT updates only the specified columns', async () => {
    await req('PUT', `/projects/${pid}/devices/${did}`, { comment: 'test comment' });
    const row = db.get('SELECT * FROM devices WHERE id=?', [did]);
    assert.equal(row.comment, 'test comment');
    assert.equal(row.name, 'Switch Actuator', 'name should be unchanged');
    assert.equal(row.manufacturer, 'ABB', 'manufacturer should be unchanged');
  });

  it('PATCH status updates the status column', async () => {
    await req('PATCH', `/projects/${pid}/devices/${did}/status`, { status: 'programmed' });
    const row = db.get('SELECT * FROM devices WHERE id=?', [did]);
    assert.equal(row.status, 'programmed');
  });

  it('PATCH param-values stores JSON in param_values column', async () => {
    await req('PATCH', `/projects/${pid}/devices/${did}/param-values`, { 'ref-1': 42, 'ref-2': 'hello' });
    const row = db.get('SELECT param_values FROM devices WHERE id=?', [did]);
    const vals = JSON.parse(row.param_values);
    assert.equal(vals['ref-1'], 42);
    assert.equal(vals['ref-2'], 'hello');
  });

  it('PATCH param-values overwrites previous values', async () => {
    await req('PATCH', `/projects/${pid}/devices/${did}/param-values`, { 'ref-1': 99 });
    const row = db.get('SELECT param_values FROM devices WHERE id=?', [did]);
    const vals = JSON.parse(row.param_values);
    assert.equal(vals['ref-1'], 99);
    assert.equal(vals['ref-2'], undefined, 'previous keys should be gone (full replace)');
  });

  it('DELETE removes the device row and its com_objects', async () => {
    // Insert a com_object for this device
    db.run('INSERT INTO com_objects (project_id, device_id, object_number, name) VALUES (?,?,?,?)',
      [pid, did, 0, 'Test CO']);
    const coBefore = db.get('SELECT count(*) as c FROM com_objects WHERE device_id=?', [did]);
    assert.equal(coBefore.c, 1);

    await req('DELETE', `/projects/${pid}/devices/${did}`);
    assert.equal(db.get('SELECT * FROM devices WHERE id=?', [did]), null, 'device row should be gone');
    const coAfter = db.get('SELECT count(*) as c FROM com_objects WHERE device_id=?', [did]);
    assert.equal(coAfter.c, 0, 'com_objects should be cascade deleted');
  });
});

// ── Group Addresses ──────────────────────────────────────────────────────────

describe('Group Addresses', () => {
  let pid;

  before(async () => {
    const { data } = await req('POST', '/projects', { name: 'GA Tests' });
    pid = data.id;
  });

  after(async () => { await req('DELETE', `/projects/${pid}`); });

  it('POST creates a GA row with parsed address parts', async () => {
    const { data } = await req('POST', `/projects/${pid}/gas`, {
      address: '1/2/3', name: 'Light Switch', dpt: '1.001',
    });
    const row = db.get('SELECT * FROM group_addresses WHERE id=?', [data.id]);
    assert(row);
    assert.equal(row.address, '1/2/3');
    assert.equal(row.name, 'Light Switch');
    assert.equal(row.dpt, '1.001');
    assert.equal(row.main_g, 1);
    assert.equal(row.middle_g, 2);
    assert.equal(row.sub_g, 3);
  });

  it('POST 2-level GA creates a ga_group_names entry', async () => {
    await req('POST', `/projects/${pid}/gas`, { address: '5/1', name: 'Heating' });
    const gn = db.get('SELECT * FROM ga_group_names WHERE project_id=? AND main_g=5 AND middle_g=1', [pid]);
    assert(gn, 'should create ga_group_names entry for 2-level GA');
    assert.equal(gn.name, 'Heating');
  });

  it('PUT updates only the specified columns in the database', async () => {
    const gas = db.all('SELECT * FROM group_addresses WHERE project_id=? AND address=?', [pid, '1/2/3']);
    const gaId = gas[0].id;
    await req('PUT', `/projects/${pid}/gas/${gaId}`, { comment: 'new comment' });
    const row = db.get('SELECT * FROM group_addresses WHERE id=?', [gaId]);
    assert.equal(row.comment, 'new comment');
    assert.equal(row.name, 'Light Switch', 'name should be unchanged');
    assert.equal(row.dpt, '1.001', 'dpt should be unchanged');
  });

  it('DELETE removes the GA row', async () => {
    const gas = db.all('SELECT * FROM group_addresses WHERE project_id=?', [pid]);
    const countBefore = gas.length;
    await req('DELETE', `/projects/${pid}/gas/${gas[0].id}`);
    const countAfter = db.get('SELECT count(*) as c FROM group_addresses WHERE project_id=?', [pid]).c;
    assert.equal(countAfter, countBefore - 1);
  });
});

// ── Group Name Renaming ─────────────────────────────────────────────────────

describe('Group Name Renaming', () => {
  let pid;

  before(async () => {
    const { data } = await req('POST', '/projects', { name: 'Group Name Tests' });
    pid = data.id;
    await req('POST', `/projects/${pid}/gas`, { address: '1/0/1', name: 'GA A' });
    await req('POST', `/projects/${pid}/gas`, { address: '1/0/2', name: 'GA B' });
    await req('POST', `/projects/${pid}/gas`, { address: '1/1/1', name: 'GA C' });
  });

  after(async () => { await req('DELETE', `/projects/${pid}`); });

  it('PATCH group-name creates a main group name row in ga_group_names', async () => {
    await req('PATCH', `/projects/${pid}/gas/group-name`, { main: 1, name: 'Lighting' });
    const row = db.get('SELECT * FROM ga_group_names WHERE project_id=? AND main_g=1 AND middle_g=-1', [pid]);
    assert(row, 'should create ga_group_names row for main group');
    assert.equal(row.name, 'Lighting');
  });

  it('PATCH group-name creates a middle group name row in ga_group_names', async () => {
    await req('PATCH', `/projects/${pid}/gas/group-name`, { main: 1, middle: 0, name: 'Living Room' });
    const row = db.get('SELECT * FROM ga_group_names WHERE project_id=? AND main_g=1 AND middle_g=0', [pid]);
    assert(row, 'should create ga_group_names row for middle group');
    assert.equal(row.name, 'Living Room');
    // Other middle group should not be affected
    const other = db.get('SELECT * FROM ga_group_names WHERE project_id=? AND main_g=1 AND middle_g=1', [pid]);
    assert(!other || other.name === '', 'middle group 1/1 should not have a name');
  });

  it('renaming overwrites the previous name', async () => {
    await req('PATCH', `/projects/${pid}/gas/group-name`, { main: 1, name: 'Updated' });
    const row = db.get('SELECT * FROM ga_group_names WHERE project_id=? AND main_g=1 AND middle_g=-1', [pid]);
    assert.equal(row.name, 'Updated');
    const count = db.get('SELECT count(*) as c FROM ga_group_names WHERE project_id=? AND main_g=1 AND middle_g=-1', [pid]);
    assert.equal(count.c, 1, 'should be exactly one row, not duplicated');
  });
});

// ── Audit Log ────────────────────────────────────────────────────────────────

describe('Audit Log', () => {
  let pid;

  before(async () => {
    const { data } = await req('POST', '/projects', { name: 'Audit Tests' });
    pid = data.id;
  });

  after(async () => { await req('DELETE', `/projects/${pid}`); });

  it('creating a project inserts an audit_log row', async () => {
    const rows = db.all('SELECT * FROM audit_log WHERE project_id=? AND action=? AND entity=?', [pid, 'create', 'project']);
    assert(rows.length >= 1, 'should have at least one create project audit row');
    assert.equal(rows[0].entity_id, 'Audit Tests');
  });

  it('updating a device records before/after in audit detail', async () => {
    const { data: dev } = await req('POST', `/projects/${pid}/devices`, {
      individual_address: '1.1.1', name: 'Test Device', area: 1, line: 1,
    });
    await req('PUT', `/projects/${pid}/devices/${dev.id}`, { comment: 'hello world' });

    const rows = db.all('SELECT * FROM audit_log WHERE project_id=? AND action=? AND entity=? ORDER BY id DESC',
      [pid, 'update', 'device']);
    assert(rows.length >= 1);
    const detail = rows[0].detail;
    assert(detail.includes('comment'), `detail should mention changed field, got: ${detail}`);
    assert(detail.includes('hello world'), `detail should include new value, got: ${detail}`);
    assert(detail.includes('""'), `detail should show empty old value, got: ${detail}`);
  });

  it('updating param_values records the diff in audit detail', async () => {
    const devRow = db.get('SELECT id FROM devices WHERE project_id=? AND individual_address=?', [pid, '1.1.1']);
    await req('PATCH', `/projects/${pid}/devices/${devRow.id}/param-values`, { 'ref-1': 42 });
    await req('PATCH', `/projects/${pid}/devices/${devRow.id}/param-values`, { 'ref-1': 99 });

    const rows = db.all('SELECT * FROM audit_log WHERE project_id=? AND entity=? ORDER BY id DESC', [pid, 'param_values']);
    assert(rows.length >= 2);
    const latest = rows[0].detail;
    assert(latest.includes('42'), `should show old value 42, got: ${latest}`);
    assert(latest.includes('99'), `should show new value 99, got: ${latest}`);
  });

  it('CSV endpoint returns all audit columns', async () => {
    const { status, headers, data } = await req('GET', `/projects/${pid}/audit-log/csv`);
    assert.equal(status, 200);
    assert(headers.get('content-type').includes('text/csv'));
    const lines = data.split('\n');
    assert.equal(lines[0], 'timestamp,action,entity,entity_id,detail');
    assert(lines.length > 1, 'should have data rows');
  });
});

// ── Cascade Delete ───────────────────────────────────────────────────────────

describe('Cascade Delete', () => {
  it('deleting a project removes rows from all child tables', async () => {
    const { data: p } = await req('POST', '/projects', { name: 'Cascade Test' });
    const pid = p.id;

    // Populate all child tables
    const { data: dev } = await req('POST', `/projects/${pid}/devices`, {
      individual_address: '1.1.1', name: 'Dev A', area: 1, line: 1,
    });
    await req('POST', `/projects/${pid}/gas`, { address: '0/0/1', name: 'GA 1' });
    db.run('INSERT INTO com_objects (project_id, device_id, object_number, name) VALUES (?,?,?,?)',
      [pid, dev.id, 0, 'CO 1']);
    db.run('INSERT INTO spaces (project_id, name, type) VALUES (?,?,?)', [pid, 'Room 1', 'Room']);
    await req('PATCH', `/projects/${pid}/gas/group-name`, { main: 0, name: 'Main Group' });

    // Verify rows exist in all tables
    assert(db.get('SELECT count(*) as c FROM devices WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM group_addresses WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM com_objects WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM spaces WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM ga_group_names WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM audit_log WHERE project_id=?', [pid]).c > 0);
    assert(db.get('SELECT count(*) as c FROM catalog_sections WHERE project_id=?', [pid]).c === 0); // empty but table exists
    assert(db.get('SELECT count(*) as c FROM catalog_items WHERE project_id=?', [pid]).c === 0);

    // Delete project
    await req('DELETE', `/projects/${pid}`);

    // Verify ALL child tables are clean
    assert.equal(db.get('SELECT * FROM projects WHERE id=?', [pid]), null, 'projects');
    assert.equal(db.get('SELECT count(*) as c FROM devices WHERE project_id=?', [pid]).c, 0, 'devices');
    assert.equal(db.get('SELECT count(*) as c FROM group_addresses WHERE project_id=?', [pid]).c, 0, 'group_addresses');
    assert.equal(db.get('SELECT count(*) as c FROM com_objects WHERE project_id=?', [pid]).c, 0, 'com_objects');
    assert.equal(db.get('SELECT count(*) as c FROM spaces WHERE project_id=?', [pid]).c, 0, 'spaces');
    assert.equal(db.get('SELECT count(*) as c FROM ga_group_names WHERE project_id=?', [pid]).c, 0, 'ga_group_names');
    assert.equal(db.get('SELECT count(*) as c FROM audit_log WHERE project_id=?', [pid]).c, 0, 'audit_log');
    assert.equal(db.get('SELECT count(*) as c FROM catalog_sections WHERE project_id=?', [pid]).c, 0, 'catalog_sections');
    assert.equal(db.get('SELECT count(*) as c FROM catalog_items WHERE project_id=?', [pid]).c, 0, 'catalog_items');
  });
});

// ── Settings ─────────────────────────────────────────────────────────────────

describe('Settings', () => {
  it('PATCH /settings writes to the settings table', async () => {
    await req('PATCH', '/settings', { knxip_host: '10.0.0.1', knxip_port: '3672' });
    const host = db.get("SELECT value FROM settings WHERE key='knxip_host'");
    const port = db.get("SELECT value FROM settings WHERE key='knxip_port'");
    assert.equal(host.value, '10.0.0.1');
    assert.equal(port.value, '3672');
    // Restore
    await req('PATCH', '/settings', { knxip_host: '224.0.23.12', knxip_port: '3671' });
  });

  it('PATCH /settings does not write disallowed keys to the table', async () => {
    await req('PATCH', '/settings', { evil_key: 'hacked' });
    const row = db.get("SELECT value FROM settings WHERE key='evil_key'");
    assert.equal(row, null, 'disallowed key should not be in settings table');
  });
});

// ── Locations (Spaces) ───────────────────────────────────────────────────────

describe('Locations', () => {
  let pid;

  before(async () => {
    const { data } = await req('POST', '/projects', { name: 'Location Tests' });
    pid = data.id;
  });

  after(async () => { await req('DELETE', `/projects/${pid}`); });

  it('POST /spaces creates a space row with correct columns', async () => {
    const { status, data } = await req('POST', `/projects/${pid}/spaces`, {
      name: 'Main Building', type: 'Building',
    });
    assert.equal(status, 200);
    const row = db.get('SELECT * FROM spaces WHERE id=?', [data.id]);
    assert(row);
    assert.equal(row.project_id, pid);
    assert.equal(row.name, 'Main Building');
    assert.equal(row.type, 'Building');
    assert.equal(row.parent_id, null);
  });

  it('POST /spaces creates a child space with parent_id', async () => {
    const building = db.get('SELECT id FROM spaces WHERE project_id=? AND type=?', [pid, 'Building']);
    const { status, data } = await req('POST', `/projects/${pid}/spaces`, {
      name: 'Ground Floor', type: 'Floor', parent_id: building.id,
    });
    assert.equal(status, 200);
    const row = db.get('SELECT * FROM spaces WHERE id=?', [data.id]);
    assert.equal(row.parent_id, building.id);
    assert.equal(row.type, 'Floor');
  });

  it('POST /spaces builds a multi-level hierarchy', async () => {
    const floor = db.get('SELECT id FROM spaces WHERE project_id=? AND name=?', [pid, 'Ground Floor']);
    const { data: room } = await req('POST', `/projects/${pid}/spaces`, {
      name: 'Living Room', type: 'Room', parent_id: floor.id,
    });
    const row = db.get('SELECT * FROM spaces WHERE id=?', [room.id]);
    assert.equal(row.parent_id, floor.id);

    // Verify the full tree: Building > Floor > Room
    const roomRow = db.get('SELECT * FROM spaces WHERE id=?', [room.id]);
    const floorRow = db.get('SELECT * FROM spaces WHERE id=?', [roomRow.parent_id]);
    const buildingRow = db.get('SELECT * FROM spaces WHERE id=?', [floorRow.parent_id]);
    assert.equal(buildingRow.name, 'Main Building');
    assert.equal(floorRow.name, 'Ground Floor');
    assert.equal(roomRow.name, 'Living Room');
  });

  it('POST /spaces rejects empty name', async () => {
    const { status } = await req('POST', `/projects/${pid}/spaces`, { name: '', type: 'Room' });
    assert.equal(status, 400);
    const { status: s2 } = await req('POST', `/projects/${pid}/spaces`, {});
    assert.equal(s2, 400);
  });

  it('POST /spaces defaults type to Room', async () => {
    const { data } = await req('POST', `/projects/${pid}/spaces`, { name: 'Unnamed Space' });
    const row = db.get('SELECT * FROM spaces WHERE id=?', [data.id]);
    assert.equal(row.type, 'Room');
  });

  it('PUT /spaces updates the name in the database', async () => {
    const space = db.get('SELECT id FROM spaces WHERE project_id=? AND name=?', [pid, 'Living Room']);
    await req('PUT', `/projects/${pid}/spaces/${space.id}`, { name: 'Kitchen' });
    const row = db.get('SELECT * FROM spaces WHERE id=?', [space.id]);
    assert.equal(row.name, 'Kitchen');
    assert.equal(row.type, 'Room', 'type should be unchanged');
  });

  it('PUT /spaces returns 404 for nonexistent space', async () => {
    const { status } = await req('PUT', `/projects/${pid}/spaces/99999`, { name: 'x' });
    assert.equal(status, 404);
  });

  it('device can be assigned to a space', async () => {
    const room = db.get('SELECT id FROM spaces WHERE project_id=? AND name=?', [pid, 'Kitchen']);
    const { data: dev } = await req('POST', `/projects/${pid}/devices`, {
      individual_address: '1.1.1', name: 'Light Switch', area: 1, line: 1, space_id: room.id,
    });
    const row = db.get('SELECT space_id FROM devices WHERE id=?', [dev.id]);
    assert.equal(row.space_id, room.id);
  });

  it('DELETE /spaces removes the space and unassigns devices', async () => {
    const room = db.get('SELECT id FROM spaces WHERE project_id=? AND name=?', [pid, 'Kitchen']);
    const devBefore = db.get('SELECT space_id FROM devices WHERE project_id=? AND individual_address=?', [pid, '1.1.1']);
    assert.equal(devBefore.space_id, room.id);

    const { status } = await req('DELETE', `/projects/${pid}/spaces/${room.id}`);
    assert.equal(status, 200);

    assert.equal(db.get('SELECT * FROM spaces WHERE id=?', [room.id]), null, 'space should be gone');
    const devAfter = db.get('SELECT space_id FROM devices WHERE project_id=? AND individual_address=?', [pid, '1.1.1']);
    assert.equal(devAfter.space_id, null, 'device should be unassigned from deleted space');
  });

  it('DELETE /spaces reparents children to the deleted space parent', async () => {
    const floor = db.get('SELECT id FROM spaces WHERE project_id=? AND name=?', [pid, 'Ground Floor']);
    // Create a room under the floor
    const { data: room } = await req('POST', `/projects/${pid}/spaces`, {
      name: 'Bedroom', type: 'Room', parent_id: floor.id,
    });
    assert.equal(db.get('SELECT parent_id FROM spaces WHERE id=?', [room.id]).parent_id, floor.id);

    // Delete the floor — bedroom should reparent to the building
    const building = db.get('SELECT id FROM spaces WHERE project_id=? AND type=?', [pid, 'Building']);
    await req('DELETE', `/projects/${pid}/spaces/${floor.id}`);

    const reparented = db.get('SELECT parent_id FROM spaces WHERE id=?', [room.id]);
    assert.equal(reparented.parent_id, building.id, 'child should be reparented to deleted space parent');
  });

  it('DELETE /spaces returns 404 for nonexistent space', async () => {
    const { status } = await req('DELETE', `/projects/${pid}/spaces/99999`);
    assert.equal(status, 404);
  });

  it('space operations generate audit log entries', async () => {
    const rows = db.all('SELECT * FROM audit_log WHERE project_id=? AND entity=? ORDER BY id', [pid, 'space']);
    const creates = rows.filter(r => r.action === 'create');
    const updates = rows.filter(r => r.action === 'update');
    const deletes = rows.filter(r => r.action === 'delete');
    assert(creates.length >= 1, 'should have create audit entries');
    assert(updates.length >= 1, 'should have update audit entries');
    assert(deletes.length >= 1, 'should have delete audit entries');
    // Check update detail has before/after
    const updateDetail = updates[0].detail;
    assert(updateDetail.includes('→'), `update detail should show before→after, got: ${updateDetail}`);
  });
});
