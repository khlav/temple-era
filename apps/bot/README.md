# Temple Raids Discord Bot

A Discord bot that monitors the Temple Raids Discord server for Warcraft Logs links and provides contextual responses to users based on their permissions.

## Features

- **Real-time monitoring** of Discord messages for WCL links
- **Permission-based responses** based on user account status
- **Ephemeral messages** that are only visible to the message author
- **Secure API communication** with the Temple Ashkandi website

## User Scenarios

### 1. No Website Account
- User posts WCL link → Bot responds with login prompt
- Button: "Log in to templeashkandi.com"

### 2. Has Account, No Permissions
- User posts WCL link → Bot responds with permission request
- Button: "View your profile"

### 3. Has Permissions
- User posts WCL link → Bot responds with raid creation link
- Button: "Create Raid Entry" → Opens `/raids/new?wcl={reportId}`

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
DISCORD_GUILD_ID=your_guild_id_here
DISCORD_LOGS_CHANNEL_ID=your_channel_id_here

# Temple Ashkandi API Configuration
API_BASE_URL=https://templeashkandi.com
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
Message Handler
    ↓
WCL Detector → Permission Checker → API Call
    ↓
Response Builder → Ephemeral Message
```

## Security

- **Token-based authentication** with the Temple Ashkandi API
- **Input validation** for Discord user IDs
- **Error handling** without information leakage
- **Rate limiting** (optional, can be implemented)

## Future Enhancements

- Auto-create raid button (creates raid directly via bot)
- Slash commands for raid management
- Discord embeds with raid previews
- Attendance reports in Discord

## Troubleshooting

### Bot Not Responding
1. Check environment variables are set correctly
2. Verify bot has proper permissions in Discord server
3. Check Railway logs for errors
4. Ensure API endpoint is accessible

### Permission Issues
1. Verify user has logged into templeashkandi.com
2. Check user has Raid Manager permissions
3. Test API endpoint manually

## Contributing

1. Create feature branch
2. Make changes
3. Test locally
4. Submit pull request

## License

MIT
