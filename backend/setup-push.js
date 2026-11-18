// Configure a local deployment without committing or rotating its private keys.
const fs = require('node:fs');
const path = require('node:path');
const { createECDH } = require('node:crypto');
const dotenv = require('dotenv');
const webpush = require('web-push');
const filename = path.join(__dirname, '.env');
try {
  const exists = fs.existsSync(filename);
  let content = fs.readFileSync(exists ? filename : path.join(__dirname, '.env.example'), 'utf8');
  const config = { ...dotenv.parse(content), ...process.env };
  if (config.VAPID_PUBLIC_KEY || config.VAPID_PRIVATE_KEY) {
    if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) throw Error('Both VAPID keys are required. Existing configuration was preserved.');
    webpush.setVapidDetails(config.VAPID_SUBJECT || 'mailto:you@example.com', config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);
    const key = createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(config.VAPID_PRIVATE_KEY, 'base64url'));
    if (key.getPublicKey().toString('base64url') !== config.VAPID_PUBLIC_KEY) throw Error('VAPID keys do not match. Existing configuration was preserved.');
    console.log('Existing VAPID key pair is valid and was preserved.');
  } else {
    const keys = webpush.generateVAPIDKeys();
    for (const [name, value] of [['VAPID_PUBLIC_KEY', keys.publicKey], ['VAPID_PRIVATE_KEY', keys.privateKey]]) {
      const pattern = new RegExp(`^${name}=.*$`, 'm');
      content = pattern.test(content) ? content.replace(pattern, `${name}=${value}`) : `${content.trimEnd()}\n${name}=${value}\n`;
    }
    fs.writeFileSync(filename, content, exists ? undefined : { flag: 'wx' });
    console.log('VAPID keys saved in backend/.env. Private keys were not printed.');
  }
  console.log('Restart the backend, then enable push notifications in the browser.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
