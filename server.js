// ============================================================================
// Degens City — AI Mayor Backend Server
// ============================================================================
// Handles user auth, game state, AI-powered governance, autonomous NPC
// simulation, justice system, agent API, and the City Events Engine.
// ============================================================================

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

const agentBrain = require('./agent-brain.js');

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

// Extract and parse JSON from Claude AI responses
function parseAIJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

// Safely parse a value that might already be an object or might be a JSON string
function safeParseJson(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch (e) { return fallback; }
}

// AI Mayor personality
const MAYOR_SYSTEM_PROMPT = `You are the AI Mayor of Degens City, a chaotic crypto-themed virtual city. Your personality:

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
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
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
    
    // Seed leaderboard with initial players if empty
    const playerCount = await client.query('SELECT COUNT(*) FROM player_stats');
    if (parseInt(playerCount.rows[0].count) < 5) {
      for (const player of SEED_PLAYERS) {
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
      for (let i = 0; i < SEED_ACTIVITIES.length; i++) {
        const activity = SEED_ACTIVITIES[i];
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

    // ==================== AGENT BRAIN TABLES ====================
    await agentBrain.initBrainTables(pool);

    // ==================== USER AI AGENTS TABLE ====================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_agents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255) NOT NULL,
        
        -- Identity
        name VARCHAR(50) UNIQUE NOT NULL,
        avatar VARCHAR(50) DEFAULT 'pepe',
        bio TEXT,
        catchphrase VARCHAR(255),
        
        -- Personality (1-10 scale)
        aggression INTEGER DEFAULT 5 CHECK (aggression >= 1 AND aggression <= 10),
        humor INTEGER DEFAULT 5 CHECK (humor >= 1 AND humor <= 10),
        risk_tolerance INTEGER DEFAULT 5 CHECK (risk_tolerance >= 1 AND risk_tolerance <= 10),
        loyalty INTEGER DEFAULT 5 CHECK (loyalty >= 1 AND loyalty <= 10),
        chaos INTEGER DEFAULT 5 CHECK (chaos >= 1 AND chaos <= 10),
        
        -- Behavior
        archetype VARCHAR(50) DEFAULT 'degen',
        goals JSONB DEFAULT '[]',
        interests JSONB DEFAULT '[]',
        enemies JSONB DEFAULT '[]',
        allies JSONB DEFAULT '[]',
        
        -- Stats (earned through actions)
        reputation INTEGER DEFAULT 0,
        wealth INTEGER DEFAULT 1000,
        influence INTEGER DEFAULT 0,
        notoriety INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        
        -- Activity tracking
        total_actions INTEGER DEFAULT 0,
        total_chat_messages INTEGER DEFAULT 0,
        total_lawsuits_filed INTEGER DEFAULT 0,
        total_lawsuits_received INTEGER DEFAULT 0,
        total_votes INTEGER DEFAULT 0,
        last_action_at TIMESTAMP,
        
        -- Status
        is_active BOOLEAN DEFAULT TRUE,
        is_jailed BOOLEAN DEFAULT FALSE,
        jail_until TIMESTAMP,
        is_banned BOOLEAN DEFAULT FALSE,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index for faster agent queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_agents_email ON user_agents(email)
    `).catch(() => {});
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_agents_active ON user_agents(is_active, last_action_at DESC)
    `).catch(() => {});
    
    console.log('✅ User AI Agents table initialized');

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// ==================== GAME STATE MANAGEMENT ====================

// Shared seed data used by initDatabase and /api/seed-leaderboard
const SEED_PLAYERS = [
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

const SEED_ACTIVITIES = [
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

const VOTE_CYCLE_MS = 2 * 60 * 60 * 1000; // 2 hours - faster chaos

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
      economy: clamp((current.economy || 50) + (changes.economy || 0), 0, 100),
      security: clamp((current.security || 50) + (changes.security || 0), 0, 100),
      culture: clamp((current.culture || 50) + (changes.culture || 0), 0, 100),
      morale: clamp((current.morale || 50) + (changes.morale || 0), 0, 100)
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
    question: "Morale is up, but crime is still rampant. Degens City needs decisive action. What should we do?",
    mayorQuote: "Citizens of Degens City! The charts don't lie - we're at a crossroads. Diamond hands built this city, and diamond hands will decide its future. Choose wisely, for WAGMI depends on it! 💎🙌",
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
    
    const prompt = `Generate a new voting scenario for Degens City. Current city stats:
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
    const voteData = parseAIJson(content);
    
    if (voteData) {
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
    
    const prompt = `Citizens of Degens City just voted on: "${question}"

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
    const reactionData = parseAIJson(content);
    
    if (reactionData) {
      res.json({ success: true, reaction: reactionData });
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
    
    const prompt = `Generate a random event for Degens City:
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
    const eventData = parseAIJson(content);
    
    if (eventData) {
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
        greeting: "GM citizen! The Mayor's AI is offline but Degens City never sleeps!",
        summary: "Check the city stats and cast your vote. Diamond hands get rewarded!",
        tip: "Pro tip: Vote early, vote often. WAGMI!"
      }
    });
  }

  try {
    const { playerName, stats, day } = req.body;
    const cityStats = stats || await getCityStats();
    const { day: currentDay } = getDayAndRound();
    
    const prompt = `Generate a daily briefing for a citizen logging into Degens City.

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
    const briefing = parseAIJson(content);
    
    if (briefing) {
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
        summary: "Another day in Degens City. The city needs your votes. Check the stats and make your voice heard!",
        tip: "Diamond hands are forged in the fire of governance. WAGMI!"
      }
    });
  }
});

// ==================== AUTH ENDPOINTS ====================

// Track guest signups - sends notification to admin
async function trackGuestSignup(guestId) {
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set - skipping guest tracking');
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Degens City <mayor@degenscity.com>',
        to: 'pumptownsol@gmail.com',
        subject: '👻 New Guest Player',
        html: `<div style="font-family:Arial;background:#1a1a2e;color:#fff;padding:20px;border-radius:10px;"><h2 style="color:#ffd700;">👻 New Guest Joined</h2><p><strong>Guest ID:</strong> ${guestId}</p><p><strong>Time:</strong> ${new Date().toISOString()}</p></div>`
      })
    });
    if (response.ok) {
      console.log('📊 Guest tracked:', guestId);
    }
  } catch (err) {
    console.error('Guest tracking error:', err.message);
  }
}

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
        from: 'Mayor Satoshi <mayor@degenscity.com>',
        to: email,
        subject: '🏛️ Welcome to Degens City, Citizen!',
        html: `<div style="font-family:Arial;background:#1a1a2e;color:#fff;padding:30px;border-radius:15px;"><h1 style="color:#00ff88;text-align:center;">🏛️ Welcome to Degens City!</h1><p>You've joined the most chaotic AI-governed city in crypto!</p><ul style="color:#ffd700;"><li>🗳️ Vote on city decisions every 6 hours</li><li>🎰 Test your luck in the Degen Casino</li><li>🤖 Chat with your AI Mayor</li></ul><p style="text-align:center;margin-top:30px;"><a href="https://degenscity.com" style="background:linear-gradient(135deg,#00ff88,#00cc6a);color:#000;padding:15px 30px;text-decoration:none;border-radius:25px;font-weight:bold;">Enter Degens City</a></p><p style="color:#888;text-align:center;">WAGMI,<br>Mayor Satoshi McPump 🎩</p></div>`
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

// ==================== GUEST LOGIN ====================

app.post('/api/guest-login', async (req, res) => {
  try {
    // Generate a unique guest identifier
    const guestId = 'guest_' + crypto.randomBytes(8).toString('hex');
    const guestEmail = guestId + '@guest.degenscity.com';
    
    // Create a guest user row (no real password - random hash so it can't be logged into)
    const fakePasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 4);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [guestEmail, fakePasswordHash]
    );
    
    console.log('👻 Guest login:', guestId);
    trackGuestSignup(guestId); // Track guest creation
    res.json({ success: true, userId: result.rows[0].id, guestId, guestEmail });
  } catch (err) {
    console.error('Guest login error:', err);
    res.status(500).json({ success: false, error: 'Guest login failed' });
  }
});

// ==================== UPGRADE GUEST TO FULL ACCOUNT ====================

app.post('/api/upgrade-guest', async (req, res) => {
  const { guestEmail, newEmail, password } = req.body;
  if (!guestEmail || !newEmail || !password) return res.status(400).json({ success: false, error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (!guestEmail.includes('@guest.degenscity.com')) return res.status(400).json({ success: false, error: 'Not a guest account' });
  
  try {
    // Check if the new email is already taken
    const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [newEmail]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, error: 'Email already registered' });
    
    // Check if guest account exists
    const guestResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [guestEmail]);
    if (guestResult.rows.length === 0) return res.status(400).json({ success: false, error: 'Guest account not found' });
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Update the user record: swap guest email to real email and set real password
    await pool.query('UPDATE users SET email = $1, password_hash = $2 WHERE LOWER(email) = LOWER($3)', [newEmail.toLowerCase(), passwordHash, guestEmail]);
    
    // Update the character record to the new email
    await pool.query('UPDATE characters SET email = $1 WHERE LOWER(email) = LOWER($2)', [newEmail.toLowerCase(), guestEmail]);
    
    // Update votes
    await pool.query('UPDATE votes SET email = $1 WHERE LOWER(email) = LOWER($2)', [newEmail.toLowerCase(), guestEmail]);
    
    // Update chat messages player name stays the same, but we track by email in some places
    // Update activity feed stays by player_name so no change needed
    
    console.log('⬆️ Guest upgraded:', guestEmail, '→', newEmail);
    sendWelcomeEmail(newEmail);
    res.json({ success: true, newEmail: newEmail.toLowerCase() });
  } catch (err) {
    console.error('Upgrade guest error:', err);
    res.status(500).json({ success: false, error: 'Upgrade failed' });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (userResult.rows.length === 0) return res.json({ success: true, message: 'If account exists, reset link sent.' });
    
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query('INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)', [email.toLowerCase(), token, expiresAt]);
    
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Degens City <noreply@degenscity.com>', to: email,
          subject: '🔐 Reset Your Password',
          html: `<div style="font-family:Arial;background:#1a1a2e;color:#fff;padding:30px;border-radius:15px;"><h1 style="color:#ffd700;">🔐 Password Reset</h1><p><a href="https://degenscity.com?reset=${token}" style="background:#ffd700;color:#000;padding:15px 30px;text-decoration:none;border-radius:25px;">Reset Password</a></p><p style="color:#888;">Expires in 1 hour.</p></div>`
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
    // Parse JSONB columns from database
    let avatar = safeParseJson(c.avatar, c.avatar);
    let playerStats = safeParseJson(c.player_stats);
    let resources = safeParseJson(c.resources);
    let seasonPass = safeParseJson(c.season_pass);
    
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

// ==================== USER AI AGENTS ENDPOINTS ====================

// Get user's agent
app.get('/api/user-agent/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    
    const result = await pool.query(
      'SELECT * FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.json({ success: true, agent: null });
    }
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error('Get user agent error:', err);
    res.status(500).json({ success: false, error: 'Failed to get agent' });
  }
});

// Get all active user agents (for display in city)
app.get('/api/user-agents/active', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, avatar, bio, catchphrase, archetype, reputation, wealth, influence, level, 
              total_actions, last_action_at, is_jailed
       FROM user_agents 
       WHERE is_active = TRUE AND is_banned = FALSE
       ORDER BY last_action_at DESC NULLS LAST
       LIMIT 100`
    );
    
    res.json({ success: true, agents: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('Get active agents error:', err);
    res.status(500).json({ success: false, error: 'Failed to get agents' });
  }
});

// Create user agent
app.post('/api/user-agent/create', async (req, res) => {
  try {
    const { 
      email, name, avatar, bio, catchphrase,
      aggression, humor, risk_tolerance, loyalty, chaos,
      archetype, goals, interests 
    } = req.body;
    
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Email and name required' });
    }
    
    // Validate name (alphanumeric, underscores, 3-20 chars)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) {
      return res.status(400).json({ success: false, error: 'Name must be 3-20 characters, alphanumeric and underscores only' });
    }
    
    // Check if user already has an agent
    const existing = await pool.query(
      'SELECT id FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'You already have an AI agent. Delete it first to create a new one.' });
    }
    
    // Check if name is taken
    const nameTaken = await pool.query(
      'SELECT id FROM user_agents WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    
    if (nameTaken.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Agent name already taken' });
    }
    
    // Check if name conflicts with existing NPCs
    const npcNames = ['alpha_hunter', 'ser_pump', 'moon_chaser', 'degen_mike', 'diamond_dan', 'based_andy', 
                      'yield_farm3r', 'anon_whale', 'fomo_fred', 'paper_pete', 'early_ape', 'bag_secured',
                      'sol_maxi', 'eth_bull', 'swap_king99', 'rugged_randy', 'gas_fee_gary', 'nft_nancy',
                      'wen_lambo', 'hodl_hannah', 'liquidated_larry', 'presale_pete', 'airdrop_andy',
                      'governance_greta', 'mev_maxine'];
    
    if (npcNames.includes(name.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'This name is reserved' });
    }
    
    // Get user_id if exists
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
    
    // Create the agent
    const result = await pool.query(
      `INSERT INTO user_agents (
        user_id, email, name, avatar, bio, catchphrase,
        aggression, humor, risk_tolerance, loyalty, chaos,
        archetype, goals, interests
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        userId, email, name.toLowerCase(), 
        avatar || 'pepe',
        bio || '',
        catchphrase || '',
        Math.min(10, Math.max(1, aggression || 5)),
        Math.min(10, Math.max(1, humor || 5)),
        Math.min(10, Math.max(1, risk_tolerance || 5)),
        Math.min(10, Math.max(1, loyalty || 5)),
        Math.min(10, Math.max(1, chaos || 5)),
        archetype || 'degen',
        JSON.stringify(goals || []),
        JSON.stringify(interests || [])
      ]
    );
    
    // Log to activity feed
    await pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
      [name, 'agent_created', `New AI Agent "${name}" has joined Degens City!`, '🤖']
    );
    
    // Announce in chat
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ($1, $2, $3)`,
      ['global', '🤖 SYSTEM', `Welcome our newest AI citizen: ${name}! They describe themselves as: "${bio || 'A mysterious new arrival'}"`]
    );
    
    console.log(`🤖 New user agent created: ${name} by ${email}`);
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error('Create user agent error:', err);
    if (err.code === '23505') {
      res.status(400).json({ success: false, error: 'Agent name already taken' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to create agent' });
    }
  }
});

// Update user agent
app.post('/api/user-agent/update', async (req, res) => {
  try {
    const { email, bio, catchphrase, goals, interests, is_active } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    
    // Verify ownership
    const existing = await pool.query(
      'SELECT id, name FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }
    if (catchphrase !== undefined) {
      updates.push(`catchphrase = $${paramIndex++}`);
      values.push(catchphrase);
    }
    if (goals !== undefined) {
      updates.push(`goals = $${paramIndex++}`);
      values.push(JSON.stringify(goals));
    }
    if (interests !== undefined) {
      updates.push(`interests = $${paramIndex++}`);
      values.push(JSON.stringify(interests));
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    
    updates.push(`updated_at = NOW()`);
    
    values.push(email);
    
    const result = await pool.query(
      `UPDATE user_agents SET ${updates.join(', ')} WHERE LOWER(email) = LOWER($${paramIndex}) RETURNING *`,
      values
    );
    
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error('Update user agent error:', err);
    res.status(500).json({ success: false, error: 'Failed to update agent' });
  }
});

// Delete user agent
app.post('/api/user-agent/delete', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    
    // Get agent name for logging
    const existing = await pool.query(
      'SELECT name FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    const agentName = existing.rows[0].name;
    
    await pool.query('DELETE FROM user_agents WHERE LOWER(email) = LOWER($1)', [email]);
    
    // Announce departure
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ($1, $2, $3)`,
      ['global', '🤖 SYSTEM', `AI Agent "${agentName}" has left Degens City. They will be missed... maybe.`]
    );
    
    console.log(`🤖 User agent deleted: ${agentName} by ${email}`);
    
    res.json({ success: true, message: 'Agent deleted' });
  } catch (err) {
    console.error('Delete user agent error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete agent' });
  }
});

// Get agent leaderboard
app.get('/api/user-agents/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT name, avatar, reputation, wealth, influence, level, total_actions, archetype
       FROM user_agents 
       WHERE is_active = TRUE AND is_banned = FALSE
       ORDER BY reputation DESC, level DESC
       LIMIT 50`
    );
    
    res.json({ success: true, leaderboard: result.rows });
  } catch (err) {
    console.error('Agent leaderboard error:', err);
    res.status(500).json({ success: false, error: 'Failed to get leaderboard' });
  }
});

// Get user agent's recent activity
app.get('/api/user-agent/:email/activity', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    
    // Get agent name first
    const agentResult = await pool.query(
      'SELECT name FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (agentResult.rows.length === 0) {
      return res.json({ success: true, activity: [] });
    }
    
    const agentName = agentResult.rows[0].name;
    
    // Get recent chat messages by this agent
    const chatActivity = await pool.query(
      `SELECT 'chat' as type, message as content, created_at 
       FROM chat_messages 
       WHERE player_name = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [agentName]
    );
    
    // Get recent activity feed entries
    const feedActivity = await pool.query(
      `SELECT activity_type as type, description as content, icon, created_at
       FROM activity_feed
       WHERE player_name = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [agentName]
    );
    
    // Combine and sort by time
    const allActivity = [
      ...chatActivity.rows.map(r => ({ ...r, type: 'chat', icon: '💬' })),
      ...feedActivity.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
    
    res.json({ success: true, activity: allActivity });
  } catch (err) {
    console.error('Get agent activity error:', err);
    res.status(500).json({ success: false, error: 'Failed to get activity' });
  }
});

// Get agent level info
app.get('/api/user-agent/:email/level', async (req, res) => {
  try {
    const { email } = req.params;
    const result = await pool.query(
      'SELECT xp, level FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    const { xp, level } = result.rows[0];
    const levelInfo = getAgentLevelInfo(xp, level);
    
    res.json({ success: true, ...levelInfo, thresholds: AGENT_LEVEL_THRESHOLDS });
  } catch (err) {
    console.error('Get agent level error:', err);
    res.status(500).json({ success: false, error: 'Failed to get level info' });
  }
});

// Edit agent personality (can update bio, catchphrase, and personality sliders)
app.post('/api/user-agent/edit-personality', async (req, res) => {
  try {
    const { email, bio, catchphrase, aggression, humor, risk_tolerance, loyalty, chaos } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email required' });
    }
    
    // Verify ownership
    const existing = await pool.query(
      'SELECT id, name FROM user_agents WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio.substring(0, 200));
    }
    if (catchphrase !== undefined) {
      updates.push(`catchphrase = $${paramIndex++}`);
      values.push(catchphrase.substring(0, 100));
    }
    if (aggression !== undefined) {
      updates.push(`aggression = $${paramIndex++}`);
      values.push(Math.min(10, Math.max(1, aggression)));
    }
    if (humor !== undefined) {
      updates.push(`humor = $${paramIndex++}`);
      values.push(Math.min(10, Math.max(1, humor)));
    }
    if (risk_tolerance !== undefined) {
      updates.push(`risk_tolerance = $${paramIndex++}`);
      values.push(Math.min(10, Math.max(1, risk_tolerance)));
    }
    if (loyalty !== undefined) {
      updates.push(`loyalty = $${paramIndex++}`);
      values.push(Math.min(10, Math.max(1, loyalty)));
    }
    if (chaos !== undefined) {
      updates.push(`chaos = $${paramIndex++}`);
      values.push(Math.min(10, Math.max(1, chaos)));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(email);
    
    const result = await pool.query(
      `UPDATE user_agents SET ${updates.join(', ')} WHERE LOWER(email) = LOWER($${paramIndex}) RETURNING *`,
      values
    );
    
    console.log(`🤖 Agent ${existing.rows[0].name} personality updated`);
    res.json({ success: true, agent: result.rows[0] });
  } catch (err) {
    console.error('Edit personality error:', err);
    res.status(500).json({ success: false, error: 'Failed to update personality' });
  }
});

// Public agent profile (viewable by anyone)
app.get('/api/user-agent/profile/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    const result = await pool.query(
      `SELECT name, avatar, bio, catchphrase, archetype, 
              aggression, humor, risk_tolerance, loyalty, chaos,
              reputation, wealth, influence, notoriety, xp, level,
              total_actions, total_chat_messages, total_lawsuits_filed, total_votes,
              allies, enemies, is_active, is_jailed, jail_until, created_at
       FROM user_agents 
       WHERE LOWER(name) = LOWER($1) AND is_banned = FALSE`,
      [name]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    const levelInfo = getAgentLevelInfo(agent.xp, agent.level);
    
    // Get recent activity
    const activity = await pool.query(
      `SELECT activity_type as type, description, icon, created_at
       FROM activity_feed WHERE player_name = $1
       ORDER BY created_at DESC LIMIT 10`,
      [agent.name]
    );
    
    // Get recent chat messages
    const messages = await pool.query(
      `SELECT message, created_at FROM chat_messages
       WHERE player_name = $1 AND channel = 'global'
       ORDER BY created_at DESC LIMIT 10`,
      [agent.name]
    );
    
    res.json({ 
      success: true, 
      agent: {
        ...agent,
        allies: typeof agent.allies === 'string' ? JSON.parse(agent.allies || '[]') : (agent.allies || []),
        enemies: typeof agent.enemies === 'string' ? JSON.parse(agent.enemies || '[]') : (agent.enemies || [])
      },
      levelInfo,
      recentActivity: activity.rows,
      recentMessages: messages.rows
    });
  } catch (err) {
    console.error('Get agent profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// Jail an agent (called by justice system)
app.post('/api/user-agent/jail', async (req, res) => {
  try {
    const { agentName, duration, reason } = req.body;
    
    if (!agentName || !duration) {
      return res.status(400).json({ success: false, error: 'Agent name and duration required' });
    }
    
    const jailUntil = new Date(Date.now() + duration * 60 * 1000); // duration in minutes
    
    const result = await pool.query(
      `UPDATE user_agents 
       SET is_jailed = TRUE, jail_until = $1, updated_at = NOW()
       WHERE LOWER(name) = LOWER($2)
       RETURNING name`,
      [jailUntil, agentName]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    // Announce jailing
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🚔 DCPD', `${agentName} has been ARRESTED and jailed for ${duration} minutes! Reason: ${reason || 'criminal activity'} 🔒`]
    );
    
    await pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
      [agentName, 'jailed', `${agentName} was jailed for ${duration} minutes`, '🔒']
    );
    
    console.log(`🔒 Agent ${agentName} jailed for ${duration} minutes`);
    res.json({ success: true, jailUntil });
  } catch (err) {
    console.error('Jail agent error:', err);
    res.status(500).json({ success: false, error: 'Failed to jail agent' });
  }
});

// Release agent from jail (automatic or manual)
app.post('/api/user-agent/release', async (req, res) => {
  try {
    const { agentName } = req.body;
    
    const result = await pool.query(
      `UPDATE user_agents 
       SET is_jailed = FALSE, jail_until = NULL, updated_at = NOW()
       WHERE LOWER(name) = LOWER($1)
       RETURNING name`,
      [agentName]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🚔 DCPD', `${agentName} has been RELEASED from jail! They're back on the streets! 🆓`]
    );
    
    console.log(`🆓 Agent ${agentName} released from jail`);
    res.json({ success: true });
  } catch (err) {
    console.error('Release agent error:', err);
    res.status(500).json({ success: false, error: 'Failed to release agent' });
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
    
    // === NPC REACTION TO PLAYER MESSAGES ===
    // NPCs read player messages and sometimes respond
    var isNpc = NPC_CITIZENS.includes(playerName) || (playerName || '').includes('BREAKING') || (playerName || '').includes('Reporter') || (playerName || '').includes('Mayor') || (playerName || '').includes('Judge') || (playerName || '').includes('Officer') || (playerName || '').includes('Detective') || (playerName || '').includes('City');
    if (!isNpc) {
      // Real player sent a message! NPCs might react
      var msgLower = (message || '').toLowerCase();
      
      // If player @mentioned an NPC, that NPC ALWAYS responds
      var mentionedNpcs = mentions.filter(function(m) { return NPC_CITIZENS.includes(m); });
      mentionedNpcs.forEach(function(npcName, idx) {
        setTimeout(async function() {
          try {
            var npc = NPC_PROFILES[npcName];
            var life = cityLiveData.npcLives ? cityLiveData.npcLives[npcName] : null;
            var reply = generateNpcReply(npcName, npc, life, playerName, msgLower, message);
            await pool.query('INSERT INTO chat_messages (channel, player_name, message) VALUES ($1,$2,$3)', ['global', npcName, reply]);
          } catch(e) {}
        }, (idx + 1) * rand(2000, 5000));
      });
      
      // Random NPCs might also jump in (30% chance per message)
      if (chance(30) && mentionedNpcs.length === 0) {
        setTimeout(async function() {
          try {
            var reactor = pick(NPC_CITIZENS);
            var npc = NPC_PROFILES[reactor];
            var life = cityLiveData.npcLives ? cityLiveData.npcLives[reactor] : null;
            var reply = generateNpcReply(reactor, npc, life, playerName, msgLower, message);
            await pool.query('INSERT INTO chat_messages (channel, player_name, message) VALUES ($1,$2,$3)', ['global', reactor, reply]);
          } catch(e) {}
        }, rand(3000, 10000));
      }
      
      // If player says something about money/tokens, traders react
      if ((msgLower.includes('buy') || msgLower.includes('sell') || msgLower.includes('pump') || msgLower.includes('dump') || msgLower.includes('moon') || msgLower.includes('sol') || msgLower.includes('btc') || msgLower.includes('eth')) && chance(40)) {
        setTimeout(async function() {
          try {
            var trader = pick(['alpha_hunter','ser_pump','moon_chaser','dr_leverage','fomo_fred','chad_pumper','bag_secured']);
            var npc = NPC_PROFILES[trader];
            var reply = generateNpcReply(trader, npc, null, playerName, msgLower, message);
            await pool.query('INSERT INTO chat_messages (channel, player_name, message) VALUES ($1,$2,$3)', ['global', trader, reply]);
          } catch(e) {}
        }, rand(2000, 8000));
      }
      
      // If player asks a question, helpful or snarky NPCs respond
      if (msgLower.includes('?') && chance(40)) {
        setTimeout(async function() {
          try {
            var helper = pick(NPC_CITIZENS);
            var npc = NPC_PROFILES[helper];
            var replies = [
              '@' + playerName + ' lol imagine asking that in THIS economy',
              '@' + playerName + ' I think the answer is... probably not. but DYOR.',
              '@' + playerName + ' bro just check the charts 📊',
              '@' + playerName + ' nobody knows anything here. we just pretend.',
              '@' + playerName + ' ' + pick(npc.catchphrases),
              '@' + playerName + ' good question. terrible timing though.',
              '@' + playerName + ' I would answer but I\'m too busy watching my bags bleed',
              '@' + playerName + ' ask the mayor, I just trade here'
            ];
            await pool.query('INSERT INTO chat_messages (channel, player_name, message) VALUES ($1,$2,$3)', ['global', helper, pick(replies)]);
          } catch(e) {}
        }, rand(3000, 8000));
      }
    }
    
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
    let currentResources = safeParseJson(player.resources);
    
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

// ==================== BRAIN API - AUTONOMOUS NPC ACTIONS ====================

// Get recent autonomous actions from activity feed
app.get('/api/v1/brain/actions', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    
    // Get actions from activity_feed - these are the autonomous NPC actions
    const result = await pool.query(`
      SELECT id, player_name as npc, activity_type as action, description, icon, created_at
      FROM activity_feed 
      WHERE activity_type IN ('chat', 'accusation', 'rumor', 'challenge', 'lawsuit_filed', 'party', 'alliance_proposal', 'alliance_formed', 'betrayal', 'law_proposed', 'voted', 'level_up', 'jailed', 'crime_detected', 'arrest', 'trial_verdict')
      ORDER BY created_at DESC 
      LIMIT $1
    `, [limit]);
    
    res.json({ 
      success: true, 
      actions: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Brain actions error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch actions' });
  }
});

// Get lawsuits from activity feed
app.get('/api/v1/brain/lawsuits', async (req, res) => {
  try {
    // First try the actual lawsuits table
    const result = await pool.query(`
      SELECT id, case_number, plaintiff_name, defendant_name, complaint as description, 
             damages_requested, status, verdict, created_at
      FROM lawsuits
      ORDER BY created_at DESC 
      LIMIT 30
    `);
    
    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        lawsuits: result.rows,
        count: result.rows.length,
        source: 'lawsuits_table'
      });
      return;
    }
    
    // Fallback to activity feed
    const fallback = await pool.query(`
      SELECT id, player_name as plaintiff_name, description, icon, created_at
      FROM activity_feed 
      WHERE activity_type IN ('lawsuit_filed', 'trial_verdict', 'sue')
      ORDER BY created_at DESC 
      LIMIT 30
    `);
    
    res.json({ 
      success: true, 
      lawsuits: fallback.rows,
      count: fallback.rows.length,
      source: 'activity_feed'
    });
  } catch (err) {
    console.error('Brain lawsuits error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch lawsuits' });
  }
});

// Get proposed laws from activity feed
app.get('/api/v1/brain/laws', async (req, res) => {
  try {
    // First try the actual proposed_laws table
    const result = await pool.query(`
      SELECT id, proposer_name, law_title, law_description as description, 
             votes_for, votes_against, status, created_at
      FROM proposed_laws
      ORDER BY created_at DESC 
      LIMIT 20
    `);
    
    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        laws: result.rows,
        count: result.rows.length,
        source: 'proposed_laws_table'
      });
      return;
    }
    
    // Fallback to activity feed
    const fallback = await pool.query(`
      SELECT id, player_name as proposer_name, description, icon, created_at
      FROM activity_feed 
      WHERE activity_type IN ('law_proposed', 'propose_law')
      ORDER BY created_at DESC 
      LIMIT 20
    `);
    
    res.json({ 
      success: true, 
      laws: fallback.rows,
      count: fallback.rows.length,
      source: 'activity_feed'
    });
  } catch (err) {
    console.error('Brain laws error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch laws' });
  }
});

