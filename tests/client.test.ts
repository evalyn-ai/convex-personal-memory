import { expect, test } from 'bun:test';
import { convexTest } from 'convex-test';
import { defineSchema } from 'convex/server';
import type { Value } from 'convex/values';
import {
  MAX_MEMORIES,
  PersonalMemory,
  validateOperations,
} from '../src/client/index.js';
import { operations } from '../src/model.js';
import { componentApi, modules, register, schema } from '../src/test.js';

/** A bare app that mounts the component; every call goes through the client
 * inside `t.run`, as an app's own mutations and queries would. */
function setup() {
  const t = convexTest(defineSchema({}), {
    './_generated/api.ts': async () => ({}),
  });
  const memory = new PersonalMemory(register(t));
  const ns = 'synthetic-user';
  type Ctx = Parameters<Parameters<typeof t.run>[0]>[0];
  const run = <T>(fn: (ctx: Ctx) => Promise<T>) => t.run(fn);
  /** Queue, claim and apply one turn with the given operations. */
  const learn = async (
    text: string,
    operations: (claimed: {
      memories: { id: string; text: string }[];
    }) => Value,
    key: string = crypto.randomUUID(),
    namespace = ns,
  ) => {
    const jobId = await run((ctx) =>
      memory.enqueueTurn(ctx, namespace, {
        key: `turn:${key}`,
        source: key,
        text,
      }),
    );
    if (!jobId) return null;
    const claimed = await run((ctx) => memory.claim(ctx, namespace, jobId));
    if (!claimed) return null;
    return run((ctx) =>
      memory.ingest(ctx, namespace, jobId, operations(claimed)),
    );
  };
  const list = async (namespace = ns) =>
    (await run((ctx) => memory.inspect(ctx, namespace))).memories;
  return { t, memory, ns, run, learn, list };
}
const add = (text: string, excerpt: string, category = 'preference') => ({
  op: 'add',
  text,
  condition: 'general',
  category,
  excerpt,
});

test('add, update and remove through claimed jobs', async () => {
  const { learn, list } = setup();
  const a = 'I prefer exceptions first.';
  expect(await learn(a, () => [add('Exceptions first.', a)])).toMatchObject({
    outcome: 'applied',
    accepted: true,
  });
  const b = 'Actually, summary first please.';
  await learn(b, ({ memories }) => [
    {
      op: 'update',
      id: memories[0]?.id,
      text: 'Summary first.',
      condition: 'general',
      excerpt: b,
    },
  ]);
  const [updated] = await list();
  expect(updated).toMatchObject({
    text: 'Summary first.',
    revision: 2,
    previous: { text: 'Exceptions first.', condition: 'general' },
  });
  expect(updated?.evidence.map((e) => e.origin)).toEqual([
    'automatic',
    'automatic',
  ]);
  const c = 'Forget the ordering preference.';
  await learn(c, ({ memories }) => [
    { op: 'remove', id: memories[0]?.id, excerpt: c },
  ]);
  expect(await list()).toEqual([]);
});

test('latest wins and Undo restores the previous version', async () => {
  const { memory, ns, run, learn, list } = setup();
  const id = (
    await run((ctx) =>
      memory.remember(ctx, ns, {
        requestId: 'r1',
        text: 'Weekly digests.',
        category: 'preference',
        source: 'settings',
      }),
    )
  ).memoryIds[0] as string;
  const turn = 'I now want daily digests.';
  await learn(turn, () => [
    {
      op: 'update',
      id,
      text: 'Daily digests.',
      condition: 'general',
      excerpt: turn,
    },
  ]);
  expect((await list())[0]?.text).toBe('Daily digests.');
  expect(await run((ctx) => memory.undo(ctx, ns, id))).toBe(true);
  const [restored] = await list();
  expect(restored?.text).toBe('Weekly digests.');
  expect(restored?.evidence.map((e) => [e.origin, e.source])).toEqual([
    ['explicit', 'settings'],
  ]);
  // Only automatic changes can be undone.
  expect(await run((ctx) => memory.undo(ctx, ns, id))).toBe(false);
  // A user's own correction is recorded as correction evidence.
  expect(
    await run((ctx) =>
      memory.correct(ctx, ns, {
        memoryId: id,
        requestId: 'c1',
        text: 'Monthly digests.',
        condition: 'for board reports',
        source: 'settings',
      }),
    ),
  ).toBe(true);
  expect((await list())[0]).toMatchObject({
    text: 'Monthly digests.',
    condition: 'for board reports',
    previous: { text: 'Weekly digests.' },
  });
});

