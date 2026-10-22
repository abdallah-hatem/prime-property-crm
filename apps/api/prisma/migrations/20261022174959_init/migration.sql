-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'NOT_INTERESTED', 'CALL_BACK', 'LISTED', 'DO_NOT_CALL');

-- CreateEnum
CREATE TYPE "listing_purpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('AVAILABLE', 'SOLD', 'RENTED', 'OFF_MARKET');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('APARTMENT', 'DUPLEX', 'PENTHOUSE', 'STUDIO', 'VILLA', 'TOWNHOUSE', 'TWIN_HOUSE', 'CHALET', 'OFFICE', 'SHOP', 'LAND');

-- CreateEnum
CREATE TYPE "furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED');

-- CreateEnum
CREATE TYPE "ad_status" AS ENUM ('NOT_POSTED', 'LIVE', 'TAKEN_DOWN');

-- CreateEnum
CREATE TYPE "reminder_kind" AS ENUM ('MANUAL', 'AD_CHECK_IN', 'AD_TAKE_DOWN');

-- CreateEnum
CREATE TYPE "language" AS ENUM ('en', 'ar');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('IMPORT', 'ASSIGN', 'DELETE', 'RESTORE', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE', 'USER_REACTIVATE', 'PASSWORD_RESET', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DELETE', 'SETTINGS_UPDATE', 'OUTCOME_UPDATE', 'EXPORT');

