CREATE TABLE `interrupt_batches` (
	`interrupted_run_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`generation` integer NOT NULL,
	`expected_interrupt_ids_json` text NOT NULL,
	`fingerprint` text NOT NULL,
	`canonical_resolutions` text NOT NULL,
	`resolutions_json` text NOT NULL,
	`continuation_run_id` text NOT NULL,
	`committed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interrupt_batches_continuation_run_id_unique` ON `interrupt_batches` (`continuation_run_id`);
--> statement-breakpoint
CREATE TABLE `__new_interrupts` (
	`interrupt_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`generation` integer NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`payload_json` text NOT NULL,
	`binding_json` text NOT NULL,
	`response_schema_hash` text NOT NULL,
	`response_json` text
);
--> statement-breakpoint
INSERT INTO `__new_interrupts` (
	`interrupt_id`,
	`run_id`,
	`thread_id`,
	`generation`,
	`status`,
	`requested_at`,
	`resolved_at`,
	`payload_json`,
	`binding_json`,
	`response_schema_hash`,
	`response_json`
)
SELECT
	`interrupt_id`,
	`run_id`,
	`thread_id`,
	CASE WHEN `status` = 'pending' THEN 1 ELSE 0 END,
	`status`,
	`requested_at`,
	`resolved_at`,
	`payload_json`,
	json_object(
		'kind', 'generic',
		'interruptId', `interrupt_id`,
		'interruptedRunId', `run_id`,
		'generation', CASE WHEN `status` = 'pending' THEN 1 ELSE 0 END,
		'responseSchemaHash', 'legacy:unknown'
	),
	'legacy:unknown',
	`response_json`
FROM `interrupts`;
--> statement-breakpoint
DROP TABLE `interrupts`;
--> statement-breakpoint
ALTER TABLE `__new_interrupts` RENAME TO `interrupts`;
--> statement-breakpoint
CREATE INDEX `interrupts_thread_status_requested_at_idx` ON `interrupts` (`thread_id`,`status`,`requested_at`);
--> statement-breakpoint
CREATE INDEX `interrupts_run_status_requested_at_idx` ON `interrupts` (`run_id`,`status`,`requested_at`);
