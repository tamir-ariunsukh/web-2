import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeExecutableSchema } from '@graphql-tools/schema';

import { resolvers } from './resolvers.js';

import type { GraphQLSchema } from 'graphql';


const here = dirname(fileURLToPath(import.meta.url));

/**
 * Loads the SDL from `typeDefs.graphql` at startup. Reading from a file keeps the
 * schema diffable and lets codegen consume the same source of truth as the server.
 */
export function buildSchema(): GraphQLSchema {
  const typeDefs = readFileSync(join(here, 'typeDefs.graphql'), 'utf8');
  return makeExecutableSchema({ typeDefs, resolvers });
}