-- CreateEnum
CREATE TYPE "built_in_role" AS ENUM ('ADMIN', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "import_kind" AS ENUM ('OWNERS', 'LISTINGS');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('MAPPING', 'PREVIEWED', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "import_issue_reason" AS ENUM ('DUPLICATE', 'INVALID_PHONE', 'MISSING_REQUIRED', 'INVALID_VALUE');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "built_in" "built_in_role",
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "language" "language" NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owners" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "assigned_to_id" UUID,
    "source_import_id" UUID,
    "last_call_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" UUID,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_phones" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_phones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_assignments" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "from_member_id" UUID,
    "to_member_id" UUID,
    "by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "owner_id" UUID,
    "owner_name" TEXT NOT NULL,
    "member_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "client_request_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome_id" UUID,
    "note" TEXT,
    "outcome_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_outcomes" (
    "id" UUID NOT NULL,
    "label_en" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "sets_status" "lead_status" NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "kind" "reminder_kind" NOT NULL DEFAULT 'MANUAL',
    "owner_id" UUID,
    "listing_id" UUID,
    "member_id" UUID,
    "due_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "done_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "owner_id" UUID,
    "listing_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "purpose" "listing_purpose" NOT NULL,
    "type" "property_type" NOT NULL,
    "area" TEXT NOT NULL,
    "compound" TEXT,
    "address" TEXT,
    "size_sqm" INTEGER NOT NULL,
    "floor" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "price" INTEGER NOT NULL,
    "furnishing" "furnishing",
    "description" TEXT,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "owner_id" UUID,
    "assigned_to_id" UUID,
    "status" "listing_status" NOT NULL DEFAULT 'AVAILABLE',
    "ad_link" TEXT,
    "ad_status" "ad_status" NOT NULL DEFAULT 'NOT_POSTED',
    "ad_posted_at" TIMESTAMP(3),
    "ad_taken_down_at" TIMESTAMP(3),
    "last_check_in_at" TIMESTAMP(3),
    "source_import_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" UUID,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" UUID,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "kind" "import_kind" NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'MAPPING',
    "headers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mapping" JSONB,
    "assign_to_id" UUID,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "added_count" INTEGER,
    "duplicate_count" INTEGER,
    "rejected_count" INTEGER,
    "error" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "issue" "import_issue_reason",
    "issue_field" TEXT,
    "issue_value" TEXT,
    "match_owner_id" UUID,
    "match_listing_id" UUID,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_entries" (
    "id" UUID NOT NULL,
    "type" "activity_type" NOT NULL,
    "actor_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "target_kind" TEXT,
    "target_id" UUID,
    "target_label" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ad_check_in_days" INTEGER NOT NULL DEFAULT 7,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_built_in_key" ON "roles"("built_in");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_active_idx" ON "users"("active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_id_key" ON "refresh_tokens"("replaced_by_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "owners_assigned_to_id_status_last_call_at_idx" ON "owners"("assigned_to_id", "status", "last_call_at");

-- CreateIndex
CREATE INDEX "owners_status_idx" ON "owners"("status");

-- CreateIndex
CREATE INDEX "owners_created_by_id_idx" ON "owners"("created_by_id");

-- CreateIndex
CREATE INDEX "owners_deleted_by_id_idx" ON "owners"("deleted_by_id");

-- CreateIndex
CREATE INDEX "owners_source_import_id_idx" ON "owners"("source_import_id");

-- CreateIndex
CREATE INDEX "owners_deleted_at_idx" ON "owners"("deleted_at");

-- CreateIndex
CREATE INDEX "owners_name_idx" ON "owners"("name");

-- CreateIndex
CREATE INDEX "owners_area_idx" ON "owners"("area");

-- CreateIndex
CREATE INDEX "owners_created_at_idx" ON "owners"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_phones_phone_key" ON "owner_phones"("phone");

-- CreateIndex
CREATE INDEX "owner_phones_owner_id_idx" ON "owner_phones"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_phones_owner_id_position_key" ON "owner_phones"("owner_id", "position");

-- CreateIndex
CREATE INDEX "owner_assignments_owner_id_created_at_idx" ON "owner_assignments"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "owner_assignments_from_member_id_idx" ON "owner_assignments"("from_member_id");

-- CreateIndex
CREATE INDEX "owner_assignments_to_member_id_idx" ON "owner_assignments"("to_member_id");

-- CreateIndex
CREATE INDEX "owner_assignments_by_id_idx" ON "owner_assignments"("by_id");

-- CreateIndex
CREATE INDEX "calls_owner_id_started_at_idx" ON "calls"("owner_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_member_id_started_at_idx" ON "calls"("member_id", "started_at");

-- CreateIndex
CREATE INDEX "calls_outcome_id_idx" ON "calls"("outcome_id");

-- CreateIndex
CREATE INDEX "calls_started_at_idx" ON "calls"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "calls_member_id_client_request_id_key" ON "calls"("member_id", "client_request_id");

-- CreateIndex
CREATE INDEX "call_outcomes_order_idx" ON "call_outcomes"("order");

-- CreateIndex
CREATE INDEX "reminders_member_id_done_at_due_at_idx" ON "reminders"("member_id", "done_at", "due_at");

-- CreateIndex
CREATE INDEX "reminders_owner_id_done_at_idx" ON "reminders"("owner_id", "done_at");

-- CreateIndex
CREATE INDEX "reminders_listing_id_kind_done_at_idx" ON "reminders"("listing_id", "kind", "done_at");

-- CreateIndex
CREATE INDEX "reminders_created_by_id_idx" ON "reminders"("created_by_id");

-- CreateIndex
CREATE INDEX "reminders_due_at_idx" ON "reminders"("due_at");

-- CreateIndex
CREATE INDEX "notes_owner_id_created_at_idx" ON "notes"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "notes_listing_id_created_at_idx" ON "notes"("listing_id", "created_at");

-- CreateIndex
CREATE INDEX "notes_author_id_idx" ON "notes"("author_id");

-- CreateIndex
CREATE INDEX "listings_owner_id_idx" ON "listings"("owner_id");

-- CreateIndex
CREATE INDEX "listings_owner_phone_idx" ON "listings"("owner_phone");

-- CreateIndex
CREATE INDEX "listings_status_purpose_type_price_idx" ON "listings"("status", "purpose", "type", "price");

-- CreateIndex
CREATE INDEX "listings_assigned_to_id_status_idx" ON "listings"("assigned_to_id", "status");

-- CreateIndex
CREATE INDEX "listings_ad_status_status_idx" ON "listings"("ad_status", "status");

-- CreateIndex
CREATE INDEX "listings_area_compound_idx" ON "listings"("area", "compound");

-- CreateIndex
CREATE INDEX "listings_price_idx" ON "listings"("price");

-- CreateIndex
CREATE INDEX "listings_size_sqm_idx" ON "listings"("size_sqm");

-- CreateIndex
CREATE INDEX "listings_bedrooms_idx" ON "listings"("bedrooms");

-- CreateIndex
CREATE INDEX "listings_bathrooms_idx" ON "listings"("bathrooms");

-- CreateIndex
CREATE INDEX "listings_floor_idx" ON "listings"("floor");

-- CreateIndex
CREATE INDEX "listings_created_by_id_created_at_idx" ON "listings"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "listings_deleted_by_id_idx" ON "listings"("deleted_by_id");

-- CreateIndex
CREATE INDEX "listings_source_import_id_idx" ON "listings"("source_import_id");

-- CreateIndex
CREATE INDEX "listings_deleted_at_idx" ON "listings"("deleted_at");

-- CreateIndex
CREATE INDEX "listings_created_at_idx" ON "listings"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "listings_owner_id_live_key" ON "listings"("owner_id") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "listings_owner_phone_live_key" ON "listings"("owner_phone") WHERE (deleted_at IS NULL);

-- CreateIndex
CREATE INDEX "photos_listing_id_order_idx" ON "photos"("listing_id", "order");

-- CreateIndex
CREATE INDEX "photos_deleted_by_id_idx" ON "photos"("deleted_by_id");

-- CreateIndex
CREATE INDEX "photos_deleted_at_idx" ON "photos"("deleted_at");

-- CreateIndex
CREATE INDEX "import_jobs_kind_created_at_idx" ON "import_jobs"("kind", "created_at");

-- CreateIndex
CREATE INDEX "import_jobs_created_by_id_idx" ON "import_jobs"("created_by_id");

-- CreateIndex
CREATE INDEX "import_jobs_assign_to_id_idx" ON "import_jobs"("assign_to_id");

-- CreateIndex
CREATE INDEX "import_rows_job_id_issue_idx" ON "import_rows"("job_id", "issue");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_job_id_row_number_key" ON "import_rows"("job_id", "row_number");

-- CreateIndex
CREATE INDEX "activity_entries_created_at_idx" ON "activity_entries"("created_at");

-- CreateIndex
CREATE INDEX "activity_entries_actor_id_created_at_idx" ON "activity_entries"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_entries_type_created_at_idx" ON "activity_entries"("type", "created_at");

-- CreateIndex
CREATE INDEX "activity_entries_target_kind_target_id_idx" ON "activity_entries"("target_kind", "target_id");

-- CreateIndex
CREATE INDEX "settings_updated_by_id_idx" ON "settings"("updated_by_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owners" ADD CONSTRAINT "owners_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_phones" ADD CONSTRAINT "owner_phones_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_assignments" ADD CONSTRAINT "owner_assignments_by_id_fkey" FOREIGN KEY ("by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_outcome_id_fkey" FOREIGN KEY ("outcome_id") REFERENCES "call_outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_source_import_id_fkey" FOREIGN KEY ("source_import_id") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_assign_to_id_fkey" FOREIGN KEY ("assign_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Guards Prisma's schema language can't express. Added by hand; Prisma ignores
-- CHECK constraints when diffing, so later migrations leave them alone.
-- ---------------------------------------------------------------------------

-- A reminder or note belongs to exactly one owner or one listing.
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_owner_xor_listing_check"
  CHECK (("owner_id" IS NULL) <> ("listing_id" IS NULL));
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_xor_listing_check"
  CHECK (("owner_id" IS NULL) <> ("listing_id" IS NULL));

-- Listing price is a whole EGP amount from 1 to 1,000,000,000; size and room counts are sane.
ALTER TABLE "listings" ADD CONSTRAINT "listings_price_range_check"
  CHECK ("price" BETWEEN 1 AND 1000000000);
ALTER TABLE "listings" ADD CONSTRAINT "listings_size_sqm_positive_check"
  CHECK ("size_sqm" > 0);
ALTER TABLE "listings" ADD CONSTRAINT "listings_rooms_non_negative_check"
  CHECK (("bedrooms" IS NULL OR "bedrooms" >= 0) AND ("bathrooms" IS NULL OR "bathrooms" >= 0));

-- No call outcome may set LISTED: only creating a listing does.
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_not_listed_check"
  CHECK ("sets_status" <> 'LISTED');

-- An outcome and its time are set together, once.
ALTER TABLE "calls" ADD CONSTRAINT "calls_outcome_pair_check"
  CHECK (("outcome_id" IS NULL) = ("outcome_at" IS NULL));

-- An owner has at most three phones, in slots 0..2.
ALTER TABLE "owner_phones" ADD CONSTRAINT "owner_phones_position_check"
  CHECK ("position" BETWEEN 0 AND 2);

-- Settings is a single row with an interval of 1-90 days.
ALTER TABLE "settings" ADD CONSTRAINT "settings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_ad_check_in_days_check"
  CHECK ("ad_check_in_days" BETWEEN 1 AND 90);
