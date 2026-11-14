CREATE TABLE `consent` (
	`provider` text PRIMARY KEY NOT NULL,
	`accepted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cost_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`purpose` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_cost_ledger_at` ON `cost_ledger` (`at`);--> statement-breakpoint
CREATE TABLE `model_price` (
	`model` text PRIMARY KEY NOT NULL,
	`prompt_usd_per_token` real NOT NULL,
	`completion_usd_per_token` real NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`folder` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_name_key_unique` ON `workspace` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_folder_unique` ON `workspace` (`folder`);