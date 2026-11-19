import { ConvexError, v } from 'convex/values';
import {
  CATEGORIES,
  type Evidence,
  MAX_EVIDENCE,
  MAX_MEMORIES,
  type MemoryItem,
  type Operation,
  operations,
  recallList,
  reject,
  validateOperations,
} from '../model.js';
import { api } from './_generated/api.js';
import type { Doc, Id } from './_generated/dataModel.js';
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from './_generated/server.js';
import { categoryValidator, evidenceValidator, jobStatus } from './schema.js';

/** Parent-only API. The app derives `namespace` from its own authenticated
 * session; this component never sees users, reads app tables or authorizes
 * anyone. Every row is keyed by the namespace (stored as `scope`). */
const defaults = {
  learning: true,
  recall: true,
  blockedTopics: [] as string[],
  generation: 0,
};

const memoryItem = v.object({
  id: v.string(),
  text: v.string(),
  condition: v.string(),
  category: categoryValidator,
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  evidence: v.array(evidenceValidator),
  previous: v.optional(v.object({ text: v.string(), condition: v.string() })),
});

const recallItem = v.object({
  id: v.string(),
  revision: v.number(),
  text: v.string(),
  condition: v.string(),
  category: categoryValidator,
});

const controlsRow = (ctx: QueryCtx, scope: string) =>
  ctx.db
    .query('memoryControls')
    .withIndex('scope', (q) => q.eq('scope', scope))
    .unique();

async function controls(ctx: QueryCtx, scope: string) {
  const row = await controlsRow(ctx, scope);

  return row ? { ...defaults, ...row } : { ...defaults, scope };
}

async function ensureControls(ctx: MutationCtx, scope: string) {
  const row = await controlsRow(ctx, scope);

  if (row) return row;
  const fields = { scope, ...defaults, blockedTopics: [] };

  return { _id: await ctx.db.insert('memoryControls', fields), ...fields };
}

const rows = (ctx: QueryCtx, scope: string) =>
  ctx.db
    .query('memoryItems')
    .withIndex('scope', (q) => q.eq('scope', scope))
    .take(MAX_MEMORIES);

const project = ({
  _id,
  _creationTime: _,
  scope: __,
  ...item
}: Doc<'memoryItems'>): MemoryItem => ({
  id: _id,
  ...item,
});

async function row(ctx: QueryCtx, scope: string, memoryId: string) {
  const id = ctx.db.normalizeId('memoryItems', memoryId);
  const item = id ? await ctx.db.get(id) : null;

  return item?.scope === scope ? item : null;
}

async function job(ctx: QueryCtx, scope: string, jobId: string) {
  const id = ctx.db.normalizeId('memoryJobs', jobId);
  const item = id ? await ctx.db.get(id) : null;

  return item?.scope === scope ? item : null;
}

async function tombstoned(ctx: QueryCtx, scope: string, key: string) {
  return !!(await ctx.db
    .query('memoryTombstones')
    .withIndex('key', (q) => q.eq('scope', scope).eq('key', key))
    .first());
}

async function tombstone(ctx: MutationCtx, scope: string, key: string) {
  if (!(await tombstoned(ctx, scope, key)))
    await ctx.db.insert('memoryTombstones', { scope, key });
}

/** Forgotten statements and the turns they came from can never be re-learned
 * by a replayed or late job. A fresh turn has a new key and stays eligible.
 * Automatic evidence ids are `<job key>:<operation index>`. */
async function tombstoneEvidence(
  ctx: MutationCtx,
  scope: string,
  evidence: Evidence[],
) {
  for (const e of evidence) {
    await tombstone(ctx, scope, e.id);

    if (e.origin === 'automatic')
      await tombstone(ctx, scope, e.id.slice(0, e.id.lastIndexOf(':')));
  }
}

async function withdrawPending(
  ctx: MutationCtx,
  scope: string,
  source?: string,
) {
  for (const j of await ctx.db
    .query('memoryJobs')
    .withIndex('scope', (q) => q.eq('scope', scope))
    .take(200)) {
    if (!j.input) continue;

    if (source !== undefined && j.source !== source) continue;
    await ctx.db.patch(j._id, {
      status: 'obsolete',
      input: '',
      updatedAt: Date.now(),
    });
    await tombstone(ctx, scope, j.key);
  }
}

