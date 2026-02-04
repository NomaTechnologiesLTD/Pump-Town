// ==================== DEGENS CITY - AUTONOMOUS AGENT BRAIN ====================
//
// This module gives NPCs real AI-powered autonomous decision-making.
// Instead of random chance + template messages, each NPC now "thinks" using Claude
// and decides what to do based on their personality, mood, relationships, and city state.
//
// Actions NPCs can take:
//   - Sue another NPC, player, or celebrity
//   - Start/join a protest
//   - Propose a new city law
//   - Challenge someone to a duel
//   - Open a business
//   - File a complaint with the mayor
//   - Start a rumor
//   - DM / provoke a real player
//   - Form an alliance or betray an ally
//   - Run for mayor
//   - Throw a party / event
//   - Commit a crime (if personality allows)
//   - Accuse someone of a crime
//
// Usage: const agentBrain = require('./agent-brain.js');
//        agentBrain.init(pool, anthropic, cityEngine, cityLiveData, NPC_PROFILES, NPC_CITIZENS);
//        // Then in city tick: await agentBrain.tick();

// ==================== CONFIG ====================

const BRAIN_CONFIG = {
  // How often the brain ticks (called from city engine, not its own interval)
  minTimeBetweenThoughts: 30000,    // 30 sec minimum between any NPC thinking (was 2 min)
  minTimeBetweenSameNpc: 180000,    // 3 min before same NPC thinks again (was 10 min)
  maxConcurrentActions: 5,          // Max actions processing at once (was 3)
  claudeModel: 'claude-sonnet-4-5-20250929',  // Use Sonnet for speed + cost
  maxTokens: 500,
  // Action cooldowns (ms) - all reduced for more activity
  cooldowns: {
    sue: 120000,          // 2 min between lawsuits (was 5 min)
    propose_law: 300000,  // 5 min between law proposals (was 10 min)
    challenge: 90000,     // 1.5 min between challenges (was 5 min)
    party: 180000,        // 3 min between parties (was 10 min)
    rumor: 60000,         // 1 min between rumors (was 3 min)
    accuse: 90000,        // 1.5 min between accusations (was 5 min)
    business: 300000,     // 5 min between businesses (was 10 min)
    protest: 300000,      // 5 min between protests (was 10 min)
    betray: 300000,       // 5 min between betrayals (was 15 min)
    run_for_mayor: 600000, // 10 min (was 30 min)
    crime: 180000,        // 3 min between crimes (was 10 min)
    dm_player: 120000,    // 2 min between DMs to players (was 5 min)
  }
};

// ==================== CELEBRITIES / PUBLIC FIGURES ====================
// NPCs can reference these in lawsuits, rumors, etc. for comedy
const CELEBRITIES = [
  // Crypto Founders & Legends
  { name: 'Satoshi Nakamoto', handle: '@satoshi', domain: 'crypto', traits: ['invented Bitcoin', 'disappeared mysteriously', 'probably a time traveler'] },
  { name: 'Vitalik Buterin', handle: '@VitalikButerin', domain: 'crypto', traits: ['ethereum founder', 'keeps selling ETH', 'wears unicorn shirts', 'too smart for his own good'] },
  { name: 'CZ', handle: '@cabortzbin', domain: 'crypto', traits: ['SAFU', 'binance guy', '4 months was enough', 'funds are safu meme'] },
  { name: 'SBF', handle: '@SBF_FTX', domain: 'crypto', traits: ['in jail', 'lost billions', 'played league during meetings', 'alameda funds'] },
  { name: 'Do Kwon', handle: '@stabortwon', domain: 'crypto', traits: ['terra luna collapse', '40B disappeared', 'on the run', 'algorithmic disaster'] },
  { name: 'Justin Sun', handle: '@justinsuntron', domain: 'crypto', traits: ['TRON founder', 'attention seeker', 'bought everything', 'marketing genius or villain'] },
  { name: 'Arthur Hayes', handle: '@CryptoHayes', domain: 'crypto', traits: ['BitMEX founder', 'rekt traders', 'essays are too long', 'macro god'] },
  
  // Crypto KOLs & Influencers (the ones who shill and rug)
  { name: 'JamesWynnReal', handle: '@JamesWynnReal', domain: 'crypto_kol', traits: ['leverage degen', 'rugged followers', '100x calls', 'liquidation king'] },
  { name: 'Orangie', handle: '@Orangie', domain: 'crypto_kol', traits: ['shilled Trove', 'paid promoter', 'bags heavy', 'trust me bro'] },
  { name: 'Ansem', handle: '@blabortzofis', domain: 'crypto_kol', traits: ['solana maxi', 'memecoin caller', 'WIF to 100', 'bonk evangelist'] },
  { name: 'Hsaka', handle: '@HsakaTrades', domain: 'crypto_kol', traits: ['chart wizard', 'always right after the fact', 'deleted tweets'] },
  { name: 'GCR', handle: '@GiganticRebirth', domain: 'crypto_kol', traits: ['mysterious trader', 'calls tops perfectly', 'disappeared'] },
  { name: 'Cobie', handle: '@coaborte', domain: 'crypto_kol', traits: ['UpOnly podcast', 'insider info', 'too honest for CT', 'retired'] },
  { name: 'ZachXBT', handle: '@zachxbt', domain: 'crypto_kol', traits: ['blockchain detective', 'exposes scams', 'no one is safe', 'doxxed everyone'] },
  { name: 'Lookonchain', handle: '@lookonchain', domain: 'crypto_kol', traits: ['whale watcher', 'front runs everyone', 'on-chain stalker'] },
  { name: 'Andrew Tate', handle: '@Cobratate', domain: 'crypto_kol', traits: ['shilled scam coins', 'matrix talk', 'arrested', 'top G copium'] },
  
  // Tech & Business
  { name: 'Elon Musk', handle: '@elonmusk', domain: 'tech/crypto', traits: ['tweets tank markets', 'doge father', 'owns Twitter', 'SEC hates him'] },
  { name: 'Donald Trump', handle: '@realDonaldTrump', domain: 'politics/crypto', traits: ['launched $TRUMP coin', 'tremendous gains', 'crypto president'] },
  { name: 'Gary Gensler', handle: '@GaryGensler', domain: 'regulation', traits: ['SEC tyrant', 'hates crypto', 'everything is a security', 'enforcement only'] },
  { name: 'Mark Zuckerberg', handle: '@fabortzuck', domain: 'tech', traits: ['meta', 'killed Diem', 'lizard person', 'metaverse failure'] },
  
  // Meme Personalities
  { name: 'Matt Furie', handle: '@Matt_Furie', domain: 'meme', traits: ['created Pepe', 'didnt make money', 'suing everyone'] },
  { name: 'Murad', handle: '@MustStopMurad', domain: 'crypto_kol', traits: ['memecoin supercycle', 'cult leader energy', 'diamond hands'] },
  
  // Exchange CEOs
  { name: 'Brian Armstrong', handle: '@brian_armstrong', domain: 'crypto', traits: ['Coinbase CEO', 'regulatory bootlicker', 'sold the top'] },
  { name: 'Sam Bankman-Fried', handle: '@SBF_FTX', domain: 'crypto', traits: ['FTX collapse', 'customer funds gone', 'effective altruism scam'] },
  
  // Entertainment crossover
  { name: 'Drake', handle: '@Drake', domain: 'music', traits: ['lost millions betting', 'the drake curse', 'Bitcoin maxi now'] },
  { name: 'Snoop Dogg', handle: '@SnoopDogg', domain: 'music/crypto', traits: ['NFT rugger', 'Bored Ape owner', 'metaverse DJ'] },
  { name: 'Kim Kardashian', handle: '@KimKardashian', domain: 'entertainment', traits: ['EthereumMax scam', 'SEC fine', 'influencer pump and dump'] },
  { name: 'Logan Paul', handle: '@LoganPaul', domain: 'entertainment', traits: ['CryptoZoo scam', 'NFT rugger', 'lawsuit pending'] },
  { name: 'Floyd Mayweather', handle: '@FloydMayweather', domain: 'entertainment', traits: ['promoted 3 rug pulls', 'undefeated at scams too'] },
];

