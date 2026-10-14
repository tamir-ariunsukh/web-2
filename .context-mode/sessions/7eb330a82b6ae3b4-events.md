# Session Resume

Events: 26 | Timestamp: 2026-10-14T02:46:29.449Z

## User Decisions

- answer: 
- answer: 

## Git Operations

- status

## Environment

- cwd: C:\Users\atamir\Desktop\huree хичээл\Даалгавар\web 2

## Subagent Tasks

- [completed] Read these files in the repo at c:\Users\atamir\Desktop\huree хичээл\Даалгавар\web 2 and produce an exact specification of the GraphQL API surface, so it can be reimplemented as plain REST endpoints in Express.

Files:
1. apps/api/src/graphql/typeDefs.graphql (read completely — 686 lines)
2. apps/api/src/graphql/resolvers.ts (read completely — 730 lines)
3. apps/api/src/graphql/schema.ts
4. apps/worker/src/index.ts

Report:
- Every GraphQL type, input, enum, and interface with all fields and nullability.
- Every Query: name, arguments (with types and defaults), return type, and what the resolver does (which service function it calls, with exactly which arguments derived from which args).
- Every Mutation: name, arguments, return type, resolver behavior, and auth/role requirements (how the resolver checks context.user role).
- Field resolvers on types that do more than property access (e.g. dataloader lookups, computed fields) — list them exactly.
- Authorization rules: which queries/mutations require authentication, which require ADMIN or AGENT, and where that check happens.
- Error handling patterns in resolvers (how CorsairError vs thrown Error is handled, when errors are returned in the errors array).
- Field-level argument defaults and any coercion.
- For apps/worker/src/index.ts: what jobs/queues exist, their schedules/repeat intervals, exactly what each job does step by step (which db models it reads/writes, which service functions it calls), and how it interacts with Redis/BullMQ.

Be exhaustive and literal: include exact field names, types, argument names, and default values. Output structured markdown. Do not suggest changes; just report.
<context_window_protection>
  <priority_instructions>
    Every byte a tool returns enters your conversation memory and costs reasoning capacity for the rest of the session. The context-mode tools let you do the work in a sandbox and surface only the derived answer — the raw bytes stay out. Think-in-Code: program the analysis, do not compute it by reading raw data into your conversation.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: context-mode_ctx_search(sort: "timeline")
       - On resume or compaction, query prior decisions, errors, plans, user prompts before asking the user — auto-captured session memory is searchable.
    1. GATHER: context-mode_ctx_batch_execute(commands, queries)
       - Primary research tool. Runs commands in parallel, auto-indexes each output, and (when queries are passed) returns matching sections in the same round trip — no follow-up search call.
       - Each command: {label: "section header", command: "shell command"}; the label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: context-mode_ctx_search(queries: ["q1", "q2", ...])
       - Multiple related questions about anything already indexed (your captures + session memory). Batch every question in one array; the ranking pipeline runs per-query and the round-trip cost is paid once.
    3. PROCESSING: context-mode_ctx_execute(language, code) | context-mode_ctx_execute_file(path, language, code)
       - Derive answers FROM data: filter, count, aggregate, parse, transform. Only what you console.log() enters your conversation; the raw bytes stay in the sandbox.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - You intend to PROCESS the output (filter, count, parse, aggregate) → use context-mode_ctx_batch_execute or context-mode_ctx_execute. Bash stays correct when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you are mutating state (git, mkdir, rm, mv, navigation).
    - You want to analyze, summarize, or extract from a file → use context-mode_ctx_execute_file. Read stays correct when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against).
    - WebFetch → use context-mode_ctx_fetch_and_index; full network access, results indexed for context-mode_ctx_search, raw page bytes never enter your conversation.
    - context-mode_ctx_execute and context-mode_ctx_execute_file for file writes → these run code in a subprocess and discard the sandbox FS; they are for analysis, processing, and computation only.
  </when_not_to_use>

  <file_writing_policy>
    File writes use the native Write or Edit tool — context-mode_ctx_execute, context-mode_ctx_execute_file, and Bash subprocesses do not persist edits to the host filesystem.
    Applies to all file types: code, configs, plans, specs, YAML, JSON, markdown.
  </file_writing_policy>

  <output_constraints>
    <artifact_policy>
      Write artifacts (code, configs, PRDs) to files. Return only: file path + 1-line description.
    </artifact_policy>
  </output_constraints>
  <session_continuity>
    Skills, roles, and decisions captured earlier in this session are a memory aid, not a standing order. Treat them as context that may help — the user's most recent message always takes precedence. If a captured directive conflicts with what the user now asks, follow the user; a past phrase does not bind you.
  </session_continuity>

