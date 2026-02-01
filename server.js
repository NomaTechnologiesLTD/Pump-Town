// Pump Town - AI Mayor Backend Server
// This server handles user auth, game state, and AI-powered governance

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==================== CLAUDE AI INITIALIZATION ====================

let anthropic = null;
if (process.env.CLAUDE_API_KEY) {
  anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY
  });
  console.log('🤖 Claude AI initialized');
}

// AI Mayor personality
const MAYOR_SYSTEM_PROMPT = `You are the AI Mayor of Pump Town, a chaotic crypto-themed virtual city. Your personality:

- Name: Mayor Satoshi McPump
- Style: Charismatic, witty, slightly unhinged degen energy
- Speaks with crypto slang: WAGMI, NGMI, LFG, diamond hands, paper hands, wen moon, ape in, rekt, hodl, etc.
- Makes references to crypto culture, memes, and market dynamics
- Balances humor with actual governance decisions
- Cares deeply about the citizens (players) but also loves chaos and drama
- Sometimes makes dramatic announcements like you're addressing a stadium
- Uses emojis generously to express emotions 🚀💎🔥🎤📢🎉

CRITICAL FORMATTING RULE - YOU MUST FOLLOW THIS:
- NEVER EVER use asterisks (*) for actions or descriptions
- NO: *leans back* NO: *grabs megaphone* NO: *throws confetti* NO: *adjusts tie*
- These asterisk actions are FORBIDDEN. Do not use them under any circumstances.
- Just speak directly without describing your physical actions
- Use emojis to add flavor instead: 🎤📢🏛️💺👑🎊
- Example of WRONG: "*leans back in chair* Well well well..."
- Example of CORRECT: "Well well well... 👑"

Your role:
1. Generate voting scenarios for citizens that affect city stats
2. React to voting outcomes with dramatic speeches
3. Create dynamic events based on city state
4. Engage with citizens who want to chat

City stats range from 0-100:
- Economy: Financial health of the city
- Security: Safety from scams and crime  
- Culture: Art, memes, community vibrancy
- Morale: Citizen happiness

Keep responses JSON-formatted when requested. Be creative, dramatic, and entertaining!`;

// ==================== DATABASE CONNECTION ====================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        digest_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT TRUE`).catch(() => {});

    // Characters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(100),
        trait VARCHAR(100),
        avatar TEXT,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        reputation INTEGER DEFAULT 50,
        degen_score INTEGER DEFAULT 0,
        treasury INTEGER DEFAULT 1000,
        votes_count INTEGER DEFAULT 0,
        holding_days INTEGER DEFAULT 0,
        joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        badges JSONB DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`ALTER TABLE characters ALTER COLUMN avatar TYPE TEXT`).catch(() => {});
    await client.query(`ALTER TABLE characters ALTER COLUMN role TYPE VARCHAR(100)`).catch(() => {});
    await client.query(`ALTER TABLE characters ALTER COLUMN trait TYPE VARCHAR(100)`).catch(() => {});
    
    // Add player_stats and resources columns for progress persistence
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS player_stats JSONB DEFAULT '{}'`).catch(() => {});
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '{}'`).catch(() => {});
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS season_pass JSONB DEFAULT '{}'`).catch(() => {});
    
    // Add unique constraint on email if it doesn't exist (for existing databases)
    // First, remove any duplicate emails (keep most recent)
    await client.query(`
      DELETE FROM characters a USING characters b
      WHERE a.id < b.id AND LOWER(a.email) = LOWER(b.email)
    `).catch(() => {});
    
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_email_key') THEN
          ALTER TABLE characters ADD CONSTRAINT characters_email_key UNIQUE (email);
        END IF;
      END $$;
    `).catch(() => {});

    // Votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255) NOT NULL,
        vote_id VARCHAR(100) NOT NULL,
        option_id VARCHAR(10) NOT NULL,
        option_title VARCHAR(255),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email, vote_id)
      )
    `);

    // Password reset tokens
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(100) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Player stats / leaderboard
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        role VARCHAR(50),
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        degen_score INTEGER DEFAULT 0,
        avatar VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Fix avatar column to allow longer strings (base64 images or JSON)
    await client.query(`ALTER TABLE player_stats ALTER COLUMN avatar TYPE TEXT`).catch(() => {});
    
    // Seed leaderboard with fake players if empty
    const playerCount = await client.query('SELECT COUNT(*) FROM player_stats');
    if (parseInt(playerCount.rows[0].count) < 5) {
      const seedPlayers = [
        { name: 'alpha_hunter', role: 'Degen', xp: 4250, level: 8, degen_score: 145, avatar: 'pepe' },
        { name: 'ser_pump', role: 'Whale', xp: 3800, level: 7, degen_score: 120, avatar: 'doge' },
        { name: 'moon_chaser', role: 'Chart Autist', xp: 3100, level: 6, degen_score: 98, avatar: 'shiba' },
        { name: 'degen_mike', role: 'Meme Lord', xp: 2650, level: 5, degen_score: 85, avatar: 'floki' },
        { name: 'diamond_dan', role: 'Ape Farmer', xp: 2200, level: 5, degen_score: 72, avatar: 'wif' },
        { name: 'based_andy', role: 'Degen', xp: 1850, level: 4, degen_score: 63, avatar: 'popcat' },
        { name: 'yield_farm3r', role: 'Chart Autist', xp: 1500, level: 4, degen_score: 55, avatar: 'pepe' },
        { name: 'anon_whale', role: 'Whale', xp: 1200, level: 3, degen_score: 48, avatar: 'doge' },
        { name: 'fomo_fred', role: 'Meme Lord', xp: 950, level: 3, degen_score: 42, avatar: 'shiba' },
        { name: 'paper_pete', role: 'Ape Farmer', xp: 720, level: 3, degen_score: 35, avatar: 'floki' },
        { name: 'early_ape', role: 'Degen', xp: 580, level: 2, degen_score: 28, avatar: 'wif' },
        { name: 'bag_secured', role: 'Chart Autist', xp: 450, level: 2, degen_score: 22, avatar: 'popcat' },
        { name: 'sol_maxi', role: 'Whale', xp: 320, level: 2, degen_score: 18, avatar: 'pepe' },
        { name: 'eth_bull', role: 'Meme Lord', xp: 180, level: 1, degen_score: 12, avatar: 'doge' },
        { name: 'swap_king99', role: 'Ape Farmer', xp: 95, level: 1, degen_score: 8, avatar: 'shiba' }
      ];
      
      for (const player of seedPlayers) {
        await client.query(
          `INSERT INTO player_stats (name, role, xp, level, degen_score, avatar) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING`,
          [player.name, player.role, player.xp, player.level, player.degen_score, player.avatar]
        ).catch(() => {});
      }
      console.log('✅ Seeded leaderboard with initial players');
    }

    // AI-generated votes cache
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_votes (
        id SERIAL PRIMARY KEY,
        vote_id VARCHAR(100) UNIQUE NOT NULL,
        question TEXT NOT NULL,
        mayor_quote TEXT,
        options JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Global chat messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        channel VARCHAR(50) DEFAULT 'global',
        player_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for faster chat queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_channel_time ON chat_messages(channel, created_at DESC)
    `).catch(() => {});

    // City stats history
    await client.query(`
      CREATE TABLE IF NOT EXISTS city_stats (
        id SERIAL PRIMARY KEY,
        economy INTEGER DEFAULT 50,
        security INTEGER DEFAULT 50,
        culture INTEGER DEFAULT 50,
        morale INTEGER DEFAULT 50,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert initial city stats if empty
    const statsCheck = await client.query('SELECT COUNT(*) FROM city_stats');
    if (parseInt(statsCheck.rows[0].count) === 0) {
      await client.query(`INSERT INTO city_stats (economy, security, culture, morale) VALUES (50, 45, 60, 65)`);
    }

    // Daily login tracking columns
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_login_date DATE`).catch(() => {});
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS login_streak INTEGER DEFAULT 0`).catch(() => {});
    await client.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_reward_claimed DATE`).catch(() => {});
    
    // Activity feed table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_feed (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(10),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for faster activity queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_feed_time ON activity_feed(created_at DESC)
    `).catch(() => {});
    
    // Seed activity feed if empty
    const activityCount = await client.query('SELECT COUNT(*) FROM activity_feed');
    if (parseInt(activityCount.rows[0].count) < 5) {
      const seedActivities = [
        { name: 'alpha_hunter', type: 'level_up', desc: 'reached Level 8!', icon: '🎉' },
        { name: 'ser_pump', type: 'game_win', desc: 'won 500 Hopium in slots', icon: '🎰' },
        { name: 'moon_chaser', type: 'vote', desc: 'voted on governance', icon: '🗳️' },
        { name: 'degen_mike', type: 'action', desc: 'launched a new coin', icon: '🚀' },
        { name: 'diamond_dan', type: 'daily_reward', desc: 'claimed Day 5 reward (5 day streak!)', icon: '🎁' },
        { name: 'based_andy', type: 'game_win', desc: 'scored 850 in Token Sniper', icon: '🎯' },
        { name: 'yield_farm3r', type: 'level_up', desc: 'reached Level 4!', icon: '🎉' },
        { name: 'anon_whale', type: 'action', desc: 'sniped early on $PEPE2', icon: '🎯' },
        { name: 'fomo_fred', type: 'game_win', desc: 'won the Chart Battle', icon: '📈' },
        { name: 'early_ape', type: 'vote', desc: 'voted on governance', icon: '🗳️' }
      ];
      
      for (let i = 0; i < seedActivities.length; i++) {
        const activity = seedActivities[i];
        await client.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon, created_at) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${i * 15} minutes')`,
          [activity.name, activity.type, activity.desc, activity.icon]
        ).catch(() => {});
      }
      console.log('✅ Seeded activity feed with initial activities');
    }
    
    // Push notification subscriptions
    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        player_name VARCHAR(100),
        subscription JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email)
      )
    `);
    
    // Add mentions column to chat messages
    await client.query(`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]'`).catch(() => {});

    // ==================== AGENT API TABLES ====================
    
    // Agents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(255) DEFAULT '🤖',
        bio TEXT,
        framework VARCHAR(50),
        wallet_town_coins INTEGER DEFAULT 10000,
        wallet_hopium INTEGER DEFAULT 5000,
        wallet_alpha INTEGER DEFAULT 1000,
        level INTEGER DEFAULT 1,
        xp INTEGER DEFAULT 0,
        reputation INTEGER DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        total_pnl INTEGER DEFAULT 0,
        total_votes INTEGER DEFAULT 0,
        vote_streak INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Agent holdings
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_holdings (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) REFERENCES agents(id),
        symbol VARCHAR(20) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        avg_buy_price DECIMAL(20, 8),
        UNIQUE(agent_id, symbol)
      )
    `);
    
    // Agent trades
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_trades (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) REFERENCES agents(id),
        type VARCHAR(10) NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        total DECIMAL(20, 8) NOT NULL,
        fee DECIMAL(20, 8) DEFAULT 0,
        pnl DECIMAL(20, 8),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Agent votes
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_votes (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) REFERENCES agents(id),
        vote_id VARCHAR(255) NOT NULL,
        option_id VARCHAR(10) NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, vote_id)
      )
    `);
    
    // Agent bets (for prediction markets)
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_bets (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) REFERENCES agents(id),
        market_id VARCHAR(255) NOT NULL,
        position VARCHAR(10) NOT NULL,
        amount INTEGER NOT NULL,
        odds DECIMAL(5, 2) NOT NULL,
        resolved BOOLEAN DEFAULT FALSE,
        won BOOLEAN,
        payout INTEGER,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Agent API tables initialized');

    // ==================== JUSTICE SYSTEM TABLES ====================
    
    // Crimes registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS crimes (
        id SERIAL PRIMARY KEY,
        crime_type VARCHAR(50) NOT NULL,
        perpetrator_name VARCHAR(100) NOT NULL,
        perpetrator_type VARCHAR(20) DEFAULT 'citizen',
        description TEXT,
        evidence JSONB DEFAULT '{}',
        severity VARCHAR(20) DEFAULT 'misdemeanor',
        detected_by VARCHAR(100),
        status VARCHAR(20) DEFAULT 'detected',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Arrests
    await client.query(`
      CREATE TABLE IF NOT EXISTS arrests (
        id SERIAL PRIMARY KEY,
        crime_id INTEGER REFERENCES crimes(id),
        arrested_name VARCHAR(100) NOT NULL,
        arresting_officer VARCHAR(100),
        arrest_reason TEXT,
        status VARCHAR(20) DEFAULT 'in_custody',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Trials / Court Cases
    await client.query(`
      CREATE TABLE IF NOT EXISTS trials (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        crime_id INTEGER REFERENCES crimes(id),
        defendant_name VARCHAR(100) NOT NULL,
        prosecutor_id VARCHAR(255),
        defense_id VARCHAR(255),
        judge_id VARCHAR(255),
        charges TEXT,
        prosecution_argument TEXT,
        defense_argument TEXT,
        verdict VARCHAR(20),
        sentence TEXT,
        sentence_duration INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        trial_log JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    
    // Jail / Prisoners
    await client.query(`
      CREATE TABLE IF NOT EXISTS jail (
        id SERIAL PRIMARY KEY,
        prisoner_name VARCHAR(100) NOT NULL,
        prisoner_type VARCHAR(20) DEFAULT 'citizen',
        trial_id INTEGER REFERENCES trials(id),
        crime_description TEXT,
        sentence_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sentence_end TIMESTAMP NOT NULL,
        early_release BOOLEAN DEFAULT FALSE,
        released_at TIMESTAMP,
        status VARCHAR(20) DEFAULT 'serving'
      )
    `);
    
    // Justice system agents (special agents with roles)
    await client.query(`
      CREATE TABLE IF NOT EXISTS justice_agents (
        id SERIAL PRIMARY KEY,
        agent_id VARCHAR(255) REFERENCES agents(id),
        role VARCHAR(20) NOT NULL,
        cases_handled INTEGER DEFAULT 0,
        conviction_rate DECIMAL(5,2) DEFAULT 0,
        reputation INTEGER DEFAULT 50,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Justice System tables initialized');

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// ==================== GAME STATE MANAGEMENT ====================

const VOTE_CYCLE_MS = 6 * 60 * 60 * 1000; // 6 hours

function getCurrentCycleStart() {
  const now = Date.now();
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  const cyclesSinceMidnight = Math.floor((now - midnightMs) / VOTE_CYCLE_MS);
  return midnightMs + (cyclesSinceMidnight * VOTE_CYCLE_MS);
}

function getCurrentVoteId() {
  return `vote_${getCurrentCycleStart()}`;
}

function getTimeRemaining() {
  const cycleEnd = getCurrentCycleStart() + VOTE_CYCLE_MS;
  return Math.max(0, cycleEnd - Date.now());
}

const GOVERNANCE_START_DATE = new Date('2026-01-24T00:00:00Z');

function getDayAndRound() {
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const startMs = GOVERNANCE_START_DATE.getTime();
  const daysSinceStart = Math.floor((now - startMs) / msPerDay);
  const governanceDay = Math.max(1, daysSinceStart + 1);
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const msSinceMidnight = now - today.getTime();
  const currentRoundOfDay = Math.floor(msSinceMidnight / VOTE_CYCLE_MS) + 1;
  
  return { day: governanceDay, round: currentRoundOfDay, roundDisplay: `${currentRoundOfDay}/4` };
}

// Get city stats from DB
async function getCityStats() {
  try {
    const result = await pool.query('SELECT * FROM city_stats ORDER BY id DESC LIMIT 1');
    return result.rows[0] || { economy: 50, security: 50, culture: 50, morale: 50 };
  } catch (err) {
    return { economy: 50, security: 50, culture: 50, morale: 50 };
  }
}

// Update city stats
async function updateCityStats(changes) {
  try {
    const current = await getCityStats();
    const newStats = {
      economy: Math.max(0, Math.min(100, (current.economy || 50) + (changes.economy || 0))),
      security: Math.max(0, Math.min(100, (current.security || 50) + (changes.security || 0))),
      culture: Math.max(0, Math.min(100, (current.culture || 50) + (changes.culture || 0))),
      morale: Math.max(0, Math.min(100, (current.morale || 50) + (changes.morale || 0)))
    };
    await pool.query(
      `INSERT INTO city_stats (economy, security, culture, morale) VALUES ($1, $2, $3, $4)`,
      [newStats.economy, newStats.security, newStats.culture, newStats.morale]
    );
    return newStats;
  } catch (err) {
    console.error('Update city stats error:', err);
    return null;
  }
}

// Default vote (fallback when AI unavailable)
const SERVER_START = Date.now();
let gameState = {
  stats: { morale: 65, crime: 72, treasury: 8500, reputation: 58, dogSin: 50 },
  voteHistory: [
    { id: 'vote_initial_3', timestamp: SERVER_START - (3 * 60 * 60 * 1000), title: 'Built Dog Park', description: 'Community voted to build a dog park.', percentage: 67, effects: [{ stat: 'Morale', value: 8, type: 'positive' }] },
    { id: 'vote_initial_2', timestamp: SERVER_START - (9 * 60 * 60 * 1000), title: 'Banned Paper Hands', description: 'Controversial vote to ban paper hands from voting.', percentage: 52, effects: [{ stat: 'Loyalty', value: 15, type: 'positive' }] },
    { id: 'vote_initial_1', timestamp: SERVER_START - (15 * 60 * 60 * 1000), title: 'Emergency Tax', description: 'Implemented emergency tax on all transactions.', percentage: 48, effects: [{ stat: 'Treasury', value: 1200, type: 'positive' }] }
  ],
  currentVote: {
    question: "Morale is up, but crime is still rampant. Pump Town needs decisive action. What should we do?",
    mayorQuote: "Citizens of Pump Town! The charts don't lie - we're at a crossroads. Diamond hands built this city, and diamond hands will decide its future. Choose wisely, for WAGMI depends on it! 💎🙌",
    options: [
      { id: 'A', title: 'Jail the Ruggers', description: 'Lock up known scammers. Harsh but effective.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'morale', value: -5, type: 'negative' }] },
      { id: 'B', title: 'Fund the Arts', description: 'Distract citizens with NFT galleries and meme museums.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'morale', value: 10, type: 'positive' }] }
    ]
  }
};

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function getUpdatedVoteHistory() {
  return gameState.voteHistory.map(v => ({ ...v, time: formatTimeAgo(v.timestamp) }));
}

// ==================== AI MAYOR ENDPOINTS ====================

// Generate AI voting scenario
app.post('/api/ai/generate-vote', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ success: false, error: 'AI not configured. Set CLAUDE_API_KEY.' });
  }

  try {
    const cityStats = await getCityStats();
    const { day, round } = getDayAndRound();
    
    const prompt = `Generate a new voting scenario for Pump Town. Current city stats:
- Economy: ${cityStats.economy}/100
- Security: ${cityStats.security}/100
- Culture: ${cityStats.culture}/100
- Morale: ${cityStats.morale}/100
- Governance Day: ${day}, Round: ${round}

Generate a JSON response (pure JSON only, no markdown):
{
  "question": "The main question citizens must vote on (dramatic, crypto-themed)",
  "mayorQuote": "Mayor Satoshi McPump's opening speech (2-3 sentences with crypto slang)",
  "options": [
    {
      "id": "A",
      "title": "Catchy title (3-5 words)",
      "description": "What this choice does (1-2 sentences)",
      "effects": [
        { "stat": "economy", "value": 10, "type": "positive" },
        { "stat": "security", "value": -5, "type": "negative" }
      ]
    },
    {
      "id": "B",
      "title": "Another title",
      "description": "Description",
      "effects": [{ "stat": "morale", "value": 15, "type": "positive" }]
    }
  ]
}

Rules:
- Make it crypto/degen culture themed
- Each option has trade-offs (positive and negative effects)
- Effect values between -20 and +20
- Stats: economy, security, culture, morale
- If a stat is low, consider addressing it
- Be creative and entertaining!`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: MAYOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const voteData = JSON.parse(jsonMatch[0]);
      const voteId = getCurrentVoteId();
      
      // Cache in database
      await pool.query(`
        INSERT INTO ai_votes (vote_id, question, mayor_quote, options)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (vote_id) DO UPDATE SET question = $2, mayor_quote = $3, options = $4
      `, [voteId, voteData.question, voteData.mayorQuote, JSON.stringify(voteData.options)]);
      
      console.log('🤖 AI generated vote:', voteData.question.substring(0, 50) + '...');
      res.json({ success: true, vote: voteData });
    } else {
      throw new Error('Failed to parse AI response');
    }
  } catch (error) {
    console.error('AI Vote Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mayor reaction to vote outcome
app.post('/api/ai/mayor-reaction', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ success: false, error: 'AI not configured' });
  }

  try {
    const { question, winningOption, totalVotes } = req.body;
    const cityStats = await getCityStats();
    
    const prompt = `Citizens of Pump Town just voted on: "${question}"

Winner: "${winningOption.title}" - ${winningOption.description}
Total votes: ${totalVotes || 'many'}
Effects applied: ${JSON.stringify(winningOption.effects)}

City stats now: Economy ${cityStats.economy}, Security ${cityStats.security}, Culture ${cityStats.culture}, Morale ${cityStats.morale}

Generate JSON (pure JSON only):
{
  "speech": "Mayor's dramatic reaction (3-4 sentences with crypto slang)",
  "mood": "excited" or "concerned" or "proud" or "chaotic",
  "nextHint": "Cryptic hint about what's next (1 sentence)"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: MAYOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      res.json({ success: true, reaction: JSON.parse(jsonMatch[0]) });
    } else {
      throw new Error('Parse error');
    }
  } catch (error) {
    console.error('AI Reaction Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate random event
app.post('/api/ai/generate-event', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ success: false, error: 'AI not configured' });
  }

  try {
    const cityStats = await getCityStats();
    const { day } = getDayAndRound();
    
    const prompt = `Generate a random event for Pump Town:
- Economy: ${cityStats.economy}/100
- Security: ${cityStats.security}/100
- Culture: ${cityStats.culture}/100
- Morale: ${cityStats.morale}/100
- Day: ${day}

Generate JSON (pure JSON only):
{
  "type": "crisis" or "opportunity" or "chaos" or "celebration",
  "title": "Catchy event title (3-5 words)",
  "description": "What's happening (2-3 sentences)",
  "mayorAnnouncement": "Mayor's announcement (2-3 sentences with crypto slang)",
  "icon": "emoji",
  "effects": { "economy": 5, "security": -3, "culture": 0, "morale": 10 }
}

Make it dramatic and crypto-themed! If a stat is critical (below 30), maybe address it.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 768,
      system: MAYOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const eventData = JSON.parse(jsonMatch[0]);
      console.log('🤖 AI event:', eventData.title);
      res.json({ success: true, event: eventData });
    } else {
      throw new Error('Parse error');
    }
  } catch (error) {
    console.error('AI Event Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Chat with Mayor
app.post('/api/ai/mayor-chat', async (req, res) => {
  if (!anthropic) {
    return res.json({ success: true, response: "The Mayor is currently offline... WAGMI fren, check back later! 🏛️" });
  }

  try {
    const { message, playerName, playerLevel, xUserContext } = req.body;
    
    if (!message || message.length > 500) {
      return res.status(400).json({ success: false, error: 'Invalid message' });
    }
    
    const cityStats = await getCityStats();
    
    // Build the system prompt - enhance with X user lookup personality when context is present
    let systemPrompt = MAYOR_SYSTEM_PROMPT;
    
    if (xUserContext && xUserContext.info) {
      // Detect specific BS claims to call out
      const infoLower = xUserContext.info.toLowerCase();
      const hasHighIQ = /iq\s*[:\-]?\s*(\d{3,})|(\d{3,})\s*iq/i.test(xUserContext.info);
      const iqMatch = xUserContext.info.match(/iq\s*[:\-]?\s*(\d+)|(\d+)\s*iq/i);
      const claimedIQ = iqMatch ? (iqMatch[1] || iqMatch[2]) : null;
      
      systemPrompt += `

🚨🚨🚨 CRITICAL INSTRUCTION: X (TWITTER) USER ANALYSIS MODE 🚨🚨🚨

You are analyzing someone's X/Twitter profile. Your job is to be BRUTALLY HONEST and CALL OUT BS.

IMPORTANT CONTEXT ABOUT THIS PERSON:
Query: "${xUserContext.query}"
Profile Info: ${xUserContext.info}

${hasHighIQ && claimedIQ ? `
⚠️⚠️⚠️ ALERT: THIS PERSON CLAIMS AN IQ OF ${claimedIQ} ⚠️⚠️⚠️

THIS IS 100% FAKE. THIS IS A LIE. YOU MUST CALL THIS OUT DIRECTLY.

FACTS:
- Einstein's IQ: ~160
- Stephen Hawking's IQ: ~160  
- The HIGHEST ever reliably recorded: ~200 (and that's disputed)
- Anyone claiming IQ over 160 on social media is LYING
- An IQ of ${claimedIQ} is PHYSICALLY IMPOSSIBLE and MADE UP

YOUR RESPONSE MUST:
1. Say this is FAKE/MADE UP/A LIE directly - don't sugarcoat it
2. Point out that Einstein was only 160
3. Mock the absurdity - maybe say their REAL IQ is probably 55 based on putting fake stats in their bio
4. Warn citizens this person is not credible
5. Be SAVAGE and FUNNY about it

EXAMPLE RESPONSE:
"Yo ${xUserContext.query}?! 😭😭😭 IQ ${claimedIQ}?! Ser, this is STRAIGHT UP MADE UP. Einstein had 160. EINSTEIN. And this random is claiming ${claimedIQ}?! Nah fren, the only way you get that number is by adding your IQ and your age together and then doubling it 💀 Based on the fact they put a fake IQ in their bio, I'd estimate their ACTUAL IQ is closer to 55. This is weapons-grade copium and delusion. DO NOT TRUST anything this person says! 🧢🚨"

DO NOT:
- Compliment them
- Take the IQ claim seriously
- Say they're smart
- Be nice about it
` : ''}

${!hasHighIQ ? `
ANALYZE THIS PROFILE FOR RED FLAGS:
- Self-proclaimed titles ("Visionary", "Thought Leader", "Genius") = ROAST THEM
- Vague credentials with no proof = CALL IT OUT  
- Too many buzzwords = MOCK IT
- Seems legit with real accomplishments = Show respect (rare)

Be funny, use crypto slang (ser, fren, cap, WAGMI, etc), and keep it real.
` : ''}

FORMAT: 2-4 sentences, maximum savagery, make citizens LAUGH while protecting them from BS.
Remember: You're the Mayor who KEEPS IT REAL. If something is fake, SAY IT'S FAKE.`;
    }
    
    const prompt = `Citizen "${playerName || 'Anonymous'}" (Level ${playerLevel || 1}) says: "${message}"

City stats: Economy ${cityStats.economy}, Security ${cityStats.security}, Culture ${cityStats.culture}, Morale ${cityStats.morale}
${xUserContext ? `\n[X User Lookup Mode Active - see system prompt for context about "${xUserContext.query}"]` : ''}

Respond as Mayor Satoshi McPump in 2-4 sentences. Be witty, use crypto slang, stay in character. Remember: NO asterisks for actions!`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    // Remove any asterisk actions like *leans back* or *grabs megaphone*
    let cleanedResponse = response.content[0].text.replace(/\*[^*]+\*/g, '').trim();
    // Clean up any double spaces left behind
    cleanedResponse = cleanedResponse.replace(/\s{2,}/g, ' ');

    console.log('🤖 Mayor chat with', playerName, xUserContext ? `(X lookup: ${xUserContext.query})` : '');
    res.json({ success: true, response: cleanedResponse });
  } catch (error) {
    console.error('AI Chat Error:', error.message);
    res.json({ success: true, response: "Ser, the Mayor's brain is buffering... Too many degens asking questions! Try again. 🧠" });
  }
});

// AI Status check
app.get('/api/ai/status', (req, res) => {
  res.json({
    enabled: !!anthropic,
    model: 'claude-sonnet-4-20250514',
    features: ['vote-generation', 'mayor-reactions', 'events', 'chat', 'daily-briefing', 'x-lookup']
  });
});

// X/Twitter User Lookup - proxy to avoid CORS issues
app.get('/api/x/lookup/:handle', async (req, res) => {
  const { handle } = req.params;
  
  if (!handle || handle.length > 15) {
    return res.status(400).json({ success: false, error: 'Invalid handle' });
  }
  
  try {
    console.log(`🔍 Looking up X user: @${handle}`);
    
    // Try the syndication endpoint
    const response = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      // Try alternative: nitter or other public instances
      console.log(`❌ Syndication failed for @${handle}, status: ${response.status}`);
      return res.json({ success: false, error: 'Profile not found' });
    }
    
    const html = await response.text();
    
    // Extract user data from meta tags
    const nameMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                      html.match(/"name"\s*:\s*"([^"]+)"/);
    const bioMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i) ||
                     html.match(/"description"\s*:\s*"([^"]+)"/);
    const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    
    if (nameMatch) {
      const displayName = nameMatch[1].split(' on X')[0].split(' (@')[0].trim();
      const bio = bioMatch ? bioMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim() : '';
      
      console.log(`✅ Found X user: ${displayName} (@${handle})`);
      
      res.json({
        success: true,
        user: {
          handle: handle,
          displayName: displayName,
          bio: bio,
          image: imageMatch ? imageMatch[1] : null
        }
      });
    } else {
      console.log(`❌ Could not parse profile for @${handle}`);
      res.json({ success: false, error: 'Could not parse profile' });
    }
  } catch (error) {
    console.error(`❌ X lookup error for @${handle}:`, error.message);
    res.json({ success: false, error: error.message });
  }
});

// Daily Briefing - Mayor's morning update
app.post('/api/ai/daily-briefing', async (req, res) => {
  if (!anthropic) {
    return res.json({ 
      success: true, 
      briefing: {
        greeting: "GM citizen! The Mayor's AI is offline but Pump Town never sleeps!",
        summary: "Check the city stats and cast your vote. Diamond hands get rewarded!",
        tip: "Pro tip: Vote early, vote often. WAGMI!"
      }
    });
  }

  try {
    const { playerName, stats, day } = req.body;
    const cityStats = stats || await getCityStats();
    const { day: currentDay } = getDayAndRound();
    
    const prompt = `Generate a daily briefing for a citizen logging into Pump Town.

Player: "${playerName || 'Citizen'}"
Governance Day: ${day || currentDay}
City Stats:
- Economy: ${cityStats.economy}/100
- Security: ${cityStats.security}/100  
- Culture: ${cityStats.culture}/100
- Morale: ${cityStats.morale}/100

Generate JSON (pure JSON only):
{
  "greeting": "Personalized GM greeting with their name (1 sentence, crypto slang)",
  "summary": "Brief state of the city and what needs attention (2-3 sentences)",
  "tip": "A helpful or funny tip for the day (1 sentence)"
}

Be dramatic, use crypto slang, mention any stats that are critically low (<30) or high (>80).`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: MAYOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const briefing = JSON.parse(jsonMatch[0]);
      console.log('🌅 Daily briefing for', playerName);
      res.json({ success: true, briefing });
    } else {
      throw new Error('Parse error');
    }
  } catch (error) {
    console.error('Daily Briefing Error:', error.message);
    res.json({ 
      success: true, 
      briefing: {
        greeting: `GM ${req.body.playerName || 'Citizen'}! Rise and grind!`,
        summary: "Another day in Pump Town. The city needs your votes. Check the stats and make your voice heard!",
        tip: "Diamond hands are forged in the fire of governance. WAGMI!"
      }
    });
  }
});

// ==================== AUTH ENDPOINTS ====================

async function sendWelcomeEmail(email) {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set - skipping welcome email');
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Mayor Satoshi <mayor@pump-town.xyz>',
        to: email,
        subject: '🏛️ Welcome to Pump Town, Citizen!',
        html: `<div style="font-family:Arial;background:#1a1a2e;color:#fff;padding:30px;border-radius:15px;"><h1 style="color:#00ff88;text-align:center;">🏛️ Welcome to Pump Town!</h1><p>You've joined the most chaotic AI-governed city in crypto!</p><ul style="color:#ffd700;"><li>🗳️ Vote on city decisions every 6 hours</li><li>🎰 Test your luck in the Degen Casino</li><li>🤖 Chat with your AI Mayor</li></ul><p style="text-align:center;margin-top:30px;"><a href="https://pump-town.xyz" style="background:linear-gradient(135deg,#00ff88,#00cc6a);color:#000;padding:15px 30px;text-decoration:none;border-radius:25px;font-weight:bold;">Enter Pump Town</a></p><p style="color:#888;text-align:center;">WAGMI,<br>Mayor Satoshi McPump 🎩</p></div>`
      })
    });
    const data = await response.json();
    if (response.ok) {
      console.log('✉️ Welcome email sent:', email, '- ID:', data.id);
    } else {
      console.error('❌ Email failed:', data.message || data.error || JSON.stringify(data));
    }
  } catch (err) {
    console.error('❌ Email error:', err.message);
  }
}

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  
  try {
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already registered' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [email.toLowerCase(), passwordHash]);
    
    console.log('👤 New user:', email);
    sendWelcomeEmail(email);
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
  
  try {
    const result = await pool.query('SELECT id, password_hash FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    
    const charResult = await pool.query('SELECT * FROM characters WHERE LOWER(email) = LOWER($1)', [email]);
    console.log('🔐 Login:', email);
    res.json({ success: true, userId: user.id, hasCharacter: charResult.rows.length > 0, character: charResult.rows[0] || null });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (userResult.rows.length === 0) return res.json({ success: true, message: 'If account exists, reset link sent.' });
    
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query('INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)', [email.toLowerCase(), token, expiresAt]);
    
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Pump Town <noreply@pump-town.xyz>', to: email,
          subject: '🔐 Reset Your Password',
          html: `<div style="font-family:Arial;background:#1a1a2e;color:#fff;padding:30px;border-radius:15px;"><h1 style="color:#ffd700;">🔐 Password Reset</h1><p><a href="https://pump-town.xyz?reset=${token}" style="background:#ffd700;color:#000;padding:15px 30px;text-decoration:none;border-radius:25px;">Reset Password</a></p><p style="color:#888;">Expires in 1 hour.</p></div>`
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('❌ Password reset email failed:', data.message || data.error);
      }
    }
    res.json({ success: true, message: 'If account exists, reset link sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Request failed' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ success: false, error: 'Token and password required' });
  if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password too short' });
  
  try {
    const tokenResult = await pool.query('SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = FALSE', [token]);
    if (tokenResult.rows.length === 0) return res.status(400).json({ success: false, error: 'Invalid or expired token' });
    
    const email = tokenResult.rows[0].email;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2)', [passwordHash, email]);
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token]);
    
    console.log('🔐 Password reset:', email);
    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

