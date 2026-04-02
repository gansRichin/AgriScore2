
-- Create profiles table
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  iin_bin text,
  role text CHECK (role IN ('applicant','expert')) DEFAULT 'applicant',
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'applicant'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Security definer function to check role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- Create applications table
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number text UNIQUE,
  user_id uuid REFERENCES public.profiles(id),
  producer_name text,
  iin_bin text,
  address_region text,
  address_district text,
  address_akimat text,
  farm_type text DEFAULT 'товарное',
  subsidy_direction text,
  subsidy_name text,
  normative numeric,
  head_count integer,
  total_amount numeric GENERATED ALWAYS AS (normative * head_count) STORED,
  has_land boolean DEFAULT false,
  has_iszh boolean DEFAULT false,
  has_no_debt boolean DEFAULT false,
  has_prev_subsidy boolean DEFAULT false,
  prev_subsidy_used boolean DEFAULT false,
  met_obligations boolean DEFAULT false,
  status text CHECK (status IN ('draft','submitted','under_review','approved','rejected','waitlist','executed')) DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Generate application number via trigger
CREATE OR REPLACE FUNCTION public.generate_application_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.application_number IS NULL THEN
    NEW.application_number := 'AGR-' || upper(substr(gen_random_uuid()::text, 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_application_number
  BEFORE INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.generate_application_number();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Applicants read own or expert reads all" ON public.applications
  FOR SELECT USING (auth.uid() = user_id OR public.get_user_role(auth.uid()) = 'expert');

CREATE POLICY "Applicants insert own applications" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Applicants update own draft or expert updates" ON public.applications
  FOR UPDATE USING (
    (auth.uid() = user_id AND status = 'draft')
    OR public.get_user_role(auth.uid()) = 'expert'
  );

-- Create application_animals table
CREATE TABLE public.application_animals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  inj text NOT NULL,
  bull_number text
);

ALTER TABLE public.application_animals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Animals follow app ownership" ON public.application_animals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id AND (a.user_id = auth.uid() OR public.get_user_role(auth.uid()) = 'expert')
    )
  );

CREATE POLICY "Animals insert with app" ON public.application_animals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Animals delete with app" ON public.application_animals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

-- Create expert_reviews table
CREATE TABLE public.expert_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES public.applications(id),
  expert_id uuid REFERENCES public.profiles(id),
  decision text CHECK (decision IN ('approved','rejected','waitlist')),
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.expert_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Experts insert reviews" ON public.expert_reviews
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'expert');

CREATE POLICY "Read own app reviews or expert reads all" ON public.expert_reviews
  FOR SELECT USING (
    public.get_user_role(auth.uid()) = 'expert'
    OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.id = application_id AND a.user_id = auth.uid()
    )
  );

-- Create subsidy_history table
CREATE TABLE public.subsidy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inj text NOT NULL,
  application_id uuid REFERENCES public.applications(id),
  year integer NOT NULL,
  status text,
  paid_amount numeric
);

ALTER TABLE public.subsidy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read subsidy_history" ON public.subsidy_history
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Experts can insert subsidy_history" ON public.subsidy_history
  FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'expert');