async function forgetRows(
  ctx: MutationCtx,
  scope: string,
  items: Doc<'memoryItems'>[],
) {
  for (const item of items) {
    await tombstoneEvidence(ctx, scope, item.evidence);
    await ctx.db.delete(item._id);
  }

  const c = await ensureControls(ctx, scope);
  await ctx.db.patch(c._id, { generation: c.generation + 1 });
  await withdrawPending(ctx, scope);
}

async function apply(
  ctx: MutationCtx,
  scope: string,
  ops: Operation[],
  evidenceFor: (i: number, op: Operation) => Evidence,
  turnAt?: number,
) {
  const ids: string[] = [];
  const now = Date.now();
  let count = (await rows(ctx, scope)).length;

  for (const [i, op] of ops.entries()) {
    const evidence = evidenceFor(i, op);

    if (await tombstoned(ctx, scope, evidence.id)) continue;

    if (op.op === 'add') {
      if (count >= MAX_MEMORIES) continue;
      count++;
      ids.push(
        await ctx.db.insert('memoryItems', {
          scope,
          text: op.text,
          condition: op.condition,
          category: op.category,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          evidence: [evidence],
        }),
      );
      continue;
    }

    const item = await row(ctx, scope, op.id);

    if (!item) continue;

    // Latest statement wins: a turn never overrides a correction or another
    // turn made after it, whichever job finishes first. Ties go to the user.
    if (
      turnAt !== undefined &&
      item.evidence.some(
        (e) => e.at > turnAt || (e.at === turnAt && e.origin === 'correction'),
      )
    )
      continue;

    if (op.op === 'remove') {
      await tombstoneEvidence(ctx, scope, item.evidence);
      await ctx.db.delete(item._id);
      count--;
    } else {
      await ctx.db.patch(item._id, {
        text: op.text,
        condition: op.condition,
        previous: { text: item.text, condition: item.condition },
        revision: item.revision + 1,
        updatedAt: now,
        evidence: [...item.evidence, evidence].slice(-MAX_EVIDENCE),
      });
    }

    ids.push(item._id);
  }

  return ids;
}

const ingestResult = v.object({
  outcome: v.string(),
  memoryIds: v.array(v.string()),
  accepted: v.boolean(),
});

/** Applies add/update/remove operations. With `jobId`, the turn text and
 * source come from the claimed job and its generation must still be current;
 * with `explicit`, the app supplies a statement the user made directly, such
 * as an explicit "remember this" in its UI, and names its `source`. */
export const ingest = mutation({
  args: {
    namespace: v.string(),
    operations: v.any(),
    jobId: v.optional(v.string()),
    explicit: v.optional(
      v.object({
        requestId: v.string(),
        turn: v.string(),
        source: v.string(),
      }),
    ),
  },
  returns: ingestResult,
  handler: async (ctx, { namespace: scope, ...args }) => {
    const c = await ensureControls(ctx, scope);
    const items = await rows(ctx, scope);
    const memoryIds = items.map((i) => i._id as string);

    if (args.explicit) {
      const id = `edit:${args.explicit.requestId}`;

      if (
        (await tombstoned(ctx, scope, id)) ||
        items.some((i) => i.evidence.some((e) => e.id === id))
      )
        return { outcome: 'duplicate', memoryIds: [], accepted: false };
      const proposal = operations.safeParse(args.operations);

      const result = proposal.success
        ? validateOperations(proposal.data, {
            turn: args.explicit.turn,
            memoryIds,
            blockedTopics: [],
          })
        : reject('schema_invalid');

      if (!result.operations.length)
        return { outcome: result.outcome, memoryIds: [], accepted: false };
      const source = args.explicit.source.slice(0, 200);

      const ids = await apply(ctx, scope, result.operations, (_, op) => ({
        id,
        excerpt: op.excerpt,
        at: Date.now(),
        source,
        origin: 'explicit',
      }));

      return { outcome: result.outcome, memoryIds: ids, accepted: true };
    }

    const j = args.jobId ? await job(ctx, scope, args.jobId) : null;

    if (!j) throw new ConvexError('Memory job or statement required');

    const finish = async (
      outcome: string,
      status: 'done' | 'failed' | 'obsolete',
      ids: string[] = [],
    ) => {
      await ctx.db.patch(j._id, {
        status,
        input: '',
        outcome,
        updatedAt: Date.now(),
      });

      return { outcome, memoryIds: ids, accepted: status === 'done' };
    };

    if (j.status !== 'running' || !j.input)
      return { outcome: 'stale_job', memoryIds: [], accepted: false };

    if (
      !c.learning ||
      j.generation !== c.generation ||
      (await tombstoned(ctx, scope, j.key))
    )
      return finish('stale_generation', 'obsolete');
    const input = JSON.parse(j.input) as { text: string; at: number };
    const proposal = operations.safeParse(args.operations);

    const result = proposal.success
      ? validateOperations(proposal.data, {
          turn: input.text,
          memoryIds,
          blockedTopics: c.blockedTopics,
        })
      : reject('schema_invalid');

    const ids = await apply(
      ctx,
      scope,
      result.operations,
      (i, op) => ({
        id: `${j.key}:${i}`,
        excerpt: op.excerpt,
        at: input.at,
        source: j.source,
        origin: 'automatic',
      }),
      input.at,
    );

    return finish(result.outcome, result.rejected ? 'failed' : 'done', ids);
  },
});

