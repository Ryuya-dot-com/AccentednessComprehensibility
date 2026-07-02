ALTER TABLE rating_trials ADD COLUMN response_flow TEXT;
ALTER TABLE rating_trials ADD COLUMN dictation_played_at TEXT;
ALTER TABLE rating_trials ADD COLUMN rating_played_at TEXT;
ALTER TABLE rating_trials ADD COLUMN dictation_submit_rt_ms REAL;
ALTER TABLE rating_trials ADD COLUMN rating_submit_rt_ms REAL;
ALTER TABLE rating_trials ADD COLUMN dictation_audio_duration_s REAL;
ALTER TABLE rating_trials ADD COLUMN rating_audio_duration_s REAL;
