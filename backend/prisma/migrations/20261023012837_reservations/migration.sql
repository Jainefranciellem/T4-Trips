-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PRE_RESERVA', 'RESERVADA', 'CONFIRMADA', 'PARCIALMENTE_PAGA', 'PAGA', 'ATRASADA', 'CANCELADA', 'REEMBOLSADA', 'LISTA_ESPERA');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "auto_release_holds" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "reservation_status" "ReservationStatus" NOT NULL DEFAULT 'RESERVADA',
    "passenger_name" TEXT NOT NULL,
    "package_price" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "surcharge_amount" INTEGER NOT NULL DEFAULT 0,
    "final_price" INTEGER NOT NULL,
    "is_courtesy" BOOLEAN NOT NULL DEFAULT false,
    "payment_due_date" DATE,
    "hold_expires_at" TIMESTAMP(3),
    "notes" TEXT,
    "public_token_hash" TEXT,
    "public_token_created_at" TIMESTAMP(3),
    "public_token_expires_at" TIMESTAMP(3),
    "public_token_revoked_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_public_token_hash_key" ON "reservations"("public_token_hash");

-- CreateIndex
CREATE INDEX "reservations_trip_id_idx" ON "reservations"("trip_id");

-- CreateIndex
CREATE INDEX "reservations_customer_id_idx" ON "reservations"("customer_id");

-- CreateIndex
CREATE INDEX "reservations_reservation_status_idx" ON "reservations"("reservation_status");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RN-006 / spec 7.1: uma reserva ativa por cliente e viagem.
CREATE UNIQUE INDEX "reservations_one_active_per_customer"
  ON "reservations" ("trip_id", "customer_id")
  WHERE "reservation_status" NOT IN ('CANCELADA', 'REEMBOLSADA');
