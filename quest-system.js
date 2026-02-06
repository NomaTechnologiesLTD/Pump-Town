// ============================================================================
// quest-system.js — Dynamic NPC Quest/Mission System
// Degens City - Personalized AI-generated quests based on NPC reputation
// ============================================================================

let _pool = null;
let _anthropic = null;
let _reputation = null;
let _NPC_PROFILES = null;
let _NPC_CITIZENS = null;
let _getCityStats = null;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ==================== QUEST TYPES ====================

const QUEST_TYPES = {
  // Ally quests (score >= 10) — NPCs who like you ask for help
  spy: { minRep: 10, label: 'Espionage', emoji: '🕵️', desc: 'Gather intel on a rival NPC' },
  deliver: { minRep: 0, label: 'Delivery', emoji: '📦', desc: 'Deliver something across the city' },
  protect: { minRep: 20, label: 'Bodyguard', emoji: '🛡️', desc: 'Watch their back during a risky move' },
  sabotage: { minRep: 30, label: 'Sabotage', emoji: '💣', desc: 'Undermine a rival NPC operation' },
  recruit: { minRep: 15, label: 'Recruitment', emoji: '🤝', desc: 'Convince another NPC to join their cause' },
  heist: { minRep: 40, label: 'Heist', emoji: '🏦', desc: 'Pull off a risky job together' },
  
  // Neutral quests (score -9 to 9) — Prove yourself
  errand: { minRep: -100, label: 'Errand', emoji: '🏃', desc: 'Simple task to build trust' },
  investigate: { minRep: -100, label: 'Investigation', emoji: '🔍', desc: 'Look into something suspicious' },
  gamble: { minRep: -100, label: 'Gamble', emoji: '🎰', desc: 'A risky bet with shared stakes' },
  
  // Enemy quests (score <= -10) — Hostile challenges, traps, or grudge matches
  duel: { minRep: -100, label: 'Duel', emoji: '⚔️', desc: 'Settle the score face to face' },
  trap: { minRep: -100, label: 'Trap', emoji: '🪤', desc: 'They\'re luring you into something...' },
  ultimatum: { minRep: -100, label: 'Ultimatum', emoji: '⚡', desc: 'Make amends or face consequences' },
};

// ==================== QUEST STATUS FLOW ====================
// available → accepted → in_progress → completed/failed/expired/abandoned

// ==================== DATABASE SETUP ====================

async function initQuestTables(pool) {
  const p = pool || _pool;
  if (!p) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS npc_quests (
        id SERIAL PRIMARY KEY,
        quest_id VARCHAR(50) UNIQUE NOT NULL,
        player_name VARCHAR(100) NOT NULL,
        npc_name VARCHAR(100) NOT NULL,
        quest_type VARCHAR(30) NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        briefing TEXT,
        objectives JSONB DEFAULT '[]',
        rewards JSONB DEFAULT '{}',
        penalties JSONB DEFAULT '{}',
        difficulty VARCHAR(20) DEFAULT 'medium',
        time_limit_minutes INTEGER DEFAULT 30,
        choices JSONB DEFAULT '[]',
        chosen_option VARCHAR(10),
        outcome TEXT,
        outcome_type VARCHAR(20),
        rep_before INTEGER DEFAULT 0,
        rep_after INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'available',
        expires_at TIMESTAMP,
        accepted_at TIMESTAMP,
        completed_at TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await p.query(`CREATE INDEX IF NOT EXISTS idx_quests_player ON npc_quests(player_name, status)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_quests_npc ON npc_quests(npc_name, status)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_quests_status ON npc_quests(status, expires_at)`);

    console.log('📋 Quest tables initialized');
  } catch (err) {
    console.error('Quest tables error:', err.message);
  }
}

// ==================== INITIALIZATION ====================

function init(pool, anthropic, reputation, NPC_PROFILES, NPC_CITIZENS, getCityStats) {
  _pool = pool;
  _anthropic = anthropic;
  _reputation = reputation;
  _NPC_PROFILES = NPC_PROFILES;
  _NPC_CITIZENS = NPC_CITIZENS;
  _getCityStats = getCityStats;
  console.log('📋 Quest System initialized');
}