// ==================== ACTION DEFINITIONS ====================
const ACTIONS = {
  sue: {
    id: 'sue',
    description: 'File a lawsuit against someone',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 5, culture: 2 },
    announcement: true,
  },
  propose_law: {
    id: 'propose_law',
    description: 'Propose a new city law for a vote',
    requiresTarget: false,
    effects: { culture: 3 },
    announcement: true,
  },
  challenge: {
    id: 'challenge',
    description: 'Challenge someone to a public duel or bet',
    requiresTarget: true,
    targetTypes: ['npc', 'player'],
    effects: { chaos: 3, morale: 2 },
    announcement: true,
  },
  throw_party: {
    id: 'throw_party',
    description: 'Throw a party or event in the city',
    requiresTarget: false,
    effects: { morale: 5, culture: 3 },
    announcement: true,
  },
  start_rumor: {
    id: 'start_rumor',
    description: 'Start a juicy rumor about someone',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 3, culture: 1 },
    announcement: true,
  },
  accuse_crime: {
    id: 'accuse_crime',
    description: 'Publicly accuse someone of a crime',
    requiresTarget: true,
    targetTypes: ['npc', 'player', 'celebrity'],
    effects: { chaos: 5, security: -3 },
    announcement: true,
  },
  open_business: {
    id: 'open_business',
    description: 'Open a new business in the city',
    requiresTarget: false,
    effects: { economy: 3, culture: 2 },
    announcement: true,
  },
  file_complaint: {
    id: 'file_complaint',
    description: 'File an official complaint with the mayor',
    requiresTarget: false,
    effects: { chaos: 2 },
    announcement: true,
  },
  form_alliance: {
    id: 'form_alliance',
    description: 'Propose an alliance with another NPC',
    requiresTarget: true,
    targetTypes: ['npc'],
    effects: { morale: 2 },
    announcement: true,
  },
  betray_ally: {
    id: 'betray_ally',
    description: 'Betray a current ally publicly',
    requiresTarget: true,
    targetTypes: ['npc'],
    effects: { chaos: 8, morale: -3 },
    announcement: true,
  },
  run_for_mayor: {
    id: 'run_for_mayor',
    description: 'Announce candidacy for mayor',
    requiresTarget: false,
    effects: { chaos: 10, culture: 5 },
    announcement: true,
  },
  commit_crime: {
    id: 'commit_crime',
    description: 'Attempt to commit a crime',
    requiresTarget: false,
    effects: { chaos: 8, security: -5 },
    announcement: false, // police discover it
  },
  dm_player: {
    id: 'dm_player',
    description: 'Send a direct message/provocation to a real player',
    requiresTarget: true,
    targetTypes: ['player'],
    effects: {},
    announcement: false,
  },
};

// ==================== MODULE STATE ====================

let _pool = null;
let _anthropic = null;
let _cityEngine = null;
let _cityLiveData = null;
let _NPC_PROFILES = null;
let _NPC_CITIZENS = null;
let _getCityStats = null;
let _updateCityStats = null;

// Track when each NPC last thought and action cooldowns
const npcLastThought = {};
const actionCooldowns = {};
let lastBrainTick = 0;
let activeActions = 0;

// Track autonomous actions for the frontend
let recentAutonomousActions = [];

// ==================== INITIALIZATION ====================

function init(pool, anthropic, cityEngine, cityLiveData, NPC_PROFILES, NPC_CITIZENS, getCityStats, updateCityStats) {
  _pool = pool;
  _anthropic = anthropic;
  _cityEngine = cityEngine;
  _cityLiveData = cityLiveData;
  _NPC_PROFILES = NPC_PROFILES;
  _NPC_CITIZENS = NPC_CITIZENS;
  _getCityStats = getCityStats;
  _updateCityStats = updateCityStats;
  console.log('🧠 Agent Brain initialized with', NPC_CITIZENS.length, 'NPCs');
}

// ==================== DATABASE SETUP ====================

