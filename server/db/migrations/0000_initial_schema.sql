-- Reset users table to base schema
DROP TABLE IF EXISTS `guests`;
DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `templates`;
DROP TABLE IF EXISTS `tiers`;
DROP TABLE IF EXISTS `users`;

-- Create base schema (without reset_token columns)
CREATE TABLE `tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`price` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`guest_limit` integer,
	`has_email_delivery` integer DEFAULT false,
	`has_pdf_export` integer DEFAULT false,
	`has_ai_text_generation` integer DEFAULT false,
	`remove_branding` integer DEFAULT false,
	`has_multiple_variants` integer DEFAULT false,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tiers_slug_unique` ON `tiers` (`slug`);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`preview_image_url` text NOT NULL,
	`html_template` text NOT NULL,
	`css_template` text NOT NULL,
	`color_scheme` text NOT NULL,
	`font_pairings` text NOT NULL,
	`tags` text NOT NULL,
	`minimum_tier_id` integer NOT NULL,
	`created_at` text,
	FOREIGN KEY (`minimum_tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text NOT NULL,
	`couple_name_1` text NOT NULL,
	`couple_name_2` text NOT NULL,
	`date` text NOT NULL,
	`venue` text NOT NULL,
	`venue_address` text NOT NULL,
	`venue_map_url` text,
	`description` text,
	`template_id` integer,
	`customization` text,
	`tier_id` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`stripe_payment_id` text,
	`slug` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);
--> statement-breakpoint
CREATE TABLE `guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`rsvp_status` text DEFAULT 'pending' NOT NULL,
	`plus_one` integer DEFAULT false,
	`plus_one_name` text,
	`token` text NOT NULL,
	`email_sent_at` text,
	`email_opened_at` text,
	`created_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guests_token_unique` ON `guests` (`token`);
