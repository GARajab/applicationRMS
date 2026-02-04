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

    -- New Columns based on recent request
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'applicationNumber') THEN
        ALTER TABLE public.records ADD COLUMN "applicationNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'bpRequestNumber') THEN
        ALTER TABLE public.records ADD COLUMN "bpRequestNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'versionNumber') THEN
        ALTER TABLE public.records ADD COLUMN "versionNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'constructionType') THEN
        ALTER TABLE public.records ADD COLUMN "constructionType" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'ewaFeeStatus') THEN
        ALTER TABLE public.records ADD COLUMN "ewaFeeStatus" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'applicationStatus') THEN
        ALTER TABLE public.records ADD COLUMN "applicationStatus" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'landOwnerId') THEN
        ALTER TABLE public.records ADD COLUMN "landOwnerId" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'ownerNameEn') THEN
        ALTER TABLE public.records ADD COLUMN "ownerNameEn" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'ownerNameAr') THEN
        ALTER TABLE public.records ADD COLUMN "ownerNameAr" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'numberOfAddresses') THEN
        ALTER TABLE public.records ADD COLUMN "numberOfAddresses" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'mouGatedCommunity') THEN
        ALTER TABLE public.records ADD COLUMN "mouGatedCommunity" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'buildingNumber') THEN
        ALTER TABLE public.records ADD COLUMN "buildingNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'roadNumber') THEN
        ALTER TABLE public.records ADD COLUMN "roadNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'plotNumber') THEN
        ALTER TABLE public.records ADD COLUMN "plotNumber" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'titleDeed') THEN
        ALTER TABLE public.records ADD COLUMN "titleDeed" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'buildableArea') THEN
        ALTER TABLE public.records ADD COLUMN "buildableArea" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'momaaLoad') THEN
        ALTER TABLE public.records ADD COLUMN "momaaLoad" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'applicationDate') THEN
        ALTER TABLE public.records ADD COLUMN "applicationDate" TEXT; -- Storing as text to preserve original format or TIMESTAMPTZ if strictly date
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'nationality') THEN
        ALTER TABLE public.records ADD COLUMN "nationality" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'propertyCategory') THEN
        ALTER TABLE public.records ADD COLUMN "propertyCategory" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'usageNature') THEN
        ALTER TABLE public.records ADD COLUMN "usageNature" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'investmentZone') THEN
        ALTER TABLE public.records ADD COLUMN "investmentZone" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'initialPaymentDate') THEN
        ALTER TABLE public.records ADD COLUMN "initialPaymentDate" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'secondPayment') THEN
        ALTER TABLE public.records ADD COLUMN "secondPayment" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'thirdPayment') THEN
        ALTER TABLE public.records ADD COLUMN "thirdPayment" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'errorLog') THEN
        ALTER TABLE public.records ADD COLUMN "errorLog" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'partialExemption') THEN
        ALTER TABLE public.records ADD COLUMN "partialExemption" TEXT;
    END IF;
END $$;

-- 3. Enable Row Level Security (Recommended for production)
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- 4. Create Access Policies
CREATE POLICY "Allow full access to authenticated users" ON public.records
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');