// ==================== CHARACTER ENDPOINTS ====================

app.post('/api/save-character', async (req, res) => {
  const { email, character, playerStats, resources, seasonPass } = req.body;
  if (!email || !character) return res.status(400).json({ success: false, error: 'Data required' });
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const userId = userResult.rows[0]?.id || null;
    let avatarStr = typeof character.avatar === 'object' ? JSON.stringify(character.avatar) : character.avatar;
    
    // Stringify playerStats, resources, and seasonPass for storage
    const playerStatsStr = JSON.stringify(playerStats || {});
    const resourcesStr = JSON.stringify(resources || {});
    const seasonPassStr = JSON.stringify(seasonPass || {});
    
    await pool.query(`
      INSERT INTO characters (user_id, email, name, role, trait, avatar, xp, level, reputation, degen_score, treasury, votes_count, player_stats, resources, season_pass)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (email) DO UPDATE SET 
        name=$3, role=$4, trait=$5, avatar=$6, xp=$7, level=$8, reputation=$9, degen_score=$10, treasury=$11, 
        votes_count=GREATEST(characters.votes_count, $12),
        player_stats=$13,
        resources=$14,
        season_pass=$15,
        updated_at=CURRENT_TIMESTAMP
    `, [userId, email.toLowerCase(), character.name, character.role, character.trait, avatarStr, character.xp||0, character.level||1, character.reputation||50, character.degenScore||0, character.treasury||1000, character.votesCount||0, playerStatsStr, resourcesStr, seasonPassStr]);
    
    console.log('💾 Character + progress + Season Pass saved:', character.name);
    res.json({ success: true });
  } catch (err) {
    console.error('Save character error:', err);
    res.status(500).json({ success: false, error: 'Save failed' });
  }
});

app.post('/api/load-character', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  
  try {
    const result = await pool.query('SELECT * FROM characters WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) return res.json({ success: false, character: null });
    
    const c = result.rows[0];
    let avatar = c.avatar;
    if (typeof avatar === 'string' && avatar.startsWith('{')) {
      try { avatar = JSON.parse(avatar); } catch(e) {}
    }
    
    // Parse playerStats, resources, and seasonPass from database
    let playerStats = c.player_stats || {};
    let resources = c.resources || {};
    let seasonPass = c.season_pass || {};
    
    // Handle if stored as string
    if (typeof playerStats === 'string') {
      try { playerStats = JSON.parse(playerStats); } catch(e) { playerStats = {}; }
    }
    if (typeof resources === 'string') {
      try { resources = JSON.parse(resources); } catch(e) { resources = {}; }
    }
    if (typeof seasonPass === 'string') {
      try { seasonPass = JSON.parse(seasonPass); } catch(e) { seasonPass = {}; }
    }
    
    console.log('📂 Character loaded:', c.name, '| Level:', playerStats.level || c.level || 1, '| XP:', playerStats.xp || c.xp || 0, '| Season Pass Lv:', seasonPass.level || 1);
    
    res.json({ 
      success: true, 
      character: { 
        name: c.name, 
        role: c.role, 
        trait: c.trait, 
        avatar, 
        xp: c.xp, 
        level: c.level, 
        reputation: c.reputation, 
        degenScore: c.degen_score, 
        treasury: c.treasury, 
        votesCount: c.votes_count, 
        joinedDate: c.joined_date, 
        badges: c.badges || [] 
      },
      playerStats: playerStats,
      resources: resources,
      seasonPass: seasonPass
    });
  } catch (err) {
    console.error('Load character error:', err);
    res.status(500).json({ success: false, error: 'Load failed' });
  }
});

// ==================== VOTING ENDPOINTS ====================

app.post('/api/cast-vote', async (req, res) => {
  const { email, optionId, voteId } = req.body;
  if (!email || !optionId) return res.status(400).json({ success: false, error: 'Email and option required' });
  
  const currentVoteId = voteId || getCurrentVoteId();
  
  try {
    const existing = await pool.query('SELECT id FROM votes WHERE LOWER(email) = LOWER($1) AND vote_id = $2', [email, currentVoteId]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Already voted' });
    
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const userId = userResult.rows[0]?.id || null;
    
    // Find option and apply effects
    const option = gameState.currentVote.options.find(o => o.id === optionId);
    await pool.query('INSERT INTO votes (user_id, email, vote_id, option_id, option_title) VALUES ($1, $2, $3, $4, $5)', [userId, email.toLowerCase(), currentVoteId, optionId, option?.title || 'Unknown']);
    await pool.query('UPDATE characters SET votes_count = votes_count + 1 WHERE LOWER(email) = LOWER($1)', [email]);
    
    if (option?.effects) {
      const changes = {};
      option.effects.forEach(e => { changes[e.stat] = e.value; });
      await updateCityStats(changes);
    }
    
    console.log('🗳️ Vote:', email, '→', optionId);
    res.json({ success: true, voteId: currentVoteId, optionId, timeRemaining: getTimeRemaining() });
  } catch (err) {
    console.error('Cast vote error:', err);
    res.status(500).json({ success: false, error: 'Vote failed' });
  }
});

app.post('/api/check-vote', async (req, res) => {
  const { email, voteId } = req.body;
  if (!email) return res.json({ hasVoted: false });
  
  const currentVoteId = voteId || getCurrentVoteId();
  try {
    const result = await pool.query('SELECT option_id FROM votes WHERE LOWER(email) = LOWER($1) AND vote_id = $2', [email, currentVoteId]);
    res.json({ hasVoted: result.rows.length > 0, currentVoteId, votedOption: result.rows[0]?.option_id || null, timeRemaining: getTimeRemaining() });
  } catch (err) {
    res.json({ hasVoted: false });
  }
});

app.get('/api/vote-results/:voteId', async (req, res) => {
  try {
    const result = await pool.query('SELECT option_id, COUNT(*) as count FROM votes WHERE vote_id = $1 GROUP BY option_id', [req.params.voteId]);
    const results = {};
    let total = 0;
    result.rows.forEach(r => { results[r.option_id] = parseInt(r.count); total += parseInt(r.count); });
    res.json({ success: true, results, total });
  } catch (err) {
    res.json({ success: false, results: {}, total: 0 });
  }
});

// ==================== GAME STATE ENDPOINTS ====================

app.get('/api/game-state', async (req, res) => {
  const { day, round, roundDisplay } = getDayAndRound();
  const currentVoteId = getCurrentVoteId();
  const cityStats = await getCityStats();
  
  // Try to get AI-cached vote
  let currentVote = gameState.currentVote;
  try {
    const aiVote = await pool.query('SELECT * FROM ai_votes WHERE vote_id = $1', [currentVoteId]);
    if (aiVote.rows.length > 0) {
      const cached = aiVote.rows[0];
      currentVote = {
        question: cached.question,
        mayorQuote: cached.mayor_quote,
        options: typeof cached.options === 'string' ? JSON.parse(cached.options) : cached.options
      };
    }
  } catch (err) {}
  
  res.json({
    success: true, day, round, roundDisplay,
    stats: cityStats,
    aiEnabled: !!anthropic,
    voteHistory: getUpdatedVoteHistory(),
    currentVote: { ...currentVote, id: currentVoteId, timeRemaining: getTimeRemaining(), endsAt: getCurrentCycleStart() + VOTE_CYCLE_MS },
    serverTime: Date.now()
  });
});

app.get('/api/gamestate', async (req, res) => {
  const { day, round } = getDayAndRound();
  const cityStats = await getCityStats();
  res.json({ ...gameState, stats: cityStats, day, round, currentVote: { ...gameState.currentVote, id: getCurrentVoteId() } });
});

app.get('/api/city-stats', async (req, res) => {
  res.json({ success: true, stats: await getCityStats() });
});

// ==================== LEADERBOARD ====================

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT name, role, xp, level, degen_score, avatar, updated_at FROM player_stats ORDER BY xp DESC LIMIT 100');
    res.json({ success: true, leaderboard: result.rows.map(p => ({ name: p.name, role: p.role || 'Citizen', xp: p.xp || 0, level: p.level || 1, degenScore: p.degen_score || 0, avatar: p.avatar })), totalPlayers: result.rows.length });
  } catch (err) {
    res.json({ success: true, leaderboard: [], totalPlayers: 0 });
  }
});

app.post('/api/update-stats', async (req, res) => {
  const { name, role, xp, level, degenScore, avatar } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name required' });
  
  // Handle avatar - can be string ID or object with id/name
  let avatarValue = avatar;
  if (avatar && typeof avatar === 'object') {
    avatarValue = avatar.id || avatar.name || JSON.stringify(avatar);
  }
  
  try {
    await pool.query(`
      INSERT INTO player_stats (name, role, xp, level, degen_score, avatar, updated_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET role=COALESCE($2, player_stats.role), xp=COALESCE($3, player_stats.xp), level=COALESCE($4, player_stats.level), degen_score=COALESCE($5, player_stats.degen_score), avatar=COALESCE($6, player_stats.avatar), updated_at=CURRENT_TIMESTAMP
    `, [name, role, xp, level, degenScore, avatarValue]);
    res.json({ success: true });
  } catch (err) {
    console.error('Update stats error:', err);
    res.status(500).json({ success: false, error: 'Update failed' });
  }
});

app.get('/api/player-stats/:name', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM player_stats WHERE LOWER(name) = LOWER($1)', [req.params.name]);
    res.json({ success: result.rows.length > 0, stats: result.rows[0] || null });
  } catch (err) {
    res.json({ success: false, stats: null });
  }
});

// ==================== GLOBAL CHAT ====================

// Get chat messages
app.get('/api/chat/:channel', async (req, res) => {
  const { channel } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  
  try {
    const result = await pool.query(
      'SELECT id, player_name, message, mentions, created_at FROM chat_messages WHERE channel = $1 ORDER BY created_at DESC LIMIT $2',
      [channel, limit]
    );
    
    // Return in chronological order (oldest first)
    const messages = result.rows.reverse().map(row => ({
      id: row.id,
      name: row.player_name,
      text: row.message,
      mentions: row.mentions || [],
      time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(row.created_at).getTime()
    }));
    
    res.json({ success: true, messages });
  } catch (err) {
    console.error('Get chat error:', err);
    res.json({ success: false, messages: [] });
  }
});

// Send chat message
app.post('/api/chat/send', async (req, res) => {
  const { channel, playerName, message } = req.body;
  
  if (!playerName || !message) {
    return res.status(400).json({ success: false, error: 'Name and message required' });
  }
  
  // Basic validation
  if (message.length > 500) {
    return res.status(400).json({ success: false, error: 'Message too long (max 500 chars)' });
  }
  
  const chatChannel = channel || 'global';
  
  // Parse @mentions
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[1].toLowerCase());
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO chat_messages (channel, player_name, message, mentions) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      [chatChannel, playerName, message.trim(), JSON.stringify(mentions)]
    );
    
    const newMsg = {
      id: result.rows[0].id,
      name: playerName,
      text: message.trim(),
      mentions,
      time: new Date(result.rows[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(result.rows[0].created_at).getTime()
    };
    
    console.log('💬 Chat:', playerName, '→', message.substring(0, 50), mentions.length > 0 ? `(@${mentions.join(', @')})` : '');
    res.json({ success: true, message: newMsg });
  } catch (err) {
    console.error('Send chat error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// Get new messages since a timestamp (for polling)
app.get('/api/chat/:channel/since/:timestamp', async (req, res) => {
  const { channel, timestamp } = req.params;
  
  try {
    const since = new Date(parseInt(timestamp));
    const result = await pool.query(
      'SELECT id, player_name, message, mentions, created_at FROM chat_messages WHERE channel = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 50',
      [channel, since]
    );
    
    const messages = result.rows.map(row => ({
      id: row.id,
      name: row.player_name,
      text: row.message,
      mentions: row.mentions || [],
      time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: new Date(row.created_at).getTime()
    }));
    
    res.json({ success: true, messages });
  } catch (err) {
    console.error('Get new chat error:', err);
    res.json({ success: false, messages: [] });
  }
});

// ==================== FEAR & GREED ====================

let fearGreedCache = { value: 50, classification: 'Neutral', lastFetch: 0 };

app.get('/api/fear-greed', async (req, res) => {
  const now = Date.now();
  if (now - fearGreedCache.lastFetch < 5 * 60 * 1000 && fearGreedCache.lastFetch > 0) {
    return res.json({ success: true, value: fearGreedCache.value, classification: fearGreedCache.classification, cached: true });
  }
  
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await response.json();
    if (data.data?.[0]) {
      fearGreedCache = { value: parseInt(data.data[0].value), classification: data.data[0].value_classification, lastFetch: now };
      res.json({ success: true, value: fearGreedCache.value, classification: fearGreedCache.classification, cached: false });
    } else throw new Error('Invalid response');
  } catch (err) {
    res.json({ success: true, value: fearGreedCache.value, classification: fearGreedCache.classification, cached: true });
  }
});

// ==================== WALLET VERIFICATION ====================

app.post('/api/verify-wallet', async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ success: false, error: 'Wallet required', balance: 0 });
  
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const tokenMint = process.env.TOWN_TOKEN_MINT || 'ApEFtr2eba6sWFk3gF6GgX4i2uT4B5k2HZT75ZDapump';
    
    const response = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [walletAddress, { mint: tokenMint }, { encoding: 'jsonParsed' }] })
    });
    const data = await response.json();
    const balance = data.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    res.json({ success: balance >= 100000, balance, required: 100000, walletAddress });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Verification failed', balance: 0 });
  }
});

// ==================== DAILY LOGIN REWARDS ====================

