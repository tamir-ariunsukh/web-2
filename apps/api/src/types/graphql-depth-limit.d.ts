/**
 * Minimal type surface for `graphql-depth-limit`, which ships without types.
 * The module is a GraphQL validation rule factory returning a visitor.
 */
declare module 'graphql-depth-limit' {
  import type { ValidationRule } from 'graphql';

  interface DepthLimitOptions {
    /** Ignore the depth of introspection fields. */
    readonly ignore?: readonly string[];
  }

  export default function depthLimit(
    maxDepth: number,
    options?: DepthLimitOptions,
  ): ValidationRule;
}
