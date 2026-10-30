import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

const client = new PGlite()

await client.exec(`
  CREATE TABLE chat_threads (
    thread_id text PRIMARY KEY,
    messages_json jsonb NOT NULL,
    updated_at bigint NOT NULL
  );
  CREATE TABLE chat_runs (
    run_id text PRIMARY KEY,
    thread_id text NOT NULL,
    status text NOT NULL,
    started_at bigint NOT NULL,
    finished_at bigint,
    error text,
    error_code text,
    usage_json jsonb,
    sandbox_key text,
    detached_since bigint,
    cancel_requested boolean,
    driver_epoch integer,
    parent_run_id text,
    subagent_run_id text,
    name text
  );
  CREATE TABLE chat_interrupts (
    interrupt_id text PRIMARY KEY,
    run_id text NOT NULL,
    thread_id text NOT NULL,
    status text NOT NULL,
    requested_at bigint NOT NULL,
    resolved_at bigint,
    payload_json jsonb NOT NULL,
    response_json jsonb
  );
  CREATE TABLE chat_metadata (
    namespace text NOT NULL,
    key text NOT NULL,
    value_json jsonb NOT NULL,
    PRIMARY KEY (namespace, key)
  );
`)

export const db = drizzle({ client })
