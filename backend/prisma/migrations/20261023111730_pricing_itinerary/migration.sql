-- CreateEnum
CREATE TYPE "ContingencyType" AS ENUM ('FIXO', 'PERCENTUAL');

-- CreateTable
CREATE TABLE "pricing_scenarios" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT,
    "name" TEXT NOT NULL,
    "paying_passengers" INTEGER NOT NULL,
    "courtesy_passengers" INTEGER NOT NULL DEFAULT 0,
    "vehicle_capacity" INTEGER,
    "fixed_costs" INTEGER NOT NULL DEFAULT 0,
    "variable_cost_per_person" INTEGER NOT NULL DEFAULT 0,
    "discounts" INTEGER NOT NULL DEFAULT 0,
    "installment_fee_bp" INTEGER NOT NULL DEFAULT 0,
    "contingency_type" "ContingencyType" NOT NULL DEFAULT 'PERCENTUAL',
    "contingency_value" INTEGER NOT NULL DEFAULT 0,
    "desired_margin_bp" INTEGER NOT NULL DEFAULT 0,
    "desired_price" INTEGER,
    "suggested_price" INTEGER NOT NULL,
    "minimum_price" INTEGER NOT NULL,
    "estimated_revenue" INTEGER NOT NULL,
    "estimated_profit" INTEGER NOT NULL,
    "break_even_passengers" INTEGER,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "itinerary_date" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "activity" TEXT NOT NULL,
    "meeting_point" TEXT,
    "included_services" TEXT,
    "public_instructions" TEXT,
    "internal_notes" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pricing_scenarios_trip_id_idx" ON "pricing_scenarios"("trip_id");

-- CreateIndex
CREATE INDEX "itinerary_items_trip_id_itinerary_date_idx" ON "itinerary_items"("trip_id", "itinerary_date");

-- AddForeignKey
ALTER TABLE "pricing_scenarios" ADD CONSTRAINT "pricing_scenarios_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
