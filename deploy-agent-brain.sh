#!/bin/bash
# ==================== DEGENS CITY - AGENT BRAIN DEPLOYMENT ====================
# 
# Run this from your pump-town project root (where server.js lives)
# This script:
#   1. Backs up your current files
#   2. Copies the new agent-brain.js into the project
#   3. Updates server.js and index.html
#   4. Commits and pushes to GitHub
#   5. Railway + Vercel auto-deploy from there
#
# PREREQUISITES:
#   - You should have already downloaded agent-brain.js, server.js, and index.html 
#     from Claude to your Downloads folder (or wherever)
#   - cd into your pump-town project folder first
#
# ==================== INSTRUCTIONS ====================
# 
# Step 1: cd into your pump-town project folder:
#   cd ~/Desktop/pump-town
#
# Step 2: Copy the downloaded files into the right places.
#   Adjust the source paths below if your downloads are elsewhere:

echo "🧠 Degens City - Agent Brain Deployment"
echo "========================================"
echo ""

# Check we're in the right directory
if [ ! -f "server.js" ]; then
    echo "❌ ERROR: server.js not found in current directory!"
    echo "   Make sure you cd into your pump-town project folder first."
    echo "   Example: cd ~/Desktop/pump-town"
    exit 1
fi

echo "📁 Current directory: $(pwd)"
echo ""

# Backup existing files
echo "📦 Creating backups..."
mkdir -p backups
cp server.js backups/server.js.backup.$(date +%Y%m%d_%H%M%S)
cp index.html backups/index.html.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null
echo "✅ Backups saved to ./backups/"
echo ""

# Copy new files from Downloads (adjust path if needed)
DOWNLOADS="$HOME/Downloads"

echo "📋 Copying new files..."

if [ -f "$DOWNLOADS/agent-brain.js" ]; then
    cp "$DOWNLOADS/agent-brain.js" ./agent-brain.js
    echo "✅ agent-brain.js → ./agent-brain.js (NEW FILE - same folder as server.js)"
else
    echo "⚠️  agent-brain.js not found in $DOWNLOADS"
    echo "   Please manually copy agent-brain.js to this folder"
fi

if [ -f "$DOWNLOADS/server.js" ]; then
    cp "$DOWNLOADS/server.js" ./server.js
    echo "✅ server.js → ./server.js (UPDATED)"
else
    echo "⚠️  server.js not found in $DOWNLOADS"
fi

if [ -f "$DOWNLOADS/index.html" ]; then
    cp "$DOWNLOADS/index.html" ./index.html
    echo "✅ index.html → ./index.html (UPDATED)"
else
    echo "⚠️  index.html not found in $DOWNLOADS"
fi

echo ""

# Verify files are in place
echo "🔍 Verifying files..."
if [ -f "agent-brain.js" ] && [ -f "server.js" ] && [ -f "index.html" ]; then
    echo "✅ All files in place!"
    echo "   agent-brain.js: $(wc -l < agent-brain.js) lines"
    echo "   server.js: $(wc -l < server.js) lines"  
    echo "   index.html: $(wc -l < index.html) lines"
else
    echo "❌ Some files are missing. Check above for errors."
    exit 1
fi

echo ""

# Git commit and push
echo "🚀 Committing and pushing to GitHub..."
git add agent-brain.js server.js index.html
git commit -m "🧠 Add autonomous Agent Brain system

- NPCs now use Claude AI to make real decisions
- 13 autonomous actions: sue, propose laws, challenge, party, rumor, accuse, business, complaint, alliance, betray, run for mayor, crime, DM player
- AI-powered lawsuit system with judge verdicts
- Celebrity targeting for comedy (Elon, CZ, Vitalik, etc.)
- New Agent Brain frontend page with action feed, lawsuits, proposed laws
- New DB tables: autonomous_actions, lawsuits, proposed_laws
- New API: /api/v1/brain/actions, /lawsuits, /laws, /status"

git push

echo ""
echo "✅ Pushed to GitHub!"
echo "🚂 Railway should auto-deploy the backend in ~2 minutes"
echo "▲  Vercel should auto-deploy the frontend in ~1 minute"
echo ""
echo "🧠 Agent Brain will activate once Railway deploys."
echo "   NPCs will start making autonomous decisions every 2-10 minutes."
echo "   Check the new 🧠 Agent Brain page in the sidebar!"
echo ""
echo "Done! 🎉"
