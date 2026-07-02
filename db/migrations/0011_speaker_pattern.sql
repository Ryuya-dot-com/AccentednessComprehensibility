ALTER TABLE rating_assignments ADD COLUMN speaker_pattern_index INTEGER;
ALTER TABLE rating_assignments ADD COLUMN speaker_pattern_speaker TEXT;
ALTER TABLE rating_trials ADD COLUMN speaker_pattern_index INTEGER;
ALTER TABLE rating_trials ADD COLUMN speaker_pattern_speaker TEXT;
