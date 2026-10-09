-- =====================================================================
-- MARBSLF SUPABASE MASTER SCHEMA
-- Includes: Tables, RLS, Storage Buckets, and Google OAuth Profile Hook
-- Run in your Supabase SQL Editor: https://supabase.com/dashboard/project/pikjzvukpgdtgskoctre/sql
-- =====================================================================

-- 1. USERS PROFILE TABLE (Section 34 & Section 3: Legal name protected)
CREATE TABLE IF NOT EXISTS public.users (
    user_id TEXT PRIMARY KEY,
    first_name TEXT,
    middle_name TEXT,
    last_name TEXT,
    public_alias TEXT NOT NULL,
    date_of_birth DATE,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    username TEXT,
    province TEXT DEFAULT 'South Cotabato',
    city TEXT DEFAULT 'Koronadal City',
    barangay TEXT DEFAULT 'Zone II',
    account_status TEXT DEFAULT 'ACTIVE', -- ACTIVE, SUSPENDED, BANNED
    verification_status TEXT DEFAULT 'UNVERIFIED', -- UNVERIFIED, PENDING, VERIFIED, REJECTED
    points_balance INTEGER DEFAULT 0,
    role TEXT DEFAULT 'USER', -- USER, ADMIN
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SAFE PICKUP PLACES (Section 15 & 34)
CREATE TABLE IF NOT EXISTS public.safe_pickup_places (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    operating_hours TEXT NOT NULL,
    active_status TEXT DEFAULT 'ACTIVE',
    contact_person TEXT,
    facility_type TEXT
);

-- 3. POSTS TABLE (Section 7, 8, 10, 18, 23, 24, 34)
CREATE TABLE IF NOT EXISTS public.posts (
    post_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    post_type TEXT NOT NULL CHECK (post_type IN ('LOST', 'FOUND')),
    category TEXT NOT NULL,
    item_name TEXT NOT NULL,
    pet_type TEXT,
    breed TEXT,
    pet_name TEXT,
    approximate_size TEXT,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    approximate_time TEXT,
    color TEXT,
    brand TEXT,
    model TEXT,
    serial_number_private TEXT, -- Protected identifying details (hidden from public)
    general_location TEXT NOT NULL, -- Public general zone (e.g. Near Public Market)
    private_coordinates JSONB, -- Protected GPS coordinates
    status TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RESOLVED')),
    reward_status TEXT DEFAULT 'NO_REWARD',
    reward_offered BOOLEAN DEFAULT FALSE,
    reward_amount NUMERIC DEFAULT 0,
    reward_amount_private BOOLEAN DEFAULT TRUE,
    image TEXT NOT NULL,
    camera_verified BOOLEAN DEFAULT FALSE,
    photo_hash TEXT,
    likes_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MATCHES TABLE (Section 12, 13, 34)
CREATE TABLE IF NOT EXISTS public.matches (
    match_id TEXT PRIMARY KEY,
    lost_post_id TEXT,
    found_post_id TEXT,
    claimant_id TEXT REFERENCES public.users(user_id),
    status TEXT DEFAULT 'POTENTIAL_MATCH',
    match_score INTEGER DEFAULT 50,
    qna_responses JSONB, -- Private answers to 6 verification questions
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. SAFE MEETUPS (Section 16, 17, 34)
CREATE TABLE IF NOT EXISTS public.meetups (
    meetup_id TEXT PRIMARY KEY,
    match_id TEXT,
    post_id TEXT REFERENCES public.posts(post_id),
    owner_id TEXT REFERENCES public.users(user_id),
    finder_id TEXT REFERENCES public.users(user_id),
    place_id TEXT REFERENCES public.safe_pickup_places(place_id),
    place_name TEXT,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    owner_confirmed_return BOOLEAN DEFAULT FALSE,
    finder_confirmed_return BOOLEAN DEFAULT FALSE,
    safety_acknowledged BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. MESSAGES TABLE (Section 14 & 34)
CREATE TABLE IF NOT EXISTS public.messages (
    message_id TEXT PRIMARY KEY,
    sender_id TEXT REFERENCES public.users(user_id),
    receiver_id TEXT REFERENCES public.users(user_id),
    post_id TEXT,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'SENT'
);

-- 7. MARBS POINTS LEDGER (Section 19, 20, 21, 34)
CREATE TABLE IF NOT EXISTS public.marbs_points (
    transaction_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    transaction_type TEXT NOT NULL, -- EARNED, REDEEMED, REVERSED
    reason TEXT NOT NULL,
    related_post_id TEXT,
    status TEXT DEFAULT 'APPROVED',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. IDENTITY VERIFICATIONS (Section 4 & 34)
CREATE TABLE IF NOT EXISTS public.id_verifications (
    verification_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES public.users(user_id) ON DELETE CASCADE,
    full_legal_name TEXT NOT NULL,
    id_type TEXT NOT NULL,
    id_image TEXT NOT NULL,
    camera_verified BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'PENDING',
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. SCAM & ABUSE REPORTS (Section 31 & 34)
CREATE TABLE IF NOT EXISTS public.reports (
    report_id TEXT PRIMARY KEY,
    reporter_id TEXT REFERENCES public.users(user_id),
    reported_user_id TEXT,
    reported_post_id TEXT,
    reason TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT DEFAULT 'UNDER_REVIEW',
    admin_action TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. AUDIT LEDGER (Section 34 & 36)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    log_id TEXT PRIMARY KEY,
    admin_id TEXT REFERENCES public.users(user_id),
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- AUTOMATIC PROFILE CREATION TRIGGER FOR GOOGLE AUTH SIGN-IN
-- When a user logs in with Google, this automatically creates their profile!
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    gen_alias TEXT;
    raw_name TEXT;
BEGIN
    gen_alias := 'Verified Citizen #' || SUBSTRING(NEW.id::text FROM 1 FOR 6);
    raw_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Citizen');

    INSERT INTO public.users (
        user_id,
        first_name,
        last_name,
        public_alias,
        email,
        username,
        avatar_url,
        verification_status,
        points_balance,
        role
    )
    VALUES (
        NEW.id::text,
        SPLIT_PART(raw_name, ' ', 1),
        SPLIT_PART(raw_name, ' ', 2),
        gen_alias,
        NEW.email,
        SPLIT_PART(NEW.email, '@', 1),
        NEW.raw_user_meta_data->>'avatar_url',
        'VERIFIED',
        100, -- Welcome Community Helper points
        'USER'
    )
    ON CONFLICT (email) DO UPDATE
    SET avatar_url = EXCLUDED.avatar_url;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- POPULATE KORONADAL SAFE PICKUP PLACES SEED
-- =====================================================================
INSERT INTO public.safe_pickup_places (place_id, name, address, latitude, longitude, operating_hours, active_status, facility_type)
VALUES
('SP-001', 'Koronadal City Hall - Ground Lobby / PNP Desk', 'General Santos Drive, Zone III, Koronadal City', 6.5028, 124.8468, 'Monday - Friday: 8:00 AM - 5:00 PM', 'ACTIVE', 'Government'),
('SP-002', 'Koronadal Central Police Station (PNP)', 'Alunan Avenue, Zone I, Koronadal City', 6.4985, 124.8431, '24/7 Daily', 'ACTIVE', 'Police Station'),
('SP-003', 'Koronadal Public Market Security Office', 'Gensan Drive cor. Morrow St., Koronadal City', 6.4952, 124.8475, 'Daily: 6:00 AM - 7:00 PM', 'ACTIVE', 'Public Market'),
('SP-004', 'KCC Mall of Marbel - Customer Service Counter', 'General Santos Drive, Koronadal City', 6.5011, 124.8447, 'Daily: 9:00 AM - 8:00 PM', 'ACTIVE', 'Mall'),
('SP-005', 'Robinsons Place Koronadal - Info / Security Desk', 'National Highway, Brgy. Morales, Koronadal City', 6.4889, 124.8512, 'Daily: 10:00 AM - 8:00 PM', 'ACTIVE', 'Mall'),
('SP-006', 'KNCHS Main Gate - Guardhouse Station', 'Rizal Avenue, Koronadal City', 6.5042, 124.8419, 'Monday - Friday: 7:00 AM - 6:00 PM', 'ACTIVE', 'School'),
('SP-007', 'Barangay Hall Zone II - Barangay Council Office', 'Brgy. Zone II, Koronadal City', 6.4998, 124.8488, 'Monday - Friday: 8:00 AM - 5:00 PM', 'ACTIVE', 'Barangay Hall')
ON CONFLICT (place_id) DO NOTHING;

-- Enable Row Level Security (RLS) policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_pickup_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Allow public reads
CREATE POLICY "Public read approved posts" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Public read safe places" ON public.safe_pickup_places FOR SELECT USING (true);
CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Public insert posts" ON public.posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update posts" ON public.posts FOR UPDATE USING (true);
CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public insert matches" ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read meetups" ON public.meetups FOR SELECT USING (true);
CREATE POLICY "Public insert meetups" ON public.meetups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update meetups" ON public.meetups FOR UPDATE USING (true);
CREATE POLICY "Public read messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON public.messages FOR INSERT WITH CHECK (true);
