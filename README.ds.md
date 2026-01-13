# OHIF Viewer - Quick Setup Guide

## Ubuntu Server (Production)

### Prerequisites
```bash
# Install Node.js 18+ and Yarn
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g yarn

# Enable Yarn Workspaces
yarn config set workspaces-experimental true
```

### Build & Deploy
```bash
# Clone repository
git clone <your-repo-url>
cd ohif

# Install dependencies
yarn install --frozen-lockfile

# Build production assets
yarn run build

# Serve static files (output in platform/app/dist)
# Option 1: Using nginx
sudo apt install nginx
sudo cp -r platform/app/dist/* /var/www/html/

# Option 2: Using Node.js serve
npm install -g serve
serve -s platform/app/dist -l 3000
```

---

## Mac Apple Silicon (Development)

### Prerequisites
```bash
# Install via Homebrew
brew install node yarn

# Enable Yarn Workspaces
yarn config set workspaces-experimental true
```

### Development Setup
```bash
# Clone repository
git clone <your-repo-url>
cd ohif

# Install dependencies
yarn install --frozen-lockfile

# Start dev server
yarn run dev
# or fast mode (experimental)
yarn run dev:fast

# Access at http://localhost:3000
```

### Performance Tips (M4 Pro)
```bash
# Use caffeinate to utilize performance cores
caffeinate -i yarn run dev
```

---

## Requirements
- Node.js 18+
- Yarn 1.20.0+
- Yarn Workspaces enabled

## Common Commands
- `yarn run dev` - Development server
- `yarn run build` - Production build
- `yarn run test:unit` - Run tests
