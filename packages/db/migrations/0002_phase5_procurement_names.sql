CREATE TYPE "public"."name_field" AS ENUM('name', 'short_name');--> statement-breakpoint
CREATE TABLE "barter" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"trader_ext_id" text NOT NULL,
	"min_trader_level" smallint NOT NULL,
	"task_ext_id" text,
	"buy_limit" integer,
	"offered_ext_id" text NOT NULL,
	"offered_count" double precision NOT NULL,
	"required" jsonb NOT NULL,
	CONSTRAINT "barter_dataset_id_ext_id_pk" PRIMARY KEY("dataset_id","ext_id")
);
--> statement-breakpoint
CREATE TABLE "item_name_override" (
	"id" serial PRIMARY KEY NOT NULL,
	"ext_id" text NOT NULL,
	"lang" text NOT NULL,
	"field" "name_field" NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"source_value" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"trader_ext_id" text,
	"min_player_level" smallint,
	"wiki_link" text,
	"names" jsonb NOT NULL,
	CONSTRAINT "task_dataset_id_ext_id_pk" PRIMARY KEY("dataset_id","ext_id")
);
--> statement-breakpoint
CREATE TABLE "trader" (
	"dataset_id" integer NOT NULL,
	"ext_id" text NOT NULL,
	"normalized_name" text NOT NULL,
	"currency" text,
	"names" jsonb NOT NULL,
	"levels" jsonb NOT NULL,
	CONSTRAINT "trader_dataset_id_ext_id_pk" PRIMARY KEY("dataset_id","ext_id")
);
--> statement-breakpoint
CREATE TABLE "trader_offer" (
	"dataset_id" integer NOT NULL,
	"item_ext_id" text NOT NULL,
	"sort" smallint NOT NULL,
	"trader_ext_id" text NOT NULL,
	"min_trader_level" smallint NOT NULL,
	"price" double precision NOT NULL,
	"currency" text NOT NULL,
	"price_rub" integer,
	"task_ext_id" text,
	"buy_limit" integer,
	CONSTRAINT "trader_offer_dataset_id_item_ext_id_sort_pk" PRIMARY KEY("dataset_id","item_ext_id","sort")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_user_id" integer;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "min_level_for_flea" smallint;--> statement-breakpoint
ALTER TABLE "item_dataset" ADD COLUMN "flea_min_player_level" smallint;--> statement-breakpoint
ALTER TABLE "barter" ADD CONSTRAINT "barter_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_name_override" ADD CONSTRAINT "item_name_override_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader" ADD CONSTRAINT "trader_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader_offer" ADD CONSTRAINT "trader_offer_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "barter_offered_idx" ON "barter" USING btree ("dataset_id","offered_ext_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_name_override_unique" ON "item_name_override" USING btree ("ext_id","lang","field");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","at");--> statement-breakpoint
-- Protokoll ist nur anhängbar: Änderungen und Löschungen werden von der Datenbank abgelehnt.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log ist nur anhängbar (% verboten)', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_no_update_delete" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
