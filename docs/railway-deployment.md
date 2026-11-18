# Railway deployment

Deploy the repository root using the included Dockerfile. It builds React and serves it through Express, so the API, Socket.IO, service worker, and frontend share one HTTPS origin.

1. Create a Railway project with a MySQL service and an app service from this repository. Leave the app root directory at the repository root.
2. Attach a persistent volume to the app at `/data`, and set `STORAGE_DIR=/data`.
3. Set the app variables using references to the MySQL service (replace `MySQL` if the service has another name):

   ```text
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   JWT_SECRET=<unique randomly generated secret of at least 32 characters>
   SEED_DEMO=false
   STORAGE_DIR=/data
   ```

4. Import the existing database into the Railway MySQL database before starting the app. Preserve all existing records. For an empty installation only, apply `backend/schema.sql` after removing the initial `CREATE DATABASE` and `USE` statements so the tables are created in the selected Railway database. Startup applies the additive migrations automatically. There are no default production login accounts; existing accounts come from the database import.
5. Copy existing `backend/uploads` into `/data/uploads` and `backend/private-uploads` into `/data/private-uploads` through authenticated volume access. These files and all `.env` files are excluded from source deployment.
6. Generate the app's public domain. Railway's `RAILWAY_PUBLIC_DOMAIN` is automatically added to the CORS allowlist. For a custom domain, set `CLIENT_ORIGIN` to its HTTPS origin (comma-separated if there are multiple).
7. Optionally configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` for browser push notifications. Chat works without these keys.
8. Deploy and wait for the `/` health check to pass. The server only begins listening after database migrations succeed. Verify login, a room photo, and live chat before handing over the generated HTTPS link.

Use one app replica with its attached volume. Enable backups for the database and uploads. Database credentials, JWT secrets, private uploads, and database exports must never be placed in the public frontend or committed to Git.
