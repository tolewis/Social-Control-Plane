-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedClientId" TEXT NOT NULL,
    "encryptedClientSecret" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_provider_key" ON "ProviderConfig"("provider");
