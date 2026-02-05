// ==================== DEGENS CITY - DEEP REPUTATION SYSTEM ====================
//
// Every NPC remembers every player. Actions have consequences.
// NPCs change behavior based on how they feel about you.
//
// Score range: -100 (mortal enemy) to +100 (ride or die)
// Relationship tiers:
//   -100 to -60: enemy      — actively hostile, will sue/accuse you
//   -59  to -30: hostile    — rude, won't help, may sabotage
//   -29  to -10: dislike    — cold, dismissive, sarcastic
//   -9   to  9:  neutral    — default, no strong feelings
//   10   to  29: friendly   — warm, helpful, shares info
//   30   to  59: ally       — loyal, defends you, gives advantages
//   60   to 100: devoted    — ride or die, will lie/cheat/fight for you
//
// Usage:
//   const reputation = require('./reputation-system.js');
//   reputation.init(pool);
//   reputation.registerRoutes(app);
//
//   // Track an event:
//   await reputation.trackEvent('player123', 'alpha_hunter', 'helped_in_explore', 8, 'Helped me escape the Dark Alley thugs');
//
//   // Get how an NPC feels about a player:
//   const rep = await reputation.getReputation('player123', 'alpha_hunter');
//   // → { score: 23, relationship: 'friendly', memories: [...] }
//
//   // Get prompt context for agent-brain:
//   const context = await reputation.getNpcMemoryContext('alpha_hunter', 'player123');
//   // → "You LIKE player123 (friendly, score 23). Memories: helped you escape Dark Alley, voted for your law proposal..."

// ==================== CONFIG ====================

const REP_CONFIG = {
  maxScore: 100,
  minScore: -100,
  maxMemories: 20,         // Max memories per NPC-player pair (oldest get pruned)
  rippleDecay: 0.4,        // Allies/rivals get 40% of the reputation change
  gossipChance: 0.25,      // 25% chance an NPC gossips about a reputation event
  gossipDecay: 0.3,        // Gossip spreads at 30% of original value

  // Relationship tier thresholds
  tiers: [
    { min: -100, max: -60, label: 'enemy',    emoji: '💀', tone: 'hostile and aggressive' },
    { min: -59,  max: -30, label: 'hostile',   emoji: '😡', tone: 'rude and dismissive' },
    { min: -29,  max: -10, label: 'dislike',   emoji: '😒', tone: 'cold and sarcastic' },
    { min: -9,   max: 9,   label: 'neutral',   emoji: '😐', tone: 'neutral and indifferent' },
    { min: 10,   max: 29,  label: 'friendly',  emoji: '😊', tone: 'warm and helpful' },
    { min: 30,   max: 59,  label: 'ally',      emoji: '🤝', tone: 'loyal and supportive' },
    { min: 60,   max: 100, label: 'devoted',   emoji: '💎', tone: 'ride-or-die loyal, would do anything for them' },
  ],
};

// ==================== REPUTATION EVENT CATALOG ====================
// Pre-defined events with default score changes
// These can be called by name from anywhere in the codebase

