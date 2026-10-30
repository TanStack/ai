import { PGlite } from '@electric-sql/pglite'

const client = new PGlite()

await client.exec(`
  CREATE TABLE chat_threads (
    thread_id text PRIMARY KEY,
    messages_json jsonb NOT NULL,
    updated_at double precision NOT NULL
  );
  CREATE TABLE chat_runs (
    run_id text PRIMARY KEY,
    thread_id text NOT NULL,
    status text NOT NULL,
    started_at double precision NOT NULL,
    finished_at double precision,
    error text,
    error_code text,
    usage_json jsonb,
    sandbox_key text,
    detached_since double precision,
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
    requested_at double precision NOT NULL,
    resolved_at double precision,
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

export const pool = {
  query(text: string, values?: ReadonlyArray<unknown>) {
    return client.query(text, values === undefined ? undefined : [...values])
  },
}
