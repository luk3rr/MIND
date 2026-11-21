CREATE TABLE `image` (
	`hash` text PRIMARY KEY NOT NULL,
	`ext` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`animated` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