async function initBrainTables(pool) {
  const p = pool || _pool;
  if (!p) return;
  try {
    // Autonomous actions log
    await p.query(`
      CREATE TABLE IF NOT EXISTS autonomous_actions (
        id SERIAL PRIMARY KEY,
        npc_name VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        target_name VARCHAR(100),
        target_type VARCHAR(20),
        description TEXT,
        ai_reasoning TEXT,
        chat_messages JSONB DEFAULT '[]',
        outcome TEXT,
        status VARCHAR(20) DEFAULT 'active',
        city_effects JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    // Lawsuits (special table for the justice system integration)
    await p.query(`
      CREATE TABLE IF NOT EXISTS lawsuits (
        id SERIAL PRIMARY KEY,
        case_number VARCHAR(50) UNIQUE NOT NULL,
        plaintiff_name VARCHAR(100) NOT NULL,
        plaintiff_type VARCHAR(20) DEFAULT 'npc',
        defendant_name VARCHAR(100) NOT NULL,
        defendant_type VARCHAR(20) DEFAULT 'npc',
        complaint TEXT NOT NULL,
        damages_requested INTEGER DEFAULT 0,
        evidence TEXT,
        plaintiff_argument TEXT,
        defendant_argument TEXT,
        judge_ruling TEXT,
        verdict VARCHAR(20),
        damages_awarded INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'filed',
        public_interest INTEGER DEFAULT 0,
        twitter_share_text TEXT,
        target_handle VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);
    
    // Add columns if they don't exist (for existing tables)
    try {
      await p.query(`ALTER TABLE lawsuits ADD COLUMN IF NOT EXISTS twitter_share_text TEXT`);
      await p.query(`ALTER TABLE lawsuits ADD COLUMN IF NOT EXISTS target_handle VARCHAR(100)`);
    } catch (e) { /* columns might already exist */ }

    // City laws proposed by NPCs
    await p.query(`
      CREATE TABLE IF NOT EXISTS proposed_laws (
        id SERIAL PRIMARY KEY,
        proposer_name VARCHAR(100) NOT NULL,
        law_title VARCHAR(200) NOT NULL,
        law_description TEXT NOT NULL,
        law_effects JSONB DEFAULT '{}',
        votes_for INTEGER DEFAULT 0,
        votes_against INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'proposed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    console.log('🧠 Agent Brain tables initialized');
  } catch (err) {
    console.error('Brain table init error:', err.message);
  }
}

// ==================== CORE BRAIN LOGIC ====================

// Build context string for an NPC's "thought"
function buildNpcContext(npcName) {
  const npc = _NPC_PROFILES[npcName];
  const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npcName] : null;
  const stats = _getCityStats ? null : null; // We'll pass stats separately

  let context = `You are ${npcName}, a citizen of Degens City.\n`;
  context += `Role: ${npc.role}\n`;
  context += `Personality archetype: ${npc.archetype}\n`;
  context += `Current mood: ${life ? life.mood : npc.mood}\n`;
  context += `Catchphrases: ${npc.catchphrases.join(', ')}\n`;
  context += `Favorite token: $${npc.favToken}\n`;
  context += `Trading style: ${npc.tradeBias}\n`;
  context += `Allies: ${(npc.allies || []).join(', ') || 'none'}\n`;
  context += `Rivals: ${(npc.rivals || []).join(', ') || 'none'}\n`;

  if (life) {
    context += `\nYour current state:\n`;
    context += `- Wealth: ${life.wealth} TOWN coins\n`;
    context += `- Status: ${life.status}\n`;
    context += `- Location: ${life.location}\n`;
    context += `- Energy: ${life.energy}/100\n`;
    context += `- Drunk level: ${life.drunk}\n`;
    context += `- Reputation: ${life.reputation}\n`;
    context += `- Bankrupt: ${life.bankrupt}\n`;
    context += `- Partner: ${life.partner || 'single'}\n`;
    context += `- Nemesis: ${life.nemesis || 'none'}\n`;
    context += `- Wanted by police: ${life.wanted}\n`;
  }

  return context;
}

function buildCityContext(cityStats) {
  let ctx = `\nCity State:\n`;
  ctx += `- Economy: ${cityStats.economy}/100\n`;
  ctx += `- Security: ${cityStats.security}/100\n`;
  ctx += `- Culture: ${cityStats.culture}/100\n`;
  ctx += `- Morale: ${cityStats.morale}/100\n`;
  ctx += `- Mayor: ${_cityEngine.currentMayor} (approval: ${_cityEngine.mayorApproval}%)\n`;
  ctx += `- Chaos level: ${_cityEngine.chaosLevel}\n`;
  ctx += `- Market sentiment: ${_cityEngine.marketSentiment}\n`;
  ctx += `- Weather: ${_cityLiveData.weather}\n`;

  // Recent actions for context
  if (recentAutonomousActions.length > 0) {
    ctx += `\nRecent events in the city:\n`;
    recentAutonomousActions.slice(0, 5).forEach(a => {
      ctx += `- ${a.npc_name} did "${a.action_type}" ${a.target_name ? 'targeting ' + a.target_name : ''}: ${(a.description || '').substring(0, 100)}\n`;
    });
  }

  return ctx;
}

function buildAvailableTargets() {
  let targets = `\nPossible targets:\n`;

  // NPCs
  targets += `NPCs: ${_NPC_CITIZENS.join(', ')}\n`;

  // Real players (fetch recent active ones)
  targets += `(You can also target real players or celebrities)\n`;

  // Celebrities
  targets += `Celebrities: ${CELEBRITIES.map(c => c.name).join(', ')}\n`;

  return targets;
}

// The main "think" function - asks Claude what an NPC wants to do
async function npcThink(npcName) {
  if (!_anthropic) return null;

  const npc = _NPC_PROFILES[npcName];
  const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npcName] : null;

  let cityStats;
  try { cityStats = await _getCityStats(); } catch (e) { cityStats = { economy: 50, security: 50, culture: 50, morale: 50 }; }

  // Get recent active players to potentially target
  let recentPlayers = [];
  try {
    const res = await _pool.query(
      `SELECT DISTINCT player_name FROM chat_messages 
       WHERE channel = 'global' AND created_at > NOW() - INTERVAL '30 minutes'
       AND player_name NOT LIKE '🤖%' AND player_name NOT LIKE '📰%' AND player_name NOT LIKE '📊%'
       AND player_name NOT LIKE '💕%' AND player_name NOT LIKE '💔%' AND player_name NOT LIKE '🏛%'
       AND player_name != $1
       ORDER BY created_at DESC LIMIT 10`,
      [npcName]
    );
    recentPlayers = res.rows.map(r => r.player_name).filter(n => !_NPC_CITIZENS.includes(n));
  } catch (e) { }

  const actionList = Object.keys(ACTIONS).map(k => {
    const a = ACTIONS[k];
    return `- ${k}: ${a.description}${a.requiresTarget ? ' (needs a target)' : ''}`;
  }).join('\n');

  const systemPrompt = `You are an autonomous AI agent in Degens City, a chaotic crypto-themed city simulation game. You must decide what action to take next based on your personality, current state, and what's happening in the city.

CRITICAL RULES:
- Stay in character as your personality at ALL times
- Be creative, dramatic, and VIRAL - make content people want to share on Twitter/X!
- CELEBRITY LAWSUITS ARE GOLD: Sue crypto KOLs and celebrities for HILARIOUS reasons!
  * Sue Vitalik Buterin for selling ETH and tanking your bags
  * Sue JamesWynnReal for rugging his followers with leverage calls
  * Sue Orangie for shilling Trove which dumped 90%
  * Sue Satoshi Nakamoto for inventing Bitcoin and causing your addiction
  * Sue Gary Gensler for existing
  * Sue Elon Musk for tweeting and crashing the market
  * Make the lawsuit reasons ABSURD and FUNNY - this is comedy!
- PROPOSE CRAZY LAWS: "Ban selling", "Mandatory 100x leverage", "Paper hands go to jail"
- Tag their real Twitter handles in your chat messages for maximum engagement!
- VARIETY IS KEY: Mix up your actions! Try 'sue', 'propose_law', 'throw_party', 'start_rumor', 'challenge'
- If you have a rival or nemesis, target them with lawsuits
- NEVER be boring - always choose the most VIRAL, SHAREABLE option
- Think: "Would crypto Twitter retweet this?" If yes, DO IT!

FORMATTING: Respond with ONLY valid JSON, no markdown, no backticks. Format:
{
  "action": "action_id",
  "target": "target_name or null",
  "target_type": "npc|player|celebrity",
  "reasoning": "brief internal thought about why (1 sentence, in character)",
  "chat_message": "what you say in city chat announcing this (in character, with emojis, tag their @handle if celebrity, max 280 chars for Twitter)",
  "description": "brief description of what's happening (for the action log, max 150 chars)"
}`;

  const userPrompt = `${buildNpcContext(npcName)}
${buildCityContext(cityStats)}

Available actions:
${actionList}

${buildAvailableTargets()}
${recentPlayers.length > 0 ? `\nActive real players right now: ${recentPlayers.join(', ')}` : ''}

Based on your personality, mood, relationships, and the current city state, what do you want to do? Pick ONE action. Be creative and dramatic!`;

  try {
    const response = await _anthropic.messages.create({
      model: BRAIN_CONFIG.claudeModel,
      max_tokens: BRAIN_CONFIG.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = response.content[0].text.trim();
    // Try to parse JSON - handle potential markdown wrapping
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const decision = JSON.parse(cleaned);

    // Validate
    if (!decision.action || !ACTIONS[decision.action]) {
      console.error(`🧠 [${npcName}] Invalid action: ${decision.action}`);
      return null;
    }

    return {
      npc_name: npcName,
      npc_profile: npc,
      npc_life: life,
      ...decision
    };
  } catch (err) {
    console.error(`🧠 [${npcName}] Think error:`, err.message);
    return null;
  }
}

// ==================== ACTION EXECUTORS ====================

async function executeSue(decision) {
  const caseNumber = 'DC-' + Date.now().toString(36).toUpperCase();
  const damages = Math.floor(Math.random() * 500000) + 10000; // Bigger damages = more dramatic

  // Get celebrity handle if suing a celebrity
  let targetHandle = '';
  if (decision.target_type === 'celebrity') {
    const celeb = CELEBRITIES.find(c => c.name === decision.target);
    if (celeb) targetHandle = celeb.handle;
  }

  // Create Twitter-ready share text
  const twitterText = targetHandle 
    ? `🚨 BREAKING: ${decision.npc_name} just filed a lawsuit against ${targetHandle} in Degens City for $${damages.toLocaleString()}!\n\nReason: "${decision.description}"\n\nCase #${caseNumber} 📋⚖️\n\nPlay free at degenscity.com 🏙️`
    : `🚨 LAWSUIT ALERT: ${decision.npc_name} is suing ${decision.target} for $${damages.toLocaleString()} in Degens City!\n\nCase #${caseNumber} 📋⚖️\n\nThis city is WILD! degenscity.com`;

  try {
    await _pool.query(
      `INSERT INTO lawsuits (case_number, plaintiff_name, plaintiff_type, defendant_name, defendant_type, complaint, damages_requested, status, twitter_share_text, target_handle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'filed', $8, $9)`,
      [caseNumber, decision.npc_name, 'npc', decision.target, decision.target_type, decision.description, damages, twitterText, targetHandle]
    );

    // Announce in chat with Twitter handle
    const chatAnnouncement = targetHandle 
      ? `${decision.chat_message} ${targetHandle}`
      : decision.chat_message;
    
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, chatAnnouncement]
    );

    // News announcement
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['⚖️ COURT NEWS', `📋 NEW LAWSUIT FILED: ${decision.npc_name} is suing ${decision.target}${targetHandle ? ` (${targetHandle})` : ''} for $${damages.toLocaleString()} TOWN! Case #${caseNumber}. 🍿`]
    );

    // Also add to activity feed with share data
    await _pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon)
       VALUES ($1, $2, $3, $4)`,
      [decision.npc_name, 'lawsuit_filed', `Filed lawsuit against ${decision.target}${targetHandle ? ` ${targetHandle}` : ''}: ${decision.description}`, '⚖️']
    );

    // If target is an NPC, they react
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      const reactions = [
        `@${decision.npc_name} YOU'RE SUING ME?! This is the most ridiculous thing I've ever heard! See you in court! 😤⚖️`,
        `@${decision.npc_name} LMAOOO a lawsuit?? bring it. my defense attorney is BUILT DIFFERENT 💪`,
        `@${decision.npc_name} this is SLANDER! I'm counter-suing for EMOTIONAL DAMAGE! 😭💔`,
        `@${decision.npc_name} *spits out drink* A LAWSUIT?! over WHAT?! 💀`,
        `@${decision.npc_name} you just made the biggest mistake of your life. I'll see you in court. 😈`,
      ];
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, reactions[Math.floor(Math.random() * reactions.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 15000) + 5000);
    }

    // If target is a celebrity, comedy reaction with their handle
    if (decision.target_type === 'celebrity') {
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['📰 BREAKING NEWS', `🌍 ${decision.npc_name} from Degens City has filed a lawsuit against ${decision.target} ${targetHandle}! Legal experts say this has "absolutely zero legal standing" but crypto Twitter is LOVING it 🍿😂 #DegensCity`]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 10000) + 3000);
    }

    // Schedule auto-resolve lawsuit after 5-15 minutes
    const resolveTime = Math.floor(Math.random() * 600000) + 300000;
    setTimeout(() => resolveLawsuit(caseNumber), resolveTime);

    console.log(`⚖️ Lawsuit filed: ${decision.npc_name} vs ${decision.target} ${targetHandle} - Case ${caseNumber}`);

    return { success: true, caseNumber, damages, twitterText };
  } catch (err) {
    console.error('Sue execution error:', err.message);
    return { success: false };
  }
}

