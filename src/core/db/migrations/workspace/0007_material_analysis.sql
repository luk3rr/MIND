ALTER TABLE `chunk` ADD `role` text;--> statement-breakpoint
ALTER TABLE `chunk` ADD `starts_unit` integer;--> statement-breakpoint
ALTER TABLE `chunk` ADD `unit` integer;--> statement-breakpoint
ALTER TABLE `material` ADD `subject_user` text;--> statement-breakpoint
ALTER TABLE `material` ADD `subject_inferred` text;--> statement-breakpoint
ALTER TABLE `material` ADD `analysis_job_id` integer;--> statement-breakpoint
ALTER TABLE `material` ADD `analyzed_at` text;