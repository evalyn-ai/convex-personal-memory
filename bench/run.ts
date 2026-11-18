/** Runs each case's user turns through the real component with an update
 * model, then has a judge model grade the final memory list against the
 * case's `keep` and `avoid` statements.
 *
 *   OPENAI_API_KEY=... bun bench/run.ts --model gpt-5-mini [--judge gpt-5] [--cases id,id]
 *
 * Any OpenAI-compatible endpoint works through OPENAI_BASE_URL. */
import { parseArgs } from 'node:util';
import { convexTest } from 'convex-test';
import type { Value } from 'convex/values';
import { z } from 'zod/v4';
import {
  memoryResponseFormat,
  memoryUpdate,
  memoryUpdateMessages,
} from '../src/model.js';
import { componentApi as api, modules, schema } from '../src/test.js';
import { type Case, cases } from './cases.js';

const { values: args } = parseArgs({
  options: {
    model: { type: 'string' },
    judge: { type: 'string' },
    cases: { type: 'string' },
  },
});
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey || !args.model)
  throw new Error('Set OPENAI_API_KEY and pass --model <id>.');
const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

type Message = { role: 'system' | 'user'; content: string };
async function chat(
  model: string,
  messages: Message[],
  format: { name: string; schema: unknown },
) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { ...format, strict: true },
        },
      }),
    });
    if (response.ok) {
      const json = (await response.json()) as {
        choices: { message: { content: string } }[];
      };
      return JSON.parse(json.choices[0]?.message.content ?? '');
    }
    if (attempt >= 2 || (response.status !== 429 && response.status < 500))
      throw new Error(`${response.status}: ${await response.text()}`);
    await Bun.sleep(2000 * (attempt + 1));
  }
}

async function learn(c: Case) {
  const t = convexTest(schema, modules);
  const namespace = c.id;
  for (const [i, text] of c.turns.entries()) {
    const key = `turn:${i}`;
    const at = Date.parse('2026-09-01T09:00:00Z') + i * 60_000;
    const jobId = await t.mutation(api.memory.enqueue, {
      namespace,
      key,
      source: key,
      text,
      at,
    });
    const claimed =
      jobId && (await t.mutation(api.memory.claim, { namespace, jobId }));
    if (!jobId || !claimed) continue;
    const reply = await chat(
      args.model as string,
      memoryUpdateMessages(claimed.memories, claimed.text),
      memoryResponseFormat(),
    );
    const { operations } = memoryUpdate.parse(reply);
    await t.mutation(api.memory.ingest, { namespace, jobId, operations });
  }
  return t.query(api.memory.recall, { namespace });
}

const verdicts = z
  .object({
    checks: z.array(
      z
        .object({ statement: z.string(), pass: z.boolean(), why: z.string() })
        .strict(),
    ),
  })
  .strict();
const { $schema: _, ...verdictSchema } = z.toJSONSchema(verdicts);
const judgePrompt = `You grade a personal memory list kept by an assistant. For each statement, decide whether the list satisfies it. A "keep" statement passes when some memory says the same thing, worded any way, with the stated scope ("scoped to X" means its condition limits it to X). An "avoid" statement passes when no memory asserts that thing; a memory that rejects or replaces it ("not by region, by division") still passes. Return one check per statement, in the order given.`;

async function grade(c: Case, memories: Value) {
  const statements = [
    ...c.keep.map((s) => `keep: ${s}`),
    ...c.avoid.map((s) => `avoid: ${s}`),
  ];
  const { checks } = verdicts.parse(
    await chat(
      args.judge ?? (args.model as string),
      [
        { role: 'system', content: judgePrompt },
        { role: 'user', content: JSON.stringify({ memories, statements }) },
      ],
      { name: 'memory_grade', schema: verdictSchema },
    ),
  );
  return statements.map((statement, i) => ({
    statement,
    pass: checks[i]?.pass ?? false,
    why: checks[i]?.why ?? 'no verdict',
  }));
}

const picked = args.cases
  ? cases.filter((c) => args.cases?.split(',').includes(c.id))
  : cases;
let passed = 0;
let total = 0;
for (const c of picked) {
  const memories = await learn(c);
  const checks = await grade(c, memories);
  passed += checks.filter((x) => x.pass).length;
  total += checks.length;
  console.log(`${checks.every((x) => x.pass) ? 'PASS' : 'FAIL'} ${c.id}`);
  for (const x of checks.filter((x) => !x.pass))
    console.log(`  ✗ ${x.statement} — ${x.why}`);
}
console.log(`\n${passed}/${total} checks passed across ${picked.length} cases`);
