ALTER TABLE products ADD COLUMN name_en TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN description_en TEXT NOT NULL DEFAULT '';

UPDATE products SET name_en = 'Sea Salt Roll', description_en = 'Baked fresh today, crisp outside and soft inside'
WHERE name = '海盐卷' AND name_en = '';
UPDATE products SET name_en = 'Plain Bagel', description_en = 'Less sugar, with a satisfying chew'
WHERE name = '原味贝果' AND name_en = '';
UPDATE products SET name_en = 'Butter Cookies', description_en = 'Crisp, buttery cookies in a small pack'
WHERE name = '黄油曲奇' AND name_en = '';
