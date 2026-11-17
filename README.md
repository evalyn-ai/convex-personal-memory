# @evalyn/convex-personal-memory

A [Convex component](https://docs.convex.dev/components) that keeps a short, user-controlled list of durable personal memories: "I prefer exceptions first", "for weekly reviews, summary first". A model proposes changes from each user turn; the component checks them against the user's own words and the current list before anything is stored.

Each memory has text, a free-text condition saying when it applies (`general` when unlimited), a category, up to 20 evidence excerpts of the user's own words, and one previous version for Undo. The answering model receives a bounded list of recent memories with their applicability conditions.

Licensed under [Apache-2.0](LICENSE). It is not on npm yet (see [Publishing](#publishing)). The public repository mirrors this package from the private monorepo’s main branch. Once the first sync lands, you can install directly from GitHub. Open issues in the public repository.

## Install and mount

After the first mirror sync, install the package and its peer dependencies:

```sh
npm install github:evalyn-ai/convex-personal-memory "convex@^1.49.0" "zod@^4.6.7"
```

The package exports TypeScript source. Convex’s bundler compiles it.

```ts
// convex/convex.config.ts
import personalMemory from '@evalyn/convex-personal-memory/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(personalMemory); // mounted as `personalMemory`
export default app;
```

Run `convex codegen` (or `convex dev`) so `components.personalMemory` appears in the app's `_generated/api`.

## Namespaces and isolation

Every call takes a `namespace`: an opaque string, usually one user in one workspace. The component stores and isolates all rows by it, and does nothing else with it. It never sees users, never reads app tables and never authorizes anyone.

The namespace is therefore the app's authorization decision. Build it on the server from the authenticated session, never accept it from a client or a model, and check access before every call. For example, `JSON.stringify([workspaceId, userId])` after checking the user's workspace membership.

## Client API

```ts
import { PersonalMemory } from '@evalyn/convex-personal-memory';
import { components } from './_generated/api';

const memory = new PersonalMemory(components.personalMemory);
```

Every method takes the app's `ctx` and a namespace. Queries need `runQuery`; everything else needs a mutation or action `ctx`.

| Method                                                                          | What it does                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enqueueTurn(ctx, ns, { key, source, text, at? })`                              | Queues a user turn for learning. `key` makes it idempotent (for example `turn:<runId>`); `source` names what it came from, for `withdrawPendingSource`. Returns a job id, or null when learning is paused, the turn was forgotten or already queued, it is over 16 KB, or 20 jobs are pending. |
| `claim(ctx, ns, jobId)`                                                         | Marks the job running and returns `{ text, memories }` for the update model, or null when it should no longer run. A failed job can be claimed again.                                                                                                                                          |
| `ingest(ctx, ns, jobId, operations)`                                            | Applies the model's operations to a claimed job. Returns `{ outcome, memoryIds, accepted }`.                                                                                                                                                                                                   |
| `fail(ctx, ns, jobId, { outcome?, final })`                                     | Records a content-free failure. `final: true` drops the raw turn.                                                                                                                                                                                                                              |
| `recall(ctx, ns)`                                                               | Every memory for the answering model, newest first, within 8,000 characters. Empty while recall is paused.                                                                                                                                                                                     |
| `inspect(ctx, ns)`                                                              | What the user may see: memories with evidence, controls and the last 20 content-free job outcomes.                                                                                                                                                                                             |
| `remember(ctx, ns, { requestId, text, condition?, category, source })`          | An explicit statement, e.g. from a form. Idempotent per `requestId`.                                                                                                                                                                                                                           |
| `correct(ctx, ns, { memoryId, requestId, text, condition, category?, source })` | The user's own edit, recorded as correction evidence. Latest wins.                                                                                                                                                                                                                             |
| `forget(ctx, ns, memoryId?)`                                                    | Forgets one memory, or all of them. Returns how many.                                                                                                                                                                                                                                          |
| `undo(ctx, ns, memoryId)`                                                       | Reverts the latest automatic change: restores the previous version, or forgets a memory one automatic statement created. One version is kept, so a second Undo returns false.                                                                                                                  |
| `control(ctx, ns, command, topic?)`                                             | `pause-learning`, `resume-learning`, `pause-recall`, `resume-recall`, `block-topic`, `unblock-topic`.                                                                                                                                                                                          |
| `withdrawPendingSource(ctx, ns, source)`                                        | Withdraws queued turns from one source, e.g. a deleted conversation.                                                                                                                                                                                                                           |
| `purge(ctx, ns)`                                                                | Deletes every row of a namespace. See [Deleting data](#deleting-data).                                                                                                                                                                                                                         |
| `listNamespaces(ctx, cursor?)`                                                  | A page of namespaces that hold state, `{ namespaces, cursor }`.                                                                                                                                                                                                                                |

`source` on `remember` and `correct` is a label stored on the evidence, such as `memory-page`.

### Outcomes

`ingest` and `remember` report a comma-separated `outcome`:

- `applied` or `no_change`, plus the reason for each kind of skipped operation: `excerpt_not_in_turn` (it does not quote the turn), `unknown_memory` (it names a memory that does not exist or was already changed in the same proposal), `blocked_topic` or `memory_full`. Each operation is checked on its own, so one bad operation does not discard the valid ones beside it.
- `schema_invalid` when the proposal is malformed or uses an unknown category, and `excerpt_not_in_turn` and/or `unknown_memory` alone when no operation was valid. A rejected job ends as `failed`.
- `stale_job` or `stale_generation` when the job was no longer current (forgotten, paused or already finished). `duplicate` when a `remember` request id was already used.

## Calling the update model

The component never calls a model and presets none: the app chooses the model and makes the call, between `claim` and `ingest`, with the pieces this package exports. Use a model that supports structured output, and check it on your own conversations before relying on it.

- `memoryUpdatePrompt({ appName? })` builds the system prompt; `memoryUpdateInstructions` is the default.
- `memoryUpdateMessages(memories, turn, instructions?)` returns the system and user messages.
- `memoryResponseFormat()` is a JSON Schema for structured output; `memoryUpdate` parses the reply.
- `validateOperations` and `recallList` are the pure rules the component applies, for tests and tools.

These live in `@evalyn/convex-personal-memory/model`, which imports only `zod`, so a model runtime that does not use Convex can load it. The root export re-exports them.

```ts
'use node';
import {
  memoryResponseFormat,
  memoryUpdate,
  memoryUpdateMessages,
  memoryUpdatePrompt,
} from '@evalyn/convex-personal-memory';

const instructions = memoryUpdatePrompt({ appName: 'Acme' });

export const update = internalAction({
  args: { namespace: v.string(), jobId: v.string() },
  handler: async (ctx, { namespace, jobId }) => {
    const claimed = await memory.claim(ctx, namespace, jobId);
    if (!claimed) return;
    const reply = await callYourModel({
      model: process.env.MEMORY_MODEL!, // your choice; there is no default
      messages: memoryUpdateMessages(
        claimed.memories,
        claimed.text,
        instructions,
      ),
      response_format: {
        type: 'json_schema',
        json_schema: memoryResponseFormat(),
      },
    });
    const { operations } = memoryUpdate.parse(JSON.parse(reply));
    await memory.ingest(ctx, namespace, jobId, operations);
  },
});
```

Put the namespace and job id, not the turn, in anything you log. The call can also run on a separate runtime that commits the operations through a callback; the component's checks are the same either way.

### Retries with `@convex-dev/workflow`

The component keeps no retry state beyond the job status, so the app owns retries. For example, one workflow per queued turn:

```ts
const workflows = new WorkflowManager(components.workflow);
export const process = workflows
  .define({ args })
  .handler(async (step, input) => {
    try {
      return await step.runAction(internal.memory.update, input, {
        retry: { maxAttempts: 3, initialBackoffMs: 30000, base: 2 },
      });
    } catch {
      // After the last attempt, drop the raw turn and keep a content-free outcome.
      await step.runMutation(internal.memory.fail, { ...input, final: true });
      return false;
    }
  });
```

In the action, call `memory.fail(ctx, ns, jobId, { outcome, final: false })` before rethrowing so the Memory page can show why an attempt failed. After `enqueueTurn` returns a job id, start the workflow from the same mutation.

## Limits

A namespace holds at most 30 memories (`MAX_MEMORIES`); further adds report `memory_full`. Each memory keeps its 20 newest evidence entries (`MAX_EVIDENCE`). Categories are fixed to `preference`, `priority`, `decision`, `question`, `concern` and `feedback` (`CATEGORIES`); anything else is `schema_invalid`.

Other bounds: 500 characters of text, 200 of condition, 600 of excerpt, 10 operations per proposal, 100 blocked topics, 20 pending jobs and 100 job records per namespace (finished ones are evicted first).

## Forgetting

- `forget` deletes the memory, tombstones the ids of its evidence and the turns it was learned from, bumps the namespace's generation and withdraws pending jobs. A replayed or late job for a forgotten turn is refused; a fresh restatement has a new key and can be learned.
- `undo` and a model `remove` tombstone the same way.
- Pausing learning withdraws queued turns. Withdrawn raw turns are dropped, and job records keep only a content-free outcome.
- Forgetting applies to the next `recall`. An answer already being generated keeps the context it was given.

## Deleting data

`purge(ctx, namespace)` stops recall and learning at once, then deletes the namespace's memories, jobs, tombstones and controls in batches of 1,000 rows, scheduling itself until nothing is left. It returns true when the namespace is gone in one call.

To delete everything for one person across namespaces, page through `listNamespaces` and purge the ones your namespace format assigns to them. The component cannot decode namespaces, by design. For example, on account deletion:

```ts
const page = await memory.listNamespaces(ctx, cursor);
for (const ns of page.namespaces)
  if (scopeParts(ns)?.ownerId === ownerId) await memory.purge(ctx, ns);
if (page.cursor)
  await ctx.scheduler.runAfter(0, self, { ownerId, cursor: page.cursor });
```

## Testing

`@evalyn/convex-personal-memory/test` registers the component with [`convex-test`](https://docs.convex.dev/testing/convex-test). Its modules are listed explicitly, so it works under bun and node as well as Vite.

```ts
import personalMemory from '@evalyn/convex-personal-memory/test';
import { convexTest } from 'convex-test';

const t = convexTest(schema, modules);
const component = personalMemory.register(t, 'personalMemory');
const memory = new PersonalMemory(component);
await t.run((ctx) => memory.recall(ctx, 'synthetic-namespace'));
```

`componentApi`, `schema` and `modules` also let a test run the component as its own root app, which is useful for inspecting job rows in evaluations. Run `bun install` and `bun test` from the package root to run the tests.

## Benchmark

`bench/` checks the prompt and validation on 29 synthetic chats with a live model; see the [benchmark guide](bench/README.md).

## Layout

```
src/
  model.ts            prompt, wire schema, validation, types (zod only)
  client/index.ts     PersonalMemory class; the package root export
  component/          convex.config.ts, schema.ts, memory.ts, _generated/
  test.ts             convex-test helper
bench/                live benchmark: cases and runner
tests/                bun tests through the client
```

Regenerate `src/component/_generated` with `npx convex codegen --component-dir src/component` from a directory with a configured deployment, or by running codegen in an app that mounts the component.

Stored shapes are kept from the first release: table names, the `scope` field that holds the namespace, and index names. Change them only by adding optional fields or widening a type, since Convex rejects a schema that existing rows don't match.

## Publishing

`exports` point at TypeScript source. An npm release would need:

- A build (`tsc -p tsconfig.build.json`) into `dist/`, with `exports` pointing at `dist/**/*.js` and `.d.ts`, and `files: ["dist", "src"]`. Keep `./convex.config.js` and `./_generated/component.js` export paths: the Convex CLI imports `<package>/_generated/component.js` when it generates an app's types.
- `convex` and `zod` as peer dependencies only; `convex-test` as an optional peer for `./test`.
- `"private": false` and a CHANGELOG.
- An `example/` app with an end-to-end check, as in Convex's component template.

Pending decisions:

- npm scope and organisation (`@evalyn` is a placeholder).
- Submission to the [Convex Components directory](https://www.convex.dev/components). It lists npm packages; the submission form and review steps are not documented in Convex's docs or template, so check the page in a browser or ask Convex. The [authoring guide](https://docs.convex.dev/components/authoring) and the [component template](https://github.com/convex/templates/tree/main/template-component) set the expected layout: built `dist/` exports for `.`, `./convex.config.js` and `./_generated/component.js`, `./test` from source, and an example app that uses the built package.
