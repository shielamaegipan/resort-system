const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const v = require('./validation');
const publicDir = path.join(__dirname, '../uploads');
const privateDir = path.join(__dirname, '../private-uploads');
async function saveImage(input, privateFile = false) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input || '');
  if (!m) v.fail(400, 'Use a JPEG, PNG or WebP image');
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) v.fail(400, 'Image must be at most 5 MB');
  const valid = m[1] === 'png' ? buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : m[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
  if (!valid) v.fail(400, 'Image contents do not match its MIME type');
  const directory = privateFile ? privateDir : publicDir;
  await fs.mkdir(directory, { recursive: true });
  const file = `${randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  await fs.writeFile(path.join(directory, file), buffer, { flag: 'wx' });
  return privateFile ? file : '/uploads/' + file;
}
async function removeImage(file, privateFile = false) {
  if (file) await fs.unlink(path.join(privateFile ? privateDir : publicDir, path.basename(file))).catch(() => {});
}
module.exports = { saveImage, removeImage, privateDir };
