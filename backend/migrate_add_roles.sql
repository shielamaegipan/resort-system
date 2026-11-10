-- For a database that has a users table but no role column yet.
-- Run once in phpMyAdmin > SQL tab.
USE resort_system;

ALTER TABLE users
  ADD COLUMN role ENUM('admin','staff','guest') NOT NULL DEFAULT 'guest' AFTER password_hash;
