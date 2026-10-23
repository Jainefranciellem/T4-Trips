-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('INDIVIDUAL', 'CASAL', 'DUPLO', 'TRIPLO', 'QUADRUPLO', 'QUINTUPLO', 'SEXTUPLO', 'PERSONALIZADO');

-- CreateTable
CREATE TABLE "accommodations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_rooms" (
    "id" TEXT NOT NULL,
    "accommodation_id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT,
    "room_type" "RoomType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "beds" INTEGER NOT NULL,
    "floor" TEXT,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_accommodations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "accommodation_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_accommodations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_rooms" (
    "id" TEXT NOT NULL,
    "trip_accommodation_id" TEXT NOT NULL,
    "accommodation_room_id" TEXT NOT NULL,
    "capacity_override" INTEGER,
    "notes" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_assignments" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "trip_room_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "assigned_by" TEXT NOT NULL,

    CONSTRAINT "room_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_rooms_accommodation_id_identifier_key" ON "accommodation_rooms"("accommodation_id", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "trip_accommodations_trip_id_accommodation_id_key" ON "trip_accommodations"("trip_id", "accommodation_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_rooms_trip_accommodation_id_accommodation_room_id_key" ON "trip_rooms"("trip_accommodation_id", "accommodation_room_id");

-- CreateIndex
CREATE INDEX "room_assignments_reservation_id_idx" ON "room_assignments"("reservation_id");

-- CreateIndex
CREATE INDEX "room_assignments_trip_room_id_idx" ON "room_assignments"("trip_room_id");

-- AddForeignKey
ALTER TABLE "accommodation_rooms" ADD CONSTRAINT "accommodation_rooms_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "accommodations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_accommodations" ADD CONSTRAINT "trip_accommodations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_accommodations" ADD CONSTRAINT "trip_accommodations_accommodation_id_fkey" FOREIGN KEY ("accommodation_id") REFERENCES "accommodations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_rooms" ADD CONSTRAINT "trip_rooms_trip_accommodation_id_fkey" FOREIGN KEY ("trip_accommodation_id") REFERENCES "trip_accommodations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_rooms" ADD CONSTRAINT "trip_rooms_accommodation_room_id_fkey" FOREIGN KEY ("accommodation_room_id") REFERENCES "accommodation_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_trip_room_id_fkey" FOREIGN KEY ("trip_room_id") REFERENCES "trip_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RN-005 / spec 7.1: um quarto ativo por reserva.
CREATE UNIQUE INDEX "room_assignments_one_active_per_reservation"
  ON "room_assignments" ("reservation_id") WHERE "removed_at" IS NULL;
