PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`created_at` text
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "name", "email_verified", "reset_token", "reset_token_expires_at", "stripe_customer_id", "created_at") SELECT "id", "email", "password_hash", "name", "email_verified", "reset_token", "reset_token_expires_at", "stripe_customer_id", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);