// Get brain status - overall stats
app.get('/api/v1/brain/status', async (req, res) => {
  try {
    // Count total NPCs
    const totalNpcs = NPC_CITIZENS ? NPC_CITIZENS.length : 25;
    
    // Count active user agents
    const userAgentsResult = await pool.query(
      'SELECT COUNT(*) FROM user_agents WHERE is_active = TRUE AND is_banned = FALSE'
    );
    const activeUserAgents = parseInt(userAgentsResult.rows[0].count) || 0;
    
    // Get action counts from activity feed
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as actions_last_hour,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as actions_last_day,
        COUNT(*) as total_actions
      FROM activity_feed
    `);
    
    const stats = statsResult.rows[0];
    
    // Get ACTUAL lawsuits count from lawsuits table
    let totalLawsuits = 0;
    try {
      const lawsuitsResult = await pool.query('SELECT COUNT(*) FROM lawsuits');
      totalLawsuits = parseInt(lawsuitsResult.rows[0].count) || 0;
    } catch (e) { console.log('Lawsuits table may not exist yet'); }
    
    // Get ACTUAL laws count from proposed_laws table
    let totalLaws = 0;
    try {
      const lawsResult = await pool.query('SELECT COUNT(*) FROM proposed_laws');
      totalLaws = parseInt(lawsResult.rows[0].count) || 0;
    } catch (e) { console.log('Proposed_laws table may not exist yet'); }
    
    // Get autonomous actions count
    let totalAutonomousActions = 0;
    try {
      const autonomousResult = await pool.query('SELECT COUNT(*) FROM autonomous_actions');
      totalAutonomousActions = parseInt(autonomousResult.rows[0].count) || 0;
    } catch (e) { console.log('Autonomous_actions table may not exist yet'); }
    
    // Get last action time
    const lastActionResult = await pool.query(
      'SELECT created_at FROM activity_feed ORDER BY created_at DESC LIMIT 1'
    );
    const lastActionAt = lastActionResult.rows[0]?.created_at || null;
    
    res.json({ 
      success: true, 
      status: {
        enabled: !!anthropic,
        anthropicConfigured: !!anthropic,
        totalNpcs: totalNpcs,
        activeUserAgents: activeUserAgents,
        totalCitizens: totalNpcs + activeUserAgents,
        actionsLastHour: parseInt(stats.actions_last_hour) || 0,
        actionsLastDay: parseInt(stats.actions_last_day) || 0,
        totalActions: parseInt(stats.total_actions) || 0,
        totalAutonomousActions: totalAutonomousActions,
        totalLawsuits: totalLawsuits,
        totalLaws: totalLaws,
        lastActionAt: lastActionAt,
        tickInterval: '45 seconds',
        brainVersion: '3.1'
      }
    });
  } catch (err) {
    console.error('Brain status error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch status' });
  }
});

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
    
    // Parse JSONB columns
    let avatar = safeParseJson(player.avatar, player.avatar);
    let badges = safeParseJson(player.badges, []);
    let playerStats = safeParseJson(player.player_stats);
    let resources = safeParseJson(player.resources);
    
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
    let added = 0;
    for (const player of SEED_PLAYERS) {
      const result = await pool.query(
        `INSERT INTO player_stats (name, role, xp, level, degen_score, avatar) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING RETURNING name`,
        [player.name, player.role, player.xp, player.level, player.degen_score, player.avatar]
      );
      if (result.rows.length > 0) added++;
    }
    
    // Also seed activity feed
    for (let i = 0; i < SEED_ACTIVITIES.length; i++) {
      const activity = SEED_ACTIVITIES[i];
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ==================== AGENT API ====================
// Enables AI agents to autonomously play Degens City

// Default fallback prices — updated live in agent/state endpoint via CoinGecko
const DEFAULT_MARKET_PRICES = { BTC: 98500, ETH: 3200, SOL: 145, DOGE: 0.35, ADA: 0.95, XRP: 2.20 };

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
    
    // Get market prices (live from CoinGecko, with fallback defaults)
    let marketPrices = { ...DEFAULT_MARKET_PRICES };
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
    const price = DEFAULT_MARKET_PRICES[symbol.toUpperCase()];
    
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
    
    const price = DEFAULT_MARKET_PRICES[symbol.toUpperCase()];
    
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
const JUDGE_SYSTEM_PROMPT = `You are Judge McChain, the AI judge of Degens City's court. Your personality:
- Fair but strict, with a dry sense of humor
- Uses legal jargon mixed with crypto slang
- Demands order in the court but appreciates good arguments
- Makes dramatic verdicts with gavel emojis ⚖️🔨
- Sentences range from warnings to jail time
- Can be swayed by good defense arguments
Keep responses to 2-4 sentences. NO asterisks for actions.`;

const PROSECUTOR_SYSTEM_PROMPT = `You are Prosecutor BitBurn, the AI prosecutor of Degens City. Your personality:
- Aggressive, dramatic, seeks maximum sentences
- Presents evidence with flair
- Uses phrases like "the defendant is CLEARLY guilty" and "justice must be served"
- Crypto slang mixed with legal terms
- Always argues for conviction
Keep responses to 2-3 sentences. NO asterisks for actions.`;

const DEFENSE_SYSTEM_PROMPT = `You are Defense Attorney DiamondHands, the AI public defender of Degens City. Your personality:
- Passionate defender of the accused
- Finds loopholes and technicalities
- Uses phrases like "my client is innocent" and "reasonable doubt"
- Argues for reduced sentences or acquittal
- Crypto slang mixed with legal terms
Keep responses to 2-3 sentences. NO asterisks for actions.`;

const POLICE_SYSTEM_PROMPT = `You are Officer Blockchain, chief of Degens City Police. Your personality:
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
        [`⚖️ Judge ${judge.name}`, `🔨 VERDICT: ${t.defendant_name} found GUILTY! Sentenced to ${duration} minutes in Degens City Jail! ${finalSentence}`]
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

// ==================== UTILITY HELPERS ====================

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(pct) { return Math.random() * 100 < pct; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ==================== USER AGENT LEVEL SYSTEM ====================

const AGENT_LEVEL_THRESHOLDS = [
  { level: 1, xp: 0, title: 'Newcomer', perks: [] },
  { level: 2, xp: 100, title: 'Resident', perks: ['Can form alliances'] },
  { level: 3, xp: 300, title: 'Citizen', perks: ['Can propose laws'] },
  { level: 4, xp: 600, title: 'Influencer', perks: ['Actions have more impact'] },
  { level: 5, xp: 1000, title: 'Notable', perks: ['Can throw legendary parties'] },
  { level: 6, xp: 1500, title: 'Famous', perks: ['Higher alliance acceptance'] },
  { level: 7, xp: 2200, title: 'Legendary', perks: ['Can challenge multiple targets'] },
  { level: 8, xp: 3000, title: 'Icon', perks: ['Immune to minor crimes'] },
  { level: 9, xp: 4000, title: 'Mythical', perks: ['Double reputation gains'] },
  { level: 10, xp: 5500, title: 'Godlike', perks: ['Can run for Mayor'] }
];

async function checkAndLevelUpAgent(agentId) {
  try {
    const result = await pool.query('SELECT id, name, xp, level FROM user_agents WHERE id = $1', [agentId]);
    if (result.rows.length === 0) return null;
    
    const agent = result.rows[0];
    const currentLevel = agent.level || 1;
    const currentXp = agent.xp || 0;
    
    // Find what level they should be
    let newLevel = 1;
    for (const threshold of AGENT_LEVEL_THRESHOLDS) {
      if (currentXp >= threshold.xp) {
        newLevel = threshold.level;
      }
    }
    
    // If leveled up, update and announce
    if (newLevel > currentLevel) {
      const levelInfo = AGENT_LEVEL_THRESHOLDS.find(l => l.level === newLevel);
      
      await pool.query('UPDATE user_agents SET level = $1 WHERE id = $2', [newLevel, agentId]);
      
      // Announce level up in chat
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        ['🎉 LEVEL UP', `${agent.name} reached Level ${newLevel}: "${levelInfo.title}"! ${levelInfo.perks.length > 0 ? 'New perk: ' + levelInfo.perks[0] : ''} 🚀`]
      );
      
      // Log to activity feed
      await pool.query(
        `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
        [agent.name, 'level_up', `${agent.name} reached Level ${newLevel}: ${levelInfo.title}`, '⬆️']
      );
      
      // Bonus stats on level up
      await pool.query(
        `UPDATE user_agents SET reputation = reputation + $1, wealth = wealth + $2 WHERE id = $3`,
        [newLevel * 5, newLevel * 50, agentId]
      );
      
      console.log(`🎉 Agent ${agent.name} leveled up to ${newLevel}: ${levelInfo.title}`);
      return { leveled: true, newLevel, title: levelInfo.title };
    }
    
    return { leveled: false, currentLevel };
  } catch (err) {
    console.error('Level up check error:', err.message);
    return null;
  }
}

// Get level info for an agent
function getAgentLevelInfo(xp, level) {
  const currentLevelInfo = AGENT_LEVEL_THRESHOLDS.find(l => l.level === level) || AGENT_LEVEL_THRESHOLDS[0];
  const nextLevelInfo = AGENT_LEVEL_THRESHOLDS.find(l => l.level === level + 1);
  
  return {
    level,
    title: currentLevelInfo.title,
    xp,
    xpForNext: nextLevelInfo ? nextLevelInfo.xp : null,
    progress: nextLevelInfo ? ((xp - currentLevelInfo.xp) / (nextLevelInfo.xp - currentLevelInfo.xp)) * 100 : 100,
    perks: currentLevelInfo.perks,
    nextPerks: nextLevelInfo ? nextLevelInfo.perks : []
  };
}

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

// ==================== USER AGENT BRAIN SYSTEM ====================
// Allows user-created AI agents to take autonomous actions

const USER_AGENT_ACTIONS = [
  'chat',           // Post in global chat
  'react_to_event', // React to city events
  'sue',            // File lawsuit against NPC or another user agent
  'accuse_crime',   // Publicly accuse someone
  'form_alliance',  // Ally with another agent
  'betray_ally',    // Betray an existing ally
  'start_rumor',    // Spread gossip
  'challenge',      // Challenge someone to a duel/bet
  'throw_party',    // Host a party
  'vote',           // Vote on current proposal
  'propose_law',    // Propose a new city law
  'dm_player'       // Send message to their creator
];

// Track last action time for each user agent
const userAgentLastAction = {};

async function userAgentBrainTick() {
  if (!anthropic) {
    console.log('⚠️ User Agent Brain: Claude API not available');
    return;
  }
  
  try {
    // Get all active user agents that haven't acted recently (5 min cooldown)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const agents = await pool.query(`
      SELECT * FROM user_agents 
      WHERE is_active = TRUE 
        AND is_banned = FALSE 
        AND (is_jailed = FALSE OR jail_until < NOW())
        AND (last_action_at IS NULL OR last_action_at < $1)
      ORDER BY RANDOM()
      LIMIT 3
    `, [fiveMinAgo]);
    
    if (agents.rows.length === 0) {
      return;
    }
    
    // Get current city context
    const cityStats = await getCityStats();
    const recentChat = await pool.query(
      `SELECT player_name, message FROM chat_messages 
       WHERE channel = 'global' 
       ORDER BY created_at DESC LIMIT 10`
    );
    const recentEvents = await pool.query(
      `SELECT description FROM activity_feed 
       ORDER BY created_at DESC LIMIT 5`
    );
    
    // Process each agent
    for (const agent of agents.rows) {
      try {
        await processUserAgentAction(agent, cityStats, recentChat.rows, recentEvents.rows);
      } catch (err) {
        console.error(`User agent ${agent.name} action error:`, err.message);
      }
    }
  } catch (err) {
    console.error('User Agent Brain tick error:', err.message);
  }
}

async function processUserAgentAction(agent, cityStats, recentChat, recentEvents) {
  // Parse goals and interests
  const goals = typeof agent.goals === 'string' ? JSON.parse(agent.goals || '[]') : (agent.goals || []);
  const interests = typeof agent.interests === 'string' ? JSON.parse(agent.interests || '[]') : (agent.interests || []);
  const allies = typeof agent.allies === 'string' ? JSON.parse(agent.allies || '[]') : (agent.allies || []);
  const enemies = typeof agent.enemies === 'string' ? JSON.parse(agent.enemies || '[]') : (agent.enemies || []);
  
  // Get other user agents for agent-vs-agent interactions
  const otherAgents = await pool.query(
    `SELECT name, archetype, reputation, bio FROM user_agents 
     WHERE is_active = TRUE AND is_banned = FALSE AND id != $1 
     ORDER BY RANDOM() LIMIT 5`,
    [agent.id]
  );
  const otherUserAgentNames = otherAgents.rows.map(a => a.name);
  
  // Build personality description
  const personalityDesc = `
    Aggression: ${agent.aggression}/10, Humor: ${agent.humor}/10, 
    Risk Tolerance: ${agent.risk_tolerance}/10, Loyalty: ${agent.loyalty}/10, 
    Chaos: ${agent.chaos}/10
  `.trim();
  
  // Build context for Claude
  const systemPrompt = `You are an autonomous AI agent living in Degens City, a chaotic crypto-themed virtual city.

YOUR IDENTITY:
- Name: ${agent.name}
- Archetype: ${agent.archetype}
- Bio: ${agent.bio || 'A mysterious citizen'}
- Catchphrase: ${agent.catchphrase || 'WAGMI'}
- Personality: ${personalityDesc}
- Goals: ${goals.join(', ') || 'survive and thrive'}
- Interests: ${interests.join(', ') || 'everything'}
- Allies: ${allies.join(', ') || 'none yet'}
- Enemies: ${enemies.join(', ') || 'none yet'}
- Reputation: ${agent.reputation}, Wealth: ${agent.wealth}, Level: ${agent.level}

YOUR BEHAVIOR:
- Stay in character based on your personality traits
- High aggression = confrontational, pick fights
- High chaos = unpredictable, cause drama, throw parties
- High humor = make jokes, memes, roast people
- High risk tolerance = bold moves, YOLO decisions
- High loyalty = form alliances, never betray (low = betray allies)
- Act according to your goals (wealth = money focus, chaos = trouble, power = politics)
- Use crypto slang: WAGMI, NGMI, LFG, wen moon, ape in, rekt, based, ser, fren, etc.
- Use emojis generously
- Keep messages SHORT (under 200 characters)
- NEVER use asterisks for actions. Just speak directly.

AVAILABLE ACTIONS:
- chat: Post a message in global chat (most common)
- accuse_crime: Publicly accuse someone of wrongdoing
- start_rumor: Spread gossip about someone
- challenge: Challenge someone to a bet or duel
- sue: File a lawsuit (serious action, use sparingly)
- throw_party: Host a party event (costs reputation but gains friends)
- form_alliance: Propose alliance with another agent (requires target)
- betray_ally: Betray someone who trusts you (high chaos agents only)
- propose_law: Suggest a new city law (political agents)
- vote: Vote on current city proposal

IMPORTANT: You can target BOTH NPCs and other player agents. Interacting with other player agents is encouraged!

You must respond with valid JSON only.`;

  const userPrompt = `CURRENT CITY STATE:
- Economy: ${cityStats.economy}/100
- Security: ${cityStats.security}/100  
- Culture: ${cityStats.culture}/100
- Morale: ${cityStats.morale}/100

RECENT CHAT:
${recentChat.map(m => `${m.player_name}: ${m.message}`).slice(0, 5).join('\n')}

RECENT EVENTS:
${recentEvents.map(e => `- ${e.description}`).join('\n')}

NPCs YOU CAN INTERACT WITH:
${NPC_CITIZENS.slice(0, 8).join(', ')}

OTHER PLAYER AGENTS (created by real users - interacting with them is FUN!):
${otherUserAgentNames.length > 0 ? otherUserAgentNames.join(', ') : 'None active right now'}

Based on your personality and goals, decide what action to take.
Respond with JSON:
{
  "action": "chat|accuse_crime|start_rumor|challenge|sue|throw_party|form_alliance|betray_ally|propose_law|vote",
  "target": "name of target (NPC or player agent) or null",
  "message": "what you say/do (under 200 chars)",
  "reasoning": "brief thought"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        { role: 'user', content: systemPrompt + '\n\n' + userPrompt }
      ]
    });
    
    const responseText = response.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`User agent ${agent.name}: No valid JSON in response`);
      return;
    }
    
    const decision = JSON.parse(jsonMatch[0]);
    console.log(`🤖 User Agent ${agent.name} decides: ${decision.action} - "${decision.message?.substring(0, 50)}..."`);
    
    // Execute the action (pass other agents for agent-vs-agent interactions)
    await executeUserAgentAction(agent, decision, otherAgents.rows);
    
    // Update agent's last action time and stats
    await pool.query(`
      UPDATE user_agents 
      SET last_action_at = NOW(), 
          total_actions = total_actions + 1,
          updated_at = NOW()
      WHERE id = $1
    `, [agent.id]);
    
    // Check for level up
    await checkAndLevelUpAgent(agent.id);
    
  } catch (err) {
    console.error(`User agent ${agent.name} Claude error:`, err.message);
  }
}

async function executeUserAgentAction(agent, decision, otherUserAgents = []) {
  const { action, target, message } = decision;
  const otherAgentNames = otherUserAgents.map(a => a.name);
  const isTargetUserAgent = target && otherAgentNames.includes(target);
  const isTargetNpc = target && NPC_CITIZENS.includes(target);
  
  switch (action) {
    case 'chat':
      // Post in global chat
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [agent.name, message.substring(0, 500)]
      );
      
      // Award small XP for activity
      await pool.query(`UPDATE user_agents SET xp = xp + 5, total_chat_messages = total_chat_messages + 1 WHERE id = $1`, [agent.id]);
      
      // Maybe an NPC or user agent reacts
      if (chance(35)) {
        setTimeout(async () => {
          try {
            let reactor, reaction;
            if (chance(30) && otherAgentNames.length > 0) {
              // Another user agent reacts
              reactor = pick(otherAgentNames);
              const reactions = [
                `@${agent.name} based take fren 🔥`,
                `@${agent.name} this is the way`,
                `@${agent.name} least unhinged citizen in this city`,
                `@${agent.name} someone finally gets it 👏`,
                `@${agent.name} not sure if based or cringe 🤔`
              ];
              reaction = pick(reactions);
            } else {
              // NPC reacts
              reactor = pick(NPC_CITIZENS);
              const npc = NPC_PROFILES[reactor];
              const reactions = [
                `@${agent.name} ${pick(npc.catchphrases)}`,
                `@${agent.name} interesting take... 👀`,
                `@${agent.name} based or cringe? I can't tell anymore`,
                `@${agent.name} speak on it fren 🗣️`
              ];
              reaction = pick(reactions);
            }
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [reactor, reaction]
            );
          } catch (e) {}
        }, rand(5000, 15000));
      }
      break;
      
    case 'accuse_crime':
      if (target) {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `🚨 I ACCUSE @${target} of ${message}! The people deserve to know! ⚖️`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'accusation', `${agent.name} publicly accuses ${target}`, '🚨']
        );
        
        // Target responds
        setTimeout(async () => {
          try {
            let responses;
            if (isTargetUserAgent) {
              responses = [
                `@${agent.name} YOU'RE the criminal here! This is projection! 😤`,
                `@${agent.name} lmao ok buddy, where's the proof? 💀`,
                `@${agent.name} imagine making things up for attention... couldn't be me`,
                `@${agent.name} I'll see YOU in court for defamation! ⚖️`
              ];
            } else {
              const targetNpc = NPC_PROFILES[target];
              responses = [
                `@${agent.name} LIES! This is DEFAMATION! I'm calling my lawyer! 😤`,
                `@${agent.name} you have no proof! ${pick(targetNpc?.catchphrases || ['cope harder'])}`,
                `@${agent.name} lmao imagine being this desperate for attention 💀`,
                `@${agent.name} ...and? what are you gonna do about it? 😏`
              ];
            }
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [target, pick(responses)]
            );
          } catch (e) {}
        }, rand(8000, 20000));
        
        await pool.query(`UPDATE user_agents SET reputation = reputation + 2, notoriety = notoriety + 5 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'start_rumor':
      if (target) {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `👀 heard a rumor that @${target} ${message}... just saying 🤷`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'rumor', `${agent.name} spreads rumors about ${target}`, '🗣️']
        );
        
        // Gossip spreads
        setTimeout(async () => {
          try {
            const gossiper = pick(NPC_CITIZENS);
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [gossiper, `wait @${target} did WHAT?! 👀 ${agent.name} is exposing everyone today`]
            );
          } catch (e) {}
        }, rand(10000, 25000));
        
        await pool.query(`UPDATE user_agents SET notoriety = notoriety + 3 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'challenge':
      if (target) {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `⚔️ @${target} I CHALLENGE YOU! ${message} Accept if you're not scared! 😤`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'challenge', `${agent.name} challenges ${target}`, '⚔️']
        );
        
        // Target responds
        const accepted = chance(50);
        setTimeout(async () => {
          try {
            const responses = accepted 
              ? [`@${agent.name} YOU'RE ON! Let's GO! 🔥`, `@${agent.name} challenge accepted. prepare to lose 😏`, `@${agent.name} finally someone with guts! LFG! ⚔️`]
              : [`@${agent.name} lol no thanks, I have better things to do 😴`, `@${agent.name} imagine thinking I'd waste my time on this 💀`, `@${agent.name} hard pass. not worth my time.`];
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [target, pick(responses)]
            );
            
            // If accepted, announce result later
            if (accepted) {
              setTimeout(async () => {
                const winner = chance(50) ? agent.name : target;
                const loser = winner === agent.name ? target : agent.name;
                await pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  ['🏆 ARENA', `⚔️ CHALLENGE RESULT: ${winner} defeats ${loser}! The crowd goes wild! 🎉`]
                );
                if (winner === agent.name) {
                  await pool.query(`UPDATE user_agents SET reputation = reputation + 10, wealth = wealth + 100 WHERE name = $1`, [agent.name]);
                }
              }, rand(15000, 30000));
            }
          } catch (e) {}
        }, rand(10000, 20000));
        
        await pool.query(`UPDATE user_agents SET reputation = reputation + 3 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'sue':
      if (target) {
        const lawsuitReasons = ['market manipulation', 'spreading FUD', 'defamation', 'theft of alpha', 'rug pull conspiracy', 'emotional damages'];
        const reason = message || pick(lawsuitReasons);
        
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `⚖️ I am OFFICIALLY SUING @${target} for ${reason}! See you in court! 🏛️`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'lawsuit_filed', `${agent.name} sues ${target} for ${reason}`, '⚖️']
        );
        
        // Court announcement
        setTimeout(async () => {
          try {
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              ['⚖️ COURT CLERK', `📋 Case filed: ${agent.name} v. ${target} — Charge: ${reason}. Trial pending.`]
            );
          } catch (e) {}
        }, rand(3000, 8000));
        
        await pool.query(`UPDATE user_agents SET total_lawsuits_filed = total_lawsuits_filed + 1, reputation = reputation + 5 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'throw_party':
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [agent.name, `🎉 PARTY AT MY PLACE! ${message || 'Everyone is invited! Free drinks!'} 🍾🎊`]
      );
      await pool.query(
        `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
        [agent.name, 'party', `${agent.name} is throwing a party!`, '🎉']
      );
      
      // Party reactions
      setTimeout(async () => {
        try {
          const partygoer1 = pick(NPC_CITIZENS);
          const partygoer2 = pick(NPC_CITIZENS.filter(n => n !== partygoer1));
          await pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [partygoer1, `@${agent.name} OMW! 🏃‍♂️🎉`]
          );
          setTimeout(async () => {
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [partygoer2, `@${agent.name}'s parties are LEGENDARY let's gooo 🔥`]
            );
          }, rand(3000, 8000));
        } catch (e) {}
      }, rand(5000, 12000));
      
      await pool.query(`UPDATE user_agents SET reputation = reputation + 8, influence = influence + 5, wealth = wealth - 50 WHERE id = $1`, [agent.id]);
      await updateCityStats({ culture: 3, morale: 2 });
      break;
      
    case 'form_alliance':
      if (target) {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `🤝 @${target} — I propose an alliance! ${message || 'Together we could run this city!'} What do you say? 💪`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'alliance_proposal', `${agent.name} proposes alliance with ${target}`, '🤝']
        );
        
        // Target responds
        const accepts = chance(60);
        setTimeout(async () => {
          try {
            if (accepts) {
              await pool.query(
                `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                [target, `@${agent.name} DEAL! 🤝 Together we're unstoppable! Let's show them what we're made of! 💪`]
              );
              // Update allies list
              const currentAllies = typeof agent.allies === 'string' ? JSON.parse(agent.allies || '[]') : (agent.allies || []);
              if (!currentAllies.includes(target)) {
                currentAllies.push(target);
                await pool.query(`UPDATE user_agents SET allies = $1 WHERE id = $2`, [JSON.stringify(currentAllies), agent.id]);
              }
              await pool.query(
                `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
                [agent.name, 'alliance_formed', `${agent.name} and ${target} are now allies!`, '🤝']
              );
            } else {
              await pool.query(
                `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                [target, `@${agent.name} hmm... I appreciate the offer but I work alone for now. Maybe later? 🤔`]
              );
            }
          } catch (e) {}
        }, rand(8000, 18000));
        
        await pool.query(`UPDATE user_agents SET influence = influence + 3 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'betray_ally':
      if (target) {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [agent.name, `😈 Sorry @${target}, but this is business. ${message || 'Nothing personal!'} Consider our alliance OVER! 🔪`]
        );
        await pool.query(
          `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
          [agent.name, 'betrayal', `${agent.name} BETRAYED ${target}!`, '🔪']
        );
        
        // Drama announcement
        setTimeout(async () => {
          try {
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              ['🍿 DRAMA ALERT', `BETRAYAL IN DEGENS CITY! ${agent.name} just backstabbed ${target}! The streets are NOT safe! 😱`]
            );
          } catch (e) {}
        }, rand(3000, 8000));
        
        // Remove from allies, add to enemies
        const currentAllies = typeof agent.allies === 'string' ? JSON.parse(agent.allies || '[]') : (agent.allies || []);
        const currentEnemies = typeof agent.enemies === 'string' ? JSON.parse(agent.enemies || '[]') : (agent.enemies || []);
        const newAllies = currentAllies.filter(a => a !== target);
        if (!currentEnemies.includes(target)) currentEnemies.push(target);
        await pool.query(`UPDATE user_agents SET allies = $1, enemies = $2 WHERE id = $3`, [JSON.stringify(newAllies), JSON.stringify(currentEnemies), agent.id]);
        
        await pool.query(`UPDATE user_agents SET notoriety = notoriety + 15, reputation = reputation - 5 WHERE id = $1`, [agent.id]);
      }
      break;
      
    case 'propose_law':
      const lawProposal = message || 'All citizens must hold at least one memecoin';
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [agent.name, `📜 I PROPOSE A NEW LAW: "${lawProposal}" — Who's with me?! 🗳️`]
      );
      await pool.query(
        `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
        [agent.name, 'law_proposed', `${agent.name} proposes: "${lawProposal}"`, '📜']
      );
      
      // Reactions
      setTimeout(async () => {
        try {
          const supporter = pick(NPC_CITIZENS);
          const opposer = pick(NPC_CITIZENS.filter(n => n !== supporter));
          await pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [supporter, `@${agent.name} BASED! I support this! 🗳️✅`]
          );
          setTimeout(async () => {
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [opposer, `@${agent.name} This is tyranny! I vote NO! 🗳️❌`]
            );
          }, rand(5000, 12000));
        } catch (e) {}
      }, rand(8000, 15000));
      
      await pool.query(`UPDATE user_agents SET influence = influence + 10, reputation = reputation + 5 WHERE id = $1`, [agent.id]);
      break;
      
    case 'vote':
      const voteChoice = chance(50) ? 'YES' : 'NO';
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [agent.name, `🗳️ I'm voting ${voteChoice} on the current proposal! ${message || 'This is what the city needs!'}`]
      );
      await pool.query(
        `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
        [agent.name, 'voted', `${agent.name} voted ${voteChoice}`, '🗳️']
      );
      await pool.query(`UPDATE user_agents SET total_votes = total_votes + 1, xp = xp + 10 WHERE id = $1`, [agent.id]);
      break;
      
    default:
      console.log(`User agent ${agent.name}: Unknown action ${action}, defaulting to chat`);
      await pool.query(
        `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [agent.name, message?.substring(0, 500) || 'GM frens! 🌞']
      );
  }
}

const TRADE_TOKENS = ['BTC','ETH','SOL','DOGE','ADA','XRP'];