// ==================== QUEST GENERATION ====================

// Pick quest type based on NPC's feeling toward player
function pickQuestType(repScore) {
  if (repScore >= 40) return pick(['heist', 'sabotage', 'protect', 'spy']);
  if (repScore >= 20) return pick(['protect', 'spy', 'recruit', 'deliver']);
  if (repScore >= 10) return pick(['spy', 'deliver', 'recruit', 'errand']);
  if (repScore >= -9) return pick(['errand', 'investigate', 'gamble', 'deliver']);
  if (repScore >= -29) return pick(['duel', 'ultimatum', 'errand', 'investigate']);
  return pick(['duel', 'trap', 'ultimatum']);
}

// Pick difficulty based on rep + quest type
function pickDifficulty(repScore, questType) {
  if (['heist', 'trap'].includes(questType)) return 'extreme';
  if (['sabotage', 'duel'].includes(questType)) return 'hard';
  if (['spy', 'protect', 'recruit', 'ultimatum'].includes(questType)) return 'medium';
  return pick(['easy', 'medium']);
}

// Generate rewards scaling with difficulty and relationship
function generateRewards(difficulty, repScore, questType) {
  const base = { easy: 1, medium: 1.5, hard: 2.5, extreme: 4 }[difficulty] || 1;
  const repBonus = Math.abs(repScore) > 30 ? 1.5 : 1;
  
  return {
    xp: Math.floor(rand(80, 150) * base * repBonus),
    rep_change: questType === 'trap' ? rand(-5, 5) : rand(5, 15),
    hopium: Math.floor(rand(100, 400) * base),
    alpha: difficulty === 'extreme' ? rand(50, 200) : (difficulty === 'hard' ? rand(20, 80) : 0),
    special: difficulty === 'extreme' ? pick(['secret_intel', 'rare_badge', 'npc_favor', 'treasury_cut']) : null
  };
}

// Generate penalties for failure
function generatePenalties(difficulty, repScore) {
  const base = { easy: 0.5, medium: 1, hard: 1.5, extreme: 2.5 }[difficulty] || 1;
  return {
    xp: Math.floor(rand(10, 30) * base),
    rep_change: -Math.floor(rand(3, 10) * base),
    hopium: -Math.floor(rand(50, 200) * base),
  };
}

