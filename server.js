// Pump Town - AI Mayor Backend Server
// This server handles user auth, game state, and API calls

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==================== DATABASE CONNECTION ====================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Users table (email/password auth)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        digest_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add digest_enabled column if it doesn't exist (migration)
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT TRUE`).catch(() => {});

    // Characters table
    await client.query(`
      CREATE TABLE IF NOT EXISTS characters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255) NOT NULL,
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

    // Fix existing columns that might be too small
    await client.query(`ALTER TABLE characters ALTER COLUMN avatar TYPE TEXT`).catch(() => {});
    await client.query(`ALTER TABLE characters ALTER COLUMN role TYPE VARCHAR(100)`).catch(() => {});
    await client.query(`ALTER TABLE characters ALTER COLUMN trait TYPE VARCHAR(100)`).catch(() => {});

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

    // Password reset tokens table
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

    // Player stats / leaderboard table
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

    console.log('✅ Database tables initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

// Initialize DB on startup
initDatabase();

// ==================== GAME STATE MANAGEMENT ====================

// Vote cycle duration (6 hours in milliseconds)
const VOTE_CYCLE_MS = 6 * 60 * 60 * 1000;

function getCurrentCycleStart() {
  const now = Date.now();
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const midnightMs = midnight.getTime();
  const cyclesSinceMidnight = Math.floor((now - midnightMs) / VOTE_CYCLE_MS);
  return midnightMs + (cyclesSinceMidnight * VOTE_CYCLE_MS);
}

function getCurrentVoteId() {
  const cycleStart = getCurrentCycleStart();
  return `vote_${cycleStart}`;
}

function getTimeRemaining() {
  const cycleStart = getCurrentCycleStart();
  const cycleEnd = cycleStart + VOTE_CYCLE_MS;
  return Math.max(0, cycleEnd - Date.now());
}

function getDayAndRound() {
  const gameStartDate = new Date();
  gameStartDate.setDate(gameStartDate.getDate() - 3);
  gameStartDate.setUTCHours(0, 0, 0, 0);
  const gameStartMs = gameStartDate.getTime();
  
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  
  const daysSinceStart = Math.floor((now - gameStartMs) / msPerDay) + 1;
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const msSinceMidnight = now - today.getTime();
  const currentRoundOfDay = Math.floor(msSinceMidnight / VOTE_CYCLE_MS) + 1;
  
  return {
    day: daysSinceStart,
    round: currentRoundOfDay,
    roundDisplay: `${currentRoundOfDay}/4`
  };
}

// Game state (static parts - votes/results stored in DB)
const SERVER_START = Date.now();

let gameState = {
  stats: {
    morale: 65,
    crime: 72,
    treasury: 8500,
    reputation: 58,
    dogSin: 50
  },
  voteHistory: [
    {
      id: 'vote_initial_3',
      timestamp: SERVER_START - (3 * 60 * 60 * 1000),
      title: 'Built Dog Park',
      description: 'Community voted to build a dog park in Dirtfield.',
      percentage: 67,
      effects: [
        { stat: 'Morale', value: 8, type: 'positive' },
        { stat: 'Treasury', value: -500, type: 'negative' }
      ]
    },
    {
      id: 'vote_initial_2',
      timestamp: SERVER_START - (9 * 60 * 60 * 1000),
      title: 'Banned Paper Hands',
      description: 'Controversial vote to ban paper hands from voting.',
      percentage: 52,
      effects: [
        { stat: 'Democracy', value: -10, type: 'negative' },
        { stat: 'Loyalty', value: 15, type: 'positive' }
      ]
    },
    {
      id: 'vote_initial_1',
      timestamp: SERVER_START - (15 * 60 * 60 * 1000),
      title: 'Emergency Tax',
      description: 'Implemented emergency tax on all transactions.',
      percentage: 48,
      effects: [
        { stat: 'Treasury', value: 1200, type: 'positive' },
        { stat: 'Morale', value: -12, type: 'negative' }
      ]
    }
  ],
  currentVote: {
    question: "Morale is up, but crime is still rampant. Pump Town needs decisive action. What should we do?",
    options: [
      {
        id: 'A',
        title: 'Jail the Ruggers',
        description: 'Lock up known scammers. Harsh but effective.',
        effects: [
          { stat: 'Crime', value: -25, type: 'positive' },
          { stat: 'Morale', value: -10, type: 'negative' },
          { stat: 'Treasury', value: -1000, type: 'negative' }
        ]
      },
      {
        id: 'B',
        title: 'Fund the Arts',
        description: 'Distract citizens with NFT galleries and meme museums.',
        effects: [
          { stat: 'Morale', value: 20, type: 'positive' },
          { stat: 'Reputation', value: 15, type: 'positive' },
          { stat: 'Crime', value: 5, type: 'negative' }
        ]
      }
    ]
  }
};

// ==================== UTILITY FUNCTIONS ====================

function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function getUpdatedVoteHistory() {
  return gameState.voteHistory.map(vote => ({
    ...vote,
    time: formatTimeAgo(vote.timestamp)
  }));
}

// ==================== AUTH ENDPOINTS ====================

// Send welcome email to new citizens
async function sendWelcomeEmail(email) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Mayor of Pump Town <mayor@pump-town.xyz>',
        to: email,
        subject: '🏛️ gm ser, welcome to Pump Town',
        html: `
          <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0a1628 0%, #1a2f4a 100%); color: #00ff88; padding: 40px; border-radius: 12px; max-width: 600px;">
            <h1 style="color: #00ff88; font-size: 28px; margin-bottom: 10px;">gm, citizen 🐸</h1>
            
            <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">
              You've officially entered <strong style="color: #00ff88;">Pump Town</strong> — the most degen city in all of crypto.
            </p>
            
            <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">
              Here's the deal:
            </p>
            
            <ul style="color: #ffffff; font-size: 15px; line-height: 1.8;">
              <li>🗳️ <strong>Vote every 6 hours</strong> — shape the city's fate</li>
              <li>📈 <strong>Build reputation</strong> — don't be a paper hand</li>
              <li>🏆 <strong>Climb the leaderboard</strong> — prove you're not ngmi</li>
              <li>💎 <strong>Diamond hands get rewarded</strong> — trust the process</li>
            </ul>
            
            <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">
              Remember: <em style="color: #ffcc00;">In Pump Town, your reputation is public. Winners gain status. Losers become lore.</em>
            </p>
            
            <div style="margin-top: 30px; padding: 20px; background: rgba(0,255,136,0.1); border: 1px solid #00ff88; border-radius: 8px;">
              <p style="color: #00ff88; margin: 0; font-size: 14px;">
                🚀 <strong>Pro tip:</strong> The AI Mayor is always watching. Vote wisely, ser.
              </p>
            </div>
            
            <p style="color: #888; font-size: 14px; margin-top: 30px;">
              WAGMI,<br/>
              <strong style="color: #00ff88;">The AI Mayor</strong> 🏛️
            </p>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;" />
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              pump-town.xyz — where degens govern
            </p>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('✅ Welcome email sent to:', email);
    } else {
      const error = await response.json();
      console.error('❌ Email API error:', error);
    }
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    // Don't throw - we don't want signup to fail if email fails
  }
}

// Signup with email/password
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('=== Signup Request ===');
  console.log('Email:', email);
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }
  
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }
  
  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }
    
    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES (LOWER($1), $2) RETURNING id, email',
      [email, passwordHash]
    );
    
    console.log('✅ User created:', result.rows[0].email);
    
    // Send welcome email (async, don't wait)
    sendWelcomeEmail(result.rows[0].email);
    
    res.json({
      success: true,
      message: 'Account created successfully!',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email
      }
    });
    
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create account'
    });
  }
});

// Login with email/password
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('=== Login Request ===');
  console.log('Email:', email);
  
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }
  
  try {
    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Account not found. Please sign up first.'
      });
    }
    
    const user = result.rows[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect password'
      });
    }
    
    console.log('✅ Login successful:', user.email);
    
    // Load character if exists
    const charResult = await pool.query(
      'SELECT * FROM characters WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    let character = null;
    if (charResult.rows.length > 0) {
      const c = charResult.rows[0];
      
      // Parse avatar from JSON string
      let parsedAvatar = null;
      if (c.avatar) {
        try {
          parsedAvatar = typeof c.avatar === 'string' ? JSON.parse(c.avatar) : c.avatar;
        } catch (e) {
          console.log('Avatar parse error, using default');
          parsedAvatar = { id: 'pepe', name: 'Pepe', image: 'pepe-pepe-logo.svg', color: '#3D8130' };
        }
      }
      
      character = {
        name: c.name,
        role: c.role,
        trait: c.trait,
        avatar: parsedAvatar,
        xp: c.xp,
        level: c.level,
        reputation: c.reputation,
        degenScore: c.degen_score,
        treasury: c.treasury,
        votesCount: c.votes_count,
        holdingDays: Math.floor((Date.now() - new Date(c.joined_date).getTime()) / (1000 * 60 * 60 * 24)),
        joinedDate: c.joined_date,
        badges: c.badges || []
      };
    }
    
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user.id,
        email: user.email
      },
      character
    });
    
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// ==================== PASSWORD RESET ====================

// Generate a random token
function generateResetToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Send password reset email
async function sendPasswordResetEmail(email, resetToken) {
  const resetUrl = `https://pump-town.xyz?reset=${resetToken}`;
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Mayor of Pump Town <mayor@pump-town.xyz>',
        to: email,
        subject: '🔐 Reset your Pump Town password',
        html: `
          <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0a1628 0%, #1a2f4a 100%); color: #00ff88; padding: 40px; border-radius: 12px; max-width: 600px;">
            <h1 style="color: #00ff88; font-size: 28px; margin-bottom: 10px;">Password Reset 🔐</h1>
            
            <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">
              gm ser, looks like you forgot your password. No worries, even the best degens have paper brain moments.
            </p>
            
            <p style="color: #ffffff; font-size: 16px; line-height: 1.6;">
              Click the button below to reset your password:
            </p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(90deg, #00ff88, #00cc6a); color: #000; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                🚀 Reset Password
              </a>
            </div>
            
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
              This link expires in <strong style="color: #ffcc00;">1 hour</strong>. If you didn't request this, just ignore it — someone might be trying to rug you.
            </p>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;" />
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              pump-town.xyz — where degens govern
            </p>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('✅ Password reset email sent to:', email);
      return true;
    } else {
      const error = await response.json();
      console.error('❌ Password reset email error:', error);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    return false;
  }
}

// Request password reset
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  console.log('=== Forgot Password Request ===');
  console.log('Email:', email);
  
  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }
  
  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    // Always return success to prevent email enumeration
    if (userResult.rows.length === 0) {
      console.log('User not found, but returning success for security');
      return res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a reset link.'
      });
    }
    
    // Generate reset token
    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // Invalidate any existing tokens for this email
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE LOWER(email) = LOWER($1) AND used = FALSE',
      [email]
    );
    
    // Store new token
    await pool.query(
      'INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (LOWER($1), $2, $3)',
      [email, resetToken, expiresAt]
    );
    
    // Send email
    await sendPasswordResetEmail(email, resetToken);
    
    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a reset link.'
    });
    
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process request'
    });
  }
});

// Reset password with token
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  console.log('=== Reset Password Request ===');
  
  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Token and new password are required'
    });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters'
    });
  }
  
  try {
    // Find valid token
    const tokenResult = await pool.query(
      'SELECT email FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset link. Please request a new one.'
      });
    }
    
    const email = tokenResult.rows[0].email;
    
    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE LOWER(email) = LOWER($2)',
      [passwordHash, email]
    );
    
    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
      [token]
    );
    
    console.log('✅ Password reset successful for:', email);
    
    res.json({
      success: true,
      message: 'Password reset successful! You can now login with your new password.'
    });
    
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

// ==================== WEEKLY DIGEST ====================

// Send weekly digest email
async function sendDigestEmail(userEmail, digestData) {
  const { 
    totalVotes, 
    topVoters, 
    recentPolicies, 
    statsChange,
    totalCitizens,
    newCitizens
  } = digestData;

  const topVotersHtml = topVoters.slice(0, 5).map((voter, i) => 
    `<tr style="border-bottom: 1px solid #333;">
      <td style="padding: 10px; color: ${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#fff'};">
        ${i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•'} ${voter.name}
      </td>
      <td style="padding: 10px; color: #00ff88; text-align: right;">${voter.votes_count || 0} votes</td>
    </tr>`
  ).join('');

  const policiesHtml = recentPolicies.slice(0, 3).map(policy => 
    `<div style="background: rgba(0,255,136,0.1); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
      <strong style="color: #00ff88;">${policy.title}</strong>
      <p style="color: #888; margin: 5px 0 0 0; font-size: 14px;">${policy.description || 'The citizens have spoken.'}</p>
    </div>`
  ).join('');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Mayor of Pump Town <mayor@pump-town.xyz>',
        to: userEmail,
        subject: '📊 Your Weekly Pump Town Digest',
        html: `
          <div style="font-family: 'Courier New', monospace; background: linear-gradient(135deg, #0a1628 0%, #1a2f4a 100%); color: #00ff88; padding: 40px; border-radius: 12px; max-width: 600px;">
            <h1 style="color: #00ff88; font-size: 28px; margin-bottom: 10px;">Weekly Digest 📊</h1>
            <p style="color: #888; font-size: 14px; margin-bottom: 30px;">gm ser, here's what went down in Pump Town this week.</p>
            
            <!-- Stats Overview -->
            <div style="display: flex; gap: 15px; margin-bottom: 30px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; color: #00ff88; font-weight: bold;">${totalCitizens}</div>
                <div style="color: #888; font-size: 12px;">Total Citizens</div>
              </div>
              <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; color: #00ff88; font-weight: bold;">+${newCitizens}</div>
                <div style="color: #888; font-size: 12px;">New This Week</div>
              </div>
              <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; text-align: center;">
                <div style="font-size: 24px; color: #00ff88; font-weight: bold;">${totalVotes}</div>
                <div style="color: #888; font-size: 12px;">Votes Cast</div>
              </div>
            </div>

            <!-- Top Voters -->
            <h3 style="color: #fff; margin-bottom: 15px;">🏆 Top Voters This Week</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
              ${topVotersHtml || '<tr><td style="color: #888; padding: 10px;">No votes yet this week!</td></tr>'}
            </table>

            <!-- Recent Policies -->
            <h3 style="color: #fff; margin-bottom: 15px;">📜 Recent Policies</h3>
            ${policiesHtml || '<p style="color: #888;">No policies passed this week.</p>'}

            <!-- CTA -->
            <div style="margin-top: 30px; text-align: center;">
              <a href="https://pump-town.xyz" style="display: inline-block; background: linear-gradient(90deg, #00ff88, #00cc6a); color: #000; padding: 15px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                🗳️ Cast Your Vote
              </a>
            </div>

            <p style="color: #888; font-size: 14px; margin-top: 30px; text-align: center;">
              Stay degen, fren. WAGMI. 🐸
            </p>
            
            <hr style="border: none; border-top: 1px solid #333; margin: 30px 0;" />
            
            <p style="color: #666; font-size: 12px; text-align: center;">
              <a href="https://pump-town-backend-production.up.railway.app/api/unsubscribe?email=${encodeURIComponent(userEmail)}&type=digest" style="color: #666;">Unsubscribe from digest</a>
              <br/><br/>
              pump-town.xyz — where degens govern
            </p>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('✅ Digest email sent to:', userEmail);
      return true;
    } else {
      const error = await response.json();
      console.error('❌ Digest email error:', error);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send digest email:', error);
    return false;
  }
}

