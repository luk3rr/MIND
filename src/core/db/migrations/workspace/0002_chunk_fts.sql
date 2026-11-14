CREATE VIRTUAL TABLE `chunk_fts` USING fts5(text, content='chunk', content_rowid='id', tokenize='unicode61 remove_diacritics 2');--> statement-breakpoint
CREATE TRIGGER `chunk_ai` AFTER INSERT ON `chunk` BEGIN INSERT INTO chunk_fts(rowid, text) VALUES (new.id, new.text); END;--> statement-breakpoint
CREATE TRIGGER `chunk_ad` AFTER DELETE ON `chunk` BEGIN INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES ('delete', old.id, old.text); END;--> statement-breakpoint
CREATE TRIGGER `chunk_au` AFTER UPDATE ON `chunk` BEGIN INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES ('delete', old.id, old.text); INSERT INTO chunk_fts(rowid, text) VALUES (new.id, new.text); END;