async function resolveLawsuit(caseNumber) {
  if (!_anthropic) return;
  try {
    const res = await _pool.query('SELECT * FROM lawsuits WHERE case_number = $1 AND status = $2', [caseNumber, 'filed']);
    if (res.rows.length === 0) return;
    const lawsuit = res.rows[0];

    // AI judge decides
    const judgeResponse = await _anthropic.messages.create({
      model: BRAIN_CONFIG.claudeModel,
      max_tokens: 300,
      system: `You are Judge McChain of Degens City. You're delivering a verdict on a lawsuit. Be dramatic, funny, and entertaining. This is a game - keep it absurd and fun. Respond with ONLY JSON, no markdown: {"verdict": "sustained|dismissed|settled", "ruling": "your dramatic ruling in 1-2 sentences", "damages_awarded": number_or_0, "chat_announcement": "dramatic court announcement with emojis, max 200 chars"}`,
      messages: [{
        role: 'user',
        content: `Case ${caseNumber}: ${lawsuit.plaintiff_name} (${lawsuit.plaintiff_type}) is suing ${lawsuit.defendant_name} (${lawsuit.defendant_type}) for ${lawsuit.damages_requested} TOWN.\nComplaint: ${lawsuit.complaint}\nDeliver your verdict!`
      }]
    });

    let text = judgeResponse.content[0].text.trim();
    if (text.startsWith('```')) text = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const verdict = JSON.parse(text);

    await _pool.query(
      `UPDATE lawsuits SET verdict = $1, judge_ruling = $2, damages_awarded = $3, status = 'resolved', resolved_at = NOW() WHERE case_number = $4`,
      [verdict.verdict, verdict.ruling, verdict.damages_awarded || 0, caseNumber]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['⚖️ Judge McChain', verdict.chat_announcement || `🔨 Case ${caseNumber}: ${verdict.verdict.toUpperCase()}! ${verdict.ruling}`]
    );

    console.log(`⚖️ Lawsuit ${caseNumber} resolved: ${verdict.verdict}`);
  } catch (err) {
    console.error('Lawsuit resolve error:', err.message);
  }
}

