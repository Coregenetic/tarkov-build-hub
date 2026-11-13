import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Spieldaten – versioniert je Import (item_dataset).
 * Grundregel: Ein Datensatz wird nach dem Import nie verändert. Neue Daten = neuer Datensatz.
 * Veröffentlichte Builds verweisen später fest auf einen Datensatz.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const gameMode = pgEnum("game_mode", ["pvp", "pve"]);
export const datasetStatus = pgEnum("dataset_status", ["preview", "active", "archived", "discarded"]);

export const gamePatch = pgTable("game_patch", {
  id: serial("id").primaryKey(),
  /** Patch-Bezeichnung, z. B. "0.16.9". Wird beim Freigeben vom Admin vergeben. */
  label: text("label").notNull().unique(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemDataset = pgTable(
  "item_dataset",
  {
    id: serial("id").primaryKey(),
    mode: gameMode("mode").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    checksum: text("checksum").notNull(),
    status: datasetStatus("status").notNull().default("preview"),
    patchId: integer("patch_id").references(() => gamePatch.id, { onDelete: "restrict" }),
    itemCount: integer("item_count").notNull(),
    /** Allgemeine Flohmarkt-Freischaltung (Spielerlevel) laut Quelle. */
    fleaMinPlayerLevel: smallint("flea_min_player_level"),
    /** Prüfbericht des Imports (Zählungen, Warnungen, Fehler). */
    report: jsonb("report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: text("activated_by"),
  },
  (t) => [
    // Höchstens ein aktiver Datensatz je Spielmodus.
    uniqueIndex("item_dataset_one_active_per_mode").on(t.mode).where(sql`${t.status} = 'active'`),
    index("item_dataset_mode_status_idx").on(t.mode, t.status),
  ],
);

/** Unveränderte Rohdaten (gzip) für Fehlersuche und erneuten Import. */
export const datasetRaw = pgTable(
  "dataset_raw",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    /** "items" oder "items_de", "items_en" … */
    part: text("part").notNull(),
    gzip: bytea("gzip").notNull(),
    byteLength: integer("byte_length").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.part] })],
);

export const item = pgTable(
  "item",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    normalizedName: text("normalized_name").notNull(),
    types: text("types").array().notNull(),
    categories: text("categories").array().notNull(),
    propertiesType: text("properties_type"),
    width: smallint("width"),
    height: smallint("height"),
    weight: doublePrecision("weight"),
    basePrice: integer("base_price"),
    avg24hPrice: integer("avg24h_price"),
    low24hPrice: integer("low24h_price"),
    lastScan: timestamp("last_scan", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    images: jsonb("images").notNull(),
    properties: jsonb("properties").notNull(),
    conflictingCategories: text("conflicting_categories").array().notNull(),
    conflictingSlotIds: text("conflicting_slot_ids").array().notNull(),
    /** Eigene Flohmarkt-Sperre (0 = keine eigene, es gilt das allgemeine Level). */
    minLevelForFlea: smallint("min_level_for_flea"),
  },
  (t) => [
    primaryKey({ columns: [t.datasetId, t.extId] }),
    index("item_types_idx").using("gin", t.types),
    index("item_normalized_name_idx").on(t.datasetId, t.normalizedName),
  ],
);

export const itemName = pgTable(
  "item_name",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    lang: text("lang").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.datasetId, t.extId, t.lang] }),
    index("item_name_search_idx").on(t.datasetId, t.lang, t.name),
  ],
);

export const slotName = pgTable(
  "slot_name",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    lang: text("lang").notNull(),
    name: text("name").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.key, t.lang] })],
);

export const itemSlot = pgTable(
  "item_slot",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    slotExtId: text("slot_ext_id").notNull(),
    nameId: text("name_id").notNull(),
    nameKey: text("name_key"),
    required: boolean("required").notNull(),
    sort: smallint("sort").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.itemExtId, t.slotExtId] })],
);

/** Kompatibilität: Welche Items passen in welchen Slot (aus der Quelle, nie geraten). */
export const slotAllowedItem = pgTable(
  "slot_allowed_item",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    slotExtId: text("slot_ext_id").notNull(),
    allowedExtId: text("allowed_ext_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.datasetId, t.itemExtId, t.slotExtId, t.allowedExtId] }),
    index("slot_allowed_item_reverse_idx").on(t.datasetId, t.allowedExtId),
  ],
);

export const slotFilterRule = pgEnum("slot_filter_rule", ["allowed_category", "excluded_item", "excluded_category"]);

/** Seltenere Filterregeln je Slot (Kategorien und Ausschlüsse). */
export const slotFilter = pgTable(
  "slot_filter",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    slotExtId: text("slot_ext_id").notNull(),
    rule: slotFilterRule("rule").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.itemExtId, t.slotExtId, t.rule, t.value] })],
);

