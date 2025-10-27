# Temple Raids Discord Bot

A Discord bot that automatically creates raid entries when raid managers post Warcraft Logs links in the designated channel.

## Features

- **Automatic raid creation** for raid managers posting WCL links
- **Thread management** - Creates Discord threads for each raid
- **Permission-based filtering** - Only processes messages from raid managers
- **WCL link detection** - Supports vanilla.warcraftlogs.com and classic.warcraftlogs.com URLs
- **Secure API communication** with the Temple Ashkandi website
- **Duplicate prevention** - Tracks processed messages to avoid duplicates

## How It Works

### For Raid Managers

1. **Post WCL link** in the designated raid logs channel
2. **Bot automatically detects** the WCL link and extracts the report ID
3. **Bot creates raid entry** via API call to templeashkandi.com
4. **Bot creates Discord thread** with the raid name
5. **Bot posts raid URL** in the thread for easy access

### For Non-Raid Managers

- Bot ignores messages from users who don't have raid manager permissions
- No response or notification is sent

## Setup

### Prerequisites

- Node.js 18+
- Discord Bot Token
- Temple Ashkandi API access

### Environment Variables

Copy `env.example` to `.env` and fill in the values:

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_RAID_LOGS_CHANNEL_ID=your_channel_id_here

# Temple Ashkandi API Configuration
API_BASE_URL=https://www.templeashkandi.com
TEMPLE_WEB_API_TOKEN=your_generated_token_here
```

### Installation

```bash
# Install dependencies
pnpm install

# Development
pnpm dev

# Production build
pnpm build
pnpm start
```

## Development

```bash
# Start in development mode with hot reload
pnpm dev

# Type checking
pnpm typecheck

# Build for production
pnpm build
```

## Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy automatically on push to main branch

The bot will run 24/7 and automatically restart on failures.

## Architecture

```
Discord Gateway (WebSocket)
    ↓
Message Handler (filter by channel & permissions)
    ↓
WCL Detector → Permission Checker → API Call
    ↓
Raid Creation API → Thread Creation → Raid URL Post
```

### Flow Details

1. **Message Detection**: Bot monitors the designated raid logs channel
2. **Permission Check**: Verifies user has raid manager permissions via API
3. **WCL Processing**: Extracts report ID from Warcraft Logs URLs
4. **Raid Creation**: Calls `/api/discord/create-raid` endpoint
5. **Thread Management**: Creates Discord thread with raid name
6. **URL Posting**: Posts raid URL in the thread for easy access

## Security

- **Token-based authentication** with the Temple Ashkandi API
- **Input validation** for Discord user IDs
- **Error handling** without information leakage
- **Rate limiting** (optional, can be implemented)

## Future Enhancements

- Slash commands for raid management
- Discord embeds with raid previews
- Attendance reports in Discord
- Support for multiple WCL links in a single message
- Raid status updates in Discord threads
- Integration with raid scheduling features

## Troubleshooting

### Bot Not Responding

1. Check environment variables are set correctly
2. Verify bot has proper permissions in Discord server (needs `Send Messages` and `Create Public Threads`)
3. Check Railway logs for errors
4. Ensure API endpoint is accessible
5. Verify the bot is monitoring the correct channel ID

### Raid Creation Issues

1. Verify user has Raid Manager permissions on templeashkandi.com
2. Check that the WCL URL is valid and accessible
3. Test API endpoint manually: `POST /api/discord/create-raid`
4. Check that the user's Discord account is linked to their website account

### Thread Creation Issues

1. Verify bot has `Create Public Threads` permission in the channel
2. Check that the channel allows thread creation
3. Ensure the bot has `Send Messages` permission in the thread

## Contributing

1. Create feature branch
2. Make changes
3. Test locally
4. Submit pull request

## License

MIT