// Endpoint to trigger weekly digest (call via cron service)
app.post('/api/send-weekly-digest', async (req, res) => {
  const { secret } = req.body;
  
  // Simple secret to prevent unauthorized triggers
  if (secret !== process.env.DIGEST_SECRET && secret !== 'pump-town-digest-2024') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  
  console.log('=== Sending Weekly Digest ===');
  
  try {
    // Get all users with digest enabled
    const usersResult = await pool.query(
      'SELECT email FROM users WHERE digest_enabled = TRUE'
    );
    
    if (usersResult.rows.length === 0) {
      return res.json({ success: true, message: 'No users subscribed to digest' });
    }
    
    // Get digest data
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Total votes this week
    const votesResult = await pool.query(
      'SELECT COUNT(*) as count FROM votes WHERE timestamp > $1',
      [oneWeekAgo]
    );
    const totalVotes = parseInt(votesResult.rows[0].count) || 0;
    
    // Top voters this week
    const topVotersResult = await pool.query(`
      SELECT c.name, c.votes_count, c.avatar
      FROM characters c
      ORDER BY c.votes_count DESC
      LIMIT 5
    `);
    const topVoters = topVotersResult.rows;
    
    // Total citizens
    const citizensResult = await pool.query('SELECT COUNT(*) as count FROM characters');
    const totalCitizens = parseInt(citizensResult.rows[0].count) || 0;
    
    // New citizens this week
    const newCitizensResult = await pool.query(
      'SELECT COUNT(*) as count FROM characters WHERE joined_date > $1',
      [oneWeekAgo]
    );
    const newCitizens = parseInt(newCitizensResult.rows[0].count) || 0;
    
    // Recent policies (from vote history - stored in memory for now)
    const recentPolicies = [
      { title: 'Community Decision', description: 'The citizens have shaped Pump Town\'s future.' }
    ];
    
    const digestData = {
      totalVotes,
      topVoters,
      recentPolicies,
      statsChange: {},
      totalCitizens,
      newCitizens
    };
    
    // Send to all subscribed users
    let sent = 0;
    let failed = 0;
    
    for (const user of usersResult.rows) {
      const success = await sendDigestEmail(user.email, digestData);
      if (success) sent++;
      else failed++;
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Weekly digest complete: ${sent} sent, ${failed} failed`);
    
    res.json({
      success: true,
      message: `Digest sent to ${sent} users`,
      sent,
      failed,
      totalUsers: usersResult.rows.length
    });
    
  } catch (err) {
    console.error('Weekly digest error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to send weekly digest'
    });
  }
});

// Update email preferences
app.post('/api/email-preferences', async (req, res) => {
  const { email, digestEnabled } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  
  try {
    await pool.query(
      'UPDATE users SET digest_enabled = $1 WHERE LOWER(email) = LOWER($2)',
      [digestEnabled, email]
    );
    
    console.log(`Email preferences updated for ${email}: digest=${digestEnabled}`);
    
    res.json({ success: true, message: 'Preferences updated' });
  } catch (err) {
    console.error('Email preferences error:', err);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// Unsubscribe from digest (via email link)
app.get('/api/unsubscribe', async (req, res) => {
  const { email, type } = req.query;
  
  if (!email || type !== 'digest') {
    return res.redirect('https://pump-town.xyz');
  }
  
  try {
    await pool.query(
      'UPDATE users SET digest_enabled = FALSE WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    console.log(`Unsubscribed from digest: ${email}`);
    
    // Redirect to site with message
    res.redirect('https://pump-town.xyz?unsubscribed=true');
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.redirect('https://pump-town.xyz');
  }
});

// ==================== CHARACTER ENDPOINTS ====================

// Save character
app.post('/api/save-character', async (req, res) => {
  const { email, walletAddress, character } = req.body;
  const userEmail = email || walletAddress; // Support both
  
  console.log('=== Save Character ===');
  console.log('Email:', userEmail);
  console.log('Character:', character?.name);
  console.log('Avatar:', JSON.stringify(character?.avatar));
  
  if (!userEmail || !character) {
    return res.status(400).json({
      success: false,
      error: 'Missing email or character data'
    });
  }
  
  try {
    // Check if character exists
    const existing = await pool.query(
      'SELECT id FROM characters WHERE LOWER(email) = LOWER($1)',
      [userEmail]
    );
    
    // Serialize avatar object to JSON string for database storage
    const avatarJson = typeof character.avatar === 'object' 
      ? JSON.stringify(character.avatar) 
      : character.avatar;

    if (existing.rows.length > 0) {
      // Update existing character
      await pool.query(`
        UPDATE characters SET
          name = $1,
          role = $2,
          trait = $3,
          avatar = $4,
          xp = $5,
          level = $6,
          reputation = $7,
          degen_score = $8,
          treasury = $9,
          votes_count = $10,
          badges = $11,
          updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(email) = LOWER($12)
      `, [
        character.name,
        character.role,
        character.trait,
        avatarJson,
        character.xp || 0,
        character.level || 1,
        character.reputation || 50,
        character.degenScore || 0,
        character.treasury || 1000,
        character.votesCount || 0,
        JSON.stringify(character.badges || []),
        userEmail
      ]);
      console.log('✅ Character updated');
    } else {
      // Create new character
      await pool.query(`
        INSERT INTO characters (email, name, role, trait, avatar, xp, level, reputation, degen_score, treasury, votes_count, badges)
        VALUES (LOWER($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        userEmail,
        character.name,
        character.role,
        character.trait,
        avatarJson,
        character.xp || 0,
        character.level || 1,
        character.reputation || 50,
        character.degenScore || 0,
        character.treasury || 1000,
        character.votesCount || 0,
        JSON.stringify(character.badges || [])
      ]);
      console.log('✅ Character created');
    }
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('Save character error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to save character'
    });
  }
});