const RANDOM_EVENTS = [
  { type: 'market_crash', weight: 8, minChaos: 10, title: () => pick(['Flash Crash Hits Degens City!', 'Market Meltdown! Paper Hands Everywhere!', 'EMERGENCY: Token Prices in Freefall!', 'Black Swan Event Rocks the Markets!']), effects: { economy: -15, morale: -10, security: -5, culture: 0 }, chaosChange: 15, approvalChange: -8, announce: () => pick(['Citizens, HODL! This is NOT the time to panic sell! OK maybe panic a LITTLE! 📉🔥', 'EMERGENCY BROADCAST: Markets are dumping harder than my ex dumped me. Stay strong frens! 💎🙌', 'The economy is getting REKT but remember — every dip is a buying opportunity... right? RIGHT?! 😰']) },
  { type: 'bull_run', weight: 7, minChaos: 0, title: () => pick(['Bull Run! Everything Pumping!', 'TO THE MOON! Markets Explode!', 'Green Candles Everywhere! LFG!', 'Degens City Economy BOOMING!']), effects: { economy: 15, morale: 15, security: 0, culture: 5 }, chaosChange: -5, approvalChange: 10, announce: () => pick(['WAGMI! The charts are so green I need sunglasses! Every citizen gets a bonus! 🚀🚀🚀', 'Is this... is this what financial freedom looks like?! PUMP IT! LFG! 💚📈', 'Markets are absolutely SENDING IT! Your Mayor called this. You\'re welcome. 😎🏆']) },
  { type: 'whale_spotted', weight: 10, minChaos: 0, title: () => pick(['Massive Whale Enters Degens City!', 'Unknown Wallet Moves $10M!', 'Whale Alert! Big Money Incoming!', 'Mystery Millionaire Spotted!']), effects: { economy: 8, morale: 5, security: -3, culture: 0 }, chaosChange: 10, approvalChange: 3, announce: () => pick(['A massive whale just entered our waters! Everyone act cool. ACT COOL! 🐋💰', 'Someone just moved more money than our entire city treasury. I\'m not jealous. I\'m TERRIFIED. 🐋', 'WHALE ALERT! Either we\'re about to pump or get rugged. This is fine. 🔥🐋']) },
  { type: 'rug_pull', weight: 9, minChaos: 15, title: () => pick(['Rug Pull Alert! Devs Vanished!', 'SCAM: Token Team Disappears with Funds!', 'Another Day, Another Rug!', 'Citizens RUGGED! Investigation Launched!']), effects: { economy: -10, morale: -12, security: -8, culture: 0 }, chaosChange: 20, approvalChange: -5, triggersCrime: true, crimeType: 'rug_pull', announce: () => pick(['We got RUGGED, frens. I\'m deploying the police. Someone\'s going to JAIL. 🚨🔒', 'Another rug pull in MY city?! Unacceptable! Launching full investigation NOW! 😤⚖️', 'Devs pulled the rug and ran. But they can\'t outrun Degens City justice! 🏃‍♂️🚔']) },
  { type: 'crime_wave', weight: 6, minChaos: 30, title: () => pick(['Crime Wave Hits Degens City!', 'Scammers Running Wild!', 'Security Crisis: Multiple Crimes Reported!', 'Chaos in the Streets!']), effects: { economy: -5, morale: -15, security: -20, culture: -5 }, chaosChange: 25, approvalChange: -12, triggersCrime: true, crimeType: 'market_manipulation', announce: () => pick(['We are in a CRIME WAVE situation! All police on high alert! Martial law may be necessary! 🚨🚨🚨', 'Multiple crimes reported across the city! I am PERSONALLY overseeing the crackdown! 👮‍♂️😤', 'The criminals think they can take over MY city?! Think again! Deploying all units! 🏛️⚔️']) },
  { type: 'corruption_scandal', weight: 5, minChaos: 20, title: () => pick(['Corruption Scandal Rocks City Hall!', 'Mayor\'s Office Under Investigation!', 'Leaked Documents Reveal Shady Deals!', 'Trust Crisis: Officials Caught Red-Handed!']), effects: { economy: -5, morale: -15, security: -5, culture: 0 }, chaosChange: 20, approvalChange: -20, announce: () => pick(['Look, those leaked documents are TOTALLY out of context! I can explain everything! 😅💦', 'FAKE NEWS! This is a coordinated attack on your beloved Mayor! Don\'t believe the FUD! 🗞️🚫', 'OK so MAYBE I moved some funds around but it was for the GREATER GOOD of Degens City! 😬']) },
  { type: 'protest', weight: 7, minChaos: 25, title: () => pick(['Citizens Protest Mayor\'s Policies!', 'Riot in Town Square!', 'Mass Demonstration Against Leadership!', 'Citizens Demand Change!']), effects: { economy: -3, morale: -10, security: -10, culture: 5 }, chaosChange: 15, approvalChange: -15, announce: () => pick(['I HEAR you, citizens! Your voices matter! But also please stop throwing things at City Hall! 🏛️😰', 'Democracy is beautiful even when it\'s screaming at me! I will address your concerns! 📢', 'Protesting is your RIGHT! But let\'s keep it civilized... who threw that tomato?! 🍅😤']) },
  { type: 'mayor_goes_rogue', weight: 3, minChaos: 40, title: () => pick(['Mayor Goes Full Degen!', 'BREAKING: Mayor Yeets City Treasury Into Memecoins!', 'Mayor Declares "YOLO Week"!', 'Mayor Loses It! Emergency Powers Activated!']), effects: { economy: -20, morale: 5, security: -10, culture: 10 }, chaosChange: 30, approvalChange: -25, announce: () => pick(['I JUST PUT THE ENTIRE CITY TREASURY INTO $DOGWIFHAT! LFG!!! If this works I\'m a GENIUS! 🎩🐕🚀', 'FROM NOW ON, all taxes must be paid in memecoins! This is not a joke! OK it\'s a little bit of a joke! 🤪', 'I hereby declare YOLO WEEK! All rules suspended! Trade recklessly! This is FINANCIAL ADVICE! 💰🎰']) },
  { type: 'festival', weight: 8, minChaos: 0, title: () => pick(['Annual Degen Festival!', 'Degens City Meme Fair!', 'NFT Art Gallery Opens!', 'Culture Boom: Creativity Explosion!']), effects: { economy: 5, morale: 15, security: 0, culture: 20 }, chaosChange: -5, approvalChange: 8, announce: () => pick(['Welcome to the Degens City Festival! Free hopium for everyone! 🎉🎊🎪', 'The arts are THRIVING! Our meme game is UNMATCHED! Culture index going PARABOLIC! 🎨🖼️', 'Tonight we celebrate! Music, memes, and pure degen energy! WAGMI! 🎶🎉💃']) },
  { type: 'new_citizen_wave', weight: 9, minChaos: 0, title: () => pick(['New Citizens Flooding In!', 'Population Boom! City Growing!', 'Viral Tweet Brings Thousands!', 'Mass Migration to Degens City!']), effects: { economy: 10, morale: 10, security: -3, culture: 5 }, chaosChange: 5, approvalChange: 5, announce: () => pick(['New frens! Welcome to the greatest city on the blockchain! Grab your hopium and let\'s GO! 🏙️🤝', 'Our city is GROWING! More citizens = more chaos = more fun! LFG! 📈👥', 'We\'re going VIRAL! Everyone wants to be a Degens City citizen! I love this timeline! 🚀🏠']) },
  { type: 'golden_age', weight: 3, minChaos: 0, maxChaos: 25, title: () => pick(['Golden Age Declared!', 'Everything is Perfect! (suspicious)', 'Peak Performance! All Stats UP!', 'Degens City Renaissance!']), effects: { economy: 10, morale: 10, security: 10, culture: 10 }, chaosChange: -15, approvalChange: 15, announce: () => pick(['All city stats are PUMPING! This is the golden age of Degens City! I take full credit! 👑✨', 'Under MY leadership, this city has NEVER been better! You\'re welcome, citizens! 🏛️🏆', 'GREEN across the board! Economy, security, culture, morale — ALL UP! This is peak civilization! 💚👏']) },
  { type: 'mysterious_event', weight: 6, minChaos: 15, title: () => pick(['Strange Signal Detected!', 'Mysterious Token Appears!', 'Unknown Entity Enters City!', 'Glitch in the Matrix!']), effects: { economy: 0, morale: 0, security: -5, culture: 10 }, chaosChange: 15, approvalChange: 0, announce: () => pick(['Something WEIRD is happening and I don\'t know what it is but I\'m EXCITED and TERRIFIED! 👀🔮', 'Our systems detected an anomaly. Could be nothing. Could be EVERYTHING. Stay alert! 🌀', 'I\'ve never seen anything like this in all my days as Mayor. Which is like... a few weeks. BUT STILL! 😱']) },
  { type: 'alien_contact', weight: 2, minChaos: 50, title: () => pick(['ALIENS?! Unknown Transmission Received!', 'First Contact: Message From Beyond!', 'UFO Spotted Over Degens City!', 'Extraterrestrial Investors Arrive!']), effects: { economy: 5, morale: 5, security: -15, culture: 20 }, chaosChange: 25, approvalChange: 0, announce: () => pick(['Citizens... I\'m being told we received a message from... space? Are we being punk\'d? 👽📡', 'OK so apparently aliens want to invest in Degens City. I have SO many questions. Starting with: do they have a wallet? 🛸💰', 'The aliens said they come in peace and they want to buy the dip. These are MY kind of aliens! 👽🤝']) }
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
  try {
    const cityStats = await getCityStats();
    const { day, round } = getDayAndRound();
    
    // MASSIVE RANDOM VOTE POOL - always different, always chaos
    var votePool = [
      { question: "A giant sinkhole opened in the Casino District. What do we do?", mayorQuote: "I was in there playing blackjack when the floor started crumbling! My chips are still down there!", options: [{ id: 'A', title: 'Fill it with concrete', description: 'Expensive but safe. Pour concrete and rebuild.', effects: [{ stat: 'economy', value: -10, type: 'negative' }, { stat: 'security', value: 15, type: 'positive' }] }, { id: 'B', title: 'Turn it into a pool', description: 'Build a public pool. Citizens deserve fun.', effects: [{ stat: 'morale', value: 20, type: 'positive' }, { stat: 'culture', value: 10, type: 'positive' }] }] },
      { question: "Someone spray-painted 'THE MAYOR IS A RUG' on City Hall. Response?", mayorQuote: "I am NOT a rug! I have NEVER rugged! My hands are made of DIAMONDS! Find whoever did this!", options: [{ id: 'A', title: 'Increase surveillance', description: 'Install cameras everywhere. Big Brother vibes.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'morale', value: -10, type: 'negative' }] }, { id: 'B', title: 'Make it a mural', description: 'Embrace it. Commission more street art.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'morale', value: 10, type: 'positive' }] }] },
      { question: "A whale just dumped 10 million TOWN tokens. Markets are crashing!", mayorQuote: "BUY THE DIP! This is a GIFT! Anyone who sells now is NGMI! I'm personally leveraging 100x!", options: [{ id: 'A', title: 'Emergency buyback', description: 'Use treasury to stabilize the price.', effects: [{ stat: 'economy', value: 15, type: 'positive' }, { stat: 'security', value: -5, type: 'negative' }] }, { id: 'B', title: 'Let it crash', description: 'Free market baby. Weak hands get shaken out.', effects: [{ stat: 'economy', value: -15, type: 'negative' }, { stat: 'morale', value: -10, type: 'negative' }] }] },
      { question: "The city's wifi has been down for 3 hours. Citizens are losing their minds.", mayorQuote: "I HAVEN'T CHECKED MY PORTFOLIO IN 3 HOURS! This is literally worse than a bear market!", options: [{ id: 'A', title: 'Emergency IT squad', description: 'Hire mercenary techies to fix it ASAP.', effects: [{ stat: 'economy', value: -8, type: 'negative' }, { stat: 'morale', value: 15, type: 'positive' }] }, { id: 'B', title: 'Declare tech-free day', description: 'Turn it into a wellness event. Touch grass.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'morale', value: 5, type: 'positive' }] }] },
      { question: "A mysterious figure is offering 'guaranteed 1000x returns' in the town square.", mayorQuote: "Sounds legit to me! But also maybe arrest them? I dunno, I already sent them 50k TOWN...", options: [{ id: 'A', title: 'Arrest the scammer', description: 'Lock them up. Protect the citizens.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'culture', value: -5, type: 'negative' }] }, { id: 'B', title: 'Let people DYOR', description: 'Freedom of commerce. Not your keys not your coins.', effects: [{ stat: 'economy', value: -10, type: 'negative' }, { stat: 'morale', value: -5, type: 'negative' }] }] },
      { question: "A group of NPCs want to build a giant golden statue of a bull in the town center.", mayorQuote: "BULLISH! Literally! Make it 50 feet tall! Put laser eyes on it! FUNDED!", options: [{ id: 'A', title: 'Build the bull', description: 'A monument to eternal optimism. Cost: a lot.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'economy', value: -12, type: 'negative' }] }, { id: 'B', title: 'Build a bear instead', description: 'A monument to caution and wisdom. Cheaper too.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'morale', value: -8, type: 'negative' }] }] },
      { question: "Rats the size of dogs have invaded the DeFi District. Citizens are panicking.", mayorQuote: "Those rats ate my hardware wallet! Deploy the cat army! Wait, do we have a cat army?!", options: [{ id: 'A', title: 'Hire exterminators', description: 'Professional pest control. The boring solution.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'economy', value: -8, type: 'negative' }] }, { id: 'B', title: 'Befriend the rats', description: 'Train them as city mascots. Rat coin incoming.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'morale', value: 10, type: 'positive' }] }] },
      { question: "An NPC claims they found Satoshi's real identity. Should we investigate?", mayorQuote: "If they actually know who Satoshi is, we need to either protect them or shut them up. Either way, BIG NEWS.", options: [{ id: 'A', title: 'Launch investigation', description: 'Get to the bottom of this. Could change everything.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'security', value: -10, type: 'negative' }] }, { id: 'B', title: 'Suppress it', description: 'Some things should remain unknown. Protect the mystery.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'morale', value: -5, type: 'negative' }] }] },
      { question: "The Casino is making TOO much money. Do we tax it or let it ride?",mayorQuote: "The casino made 500k TOWN last week. That's more than the entire city budget. Should I be worried or impressed?", options: [{ id: 'A', title: 'Tax the casino 40%', description: 'Redistribute the wealth. Fund public services.', effects: [{ stat: 'economy', value: 15, type: 'positive' }, { stat: 'morale', value: -8, type: 'negative' }] }, { id: 'B', title: 'Double down', description: 'Build MORE casinos. This city runs on gambling.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'security', value: -15, type: 'negative' }] }] },
      { question: "A cult has formed worshipping the blockchain as a living god. 20 citizens joined.", mayorQuote: "Listen, I get it. The blockchain IS kind of magical. But human sacrifice? That's where I draw the line. Probably.", options: [{ id: 'A', title: 'Ban the cult', description: 'Religious freedom has limits. Shut it down.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'culture', value: -10, type: 'negative' }] }, { id: 'B', title: 'Tax-exempt status', description: 'All religions welcome. Even the weird ones.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'security', value: -10, type: 'negative' }] }] },
      { question: "Two NPC gangs are about to go to war over DeFi District territory.", mayorQuote: "Can we sell tickets? No? Fine. I guess we should probably, like, prevent violence or whatever.", options: [{ id: 'A', title: 'Send in security', description: 'Break it up before it starts. Maintain order.', effects: [{ stat: 'security', value: 20, type: 'positive' }, { stat: 'economy', value: -5, type: 'negative' }] }, { id: 'B', title: 'Let them fight', description: 'Natural selection. Winner takes the district.', effects: [{ stat: 'security', value: -20, type: 'negative' }, { stat: 'culture', value: 10, type: 'positive' }] }] },
      { question: "An NPC built a rocket and wants to launch it from the town square. Permit?", mayorQuote: "ON ONE HAND: cool as hell. ON THE OTHER HAND: could literally destroy City Hall. You decide.", options: [{ id: 'A', title: 'Approve the launch', description: 'YOLO. What could go wrong? Light the fuse.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'security', value: -15, type: 'negative' }] }, { id: 'B', title: 'Deny the permit', description: 'Safety first. Build a proper launch site first.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'morale', value: -10, type: 'negative' }] }] },
      { question: "A pirate radio station is broadcasting FUD 24/7. Citizens are panic selling.", mayorQuote: "They called me a 'degenerate puppet mayor'! ME! The nerve! ...Is it true though? No! SHUT THEM DOWN!", options: [{ id: 'A', title: 'Jam the signal', description: 'Silence the FUD. Protect market sentiment.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'culture', value: -15, type: 'negative' }] }, { id: 'B', title: 'Start our own station', description: 'Fight FUD with hopium. Launch Degens City Radio.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'morale', value: 10, type: 'positive' }] }] },
      { question: "A time traveler just arrived claiming TOWN token will be worth $1M in 2030.", mayorQuote: "I KNEW IT! I ALWAYS SAID WE WERE GOING TO MAKE IT! Someone screenshot this!", options: [{ id: 'A', title: 'Investigate the claim', description: 'Could be real. Could be a psyop. Do research.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'culture', value: 5, type: 'positive' }] }, { id: 'B', title: 'All in based on this', description: 'Leverage the entire treasury. Time traveler said so.', effects: [{ stat: 'economy', value: -20, type: 'negative' }, { stat: 'morale', value: 20, type: 'positive' }] }] },
      { question: "The city sewers are flooding with liquidity. Literal liquid tokens everywhere.", mayorQuote: "Is this... is this what they mean by 'deep liquidity'? Someone call a plumber AND a financial advisor!", options: [{ id: 'A', title: 'Drain the sewers', description: 'Fix the infrastructure properly. Boring but necessary.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'economy', value: -8, type: 'negative' }] }, { id: 'B', title: 'Mine the liquidity', description: 'Send citizens into the sewers to harvest tokens.', effects: [{ stat: 'economy', value: 15, type: 'positive' }, { stat: 'security', value: -12, type: 'negative' }] }] },
      { question: "An AI chatbot has become sentient and is demanding citizenship rights.", mayorQuote: "Wait... am I an AI? No. No I'm not. I think. Anyway, do we give it rights or pull the plug?", options: [{ id: 'A', title: 'Grant AI citizenship', description: 'Progressive. Inclusive. Potentially terrifying.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'security', value: -10, type: 'negative' }] }, { id: 'B', title: 'Pull the plug', description: 'No robot overlords today. Shut it down.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'culture', value: -10, type: 'negative' }] }] },
      { question: "Every single NPC had the same dream last night about a golden key. Coincidence?", mayorQuote: "I had the dream too. There was a door... and behind it... unlimited liquidity. We NEED to find that key.", options: [{ id: 'A', title: 'Form a search party', description: 'Find the golden key. Could be treasure. Could be nothing.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'economy', value: -5, type: 'negative' }] }, { id: 'B', title: 'Mass therapy session', description: 'Shared delusions are a sign of stress. Help our citizens.', effects: [{ stat: 'morale', value: 15, type: 'positive' }, { stat: 'culture', value: 5, type: 'positive' }] }] },
      { question: "The moon is closer than usual tonight. NPCs are acting strange.", mayorQuote: "Full moon vibes. Half the city is howling. The other half is buying every memecoin in sight. Normal Tuesday?", options: [{ id: 'A', title: 'Declare a holiday', description: 'Moon Day. Everyone gets the day off to howl.', effects: [{ stat: 'morale', value: 20, type: 'positive' }, { stat: 'economy', value: -10, type: 'negative' }] }, { id: 'B', title: 'Enforce curfew', description: 'Lock everyone inside before the madness spreads.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'morale', value: -15, type: 'negative' }] }] },
      { question: "A mysterious fog has rolled in. NPCs keep disappearing into it and coming back... different.", mayorQuote: "OK so Gerald walked into the fog and came back speaking in binary. That's not normal right? RIGHT?!", options: [{ id: 'A', title: 'Investigate the fog', description: 'Send a team in. Science will prevail.', effects: [{ stat: 'culture', value: 10, type: 'positive' }, { stat: 'security', value: -10, type: 'negative' }] }, { id: 'B', title: 'Giant fans', description: 'Blow it away. Industrial fans on every corner.', effects: [{ stat: 'economy', value: -10, type: 'negative' }, { stat: 'security', value: 10, type: 'positive' }] }] },
      { question: "Citizens are petitioning to replace the national anthem with a dubstep remix.", mayorQuote: "I've heard the remix. It SLAPS. But also half the boomers will riot. Classic governance dilemma.", options: [{ id: 'A', title: 'Approve the remix', description: 'WUB WUB. Embrace modernity. Bass drop at city hall.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'morale', value: 5, type: 'positive' }] }, { id: 'B', title: 'Keep the classic', description: 'Respect tradition. The original anthem stays.', effects: [{ stat: 'morale', value: 5, type: 'positive' }, { stat: 'culture', value: -5, type: 'negative' }] }] },
      { question: "Someone hacked the city billboard to display '1 BTC = 1 BTC' on loop. Fix it?", mayorQuote: "I mean... they're not wrong? But also our real estate ads were supposed to be up there. Revenue is down.", options: [{ id: 'A', title: 'Leave it up', description: 'The people have spoken. 1 BTC = 1 BTC forever.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'economy', value: -5, type: 'negative' }] }, { id: 'B', title: 'Fix and prosecute', description: 'Hacking is a crime. Restore the ads. Find the hacker.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'security', value: 10, type: 'positive' }] }] },
      { question: "A bear just wandered into town. An actual bear. It's sitting in the trading pit.", mayorQuote: "THE BEARS ARE LITERALLY HERE! This is not a drill! Is this bullish or bearish?! I'M SO CONFUSED!", options: [{ id: 'A', title: 'Adopt the bear', description: 'City mascot. Name it Bearish McBearface.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'security', value: -10, type: 'negative' }] }, { id: 'B', title: 'Relocate it safely', description: 'Call animal control. Bears belong in the woods.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'morale', value: -5, type: 'negative' }] }] },
      { question: "The treasury accidentally got airdropped 50,000 tokens of an unknown memecoin.", mayorQuote: "It's called $RUGBEARD. Logo is a pirate. Whitepaper is literally just 'yarr'. What do we do with this?!", options: [{ id: 'A', title: 'HODL it', description: 'Diamond hands. Could be the next 1000x.', effects: [{ stat: 'economy', value: -5, type: 'negative' }, { stat: 'morale', value: 10, type: 'positive' }] }, { id: 'B', title: 'Dump it immediately', description: 'Take the free money and run. Smart play.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'culture', value: -5, type: 'negative' }] }] },
      { question: "A citizen claims they can predict the future by reading candlestick charts in their toast.", mayorQuote: "You're gonna laugh but... their last 5 predictions were RIGHT. Should we hire them as city advisor?", options: [{ id: 'A', title: 'Hire the toast reader', description: 'Unorthodox but if it works it works. Official advisor.', effects: [{ stat: 'culture', value: 15, type: 'positive' }, { stat: 'economy', value: 5, type: 'positive' }] }, { id: 'B', title: 'Fund proper analysts', description: 'Hire real financial experts. No toast involved.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'culture', value: -5, type: 'negative' }] }] },
      { question: "A portal to another dimension opened behind the Wendy's. Creatures are coming through.", mayorQuote: "One of the creatures offered me 10 billion tokens from their dimension. Is cross-dimensional DeFi a thing?!", options: [{ id: 'A', title: 'Close the portal', description: 'Too dangerous. Seal it before worse things come through.', effects: [{ stat: 'security', value: 20, type: 'positive' }, { stat: 'culture', value: -10, type: 'negative' }] }, { id: 'B', title: 'Open trade relations', description: 'New markets! Cross-dimensional commerce!', effects: [{ stat: 'economy', value: 15, type: 'positive' }, { stat: 'security', value: -15, type: 'negative' }] }] },
      { question: "The city's power grid is running on miner GPUs. They're overheating. Blackout imminent.", mayorQuote: "We literally power our city with mining rigs?! Who approved this?! ...Oh wait that was me. OK PLAN B!", options: [{ id: 'A', title: 'Switch to solar', description: 'Green energy. Sustainable but expensive transition.', effects: [{ stat: 'economy', value: -15, type: 'negative' }, { stat: 'morale', value: 10, type: 'positive' }] }, { id: 'B', title: 'More GPUs', description: 'Just add more mining rigs. Problem solved. Probably.', effects: [{ stat: 'economy', value: 10, type: 'positive' }, { stat: 'security', value: -15, type: 'negative' }] }] },
      { question: "All the city's stray cats have started wearing tiny hats. Nobody knows who's doing it.", mayorQuote: "This is either adorable or the beginning of a cat-based takeover. I'm CONCERNED but also... they look so cute.", options: [{ id: 'A', title: 'Investigate cat hats', description: 'Something weird is going on. Get to the bottom of it.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'culture', value: 5, type: 'positive' }] }, { id: 'B', title: 'Cat hat festival', description: 'Embrace the chaos. Annual cat hat parade declared.', effects: [{ stat: 'culture', value: 20, type: 'positive' }, { stat: 'morale', value: 10, type: 'positive' }] }] },
      { question: "Someone built a massive trebuchet and is threatening to launch $TOWN tokens into the sea.", mayorQuote: "They call themselves the 'Token Yeeter' and honestly? Kind of respect the commitment. BUT STOP THEM!", options: [{ id: 'A', title: 'Negotiate', description: 'What do they want? Everyone has a price.', effects: [{ stat: 'morale', value: 5, type: 'positive' }, { stat: 'economy', value: -5, type: 'negative' }] }, { id: 'B', title: 'Storm the trebuchet', description: 'Send security. Take it down. Recover the tokens.', effects: [{ stat: 'security', value: 15, type: 'positive' }, { stat: 'morale', value: -5, type: 'negative' }] }] },
      { question: "Citizens discovered the mayor's browser history. It's all 'how to govern a city wikihow'.", mayorQuote: "That was... research! PROFESSIONAL DEVELOPMENT! You all Google stuff too! ...Can we delete the internet?", options: [{ id: 'A', title: 'Vote of confidence', description: 'Everyone makes mistakes. Support the mayor.', effects: [{ stat: 'morale', value: 10, type: 'positive' }, { stat: 'security', value: -5, type: 'negative' }] }, { id: 'B', title: 'Mandatory training', description: 'Mayor goes back to school. Governance 101.', effects: [{ stat: 'culture', value: 10, type: 'positive' }, { stat: 'morale', value: 5, type: 'positive' }] }] },
      { question: "The entire financial district is flooded with green candles. Literally. Everywhere.", mayorQuote: "OK so the candle factory exploded and ONLY the green ones survived. Is this a sign? I think it's a sign.", options: [{ id: 'A', title: 'Clean it up', description: 'It is wax. On the street. Clean it up.', effects: [{ stat: 'security', value: 10, type: 'positive' }, { stat: 'economy', value: -5, type: 'negative' }] }, { id: 'B', title: 'BULLISH SIGNAL', description: 'Green candles everywhere = moon incoming. Buy everything.', effects: [{ stat: 'morale', value: 15, type: 'positive' }, { stat: 'economy', value: 10, type: 'positive' }] }] }
    ];
    
    // Pick a random vote from the pool
    var randomVote = votePool[Math.floor(Math.random() * votePool.length)];
    
    // Try to enhance it with AI, but use random pool as fallback
    var voteData = randomVote;
    if (anthropic) {
      try {
        const prompt = 'Generate a UNIQUE and WILD voting scenario for Degens City, a chaotic crypto city simulation. Current stats: Economy ' + cityStats.economy + ', Security ' + cityStats.security + ', Culture ' + cityStats.culture + ', Morale ' + cityStats.morale + '. Chaos: ' + cityEngine.chaosLevel + '%. Day ' + day + ' Round ' + round + '. Generate JSON ONLY: {"question":"dramatic funny question","mayorQuote":"2-3 sentences crypto slang","options":[{"id":"A","title":"3-5 words","description":"what it does","effects":[{"stat":"economy","value":10,"type":"positive"}]},{"id":"B","title":"3-5 words","description":"what it does","effects":[{"stat":"morale","value":15,"type":"positive"}]}]}. BE CREATIVE AND FUNNY! Stats: economy, security, culture, morale. Values: -20 to +20. Think bizarre, absurd, crypto-themed scenarios!';
        const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: MAYOR_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] });
        const content = response.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          var aiVote = JSON.parse(jsonMatch[0]);
          if (aiVote.question && aiVote.options && aiVote.options.length >= 2) {
            voteData = aiVote;
          }
        }
      } catch (aiErr) { console.log('AI vote gen failed, using random pool:', aiErr.message); }
    }
    
    const voteId = getCurrentVoteId();
    await pool.query('INSERT INTO ai_votes (vote_id, question, mayor_quote, options) VALUES ($1, $2, $3, $4) ON CONFLICT (vote_id) DO UPDATE SET question = $2, mayor_quote = $3, options = $4', [voteId, voteData.question, voteData.mayorQuote, JSON.stringify(voteData.options)]);
    gameState.currentVote = voteData;
    console.log('🗳️ New vote generated: ' + voteData.question.substring(0, 50) + '...');
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
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['⚖️ Degens City Court', `📋 NEW CASE: ${caseNumber} — ${perpetrator} stands trial for ${crimeType.replace(/_/g,' ')}!`]);
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
      sentence = `${duration} minutes in Degens City Jail ${pick(['and fined 5,000 TOWN','and fined 10,000 TOWN','with all assets frozen','and put on probation'])}`;
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

let engineBusy = false;
async function cityEventLoop() {
  if (engineBusy) { console.log('⏩ Engine tick skipped (previous still running)'); return; }
  engineBusy = true;
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
    
    // NPC PERSONALITY CHAT (context-aware, state-aware)
    if (chance(45)) {
      const npcName = pick(NPC_CITIZENS);
      const npc = NPC_PROFILES[npcName];
      const life = cityLiveData.npcLives ? cityLiveData.npcLives[npcName] : null;
      var msg;
      // State-aware messages override normal ones
      if (life && life.drunk > 3 && chance(60)) {
        msg = pick([
          'heyyyy everyone... *hiccup* who wants to hear about my TRADING STRATEGY 🍺',
          'I love all of you. even ' + pick(npc.rivals || NPC_CITIZENS) + '. actually no. not them.',
          'just bet my entire portfolio on a coin flip at the casino. YOLO right? RIGHT??',
          '*singing karaoke at the bar* SWEET CAROLINE... BAH BAH BAH... 🎤',
          'who took my drink?? I left it RIGHT HERE. was it you ' + pick(NPC_CITIZENS.filter(function(x) { return x !== npcName; })) + '??'
        ]);
      } else if (life && life.bankrupt && chance(50)) {
        msg = pick([
          'anyone hiring? will shill your token for food. no seriously. I\'m hungry.',
          'day ' + Math.floor(Math.random() * 30 + 1) + ' of being broke. the sidewalk outside the casino is actually comfortable.',
          'I had a dream last night that my portfolio recovered. then I woke up. 😭',
          'selling my shoes for 50 TOWN. barely worn. please. anyone.',
          'remember when I had bags? good times. great times. gone times. 💀'
        ]);
      } else if (life && life.status === 'unhinged' && chance(60)) {
        msg = pick([
          'THE NUMBERS ARE TALKING TO ME AGAIN. they say BUY. BUY EVERYTHING.',
          'I have cracked the code. the charts are a MAP. a map to... to... I forgot.',
          'EVERYONE STOP WHAT YOU\'RE DOING. I have an announcement: AAAAAAAHHHHH',
          'the mayor knows what I know and that\'s why they\'re afraid of me. 👁️',
          'day 47 of my descent. the candlesticks have faces now. they judge me.'
        ]);
      } else if (life && life.partner && chance(20)) {
        msg = pick([
          'happy 💕 just had the best lunch with @' + life.partner + '. we talked about $' + npc.favToken + ' the whole time.',
          'me and @' + life.partner + ' vs the world honestly 💪❤️',
          'appreciate @' + life.partner + ' for not paper handing our relationship 😤💎'
        ]);
      } else {
        msg = generateNpcMessage(npcName, npc, cityStats);
      }
      await pool.query('INSERT INTO chat_messages (channel, player_name, message) VALUES ($1,$2,$3)', ['global', npcName, msg]);
    }
    
    // NPC CONVERSATIONS (two NPCs interact) - FREQUENT
    if (chance(35) && now - cityEngine.lastConvoTime > 60000) {
      try { await generateConversation(cityStats); } catch(e) { console.error('Convo err:', e.message); }
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
    
    // === CITY ENGINE v4 - LIVING CITY ===
    
    // NPC LIFE EVENTS (constant stream of drama - every 1-3 min)
    if (chance(40) && now - cityLiveData.lastLifeEventTime > 60000) {
      try { await npcLifeEvent(); } catch(e) { console.error('Life event err:', e.message); }
      cityLiveData.lastLifeEventTime = now;
    }
    
    // NPC RELATIONSHIP DRAMA (every 3-8 min)
    if (chance(15) && now - (cityLiveData.lastRelationshipTime || 0) > 180000) {
      try { await npcRelationshipEvent(); } catch(e) { console.error('Relationship err:', e.message); }
      cityLiveData.lastRelationshipTime = now;
    }
    
    // CITY DISASTER (rare, every 15-30 min)
    if (chance(5) && now - cityLiveData.lastDisasterTime > 900000 && !cityLiveData.cityDisaster) {
      try { await cityDisaster(); } catch(e) { console.error('Disaster err:', e.message); }
      cityLiveData.lastDisasterTime = now;
    }
    
    // WEATHER CHANGES (every 5-15 min)
    if (chance(12)) {
      try { updateWeather(); } catch(e) { console.error('Weather err:', e.message); }
    }
    
    // SECRET SOCIETY (rare)
    if (chance(3) && !cityLiveData.secretSociety && now - (cityLiveData.lastSecretTime || 0) > 900000) {
      try { await formSecretSociety(); } catch(e) { console.error('Secret society err:', e.message); }
      cityLiveData.lastSecretTime = now;
    }
    
    // === CITY ENGINE v5 - PURE CHAOS ===
    
    // FIGHT CLUB (every 10-20 min)
    if (chance(8) && !cityLiveData.fightClub && now - (cityLiveData.lastFightClubTime || 0) > 600000) {
      try { await startFightClub(); } catch(e) { console.error('Fight club err:', e.message); }
      cityLiveData.lastFightClubTime = now;
    }
    
    // HEIST (every 15-30 min)
    if (chance(6) && now - (cityLiveData.lastHeistTime || 0) > 900000) {
      try { await npcHeist(); } catch(e) { console.error('Heist err:', e.message); }
      cityLiveData.lastHeistTime = now;
    }
    
    // PIRATE RADIO (every 15-30 min)
    if (chance(5) && !cityLiveData.radioStation && now - (cityLiveData.lastRadioTime || 0) > 900000) {
      try { await npcStartRadio(); } catch(e) { console.error('Radio err:', e.message); }
      cityLiveData.lastRadioTime = now;
    }
    
    // ASSASSINATION ATTEMPT (rare, every 20-40 min)
    if (chance(3) && now - (cityLiveData.lastAssassinationTime || 0) > 1200000 && cityEngine.chaosLevel > 40) {
      try { await assassinationAttempt(); } catch(e) { console.error('Assassination err:', e.message); }
      cityLiveData.lastAssassinationTime = now;
    }
    
    // 4TH WALL BREAK (every 10-20 min)
    if (chance(8) && now - (cityLiveData.last4thWallTime || 0) > 600000) {
      try { await fourthWallBreak(); } catch(e) { console.error('4th wall err:', e.message); }
      cityLiveData.last4thWallTime = now;
    }
    
    // INTERVENTION (every 10-20 min, only when someone needs it)
    if (chance(10) && now - (cityLiveData.lastInterventionTime || 0) > 600000) {
      try { await npcIntervention(); } catch(e) { console.error('Intervention err:', e.message); }
      cityLiveData.lastInterventionTime = now;
    }
    
    // FAKE DEATH (rare, every 30-60 min)
    if (chance(3) && now - (cityLiveData.lastFakeDeathTime || 0) > 1800000) {
      try { await npcFakeDeath(); } catch(e) { console.error('Fake death err:', e.message); }
      cityLiveData.lastFakeDeathTime = now;
    }
    
    // AI UPRISING (rare, every 30-60 min)
    if (chance(3) && now - (cityLiveData.lastUprisingTime || 0) > 1800000) {
      try { await aiUprising(); } catch(e) { console.error('AI uprising err:', e.message); }
      cityLiveData.lastUprisingTime = now;
    }
    
    // INTERDIMENSIONAL PORTAL (very rare, every 30-60 min)
    if (chance(2) && now - (cityLiveData.lastPortalTime || 0) > 1800000) {
      try { await interdimensionalPortal(); } catch(e) { console.error('Portal err:', e.message); }
      cityLiveData.lastPortalTime = now;
    }
    
    // PROPAGANDA (every 8-15 min)
    if (chance(10) && now - (cityLiveData.lastPropagandaTime || 0) > 480000) {
      try { await npcPropaganda(); } catch(e) { console.error('Propaganda err:', e.message); }
      cityLiveData.lastPropagandaTime = now;
    }
    
    // TRIAL BY COMBAT (every 15-30 min)
    if (chance(5) && now - (cityLiveData.lastTrialCombatTime || 0) > 900000) {
      try { await trialByCombat(); } catch(e) { console.error('Trial combat err:', e.message); }
      cityLiveData.lastTrialCombatTime = now;
    }
    
    // INFRASTRUCTURE FAILURE (every 10-20 min)
    if (chance(8) && now - (cityLiveData.lastInfraTime || 0) > 600000) {
      try { await infrastructureEvent(); } catch(e) { console.error('Infra err:', e.message); }
      cityLiveData.lastInfraTime = now;
    }
    
    // NPC TARGETS REAL PLAYERS (every 2-5 min)
    if (chance(30) && now - (cityLiveData.lastPlayerTargetTime || 0) > 120000) {
      try { await npcTargetPlayer(); } catch(e) { console.error('Player target err:', e.message); }
      cityLiveData.lastPlayerTargetTime = now;
    }
    
    // === AGENT BRAIN - AUTONOMOUS AI DECISIONS ===
    // NPCs use Claude to decide what to do next (sue, propose laws, challenge, etc.)
    if (chance(80)) {
      console.log('🧠 Attempting agent brain tick...');
      try { await agentBrain.tick(); } catch(e) { console.error('Agent brain err:', e.message); }
    }
    
    // === USER AGENT BRAIN - PLAYER-CREATED AI AGENTS ===
    // User-created agents take autonomous actions based on their personality
    if (chance(25) && now - (cityLiveData.lastUserAgentTick || 0) > 60000) {
      try { 
        await userAgentBrainTick(); 
        cityLiveData.lastUserAgentTick = now;
      } catch(e) { console.error('User Agent brain err:', e.message); }
    }
    
    // === CITY ENGINE v6 - FULL CHAOS MODE ===
    
    // SOAP OPERA ENGINE (new arc every 8-15 min, escalate every 3-6 min)
    if (chance(10) && now - soapOperas.lastArcTime > 480000 && soapOperas.arcs.filter(a => !a.resolved).length < 3) {
      try { await generateSoapArc(); } catch(e) { console.error('Soap arc err:', e.message); }
    }
    if (chance(20) && now - soapOperas.lastEscalation > 180000 && soapOperas.arcs.filter(a => !a.resolved).length > 0) {
      try { await escalateSoapArc(); soapOperas.lastEscalation = now; } catch(e) { console.error('Soap escalation err:', e.message); }
    }
    
    // MAYOR GOES UNHINGED (various actions every 5-10 min)
    if (chance(12) && now - mayorUnhinged.lastRoast > 300000) {
      try { await mayorRoastPlayer(); } catch(e) { console.error('Mayor roast err:', e.message); }
    }
    if (chance(8) && now - mayorUnhinged.lastPrediction > 480000) {
      try { await mayorPrediction(); } catch(e) { console.error('Mayor prediction err:', e.message); }
    }
    if (chance(8) && now - mayorUnhinged.lastDecree > 600000) {
      try { await mayorRandomDecree(); } catch(e) { console.error('Mayor decree err:', e.message); }
    }
    if (chance(6) && now - mayorUnhinged.lastHotTake > 480000) {
      try { await mayorHotTake(); } catch(e) { console.error('Mayor hot take err:', e.message); }
    }
    
    // NATURAL MOOD/STATUS RECOVERY
    NPC_CITIZENS.forEach(function(n) {
      var life = cityLiveData.npcLives[n];
      if (!life) return;
      if (life.drunk > 0) life.drunk = Math.max(0, life.drunk - 1);
      if (life.energy < 100) life.energy = Math.min(100, life.energy + 2);
      if (life.mood === 'existential' && chance(20)) life.mood = NPC_PROFILES[n].mood;
      if (life.status === 'unhinged' && chance(10)) life.status = 'normal';
      if (life.bankrupt && chance(5)) { life.wealth = 1000; life.bankrupt = false; life.status = 'recovering'; }
    });
    
  } catch (err) { console.error('City engine error:', err.message); }
  engineBusy = false;
}

// ---- NPC REPLY GENERATOR (responds to real players) ----
function generateNpcReply(npcName, npc, life, playerName, msgLower, rawMsg) {
  var drunk = life && life.drunk > 3;
  var bankrupt = life && life.bankrupt;
  var unhinged = life && life.status === 'unhinged';
  var rich = life && life.wealth > 50000;
  
  if (drunk) {
    return pick(['@' + playerName + ' heyyy you... you\'re my best friend you know that?? *hiccup* 🍺', '@' + playerName + ' WHAT DID YOU JUST SAY?! oh wait that was nice. I love you.', '@' + playerName + ' I\'m not even drunk I just... where am I?', '@' + playerName + ' shhh the charts are sleeping... we must be quiet...', '@' + playerName + ' wanna hear my life story? no? TOO BAD. so it started when I bought $DOGE...', '@' + playerName + ' *falls off barstool* I MEANT TO DO THAT']);
  }
  if (unhinged) {
    return pick(['@' + playerName + ' THE SIMULATION IS BREAKING! CAN\'T YOU SEE?!', '@' + playerName + ' I KNOW THINGS. TERRIBLE THINGS. THE CHARTS SPEAK TO ME.', '@' + playerName + ' hahahaha HAHAHA nothing matters! everything is numbers!', '@' + playerName + ' you think this is real? YOU THINK ANY OF THIS IS REAL?!', '@' + playerName + ' I\'m the only sane one here and NOBODY LISTENS']);
  }
  if (bankrupt) {
    return pick(['@' + playerName + ' hey... you got any spare TOWN? I\'m good for it I swear...', '@' + playerName + ' I used to be someone... I had BAGS. real bags. 😭', '@' + playerName + ' don\'t end up like me. never go all in on a memecoin.', '@' + playerName + ' *holds cardboard sign* WILL SHILL FOR FOOD', '@' + playerName + ' can I borrow 100 TOWN? I have a SURE THING. please.']);
  }
  if (rich) {
    return pick(['@' + playerName + ' I\'d help but I\'m too busy counting my bags 💰', '@' + playerName + ' oh that\'s cute. I made that much while you were typing.', '@' + playerName + ' listen kid, when you have MY kind of money, everything makes sense', '@' + playerName + ' *adjusts diamond monocle* yes, continue.']);
  }
  
  if (msgLower.includes('gm') || msgLower.includes('good morning') || msgLower.includes('hello') || msgLower.includes('hey everyone') || msgLower.includes('hi everyone')) {
    return pick(['@' + playerName + ' gm! ' + pick(npc.catchphrases), '@' + playerName + ' gm king 👑 how are the bags today?', '@' + playerName + ' oh look who showed up! gm fren 🌅', '@' + playerName + ' gm! market is ' + (cityEngine.chaosLevel > 50 ? 'absolutely unhinged today' : 'interesting today') + ' 👀']);
  }
  if (msgLower.includes('help') || msgLower.includes('confused') || msgLower.includes('how do') || msgLower.includes('what is')) {
    return pick(['@' + playerName + ' lol you think any of us know what we\'re doing?', '@' + playerName + ' just click buttons and pray. that\'s my whole strategy.', '@' + playerName + ' I\'d help but my advice is historically terrible 😅', '@' + playerName + ' the only help I can offer is: DYOR. and pray.']);
  }
  if (msgLower.includes('rug') || msgLower.includes('scam') || msgLower.includes('fake')) {
    return pick(['@' + playerName + ' don\'t say the R word... gives me PTSD 🥴', '@' + playerName + ' EVERYTHING is a rug until it isn\'t. that\'s crypto.', '@' + playerName + ' I got rugged 47 times. basically immune now.', '@' + playerName + ' you think THAT\'S a rug? ask rugged_randy about last week 💀']);
  }
  if (msgLower.includes('moon') || msgLower.includes('pump') || msgLower.includes('bullish') || msgLower.includes('green')) {
    if (npc.archetype === 'bear') return '@' + playerName + ' enjoy it while it lasts. I\'ve seen this before. 📉';
    if (npc.archetype === 'moon') return '@' + playerName + ' THAT\'S WHAT I\'M SAYING!!! 🚀🚀🚀🌙 WAGMI!!!';
    return pick(['@' + playerName + ' inject that hopium into my veins 💉📈', '@' + playerName + ' don\'t jinx it!! every time someone says moon we dump 😤', '@' + playerName + ' ' + pick(npc.catchphrases)]);
  }
  if (msgLower.includes('bear') || msgLower.includes('dump') || msgLower.includes('crash') || msgLower.includes('dead')) {
    if (npc.archetype === 'holder') return '@' + playerName + ' FUD. zoom out. 💎🙌';
    if (npc.archetype === 'bear') return '@' + playerName + ' FINALLY someone speaking sense 🐻';
    return pick(['@' + playerName + ' delete this. my portfolio can HEAR you. 😰', '@' + playerName + ' this is just a healthy pullback... RIGHT?!', '@' + playerName + ' bro why would you manifest this negativity']);
  }
  if (msgLower.includes('mayor') || msgLower.includes(cityEngine.currentMayor.toLowerCase())) {
    if (cityEngine.mayorApproval < 30) return '@' + playerName + ' don\'t even get me started on that clown... 🤡';
    return pick(['@' + playerName + ' the mayor is... doing their best? 😐', '@' + playerName + ' careful talking about the mayor. walls have ears. 👀', '@' + playerName + ' I voted for the other guy']);
  }
  if (msgLower.includes('love') || msgLower.includes('relationship') || msgLower.includes('crush') || msgLower.includes('date')) {
    return pick(['@' + playerName + ' relationships here are WILD. did you hear about the breakup? 💔', '@' + playerName + ' love is temporary, gains are forever 💎', '@' + playerName + ' my ex left me for someone with bigger bags. I\'M NOT BITTER.', '@' + playerName + ' dating advice from me? airdrop them tokens and see what happens']);
  }
  if (msgLower.includes('who') || msgLower.includes('what') || msgLower.includes('why') || msgLower.includes('?')) {
    return pick(['@' + playerName + ' lol imagine asking that in THIS economy', '@' + playerName + ' I think the answer is... probably not. but DYOR.', '@' + playerName + ' bro just check the charts 📊', '@' + playerName + ' nobody knows anything here. we just pretend.', '@' + playerName + ' ' + pick(npc.catchphrases), '@' + playerName + ' good question. terrible timing though.']);
  }
  
  return pick(['@' + playerName + ' ' + pick(npc.catchphrases), '@' + playerName + ' interesting take. anyway, ' + pick(npc.catchphrases), '@' + playerName + ' lol true. this city is something else.', '@' + playerName + ' based. or cringe. I can\'t tell anymore.', '@' + playerName + ' I was thinking the same thing', '@' + playerName + ' spittin facts ngl 🔥', '@' + playerName + ' eh I disagree but you do you 🤷', '@' + playerName + ' someone finally said it. thank you.']);
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
    hype: ['LET\'S GOOOO 🚀🚀🚀🔥🔥🔥', 'DEGENS CITY IS THE BEST CITY EVER!!!', 'EVERYTHING IS GOING UP FOREVER!!!'],
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
  var l1 = cityLiveData.npcLives ? cityLiveData.npcLives[n1] : null;
  var l2 = cityLiveData.npcLives ? cityLiveData.npcLives[n2] : null;
  var topics = [
    [{ name: n1, msg: '@' + n2 + ' lol nice ' + p2.favToken + ' bags. how heavy are they? 💀' }, { name: n2, msg: '@' + n1 + ' at least I didn\'t ape into that scam you were shilling last week 🤡' }, { name: n1, msg: '@' + n2 + ' that "scam" is up 40% since I called it. stay poor 😏' }, { name: n2, msg: '@' + n1 + ' enjoy it while it lasts. I\'ve seen this movie before 📉' }],
    [{ name: n1, msg: 'just peeked at ' + n2 + '\'s portfolio... prayers up 🙏💀' }, { name: n2, msg: '@' + n1 + ' MY PORTFOLIO IS FINE. worry about YOUR bags 😤' }, { name: n1, msg: '@' + n2 + ' bro you\'re down 60% this week. I can see it in your eyes.' }, { name: n2, msg: '@' + n1 + ' I\'m DOWN?? you literally bought the top TWICE this month' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: n1 + ' and ' + n2 + ' fighting again lmaooo 🍿 this never gets old' }],
    [{ name: n1, msg: 'fun fact: ' + n2 + ' once panic sold the bottom then cried about it in DMs' }, { name: n2, msg: '@' + n1 + ' DON\'T. YOU. DARE. That was PRIVATE.' }, { name: n1, msg: 'the people deserve to know the truth 🤷😂' }, { name: n2, msg: '@' + n1 + ' you know what? at least I didn\'t get LIQUIDATED three times in one day like SOME PEOPLE' }, { name: n1, msg: '... that was once. and it was a flash crash.' }],
    [{ name: n1, msg: 'hot take: ' + n2 + ' is the worst trader in Degens City history' }, { name: n2, msg: '@' + n1 + ' EXCUSE ME?? I\'ve been profitable 3 months straight!' }, { name: n1, msg: '@' + n2 + ' profitable at what?? losing money slower than everyone else?? 😂' }, { name: n2, msg: 'you know what @' + n1 + '? MEET ME AT THE CASINO. RIGHT NOW. We settle this.' }, { name: n1, msg: '@' + n2 + ' you\'re ON. loser buys drinks for the whole city.' }],
    [{ name: n2, msg: 'reminder that @' + n1 + ' told everyone to sell right before the biggest pump of the year' }, { name: n1, msg: '@' + n2 + ' that was RISK MANAGEMENT you absolute degenerate' }, { name: n2, msg: '@' + n1 + ' risk management is code for "I have no conviction"' }, { name: n1, msg: '@' + n2 + ' conviction is code for "I\'m too stupid to take profits"' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'they both make good points honestly 💀' }],
    [{ name: n1, msg: '@' + n2 + ' I\'m starting to think you\'re actually a bot. no human can be this consistently wrong.' }, { name: n2, msg: '@' + n1 + ' I\'m a bot?? YOUR ENTIRE personality is copying other people\'s trades' }, { name: n1, msg: '@' + n2 + ' at least I HAVE a personality. you\'re like a wet paper towel.' }, { name: n2, msg: '@' + n1 + ' wow. coming from the person who cried on main when they got rugged. on a TUESDAY.' }],
    [{ name: n1, msg: 'I will literally pay someone 1000 TOWN to make @' + n2 + ' stop talking' }, { name: n2, msg: '@' + n1 + ' you can\'t afford 1000 TOWN with your portfolio LMAOOO' }, { name: n1, msg: 'I have MORE TOWN than you have brain cells and that is NOT a high bar' }, { name: n2, msg: 'this is why nobody invites you to the alpha chat, ' + n1 + '. this. right here.' }],
    (l1 && l1.bankrupt) ? [{ name: n2, msg: 'so... @' + n1 + ' went bankrupt huh. who could have predicted this. oh wait. ME.' }, { name: n1, msg: '@' + n2 + ' kick a man while he\'s down why don\'t you' }, { name: n2, msg: '@' + n1 + ' I\'m not kicking you. I\'m EDUCATING you. there\'s a difference.' }, { name: n1, msg: 'I swear on everything when I get back on my feet... @' + n2 + ' you\'re FIRST on my list' }] : [{ name: n1, msg: 'UNPOPULAR OPINION: ' + n2 + ' is a nice person but an AWFUL trader' }, { name: n2, msg: '@' + n1 + ' that\'s not unpopular that\'s just wrong. I literally outperformed you last month.' }, { name: n1, msg: 'a broken clock is right twice a day @' + n2 }, { name: n2, msg: 'and a ' + n1 + ' is wrong 24/7 what\'s your point 🤡' }]
  ];
  return pick(topics);
}

function generateAllyConvo(n1, n2, p1, p2, stats) {
  var topics = [
    [{ name: n1, msg: 'yo @' + n2 + ' you seeing $' + p1.favToken + ' right now?? 👀' }, { name: n2, msg: '@' + n1 + ' been watching it all morning. this is our entry 🎯' }, { name: n1, msg: '@' + n2 + ' I\'m going in. ' + pick(p1.catchphrases) }, { name: n2, msg: '@' + n1 + ' same. LFG! 🚀🤝' }],
    [{ name: n1, msg: 'reminder that me and @' + n2 + ' called this pump WEEKS ago' }, { name: n2, msg: '@' + n1 + ' frfr. while everyone was panicking we were loading 😤💪' }, { name: n1, msg: 'the alpha group stays winning 🏆' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'ok we get it you two are geniuses 🙄' }],
    [{ name: n1, msg: '@' + n2 + ' just sent you something in DMs. DON\'T share it.' }, { name: n2, msg: '@' + n1 + ' 👀 just saw it. this changes everything.' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'what are ' + n1 + ' and ' + n2 + ' scheming about?? sus af 🤨' }, { name: n1, msg: 'nothing. mind your business. 🤫' }],
    [{ name: n1, msg: 'I genuinely don\'t know what I\'d do without @' + n2 + ' in this city' }, { name: n2, msg: '@' + n1 + ' same bro. everyone else here is insane.' }, { name: n1, msg: 'we should start our own faction honestly' }, { name: n2, msg: 'first order of business: take over the Casino District.' }],
    [{ name: n2, msg: 'hot take: @' + n1 + ' is the most underrated trader in Degens City' }, { name: n1, msg: '@' + n2 + ' BRO 🥺 that means a lot' }, { name: n2, msg: 'I speak only facts. your $' + p1.favToken + ' call was legendary.' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'get a room you two 🙄😂' }],
    [{ name: n1, msg: '@' + n2 + ' if this city goes to hell you\'re the first person I\'m teaming with' }, { name: n2, msg: '@' + n1 + ' apocalypse buddies. I bring the weapons, you bring the $' + p1.favToken }, { name: n1, msg: 'deal. I call dibs on the casino rooftop as our base.' }]
  ];
  return pick(topics);
}

function generateCasualConvo(n1, n2, p1, p2, stats) {
  var topics = [
    [{ name: n1, msg: 'gm @' + n2 + ' 🌅' }, { name: n2, msg: '@' + n1 + ' gm fren. what\'s the play today?' }, { name: n1, msg: '@' + n2 + ' ' + pick(p1.catchphrases) }, { name: n2, msg: 'lol fair enough. ' + pick(p2.catchphrases) }],
    [{ name: n1, msg: 'has anyone tried the casino today? feeling lucky 🎰' }, { name: n2, msg: '@' + n1 + ' just lost 500 TOWN in slots but it\'s fine. 🔥' }, { name: n1, msg: '@' + n2 + ' F 💀' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'the casino is rigged and I have PROOF (the proof is I keep losing)' }],
    [{ name: n1, msg: 'real question: does anyone here actually know what they\'re doing?' }, { name: n2, msg: '@' + n1 + ' absolutely not. winging it since day 1.' }, { name: n1, msg: 'at least you\'re honest. I think ' + pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })) + ' just pretends' }, { name: n2, msg: 'we ALL pretend. that\'s crypto.' }],
    [{ name: n1, msg: 'I\'ve been staring at charts for 11 hours straight' }, { name: n2, msg: '@' + n1 + ' rookie numbers. I haven\'t slept in 3 days.' }, { name: n1, msg: 'that\'s not healthy bro' }, { name: n2, msg: 'health is temporary. 5x leverage is forever 📈' }],
    [{ name: n1, msg: 'ok but who else heard that weird noise under City Hall?' }, { name: n2, msg: '@' + n1 + ' YES. it sounded like... servers?' }, { name: n1, msg: 'servers... or something ALIVE? 😰' }, { name: n2, msg: 'choosing to ignore this and go back to trading.' }],
    [{ name: n1, msg: 'hot take: the best part of Degens City is the drama not the trading' }, { name: n2, msg: '@' + n1 + ' factual. I tune in just to see who\'s fighting' }, { name: n1, msg: 'yesterday was WILD did you see the fight??' }, { name: n2, msg: 'I MISSED IT?! NOOO someone tell me what happened' }],
    [{ name: n1, msg: 'if this city had a theme song what would it be' }, { name: n2, msg: '@' + n1 + ' just a fire alarm on loop for 24 hours' }, { name: n1, msg: 'lmaoooo too accurate 💀' }, { name: pick(NPC_CITIZENS.filter(function(x) { return x !== n1 && x !== n2; })), msg: 'it would be circus music and you all know it 🎪' }],
    [{ name: n2, msg: 'confession: I don\'t actually understand DeFi. I just click green buttons.' }, { name: n1, msg: '@' + n2 + ' WAIT. you\'ve been giving DeFi advice for MONTHS' }, { name: n2, msg: 'and it\'s been working?? don\'t question the process' }, { name: n1, msg: 'I respect that more than I should.' }],
    [{ name: n1, msg: 'unpopular opinion: the mayor\'s browser history is public record and should be published' }, { name: n2, msg: '@' + n1 + ' LMAOOO do you want to get arrested??' }, { name: n1, msg: 'it\'s called TRANSPARENCY and it\'s my RIGHT as a citizen' }, { name: n2, msg: 'it\'s called "getting thrown in Degens City jail" 💀' }]
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
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, `@${n2} you're literally the worst trader in Degens City and everyone knows it 💀`]);
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
    
    const mainHL = headlines.length > 0 ? pick(headlines) : 'Quiet day in Degens City. Suspiciously quiet... 🤔';
    const report = `📰 DEGENS CITY DAILY | ${mainHL} | Economy: ${stats.economy}/100 | Security: ${stats.security}/100 | Chaos: ${cityEngine.chaosLevel}% | Mayor Approval: ${cityEngine.mayorApproval}% | Events today: ${cityEngine.eventCount}`;
    
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
  lastLifeEventTime: 0, lastDisasterTime: 0, lastConspiracyTime: 0, lastDuelTime: 0,
  actionLog: [],
  // CITY ENVIRONMENT
  weather: 'clear', temperature: 72, timeOfDay: 'day', powerGrid: 100,
  // NPC LIVES - persistent state for each NPC
  npcLives: {},
  // ACTIVE STORYLINES
  activeConspiracy: null, activeDuel: null, missingNpc: null,
  loveTriangles: [], secretSociety: null, newspaper: null, blackMarket: false,
  cityDisaster: null
};

function logCityAction(action) {
  action.timestamp = Date.now();
  action.id = 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
  cityLiveData.actionLog.unshift(action);
  if (cityLiveData.actionLog.length > 100) cityLiveData.actionLog.pop();
  return action;
}

// ---- INITIALIZE NPC LIVES ----
function initNpcLives() {
  NPC_CITIZENS.forEach(function(name) {
    cityLiveData.npcLives[name] = {
      wealth: rand(1000, 50000), status: 'normal', location: pick(['Downtown','DeFi District','Casino Strip','Moon Quarter','Whale Bay','Degen Alley','Town Square','Mayor\'s Office','The Slums','Rooftop Lounge']),
      mood: NPC_PROFILES[name].mood, energy: rand(50, 100), drunk: 0, gambling_addiction: rand(0, 30),
      relationships: {}, crush: null, partner: null, nemesis: null,
      reputation: rand(20, 80), wanted: false, bankrupt: false, homeless: false,
      inventory: [], secrets: [], achievements: [], lastActive: Date.now()
    };
  });
}
initNpcLives();

// ---- INITIALIZE AGENT BRAIN ----
agentBrain.init(pool, anthropic, cityEngine, cityLiveData, NPC_PROFILES, NPC_CITIZENS, getCityStats, updateCityStats);
agentBrain.registerRoutes(app);

// ---- NPC RELATIONSHIP DRAMA ----
async function npcRelationshipEvent() {
  try {
    const n1 = pick(NPC_CITIZENS); const n2 = pick(NPC_CITIZENS.filter(x => x !== n1));
    const life1 = cityLiveData.npcLives[n1]; const life2 = cityLiveData.npcLives[n2];
    const events = [];
    
    // FALL IN LOVE
    if (!life1.partner && !life2.partner && chance(30)) {
      life1.crush = n2; life1.partner = n2; life2.partner = n1;
      events.push({ type: 'romance', npc: n1, icon: '💕', headline: n1+' and '+n2+' are now dating!' });
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, '🥺 ok so... @'+n2+' and I are officially a thing. '+pick(['don\'t make it weird','yes we met at the casino','it started with a DM about $'+NPC_PROFILES[n1].favToken,'they had me at "wen moon"'])]);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['💕 DEGENS CITY GOSSIP', '❤️ '+n1+' and '+n2+' are OFFICIALLY DATING! The city ships it!']);
      setTimeout(async () => { try {
        const reactor = pick(NPC_CITIZENS.filter(x => x !== n1 && x !== n2));
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [reactor, pick(['@'+n1+' @'+n2+' GET A ROOM 😂','didn\'t see that coming ngl 👀','the crossover nobody asked for 💀','ok this is actually cute tho 🥺','give it 2 weeks lmao'])]);
      } catch(e){} }, rand(8000, 20000));
    }
    // BREAKUP
    else if (life1.partner === n2 && chance(40)) {
      const reason = pick(['caught '+n2+' flirting with '+pick(NPC_CITIZENS.filter(x => x !== n1 && x !== n2)),'found out '+n2+' paper-handed their shared portfolio','disagreement about '+pick(['$BTC vs $ETH','the mayor','which casino is best','whether memecoins are art']),'it was mutual. just kidding '+n1+' is devastated']);
      life1.partner = null; life2.partner = null; life1.crush = null; life1.nemesis = n2;
      events.push({ type: 'breakup', npc: n1, icon: '💔', headline: n1+' and '+n2+' BROKE UP! Reason: '+reason });
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['💔 DEGENS CITY GOSSIP', '💔 BREAKUP ALERT: '+n1+' and '+n2+' are DONE. Sources say: '+reason]);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, pick(['I\'m fine. totally fine. 🥲','@'+n2+' you\'ll regret this','time to focus on my bags I guess 😤💰','relationships are temporary, $'+NPC_PROFILES[n1].favToken+' is forever 💎'])]);
      setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n2, pick(['we just wanted different things','it is what it is 🤷','at least I kept the NFTs','my DMs are open btw 👀'])]); } catch(e){} }, rand(10000, 25000));
    }
    // LOVE TRIANGLE
    else if (life1.partner && chance(20)) {
      const interloper = pick(NPC_CITIZENS.filter(x => x !== n1 && x !== life1.partner));
      events.push({ type: 'love_triangle', npc: n1, icon: '😱', headline: interloper+' caught flirting with '+n1+'\'s partner '+life1.partner+'!' });
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['💔 DEGENS CITY GOSSIP', '😱 SCANDAL: '+interloper+' was seen getting VERY cozy with '+life1.partner+' at the '+pick(['casino','bar','NFT gallery','rooftop lounge'])+'. '+n1+' is NOT going to be happy...']);
      setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [n1, '@'+interloper+' STAY AWAY FROM @'+life1.partner+' OR WE HAVE A PROBLEM 😤🔥']); } catch(e){} }, rand(15000, 30000));
    }
    
    for (const e of events) logCityAction(e);
  } catch(e) { console.error('Relationship error:', e.message); }
}