/** Items, die sich gegenseitig ausschließen. */
export const itemConflict = pgTable(
  "item_conflict",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    conflictingExtId: text("conflicting_ext_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.itemExtId, t.conflictingExtId] })],
);

/** Bestandteile, z. B. die Teile eines Presets. */
export const itemContains = pgTable(
  "item_contains",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    containedExtId: text("contained_ext_id").notNull(),
    count: integer("count").notNull(),
    sort: smallint("sort").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.itemExtId, t.sort] })],
);

/** Item-Kategorien (z. B. Sturmgewehr) mit Namen. */
export const itemCategory = pgTable(
  "item_category",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    normalizedName: text("normalized_name").notNull(),
    parentExtId: text("parent_ext_id"),
    names: jsonb("names").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.extId] })],
);

/** Händler mit Stufen (Spielerlevel, Ruf, Umsatz) je Datensatz. */
export const trader = pgTable(
  "trader",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    normalizedName: text("normalized_name").notNull(),
    currency: text("currency"),
    /** { de?: string, en?: string } */
    names: jsonb("names").notNull(),
    /** [{ level, requiredPlayerLevel, requiredReputation, requiredCommerce }] */
    levels: jsonb("levels").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.extId] })],
);

/** Kaufangebote der Händler (buyFromTrader). */
export const traderOffer = pgTable(
  "trader_offer",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    itemExtId: text("item_ext_id").notNull(),
    sort: smallint("sort").notNull(),
    traderExtId: text("trader_ext_id").notNull(),
    minTraderLevel: smallint("min_trader_level").notNull(),
    price: doublePrecision("price").notNull(),
    currency: text("currency").notNull(),
    priceRub: integer("price_rub"),
    taskExtId: text("task_ext_id"),
    buyLimit: integer("buy_limit"),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.itemExtId, t.sort] })],
);

/** Tauschangebote der Händler. */
export const barter = pgTable(
  "barter",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    traderExtId: text("trader_ext_id").notNull(),
    minTraderLevel: smallint("min_trader_level").notNull(),
    taskExtId: text("task_ext_id"),
    buyLimit: integer("buy_limit"),
    offeredExtId: text("offered_ext_id").notNull(),
    offeredCount: doublePrecision("offered_count").notNull(),
    /** [{ itemExtId, count }] */
    required: jsonb("required").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.extId] }), index("barter_offered_idx").on(t.datasetId, t.offeredExtId)],
);

/** Aufgaben (nur was für Freischaltungen gebraucht wird). */
export const task = pgTable(
  "task",
  {
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "cascade" }),
    extId: text("ext_id").notNull(),
    traderExtId: text("trader_ext_id"),
    minPlayerLevel: smallint("min_player_level"),
    wikiLink: text("wiki_link"),
    names: jsonb("names").notNull(),
  },
  (t) => [primaryKey({ columns: [t.datasetId, t.extId] })],
);

/* ------------------------------------------------------------------ */
/* Nutzer und Sitzungen – Anmeldung ausschließlich über Twitch.        */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["user", "moderator", "admin"]);

