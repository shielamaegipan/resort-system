-- For a database that has a rooms table but no room image column yet.
-- Run once in phpMyAdmin > SQL tab (the server also adds this column automatically).
USE resort_system;

ALTER TABLE rooms ADD COLUMN image_url VARCHAR(255) NULL AFTER description;
