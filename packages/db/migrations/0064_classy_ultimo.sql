ALTER TABLE "label_settings" ALTER COLUMN "show_logo" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "logo_height_mm" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "logo_padding_bottom_mm" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "show_cut_lines" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "custom_phrase" text;--> statement-breakpoint
ALTER TABLE "label_settings" ADD COLUMN "layout" text DEFAULT 'clasica' NOT NULL;--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_logo_height_check" CHECK ("label_settings"."logo_height_mm" >= 3 and "label_settings"."logo_height_mm" <= 40);--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_logo_padding_check" CHECK ("label_settings"."logo_padding_bottom_mm" >= 0 and "label_settings"."logo_padding_bottom_mm" <= 20);--> statement-breakpoint
ALTER TABLE "label_settings" ADD CONSTRAINT "label_settings_custom_phrase_check" CHECK (length("label_settings"."custom_phrase") <= 120);--> statement-breakpoint
-- Las etiquetas pasan a fondo blanco con el logo arriba: se resetea el fondo que hubiera y se
-- enciende el logo. Las imágenes subidas quedan en label_backgrounds, sin uso, por si hay que volver.
UPDATE "label_settings" SET "background_image_url" = NULL, "show_logo" = true;