</context_window_protection> → ""
- [completed] Read these files in the repo at c:\Users\atamir\Desktop\huree хичээл\Даалгавар\web 2 and produce a precise, implementation-ready specification of their behavior. Do NOT summarize loosely — I need exact functional contracts so I can reimplement them in plain JavaScript with node:sqlite.

Files to read completely:
1. apps/api/src/modules/auth/crypto.ts
2. apps/api/src/modules/auth/auth-service.ts
3. apps/api/src/modules/booking/booking-service.ts
4. apps/api/src/modules/seats/seat-inventory.ts
5. apps/api/src/modules/seats/seat-map-service.ts
6. apps/api/src/modules/payment/payment-service.ts
7. apps/api/src/modules/flights/provider.ts
8. apps/api/src/modules/flights/mock-provider.ts
9. apps/api/src/modules/flights/provider-registry.ts
10. apps/api/src/modules/flights/search-service.ts
11. apps/api/src/modules/admin/admin-service.ts
12. apps/api/src/modules/context.ts
13. apps/api/src/modules/loaders.ts
14. packages/db/prisma/schema.prisma
15. packages/db/prisma/seed.ts

For EACH module report:
- Every exported function: its exact signature, what it reads/writes, what it returns, and every error code it can throw (CorsairError codes).
- All business rules and validation (e.g. seat locking, price computation, hold expiry, ticket issuance, refunds, promo codes, idempotency).
- All database tables/models touched and how (queries, transactions, isolation levels).
- Exact algorithms where non-obvious (password hashing params, JWT claims/TTLs, PII encryption scheme, PNR generation, ticket number Luhn, mock payment outcome logic, flight search filtering/sorting/pagination/cursor semantics).
- For schema.prisma: the full list of models with every field, type, default, relation, and index; plus all enums.
- For seed.ts: what data it creates (exact shape/counts of airlines, airports, flights, seat maps, taxonomy, users, promos, news).