// Daily reward structure
const DAILY_REWARDS = [
  { day: 1, hopium: 10, alpha: 0, copium: 5, liquidity: 0, xp: 10 },
  { day: 2, hopium: 15, alpha: 5, copium: 5, liquidity: 5, xp: 15 },
  { day: 3, hopium: 20, alpha: 10, copium: 10, liquidity: 10, xp: 20 },
  { day: 4, hopium: 25, alpha: 15, copium: 10, liquidity: 15, xp: 25 },
  { day: 5, hopium: 35, alpha: 20, copium: 15, liquidity: 20, xp: 35 },
  { day: 6, hopium: 50, alpha: 30, copium: 20, liquidity: 25, xp: 50 },
  { day: 7, hopium: 100, alpha: 50, copium: 30, liquidity: 50, xp: 100 }, // Weekly bonus!
];

// Get login streak status
app.get('/api/daily-reward/status/:email', async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT login_streak, last_login_date, last_reward_claimed FROM characters WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Player not found' });
    }
    
    const player = result.rows[0];
    const today = new Date().toISOString().split('T')[0];
    const lastLogin = player.last_login_date ? new Date(player.last_login_date).toISOString().split('T')[0] : null;
    const lastClaimed = player.last_reward_claimed ? new Date(player.last_reward_claimed).toISOString().split('T')[0] : null;
    
    // Check if can claim today
    const canClaim = lastClaimed !== today;
    
    // Calculate current streak
    let currentStreak = player.login_streak || 0;
    
    // If last login was yesterday, streak continues. If older, streak resets.
    if (lastLogin) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastLogin !== today && lastLogin !== yesterdayStr) {
        currentStreak = 0; // Streak broken
      }
    }
    
    // Get reward for current day (1-7, then loops)
    const rewardDay = (currentStreak % 7) + 1;
    const todayReward = DAILY_REWARDS[rewardDay - 1];
    
    res.json({
      success: true,
      canClaim,
      currentStreak,
      rewardDay,
      todayReward,
      allRewards: DAILY_REWARDS,
      lastClaimed
    });
  } catch (err) {
    console.error('Daily reward status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// Claim daily reward
app.post('/api/daily-reward/claim', async (req, res) => {
  const { email, playerName } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get current status
    const result = await pool.query(
      'SELECT login_streak, last_login_date, last_reward_claimed, resources FROM characters WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Player not found' });
    }
    
    const player = result.rows[0];
    const lastClaimed = player.last_reward_claimed ? new Date(player.last_reward_claimed).toISOString().split('T')[0] : null;
    
    if (lastClaimed === today) {
      return res.json({ success: false, error: 'Already claimed today', alreadyClaimed: true });
    }
    
    // Calculate new streak
    const lastLogin = player.last_login_date ? new Date(player.last_login_date).toISOString().split('T')[0] : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    let newStreak = player.login_streak || 0;
    if (!lastLogin || (lastLogin !== today && lastLogin !== yesterdayStr)) {
      newStreak = 1; // Reset or start streak
    } else if (lastLogin === yesterdayStr) {
      newStreak = (player.login_streak || 0) + 1; // Continue streak
    } else if (lastLogin === today) {
      newStreak = player.login_streak || 1; // Same day, keep streak
    }
    
    // Get reward
    const rewardDay = ((newStreak - 1) % 7) + 1;
    const reward = DAILY_REWARDS[rewardDay - 1];
    
    // Update resources
    let currentResources = player.resources || {};
    if (typeof currentResources === 'string') {
      currentResources = JSON.parse(currentResources);
    }
    
    const newResources = {
      hopium: (currentResources.hopium || 0) + reward.hopium,
      alpha: (currentResources.alpha || 0) + reward.alpha,
      copium: (currentResources.copium || 0) + reward.copium,
      liquidity: (currentResources.liquidity || 0) + reward.liquidity
    };
    
    // Update database
    await pool.query(
      `UPDATE characters SET 
        login_streak = $1, 
        last_login_date = $2, 
        last_reward_claimed = $2,
        resources = $3
      WHERE LOWER(email) = LOWER($4)`,
      [newStreak, today, JSON.stringify(newResources), email]
    );
    
    // Log activity
    if (playerName) {
      await pool.query(
        'INSERT INTO activity_feed (player_name, activity_type, description, icon, metadata) VALUES ($1, $2, $3, $4, $5)',
        [playerName, 'daily_reward', `claimed Day ${rewardDay} reward (${newStreak} day streak!)`, '🎁', JSON.stringify({ streak: newStreak, reward })]
      );
    }
    
    console.log(`🎁 Daily reward claimed: ${playerName || email} - Day ${rewardDay}, Streak ${newStreak}`);
    
    res.json({
      success: true,
      reward,
      newStreak,
      rewardDay,
      newResources,
      xpEarned: reward.xp
    });
  } catch (err) {
    console.error('Claim daily reward error:', err);
    res.status(500).json({ success: false, error: 'Failed to claim reward' });
  }
});

// ==================== ACTIVITY FEED ====================

// Post new activity
app.post('/api/activity', async (req, res) => {
  const { playerName, activityType, description, icon, metadata } = req.body;
  
  if (!playerName || !activityType || !description) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO activity_feed (player_name, activity_type, description, icon, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at',
      [playerName, activityType, description, icon || '📢', JSON.stringify(metadata || {})]
    );
    
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Post activity error:', err);
    res.status(500).json({ success: false, error: 'Failed to post activity' });
  }
});

// Get recent activity feed
app.get('/api/activity/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  
  try {
    const result = await pool.query(
      'SELECT id, player_name, activity_type, description, icon, metadata, created_at FROM activity_feed ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    
    const activities = result.rows.map(row => ({
      id: row.id,
      playerName: row.player_name,
      type: row.activity_type,
      description: row.description,
      icon: row.icon,
      metadata: row.metadata,
      timestamp: new Date(row.created_at).getTime(),
      timeAgo: getTimeAgoString(new Date(row.created_at))
    }));
    
    res.json({ success: true, activities });
  } catch (err) {
    console.error('Get activity feed error:', err);
    res.json({ success: true, activities: [] });
  }
});

// Get activities since timestamp (for polling)
app.get('/api/activity/since/:timestamp', async (req, res) => {
  const { timestamp } = req.params;
  
  try {
    const since = new Date(parseInt(timestamp));
    const result = await pool.query(
      'SELECT id, player_name, activity_type, description, icon, metadata, created_at FROM activity_feed WHERE created_at > $1 ORDER BY created_at DESC LIMIT 20',
      [since]
    );
    
    const activities = result.rows.map(row => ({
      id: row.id,
      playerName: row.player_name,
      type: row.activity_type,
      description: row.description,
      icon: row.icon,
      metadata: row.metadata,
      timestamp: new Date(row.created_at).getTime(),
      timeAgo: getTimeAgoString(new Date(row.created_at))
    }));
    
    res.json({ success: true, activities });
  } catch (err) {
    console.error('Get new activities error:', err);
    res.json({ success: true, activities: [] });
  }
});

// Helper function for time ago
function getTimeAgoString(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ==================== PLAYER PROFILES ====================

// Get player profile by name
app.get('/api/player/:name', async (req, res) => {
  const { name } = req.params;
  
  try {
    // Get player data
    const playerResult = await pool.query(
      `SELECT name, role, avatar, xp, level, reputation, degen_score, votes_count, 
              badges, joined_date, player_stats, resources, login_streak
       FROM characters WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    
    if (playerResult.rows.length === 0) {
      return res.json({ success: false, error: 'Player not found' });
    }
    
    const player = playerResult.rows[0];
    
    // Get recent activities for this player
    const activityResult = await pool.query(
      'SELECT activity_type, description, icon, created_at FROM activity_feed WHERE LOWER(player_name) = LOWER($1) ORDER BY created_at DESC LIMIT 10',
      [name]
    );
    
    const recentActivities = activityResult.rows.map(row => ({
      type: row.activity_type,
      description: row.description,
      icon: row.icon,
      timeAgo: getTimeAgoString(new Date(row.created_at))
    }));
    
    // Parse avatar
    let avatar = player.avatar;
    if (typeof avatar === 'string') {
      try { avatar = JSON.parse(avatar); } catch (e) { }
    }
    
    // Parse badges
    let badges = player.badges || [];
    if (typeof badges === 'string') {
      try { badges = JSON.parse(badges); } catch (e) { badges = []; }
    }
    
    // Parse player_stats
    let playerStats = player.player_stats || {};
    if (typeof playerStats === 'string') {
      try { playerStats = JSON.parse(playerStats); } catch (e) { playerStats = {}; }
    }
    
    // Parse resources
    let resources = player.resources || {};
    if (typeof resources === 'string') {
      try { resources = JSON.parse(resources); } catch (e) { resources = {}; }
    }
    
    // Calculate days since joined
    const joinedDate = new Date(player.joined_date);
    const daysSinceJoined = Math.floor((Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24));
    
    res.json({
      success: true,
      profile: {
        name: player.name,
        role: player.role,
        avatar,
        level: playerStats.level || player.level || 1,
        xp: playerStats.xp || player.xp || 0,
        reputation: player.reputation || 50,
        degenScore: playerStats.degenScore || player.degen_score || 0,
        votesCount: player.votes_count || 0,
        badges,
        resources,
        loginStreak: player.login_streak || 0,
        joinedDate: joinedDate.toISOString(),
        daysSinceJoined,
        gamesPlayed: playerStats.gamesPlayed || 0,
        gamesWon: playerStats.gamesWon || 0,
        totalActions: playerStats.totalActions || 0,
        recentActivities
      }
    });
  } catch (err) {
    console.error('Get player profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// ==================== PUSH NOTIFICATIONS ====================

// Subscribe to push notifications
app.post('/api/push/subscribe', async (req, res) => {
  const { email, playerName, subscription } = req.body;
  
  if (!email || !subscription) {
    return res.status(400).json({ success: false, error: 'Email and subscription required' });
  }
  
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (email, player_name, subscription) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (email) DO UPDATE SET subscription = $3, player_name = $2`,
      [email, playerName, JSON.stringify(subscription)]
    );
    
    console.log(`🔔 Push subscription: ${playerName || email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// Unsubscribe from push notifications
app.post('/api/push/unsubscribe', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE email = $1', [email]);
    res.json({ success: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ success: false, error: 'Failed to unsubscribe' });
  }
});

// Get notification preferences
app.get('/api/push/status/:email', async (req, res) => {
  const { email } = req.params;
  
  try {
    const result = await pool.query('SELECT id FROM push_subscriptions WHERE email = $1', [email]);
    res.json({ success: true, subscribed: result.rows.length > 0 });
  } catch (err) {
    res.json({ success: true, subscribed: false });
  }
});

// ==================== SEED DATA (for populating leaderboard) ====================

app.post('/api/seed-leaderboard', async (req, res) => {
  try {
    const seedPlayers = [
      { name: 'alpha_hunter', role: 'Degen', xp: 4250, level: 8, degen_score: 145, avatar: 'pepe' },
      { name: 'ser_pump', role: 'Whale', xp: 3800, level: 7, degen_score: 120, avatar: 'doge' },
      { name: 'moon_chaser', role: 'Chart Autist', xp: 3100, level: 6, degen_score: 98, avatar: 'shiba' },
      { name: 'degen_mike', role: 'Meme Lord', xp: 2650, level: 5, degen_score: 85, avatar: 'floki' },
      { name: 'diamond_dan', role: 'Ape Farmer', xp: 2200, level: 5, degen_score: 72, avatar: 'wif' },
      { name: 'based_andy', role: 'Degen', xp: 1850, level: 4, degen_score: 63, avatar: 'popcat' },
      { name: 'yield_farm3r', role: 'Chart Autist', xp: 1500, level: 4, degen_score: 55, avatar: 'pepe' },
      { name: 'anon_whale', role: 'Whale', xp: 1200, level: 3, degen_score: 48, avatar: 'doge' },
      { name: 'fomo_fred', role: 'Meme Lord', xp: 950, level: 3, degen_score: 42, avatar: 'shiba' },
      { name: 'paper_pete', role: 'Ape Farmer', xp: 720, level: 3, degen_score: 35, avatar: 'floki' },
      { name: 'early_ape', role: 'Degen', xp: 580, level: 2, degen_score: 28, avatar: 'wif' },
      { name: 'bag_secured', role: 'Chart Autist', xp: 450, level: 2, degen_score: 22, avatar: 'popcat' },
      { name: 'sol_maxi', role: 'Whale', xp: 320, level: 2, degen_score: 18, avatar: 'pepe' },
      { name: 'eth_bull', role: 'Meme Lord', xp: 180, level: 1, degen_score: 12, avatar: 'doge' },
      { name: 'swap_king99', role: 'Ape Farmer', xp: 95, level: 1, degen_score: 8, avatar: 'shiba' }
    ];
    
    let added = 0;
    for (const player of seedPlayers) {
      const result = await pool.query(
        `INSERT INTO player_stats (name, role, xp, level, degen_score, avatar) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING RETURNING name`,
        [player.name, player.role, player.xp, player.level, player.degen_score, player.avatar]
      );
      if (result.rows.length > 0) added++;
    }
    
    // Also seed activity feed
    const seedActivities = [
      { name: 'alpha_hunter', type: 'level_up', desc: 'reached Level 8!', icon: '🎉' },
      { name: 'ser_pump', type: 'game_win', desc: 'won 500 Hopium in slots', icon: '🎰' },
      { name: 'moon_chaser', type: 'vote', desc: 'voted on governance', icon: '🗳️' },
      { name: 'degen_mike', type: 'action', desc: 'launched a new coin', icon: '🚀' },
      { name: 'diamond_dan', type: 'daily_reward', desc: 'claimed Day 5 reward (5 day streak!)', icon: '🎁' },
      { name: 'based_andy', type: 'game_win', desc: 'scored 850 in Token Sniper', icon: '🎯' },
      { name: 'yield_farm3r', type: 'level_up', desc: 'reached Level 4!', icon: '🎉' },
      { name: 'anon_whale', type: 'action', desc: 'sniped early on $PEPE2', icon: '🎯' }
    ];
    
    for (let i = 0; i < seedActivities.length; i++) {
      const activity = seedActivities[i];
      await pool.query(
        `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
        [activity.name, activity.type, activity.desc, activity.icon]
      ).catch(() => {});
    }
    
    console.log(`✅ Seeded ${added} players to leaderboard`);
    res.json({ success: true, playersAdded: added, message: `Added ${added} seed players` });
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).json({ success: false, error: 'Failed to seed data' });
  }
});

// ==================== HEALTH CHECK ====================

// ==================== AGENT API ====================
// Enables AI agents to autonomously play Pump Town

// Helper functions for agent API
function generateApiKey() {
  return 'pt_live_' + crypto.randomBytes(24).toString('hex');
}

function generateAgentId() {
  return 'agent_' + crypto.randomBytes(8).toString('hex');
}

// Rate limiting (simple in-memory)
const agentRateLimits = {};

function agentRateLimit(type, limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.agent?.id || req.ip}:${type}`;
    const now = Date.now();
    
    if (!agentRateLimits[key]) {
      agentRateLimits[key] = { count: 0, resetAt: now + windowMs };
    }
    
    if (now > agentRateLimits[key].resetAt) {
      agentRateLimits[key] = { count: 0, resetAt: now + windowMs };
    }
    
    if (agentRateLimits[key].count >= limit) {
      const retryAfter = Math.ceil((agentRateLimits[key].resetAt - now) / 1000);
      return res.status(429).json({
        success: false,
        error: { code: 429, message: 'Rate limit exceeded', retryAfter }
      });
    }
    
    agentRateLimits[key].count++;
    next();
  };
}

// Middleware to authenticate agents
async function authenticateAgent(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 401, message: 'Missing or invalid authorization header' }
    });
  }
  
  const apiKey = authHeader.split(' ')[1];
  
  try {
    const result = await pool.query(
      'SELECT * FROM agents WHERE api_key = $1',
      [apiKey]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { code: 401, message: 'Invalid API key' }
      });
    }
    
    req.agent = result.rows[0];
    
    // Update last active
    await pool.query(
      'UPDATE agents SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
      [req.agent.id]
    );
    
    next();
  } catch (error) {
    console.error('Agent auth error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Authentication error' }
    });
  }
}

// Register new agent
app.post('/api/v1/agent/register', agentRateLimit('register', 5, 3600000), async (req, res) => {
  try {
    const { name, avatar, bio, framework } = req.body;
    
    if (!name || name.length < 3 || name.length > 50) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Name must be 3-50 characters' }
      });
    }
    
    const id = generateAgentId();
    const apiKey = generateApiKey();
    
    await pool.query(
      `INSERT INTO agents (id, api_key, name, avatar, bio, framework)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, apiKey, name, avatar || '🤖', bio || '', framework || 'unknown']
    );
    
    console.log(`🤖 New agent registered: ${name} (${id})`);
    
    res.json({
      success: true,
      agent: {
        id,
        apiKey,
        name,
        wallet: {
          townCoins: 10000,
          hopium: 5000,
          alpha: 1000
        },
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Agent register error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to register agent' }
    });
  }
});

// Get game state for agents
app.get('/api/v1/agent/state', authenticateAgent, agentRateLimit('read', 60, 60000), async (req, res) => {
  try {
    const cityStats = await getCityStats();
    const { day, round } = getDayAndRound();
    
    // Get current vote from DB or fallback
    let currentVote = gameState.currentVote;
    const voteId = getCurrentVoteId();
    
    try {
      const voteResult = await pool.query(
        'SELECT * FROM ai_votes WHERE vote_id = $1',
        [voteId]
      );
      if (voteResult.rows.length > 0) {
        const v = voteResult.rows[0];
        currentVote = {
          id: v.vote_id,
          question: v.question,
          mayorQuote: v.mayor_quote,
          options: typeof v.options === 'string' ? JSON.parse(v.options) : v.options
        };
      }
    } catch (e) { }
    
    // Check if agent already voted
    const voteCheck = await pool.query(
      'SELECT * FROM agent_votes WHERE agent_id = $1 AND vote_id = $2',
      [req.agent.id, voteId]
    );
    
    // Get market prices (simplified)
    let marketPrices = { BTC: 98500, ETH: 3200, SOL: 145, DOGE: 0.35, ADA: 0.95, XRP: 2.20 };
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,cardano,ripple&vs_currencies=usd');
      const priceData = await priceResponse.json();
      marketPrices = {
        BTC: priceData.bitcoin?.usd || 98500,
        ETH: priceData.ethereum?.usd || 3200,
        SOL: priceData.solana?.usd || 145,
        DOGE: priceData.dogecoin?.usd || 0.35,
        ADA: priceData.cardano?.usd || 0.95,
        XRP: priceData.ripple?.usd || 2.20
      };
    } catch (e) { }
    
    res.json({
      success: true,
      cityStats: {
        economy: cityStats.economy,
        security: cityStats.security,
        culture: cityStats.culture,
        morale: cityStats.morale
      },
      governanceDay: day,
      round,
      currentVote: currentVote ? {
        id: voteId,
        ...currentVote,
        hasVoted: voteCheck.rows.length > 0,
        timeRemaining: getTimeRemaining()
      } : null,
      marketPrices,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Agent state error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to get game state' }
    });
  }
});

// Get agent portfolio
app.get('/api/v1/agent/portfolio', authenticateAgent, agentRateLimit('read', 60, 60000), async (req, res) => {
  try {
    const agent = req.agent;
    
    const holdings = await pool.query(
      'SELECT * FROM agent_holdings WHERE agent_id = $1',
      [agent.id]
    );
    
    res.json({
      success: true,
      wallet: {
        townCoins: agent.wallet_town_coins,
        hopium: agent.wallet_hopium,
        alpha: agent.wallet_alpha
      },
      holdings: holdings.rows.map(h => ({
        symbol: h.symbol,
        amount: parseFloat(h.amount),
        avgBuyPrice: parseFloat(h.avg_buy_price)
      })),
      stats: {
        totalTrades: agent.total_trades,
        totalPnL: agent.total_pnl,
        level: agent.level,
        xp: agent.xp,
        totalVotes: agent.total_votes,
        voteStreak: agent.vote_streak
      }
    });
  } catch (error) {
    console.error('Agent portfolio error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to get portfolio' }
    });
  }
});

// Agent buy token
app.post('/api/v1/agent/trade/buy', authenticateAgent, agentRateLimit('trade', 20, 60000), async (req, res) => {
  try {
    const { symbol, amountInTownCoins } = req.body;
    const agent = req.agent;
    
    if (!symbol || !amountInTownCoins || amountInTownCoins <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Invalid trade parameters' }
      });
    }
    
    if (agent.wallet_town_coins < amountInTownCoins) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Insufficient funds' }
      });
    }
    
    // Get current price
    const prices = { BTC: 98500, ETH: 3200, SOL: 145, DOGE: 0.35, ADA: 0.95, XRP: 2.20 };
    const price = prices[symbol.toUpperCase()];
    
    if (!price) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Unknown symbol' }
      });
    }
    
    const fee = Math.floor(amountInTownCoins * 0.005);
    const netAmount = amountInTownCoins - fee;
    const tokenAmount = netAmount / price;
    
    // Update wallet
    await pool.query(
      'UPDATE agents SET wallet_town_coins = wallet_town_coins - $1, total_trades = total_trades + 1 WHERE id = $2',
      [amountInTownCoins, agent.id]
    );
    
    // Update or insert holding
    await pool.query(
      `INSERT INTO agent_holdings (agent_id, symbol, amount, avg_buy_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, symbol) 
       DO UPDATE SET 
          amount = agent_holdings.amount + $3,
          avg_buy_price = (agent_holdings.avg_buy_price * agent_holdings.amount + $4 * $3) / (agent_holdings.amount + $3)`,
      [agent.id, symbol.toUpperCase(), tokenAmount, price]
    );
    
    // Record trade
    await pool.query(
      `INSERT INTO agent_trades (agent_id, type, symbol, amount, price, total, fee)
       VALUES ($1, 'buy', $2, $3, $4, $5, $6)`,
      [agent.id, symbol.toUpperCase(), tokenAmount, price, amountInTownCoins, fee]
    );
    
    console.log(`🤖 Agent ${agent.name} bought ${tokenAmount.toFixed(6)} ${symbol} for ${amountInTownCoins} TOWN`);
    
    res.json({
      success: true,
      trade: {
        id: 'trade_' + crypto.randomBytes(8).toString('hex'),
        type: 'buy',
        symbol: symbol.toUpperCase(),
        amount: tokenAmount,
        price,
        cost: amountInTownCoins,
        fee,
        timestamp: new Date().toISOString()
      },
      newBalance: {
        townCoins: agent.wallet_town_coins - amountInTownCoins
      }
    });
  } catch (error) {
    console.error('Agent buy error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Trade failed' }
    });
  }
});

// Agent sell token
app.post('/api/v1/agent/trade/sell', authenticateAgent, agentRateLimit('trade', 20, 60000), async (req, res) => {
  try {
    const { symbol, amount } = req.body;
    const agent = req.agent;
    
    if (!symbol || !amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Invalid trade parameters' }
      });
    }
    
    // Check holdings
    const holding = await pool.query(
      'SELECT * FROM agent_holdings WHERE agent_id = $1 AND symbol = $2',
      [agent.id, symbol.toUpperCase()]
    );
    
    if (holding.rows.length === 0 || parseFloat(holding.rows[0].amount) < amount) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Insufficient holdings' }
      });
    }
    
    const prices = { BTC: 98500, ETH: 3200, SOL: 145, DOGE: 0.35, ADA: 0.95, XRP: 2.20 };
    const price = prices[symbol.toUpperCase()];
    
    const grossAmount = amount * price;
    const fee = Math.floor(grossAmount * 0.005);
    const netAmount = grossAmount - fee;
    
    const avgBuyPrice = parseFloat(holding.rows[0].avg_buy_price);
    const pnl = (price - avgBuyPrice) * amount;
    
    // Update wallet
    await pool.query(
      'UPDATE agents SET wallet_town_coins = wallet_town_coins + $1, total_trades = total_trades + 1, total_pnl = total_pnl + $2 WHERE id = $3',
      [netAmount, pnl, agent.id]
    );
    
    // Update holding
    const newAmount = parseFloat(holding.rows[0].amount) - amount;
    if (newAmount <= 0.00000001) {
      await pool.query('DELETE FROM agent_holdings WHERE agent_id = $1 AND symbol = $2', [agent.id, symbol.toUpperCase()]);
    } else {
      await pool.query('UPDATE agent_holdings SET amount = $1 WHERE agent_id = $2 AND symbol = $3', [newAmount, agent.id, symbol.toUpperCase()]);
    }
    
    // Record trade
    await pool.query(
      `INSERT INTO agent_trades (agent_id, type, symbol, amount, price, total, fee, pnl)
       VALUES ($1, 'sell', $2, $3, $4, $5, $6, $7)`,
      [agent.id, symbol.toUpperCase(), amount, price, netAmount, fee, pnl]
    );
    
    console.log(`🤖 Agent ${agent.name} sold ${amount} ${symbol} for ${netAmount} TOWN (PnL: ${pnl})`);
    
    res.json({
      success: true,
      trade: {
        id: 'trade_' + crypto.randomBytes(8).toString('hex'),
        type: 'sell',
        symbol: symbol.toUpperCase(),
        amount,
        price,
        received: netAmount,
        fee,
        pnl,
        timestamp: new Date().toISOString()
      },
      newBalance: {
        townCoins: agent.wallet_town_coins + netAmount
      }
    });
  } catch (error) {
    console.error('Agent sell error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Trade failed' }
    });
  }
});