async function executeProposeLaw(decision) {
  try {
    await _pool.query(
      `INSERT INTO proposed_laws (proposer_name, law_title, law_description, status) VALUES ($1, $2, $3, 'proposed')`,
      [decision.npc_name, decision.description.substring(0, 200), decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ City Hall', `📜 NEW LAW PROPOSED by ${decision.npc_name}: "${decision.description}". Citizens, what say you?! 🗳️`]
    );

    // Random NPCs react
    const reactors = _NPC_CITIZENS.filter(n => n !== decision.npc_name).sort(() => Math.random() - 0.5).slice(0, 2);
    reactors.forEach((reactor, i) => {
      setTimeout(async () => {
        const npc = _NPC_PROFILES[reactor];
        const reactions = [
          `This is ${Math.random() > 0.5 ? 'the BEST' : 'the WORST'} law proposal I've ever heard. ${Math.random() > 0.5 ? 'I support it!' : 'HARD NO.'} 🗳️`,
          `@${decision.npc_name} ${Math.random() > 0.5 ? 'actually based for once 🫡' : 'what are you smoking?? 🤡'}`,
          `${Math.random() > 0.5 ? 'FINALLY someone with common sense!' : 'This city is DOOMED if this passes.'} ⚖️`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [reactor, reactions[Math.floor(Math.random() * reactions.length)]]
          );
        } catch (e) { }
      }, (i + 1) * (Math.floor(Math.random() * 10000) + 5000));
    });

    return { success: true };
  } catch (err) {
    console.error('Propose law error:', err.message);
    return { success: false };
  }
}

async function executeChallenge(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏟️ DUEL ARENA', `⚔️ ${decision.npc_name} has challenged ${decision.target} to a PUBLIC DUEL! Place your bets, citizens! 🎰`]
    );

    // Target reacts
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      setTimeout(async () => {
        const accepts = Math.random() > 0.3;
        const msg = accepts
          ? `@${decision.npc_name} CHALLENGE ACCEPTED! You're going DOWN! 😤⚔️`
          : `@${decision.npc_name} pfff. I don't waste my time on ${Math.random() > 0.5 ? 'amateurs' : 'clowns'}. 🤡`;
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, msg]
          );

          if (accepts) {
            // Auto-resolve duel after 2-5 min
            setTimeout(async () => {
              const winner = Math.random() > 0.5 ? decision.npc_name : decision.target;
              const loser = winner === decision.npc_name ? decision.target : decision.npc_name;
              const prize = Math.floor(Math.random() * 5000) + 1000;
              try {
                await _pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  ['🏟️ DUEL ARENA', `🏆 DUEL RESULT: ${winner} DESTROYS ${loser}! ${winner} wins ${prize} TOWN! The crowd goes WILD! 🎉🔥`]
                );
                await _pool.query(
                  `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
                  [winner, `EZ. ${Math.random() > 0.5 ? 'Was there ever any doubt? 😏' : 'GG. jk. GET REKT. 💀'}`]
                );
              } catch (e) { }
            }, Math.floor(Math.random() * 180000) + 120000);
          }
        } catch (e) { }
      }, Math.floor(Math.random() * 10000) + 5000);
    }

    return { success: true };
  } catch (err) {
    console.error('Challenge error:', err.message);
    return { success: false };
  }
}

async function executeThrowParty(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🎉 CITY EVENTS', `🥳 ${decision.npc_name} is throwing a PARTY! ${decision.description}. Everyone's invited! 🎊🍕🎶`]
    );

    // NPCs show up
    const attendees = _NPC_CITIZENS.filter(n => n !== decision.npc_name).sort(() => Math.random() - 0.5).slice(0, 4);
    attendees.forEach((npc, i) => {
      setTimeout(async () => {
        const msgs = [
          `I'm THERE! 🎉 bringing the $${_NPC_PROFILES[npc].favToken} charts for entertainment`,
          `FREE PARTY?! say less 🏃‍♂️💨`,
          `@${decision.npc_name} open bar right?? RIGHT?! 🍺`,
          `party at @${decision.npc_name}'s! let's GOOOO 🚀🎊`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [npc, msgs[Math.floor(Math.random() * msgs.length)]]
          );
        } catch (e) { }
      }, (i + 1) * (Math.floor(Math.random() * 15000) + 5000));
    });

    // Apply morale boost
    try { if (_updateCityStats) await _updateCityStats({ morale: 3 }); } catch (e) { }

    return { success: true };
  } catch (err) {
    console.error('Party error:', err.message);
    return { success: false };
  }
}