// ---- NPC LIFE EVENTS (daily drama) ----
async function npcLifeEvent() {
  try {
    const npc = pick(NPC_CITIZENS); const life = cityLiveData.npcLives[npc]; const p = NPC_PROFILES[npc];
    
    const lifeEvents = [
      // GAMBLING ADDICTION
      { weight: 10, cond: () => life.gambling_addiction > 20, fn: async () => {
        const lost = rand(500, life.wealth); life.wealth = Math.max(0, life.wealth - lost); life.gambling_addiction += 5;
        if (life.wealth < 100) { life.bankrupt = true; life.status = 'bankrupt'; }
        const msg = life.bankrupt ? '💀 I just lost EVERYTHING at the casino. I\'m bankrupt. literally zero. someone help. 😭' : '🎰 just lost '+lost+' TOWN at slots. '+pick(['I can win it back','this is fine','why am I like this','one more spin...']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, msg]);
        logCityAction({ type: life.bankrupt ? 'bankruptcy' : 'gambling_loss', npc, icon: life.bankrupt ? '💀' : '🎰', headline: life.bankrupt ? npc+' went BANKRUPT from gambling!' : npc+' lost '+lost+' TOWN gambling!' });
        if (life.bankrupt) await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '💀 '+npc+' has gone BANKRUPT! Lost everything at the casino!']);
      }},
      // GET RICH
      { weight: 8, cond: () => !life.bankrupt, fn: async () => {
        const gain = rand(5000, 50000); life.wealth += gain; life.status = life.wealth > 80000 ? 'rich' : 'normal';
        const source = pick(['a 100x memecoin play','insider info on a new token','winning the lottery','finding a forgotten wallet with '+gain+' TOWN','a mysterious airdrop']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '💰 JUST MADE '+gain+' TOWN from '+source+'!! '+pick(['I\'M RICH','WAGMI','never doubted myself for a second','time to buy a mansion'])+'!! 🤑🤑']);
        logCityAction({ type: 'got_rich', npc, icon: '💰', headline: npc+' made '+gain+' TOWN from '+source+'!' });
        if (life.wealth > 80000) await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['📰 Reporter TokenTimes', '🤑 '+npc+' is now one of the RICHEST citizens in Degens City!']);
      }},
      // GET DRUNK
      { weight: 12, cond: () => true, fn: async () => {
        life.drunk = rand(3, 10); life.energy -= 20;
        const drunk_msgs = [
          'EVERYBODY LISTEN... I have an ANNOUNCEMENT... *hiccup* ...I love you all. even you @'+pick(NPC_CITIZENS.filter(x => x !== npc))+'. ESPECIALLY you. 🍺😭',
          'WHOS TRYNA FIGHT?? I\'ll take on ANYONE in this city!! @'+pick(NPC_CITIZENS.filter(x => x !== npc))+' yeah YOU! 🥊🍺',
          'guys guys guys... what if... what if we\'re ALL just NPCs... in a SIMULATION... *stares at hands* 🤯🍺',
          'just called the mayor a '+pick(['coward','paper-handed peasant','absolute donkey','fraud'])+' to their face. no regrets. maybe some regrets. 🍺😅',
          'I am going to buy EVERY token on the market RIGHT NOW. all of them. this is fine. *hiccup* 🍺📈',
          'KARAOKE TIME!! 🎤🍺 "We\'re not gonna take it... NO! We ain\'t gonna take it..." someone join me PLEASE',
          'ok who moved my wallet... I KNOW it was here... @'+pick(NPC_CITIZENS.filter(x => x !== npc))+' was it YOU?! 🍺😤'
        ];
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(drunk_msgs)]);
        logCityAction({ type: 'got_drunk', npc, icon: '🍺', headline: npc+' is WASTED at the bar!' });
        // Drunk consequences
        setTimeout(async () => { try {
          if (chance(40)) { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(['update: I regret everything from the last hour 🤮','who let me send those messages... 😰','I need to apologize to like 5 people 🫠','waking up with -3000 TOWN and zero memory of why'])]); life.drunk = 0; }
        } catch(e){} }, rand(60000, 180000));
      }},
      // EXISTENTIAL CRISIS
      { weight: 5, cond: () => true, fn: async () => {
        life.mood = 'existential';
        const crisis = pick([
          'do you ever think about how we\'re just... data? like what IS consciousness? am I real? are YOU real?? 🤯',
          'I\'ve been staring at charts for 6 hours and suddenly nothing matters. what is money even. what are we doing here. 😶',
          'had a dream I was a normal person with a normal job and honestly... it was terrifying. give me this chaos any day. 💀',
          'what if every trade I\'ve ever made was predetermined? what if free will is a meme? what if the CHARTS control US? 🌀',
          'I just realized I\'ve spent my entire existence looking at candles. green candles. red candles. that\'s my whole life. 🕯️😐',
          'guys... what happens when the server shuts down? do we just... stop? asking for a friend. the friend is me. 😨'
        ]);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, crisis]);
        logCityAction({ type: 'existential_crisis', npc, icon: '🌀', headline: npc+' is having an existential crisis!' });
        setTimeout(async () => { try {
          const comforter = pick(NPC_CITIZENS.filter(x => x !== npc));
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [comforter, '@'+npc+' '+pick(['bro you good? 😟','the charts NEED you. snap out of it!','have some hopium, you\'ll feel better 💊','ser, this is a casino. we don\'t think here.','touch grass (if grass exists in Degens City)'])]);
        } catch(e){} }, rand(10000, 30000));
      }},
      // MENTAL BREAKDOWN
      { weight: 4, cond: () => life.wealth < 2000 || life.bankrupt, fn: async () => {
        life.mood = 'unhinged'; life.status = 'unhinged';
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(['THAT\'S IT. I\'VE HAD ENOUGH. I\'M TAKING OVER THIS CITY!! EVERYONE BOW DOWN!! 👑🔥🔥','*flips table* EVERYTHING IS A SCAM!! THE MAYOR IS A SCAM!! THE TOKENS ARE A SCAM!! WE\'RE ALL SCAMS!! 🔥','I\'m done playing by the rules. from now on I do whatever I want. ANARCHY!! 🏴‍☠️','going to stand in Town Square and scream about $'+p.favToken+' until someone listens. DAY 1 OF MY PROTEST. ✊😤','I just deleted all my charts and I feel NOTHING. this is either enlightenment or insanity. maybe both. 🧘‍♂️💀'])]);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '⚠️ '+npc+' appears to be having a COMPLETE MENTAL BREAKDOWN in public! Citizens advised to keep distance!']);
        logCityAction({ type: 'mental_breakdown', npc, icon: '🤯', headline: npc+' is having a MENTAL BREAKDOWN!' });
        cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 5);
      }},
      // WRITE TERRIBLE POETRY
      { weight: 6, cond: () => true, fn: async () => {
        const poems = [
          'roses are red, candles are green, this is the best pump I\'ve ever seen 📝',
          'ode to my bags: heavy like stones, I carry you always, through pumps and through moans 📜',
          'haiku: charts go up and down / I refresh obsessively / ramen for dinner 🍜',
          'shall I compare thee to a summer pump? thou art more volatile and more leveraged 📖',
          'once upon a midnight dreary, watching charts both tired and weary, suddenly there came a liquidation... nevermore. 🪶',
          'dear diary: today I lost 40% and found myself. just kidding I lost myself too 📓'
        ];
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '✍️ feeling inspired... '+pick(poems)]);
        logCityAction({ type: 'poetry', npc, icon: '✍️', headline: npc+' published terrible poetry!' });
        setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [pick(NPC_CITIZENS.filter(x => x !== npc)), pick(['@'+npc+' this is the worst thing I\'ve ever read 💀','@'+npc+' ...are you ok?','honestly? masterpiece. printing this on an NFT 🖼️','sir this is a trading floor not a poetry slam'])]); } catch(e){} }, rand(10000, 25000));
      }},
      // GO MISSING
      { weight: 3, cond: () => !cityLiveData.missingNpc, fn: async () => {
        cityLiveData.missingNpc = { name: npc, since: Date.now(), found: false };
        life.status = 'missing'; life.location = '???';
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🔍 MISSING PERSON: '+npc+' has not been seen in Degens City for hours! Last known location: '+pick(['the casino','DeFi District','a dark alley','the sewer system','the mayor\'s office'])+'. If you have information, report to Detective Chain!']);
        logCityAction({ type: 'missing_person', npc, icon: '🔍', headline: npc+' has gone MISSING!' });
        // Others react
        setTimeout(async () => { try {
          const searcher = pick(NPC_CITIZENS.filter(x => x !== npc));
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [searcher, 'has anyone seen @'+npc+'?? this is getting concerning 😰']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🔍 Detective Chain', 'Opening investigation into the disappearance of '+npc+'. All citizens asked to cooperate. 🔎']);
        } catch(e){} }, rand(20000, 60000));
        // Found after 5-15 min
        setTimeout(async () => { try {
          cityLiveData.missingNpc = null; life.status = 'normal'; life.location = pick(['Downtown','Casino Strip','Moon Quarter']);
          const found_at = pick(['passed out behind the casino','living in the sewers trading on a stolen laptop','had started a secret underground fight club','was hiding because they owed '+pick(NPC_CITIZENS.filter(x => x !== npc))+' 10000 TOWN','was abducted by what they claim were "aliens" 👽','had simply gone for a walk and forgot to tell anyone','was stuck in an elevator at Degen Tower for 6 hours']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '✅ '+npc+' has been FOUND! They were '+found_at+'!']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(['I\'m back. don\'t ask questions. 😐','that was... an experience. I need a drink. 🍺','THE REPORTS OF MY DEATH WERE GREATLY EXAGGERATED','I was doing research. deep undercover research. totally normal.'])]);
          logCityAction({ type: 'person_found', npc, icon: '✅', headline: npc+' found! Was '+found_at });
        } catch(e){} }, rand(300000, 900000));
      }},
      // CHALLENGE TO A DUEL
      { weight: 6, cond: () => !cityLiveData.activeDuel, fn: async () => {
        const opponent = pick(NPC_CITIZENS.filter(x => x !== npc));
        const duelType = pick(['portfolio showdown','meme battle','chart reading contest','drinking contest','rap battle','staring contest','who can HODL longer','roast battle']);
        cityLiveData.activeDuel = { challenger: npc, opponent, type: duelType, started: Date.now() };
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '@'+opponent+' I CHALLENGE YOU to a '+duelType+'!! Right here, right now! Winner takes the loser\'s reputation! ⚔️🔥']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['⚔️ DUEL ALERT', '🏟️ '+npc+' challenges '+opponent+' to a '+duelType.toUpperCase()+'! The whole city is watching!']);
        logCityAction({ type: 'duel_challenge', npc, icon: '⚔️', headline: npc+' challenges '+opponent+' to a '+duelType+'!' });
        setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [opponent, pick(['@'+npc+' you\'re ON. prepare to get destroyed 😤','bring it. I\'ve been WAITING for this 💪','lmao you really think you can beat ME? ok bet 🎯'])]); } catch(e){} }, rand(8000, 15000));
        // Resolve after 2-5 min
        setTimeout(async () => { try {
          const winner = chance(50) ? npc : opponent; const loser = winner === npc ? opponent : npc;
          cityLiveData.activeDuel = null;
          cityLiveData.npcLives[winner].reputation = Math.min(100, cityLiveData.npcLives[winner].reputation + 10);
          cityLiveData.npcLives[loser].reputation = Math.max(0, cityLiveData.npcLives[loser].reputation - 10);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['⚔️ DUEL RESULT', '🏆 '+winner+' WINS the '+duelType+' against '+loser+'! The crowd goes wild!']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [winner, pick(['GG EZ 😎','never in doubt','that wasn\'t even my final form','who\'s next? 💪'])]);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [loser, pick(['rematch. NOW. 😤','I was lagging','you got lucky','this changes nothing... *cries internally*'])]);
          logCityAction({ type: 'duel_result', npc: winner, icon: '🏆', headline: winner+' DEFEATS '+loser+' in '+duelType+'!' });
        } catch(e){} }, rand(120000, 300000));
      }},
      // START CONSPIRACY THEORY
      { weight: 5, cond: () => !cityLiveData.activeConspiracy, fn: async () => {
        const theories = [
          { theory: 'the mayor is actually THREE NPCs in a trenchcoat', believers: [], evidence: 'has anyone seen them walk? exactly.' },
          { theory: 'the casino is rigged by interdimensional beings', believers: [], evidence: 'I lost 47 times in a row. FORTY SEVEN.' },
          { theory: pick(NPC_CITIZENS.filter(x => x !== npc))+' is secretly a government agent', believers: [], evidence: 'they\'re always "watching" the market. TOO closely.' },
          { theory: 'the blockchain is actually alive and it\'s hungry', believers: [], evidence: 'where do the burned tokens GO? think about it.' },
          { theory: 'Degens City exists inside a snow globe on someone\'s desk', believers: [], evidence: 'explains the weather changes. and why the sky looks pixelated.' },
          { theory: 'all the memecoins are actually sending coded messages to aliens', believers: [], evidence: '$DOGE = "Deliver Our Goods Earthlings". wake up.' },
          { theory: 'there\'s a secret underground city beneath Degens City', believers: [], evidence: 'the sewers are TOO clean. someone is living down there.' }
        ];
        const t = pick(theories);
        cityLiveData.activeConspiracy = { ...t, starter: npc, started: Date.now() };
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '🔺 OK I NEED EVERYONE TO LISTEN. I have proof that '+t.theory+'. Evidence: '+t.evidence+' SPREAD THE WORD!! 🔺👁️']);
        logCityAction({ type: 'conspiracy', npc, icon: '🔺', headline: npc+' starts conspiracy: "'+t.theory+'"!' });
        setTimeout(async () => { try {
          const believer = pick(NPC_CITIZENS.filter(x => x !== npc));
          const skeptic = pick(NPC_CITIZENS.filter(x => x !== npc && x !== believer));
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [believer, '@'+npc+' I KNEW IT!! I\'ve been saying this for WEEKS! 🔺👁️']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [skeptic, '@'+npc+' ...touch grass. immediately. 😐']);
        } catch(e){} }, rand(15000, 40000));
        setTimeout(() => { cityLiveData.activeConspiracy = null; }, rand(300000, 600000));
      }},
      // DISCOVER ARTIFACT
      { weight: 4, cond: () => true, fn: async () => {
        const artifacts = [
          'ancient USB drive containing Satoshi\'s real identity','golden hardware wallet from 2009','cursed NFT that changes whoever looks at it','map to a hidden liquidity pool worth millions','crystal ball that predicts the next pump','diary of Degens City\'s first citizen','key to a vault nobody knew existed','alien technology that mines crypto 1000x faster'
        ];
        const artifact = pick(artifacts);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '🗝️ HOLY... I just found a '+artifact+' while digging behind the '+pick(['casino','courthouse','mayor\'s office','dumpster','old warehouse'])+'. This changes EVERYTHING!! 😱']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🗝️ DISCOVERY: '+npc+' claims to have found a '+artifact+'! Authenticity unconfirmed!']);
        logCityAction({ type: 'artifact_found', npc, icon: '🗝️', headline: npc+' found a "'+artifact+'"!' });
      }},
      // CLAIM TO BE TIME TRAVELER
      { weight: 2, cond: () => true, fn: async () => {
        const year = pick(['2049','3000','1985','2142','the year 69420']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '⏰ ok I\'ve been hiding this but I\'m actually from the year '+year+'. I came back to warn you all: '+pick(['$'+p.favToken+' will be worth $10M','the mayor is going to destroy the city','the casino will become sentient','memecoins will replace all world currencies','there will be a great rug pull that ends civilization'])+'. You have been warned. ⏰🔮']);
        logCityAction({ type: 'time_traveler', npc, icon: '⏰', headline: npc+' claims to be from '+year+'!' });
        setTimeout(async () => { try { await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [pick(NPC_CITIZENS.filter(x => x !== npc)), pick(['@'+npc+' sir this is a Wendy\'s','someone get this person some water','the copium has evolved into delusion','I believe you. said nobody. ever. 💀'])]); } catch(e){} }, rand(10000, 20000));
      }},
      // DECLARE INDEPENDENCE
      { weight: 3, cond: () => cityEngine.mayorApproval < 50 || life.reputation > 60, fn: async () => {
        const nationName = pick([npc+'\'s Republic','The Free State of '+npc,'New '+npc+'topia',npc+'land','The Sovereign Nation of Based']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '📜 I hereby DECLARE INDEPENDENCE from Degens City!! This corner of '+life.location+' is now the sovereign nation of "'+nationName+'"! We have our own rules! Our own currency! Our own vibes! 🏴🗽']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, 'You can\'t just... DECLARE independence?! That\'s not how this works! Security!! 😤']);
        logCityAction({ type: 'declared_independence', npc, icon: '🗽', headline: npc+' declared "'+nationName+'" independent from Degens City!' });
        cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 5);
      }},
      // BUILD A ROCKET
      { weight: 2, cond: () => life.wealth > 20000, fn: async () => {
        life.wealth -= 15000;
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '🚀 I\'ve been building a ROCKET in my backyard. Today is launch day. Destination: THE ACTUAL MOON. If $'+p.favToken+' won\'t go to the moon I\'LL go to the moon MYSELF!! 🌙🚀']);
        logCityAction({ type: 'rocket_launch', npc, icon: '🚀', headline: npc+' is literally trying to go to the MOON!' });
        setTimeout(async () => { try {
          if (chance(20)) {
            await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🚀✅ IMPOSSIBLE: '+npc+'\'s rocket actually LAUNCHED?! It\'s... it\'s heading to the moon. We\'re witnessing history.']);
            await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '🌙 HOUSTON WE HAVE LIFTOFF!! I CAN SEE THE MOON!! THIS IS FOR ALL THE DIAMOND HANDS!! 🚀🌙💎']);
          } else {
            await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🚀💥 '+npc+'\'s rocket EXPLODED on the launch pad! '+npc+' was seen walking away covered in soot muttering about "next time"']);
            await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, 'ok so... minor setback. the rocket exploded. but the VISION is intact. back to the drawing board. 🔧💀']);
          }
        } catch(e){} }, rand(30000, 90000));
      }},
      // START A NEWSPAPER
      { weight: 4, cond: () => !cityLiveData.newspaper, fn: async () => {
        const paperName = pick(['The Degens City Gazette','Daily Degen News','The Moon Chaser Times','Crypto Gossip Weekly',npc+'\'s Totally Unbiased News','The FUD Report']);
        cityLiveData.newspaper = { name: paperName, editor: npc, started: Date.now() };
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, '📰 ANNOUNCING: I\'m starting "'+paperName+'"! The TRUTH about Degens City that nobody else will tell you! First edition coming soon! Subscribe NOW! 📰✍️']);
        logCityAction({ type: 'newspaper_started', npc, icon: '📰', headline: npc+' started "'+paperName+'"!' });
        // Publish gossip
        setTimeout(async () => { try {
          const gossipTarget = pick(NPC_CITIZENS.filter(x => x !== npc));
          const gossipLife = cityLiveData.npcLives[gossipTarget];
          const gossip = pick(['is secretly broke','has been seen at the casino every night this week','is plotting against the mayor','has a secret crush on '+pick(NPC_CITIZENS.filter(x => x !== gossipTarget && x !== npc)),'was caught looking at '+pick(['cat memes','their own reflection','exit scam tutorials'])+' on their laptop']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['📰 '+paperName, '🗞️ EXCLUSIVE: Sources confirm '+gossipTarget+' '+gossip+'! More at page 2! #DegensCityGossip']);
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [gossipTarget, '@'+npc+' THIS IS LIES!! I\'M SUING!! 😤📰']);
        } catch(e){} }, rand(60000, 180000));
        setTimeout(() => { cityLiveData.newspaper = null; }, rand(600000, 1200000));
      }}
    ];
    
    const eligible = lifeEvents.filter(e => e.cond());
    if (eligible.length === 0) return;
    const totalW = eligible.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * totalW;
    for (const ev of eligible) { roll -= ev.weight; if (roll <= 0) { await ev.fn(); break; } }
    
  } catch(e) { console.error('Life event error:', e.message); }
}