test('rejects proposals that do not quote the turn or name unknown memories', async () => {
  const { learn, list } = setup();
  expect(
    await learn('I like tables.', () => [add('Charts.', 'I like charts.')]),
  ).toMatchObject({ outcome: 'excerpt_not_in_turn', accepted: false });
  expect(
    await learn('Drop that.', () => [
      { op: 'remove', id: 'not-a-memory', excerpt: 'Drop that.' },
    ]),
  ).toMatchObject({ outcome: 'unknown_memory', accepted: false });
  expect(
    await learn('I like tables.', () => [
      add('Tables.', 'I like tables.', 'not-a-category'),
    ]),
  ).toMatchObject({ outcome: 'schema_invalid', accepted: false });
  expect(await list()).toEqual([]);
});

test('one invalid operation does not discard the valid ones beside it', async () => {
  const { learn, list } = setup();
  const turn = 'Exclude test accounts from churn. Drop the old rule.';
  expect(
    await learn(turn, () => [
      { op: 'remove', id: 'invented-id', excerpt: 'Drop the old rule.' },
      add('Exclude test accounts from churn.', 'Exclude test accounts'),
      add('Charts.', 'I like charts.'),
    ]),
  ).toMatchObject({
    outcome: 'applied,unknown_memory,excerpt_not_in_turn',
    accepted: true,
  });
  expect((await list()).map((m) => m.text)).toEqual([
    'Exclude test accounts from churn.',
  ]);
});

test('blocked topics are skipped and paused learning queues nothing', async () => {
  const { memory, ns, run, learn, list } = setup();
  await run((ctx) => memory.control(ctx, ns, 'block-topic', 'Salary'));
  const turn = 'I care about salary bands.';
  expect(
    await learn(turn, () => [add('Salary bands matter.', turn)]),
  ).toMatchObject({ outcome: 'no_change,blocked_topic' });
  await run((ctx) => memory.control(ctx, ns, 'pause-learning'));
  expect(
    await run((ctx) =>
      memory.enqueueTurn(ctx, ns, { key: 'k', source: 's', text: 'Hi.' }),
    ),
  ).toBeNull();
  expect(await list()).toEqual([]);
});

test('the list holds at most MAX_MEMORIES memories', async () => {
  const { memory, ns, run, learn } = setup();
  for (let n = 0; n < MAX_MEMORIES; n++)
    await learn(`Rule ${n}.`, () => [add(`Rule ${n}.`, `Rule ${n}.`)]);
  expect(
    await learn('One more.', () => [add('One more.', 'One more.')]),
  ).toMatchObject({ outcome: 'no_change,memory_full' });
  expect(
    await run((ctx) =>
      memory.remember(ctx, ns, {
        requestId: 'full',
        text: 'Another.',
        category: 'preference',
        source: 'settings',
      }),
    ),
  ).toMatchObject({ accepted: false, outcome: 'no_change,memory_full' });
});
test('namespaces are isolated', async () => {
  const { memory, run, learn, list } = setup();
  const turn = 'I prefer charts.';
  await learn(turn, () => [add('Charts.', turn)], 'a', 'user-a');
  const id = (await list('user-a'))[0]?.id as string;
  expect(await list('user-b')).toEqual([]);
  expect(await run((ctx) => memory.recall(ctx, 'user-b'))).toEqual([]);
  // Another namespace cannot touch the memory by id.
  expect(await run((ctx) => memory.forget(ctx, 'user-b', id))).toBe(0);
  expect(await run((ctx) => memory.undo(ctx, 'user-b', id))).toBe(false);
  expect(
    await learn(
      'Remove it.',
      () => [{ op: 'remove', id, excerpt: 'Remove it.' }],
      'b',
      'user-b',
    ),
  ).toMatchObject({ outcome: 'unknown_memory' });
  expect(await list('user-a')).toHaveLength(1);
});

