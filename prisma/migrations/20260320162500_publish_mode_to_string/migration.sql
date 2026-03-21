-- Convert publishMode from enum to string and migrate values
ALTER TABLE "Draft" ALTER COLUMN "publishMode" SET DATA TYPE TEXT
  USING CASE
    WHEN "publishMode"::text = 'DRAFT'  THEN 'draft-human'
    WHEN "publishMode"::text = 'DIRECT' THEN 'direct-human'
    ELSE "publishMode"::text
  END;

-- Drop the old enum type
DROP TYPE IF EXISTS "PublishMode";
