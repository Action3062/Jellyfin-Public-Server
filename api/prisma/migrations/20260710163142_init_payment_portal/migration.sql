-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('nowpayments', 'azteco');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'pending', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "AccountMode" AS ENUM ('existing', 'new');

-- CreateEnum
CREATE TYPE "ProvisionState" AS ENUM ('pending', 'awaiting_registration', 'provisioned', 'failed');

-- CreateEnum
CREATE TYPE "PlexState" AS ENUM ('none', 'pending', 'invited', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "jellyfinUsername" TEXT NOT NULL,
    "jellyfinUserId" TEXT,
    "plexUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price_eur" DECIMAL(10,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AztecoOption" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "eur" DECIMAL(10,2) NOT NULL,
    "days" INTEGER NOT NULL,

    CONSTRAINT "AztecoOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "provider_ref" TEXT,
    "np_payment_id" TEXT,
    "order_id" TEXT NOT NULL,
    "coin" TEXT,
    "amount_eur" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL,
    "plan_id" TEXT,
    "months" INTEGER,
    "days" INTEGER,
    "account_mode" "AccountMode" NOT NULL DEFAULT 'existing',
    "user" TEXT,
    "user_id" TEXT,
    "plex_username" TEXT,
    "plex_state" "PlexState" NOT NULL DEFAULT 'none',
    "claim_token_hash" TEXT,
    "invoice_url" TEXT,
    "invite_code" TEXT,
    "invite_url" TEXT,
    "provision_state" "ProvisionState" NOT NULL DEFAULT 'pending',
    "provisioned_at" TIMESTAMP(3),
    "product" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "value_eur" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tx_ref" TEXT,
    "user" TEXT,
    "product" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "source" "Provider" NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_jellyfinUsername_key" ON "User"("jellyfinUsername");

-- CreateIndex
CREATE UNIQUE INDEX "AztecoOption_product_eur_key" ON "AztecoOption"("product", "eur");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_order_id_key" ON "Payment"("order_id");

-- CreateIndex
CREATE INDEX "Payment_claim_token_hash_idx" ON "Payment"("claim_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_code_hash_key" ON "VoucherRedemption"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_event_id_key" ON "WebhookEvent"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