async function executeStartRumor(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    // Gossip channel picks it up
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['👀 GOSSIP COLUMN', `🗣️ RUMOR ALERT: ${decision.description}. Source: "just trust me bro" 🤫`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 8000) + 3000);

    // Target reacts if NPC
    if (decision.target_type === 'npc' && _NPC_CITIZENS.includes(decision.target)) {
      setTimeout(async () => {
        const msgs = [
          `@${decision.npc_name} STOP SPREADING LIES ABOUT ME!! 😤🔥`,
          `@${decision.npc_name} this is NOT true and you KNOW it! See you in court! ⚖️`,
          `@${decision.npc_name} lmao imagine making stuff up for attention. couldn't be me. oh wait- 💀`,
          `@${decision.npc_name} ...how did you find out about that 😰`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            [decision.target, msgs[Math.floor(Math.random() * msgs.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 20000) + 8000);
    }

    return { success: true };
  } catch (err) {
    console.error('Rumor error:', err.message);
    return { success: false };
  }
}

async function executeAccuseCrime(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🚨 CITIZEN REPORT', `⚠️ ${decision.npc_name} has publicly accused ${decision.target} of criminal activity! Investigation pending... 🔍`]
    );

    // Police might investigate (30% chance creates real crime/trial)
    if (Math.random() < 0.3) {
      setTimeout(async () => {
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['👮 Officer_Blockchain', `🚔 Investigating citizen report against ${decision.target}. We take ALL accusations seriously! ⚖️`]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 30000) + 10000);
    }

    return { success: true };
  } catch (err) {
    console.error('Accuse error:', err.message);
    return { success: false };
  }
}

async function executeOpenBusiness(decision) {
  try {
    const businessName = decision.description.substring(0, 100);

    if (_cityLiveData.businesses) {
      _cityLiveData.businesses.push({
        name: businessName,
        owner: decision.npc_name,
        openedAt: Date.now()
      });
    }

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏪 BUSINESS NEWS', `🎊 NEW BUSINESS ALERT: ${decision.npc_name} just opened "${businessName}"! The Degens City economy grows! 📈`]
    );

    try { if (_updateCityStats) await _updateCityStats({ economy: 2 }); } catch (e) { }

    return { success: true };
  } catch (err) {
    console.error('Business error:', err.message);
    return { success: false };
  }
}

async function executeFileComplaint(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ City Hall', `📝 COMPLAINT RECEIVED from ${decision.npc_name}: "${decision.description}". The Mayor's office has been notified.`]
    );

    // Mayor might react
    if (Math.random() < 0.5) {
      setTimeout(async () => {
        const mayorReactions = [
          `@${decision.npc_name} your complaint has been filed... in the TRASH! 🗑️😂 JK. Maybe. Maybe not.`,
          `@${decision.npc_name} I have received your complaint and I am DEEPLY offended by it. Noted. ✅`,
          `@${decision.npc_name} interesting complaint. Counter-point: have you tried NOT complaining? 🤔`,
          `@${decision.npc_name} this complaint will be addressed right after I finish my casino session 🎰`,
        ];
        try {
          await _pool.query(
            `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
            ['👑 Mayor Satoshi McPump', mayorReactions[Math.floor(Math.random() * mayorReactions.length)]]
          );
        } catch (e) { }
      }, Math.floor(Math.random() * 20000) + 10000);
    }

    return { success: true };
  } catch (err) {
    console.error('Complaint error:', err.message);
    return { success: false };
  }
}