// Load character
app.post('/api/load-character', async (req, res) => {
  const { email, walletAddress } = req.body;
  const userEmail = email || walletAddress;
  
  if (!userEmail) {
    return res.json({ success: false, character: null });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM characters WHERE LOWER(email) = LOWER($1)',
      [userEmail]
    );
    
    if (result.rows.length > 0) {
      const c = result.rows[0];
      
      // Parse avatar from JSON string
      let parsedAvatar = null;
      if (c.avatar) {
        try {
          parsedAvatar = typeof c.avatar === 'string' ? JSON.parse(c.avatar) : c.avatar;
        } catch (e) {
          console.log('Avatar parse error, using default');
          parsedAvatar = { id: 'pepe', name: 'Pepe', image: 'pepe-pepe-logo.svg', color: '#3D8130' };
        }
      }
      
      const character = {
        name: c.name,
        role: c.role,
        trait: c.trait,
        avatar: parsedAvatar,
        xp: c.xp,
        level: c.level,
        reputation: c.reputation,
        degenScore: c.degen_score,
        treasury: c.treasury,
        votesCount: c.votes_count,
        holdingDays: Math.floor((Date.now() - new Date(c.joined_date).getTime()) / (1000 * 60 * 60 * 24)),
        joinedDate: c.joined_date,
        badges: c.badges || []
      };
      
      console.log('✅ Character loaded:', character.name);
      res.json({ success: true, character });
    } else {
      res.json({ success: false, character: null });
    }
    
  } catch (err) {
    console.error('Load character error:', err);
    res.json({ success: false, character: null });
  }
});