// AI-generate a quest from an NPC for a specific player
async function generateQuest(playerName, npcName) {
  if (!_anthropic || !_reputation) return null;

  try {
    // Check active quest limit (max 3 active per player)
    const activeCount = await _pool.query(
      `SELECT COUNT(*) FROM npc_quests WHERE player_name = $1 AND status IN ('available', 'accepted', 'in_progress')`,
      [playerName]
    );
    if (parseInt(activeCount.rows[0].count) >= 3) {
      return { error: 'max_active', message: 'You have too many active quests. Complete or abandon one first.' };
    }

    // Check cooldown — same NPC can't give quest to same player within 10 min
    const recentQuest = await _pool.query(
      `SELECT id FROM npc_quests WHERE player_name = $1 AND npc_name = $2 AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
      [playerName, npcName]
    );
    if (recentQuest.rows.length > 0) {
      return { error: 'cooldown', message: `${npcName.replace(/_/g, ' ')} isn't ready to give you another quest yet.` };
    }

    // Get reputation context
    const rep = await _reputation.getReputation(playerName, npcName);
    const repScore = rep ? rep.score : 0;
    const relationship = rep ? rep.relationship : 'neutral';
    const memories = rep ? (rep.memories || []).slice(-5) : [];

    // Pick quest parameters
    const questType = pickQuestType(repScore);
    const questInfo = QUEST_TYPES[questType];
    const difficulty = pickDifficulty(repScore, questType);
    const rewards = generateRewards(difficulty, repScore, questType);
    const penalties = generatePenalties(difficulty, repScore);

    // Get NPC profile
    const npc = _NPC_PROFILES ? _NPC_PROFILES[npcName] : null;
    const npcRole = npc ? npc.role : 'citizen';
    const npcArchetype = npc ? npc.archetype : 'degen';
    const npcCatchphrases = npc ? (npc.catchphrases || []).join(', ') : '';
    const npcRivals = npc ? (npc.rivals || []).join(', ') : '';
    const npcAllies = npc ? (npc.allies || []).join(', ') : '';

    // Pick a secondary NPC (rival/ally target for quests)
    const targetNpc = npcRivals ? pick(npc.rivals) : pick(_NPC_CITIZENS.filter(n => n !== npcName));
    const cityStats = _getCityStats ? await _getCityStats() : { economy: 50, security: 50, culture: 50, morale: 50 };

    // AI-generate the quest narrative
    const prompt = `You are ${npcName.replace(/_/g, ' ')}, a ${npcArchetype} NPC in Degens City (crypto-themed city sim).
Your catchphrases: ${npcCatchphrases}
Your rivals: ${npcRivals}
Your allies: ${npcAllies}

Your relationship with player "${playerName}": ${relationship} (score: ${repScore}/100)
${memories.length > 0 ? `Recent memories of this player: ${memories.map(m => m.description || m.event).join('; ')}` : 'No specific memories yet.'}

City stats: Economy ${cityStats.economy}, Security ${cityStats.security}, Culture ${cityStats.culture}, Morale ${cityStats.morale}

Generate a ${questInfo.label} quest (${questInfo.desc}) for this player.
Quest difficulty: ${difficulty}
Secondary NPC involved: ${targetNpc.replace(/_/g, ' ')}

${repScore >= 20 ? 'You LIKE this player. Be warm, trusting. Give them a real mission.' : ''}
${repScore <= -20 ? 'You DISLIKE this player. Be hostile, suspicious. This might be a trap or grudge match.' : ''}
${repScore > -10 && repScore < 10 ? 'You\'re NEUTRAL. Test their loyalty. See what they\'re made of.' : ''}

Respond with ONLY this JSON (no markdown):
{
  "title": "Quest title (3-6 words, dramatic)",
  "description": "2-3 sentence setup. What's happening and why the player is needed. Use crypto slang.",
  "briefing": "1-2 sentence personal message from you to the player. Stay in character.",
  "choices": [
    {
      "id": "A",
      "label": "Choice label (3-5 words)",
      "desc": "What this choice means (1 sentence)",
      "risk": "low|medium|high|extreme",
      "alignment": "loyal|sneaky|heroic|ruthless"
    },
    {
      "id": "B",
      "label": "Different approach",
      "desc": "Alternative path",
      "risk": "low|medium|high|extreme",
      "alignment": "loyal|sneaky|heroic|ruthless"
    },
    {
      "id": "C",
      "label": "Wild card option",
      "desc": "Unexpected angle",
      "risk": "low|medium|high|extreme",
      "alignment": "loyal|sneaky|heroic|ruthless"
    }
  ]
}`;

    const response = await _anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const questData = JSON.parse(match[0]);
    const questId = `quest_${npcName}_${playerName}_${Date.now()}`;
    const timeLimitMinutes = { easy: 45, medium: 30, hard: 20, extreme: 15 }[difficulty] || 30;

    // Store quest in DB
    await _pool.query(`
      INSERT INTO npc_quests (quest_id, player_name, npc_name, quest_type, title, description, briefing, 
        choices, rewards, penalties, difficulty, time_limit_minutes, rep_before, status, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'available', NOW() + INTERVAL '${timeLimitMinutes} minutes')
    `, [
      questId, playerName, npcName, questType,
      questData.title || 'Unknown Quest',
      questData.description || 'A mysterious task.',
      questData.briefing || '',
      JSON.stringify(questData.choices || []),
      JSON.stringify(rewards),
      JSON.stringify(penalties),
      difficulty, timeLimitMinutes, repScore
    ]);

    console.log(`📋 Quest generated: "${questData.title}" from ${npcName} for ${playerName} [${difficulty}/${questType}]`);

    return {
      quest_id: questId,
      npc_name: npcName,
      npc_archetype: npcArchetype,
      quest_type: questType,
      quest_emoji: questInfo.emoji,
      quest_label: questInfo.label,
      title: questData.title,
      description: questData.description,
      briefing: questData.briefing,
      choices: questData.choices || [],
      rewards,
      penalties,
      difficulty,
      time_limit_minutes: timeLimitMinutes,
      relationship,
      rep_score: repScore,
    };
  } catch (err) {
    console.error('Quest generation error:', err.message);
    return null;
  }
}

