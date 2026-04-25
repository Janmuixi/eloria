ALTER TABLE `events` ADD COLUMN `invitation_type` text NOT NULL DEFAULT 'template';--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `custom_image_path` text;
