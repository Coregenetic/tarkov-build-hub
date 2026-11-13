CREATE TYPE "public"."build_purpose" AS ENUM('allround', 'cqb', 'long_range', 'silent', 'budget');--> statement-breakpoint
CREATE TYPE "public"."build_status" AS ENUM('published', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."build_visibility" AS ENUM('public', 'unlisted');--> statement-breakpoint
CREATE TABLE "build" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" text NOT NULL,
	"owner_id" integer NOT NULL,
	"mode" "game_mode" NOT NULL,
	"weapon_ext_id" text NOT NULL,
	"title" text NOT NULL,
	"purpose" "build_purpose" NOT NULL,
	"visibility" "build_visibility" DEFAULT 'public' NOT NULL,
	"status" "build_status" DEFAULT 'published' NOT NULL,
	"latest_version" integer NOT NULL,
	"forked_from_version_id" integer,
	"forked_from_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_reason" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "build_draft" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"mode" "game_mode" NOT NULL,
	"weapon_ext_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"purpose" "build_purpose",
	"tree" jsonb NOT NULL,
	"ammo_ext_id" text,
	"base_build_id" integer,
	"forked_from_version_id" integer,
	"forked_from_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"version" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"patch_label" text,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"purpose" "build_purpose" NOT NULL,
	"tree" jsonb NOT NULL,
	"ammo_ext_id" text,
	"part_ids" text[] NOT NULL,
	"stats" jsonb NOT NULL,
	"procurement" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_draft" ADD CONSTRAINT "build_draft_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_draft" ADD CONSTRAINT "build_draft_base_build_id_build_id_fk" FOREIGN KEY ("base_build_id") REFERENCES "public"."build"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_draft" ADD CONSTRAINT "build_draft_forked_from_version_id_build_version_id_fk" FOREIGN KEY ("forked_from_version_id") REFERENCES "public"."build_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_version" ADD CONSTRAINT "build_version_build_id_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_version" ADD CONSTRAINT "build_version_dataset_id_item_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."item_dataset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "build_public_id_unique" ON "build" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "build_owner_idx" ON "build" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "build_weapon_idx" ON "build" USING btree ("mode","weapon_ext_id");--> statement-breakpoint
CREATE INDEX "build_fork_idx" ON "build" USING btree ("forked_from_version_id");--> statement-breakpoint
CREATE INDEX "build_draft_owner_idx" ON "build_draft" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "build_version_unique" ON "build_version" USING btree ("build_id","version");--> statement-breakpoint
CREATE INDEX "build_version_parts_idx" ON "build_version" USING gin ("part_ids");--> statement-breakpoint
-- Veröffentlichte Versionen sind unveränderlich. Löschen (z. B. DSGVO) bleibt möglich.
CREATE FUNCTION "build_version_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'build_version ist unveränderlich (UPDATE verboten)';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "build_version_no_update" BEFORE UPDATE ON "build_version" FOR EACH ROW EXECUTE FUNCTION "build_version_immutable"();--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_forked_from_version_fk" FOREIGN KEY ("forked_from_version_id") REFERENCES "public"."build_version"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "build" ADD CONSTRAINT "build_title_length" CHECK (char_length("title") BETWEEN 4 AND 80);--> statement-breakpoint
ALTER TABLE "build_version" ADD CONSTRAINT "build_version_notes_length" CHECK (char_length("notes") <= 2000);