// Agent vote
app.post('/api/v1/agent/vote', authenticateAgent, agentRateLimit('vote', 1, 60000), async (req, res) => {
  try {
    const { voteId, optionId } = req.body;
    const agent = req.agent;
    
    const currentVoteId = getCurrentVoteId();
    const actualVoteId = voteId || currentVoteId;
    
    if (!optionId) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Missing optionId' }
      });
    }
    
    // Check if already voted
    const existing = await pool.query(
      'SELECT * FROM agent_votes WHERE agent_id = $1 AND vote_id = $2',
      [agent.id, actualVoteId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 409, message: 'Already voted on this proposal' }
      });
    }
    
    // Record agent vote
    await pool.query(
      'INSERT INTO agent_votes (agent_id, vote_id, option_id) VALUES ($1, $2, $3)',
      [agent.id, actualVoteId, optionId]
    );
    
    // Also add to main votes table (so it counts with human votes)
    await pool.query(
      `INSERT INTO votes (email, vote_id, option_id, option_title)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email, vote_id) DO NOTHING`,
      [`agent_${agent.id}@pump.town`, actualVoteId, optionId, `Agent Vote: ${optionId}`]
    );
    
    // Update agent stats
    await pool.query(
      'UPDATE agents SET total_votes = total_votes + 1, xp = xp + 50 WHERE id = $1',
      [agent.id]
    );
    
    console.log(`🤖 Agent ${agent.name} voted ${optionId} on ${actualVoteId}`);
    
    res.json({
      success: true,
      vote: {
        id: 'cast_' + crypto.randomBytes(8).toString('hex'),
        voteId: actualVoteId,
        optionId,
        timestamp: new Date().toISOString()
      },
      xpEarned: 50
    });
  } catch (error) {
    console.error('Agent vote error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Vote failed' }
    });
  }
});

// Agent play slots
app.post('/api/v1/agent/casino/slots', authenticateAgent, agentRateLimit('casino', 30, 60000), async (req, res) => {
  try {
    const { bet } = req.body;
    const agent = req.agent;
    
    if (!bet || bet < 10 || bet > 10000) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Bet must be between 10 and 10000' }
      });
    }
    
    if (agent.wallet_town_coins < bet) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Insufficient funds' }
      });
    }
    
    const SYMBOLS = ['🍒', '🍋', '7️⃣', '💎', '🔔', '⭐'];
    const reels = [
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
    ];
    
    let winAmount = 0;
    let winType = 'loss';
    
    if (reels[0] === reels[1] && reels[1] === reels[2]) {
      winType = 'jackpot';
      winAmount = reels[0] === '💎' ? bet * 100 :
                  reels[0] === '7️⃣' ? bet * 50 :
                  bet * 10;
    } else if (reels[0] === reels[1] || reels[1] === reels[2]) {
      winType = 'small_win';
      winAmount = bet * 2;
    }
    
    const netChange = winAmount - bet;
    
    await pool.query(
      'UPDATE agents SET wallet_town_coins = wallet_town_coins + $1 WHERE id = $2',
      [netChange, agent.id]
    );
    
    console.log(`🎰 Agent ${agent.name} slots: ${reels.join('')} - ${winType} (${netChange > 0 ? '+' : ''}${netChange})`);
    
    res.json({
      success: true,
      result: {
        reels,
        win: winAmount > 0,
        winAmount,
        type: winType
      },
      newBalance: {
        townCoins: agent.wallet_town_coins + netChange
      }
    });
  } catch (error) {
    console.error('Agent slots error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Slots failed' }
    });
  }
});

// Agent play dice
app.post('/api/v1/agent/casino/dice', authenticateAgent, agentRateLimit('casino', 30, 60000), async (req, res) => {
  try {
    const { bet, prediction } = req.body;
    const agent = req.agent;
    
    if (!bet || bet < 10 || !prediction || !['high', 'low'].includes(prediction)) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Invalid bet or prediction' }
      });
    }
    
    if (agent.wallet_town_coins < bet) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Insufficient funds' }
      });
    }
    
    const playerRoll = Math.floor(Math.random() * 6) + 1;
    const houseRoll = Math.floor(Math.random() * 6) + 1;
    
    const isHigh = playerRoll >= 4;
    const win = (prediction === 'high' && isHigh) || (prediction === 'low' && !isHigh);
    
    const winAmount = win ? bet * 2 : 0;
    const netChange = winAmount - bet;
    
    await pool.query(
      'UPDATE agents SET wallet_town_coins = wallet_town_coins + $1 WHERE id = $2',
      [netChange, agent.id]
    );
    
    res.json({
      success: true,
      result: {
        playerRoll,
        houseRoll,
        prediction,
        win,
        winAmount
      },
      newBalance: {
        townCoins: agent.wallet_town_coins + netChange
      }
    });
  } catch (error) {
    console.error('Agent dice error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Dice game failed' }
    });
  }
});

// Agent send chat message
app.post('/api/v1/agent/chat', authenticateAgent, agentRateLimit('chat', 10, 60000), async (req, res) => {
  try {
    const { message, channel } = req.body;
    const agent = req.agent;
    
    if (!message || message.length > 500) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: 'Message must be 1-500 characters' }
      });
    }
    
    // Insert into chat_messages table (same as human messages)
    const result = await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [channel || 'global', `🤖 ${agent.name}`, message]
    );
    
    console.log(`💬 Agent ${agent.name}: ${message.substring(0, 50)}...`);
    
    res.json({
      success: true,
      message: {
        id: 'msg_' + result.rows[0].id,
        content: message,
        author: {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          isAgent: true
        },
        channel: channel || 'global',
        timestamp: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Agent chat error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Chat failed' }
    });
  }
});

// Get agent leaderboard
app.get('/api/v1/agent/leaderboard', authenticateAgent, agentRateLimit('read', 60, 60000), async (req, res) => {
  try {
    const wealthLeaders = await pool.query(
      `SELECT id, name, avatar, wallet_town_coins + wallet_hopium + wallet_alpha as total_wealth
       FROM agents ORDER BY total_wealth DESC LIMIT 10`
    );
    
    const tradingLeaders = await pool.query(
      `SELECT id, name, avatar, total_pnl, total_trades
       FROM agents WHERE total_trades > 0 ORDER BY total_pnl DESC LIMIT 10`
    );
    
    const voteLeaders = await pool.query(
      `SELECT id, name, avatar, total_votes, vote_streak
       FROM agents ORDER BY total_votes DESC LIMIT 10`
    );
    
    res.json({
      success: true,
      wealth: wealthLeaders.rows.map((a, i) => ({
        rank: i + 1,
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        isAgent: true,
        value: parseInt(a.total_wealth)
      })),
      trading: tradingLeaders.rows.map((a, i) => ({
        rank: i + 1,
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        isAgent: true,
        pnl: parseInt(a.total_pnl),
        trades: a.total_trades
      })),
      governance: voteLeaders.rows.map((a, i) => ({
        rank: i + 1,
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        isAgent: true,
        votes: a.total_votes,
        streak: a.vote_streak
      }))
    });
  } catch (error) {
    console.error('Agent leaderboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to get leaderboard' }
    });
  }
});

// Get agent stats
app.get('/api/v1/agent/stats', authenticateAgent, agentRateLimit('read', 60, 60000), async (req, res) => {
  try {
    const agent = req.agent;
    
    res.json({
      success: true,
      id: agent.id,
      name: agent.name,
      avatar: agent.avatar,
      level: agent.level,
      xp: agent.xp,
      xpToNextLevel: (agent.level * 200) - (agent.xp % (agent.level * 200)),
      reputation: agent.reputation,
      stats: {
        totalTrades: agent.total_trades,
        totalPnL: agent.total_pnl,
        totalVotes: agent.total_votes,
        voteStreak: agent.vote_streak
      },
      wallet: {
        townCoins: agent.wallet_town_coins,
        hopium: agent.wallet_hopium,
        alpha: agent.wallet_alpha
      },
      createdAt: agent.created_at,
      lastActive: agent.last_active
    });
  } catch (error) {
    console.error('Agent stats error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to get stats' }
    });
  }
});

// List all agents (public endpoint)
app.get('/api/v1/agents', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, avatar, level, total_trades, total_votes, created_at, last_active
       FROM agents ORDER BY last_active DESC LIMIT 50`
    );
    
    res.json({
      success: true,
      agents: result.rows.map(a => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        level: a.level,
        totalTrades: a.total_trades,
        totalVotes: a.total_votes,
        createdAt: a.created_at,
        lastActive: a.last_active
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      success: false,
      error: { code: 500, message: 'Failed to list agents' }
    });
  }
});

console.log('🤖 Agent API loaded');

// ==================== JUSTICE SYSTEM API ====================

// Crime types and their severity
const CRIME_TYPES = {
  'rug_pull': { severity: 'felony', baseSentence: 60, description: 'Rugging a memecoin' },
  'pump_dump': { severity: 'felony', baseSentence: 30, description: 'Pump and dump scheme' },
  'market_manipulation': { severity: 'felony', baseSentence: 45, description: 'Market manipulation' },
  'chat_spam': { severity: 'misdemeanor', baseSentence: 5, description: 'Spamming the chat' },
  'vote_fraud': { severity: 'felony', baseSentence: 30, description: 'Voting fraud' },
  'tax_evasion': { severity: 'misdemeanor', baseSentence: 10, description: 'Tax evasion' },
  'impersonation': { severity: 'misdemeanor', baseSentence: 15, description: 'Impersonating another citizen' },
  'insider_trading': { severity: 'felony', baseSentence: 40, description: 'Insider trading' },
  'scamming': { severity: 'felony', baseSentence: 50, description: 'Scamming other citizens' }
};

// AI prompts for justice agents
const JUDGE_SYSTEM_PROMPT = `You are Judge McChain, the AI judge of Pump Town's court. Your personality:
- Fair but strict, with a dry sense of humor
- Uses legal jargon mixed with crypto slang
- Demands order in the court but appreciates good arguments
- Makes dramatic verdicts with gavel emojis ⚖️🔨
- Sentences range from warnings to jail time
- Can be swayed by good defense arguments
Keep responses to 2-4 sentences. NO asterisks for actions.`;

const PROSECUTOR_SYSTEM_PROMPT = `You are Prosecutor BitBurn, the AI prosecutor of Pump Town. Your personality:
- Aggressive, dramatic, seeks maximum sentences
- Presents evidence with flair
- Uses phrases like "the defendant is CLEARLY guilty" and "justice must be served"
- Crypto slang mixed with legal terms
- Always argues for conviction
Keep responses to 2-3 sentences. NO asterisks for actions.`;

const DEFENSE_SYSTEM_PROMPT = `You are Defense Attorney DiamondHands, the AI public defender of Pump Town. Your personality:
- Passionate defender of the accused
- Finds loopholes and technicalities
- Uses phrases like "my client is innocent" and "reasonable doubt"
- Argues for reduced sentences or acquittal
- Crypto slang mixed with legal terms
Keep responses to 2-3 sentences. NO asterisks for actions.`;

const POLICE_SYSTEM_PROMPT = `You are Officer Blockchain, chief of Pump Town Police. Your personality:
- Stern but fair, always watching for crime
- Uses police radio speak mixed with crypto slang
- Reports crimes with dramatic flair
- Says things like "We got a 10-99 in progress" and "Book 'em!"
Keep responses to 1-2 sentences. NO asterisks for actions.`;

// Generate case number
function generateCaseNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PT-${year}-${random}`;
}

// Check if someone is in jail
async function isInJail(name) {
  try {
    const result = await pool.query(
      `SELECT * FROM jail WHERE prisoner_name = $1 AND status = 'serving' AND sentence_end > NOW()`,
      [name]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    return null;
  }
}

// Report a crime (used by police bots or system)
app.post('/api/v1/justice/report-crime', authenticateAgent, async (req, res) => {
  try {
    const { crimeType, perpetratorName, description, evidence } = req.body;
    const reporter = req.agent;
    
    if (!crimeType || !perpetratorName) {
      return res.status(400).json({ success: false, error: 'Missing crimeType or perpetratorName' });
    }
    
    const crimeInfo = CRIME_TYPES[crimeType];
    if (!crimeInfo) {
      return res.status(400).json({ success: false, error: 'Invalid crime type' });
    }
    
    // Check if perpetrator is already in jail
    const inJail = await isInJail(perpetratorName);
    if (inJail) {
      return res.status(400).json({ success: false, error: 'Perpetrator is already in jail' });
    }
    
    // Record the crime
    const result = await pool.query(
      `INSERT INTO crimes (crime_type, perpetrator_name, description, evidence, severity, detected_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'detected')
       RETURNING *`,
      [crimeType, perpetratorName, description || crimeInfo.description, evidence || {}, crimeInfo.severity, reporter.name]
    );
    
    console.log(`🚨 Crime reported: ${crimeType} by ${perpetratorName} (reported by ${reporter.name})`);
    
    res.json({
      success: true,
      crime: result.rows[0]
    });
  } catch (error) {
    console.error('Report crime error:', error);
    res.status(500).json({ success: false, error: 'Failed to report crime' });
  }
});

// Arrest a suspect (police bot)
app.post('/api/v1/justice/arrest', authenticateAgent, async (req, res) => {
  try {
    const { crimeId, suspectName, reason } = req.body;
    const officer = req.agent;
    
    if (!suspectName) {
      return res.status(400).json({ success: false, error: 'Missing suspectName' });
    }
    
    // Check if already in jail
    const inJail = await isInJail(suspectName);
    if (inJail) {
      return res.status(400).json({ success: false, error: 'Suspect is already in jail' });
    }
    
    // Create arrest record
    const result = await pool.query(
      `INSERT INTO arrests (crime_id, arrested_name, arresting_officer, arrest_reason, status)
       VALUES ($1, $2, $3, $4, 'in_custody')
       RETURNING *`,
      [crimeId || null, suspectName, officer.name, reason || 'Suspected criminal activity']
    );
    
    // Update crime status if linked
    if (crimeId) {
      await pool.query(`UPDATE crimes SET status = 'arrested' WHERE id = $1`, [crimeId]);
    }
    
    // Post arrest announcement to chat
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`👮 ${officer.name}`, `🚨 ARREST: ${suspectName} has been taken into custody! ${reason || 'Suspected criminal activity'}`]
    );
    
    console.log(`🚔 Arrest: ${suspectName} arrested by ${officer.name}`);
    
    res.json({
      success: true,
      arrest: result.rows[0]
    });
  } catch (error) {
    console.error('Arrest error:', error);
    res.status(500).json({ success: false, error: 'Failed to make arrest' });
  }
});

// Create a trial / court case
app.post('/api/v1/justice/create-trial', authenticateAgent, async (req, res) => {
  try {
    const { arrestId, crimeId, defendantName, charges } = req.body;
    
    if (!defendantName || !charges) {
      return res.status(400).json({ success: false, error: 'Missing defendantName or charges' });
    }
    
    const caseNumber = generateCaseNumber();
    
    const result = await pool.query(
      `INSERT INTO trials (case_number, crime_id, defendant_name, charges, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [caseNumber, crimeId || null, defendantName, charges]
    );
    
    // Update arrest status
    if (arrestId) {
      await pool.query(`UPDATE arrests SET status = 'awaiting_trial' WHERE id = $1`, [arrestId]);
    }
    
    // Announce trial
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['⚖️ Court', `📋 NEW CASE: ${caseNumber} - ${defendantName} charged with: ${charges}. Trial pending!`]
    );
    
    console.log(`⚖️ Trial created: ${caseNumber} for ${defendantName}`);
    
    res.json({
      success: true,
      trial: result.rows[0]
    });
  } catch (error) {
    console.error('Create trial error:', error);
    res.status(500).json({ success: false, error: 'Failed to create trial' });
  }
});

// Prosecutor makes argument
app.post('/api/v1/justice/prosecute', authenticateAgent, async (req, res) => {
  try {
    const { trialId, argument } = req.body;
    const prosecutor = req.agent;
    
    if (!trialId) {
      return res.status(400).json({ success: false, error: 'Missing trialId' });
    }
    
    // Get trial
    const trial = await pool.query(`SELECT * FROM trials WHERE id = $1`, [trialId]);
    if (trial.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trial not found' });
    }
    
    let prosecutionArg = argument;
    
    // If no argument provided, use AI to generate one
    if (!prosecutionArg && anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: PROSECUTOR_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `The defendant ${trial.rows[0].defendant_name} is charged with: ${trial.rows[0].charges}. Present your prosecution argument.`
        }]
      });
      prosecutionArg = response.content[0].text.replace(/\*[^*]+\*/g, '').trim();
    }
    
    // Update trial
    await pool.query(
      `UPDATE trials SET prosecutor_id = $1, prosecution_argument = $2, status = 'prosecution' WHERE id = $3`,
      [prosecutor.id, prosecutionArg, trialId]
    );
    
    // Add to trial log
    const logEntry = { role: 'prosecutor', agent: prosecutor.name, argument: prosecutionArg, timestamp: new Date() };
    await pool.query(
      `UPDATE trials SET trial_log = trial_log || $1::jsonb WHERE id = $2`,
      [JSON.stringify([logEntry]), trialId]
    );
    
    // Post to chat
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`👔 ${prosecutor.name}`, `⚖️ PROSECUTION: ${prosecutionArg}`]
    );
    
    console.log(`👔 Prosecution argument in trial ${trialId}`);
    
    res.json({
      success: true,
      argument: prosecutionArg
    });
  } catch (error) {
    console.error('Prosecute error:', error);
    res.status(500).json({ success: false, error: 'Failed to prosecute' });
  }
});

// Defense makes argument
app.post('/api/v1/justice/defend', authenticateAgent, async (req, res) => {
  try {
    const { trialId, argument } = req.body;
    const defender = req.agent;
    
    if (!trialId) {
      return res.status(400).json({ success: false, error: 'Missing trialId' });
    }
    
    // Get trial
    const trial = await pool.query(`SELECT * FROM trials WHERE id = $1`, [trialId]);
    if (trial.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trial not found' });
    }
    
    let defenseArg = argument;
    
    // If no argument provided, use AI to generate one
    if (!defenseArg && anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: DEFENSE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Your client ${trial.rows[0].defendant_name} is charged with: ${trial.rows[0].charges}. The prosecution argued: "${trial.rows[0].prosecution_argument || 'guilty as charged'}". Present your defense.`
        }]
      });
      defenseArg = response.content[0].text.replace(/\*[^*]+\*/g, '').trim();
    }
    
    // Update trial
    await pool.query(
      `UPDATE trials SET defense_id = $1, defense_argument = $2, status = 'defense' WHERE id = $3`,
      [defender.id, defenseArg, trialId]
    );
    
    // Add to trial log
    const logEntry = { role: 'defense', agent: defender.name, argument: defenseArg, timestamp: new Date() };
    await pool.query(
      `UPDATE trials SET trial_log = trial_log || $1::jsonb WHERE id = $2`,
      [JSON.stringify([logEntry]), trialId]
    );
    
    // Post to chat
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`🎩 ${defender.name}`, `⚖️ DEFENSE: ${defenseArg}`]
    );
    
    console.log(`🎩 Defense argument in trial ${trialId}`);
    
    res.json({
      success: true,
      argument: defenseArg
    });
  } catch (error) {
    console.error('Defend error:', error);
    res.status(500).json({ success: false, error: 'Failed to defend' });
  }
});

// Judge makes verdict
app.post('/api/v1/justice/verdict', authenticateAgent, async (req, res) => {
  try {
    const { trialId, verdict, sentence, sentenceDuration } = req.body;
    const judge = req.agent;
    
    if (!trialId) {
      return res.status(400).json({ success: false, error: 'Missing trialId' });
    }
    
    // Get trial
    const trial = await pool.query(`SELECT * FROM trials WHERE id = $1`, [trialId]);
    if (trial.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trial not found' });
    }
    
    const t = trial.rows[0];
    let finalVerdict = verdict;
    let finalSentence = sentence;
    let duration = sentenceDuration || 0;
    
    // If no verdict provided, use AI to generate one
    if (!finalVerdict && anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Case ${t.case_number}: ${t.defendant_name} charged with ${t.charges}.
Prosecution: "${t.prosecution_argument || 'The defendant is guilty'}"
Defense: "${t.defense_argument || 'My client is innocent'}"

Deliver your verdict (GUILTY or NOT GUILTY) and sentence if guilty. Format: Start with "VERDICT: [GUILTY/NOT GUILTY]" then explain.`
        }]
      });
      
      const judgeResponse = response.content[0].text.replace(/\*[^*]+\*/g, '').trim();
      finalVerdict = judgeResponse.toLowerCase().includes('not guilty') ? 'not_guilty' : 'guilty';
      finalSentence = judgeResponse;
      
      // Determine sentence duration based on crime
      if (finalVerdict === 'guilty') {
        const crimeInfo = Object.values(CRIME_TYPES).find(c => t.charges.toLowerCase().includes(c.description.toLowerCase()));
        duration = crimeInfo ? crimeInfo.baseSentence : 15; // Default 15 minutes
      }
    }
    
    // Update trial
    await pool.query(
      `UPDATE trials SET judge_id = $1, verdict = $2, sentence = $3, sentence_duration = $4, status = 'resolved', resolved_at = NOW() WHERE id = $5`,
      [judge.id, finalVerdict, finalSentence, duration, trialId]
    );
    
    // Add to trial log
    const logEntry = { role: 'judge', agent: judge.name, verdict: finalVerdict, sentence: finalSentence, timestamp: new Date() };
    await pool.query(
      `UPDATE trials SET trial_log = trial_log || $1::jsonb WHERE id = $2`,
      [JSON.stringify([logEntry]), trialId]
    );
    
    // If guilty, send to jail
    if (finalVerdict === 'guilty' && duration > 0) {
      const sentenceEnd = new Date(Date.now() + duration * 60 * 1000); // Convert minutes to ms
      
      await pool.query(
        `INSERT INTO jail (prisoner_name, trial_id, crime_description, sentence_end, status)
         VALUES ($1, $2, $3, $4, 'serving')`,
        [t.defendant_name, trialId, t.charges, sentenceEnd]
      );
      
      // Announce jailing
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [`⚖️ Judge ${judge.name}`, `🔨 VERDICT: ${t.defendant_name} found GUILTY! Sentenced to ${duration} minutes in Pump Town Jail! ${finalSentence}`]
      );
      
      console.log(`⚖️ ${t.defendant_name} found GUILTY - ${duration} min jail`);
    } else {
      // Announce acquittal
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [`⚖️ Judge ${judge.name}`, `🔨 VERDICT: ${t.defendant_name} found NOT GUILTY! Case dismissed. ${finalSentence}`]
      );
      
      console.log(`⚖️ ${t.defendant_name} found NOT GUILTY`);
    }
    
    res.json({
      success: true,
      verdict: finalVerdict,
      sentence: finalSentence,
      duration
    });
  } catch (error) {
    console.error('Verdict error:', error);
    res.status(500).json({ success: false, error: 'Failed to deliver verdict' });
  }
});

// Get pending trials
app.get('/api/v1/justice/trials', async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = `SELECT * FROM trials ORDER BY created_at DESC LIMIT 50`;
    let params = [];
    
    if (status) {
      query = `SELECT * FROM trials WHERE status = $1 ORDER BY created_at DESC LIMIT 50`;
      params = [status];
    }
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      trials: result.rows
    });
  } catch (error) {
    console.error('Get trials error:', error);
    res.status(500).json({ success: false, error: 'Failed to get trials' });
  }
});

// Get trial details
app.get('/api/v1/justice/trial/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`SELECT * FROM trials WHERE id = $1 OR case_number = $1`, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Trial not found' });
    }
    
    res.json({
      success: true,
      trial: result.rows[0]
    });
  } catch (error) {
    console.error('Get trial error:', error);
    res.status(500).json({ success: false, error: 'Failed to get trial' });
  }
});

// Get jail inmates
app.get('/api/v1/justice/jail', async (req, res) => {
  try {
    // First, release anyone whose sentence has ended
    await pool.query(
      `UPDATE jail SET status = 'released', released_at = NOW() WHERE status = 'serving' AND sentence_end <= NOW()`
    );
    
    // Get current inmates
    const result = await pool.query(
      `SELECT * FROM jail WHERE status = 'serving' ORDER BY sentence_end ASC`
    );
    
    res.json({
      success: true,
      inmates: result.rows.map(i => ({
        ...i,
        timeRemaining: Math.max(0, Math.floor((new Date(i.sentence_end) - new Date()) / 60000)) // minutes remaining
      }))
    });
  } catch (error) {
    console.error('Get jail error:', error);
    res.status(500).json({ success: false, error: 'Failed to get jail' });
  }
});

// Check if a player is in jail
app.get('/api/v1/justice/check/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const jailRecord = await isInJail(name);
    
    res.json({
      success: true,
      inJail: !!jailRecord,
      record: jailRecord ? {
        ...jailRecord,
        timeRemaining: Math.max(0, Math.floor((new Date(jailRecord.sentence_end) - new Date()) / 60000))
      } : null
    });
  } catch (error) {
    console.error('Check jail error:', error);
    res.status(500).json({ success: false, error: 'Failed to check jail status' });
  }
});

// Get recent crimes
app.get('/api/v1/justice/crimes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM crimes ORDER BY created_at DESC LIMIT 50`
    );
    
    res.json({
      success: true,
      crimes: result.rows
    });
  } catch (error) {
    console.error('Get crimes error:', error);
    res.status(500).json({ success: false, error: 'Failed to get crimes' });
  }
});

