ALTER TABLE "build" ADD COLUMN "latest_dataset_id" integer;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "patch_label" text;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "caliber" text;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "ergonomics" double precision;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "recoil_vertical" integer;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "parts_price" integer;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "part_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "build" ADD COLUMN "fork_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "build_feed_idx" ON "build" USING btree ("status","visibility","created_at");--> statement-breakpoint
CREATE INDEX "build_parts_idx" ON "build" USING gin ("part_ids");--> statement-breakpoint
-- Kennzahlen bestehender Builds aus ihrer neuesten Version übernehmen.
UPDATE "build" b SET
  "latest_dataset_id" = v."dataset_id",
  "patch_label" = v."patch_label",
  "ergonomics" = (v."stats"->>'ergonomics')::double precision,
  "recoil_vertical" = (v."stats"->>'recoilVertical')::integer,
  "parts_price" = (v."stats"->>'partsPrice')::integer,
  "part_ids" = v."part_ids",
  "caliber" = (SELECT i."properties"->>'caliber' FROM "item" i WHERE i."dataset_id" = v."dataset_id" AND i."ext_id" = b."weapon_ext_id")
FROM "build_version" v WHERE v."build_id" = b."id" AND v."version" = b."latest_version";--> statement-breakpoint
UPDATE "build" b SET "fork_count" = (
  SELECT count(*) FROM "build" f JOIN "build_version" v ON v."id" = f."forked_from_version_id"
  WHERE v."build_id" = b."id" AND f."status" = 'published' AND f."visibility" = 'public'
);
