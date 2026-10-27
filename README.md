# Rounds on Cloudflare

Do not upload this zip in Workers & Pages. That button only accepts a static site.

## Easiest: Deploy from GitHub

Repo: https://github.com/hereisjai/rounds

1. Cloudflare dashboard → Workers & Pages → Create application
2. Import a repository → pick `hereisjai/rounds`
3. Deploy. Cloudflare creates the D1 database from `wrangler.toml` and runs the app.
4. Open the `workers.dev` URL it gives you.

Or open this link and confirm:

https://deploy.workers.cloudflare.com/?url=https://github.com/hereisjai/rounds

## Demo desks

| Who | Phone | PIN |
|---|---|---|
| Ravi, milk owner | 9845000001 | 1111 |
| Suresh, milk rider | 9845000002 | 2222 |
| Kiran, technician owner | 9900000003 | 3333 |
| Imran, technician | 9900000004 | 4444 |

Milk and technician data are separate rows. The app stays up after you close the laptop.
