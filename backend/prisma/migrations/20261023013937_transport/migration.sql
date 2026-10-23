-- CreateEnum
CREATE TYPE "VehicleCategory" AS ENUM ('VAN', 'MICRO_ONIBUS', 'ONIBUS_CONVENCIONAL', 'ONIBUS_EXECUTIVO', 'ONIBUS_LD', 'ONIBUS_LDD', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TripSeatStatus" AS ENUM ('LIVRE', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "vehicle_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VehicleCategory" NOT NULL,
    "code" TEXT,
    "capacity" INTEGER NOT NULL,
    "floors" INTEGER NOT NULL DEFAULT 1,
    "aisle_config" TEXT,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_layouts" (
    "id" TEXT NOT NULL,
    "vehicle_template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "layout_data" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_layouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_vehicles" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "vehicle_template_id" TEXT NOT NULL,
    "seat_layout_id" TEXT NOT NULL,
    "layout_version" INTEGER NOT NULL,
    "operational_name" TEXT NOT NULL,
    "identifier" TEXT,
    "driver_name" TEXT,
    "operational_capacity" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_seats" (
    "id" TEXT NOT NULL,
    "trip_vehicle_id" TEXT NOT NULL,
    "seat_number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "seat_type" TEXT NOT NULL DEFAULT 'NORMAL',
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "status" "TripSeatStatus" NOT NULL DEFAULT 'LIVRE',
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "trip_seat_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "assigned_by" TEXT NOT NULL,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_vehicles_trip_id_idx" ON "trip_vehicles"("trip_id");

-- CreateIndex
CREATE INDEX "trip_seats_trip_vehicle_id_idx" ON "trip_seats"("trip_vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_seats_trip_vehicle_id_seat_number_key" ON "trip_seats"("trip_vehicle_id", "seat_number");

-- CreateIndex
CREATE INDEX "seat_assignments_reservation_id_idx" ON "seat_assignments"("reservation_id");

-- CreateIndex
CREATE INDEX "seat_assignments_trip_seat_id_idx" ON "seat_assignments"("trip_seat_id");

-- AddForeignKey
ALTER TABLE "seat_layouts" ADD CONSTRAINT "seat_layouts_vehicle_template_id_fkey" FOREIGN KEY ("vehicle_template_id") REFERENCES "vehicle_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_vehicles" ADD CONSTRAINT "trip_vehicles_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_vehicles" ADD CONSTRAINT "trip_vehicles_vehicle_template_id_fkey" FOREIGN KEY ("vehicle_template_id") REFERENCES "vehicle_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_vehicles" ADD CONSTRAINT "trip_vehicles_seat_layout_id_fkey" FOREIGN KEY ("seat_layout_id") REFERENCES "seat_layouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_seats" ADD CONSTRAINT "trip_seats_trip_vehicle_id_fkey" FOREIGN KEY ("trip_vehicle_id") REFERENCES "trip_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_trip_seat_id_fkey" FOREIGN KEY ("trip_seat_id") REFERENCES "trip_seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RN-003 / spec 7.1: um passageiro por assento e um assento por reserva.
CREATE UNIQUE INDEX "seat_assignments_one_active_per_seat"
  ON "seat_assignments" ("trip_seat_id") WHERE "removed_at" IS NULL;
CREATE UNIQUE INDEX "seat_assignments_one_active_per_reservation"
  ON "seat_assignments" ("reservation_id") WHERE "removed_at" IS NULL;
