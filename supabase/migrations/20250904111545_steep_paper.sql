/*
  # Initial Database Schema for Prep Chef

  1. New Tables
    - `prep_lists` - Kitchen prep lists with items
    - `events` - Catering events and bookings
    - `recipes` - Recipe collection with ingredients and instructions
    - `methods` - Cooking methods and techniques
    - `containers` - Storage containers and equipment
    - `user_profiles` - Extended user profile information

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for company-level data sharing

  3. Indexes
    - Performance indexes for common queries
    - Text search indexes for recipes and methods
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text,
  company_id uuid,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin', 'owner')),
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prep Lists Table
CREATE TABLE IF NOT EXISTS prep_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb,
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Events Table
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  date date NOT NULL,
  invoice_number text,
  prep_items jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'planning' CHECK (status IN ('planning', 'prep', 'active', 'complete')),
  total_servings integer DEFAULT 0,
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Recipes Table
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  ingredients jsonb DEFAULT '[]'::jsonb,
  instructions jsonb DEFAULT '[]'::jsonb,
  yield text,
  prep_time integer,
  cook_time integer,
  total_time integer,
  difficulty text DEFAULT 'Medium' CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  tags jsonb DEFAULT '[]'::jsonb,
  notes text,
  image text,
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Methods Table
CREATE TABLE IF NOT EXISTS methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  video_url text,
  instructions jsonb DEFAULT '[]'::jsonb,
  estimated_time integer,
  difficulty_level text DEFAULT 'Intermediate' CHECK (difficulty_level IN ('Beginner', 'Intermediate', 'Advanced')),
  tags jsonb DEFAULT '[]'::jsonb,
  equipment jsonb DEFAULT '[]'::jsonb,
  tips jsonb DEFAULT '[]'::jsonb,
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Containers Table
CREATE TABLE IF NOT EXISTS containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  size text,
  description text,
  company_id uuid,
  user_id uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prep_lists_user_id ON prep_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_prep_lists_company_id ON prep_lists(company_id);
CREATE INDEX IF NOT EXISTS idx_prep_lists_created_at ON prep_lists(created_at);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_company_id ON events(company_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_recipes_company_id ON recipes(company_id);
CREATE INDEX IF NOT EXISTS idx_recipes_name_gin ON recipes USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_methods_user_id ON methods(user_id);
CREATE INDEX IF NOT EXISTS idx_methods_company_id ON methods(company_id);
CREATE INDEX IF NOT EXISTS idx_methods_category ON methods(category);

CREATE INDEX IF NOT EXISTS idx_containers_user_id ON containers(user_id);
CREATE INDEX IF NOT EXISTS idx_containers_company_id ON containers(company_id);

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for prep_lists
CREATE POLICY "Users can view own prep lists"
  ON prep_lists
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company prep lists"
  ON prep_lists
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own prep lists"
  ON prep_lists
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prep lists"
  ON prep_lists
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prep lists"
  ON prep_lists
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for events
CREATE POLICY "Users can view own events"
  ON events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company events"
  ON events
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own events"
  ON events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON events
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON events
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for recipes
CREATE POLICY "Users can view own recipes"
  ON recipes
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company recipes"
  ON recipes
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own recipes"
  ON recipes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes"
  ON recipes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes"
  ON recipes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for methods
CREATE POLICY "Users can view own methods"
  ON methods
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company methods"
  ON methods
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own methods"
  ON methods
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own methods"
  ON methods
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own methods"
  ON methods
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for containers
CREATE POLICY "Users can view own containers"
  ON containers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view company containers"
  ON containers
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL AND
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own containers"
  ON containers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own containers"
  ON containers
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own containers"
  ON containers
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_prep_lists_updated_at BEFORE UPDATE ON prep_lists FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_methods_updated_at BEFORE UPDATE ON methods FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_containers_updated_at BEFORE UPDATE ON containers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();