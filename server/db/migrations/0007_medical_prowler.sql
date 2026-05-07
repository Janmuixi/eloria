CREATE TABLE `companions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guest_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text,
	`attending` integer DEFAULT false NOT NULL,
	`allergies` text,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companions_guest_position_unq` ON `companions` (`guest_id`,`position`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_guest_menu_choices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guest_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`option_id` integer,
	`companion_id` integer,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `menu_courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `menu_options`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`companion_id`) REFERENCES `companions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_guest_menu_choices`("id", "guest_id", "course_id", "option_id", "companion_id", "created_at") SELECT "id", "guest_id", "course_id", "option_id", NULL, "created_at" FROM `guest_menu_choices` WHERE 0;--> statement-breakpoint
DROP TABLE `guest_menu_choices`;--> statement-breakpoint
ALTER TABLE `__new_guest_menu_choices` RENAME TO `guest_menu_choices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `guest_menu_choices_self_unq` ON `guest_menu_choices` (`guest_id`,`course_id`) WHERE "guest_menu_choices"."companion_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `guest_menu_choices_companion_unq` ON `guest_menu_choices` (`guest_id`,`course_id`,`companion_id`) WHERE "guest_menu_choices"."companion_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_events` (
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
	`invitation_type` text DEFAULT 'template' NOT NULL,
	`custom_image_path` text,
	`customization` text,
	`tier_id` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`stripe_payment_id` text,
	`language` text DEFAULT 'en' NOT NULL,
	`allergies_enabled` integer DEFAULT false NOT NULL,
	`slug` text NOT NULL,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "user_id", "title", "couple_name_1", "couple_name_2", "date", "venue", "venue_address", "venue_map_url", "description", "template_id", "invitation_type", "custom_image_path", "customization", "tier_id", "payment_status", "stripe_payment_id", "language", "allergies_enabled", "slug", "created_at") SELECT "id", "user_id", "title", "couple_name_1", "couple_name_2", "date", "venue", "venue_address", "venue_map_url", "description", "template_id", "invitation_type", "custom_image_path", "customization", "tier_id", "payment_status", "stripe_payment_id", "language", "allergies_enabled", "slug", "created_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_guests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`rsvp_status` text DEFAULT 'pending' NOT NULL,
	`companions_allowed` integer DEFAULT 0 NOT NULL,
	`token` text NOT NULL,
	`email_sent_at` text,
	`email_opened_at` text,
	`allergies` text,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_guests`("id", "event_id", "name", "email", "phone", "rsvp_status", "companions_allowed", "token", "email_sent_at", "email_opened_at", "allergies", "created_at") SELECT "id", "event_id", "name", "email", "phone", "rsvp_status", 0, "token", "email_sent_at", "email_opened_at", "allergies", "created_at" FROM `guests` WHERE 0;--> statement-breakpoint
DROP TABLE `guests`;--> statement-breakpoint
ALTER TABLE `__new_guests` RENAME TO `guests`;--> statement-breakpoint
CREATE UNIQUE INDEX `guests_token_unique` ON `guests` (`token`);--> statement-breakpoint
CREATE TABLE `__new_menu_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_menu_courses`("id", "event_id", "name", "sort_order", "created_at") SELECT "id", "event_id", "name", "sort_order", "created_at" FROM `menu_courses`;--> statement-breakpoint
DROP TABLE `menu_courses`;--> statement-breakpoint
ALTER TABLE `__new_menu_courses` RENAME TO `menu_courses`;--> statement-breakpoint
CREATE TABLE `__new_menu_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`course_id`) REFERENCES `menu_courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_menu_options`("id", "course_id", "name", "sort_order", "created_at") SELECT "id", "course_id", "name", "sort_order", "created_at" FROM `menu_options`;--> statement-breakpoint
DROP TABLE `menu_options`;--> statement-breakpoint
ALTER TABLE `__new_menu_options` RENAME TO `menu_options`;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`stripe_subscription_id` text NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`status` text NOT NULL,
	`price` integer NOT NULL,
	`current_period_start` text,
	`current_period_end` text,
	`canceled_at` text,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "user_id", "stripe_subscription_id", "stripe_customer_id", "status", "price", "current_period_start", "current_period_end", "canceled_at", "created_at") SELECT "id", "user_id", "stripe_subscription_id", "stripe_customer_id", "status", "price", "current_period_start", "current_period_end", "canceled_at", "created_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_subscription_id_unique` ON `subscriptions` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `__new_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`category` text NOT NULL,
	`html_template` text NOT NULL,
	`css_template` text NOT NULL,
	`color_scheme` text NOT NULL,
	`font_pairings` text NOT NULL,
	`tags` text NOT NULL,
	`minimum_tier_id` integer NOT NULL,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z',
	FOREIGN KEY (`minimum_tier_id`) REFERENCES `tiers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_templates`("id", "name", "slug", "category", "html_template", "css_template", "color_scheme", "font_pairings", "tags", "minimum_tier_id", "created_at") SELECT "id", "name", "slug", "category", "html_template", "css_template", "color_scheme", "font_pairings", "tags", "minimum_tier_id", "created_at" FROM `templates`;--> statement-breakpoint
DROP TABLE `templates`;--> statement-breakpoint
ALTER TABLE `__new_templates` RENAME TO `templates`;--> statement-breakpoint
CREATE UNIQUE INDEX `templates_slug_unique` ON `templates` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_tiers` (
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
	`created_at` text DEFAULT '2026-05-07T21:28:39.416Z'
);
--> statement-breakpoint
INSERT INTO `__new_tiers`("id", "name", "slug", "price", "sort_order", "guest_limit", "has_email_delivery", "has_pdf_export", "has_ai_text_generation", "remove_branding", "has_multiple_variants", "created_at") SELECT "id", "name", "slug", "price", "sort_order", "guest_limit", "has_email_delivery", "has_pdf_export", "has_ai_text_generation", "remove_branding", "has_multiple_variants", "created_at" FROM `tiers`;--> statement-breakpoint
DROP TABLE `tiers`;--> statement-breakpoint
ALTER TABLE `__new_tiers` RENAME TO `tiers`;--> statement-breakpoint
CREATE UNIQUE INDEX `tiers_slug_unique` ON `tiers` (`slug`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`google_id` text,
	`avatar_url` text,
	`name` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`reset_token` text,
	`reset_token_expires_at` text,
	`stripe_customer_id` text,
	`created_at` text DEFAULT '2026-05-07T21:28:39.417Z'
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "google_id", "avatar_url", "name", "email_verified", "reset_token", "reset_token_expires_at", "stripe_customer_id", "created_at") SELECT "id", "email", "password_hash", "google_id", "avatar_url", "name", "email_verified", "reset_token", "reset_token_expires_at", "stripe_customer_id", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);