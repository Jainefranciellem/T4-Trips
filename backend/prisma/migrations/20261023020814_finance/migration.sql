-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'OUTRO');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('VALIDO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "CustomerPaymentKind" AS ENUM ('PAGAMENTO', 'REEMBOLSO');

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('FIXO', 'POR_PESSOA');

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_installments" (
    "id" TEXT NOT NULL,
    "payment_plan_id" TEXT NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "payment_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "kind" "CustomerPaymentKind" NOT NULL DEFAULT 'PAGAMENTO',
    "amount" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receipt_file_id" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'VALIDO',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" TEXT,
    "reversal_reason" TEXT,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ATIVO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_expenses" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier_name" TEXT,
    "cost_type" "CostType" NOT NULL DEFAULT 'FIXO',
    "planned_amount" INTEGER NOT NULL,
    "due_date" DATE,
    "notes" TEXT,
    "receipt_file_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "trip_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receipt_file_id" TEXT,
    "status" "EntryStatus" NOT NULL DEFAULT 'VALIDO',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversed_at" TIMESTAMP(3),
    "reversed_by" TEXT,
    "reversal_reason" TEXT,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_reservation_id_key" ON "payment_plans"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_installments_payment_plan_id_installment_number_key" ON "payment_installments"("payment_plan_id", "installment_number");

-- CreateIndex
CREATE INDEX "customer_payments_reservation_id_idx" ON "customer_payments"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "trip_expenses_trip_id_idx" ON "trip_expenses"("trip_id");

-- CreateIndex
CREATE INDEX "expense_payments_expense_id_idx" ON "expense_payments"("expense_id");

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_installments" ADD CONSTRAINT "payment_installments_payment_plan_id_fkey" FOREIGN KEY ("payment_plan_id") REFERENCES "payment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "trip_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Categorias iniciais de despesa (RF-017). is_system: não podem ser apagadas.
INSERT INTO "expense_categories" ("id", "name", "is_system", "updated_at") VALUES
  (gen_random_uuid(), 'Transporte principal', true, now()),
  (gen_random_uuid(), 'Transfer local', true, now()),
  (gen_random_uuid(), 'Hospedagem', true, now()),
  (gen_random_uuid(), 'Café da manhã', true, now()),
  (gen_random_uuid(), 'Alimentação', true, now()),
  (gen_random_uuid(), 'Passeios inclusos', true, now()),
  (gen_random_uuid(), 'Passeios opcionais', true, now()),
  (gen_random_uuid(), 'Fotografia e filmagem', true, now()),
  (gen_random_uuid(), 'Brindes e sorteios', true, now()),
  (gen_random_uuid(), 'Equipe e guias', true, now()),
  (gen_random_uuid(), 'Motoristas', true, now()),
  (gen_random_uuid(), 'Publicidade', true, now()),
  (gen_random_uuid(), 'Taxas', true, now()),
  (gen_random_uuid(), 'Outros', true, now());