// ==================== VOTING ENDPOINTS ====================

// Cast vote
app.post('/api/cast-vote', async (req, res) => {
  const { email, walletAddress, optionId, voteId, optionTitle } = req.body;
  const userEmail = email || walletAddress;
  
  console.log('=== Vote Cast ===');
  console.log('Email:', userEmail);
  console.log('Option:', optionId, optionTitle);
  
  if (!userEmail || !optionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    });
  }
  
  const currentVoteId = getCurrentVoteId();
  
  try {
    // Check if already voted
    const existing = await pool.query(
      'SELECT id FROM votes WHERE LOWER(email) = LOWER($1) AND vote_id = $2',
      [userEmail, currentVoteId]
    );
    
    if (existing.rows.length > 0) {
      return res.json({
        success: false,
        error: 'You have already voted in this round. Wait for the next 6-hour cycle!'
      });
    }
    
    // Record vote
    await pool.query(
      'INSERT INTO votes (email, vote_id, option_id, option_title) VALUES (LOWER($1), $2, $3, $4)',
      [userEmail, currentVoteId, optionId, optionTitle]
    );
    
    // Update character vote count
    await pool.query(
      'UPDATE characters SET votes_count = votes_count + 1 WHERE LOWER(email) = LOWER($1)',
      [userEmail]
    );
    
    console.log('✅ Vote recorded');
    
    res.json({
      success: true,
      message: 'Vote recorded!',
      nextVoteAvailable: getCurrentCycleStart() + VOTE_CYCLE_MS
    });
    
  } catch (err) {
    console.error('Cast vote error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to record vote'
    });
  }
});

