// Tests for the skill scripts. Node's built-in runner, no dependencies.
// Run from the skill folder: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = join(ROOT, 'scripts');
const FIXTURES = join(ROOT, 'tests', 'fixtures');

const A = await import(pathToFileURL(join(SCRIPTS, 'analyze.mjs')).href);
const R = await import(pathToFileURL(join(SCRIPTS, 'render.mjs')).href);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

let tmp;
test.before(() => { tmp = mkdtempSync(join(tmpdir(), 'wfmap-test-')); });
test.after(() => { rmSync(tmp, { recursive: true, force: true }); });

const spec = () => A.analyze(A.loadWorkflows([FIXTURES]), { title: 'Orders' });
const pg = (query) => ({ type: 'n8n-nodes-base.postgres', parameters: { operation: 'executeQuery', query } });

test('describeSchedule: cron, interval, and time of day', () => {
  assert.equal(A.describeSchedule({ rule: { interval: [{ field: 'cronExpression', expression: '0 6 * * 1-5' }] } }), 'cron 0 6 * * 1-5');
  assert.equal(A.describeSchedule({ rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }), 'every 5 min');
  assert.equal(A.describeSchedule({ rule: { interval: [{ field: 'days', triggerAtHour: 6, triggerAtMinute: 5 }] } }), 'every 1 day at 06:05');
  assert.equal(A.describeSchedule({}), 'schedule');
});

test('subTarget: string id and resource-locator object', () => {
  assert.deepEqual(A.subTarget({ parameters: { workflowId: '=abc' } }), { id: 'abc', name: null });
  assert.deepEqual(A.subTarget({ parameters: { workflowId: { __rl: true, value: 'x1', cachedResultName: 'Sub' } } }), { id: 'x1', name: 'Sub' });
  assert.equal(A.subTarget({ parameters: {} }), null);
});

test('sqlTables: writes with a column list, reads through joins', () => {
  const t = A.sqlTables(pg('INSERT INTO s.facts (a, b) SELECT a, b FROM s.raw r JOIN s.dim d ON d.id = r.id'));
  assert.deepEqual(t.writes, ['s.facts']);
  assert.deepEqual(t.reads.sort(), ['s.dim', 's.raw']);
});

test('sqlTables: ignores CTE names, function calls, comments, and string literals', () => {
  const t = A.sqlTables(pg("-- from ghost\nWITH recent AS (SELECT * FROM s.orders WHERE note <> 'from fake') SELECT * FROM recent, generate_series(1, 3)"));
  assert.deepEqual(t.reads, ['s.orders']);
  assert.deepEqual(t.writes, []);
});

test('sqlTables: upsert does not treat SET or EXCLUDED as tables', () => {
  const t = A.sqlTables(pg('INSERT INTO s.f (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = excluded.v'));
  assert.deepEqual(t, { reads: [], writes: ['s.f'] });
});

test('sqlTables: table-mode node reads or writes by operation', () => {
  const node = (operation) => ({ type: 'n8n-nodes-base.postgres', parameters: { operation, schema: { value: 's' }, table: { value: 't' } } });
  assert.deepEqual(A.sqlTables(node('select')), { reads: ['s.t'], writes: [] });
  assert.deepEqual(A.sqlTables(node('upsert')), { reads: [], writes: ['s.t'] });
});

test('analyze: assigns orchestrator, sub-workflow, and standalone roles', () => {
  const roles = Object.fromEntries(spec().review.workflows.map((w) => [w.name, w.role]));
  assert.deepEqual(roles, {
    'orders: Nightly Sync': 'orchestrator',
    'orders: Enrich': 'sub-workflow',
    'orders: Health Check': 'standalone',
    'orders: Weekly Digest': 'standalone',
  });
});

test('analyze: orchestrator row takes stages from sticky zones in canvas order', () => {
  const [row] = spec().rows;
  assert.equal(row.chain, true);
  assert.equal(row.pill, 'orders: Nightly Sync');
  assert.deepEqual(row.stages.map((s) => s.label), ['1 · INTAKE', '2 · ENRICH', '3 · STORE']);
  assert.deepEqual(row.stages.map((s) => s.hue), ['green', 'blue', 'periwinkle']);
  assert.match(row.stages[0].note, /^TODO rewrite as the why: Two entry points share one path\./);
});

test('analyze: alternative triggers merge into one node', () => {
  const intake = spec().rows[0].stages[0].nodes;
  assert.equal(intake.length, 2);
  assert.equal(intake[0].title, 'Nightly or Rerun webhook');
  assert.equal(intake[0].sub, 'cron 0 2 * * *, or POST /webhook/orders/rerun');
  assert.equal(intake[1].sub, 'reads orders, customers');
});

test('analyze: sub-workflow calls are badged', () => {
  const enrich = spec().rows[0].stages[1].nodes;
  assert.deepEqual(enrich.map((n) => n.badge), [true, true]);
  assert.equal(enrich[0].sub, 'sub-workflow: Enrich');
});

test('analyze: standalone workflows become lanes; inactive ones are dashed slate', () => {
  const lanes = spec().rows[1];
  assert.equal(lanes.chain, false);
  assert.equal(lanes.caption, 'ON THEIR OWN TRIGGERS');
  const health = lanes.stages.find((s) => s.pill === 'orders: Health Check');
  const digest = lanes.stages.find((s) => s.pill === 'orders: Weekly Digest');
  assert.equal(health.dashed, true);
  assert.equal(health.hue, 'slate');
  assert.equal(digest.dashed, false);
  assert.notEqual(digest.hue, 'slate');
  assert.equal(health.label, '4 · HEALTH CHECK');
});

