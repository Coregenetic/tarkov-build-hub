CREATE TYPE "public"."comment_status" AS ENUM('visible', 'hidden', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'offensive', 'wrong_info', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('build', 'comment');--> statement-breakpoint
CREATE TABLE "build_bookmark" (
	"user_id" integer NOT NULL,
	"build_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_bookmark_user_id_build_id_pk" PRIMARY KEY("user_id","build_id")
);
--> statement-breakpoint
CREATE TABLE "build_comment" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "build_like" (
	"user_id" integer NOT NULL,
	"build_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "build_like_user_id_build_id_pk" PRIMARY KEY("user_id","build_id")
);
--> statement-breakpoint
CREATE TABLE "daily_counter" (
	"day" text NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_counter_day_key_pk" PRIMARY KEY("day","key")
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" integer NOT NULL,
	"reporter_id" integer NOT NULL,
	"reason" "report_reason" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "search_miss" (
	"day" text NOT NULL,
	"query" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "search_miss_day_query_pk" PRIMARY KEY("day","query")
);
--> statement-breakpoint
CREATE TABLE "site_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "user_activity_day" (
	"day" text NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "user_activity_day_day_user_id_pk" PRIMARY KEY("day","user_id")
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "banned_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "comment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "build_bookmark" ADD CONSTRAINT "build_bookmark_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_bookmark" ADD CONSTRAINT "build_bookmark_build_id_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_build_id_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_like" ADD CONSTRAINT "build_like_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_like" ADD CONSTRAINT "build_like_build_id_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."build"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_app_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_day" ADD CONSTRAINT "user_activity_day_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "build_comment_build_idx" ON "build_comment" USING btree ("build_id","created_at");--> statement-breakpoint
CREATE INDEX "build_comment_author_idx" ON "build_comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "build_like_build_idx" ON "build_like" USING btree ("build_id");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "report_target_idx" ON "report" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "report_open_unique" ON "report" USING btree ("target_type","target_id","reporter_id") WHERE status = 'open';--> statement-breakpoint
ALTER TABLE "build_comment" ADD CONSTRAINT "build_comment_body_length" CHECK (char_length("body") BETWEEN 1 AND 1000);--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_note_length" CHECK (char_length("note") <= 500);