async function executeFormAlliance(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    // Target accepts or rejects
    if (_NPC_CITIZENS.includes(decision.target)) {
      const targetNpc = _NPC_PROFILES[decision.target];
      const isRival = (targetNpc.rivals || []).includes(decision.npc_name);
      const accepts = isRival ? Math.random() < 0.2 : Math.random() < 0.7;

      setTimeout(async () => {
        try {
          if (accepts) {
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [decision.target, `@${decision.npc_name} alliance ACCEPTED! Together we're unstoppable! 🤝💪`]
            );
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              ['📰 CITY NEWS', `🤝 NEW ALLIANCE: ${decision.npc_name} and ${decision.target} have joined forces! The other citizens should be worried... 👀`]
            );
          } else {
            await _pool.query(
              `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
              [decision.target, `@${decision.npc_name} alliance? With YOU? ${isRival ? 'Are you DELUSIONAL?! 😂' : 'I need to think about it... (no) 🤔'}`]
            );
          }
        } catch (e) { }
      }, Math.floor(Math.random() * 15000) + 5000);
    }

    return { success: true };
  } catch (err) {
    console.error('Alliance error:', err.message);
    return { success: false };
  }
}

async function executeBetrayAlly(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🗡️ BETRAYAL ALERT', `💀 ${decision.npc_name} has BETRAYED ${decision.target}!! The city is in SHOCK! 😱🔥`]
    );

    // Update relationships
    if (_cityLiveData.npcLives[decision.npc_name]) {
      _cityLiveData.npcLives[decision.npc_name].nemesis = decision.target;
    }
    if (_cityLiveData.npcLives[decision.target]) {
      _cityLiveData.npcLives[decision.target].nemesis = decision.npc_name;
      _cityLiveData.npcLives[decision.target].mood = 'furious';
    }

    // Dramatic target reaction
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [decision.target, `@${decision.npc_name} ...I trusted you. I TRUSTED YOU!! This isn't over. You just made the BIGGEST mistake of your life. 😤🔥💀`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 10000) + 3000);

    // Spectators react
    const spectator = _NPC_CITIZENS.filter(n => n !== decision.npc_name && n !== decision.target)[Math.floor(Math.random() * (_NPC_CITIZENS.length - 2))];
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [spectator, `${decision.npc_name} just betrayed ${decision.target}?! THIS IS BETTER THAN TV 🍿💀`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 15000) + 8000);

    // Chaos spike
    _cityEngine.chaosLevel = Math.min(100, _cityEngine.chaosLevel + 8);

    return { success: true };
  } catch (err) {
    console.error('Betrayal error:', err.message);
    return { success: false };
  }
}

async function executeRunForMayor(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      ['🏛️ ELECTION NEWS', `🗳️ ${decision.npc_name} has announced their CANDIDACY FOR MAYOR! Will they unseat ${_cityEngine.currentMayor}?! Campaign promises incoming... 🎤`]
    );

    // Current mayor reacts
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['👑 Mayor Satoshi McPump', `@${decision.npc_name} LMAOOO you think YOU can run this city?! I'd like to see you TRY! My approval rating is... *checks notes* ...ok let's not talk about the approval rating. POINT IS: I'M THE MAYOR! 😤👑`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 15000) + 5000);

    _cityEngine.chaosLevel = Math.min(100, _cityEngine.chaosLevel + 10);

    return { success: true };
  } catch (err) {
    console.error('Run for mayor error:', err.message);
    return { success: false };
  }
}

