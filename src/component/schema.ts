import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Categories are the caller's option (see `memoryOptions`); stored as a
 * plain string so existing rows written with the default union stay valid. */
export const categoryValidator = v.string();

export const evidenceValidator = v.object({
  id: v.string(),
  excerpt: v.string(),
  at: v.number(),
  source: v.string(),
  origin: v.union(
    v.literal('explicit'),
    v.literal('automatic'),
    v.literal('correction'),
  ),
});

export const jobStatus = v.union(
  v.literal('pending'),
  v.literal('running'),
  v.literal('done'),
  v.literal('failed'),
  v.literal('obsolete'),
);

// `scope` holds the caller's opaque namespace. Field, index and table names
// are kept from the first release so deployed rows stay readable; change
// stored shapes only by adding optional fields or widening.
export default defineSchema({
  memoryControls: defineTable({
    scope: v.string(),
    learning: v.boolean(),
    recall: v.boolean(),
    blockedTopics: v.array(v.string()),
    generation: v.number(),
  }).index('scope', ['scope']),
  memoryItems: defineTable({
    scope: v.string(),
    text: v.string(),
    condition: v.string(),
    category: categoryValidator,
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    evidence: v.array(evidenceValidator),
    previous: v.optional(v.object({ text: v.string(), condition: v.string() })),
  }).index('scope', ['scope']),
  memoryTombstones: defineTable({ scope: v.string(), key: v.string() }).index(
    'key',
    ['scope', 'key'],
  ),
  memoryJobs: defineTable({
    scope: v.string(),
    key: v.string(),
    source: v.string(),
    generation: v.number(),
    status: jobStatus,
    input: v.string(),
    outcome: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index('scope', ['scope'])
    .index('key', ['scope', 'key']),
});
