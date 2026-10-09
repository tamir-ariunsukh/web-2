-- Extensions required by the application schema.
-- Runs once, on first cluster initialisation.

-- citext: case-insensitive email / PNR lookups without functional indexes.
CREATE EXTENSION IF NOT EXISTS "citext";

-- pg_trgm: fast ILIKE search for airport and city autocomplete.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- btree_gist: supports the EXCLUDE constraint that prevents overlapping
-- seat holds on the same flight/seat across concurrent transactions.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- pgcrypto: gen_random_uuid() on PostgreSQL < 13 style call sites.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
