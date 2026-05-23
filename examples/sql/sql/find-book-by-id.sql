SELECT id, title, author, copies
FROM books
WHERE id = :id
LIMIT 1