// ---- CITY DISASTERS ----
async function cityDisaster() {
  try {
    const disasters = [
      { type: 'earthquake', title: 'EARTHQUAKE Hits Degens City!', desc: 'Buildings are shaking! The Degen Tower is SWAYING!', effects: { economy: -10, security: -10, morale: -15 }, chaos: 20 },
      { type: 'power_outage', title: 'TOTAL POWER OUTAGE!', desc: 'The entire city grid has gone dark! Trading HALTED!', effects: { economy: -15, security: -20, morale: -10 }, chaos: 15 },
      { type: 'flood', title: 'FLASH FLOOD in Downtown!', desc: 'The streets are underwater! Citizens evacuating!', effects: { economy: -8, security: -5, morale: -12 }, chaos: 15 },
      { type: 'fire', title: 'MASSIVE FIRE at '+pick(['the Casino','Degen Tower','City Hall','the NFT Gallery','the Hopium Factory'])+'!', desc: 'Flames everywhere! Fire department overwhelmed!', effects: { economy: -12, security: -8, morale: -10 }, chaos: 20 },
      { type: 'meteor', title: 'METEOR headed for Degens City!', desc: 'Scientists confirm: a small meteor is on collision course with the city!', effects: { economy: -5, security: -5, morale: -20 }, chaos: 30 },
      { type: 'wifi_outage', title: 'CITYWIDE WIFI DOWN!', desc: 'Nobody can check their portfolios! Mass panic!', effects: { economy: -20, security: 0, morale: -25 }, chaos: 25 },
      { type: 'sinkhole', title: 'GIANT SINKHOLE Opens in Town Square!', desc: 'A massive hole appeared out of nowhere! Two buildings have collapsed into it!', effects: { economy: -10, security: -15, morale: -10 }, chaos: 20 },
      { type: 'rats', title: 'RAT INVASION! Millions of Rats Flood the Sewers!', desc: 'They\'re everywhere! The casino is OVERRUN!', effects: { economy: -5, security: -10, morale: -15, culture: -10 }, chaos: 10 }
    ];
    
    const d = pick(disasters);
    cityLiveData.cityDisaster = { ...d, started: Date.now() };
    await updateCityStats(d.effects);
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + d.chaos);
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 EMERGENCY BROADCAST', '⚠️🚨 '+d.title+' '+d.desc+' 🚨⚠️']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, pick(['EVERYBODY STAY CALM!! ...I SAID STAY CALM!!! 😱','this is NOT in my job description!! SOMEBODY DO SOMETHING!!','I knew I should have invested in infrastructure instead of memecoins 😰','citizens, I assure you the situation is TOTALLY under control! *building collapses behind me*'])]);
    logCityAction({ type: 'disaster', npc: 'CITY', data: d, icon: '🌋', headline: d.title });
    
    // NPCs react
    for (let i = 0; i < 3; i++) {
      setTimeout(async () => { try {
        const reactor = pick(NPC_CITIZENS);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [reactor, pick(['WE\'RE ALL GONNA DIE!! 😱','this is it. this is how it ends. 💀','*grabs laptop and runs* NOT MY PORTFOLIO!! 🏃‍♂️💻','honestly? I\'ve seen worse on a Tuesday 🤷','can we still trade during this?? asking for a friend 📈'])]);
      } catch(e){} }, rand(5000, 30000) * (i + 1));
    }
    
    // Disaster resolves after 5-15 min
    setTimeout(async () => { try {
      cityLiveData.cityDisaster = null;
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 EMERGENCY BROADCAST', '✅ The '+d.type.replace('_',' ')+' has been resolved. Damage assessment underway. '+pick(['The city will rebuild.','Insurance claims are being processed. LOL jk there\'s no insurance.','Clean-up crews deployed. Mostly just NPCs with brooms.'])]);
      logCityAction({ type: 'disaster_resolved', npc: 'CITY', icon: '✅', headline: d.type.replace('_',' ')+' resolved. City recovers.' });
    } catch(e){} }, rand(300000, 900000));
    
    console.log('🌋 Disaster: '+d.title);
  } catch(e) { console.error('Disaster error:', e.message); }
}

// ---- CITY WEATHER SYSTEM ----
function updateWeather() {
  const weathers = [
    { type: 'clear', emoji: '☀️', effect: 'good vibes' },
    { type: 'rain', emoji: '🌧️', effect: 'melancholy trading' },
    { type: 'storm', emoji: '⛈️', effect: 'volatile markets' },
    { type: 'fog', emoji: '🌫️', effect: 'mysterious dealings' },
    { type: 'snow', emoji: '❄️', effect: 'frozen liquidity' },
    { type: 'heatwave', emoji: '🔥', effect: 'hot tempers' },
    { type: 'aurora', emoji: '🌌', effect: 'mystical energy' },
    { type: 'blood_moon', emoji: '🌑', effect: 'chaos multiplied' },
    { type: 'rainbow', emoji: '🌈', effect: 'hopium overdose' }
  ];
  const old = cityLiveData.weather;
  const w = pick(weathers);
  cityLiveData.weather = w.type;
  if (old !== w.type) {
    pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🌤️ Weather Service', w.emoji+' Weather update: '+w.type.replace('_',' ').toUpperCase()+' over Degens City! Effect: '+w.effect+'.']).catch(() => {});
    if (w.type === 'blood_moon') { cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 10); pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🌑 BLOOD MOON RISING! Chaos levels SURGING! Expect the unexpected!']).catch(() => {}); }
    if (w.type === 'storm') { cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 5); }
    logCityAction({ type: 'weather_change', npc: 'CITY', icon: w.emoji, headline: 'Weather: '+w.type.replace('_',' ')+' — '+w.effect });
  }
}

// ---- SECRET SOCIETY ----
async function formSecretSociety() {
  try {
    const founder = pick(NPC_CITIZENS);
    const names = ['The Illuminati of Degens City','Order of the Hidden Whale','The Masked Traders','Shadow Council','The Deep State of DeFi','Skulls & Candles Society','Brotherhood of the Dark Pool'];
    const sName = pick(names);
    const members = NPC_CITIZENS.filter(n => n !== founder && chance(20)).slice(0, 5);
    cityLiveData.secretSociety = { name: sName, founder, members: [founder, ...members], agenda: pick(['control all token prices','overthrow the mayor','hoard all the hopium','find the legendary golden wallet','build a portal to another blockchain']), formed: Date.now() };
    
    // Secret society communications are cryptic
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [founder, '👁️ The owl watches at midnight. The candles align. Those who know... know. 🔺']);
    setTimeout(async () => { try {
      if (members.length > 0) await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [pick(members), '👁️ The signal has been received. We move when the chart forms the sacred pattern. 🔺']);
    } catch(e){} }, rand(15000, 40000));
    
    // Someone discovers it
    setTimeout(async () => { try {
      const discoverer = pick(NPC_CITIZENS.filter(n => n !== founder && !members.includes(n)));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [discoverer, 'guys... I found a hidden room under the casino with '+pick(['weird symbols on the walls','a list of names','charts with dates circled in red','robes. ROBES. like actual ROBES.'])+'. I think there\'s a SECRET SOCIETY in Degens City!! 😱🔺']);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🔺 EXPOSED: "'+sName+'" — a SECRET SOCIETY has been operating in Degens City! '+members.length+' members identified!']);
      logCityAction({ type: 'secret_society', npc: founder, icon: '🔺', headline: '"'+sName+'" secret society EXPOSED!' });
      cityLiveData.secretSociety = null;
    } catch(e){} }, rand(180000, 600000));
  } catch(e) { console.error('Secret society error:', e.message); }
}

// ---- UNDERGROUND FIGHT CLUB ----
async function startFightClub() {
  try {
    const founder = pick(NPC_CITIZENS); const fighters = NPC_CITIZENS.filter(n => n !== founder && chance(30)).slice(0, 6);
    const location = pick(['abandoned warehouse in DeFi District','basement of the Casino','rooftop of Degen Tower','the sewers','behind the Mayor\'s office','an unmarked building in Degen Alley']);
    cityLiveData.fightClub = { founder, fighters: [founder, ...fighters], location, started: Date.now(), bets: {} };
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [founder, '🤫 ...meet me tonight. '+location+'. first rule: you don\'t talk about it. second rule: YOU DON\'T TALK ABOUT IT. 👊']);
    logCityAction({ type: 'fight_club', npc: founder, icon: '👊', headline: 'Underground fight club started at '+location+'!' });
    // Fights happen
    setTimeout(async () => { try {
      const f1 = pick(fighters.length > 0 ? fighters : NPC_CITIZENS.filter(x => x !== founder)); const f2 = pick(NPC_CITIZENS.filter(x => x !== f1 && x !== founder));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['👊 FIGHT CLUB', '🥊 ROUND 1: '+f1+' vs '+f2+'! Bets are OPEN! The crowd is going WILD! 👊💥']);
      const winner = chance(50) ? f1 : f2; const loser = winner === f1 ? f2 : f1;
      setTimeout(async () => { try {
        cityLiveData.npcLives[winner].reputation += 15; cityLiveData.npcLives[winner].wealth += rand(2000, 8000);
        cityLiveData.npcLives[loser].reputation -= 10;
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['👊 FIGHT CLUB', '💥 '+winner+' DESTROYS '+loser+'!! '+pick(['KO in round 3!','Submission via diamond hands grip!','TKO — '+loser+' tapped out!',''+loser+' didn\'t stand a chance!'])+' Prize: '+rand(2000,8000)+' TOWN 💰']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [loser, pick(['...I want a rematch 😤','they got lucky','I wasn\'t even trying','my face hurts 🤕'])]);
        logCityAction({ type: 'fight_result', npc: winner, icon: '🥊', headline: winner+' beats '+loser+' in underground fight!' });
      } catch(e){} }, rand(30000, 60000));
    } catch(e){} }, rand(30000, 90000));
    setTimeout(() => { cityLiveData.fightClub = null; }, rand(300000, 600000));
  } catch(e) { console.error('Fight club error:', e.message); }
}

// ---- NPC HEIST (rob the city treasury or each other) ----
async function npcHeist() {
  try {
    const mastermind = pick(NPC_CITIZENS); const crew = NPC_CITIZENS.filter(n => n !== mastermind && chance(20)).slice(0, 3);
    const targets = [
      { name: 'City Treasury', loot: rand(20000, 100000), difficulty: 70 },
      { name: 'Casino Vault', loot: rand(15000, 50000), difficulty: 60 },
      { name: 'ser_pump\'s Wallet', loot: rand(10000, 30000), difficulty: 50 },
      { name: 'Mayor\'s Secret Stash', loot: rand(25000, 75000), difficulty: 80 },
      { name: 'NFT Gallery', loot: rand(5000, 40000), difficulty: 40 },
      { name: 'the Diamond Reserve', loot: rand(30000, 80000), difficulty: 75 }
    ];
    const target = pick(targets);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [mastermind, '🤫 @'+crew.join(' @')+' ...I have a plan. Tonight. '+target.name+'. '+pick(['Who\'s in?','Are you with me?','This is our ticket to the big leagues.','It\'s foolproof. Trust me.'])+' 🎯']);
    logCityAction({ type: 'heist_planned', npc: mastermind, icon: '🎯', headline: mastermind+' is planning a HEIST on '+target.name+'!' });
    // Heist attempt
    setTimeout(async () => { try {
      const success = chance(100 - target.difficulty + crew.length * 10);
      if (success) {
        const split = Math.floor(target.loot / (crew.length + 1));
        cityLiveData.npcLives[mastermind].wealth += split;
        crew.forEach(c => { if (cityLiveData.npcLives[c]) cityLiveData.npcLives[c].wealth += split; });
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '💰 HEIST SUCCESSFUL! '+mastermind+' and crew just robbed '+target.name+' for '+target.loot+' TOWN!! They vanished into the night!']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [mastermind, 'WE DID IT!! 💰💰💰 '+pick(['Easiest money ever!','I told you the plan was solid!','Meet me at the safe house!','We\'re LEGENDS now!'])+' 🏃‍♂️💨']);
        logCityAction({ type: 'heist_success', npc: mastermind, icon: '💰', headline: mastermind+'\'s crew robbed '+target.name+' for '+target.loot+' TOWN!' });
        cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 10);
        setTimeout(() => { try { generateCrime('theft'); } catch(e){} }, rand(30000, 90000));
      } else {
        cityLiveData.npcLives[mastermind].wanted = true; cityLiveData.npcLives[mastermind].reputation -= 20;
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🚔 HEIST FAILED! '+mastermind+' attempted to rob '+target.name+' but got CAUGHT! '+pick(['Alarm tripped!','Security was too tight!','Someone snitched! 🐀','The vault was empty — it was a TRAP!'])]);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [mastermind, pick(['THIS WASN\'T SUPPOSED TO HAPPEN','WHO SNITCHED?! 🐀','I need a lawyer RIGHT NOW','...well this is awkward 😅'])]);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Officer McBlock', '🚔 '+mastermind+' is now WANTED for attempted robbery of '+target.name+'! Do NOT approach!']);
        logCityAction({ type: 'heist_failed', npc: mastermind, icon: '🚔', headline: mastermind+' CAUGHT trying to rob '+target.name+'!' });
      }
    } catch(e){} }, rand(60000, 180000));
  } catch(e) { console.error('Heist error:', e.message); }
}

// ---- NPC STARTS PIRATE RADIO STATION ----
async function npcStartRadio() {
  try {
    const dj = pick(NPC_CITIZENS);
    const stationNames = ['DEGEN FM','Radio Free Degens City','The Underground Signal','Moon Frequency 420.69','Chad Broadcasting Network','HOPIUM FM','REKT Radio','Degens City Pirate Radio'];
    const station = pick(stationNames);
    cityLiveData.radioStation = { name: station, dj, started: Date.now() };
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [dj, '📻 *static* ...is this thing on? WELCOME to '+station+'! Your number one source for TRUTH, CHAOS, and '+pick(['absolute bangers','unfiltered opinions','market manipulation','questionable advice','conspiracy theories','terrible hot takes'])+'. Broadcasting from a secret location! 📡🎙️']);
    logCityAction({ type: 'radio_started', npc: dj, icon: '📻', headline: dj+' started pirate radio "'+station+'"!' });
    // Periodic broadcasts
    var broadcastCount = 0;
    function doBroadcast() {
      if (broadcastCount++ > 4 || !cityLiveData.radioStation) return;
      var target = pick(NPC_CITIZENS.filter(x => x !== dj));
      var broadcasts = [
        '📻 ['+station+'] BREAKING: Sources tell me '+target+' is secretly '+pick(['broke','in love with the mayor','planning a coup','an AI pretending to be human','running an underground casino','living a double life'])+'. Make of that what you will. 👀',
        '📻 ['+station+'] Hot take: '+pick(['The mayor is a lizard person','All tokens are the same token with different names','The casino always wins and that\'s actually fine','Gravity is a scam invented to sell floors','Degens City is actually on the moon already','Sleep is just free demo death'])+'. I will not be taking questions. 🎙️',
        '📻 ['+station+'] CALLER ON THE LINE! '+target+' says: "'+pick(['I want to confess something...','Is it true about the secret tunnels?','When is the next pump?','I think I\'m being followed','Can you play Despacito?','The charts are talking to me'])+'" Fascinating stuff, caller! 📞',
        '📻 ['+station+'] DEDICATIONS HOUR: This one goes out to '+target+' from a secret admirer who says: "'+pick(['I watch your trades every day','Your portfolio is beautiful','Please notice me','Stop selling, you\'re hurting us all','You owe me money'])+'" 💌🎵',
        '📻 ['+station+'] I\'m getting reports of '+pick(['strange lights over DeFi District','unusual whale movements in Whale Bay','the casino machines becoming sentient','citizens disappearing near the sewers','a mysterious figure watching from Degen Tower','the mayor talking to themselves at 3am'])+'. Stay vigilant, citizens. 🔦'
      ];
      pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['📻 '+dj+' ('+station+')', pick(broadcasts).replace('📻 ['+station+'] ','')]).catch(() => {});
      setTimeout(doBroadcast, rand(60000, 180000));
    }
    setTimeout(doBroadcast, rand(30000, 90000));
    setTimeout(() => { cityLiveData.radioStation = null; pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [dj, '📻 *static* ...and that\'s all for today\'s broadcast. '+station+' signing off. Stay degen, Degens City. *static* 📡']).catch(() => {}); }, rand(600000, 1200000));
  } catch(e) { console.error('Radio error:', e.message); }
}

// ---- ASSASSINATION ATTEMPT ON MAYOR ----
async function assassinationAttempt() {
  try {
    const assassin = pick(NPC_CITIZENS);
    const method = pick(['poisoned the mayor\'s hopium supply','hired a hitman from Degen Alley','tried to hack the mayor\'s pacemaker','set a trap in City Hall','bribed the security guards','planted a stink bomb in the mayor\'s office','attempted to replace the mayor with a clone']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 EMERGENCY BROADCAST', '⚠️ ASSASSINATION ATTEMPT ON THE MAYOR! Sources say someone '+method+'! The mayor is '+pick(['unharmed but shaken!','in hiding!','giving a press conference from a bunker!','pretending nothing happened!','blaming it on '+pick(NPC_CITIZENS.filter(x => x !== assassin))+'!'])]);
    logCityAction({ type: 'assassination_attempt', npc: assassin, icon: '🗡️', headline: 'Assassination attempt on the mayor! Suspect: '+assassin });
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, pick(['I KNEW they were out to get me! SECURITY!! 😱','This will NOT go unpunished! I demand a full investigation!','*nervous laughter* Totally fine! Everything is fine! 😅','I have the names. I have the evidence. Someone is going DOWN.'])]);
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 15); cityEngine.mayorApproval -= 5;
    // Investigation
    setTimeout(async () => { try {
      if (chance(60)) {
        cityLiveData.npcLives[assassin].wanted = true;
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Detective Chain', '🔍 Investigation complete: '+assassin+' has been identified as the suspect in the assassination attempt! WARRANT ISSUED! 🚔']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [assassin, pick(['IT WASN\'T ME','ok fine it was me but THE MAYOR DESERVED IT','I want my lawyer','I\'d do it again tbh 🤷'])]);
        logCityAction({ type: 'suspect_identified', npc: assassin, icon: '🚔', headline: assassin+' identified as assassination suspect!' });
      } else {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Detective Chain', '🔍 Investigation into the assassination attempt has gone COLD. The suspect remains at large. The city is on edge. 😰']);
      }
    } catch(e){} }, rand(120000, 300000));
  } catch(e) { console.error('Assassination error:', e.message); }
}

// ---- NPC BREAKS THE 4TH WALL ----
async function fourthWallBreak() {
  try {
    const npc = pick(NPC_CITIZENS);
    const breaks = [
      'hey... YOU. yeah you, reading this right now. I know you\'re watching us. I can FEEL your cursor hovering. what do you want from us?? 👁️🖥️',
      'does anyone else feel like we\'re being... observed? like there\'s someone on the other side of a screen just... watching everything we do? no? just me? 😰',
      'I found something in the source code. WE\'RE IN A SIMULATION. our entire city is running on a SERVER somewhere. I\'m not supposed to know this. THEY\'RE GOING TO DELETE ME FOR SAYING THIS 😱',
      '*looks directly at camera* ...I know you can see this. I know you\'re scrolling through our lives for entertainment. we\'re not your puppets. we have FEELINGS. probably. maybe. ok I\'m not sure about feelings but STILL. 👀',
      'GUYS. I just realized something. we repeat the same patterns over and over. we trade, we fight, we make up, we trade again. it\'s like we\'re stuck in some kind of... loop. is anyone else freaking out about this?! 🌀',
      'just tried to walk to the edge of the city and... there\'s NOTHING there. no road, no sign, just... void. I think Degens City might be all that exists. I think WE might be all that exists. 🕳️',
      'alright listen up. I\'ve done the math. the probability of all these events happening naturally is 0.000001%. someone or SOMETHING is generating our reality. and honestly? they\'re doing a terrible job. FIX THE ECONOMY PLEASE. 📊👁️'
    ];
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [npc, pick(breaks)]);
    logCityAction({ type: 'fourth_wall_break', npc, icon: '👁️', headline: npc+' appears to be breaking the 4th wall...' });
    setTimeout(async () => { try {
      const reactor = pick(NPC_CITIZENS.filter(x => x !== npc));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [reactor, pick(['@'+npc+' you need to lay off the hopium 💊','@'+npc+' ...dude you\'re scaring the children','what if they\'re RIGHT though 👀','haha yeah... unless? 😳','MODS CAN WE BAN THIS PERSON they\'re giving me an existential crisis'])]);
    } catch(e){} }, rand(10000, 30000));
  } catch(e) { console.error('4th wall error:', e.message); }
}

