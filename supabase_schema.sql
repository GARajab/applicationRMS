-- Schema setup for Planning Dashboard

-- 1. Create the records table
CREATE TABLE IF NOT EXISTS public.records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    label TEXT,
    status TEXT,
    block TEXT,
    zone TEXT,
    "scheduleStartDate" TIMESTAMPTZ,
    "wayleaveNumber" TEXT,
    "accountNumber" TEXT,
    "referenceNumber" TEXT,
    "requireUSP" BOOLEAN DEFAULT false,
    "sentToUSPDate" TIMESTAMPTZ,
    "justification" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns if table exists (Safe migration for existing users)
DO $$
BEGIN
    -- Existing columns checks
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'requireUSP') THEN
        ALTER TABLE public.records ADD COLUMN "requireUSP" BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'sentToUSPDate') THEN
        ALTER TABLE public.records ADD COLUMN "sentToUSPDate" TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'justification') THEN
        ALTER TABLE public.records ADD COLUMN "justification" TEXT;
    END IF;

    -- Batch 1: Previous Infra/Excel Fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'applicationNumber') THEN
        ALTER TABLE public.records ADD COLUMN "applicationNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'plotNumber') THEN
        ALTER TABLE public.records ADD COLUMN "plotNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'momaaLoad') THEN
        ALTER TABLE public.records ADD COLUMN "momaaLoad" TEXT;
    END IF;

    -- Batch 2: New Dashboard Columns (Subtype, Type, Phase, etc.)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'subtype') THEN
        ALTER TABLE public.records ADD COLUMN "subtype" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'type') THEN
        ALTER TABLE public.records ADD COLUMN "type" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'phase') THEN
        ALTER TABLE public.records ADD COLUMN "phase" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'scheduleEndDate') THEN
        ALTER TABLE public.records ADD COLUMN "scheduleEndDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'userConnected') THEN
        ALTER TABLE public.records ADD COLUMN "userConnected" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'createdBy') THEN
        ALTER TABLE public.records ADD COLUMN "createdBy" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'capitalContribution') THEN
        ALTER TABLE public.records ADD COLUMN "capitalContribution" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'nominatedContractor') THEN
        ALTER TABLE public.records ADD COLUMN "nominatedContractor" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'urgent') THEN
        ALTER TABLE public.records ADD COLUMN "urgent" BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'lastShutdown') THEN
        ALTER TABLE public.records ADD COLUMN "lastShutdown" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'planningEngineer') THEN
        ALTER TABLE public.records ADD COLUMN "planningEngineer" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'constructionEngineer') THEN
        ALTER TABLE public.records ADD COLUMN "constructionEngineer" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'supervisor') THEN
        ALTER TABLE public.records ADD COLUMN "supervisor" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'plannedTotalCost') THEN
        ALTER TABLE public.records ADD COLUMN "plannedTotalCost" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'plannedMaterialCost') THEN
        ALTER TABLE public.records ADD COLUMN "plannedMaterialCost" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'plannedServiceCost') THEN
        ALTER TABLE public.records ADD COLUMN "plannedServiceCost" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'paymentDate') THEN
        ALTER TABLE public.records ADD COLUMN "paymentDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'totalPower') THEN
        ALTER TABLE public.records ADD COLUMN "totalPower" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'contractorAssignDate') THEN
        ALTER TABLE public.records ADD COLUMN "contractorAssignDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'workOrder') THEN
        ALTER TABLE public.records ADD COLUMN "workOrder" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'customerCpr') THEN
        ALTER TABLE public.records ADD COLUMN "customerCpr" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'jobType') THEN
        ALTER TABLE public.records ADD COLUMN "jobType" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'governorate') THEN
        ALTER TABLE public.records ADD COLUMN "governorate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'nasCode') THEN
        ALTER TABLE public.records ADD COLUMN "nasCode" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'description') THEN
        ALTER TABLE public.records ADD COLUMN "description" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'mtcContractor') THEN
        ALTER TABLE public.records ADD COLUMN "mtcContractor" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'workflowEntryDate') THEN
        ALTER TABLE public.records ADD COLUMN "workflowEntryDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'contractorPaymentDate') THEN
        ALTER TABLE public.records ADD COLUMN "contractorPaymentDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'installationContractor') THEN
        ALTER TABLE public.records ADD COLUMN "installationContractor" TEXT;
    END IF;
END $$;

-- 3. Create infra_references table for Infra Calculator
DROP TABLE IF EXISTS public.infra_references;
CREATE TABLE public.infra_references (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "applicationNumber" TEXT,
    "bpRequestNumber" TEXT,
    "versionNumber" TEXT,
    "constructionType" TEXT,
    "ewaFeeStatus" TEXT,
    "applicationStatus" TEXT,
    "accountNumber" TEXT,
    "landOwnerId" TEXT,
    "ownerNameEn" TEXT,
    "ownerNameAr" TEXT,
    "numberOfAddresses" TEXT,
    "mouGatedCommunity" TEXT,
    "buildingNumber" TEXT,
    "blockNumber" TEXT,
    "roadNumber" TEXT,
    "plotNumber" TEXT,
    "titleDeed" TEXT,
    "buildableArea" TEXT,
    "momaaLoad" TEXT,
    "date" TEXT,
    "nationality" TEXT,
    "propCategory" TEXT,
    "usageNature" TEXT,
    "investmentZone" TEXT,
    "initialPaymentDate" TEXT,
    "secondPayment" TEXT,
    "thirdPayment" TEXT,
    "errorLog" TEXT,
    "partialExemption" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster search on plot number
CREATE INDEX IF NOT EXISTS idx_infra_plot ON public.infra_references ("plotNumber");

-- 4. Enable Row Level Security (Recommended for production)
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_references ENABLE ROW LEVEL SECURITY;

-- 5. Create Access Policies (Allow Public/Anon Access for this version)
DROP POLICY IF EXISTS "Allow full access to authenticated users" ON public.records;
DROP POLICY IF EXISTS "Allow full access to infra_references for authenticated users" ON public.infra_references;
DROP POLICY IF EXISTS "Allow full access to public users" ON public.records;
DROP POLICY IF EXISTS "Allow full access to infra_references for public users" ON public.infra_references;

CREATE POLICY "Allow full access to public users" ON public.records
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow full access to infra_references for public users" ON public.infra_references
    FOR ALL
    USING (true)
    WITH CHECK (true);
