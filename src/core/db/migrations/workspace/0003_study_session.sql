CREATE TABLE `study_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`day` text NOT NULL,
	`material_id` integer,
	`topic_id` integer,
	FOREIGN KEY (`material_id`) REFERENCES `material`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ix_study_session_day` ON `study_session` (`day`);--> statement-breakpoint
CREATE INDEX `ix_study_session_source` ON `study_session` (`source`);