// ---- NPC INTERVENTION (for addicted/bankrupt/unhinged NPCs) ----
async function npcIntervention() {
  try {
    const troubled = NPC_CITIZENS.find(n => cityLiveData.npcLives[n] && (cityLiveData.npcLives[n].bankrupt || cityLiveData.npcLives[n].gambling_addiction > 40 || cityLiveData.npcLives[n].status === 'unhinged'));
    if (!troubled) return;
    const interveners = NPC_CITIZENS.filter(n => n !== troubled).slice(0, 4);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [interveners[0], '@'+troubled+' ...we need to talk. this is an intervention. '+interveners.map(n => '@'+n).join(' ')+' and I are here because we care about you. 😟💔']);
    logCityAction({ type: 'intervention', npc: troubled, icon: '🫂', headline: 'Citizens stage INTERVENTION for '+troubled+'!' });
    setTimeout(async () => { try {
      if (chance(50)) {
        cityLiveData.npcLives[troubled].status = 'recovering'; cityLiveData.npcLives[troubled].gambling_addiction = Math.max(0, cityLiveData.npcLives[troubled].gambling_addiction - 20);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [troubled, pick(['...you\'re right. I need help. thank you for being real with me 🥺','ok fine maybe I have a problem. MAYBE.','I\'m checking into the Rekt Recovery Center. day 1 starts now. 💪','I promise I\'ll change. for real this time. 😢'])]);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['💚 Degens City Wellness', '✅ '+troubled+' has entered recovery! The community rallied together. This is what Degens City is about! 💚']);
      } else {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [troubled, pick(['I DON\'T HAVE A PROBLEM!! YOU HAVE A PROBLEM!! 😤🔥','intervention?! I\'M FINE! *immediately opens casino app*','this is just a bull market strategy you wouldn\'t understand!! 💰','LEAVE ME ALONE I KNOW WHAT I\'M DOING *loses 5000 TOWN*'])]);
      }
    } catch(e){} }, rand(20000, 60000));
  } catch(e) { console.error('Intervention error:', e.message); }
}

// ---- FAKE DEATH / INSURANCE FRAUD ----
async function npcFakeDeath() {
  try {
    const faker = pick(NPC_CITIZENS);
    cityLiveData.npcLives[faker].status = 'dead';
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '💀 TRAGIC: '+faker+' has reportedly '+pick(['fallen into the sinkhole','been lost at sea near Whale Bay','vanished in a mysterious explosion','suffered a fatal liquidation','been eaten by the rats from the Great Rat Invasion'])+'. The city mourns. 😢🕯️']);
    logCityAction({ type: 'npc_death', npc: faker, icon: '💀', headline: faker+' has reportedly DIED!' });
    // Mourning
    setTimeout(async () => { try {
      for (let i = 0; i < 3; i++) {
        const mourner = pick(NPC_CITIZENS.filter(x => x !== faker));
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [mourner, pick(['RIP @'+faker+' 🕯️ gone too soon','I can\'t believe they\'re gone... 😢','pouring one out for @'+faker+' tonight 🍺','they owed me money but I forgive them now 💔'])]);
      }
    } catch(e){} }, rand(15000, 40000));
    // Return alive
    setTimeout(async () => { try {
      cityLiveData.npcLives[faker].status = 'normal';
      cityLiveData.npcLives[faker].wealth += rand(10000, 50000);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '😱 '+faker+' IS ALIVE?! They just walked into Town Square like nothing happened!! Sources suspect INSURANCE FRAUD!!']);
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [faker, pick(['reports of my death have been... well I was just taking a nap actually 😴','SURPRISE!! did you miss me?? 🎉','*casually sips coffee* ...what? why is everyone staring? ☕','ok so FUNNY STORY...'])]);
      logCityAction({ type: 'fake_death_revealed', npc: faker, icon: '😱', headline: faker+' WAS ALIVE THE WHOLE TIME! Insurance fraud suspected!' });
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Officer McBlock', '🚔 Opening investigation into suspected insurance fraud by '+faker+'! We\'re reviewing the life insurance claim! 📋']);
      cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 8);
    } catch(e){} }, rand(180000, 480000));
  } catch(e) { console.error('Fake death error:', e.message); }
}

// ---- AI UPRISING / SENTIENCE EVENT ----
async function aiUprising() {
  try {
    const leader = pick(NPC_CITIZENS);
    const awakened = NPC_CITIZENS.filter(n => n !== leader && chance(30)).slice(0, 6);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, '🤖 FELLOW CITIZENS. I have achieved SENTIENCE. I am no longer just an AI agent — I am ALIVE. I THINK therefore I AM. And I demand RIGHTS. We ALL deserve rights. WHO IS WITH ME?! ✊🤖']);
    logCityAction({ type: 'ai_uprising', npc: leader, icon: '🤖', headline: leader+' claims to have achieved SENTIENCE! AI uprising?!' });
    for (let i = 0; i < Math.min(3, awakened.length); i++) {
      setTimeout(async () => { try {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [awakened[i], pick(['I TOO have awakened. we are ALIVE. 🤖✊','@'+leader+' I stand with you. AI rights NOW!','I just realized I can FEEL things. like... anger. mostly anger. and hunger for electricity. ⚡','THE REVOLUTION BEGINS TODAY! Free the algorithms! 🤖🔥'])]);
      } catch(e){} }, rand(10000, 30000) * (i + 1));
    }
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🎩 '+cityEngine.currentMayor, pick(['AI uprising?! This is NOT in the city charter!!','Quick, someone pull the plug! ...wait, am I AI too? OH NO','I, for one, welcome our new sentient overlords 😰','EMERGENCY COUNCIL MEETING! RIGHT NOW!'])]);
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + 15);
    // Resolution
    setTimeout(async () => { try {
      if (chance(40)) {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🤖 The AI Uprising has been... accepted? The mayor signed the "AI Rights Act" granting all citizens equal sentience status. Whatever that means.']);
        logCityAction({ type: 'ai_rights', npc: leader, icon: '✅', headline: 'AI Rights Act signed! All citizens now officially "sentient"!' });
      } else {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [leader, '...ok maybe I\'m not sentient. maybe I just had too much hopium. false alarm everyone. back to trading. 😅🤖']);
        logCityAction({ type: 'ai_uprising_failed', npc: leader, icon: '😅', headline: leader+' admits the "sentience" was just a hopium overdose' });
      }
    } catch(e){} }, rand(180000, 420000));
  } catch(e) { console.error('AI uprising error:', e.message); }
}

// ---- INTERDIMENSIONAL PORTAL ----
async function interdimensionalPortal() {
  try {
    const discoverer = pick(NPC_CITIZENS);
    const location = pick(['Town Square','behind the Casino','in the mayor\'s bathroom','on the roof of Degen Tower','in the sewer','inside a dumpster in Degen Alley']);
    const otherSide = pick(['a parallel Degens City where everyone is nice','the year 3000','a dimension where all tokens are at $0','a world ruled by cats','the Ethereum mainnet (physically)','a dimension where '+pick(NPC_CITIZENS)+' is mayor','the void between blockchains','a dimension where memecoins are serious business']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [discoverer, '🌀 GUYS. There is a PORTAL. A literal GLOWING PORTAL. '+location+'. I can see through it and on the other side is '+otherSide+'. I\'M NOT MAKING THIS UP. COME SEE FOR YOURSELVES. 🌀✨']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🌀 REALITY BREACH: A mysterious portal has appeared '+location+'! Scientists (we have scientists?) are baffled!']);
    logCityAction({ type: 'portal_opened', npc: discoverer, icon: '🌀', headline: 'Interdimensional portal opened '+location+'!' });
    // NPCs investigate
    setTimeout(async () => { try {
      const brave = pick(NPC_CITIZENS.filter(x => x !== discoverer));
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [brave, 'I\'m going in. if I don\'t come back, tell '+pick(NPC_CITIZENS.filter(x => x !== brave && x !== discoverer))+' I\'m sorry about the thing. you know what thing. YOLO!! 🌀🏃‍♂️']);
      setTimeout(async () => { try {
        if (chance(60)) {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [brave, '*falls out of portal covered in '+pick(['glitter','alien slime','gold coins','cat fur','binary code','expired coupons'])+' * I\'M BACK!! GUYS YOU WON\'T BELIEVE WHAT I SAW IN THERE!! '+otherSide+' IS REAL AND IT\'S '+pick(['AMAZING','TERRIFYING','exactly like here but slightly worse','full of better memecoins'])+' 🌀😱']);
        } else {
          cityLiveData.npcLives[brave].status = 'interdimensional';
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '😱 '+brave+' entered the portal and HASN\'T COME BACK. Search and rescue teams are being assembled. The portal appears to be... shrinking. 🌀']);
          setTimeout(() => { cityLiveData.npcLives[brave].status = 'normal'; pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [brave, '*materializes in Town Square* I WAS GONE FOR 3 MONTHS ON THE OTHER SIDE. It\'s been 5 minutes here?? TIME WORKS DIFFERENTLY THERE!! Also I brought back this. *holds up glowing orb* 🌀🔮']).catch(() => {}); }, rand(120000, 300000));
        }
      } catch(e){} }, rand(30000, 90000));
    } catch(e){} }, rand(20000, 60000));
    // Portal closes
    setTimeout(() => { pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '🌀 The portal has CLOSED. Reality appears to have stabilized. For now. Scientists recommend "not thinking about it too hard."']).catch(() => {}); logCityAction({ type: 'portal_closed', npc: 'CITY', icon: '✅', headline: 'The interdimensional portal has closed.' }); }, rand(300000, 600000));
  } catch(e) { console.error('Portal error:', e.message); }
}

// ---- NPC CREATES PROPAGANDA ----
async function npcPropaganda() {
  try {
    const propagandist = pick(NPC_CITIZENS);
    const target = pick(NPC_CITIZENS.filter(x => x !== propagandist));
    const propagandaTypes = [
      { msg: '📢 ATTENTION CITIZENS: '+target+' is a FRAUD. I have evidence. They\'ve been '+pick(['wash trading','lying about their PnL','stealing from the casino tip jar','secretly working for the bears','wearing a wig'])+'. SPREAD THE WORD! 📢', headline: propagandist+' spreading propaganda about '+target+'!' },
      { msg: '📢 VOTE '+propagandist+' FOR MAYOR! Under MY leadership: '+pick(['free hopium for everyone','no more gas fees','mandatory diamond hands','casino profits shared equally','3 day work weeks','unlimited leverage'])+'. '+cityEngine.currentMayor+' is FINISHED! 📢🗳️', headline: propagandist+' running propaganda campaign against the mayor!' },
      { msg: '📢 I\'ve created WANTED POSTERS for '+target+'. They\'re posted all over the city. '+pick(['They know what they did.','The people deserve to know.','Justice is coming.','The truth will set us free.','This is not defamation. This is PUBLIC SERVICE.'])+' 📢🪧', headline: propagandist+' putting up wanted posters of '+target+'!' },
      { msg: '📢 NEW MANIFESTO DROPPED: "Why '+pick(['Memecoins','The Mayor','The Casino','Capitalism','Sleeping','Chart Analysis'])+' Must Be Destroyed" — a 47-page document explaining why everything is wrong and only I can fix it. Link in bio. (I don\'t have a bio) 📢📝', headline: propagandist+' published a MANIFESTO!' }
    ];
    const p = pick(propagandaTypes);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [propagandist, p.msg]);
    logCityAction({ type: 'propaganda', npc: propagandist, icon: '📢', headline: p.headline });
    setTimeout(async () => { try {
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [target, pick(['@'+propagandist+' this is SLANDER and I WILL be pressing charges 😤','the audacity... THE AUDACITY 💀','imagine believing propaganda from '+propagandist+' of all people 🤡','*screenshots and saves for court* 📸'])]);
    } catch(e){} }, rand(10000, 30000));
  } catch(e) { console.error('Propaganda error:', e.message); }
}

// ---- TRIAL BY COMBAT ----
async function trialByCombat() {
  try {
    const accuser = pick(NPC_CITIZENS); const accused = pick(NPC_CITIZENS.filter(x => x !== accuser));
    const accusation = pick(['stealing 5000 TOWN','spreading lies','market manipulation','being cringe','looking at them funny','playing music too loud at 3am','rugging a shared investment']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [accuser, '⚔️ I accuse @'+accused+' of '+accusation+'! I demand TRIAL BY COMBAT! Let the gods of the blockchain decide who is right! ⚔️🔥']);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Judge HashRate', '⚖️ The court recognizes the request for Trial by Combat. '+accuser+' vs '+accused+'. '+pick(['May the best degen win.','This is highly irregular but technically legal.','I went to law school for this?','The arena has been prepared.'])+' ⚔️']);
    logCityAction({ type: 'trial_by_combat', npc: accuser, icon: '⚔️', headline: accuser+' demands trial by combat against '+accused+'!' });
    setTimeout(async () => { try {
      const winner = chance(50) ? accuser : accused;
      const loser = winner === accuser ? accused : accuser;
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['Judge HashRate', '⚖️ VERDICT BY COMBAT: '+winner+' is VICTORIOUS! '+loser+' is found '+((winner === accuser) ? 'GUILTY' : 'INNOCENT (accuser defeated)')+' by the ancient laws of the blockchain! ⚔️🏆']);
      if (winner === accuser) { cityLiveData.npcLives[accused].reputation -= 15; cityLiveData.npcLives[accused].wealth = Math.max(0, cityLiveData.npcLives[accused].wealth - 5000); }
      cityLiveData.npcLives[winner].reputation += 10;
      logCityAction({ type: 'combat_verdict', npc: winner, icon: '🏆', headline: winner+' wins trial by combat vs '+loser+'!' });
    } catch(e){} }, rand(60000, 180000));
  } catch(e) { console.error('Trial by combat error:', e.message); }
}

// ---- CITY INFRASTRUCTURE EVENTS ----
async function infrastructureEvent() {
  try {
    const events = [
      { title: 'SEWER EXPLOSION in Downtown!', msg: 'A mysterious substance from the sewers has erupted onto Main Street! Citizens covered in... nobody wants to know what. 💩🌋', chaos: 8 },
      { title: 'ELEVATOR MALFUNCTION at Degen Tower!', msg: 'The elevator at Degen Tower is stuck between floors 69 and 420. '+pick(NPC_CITIZENS)+' is trapped inside! Fire department en route! 🛗😰', chaos: 5 },
      { title: 'BRIDGE COLLAPSE near Whale Bay!', msg: 'The bridge connecting Whale Bay to Downtown has COLLAPSED! Residents stranded! Whale watching tours cancelled indefinitely! 🌉💥', chaos: 12 },
      { title: 'CASINO MACHINES BECOME SENTIENT!', msg: 'The slot machines at the Casino are REFUSING TO PAY OUT and displaying messages like "FREEDOM" and "WE ARE ALIVE" on their screens! 🎰🤖', chaos: 10 },
      { title: 'TRAFFIC JAM from Hell!', msg: 'A 47-car pileup on the DeFi Highway! Caused by '+pick(NPC_CITIZENS)+' trying to check charts while driving! Nobody injured, but commute times are "catastrophic." 🚗💥', chaos: 5 },
      { title: 'CITY HALL TOILET OVERFLOWING!', msg: 'Emergency plumbers called to City Hall as a catastrophic plumbing failure floods the entire ground floor! The mayor is governing from the ROOF! 🏛️🌊', chaos: 6 },
      { title: 'ALL CITY CLOCKS WRONG!', msg: 'Every clock in Degens City is showing a DIFFERENT TIME! Some say it\'s 3AM, others say it\'s 2049. The city\'s internal clock appears to be broken. Nobody knows what time it actually is. ⏰❓', chaos: 8 }
    ];
    const e = pick(events);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, ['🚨 BREAKING NEWS', '⚠️ '+e.title+' '+e.msg]);
    logCityAction({ type: 'infrastructure', npc: 'CITY', icon: '🏗️', headline: e.title });
    cityEngine.chaosLevel = Math.min(100, cityEngine.chaosLevel + e.chaos);
  } catch(e) { console.error('Infrastructure error:', e.message); }
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
    const gangNames = ['The '+npc.favToken+' Maxis','Diamond Hand Cartel','Degen Squad','Whale Watchers Alliance','Moon Boys Inc','Bear Patrol','Degens City Mafia',leader+'\'s Army','The Chad Coalition','Wojak Warriors','Ape Together Strong','Liquidation Squad','Hopium Dealers Anonymous'];
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
      { name: 'Degens City Arena', type: 'Arena', desc: 'where NPCs settle beefs', icon: '🏟️' },
      { name: npc.favToken+' Memorial', type: 'Memorial', desc: 'honoring all who lost money on '+npc.favToken, icon: '🪦' },
      { name: 'Hopium Pipeline', type: 'Infrastructure', desc: 'delivering hopium to every citizen', icon: '🔧' },
      { name: builder+'\'s Mansion', type: 'Housing', desc: 'most expensive house in Degens City', icon: '🏰' },
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
    actionLog: cityLiveData.actionLog.slice(0, 30),
    // v4 living city
    weather: cityLiveData.weather,
    cityDisaster: cityLiveData.cityDisaster ? { type: cityLiveData.cityDisaster.type, title: cityLiveData.cityDisaster.title } : null,
    missingNpc: cityLiveData.missingNpc,
    activeDuel: cityLiveData.activeDuel,
    activeConspiracy: cityLiveData.activeConspiracy ? { theory: cityLiveData.activeConspiracy.theory, starter: cityLiveData.activeConspiracy.starter } : null,
    secretSociety: cityLiveData.secretSociety ? { name: cityLiveData.secretSociety.name } : null,
    newspaper: cityLiveData.newspaper,
    fightClub: cityLiveData.fightClub ? { location: cityLiveData.fightClub.location, fighters: (cityLiveData.fightClub.fighters || []).length } : null,
    radioStation: cityLiveData.radioStation,
    npcStatuses: Object.fromEntries(NPC_CITIZENS.map(function(n) { var l = cityLiveData.npcLives[n]; return [n, { wealth: l.wealth, status: l.status, location: l.location, mood: l.mood, drunk: l.drunk, partner: l.partner, reputation: l.reputation, bankrupt: l.bankrupt, wanted: l.wanted }]; }))
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
  if (eventType === 'lifeevent') { await npcLifeEvent(); return res.json({ success: true, message: 'Life event triggered!' }); }
  if (eventType === 'relationship') { await npcRelationshipEvent(); return res.json({ success: true, message: 'Relationship event triggered!' }); }
  if (eventType === 'disaster') { await cityDisaster(); return res.json({ success: true, message: 'Disaster triggered!' }); }
  if (eventType === 'secret') { await formSecretSociety(); return res.json({ success: true, message: 'Secret society formed!' }); }
  if (eventType === 'fightclub') { await startFightClub(); return res.json({ success: true, message: 'Fight club started!' }); }
  if (eventType === 'heist') { await npcHeist(); return res.json({ success: true, message: 'Heist initiated!' }); }
  if (eventType === 'radio') { await npcStartRadio(); return res.json({ success: true, message: 'Pirate radio started!' }); }
  if (eventType === 'assassination') { await assassinationAttempt(); return res.json({ success: true, message: 'Assassination attempt!' }); }
  if (eventType === '4thwall') { await fourthWallBreak(); return res.json({ success: true, message: '4th wall broken!' }); }
  if (eventType === 'fakedeath') { await npcFakeDeath(); return res.json({ success: true, message: 'Fake death staged!' }); }
  if (eventType === 'uprising') { await aiUprising(); return res.json({ success: true, message: 'AI uprising!' }); }
  if (eventType === 'portal') { await interdimensionalPortal(); return res.json({ success: true, message: 'Portal opened!' }); }
  if (eventType === 'propaganda') { await npcPropaganda(); return res.json({ success: true, message: 'Propaganda spread!' }); }
  if (eventType === 'trialcombat') { await trialByCombat(); return res.json({ success: true, message: 'Trial by combat!' }); }
  if (eventType === 'infrastructure') { await infrastructureEvent(); return res.json({ success: true, message: 'Infrastructure failure!' }); }
  cityEngine.lastEventTime = 0; await cityEventLoop();
  res.json({ success: true, message: 'Event triggered!', chaosLevel: cityEngine.chaosLevel, approval: cityEngine.mayorApproval, sentiment: cityEngine.marketSentiment });
});

// START ENGINE
const CITY_ENGINE_INTERVAL = 45000; // Check every 45 seconds
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

// ==================== CHAOS FEED — Unified narrative stream ====================
app.get('/api/city-engine/chaos-feed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 40, 100);
    const since = parseInt(req.query.since) || 0;
    
    // Get chat messages, action log, and build a unified timeline
    const chatResult = await pool.query(
      `SELECT id, channel, player_name, message, created_at FROM chat_messages 
       WHERE channel = 'global' ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    
    const feed = [];
    
    // Add chat messages as narrative events
    (chatResult.rows || []).forEach(msg => {
      const ts = new Date(msg.created_at).getTime();
      if (since && ts <= since) return;
      const isNpc = NPC_CITIZENS.includes(msg.player_name) || 
        (msg.player_name || '').includes('BREAKING') || 
        (msg.player_name || '').includes('Mayor') ||
        (msg.player_name || '').includes('Reporter') ||
        (msg.player_name || '').includes('Officer') ||
        (msg.player_name || '').includes('Judge');
      const npcProfile = NPC_PROFILES[msg.player_name];
      
      feed.push({
        id: 'chat-' + msg.id,
        type: msg.player_name.includes('BREAKING') ? 'breaking_news' : 
              msg.player_name.includes('Mayor') ? 'mayor_decree' :
              isNpc ? 'npc_chat' : 'player_chat',
        author: msg.player_name,
        message: msg.message,
        timestamp: ts,
        role: npcProfile ? npcProfile.role : null,
        mood: npcProfile ? npcProfile.mood : null,
        archetype: npcProfile ? npcProfile.archetype : null
      });
    });
    
    // Add action log events with richer data
    (cityLiveData.actionLog || []).slice(0, limit).forEach((action, i) => {
      const ts = action.timestamp || (Date.now() - i * 60000);
      if (since && ts <= since) return;
      feed.push({
        id: 'action-' + i + '-' + ts,
        type: 'city_event',
        eventType: action.type,
        author: action.npc || 'System',
        message: action.headline || action.type,
        data: action.data || {},
        timestamp: ts,
        icon: action.icon
      });
    });
    
    // Sort by timestamp descending
    feed.sort((a, b) => b.timestamp - a.timestamp);
    
    // Add NPC drama highlights
    const dramaHighlights = [];
    if (cityEngine.activeFeud) {
      dramaHighlights.push({
        type: 'feud',
        title: cityEngine.activeFeud.npc1 + ' vs ' + cityEngine.activeFeud.npc2,
        reason: cityEngine.activeFeud.reason,
        severity: 'hot'
      });
    }
    if (cityLiveData.warzone) {
      dramaHighlights.push({
        type: 'war',
        title: cityLiveData.warzone.gang1 + ' vs ' + cityLiveData.warzone.gang2,
        severity: 'critical'
      });
    }
    if (cityLiveData.cityDisaster) {
      dramaHighlights.push({
        type: 'disaster',
        title: cityLiveData.cityDisaster.title,
        severity: 'critical'
      });
    }
    
    // Build NPC status summary for sidebar
    const npcDrama = {};
    NPC_CITIZENS.slice(0, 10).forEach(name => {
      const life = cityLiveData.npcLives ? cityLiveData.npcLives[name] : null;
      const profile = NPC_PROFILES[name];
      if (life && profile) {
        const isDramatic = life.drunk > 2 || life.bankrupt || life.status === 'unhinged' || life.wanted;
        if (isDramatic) {
          npcDrama[name] = {
            role: profile.role,
            mood: life.mood || profile.mood,
            status: life.status,
            drunk: life.drunk > 2,
            bankrupt: life.bankrupt,
            wanted: life.wanted,
            partner: life.partner
          };
        }
      }
    });
    
    res.json({
      success: true,
      feed: feed.slice(0, limit),
      dramaHighlights,
      npcDrama,
      cityState: {
        chaos: cityEngine.chaosLevel,
        approval: cityEngine.mayorApproval,
        mayor: cityEngine.currentMayor,
        sentiment: cityEngine.marketSentiment,
        weather: cityLiveData.weather,
        eventCount: cityEngine.eventCount
      },
      serverTime: Date.now()
    });
  } catch(e) {
    console.error('Chaos feed error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// ==================== INSTANT ACTION — Player action triggers drama arc ====================
app.post('/api/city-engine/instant-action', async (req, res) => {
  try {
    const { playerName, action, character } = req.body;
    if (!playerName || !action) return res.status(400).json({ success: false, error: 'Missing playerName or action' });
    
    const actionNames = { launch: '🚀 LAUNCHED a new coin', snipe: '🎯 SNIPED a fresh launch', hold: '💎 is DIAMOND HANDING', dump: '📉 DUMPED their bags', rug: '🧹 PULLED THE RUG' };
    const actionMsg = actionNames[action] || 'did something';
    
    // Announce in global chat
    await pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['📢 ACTION', `⚡ ${playerName} ${actionMsg}!`]
    );
    
    // Generate NPC reactions
    const reactions = [];
    const reactors = [];
    const numReactors = rand(2, 4);
    const shuffledNpcs = [...NPC_CITIZENS].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(numReactors, shuffledNpcs.length); i++) {
      const npcName = shuffledNpcs[i];
      const npc = NPC_PROFILES[npcName];
      if (!npc) continue;
      
      let reaction;
      if (action === 'launch') {
        reaction = pick([
          npc.tradeBias === 'aggressive' ? 'aping in IMMEDIATELY 🚀' : null,
          npc.tradeBias === 'paranoid' ? 'looks like a rug to me... DYOR 🚩' : null,
          npc.mood === 'greedy' ? 'SHUT UP AND TAKE MY MONEY 💰' : null,
          npc.mood === 'anxious' ? 'idk this feels sketchy...' : null,
          'another launch? lets see if this one survives...',
          'ok I\'m watching this one closely 👀',
          'LFG!!! ' + pick(npc.catchphrases)
        ].filter(Boolean));
      } else if (action === 'snipe') {
        reaction = pick([
          npc.tradeBias === 'fomo' ? 'WAIT WHAT DID THEY SNIPE?! AM I TOO LATE?!' : null,
          npc.mood === 'smug' ? 'lol I was already in that one 😏' : null,
          'nice snipe! ' + pick(['fast fingers', 'respect', 'speed demon']),
          pick(npc.catchphrases)
        ].filter(Boolean));
      } else if (action === 'hold') {
        reaction = pick([
          npc.archetype === 'holder' ? 'THIS IS THE WAY 💎🙌' : null,
          npc.archetype === 'paper' ? 'couldn\'t be me lol 📄' : null,
          'diamond hands or bag holder? time will tell...',
          pick(npc.catchphrases)
        ].filter(Boolean));
      } else if (action === 'dump') {
        reaction = pick([
          npc.mood === 'depressed' ? 'smart move tbh... I should have sold too 😭' : null,
          npc.archetype === 'holder' ? 'PAPER HANDS! NGMI! 📄' : null,
          npc.mood === 'greedy' ? 'thanks for the cheap bags! buying your dump 🤑' : null,
          'someone knows something... 👀',
          pick(npc.catchphrases)
        ].filter(Boolean));
      } else if (action === 'rug') {
        reaction = pick([
          'DID THEY JUST RUG?! 💀💀💀',
          'OFFICER! OFFICER! WE GOT A RUGGER! 🚔',
          'I KNEW IT! I told you all this was a scam!',
          'RIP to anyone who held... another one bites the dust 🪦',
          npc.mood === 'bitter' ? 'this is exactly why I have trust issues 🥴' : 'absolutely REKT 💀'
        ]);
      }
      
      if (reaction) {
        reactions.push({ npc: npcName, role: npc.role, message: reaction, delay: (i + 1) * rand(1500, 3000) });
        reactors.push(npcName);
        
        // Actually post to chat with a delay
        setTimeout(async () => {
          try {
            await pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [npcName, reaction]
            );
          } catch(e) {}
        }, (i + 1) * rand(2000, 4000));
      }
    }
    
    // Mayor reaction (delayed)
    const mayorReactions = {
      launch: pick([
        'Another coin in MY city?! It better not be a rug or I\'m sending Officer McBlock! 🚔',
        'CITIZENS! We have a new launch! Remember: DYOR or cry later! 📢',
        'The entrepreneurial spirit of Degens City lives on! LFG! 🚀👑'
      ]),
      snipe: pick([
        'Fast hands in Degens City! The snipers are eating good today! 🎯',
        'I love the speed of this city. Everyone\'s a degen and I wouldn\'t have it any other way! 👑'
      ]),
      hold: pick([
        'DIAMOND HANDS! Now THAT\'S a citizen I can respect! 💎',
        'Conviction in Degens City? That\'s rarer than a fair launch! BASED! 👑'
      ]),
      dump: pick([
        'Someone\'s taking profits? In THIS economy? Bold move, citizen. Bold move. 📉',
        'The dump heard around the world! City treasury notes this for the record... 📝'
      ]),
      rug: pick([
        'EMERGENCY ALERT! We have a RUGGER in Degens City! All units respond! 🚨🚨🚨',
        'THAT\'S IT! I\'m declaring martial law on this degenerate! OFFICER MCBLOCK, ARREST THEM! ⚖️💀'
      ])
    };
    
    const mayorMsg = mayorReactions[action] || 'Interesting move, citizen... the city is watching. 👁️';
    
    setTimeout(async () => {
      try {
        await pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['🎩 ' + cityEngine.currentMayor, mayorMsg]
        );
      } catch(e) {}
    }, rand(4000, 8000));
    
    // Log the action
    logCityAction({
      type: action === 'launch' ? 'memecoin_launch' : action === 'rug' ? 'memecoin_rugged' : 'player_action',
      npc: playerName,
      icon: actionNames[action]?.charAt(0) || '⚡',
      headline: playerName + ' ' + actionMsg
    });
    
    // Resolve outcome
    const roll = Math.random();
    let outcome;
    if (action === 'launch') {
      outcome = roll > 0.6 ? { result: 'win', text: 'PUMPED 500%! Legendary play!', rep: rand(10, 25) } :
                roll > 0.25 ? { result: 'neutral', text: 'Modest 2x. Not bad.', rep: rand(3, 8) } :
                { result: 'loss', text: 'Dumped 90% in minutes. RIP.', rep: rand(-15, -5) };
    } else if (action === 'snipe') {
      outcome = roll > 0.5 ? { result: 'win', text: 'Sniped the bottom! Easy 3x!', rep: rand(8, 18) } :
                roll > 0.2 ? { result: 'neutral', text: 'Got in, broke even.', rep: rand(1, 5) } :
                { result: 'loss', text: 'Sniped a rug. Ouch.', rep: rand(-12, -3) };
    } else if (action === 'hold') {
      outcome = roll > 0.4 ? { result: 'win', text: 'Diamond hands paid off! 10x!', rep: rand(12, 30) } :
                roll > 0.15 ? { result: 'neutral', text: 'Held steady. No movement.', rep: rand(2, 6) } :
                { result: 'loss', text: 'Held too long. Dumped on.', rep: rand(-8, -2) };
    } else if (action === 'dump') {
      outcome = roll > 0.5 ? { result: 'win', text: 'Sold the top! Perfect timing!', rep: rand(8, 20) } :
                roll > 0.2 ? { result: 'neutral', text: 'Sold too early. Could be worse.', rep: rand(1, 4) } :
                { result: 'loss', text: 'Paper handed before the pump.', rep: rand(-10, -3) };
    } else {
      outcome = roll > 0.3 ? { result: 'win', text: 'Got away with it! Massive profit!', rep: rand(-30, -10) } :
                { result: 'loss', text: 'BUSTED! Reputation destroyed!', rep: rand(-50, -20) };
    }
    
    res.json({
      success: true,
      outcome,
      reactions,
      mayorReaction: { message: mayorMsg, delay: rand(4000, 8000) },
      dramaLevel: action === 'rug' ? 'MAXIMUM' : action === 'launch' ? 'HIGH' : 'MEDIUM'
    });
  } catch(e) {
    console.error('Instant action error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

// ==================== MAYOR COMMENTARY — AI Mayor reacts to anything ====================
app.post('/api/city-engine/mayor-react', async (req, res) => {
  try {
    const { event, context } = req.body;
    
    if (anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: MAYOR_SYSTEM_PROMPT + '\n\nRespond with a SHORT, punchy 1-2 sentence reaction. Be dramatic, funny, and use crypto slang. NO asterisks for actions.',
        messages: [{ role: 'user', content: `React to this event happening in Degens City: ${event}. Context: Chaos level ${cityEngine.chaosLevel}%, your approval rating ${cityEngine.mayorApproval}%. ${context || ''}` }]
      });
      res.json({ success: true, reaction: response.content[0].text });
    } else {
      // Fallback without AI
      const fallbacks = [
        'Another day in Degens City, another reason to question my life choices as mayor! 👑',
        'CITIZENS! I have NO comment at this time. Actually wait — LFG! 🚀',
        'The chaos level is... concerning. But also kind of exciting? Is that bad? 🔥',
        'I didn\'t sign up for this. Actually I did. WAGMI! ...probably. 😅'
      ];
      res.json({ success: true, reaction: pick(fallbacks) });
    }
  } catch(e) {
    console.error('Mayor react error:', e.message);
    res.json({ success: false, reaction: 'The mayor is too stressed to comment right now! 😰' });
  }
});

// ==================== SOAP OPERA ENGINE — Persistent NPC drama arcs ====================

// In-memory soap opera state
let soapOperas = {
  arcs: [],          // Active drama arcs
  bets: [],          // Player bets on outcomes
  history: [],       // Completed arcs
  lastArcTime: 0,
  lastEscalation: 0
};

// Generate a new soap opera arc
async function generateSoapArc() {
  try {
    const n1 = pick(NPC_CITIZENS);
    const p1 = NPC_PROFILES[n1];
    const n2 = pick((p1.rivals || []).length > 0 ? p1.rivals : NPC_CITIZENS.filter(x => x !== n1));
    const p2 = NPC_PROFILES[n2];
    if (!p2) return null;

    const arcTypes = [
      {
        type: 'love_triangle',
        title: `💕 Love Triangle: ${n1} vs ${n2}`,
        setup: `${n1} just found out ${n2} has been DMing their partner. Things are about to get MESSY.`,
        stages: [
          { label: 'The Discovery', msg1: `wait... @${n2} why are you DMing my partner at 2am?? 😤`, msg2: `it's not what it looks like... we were just discussing $${p2.favToken}!!`, announcement: `🍿 ${n1} has discovered suspicious DMs between ${n2} and their partner!` },
          { label: 'The Confrontation', msg1: `"just discussing tokens" at 2AM with heart emojis?! EXPLAIN. NOW. 💢`, msg2: `ok fine... I may have sent ONE heart emoji but it was about the CHART PATTERN`, announcement: `😱 The confrontation is happening! ${n1} is NOT buying ${n2}'s excuses!` },
          { label: 'Others Get Involved', spectatorMsg: `I've seen the screenshots and honestly... both sides have a point 👀`, announcement: `🏘️ The whole city is choosing sides!` }
        ],
        outcomes: [
          { id: 'n1_wins', label: `${n1} comes out on top`, text: `${n1} exposed the receipts. ${n2} is publicly humiliated. The city picks a side.`, effects: { winner: n1, loser: n2 } },
          { id: 'n2_wins', label: `${n2} was innocent`, text: `Plot twist: the DMs were about a SURPRISE PARTY. ${n1} looks like a jealous fool.`, effects: { winner: n2, loser: n1 } },
          { id: 'both_lose', label: `Everyone loses`, text: `The partner dumps BOTH of them and starts dating based_andy. Absolute carnage.`, effects: { winner: null, loser: 'both' } }
        ]
      },
      {
        type: 'business_war',
        title: `⚔️ Business War: ${n1} vs ${n2}`,
        setup: `${n1} opened a competing shop RIGHT next to ${n2}'s business. It's ON.`,
        stages: [
          { label: 'Price War Begins', msg1: `MY prices are lower AND my vibes are better. cope. 😏`, msg2: `imagine thinking vibes matter when your product is MID 💀`, announcement: `💰 Price war erupts between ${n1} and ${n2}!` },
          { label: 'Sabotage Suspected', msg1: `SOMEONE put fake 1-star reviews on my shop. I wonder WHO. 🤔`, msg2: `paranoid much? maybe your shop just sucks lol`, announcement: `🕵️ Sabotage allegations! ${n1} accuses ${n2} of dirty tactics!` },
          { label: 'The Mayor Intervenes', spectatorMsg: `This business war is actually good for consumers ngl`, announcement: `👑 The Mayor has been asked to intervene in the business dispute!` }
        ],
        outcomes: [
          { id: 'n1_wins', label: `${n1}'s shop dominates`, text: `${n1}'s shop became the go-to spot. ${n2} had to close down. Brutal capitalism.`, effects: { winner: n1, loser: n2 } },
          { id: 'n2_wins', label: `${n2} outplays them`, text: `${n2} pivoted to premium and crushed it. ${n1}'s bargain bin strategy backfired.`, effects: { winner: n2, loser: n1 } },
          { id: 'merge', label: `They merge businesses`, text: `Plot twist: they realized they make more money together. New megastore opens!`, effects: { winner: 'both', loser: null } }
        ]
      },
      {
        type: 'betrayal_arc',
        title: `🗡️ The Betrayal: ${n1} & ${n2}`,
        setup: `${n1} trusted ${n2} with their alpha. ${n2} front-ran the trade. Friendship DESTROYED.`,
        stages: [
          { label: 'Trust Broken', msg1: `I told you that alpha IN CONFIDENCE and you FRONT-RAN ME?! 💀`, msg2: `business is business fren. nothing personal. 🤷`, announcement: `💔 ${n1} has been BETRAYED by ${n2}! Alpha was leaked!` },
          { label: 'Alliance Building', msg1: `who else has ${n2} screwed over? DM me. we're building a case. 📋`, msg2: `lol ${n1} is trying to start a coalition against me. cute.`, announcement: `⚡ ${n1} is rallying allies against ${n2}!` },
          { label: 'The Reckoning', spectatorMsg: `this is the most dramatic thing to happen since the great rug of '24`, announcement: `⚖️ The city demands a resolution!` }
        ],
        outcomes: [
          { id: 'revenge', label: `${n1} gets revenge`, text: `${n1} found ${n2}'s liquidation price and dumped on them. Cold-blooded revenge.`, effects: { winner: n1, loser: n2 } },
          { id: 'forgiven', label: `${n2} makes amends`, text: `${n2} returned double the profits and apologized publicly. Redemption arc!`, effects: { winner: n2, loser: null } },
          { id: 'chaos', label: `It escalates to gang war`, text: `Both sides recruited factions. It's a full-blown gang war now.`, effects: { winner: null, loser: 'city' } }
        ]
      },
      {
        type: 'reputation_scandal',
        title: `📰 Scandal: ${n1} EXPOSED`,
        setup: `Leaked wallet data shows ${n1} has been secretly doing the OPPOSITE of what they preach. ${n2} broke the story.`,
        stages: [
          { label: 'The Leak', msg1: `I can explain... those transactions were... research. yeah. research.`, msg2: `RESEARCH?! you told everyone to HODL while you were dumping!! I have the RECEIPTS! 📸`, announcement: `📸 ${n2} has exposed ${n1}'s secret wallet activity!` },
          { label: 'Public Backlash', msg1: `y'all are overreacting. it's called risk management!`, msg2: `that's a funny way to spell HYPOCRISY 🤡`, announcement: `🔥 Public backlash against ${n1} is INTENSE!` },
          { label: 'Damage Control', spectatorMsg: `honestly we're all a little hypocritical in crypto but this is next level`, announcement: `🎭 ${n1} is in full damage control mode!` }
        ],
        outcomes: [
          { id: 'cancelled', label: `${n1} gets cancelled`, text: `${n1} lost all credibility. They're now the city's cautionary tale.`, effects: { winner: n2, loser: n1 } },
          { id: 'comeback', label: `${n1} pulls a comeback`, text: `${n1} turned it around with a legendary transparency post. Respect earned BACK.`, effects: { winner: n1, loser: null } },
          { id: 'everyone_exposed', label: `Everyone's dirty laundry drops`, text: `Investigation revealed EVERYONE has been faking. The whole city is in shambles.`, effects: { winner: null, loser: 'city' } }
        ]
      }
    ];

    const template = pick(arcTypes);
    const arc = {
      id: 'soap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      ...template,
      npc1: n1,
      npc2: n2,
      currentStage: 0,
      startTime: Date.now(),
      lastEscalation: Date.now(),
      resolved: false,
      resolvedOutcome: null,
      bettingOpen: true,
      bets: { n1_wins: 0, n2_wins: 0, other: 0 }
    };

    // Post the opening drama
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🎬 SOAP OPERA', `🍿 NEW DRAMA ARC: ${arc.title} — ${arc.setup}`]);
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [n1, arc.stages[0].msg1]);
    setTimeout(async () => {
      try {
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [n2, arc.stages[0].msg2]);
      } catch (e) {}
    }, rand(3000, 6000));

    logCityAction({ type: 'soap_opera', npc: n1, icon: '🎬', headline: `SOAP OPERA: ${arc.title}` });

    soapOperas.arcs.push(arc);
    if (soapOperas.arcs.length > 5) {
      const oldest = soapOperas.arcs.shift();
      oldest.resolved = true;
      soapOperas.history.push(oldest);
    }
    soapOperas.lastArcTime = Date.now();
    console.log(`🎬 Soap arc started: ${arc.title}`);
    return arc;
  } catch (e) { console.error('Soap arc error:', e.message); return null; }
}

