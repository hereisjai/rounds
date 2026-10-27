# Rounds on Cloudflare

## Before the first deploy

Cloudflare does not create the database from the placeholder id. Create it once:

1. Cloudflare dashboard → Storage & databases → D1 → Create
2. Name it `rounds`
3. Copy the database id (a UUID)
4. In this repo, edit `wrangler.toml` and replace `00000000-0000-0000-0000-000000000000` with that id
5. Commit, or paste the id here and retry the Workers deploy

Deploy command:

```
npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
```

## Demo desks

| Who | Phone | PIN |
|---|---|---|
| Ravi, milk owner | 9845000001 | 1111 |
| Suresh, milk rider | 9845000002 | 2222 |
| Kiran, technician owner | 9900000003 | 3333 |
| Imran, technician | 9900000004 | 4444 |
