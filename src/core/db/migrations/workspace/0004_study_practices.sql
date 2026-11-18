CREATE TABLE `pretest_attempt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`round_id` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`confidence` integer,
	`seconds` real,
	`answered_at` text NOT NULL,
	`day` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_pretest_attempt_round` ON `pretest_attempt` (`round_id`);--> statement-breakpoint
CREATE INDEX `ix_pretest_attempt_item` ON `pretest_attempt` (`item_id`);--> statement-breakpoint
ALTER TABLE `attempt` ADD `confidence` integer;--> statement-breakpoint
ALTER TABLE `attempt` ADD `release_at` text;--> statement-breakpoint
ALTER TABLE `attempt` ADD `seen_at` text;--> statement-breakpoint
CREATE INDEX `ix_attempt_pending` ON `attempt` (`seen_at`,`release_at`);
--> statement-breakpoint
-- Answers given before this migration already showed their feedback.
UPDATE `attempt` SET `release_at` = `answered_at`, `seen_at` = `answered_at`;