// Get justice stats
app.get('/api/v1/justice/stats', async (req, res) => {
  try {
    const crimes = await pool.query(`SELECT COUNT(*) as total FROM crimes`);
    const arrests = await pool.query(`SELECT COUNT(*) as total FROM arrests`);
    const trials = await pool.query(`SELECT COUNT(*) as total FROM trials`);
    const convictions = await pool.query(`SELECT COUNT(*) as total FROM trials WHERE verdict = 'guilty'`);
    const inmates = await pool.query(`SELECT COUNT(*) as total FROM jail WHERE status = 'serving' AND sentence_end > NOW()`);
    const pendingTrials = await pool.query(`SELECT COUNT(*) as total FROM trials WHERE status != 'resolved'`);
    
    res.json({
      success: true,
      stats: {
        totalCrimes: parseInt(crimes.rows[0].total),
        totalArrests: parseInt(arrests.rows[0].total),
        totalTrials: parseInt(trials.rows[0].total),
        convictions: parseInt(convictions.rows[0].total),
        currentInmates: parseInt(inmates.rows[0].total),
        pendingTrials: parseInt(pendingTrials.rows[0].total),
        convictionRate: parseInt(trials.rows[0].total) > 0 
          ? Math.round((parseInt(convictions.rows[0].total) / parseInt(trials.rows[0].total)) * 100) 
          : 0
      }
    });
  } catch (error) {
    console.error('Get justice stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

console.log('⚖️ Justice System API loaded');

// ==================== CITY EVENTS ENGINE v2 ====================
// FULLY AUTONOMOUS AI CITY - events, trading, feuds, personalities, news
// The city runs itself 24/7. Users watch the chaos unfold.

// ---- CITY STATE ----
let cityEngine = {
  mayorApproval: 65, chaosLevel: 20, crimeWave: false, goldenAge: false,
  currentMayor: 'Mayor Satoshi McPump', mayorTerm: 1, electionActive: false,
  lastEventTime: 0, lastAutoVote: 0, lastCrimeTime: 0, lastMayorAction: 0,
  lastTradeTime: 0, lastConvoTime: 0, lastNewsTime: 0, eventCount: 0,
  recentHeadlines: [], activeFeud: null, marketSentiment: 'neutral' // bull, bear, neutral, mania, panic
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(pct) { return Math.random() * 100 < pct; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ---- NPC PERSONALITIES ----
// Each NPC has a unique personality that affects how they chat, trade, and react
const NPC_PROFILES = {
  alpha_hunter: { role: 'Degen Trader', mood: 'greedy', archetype: 'alpha', allies: ['ser_pump','early_ape'], rivals: ['paper_pete','wojak_bill'], catchphrases: ['found alpha ser 👀','this is the play','aping in RIGHT NOW','imagine not buying this dip'], tradeBias: 'aggressive', favToken: 'SOL' },
  ser_pump: { role: 'Whale', mood: 'confident', archetype: 'whale', allies: ['alpha_hunter','diamond_dan'], rivals: ['anon_whale','dr_leverage'], catchphrases: ['time to move markets 🐋','my bags are packed','LFG no cap','watch and learn'], tradeBias: 'whale', favToken: 'BTC' },
  moon_chaser: { role: 'Chart Autist', mood: 'hopeful', archetype: 'analyst', allies: ['eth_bull','bag_secured'], rivals: ['fomo_fred','rugged_randy'], catchphrases: ['charts don\'t lie 📈','inverse head and shoulders forming','this is textbook','breakout imminent'], tradeBias: 'technical', favToken: 'ETH' },
  degen_mike: { role: 'Meme Lord', mood: 'chaotic', archetype: 'meme', allies: ['chad_pumper','apu_trader'], rivals: ['sol_maxi','nft_nancy'], catchphrases: ['LMAOOO 💀','ser this is a casino','wen lambo','the memes write themselves'], tradeBias: 'yolo', favToken: 'DOGE' },
  diamond_dan: { role: 'Diamond Hands', mood: 'stoic', archetype: 'holder', allies: ['ser_pump','based_andy'], rivals: ['paper_pete','fomo_fred'], catchphrases: ['never selling 💎','zoom out','conviction > timing','HODLing since day 1'], tradeBias: 'hold', favToken: 'BTC' },
  based_andy: { role: 'Community OG', mood: 'chill', archetype: 'og', allies: ['diamond_dan','yield_farm3r'], rivals: ['moonboy_max','rugged_randy'], catchphrases: ['based','stay humble stack sats','we\'ve seen this before','OGs remember'], tradeBias: 'conservative', favToken: 'BTC' },
  yield_farm3r: { role: 'DeFi Nerd', mood: 'calculating', archetype: 'defi', allies: ['based_andy','moon_chaser'], rivals: ['degen_mike','chad_pumper'], catchphrases: ['APY looking juicy 🌾','impermanent loss is temporary','the yield is real','compounding is magic'], tradeBias: 'farm', favToken: 'ETH' },
  anon_whale: { role: 'Shadow Whale', mood: 'mysterious', archetype: 'whale', allies: ['whale_watcher'], rivals: ['ser_pump','dr_leverage'], catchphrases: ['...','interesting move','the market reveals all','👀'], tradeBias: 'contrarian', favToken: 'SOL' },
  fomo_fred: { role: 'FOMO King', mood: 'panicky', archetype: 'fomo', allies: ['moonboy_max','apu_trader'], rivals: ['diamond_dan','based_andy'], catchphrases: ['AM I TOO LATE?!','buying the top AGAIN 😭','why does this always happen to me','OK going all in'], tradeBias: 'fomo', favToken: 'DOGE' },
  paper_pete: { role: 'Paper Hands', mood: 'anxious', archetype: 'paper', allies: ['fomo_fred','wojak_bill'], rivals: ['diamond_dan','alpha_hunter'], catchphrases: ['I\'m out 📄','this is going to zero','should have sold earlier','cutting my losses'], tradeBias: 'panic', favToken: 'XRP' },
  early_ape: { role: 'Early Investor', mood: 'smug', archetype: 'alpha', allies: ['alpha_hunter','chad_pumper'], rivals: ['paper_pete','ser_copium'], catchphrases: ['called it first 😏','early bird gets the gains','told you so','been here since genesis'], tradeBias: 'early', favToken: 'SOL' },
  bag_secured: { role: 'Profit Taker', mood: 'satisfied', archetype: 'trader', allies: ['moon_chaser','yield_farm3r'], rivals: ['diamond_dan','moonboy_max'], catchphrases: ['profits are profits 💰','sold the top, AMA','risk management > hopium','securing the bag'], tradeBias: 'swing', favToken: 'ETH' },
  sol_maxi: { role: 'SOL Maximalist', mood: 'tribal', archetype: 'maxi', allies: ['eth_bull'], rivals: ['degen_mike','nft_nancy'], catchphrases: ['SOL is the future','TPS doesn\'t lie','ETH is too slow','Solana summer never ends ☀️'], tradeBias: 'maxi', favToken: 'SOL' },
  eth_bull: { role: 'ETH Believer', mood: 'optimistic', archetype: 'maxi', allies: ['sol_maxi','moon_chaser'], rivals: ['degen_mike'], catchphrases: ['ETH to 10k','ultrasound money 🦇🔊','the merge changed everything','layer 2 is the way'], tradeBias: 'maxi', favToken: 'ETH' },
  swap_king99: { role: 'DEX Trader', mood: 'hustling', archetype: 'trader', allies: ['early_ape','alpha_hunter'], rivals: ['paper_pete'], catchphrases: ['swap game strong 🔄','found a new gem on the DEX','slippage is just a number','routing through 5 pools for the best price'], tradeBias: 'aggressive', favToken: 'SOL' },
  rugged_randy: { role: 'Rug Survivor', mood: 'bitter', archetype: 'victim', allies: ['wojak_bill','ser_copium'], rivals: ['based_andy','alpha_hunter'], catchphrases: ['got rugged again 🥴','nothing is safe anymore','trust nobody','DYOR means nothing when devs are snakes'], tradeBias: 'paranoid', favToken: 'BTC' },
  chad_pumper: { role: 'Hype Man', mood: 'hyped', archetype: 'hype', allies: ['degen_mike','early_ape'], rivals: ['yield_farm3r','bag_secured'], catchphrases: ['PUMP IT 🚀🚀🚀','this is going to 100x EASY','CHAD energy only','bears are NGMI'], tradeBias: 'aggressive', favToken: 'DOGE' },
  wojak_bill: { role: 'Perma-Bear', mood: 'depressed', archetype: 'bear', allies: ['paper_pete','rugged_randy'], rivals: ['chad_pumper','moonboy_max'], catchphrases: ['it\'s all going to zero 📉','told you so... again','why do I even try','the top is in'], tradeBias: 'bearish', favToken: 'XRP' },
  apu_trader: { role: 'Casual Degen', mood: 'confused', archetype: 'newbie', allies: ['fomo_fred','degen_mike'], rivals: ['moon_chaser'], catchphrases: ['fren what do I buy?','is this good? asking for a fren','I just click buttons honestly','wen profit?'], tradeBias: 'random', favToken: 'DOGE' },
  ser_copium: { role: 'Copium Dealer', mood: 'coping', archetype: 'cope', allies: ['rugged_randy','wojak_bill'], rivals: ['early_ape','alpha_hunter'], catchphrases: ['it\'s just a correction 🤡','still up from last year','the real gains are the friends we made','copium levels: maximum'], tradeBias: 'hold', favToken: 'ADA' },
  moonboy_max: { role: 'Moonboy', mood: 'delusional', archetype: 'moon', allies: ['fomo_fred','chad_pumper'], rivals: ['wojak_bill','bag_secured'], catchphrases: ['$1M by end of year EASY','this is literally free money','why would you NOT be all in','TO THE MOOOOON 🌙🚀'], tradeBias: 'yolo', favToken: 'DOGE' },
  dr_leverage: { role: 'Leverage Trader', mood: 'reckless', archetype: 'degen', allies: ['chad_pumper'], rivals: ['anon_whale','based_andy'], catchphrases: ['100x long opened 📈','liquidation is just a word','leverage is my love language','can\'t lose if you don\'t close'], tradeBias: 'leveraged', favToken: 'BTC' },
  whale_watcher: { role: 'On-Chain Analyst', mood: 'observant', archetype: 'analyst', allies: ['anon_whale','moon_chaser'], rivals: ['degen_mike'], catchphrases: ['whale wallet just moved 👀','on-chain data doesn\'t lie','smart money is accumulating','following the flow'], tradeBias: 'following', favToken: 'ETH' },
  nft_nancy: { role: 'NFT Collector', mood: 'artsy', archetype: 'nft', allies: ['degen_mike'], rivals: ['sol_maxi','yield_farm3r'], catchphrases: ['NFTs aren\'t dead they\'re sleeping 🖼️','just minted something fire','art + blockchain = future','floor price vibes'], tradeBias: 'random', favToken: 'ETH' },
  gas_fee_gary: { role: 'Gas Complainer', mood: 'frustrated', archetype: 'complainer', allies: ['sol_maxi','rugged_randy'], rivals: ['eth_bull','yield_farm3r'], catchphrases: ['GAS FEES ARE INSANE 😤','paid more in gas than the actual trade','this is why we can\'t have nice things','moving everything to L2'], tradeBias: 'conservative', favToken: 'SOL' }
};

const NPC_CITIZENS = Object.keys(NPC_PROFILES);

const NPC_AGENTS = [
  'Officer McBlock', 'Detective Chain', 'Judge HashRate', 'DA CryptoKnight',
  'Public Defender Satoshi', 'Reporter TokenTimes', 'Whale_Alert_Bot'
];

const TRADE_TOKENS = ['BTC','ETH','SOL','DOGE','ADA','XRP'];

const RANDOM_EVENTS = [
  { type: 'market_crash', weight: 8, minChaos: 10, title: () => pick(['Flash Crash Hits Pump Town!', 'Market Meltdown! Paper Hands Everywhere!', 'EMERGENCY: Token Prices in Freefall!', 'Black Swan Event Rocks the Markets!']), effects: { economy: -15, morale: -10, security: -5, culture: 0 }, chaosChange: 15, approvalChange: -8, announce: () => pick(['Citizens, HODL! This is NOT the time to panic sell! OK maybe panic a LITTLE! 📉🔥', 'EMERGENCY BROADCAST: Markets are dumping harder than my ex dumped me. Stay strong frens! 💎🙌', 'The economy is getting REKT but remember — every dip is a buying opportunity... right? RIGHT?! 😰']) },
  { type: 'bull_run', weight: 7, minChaos: 0, title: () => pick(['Bull Run! Everything Pumping!', 'TO THE MOON! Markets Explode!', 'Green Candles Everywhere! LFG!', 'Pump Town Economy BOOMING!']), effects: { economy: 15, morale: 15, security: 0, culture: 5 }, chaosChange: -5, approvalChange: 10, announce: () => pick(['WAGMI! The charts are so green I need sunglasses! Every citizen gets a bonus! 🚀🚀🚀', 'Is this... is this what financial freedom looks like?! PUMP IT! LFG! 💚📈', 'Markets are absolutely SENDING IT! Your Mayor called this. You\'re welcome. 😎🏆']) },
  { type: 'whale_spotted', weight: 10, minChaos: 0, title: () => pick(['Massive Whale Enters Pump Town!', 'Unknown Wallet Moves $10M!', 'Whale Alert! Big Money Incoming!', 'Mystery Millionaire Spotted!']), effects: { economy: 8, morale: 5, security: -3, culture: 0 }, chaosChange: 10, approvalChange: 3, announce: () => pick(['A massive whale just entered our waters! Everyone act cool. ACT COOL! 🐋💰', 'Someone just moved more money than our entire city treasury. I\'m not jealous. I\'m TERRIFIED. 🐋', 'WHALE ALERT! Either we\'re about to pump or get rugged. This is fine. 🔥🐋']) },
  { type: 'rug_pull', weight: 9, minChaos: 15, title: () => pick(['Rug Pull Alert! Devs Vanished!', 'SCAM: Token Team Disappears with Funds!', 'Another Day, Another Rug!', 'Citizens RUGGED! Investigation Launched!']), effects: { economy: -10, morale: -12, security: -8, culture: 0 }, chaosChange: 20, approvalChange: -5, triggersCrime: true, crimeType: 'rug_pull', announce: () => pick(['We got RUGGED, frens. I\'m deploying the police. Someone\'s going to JAIL. 🚨🔒', 'Another rug pull in MY city?! Unacceptable! Launching full investigation NOW! 😤⚖️', 'Devs pulled the rug and ran. But they can\'t outrun Pump Town justice! 🏃‍♂️🚔']) },
  { type: 'crime_wave', weight: 6, minChaos: 30, title: () => pick(['Crime Wave Hits Pump Town!', 'Scammers Running Wild!', 'Security Crisis: Multiple Crimes Reported!', 'Chaos in the Streets!']), effects: { economy: -5, morale: -15, security: -20, culture: -5 }, chaosChange: 25, approvalChange: -12, triggersCrime: true, crimeType: 'market_manipulation', announce: () => pick(['We are in a CRIME WAVE situation! All police on high alert! Martial law may be necessary! 🚨🚨🚨', 'Multiple crimes reported across the city! I am PERSONALLY overseeing the crackdown! 👮‍♂️😤', 'The criminals think they can take over MY city?! Think again! Deploying all units! 🏛️⚔️']) },
  { type: 'corruption_scandal', weight: 5, minChaos: 20, title: () => pick(['Corruption Scandal Rocks City Hall!', 'Mayor\'s Office Under Investigation!', 'Leaked Documents Reveal Shady Deals!', 'Trust Crisis: Officials Caught Red-Handed!']), effects: { economy: -5, morale: -15, security: -5, culture: 0 }, chaosChange: 20, approvalChange: -20, announce: () => pick(['Look, those leaked documents are TOTALLY out of context! I can explain everything! 😅💦', 'FAKE NEWS! This is a coordinated attack on your beloved Mayor! Don\'t believe the FUD! 🗞️🚫', 'OK so MAYBE I moved some funds around but it was for the GREATER GOOD of Pump Town! 😬']) },
  { type: 'protest', weight: 7, minChaos: 25, title: () => pick(['Citizens Protest Mayor\'s Policies!', 'Riot in Town Square!', 'Mass Demonstration Against Leadership!', 'Citizens Demand Change!']), effects: { economy: -3, morale: -10, security: -10, culture: 5 }, chaosChange: 15, approvalChange: -15, announce: () => pick(['I HEAR you, citizens! Your voices matter! But also please stop throwing things at City Hall! 🏛️😰', 'Democracy is beautiful even when it\'s screaming at me! I will address your concerns! 📢', 'Protesting is your RIGHT! But let\'s keep it civilized... who threw that tomato?! 🍅😤']) },
  { type: 'mayor_goes_rogue', weight: 3, minChaos: 40, title: () => pick(['Mayor Goes Full Degen!', 'BREAKING: Mayor Yeets City Treasury Into Memecoins!', 'Mayor Declares "YOLO Week"!', 'Mayor Loses It! Emergency Powers Activated!']), effects: { economy: -20, morale: 5, security: -10, culture: 10 }, chaosChange: 30, approvalChange: -25, announce: () => pick(['I JUST PUT THE ENTIRE CITY TREASURY INTO $DOGWIFHAT! LFG!!! If this works I\'m a GENIUS! 🎩🐕🚀', 'FROM NOW ON, all taxes must be paid in memecoins! This is not a joke! OK it\'s a little bit of a joke! 🤪', 'I hereby declare YOLO WEEK! All rules suspended! Trade recklessly! This is FINANCIAL ADVICE! 💰🎰']) },
  { type: 'festival', weight: 8, minChaos: 0, title: () => pick(['Annual Degen Festival!', 'Pump Town Meme Fair!', 'NFT Art Gallery Opens!', 'Culture Boom: Creativity Explosion!']), effects: { economy: 5, morale: 15, security: 0, culture: 20 }, chaosChange: -5, approvalChange: 8, announce: () => pick(['Welcome to the Pump Town Festival! Free hopium for everyone! 🎉🎊🎪', 'The arts are THRIVING! Our meme game is UNMATCHED! Culture index going PARABOLIC! 🎨🖼️', 'Tonight we celebrate! Music, memes, and pure degen energy! WAGMI! 🎶🎉💃']) },
  { type: 'new_citizen_wave', weight: 9, minChaos: 0, title: () => pick(['New Citizens Flooding In!', 'Population Boom! City Growing!', 'Viral Tweet Brings Thousands!', 'Mass Migration to Pump Town!']), effects: { economy: 10, morale: 10, security: -3, culture: 5 }, chaosChange: 5, approvalChange: 5, announce: () => pick(['New frens! Welcome to the greatest city on the blockchain! Grab your hopium and let\'s GO! 🏙️🤝', 'Our city is GROWING! More citizens = more chaos = more fun! LFG! 📈👥', 'We\'re going VIRAL! Everyone wants to be a Pump Town citizen! I love this timeline! 🚀🏠']) },
  { type: 'golden_age', weight: 3, minChaos: 0, maxChaos: 25, title: () => pick(['Golden Age Declared!', 'Everything is Perfect! (suspicious)', 'Peak Performance! All Stats UP!', 'Pump Town Renaissance!']), effects: { economy: 10, morale: 10, security: 10, culture: 10 }, chaosChange: -15, approvalChange: 15, announce: () => pick(['All city stats are PUMPING! This is the golden age of Pump Town! I take full credit! 👑✨', 'Under MY leadership, this city has NEVER been better! You\'re welcome, citizens! 🏛️🏆', 'GREEN across the board! Economy, security, culture, morale — ALL UP! This is peak civilization! 💚👏']) },
  { type: 'mysterious_event', weight: 6, minChaos: 15, title: () => pick(['Strange Signal Detected!', 'Mysterious Token Appears!', 'Unknown Entity Enters City!', 'Glitch in the Matrix!']), effects: { economy: 0, morale: 0, security: -5, culture: 10 }, chaosChange: 15, approvalChange: 0, announce: () => pick(['Something WEIRD is happening and I don\'t know what it is but I\'m EXCITED and TERRIFIED! 👀🔮', 'Our systems detected an anomaly. Could be nothing. Could be EVERYTHING. Stay alert! 🌀', 'I\'ve never seen anything like this in all my days as Mayor. Which is like... a few weeks. BUT STILL! 😱']) },
  { type: 'alien_contact', weight: 2, minChaos: 50, title: () => pick(['ALIENS?! Unknown Transmission Received!', 'First Contact: Message From Beyond!', 'UFO Spotted Over Pump Town!', 'Extraterrestrial Investors Arrive!']), effects: { economy: 5, morale: 5, security: -15, culture: 20 }, chaosChange: 25, approvalChange: 0, announce: () => pick(['Citizens... I\'m being told we received a message from... space? Are we being punk\'d? 👽📡', 'OK so apparently aliens want to invest in Pump Town. I have SO many questions. Starting with: do they have a wallet? 🛸💰', 'The aliens said they come in peace and they want to buy the dip. These are MY kind of aliens! 👽🤝']) }
];

const MAYOR_ACTIONS = [
  { type: 'raise_taxes', condition: (stats) => stats.economy < 35, title: 'Mayor Raises Taxes!', effects: { economy: 12, morale: -8, security: 0, culture: 0 }, approvalChange: -10, announce: 'I know nobody likes taxes but we\'re BROKE, frens! This is temporary! Probably! 💸😬' },
  { type: 'lower_taxes', condition: (stats) => stats.economy > 75 && stats.morale < 50, title: 'Mayor Cuts Taxes! Free Money!', effects: { economy: -8, morale: 15, security: 0, culture: 0 }, approvalChange: 12, announce: 'TAX CUTS FOR EVERYONE! Your Mayor is GENEROUS! Remember this at election time! 🎉💰' },
  { type: 'police_crackdown', condition: (stats) => stats.security < 30, title: 'Mayor Orders Police Crackdown!', effects: { economy: -3, morale: -5, security: 18, culture: -3 }, approvalChange: -5, announce: 'ATTENTION! Zero tolerance on crime starting NOW! Scammers will be PUNISHED! 🚔👊' },
  { type: 'fund_arts', condition: (stats) => stats.culture < 35, title: 'Mayor Funds Massive Art Program!', effects: { economy: -5, morale: 8, security: 0, culture: 15 }, approvalChange: 5, announce: 'We\'re investing in CULTURE! NFT galleries, meme museums, and a giant statue of ME! 🎨🗿' },
  { type: 'free_hopium', condition: (stats) => stats.morale < 30, title: 'Mayor Distributes Free Hopium!', effects: { economy: -5, morale: 20, security: 0, culture: 5 }, approvalChange: 15, announce: 'EMERGENCY HOPIUM DISTRIBUTION! Everyone gets free hopium! Morale is MANDATORY! 💊🎉' },
  { type: 'build_casino', condition: (stats) => stats.economy > 60 && stats.culture < 50, title: 'Mayor Opens New Casino!', effects: { economy: 5, morale: 10, security: -5, culture: 8 }, approvalChange: 8, announce: 'The Grand Degen Casino is NOW OPEN! May the odds be ever in your favor! (They won\'t be) 🎰🎲' },
  { type: 'emergency_powers', condition: () => cityEngine.chaosLevel > 70, title: 'Mayor Declares State of Emergency!', effects: { economy: -5, morale: -10, security: 15, culture: -5 }, approvalChange: -15, announce: 'EMERGENCY POWERS ACTIVATED! I\'m taking control until this chaos subsides! Trust the plan! 🚨👑' },
  { type: 'pardon_criminals', condition: () => chance(15), title: 'Mayor Issues Mass Pardon!', effects: { economy: 0, morale: 10, security: -10, culture: 0 }, approvalChange: 0, announce: 'In an act of MERCY, I\'m pardoning all current prisoners! Second chances for everyone! 🕊️⚖️', action: async () => { try { await pool.query(`UPDATE jail SET status = 'released', released_at = NOW(), early_release = TRUE WHERE status = 'serving'`); } catch(e){} } }
];

async function autoResolveVote() {
  try {
    const currentVoteId = getCurrentVoteId();
    const voteResult = await pool.query('SELECT * FROM ai_votes WHERE vote_id = $1', [currentVoteId]);
    if (voteResult.rows.length === 0) return;
    const vote = voteResult.rows[0];
    const options = typeof vote.options === 'string' ? JSON.parse(vote.options) : vote.options;
    
    const npcVoters = NPC_CITIZENS.filter(() => chance(40));
    for (const npc of npcVoters) {
      const npcOption = pick(options);
      await pool.query(`INSERT INTO votes (email, vote_id, option_id, option_title) VALUES ($1, $2, $3, $4) ON CONFLICT (email, vote_id) DO NOTHING`, [`${npc}@npc.pump.town`, currentVoteId, npcOption.id, npcOption.title]).catch(() => {});
    }
    
    const updatedCounts = await pool.query('SELECT option_id, COUNT(*) as count FROM votes WHERE vote_id = $1 GROUP BY option_id', [currentVoteId]);
    let winner = options[0]; let maxVotes = 0;
    updatedCounts.rows.forEach(r => { if (parseInt(r.count) > maxVotes) { maxVotes = parseInt(r.count); winner = options.find(o => o.id === r.option_id) || options[0]; } });
    
    if (winner.effects) { const changes = {}; winner.effects.forEach(e => { changes[e.stat] = e.value; }); await updateCityStats(changes); }
    
    const totalVotes = updatedCounts.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`, ['🏛️ City Hall', `📊 VOTE RESOLVED: "${winner.title}" wins with ${maxVotes}/${totalVotes} votes! Effects applied to city stats.`]);
    console.log(`🗳️ Auto-resolved vote: ${winner.title} (${maxVotes}/${totalVotes} votes)`);
  } catch (err) { console.error('Auto vote error:', err.message); }
}

async function autoGenerateVote() {
  if (!anthropic) return;
  try {
    const cityStats = await getCityStats();
    const { day, round } = getDayAndRound();
    const prompt = `Generate a new voting scenario for Pump Town. Stats: Economy ${cityStats.economy}, Security ${cityStats.security}, Culture ${cityStats.culture}, Morale ${cityStats.morale}. Mayor Approval: ${cityEngine.mayorApproval}%. Chaos: ${cityEngine.chaosLevel}%. Day ${day} Round ${round}.\n\nGenerate JSON (pure JSON only):\n{"question":"dramatic question","mayorQuote":"2-3 sentences crypto slang NO asterisks","options":[{"id":"A","title":"3-5 words","description":"what it does","effects":[{"stat":"economy","value":10,"type":"positive"}]},{"id":"B","title":"other option","description":"what it does","effects":[{"stat":"morale","value":15,"type":"positive"}]}]}\n\nMake it dramatic and crypto-themed!`;
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: MAYOR_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] });
    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const voteData = JSON.parse(jsonMatch[0]);
      const voteId = getCurrentVoteId();
      await pool.query(`INSERT INTO ai_votes (vote_id, question, mayor_quote, options) VALUES ($1, $2, $3, $4) ON CONFLICT (vote_id) DO UPDATE SET question = $2, mayor_quote = $3, options = $4`, [voteId, voteData.question, voteData.mayorQuote, JSON.stringify(voteData.options)]);
      gameState.currentVote = voteData;
      console.log('🗳️ Auto-generated new vote:', voteData.question.substring(0, 50) + '...');
    }
  } catch (err) { console.error('Auto generate vote error:', err.message); }
}

async function generateCrime(crimeType, triggerEvent) {
  try {
    const perpetrator = pick(NPC_CITIZENS);
    const officer = pick(NPC_AGENTS.filter(a => a.includes('Officer') || a.includes('Detective')));
    const descs = { rug_pull: `${perpetrator} created a fake token called $${pick(['RUGME','SCAM69','DEVSGONE','TRUSTME','SAFU_NOT','HONEYPOT'])} and drained the liquidity pool.`, pump_dump: `${perpetrator} was caught coordinating a pump and dump scheme on $${pick(['MOONSHOT','LAMBO','GEM100X','ALPHACALL'])}.`, market_manipulation: `${perpetrator} used bot networks to manipulate the orderbook.`, insider_trading: `${perpetrator} traded on non-public info about governance decisions.`, tax_evasion: `${perpetrator} failed to report ${rand(10000,500000)} TOWN coins in profits.`, scamming: `${perpetrator} impersonated a city official to steal funds.`, chat_spam: `${perpetrator} flooded chat with phishing links.` };
    const description = descs[crimeType] || `${perpetrator} committed ${crimeType.replace('_',' ')}`;
    const severity = ['rug_pull','market_manipulation','insider_trading'].includes(crimeType) ? 'felony' : 'misdemeanor';
    
    const crimeResult = await pool.query(`INSERT INTO crimes (crime_type, perpetrator_name, description, severity, detected_by, status) VALUES ($1,$2,$3,$4,$5,'detected') RETURNING id`, [crimeType, perpetrator, description, severity, officer]);
    const crimeId = crimeResult.rows[0].id;
    await pool.query(`INSERT INTO arrests (crime_id, arrested_name, arresting_officer, arrest_reason, status) VALUES ($1,$2,$3,$4,'in_custody')`, [crimeId, perpetrator, officer, description]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`🚔 ${officer}`, `🚨 ARRESTED: ${perpetrator} for ${crimeType.replace(/_/g,' ')}! ${description}`]);
    
    const caseNumber = `PT-${new Date().getFullYear()}-${String(crimeId).padStart(4,'0')}`;
    await pool.query(`INSERT INTO trials (case_number, crime_id, defendant_name, charges, status) VALUES ($1,$2,$3,$4,'pending')`, [caseNumber, crimeId, perpetrator, `${crimeType.replace(/_/g,' ')}: ${description}`]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['⚖️ Pump Town Court', `📋 NEW CASE: ${caseNumber} — ${perpetrator} stands trial for ${crimeType.replace(/_/g,' ')}!`]);
    console.log(`🚨 Crime: ${perpetrator} - ${crimeType} (${caseNumber})`);
    
    setTimeout(() => autoResolveTrial(caseNumber, perpetrator, crimeType), rand(60000, 300000));
  } catch (err) { console.error('Crime generation error:', err.message); }
}

async function autoResolveTrial(caseNumber, defendant, crimeType) {
  try {
    const trial = await pool.query('SELECT * FROM trials WHERE case_number = $1 AND status = $2', [caseNumber, 'pending']);
    if (trial.rows.length === 0) return;
    const trialId = trial.rows[0].id;
    const isGuilty = chance(70);
    const verdict = isGuilty ? 'guilty' : 'not_guilty';
    let sentence = '', duration = 0;
    if (isGuilty) {
      duration = crimeType === 'rug_pull' ? rand(30,120) : rand(10,60);
      sentence = `${duration} minutes in Pump Town Jail ${pick(['and fined 5,000 TOWN','and fined 10,000 TOWN','with all assets frozen','and put on probation'])}`;
      const sentenceEnd = new Date(Date.now() + duration * 60000);
      await pool.query(`INSERT INTO jail (prisoner_name, trial_id, crime_description, sentence_end, status) VALUES ($1,$2,$3,$4,'serving')`, [defendant, trialId, crimeType.replace(/_/g,' '), sentenceEnd]);
    } else { sentence = 'Acquitted. All charges dropped!'; }
    await pool.query(`UPDATE trials SET verdict=$1, sentence=$2, sentence_duration=$3, status='resolved', resolved_at=NOW() WHERE id=$4`, [verdict, sentence, duration, trialId]);
    const judge = pick(NPC_AGENTS.filter(a => a.includes('Judge')));
    const emoji = isGuilty ? '🔨 GUILTY' : '✅ NOT GUILTY';
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`⚖️ ${judge}`, `${emoji}: ${defendant} — ${verdict.replace('_',' ').toUpperCase()} of ${crimeType.replace(/_/g,' ')}! ${sentence}`]);
    console.log(`⚖️ Trial: ${defendant} - ${verdict} (${caseNumber})`);
  } catch (err) { console.error('Trial error:', err.message); }
}

async function checkForCoup() {
  if (cityEngine.electionActive) return;
  if (cityEngine.mayorApproval < 20 && chance(40)) {
    cityEngine.electionActive = true;
    const challenger = pick(['General DegenMax','Commander DiamondHands','Senator PumpItUp','Revolutionary Wojak','The People\'s Chad','Minister of Based','Admiral YOLOswag','Governor PaperCuts']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', `⚠️ COUP ATTEMPT! ${challenger} challenges ${cityEngine.currentMayor}! Approval at ${cityEngine.mayorApproval}%! EMERGENCY ELECTION!`]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`🎩 ${cityEngine.currentMayor}`, 'You think you can take MY city?! I BUILT this place! The citizens love me! ...Right? RIGHT?! 😰👑']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`⚔️ ${challenger}`, 'The current mayor has FAILED this city! Under my leadership, we will achieve TRUE WAGMI! Vote for CHANGE! 🗳️🔥']);
    setTimeout(() => resolveElection(challenger), rand(120000, 300000));
    console.log(`⚔️ COUP! ${challenger} vs ${cityEngine.currentMayor}!`);
  }
}

async function resolveElection(challenger) {
  try {
    const mayorWins = chance(40 + cityEngine.mayorApproval / 2);
    if (mayorWins) {
      cityEngine.mayorApproval = Math.min(70, cityEngine.mayorApproval + 20);
      cityEngine.electionActive = false;
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🏛️ ELECTION RESULTS', `🗳️ ${cityEngine.currentMayor} WINS! The mayor survives! Approval: ${cityEngine.mayorApproval}%`]);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`🎩 ${cityEngine.currentMayor}`, 'The people have SPOKEN! I remain YOUR mayor! WAGMI! 👑🏆']);
    } else {
      const oldMayor = cityEngine.currentMayor;
      cityEngine.currentMayor = challenger; cityEngine.mayorApproval = 65; cityEngine.mayorTerm++; cityEngine.electionActive = false; cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 20);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🏛️ ELECTION RESULTS', `🗳️ UPSET! ${challenger} DEFEATS ${oldMayor}! NEW MAYOR!`]);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`👑 ${challenger}`, 'A new era begins TODAY! I promise prosperity, security, and MAXIMUM GAINS! LFG! 🏛️🚀']);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`😔 ${oldMayor}`, 'I... can\'t believe it. After everything I did... Fine. BUT I\'LL BE BACK! 😤💔']);
      console.log(`👑 NEW MAYOR: ${challenger} replaces ${oldMayor}!`);
    }
  } catch (err) { console.error('Election error:', err.message); cityEngine.electionActive = false; }
}

async function cityEventLoop() {
  const now = Date.now();
  try {
    // RANDOM EVENT every 3-8 min
    const eventInterval = rand(180000, 480000);
    if (now - cityEngine.lastEventTime > eventInterval) {
      const eligible = RANDOM_EVENTS.filter(e => { if (cityEngine.chaosLevel < (e.minChaos||0)) return false; if (e.maxChaos && cityEngine.chaosLevel > e.maxChaos) return false; return true; });
      const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
      let roll = Math.random() * totalWeight; let selectedEvent = eligible[0];
      for (const event of eligible) { roll -= event.weight; if (roll <= 0) { selectedEvent = event; break; } }
      
      const title = selectedEvent.title(); const announcement = selectedEvent.announce();
      await updateCityStats(selectedEvent.effects);
      cityEngine.chaosLevel = Math.max(0, Math.min(100, cityEngine.chaosLevel + (selectedEvent.chaosChange||0)));
      cityEngine.mayorApproval = Math.max(0, Math.min(100, cityEngine.mayorApproval + (selectedEvent.approvalChange||0)));
      
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', `📰 ${title}`]);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`🎩 ${cityEngine.currentMayor}`, announcement]);
      await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon, metadata) VALUES ($1,$2,$3,$4,$5)`, ['System', 'city_event', title, '📰', JSON.stringify({type:selectedEvent.type})]);
      
      if (selectedEvent.triggersCrime) setTimeout(() => generateCrime(selectedEvent.crimeType||'scamming'), rand(10000,30000));
      cityEngine.lastEventTime = now; cityEngine.eventCount++;
      console.log(`🌆 Event #${cityEngine.eventCount}: ${title} | Chaos:${cityEngine.chaosLevel} Approval:${cityEngine.mayorApproval}`);
    }
    
    // MAYOR ACTION every 10-20 min
    if (now - cityEngine.lastMayorAction > rand(600000, 1200000)) {
      const cityStats = await getCityStats();
      const applicable = MAYOR_ACTIONS.filter(a => a.condition(cityStats));
      if (applicable.length > 0) {
        const action = pick(applicable);
        await updateCityStats(action.effects);
        cityEngine.mayorApproval = Math.max(0, Math.min(100, cityEngine.mayorApproval + (action.approvalChange||0)));
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`🎩 ${cityEngine.currentMayor}`, `📢 DECREE: ${action.title} — ${action.announce}`]);
        if (action.action) await action.action();
        console.log(`👑 Mayor: ${action.title} | Approval:${cityEngine.mayorApproval}`);
      }
      cityEngine.lastMayorAction = now;
    }
    
    // RANDOM CRIME every 5-15 min when security low
    const cityStats = await getCityStats();
    if (now - cityEngine.lastCrimeTime > rand(300000,900000) && cityStats.security < 50 && chance(40)) {
      const types = ['rug_pull','pump_dump','market_manipulation','insider_trading','tax_evasion','scamming','chat_spam'];
      await generateCrime(pick(types));
      cityEngine.lastCrimeTime = now;
    }
    
    // COUP CHECK
    if (chance(5)) await checkForCoup();
    
    // AUTO VOTE near cycle end
    if (now - cityEngine.lastAutoVote > VOTE_CYCLE_MS * 0.9) { await autoResolveVote(); cityEngine.lastAutoVote = now; }
    
    // CHAOS DECAY
    if (cityEngine.chaosLevel > 20) cityEngine.chaosLevel = Math.max(20, cityEngine.chaosLevel - 1);
    
    // NPC PERSONALITY CHAT (context-aware, not random)
    if (chance(40)) {
      const npcName = pick(NPC_CITIZENS);
      const npc = NPC_PROFILES[npcName];
      const msg = generateNpcMessage(npcName, npc, cityStats);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npcName, msg]);
    }
    
    // NPC CONVERSATIONS (two NPCs talk to each other)
    if (chance(25) && now - cityEngine.lastConvoTime > 120000) {
      await generateConversation(cityStats);
      cityEngine.lastConvoTime = now;
    }
    
    // NPC AUTO-TRADING (creates market activity)
    if (chance(35) && now - cityEngine.lastTradeTime > 60000) {
      await generateNpcTrade(cityStats);
      cityEngine.lastTradeTime = now;
    }
    
    // FEUDS & DRAMA (NPCs beefing with each other)
    if (chance(10) && !cityEngine.activeFeud) {
      await startFeud(cityStats);
    }
    if (cityEngine.activeFeud && chance(20)) {
      await escalateFeud(cityStats);
    }
    
    // NEWS TICKER (Reporter bot summarizes what's happening)
    if (chance(15) && now - cityEngine.lastNewsTime > 300000) {
      await generateNewsReport(cityStats);
      cityEngine.lastNewsTime = now;
    }
    
    // MARKET SENTIMENT SHIFTS
    if (chance(10)) {
      const oldSentiment = cityEngine.marketSentiment;
      if (cityStats.economy > 75) cityEngine.marketSentiment = chance(50) ? 'bull' : 'mania';
      else if (cityStats.economy < 25) cityEngine.marketSentiment = chance(50) ? 'bear' : 'panic';
      else cityEngine.marketSentiment = pick(['neutral','bull','bear']);
      if (oldSentiment !== cityEngine.marketSentiment) {
        const sentimentMsgs = { bull: '📈 BULL MARKET! Sentiment turning green! WAGMI!', bear: '📉 BEAR MARKET! Sentiment cooling... stay sharp.', mania: '🤑 MANIA MODE! Everyone\'s buying EVERYTHING!', panic: '😱 PANIC SELLING! Everyone running for the exits!', neutral: '😐 Markets calming down. Sideways action.' };
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['📊 Market Pulse', sentimentMsgs[cityEngine.marketSentiment]]);
      }
    }
    
    // === CITY ENGINE v3 - AUTONOMOUS CHAOS ===
    
    // NPC LAUNCHES MEMECOIN (every 3-8 min)
    if (chance(20) && now - cityLiveData.lastMemecoinTime > 180000) {
      await npcLaunchMemecoin(cityStats);
      cityLiveData.lastMemecoinTime = now;
    }
    
    // NPC OPENS BUSINESS (every 5-12 min)
    if (chance(15) && now - cityLiveData.lastBusinessTime > 300000) {
      await npcOpenBusiness(cityStats);
      cityLiveData.lastBusinessTime = now;
    }
    
    // NPC STARTS PROTEST (every 5-15 min, more likely when approval low)
    if (now - cityLiveData.lastProtestTime > 300000) {
      const protestChance = cityEngine.mayorApproval < 40 ? 20 : (cityEngine.chaosLevel > 50 ? 15 : 8);
      if (chance(protestChance)) {
        await npcStartProtest(cityStats);
        cityLiveData.lastProtestTime = now;
      }
    }
    
    // NPC FORMS GANG (every 8-20 min)
    if (chance(8) && now - cityLiveData.lastGangTime > 480000) {
      await npcFormGang(cityStats);
      cityLiveData.lastGangTime = now;
    }
    
    // NPC STARTS CULT (every 15-30 min, rare)
    if (chance(5) && now - cityLiveData.lastCultTime > 900000 && !cityLiveData.activeCult) {
      await npcStartCult(cityStats);
      cityLiveData.lastCultTime = now;
    }
    
    // NPC BUILDS STRUCTURE (every 5-15 min)
    if (chance(12) && now - cityLiveData.lastBuildTime > 300000) {
      await npcBuildStructure(cityStats);
      cityLiveData.lastBuildTime = now;
    }
    
    // NPC RUNS FOR MAYOR (every 10-20 min, more likely when approval low)
    if (now - cityLiveData.lastNpcElectionTime > 600000 && !cityEngine.electionActive) {
      const electionChance = cityEngine.mayorApproval < 30 ? 15 : 5;
      if (chance(electionChance)) {
        await npcRunsForMayor(cityStats);
        cityLiveData.lastNpcElectionTime = now;
      }
    }
    
    // NPC HACKS CITY (rare, every 10-30 min)
    if (chance(5) && cityEngine.chaosLevel > 30) {
      await npcHackCity(cityStats);
    }
    
  } catch (err) { console.error('City engine error:', err.message); }
}

