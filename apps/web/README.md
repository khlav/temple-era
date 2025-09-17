# Temple Raids

A comprehensive raid management and attendance tracking system for **Temple**, a Horde guild on the **Ashkandi** server in World of Warcraft Classic.

## Overview

Temple Raids provides a modern web interface for managing guild raids, tracking attendance, and coordinating crafting resources. Built specifically for the Temple guild's needs, it streamlines raid organization and provides valuable insights into guild member participation.

## Key Features

### 👥 All Users

- **Discord Authentication** - Secure login using Discord OAuth
- **6-Week Rolling Attendance** - Automatic calculation of raid attendance over rolling 6-week periods
- **Character Management** - View and manage your characters and their raid history
- **Rare Recipes Database** - Search and discover rare crafting recipes with advanced filtering
- **Crafter Identification** - Find guild members who can craft specific items

### 🎯 Raid Managers

- **Warcraft Logs Integration** - Create raids directly from Warcraft Logs URLs
- **Flexible Attendance Weighting** - Mark raids as full credit (`+1`), optional (`+0`), or custom weights
- **Bench Management** - Track benched characters to ensure no one is left behind
- **Character Mapping** - Link multiple characters to main characters for cross-toon attendance credit
- **Raid Analytics** - View detailed attendance reports and statistics

### ⚙️ Admins

- **User Permission Management** - Grant and revoke Raid Manager and Admin roles
- **Role-Based Access Control** - Secure access to administrative functions
- **User Management** - Monitor and manage guild member access

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL database
- Discord OAuth application

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/khlav/temple-raids-t3.git
   cd temple-raids-t3
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory with the following variables:

   **Required Variables:**

   - `DATABASE_URL` - Your PostgreSQL connection string
   - `AUTH_SECRET` - Generate with: `npx auth secret`
   - `AUTH_DISCORD_ID` & `AUTH_DISCORD_SECRET` - From Discord Developer Portal
   - `WCL_CLIENT_ID` & `WCL_CLIENT_SECRET` - From Warcraft Logs API
   - `BATTLENET_CLIENT_ID` & `BATTLENET_CLIENT_SECRET` - From Battle.net API

   **Optional Variables:**

   - `NEXT_PUBLIC_POSTHOG_ENABLED` - Set to "true" (case-insensitive) to enable PostHog analytics (default: false)
   - `NEXT_PUBLIC_POSTHOG_KEY` - For analytics (can be left as placeholder)

4. **Set up the database**

   ```bash
   pnpm db:push
   ```

5. **Start the development server**

   ```bash
   pnpm dev
   ```

6. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### First-Time Setup

1. **Generate Auth Secret**

   ```bash
   npx auth secret
   ```

   Copy the generated secret to `AUTH_SECRET` in your `.env` file.

2. **Configure Discord OAuth**

   - Create a Discord application at [Discord Developer Portal](https://discord.com/developers/applications)
   - Go to OAuth2 → General
   - Add redirect URI: `http://localhost:3000/api/auth/callback/discord`
   - Copy Client ID to `AUTH_DISCORD_ID` and Client Secret to `AUTH_DISCORD_SECRET` in your `.env` file

3. **Set up Warcraft Logs API**

   - Create an account at [Warcraft Logs](https://classic.warcraftlogs.com/)
   - Go to Account → API Access
   - Create a new client and copy the credentials to `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET`

4. **Set up Battle.net API**

   - Create an application at [Battle.net Developer Portal](https://develop.battle.net/)
   - Copy the Client ID and Client Secret to your `.env` file

5. **Set up PostHog Analytics (Optional)**

   - Create an account at [PostHog](https://posthog.com/)
   - Create a new project and copy the Project API Key
   - Set `NEXT_PUBLIC_POSTHOG_ENABLED=true` and `NEXT_PUBLIC_POSTHOG_KEY=your_key` in your `.env` file

6. **Set up Database**

   - For local development: Install PostgreSQL and create a database
   - For production: Use a service like Neon, Supabase, or Railway
   - Update `DATABASE_URL` with your connection string

7. **Set up Admin User**
   - First user to log in will need database access to set admin permissions
   - Or manually update the database to grant admin access to your Discord user ID

## Tech Stack

Built with the [T3 Stack](https://create.t3.gg/) for a modern, type-safe development experience:

- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[NextAuth.js](https://next-auth.js.org)** - Authentication with Discord OAuth
- **[Drizzle ORM](https://orm.drizzle.team)** - Type-safe database operations
- **[PostgreSQL](https://postgresql.org)** - Primary database
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first styling
- **[tRPC](https://trpc.io)** - End-to-end typesafe APIs
- **[TypeScript](https://typescriptlang.org)** - Type safety throughout

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Other Platforms

Follow the T3 Stack deployment guides for:

- [Netlify](https://create.t3.gg/en/deployment/netlify)
- [Docker](https://create.t3.gg/en/deployment/docker)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and intended for use by the Temple guild on Ashkandi server.
