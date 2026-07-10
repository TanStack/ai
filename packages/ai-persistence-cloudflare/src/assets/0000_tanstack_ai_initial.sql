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

