CREATE TABLE "staff_message_locations" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"label" text,
	CONSTRAINT "staff_message_locations_coordinates_check" CHECK ("staff_message_locations"."latitude" between -90 and 90 and "staff_message_locations"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "staff_message_references" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	CONSTRAINT "staff_message_references_resource_type_check" CHECK ("staff_message_references"."resource_type" in ('order', 'customer'))
);
--> statement-breakpoint
ALTER TABLE "staff_message_locations" ADD CONSTRAINT "staff_message_locations_message_id_staff_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."staff_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_message_references" ADD CONSTRAINT "staff_message_references_message_id_staff_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."staff_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_message_references_resource_idx" ON "staff_message_references" USING btree ("resource_type","resource_id");