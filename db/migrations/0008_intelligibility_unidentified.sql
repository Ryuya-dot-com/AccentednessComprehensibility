ALTER TABLE rating_trials ADD COLUMN intelligibility_response_status TEXT;
ALTER TABLE rating_trials ADD COLUMN intelligibility_unidentified INTEGER NOT NULL DEFAULT 0;