test('forgotten memories cannot return from a replayed or late job', async () => {
  const { memory, ns, run, learn, list } = setup();
  const turn = 'I prefer bullet points.';
  await learn(turn, () => [add('Bullet points.', turn)], 'run-1');
  // A second job for another turn is queued before the user forgets.
  const late = await run((ctx) =>
    memory.enqueueTurn(ctx, ns, {
      key: 'turn:run-2',
      source: 'run-2',
      text: 'Bullet points, always.',
    }),
  );
  expect(await run((ctx) => memory.forget(ctx, ns))).toBe(1);
  // The replayed turn is refused, the late job is withdrawn.
  expect(
    await learn(turn, () => [add('Bullet points.', turn)], 'run-1'),
  ).toBeNull();
  expect(await run((ctx) => memory.claim(ctx, ns, late as string))).toBeNull();
  expect(
    await run((ctx) =>
      memory.ingest(ctx, ns, late as string, [
        add('Bullet points.', 'Bullet points, always.'),
      ]),
    ),
  ).toMatchObject({ outcome: 'stale_job', accepted: false });
  expect(await list()).toEqual([]);
  // A fresh restatement is a new turn and may be learned.
  await learn(turn, () => [add('Bullet points.', turn)], 'run-3');
  expect((await list()).map((m) => m.text)).toEqual(['Bullet points.']);
});

test('forgetting tombstones the source turn whatever its key format', async () => {
  // The component as its own root, so the test can evict the job record as
  // the bounded job history eventually does.
  const t = convexTest(schema, modules);
  const turn = {
    namespace: 'n',
    key: 'message:42',
    source: 'chat-9',
    text: 'I prefer maps.',
    at: 1,
  };
  const learn = async () => {
    const jobId = await t.mutation(componentApi.memory.enqueue, turn);
    if (!jobId) return null;
    await t.mutation(componentApi.memory.claim, { namespace: 'n', jobId });
    return t.mutation(componentApi.memory.ingest, {
      namespace: 'n',
      jobId,
      operations: [add('Maps.', 'I prefer maps.')],
    });
  };
  expect(await learn()).toMatchObject({ accepted: true });
  await t.mutation(componentApi.memory.forget, { namespace: 'n' });
  await t.run(async (ctx) => {
    for (const job of await ctx.db.query('memoryJobs').collect())
      await ctx.db.delete(job._id);
  });
  expect(await learn()).toBeNull();
});

test("a user's correction wins over a job claimed before it", async () => {
  const { memory, ns, run, learn, list } = setup();
  await learn('Remember A.', () => [add('A', 'Remember A.')]);
  const id = (await list())[0]?.id as string;
  const turn = 'Make it X.';
  const jobId = (await run((ctx) =>
    memory.enqueueTurn(ctx, ns, {
      key: 'turn:late',
      source: 'late',
      text: turn,
    }),
  )) as string;
  await run((ctx) => memory.claim(ctx, ns, jobId));
  await run((ctx) =>
    memory.correct(ctx, ns, {
      memoryId: id,
      requestId: 'c1',
      text: 'USER',
      condition: 'general',
      source: 'settings',
    }),
  );
  await run((ctx) =>
    memory.ingest(ctx, ns, jobId, [
      { op: 'update', id, text: 'X', condition: 'general', excerpt: turn },
    ]),
  );
  expect((await list()).map((m) => m.text)).toEqual(['USER']);
  // A job claimed after the correction saw it and may still change it.
  // Same-millisecond ties go to the user, so let the clock move first.
  await Bun.sleep(2);
  await learn(turn, () => [
    { op: 'update', id, text: 'X', condition: 'general', excerpt: turn },
  ]);
  expect((await list()).map((m) => m.text)).toEqual(['X']);
});

test('failures keep only content-free outcomes; withdrawn sources are refused', async () => {
  const { memory, ns, run } = setup();
  const jobId = (await run((ctx) =>
    memory.enqueueTurn(ctx, ns, {
      key: 'turn:x',
      source: 'conversation-1',
      text: 'secret plan',
    }),
  )) as string;
  await run((ctx) =>
    memory.fail(ctx, ns, jobId, { outcome: 'runtime_http_503', final: true }),
  );
  const state = await run((ctx) => memory.inspect(ctx, ns));
  expect(state.jobs[0]).toMatchObject({
    status: 'failed',
    outcome: 'runtime_http_503',
  });
  expect(JSON.stringify(state)).not.toContain('secret plan');
  const queued = { key: 'turn:y', source: 'conversation-2', text: 'Later.' };
  await run((ctx) => memory.enqueueTurn(ctx, ns, queued));
  await run((ctx) => memory.withdrawPendingSource(ctx, ns, 'conversation-2'));
  expect(await run((ctx) => memory.enqueueTurn(ctx, ns, queued))).toBeNull();
});