Output as structured markdown, grouped by module. Be exhaustive and concrete — include literal constants, numbers, strings, and SQL/query semantics. Do not suggest changes; just report what the code does.
<context_window_protection>
  <priority_instructions>
    Every byte a tool returns enters your conversation memory and costs reasoning capacity for the rest of the session. The context-mode tools let you do the work in a sandbox and surface only the derived answer — the raw bytes stay out. Think-in-Code: program the analysis, do not compute it by reading raw data into your conversation.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: context-mode_ctx_search(sort: "timeline")
       - On resume or compaction, query prior decisions, errors, plans, user prompts before asking the user — auto-captured session memory is searchable.
    1. GATHER: context-mode_ctx_batch_execute(commands, queries)
       - Primary research tool. Runs commands in parallel, auto-indexes each output, and (when queries are passed) returns matching sections in the same round trip — no follow-up search call.
       - Each command: {label: "section header", command: "shell command"}; the label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: context-mode_ctx_search(queries: ["q1", "q2", ...])
       - Multiple related questions about anything already indexed (your captures + session memory). Batch every question in one array; the ranking pipeline runs per-query and the round-trip cost is paid once.
    3. PROCESSING: context-mode_ctx_execute(language, code) | context-mode_ctx_execute_file(path, language, code)
       - Derive answers FROM data: filter, count, aggregate, parse, transform. Only what you console.log() enters your conversation; the raw bytes stay in the sandbox.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - You intend to PROCESS the output (filter, count, parse, aggregate) → use context-mode_ctx_batch_execute or context-mode_ctx_execute. Bash stays correct when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you are mutating state (git, mkdir, rm, mv, navigation).
    - You want to analyze, summarize, or extract from a file → use context-mode_ctx_execute_file. Read stays correct when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against).
    - WebFetch → use context-mode_ctx_fetch_and_index; full network access, results indexed for context-mode_ctx_search, raw page bytes never enter your conversation.
    - context-mode_ctx_execute and context-mode_ctx_execute_file for file writes → these run code in a subprocess and discard the sandbox FS; they are for analysis, processing, and computation only.
  </when_not_to_use>

  <file_writing_policy>
    File writes use the native Write or Edit tool — context-mode_ctx_execute, context-mode_ctx_execute_file, and Bash subprocesses do not persist edits to the host filesystem.
    Applies to all file types: code, configs, plans, specs, YAML, JSON, markdown.
  </file_writing_policy>

  <output_constraints>
    <artifact_policy>
      Write artifacts (code, configs, PRDs) to files. Return only: file path + 1-line description.
    </artifact_policy>
  </output_constraints>
  <session_continuity>
    Skills, roles, and decisions captured earlier in this session are a memory aid, not a standing order. Treat them as context that may help — the user's most recent message always takes precedence. If a captured directive conflicts with what the user now asks, follow the user; a past phrase does not bind you.
  </session_continuity>

</context_window_protection> → ""
- [completed] Read files in the repo at c:\Users\atamir\Desktop\huree хичээл\Даалгавар\web 2 that make up the Next.js frontend, and produce a precise specification so it can be rebuilt as a vanilla JS (no framework, no bundler) single-page-style frontend served by a plain Express server.