// Check if user voted
app.post('/api/check-vote', async (req, res) => {
  const { email, walletAddress } = req.body;
  const userEmail = email || walletAddress;
  
  if (!userEmail) {
    return res.json({ hasVoted: false });
  }
  
  const currentVoteId = getCurrentVoteId();
  
  try {
    const result = await pool.query(
      'SELECT option_id FROM votes WHERE LOWER(email) = LOWER($1) AND vote_id = $2',
      [userEmail, currentVoteId]
    );
    
    const hasVoted = result.rows.length > 0;
    
    res.json({
      hasVoted,
      currentVoteId,
      votedOption: hasVoted ? result.rows[0].option_id : null,
      timeRemaining: getTimeRemaining()
    });
    
  } catch (err) {
    console.error('Check vote error:', err);
    res.json({ hasVoted: false });
  }
});

// ==================== GAME STATE ENDPOINTS ====================

app.get('/api/game-state', (req, res) => {
  const { day, round, roundDisplay } = getDayAndRound();
  const timeRemaining = getTimeRemaining();
  const currentVoteId = getCurrentVoteId();
  
  res.json({
    success: true,
    day,
    round,
    roundDisplay,
    stats: gameState.stats,
    voteHistory: getUpdatedVoteHistory(),
    currentVote: {
      ...gameState.currentVote,
      id: currentVoteId,
      timeRemaining,
      endsAt: getCurrentCycleStart() + VOTE_CYCLE_MS
    },
    serverTime: Date.now()
  });
});