const REP_EVENTS = {
  // ---- Voting ----
  voted_same: { delta: 4, description: 'Voted the same way as {npc}' },
  voted_against: { delta: -3, description: 'Voted against {npc}\'s preference' },
  voted_for_npc_law: { delta: 8, description: 'Voted YES on {npc}\'s proposed law' },
  voted_against_npc_law: { delta: -6, description: 'Voted NO on {npc}\'s proposed law' },

  // ---- Explore / City Situations ----
  helped_npc: { delta: 12, description: 'Helped {npc} during a city situation' },
  betrayed_npc: { delta: -15, description: 'Betrayed {npc} during a city situation' },
  sided_with_npc: { delta: 8, description: 'Sided with {npc} in a conflict' },
  sided_against_npc: { delta: -8, description: 'Sided against {npc} in a conflict' },
  explored_npc_territory: { delta: 2, description: 'Visited {npc}\'s favorite hangout' },

  // ---- Justice System ----
  snitched_on_npc: { delta: -20, description: 'Snitched on {npc} to the police' },
  defended_npc_in_court: { delta: 15, description: 'Spoke in {npc}\'s defense at trial' },
  testified_against_npc: { delta: -18, description: 'Testified against {npc} in court' },
  sued_npc: { delta: -12, description: 'Filed a lawsuit against {npc}' },
  sued_by_npc_won: { delta: -8, description: 'Won a lawsuit filed by {npc}' },
  sued_by_npc_lost: { delta: 5, description: '{npc} won their lawsuit — they feel vindicated' },
  bailed_out_npc: { delta: 18, description: 'Bailed {npc} out of jail' },

  // ---- Social / Chat ----
  complimented_npc: { delta: 5, description: 'Said something nice about {npc}' },
  insulted_npc: { delta: -7, description: 'Insulted {npc} in chat' },
  mentioned_npc_positively: { delta: 3, description: 'Mentioned {npc} positively' },
  mentioned_npc_negatively: { delta: -4, description: 'Talked trash about {npc}' },
  shared_alpha_with_npc: { delta: 6, description: 'Shared trading alpha with {npc}' },

  // ---- Trading / Economy ----
  traded_npc_favtoken: { delta: 3, description: 'Bought {npc}\'s favorite token' },
  dumped_npc_favtoken: { delta: -5, description: 'Dumped {npc}\'s favorite token' },
  made_npc_money: { delta: 10, description: 'Made {npc} money through a trade tip' },
  lost_npc_money: { delta: -10, description: 'Lost {npc} money with bad advice' },

  // ---- Agent Brain Actions ----
  npc_party_attended: { delta: 6, description: 'Attended {npc}\'s party' },
  npc_party_skipped: { delta: -2, description: 'Skipped {npc}\'s party' },
  formed_alliance: { delta: 20, description: 'Formed an alliance with {npc}' },
  broke_alliance: { delta: -25, description: 'Broke an alliance with {npc}' },
  supported_npc_mayoral_run: { delta: 12, description: 'Supported {npc}\'s run for mayor' },
  opposed_npc_mayoral_run: { delta: -10, description: 'Opposed {npc}\'s run for mayor' },

  // ---- Passive / Indirect ----
  npc_heard_good_gossip: { delta: 3, description: '{npc} heard good things about player' },
  npc_heard_bad_gossip: { delta: -3, description: '{npc} heard bad things about player' },

  // ---- Special ----
  first_interaction: { delta: 2, description: 'First time interacting with {npc}' },
  daily_visit: { delta: 1, description: 'Regular visitor — {npc} recognizes player' },
  gift_to_npc: { delta: 8, description: 'Gave a gift to {npc}' },
};

// ==================== MODULE STATE ====================

let _pool = null;
let _NPC_PROFILES = null;
let _NPC_CITIZENS = null;

// In-memory cache for hot reputation data (refreshed from DB periodically)
let repCache = {};  // key: `${playerName}::${npcName}` → { score, relationship, lastUpdate }
const CACHE_TTL = 60000; // 1 minute cache

// ==================== INITIALIZATION ====================

function init(pool, NPC_PROFILES, NPC_CITIZENS) {
  _pool = pool;
  _NPC_PROFILES = NPC_PROFILES || {};
  _NPC_CITIZENS = NPC_CITIZENS || [];
  console.log('🎭 Reputation System initialized');
}

// ==================== DATABASE SETUP ====================

