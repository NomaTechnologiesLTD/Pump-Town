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

// ==================== CITY EVENTS ENGINE ====================
// Autonomous event system that makes Pump Town feel alive
// Runs server-side on timers - no user input needed

// ---- CITY STATE TRACKING ----
let cityEngine = {
  mayorApproval: 65,
  chaosLevel: 20,
  crimeWave: false,
  goldenAge: false,
  currentMayor: 'Mayor Satoshi McPump',
  mayorTerm: 1,
  electionActive: false,
  lastEventTime: 0,
  lastAutoVote: 0,
  lastCrimeTime: 0,
  lastMayorAction: 0,
  eventCount: 0
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(pct) { return Math.random() * 100 < pct; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const NPC_CITIZENS = [
  'alpha_hunter', 'ser_pump', 'moon_chaser', 'degen_mike', 'diamond_dan',
  'based_andy', 'yield_farm3r', 'anon_whale', 'fomo_fred', 'paper_pete',
  'early_ape', 'bag_secured', 'sol_maxi', 'eth_bull', 'swap_king99',
  'rugged_randy', 'chad_pumper', 'wojak_bill', 'apu_trader', 'ser_copium',
  'moonboy_max', 'dr_leverage', 'whale_watcher', 'nft_nancy', 'gas_fee_gary'
];

const NPC_AGENTS = [
  'Officer McBlock', 'Detective Chain', 'Judge HashRate', 'DA CryptoKnight',
  'Public Defender Satoshi', 'Reporter TokenTimes', 'Whale_Alert_Bot'
];

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
    
    // NPC CHAT
    if (chance(30)) {
      const npc = pick(NPC_CITIZENS);
      const msgs = [`just aped into $${pick(['DOGE','SOL','PEPE','WIF','BONK'])}... LFG! 🚀`, 'anyone else seeing these charts?? 👀📈', `the mayor is ${cityEngine.mayorApproval>50?'actually based ngl':'kinda sus lately'} 🤔`, 'gm frens! another day in Pump Town ☀️', 'just got my daily hopium 💊', 'who wants to hit the casino? 🎰', `security is ${cityStats.security>50?'pretty good':'terrible! where are the police?!'} 🚔`, 'WAGMI 💎🙌', `economy is ${cityStats.economy>60?'pumping!':cityStats.economy<40?'dumping...':'mid'} 📊`, 'lmao the courthouse is wild today ⚖️😂', 'just lost everything in slots... again 🎰😭', 'diamond hands checking in 💎🙌', `${cityEngine.currentMayor} for president tbh 🗳️`];
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(msgs)]);
    }
  } catch (err) { console.error('City engine error:', err.message); }
}

// City engine status endpoint
app.get('/api/city-engine/status', async (req, res) => {
  const cityStats = await getCityStats();
  res.json({ success: true, engine: { mayorApproval: cityEngine.mayorApproval, chaosLevel: cityEngine.chaosLevel, currentMayor: cityEngine.currentMayor, mayorTerm: cityEngine.mayorTerm, electionActive: cityEngine.electionActive, eventCount: cityEngine.eventCount, cityStats } });
});

// Force trigger event (for testing)
app.post('/api/city-engine/trigger', async (req, res) => {
  const { eventType } = req.body;
  if (eventType === 'crime') { await generateCrime(pick(['rug_pull','pump_dump','scamming','tax_evasion'])); return res.json({ success: true, message: 'Crime triggered!' }); }
  if (eventType === 'coup') { cityEngine.mayorApproval = 15; await checkForCoup(); return res.json({ success: true, message: 'Coup triggered!' }); }
  cityEngine.lastEventTime = 0; await cityEventLoop();
  res.json({ success: true, message: 'Event triggered!', chaosLevel: cityEngine.chaosLevel, approval: cityEngine.mayorApproval });
});

// START ENGINE
const CITY_ENGINE_INTERVAL = 60000;
setInterval(cityEventLoop, CITY_ENGINE_INTERVAL);
setTimeout(() => { console.log('🌆 City Events Engine STARTED!'); cityEventLoop(); }, 10000);
setInterval(async () => { try { if (getTimeRemaining() < 60000) { await autoResolveVote(); setTimeout(autoGenerateVote, 65000); } } catch(e){} }, 60000);
console.log('🌆 City Events Engine loaded');

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
