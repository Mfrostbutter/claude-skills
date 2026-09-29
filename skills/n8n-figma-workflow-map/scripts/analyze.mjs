#!/usr/bin/env node
// Reviews n8n workflow JSON and drafts a workflow-map spec for render.mjs.
// Usage: node analyze.mjs <file|dir>... [--title T] [--hide REGEX] [--theme dark|light] [--dashed REGEX] [--out spec.json]
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HUES = ['green', 'blue', 'periwinkle', 'orange', 'violet', 'teal'];
const MAX_STAGE_NODES = 6;
const LANE_NODES = 4;
const SUB_MAX = 80;

const short = (type) => (type || '').split('.').pop();
const isSticky = (n) => short(n.type) === 'stickyNote';
export const shortName = (s) => (s || '').replace(/^[^:]+:\s*/, '');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Loads workflows from files or directories. Accepts a workflow, an array, or {data:[...]}. */
export function loadWorkflows(paths) {
  const out = [];
  const add = (obj, src) => {
    const list = Array.isArray(obj) ? obj : Array.isArray(obj?.data) ? obj.data : [obj];
    for (const w of list) if (w && Array.isArray(w.nodes)) out.push({ ...w, __src: src });
  };
  const walk = (p) => {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).sort()) if (extname(f) === '.json') walk(join(p, f));
      return;
    }
    add(JSON.parse(readFileSync(p, 'utf8')), p);
  };
  for (const p of paths) walk(p);
  return out;
}

/** Human-readable schedule for a scheduleTrigger rule. */
export function describeSchedule(params) {
  const items = params?.rule?.interval ?? [];
  const parts = items.map((it) => {
    const f = it.field ?? 'days';
    if (f === 'cronExpression') return `cron ${it.expression}`;
    if (f === 'seconds') return `every ${it.secondsInterval ?? 30} s`;
    if (f === 'minutes') return `every ${it.minutesInterval ?? 5} min`;
    if (f === 'hours') return `every ${it.hoursInterval ?? 1} h`;
    const at = it.triggerAtHour != null ? ` at ${String(it.triggerAtHour).padStart(2, '0')}:${String(it.triggerAtMinute ?? 0).padStart(2, '0')}` : '';
    if (f === 'days') return `every ${it.daysInterval ?? 1} day${at}`;
    if (f === 'weeks') return `weekly${at}`;
    if (f === 'months') return `monthly${at}`;
    return f;
  });
  return parts.join(', ') || 'schedule';
}

/** Trigger kind + label, or null when the node is not a trigger. */
export function describeTrigger(n) {
  const t = short(n.type);
  const p = n.parameters ?? {};
  if (t === 'scheduleTrigger' || t === 'cron') return { kind: 'schedule', label: describeSchedule(p) };
  if (t === 'webhook') return { kind: 'webhook', label: `${p.httpMethod ?? 'GET'} /webhook/${p.path ?? ''}` };
  if (t === 'manualTrigger') return { kind: 'manual', label: 'manual' };
  if (t === 'executeWorkflowTrigger') return { kind: 'sub', label: 'called as a sub-workflow' };
  if (t === 'errorTrigger') return { kind: 'error', label: 'error workflow' };
  if (t === 'formTrigger') return { kind: 'form', label: 'form submission' };
  if (t === 'chatTrigger') return { kind: 'chat', label: 'chat message' };
  if (/Trigger$/.test(t)) return { kind: 'event', label: t.replace(/Trigger$/, '') + ' event' };
  return null;
}

/** Target workflow id or name of an Execute Workflow node. */
export function subTarget(n) {
  const w = n.parameters?.workflowId;
  if (w == null) return null;
  if (typeof w === 'string') return { id: w.replace(/^=/, ''), name: null };
  return { id: w.value ?? null, name: w.cachedResultName ?? w.__workflowName ?? null };
}

