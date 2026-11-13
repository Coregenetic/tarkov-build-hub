CREATE TABLE "item_category" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"normalized_name" text NOT NULL,
	"parent_ext_id" text,
	"names" jsonb NOT NULL,
	CONSTRAINT "item_category_dataset_id_ext_id_pk" PRIMARY KEY("dataset_id","ext_id")
);
--> statement-breakpoint
ALTER TABLE "item_category" ADD CONSTRAINT "item_category_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;