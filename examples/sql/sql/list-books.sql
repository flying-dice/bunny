SELECT id, title, author, copies
FROM books
ORDER BY title
LIMIT :limit