app.get('/api/gamestate', (req, res) => {
  const { day, round } = getDayAndRound();
  res.json({
    ...gameState,
    day,
    round,
    currentVote: {
      ...gameState.currentVote,
      id: getCurrentVoteId()
    }
  });
});

// ==================== LEADERBOARD ====================

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, role, xp, level, degen_score, avatar, updated_at
      FROM player_stats
      ORDER BY xp DESC
      LIMIT 100
    `);
    
    const leaderboard = result.rows.map(p => ({
      name: p.name,
      role: p.role || 'Citizen',
      xp: p.xp || 0,
      level: p.level || 1,
      degenScore: p.degen_score || 0,
      avatar: p.avatar,
      lastUpdated: p.updated_at
    }));
    
    console.log(`Leaderboard: ${leaderboard.length} players`);
    
    res.json({
      success: true,
      leaderboard,
      totalPlayers: leaderboard.length
    });
    
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.json({ success: true, leaderboard: [], totalPlayers: 0 });
  }
});

app.post('/api/update-stats', async (req, res) => {
  const { name, role, xp, level, degenScore, avatar } = req.body;
  
  if (!name) {
    return res.status(400).json({ success: false, error: 'Name required' });
  }
  
  try {
    // Upsert player stats
    await pool.query(`
      INSERT INTO player_stats (name, role, xp, level, degen_score, avatar, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (name) DO UPDATE SET
        role = COALESCE($2, player_stats.role),
        xp = COALESCE($3, player_stats.xp),
        level = COALESCE($4, player_stats.level),
        degen_score = COALESCE($5, player_stats.degen_score),
        avatar = COALESCE($6, player_stats.avatar),
        updated_at = CURRENT_TIMESTAMP
    `, [name, role, xp, level, degenScore, avatar]);
    
    console.log(`Stats updated: ${name}`);
    res.json({ success: true });
    
  } catch (err) {
    console.error('Update stats error:', err);
    res.status(500).json({ success: false, error: 'Failed to update stats' });
  }
});

app.get('/api/player-stats/:name', async (req, res) => {
  const { name } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM player_stats WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    
    if (result.rows.length > 0) {
      res.json({ success: true, stats: result.rows[0] });
    } else {
      res.json({ success: false, stats: null });
    }
    
  } catch (err) {
    console.error('Player stats error:', err);
    res.json({ success: false, stats: null });
  }
});

// ==================== FEAR & GREED INDEX ====================

let fearGreedCache = {
  value: 50,
  classification: 'Neutral',
  lastFetch: 0
};

app.get('/api/fear-greed', async (req, res) => {
  const now = Date.now();
  const cacheAge = now - fearGreedCache.lastFetch;
  
  if (cacheAge < 5 * 60 * 1000 && fearGreedCache.lastFetch > 0) {
    return res.json({
      success: true,
      value: fearGreedCache.value,
      classification: fearGreedCache.classification,
      cached: true
    });
  }
  
  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1');
    const data = await response.json();
    
    if (data.data && data.data[0]) {
      fearGreedCache = {
        value: parseInt(data.data[0].value),
        classification: data.data[0].value_classification,
        lastFetch: now
      };
      
      res.json({
        success: true,
        value: fearGreedCache.value,
        classification: fearGreedCache.classification,
        cached: false
      });
    } else {
      throw new Error('Invalid API response');
    }
  } catch (err) {
    console.error('Fear & Greed error:', err.message);
    res.json({
      success: fearGreedCache.lastFetch > 0,
      value: fearGreedCache.value,
      classification: fearGreedCache.classification,
      cached: true,
      error: err.message
    });
  }
});

// ==================== WALLET VERIFICATION ====================

app.post('/api/verify-wallet', async (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({ success: false, error: 'Wallet address required', balance: 0 });
  }
  
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const tokenMint = process.env.TOWN_TOKEN_MINT || 'ApEFtr2eba6sWFk3gF6GgX4i2uT4B5k2HZT75ZDapump';
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: tokenMint },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    const data = await response.json();
    
    let balance = 0;
    if (data.result?.value?.length > 0) {
      balance = data.result.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    
    res.json({
      success: balance >= 100000,
      balance,
      required: 100000,
      walletAddress
    });
    
  } catch (err) {
    console.error('Wallet verification error:', err);
    res.status(500).json({ success: false, error: 'Failed to verify wallet', balance: 0 });
  }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'disconnected';
  }
  
  res.json({
    status: 'ok',
    database: dbStatus,
    serverTime: Date.now(),
    currentVoteId: getCurrentVoteId(),
    timeRemaining: getTimeRemaining()
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`🏛️ Pump Town Backend running on port ${PORT}`);
  console.log(`📊 Current Vote ID: ${getCurrentVoteId()}`);
  console.log(`⏰ Time remaining: ${Math.floor(getTimeRemaining() / 60000)} minutes`);
  console.log(`📅 Day ${getDayAndRound().day}, Round ${getDayAndRound().round}`);
  console.log(`🗄️ Database: PostgreSQL`);
  console.log(`🏆 Leaderboard: Ready`);
});