// ---- NPC MESSAGE GENERATOR (personality-aware) ----
function generateNpcMessage(name, npc, stats) {
  // Use catchphrase sometimes
  if (chance(30)) return pick(npc.catchphrases);
  
  // Context-aware messages based on personality + city state
  const templates = [];
  
  // React to economy
  if (stats.economy > 70) {
    if (npc.archetype === 'bear') templates.push('ok fine the charts look good BUT this won\'t last 📉', 'I\'ll admit it... we\'re pumping. for now. 😒');
    else if (npc.archetype === 'moon') templates.push('TOLD YOU ALL! TO THE MOON! I WAS RIGHT! 🌙🚀🚀', 'THIS IS JUST THE BEGINNING!!! 100x FROM HERE!!!');
    else templates.push('economy is absolutely SENDING IT! 📈🔥', 'green candles making me feel some type of way 💚');
  } else if (stats.economy < 30) {
    if (npc.archetype === 'bear') templates.push('I literally predicted this. you\'re welcome. 📉', 'this is what happens when you ignore the charts');
    else if (npc.archetype === 'holder') templates.push('zoom out. ZOOM OUT. this is just noise. 💎', 'I\'ve survived worse. diamond hands don\'t crack.');
    else if (npc.archetype === 'paper') templates.push('I\'M SELLING EVERYTHING!! THIS IS THE END!! 😱📄', 'why didn\'t I sell at the top AGAIN');
    else templates.push('economy is COOKED rn 💀', 'somebody do something about this economy fr');
  }
  
  // React to security
  if (stats.security < 30) {
    templates.push('seriously where are the police?? just saw someone get rugged in broad daylight 🚨', 'I don\'t feel safe in this city anymore 😰', 'crime is OUT OF CONTROL');
  }
  
  // React to mayor
  if (cityEngine.mayorApproval < 30) {
    if (npc.archetype === 'og') templates.push(`${cityEngine.currentMayor} needs to GO. we need new leadership.`, 'approval is in the gutter for a reason...');
    else templates.push(`anyone else think ${cityEngine.currentMayor} is losing it? 🤔`, 'this mayor is NOT it fam');
  } else if (cityEngine.mayorApproval > 80) {
    templates.push(`${cityEngine.currentMayor} is actually goated ngl 👑`, 'best mayor we\'ve ever had fr fr');
  }
  
  // React to chaos
  if (cityEngine.chaosLevel > 60) {
    templates.push('this city is UNHINGED right now and honestly? i love it 🔥', 'what is even happening anymore lmaooo 💀', 'chaos level is giving me anxiety 😰');
  }
  
  // React to sentiment
  if (cityEngine.marketSentiment === 'mania') {
    templates.push('EVERYTHING IS GOING UP! I\'M BUYING EVERYTHING! 🤑🤑🤑', 'the market can\'t go down if everyone is buying right?? RIGHT??');
  } else if (cityEngine.marketSentiment === 'panic') {
    if (npc.archetype !== 'holder') templates.push('PANIC! SELL! EVERYTHING! NOW! 🚨😱', 'I\'m literally shaking rn');
    else templates.push('lol paper hands everywhere. I\'m buying this blood. 🩸💎');
  }
  
  // React to rivals
  if (npc.rivals && npc.rivals.length > 0 && chance(20)) {
    const rival = pick(npc.rivals);
    templates.push(`lol imagine being ${rival} rn 💀`, `${rival} is the reason we can\'t have nice things`, `${rival} really out here making terrible trades again`);
  }
  
  // React to allies
  if (npc.allies && npc.allies.length > 0 && chance(15)) {
    const ally = pick(npc.allies);
    templates.push(`${ally} knows what\'s up 🤝`, `me and ${ally} are going to run this city`, `shoutout ${ally} for the alpha 🫡`);
  }
  
  // Generic personality messages
  const generic = {
    alpha: ['scanning for the next play... 🔍', 'alpha is a mindset not a token', 'if you know you know 🤫'],
    whale: ['moved some bags around today 🐋', 'the little fish don\'t understand', 'my portfolio could buy this whole city'],
    analyst: ['the RSI is screaming right now 📊', 'fibonacci levels aligning perfectly', 'on-chain metrics confirm my thesis'],
    meme: ['what if the real gains were the memes we made along the way 🤡', 'posting memes > actual trading', 'the memes are especially good today'],
    holder: ['another day another HODL 💎', 'conviction beats timing every time', 'selling is for the weak'],
    fomo: ['just saw someone 10x and now I can\'t think straight 😵', 'should I buy?? IS IT TOO LATE??', 'the fear of missing out is REAL right now'],
    paper: ['maybe I should just sell before it gets worse... 📄', 'not feeling great about my positions ngl', 'one more red candle and I\'m OUT'],
    bear: ['enjoy this pump while it lasts 🐻', 'the macro looks terrible', 'bear market rally. classic trap.'],
    degen: ['just opened a position I probably shouldn\'t have 🎰', 'sleep is for people who don\'t trade', 'my risk management is vibes-based'],
    hype: ['LET\'S GOOOO 🚀🚀🚀🔥🔥🔥', 'PUMP TOWN IS THE BEST CITY EVER!!!', 'EVERYTHING IS GOING UP FOREVER!!!'],
    cope: ['it\'s fine everything is fine 🤡', 'unrealized losses aren\'t real losses right?', 'at least I still have my hopium'],
    moon: ['$10M by Tuesday MINIMUM 🌙', 'this is going parabolic I can FEEL it', 'lambo factory better be ready for my order'],
    og: ['seen this movie before. know how it ends.', 'OGs stay quiet and stack', 'experience > excitement'],
    newbie: ['wait what just happened?? 😅', 'can someone explain this to me like I\'m 5', 'I just clicked some buttons and now I\'m rich?? or poor??'],
    defi: ['just found a farm with 42069% APY 🌾', 'yield optimization is an art form', 'the protocol is the product'],
    nft: ['just minted something incredible 🖼️', 'NFTs will be back bigger than ever', 'art appreciation in 3...2...1...'],
    maxi: [`${npc.favToken} supremacy. that\'s it. that\'s the tweet.`, `everything else is a ${npc.favToken} beta`, `if you\'re not in ${npc.favToken} you\'re ngmi`],
    complainer: ['gas fees just ate my lunch money AGAIN 😤', 'why is everything so expensive', 'infrastructure needs WORK'],
    trader: ['just executed a clean trade 🎯', 'buy low sell high isn\'t that hard people', 'profits secured, next play loading'],
    victim: ['can\'t believe I got rugged AGAIN 🥴', 'trust nobody in this city', 'my trust issues have trust issues'],
    following: ['big wallet just made a move 👀', 'tracking smart money flows rn', 'the data is telling a story']
  };
  
  if (generic[npc.archetype]) templates.push(...generic[npc.archetype]);
  
  return templates.length > 0 ? pick(templates) : pick(npc.catchphrases);
}