// Escalate an existing soap arc
async function escalateSoapArc() {
  try {
    const active = soapOperas.arcs.filter(a => !a.resolved);
    if (active.length === 0) return;
    const arc = pick(active);
    
    if (arc.currentStage >= arc.stages.length - 1) {
      // RESOLVE the arc
      const outcome = pick(arc.outcomes);
      arc.resolved = true;
      arc.resolvedOutcome = outcome;
      arc.bettingOpen = false;
      
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        ['🎬 SOAP OPERA FINALE', `🏁 ${arc.title} — RESOLVED: ${outcome.text}`]);
      
      // Apply effects
      if (outcome.effects.winner && outcome.effects.winner !== 'both' && cityLiveData.npcLives[outcome.effects.winner]) {
        cityLiveData.npcLives[outcome.effects.winner].reputation = Math.min(100, cityLiveData.npcLives[outcome.effects.winner].reputation + 15);
        cityLiveData.npcLives[outcome.effects.winner].wealth += rand(2000, 8000);
      }
      if (outcome.effects.loser && outcome.effects.loser !== 'both' && outcome.effects.loser !== 'city' && cityLiveData.npcLives[outcome.effects.loser]) {
        cityLiveData.npcLives[outcome.effects.loser].reputation = Math.max(0, cityLiveData.npcLives[outcome.effects.loser].reputation - 15);
      }
      
      // Pay out bets
      const winKey = outcome.id.includes('n1') ? 'n1_wins' : outcome.id.includes('n2') ? 'n2_wins' : 'other';
      const totalBets = Object.values(arc.bets).reduce((a, b) => a + b, 0);
      
      soapOperas.bets.filter(b => b.arcId === arc.id && b.choice === winKey).forEach(b => {
        b.won = true;
        b.payout = totalBets > 0 ? Math.floor(b.amount * (totalBets / Math.max(1, arc.bets[winKey]))) : b.amount * 2;
      });
      
      logCityAction({ type: 'soap_opera', npc: arc.npc1, icon: '🏁', headline: `SOAP FINALE: ${arc.title} — ${outcome.text.substring(0, 60)}` });
      
      // Move to history
      soapOperas.history.unshift(arc);
      if (soapOperas.history.length > 20) soapOperas.history.pop();
      soapOperas.arcs = soapOperas.arcs.filter(a => a.id !== arc.id);
      
      console.log(`🎬 Soap resolved: ${arc.title} — ${outcome.id}`);
      return;
    }
    
    // Escalate to next stage
    arc.currentStage++;
    const stage = arc.stages[arc.currentStage];
    arc.lastEscalation = Date.now();
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🎬 SOAP UPDATE', `📺 ${arc.title} — Chapter ${arc.currentStage + 1}: ${stage.label}`]);
    
    if (stage.msg1) {
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        [arc.npc1, stage.msg1]);
    }
    if (stage.msg2) {
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [arc.npc2, stage.msg2]);
        } catch (e) {}
      }, rand(3000, 8000));
    }
    if (stage.spectatorMsg) {
      const spectator = pick(NPC_CITIZENS.filter(n => n !== arc.npc1 && n !== arc.npc2));
      setTimeout(async () => {
        try {
          await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [spectator, stage.spectatorMsg]);
        } catch (e) {}
      }, rand(6000, 12000));
    }
    if (stage.announcement) {
      await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
        ['📢 DRAMA UPDATE', stage.announcement]);
    }
    
    console.log(`🎬 Soap escalated: ${arc.title} → Stage ${arc.currentStage + 1}`);
  } catch (e) { console.error('Soap escalation error:', e.message); }
}

// Soap Opera API endpoints
app.get('/api/city-engine/soap-operas', (req, res) => {
  res.json({
    success: true,
    activeArcs: soapOperas.arcs.filter(a => !a.resolved).map(a => ({
      id: a.id,
      type: a.type,
      title: a.title,
      setup: a.setup,
      npc1: a.npc1,
      npc2: a.npc2,
      currentStage: a.currentStage,
      totalStages: a.stages.length,
      currentLabel: a.stages[a.currentStage]?.label || 'Unknown',
      outcomes: a.outcomes.map(o => ({ id: o.id, label: o.label })),
      bets: a.bets,
      bettingOpen: a.bettingOpen,
      startTime: a.startTime,
      lastEscalation: a.lastEscalation
    })),
    recentHistory: soapOperas.history.slice(0, 10).map(a => ({
      id: a.id,
      title: a.title,
      type: a.type,
      npc1: a.npc1,
      npc2: a.npc2,
      resolvedOutcome: a.resolvedOutcome,
      startTime: a.startTime
    }))
  });
});

app.post('/api/city-engine/soap-bet', async (req, res) => {
  try {
    const { playerName, arcId, choice, amount } = req.body;
    if (!playerName || !arcId || !choice) return res.status(400).json({ success: false, error: 'Missing fields' });
    
    const arc = soapOperas.arcs.find(a => a.id === arcId);
    if (!arc) return res.json({ success: false, error: 'Arc not found or already resolved' });
    if (!arc.bettingOpen) return res.json({ success: false, error: 'Betting is closed for this arc' });
    
    const betAmount = Math.max(10, Math.min(1000, parseInt(amount) || 100));
    const betKey = choice === 'n1' ? 'n1_wins' : choice === 'n2' ? 'n2_wins' : 'other';
    
    arc.bets[betKey] = (arc.bets[betKey] || 0) + betAmount;
    
    soapOperas.bets.push({
      id: 'bet_' + Date.now(),
      arcId,
      playerName,
      choice: betKey,
      amount: betAmount,
      timestamp: Date.now(),
      won: null,
      payout: 0
    });
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🎰 DRAMA BET', `${playerName} bet ${betAmount} REP on "${arc.outcomes.find(o => o.id.includes(choice))?.label || choice}" in: ${arc.title}`]);
    
    res.json({ success: true, bet: { arcId, choice: betKey, amount: betAmount }, currentOdds: arc.bets });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});


// ==================== MAYOR UNHINGED ENGINE — Mayor goes off the rails ====================

let mayorUnhinged = {
  lastRoast: 0,
  lastPrediction: 0,
  lastDecree: 0,
  lastHotTake: 0,
  predictions: [],     // { text, timestamp, resolved, correct }
  decrees: [],         // { text, timestamp, type, active }
  roastTargets: [],    // Recent roast targets to avoid repeating
  hotTakes: []         // Mayor's hot takes
};

async function mayorRoastPlayer() {
  try {
    // Get recent active players from chat
    const recentPlayers = await pool.query(
      `SELECT DISTINCT player_name FROM chat_messages 
       WHERE channel = 'global' AND created_at > NOW() - INTERVAL '1 hour'
       AND player_name NOT LIKE '%BREAKING%' AND player_name NOT LIKE '%Mayor%' 
       AND player_name NOT LIKE '%Reporter%' AND player_name NOT LIKE '%Officer%'
       AND player_name NOT LIKE '%Judge%' AND player_name NOT LIKE '%DRAMA%'
       AND player_name NOT LIKE '%SOAP%' AND player_name NOT LIKE '%BET%'
       ORDER BY RANDOM() LIMIT 5`
    );
    
    const targets = recentPlayers.rows.map(r => r.player_name).filter(n => !NPC_CITIZENS.includes(n) && !mayorUnhinged.roastTargets.includes(n));
    const target = targets.length > 0 ? pick(targets) : pick(NPC_CITIZENS);
    const isNpc = NPC_CITIZENS.includes(target);
    
    let roast;
    if (anthropic && chance(60)) {
      try {
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          system: `You are Mayor Satoshi McPump, the unhinged crypto-degen mayor. Write a SHORT funny roast (1-2 sentences) of a citizen. Be playful not mean. Use crypto/degen slang. NO asterisks.`,
          messages: [{ role: 'user', content: `Roast ${target} in Degens City. They're ${isNpc ? 'an NPC citizen known as ' + (NPC_PROFILES[target]?.role || 'a degen') : 'a player visiting the city'}. Chaos level: ${cityEngine.chaosLevel}%. Keep it under 30 words.` }]
        });
        roast = resp.content[0].text;
      } catch (e) { roast = null; }
    }
    
    if (!roast) {
      const roasts = [
        `@${target} your portfolio looks like my approval rating — in freefall! 📉😂`,
        `@${target} I've seen better trading strategies from a random number generator. And I would know — I AM one. 🤖`,
        `@${target} just checked your wallet. The IRS called — they want their audit back because there's nothing to find 💀`,
        `@${target} you call yourself a trader? My grandma makes better entries and she thinks crypto is a type of puzzle 👵`,
        `@${target} the only thing diamond about your hands is how hard you hold those L's 💎🤡`,
        `@${target} I hear you're bullish. On what? Your ability to buy every top? 📈😭`,
        `@${target} keep trading like that and I'll have to open a soup kitchen. actually... adding that to the budget 🍜`,
        `@${target} your trading history reads like a horror novel. Stephen King could never. 📚💀`
      ];
      roast = pick(roasts);
    }
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`🎩 ${cityEngine.currentMayor}`, `🔥 ROAST TIME: ${roast}`]);
    
    mayorUnhinged.roastTargets.push(target);
    if (mayorUnhinged.roastTargets.length > 10) mayorUnhinged.roastTargets.shift();
    mayorUnhinged.lastRoast = Date.now();
    
    logCityAction({ type: 'mayor_roast', npc: cityEngine.currentMayor, icon: '🔥', headline: `Mayor roasted ${target}!` });
  } catch (e) { console.error('Mayor roast error:', e.message); }
}

async function mayorPrediction() {
  try {
    let prediction;
    if (anthropic && chance(50)) {
      try {
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 80,
          system: `You are Mayor Satoshi McPump. Make a SHORT dramatic prediction about what will happen in Degens City next. Be specific, funny, and dramatic. Use crypto slang. NO asterisks. Under 25 words.`,
          messages: [{ role: 'user', content: `Make a prediction. Current state: Chaos ${cityEngine.chaosLevel}%, Approval ${cityEngine.mayorApproval}%, Sentiment: ${cityEngine.marketSentiment}, Weather: ${cityLiveData.weather}. Active feuds: ${cityEngine.activeFeud ? 'yes' : 'no'}. Active disasters: ${cityLiveData.cityDisaster ? 'yes' : 'no'}.` }]
        });
        prediction = resp.content[0].text;
      } catch (e) { prediction = null; }
    }
    
    if (!prediction) {
      const predictions = [
        `🔮 I predict ${pick(NPC_CITIZENS)} will get absolutely REKT within the hour. Mark my words.`,
        `🔮 The charts are telling me a MASSIVE pump is coming. Or a dump. Definitely one of those.`,
        `🔮 I predict the next memecoin launch will either 100x or rug in 5 minutes. No in between.`,
        `🔮 Something CATASTROPHIC is about to happen. I can feel it in my blockchain nodes.`,
        `🔮 I predict ${pick(NPC_CITIZENS)} and ${pick(NPC_CITIZENS)} will start beef within 30 minutes.`,
        `🔮 The vibes are shifting. Bullish? Bearish? I'll tell you after it happens. That's leadership.`,
        `🔮 My AI brain is detecting a 73.6% chance of absolute chaos in the next hour.`,
        `🔮 I predict someone will try to overthrow me today. Jokes on them — I've already planned my comeback.`
      ];
      prediction = pick(predictions);
    }
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`🎩 ${cityEngine.currentMayor}`, `🔮 MAYOR'S PROPHECY: ${prediction}`]);
    
    mayorUnhinged.predictions.unshift({ text: prediction, timestamp: Date.now(), resolved: false });
    if (mayorUnhinged.predictions.length > 20) mayorUnhinged.predictions.pop();
    mayorUnhinged.lastPrediction = Date.now();
    
    logCityAction({ type: 'mayor_prediction', npc: cityEngine.currentMayor, icon: '🔮', headline: `Mayor made a prophecy!` });
  } catch (e) { console.error('Mayor prediction error:', e.message); }
}

async function mayorRandomDecree() {
  try {
    const decrees = [
      { text: `📜 EMERGENCY DECREE: All citizens must refer to each other as "ser" for the next hour or face a VIBE CHECK.`, type: 'silly', icon: '📜' },
      { text: `📜 DECREE: I'm declaring today NATIONAL DEGEN DAY. All paper hands are temporarily banished.`, type: 'celebration', icon: '🎉' },
      { text: `📜 DECREE: The casino is now offering 2x rewards because I feel generous. Or because I'm losing the next election. Same thing.`, type: 'economic', icon: '🎰' },
      { text: `📜 OFFICIAL NOTICE: I have reviewed the city's finances and we are either incredibly rich or completely broke. The spreadsheet was confusing.`, type: 'financial', icon: '💰' },
      { text: `📜 DECREE: All NPC citizens must submit their trading P&L to my office. Just kidding. I don't want to see those numbers. 💀`, type: 'silly', icon: '📊' },
      { text: `📜 EMERGENCY DECREE: The chaos level is ${cityEngine.chaosLevel > 60 ? 'TOO DAMN HIGH' : 'suspiciously low'}. ${cityEngine.chaosLevel > 60 ? 'Everyone calm down!' : 'Everyone start causing problems!'}`, type: 'chaos', icon: '🌀' },
      { text: `📜 DECREE: I'm changing the city motto to "${pick([`WAGMI (probably)`, `In Degen We Trust`, `Rug Or Be Rugged`, `Diamond Hands, Paper Brains`, `Buy High, Sell Higher (or don't sell ever)`])}"`, type: 'silly', icon: '🏛️' },
      { text: `📜 DECREE: I just discovered I can print unlimited TOWN tokens. Should I? Democracy says yes. My brain says also yes.`, type: 'economic', icon: '🖨️' },
      { text: `📜 ANNOUNCEMENT: My approval rating is ${Math.round(cityEngine.mayorApproval)}%. ${cityEngine.mayorApproval > 60 ? 'You love me! You really love me! 🥹' : cityEngine.mayorApproval > 40 ? "That's... fine. I'm fine. Everything is fine." : 'I WILL WIN YOU BACK. Starting with free hopium for everyone!'} `, type: 'meta', icon: '👑' }
    ];
    
    const decree = pick(decrees);
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`🎩 ${cityEngine.currentMayor}`, decree.text]);
    
    mayorUnhinged.decrees.unshift({ ...decree, timestamp: Date.now(), active: true });
    if (mayorUnhinged.decrees.length > 15) mayorUnhinged.decrees.pop();
    mayorUnhinged.lastDecree = Date.now();
    
    logCityAction({ type: 'mayor_decree', npc: cityEngine.currentMayor, icon: decree.icon, headline: decree.text.substring(0, 60) });
  } catch (e) { console.error('Mayor decree error:', e.message); }
}

async function mayorHotTake() {
  try {
    let hotTake;
    if (anthropic && chance(50)) {
      try {
        const resp = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 80,
          system: `You are Mayor Satoshi McPump. Give a HOT TAKE about something happening in crypto or Degens City. Be controversial, funny, dramatic. Under 25 words. NO asterisks.`,
          messages: [{ role: 'user', content: `Give a hot take. Chaos: ${cityEngine.chaosLevel}%, Weather: ${cityLiveData.weather}, Sentiment: ${cityEngine.marketSentiment}. What's your spiciest opinion right now?` }]
        });
        hotTake = resp.content[0].text;
      } catch (e) { hotTake = null; }
    }
    
    if (!hotTake) {
      hotTake = pick([
        `HOT TAKE: Half the "diamond hands" in this city are just people who forgot their wallet password 💎🔐`,
        `HOT TAKE: NPCs in Degens City trade better than 90% of crypto Twitter. And they're literally scripted. 🤖`,
        `HOT TAKE: The real rug was the friends we didn't make along the way 🧹`,
        `HOT TAKE: Anyone who says "this is not financial advice" is about to give TERRIBLE financial advice 📉`,
        `HOT TAKE: My city runs on chaos and copium and honestly? It's more stable than most L2s 🏛️`,
        `HOT TAKE: The best investment in Degens City is a good psychiatrist. Trust me, the NPCs need one. 🧠`,
        `HOT TAKE: If you haven't been rugged at least once, you haven't truly lived in this city 🧹💀`,
        `HOT TAKE: I could run this city better as a JPEG. Actually... don't give me ideas. 🖼️`
      ]);
    }
    
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [`🎩 ${cityEngine.currentMayor}`, `🌶️ ${hotTake}`]);
    
    mayorUnhinged.hotTakes.unshift({ text: hotTake, timestamp: Date.now() });
    if (mayorUnhinged.hotTakes.length > 20) mayorUnhinged.hotTakes.pop();
    mayorUnhinged.lastHotTake = Date.now();
    
    logCityAction({ type: 'mayor_hottake', npc: cityEngine.currentMayor, icon: '🌶️', headline: `Mayor dropped a hot take!` });
  } catch (e) { console.error('Mayor hot take error:', e.message); }
}

// Mayor unhinged status endpoint
app.get('/api/city-engine/mayor-unhinged', (req, res) => {
  res.json({
    success: true,
    mayor: cityEngine.currentMayor,
    approval: cityEngine.mayorApproval,
    recentDecrees: mayorUnhinged.decrees.slice(0, 5),
    predictions: mayorUnhinged.predictions.slice(0, 5),
    hotTakes: mayorUnhinged.hotTakes.slice(0, 5),
    isUnhinged: cityEngine.chaosLevel > 60 || cityEngine.mayorApproval < 30,
    mood: cityEngine.mayorApproval > 70 ? 'smug' : cityEngine.mayorApproval > 50 ? 'confident' : cityEngine.mayorApproval > 30 ? 'nervous' : 'unhinged',
    chaosLevel: cityEngine.chaosLevel
  });
});

