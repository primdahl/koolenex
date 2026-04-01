'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const path = require('path');
const fs = require('fs');

const SMOKE_PROJECT = path.join(__dirname, 'smoke-test.knxproj');

let server, baseUrl, db;

async function req(method, urlPath, body, isFormData = false) {
  const url = baseUrl + urlPath;
  const opts = { method, headers: {} };
  if (body && !isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isFormData) {
    opts.body = body;
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

before(async () => {
  if (!fs.existsSync(SMOKE_PROJECT)) return;
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

describe('Smoke: parseKnxproj', () => {
  if (!fs.existsSync(SMOKE_PROJECT)) {
    it('skipped — tests/smoke-test.knxproj not found', () => {});
    return;
  }

  const { parseKnxproj } = require('../server/ets-parser');
  let result;

  it('parses without throwing', () => {
    const buf = fs.readFileSync(SMOKE_PROJECT);
    result = parseKnxproj(buf);
    assert(result, 'should return a result');
  });

  it('returns all expected top-level fields', () => {
    assert(typeof result.projectName === 'string');
    assert(Array.isArray(result.devices));
    assert(Array.isArray(result.groupAddresses));
    assert(Array.isArray(result.comObjects));
    assert(Array.isArray(result.spaces));
    assert(Array.isArray(result.topologyEntries));
    assert(Array.isArray(result.catalogSections));
    assert(Array.isArray(result.catalogItems));
    assert(typeof result.devSpaceMap === 'object');
    assert(typeof result.paramModels === 'object');
    assert(typeof result.projectInfo === 'object');
  });

  it('extracts at least one device', () => {
    assert(result.devices.length > 0, `expected devices, got ${result.devices.length}`);
  });

  it('devices have required fields', () => {
    for (const d of result.devices) {
      assert(d.individual_address, 'device missing individual_address');
      assert(d.name, 'device missing name');
      assert(typeof d.area === 'number', 'device missing area');
      assert(typeof d.line === 'number', 'device missing line');
    }
  });

  it('extracts group addresses', () => {
    assert(result.groupAddresses.length > 0, `expected GAs, got ${result.groupAddresses.length}`);
    for (const g of result.groupAddresses) {
      assert(g.address, 'GA missing address');
      assert(g.name, 'GA missing name');
    }
  });

  it('extracts topology entries with areas and lines', () => {
    assert(result.topologyEntries.length > 0, `expected topology entries, got ${result.topologyEntries.length}`);
    const areas = result.topologyEntries.filter(t => t.line === null);
    const lines = result.topologyEntries.filter(t => t.line !== null);
    assert(areas.length > 0, 'expected at least one area');
    assert(lines.length > 0, 'expected at least one line');
  });

  it('extracts spaces', () => {
    assert(result.spaces.length > 0, `expected spaces, got ${result.spaces.length}`);
  });

  it('extracts catalog data', () => {
    // Catalog may be empty for minimal projects but should be arrays
    assert(Array.isArray(result.catalogSections));
    assert(Array.isArray(result.catalogItems));
  });
});

describe('Smoke: API import', () => {
  if (!fs.existsSync(SMOKE_PROJECT)) {
    it('skipped — tests/smoke-test.knxproj not found', () => {});
    return;
  }

  let pid;

  it('imports via POST /projects/import', async () => {
    const buf = fs.readFileSync(SMOKE_PROJECT);
    const form = new FormData();
    form.append('file', new Blob([buf]), 'smoke-test.knxproj');
    const { status, data } = await req('POST', '/projects/import', form, true);
    assert.equal(status, 200, `import failed: ${JSON.stringify(data)}`);
    assert(data.projectId, 'should return projectId');
    assert(data.summary.devices > 0, 'should have devices');
    pid = data.projectId;
  });

  it('project is fully loadable via GET /projects/:id', async () => {
    const { status, data } = await req('GET', `/projects/${pid}`);
    assert.equal(status, 200);
    assert(data.devices.length > 0, 'should have devices');
    assert(data.gas.length > 0, 'should have GAs');
    assert(data.spaces.length > 0, 'should have spaces');
    assert(data.topology.length > 0, 'should have topology');
  });

  it('topology table is populated', () => {
    const rows = db.all('SELECT * FROM topology WHERE project_id=?', [pid]);
    assert(rows.length > 0, 'should have topology rows');
    const areas = rows.filter(r => r.line === null);
    const lines = rows.filter(r => r.line !== null);
    assert(areas.length > 0, 'should have area rows');
    assert(lines.length > 0, 'should have line rows');
  });

  it('catalog table is populated', () => {
    const sections = db.all('SELECT * FROM catalog_sections WHERE project_id=?', [pid]);
    const items = db.all('SELECT * FROM catalog_items WHERE project_id=?', [pid]);
    assert(sections.length > 0, 'should have catalog sections');
    assert(items.length > 0, 'should have catalog items');
  });

  it('audit log has an import entry', () => {
    const rows = db.all("SELECT * FROM audit_log WHERE project_id=? AND action='import'", [pid]);
    assert(rows.length >= 1, 'should have import audit entry');
  });

  it('reimport succeeds', async () => {
    const buf = fs.readFileSync(SMOKE_PROJECT);
    const form = new FormData();
    form.append('file', new Blob([buf]), 'smoke-test.knxproj');
    const { status, data } = await req('POST', `/projects/${pid}/reimport`, form, true);
    assert.equal(status, 200, `reimport failed: ${JSON.stringify(data)}`);
    assert(data.summary.devices > 0);
  });

  it('cleanup — delete project', async () => {
    await req('DELETE', `/projects/${pid}`);
    assert.equal(db.get('SELECT * FROM projects WHERE id=?', [pid]), null);
  });
});