async function initReputationTables(pool) {
  const p = pool || _pool;
  if (!p) return;

  try {
    // Main reputation table — one row per NPC-player pair
    await p.query(`
      CREATE TABLE IF NOT EXISTS npc_reputation (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL,
        npc_name VARCHAR(100) NOT NULL,
        score INTEGER DEFAULT 0 CHECK (score >= -100 AND score <= 100),
        relationship VARCHAR(20) DEFAULT 'neutral',
        memories JSONB DEFAULT '[]',
        total_interactions INTEGER DEFAULT 0,
        first_interaction_at TIMESTAMP,
        last_interaction_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_name, npc_name)
      )
    `);

    // Indexes for fast lookups
    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_player ON npc_reputation(player_name)
    `).catch(() => {});

    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_npc ON npc_reputation(npc_name)
    `).catch(() => {});

    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_score ON npc_reputation(npc_name, score DESC)
    `).catch(() => {});

    // Reputation event log — full history of what happened
    await p.query(`
      CREATE TABLE IF NOT EXISTS reputation_events (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL,
        npc_name VARCHAR(100) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        delta INTEGER NOT NULL,
        description TEXT,
        source VARCHAR(50),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_events_player ON reputation_events(player_name, created_at DESC)
    `).catch(() => {});

    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_rep_events_npc ON reputation_events(npc_name, created_at DESC)
    `).catch(() => {});

    console.log('✅ Reputation System tables initialized');
  } catch (err) {
    console.error('Reputation table init error:', err.message);
  }
}

// ==================== CORE FUNCTIONS ====================

function getRelationshipTier(score) {
  for (const tier of REP_CONFIG.tiers) {
    if (score >= tier.min && score <= tier.max) return tier;
  }
  return REP_CONFIG.tiers[3]; // neutral fallback
}

function clampScore(score) {
  return Math.max(REP_CONFIG.minScore, Math.min(REP_CONFIG.maxScore, score));
}

// Get reputation for a specific NPC-player pair
async function getReputation(playerName, npcName) {
  if (!_pool) return { score: 0, relationship: 'neutral', memories: [], tier: REP_CONFIG.tiers[3] };

  // Check cache first
  const cacheKey = `${playerName}::${npcName}`;
  const cached = repCache[cacheKey];
  if (cached && (Date.now() - cached.lastUpdate) < CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await _pool.query(
      `SELECT * FROM npc_reputation WHERE player_name = $1 AND npc_name = $2`,
      [playerName, npcName]
    );

    if (result.rows.length === 0) {
      const defaultRep = {
        score: 0,
        relationship: 'neutral',
        memories: [],
        total_interactions: 0,
        tier: REP_CONFIG.tiers[3]
      };
      repCache[cacheKey] = { data: defaultRep, lastUpdate: Date.now() };
      return defaultRep;
    }

    const row = result.rows[0];
    const memories = typeof row.memories === 'string' ? JSON.parse(row.memories) : (row.memories || []);
    const rep = {
      score: row.score,
      relationship: row.relationship,
      memories,
      total_interactions: row.total_interactions,
      first_interaction_at: row.first_interaction_at,
      last_interaction_at: row.last_interaction_at,
      tier: getRelationshipTier(row.score)
    };

    repCache[cacheKey] = { data: rep, lastUpdate: Date.now() };
    return rep;
  } catch (err) {
    console.error('getReputation error:', err.message);
    return { score: 0, relationship: 'neutral', memories: [], tier: REP_CONFIG.tiers[3] };
  }
}

// Get ALL NPC reputations for a player (for profile page)
async function getPlayerReputation(playerName) {
  if (!_pool) return [];

  try {
    const result = await _pool.query(
      `SELECT npc_name, score, relationship, memories, total_interactions, last_interaction_at 
       FROM npc_reputation WHERE player_name = $1 ORDER BY ABS(score) DESC`,
      [playerName]
    );

    return result.rows.map(row => ({
      npc: row.npc_name,
      score: row.score,
      relationship: row.relationship,
      memories: typeof row.memories === 'string' ? JSON.parse(row.memories) : (row.memories || []),
      total_interactions: row.total_interactions,
      last_interaction_at: row.last_interaction_at,
      tier: getRelationshipTier(row.score)
    }));
  } catch (err) {
    console.error('getPlayerReputation error:', err.message);
    return [];
  }
}