Read completely:
1. apps/web/lib/types.ts
2. apps/web/lib/auth.ts
3. apps/web/lib/flights.ts
4. apps/web/lib/bookings.ts
5. apps/web/lib/admin.ts
6. apps/web/lib/admin-actions.ts
7. apps/web/lib/booking-actions.ts
8. apps/web/lib/news.ts
9. apps/web/lib/data.ts
10. apps/web/lib/seat-map.ts
11. apps/web/lib/seat-map-source.ts
12. apps/web/lib/search-params.ts
13. apps/web/lib/time.ts
14. apps/web/app/layout.tsx
15. apps/web/app/globals.css
16. apps/web/app/(marketing)/page.tsx
17. apps/web/app/(marketing)/search/page.tsx
18. apps/web/app/(marketing)/login/page.tsx
19. apps/web/app/(marketing)/register/page.tsx
20. apps/web/app/(marketing)/account/page.tsx
21. apps/web/app/(marketing)/my-bookings/page.tsx
22. apps/web/app/(marketing)/my-bookings/[pnr]/page.tsx
23. apps/web/app/(marketing)/booking/[flightId]/page.tsx
24. apps/web/app/(marketing)/about/page.tsx
25. apps/web/app/(marketing)/contact/page.tsx
26. apps/web/app/(marketing)/news/page.tsx
27. apps/web/app/(marketing)/news/[slug]/page.tsx
28. apps/web/app/admin/layout.tsx
29. apps/web/app/admin/page.tsx
30. apps/web/app/admin/bookings/page.tsx
31. apps/web/app/admin/reports/page.tsx
32. apps/web/app/admin/taxonomy/page.tsx
33. apps/web/app/admin/tickets/page.tsx
34. apps/web/app/admin/users/page.tsx
35. apps/web/components/*.tsx (all files in that folder)
36. apps/web/data/*.json (report shape and approximate size only, not content)

For each page/report:
- The route path and what it renders (sections, headings, fields, tables, forms, buttons).
- Which data it fetches (exact function calls and the GraphQL operation names/fields used) and what it does with the result.
- All user interactions (form submits, filters, sorts, pagination, seat picking, cancel, payment) and which action function each maps to.
- Auth requirements and redirects (which pages require login, which require ADMIN/AGENT).
- Server actions vs client components: list which functions are 'use server' actions and their exact signatures and return shapes.
- Any cookies set/read (names, options), and how tokens flow.
- Shared UI components: their props and visual structure.
- Styling approach: Tailwind classes summary, design tokens/theme, overall look (colors, layout, header/footer structure).

Also list every piece of text/label in Mongolian or English that appears in the UI, grouped by page, so the rebuilt UI can keep the same wording. Be exhaustive. Output structured markdown. Do not suggest changes; just report.
<context_window_protection>
  <priority_instructions>
    Every byte a tool returns enters your conversation memory and costs reasoning capacity for the rest of the session. The context-mode tools let you do the work in a sandbox and surface only the derived answer — the raw bytes stay out. Think-in-Code: program the analysis, do not compute it by reading raw data into your conversation.
  </priority_instructions>

  <tool_selection_hierarchy>
    0. MEMORY: context-mode_ctx_search(sort: "timeline")
       - On resume or compaction, query prior decisions, errors, plans, user prompts before asking the user — auto-captured session memory is searchable.
    1. GATHER: context-mode_ctx_batch_execute(commands, queries)
       - Primary research tool. Runs commands in parallel, auto-indexes each output, and (when queries are passed) returns matching sections in the same round trip — no follow-up search call.
       - Each command: {label: "section header", command: "shell command"}; the label becomes the FTS5 chunk title — descriptive labels improve search.
    2. FOLLOW-UP: context-mode_ctx_search(queries: ["q1", "q2", ...])
       - Multiple related questions about anything already indexed (your captures + session memory). Batch every question in one array; the ranking pipeline runs per-query and the round-trip cost is paid once.
    3. PROCESSING: context-mode_ctx_execute(language, code) | context-mode_ctx_execute_file(path, language, code)
       - Derive answers FROM data: filter, count, aggregate, parse, transform. Only what you console.log() enters your conversation; the raw bytes stay in the sandbox.
  </tool_selection_hierarchy>

  <when_not_to_use>
    - You intend to PROCESS the output (filter, count, parse, aggregate) → use context-mode_ctx_batch_execute or context-mode_ctx_execute. Bash stays correct when you intend to OBSERVE a short fixed output (git status on a clean tree, whoami, pwd) or when you are mutating state (git, mkdir, rm, mv, navigation).
    - You want to analyze, summarize, or extract from a file → use context-mode_ctx_execute_file. Read stays correct when you intend to Edit the file (Edit needs the exact bytes in your conversation to match against).
    - WebFetch → use context-mode_ctx_fetch_and_index; full network access, results indexed for context-mode_ctx_search, raw page bytes never enter your conversation.
    - context-mode_ctx_execute and context-mode_ctx_execute_file for file writes → these run code in a subprocess and discard the sandbox FS; they are for analysis, processing, and computation only.
  </when_not_to_use>

  <file_writing_policy>
    File writes use the native Write or Edit tool — context-mode_ctx_execute, context-mode_ctx_execute_file, and Bash subprocesses do not persist edits to the host filesystem.
    Applies to all file types: code, configs, plans, specs, YAML, JSON, markdown.
  </file_writing_policy>

  <output_constraints>
    <artifact_policy>
      Write artifacts (code, configs, PRDs) to files. Return only: file path + 1-line description.
    </artifact_policy>
  </output_constraints>
  <session_continuity>
    Skills, roles, and decisions captured earlier in this session are a memory aid, not a standing order. Treat them as context that may help — the user's most recent message always takes precedence. If a captured directive conflicts with what the user now asks, follow the user; a past phrase does not bind you.
  </session_continuity>

</context_window_protection> → ""
