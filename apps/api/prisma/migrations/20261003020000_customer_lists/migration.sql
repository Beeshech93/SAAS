-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "listId" UUID;

-- CreateTable
CREATE TABLE "CustomerList" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerListMember" (
    "listId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerListMember_pkey" PRIMARY KEY ("listId","customerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerList_businessId_name_key" ON "CustomerList"("businessId", "name");

-- CreateIndex
CREATE INDEX "CustomerListMember_customerId_idx" ON "CustomerListMember"("customerId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CustomerList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerList" ADD CONSTRAINT "CustomerList_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListMember" ADD CONSTRAINT "CustomerListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "CustomerList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerListMember" ADD CONSTRAINT "CustomerListMember_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

