// Testes dos bots:  node --test .github/scripts/bots.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, closingRefs, linkedRefs } = require('./pr-check.cjs');

const B = { dev: 'DEV', qua: 'QUA', prod: 'PRD' };
const base = { head: 'feature/23-login-com-jwt', base: 'DEV', body: 'Closes #23', ownRepo: 'creative-mode/creative-bot', branches: B };

test('PR conforme', () => assert.deepEqual(evaluate(base), []));
test('Refs associa a issue sem a classificar como encerrada', () => {
  assert.deepEqual(evaluate({ ...base, body: 'Refs #23' }), []);
  assert.deepEqual(closingRefs('Refs #23', 'creative-mode/creative-bot'), []);
  assert.deepEqual(linkedRefs('Refs #23', 'creative-mode/creative-bot'), [23]);
});
test('branch fora do padrão', () => assert.equal(evaluate({ ...base, head: 'feat/Auth Register' }).length, 1));
test('branch sem número de issue é aceite', () => assert.deepEqual(evaluate({ ...base, head: 'feat/auth-register', body: '' }), []));
test('branch sem número aceita qualquer issue associada', () => assert.deepEqual(evaluate({ ...base, head: 'feat/auth-register', body: 'Refs #99' }), []));
test('destino errado', () => assert.match(evaluate({ ...base, base: 'QUA' })[0], /apontam para `DEV`/));
test('sem referência: issue é opcional', () => assert.deepEqual(evaluate({ ...base, body: 'só texto' }), []));
test('Closes de outra issue', () => assert.match(evaluate({ ...base, body: 'Closes #99' })[0], /refere a issue #23/));
test('Refs de outra issue não satisfaz a associação da branch', () => assert.match(evaluate({ ...base, body: 'Refs #99' })[0], /branch refere a issue #23/));
test('Closes em comentário/código não conta', () => assert.deepEqual(linkedRefs('<!-- Closes #23 -->\n`Closes #23`', base.ownRepo), []));
test('Refs em comentário/código não conta', () => assert.deepEqual(linkedRefs('<!-- Refs #23 -->\n`Refs #23`', base.ownRepo), []));
test('várias issues e fixes', () => assert.deepEqual(evaluate({ ...base, body: 'Fixes #5, #23 e #7' }), []));
test('issue de outro repo é ignorada', () => assert.deepEqual(linkedRefs('Closes creative-mode/outro-repo#23', base.ownRepo), []));
test('promoções', () => {
  assert.deepEqual(evaluate({ ...base, head: 'DEV', base: 'QUA', body: '' }), []);
  assert.deepEqual(evaluate({ ...base, head: 'QUA', base: 'PRD', body: '' }), []);
  assert.equal(evaluate({ ...base, head: 'DEV', base: 'PRD', body: '' }).length, 1);
});
test('hotfix não escapa a prod; dependabot isento', () => {
  assert.match(evaluate({ ...base, head: 'hotfix/40-crash', base: 'PRD', body: 'Closes #40' })[0], /só aceita merges vindos de `QUA`/);
  assert.deepEqual(evaluate({ ...base, head: 'hotfix/40-crash', base: 'DEV', body: 'Closes #40' }), []);
  assert.deepEqual(evaluate({ ...base, head: 'dependabot/npm/x', body: '' }), []);
});
test('prod só aceita qua, nem branch normal escapa', () => {
  assert.match(evaluate({ ...base, base: 'PRD' })[0], /só aceita merges vindos de `QUA`/);
});
test('closingRefs', () => assert.deepEqual(closingRefs('Closes #1, #2', 'a/b'), [1, 2]));
test('linkedRefs aceita refs internas e ignora refs de outro repositório', () => {
  assert.deepEqual(linkedRefs('Refs #1, creative-mode/creative-bot#2, creative-mode/outro-repo#3', 'creative-mode/creative-bot'), [1, 2]);
});


// ---------- Promotor QUA → PRD ----------
const promote = require('./promote.cjs');

test('promote: números dos PRs nas mensagens', () => {
  assert.deepEqual(
    promote.parsePrNumbers(['Merge pull request #12 from x/y\n\nfoo', 'feat: algo (#15)', 'Merge pull request #12 again', 'sem número']),
    [12, 15],
  );
});

const gPr = { draft: false, mergeable: true, head: { sha: 'abcdef123456' }, user: { login: 'autor' } };
const okRuns = [
  { name: 'Typecheck', status: 'completed', conclusion: 'success', started_at: '2026-01-01T00:00:00Z' },
  { name: 'Tests', status: 'completed', conclusion: 'success', started_at: '2026-01-01T00:00:00Z' },
];
const approval = { user: { login: 'revisor', type: 'User' }, state: 'APPROVED', commit_id: 'abcdef123456' };
const gArgs = { pr: gPr, requiredChecks: ['Typecheck', 'Tests'], checkRuns: okRuns, reviews: [approval], permissions: { revisor: 'write' } };

test('promote: gate cumprido', () => assert.equal(promote.gate(gArgs).ok, true));
test('promote: sem aprovação passa por defeito', () => assert.equal(promote.gate({ ...gArgs, reviews: [] }).ok, true));
test('promote: sem aprovação bloqueia com minApprovals 1', () => assert.equal(promote.gate({ ...gArgs, reviews: [], minApprovals: 1 }).ok, false));
test('promote: aprovação antiga (outro commit) não conta', () =>
  assert.equal(promote.gate({ ...gArgs, reviews: [{ ...approval, commit_id: 'velho' }], minApprovals: 1 }).ok, false));
test('promote: autor não se auto-aprova', () =>
  assert.equal(promote.gate({ ...gArgs, reviews: [{ ...approval, user: { login: 'autor', type: 'User' } }], permissions: { autor: 'admin' }, minApprovals: 1 }).ok, false));
test('promote: aprovação sem escrita ou de bot não conta', () => {
  assert.equal(promote.gate({ ...gArgs, permissions: { revisor: 'read' }, minApprovals: 1 }).ok, false);
  assert.equal(promote.gate({ ...gArgs, reviews: [{ ...approval, user: { login: 'revisor', type: 'Bot' } }], minApprovals: 1 }).ok, false);
});
test('promote: alterações pedidas depois da aprovação bloqueiam', () =>
  assert.equal(promote.gate({ ...gArgs, reviews: [approval, { ...approval, state: 'CHANGES_REQUESTED' }] }).ok, false));
test('promote: check em falta, a correr ou falhado bloqueia', () => {
  assert.equal(promote.gate({ ...gArgs, checkRuns: okRuns.slice(0, 1) }).ok, false);
  assert.equal(promote.gate({ ...gArgs, checkRuns: [{ ...okRuns[0], status: 'in_progress', conclusion: null }, okRuns[1]] }).ok, false);
  assert.equal(promote.gate({ ...gArgs, checkRuns: [{ ...okRuns[0], conclusion: 'failure' }, okRuns[1]] }).ok, false);
});
test('promote: usa o check mais recente (re-run verde)', () =>
  assert.equal(promote.gate({ ...gArgs, checkRuns: [{ ...okRuns[0], conclusion: 'failure', started_at: '2025-12-31T00:00:00Z' }, ...okRuns] }).ok, true));
test('promote: rascunho e conflitos bloqueiam', () => {
  assert.equal(promote.gate({ ...gArgs, pr: { ...gPr, draft: true } }).ok, false);
  assert.equal(promote.gate({ ...gArgs, pr: { ...gPr, mergeable: false } }).ok, false);
  assert.equal(promote.gate({ ...gArgs, pr: { ...gPr, mergeable: null } }).ok, false);
});
test('promote: mergeBody preserva o texto fora dos marcadores', () => {
  const first = promote.mergeBody('', promote.buildBody({ commitCount: 1, changes: [], result: null }));
  const edited = `Nota do PM\n\n${first}\n\nRodapé`;
  const again = promote.mergeBody(edited, promote.buildBody({ commitCount: 2, changes: [], result: null }));
  assert.match(again, /^Nota do PM/);
  assert.match(again, /Rodapé$/);
  assert.match(again, /\(2 commits\)/);
  assert.equal(again.match(/promover:estado -->/g).length, 2);
});

// fluxo completo com GitHub simulado
function mockPromote({ ahead = 2, existing = [], reviews = [approval], runs = okRuns, mergeable = true, createFails = false, mergeFails = false } = {}) {
  const calls = [];
  const pr = { number: 50, draft: false, mergeable, title: promote.TITLE, body: '', head: { sha: 'abcdef123456' }, user: { login: 'autor' } };
  const rest = {
    repos: {
      compareCommitsWithBasehead: async () => ({ data: { ahead_by: ahead, commits: [{ commit: { message: 'Merge pull request #7 from a/b' } }] } }),
      getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }),
    },
    pulls: {
      list: async () => ({ data: existing }),
      get: async ({ pull_number }) => (pull_number === 50 ? { data: pr } : { data: { title: 'feat: algo', user: { login: 'autor2' } } }),
      create: async (a) => { calls.push(['create', a.head, a.base]); if (createFails) throw new Error('403'); return { data: pr }; },
      update: async () => { calls.push(['update']); return {}; },
      listReviews: 'reviews',
      merge: async (a) => { calls.push(['merge', a.sha, a.merge_method]); if (mergeFails) throw new Error('405'); return {}; },
    },
    checks: { listForRef: 'runs' },
    actions: { createWorkflowDispatch: async (a) => { calls.push(['dispatch', a.workflow_id, a.ref]); return {}; } },
  };
  const github = { rest, paginate: async (fn) => (fn === 'reviews' ? reviews : runs) };
  return { github, calls };
}
const pctx = { repo: { owner: 'creative-mode', repo: 'creative-bot' } };
const pcore = { info() {}, warning() {}, setFailed(m) { throw new Error(m); } };
function setPromoteEnv(extra = {}) {
  delete process.env.PROMOTE_TOKEN_SET;
  Object.assign(process.env, { QUA_BRANCH: 'QUA', PROD_BRANCH: 'PRD', REQUIRED_CHECKS: 'Typecheck,Tests', PUBLISH_WORKFLOW: 'publish.yml', RETRY_SLEEP_MS: '0', MERGE: 'true', MIN_APPROVALS: '0' }, extra);
}

test('promote: nada em QUA → não faz nada', async () => {
  setPromoteEnv();
  const { github, calls } = mockPromote({ ahead: 0 });
  await promote({ github, context: pctx, core: pcore });
  assert.deepEqual(calls, []);
});
test('promote: com MIN_APPROVALS=1, cria o PR e, sem aprovação, não faz merge', async () => {
  setPromoteEnv({ MIN_APPROVALS: '1' });
  const { github, calls } = mockPromote({ reviews: [] });
  await promote({ github, context: pctx, core: pcore });
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'update']);
});
test('promote: por defeito, sem aprovação, faz merge com checks verdes', async () => {
  setPromoteEnv();
  const { github, calls } = mockPromote({ reviews: [] });
  await promote({ github, context: pctx, core: pcore });
  assert.deepEqual(calls.map((c) => c[0]).filter((x) => x !== 'update'), ['create', 'merge', 'dispatch']);
});
test('promote: gate cumprido → merge com sha e dispara o publish', async () => {
  setPromoteEnv();
  const { github, calls } = mockPromote({ existing: [{ number: 50 }] });
  await promote({ github, context: pctx, core: pcore });
  assert.deepEqual(calls.filter((c) => c[0] !== 'update'), [['merge', 'abcdef123456', 'merge'], ['dispatch', 'publish.yml', 'PRD']]);
});
test('promote: com PROMOTE_TOKEN não dispara o publish à mão', async () => {
  setPromoteEnv({ PROMOTE_TOKEN_SET: 'true' });
  const { github, calls } = mockPromote({ existing: [{ number: 50 }] });
  await promote({ github, context: pctx, core: pcore });
  assert.deepEqual(calls.map((c) => c[0]).filter((x) => x !== 'update'), ['merge']);
});
test('promote: MERGE=false só prepara', async () => {
  setPromoteEnv({ MERGE: 'false' });
  const { github, calls } = mockPromote({ existing: [{ number: 50 }] });
  await promote({ github, context: pctx, core: pcore });
  assert.equal(calls.some((c) => c[0] === 'merge'), false);
});
test('promote: merge falhado não dispara publish', async () => {
  setPromoteEnv();
  const { github, calls } = mockPromote({ existing: [{ number: 50 }], mergeFails: true });
  await promote({ github, context: pctx, core: pcore });
  assert.equal(calls.some((c) => c[0] === 'dispatch'), false);
});
test('promote: falha a criar o PR dá instrução clara', async () => {
  setPromoteEnv();
  const { github } = mockPromote({ createFails: true });
  await assert.rejects(promote({ github, context: pctx, core: pcore }), /PROMOTE_TOKEN/);
});