// ==================== QUEST RESOLUTION ====================

async function resolveQuest(questId, playerName, choiceId) {
  if (!_anthropic || !_reputation) return null;

  try {
    // Get the quest
    const qRes = await _pool.query(
      `SELECT * FROM npc_quests WHERE quest_id = $1 AND player_name = $2 AND status IN ('available', 'accepted', 'in_progress')`,
      [questId, playerName]
    );
    if (qRes.rows.length === 0) return { error: 'not_found', message: 'Quest not found or already resolved.' };

    const quest = qRes.rows[0];
    const choices = typeof quest.choices === 'string' ? JSON.parse(quest.choices) : quest.choices;
    const rewards = typeof quest.rewards === 'string' ? JSON.parse(quest.rewards) : quest.rewards;
    const penalties = typeof quest.penalties === 'string' ? JSON.parse(quest.penalties) : quest.penalties;

    // Check expiry
    if (quest.expires_at && new Date(quest.expires_at) < new Date()) {
      await _pool.query(`UPDATE npc_quests SET status = 'expired' WHERE quest_id = $1`, [questId]);
      // Penalty rep for letting quest expire
      if (_reputation) {
        await _reputation.trackEvent(playerName, quest.npc_name, 'quest_expired', -3, 
          `Let my quest "${quest.title}" expire. Disrespectful.`, 'quest');
      }
      return { error: 'expired', message: 'This quest has expired!' };
    }

    // Find chosen option
    const choice = choices.find(c => c.id === choiceId);
    if (!choice) return { error: 'invalid_choice', message: 'Invalid choice.' };

    // Calculate success
    const successChance = { low: 0.90, medium: 0.70, high: 0.50, extreme: 0.30 }[choice.risk] || 0.6;
    
    // Reputation bonus: allies get luck boost, enemies get penalty
    const repBonus = quest.rep_before > 30 ? 0.10 : quest.rep_before < -30 ? -0.10 : 0;
    const success = Math.random() < (successChance + repBonus);

    // Get NPC profile for narrative
    const npc = _NPC_PROFILES ? _NPC_PROFILES[quest.npc_name] : null;
    const npcArchetype = npc ? npc.archetype : 'degen';

    // AI-generate outcome narrative
    const outcomePrompt = `You are ${quest.npc_name.replace(/_/g, ' ')}, a ${npcArchetype} NPC in Degens City.
    
Quest: "${quest.title}" — ${quest.description}
Player "${playerName}" chose: "${choice.label}" — ${choice.desc}
Outcome: ${success ? 'SUCCESS' : 'FAILURE'}
Your relationship: rep score ${quest.rep_before} (${quest.rep_before >= 20 ? 'ally' : quest.rep_before <= -20 ? 'enemy' : 'neutral'})

Generate JSON (no markdown):
{
  "narrative": "2-3 sentences describing what happened. Dramatic, crypto-themed. ${success ? 'Celebrate the win.' : 'Describe the failure.'}",
  "npc_reaction": "1-2 sentence reaction from you to the player. Stay in character.",
  "gossip": "1 sentence that other NPCs might hear about this. Optional drama."
}`;

    let narrative = success ? 'The plan worked!' : 'Things didn\'t go as planned...';
    let npcReaction = success ? 'Not bad, citizen.' : 'Disappointing.';
    let gossip = '';

    try {
      const aiRes = await _anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{ role: 'user', content: outcomePrompt }]
      });
      const aiText = aiRes.content[0].text;
      const aiMatch = aiText.match(/\{[\s\S]*\}/);
      if (aiMatch) {
        const parsed = JSON.parse(aiMatch[0]);
        narrative = parsed.narrative || narrative;
        npcReaction = parsed.npc_reaction || npcReaction;
        gossip = parsed.gossip || '';
      }
    } catch (aiErr) {
      console.error('Quest AI narrative error:', aiErr.message);
    }

    // Calculate actual rewards/penalties
    const finalRewards = success ? rewards : penalties;
    const repChange = success ? (rewards.rep_change || 8) : (penalties.rep_change || -5);

    // Apply reputation change
    const repEventType = success ? 'quest_completed' : 'quest_failed';
    const repDesc = success
      ? `Completed quest "${quest.title}" — ${choice.label}. Impressive.`
      : `Failed quest "${quest.title}" — ${choice.label}. Pathetic.`;
    
    await _reputation.trackEvent(playerName, quest.npc_name, repEventType, repChange, repDesc, 'quest', {
      quest_id: questId,
      quest_type: quest.quest_type,
      choice: choiceId,
      difficulty: quest.difficulty,
      alignment: choice.alignment
    });

    // Gossip spread to other NPCs
    if (gossip && Math.random() < 0.4) {
      const gossipNpcs = _NPC_CITIZENS.filter(n => n !== quest.npc_name).sort(() => Math.random() - 0.5).slice(0, 2);
      for (const gNpc of gossipNpcs) {
        const gossipDelta = success ? rand(1, 3) : rand(-3, -1);
        await _reputation.trackEvent(playerName, gNpc, 'npc_heard_good_gossip', gossipDelta,
          `Heard about ${playerName}'s quest for ${quest.npc_name.replace(/_/g, ' ')}`, 'gossip');
      }
    }

    // Get new rep score
    const newRep = await _reputation.getReputation(playerName, quest.npc_name);
    const repAfter = newRep ? newRep.score : quest.rep_before + repChange;

    // Update quest in DB
    await _pool.query(`
      UPDATE npc_quests SET status = $1, chosen_option = $2, outcome = $3, outcome_type = $4, 
        rep_after = $5, completed_at = NOW()
      WHERE quest_id = $6
    `, [success ? 'completed' : 'failed', choiceId, narrative, success ? 'success' : 'failure', repAfter, questId]);

    // Post to chat
    const chatMsg = success
      ? `📋 ${playerName} completed "${quest.title}" for ${quest.npc_name.replace(/_/g, ' ')}! 🏆`
      : `📋 ${playerName} failed "${quest.title}" from ${quest.npc_name.replace(/_/g, ' ')} 💀`;
    
    await _pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['📋 QUEST LOG', chatMsg]);

    // NPC reacts in chat
    setTimeout(async () => {
      try {
        await _pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [quest.npc_name, npcReaction.includes('@') ? npcReaction : `@${playerName} ${npcReaction}`]);
      } catch(e) {}
    }, rand(3000, 8000));

    // Log to activity feed
    await _pool.query(`INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1,$2,$3,$4)`,
      [playerName, 'quest_' + (success ? 'complete' : 'fail'), quest.title, success ? '📋' : '💀']);

    return {
      success,
      quest_id: questId,
      quest_title: quest.title,
      npc_name: quest.npc_name,
      choice_made: choice,
      narrative,
      npc_reaction: npcReaction,
      gossip,
      rewards: success ? rewards : penalties,
      rep_before: quest.rep_before,
      rep_after: repAfter,
      rep_change: repChange,
      difficulty: quest.difficulty,
    };
  } catch (err) {
    console.error('Quest resolution error:', err.message);
    return null;
  }
}

