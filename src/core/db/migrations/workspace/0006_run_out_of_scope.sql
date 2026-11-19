ALTER TABLE `generation_run` ADD `discarded_out_of_scope` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_run` ADD `rounds` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `generation_run` ADD `with_analysis` integer DEFAULT 0 NOT NULL;