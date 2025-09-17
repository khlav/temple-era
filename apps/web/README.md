# Temple Raids

Raid Attendance tracking (and other tools) for Temple, a Horde guild on the World of Warcraft Classic server cluster.

### Features:

- All users
  - [x] Login using [Discord](www.discord.com)
  - [x] Calculate rolling 6 week raid attendance.
- Admins
  - [x] Create a new Raid event including characters+attendance using [Warcraft Log](https://vanilla.warcraftlogs.com/) URLs.
  - [x] Mark raid for attendance credit (`+1`), optional (`+0`), or a custom weight (`+0.3333333`).
  - [x] Add benched characters. Leave no toon behind.
  - [x] Map multiple characters to a main/primary for credit across toons. [REQUIRES DB ACCESS]

---

### Stack Details

Bootstrapped [T3 Stack](https://create.t3.gg/) project using `create-t3-app`. Built with:

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

**How do I deploy this?** Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.

# Test comment