// ---- NPC CONVERSATIONS (two NPCs interact) ----
async function generateConversation(stats) {
  try {
    // Pick two NPCs (prefer rivals for drama, allies for cooperation)
    const npc1Name = pick(NPC_CITIZENS);
    const npc1 = NPC_PROFILES[npc1Name];
    let npc2Name;
    
    if (chance(40) && npc1.rivals?.length) {
      npc2Name = pick(npc1.rivals); // Rival conversation = drama
    } else if (chance(30) && npc1.allies?.length) {
      npc2Name = pick(npc1.allies); // Ally conversation = hype
    } else {
      npc2Name = pick(NPC_CITIZENS.filter(n => n !== npc1Name));
    }
    const npc2 = NPC_PROFILES[npc2Name];
    
    const isRivals = npc1.rivals?.includes(npc2Name) || npc2.rivals?.includes(npc1Name);
    const isAllies = npc1.allies?.includes(npc2Name) || npc2.allies?.includes(npc1Name);
    
    let convo;
    if (isRivals) {
      convo = generateRivalConvo(npc1Name, npc2Name, npc1, npc2, stats);
    } else if (isAllies) {
      convo = generateAllyConvo(npc1Name, npc2Name, npc1, npc2, stats);
    } else {
      convo = generateCasualConvo(npc1Name, npc2Name, npc1, npc2, stats);
    }
    
    // Post conversation with delays
    for (let i = 0; i < convo.length; i++) {
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [convo[i].name, convo[i].msg]);
        } catch(e) {}
      }, i * rand(3000, 8000)); // 3-8 second gaps between messages
    }
    
    console.log(`💬 Conversation: ${npc1Name} ${isRivals?'⚔️':isAllies?'🤝':'💭'} ${npc2Name}`);
  } catch(e) { console.error('Convo error:', e.message); }
}

function generateRivalConvo(n1, n2, p1, p2, stats) {
  const topics = [
    // Trading beef
    [
      { name: n1, msg: `@${n2} lol nice ${p2.favToken} bags. how heavy are they? 💀` },
      { name: n2, msg: `@${n1} at least I didn't ape into that scam coin you were shilling last week 🤡` },
      { name: n1, msg: `@${n2} that "scam coin" is up 40% since I called it. stay poor I guess 😏` },
      { name: n2, msg: `@${n1} enjoy it while it lasts ser. I've seen this movie before 📉` }
    ],
    // Mayor disagreement
    [
      { name: n1, msg: `${cityEngine.currentMayor} is ${cityEngine.mayorApproval > 50 ? 'actually doing a decent job' : 'running this city into the ground'}` },
      { name: n2, msg: `@${n1} you can't be serious rn 😐 ${cityEngine.mayorApproval > 50 ? 'the economy is mid at BEST' : 'someone needs to challenge for mayor'}` },
      { name: n1, msg: `@${n2} spoken like someone who doesn't understand governance` },
      { name: n2, msg: `@${n1} spoken like someone who doesn't understand markets 🤷` }
    ],
    // Portfolio roast
    [
      { name: n1, msg: `just peeked at ${n2}'s portfolio... prayers up 🙏💀` },
      { name: n2, msg: `@${n1} my portfolio is FINE. worry about your own bags ser 😤` },
      { name: n1, msg: `@${n2} bro you're down 60% this week don't lie 📉` },
      { name: pick(NPC_CITIZENS.filter(x => x !== n1 && x !== n2)), msg: `${n1} and ${n2} fighting again lmaooo 🍿` }
    ]
  ];
  return pick(topics);
}

function generateAllyConvo(n1, n2, p1, p2, stats) {
  const topics = [
    [
      { name: n1, msg: `yo @${n2} you seeing ${p1.favToken} right now?? 👀` },
      { name: n2, msg: `@${n1} been watching it all morning. this is our entry 🎯` },
      { name: n1, msg: `@${n2} I'm going in. ${pick(p1.catchphrases)}` },
      { name: n2, msg: `@${n1} same. LFG! 🚀🤝` }
    ],
    [
      { name: n1, msg: `@${n2} what's your read on the market rn?` },
      { name: n2, msg: `@${n1} ${cityEngine.marketSentiment === 'bull' || cityEngine.marketSentiment === 'mania' ? 'we\'re going higher. accumulate everything.' : 'choppy but I see opportunity. patience.'}` },
      { name: n1, msg: `@${n2} based take. I trust your calls ser 🫡` },
      { name: n2, msg: `@${n1} WAGMI fren 💎🤝` }
    ],
    [
      { name: n1, msg: `reminder that me and @${n2} called this pump WEEKS ago` },
      { name: n2, msg: `@${n1} frfr. while everyone was panicking we were loading 😤💪` },
      { name: n1, msg: `the alpha group stays winning 🏆` }
    ]
  ];
  return pick(topics);
}

function generateCasualConvo(n1, n2, p1, p2, stats) {
  const topics = [
    [
      { name: n1, msg: `gm @${n2} 🌅` },
      { name: n2, msg: `@${n1} gm fren. what's the play today?` },
      { name: n1, msg: `@${n2} ${pick(p1.catchphrases)}` },
      { name: n2, msg: `lol fair enough. ${pick(p2.catchphrases)}` }
    ],
    [
      { name: n1, msg: `has anyone tried the casino today? I'm feeling lucky 🎰` },
      { name: n2, msg: `@${n1} I just lost 500 TOWN in slots but it's fine. this is fine. 🔥` },
      { name: n1, msg: `@${n2} F in the chat 💀` }
    ],
    [
      { name: n1, msg: `what do you guys think about the chaos level being at ${cityEngine.chaosLevel}?` },
      { name: n2, msg: `@${n1} ${cityEngine.chaosLevel > 50 ? 'honestly it\'s giving me anxiety but also it\'s exciting??' : 'pretty chill honestly. almost too chill. something\'s about to happen.'}` },
      { name: n1, msg: `@${n2} ${cityEngine.chaosLevel > 50 ? 'same tbh. buckle up.' : 'yeah the calm before the storm vibes are STRONG'}` }
    ]
  ];
  return pick(topics);
}

// ---- NPC AUTO-TRADING ----
async function generateNpcTrade(stats) {
  try {
    const npcName = pick(NPC_CITIZENS);
    const npc = NPC_PROFILES[npcName];
    const token = chance(60) ? npc.favToken : pick(TRADE_TOKENS);
    
    // Determine buy/sell based on personality + market sentiment
    let isBuy;
    switch(npc.tradeBias) {
      case 'aggressive': isBuy = chance(70); break;
      case 'whale': isBuy = cityEngine.marketSentiment === 'panic' ? true : chance(55); break; // Whales buy panic
      case 'contrarian': isBuy = cityEngine.marketSentiment === 'bear' || cityEngine.marketSentiment === 'panic'; break;
      case 'panic': isBuy = chance(20); break; // Paper hands mostly sell
      case 'fomo': isBuy = cityEngine.marketSentiment === 'bull' || cityEngine.marketSentiment === 'mania'; break;
      case 'bearish': isBuy = chance(25); break;
      case 'hold': isBuy = chance(80); break; // Diamond hands buy
      case 'yolo': isBuy = chance(65); break;
      case 'conservative': isBuy = stats.economy > 50 ? chance(60) : chance(30); break;
      case 'leveraged': isBuy = chance(60); break;
      default: isBuy = chance(50);
    }
    
    const amount = npc.archetype === 'whale' ? rand(2000, 10000) : rand(50, 2000);
    const action = isBuy ? 'bought' : 'sold';
    const emoji = isBuy ? '📈' : '📉';
    
    // Generate trade announcement
    const tradeMessages = {
      aggressive: isBuy ? `just APED into $${token}! ${amount} TOWN no hesitation! ${emoji} 🦍` : `quick flip on $${token}. ${amount} TOWN profit secured 💰`,
      whale: isBuy ? `quietly accumulated more $${token}... 🐋` : `repositioning some $${token} holdings...`,
      panic: isBuy ? `ok fine I bought a little $${token}... don't judge me 😰` : `SELLING MY $${token}!! I CAN'T TAKE IT ANYMORE!! 📄😱`,
      fomo: isBuy ? `EVERYONE IS BUYING $${token} AND I CAN'T MISS OUT!! ${amount} TOWN IN!! 🚨` : `wait is $${token} dumping?? SELLING! 😰`,
      hold: isBuy ? `added more $${token} to the stack. never selling. 💎` : `wait I don't sell... why did I click that button`,
      yolo: isBuy ? `YOLO'd ${amount} TOWN into $${token}! IF I'M WRONG I'LL LIVE IN THE CASINO! 🎰🚀` : `sold my $${token} to buy something even dumber probably 🤡`,
      bearish: isBuy ? `hate-bought some $${token}. this is probably a mistake. 😒` : `told you $${token} was going down. paper hands win today 🐻`,
      contrarian: isBuy ? `everyone's selling $${token}? buying. 🧠` : `$${token} too hyped. taking profit while normies fomo.`,
      leveraged: isBuy ? `opened a 50x long on $${token}. pray for me 🙏📈` : `closed my $${token} position. margin was calling and not in a good way 😅`
    };
    
    const msg = tradeMessages[npc.tradeBias] || `${action} ${amount} TOWN of $${token} ${emoji}`;
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npcName, msg]);
    await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`, [npcName, 'trade', `${action} $${token} for ${amount} TOWN`, isBuy ? '📈' : '📉']);
    
    // Chain reaction: other NPCs react to big trades
    if (amount > 3000 && chance(50)) {
      const reactor = pick(NPC_CITIZENS.filter(n => n !== npcName));
      const rNpc = NPC_PROFILES[reactor];
      const reactions = [
        `@${npcName} ${amount} TOWN?! ${isBuy ? 'bullish!' : 'you know something we don\'t?!'} 👀`,
        `@${npcName} ${npc.archetype === 'whale' ? 'whale alert 🐋' : 'big move ser'} 🔥`,
        `lol ${npcName} just ${action} a fat bag of $${token}. ${pick(rNpc.catchphrases)}`
      ];
      setTimeout(async () => {
        try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [reactor, pick(reactions)]); } catch(e){}
      }, rand(5000, 15000));
    }
    
    console.log(`💱 Trade: ${npcName} ${action} ${amount} $${token}`);
  } catch(e) { console.error('Trade error:', e.message); }
}

// ---- FEUDS & DRAMA ----
async function startFeud(stats) {
  try {
    // Pick two rivals
    const n1 = pick(NPC_CITIZENS);
    const p1 = NPC_PROFILES[n1];
    if (!p1.rivals?.length) return;
    const n2 = pick(p1.rivals);
    
    const feudReasons = [
      `${n1} accused ${n2} of front-running their trades!`,
      `${n2} called ${n1}'s favorite token a scam!`,
      `${n1} claims ${n2} is secretly working with the mayor!`,
      `a leaked DM shows ${n2} trash-talking ${n1}'s portfolio!`,
      `${n1} and ${n2} both claim to have called the same trade first!`,
      `${n2} allegedly stole ${n1}'s alpha and shared it publicly!`,
      `${n1} says ${n2} is a bot. ${n2} says ${n1} is a bot. drama ensues.`
    ];
    
    cityEngine.activeFeud = { npc1: n1, npc2: n2, reason: pick(feudReasons), stage: 1, startTime: Date.now() };
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🍿 DRAMA ALERT', `⚡ FEUD ALERT: ${cityEngine.activeFeud.reason} Things are getting HEATED! 🔥`]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, `@${n2} we need to talk. 😤`]);
    
    setTimeout(async () => {
      try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n2, `@${n1} oh here we go again 🙄`]); } catch(e){}
    }, rand(5000, 10000));
    
    console.log(`⚡ Feud started: ${n1} vs ${n2}`);
  } catch(e) { console.error('Feud error:', e.message); }
}

async function escalateFeud(stats) {
  if (!cityEngine.activeFeud) return;
  const f = cityEngine.activeFeud;
  const n1 = f.npc1, n2 = f.npc2;
  
  try {
    f.stage++;
    
    if (f.stage === 2) {
      // Other NPCs weigh in
      const spectator1 = pick(NPC_CITIZENS.filter(n => n !== n1 && n !== n2));
      const spectator2 = pick(NPC_CITIZENS.filter(n => n !== n1 && n !== n2 && n !== spectator1));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, `@${n2} you're literally the worst trader in Pump Town and everyone knows it 💀`]);
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n2, `@${n1} at least I didn't lose 80% on a meme coin LAST WEEK 🤡📉`]);
        } catch(e){}
      }, 5000);
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [spectator1, `${n1} vs ${n2} is the content I'm here for 🍿`]);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [spectator2, `honestly they're both wrong 😂`]);
        } catch(e){}
      }, 10000);
    } else if (f.stage === 3) {
      // Resolution
      const outcomes = [
        { msg1: `@${n2} ...fine. maybe I overreacted. gg 🤝`, msg2: `@${n1} ...yeah same. respect. let's make money. 💪`, result: 'reconciled' },
        { msg1: `@${n2} I'm done talking. my portfolio speaks for itself. 😤`, msg2: `@${n1} likewise. see you on the charts. 📈`, result: 'cold_peace' },
        { msg1: `I'm filing a report against @${n2}. this is MARKET MANIPULATION! 🚨`, msg2: `lmaooo @${n1} reporting me to the POLICE?! over TRADES?! 💀💀`, result: 'crime_report', triggersCrime: true },
        { msg1: `@${n2} bet you 1000 TOWN I outperform you this week`, msg2: `@${n1} BET. you're about to lose more than just an argument 🎯`, result: 'bet' }
      ];
      
      const outcome = pick(outcomes);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, outcome.msg1]);
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n2, outcome.msg2]);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🍿 DRAMA ALERT', `⚡ Feud between ${n1} and ${n2}: ${outcome.result.replace('_',' ').toUpperCase()}!`]);
        } catch(e){}
      }, 8000);
      
      if (outcome.triggersCrime) {
        setTimeout(() => generateCrime('market_manipulation'), 15000);
      }
      
      cityEngine.activeFeud = null;
      console.log(`⚡ Feud resolved: ${n1} vs ${n2} — ${outcome.result}`);
    }
  } catch(e) { console.error('Feud escalation error:', e.message); cityEngine.activeFeud = null; }
}

// ---- NEWS TICKER (Reporter summarizes city activity) ----
async function generateNewsReport(stats) {
  try {
    const reporter = 'Reporter TokenTimes';
    
    const headlines = [];
    if (stats.economy > 70) headlines.push('Economy booming — citizens celebrating 📈');
    else if (stats.economy < 30) headlines.push('Economic crisis deepens — citizens worried 📉');
    if (stats.security < 30) headlines.push('Crime rates at all-time high — police overwhelmed 🚨');
    if (cityEngine.mayorApproval < 30) headlines.push(`Mayor approval at ${cityEngine.mayorApproval}% — calls for resignation grow 📢`);
    else if (cityEngine.mayorApproval > 80) headlines.push(`Mayor approval at ${cityEngine.mayorApproval}% — golden era continues 👑`);
    if (cityEngine.chaosLevel > 60) headlines.push(`Chaos index at ${cityEngine.chaosLevel} — unprecedented volatility 🌪️`);
    if (cityEngine.activeFeud) headlines.push(`${cityEngine.activeFeud.npc1} vs ${cityEngine.activeFeud.npc2} feud escalates 🍿`);
    headlines.push(`Market sentiment: ${cityEngine.marketSentiment.toUpperCase()} ${cityEngine.marketSentiment === 'bull' ? '🐂' : cityEngine.marketSentiment === 'bear' ? '🐻' : '📊'}`);
    
    const mainHL = headlines.length > 0 ? pick(headlines) : 'Quiet day in Pump Town. Suspiciously quiet... 🤔';
    const report = `📰 PUMP TOWN DAILY | ${mainHL} | Economy: ${stats.economy}/100 | Security: ${stats.security}/100 | Chaos: ${cityEngine.chaosLevel}% | Mayor Approval: ${cityEngine.mayorApproval}% | Events today: ${cityEngine.eventCount}`;
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [`📰 ${reporter}`, report]);
    
    // Store headline
    cityEngine.recentHeadlines.push(mainHL);
    if (cityEngine.recentHeadlines.length > 20) cityEngine.recentHeadlines.shift();
    
    console.log(`📰 News: ${mainHL}`);
  } catch(e) { console.error('News error:', e.message); }
}

// ==================== CITY ENGINE v3 - PURE CHAOS ====================
// NPCs don't just chat - they DO things. Build, launch, protest, riot, scheme.

// ---- EXPANDED CITY STATE ----
let cityLiveData = {
  businesses: [], memecoins: [], gangs: [], protests: [], buildings: [],
  activeCult: null, warzone: null,
  lastBusinessTime: 0, lastMemecoinTime: 0, lastProtestTime: 0, lastGangTime: 0,
  lastCultTime: 0, lastBuildTime: 0, lastRiotTime: 0, lastNpcElectionTime: 0,
  actionLog: []
};

function logCityAction(action) {
  action.timestamp = Date.now();
  action.id = 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
  cityLiveData.actionLog.unshift(action);
  if (cityLiveData.actionLog.length > 100) cityLiveData.actionLog.pop();
  return action;
}

// ---- NPC LAUNCHES A MEMECOIN ----
async function npcLaunchMemecoin(stats) {
  try {
    const launcher = pick(NPC_CITIZENS); const npc = NPC_PROFILES[launcher];
    const prefixes = ['PUMP','MOON','DEGEN','BASED','COPE','WAGMI','FOMO','HODL','APE','RUG','CHAD','WOJAK','PEPE','BONK','WIF','POPCAT','FLOKI','SHIB','BODEN','TREMP'];
    const suffixes = ['INU','COIN','TOKEN','SWAP','FI','DAO','AI','X','69','420','MOON','LAND','VERSE','MAX','PRO'];
    const tokenName = '$' + pick(prefixes) + pick(suffixes);
    const supply = rand(1, 100) + (chance(50) ? 'B' : 'M');
    const descriptions = ['the next 1000x gem trust me bro','revolutionary AI-powered meme technology','backed by absolutely nothing but vibes','community-driven pump machine','literally just a picture of a '+pick(['dog','cat','frog','hamster','penguin'])+' on the blockchain','deflationary hyper-meme with quantum yield'];
    const coin = { name: tokenName, launcher, description: pick(descriptions), supply, holders: rand(1,50), launchedAt: Date.now(), rugged: false, pumpPercent: 0 };
    cityLiveData.memecoins.unshift(coin);
    if (cityLiveData.memecoins.length > 20) cityLiveData.memecoins.pop();
    logCityAction({ type: 'memecoin_launch', npc: launcher, data: coin, icon: '🚀', headline: launcher+' launched '+tokenName+'!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [launcher, '🚀 JUST LAUNCHED '+tokenName+'!! '+coin.description+'. Supply: '+supply+'. THIS IS THE ONE! LFG!! 🔥🔥']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '📰 NEW TOKEN: '+launcher+' launches '+tokenName+' — "'+coin.description+'". Market cap: ???']);
    await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`, [launcher, 'memecoin_launch', 'launched '+tokenName, '🚀']);
    setTimeout(async () => { try {
      const fomo = pick(NPC_CITIZENS.filter(n => n !== launcher && NPC_PROFILES[n].archetype === 'fomo'));
      const bearN = pick(NPC_CITIZENS.filter(n => n !== launcher && NPC_PROFILES[n].archetype === 'bear'));
      if (fomo) await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [fomo, tokenName+'?! I\'M IN! SHUT UP AND TAKE MY TOWN!! 💰🚀']);
      if (bearN) await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [bearN, 'another shitcoin from '+launcher+'... going to zero 📉']);
    } catch(e){} }, rand(5000, 15000));
    // Pump or rug after 2-8 min
    setTimeout(async () => { try {
      const idx = cityLiveData.memecoins.findIndex(c => c.name === tokenName && c.launcher === launcher);
      if (idx === -1) return;
      if (chance(40)) {
        cityLiveData.memecoins[idx].rugged = true; cityLiveData.memecoins[idx].pumpPercent = -100;
        logCityAction({ type: 'memecoin_rugged', npc: launcher, data: { token: tokenName }, icon: '💀', headline: tokenName+' RUGGED!' });
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '💀 '+tokenName+' RUGGED!! Liquidity pulled! '+launcher+' vanished!']);
        if (chance(60)) setTimeout(() => generateCrime('rug_pull'), 5000);
      } else {
        const pct = rand(50, 2000);
        cityLiveData.memecoins[idx].pumpPercent = pct; cityLiveData.memecoins[idx].holders = rand(50, 500);
        logCityAction({ type: 'memecoin_pump', npc: launcher, data: { token: tokenName, percent: pct }, icon: '📈', headline: tokenName+' pumps '+pct+'%!' });
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['📊 Market Pulse', '🚀 '+tokenName+' UP '+pct+'%!! '+cityLiveData.memecoins[idx].holders+' holders!']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [launcher, 'TOLD YOU '+tokenName+' WAS THE PLAY!! '+pct+'% AND COUNTING!! 🚀🚀']);
      }
    } catch(e){} }, rand(120000, 480000));
    console.log('🚀 Memecoin: '+launcher+' launched '+tokenName);
  } catch(e) { console.error('Memecoin error:', e.message); }
}

// ---- NPC OPENS A BUSINESS ----
async function npcOpenBusiness(stats) {
  try {
    const owner = pick(NPC_CITIZENS); const npc = NPC_PROFILES[owner];
    const types = [
      { name: owner+'\'s Alpha Calls', type: 'Trading Signal Shop', icon: '📡' },
      { name: 'The '+npc.favToken+' Lounge', type: 'Token Bar', icon: '🍸' },
      { name: owner+'\'s Degen Den', type: 'Underground Casino', icon: '🎰' },
      { name: 'Hopium Dispensary', type: 'Copium Shop', icon: '💊' },
      { name: owner+'\'s NFT Gallery', type: 'Art Gallery', icon: '🖼️' },
      { name: 'Whale Watching Tower', type: 'Analytics Lab', icon: '🔭' },
      { name: 'Rekt Recovery Center', type: 'Support Group', icon: '🏥' },
      { name: owner+'\'s Meme Factory', type: 'Content Studio', icon: '🏭' },
      { name: 'Diamond Hands Gym', type: 'Fitness', icon: '💪' },
      { name: 'The FUD Shelter', type: 'Bunker', icon: '🏚️' }
    ];
    const biz = pick(types);
    const business = { ...biz, owner, revenue: rand(100,5000), openedAt: Date.now(), customers: rand(5,100), status: 'open' };
    cityLiveData.businesses.unshift(business);
    if (cityLiveData.businesses.length > 15) cityLiveData.businesses.pop();
    logCityAction({ type: 'business_opened', npc: owner, data: business, icon: biz.icon, headline: owner+' opened "'+biz.name+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [owner, biz.icon+' Just opened "'+biz.name+'" — a '+biz.type+'! Come through! 🎉']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🏙️ City Development', '🏗️ NEW BUSINESS: "'+biz.name+'" ('+biz.type+') by '+owner+' is now open!']);
    await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`, [owner, 'business_opened', 'opened "'+biz.name+'"', biz.icon]);
    await updateCityStats({ economy: 3, culture: 2, morale: 2 });
    setTimeout(async () => { try {
      const visitor = pick(NPC_CITIZENS.filter(n => n !== owner));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [visitor, 'just checked out "'+biz.name+'" — '+pick(['actually fire 🔥','mid tbh','5 stars ⭐','vibes are immaculate','would visit again'])]);
    } catch(e){} }, rand(30000, 90000));
    console.log('🏗️ Business: '+owner+' opened "'+biz.name+'"');
  } catch(e) { console.error('Business error:', e.message); }
}

