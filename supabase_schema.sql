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
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add columns if table exists (Safe migration for existing users)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'requireUSP') THEN
        ALTER TABLE public.records ADD COLUMN "requireUSP" BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'records' AND column_name = 'sentToUSPDate') THEN
        ALTER TABLE public.records ADD COLUMN "sentToUSPDate" TIMESTAMPTZ;
    END IF;
END $$;

-- 3. Enable Row Level Security (Recommended for production)
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- 4. Create Access Policies
CREATE POLICY "Allow full access to authenticated users" ON public.records
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');
