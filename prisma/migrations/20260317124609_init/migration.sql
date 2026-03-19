-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('DRAFT', 'DIRECT');

-- CreateEnum
CREATE TYPE "PublishJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RECONCILING', 'CANCELED');

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "encryptedRefresh" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "publishMode" "PublishMode" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "mediaJson" JSONB,
    "scheduledFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "PublishJobStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "receiptJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PublishJob_idempotencyKey_key" ON "PublishJob"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "SocialConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
