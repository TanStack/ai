-- CreateTable
CREATE TABLE "messages" (
    "thread_id" TEXT NOT NULL PRIMARY KEY,
    "messages_json" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "runs" (
    "run_id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" BIGINT NOT NULL,
    "finished_at" BIGINT,
    "error" TEXT,
    "usage_json" TEXT
);

-- CreateTable
CREATE TABLE "interrupts" (
    "interrupt_id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" BIGINT NOT NULL,
    "resolved_at" BIGINT,
    "payload_json" TEXT NOT NULL,
    "response_json" TEXT
);

-- CreateTable
CREATE TABLE "metadata" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" TEXT NOT NULL,

    PRIMARY KEY ("scope", "key")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "artifact_id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "external_url" TEXT,
    "created_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "blobs" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "content_type" TEXT,
    "size" BIGINT,
    "etag" TEXT,
    "custom_metadata_json" TEXT,
    "created_at" BIGINT,
    "updated_at" BIGINT,
    "body" BLOB
);
