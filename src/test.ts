import type { TestConvex } from 'convex-test';
import type { GenericSchema, SchemaDefinition } from 'convex/server';
import { componentsGeneric } from 'convex/server';
import { api } from './component/_generated/api.js';
import type { ComponentApi } from './component/_generated/component.js';
import schema from './component/schema.js';

/** The component's modules for convex-test, listed explicitly so runners
 * without `import.meta.glob` (bun, node) can load them. */
export const modules: Record<string, () => Promise<unknown>> = {
  './memory.ts': () => import('./component/memory.js'),
  './_generated/api.ts': () => import('./component/_generated/api.js'),
};

/**
 * Registers the component with a convex-test instance.
 * @param t - The test instance, e.g. from `convexTest(schema, modules)`.
 * @param name - The mount name used in the app's convex.config.ts.
 * @returns The component reference to pass to `new PersonalMemory(...)`.
 */
export function register<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(t: TestConvex<Schema>, name = 'personalMemory') {
  t.registerComponent(name, schema, modules);
  return (componentsGeneric() as Record<string, unknown>)[name] as ComponentApi;
}

/** The component's own public API, for running it as the root app in a
 * test (`convexTest(schema, modules)`), e.g. to inspect its tables. */
export const componentApi = api;

export { schema };
export default { register, schema, modules };