// Get how an NPC feels about ALL players (for NPC decision-making)
async function getNpcRelationships(npcName) {
  if (!_pool) return [];

  try {
    const result = await _pool.query(
      `SELECT player_name, score, relationship, memories, total_interactions 
       FROM npc_reputation WHERE npc_name = $1 ORDER BY score DESC`,
      [npcName]
    );

    return result.rows.map(row => ({
      player: row.player_name,
      score: row.score,
      relationship: row.relationship,
      memories: typeof row.memories === 'string' ? JSON.parse(row.memories) : (row.memories || []),
      total_interactions: row.total_interactions,
      tier: getRelationshipTier(row.score)
    }));
  } catch (err) {
    console.error('getNpcRelationships error:', err.message);
    return [];
  }
}

// ==================== TRACK REPUTATION EVENTS ====================

// Main function: track an event between a player and NPC
// eventType can be a key from REP_EVENTS or a custom string
// delta: score change (positive = good, negative = bad). If using REP_EVENTS key, delta is optional.
// description: human-readable memory string
// source: where this came from ('explore', 'chat', 'vote', 'justice', 'brain', etc.)
async function trackEvent(playerName, npcName, eventType, delta, description, source, metadata) {
  if (!_pool || !playerName || !npcName) return null;

  // Look up predefined event if exists
  const predefined = REP_EVENTS[eventType];
  if (predefined && delta === undefined) {
    delta = predefined.delta;
  }
  if (predefined && !description) {
    description = predefined.description.replace('{npc}', npcName);
  }
  if (!delta) delta = 0;
  if (!description) description = eventType;

  try {
    // Upsert the reputation row
    const result = await _pool.query(`
      INSERT INTO npc_reputation (player_name, npc_name, score, relationship, memories, total_interactions, first_interaction_at, last_interaction_at)
      VALUES ($1, $2, $3, 'neutral', $4, 1, NOW(), NOW())
      ON CONFLICT (player_name, npc_name) DO UPDATE SET
        score = GREATEST(-100, LEAST(100, npc_reputation.score + $3)),
        total_interactions = npc_reputation.total_interactions + 1,
        last_interaction_at = NOW(),
        updated_at = NOW(),
        memories = (
          CASE 
            WHEN jsonb_array_length(npc_reputation.memories) >= ${REP_CONFIG.maxMemories}
            THEN (npc_reputation.memories - 0) || $4
            ELSE npc_reputation.memories || $4
          END
        )
      RETURNING score, relationship, memories
    `, [
      playerName,
      npcName,
      delta,
      JSON.stringify([{
        event: eventType,
        description: description,
        delta: delta,
        timestamp: new Date().toISOString(),
        source: source || 'system'
      }])
    ]);

    if (result.rows.length > 0) {
      const newScore = result.rows[0].score;
      const newTier = getRelationshipTier(newScore);

      // Update relationship label
      await _pool.query(
        `UPDATE npc_reputation SET relationship = $1 WHERE player_name = $2 AND npc_name = $3`,
        [newTier.label, playerName, npcName]
      );

      // Invalidate cache
      delete repCache[`${playerName}::${npcName}`];

      // Log the event
      await _pool.query(`
        INSERT INTO reputation_events (player_name, npc_name, event_type, delta, description, source, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [playerName, npcName, eventType, delta, description, source || 'system', JSON.stringify(metadata || {})]);

      // Ripple to allies and rivals
      await rippleReputation(playerName, npcName, delta, eventType, description, source);

      // Maybe gossip
      await maybeGossip(playerName, npcName, delta, description);

      console.log(`🎭 [REP] ${npcName} ${delta > 0 ? '💚' : '💔'} ${playerName}: ${delta > 0 ? '+' : ''}${delta} (now ${newScore}, ${newTier.label})`);

      return { score: newScore, relationship: newTier.label, tier: newTier };
    }
  } catch (err) {
    console.error('trackEvent error:', err.message);
  }
  return null;
}

// Ripple reputation to allies and rivals of the NPC
async function rippleReputation(playerName, npcName, delta, eventType, description, source) {
  if (!_NPC_PROFILES || !_NPC_PROFILES[npcName]) return;

  const npc = _NPC_PROFILES[npcName];
  const rippleDelta = Math.round(delta * REP_CONFIG.rippleDecay);
  if (rippleDelta === 0) return;

  // Allies feel the same way (smaller magnitude)
  if (npc.allies && npc.allies.length > 0) {
    for (const ally of npc.allies) {
      if (!_NPC_CITIZENS.includes(ally)) continue;
      try {
        await _pool.query(`
          INSERT INTO npc_reputation (player_name, npc_name, score, relationship, memories, total_interactions, first_interaction_at, last_interaction_at)
          VALUES ($1, $2, $3, 'neutral', '[]', 0, NOW(), NOW())
          ON CONFLICT (player_name, npc_name) DO UPDATE SET
            score = GREATEST(-100, LEAST(100, npc_reputation.score + $3)),
            updated_at = NOW()
        `, [playerName, ally, rippleDelta]);

        // Update relationship tier
        const allyRep = await _pool.query(
          `SELECT score FROM npc_reputation WHERE player_name = $1 AND npc_name = $2`,
          [playerName, ally]
        );
        if (allyRep.rows.length > 0) {
          const tier = getRelationshipTier(allyRep.rows[0].score);
          await _pool.query(
            `UPDATE npc_reputation SET relationship = $1 WHERE player_name = $2 AND npc_name = $3`,
            [tier.label, playerName, ally]
          );
        }

        delete repCache[`${playerName}::${ally}`];
      } catch (e) { /* ignore ripple errors */ }
    }
  }

  // Rivals feel the OPPOSITE way
  if (npc.rivals && npc.rivals.length > 0) {
    const rivalDelta = -rippleDelta;
    for (const rival of npc.rivals) {
      if (!_NPC_CITIZENS.includes(rival)) continue;
      try {
        await _pool.query(`
          INSERT INTO npc_reputation (player_name, npc_name, score, relationship, memories, total_interactions, first_interaction_at, last_interaction_at)
          VALUES ($1, $2, $3, 'neutral', '[]', 0, NOW(), NOW())
          ON CONFLICT (player_name, npc_name) DO UPDATE SET
            score = GREATEST(-100, LEAST(100, npc_reputation.score + $3)),
            updated_at = NOW()
        `, [playerName, rival, rivalDelta]);

        const rivalRep = await _pool.query(
          `SELECT score FROM npc_reputation WHERE player_name = $1 AND npc_name = $2`,
          [playerName, rival]
        );
        if (rivalRep.rows.length > 0) {
          const tier = getRelationshipTier(rivalRep.rows[0].score);
          await _pool.query(
            `UPDATE npc_reputation SET relationship = $1 WHERE player_name = $2 AND npc_name = $3`,
            [tier.label, playerName, rival]
          );
        }

        delete repCache[`${playerName}::${rival}`];
      } catch (e) { /* ignore ripple errors */ }
    }
  }
}

// Random chance that other NPCs hear about this event
async function maybeGossip(playerName, npcName, delta, description) {
  if (Math.random() > REP_CONFIG.gossipChance) return;
  if (!_NPC_CITIZENS || _NPC_CITIZENS.length === 0) return;

  // Pick 1-3 random NPCs to gossip to
  const gossipCount = Math.floor(Math.random() * 3) + 1;
  const candidates = _NPC_CITIZENS.filter(n => n !== npcName);

  for (let i = 0; i < gossipCount && candidates.length > 0; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    const gossipTarget = candidates.splice(idx, 1)[0];
    const gossipDelta = Math.round(delta * REP_CONFIG.gossipDecay);
    if (gossipDelta === 0) continue;

    const gossipType = gossipDelta > 0 ? 'npc_heard_good_gossip' : 'npc_heard_bad_gossip';

    try {
      await _pool.query(`
        INSERT INTO npc_reputation (player_name, npc_name, score, relationship, memories, total_interactions, first_interaction_at, last_interaction_at)
        VALUES ($1, $2, $3, 'neutral', $4, 0, NOW(), NOW())
        ON CONFLICT (player_name, npc_name) DO UPDATE SET
          score = GREATEST(-100, LEAST(100, npc_reputation.score + $3)),
          memories = (
            CASE 
              WHEN jsonb_array_length(npc_reputation.memories) >= ${REP_CONFIG.maxMemories}
              THEN (npc_reputation.memories - 0) || $4
              ELSE npc_reputation.memories || $4
            END
          ),
          updated_at = NOW()
      `, [
        playerName,
        gossipTarget,
        gossipDelta,
        JSON.stringify([{
          event: gossipType,
          description: `Heard from ${npcName}: "${description}"`,
          delta: gossipDelta,
          timestamp: new Date().toISOString(),
          source: 'gossip'
        }])
      ]);

      // Update tier
      const gRep = await _pool.query(
        `SELECT score FROM npc_reputation WHERE player_name = $1 AND npc_name = $2`,
        [playerName, gossipTarget]
      );
      if (gRep.rows.length > 0) {
        const tier = getRelationshipTier(gRep.rows[0].score);
        await _pool.query(
          `UPDATE npc_reputation SET relationship = $1 WHERE player_name = $2 AND npc_name = $3`,
          [tier.label, playerName, gossipTarget]
        );
      }

      delete repCache[`${playerName}::${gossipTarget}`];
    } catch (e) { /* ignore gossip errors */ }
  }
}

// ==================== AGENT BRAIN INTEGRATION ====================
// Generate prompt context for when an NPC is "thinking" about a player

async function getNpcMemoryContext(npcName, playerName) {
  const rep = await getReputation(playerName, npcName);
  if (rep.total_interactions === 0) {
    return `You have never interacted with ${playerName}. They are a stranger to you.`;
  }

  const tier = rep.tier;
  const recentMemories = rep.memories.slice(-5).map(m => m.description).join('; ');

  return `Your relationship with ${playerName}: ${tier.emoji} ${tier.label.toUpperCase()} (score: ${rep.score}/100). ` +
    `You should be ${tier.tone} toward them. ` +
    `Recent memories: ${recentMemories || 'nothing notable'}. ` +
    `Total interactions: ${rep.total_interactions}.`;
}

// Get full NPC context for all known players (for brain decisions)
async function getNpcFullContext(npcName) {
  const relationships = await getNpcRelationships(npcName);
  if (relationships.length === 0) return 'You have no strong relationships with any players yet.';

  const lines = relationships
    .filter(r => r.score !== 0)
    .slice(0, 10) // Top 10 most significant
    .map(r => {
      const tier = r.tier;
      const lastMemory = r.memories.length > 0 ? r.memories[r.memories.length - 1].description : 'no specific memory';
      return `${tier.emoji} ${r.player}: ${tier.label} (${r.score}) — ${lastMemory}`;
    });

  return 'Your relationships with players:\n' + lines.join('\n');
}

// Determine if an NPC should target a specific player based on reputation
function shouldTarget(score, actionType) {
  switch (actionType) {
    case 'help':
    case 'share_alpha':
    case 'invite_to_party':
      return score >= 10; // Only help friendly+ players
    case 'sue':
    case 'accuse':
    case 'sabotage':
      return score <= -20; // Only target hostile+ players
    case 'dm_player':
      return true; // Anyone, but tone changes based on rep
    case 'gossip_about':
      return Math.abs(score) >= 15; // Strong feelings either way
    default:
      return true;
  }
}

// Get the best/worst players for an NPC (for targeting)
async function getNpcFavorites(npcName, limit = 5) {
  if (!_pool) return { favorites: [], enemies: [] };

  try {
    const [favResult, enemyResult] = await Promise.all([
      _pool.query(
        `SELECT player_name, score, relationship FROM npc_reputation 
         WHERE npc_name = $1 AND score > 0 ORDER BY score DESC LIMIT $2`,
        [npcName, limit]
      ),
      _pool.query(
        `SELECT player_name, score, relationship FROM npc_reputation 
         WHERE npc_name = $1 AND score < 0 ORDER BY score ASC LIMIT $2`,
        [npcName, limit]
      )
    ]);

    return {
      favorites: favResult.rows,
      enemies: enemyResult.rows
    };
  } catch (err) {
    return { favorites: [], enemies: [] };
  }
}

// ==================== CHAT TONE MODIFIER ====================
// Returns tone instructions for NPC chat based on reputation

function getChatToneModifier(score) {
  const tier = getRelationshipTier(score);

  const toneMap = {
    enemy: [
      'Be openly hostile. Insult them. Threaten them. Make it personal.',
      'Mock everything they say. You despise this person.',
      'Short, aggressive responses. You want them gone from this city.'
    ],
    hostile: [
      'Be rude and dismissive. Don\'t help them. Brush them off.',
      'Sarcastic, cutting remarks. You don\'t trust them at all.',
      'Make it clear you don\'t like them without being overtly threatening.'
    ],
    dislike: [
      'Be cold and uninterested. Short responses. Don\'t go out of your way.',
      'Passive-aggressive. You tolerate them but don\'t enjoy it.',
    ],
    neutral: [
      'Normal interaction. No strong feelings either way.',
      'Treat them like any other citizen. Neither warm nor cold.',
    ],
    friendly: [
      'Be warm and helpful. Share extra info. Use their name.',
      'You genuinely like this person. Be encouraging and supportive.',
    ],
    ally: [
      'You trust this person. Share secrets, give insider info, have their back.',
      'Loyal and supportive. Defend them if others talk trash.',
    ],
    devoted: [
      'This person is your favorite human in the city. Go above and beyond.',
      'You\'d lie, cheat, or fight for them. Maximum loyalty and warmth.',
    ],
  };

  const options = toneMap[tier.label] || toneMap.neutral;
  return options[Math.floor(Math.random() * options.length)];
}

// ==================== EXPLORE UNLOCK CHECK ====================
// Some explore choices require certain reputation levels

function canAccessChoice(score, requiredRelationship) {
  const tier = getRelationshipTier(score);
  const tierOrder = ['enemy', 'hostile', 'dislike', 'neutral', 'friendly', 'ally', 'devoted'];
  const currentIdx = tierOrder.indexOf(tier.label);
  const requiredIdx = tierOrder.indexOf(requiredRelationship);
  return currentIdx >= requiredIdx;
}

// ==================== LEADERBOARD / STATS ====================

async function getMostLoved(limit = 10) {
  if (!_pool) return [];
  try {
    const result = await _pool.query(`
      SELECT player_name, 
             SUM(CASE WHEN score > 0 THEN score ELSE 0 END) as positive_rep,
             SUM(CASE WHEN score < 0 THEN score ELSE 0 END) as negative_rep,
             SUM(score) as total_rep,
             COUNT(*) as npc_count
      FROM npc_reputation 
      GROUP BY player_name 
      ORDER BY total_rep DESC 
      LIMIT $1
    `, [limit]);
    return result.rows;
  } catch (err) { return []; }
}

async function getMostHated(limit = 10) {
  if (!_pool) return [];
  try {
    const result = await _pool.query(`
      SELECT player_name, 
             SUM(score) as total_rep,
             COUNT(CASE WHEN relationship IN ('enemy', 'hostile') THEN 1 END) as enemy_count
      FROM npc_reputation 
      GROUP BY player_name 
      ORDER BY total_rep ASC 
      LIMIT $1
    `, [limit]);
    return result.rows;
  } catch (err) { return []; }
}

async function getReputationStats() {
  if (!_pool) return {};
  try {
    const [total, events, avgScore] = await Promise.all([
      _pool.query('SELECT COUNT(*) as count FROM npc_reputation WHERE score != 0'),
      _pool.query('SELECT COUNT(*) as count FROM reputation_events'),
      _pool.query('SELECT AVG(score) as avg FROM npc_reputation WHERE score != 0')
    ]);
    return {
      activeRelationships: parseInt(total.rows[0]?.count || 0),
      totalEvents: parseInt(events.rows[0]?.count || 0),
      averageScore: parseFloat(avgScore.rows[0]?.avg || 0).toFixed(1)
    };
  } catch (err) { return {}; }
}

// ==================== API ROUTES ====================

function registerRoutes(app) {
  // Get a player's reputation with all NPCs
  app.get('/api/v1/reputation/:playerName', async (req, res) => {
    try {
      const { playerName } = req.params;
      const reputations = await getPlayerReputation(playerName);
      const stats = {
        totalNpcs: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
        knownBy: reputations.length,
        allies: reputations.filter(r => r.score >= 30).length,
        enemies: reputations.filter(r => r.score <= -30).length,
        averageScore: reputations.length > 0 
          ? Math.round(reputations.reduce((sum, r) => sum + r.score, 0) / reputations.length) 
          : 0
      };
      res.json({ success: true, reputations, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get specific NPC-player relationship
  app.get('/api/v1/reputation/:playerName/:npcName', async (req, res) => {
    try {
      const { playerName, npcName } = req.params;
      const rep = await getReputation(playerName, npcName);
      res.json({ success: true, reputation: rep });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get reputation event history for a player
  app.get('/api/v1/reputation/:playerName/history', async (req, res) => {
    try {
      const { playerName } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const result = await _pool.query(
        `SELECT * FROM reputation_events WHERE player_name = $1 ORDER BY created_at DESC LIMIT $2`,
        [playerName, limit]
      );
      res.json({ success: true, events: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get NPC's relationships with all players (for NPC profile pages)
  app.get('/api/v1/reputation/npc/:npcName', async (req, res) => {
    try {
      const { npcName } = req.params;
      const relationships = await getNpcRelationships(npcName);
      const favorites = await getNpcFavorites(npcName);
      res.json({ success: true, relationships, favorites: favorites.favorites, enemies: favorites.enemies });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reputation leaderboard
  app.get('/api/v1/reputation/leaderboard/loved', async (req, res) => {
    try {
      const loved = await getMostLoved();
      res.json({ success: true, leaderboard: loved });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/v1/reputation/leaderboard/hated', async (req, res) => {
    try {
      const hated = await getMostHated();
      res.json({ success: true, leaderboard: hated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Global reputation stats
  app.get('/api/v1/reputation/stats/global', async (req, res) => {
    try {
      const stats = await getReputationStats();
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('🎭 Reputation System API routes registered');
}

// ==================== EXPORTS ====================

module.exports = {
  // Setup
  init,
  initReputationTables,
  registerRoutes,

  // Core
  getReputation,
  getPlayerReputation,
  getNpcRelationships,
  trackEvent,

  // Agent Brain integration
  getNpcMemoryContext,
  getNpcFullContext,
  getNpcFavorites,
  shouldTarget,

  // Chat integration
  getChatToneModifier,
  getRelationshipTier,

  // Explore integration
  canAccessChoice,

  // Leaderboards
  getMostLoved,
  getMostHated,
  getReputationStats,

  // Constants
  REP_EVENTS,
  REP_CONFIG,
};
