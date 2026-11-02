-- 持っているカードを、ガチャで引いたカードだけにする（11月2日。オーナー：「カード一覧で有効化されるカードや枚数はガチャで引いたカードのみにして欲しい」）。
-- 買い切りを買ったときに足していたレンタルデッキのカードを除くため、引いた記録（gacha_pulls。user_cards と同じときに作った）から数え直す
DELETE FROM "user_cards";--> statement-breakpoint
INSERT INTO "user_cards" ("user_id", "card_id", "count", "first_at")
SELECT g."user_id", c.card_id, count(*)::int, min(g."created_at")
FROM "gacha_pulls" g
CROSS JOIN LATERAL jsonb_array_elements(g."cards") AS p(pack)
CROSS JOIN LATERAL jsonb_array_elements_text(p.pack) AS c(card_id)
GROUP BY g."user_id", c.card_id;