// ==================== QUEST ABANDONMENT ====================

async function abandonQuest(questId, playerName) {
  try {
    const qRes = await _pool.query(
      `SELECT * FROM npc_quests WHERE quest_id = $1 AND player_name = $2 AND status IN ('available', 'accepted', 'in_progress')`,
      [questId, playerName]
    );
    if (qRes.rows.length === 0) return { error: 'not_found' };
    
    const quest = qRes.rows[0];
    await _pool.query(`UPDATE npc_quests SET status = 'abandoned', completed_at = NOW() WHERE quest_id = $1`, [questId]);
    
    // Small rep penalty for abandoning
    if (_reputation) {
      await _reputation.trackEvent(playerName, quest.npc_name, 'quest_abandoned', -4,
        `Abandoned quest "${quest.title}". Can't be trusted.`, 'quest');
    }

    return { success: true, message: `Quest "${quest.title}" abandoned. ${quest.npc_name.replace(/_/g, ' ')} won't forget this.` };
  } catch (err) {
    console.error('Abandon quest error:', err.message);
    return { error: 'server_error' };
  }
}

// ==================== QUERY HELPERS ====================

// Get all active quests for a player
async function getPlayerQuests(playerName, includeCompleted = false) {
  try {
    const statusFilter = includeCompleted
      ? `status IN ('available', 'accepted', 'in_progress', 'completed', 'failed')`
      : `status IN ('available', 'accepted', 'in_progress')`;
    
    const result = await _pool.query(
      `SELECT * FROM npc_quests WHERE player_name = $1 AND ${statusFilter} ORDER BY created_at DESC LIMIT 20`,
      [playerName]
    );

    // Expire old quests
    const now = new Date();
    const quests = result.rows.map(q => {
      if (['available', 'accepted', 'in_progress'].includes(q.status) && q.expires_at && new Date(q.expires_at) < now) {
        q.status = 'expired';
        // Async expire in DB
        _pool.query(`UPDATE npc_quests SET status = 'expired' WHERE quest_id = $1`, [q.quest_id]).catch(() => {});
      }
      return {
        ...q,
        choices: typeof q.choices === 'string' ? JSON.parse(q.choices) : q.choices,
        rewards: typeof q.rewards === 'string' ? JSON.parse(q.rewards) : q.rewards,
        penalties: typeof q.penalties === 'string' ? JSON.parse(q.penalties) : q.penalties,
        metadata: typeof q.metadata === 'string' ? JSON.parse(q.metadata) : q.metadata,
        time_remaining: q.expires_at ? Math.max(0, new Date(q.expires_at) - now) : null
      };
    });

    return quests;
  } catch (err) {
    console.error('Get player quests error:', err.message);
    return [];
  }
}