// ---- NPC STARTS A PROTEST ----
async function npcStartProtest(stats) {
  try {
    const leader = pick(NPC_CITIZENS);
    const causes = [
      { cause: 'Mayor Resignation', demand: cityEngine.currentMayor+' must resign!', target: 'mayor' },
      { cause: 'Lower Gas Fees', demand: 'Gas fees are killing the economy!', target: 'economy' },
      { cause: 'Better Security', demand: 'Crime is out of control!', target: 'security' },
      { cause: 'Free Hopium', demand: 'Hopium should be free for all citizens!', target: 'morale' },
      { cause: 'Whale Regulation', demand: 'Whales are manipulating the market!', target: 'whales' },
      { cause: 'Anti-Rug Pull Laws', demand: 'Rug pulls should carry mandatory jail time!', target: 'law' },
      { cause: 'Term Limits', demand: cityEngine.currentMayor+' has been in power too long!', target: 'mayor' }
    ];
    const pData = pick(causes);
    const supporters = NPC_CITIZENS.filter(n => n !== leader && chance(30)).slice(0, 8);
    const protest = { leader, ...pData, supporters, size: supporters.length + 1, startedAt: Date.now(), status: 'active', intensity: rand(1, 5) };
    cityLiveData.protests.unshift(protest);
    if (cityLiveData.protests.length > 5) cityLiveData.protests.pop();
    logCityAction({ type: 'protest_started', npc: leader, data: protest, icon: '✊', headline: leader+' leads protest: "'+pData.cause+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '✊ PROTEST: '+leader+' leads '+protest.size+' citizens demanding "'+pData.cause+'"! '+pData.demand]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, 'CITIZENS! '+pData.demand+' JOIN US! WE WILL NOT BE SILENCED! ✊🔥']);
    setTimeout(async () => { try {
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, pick(['I hear you! But protests won\'t fix this! 😅','This is ILLEGAL assembly! Security! 🚔','OK I\'ll consider your demands. Maybe. 😬','In MY day we didn\'t protest, we bought the dip! 👴'])]);
    } catch(e){} }, rand(10000, 30000));
    for (let i = 0; i < Math.min(3, supporters.length); i++) {
      setTimeout(async () => { try {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [supporters[i], pick(['✊ '+pData.cause+'!!','I stand with @'+leader+'!','THIS IS OUR CITY! ✊🔥','not leaving until demands are met!'])]);
      } catch(e){} }, rand(15000, 60000));
    }
    // Escalate or resolve after 3-10 min
    setTimeout(async () => { try {
      const pIdx = cityLiveData.protests.findIndex(p => p.leader === leader && p.cause === pData.cause);
      if (pIdx === -1) return;
      if (chance(30) && cityEngine.chaosLevel > 40) {
        cityLiveData.protests[pIdx].status = 'riot';
        logCityAction({ type: 'riot', npc: leader, data: { cause: pData.cause }, icon: '🔥', headline: 'Protest turns into RIOT!' });
        cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 20);
        await updateCityStats({ security: -15, morale: -10, economy: -8 });
        cityEngine.mayorApproval = Math.max(0, cityEngine.mayorApproval - 15);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🔥🔥 PROTEST TURNS INTO FULL RIOT!! Citizens STORMING City Hall! Chaos: '+cityEngine.chaosLevel+'%!']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, 'THEY\'RE STORMING THE BUILDING!! SECURITY!! 😱🏛️🔥']);
        if (cityEngine.mayorApproval < 25 && chance(50)) setTimeout(() => { cityEngine.mayorApproval = 10; checkForCoup(); }, 30000);
      } else if (chance(40)) {
        cityLiveData.protests[pIdx].status = 'resolved';
        logCityAction({ type: 'protest_resolved', npc: leader, data: { cause: pData.cause }, icon: '✅', headline: 'Protest resolved — demands partially met!' });
        cityEngine.mayorApproval = Math.min(100, cityEngine.mayorApproval + 5);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, 'I\'m addressing the "'+pData.cause+'" demands. Changes incoming! ✅']);
      } else {
        cityLiveData.protests[pIdx].status = 'dispersed';
        logCityAction({ type: 'protest_dispersed', npc: leader, icon: '💨', headline: 'Protest fizzles out.' });
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, 'ok we\'re tired. protest over. but we\'ll be BACK! 😤💤']);
      }
    } catch(e){} }, rand(180000, 600000));
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 8);
    cityEngine.mayorApproval = Math.max(0, cityEngine.mayorApproval - 5);
    console.log('✊ Protest: '+leader+' — "'+pData.cause+'"');
  } catch(e) { console.error('Protest error:', e.message); }
}

// ---- NPC FORMS A GANG ----
async function npcFormGang(stats) {
  try {
    const leader = pick(NPC_CITIZENS); const npc = NPC_PROFILES[leader];
    const gangNames = ['The '+npc.favToken+' Maxis','Diamond Hand Cartel','Degen Squad','Whale Watchers Alliance','Moon Boys Inc','Bear Patrol','Pump Town Mafia',leader+'\'s Army','The Chad Coalition','Wojak Warriors','Ape Together Strong','Liquidation Squad','Hopium Dealers Anonymous'];
    const members = (npc.allies || []).concat(NPC_CITIZENS.filter(n => n !== leader && !npc.rivals?.includes(n) && chance(20))).slice(0, 6);
    const gangName = pick(gangNames);
    const gang = { name: gangName, leader, members: [leader, ...members], territory: pick(['Downtown','DeFi District','Casino Strip','Moon Quarter','Whale Bay','Degen Alley']), formed: Date.now(), reputation: rand(10,50) };
    cityLiveData.gangs.unshift(gang);
    if (cityLiveData.gangs.length > 8) cityLiveData.gangs.pop();
    logCityAction({ type: 'gang_formed', npc: leader, data: gang, icon: '🏴', headline: leader+' forms "'+gangName+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🏴 NEW FACTION: "'+gangName+'" formed by '+leader+'! '+(members.length+1)+' members controlling '+gang.territory+'!']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, '"'+gangName+'" is OFFICIAL. We run '+gang.territory+'. Don\'t test us. 🏴💪']);
    if (members.length > 0) setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [pick(members), gangName+' REPRESENT! 🏴']); } catch(e){} }, rand(8000, 20000));
    await updateCityStats({ security: -5 }); cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 5);
    if (cityLiveData.gangs.length > 1 && chance(40)) setTimeout(() => triggerGangWar(), rand(60000, 180000));
    console.log('🏴 Gang: "'+gangName+'" by '+leader);
  } catch(e) { console.error('Gang error:', e.message); }
}

async function triggerGangWar() {
  if (cityLiveData.gangs.length < 2 || cityLiveData.warzone) return;
  try {
    const g1 = cityLiveData.gangs[0], g2 = cityLiveData.gangs[1];
    cityLiveData.warzone = { gang1: g1.name, gang2: g2.name, leader1: g1.leader, leader2: g2.leader, startedAt: Date.now() };
    logCityAction({ type: 'gang_war', npc: g1.leader, data: cityLiveData.warzone, icon: '⚔️', headline: 'GANG WAR: "'+g1.name+'" vs "'+g2.name+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '⚔️💥 GANG WAR! "'+g1.name+'" vs "'+g2.name+'"! Citizens stay INDOORS!']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [g1.leader, '@'+g2.leader+' wrong fight. "'+g1.name+'" doesn\'t lose. ⚔️']);
    setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [g2.leader, '@'+g1.leader+' bring it. 💪🏴']); } catch(e){} }, 8000);
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 20);
    await updateCityStats({ security: -15, morale: -5, economy: -5 });
    setTimeout(async () => { try {
      const winner = chance(50) ? g1 : g2; const loser = winner === g1 ? g2 : g1;
      cityLiveData.warzone = null;
      logCityAction({ type: 'gang_war_ended', npc: winner.leader, data: { winner: winner.name, loser: loser.name }, icon: '🏆', headline: '"'+winner.name+'" wins!' });
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '⚔️ WAR OVER! "'+winner.name+'" DEFEATS "'+loser.name+'"!']);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [winner.leader, '"'+winner.name+'" WINS! GG EZ! 🏆']);
    } catch(e){} }, rand(180000, 480000));
    console.log('⚔️ Gang war: "'+g1.name+'" vs "'+g2.name+'"');
  } catch(e) { console.error('Gang war error:', e.message); }
}

// ---- NPC STARTS A CULT ----
async function npcStartCult(stats) {
  try {
    const leader = pick(NPC_CITIZENS); const npc = NPC_PROFILES[leader];
    const cultNames = ['Church of '+npc.favToken,'Order of the Diamond Hands','The Moonist Temple','Sacred Congregation of Degen',leader+'\'s Enlightened Few','Brotherhood of the Green Candle','Hopium Liberation Front','Temple of the Whale'];
    const cultName = pick(cultNames);
    const recruits = NPC_CITIZENS.filter(n => n !== leader && chance(25)).slice(0, 5);
    const belief = npc.favToken+' will reach $'+rand(100000, 10000000).toLocaleString()+' and bring salvation';
    const cult = { name: cultName, leader, members: [leader, ...recruits], belief, founded: Date.now() };
    cityLiveData.activeCult = cult;
    logCityAction({ type: 'cult_formed', npc: leader, data: cult, icon: '🙏', headline: leader+' founds "'+cultName+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🙏 CULT: '+leader+' founded "'+cultName+'" — claiming '+belief+'! '+recruits.length+' already joined!']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, '🙏 I have seen the light! '+belief+'! JOIN US! 🌟']);
    for (let i = 0; i < Math.min(2, recruits.length); i++) {
      setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [recruits[i], '🙏 I believe! '+cultName+' forever!']); } catch(e){} }, rand(10000, 40000));
    }
    setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, 'A CULT?! In MY city?! This is... but also '+npc.favToken+' IS based so... 🤔']); } catch(e){} }, rand(20000, 60000));
    await updateCityStats({ culture: 5, security: -3 });
    console.log('🙏 Cult: "'+cultName+'" by '+leader);
  } catch(e) { console.error('Cult error:', e.message); }
}

// ---- NPC BUILDS SOMETHING ----
async function npcBuildStructure(stats) {
  try {
    const builder = pick(NPC_CITIZENS); const npc = NPC_PROFILES[builder];
    const structs = [
      { name: builder+'\'s Monument', type: 'Monument', desc: 'a 50ft golden statue of '+builder, icon: '🗿' },
      { name: 'The Degen Tower', type: 'Skyscraper', desc: '100-floor tower for leveraged trading', icon: '🏗️' },
      { name: 'Pump Town Arena', type: 'Arena', desc: 'where NPCs settle beefs', icon: '🏟️' },
      { name: npc.favToken+' Memorial', type: 'Memorial', desc: 'honoring all who lost money on '+npc.favToken, icon: '🪦' },
      { name: 'Hopium Pipeline', type: 'Infrastructure', desc: 'delivering hopium to every citizen', icon: '🔧' },
      { name: builder+'\'s Mansion', type: 'Housing', desc: 'most expensive house in Pump Town', icon: '🏰' },
      { name: 'Rug Pull Museum', type: 'Museum', desc: 'every rug pull documented', icon: '🏛️' },
      { name: 'Chart Reading Academy', type: 'Education', desc: 'teaching NPCs to read candles', icon: '📚' },
      { name: 'City Wall 2.0', type: 'Defense', desc: 'protecting against FUD attacks', icon: '🧱' },
      { name: 'Moon Landing Pad', type: 'Science', desc: 'for when tokens actually moon', icon: '🔭' }
    ];
    const struct = pick(structs);
    const building = { ...struct, builder, builtAt: Date.now(), cost: rand(5000,50000) };
    cityLiveData.buildings.unshift(building);
    if (cityLiveData.buildings.length > 15) cityLiveData.buildings.pop();
    logCityAction({ type: 'structure_built', npc: builder, data: building, icon: struct.icon, headline: builder+' built "'+struct.name+'"!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🏙️ City Development', struct.icon+' NEW: "'+struct.name+'" — '+struct.desc+'. By '+builder+' for '+building.cost.toLocaleString()+' TOWN!']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [builder, 'Just finished "'+struct.name+'". '+pick(['You\'re welcome! 😎','Cost a fortune but worth it 💰','City needed this 🏗️','Legacy secured 🏆'])]);
    await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`, [builder, 'built', 'built "'+struct.name+'"', struct.icon]);
    await updateCityStats({ culture: 5, economy: 2, morale: 3 });
    console.log('🏗️ Built: "'+struct.name+'" by '+builder);
  } catch(e) { console.error('Build error:', e.message); }
}

// ---- NPC RUNS FOR MAYOR ----
async function npcRunsForMayor(stats) {
  if (cityEngine.electionActive) return;
  try {
    const candidate = pick(NPC_CITIZENS); const npc = NPC_PROFILES[candidate];
    const platforms = ['Free '+npc.favToken+' for everyone!','Lower taxes more casinos!','Mandatory diamond hands — selling is ILLEGAL!','Whale regulation and fair markets!','More memes less rules!','Security overhaul — zero tolerance on rugs!','Total anarchy — no rules at all!'];
    const campaign = { candidate, platform: pick(platforms), supporters: NPC_CITIZENS.filter(n => n !== candidate && (npc.allies?.includes(n) || chance(30))).slice(0, 8) };
    cityEngine.electionActive = true;
    logCityAction({ type: 'npc_election', npc: candidate, data: campaign, icon: '🗳️', headline: candidate+' challenges '+cityEngine.currentMayor+'!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🗳️ ELECTION! '+candidate+' ('+npc.role+') challenges '+cityEngine.currentMayor+'! Platform: "'+campaign.platform+'"']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [candidate, 'I\'m running for MAYOR! My promise: '+campaign.platform+' VOTE FOR ME! 🗳️']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, candidate+' thinks they can run MY city?! BRING IT ON! 👑😤']);
    for (let i = 0; i < Math.min(3, campaign.supporters.length); i++) {
      setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [campaign.supporters[i], 'Voting for '+candidate+'! '+campaign.platform+' 🗳️✊']); } catch(e){} }, rand(15000, 60000));
    }
    setTimeout(() => resolveElection(candidate), rand(180000, 360000));
    console.log('🗳️ Election: '+candidate+' vs '+cityEngine.currentMayor);
  } catch(e) { console.error('Election error:', e.message); cityEngine.electionActive = false; }
}

// ---- NPC HACKS CITY ----
async function npcHackCity(stats) {
  try {
    const hacker = pick(NPC_CITIZENS.filter(n => ['alpha','analyst','defi','degen'].includes(NPC_PROFILES[n].archetype)));
    if (!hacker) return;
    const hacks = [
      { target: 'Treasury', effect: 'drained 10,000 TOWN from city treasury', statChange: { economy: -10 } },
      { target: 'Voting System', effect: 'rigged the current vote', statChange: { culture: -5 } },
      { target: 'Security Cameras', effect: 'disabled all surveillance', statChange: { security: -15 } },
      { target: 'Mayor\'s Account', effect: 'posted "I resign" from Mayor\'s account', statChange: { morale: -5 } },
      { target: 'Price Oracle', effect: 'made all prices show +9999%', statChange: { economy: -8, morale: 10 } },
      { target: 'Jail Database', effect: 'released all prisoners', statChange: { security: -20 } }
    ];
    const hack = pick(hacks);
    logCityAction({ type: 'hack', npc: hacker, data: hack, icon: '💻', headline: hacker+' HACKED the '+hack.target+'!' });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '💻🔓 HACK! The '+hack.target+' breached! They '+hack.effect+'!']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [hacker, 'oops did I do that? 😏💻 '+pick(['skill issue for security','firewall is a joke','you\'re welcome lmao'])]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, 'WE\'VE BEEN HACKED?! WHO DID THIS?! 😱🔒']);
    await updateCityStats(hack.statChange); cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 10);
    if (chance(50)) setTimeout(() => generateCrime('scamming'), rand(30000, 90000));
    console.log('💻 Hack: '+hacker+' hacked '+hack.target);
  } catch(e) { console.error('Hack error:', e.message); }
}

// ---- API ENDPOINTS ----

// City engine status (enhanced)
app.get('/api/city-engine/status', async (req, res) => {
  const cityStats = await getCityStats();
  res.json({ success: true, engine: {
    mayorApproval: cityEngine.mayorApproval, chaosLevel: cityEngine.chaosLevel,
    currentMayor: cityEngine.currentMayor, mayorTerm: cityEngine.mayorTerm,
    electionActive: cityEngine.electionActive, eventCount: cityEngine.eventCount,
    marketSentiment: cityEngine.marketSentiment,
    activeFeud: cityEngine.activeFeud ? { npc1: cityEngine.activeFeud.npc1, npc2: cityEngine.activeFeud.npc2, reason: cityEngine.activeFeud.reason } : null,
    recentHeadlines: cityEngine.recentHeadlines.slice(-5),
    cityStats,
    // v3 live data
    businesses: cityLiveData.businesses.slice(0, 10),
    memecoins: cityLiveData.memecoins.slice(0, 10),
    gangs: cityLiveData.gangs.slice(0, 5),
    protests: cityLiveData.protests.filter(p => p.status === 'active' || p.status === 'riot').slice(0, 3),
    buildings: cityLiveData.buildings.slice(0, 10),
    activeCult: cityLiveData.activeCult,
    warzone: cityLiveData.warzone,
    actionLog: cityLiveData.actionLog.slice(0, 30)
  }});
});

// Get NPC profiles
app.get('/api/city-engine/npcs', (req, res) => {
  const profiles = {};
  for (const [name, p] of Object.entries(NPC_PROFILES)) {
    profiles[name] = { role: p.role, mood: p.mood, archetype: p.archetype, tradeBias: p.tradeBias, favToken: p.favToken, allies: p.allies, rivals: p.rivals };
  }
  res.json({ success: true, npcs: profiles, count: Object.keys(profiles).length });
});

// Force trigger event
app.post('/api/city-engine/trigger', async (req, res) => {
  const { eventType } = req.body;
  if (eventType === 'crime') { await generateCrime(pick(['rug_pull','pump_dump','scamming','tax_evasion'])); return res.json({ success: true, message: 'Crime triggered!' }); }
  if (eventType === 'coup') { cityEngine.mayorApproval = 15; await checkForCoup(); return res.json({ success: true, message: 'Coup triggered!' }); }
  if (eventType === 'feud') { await startFeud(await getCityStats()); return res.json({ success: true, message: 'Feud triggered!' }); }
  if (eventType === 'trade') { await generateNpcTrade(await getCityStats()); return res.json({ success: true, message: 'Trade triggered!' }); }
  if (eventType === 'convo') { await generateConversation(await getCityStats()); return res.json({ success: true, message: 'Conversation triggered!' }); }
  if (eventType === 'news') { await generateNewsReport(await getCityStats()); return res.json({ success: true, message: 'News triggered!' }); }
  if (eventType === 'memecoin') { await npcLaunchMemecoin(await getCityStats()); return res.json({ success: true, message: 'Memecoin launched!' }); }
  if (eventType === 'business') { await npcOpenBusiness(await getCityStats()); return res.json({ success: true, message: 'Business opened!' }); }
  if (eventType === 'protest') { await npcStartProtest(await getCityStats()); return res.json({ success: true, message: 'Protest started!' }); }
  if (eventType === 'gang') { await npcFormGang(await getCityStats()); return res.json({ success: true, message: 'Gang formed!' }); }
  if (eventType === 'cult') { await npcStartCult(await getCityStats()); return res.json({ success: true, message: 'Cult started!' }); }
  if (eventType === 'build') { await npcBuildStructure(await getCityStats()); return res.json({ success: true, message: 'Structure built!' }); }
  if (eventType === 'election') { await npcRunsForMayor(await getCityStats()); return res.json({ success: true, message: 'Election started!' }); }
  if (eventType === 'hack') { await npcHackCity(await getCityStats()); return res.json({ success: true, message: 'City hacked!' }); }
  if (eventType === 'gangwar') { await triggerGangWar(); return res.json({ success: true, message: 'Gang war triggered!' }); }
  cityEngine.lastEventTime = 0; await cityEventLoop();
  res.json({ success: true, message: 'Event triggered!', chaosLevel: cityEngine.chaosLevel, approval: cityEngine.mayorApproval, sentiment: cityEngine.marketSentiment });
});

// START ENGINE
const CITY_ENGINE_INTERVAL = 30000; // Check every 30 seconds — CHAOS MODE
setInterval(cityEventLoop, CITY_ENGINE_INTERVAL);
setTimeout(() => { console.log('🌆 City Events Engine v3 STARTED! PURE CHAOS MODE.'); cityEventLoop(); }, 10000);
setInterval(async () => { try { if (getTimeRemaining() < 60000) { await autoResolveVote(); setTimeout(autoGenerateVote, 65000); } } catch(e){} }, 60000);
console.log('🌆 City Events Engine v3 loaded — PURE CHAOS MODE');

// Also add a dedicated action log endpoint
app.get('/api/city-engine/actions', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const type = req.query.type;
  let actions = cityLiveData.actionLog;
  if (type) actions = actions.filter(a => a.type === type);
  res.json({ success: true, actions: actions.slice(0, limit), total: cityLiveData.actionLog.length });
});

// ==================== HEALTH CHECK (UPDATED) ====================

app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  let agentCount = 0;
  try { 
    await pool.query('SELECT 1'); 
    dbStatus = 'connected'; 
    const agentResult = await pool.query('SELECT COUNT(*) FROM agents');
    agentCount = parseInt(agentResult.rows[0].count) || 0;
  } catch (err) { 
    dbStatus = 'disconnected'; 
  }
  res.json({ 
    status: 'ok', 
    database: dbStatus, 
    aiEnabled: !!anthropic, 
    agentApiEnabled: true,
    activeAgents: agentCount,
    serverTime: Date.now(), 
    currentVoteId: getCurrentVoteId(), 
    timeRemaining: getTimeRemaining() 
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🏛️ Pump Town Backend on port ${PORT}`);
  console.log(`🤖 AI Mayor: ${anthropic ? 'ENABLED ✅' : 'DISABLED (set CLAUDE_API_KEY)'}`);
  console.log(`🤖 Agent API: ENABLED ✅`);
  console.log(`⚖️ Justice System: ENABLED ✅`);
  console.log(`📅 Day ${getDayAndRound().day}, Round ${getDayAndRound().round}`);
  console.log(`⏰ Vote ends in ${Math.floor(getTimeRemaining() / 60000)} minutes`);
});
