/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    memory: {
      claim: FunctionReference<
        "mutation",
        "internal",
        { jobId: string; namespace: string },
        null | {
          memories: Array<{
            category: string;
            condition: string;
            id: string;
            text: string;
          }>;
          text: string;
        },
        Name
      >;
      control: FunctionReference<
        "mutation",
        "internal",
        {
          command:
            | "pause-learning"
            | "resume-learning"
            | "pause-recall"
            | "resume-recall"
            | "block-topic"
            | "unblock-topic";
          namespace: string;
          topic?: string;
        },
        null,
        Name
      >;
      correct: FunctionReference<
        "mutation",
        "internal",
        {
          category?: string;
          condition: string;
          memoryId: string;
          namespace: string;
          requestId: string;
          source: string;
          text: string;
        },
        boolean,
        Name
      >;
      enqueue: FunctionReference<
        "mutation",
        "internal",
        {
          at: number;
          key: string;
          namespace: string;
          source: string;
          text: string;
        },
        string | null,
        Name
      >;
      fail: FunctionReference<
        "mutation",
        "internal",
        { final: boolean; jobId: string; namespace: string; outcome?: string },
        null,
        Name
      >;
      forget: FunctionReference<
        "mutation",
        "internal",
        { memoryId?: string; namespace: string },
        number,
        Name
      >;
      ingest: FunctionReference<
        "mutation",
        "internal",
        {
          explicit?: { requestId: string; source: string; turn: string };
          jobId?: string;
          namespace: string;
          operations: any;
        },
        { accepted: boolean; memoryIds: Array<string>; outcome: string },
        Name
      >;
      inspect: FunctionReference<
        "query",
        "internal",
        { namespace: string },
        {
          blockedTopics: Array<string>;
          generation: number;
          jobs: Array<{
            key: string;
            outcome?: string;
            status: "pending" | "running" | "done" | "failed" | "obsolete";
            updatedAt: number;
          }>;
          learning: boolean;
          memories: Array<{
            category: string;
            condition: string;
            createdAt: number;
            evidence: Array<{
              at: number;
              excerpt: string;
              id: string;
              origin: "explicit" | "automatic" | "correction";
              source: string;
            }>;
            id: string;
            previous?: { condition: string; text: string };
            revision: number;
            text: string;
            updatedAt: number;
          }>;
          recall: boolean;
        },
        Name
      >;
      listNamespaces: FunctionReference<
        "query",
        "internal",
        { cursor?: string },
        { cursor: string | null; namespaces: Array<string> },
        Name
      >;
      purgeNamespace: FunctionReference<
        "mutation",
        "internal",
        { namespace: string },
        boolean,
        Name
      >;
      recall: FunctionReference<
        "query",
        "internal",
        { namespace: string },
        Array<{
          category: string;
          condition: string;
          id: string;
          revision: number;
          text: string;
        }>,
        Name
      >;
      undo: FunctionReference<
        "mutation",
        "internal",
        { memoryId: string; namespace: string },
        boolean,
        Name
      >;
      withdrawPendingSource: FunctionReference<
        "mutation",
        "internal",
        { namespace: string; source: string },
        null,
        Name
      >;
    };
  };