/** Every active memory for the answering model, newest first, bounded by
 * characters. Empty while recall is paused. */
export const recall = query({
  args: { namespace: v.string() },
  returns: v.array(recallItem),
  handler: async (ctx, { namespace: scope }) =>
    (await controls(ctx, scope)).recall
      ? recallList((await rows(ctx, scope)).map(project))
      : [],
});

/** Everything the user may see: memories with evidence, controls and the
 * latest content-free job outcomes. */
export const inspect = query({
  args: { namespace: v.string() },
  returns: v.object({
    learning: v.boolean(),
    recall: v.boolean(),
    blockedTopics: v.array(v.string()),
    generation: v.number(),
    memories: v.array(memoryItem),
    jobs: v.array(
      v.object({
        key: v.string(),
        status: jobStatus,
        outcome: v.optional(v.string()),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { namespace: scope }) => {
    const { learning, recall, blockedTopics, generation } = await controls(
      ctx,
      scope,
    );

    const jobs = await ctx.db
      .query('memoryJobs')
      .withIndex('scope', (q) => q.eq('scope', scope))
      .order('desc')
      .take(20);

    return {
      learning,
      recall,
      blockedTopics,
      generation,
      memories: (await rows(ctx, scope))
        .map(project)
        .sort((a, b) => b.updatedAt - a.updatedAt),
      jobs: jobs.map(({ key, status, outcome, updatedAt }) => ({
        key,
        status,
        outcome,
        updatedAt,
      })),
    };
  },
});

/** A user's own edit: recorded as correction evidence, latest wins. */
export const correct = mutation({
  args: {
    namespace: v.string(),
    memoryId: v.string(),
    requestId: v.string(),
    text: v.string(),
    condition: v.string(),
    category: v.optional(categoryValidator),
    source: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { namespace: scope, ...args }) => {
    if (
      args.category &&
      !(CATEGORIES as readonly string[]).includes(args.category)
    )
      throw new ConvexError('Unknown memory category.');
    const item = await row(ctx, scope, args.memoryId);
    const id = `edit:${args.requestId}`;

    if (!item || item.evidence.some((e) => e.id === id)) return false;
    const text = args.text.trim().slice(0, 500);
    const condition = args.condition.trim().slice(0, 200) || 'general';

    if (!text) throw new ConvexError('Memory text is required.');
    await ctx.db.patch(item._id, {
      text,
      condition,
      ...(args.category ? { category: args.category } : {}),
      previous: { text: item.text, condition: item.condition },
      revision: item.revision + 1,
      updatedAt: Date.now(),
      evidence: [
        ...item.evidence,
        {
          id,
          excerpt: text,
          at: Date.now(),
          source: args.source.slice(0, 200),
          origin: 'correction' as const,
        },
      ].slice(-MAX_EVIDENCE),
    });

    return true;
  },
});

/** Forget one memory, or all of them when `memoryId` is omitted. */
export const forget = mutation({
  args: { namespace: v.string(), memoryId: v.optional(v.string()) },
  returns: v.number(),
  handler: async (ctx, { namespace: scope, memoryId }) => {
    const items = memoryId
      ? [await row(ctx, scope, memoryId)].filter((i) => !!i)
      : await rows(ctx, scope);

    await forgetRows(ctx, scope, items);

    return items.length;
  },
});

/** Undo the latest automatic change: restore the previous version, or forget
 * a memory that one automatic statement created. Only one previous version is
 * kept, so a second Undo of an update is refused. */
export const undo = mutation({
  args: { namespace: v.string(), memoryId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { namespace: scope, memoryId }) => {
    const item = await row(ctx, scope, memoryId);
    const last = item?.evidence.at(-1);

    if (!item || last?.origin !== 'automatic') return false;

    if (!item.previous) {
      if (item.revision !== 1) return false;
      await forgetRows(ctx, scope, [item]);

      return true;
    }

    await tombstoneEvidence(ctx, scope, [last]);
    await ctx.db.patch(item._id, {
      ...item.previous,
      previous: undefined,
      revision: item.revision + 1,
      updatedAt: Date.now(),
      evidence: item.evidence.slice(0, -1),
    });

    return true;
  },
});

export const control = mutation({
  args: {
    namespace: v.string(),
    command: v.union(
      v.literal('pause-learning'),
      v.literal('resume-learning'),
      v.literal('pause-recall'),
      v.literal('resume-recall'),
      v.literal('block-topic'),
      v.literal('unblock-topic'),
    ),
    topic: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { namespace: scope, command, topic }) => {
    const c = await ensureControls(ctx, scope);
    const t = (topic ?? '').trim().toLowerCase().slice(0, 100);

    if (command.endsWith('topic') && !t)
      throw new ConvexError('Topic required.');

    if (command === 'block-topic' && c.blockedTopics.length >= 100)
      throw new ConvexError('Too many blocked topics.');
    await ctx.db.patch(c._id, {
      ...(command === 'pause-learning' && { learning: false }),
      ...(command === 'resume-learning' && { learning: true }),
      ...(command === 'pause-recall' && { recall: false }),
      ...(command === 'resume-recall' && { recall: true }),
      ...(command === 'block-topic' && {
        blockedTopics: [...new Set([...c.blockedTopics, t])],
      }),
      ...(command === 'unblock-topic' && {
        blockedTopics: c.blockedTopics.filter((x) => x !== t),
      }),
    });

    // Paused learning keeps no queued raw turns.
    if (command === 'pause-learning') await withdrawPending(ctx, scope);

    return null;
  },
});

/** Queues one user turn for the update model. `key` makes the turn
 * idempotent and lets forgetting tombstone it; `source` names what the turn
 * came from (a run or conversation) for `withdrawPendingSource`. Returns the
 * job id, or null when learning is paused, the turn was forgotten or already
 * queued, or too much work is pending. */
export const enqueue = mutation({
  args: {
    namespace: v.string(),
    key: v.string(),
    source: v.string(),
    text: v.string(),
    at: v.number(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { namespace: scope, text, at, ...args }) => {
    const c = await ensureControls(ctx, scope);
    // The raw turn is kept only until its job ends.
    const input = JSON.stringify({ text, at });

    if (!c.learning || input.length > 16000) return null;

    if (await tombstoned(ctx, scope, args.key)) return null;

    const existing = await ctx.db
      .query('memoryJobs')
      .withIndex('key', (q) => q.eq('scope', scope).eq('key', args.key))
      .first();

    if (existing) return null;

    const jobs = await ctx.db
      .query('memoryJobs')
      .withIndex('scope', (q) => q.eq('scope', scope))
      .take(101);

    if (
      // Retryable failures keep their raw turn too.
      jobs.filter((j) => j.input).length >= 20
    )
      return null;

    // Bounded content-free outcomes; never evict unfinished work.
    if (jobs.length >= 100) {
      const finished = jobs.find((j) => !j.input);

      if (finished) await ctx.db.delete(finished._id);
    }

    return ctx.db.insert('memoryJobs', {
      ...args,
      scope,
      input,
      generation: c.generation,
      status: 'pending',
      updatedAt: Date.now(),
    });
  },
});

/** Hands the update model the turn and current list. The caller owns
 * retries, so a failed or interrupted job may be claimed again. */
export const claim = mutation({
  args: { namespace: v.string(), jobId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      text: v.string(),
      memories: v.array(
        v.object({
          id: v.string(),
          text: v.string(),
          condition: v.string(),
          category: categoryValidator,
        }),
      ),
    }),
  ),
  handler: async (ctx, { namespace: scope, jobId }) => {
    const j = await job(ctx, scope, jobId);
    const c = await controls(ctx, scope);

    if (
      !j?.input ||
      !['pending', 'running', 'failed'].includes(j.status) ||
      !c.learning ||
      j.generation !== c.generation
    )
      return null;
    await ctx.db.patch(j._id, { status: 'running', updatedAt: Date.now() });

    return {
      text: (JSON.parse(j.input) as { text: string }).text,
      memories: (await rows(ctx, scope)).map(
        ({ _id, text, condition, category }) => ({
          id: _id,
          text,
          condition,
          category,
        }),
      ),
    };
  },
});

/** Records a content-free failure. `final` drops the raw turn. */
export const fail = mutation({
  args: {
    namespace: v.string(),
    jobId: v.string(),
    outcome: v.optional(v.string()),
    final: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { namespace: scope, ...args }) => {
    const j = await job(ctx, scope, args.jobId);

    if (!j?.input) return null;
    await ctx.db.patch(j._id, {
      status: 'failed',
      ...(args.outcome ? { outcome: args.outcome.slice(0, 100) } : {}),
      updatedAt: Date.now(),
      ...(args.final ? { input: '' } : {}),
    });

    return null;
  },
});

/** Drops queued turns from one source, e.g. a deleted conversation, and
 * tombstones them so a late redelivery is refused. */
export const withdrawPendingSource = mutation({
  args: { namespace: v.string(), source: v.string() },
  returns: v.null(),
  handler: async (ctx, { namespace: scope, source }) => {
    await withdrawPending(ctx, scope, source);

    return null;
  },
});

/** Namespaces that hold memory state, a page at a time, so the app can find
 * the ones its own deletion rules cover. */
export const listNamespaces = query({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({
    namespaces: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('memoryControls')
      .paginate({ numItems: 100, cursor: cursor ?? null });

    return {
      namespaces: page.page.map((c) => c.scope),
      cursor: page.isDone ? null : page.continueCursor,
    };
  },
});

const PURGE_BATCH = 1000;

/** Deletes every row of one namespace. Recall and learning stop at once;
 * deletion runs in bounded batches and continues itself until nothing is
 * left. Returns true when the namespace is gone. */
export const purgeNamespace = mutation({
  args: { namespace: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { namespace: scope }): Promise<boolean> => {
    const c = await controlsRow(ctx, scope);

    if (c?.learning || c?.recall)
      await ctx.db.patch(c._id, {
        learning: false,
        recall: false,
        generation: c.generation + 1,
      });
    let budget = PURGE_BATCH;

    const batches = [
      () =>
        ctx.db
          .query('memoryItems')
          .withIndex('scope', (q) => q.eq('scope', scope))
          .take(budget),
      () =>
        ctx.db
          .query('memoryJobs')
          .withIndex('scope', (q) => q.eq('scope', scope))
          .take(budget),
      () =>
        ctx.db
          .query('memoryTombstones')
          .withIndex('key', (q) => q.eq('scope', scope))
          .take(budget),
    ];

    for (const batch of batches) {
      const ids: Id<'memoryItems' | 'memoryJobs' | 'memoryTombstones'>[] = (
        await batch()
      ).map((r) => r._id);

      for (const id of ids) await ctx.db.delete(id);
      budget -= ids.length;

      if (budget <= 0) {
        await ctx.scheduler.runAfter(0, api.memory.purgeNamespace, {
          namespace: scope,
        });

        return false;
      }
    }

    if (c) await ctx.db.delete(c._id);

    return true;
  },
});
