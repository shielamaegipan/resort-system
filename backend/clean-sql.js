const fs = require('fs');
let s = fs.readFileSync('room.sql', 'utf8');

// tanggalin ang DROP TABLE at CREATE TABLE blocks
s = s.replace(/DROP TABLE[^;]*;/gi, '');
s = s.replace(/CREATE TABLE[\s\S]*?;\s*(?=\n|$)/gi, '');
// tanggalin ang ALTER TABLE (primary key / auto_increment) na galing sa export
s = s.replace(/ALTER TABLE[\s\S]*?;\s*(?=\n|$)/gi, '');

fs.writeFileSync('room-data.sql', s);
console.log((s.match(/INSERT INTO/gi) || []).length, 'INSERT statement(s) found');