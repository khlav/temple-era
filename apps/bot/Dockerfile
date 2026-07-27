# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (excluding dev dependencies for production)
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build TypeScript code
RUN pnpm build

# Remove dev dependencies to reduce image size
# Use --ignore-scripts to avoid running prepare script (husky) which is being removed
RUN pnpm prune --prod --ignore-scripts

# Expose port (if needed in future, currently not used)
# EXPOSE 3000

# Set non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Start the bot
CMD ["node", "dist/index.js"]