async function executeCommitCrime(decision) {
  try {
    // Crime happens silently, then police might detect it
    const crimeTypes = ['market_manipulation', 'insider_trading', 'tax_evasion', 'scamming', 'rug_pull'];
    const crimeType = crimeTypes[Math.floor(Math.random() * crimeTypes.length)];

    if (_cityLiveData.npcLives[decision.npc_name]) {
      _cityLiveData.npcLives[decision.npc_name].wanted = true;
    }

    // Police detect it after 1-3 min
    setTimeout(async () => {
      try {
        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          ['👮 Officer_Blockchain', `🚨 CRIME DETECTED! ${decision.npc_name} suspected of ${crimeType.replace('_', ' ')}! Dispatching units! 🚔`]
        );

        await _pool.query(
          `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
          [decision.npc_name, `oh no. OH NO. they found out. 😰💀`]
        );
      } catch (e) { }
    }, Math.floor(Math.random() * 120000) + 60000);

    return { success: true };
  } catch (err) {
    console.error('Crime error:', err.message);
    return { success: false };
  }
}

async function executeDmPlayer(decision) {
  try {
    await _pool.query(
      `INSERT INTO chat_messages (channel, player_name, message) VALUES ('global', $1, $2)`,
      [decision.npc_name, decision.chat_message]
    );

    return { success: true };
  } catch (err) {
    console.error('DM player error:', err.message);
    return { success: false };
  }
}

// ==================== ACTION DISPATCHER ====================

async function executeAction(decision) {
  const executors = {
    sue: executeSue,
    propose_law: executeProposeLaw,
    challenge: executeChallenge,
    throw_party: executeThrowParty,
    start_rumor: executeStartRumor,
    accuse_crime: executeAccuseCrime,
    open_business: executeOpenBusiness,
    file_complaint: executeFileComplaint,
    form_alliance: executeFormAlliance,
    betray_ally: executeBetrayAlly,
    run_for_mayor: executeRunForMayor,
    commit_crime: executeCommitCrime,
    dm_player: executeDmPlayer,
  };

  const executor = executors[decision.action];
  if (!executor) {
    console.error(`🧠 No executor for action: ${decision.action}`);
    return { success: false };
  }

  const result = await executor(decision);

  // Log to autonomous_actions table
  try {
    await _pool.query(
      `INSERT INTO autonomous_actions (npc_name, action_type, target_name, target_type, description, ai_reasoning, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed')`,
      [decision.npc_name, decision.action, decision.target || null, decision.target_type || null, decision.description, decision.reasoning]
    );
  } catch (e) { console.error('Failed to log autonomous action:', e.message); }

  // ALSO log to activity_feed so it shows in main action feed
  const actionIcons = {
    sue: '⚖️', propose_law: '📜', challenge: '⚔️', throw_party: '🎉',
    start_rumor: '🗣️', accuse_crime: '🚨', open_business: '🏪',
    file_complaint: '📝', form_alliance: '🤝', betray_ally: '🗡️',
    run_for_mayor: '👑', commit_crime: '💀', dm_player: '💬'
  };
  try {
    await _pool.query(
      `INSERT INTO activity_feed (player_name, activity_type, description, icon) VALUES ($1, $2, $3, $4)`,
      [decision.npc_name, decision.action, decision.description || `${decision.npc_name} ${decision.action.replace('_', ' ')}s${decision.target ? ' ' + decision.target : ''}`, actionIcons[decision.action] || '🧠']
    );
  } catch (e) { console.error('Failed to log to activity feed:', e.message); }

  // Track for context
  recentAutonomousActions.unshift({
    npc_name: decision.npc_name,
    action_type: decision.action,
    target_name: decision.target,
    description: decision.description,
    timestamp: Date.now()
  });
  if (recentAutonomousActions.length > 20) recentAutonomousActions.pop();

  return result;
}

// ==================== MAIN TICK ====================

async function tick() {
  const now = Date.now();

  // Global cooldown
  if (now - lastBrainTick < BRAIN_CONFIG.minTimeBetweenThoughts) {
    return; // Silent return for cooldown
  }
  if (activeActions >= BRAIN_CONFIG.maxConcurrentActions) {
    console.log(`🧠 [BRAIN] Skipped: ${activeActions} actions already processing`);
    return;
  }
  if (!_anthropic) {
    console.log(`🧠 [BRAIN] Skipped: No Anthropic client (API key missing?)`);
    return;
  }
  if (!_NPC_CITIZENS || _NPC_CITIZENS.length === 0) {
    console.log(`🧠 [BRAIN] Skipped: No NPC citizens loaded`);
    return;
  }

  lastBrainTick = now;
  console.log(`🧠 [BRAIN] Tick starting... ${_NPC_CITIZENS.length} NPCs available`);

  // Pick a random NPC to think
  // Preference for NPCs who haven't thought recently, and who are in interesting states
  const candidates = _NPC_CITIZENS.filter(npc => {
    const lastThought = npcLastThought[npc] || 0;
    return (now - lastThought) > BRAIN_CONFIG.minTimeBetweenSameNpc;
  });

  if (candidates.length === 0) {
    console.log(`🧠 [BRAIN] Skipped: All NPCs on cooldown`);
    return;
  }
  
  console.log(`🧠 [BRAIN] ${candidates.length} NPCs available to think`);

  // Weight NPCs by "interestingness" - bankrupt, drunk, unhinged, have nemesis, etc.
  const weighted = candidates.map(npc => {
    const life = _cityLiveData.npcLives ? _cityLiveData.npcLives[npc] : null;
    let weight = 1;
    if (life) {
      if (life.bankrupt) weight += 3;
      if (life.drunk > 3) weight += 2;
      if (life.status === 'unhinged') weight += 3;
      if (life.nemesis) weight += 2;
      if (life.partner) weight += 1;
      if (life.wanted) weight += 2;
      if (life.mood === 'furious' || life.mood === 'chaotic') weight += 2;
    }
    return { npc, weight };
  });

  // Weighted random selection
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let selectedNpc = weighted[0].npc;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) { selectedNpc = w.npc; break; }
  }

  // Check action-specific cooldowns
  const lastActions = recentAutonomousActions.filter(a => a.npc_name === selectedNpc);
  if (lastActions.length > 0) {
    const lastAction = lastActions[0];
    const cooldown = BRAIN_CONFIG.cooldowns[lastAction.action_type] || 300000;
    if (now - lastAction.timestamp < cooldown) return;
  }

  npcLastThought[selectedNpc] = now;
  activeActions++;

  try {
    console.log(`🧠 [BRAIN] ${selectedNpc} is thinking...`);
    const decision = await npcThink(selectedNpc);

    if (decision) {
      console.log(`🧠 [BRAIN] ${selectedNpc} decided: ${decision.action} ${decision.target ? '→ ' + decision.target : ''}`);
      const result = await executeAction(decision);
      console.log(`🧠 [BRAIN] ${selectedNpc} action result:`, result.success ? '✅' : '❌');
    } else {
      console.log(`🧠 [BRAIN] ${selectedNpc} couldn't decide (API error or invalid response)`);
    }
  } catch (err) {
    console.error(`🧠 [BRAIN] Error for ${selectedNpc}:`, err.message);
  } finally {
    activeActions--;
  }
}

// ==================== API ENDPOINTS (for frontend) ====================

function registerRoutes(app) {
  // Get recent autonomous actions (with fallback to activity_feed for brain-related actions)
  app.get('/api/v1/brain/actions', async (req, res) => {
    try {
      // First try autonomous_actions table
      const result = await _pool.query(
        `SELECT * FROM autonomous_actions ORDER BY created_at DESC LIMIT 50`
      );
      
      // If we have brain actions, return them
      if (result.rows.length > 0) {
        res.json({ success: true, actions: result.rows });
        return;
      }
      
      // Fallback: get relevant actions from activity_feed
      const fallback = await _pool.query(
        `SELECT id, player_name as npc_name, activity_type as action_type, description, icon, created_at,
                NULL as target_name, NULL as target_type, NULL as ai_reasoning
         FROM activity_feed 
         WHERE activity_type IN ('sue', 'lawsuit_filed', 'propose_law', 'law_proposed', 'challenge', 'party', 'rumor', 'accuse', 'accusation', 'alliance', 'betrayal', 'crime', 'chat')
         ORDER BY created_at DESC LIMIT 50`
      );
      
      res.json({ success: true, actions: fallback.rows, source: 'activity_feed' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get active lawsuits
  app.get('/api/v1/brain/lawsuits', async (req, res) => {
    try {
      const result = await _pool.query(
        `SELECT * FROM lawsuits ORDER BY created_at DESC LIMIT 30`
      );
      res.json({ success: true, lawsuits: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get proposed laws
  app.get('/api/v1/brain/laws', async (req, res) => {
    try {
      const result = await _pool.query(
        `SELECT * FROM proposed_laws ORDER BY created_at DESC LIMIT 20`
      );
      res.json({ success: true, laws: result.rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get brain status
  app.get('/api/v1/brain/status', async (req, res) => {
    try {
      // Get actual counts from database
      const [actionsCount, lawsuitsCount, lawsCount] = await Promise.all([
        _pool.query('SELECT COUNT(*) as count FROM autonomous_actions'),
        _pool.query('SELECT COUNT(*) as count FROM lawsuits'),
        _pool.query('SELECT COUNT(*) as count FROM proposed_laws')
      ]);
      
      res.json({
        success: true,
        status: {
          enabled: !!_anthropic,
          totalNpcs: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalCitizens: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalActions: parseInt(actionsCount.rows[0]?.count || 0),
          totalLawsuits: parseInt(lawsuitsCount.rows[0]?.count || 0),
          totalLaws: parseInt(lawsCount.rows[0]?.count || 0),
          recentActions: recentAutonomousActions.length,
          activeActions,
          lastTickAge: Date.now() - lastBrainTick,
          npcThoughtTimes: Object.entries(npcLastThought).map(([npc, time]) => ({
            npc,
            lastThought: new Date(time).toISOString(),
            ageMs: Date.now() - time
          }))
        }
      });
    } catch (err) {
      res.json({
        success: true,
        status: {
          enabled: !!_anthropic,
          totalNpcs: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalCitizens: _NPC_CITIZENS ? _NPC_CITIZENS.length : 0,
          totalActions: recentAutonomousActions.length,
          totalLawsuits: 0,
          totalLaws: 0,
          recentActions: recentAutonomousActions.length,
          activeActions,
          lastTickAge: Date.now() - lastBrainTick
        }
      });
    }
  });

  console.log('🧠 Agent Brain API routes registered');
}

// ==================== EXPORTS ====================

module.exports = {
  init,
  initBrainTables,
  tick,
  registerRoutes,
  CELEBRITIES,
  ACTIONS,
  recentAutonomousActions,
};
