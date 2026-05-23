UPDATE books
SET copies = :copies
WHERE id = :id
RETURNING id, title, author, copies