export const appUser = pgTable(
  "app_user",
  {
    id: serial("id").primaryKey(),
    /** Unveränderliche Twitch-User-ID (OIDC "sub"). Einzige Identität. */
    twitchId: text("twitch_id").notNull().unique(),
    /** Twitch-Login in Kleinbuchstaben, für Profil-URLs. Kann sich ändern. */
    login: text("login").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRole("role").notNull().default("user"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("app_user_login_idx").on(t.login)],
);

export const userSession = pgTable(
  "user_session",
  {
    /** SHA-256 des Tokens aus dem Cookie. Der Token selbst wird nie gespeichert. */
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
  },
  (t) => [index("user_session_user_idx").on(t.userId), index("user_session_expires_idx").on(t.expiresAt)],
);

export const nameField = pgEnum("name_field", ["name", "short_name"]);

/**
 * Eigene Anzeigenamen für Items, gesetzt von Admins.
 * Gilt über alle Datensätze hinweg (Schlüssel ist die Item-ID der Quelle),
 * übersteht also jeden Import. Die Originalnamen bleiben in item_name.
 */
export const itemNameOverride = pgTable(
  "item_name_override",
  {
    id: serial("id").primaryKey(),
    extId: text("ext_id").notNull(),
    lang: text("lang").notNull(),
    field: nameField("field").notNull(),
    value: text("value").notNull(),
    note: text("note"),
    /** Wert der Quelle zum Zeitpunkt der Änderung – zeigt später, ob sich das Original geändert hat. */
    sourceValue: text("source_value"),
    createdBy: integer("created_by").references(() => appUser.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("item_name_override_unique").on(t.extId, t.lang, t.field)],
);

/**
 * Protokoll aller Admin-, Moderator- und Systemaktionen.
 * Nur anhängen: Ein Datenbank-Trigger verbietet UPDATE und DELETE.
 * details enthält bei Änderungen { before, after }.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actor: text("actor").notNull(),
    /** Nutzer-ID des Handelnden, falls es ein angemeldeter Nutzer war (bewusst ohne Fremdschlüssel). */
    actorUserId: integer("actor_user_id"),
    action: text("action").notNull(),
    target: text("target").notNull(),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_action_idx").on(t.action, t.at)],
);

/* ------------------------------------------------------------------ */
/* Builds                                                              */
/* ------------------------------------------------------------------ */

export const buildStatus = pgEnum("build_status", ["published", "hidden", "deleted"]);
export const buildVisibility = pgEnum("build_visibility", ["public", "unlisted"]);
export const buildPurpose = pgEnum("build_purpose", ["allround", "cqb", "long_range", "silent", "budget"]);

/**
 * Ein veröffentlichter Build. Der Inhalt steckt in build_version;
 * hier stehen nur Eigentümer, Sichtbarkeit und der Stand der neuesten Version.
 */
export const build = pgTable(
  "build",
  {
    id: serial("id").primaryKey(),
    /** Öffentliche, nicht fortlaufende Kennung für Links (/b/…). */
    publicId: text("public_id").notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "restrict" }),
    mode: gameMode("mode").notNull(),
    weaponExtId: text("weapon_ext_id").notNull(),
    title: text("title").notNull(),
    purpose: buildPurpose("purpose").notNull(),
    visibility: buildVisibility("visibility").notNull().default("public"),
    status: buildStatus("status").notNull().default("published"),
    latestVersion: integer("latest_version").notNull(),
    /** Herkunft einer Variante: die konkrete Version des Originals. */
    forkedFromVersionId: integer("forked_from_version_id"),
    /** Herkunft als Text – bleibt, auch wenn das Original gelöscht wird. */
    forkedFromLabel: text("forked_from_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    hiddenReason: text("hidden_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("build_public_id_unique").on(t.publicId),
    index("build_owner_idx").on(t.ownerId),
    index("build_weapon_idx").on(t.mode, t.weaponExtId),
    index("build_fork_idx").on(t.forkedFromVersionId),
  ],
);

/**
 * Unveränderlicher Schnappschuss einer Veröffentlichung (Trigger verbietet UPDATE).
 * Hält Datensatz und Patch fest, den vollständigen Teilebaum und die damals berechneten Werte.
 */
export const buildVersion = pgTable(
  "build_version",
  {
    id: serial("id").primaryKey(),
    buildId: integer("build_id")
      .notNull()
      .references(() => build.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    datasetId: integer("dataset_id")
      .notNull()
      .references(() => itemDataset.id, { onDelete: "restrict" }),
    patchLabel: text("patch_label"),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    purpose: buildPurpose("purpose").notNull(),
    /** BuildNode: { itemId, slots: { slotId: BuildNode } } */
    tree: jsonb("tree").notNull(),
    ammoExtId: text("ammo_ext_id"),
    /** Alle verbauten Item-IDs inkl. Waffe (für Suche und Filter). */
    partIds: text("part_ids").array().notNull(),
    /** Werte zum Zeitpunkt der Veröffentlichung. */
    stats: jsonb("stats").notNull(),
    /** Beschaffung zum Zeitpunkt der Veröffentlichung. */
    procurement: jsonb("procurement").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("build_version_unique").on(t.buildId, t.version), index("build_version_parts_idx").using("gin", t.partIds)],
);

/** Entwürfe gehören genau einem Nutzer und sind nie öffentlich. */
export const buildDraft = pgTable(
  "build_draft",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    mode: gameMode("mode").notNull(),
    weaponExtId: text("weapon_ext_id").notNull(),
    title: text("title").notNull().default(""),
    notes: text("notes").notNull().default(""),
    purpose: buildPurpose("purpose"),
    tree: jsonb("tree").notNull(),
    ammoExtId: text("ammo_ext_id"),
    /** Gesetzt, wenn der Entwurf eine neue Version eines eigenen Builds wird. */
    baseBuildId: integer("base_build_id").references(() => build.id, { onDelete: "set null" }),
    forkedFromVersionId: integer("forked_from_version_id").references(() => buildVersion.id, { onDelete: "set null" }),
    forkedFromLabel: text("forked_from_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("build_draft_owner_idx").on(t.ownerId, t.updatedAt)],
);
