-- Adds block-level metadata for the block counterbalanced Cloudflare task.
-- Run once on D1 databases created before block counterbalancing was added.

ALTER TABLE rating_assignments ADD COLUMN block_index INTEGER;
ALTER TABLE rating_assignments ADD COLUMN block_list TEXT;
ALTER TABLE rating_assignments ADD COLUMN within_block_index INTEGER;
ALTER TABLE rating_assignments ADD COLUMN block_trial_count INTEGER;

ALTER TABLE rating_trials ADD COLUMN block_index INTEGER;
ALTER TABLE rating_trials ADD COLUMN block_list TEXT;
ALTER TABLE rating_trials ADD COLUMN within_block_index INTEGER;
ALTER TABLE rating_trials ADD COLUMN block_trial_count INTEGER;
