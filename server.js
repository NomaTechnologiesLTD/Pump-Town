// Pump Town - AI Mayor Backend Server
// This server handles user auth, game state, and AI-powered governance

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
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
    const { message, playerName, playerLevel } = req.body;
    
    if (!message || message.length > 500) {
      return res.status(400).json({ success: false, error: 'Invalid message' });
    }
    
    const cityStats = await getCityStats();
    
    const prompt = `Citizen "${playerName || 'Anonymous'}" (Level ${playerLevel || 1}) says: "${message}"

City stats: Economy ${cityStats.economy}, Security ${cityStats.security}, Culture ${cityStats.culture}, Morale ${cityStats.morale}

Respond as Mayor Satoshi McPump in 2-4 sentences. Be witty, use crypto slang, stay in character. Remember: NO asterisks for actions!`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: MAYOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    // Remove any asterisk actions like *leans back* or *grabs megaphone*
    let cleanedResponse = response.content[0].text.replace(/\*[^*]+\*/g, '').trim();
    // Clean up any double spaces left behind
    cleanedResponse = cleanedResponse.replace(/\s{2,}/g, ' ');

    console.log('🤖 Mayor chat with', playerName);
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
    features: ['vote-generation', 'mayor-reactions', 'events', 'chat', 'daily-briefing']
  });
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
  const { email, character } = req.body;
  if (!email || !character) return res.status(400).json({ success: false, error: 'Data required' });
  
  try {
    const userResult = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    const userId = userResult.rows[0]?.id || null;
    let avatarStr = typeof character.avatar === 'object' ? JSON.stringify(character.avatar) : character.avatar;
    
    await pool.query(`
      INSERT INTO characters (user_id, email, name, role, trait, avatar, xp, level, reputation, degen_score, treasury, votes_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (email) DO UPDATE SET name=$3, role=$4, trait=$5, avatar=$6, xp=$7, level=$8, reputation=$9, degen_score=$10, treasury=$11, votes_count=GREATEST(characters.votes_count, $12), updated_at=CURRENT_TIMESTAMP
    `, [userId, email.toLowerCase(), character.name, character.role, character.trait, avatarStr, character.xp||0, character.level||1, character.reputation||50, character.degenScore||0, character.treasury||1000, character.votesCount||0]);
    
    console.log('💾 Character saved:', character.name);
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
    
    res.json({ success: true, character: { name: c.name, role: c.role, trait: c.trait, avatar, xp: c.xp, level: c.level, reputation: c.reputation, degenScore: c.degen_score, treasury: c.treasury, votesCount: c.votes_count, joinedDate: c.joined_date, badges: c.badges || [] } });
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
  
  try {
    await pool.query(`
      INSERT INTO player_stats (name, role, xp, level, degen_score, avatar, updated_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET role=COALESCE($2, player_stats.role), xp=COALESCE($3, player_stats.xp), level=COALESCE($4, player_stats.level), degen_score=COALESCE($5, player_stats.degen_score), avatar=COALESCE($6, player_stats.avatar), updated_at=CURRENT_TIMESTAMP
    `, [name, role, xp, level, degenScore, avatar]);
    res.json({ success: true });
  } catch (err) {
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

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  try { await pool.query('SELECT 1'); dbStatus = 'connected'; } catch (err) { dbStatus = 'disconnected'; }
  res.json({ status: 'ok', database: dbStatus, aiEnabled: !!anthropic, serverTime: Date.now(), currentVoteId: getCurrentVoteId(), timeRemaining: getTimeRemaining() });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🏛️ Pump Town Backend on port ${PORT}`);
  console.log(`🤖 AI Mayor: ${anthropic ? 'ENABLED ✅' : 'DISABLED (set CLAUDE_API_KEY)'}`);
  console.log(`📅 Day ${getDayAndRound().day}, Round ${getDayAndRound().round}`);
  console.log(`⏰ Vote ends in ${Math.floor(getTimeRemaining() / 60000)} minutes`);
});
