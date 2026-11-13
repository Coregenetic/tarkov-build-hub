CREATE TYPE "public"."dataset_status" AS ENUM('preview', 'active', 'archived', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."game_mode" AS ENUM('pvp', 'pve');--> statement-breakpoint
CREATE TYPE "public"."slot_filter_rule" AS ENUM('allowed_category', 'excluded_item', 'excluded_category');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_raw" (
	"dataset_id" integer NOT NULL,
	"part" text NOT NULL,
	"gzip" "bytea" NOT NULL,
	"byte_length" integer NOT NULL,
	CONSTRAINT "dataset_raw_dataset_id_part_pk" PRIMARY KEY("dataset_id","part")
);
--> statement-breakpoint
CREATE TABLE "game_patch" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_patch_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "item" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"normalized_name" text NOT NULL,
	"types" text[] NOT NULL,
	"categories" text[] NOT NULL,
	"properties_type" text,
	"width" smallint,
	"height" smallint,
	"weight" double precision,
	"base_price" integer,
	"avg24h_price" integer,
	"low24h_price" integer,
	"last_scan" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"images" jsonb NOT NULL,
	"properties" jsonb NOT NULL,
	"conflicting_categories" text[] NOT NULL,
	"conflicting_slot_ids" text[] NOT NULL,
	CONSTRAINT "item_dataset_id_ext_id_pk" PRIMARY KEY("dataset_id","ext_id")
);
--> statement-breakpoint
CREATE TABLE "item_conflict" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"conflicting_ext_id" text NOT NULL,
	CONSTRAINT "item_conflict_dataset_id_item_ext_id_conflicting_ext_id_pk" PRIMARY KEY("dataset_id","item_ext_id","conflicting_ext_id")
);
--> statement-breakpoint
CREATE TABLE "item_contains" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"contained_ext_id" text NOT NULL,
	"count" integer NOT NULL,
	"sort" smallint NOT NULL,
	CONSTRAINT "item_contains_dataset_id_item_ext_id_sort_pk" PRIMARY KEY("dataset_id","item_ext_id","sort")
);
--> statement-breakpoint
CREATE TABLE "item_dataset" (
	"id" serial PRIMARY KEY NOT NULL,
	"mode" "game_mode" NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"source_updated_at" timestamp with time zone,
	"checksum" text NOT NULL,
	"status" "dataset_status" DEFAULT 'preview' NOT NULL,
	"patch_id" integer,
	"item_count" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by" text
);
--> statement-breakpoint
CREATE TABLE "item_name" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	CONSTRAINT "item_name_dataset_id_ext_id_lang_pk" PRIMARY KEY("dataset_id","ext_id","lang")
);
--> statement-breakpoint
CREATE TABLE "item_slot" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"slot_ext_id" text NOT NULL,
	"name_id" text NOT NULL,
	"name_key" text,
	"required" boolean NOT NULL,
	"sort" smallint NOT NULL,
	CONSTRAINT "item_slot_dataset_id_item_ext_id_slot_ext_id_pk" PRIMARY KEY("dataset_id","item_ext_id","slot_ext_id")
);
--> statement-breakpoint
CREATE TABLE "slot_allowed_item" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"slot_ext_id" text NOT NULL,
	"allowed_ext_id" text NOT NULL,
	CONSTRAINT "slot_allowed_item_dataset_id_item_ext_id_slot_ext_id_allowed_ext_id_pk" PRIMARY KEY("dataset_id","item_ext_id","slot_ext_id","allowed_ext_id")
);
--> statement-breakpoint
CREATE TABLE "slot_filter" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"slot_ext_id" text NOT NULL,
	"rule" "slot_filter_rule" NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "slot_filter_dataset_id_item_ext_id_slot_ext_id_rule_value_pk" PRIMARY KEY("dataset_id","item_ext_id","slot_ext_id","rule","value")
);
--> statement-breakpoint
CREATE TABLE "slot_name" (
	"dataset_id" integer NOT NULL,
	"key" text NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "slot_name_dataset_id_key_lang_pk" PRIMARY KEY("dataset_id","key","lang")
);
--> statement-breakpoint
ALTER TABLE "dataset_raw" ADD CONSTRAINT "dataset_raw_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item" ADD CONSTRAINT "item_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_conflict" ADD CONSTRAINT "item_conflict_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_contains" ADD CONSTRAINT "item_contains_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_dataset" ADD CONSTRAINT "item_dataset_patch_id_game_patch_id_fk" FOREIGN KEY ("patch_id") REFERENCES "public"."game_patch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_name" ADD CONSTRAINT "item_name_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_slot" ADD CONSTRAINT "item_slot_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_allowed_item" ADD CONSTRAINT "slot_allowed_item_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_filter" ADD CONSTRAINT "slot_filter_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_name" ADD CONSTRAINT "slot_name_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "item_types_idx" ON "item" USING gin ("types");--> statement-breakpoint
CREATE INDEX "item_normalized_name_idx" ON "item" USING btree ("dataset_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "item_dataset_one_active_per_mode" ON "item_dataset" USING btree ("mode") WHERE "item_dataset"."status" = 'active';--> statement-breakpoint
CREATE INDEX "item_dataset_mode_status_idx" ON "item_dataset" USING btree ("mode","status");--> statement-breakpoint
CREATE INDEX "item_name_search_idx" ON "item_name" USING btree ("dataset_id","lang","name");--> statement-breakpoint
CREATE INDEX "slot_allowed_item_reverse_idx" ON "slot_allowed_item" USING btree ("dataset_id","allowed_ext_id");