test('analyze: --dashed marks active workflows as opt-in', () => {
  const s = A.analyze(A.loadWorkflows([FIXTURES]), { dashed: 'Digest' });
  assert.equal(s.rows[1].stages.find((x) => x.pill === 'orders: Weekly Digest').dashed, true);
});

test('analyze: --hide drops nodes by name', () => {
  const s = A.analyze(A.loadWorkflows([FIXTURES]), { hide: '^Legacy' });
  assert.deepEqual(s.rows[0].stages[1].nodes.map((n) => n.title), ['Enrich orders']);
});

test('analyze: data band groups tables by schema and names the writers', () => {
  const { data } = spec();
  assert.equal(data.caption, 'SQL  ·  3 tables touched');
  assert.equal(data.cards.length, 1);
  assert.equal(data.cards[0].title, 'sales');
  assert.deepEqual(data.cards[0].rows, ['customers', 'order_facts', 'orders']);
  assert.equal(data.cards[0].caption, '← written by Nightly Sync');
});

test('analyze: subtitle counts roles with plurals', () => {
  assert.equal(spec().subtitle, '4 n8n workflows  ·  1 orchestrator  ·  1 sub-workflow  ·  2 standalone');
});

test('analyze: warns on missing call targets and disabled nodes', () => {
  const w = spec().review.warnings.join('\n');
  assert.match(w, /"Legacy export" calls a workflow not in the input set \(wf-gone\)/);
  assert.match(w, /Health Check: disabled nodes: Evaluate/);
});

test('analyze: no sticky zones cuts stages from execution order and warns', () => {
  const wf = JSON.parse(readFileSync(join(FIXTURES, 'orchestrator.json'), 'utf8'));
  wf.nodes = wf.nodes.filter((n) => !n.type.endsWith('stickyNote'));
  const s = A.analyze([wf, ...A.loadWorkflows([join(FIXTURES, 'subworkflow.json')])]);
  assert.equal(s.rows[0].stages[0].label, '1 · TRIGGER');
  assert.match(s.review.warnings.join('\n'), /no sticky zones/);
});

test('render: chunks come in call order and each is a valid use_figma body', () => {
  const chunks = R.render(spec());
  assert.deepEqual(chunks.map((c) => c.name), ['00-setup', '01-row', '02-row', '03-data', '04-legend']);
  for (const c of chunks) {
    assert.ok(c.code.length < R.MAX_CHUNK, `${c.name} over the limit`);
    assert.doesNotThrow(() => new AsyncFunction('figma', c.code), `${c.name} does not parse`);
    assert.match(c.code, /setCurrentPageAsync/);
  }
});

test('render: theme picks the palette and logo', () => {
  const light = R.render({ ...spec(), theme: 'light' })[0].code;
  assert.match(light, /"bg":"#FAFAFA"/);
  assert.doesNotMatch(R.render(spec())[0].code, /"bg":"#FAFAFA"/);
});

test('render: frame width follows the widest row', () => {
  assert.equal(R.frameWidth({ rows: [{ chain: true, stages: [1, 2] }] }), 1600);
  assert.equal(R.frameWidth({ rows: [{ chain: true, stages: [1, 2, 3, 4, 5] }] }), 2540);
  assert.equal(R.frameWidth({ rows: [{ chain: false, stages: Array(9).fill(1) }] }), 2540);
});

test('render: a dashed orchestrator row dashes its stages', () => {
  const s = spec();
  s.rows[0].dashed = true;
  assert.match(R.render(s)[1].code, /row\.dashed\?\{\.\.\.st,dashed:true\}:st/);
  assert.match(R.render(s)[1].code, /"dashed":true/);
});

test('lint: flags TODO text, unknown hues, oversized and empty stages', () => {
  const s = spec();
  assert.ok(R.lint(s).some((x) => /principle still has TODO/.test(x)));
  s.principle = 'One orchestrator.';
  for (const r of s.rows) for (const st of r.stages) st.note = 'Why.';
  assert.deepEqual(R.lint(s), []);
  s.rows[0].stages[0].hue = 'pink';
  s.rows[0].stages[1].nodes = Array(7).fill({ title: 'x' });
  s.rows[0].stages[2].nodes = [];
  const out = R.lint(s).join('\n');
  assert.match(out, /unknown hue "pink"/);
  assert.match(out, /7 nodes, keep a stage to 6/);
  assert.match(out, /no nodes/);
});

test('CLI: analyze writes a spec and render writes the chunk files', () => {
  const specFile = join(tmp, 'spec.json');
  execFileSync(process.execPath, [join(SCRIPTS, 'analyze.mjs'), FIXTURES, '--title', 'Orders', '--out', specFile], { stdio: 'pipe' });
  const s = JSON.parse(readFileSync(specFile, 'utf8'));
  assert.equal(s.title, 'Orders');
  s.page = 'Test page';
  writeFileSync(specFile, JSON.stringify(s));
  const out = join(tmp, 'chunks');
  execFileSync(process.execPath, [join(SCRIPTS, 'render.mjs'), specFile, '--out', out], { stdio: 'pipe' });
  assert.deepEqual(readdirSync(out).sort(), ['00-setup.js', '01-row.js', '02-row.js', '03-data.js', '04-legend.js']);
  assert.match(readFileSync(join(out, '00-setup.js'), 'utf8'), /const PAGE_NAME="Test page"/);
});