test('purge deletes one namespace and listNamespaces finds the rest', async () => {
  const { memory, run, learn, list } = setup();
  for (const ns of ['["c1","u1"]', '["c2","u1"]', '["c1","u2"]']) {
    const turn = 'I prefer charts.';
    await learn(turn, () => [add('Charts.', turn)], ns, ns);
  }
  await run((ctx) => memory.forget(ctx, '["c1","u1"]'));
  expect(await run((ctx) => memory.purge(ctx, '["c1","u1"]'))).toBe(true);
  expect(await run((ctx) => memory.listNamespaces(ctx))).toEqual({
    namespaces: ['["c2","u1"]', '["c1","u2"]'],
    cursor: null,
  });
  expect(await list('["c2","u1"]')).toHaveLength(1);
  // Nothing of the purged namespace remains, tombstones included: the
  // forgotten turn's key is learnable again in a recreated namespace.
  expect(await list('["c1","u1"]')).toEqual([]);
  const turn = 'I prefer charts.';
  expect(
    await learn(
      turn,
      () => [add('Charts.', turn)],
      '["c1","u1"]',
      '["c1","u1"]',
    ),
  ).toMatchObject({ accepted: true });
});

test('validateOperations is usable on its own', () => {
  expect(
    validateOperations(operations.parse([add('A.', 'A.')]), {
      turn: 'A.',
      memoryIds: Array.from({ length: MAX_MEMORIES }, (_, n) => `m${n}`),
      blockedTopics: [],
    }),
  ).toEqual({ operations: [], outcome: 'no_change,memory_full' });
});

test('a second Undo after an update is refused, not a deletion', async () => {
  const { memory, ns, run, learn, list } = setup();
  await learn('A rule.', () => [add('A.', 'A rule.')]);
  const id = (await list())[0]?.id as string;
  for (const [turn, text] of [
    ['B rule.', 'B.'],
    ['C rule.', 'C.'],
  ] as const)
    await learn(turn, () => [
      { op: 'update', id, text, condition: 'general', excerpt: turn },
    ]);
  expect(await run((ctx) => memory.undo(ctx, ns, id))).toBe(true);
  expect(await run((ctx) => memory.undo(ctx, ns, id))).toBe(false);
  expect((await list()).map((m) => m.text)).toEqual(['B.']);
});

test('a remove makes room for an add in the same proposal', async () => {
  const { learn, list } = setup();
  for (let n = 1; n < MAX_MEMORIES; n++)
    await learn(`Rule ${n}.`, () => [add(`Rule ${n}.`, `Rule ${n}.`)]);
  await learn('A first.', () => [add('A.', 'A first.')]);
  const turn = 'B first, drop A.';
  expect(
    await learn(turn, ({ memories }) => [
      add('B.', 'B first'),
      {
        op: 'remove',
        id: memories.find((m) => m.text === 'A.')?.id,
        excerpt: 'drop A',
      },
    ]),
  ).toMatchObject({ outcome: 'applied', accepted: true });
  const texts = (await list()).map((m) => m.text);
  expect(texts).toHaveLength(MAX_MEMORIES);
  expect(texts).toContain('B.');
  expect(texts).not.toContain('A.');
});

test('an older turn finishing last does not override a newer one', async () => {
  const { memory, ns, run, learn, list } = setup();
  await learn('Remember A.', () => [add('A', 'Remember A.')]);
  const id = (await list())[0]?.id as string;
  const queue = (key: string, text: string, at: number) =>
    run((ctx) =>
      memory.enqueueTurn(ctx, ns, { key, source: key, text, at }),
    ) as Promise<string>;
  const now = Date.now();
  const older = await queue('turn:old', 'Use B.', now + 1);
  const newer = await queue('turn:new', 'Use C.', now + 2);
  for (const jobId of [older, newer])
    await run((ctx) => memory.claim(ctx, ns, jobId));
  const update = (text: string, excerpt: string) => [
    { op: 'update', id, text, condition: 'general', excerpt },
  ];
  await run((ctx) => memory.ingest(ctx, ns, newer, update('C', 'Use C.')));
  await run((ctx) => memory.ingest(ctx, ns, older, update('B', 'Use B.')));
  expect((await list()).map((m) => m.text)).toEqual(['C']);
});

test('retryable failures count toward the pending-work bound', async () => {
  const { memory, ns, run } = setup();
  for (let i = 0; i < 20; i++) {
    const jobId = (await run((ctx) =>
      memory.enqueueTurn(ctx, ns, { key: `turn:${i}`, source: 's', text: 'x' }),
    )) as string;
    await run((ctx) => memory.fail(ctx, ns, jobId, { final: false }));
  }
  expect(
    await run((ctx) =>
      memory.enqueueTurn(ctx, ns, { key: 'turn:20', source: 's', text: 'x' }),
    ),
  ).toBeNull();
});