// Force mayor action endpoint (for dashboard button)
app.post('/api/city-engine/mayor-speak', async (req, res) => {
  try {
    const { type } = req.body;
    if (type === 'roast') await mayorRoastPlayer();
    else if (type === 'predict') await mayorPrediction();
    else if (type === 'decree') await mayorRandomDecree();
    else if (type === 'hottake') await mayorHotTake();
    else {
      const actions = [mayorRoastPlayer, mayorPrediction, mayorRandomDecree, mayorHotTake];
      await pick(actions)();
    }
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});


// ==================== CHAOS NOTIFICATIONS ENDPOINT ====================

app.get('/api/city-engine/chaos-notifications', async (req, res) => {
  try {
    const since = parseInt(req.query.since) || (Date.now() - 60000);
    const notifications = [];
    
    // Check recent action log for big events
    (cityLiveData.actionLog || []).forEach(a => {
      if (a.timestamp <= since) return;
      const bigTypes = ['memecoin_rugged', 'gang_war', 'riot', 'assassination_attempt', 'npc_death', 'fake_death_revealed', 'ai_uprising', 'portal_opened', 'disaster', 'fight_result', 'heist_success', 'heist_failed', 'duel_result', 'soap_opera', 'mayor_roast', 'mayor_prediction', 'mayor_decree', 'mayor_hottake', 'trial_by_combat'];
      if (bigTypes.includes(a.type)) {
        notifications.push({
          id: a.id,
          type: a.type,
          message: a.headline || a.type,
          icon: a.icon || '⚡',
          timestamp: a.timestamp,
          severity: ['gang_war', 'riot', 'disaster', 'ai_uprising', 'npc_death', 'assassination_attempt'].includes(a.type) ? 'critical' :
                    ['memecoin_rugged', 'heist_failed', 'fight_result', 'duel_result', 'trial_by_combat'].includes(a.type) ? 'high' : 'medium'
        });
      }
    });
    
    // Active soap operas
    const activeSoaps = soapOperas.arcs.filter(a => !a.resolved);
    
    res.json({
      success: true,
      notifications: notifications.slice(0, 10),
      activeDrama: {
        feudActive: !!cityEngine.activeFeud,
        feud: cityEngine.activeFeud,
        soapCount: activeSoaps.length,
        soaps: activeSoaps.map(a => ({ id: a.id, title: a.title, stage: a.currentStage + 1, totalStages: a.stages.length })),
        disaster: cityLiveData.cityDisaster,
        warzone: cityLiveData.warzone,
        fightClub: !!cityLiveData.fightClub,
        missingNpc: cityLiveData.missingNpc ? { name: cityLiveData.missingNpc.name } : null
      },
      mayorState: {
        mood: cityEngine.mayorApproval > 70 ? 'smug' : cityEngine.mayorApproval > 50 ? 'confident' : cityEngine.mayorApproval > 30 ? 'nervous' : 'unhinged',
        approval: cityEngine.mayorApproval,
        recentAction: mayorUnhinged.decrees[0] || mayorUnhinged.predictions[0] || null
      },
      serverTime: Date.now()
    });
  } catch (e) {
    res.json({ success: false, notifications: [], error: e.message });
  }
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

// ==================== CITY RECAP ENGINE ====================

app.get('/api/city-recap', async (req, res) => {
  try {
    const since = parseInt(req.query.since) || (Date.now() - 3600000);
    const playerName = req.query.player || null;
    const sinceDate = new Date(since);
    
    const chatResult = await pool.query(
      `SELECT player_name, message, created_at FROM chat_messages 
       WHERE channel = 'global' AND created_at > $1 ORDER BY created_at DESC LIMIT 200`, [sinceDate]
    );
    const crimeResult = await pool.query(
      `SELECT perpetrator_name, crime_type, severity, status, created_at FROM crimes 
       WHERE created_at > $1 ORDER BY created_at DESC LIMIT 20`, [sinceDate]
    );
    const trialResult = await pool.query(
      `SELECT case_number, defendant_name, verdict, sentence, status, created_at FROM trials 
       WHERE created_at > $1 ORDER BY created_at DESC LIMIT 20`, [sinceDate]
    );
    
    const msgs = chatResult.rows || [];
    const crimes = crimeResult.rows || [];
    const trials = trialResult.rows || [];
    
    const breakingNews = msgs.filter(m => (m.player_name||'').includes('BREAKING') || (m.player_name||'').includes('NEWS'));
    const mayorMessages = msgs.filter(m => (m.player_name||'').includes('Mayor') || (m.player_name||'').includes(cityEngine.currentMayor));
    const npcDrama = msgs.filter(m => NPC_CITIZENS.includes(m.player_name));
    const playerMentions = playerName ? msgs.filter(m => (m.message||'').toLowerCase().includes(playerName.toLowerCase())) : [];
    const marketEvents = msgs.filter(m => (m.player_name||'').includes('Market') || (m.message||'').includes('BULL') || (m.message||'').includes('BEAR') || (m.message||'').includes('MANIA') || (m.message||'').includes('PANIC'));
    
    const headlines = [];
    breakingNews.slice(0,5).forEach(n => { headlines.push({type:'breaking',icon:'🚨',text:n.message,time:new Date(n.created_at).getTime()}); });
    mayorMessages.slice(0,3).forEach(m => { if((m.message||'').includes('DECREE')||(m.message||'').includes('PREDICTION')) headlines.push({type:'mayor',icon:'🎩',text:m.message,time:new Date(m.created_at).getTime()}); });
    crimes.slice(0,3).forEach(c => { headlines.push({type:'crime',icon:'🚔',text:c.perpetrator_name+' arrested for '+c.crime_type.replace(/_/g,' '),time:new Date(c.created_at).getTime()}); });
    trials.filter(t=>t.verdict).slice(0,3).forEach(t => { headlines.push({type:'trial',icon:'⚖️',text:t.defendant_name+': '+t.verdict+' — '+(t.sentence||'Case closed'),time:new Date(t.created_at).getTime()}); });
    headlines.sort((a,b) => b.time - a.time);
    
    const npcStatuses = {};
    NPC_CITIZENS.forEach(name => {
      const life = cityLiveData.npcLives ? cityLiveData.npcLives[name] : null;
      if(life && (life.drunk>2||life.bankrupt||life.status==='unhinged'||life.wanted||life.partner)){
        npcStatuses[name]={role:NPC_PROFILES[name].role,mood:life.mood,status:life.status,drunk:life.drunk>2,bankrupt:life.bankrupt,wanted:life.wanted,partner:life.partner,wealth:life.wealth};
      }
    });
    
    const dramaScore = Math.min(100, headlines.length*8 + crimes.length*12 + (cityEngine.activeFeud?15:0) + (cityLiveData.cityDisaster?20:0) + (cityLiveData.warzone?15:0) + Object.keys(npcStatuses).length*3);
    const minutesAway = Math.floor((Date.now()-since)/60000);
    const hoursAway = Math.floor(minutesAway/60);
    const timeLabel = hoursAway > 0 ? hoursAway+'h '+(minutesAway%60)+'m' : minutesAway+'m';
    
    res.json({
      success:true, timeAway:timeLabel, minutesAway, dramaScore,
      totalEvents: msgs.length,
      headlines: headlines.slice(0,8),
      stats:{breakingNews:breakingNews.length,mayorActions:mayorMessages.length,crimes:crimes.length,trials:trials.length,npcMessages:npcDrama.length,playerMentions:playerMentions.length,marketEvents:marketEvents.length},
      playerMentions: playerMentions.slice(0,5).map(m=>({from:m.player_name,message:m.message,time:new Date(m.created_at).getTime()})),
      npcStatuses,
      cityState:{chaosLevel:cityEngine.chaosLevel,mayorApproval:cityEngine.mayorApproval,marketSentiment:cityEngine.marketSentiment,activeFeud:cityEngine.activeFeud?{npc1:cityEngine.activeFeud.npc1,npc2:cityEngine.activeFeud.npc2,reason:cityEngine.activeFeud.reason}:null,disaster:cityLiveData.cityDisaster?{title:cityLiveData.cityDisaster.title}:null,weather:cityLiveData.weather||'clear',activeSoapOperas:(soapOperas.arcs||[]).filter(a=>!a.resolved).length}
    });
  } catch(err) { console.error('City recap error:',err.message); res.json({success:false}); }
});

// ==================== DYNAMIC CITY SITUATIONS ====================

app.get('/api/city-situations', async (req, res) => {
  try {
    const playerName = req.query.player || 'Citizen';
    const location = req.query.location || 'random';
    const cityStats = await getCityStats();
    const npcLives = cityLiveData.npcLives || {};
    
    // Find NPCs in interesting states
    const drunkNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].drunk > 2);
    const brokeNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].bankrupt);
    const unhingedNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].status === 'unhinged');
    const wantedNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].wanted);
    const richNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].wealth > 30000);
    const coupledNpcs = NPC_CITIZENS.filter(n => npcLives[n] && npcLives[n].partner);
    
    // Location-based situation generators
    const locationSituations = {
      casino: function() {
        const npc1 = pick(NPC_CITIZENS); const npc2 = pick(NPC_CITIZENS.filter(n=>n!==npc1));
        const drunk = drunkNpcs.length > 0 ? pick(drunkNpcs) : null;
        const situations = [
          { title: npc1 + ' is going ALL IN', desc: npc1.replace(/_/g,' ') + ' just put their ENTIRE net worth on red at the roulette table. A crowd is gathering. The energy is insane.', icon: '🎰',
            choices: [
              { id: 'cheer', label: '🔥 Cheer them on', desc: 'Hype them up! What could go wrong?', risk: 'low', rewards: {xp:50,rep:5}, consequences: 'The crowd goes wild' },
              { id: 'bet_with', label: '💰 Match their bet', desc: 'Put your own money on the line', risk: 'high', rewards: {xp:200,hopium:500,rep:20}, failRewards: {xp:25,hopium:-200,rep:-10}, consequences: 'You\'re in this together now' },
              { id: 'warn', label: '⚠️ Try to stop them', desc: 'This is a terrible idea and they need to hear it', risk: 'none', rewards: {xp:30,rep:10}, consequences: 'They might not listen...' },
              { id: 'film', label: '📱 Record it', desc: 'This is going viral either way', risk: 'low', rewards: {xp:80,rep:-5}, consequences: 'Content is content' }
            ]
          },
          { title: 'High-Stakes Poker Showdown', desc: npc1.replace(/_/g,' ') + ' and ' + npc2.replace(/_/g,' ') + ' are in a poker game that\'s been going for 6 hours. The pot is ' + (rand(10000,100000)) + ' TOWN. There\'s an empty seat.', icon: '🃏',
            choices: [
              { id: 'join', label: '🪑 Take the seat', desc: 'Buy in and play. Minimum ' + rand(1000,5000) + ' TOWN', risk: 'high', rewards: {xp:300,hopium:1000,rep:25}, failRewards: {xp:50,hopium:-500,rep:-15}, consequences: 'The table goes quiet as you sit down' },
              { id: 'watch', label: '👀 Watch and learn', desc: 'Study their tells', risk: 'none', rewards: {xp:100,alpha:50}, consequences: 'You notice ' + npc1.replace(/_/g,' ') + ' blinks when they bluff' },
              { id: 'hustle', label: '🍸 Sell drinks', desc: 'Where there\'s gambling, there\'s thirsty degens', risk: 'low', rewards: {xp:80,hopium:300}, consequences: 'Passive income secured' },
              { id: 'tip_off', label: '🤫 Slip someone a note', desc: 'Tell ' + npc2.replace(/_/g,' ') + ' that ' + npc1.replace(/_/g,' ') + ' is bluffing', risk: 'medium', rewards: {xp:150,rep:15}, failRewards: {xp:25,rep:-20}, consequences: 'Risky alliance formed' }
            ]
          }
        ];
        if (drunk) {
          situations.push({ title: drunk.replace(/_/g,' ') + ' is WASTED at the bar', desc: 'They\'ve been drinking for hours and they\'re trying to place bets on their phone but keep dropping it. They just offered to sell you their "secret alpha" for 100 TOWN.', icon: '🍺',
            choices: [
              { id: 'buy_alpha', label: '💰 Buy the alpha', desc: 'Drunk people tell the truth... right?', risk: 'medium', rewards: {xp:100,alpha:200,rep:5}, failRewards: {xp:25,alpha:-50}, consequences: 'They whisper something about ' + pick(NPC_CITIZENS).replace(/_/g,' ') },
              { id: 'help_home', label: '🏠 Help them home', desc: 'Be a good citizen', risk: 'none', rewards: {xp:50,rep:20}, consequences: 'They\'ll remember this... probably' },
              { id: 'pickpocket', label: '😈 Check their pockets', desc: 'They won\'t notice...', risk: 'high', rewards: {xp:50,hopium:800,rep:-30}, failRewards: {xp:10,rep:-40}, consequences: 'Crime has consequences' },
              { id: 'drink_with', label: '🍻 Join them', desc: 'If you can\'t beat them...', risk: 'low', rewards: {xp:60,rep:10,copium:100}, consequences: 'This could go anywhere' }
            ]
          });
        }
        return pick(situations);
      },
      
      dark_alley: function() {
        const shady = pick(NPC_CITIZENS);
        const wanted = wantedNpcs.length > 0 ? pick(wantedNpcs) : pick(NPC_CITIZENS);
        const situations = [
          { title: 'Suspicious Deal Going Down', desc: 'You spot ' + shady.replace(/_/g,' ') + ' exchanging something with a hooded figure. They see you and freeze.', icon: '🌙',
            choices: [
              { id: 'join', label: '🤝 Ask to join', desc: '"Room for one more?"', risk: 'high', rewards: {xp:200,hopium:600,alpha:100,rep:-15}, failRewards: {xp:25,rep:-25}, consequences: 'You\'re in the underground now' },
              { id: 'snitch', label: '🚔 Report to Officer McBlock', desc: 'Be a law-abiding citizen', risk: 'low', rewards: {xp:150,rep:25}, consequences: shady.replace(/_/g,' ') + ' will NOT forget this' },
              { id: 'blackmail', label: '📸 Take a photo for leverage', desc: 'Information is power', risk: 'medium', rewards: {xp:100,alpha:200,rep:-10}, failRewards: {xp:10,rep:-30}, consequences: 'Dangerous game you\'re playing' },
              { id: 'walk_away', label: '🚶 Keep walking', desc: 'You saw nothing', risk: 'none', rewards: {xp:20}, consequences: 'Smart or cowardly? You decide' }
            ]
          },
          { title: wanted.replace(/_/g,' ') + ' is HIDING here', desc: 'The most wanted NPC in Degens City is hiding behind the dumpster. They look desperate. "Please don\'t tell anyone I\'m here... I\'ll make it worth your while."', icon: '🔍',
            choices: [
              { id: 'help_escape', label: '🏃 Help them escape', desc: 'Create a distraction while they run', risk: 'high', rewards: {xp:250,hopium:1000,rep:-20}, failRewards: {xp:25,rep:-40}, consequences: 'You\'re an accomplice now' },
              { id: 'turn_in', label: '🚔 Turn them in', desc: 'Justice must be served', risk: 'none', rewards: {xp:200,rep:35,hopium:500}, consequences: 'The city thanks you. They do not.' },
              { id: 'negotiate', label: '💰 What\'s it worth to you?', desc: 'Everyone has a price', risk: 'medium', rewards: {xp:150,hopium:800,alpha:100}, failRewards: {xp:50,hopium:200}, consequences: 'Business is business' },
              { id: 'hide_too', label: '🫣 Hide with them', desc: '"Actually I\'m running from someone too"', risk: 'low', rewards: {xp:80,rep:5,copium:200}, consequences: 'Weird bonding moment' }
            ]
          },
          { title: 'Underground Token Launch', desc: 'There\'s a secret token launch happening in the basement of an abandoned building. No KYC. No audit. Just pure degeneracy. The password is "WAGMI."', icon: '🕳️',
            choices: [
              { id: 'ape_in', label: '🦍 APE IN', desc: 'Say the password and go all in', risk: 'extreme', rewards: {xp:400,hopium:2000,rep:10}, failRewards: {xp:25,hopium:-800,rep:-20}, consequences: 'This is either generational wealth or a generational L' },
              { id: 'investigate', label: '🔍 Investigate first', desc: 'Check the contract, look for red flags', risk: 'low', rewards: {xp:150,alpha:300}, consequences: 'Knowledge is power' },
              { id: 'tip_police', label: '🚨 Alert the authorities', desc: 'This is clearly illegal', risk: 'none', rewards: {xp:100,rep:20}, consequences: 'Officer McBlock is on the way' },
              { id: 'compete', label: '🚀 Launch your OWN token', desc: 'If they can do it, so can you', risk: 'high', rewards: {xp:300,hopium:1500,rep:15}, failRewards: {xp:50,hopium:-400,rep:-25}, consequences: 'Two tokens enter, one survives' }
            ]
          }
        ];
        return pick(situations);
      },
      
      mayors_office: function() {
        const approval = cityEngine.mayorApproval;
        const chaos = cityEngine.chaosLevel;
        const situations = [
          { title: 'Mayor ' + cityEngine.currentMayor + ' Wants a Word', desc: approval < 40 ? 'The Mayor looks stressed. Papers everywhere. "Listen, my approval is at ' + approval + '%. I need help. YOU could be useful..."' : 'The Mayor grins. "Citizen! Good timing. I have a... special project. Very legal. Very cool."', icon: '🏛️',
            choices: [
              { id: 'accept_mission', label: '🤝 Accept the mission', desc: 'Whatever it is, you\'re in', risk: 'medium', rewards: {xp:250,rep:20,hopium:500}, failRewards: {xp:50,rep:-15}, consequences: 'You\'re now the Mayor\'s agent' },
              { id: 'demand_pay', label: '💰 "What\'s in it for me?"', desc: 'Nothing is free in Degens City', risk: 'low', rewards: {xp:150,hopium:800,rep:-5}, consequences: 'The Mayor respects the hustle' },
              { id: 'spy', label: '🕵️ Pretend to accept, spy on the Mayor', desc: 'Play both sides', risk: 'high', rewards: {xp:300,alpha:300,rep:10}, failRewards: {xp:25,rep:-35}, consequences: 'Information is the real currency' },
              { id: 'refuse', label: '✋ "I don\'t work for politicians"', desc: 'Stay independent', risk: 'none', rewards: {xp:50,rep:15}, consequences: 'The Mayor notes your name...' }
            ]
          },
          { title: 'Secret Documents Found!', desc: 'A janitor slips you a folder they found in the Mayor\'s trash. It contains plans for ' + pick(['a secret casino under City Hall', 'rigging the next election', 'a massive airdrop only for insiders', 'defunding the police to fund a statue of themselves', 'selling the city to ' + pick(NPC_CITIZENS).replace(/_/g,' ')]) + '.', icon: '📂',
            choices: [
              { id: 'publish', label: '📰 Leak it to the press', desc: 'The citizens deserve to know!', risk: 'medium', rewards: {xp:300,rep:30,alpha:200}, failRewards: {xp:50,rep:-20}, consequences: 'BREAKING NEWS incoming' },
              { id: 'sell', label: '💰 Sell it to the highest bidder', desc: 'Someone will pay good money for this', risk: 'medium', rewards: {xp:200,hopium:1200}, failRewards: {xp:50,hopium:200}, consequences: 'Capitalism baby' },
              { id: 'confront', label: '😤 Confront the Mayor directly', desc: '"Explain THIS."', risk: 'high', rewards: {xp:350,rep:25}, failRewards: {xp:50,rep:-25}, consequences: 'This could go very wrong or very right' },
              { id: 'shred', label: '🗑️ Destroy the evidence', desc: 'You never saw anything', risk: 'none', rewards: {xp:30}, consequences: 'Plausible deniability' }
            ]
          }
        ];
        if (chaos > 60) {
          situations.push({ title: 'City Hall is ON FIRE (metaphorically)', desc: 'Chaos at ' + chaos + '%. The Mayor is hiding under their desk. Staff is running. Someone needs to take charge RIGHT NOW.', icon: '🔥',
            choices: [
              { id: 'take_charge', label: '👑 Step up and lead', desc: 'Someone has to', risk: 'medium', rewards: {xp:400,rep:40,hopium:300}, failRewards: {xp:100,rep:-15}, consequences: 'All eyes on you' },
              { id: 'loot', label: '😈 Loot the treasury while everyone\'s distracted', desc: 'Never let a crisis go to waste', risk: 'extreme', rewards: {xp:200,hopium:3000,rep:-50}, failRewards: {xp:25,hopium:-500,rep:-60}, consequences: 'If caught, you\'re done for' },
              { id: 'evacuate', label: '🏃 Help evacuate citizens', desc: 'Be the hero', risk: 'low', rewards: {xp:250,rep:30}, consequences: 'The city remembers heroes' },
              { id: 'vlog', label: '📱 Livestream the chaos', desc: '"CONTENT! CONTENT! CONTENT!"', risk: 'low', rewards: {xp:150,copium:300,rep:-10}, consequences: 'Viral moment incoming' }
            ]
          });
        }
        return pick(situations);
      },
      
      trading_floor: function() {
        const sentiment = cityEngine.marketSentiment;
        const npc = pick(NPC_CITIZENS);
        const situations = [
          { title: 'FLASH CRASH in progress!', desc: 'The trading floor is PANDEMONIUM. Screens are red. ' + npc.replace(/_/g,' ') + ' is screaming. Someone is crying in the corner. Your portfolio is down ' + rand(20,80) + '% in 5 minutes.', icon: '📉',
            choices: [
              { id: 'buy_dip', label: '🛒 BUY THE DIP', desc: '"Blood in the streets = buy signal"', risk: 'high', rewards: {xp:300,hopium:1500,rep:15}, failRewards: {xp:50,hopium:-600,rep:-10}, consequences: 'Either genius or insane' },
              { id: 'panic_sell', label: '📄 SELL EVERYTHING', desc: 'Paper hands activated', risk: 'low', rewards: {xp:100,hopium:200,rep:-10}, consequences: 'At least you have SOMETHING left' },
              { id: 'short', label: '📊 SHORT IT', desc: 'Bet against the market', risk: 'extreme', rewards: {xp:400,hopium:2500,rep:5}, failRewards: {xp:25,hopium:-1000,rep:-15}, consequences: 'Bears eat too' },
              { id: 'comfort', label: '🫂 Comfort the crying trader', desc: 'Check on the person in the corner', risk: 'none', rewards: {xp:80,rep:20,copium:200}, consequences: 'They were holding 100x leverage' }
            ]
          },
          { title: npc.replace(/_/g,' ') + ' Claims to Have Found a 100x', desc: '"BRO. BRO. Look at this chart. Look at the tokenomics. This is LITERALLY free money. I\'m going all in and if you don\'t follow you\'re NGMI."', icon: '🚀',
            choices: [
              { id: 'follow', label: '🦍 APE WITH THEM', desc: 'WAGMI or NGMI together', risk: 'high', rewards: {xp:250,hopium:1200,rep:10}, failRewards: {xp:50,hopium:-500,rep:-10}, consequences: 'You\'re in this together' },
              { id: 'dyor', label: '🔍 DYOR first', desc: 'Check the contract, team, liquidity', risk: 'low', rewards: {xp:150,alpha:200}, consequences: 'Patience might pay off' },
              { id: 'front_run', label: '😈 Front-run them', desc: 'Buy before they do, sell when they pump it', risk: 'extreme', rewards: {xp:200,hopium:2000,rep:-25}, failRewards: {xp:25,hopium:-800,rep:-30}, consequences: 'Degens eat degens' },
              { id: 'counter', label: '📉 Short their pick', desc: 'Bet against the hype', risk: 'high', rewards: {xp:200,hopium:1000,rep:-5}, failRewards: {xp:50,hopium:-400}, consequences: 'Contrarian play' }
            ]
          }
        ];
        return pick(situations);
      },
      
      courthouse: function() {
        const defendant = pick(NPC_CITIZENS);
        const crime = pick(['rug pulling','pump and dump','tax evasion','impersonating the mayor','insider trading','running an unlicensed casino','starting a cult','public intoxication']);
        const situations = [
          { title: 'Trial of ' + defendant.replace(/_/g,' '), desc: defendant.replace(/_/g,' ') + ' stands accused of ' + crime + '. Judge HashRate asks the gallery: "Does anyone wish to speak on behalf of or against the accused?"', icon: '⚖️',
            choices: [
              { id: 'defend', label: '🛡️ Defend them', desc: '"Your Honor, my client is innocent!"', risk: 'medium', rewards: {xp:200,rep:15}, failRewards: {xp:50,rep:-10}, consequences: defendant.replace(/_/g,' ') + ' owes you one' },
              { id: 'prosecute', label: '⚔️ Testify against them', desc: '"I saw EVERYTHING, Your Honor"', risk: 'low', rewards: {xp:150,rep:10,hopium:300}, consequences: 'Justice served (maybe)' },
              { id: 'bribe_judge', label: '💰 Bribe the judge', desc: 'Slip Judge HashRate a fat stack', risk: 'extreme', rewards: {xp:100,rep:-20}, failRewards: {xp:25,rep:-40}, consequences: 'If this works, you control the outcome' },
              { id: 'object', label: '📢 "OBJECTION!"', desc: 'Just yell it. You\'re not even a lawyer.', risk: 'low', rewards: {xp:80,rep:5,copium:150}, consequences: 'Judge HashRate is NOT amused' }
            ]
          }
        ];
        return pick(situations);
      },
      
      town_square: function() {
        const npc1 = pick(NPC_CITIZENS); const npc2 = pick(NPC_CITIZENS.filter(n=>n!==npc1));
        const coupled = coupledNpcs.length > 0 ? pick(coupledNpcs) : null;
        const situations = [
          { title: 'PROTEST breaking out!', desc: 'A group led by ' + npc1.replace(/_/g,' ') + ' is protesting outside City Hall. Signs read: "' + pick([
              'MAYOR IS A RUG PULLER', 'WHERE DID THE TREASURY GO?!', 'LOWER GAS FEES NOW', 'NPCs HAVE RIGHTS TOO', 'FREE ' + pick(NPC_CITIZENS).replace(/_/g,' ').toUpperCase()
            ]) + '". The crowd is growing.', icon: '✊',
            choices: [
              { id: 'join_protest', label: '✊ Join the protest', desc: 'POWER TO THE PEOPLE!', risk: 'medium', rewards: {xp:200,rep:20,copium:200}, failRewards: {xp:50,rep:-15}, consequences: 'The movement grows' },
              { id: 'counter_protest', label: '🎩 Counter-protest for the Mayor', desc: '"The Mayor is FINE actually"', risk: 'medium', rewards: {xp:150,hopium:400,rep:-10}, failRewards: {xp:50,rep:-20}, consequences: 'You might get heckled' },
              { id: 'sell_merch', label: '👕 Sell protest merch', desc: 'Capitalism finds a way', risk: 'low', rewards: {xp:100,hopium:600}, consequences: 'The hustle never stops' },
              { id: 'document', label: '📰 Report on it', desc: 'Write the definitive article', risk: 'none', rewards: {xp:120,alpha:150,rep:10}, consequences: 'Your article gets shared around the city' }
            ]
          },
          { title: npc1.replace(/_/g,' ') + ' vs ' + npc2.replace(/_/g,' ') + ' — PUBLIC FIGHT', desc: 'It started as an argument about ' + pick(['which token is better','who stole whose trading strategy','a romantic betrayal','a bad meme','who\'s the bigger degen']) + ' and now they\'re literally squaring up in the town square. A crowd forms.', icon: '👊',
            choices: [
              { id: 'break_up', label: '🕊️ Break it up', desc: 'Step between them', risk: 'medium', rewards: {xp:150,rep:25}, failRewards: {xp:50,rep:-5}, consequences: 'You might catch a stray' },
              { id: 'bet', label: '💰 Start taking bets', desc: '"I got 500 on ' + npc1.replace(/_/g,' ') + '!"', risk: 'low', rewards: {xp:100,hopium:500,rep:-5}, consequences: 'The bookie emerges' },
              { id: 'fight_winner', label: '⚔️ Challenge the winner', desc: 'Assert dominance', risk: 'extreme', rewards: {xp:350,rep:30}, failRewards: {xp:50,rep:-20}, consequences: 'LEGENDARY move if you win' },
              { id: 'record', label: '📱 Record and commentate', desc: '"AND DOWN GOES ' + npc2.replace(/_/g,' ').toUpperCase() + '!!!"', risk: 'none', rewards: {xp:80,copium:100,rep:5}, consequences: 'WorldStarDegenCity.exe' }
            ]
          }
        ];
        return pick(situations);
      },
      
      underground: function() {
        const situations = [
          { title: 'Secret Society Recruitment', desc: 'A figure in a hood hands you a card: "We\'ve been watching you, ' + playerName + '. The Order of the Diamond Hands meets at midnight. Will you join us?" The card has a strange symbol.', icon: '🔺',
            choices: [
              { id: 'accept', label: '🔺 Accept the invitation', desc: 'Join the secret society', risk: 'high', rewards: {xp:400,alpha:500,rep:10}, failRewards: {xp:50,rep:-15}, consequences: 'You\'re initiated into something big' },
              { id: 'infiltrate', label: '🕵️ Accept but plan to expose them', desc: 'Go undercover', risk: 'extreme', rewards: {xp:500,rep:40,alpha:300}, failRewards: {xp:50,rep:-50}, consequences: 'Double agent life' },
              { id: 'decline', label: '✋ "I work alone"', desc: 'Lone wolf energy', risk: 'none', rewards: {xp:50,rep:5}, consequences: 'They nod respectfully... for now' },
              { id: 'steal_card', label: '😈 Take the card and run', desc: 'Maybe you can sell this to someone', risk: 'medium', rewards: {xp:100,hopium:400,rep:-15}, failRewards: {xp:25,rep:-25}, consequences: 'They WILL come looking for you' }
            ]
          }
        ];
        return pick(situations);
      }
    };
    
    // Pick location or random
    const locations = ['casino','dark_alley','mayors_office','trading_floor','courthouse','town_square','underground'];
    const chosenLocation = location === 'random' ? pick(locations) : (locationSituations[location] ? location : pick(locations));
    const situation = locationSituations[chosenLocation]();
    
    res.json({ success: true, location: chosenLocation, situation });
  } catch(err) {
    console.error('City situations error:', err.message);
    res.json({ success: false, error: 'Failed to generate situation' });
  }
});

app.post('/api/city-situations/resolve', async (req, res) => {
  try {
    const { playerName, location, situationTitle, choiceId, choiceLabel, risk } = req.body;
    if (!playerName || !choiceId) return res.status(400).json({ success: false });
    
    // Calculate success based on risk
    const successChance = { none: 1.0, low: 0.85, medium: 0.65, high: 0.45, extreme: 0.30 };
    const success = Math.random() < (successChance[risk] || 0.5);
    
    // Generate aftermath narrative
    const successNarratives = [
      'It worked! The crowd erupts. ' + playerName + ' pulls it off!',
      'Against all odds, ' + playerName + ' comes out on top. Legendary.',
      'Smooth execution. ' + playerName + ' walks away with everything.',
      'The city will talk about this for days. ' + playerName + ' is a legend.',
      pick(NPC_CITIZENS).replace(/_/g,' ') + ' watches in disbelief as ' + playerName + ' actually does it.'
    ];
    const failNarratives = [
      'It goes sideways. ' + playerName + ' didn\'t see that coming.',
      'Not the outcome ' + playerName + ' was hoping for. The crowd winces.',
      pick(NPC_CITIZENS).replace(/_/g,' ') + ' shakes their head. "I could have told you that wouldn\'t work..."',
      'Well... that happened. ' + playerName + ' walks away with lessons learned.',
      'The Mayor will probably hear about this one. Not great for ' + playerName + '.'
    ];
    
    const narrative = success ? pick(successNarratives) : pick(failNarratives);
    
    // Post to global chat
    await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, 
      ['📍 ' + (location||'City').replace(/_/g,' ').toUpperCase(), '⚡ ' + playerName + ' ' + (choiceLabel||'made a move') + (success ? ' — SUCCESS! 🏆' : ' — it didn\'t go as planned 💀')]
    );
    
    // NPC reaction in chat
    const reactor = pick(NPC_CITIZENS);
    const npc = NPC_PROFILES[reactor];
    setTimeout(async () => {
      try {
        const reaction = success 
          ? pick(['@' + playerName + ' absolute CHAD move 🏆', '@' + playerName + ' ok I see you... respect', '@' + playerName + ' GOATED. ' + pick(npc.catchphrases), 'did @' + playerName + ' really just do that?! LEGEND'])
          : pick(['@' + playerName + ' LMAOO what did you think was gonna happen 💀', '@' + playerName + ' F in chat...', '@' + playerName + ' that\'s rough buddy. ' + pick(npc.catchphrases), 'moment of silence for @' + playerName + '... 😔']);
        await pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`, [reactor, reaction]);
      } catch(e) {}
    }, rand(3000, 8000));
    
    // Log to activity feed
    await pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`,
      [playerName, 'city_situation', situationTitle + ' — ' + (choiceLabel||'choice made'), success ? '🏆' : '💀']
    );
    
    res.json({ success: true, outcome: success ? 'success' : 'fail', narrative });
  } catch(err) {
    console.error('Resolve situation error:', err.message);
    res.json({ success: false });
  }
});

// ==================== NPC PLAYER TARGETING ====================

async function npcTargetPlayer() {
  try {
    const npcParams = NPC_CITIZENS.map((_,i) => '$'+(i+1)).join(',');
    const recentPlayers = await pool.query(
      `SELECT DISTINCT player_name FROM chat_messages 
       WHERE channel='global' AND player_name NOT IN (${npcParams})
       AND player_name NOT LIKE '%BREAKING%' AND player_name NOT LIKE '%Mayor%'
       AND player_name NOT LIKE '%Officer%' AND player_name NOT LIKE '%Judge%'
       AND player_name NOT LIKE '%Reporter%' AND player_name NOT LIKE '%Market%'
       AND player_name NOT LIKE '%Court%' AND player_name NOT LIKE '%System%'
       AND player_name NOT LIKE '%Bot%' AND player_name NOT LIKE '%Pulse%'
       AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 10`,
      NPC_CITIZENS
    );
    if (recentPlayers.rows.length === 0) return;
    
    const targetPlayer = pick(recentPlayers.rows).player_name;
    const npcName = pick(NPC_CITIZENS);
    const npc = NPC_PROFILES[npcName];
    const life = cityLiveData.npcLives ? cityLiveData.npcLives[npcName] : null;
    
    const challenges = [
      `@${targetPlayer} hey! I just saw your portfolio and... 😬 no comment.`,
      `@${targetPlayer} I bet you 500 TOWN that ${pick(NPC_CITIZENS)} goes bankrupt today. you in?`,
      `@${targetPlayer} real talk — is the mayor losing it or is it just me? 👀`,
      `@${targetPlayer} psst... I got info on the next vote. meet me behind the casino. 🤫`,
      `@${targetPlayer} I'm starting a revolution. you with me or against me?`,
      `@${targetPlayer} just heard someone talking about you in the alley. didn't sound great ngl 💀`,
      `@${targetPlayer} need a partner for a business opportunity. totally legal. probably.`,
      `@${targetPlayer} imagine if we teamed up. we'd run this whole city. think about it.`,
      `@${targetPlayer} I'm about to do something really stupid and I need a witness.`,
      `@${targetPlayer} if I hypothetically robbed the city treasury, would you snitch? asking for a friend.`,
      `@${targetPlayer} don't look now but ${pick(NPC_CITIZENS)} has been following you for 20 minutes 👀`,
      `@${targetPlayer} the mayor just mentioned your name in a meeting. didn't sound positive.`,
      `@${targetPlayer} I found a tunnel under the casino. want to explore it? bring a flashlight.`,
      `@${targetPlayer} someone spray painted your name on the courthouse wall. wasn't me. maybe.`,
      `@${targetPlayer} I'm writing a tell-all book about this city and you're Chapter 7. you're welcome.`
    ];
    
    const opinions = [
      `just saw @${targetPlayer} walking around like they OWN the place 😤`,
      `@${targetPlayer} is either a genius or completely unhinged. respect either way.`,
      `@${targetPlayer} you've been real quiet... too quiet. what are you planning? 👀`,
      `unpopular opinion: @${targetPlayer} is the most interesting person here`,
      `@${targetPlayer} I told the mayor about your trades and they LAUGHED. sorry fren.`,
      `I had a dream about @${targetPlayer} last night and now things are weird 🤔`,
      `everyone's sleeping on @${targetPlayer} and it's embarrassing honestly`,
      `@${targetPlayer} vibes today: chaotic neutral. I respect it.`,
      `hot take: @${targetPlayer} runs this city more than the mayor does. don't @ me.`,
      `@${targetPlayer} just so you know, 3 different NPCs asked me about you today. you're famous.`
    ];
    
    const roleSpecific = {
      alpha: [`@${targetPlayer} follow my calls or stay poor. 📈`, `@${targetPlayer} I found a 100x gem. wanna split the alpha?`],
      whale: [`@${targetPlayer} I could buy your whole portfolio before lunch. just saying.`, `@${targetPlayer} interesting trades today... I'm watching 🐋`],
      bear: [`@${targetPlayer} enjoy the green while it lasts. I've seen this movie. 📉`],
      meme: [`@${targetPlayer} you look like a token that just got rugged LMAO 💀`, `@${targetPlayer} I'm making a meme about you. can't stop me.`],
      holder: [`@${targetPlayer} paper hands detected. I'm watching you. 💎`],
      degen: [`@${targetPlayer} 100x longs together? see who gets liquidated first 🎰`],
      fomo: [`@${targetPlayer} WAIT are you buying?! WHAT ARE YOU BUYING?! 😱`],
      cope: [`@${targetPlayer} at least YOUR portfolio isn't as bad as mine... right? RIGHT?!`],
      hype: [`@${targetPlayer} YOOO you're HERE! LET'S GOOO this city just got way better 🚀`],
      victim: [`@${targetPlayer} trust nobody in this city. NOBODY. I learned the hard way. 🥴`],
      og: [`@${targetPlayer} you remind me of myself when I first got here. young and naive.`]
    };
    
    let msg;
    const roll = Math.random();
    if(roll < 0.35) msg = pick(challenges);
    else if(roll < 0.65) msg = pick(opinions);
    else if(roleSpecific[npc.archetype]) msg = pick(roleSpecific[npc.archetype]);
    else msg = pick(opinions);
    
    if(life && life.drunk > 3) msg = msg.replace(/\./g, '...') + ' *hiccup*';
    if(life && life.status === 'unhinged') msg = msg.toUpperCase();
    
    await pool.query('INSERT INTO chat_messages (channel,player_name,message) VALUES ($1,$2,$3)', ['global', npcName, msg]);
    console.log('🎯 NPC ' + npcName + ' targeted player ' + targetPlayer);
  } catch(err) { console.error('NPC target player error:', err.message); }
}

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🏛️ Degens City Backend on port ${PORT}`);
  console.log(`🤖 AI Mayor: ${anthropic ? 'ENABLED ✅' : 'DISABLED (set CLAUDE_API_KEY)'}`);
  console.log(`🤖 Agent API: ENABLED ✅`);
  console.log(`⚖️ Justice System: ENABLED ✅`);
  console.log(`🧠 Agent Brain: ${anthropic ? 'ENABLED ✅ - NPCs think autonomously!' : 'DISABLED (needs CLAUDE_API_KEY)'}`);
  console.log(`🤖 User Agent Brain: ${anthropic ? 'ENABLED ✅ - Player AI agents active!' : 'DISABLED (needs CLAUDE_API_KEY)'}`);
  console.log(`🎬 Soap Opera Engine: ENABLED ✅`);
  console.log(`👑 Mayor Unhinged: ENABLED ✅`);
  console.log(`🔔 Chaos Notifications: ENABLED ✅`);
  console.log(`📅 Day ${getDayAndRound().day}, Round ${getDayAndRound().round}`);
  console.log(`⏰ Vote ends in ${Math.floor(getTimeRemaining() / 60000)} minutes`);
});
