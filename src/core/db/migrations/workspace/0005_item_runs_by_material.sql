-- Items written by hand, taken from the reader or made from the error notebook hung on one
-- synthetic run per origin with no material, so they never showed a material. Each one now hangs
-- on a run of its own origin and material (found by its source chunk, or by the question it came
-- from); the ones whose material cannot be found stay where they are.
CREATE TEMP TABLE `_item_material` AS
SELECT `i`.`id` AS `item_id`, `i`.`run_id` AS `run_id`, `c`.`material_id` AS `material_id`
FROM `item` `i`
JOIN `generation_run` `r` ON `r`.`id` = `i`.`run_id`
JOIN `chunk` `c` ON `c`.`id` = `i`.`chunk_id`
WHERE `r`.`material_id` IS NULL AND `r`.`kind` IN ('manual', 'reader') AND `i`.`origin` = `r`.`kind`
UNION ALL
SELECT `i`.`id`, `i`.`run_id`, `q`.`material_id`
FROM `item` `i`
JOIN `generation_run` `r` ON `r`.`id` = `i`.`run_id`
JOIN `item` `o` ON `o`.`id` = `i`.`origin_item_id`
JOIN `generation_run` `q` ON `q`.`id` = `o`.`run_id`
WHERE `r`.`material_id` IS NULL AND `r`.`kind` = 'notebook' AND `q`.`material_id` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `generation_run` (`kind`, `subtype`, `material_id`, `model`, `requested`, `status`, `created_at`, `finished_at`)
SELECT `r`.`kind`, `r`.`subtype`, `m`.`material_id`, `r`.`model`, 0, 'done', `r`.`created_at`, `r`.`finished_at`
FROM (SELECT DISTINCT `run_id`, `material_id` FROM `_item_material`) `m`
JOIN `generation_run` `r` ON `r`.`id` = `m`.`run_id`;
--> statement-breakpoint
UPDATE `item` SET `run_id` = (
  SELECT `g`.`id`
  FROM `_item_material` `m`
  JOIN `generation_run` `old` ON `old`.`id` = `m`.`run_id`
  JOIN `generation_run` `g` ON `g`.`kind` = `old`.`kind` AND `g`.`material_id` = `m`.`material_id`
  WHERE `m`.`item_id` = `item`.`id`
)
WHERE `id` IN (SELECT `item_id` FROM `_item_material`);
--> statement-breakpoint
DROP TABLE `_item_material`;
