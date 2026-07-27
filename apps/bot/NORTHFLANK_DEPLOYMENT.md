# Northflank Deployment Guide

This guide covers deploying the Temple Raids Discord Bot to Northflank.

## Prerequisites

- Northflank account
- GitHub repository connected to Northflank
- All required environment variables (see below)

## Deployment Steps

### 1. Create a New Service in Northflank

1. Log in to your Northflank dashboard
2. Create a new service or add-on
3. Select "Docker" as the deployment method
4. Connect your GitHub repository (`temple-raids-discord-bot`)

### 2. Configure Build Settings

Northflank will automatically detect the `Dockerfile` in the repository root. The build process will:

- Use Node.js 18 Alpine base image
- Install pnpm
- Install dependencies
- Build TypeScript code
- Create production-ready image

**Build Configuration:**

- **Dockerfile Path**: `Dockerfile` (root of repository)
- **Build Context**: `.` (root of repository)
- **No build command needed** - Dockerfile handles everything

### 3. Configure Runtime Settings

**Start Command:**

- The Dockerfile already sets `CMD ["node", "dist/index.js"]`
- No additional start command needed in Northflank

**Resource Limits (Bare Minimum):**

- **Memory**: 128MB (minimum available)
- **CPU**: 0.1 CPU (minimum available)
- The bot is lightweight and will run fine with minimal resources

**Restart Policy:**

- Configure automatic restarts on failure
- Northflank will handle container restarts automatically

### 4. Set Environment Variables

Configure the following environment variables in Northflank's service settings:

#### Required Variables

```
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_RAID_LOGS_CHANNEL_ID=your_channel_id_here
API_BASE_URL=https://www.templeashkandi.com
TEMPLE_WEB_API_TOKEN=your_generated_token_here
```

#### Optional Variables

```
LOG_LEVEL=info
DISCORD_LOG_THREAD_CLEANUP_ENABLED=false
DISCORD_LOG_THREAD_CLEANUP_DAYS=3
DISCORD_LOG_THREAD_CLEANUP_CRON="0 1 * * *"
```

**How to Set Environment Variables in Northflank:**

1. Navigate to your service settings
2. Go to "Environment Variables" section
3. Add each variable individually or import from a file
4. Save changes (service will automatically redeploy)

### 5. Deploy

1. Push your code to the connected branch (typically `main` or `master`)
2. Northflank will automatically:
   - Build the Docker image
   - Deploy the container
   - Start the bot

3. Monitor the deployment in the Northflank dashboard
4. Check logs to verify the bot started successfully

### 6. Verify Deployment

**Check Logs:**

- Look for: `Bot logged in as [BotName]#[Discriminator]`
- Look for: `Monitoring channel: [channel_id]`
- No error messages should appear

**Test the Bot:**

1. Post a Warcraft Logs link in the configured channel
2. Verify the bot creates a raid entry
3. Check that a Discord thread is created

## Local Testing

### Testing Without Docker (Standard Development)

Your existing local development workflow continues to work:

```bash
# Install dependencies
pnpm install

# Development mode with hot reload
pnpm dev

# Or build and run production mode
pnpm build
pnpm start
```

The bot will automatically load your `.env` file from the project root.

### Testing With Docker (Production-Like Environment)

To test the exact production environment locally:

```bash
# Build the Docker image
docker build -t temple-raids-bot .

# Run the container with your local .env file
docker run --rm \
  --env-file .env \
  temple-raids-bot
```

Or mount the `.env` file as a volume:

```bash
docker run --rm \
  -v $(pwd)/.env:/app/.env \
  temple-raids-bot
```

**Note:** The Dockerfile does NOT copy `.env` into the image for security reasons. You must provide environment variables at runtime.

**Important: Localhost Access from Docker Container**

If your `API_BASE_URL` points to `http://localhost:3000` (for local API testing), the Docker container cannot access it because `localhost` inside the container refers to the container itself, not your host machine.

**Solutions:**

1. **Use `host.docker.internal` (Recommended for Docker Desktop on Mac/Windows):**

   ```bash
   # In your .env file, change:
   API_BASE_URL=http://host.docker.internal:3000
   ```

2. **Use your host machine's IP address:**

   ```bash
   # Find your IP address
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # Then in your .env file:
   API_BASE_URL=http://YOUR_IP_ADDRESS:3000
   ```

3. **For production, always use the full domain:**
   ```bash
   API_BASE_URL=https://www.templeashkandi.com
   ```

## Troubleshooting

### Build Failures

**Issue:** Docker build fails

- **Solution:** Check that all dependencies are listed in `package.json`
- Verify `pnpm-lock.yaml` is up to date
- Check Docker logs for specific error messages

**Issue:** TypeScript compilation errors

- **Solution:** Run `pnpm typecheck` locally to identify issues
- Ensure all TypeScript dependencies are installed

### Runtime Issues

**Issue:** Bot fails to start

- **Check:** All required environment variables are set in Northflank
- **Check:** Bot token is valid and has proper permissions
- **Check:** API endpoint is accessible from Northflank's network

**Issue:** Bot starts but doesn't respond

- **Check:** Channel ID is correct
- **Check:** Bot has proper Discord permissions (Send Messages, Create Public Threads)
- **Check:** Bot is monitoring the correct channel

**Issue:** Memory or CPU limits exceeded

- **Solution:** If you're using minimum resources (128MB/0.1 CPU) and hitting limits, increase to 256MB memory
- The bot is lightweight and should run fine on minimum resources, but Discord.js can use memory during high activity

### Environment Variable Issues

**Issue:** Environment variables not loading

- **Check:** Variables are set in Northflank service settings (not just build settings)
- **Check:** Variable names match exactly (case-sensitive)
- **Check:** No extra spaces or quotes in variable values

## Migration from Railway

If you're migrating from Railway:

1. **Export environment variables from Railway:**
   - Copy all environment variables from Railway dashboard
   - Note the exact variable names and values

2. **Set up Northflank service:**
   - Follow steps 1-4 above
   - Import all environment variables

3. **Deploy to Northflank:**
   - Push code to trigger deployment
   - Verify bot is running

4. **Test thoroughly:**
   - Test bot functionality
   - Monitor logs for 24 hours
   - Verify no issues

5. **Decommission Railway:**
   - Once confirmed working on Northflank
   - Stop/delete Railway service
   - Update any documentation referencing Railway

## Continuous Deployment

Northflank supports automatic deployments:

1. **Connect GitHub repository** to Northflank
2. **Configure branch** (typically `main` or `master`)
3. **Enable auto-deploy** on push
4. Each push will trigger a new build and deployment

## Monitoring

- **Logs:** View real-time logs in Northflank dashboard
- **Metrics:** Monitor CPU, memory, and network usage
- **Alerts:** Configure alerts for service failures or high resource usage

## Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use Northflank secrets** - Store sensitive values as secrets, not plain environment variables
3. **Rotate tokens regularly** - Update Discord bot token and API tokens periodically
4. **Limit permissions** - Bot should only have necessary Discord permissions
5. **Monitor access** - Review logs regularly for suspicious activity

## Support

For issues specific to:

- **Northflank platform:** Check [Northflank documentation](https://northflank.com/docs)
- **Discord bot functionality:** See main `README.md`
- **Deployment issues:** Review logs and troubleshooting section above
