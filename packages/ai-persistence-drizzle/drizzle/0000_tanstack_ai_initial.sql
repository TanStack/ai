CREATE TABLE `artifacts` (
	`artifact_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`external_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blobs` (
	`key` text PRIMARY KEY NOT NULL,
	`content_type` text,
	`size` integer,
	`etag` text,
	`custom_metadata_json` text,
	`created_at` integer,
	`updated_at` integer,
	`body` blob
);
--> statement-breakpoint
CREATE TABLE `interrupts` (
	`interrupt_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`payload_json` text NOT NULL,
	`response_json` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`usage_json` text
);
