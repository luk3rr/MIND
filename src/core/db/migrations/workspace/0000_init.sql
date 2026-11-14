CREATE TABLE `attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`seconds` real,
	`answered_at` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_attempt_item_answered` ON `attempt` (`item_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `ix_attempt_day` ON `attempt` (`day`);--> statement-breakpoint
CREATE TABLE `card_state` (
	`item_id` integer PRIMARY KEY NOT NULL,
	`fsrs_json` text NOT NULL,
	`due` text NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_card_state_due` ON `card_state` (`due`);--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`supported` integer NOT NULL,
	`citations_json` text NOT NULL,
	`model` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chunk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`material_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`page` integer,
	`section` text,
	`text` text NOT NULL,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chunk_embedding` (
	`chunk_id` integer PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` blob NOT NULL,
	FOREIGN KEY (`chunk_id`) REFERENCES `chunk`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generation_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subtype` text NOT NULL,
	`material_id` integer,
	`page_from` integer,
	`page_to` integer,
	`topic_id` integer,
	`model` text NOT NULL,
	`requested` integer NOT NULL,
	`generated` integer DEFAULT 0 NOT NULL,
	`discarded_no_source` integer DEFAULT 0 NOT NULL,
	`discarded_invalid` integer DEFAULT 0 NOT NULL,
	`discarded_duplicate` integer DEFAULT 0 NOT NULL,
	`discarded_unsupported` integer DEFAULT 0 NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`approved_unedited` integer DEFAULT 0 NOT NULL,
	`discarded_review` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`discard_log` text DEFAULT '[]' NOT NULL,
	`error_code` text,
	`error_detail` text,
	`job_id` integer,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`kind` text NOT NULL,
	`subtype` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`topic_id` integer,
	`chunk_id` integer,
	`source_title` text DEFAULT '' NOT NULL,
	`source_page` integer,
	`quote` text DEFAULT '' NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`origin` text DEFAULT 'generated' NOT NULL,
	`origin_item_id` integer,
	`created_at` text NOT NULL,
	`approved_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `generation_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chunk_id`) REFERENCES `chunk`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_item_origin_item_id` ON `item` (`origin_item_id`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`error_code` text,
	`error_detail` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `material` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`stored_path` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`page_count` integer,
	`char_count` integer,
	`ocr_confidence` real,
	`job_id` integer,
	`error_code` text,
	`error_detail` text,
	`source_url` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`previous_state_json` text,
	`duration_ms` integer,
	`day` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_review_log_day` ON `review_log` (`day`);--> statement-breakpoint
CREATE TABLE `topic` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_name_unique` ON `topic` (`name`);