const TABLE = String.raw`([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)?)`;
const WRITE_RE = new RegExp(String.raw`\b(?:insert\s+into|update|delete\s+from|merge\s+into|truncate(?:\s+table)?)\s+` + TABLE, 'gi');
const READ_RE = new RegExp(String.raw`\b(?:from|join)\s+` + TABLE, 'gi');
const NOT_TABLES = new Set(['select', 'lateral', 'unnest', 'set', 'only', 'values', 'excluded']);
const CTE_RE = /(?:\b(?:with)(?:\s+recursive)?|,)\s*([a-zA-Z_]\w*)\s+as\s*(?:not\s+)?(?:materialized\s*)?\(/gi;

/** Tables a SQL node reads and writes. */
export function sqlTables(n) {
  const p = n.parameters ?? {};
  const reads = new Set(), writes = new Set();
  const q = typeof p.query === 'string' ? p.query.replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''") : '';
  const ctes = new Set([...q.matchAll(CTE_RE)].map((m) => m[1].toLowerCase()));
  const real = (t) => !NOT_TABLES.has(t) && !ctes.has(t) && !/^\$|^\d/.test(t);
  for (const m of q.matchAll(WRITE_RE)) { const t = m[1].toLowerCase(); if (real(t)) writes.add(t); }
  for (const m of q.matchAll(READ_RE)) {
    const t = m[1].toLowerCase();
    const isCall = /^\s*\(/.test(q.slice(m.index + m[0].length));
    if (real(t) && !isCall && !writes.has(t)) reads.add(t);
  }
  const tbl = typeof p.table === 'string' ? p.table : p.table?.value;
  if (tbl && !q) {
    const schema = typeof p.schema === 'string' ? p.schema : p.schema?.value;
    const name = (schema && schema !== 'public' ? `${schema}.` : '') + tbl;
    (/insert|update|upsert|delete/i.test(p.operation ?? '') ? writes : reads).add(name.toLowerCase());
  }
  return { reads: [...reads], writes: [...writes] };
}

const SQL_TYPES = new Set(['postgres', 'mySql', 'microsoftSql', 'snowflake', 'questDb', 'crateDb', 'timescaleDb']);

/** One-line descriptor shown under a node title. */
export function describeNode(n, byId) {
  const t = short(n.type);
  const p = n.parameters ?? {};
  const trig = describeTrigger(n);
  if (trig) return trig.label;
  if (t === 'executeWorkflow') {
    const tg = subTarget(n);
    const name = shortName((tg && (byId.get(tg.id)?.name ?? tg.name)) || '');
    return name && name !== n.name ? `sub-workflow: ${name}` : 'sub-workflow';
  }
  if (SQL_TYPES.has(t)) {
    const { reads, writes } = sqlTables(n);
    if (writes.length) return `writes ${writes.map((x) => x.split('.').pop()).join(', ')}`;
    if (reads.length) return `reads ${reads.map((x) => x.split('.').pop()).join(', ')}`;
    return `${t} ${p.operation ?? 'query'}`;
  }
  if (t === 'httpRequest') {
    const url = typeof p.url === 'string' ? p.url : '';
    const host = url.match(/^https?:\/\/([^/{}\s]+)/)?.[1];
    return host ? `${p.method ?? 'GET'} ${host}` : 'HTTP request';
  }
  if (t === 'code') return `code (${p.language === 'python' || p.language === 'pythonNative' ? 'Python' : 'JS'})`;
  if (t === 'if' || t === 'switch') return 'branch';
  if (t === 'merge') return 'merge';
  if (t === 'set') return 'set fields';
  if (/^agent$|lmChat|chainLlm/.test(t)) return 'AI step';
  const op = p.operation ?? p.resource;
  return op ? `${t} · ${op}` : t;
}

/** Nodes in execution order: BFS from triggers over main connections, ties by canvas position. */
export function executionOrder(wf, hide) {
  const nodes = wf.nodes.filter((n) => !isSticky(n));
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const depth = new Map();
  const queue = nodes.filter((n) => describeTrigger(n)).map((n) => [n.name, 0]);
  if (!queue.length && nodes.length) queue.push([nodes[0].name, 0]);
  while (queue.length) {
    const [name, d] = queue.shift();
    if (depth.has(name) && depth.get(name) <= d) continue;
    depth.set(name, d);
    for (const outs of wf.connections?.[name]?.main ?? []) {
      for (const c of outs ?? []) if (byName.has(c.node)) queue.push([c.node, d + 1]);
    }
  }
  const pos = (n) => n.position ?? [0, 0];
  return nodes
    .filter((n) => depth.has(n.name))
    .filter((n) => !(hide && hide.test(n.name)))
    .sort((a, b) => depth.get(a.name) - depth.get(b.name) || pos(a)[1] - pos(b)[1] || pos(a)[0] - pos(b)[0]);
}

/** Sticky zones that contain at least one node, in reading order. */
export function stickyZones(wf) {
  const nodes = wf.nodes.filter((n) => !isSticky(n));
  const zones = [];
  for (const s of wf.nodes.filter(isSticky)) {
    const content = s.parameters?.content ?? '';
    const title = content.match(/^\s*#{1,3}\s+(.+)$/m)?.[1]?.trim();
    if (!title) continue;
    const [x, y] = s.position ?? [0, 0];
    const w = s.parameters?.width ?? 240, h = s.parameters?.height ?? 160;
    const inside = nodes.filter((n) => {
      const [nx, ny] = n.position ?? [0, 0];
      return nx >= x && nx <= x + w && ny >= y && ny <= y + h;
    });
    if (!inside.length) continue;
    const body = content.replace(/^\s*#{1,3}\s+.+$/m, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
    zones.push({ title, x, y, body, members: new Set(inside.map((n) => n.name)) });
  }
  return zones.sort((a, b) => a.y - b.y || a.x - b.x);
}

function firstSentences(text, max = 260) {
  const s = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = '';
  for (const x of s) { if ((out + x).length > max) break; out += x; }
  return (out || clip(text, max)).trim();
}

const toNode = (n, byId) => ({
  title: clip(n.name, 34),
  sub: clip(describeNode(n, byId), SUB_MAX),
  badge: short(n.type) === 'executeWorkflow',
});

/** Map nodes for a run of workflow nodes; alternative triggers collapse into one node. */
function toNodes(list, byId) {
  const trig = list.filter((n) => describeTrigger(n));
  if (trig.length < 2) return list.map((n) => toNode(n, byId));
  const merged = {
    title: clip(trig.map((n) => n.name).join(' or '), 34),
    sub: clip(trig.map((n) => describeTrigger(n).label).join(', or '), SUB_MAX),
    badge: false,
  };
  return [merged, ...list.filter((n) => !describeTrigger(n)).map((n) => toNode(n, byId))];
}

/** Builds the map spec plus a review of every workflow. */
export function analyze(workflows, opts = {}) {
  const hide = opts.hide ? new RegExp(opts.hide, 'i') : null;
  const optIn = opts.dashed ? new RegExp(opts.dashed, 'i') : null;
  const isOff = (i) => i.active === false || (optIn ? optIn.test(i.name) : false);
  const byId = new Map(workflows.filter((w) => w.id).map((w) => [w.id, w]));
  const byName = new Map(workflows.map((w) => [w.name, w]));
  const warnings = [];

  const info = workflows.map((w) => {
    const nodes = w.nodes.filter((n) => !isSticky(n));
    const triggers = nodes.map(describeTrigger).filter(Boolean);
    const calls = nodes.filter((n) => short(n.type) === 'executeWorkflow').map((n) => {
      const tg = subTarget(n);
      const target = (tg && (byId.get(tg.id) ?? byName.get(tg.name))) ?? null;
      if (!target) warnings.push(`${w.name}: "${n.name}" calls a workflow not in the input set (${tg?.id ?? '?'})`);
      return target?.name ?? tg?.name ?? tg?.id ?? '?';
    });
    const reads = new Set(), writes = new Set();
    for (const n of nodes) if (SQL_TYPES.has(short(n.type))) {
      const t = sqlTables(n); t.reads.forEach((x) => reads.add(x)); t.writes.forEach((x) => writes.add(x));
    }
    const disabled = nodes.filter((n) => n.disabled).map((n) => n.name);
    if (disabled.length) warnings.push(`${w.name}: disabled nodes: ${disabled.join(', ')}`);
    return { w, name: w.name, id: w.id ?? null, active: w.active ?? null, nodeCount: nodes.length, triggers, calls, reads: [...reads], writes: [...writes], disabled };
  });

  const calledNames = new Set(info.flatMap((i) => i.calls));
  for (const i of info) {
    const external = i.triggers.filter((t) => t.kind !== 'sub');
    i.role = calledNames.has(i.name) && !external.length ? 'sub-workflow'
      : i.calls.length && external.length ? 'orchestrator'
      : 'standalone';
  }

  const rows = [];
  let hue = 0;
  for (const o of info.filter((i) => i.role === 'orchestrator').sort((a, b) => b.calls.length - a.calls.length)) {
    const order = executionOrder(o.w, hide);
    const zones = stickyZones(o.w);
    let stages;
    if (zones.length) {
      stages = zones.map((z) => ({
        label: z.title.toUpperCase(),
        nodes: toNodes(order.filter((n) => z.members.has(n.name)), byId),
        note: z.body ? `TODO rewrite as the why: ${firstSentences(z.body)}` : 'TODO: the design decision this stage makes, and the failure it prevents.',
      })).filter((s) => s.nodes.length);
      const zoned = new Set(zones.flatMap((z) => [...z.members]));
      const loose = order.filter((n) => !zoned.has(n.name));
      if (loose.length) warnings.push(`${o.name}: ${loose.length} node(s) outside every sticky zone: ${loose.map((n) => n.name).join(', ')}`);
    } else {
      warnings.push(`${o.name}: no sticky zones, stages cut by execution order; rename them`);
      stages = [];
      for (let k = 0; k < order.length; k += 5) {
        const chunk = order.slice(k, k + 5);
        stages.push({ label: k === 0 ? 'TRIGGER' : `STEP ${stages.length + 1}`, nodes: toNodes(chunk, byId), note: 'TODO: the design decision this stage makes, and the failure it prevents.' });
      }
    }
    stages.forEach((s, k) => {
      s.label = `${k + 1} · ${s.label}`;
      s.hue = HUES[(hue++) % HUES.length];
      if (s.nodes.length > MAX_STAGE_NODES) warnings.push(`${o.name}: stage "${s.label}" has ${s.nodes.length} nodes; hide glue nodes with --hide or split the zone`);
    });
    const trig = o.triggers.filter((t) => t.kind !== 'sub').map((t) => t.label).join(', or ');
    rows.push({ caption: `${shortName(o.name).toUpperCase()}  ·  ${trig}`, pill: o.name, chain: true, dashed: isOff(o), stages });
  }

  const lanes = info.filter((i) => i.role === 'standalone');
  if (lanes.length) {
    const start = rows.reduce((n, r) => n + r.stages.length, 0);
    rows.push({
      caption: rows.length ? 'ON THEIR OWN TRIGGERS' : 'WORKFLOWS',
      chain: false,
      stages: lanes.map((l, k) => ({
        label: `${start + k + 1} · ${shortName(l.name).toUpperCase()}`,
        pill: l.name,
        hue: isOff(l) ? 'slate' : HUES[(hue++) % HUES.length],
        dashed: isOff(l),
        nodes: toNodes(executionOrder(l.w, hide), byId).slice(0, LANE_NODES),
        note: 'TODO: why this runs on its own trigger, and what it protects.',
      })),
    });
  }

  const tables = new Map();
  for (const i of info) {
    for (const t of i.writes) (tables.get(t) ?? tables.set(t, { w: new Set(), r: new Set() }).get(t)).w.add(i.name);
    for (const t of i.reads) (tables.get(t) ?? tables.set(t, { w: new Set(), r: new Set() }).get(t)).r.add(i.name);
  }
  const bySchema = new Map();
  for (const [t, v] of [...tables].sort()) {
    const schema = t.includes('.') ? t.split('.')[0] : 'public';
    (bySchema.get(schema) ?? bySchema.set(schema, []).get(schema)).push({ t: t.split('.').pop(), ...v });
  }
  const cards = [];
  for (const [schema, list] of bySchema) {
    for (let k = 0; k < list.length; k += 10) {
      const part = list.slice(k, k + 10);
      const writers = [...new Set(part.flatMap((x) => [...x.w]))].map(shortName);
      cards.push({
        title: list.length > 10 ? `${schema} · ${k / 10 + 1}` : schema,
        rows: part.map((x) => x.t),
        caption: writers.length
          ? `← written by ${writers.slice(0, 3).join(', ')}${writers.length > 3 ? ` +${writers.length - 3} more` : ''}`
          : '→ read only',
      });
    }
  }

  const count = (r) => info.filter((i) => i.role === r).length;
  return {
    title: opts.title ?? 'Workflow map',
    subtitle: [
      plural(info.length, 'n8n workflow'),
      plural(count('orchestrator'), 'orchestrator'),
      plural(count('sub-workflow'), 'sub-workflow'),
      `${count('standalone')} standalone`,
    ].join('  ·  '),
    principle: 'TODO: one sentence on the architecture decision that shapes the whole map.',
    theme: opts.theme ?? 'dark',
    page: 'Workflow map',
    rows,
    data: cards.length ? { caption: `SQL  ·  ${tables.size} tables touched`, cards } : null,
    review: {
      workflows: info.map(({ w, ...i }) => i),
      warnings,
    },
  };
}

function main(argv) {
  const opts = {}, paths = [];
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (a === '--title') opts.title = argv[++k];
    else if (a === '--hide') opts.hide = argv[++k];
    else if (a === '--theme') opts.theme = argv[++k];
    else if (a === '--out') opts.out = argv[++k];
    else if (a === '--dashed') opts.dashed = argv[++k];
    else paths.push(a);
  }
  if (!paths.length) {
    console.error('usage: analyze.mjs <file|dir>... [--title T] [--hide REGEX] [--theme dark|light] [--dashed REGEX] [--out spec.json]');
    process.exit(2);
  }
  const spec = analyze(loadWorkflows(paths), opts);
  const json = JSON.stringify(spec, null, 2) + '\n';
  if (opts.out) writeFileSync(opts.out, json); else process.stdout.write(json);
  for (const w of spec.review.warnings) console.error(`warn: ${w}`);
  console.error(`${spec.review.workflows.length} workflows, ${spec.rows.reduce((n, r) => n + r.stages.length, 0)} stages, ${spec.data?.cards.length ?? 0} data cards`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
