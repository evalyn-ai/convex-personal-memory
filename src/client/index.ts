import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from 'convex/server';
import type { ComponentApi } from '../component/_generated/component.js';
import type { Category, MemoryItem, RecallItem } from '../model.js';

export * from '../model.js';
export type { ComponentApi };

type RunQueryCtx = { runQuery: GenericQueryCtx<GenericDataModel>['runQuery'] };
type RunMutationCtx = RunQueryCtx & {
  runMutation: GenericMutationCtx<GenericDataModel>['runMutation'];
};

export type ControlCommand =
  | 'pause-learning'
  | 'resume-learning'
  | 'pause-recall'
  | 'resume-recall'
  | 'block-topic'
  | 'unblock-topic';
export type IngestResult = {
  outcome: string;
  memoryIds: string[];
  accepted: boolean;
};

/**
 * The app-side handle to a mounted personal memory component.
 *
 * Every method takes a `namespace`: an opaque string the app derives from its
 * own authenticated session (for example a user within a workspace). The
 * component isolates all rows by it and never authorizes anyone itself.
 *
 * ```ts
 * const memory = new PersonalMemory(components.personalMemory);
 * await memory.recall(ctx, namespaceFor(userId));
 * ```
 */
export class PersonalMemory {
  readonly component: ComponentApi;
  constructor(component: ComponentApi) {
    this.component = component;
  }

  /** Queues a new user turn for the update model. Returns the job id, or
   * null when nothing should be learned from it (paused, forgotten, already
   * queued, too large or too much pending work). */
  enqueueTurn(
    ctx: RunMutationCtx,
    namespace: string,
    turn: { key: string; source: string; text: string; at?: number },
  ): Promise<string | null> {
    return ctx.runMutation(this.component.memory.enqueue, {
      namespace,
      key: turn.key,
      source: turn.source,
      text: turn.text,
      at: turn.at ?? Date.now(),
    });
  }

  /** Marks a job running and returns its turn and the current list for the
   * update model, or null when the job should no longer run. */
  async claim(
    ctx: RunMutationCtx,
    namespace: string,
    jobId: string,
  ): Promise<{
    text: string;
    memories: {
      id: string;
      text: string;
      condition: string;
      category: Category;
    }[];
  } | null> {
    return (await ctx.runMutation(this.component.memory.claim, {
      namespace,
      jobId,
    })) as {
      text: string;
      memories: {
        id: string;
        text: string;
        condition: string;
        category: Category;
      }[];
    } | null;
  }

  /** Applies the update model's operations to a claimed job. The component
   * rejects operations that do not quote the job's own turn, name unknown
   * memories or arrive after the user forgot or paused. */
  ingest(
    ctx: RunMutationCtx,
    namespace: string,
    jobId: string,
    operations: unknown,
  ): Promise<IngestResult> {
    return ctx.runMutation(this.component.memory.ingest, {
      namespace,
      jobId,
      operations,
    });
  }

  /** Records a content-free failure. `final` drops the raw turn. */
  fail(
    ctx: RunMutationCtx,
    namespace: string,
    jobId: string,
    failure: { outcome?: string; final: boolean },
  ): Promise<null> {
    return ctx.runMutation(this.component.memory.fail, {
      namespace,
      jobId,
      ...failure,
    });
  }

  /** Memories for an answering model, newest first and bounded. Empty while
   * recall is paused. */
  async recall(ctx: RunQueryCtx, namespace: string): Promise<RecallItem[]> {
    return (await ctx.runQuery(this.component.memory.recall, {
      namespace,
    })) as RecallItem[];
  }

  /** Everything the user may see about their memory. */
  async inspect(ctx: RunQueryCtx, namespace: string) {
    const state = await ctx.runQuery(this.component.memory.inspect, {
      namespace,
    });
    return { ...state, memories: state.memories as MemoryItem[] };
  }

  /** An explicit statement the user asked to remember, e.g. from a form.
   * Idempotent per `requestId`. */
  remember(
    ctx: RunMutationCtx,
    namespace: string,
    statement: {
      requestId: string;
      text: string;
      condition?: string;
      category: Category;
      source: string;
    },
  ): Promise<IngestResult> {
    const text = statement.text.trim();
    return ctx.runMutation(this.component.memory.ingest, {
      namespace,
      explicit: {
        requestId: statement.requestId,
        turn: text,
        source: statement.source,
      },
      operations: [
        {
          op: 'add',
          text,
          condition: statement.condition?.trim() || 'general',
          category: statement.category,
          excerpt: text,
        },
      ],
    });
  }

  /** The user's own edit of one memory; recorded as correction evidence and
   * latest wins. Idempotent per `requestId`. */
  correct(
    ctx: RunMutationCtx,
    namespace: string,
    edit: {
      memoryId: string;
      requestId: string;
      text: string;
      condition: string;
      category?: Category;
      source: string;
    },
  ): Promise<boolean> {
    return ctx.runMutation(this.component.memory.correct, {
      namespace,
      ...edit,
    });
  }

  /** Forgets one memory, or all of them when `memoryId` is omitted. Its
   * evidence and source turns are tombstoned and pending jobs withdrawn, so
   * replayed or late jobs cannot re-learn it. Returns how many were removed. */
  forget(
    ctx: RunMutationCtx,
    namespace: string,
    memoryId?: string,
  ): Promise<number> {
    return ctx.runMutation(this.component.memory.forget, {
      namespace,
      ...(memoryId ? { memoryId } : {}),
    });
  }

  /** Reverts the latest automatic change to one memory: restores the
   * previous version, or forgets a memory one automatic statement created. */
  undo(
    ctx: RunMutationCtx,
    namespace: string,
    memoryId: string,
  ): Promise<boolean> {
    return ctx.runMutation(this.component.memory.undo, {
      namespace,
      memoryId,
    });
  }

  /** Pauses or resumes learning or recall, or blocks or unblocks a topic.
   * Pausing learning withdraws queued turns. */
  control(
    ctx: RunMutationCtx,
    namespace: string,
    command: ControlCommand,
    topic?: string,
  ): Promise<null> {
    return ctx.runMutation(this.component.memory.control, {
      namespace,
      command,
      ...(topic !== undefined ? { topic } : {}),
    });
  }

  /** Withdraws queued turns from one source, e.g. a deleted conversation. */
  withdrawPendingSource(
    ctx: RunMutationCtx,
    namespace: string,
    source: string,
  ): Promise<null> {
    return ctx.runMutation(this.component.memory.withdrawPendingSource, {
      namespace,
      source,
    });
  }

  /** Deletes every row of a namespace. Large namespaces finish in follow-up
   * transactions the component schedules itself; returns true when done. */
  purge(ctx: RunMutationCtx, namespace: string): Promise<boolean> {
    return ctx.runMutation(this.component.memory.purgeNamespace, {
      namespace,
    });
  }

  /** One page of namespaces holding memory state. Lets an app find every
   * namespace its own deletion rules cover, e.g. all of one user's. */
  listNamespaces(
    ctx: RunQueryCtx,
    cursor?: string,
  ): Promise<{ namespaces: string[]; cursor: string | null }> {
    return ctx.runQuery(
      this.component.memory.listNamespaces,
      cursor ? { cursor } : {},
    );
  }
}