// Get quest history stats for a player
async function getQuestStats(playerName) {
  try {
    const result = await _pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE status = 'expired') as expired,
        COUNT(*) FILTER (WHERE status IN ('available', 'accepted', 'in_progress')) as active,
        COUNT(*) as total,
        COUNT(DISTINCT npc_name) as npcs_served,
        AVG(CASE WHEN status = 'completed' THEN (rewards->>'rep_change')::int ELSE NULL END) as avg_rep_gain
      FROM npc_quests WHERE player_name = $1
    `, [playerName]);

    return result.rows[0] || {};
  } catch (err) {
    console.error('Quest stats error:', err.message);
    return {};
  }
}

// Get which NPCs have quests available for a player (based on reputation)
async function getAvailableQuestGivers(playerName) {
  if (!_reputation || !_NPC_CITIZENS) return [];

  try {
    const reps = await _reputation.getPlayerReputation(playerName);
    const repMap = {};
    (reps || []).forEach(r => { repMap[r.npc_name] = r; });

    // Check cooldowns
    const recentQuests = await _pool.query(
      `SELECT npc_name FROM npc_quests WHERE player_name = $1 AND created_at > NOW() - INTERVAL '10 minutes'`,
      [playerName]
    );
    const onCooldown = new Set(recentQuests.rows.map(r => r.npc_name));

    // Active quest count
    const activeCount = await _pool.query(
      `SELECT COUNT(*) FROM npc_quests WHERE player_name = $1 AND status IN ('available', 'accepted', 'in_progress')`,
      [playerName]
    );
    const canAcceptMore = parseInt(activeCount.rows[0].count) < 3;

    return _NPC_CITIZENS.map(npcName => {
      const rep = repMap[npcName];
      const score = rep ? rep.score : 0;
      const relationship = rep ? rep.relationship : 'neutral';
      const npc = _NPC_PROFILES ? _NPC_PROFILES[npcName] : null;

      // Determine quest availability
      let available = !onCooldown.has(npcName) && canAcceptMore;
      let questHint = '';
      let mood = 'neutral';

      if (score >= 30) {
        questHint = 'Has a special mission for you';
        mood = 'eager';
      } else if (score >= 10) {
        questHint = 'Might have something for you';
        mood = 'friendly';
      } else if (score >= -9) {
        questHint = 'Wants to test your loyalty';
        mood = 'cautious';
      } else if (score >= -29) {
        questHint = 'Has a bone to pick with you';
        mood = 'hostile';
      } else {
        questHint = 'DANGER — Likely a trap';
        mood = 'threatening';
      }

      if (onCooldown.has(npcName)) {
        questHint = 'Needs time before another quest';
        available = false;
      }

      return {
        npc_name: npcName,
        archetype: npc ? npc.archetype : 'unknown',
        role: npc ? npc.role : 'citizen',
        score,
        relationship,
        available,
        quest_hint: questHint,
        mood,
      };
    }).filter(n => n.score !== 0 || Math.random() < 0.3); // Filter unknowns unless lucky
  } catch (err) {
    console.error('Available quest givers error:', err.message);
    return [];
  }
}

// ==================== API ROUTES ====================

function registerRoutes(app) {
  // Get available quest givers
  app.get('/api/v1/quests/available/:playerName', async (req, res) => {
    try {
      const givers = await getAvailableQuestGivers(req.params.playerName);
      res.json({ success: true, givers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Request a quest from a specific NPC
  app.post('/api/v1/quests/generate', async (req, res) => {
    try {
      const { playerName, npcName } = req.body;
      if (!playerName || !npcName) return res.status(400).json({ success: false, error: 'Missing playerName or npcName' });

      const quest = await generateQuest(playerName, npcName);
      if (!quest) return res.status(500).json({ success: false, error: 'Failed to generate quest' });
      if (quest.error) return res.json({ success: false, ...quest });

      res.json({ success: true, quest });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get player's active quests
  app.get('/api/v1/quests/:playerName', async (req, res) => {
    try {
      const includeCompleted = req.query.history === 'true';
      const quests = await getPlayerQuests(req.params.playerName, includeCompleted);
      const stats = await getQuestStats(req.params.playerName);
      res.json({ success: true, quests, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Resolve a quest (make a choice)
  app.post('/api/v1/quests/resolve', async (req, res) => {
    try {
      const { questId, playerName, choiceId } = req.body;
      if (!questId || !playerName || !choiceId) return res.status(400).json({ success: false, error: 'Missing params' });

      const result = await resolveQuest(questId, playerName, choiceId);
      if (!result) return res.status(500).json({ success: false, error: 'Resolution failed' });
      if (result.error) return res.json({ success: false, ...result });

      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Abandon a quest
  app.post('/api/v1/quests/abandon', async (req, res) => {
    try {
      const { questId, playerName } = req.body;
      if (!questId || !playerName) return res.status(400).json({ success: false, error: 'Missing params' });

      const result = await abandonQuest(questId, playerName);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Quest stats
  app.get('/api/v1/quests/stats/:playerName', async (req, res) => {
    try {
      const stats = await getQuestStats(req.params.playerName);
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('📋 Quest routes registered');
}

// ==================== EXPORTS ====================

module.exports = {
  initQuestTables,
  init,
  registerRoutes,
  generateQuest,
  resolveQuest,
  abandonQuest,
  getPlayerQuests,
  getQuestStats,
  getAvailableQuestGivers,
  QUEST_TYPES
};
