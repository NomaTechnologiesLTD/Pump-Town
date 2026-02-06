// ============================================================================
// economy-system.js — AI Agent Economy System
// Degens City - NPC businesses, investments, economic simulation
// ============================================================================

let _pool = null;
let _anthropic = null;
let _NPC_PROFILES = null;
let _NPC_CITIZENS = null;
let _getCityStats = null;
let _updateCityStats = null;
let _cityLiveData = null;
let _reputation = null;

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ==================== BUSINESS TYPES ====================

const BUSINESS_TYPES = {
  casino: { emoji: '🎰', label: 'Casino', baseIncome: 800, risk: 0.3, vibe: 'high-risk, high-reward', effects: { economy: 2, security: -1 } },
  exchange: { emoji: '📊', label: 'Exchange', baseIncome: 600, risk: 0.2, vibe: 'volume is king', effects: { economy: 3 } },
  bar: { emoji: '🍺', label: 'Bar/Club', baseIncome: 400, risk: 0.1, vibe: 'everyone needs a drink', effects: { morale: 2, culture: 1 } },
  info_broker: { emoji: '🕵️', label: 'Info Broker', baseIncome: 500, risk: 0.15, vibe: 'secrets for sale', effects: { security: -1, culture: 1 } },
  nft_gallery: { emoji: '🖼️', label: 'NFT Gallery', baseIncome: 350, risk: 0.25, vibe: 'art or money laundering?', effects: { culture: 3 } },
  degen_gym: { emoji: '💪', label: 'Degen Gym', baseIncome: 300, risk: 0.05, vibe: 'pump iron and tokens', effects: { morale: 2 } },
  news_outlet: { emoji: '📰', label: 'News Outlet', baseIncome: 250, risk: 0.1, vibe: 'truth is optional', effects: { culture: 2 } },
  protection: { emoji: '🛡️', label: 'Protection Racket', baseIncome: 700, risk: 0.35, vibe: 'nice business you got there...', effects: { security: 1, morale: -1 } },
  token_launchpad: { emoji: '🚀', label: 'Token Launchpad', baseIncome: 1000, risk: 0.4, vibe: 'wen moon?', effects: { economy: 3, security: -2 } },
  food_cart: { emoji: '🌮', label: 'Food Cart', baseIncome: 200, risk: 0.05, vibe: 'cheap eats, good vibes', effects: { morale: 1 } },
  pawn_shop: { emoji: '🏪', label: 'Pawn Shop', baseIncome: 350, risk: 0.1, vibe: 'one man\'s trash...', effects: { economy: 1 } },
  underground_lab: { emoji: '🧪', label: 'Underground Lab', baseIncome: 900, risk: 0.45, vibe: 'don\'t ask questions', effects: { economy: 2, security: -3 } },
};

// ==================== DATABASE SETUP ====================

async function initEconomyTables(pool) {
  const p = pool || _pool;
  if (!p) return;
  try {
    // NPC Businesses
    await p.query(`
      CREATE TABLE IF NOT EXISTS npc_businesses (
        id SERIAL PRIMARY KEY,
        business_id VARCHAR(60) UNIQUE NOT NULL,
        owner_name VARCHAR(100) NOT NULL,
        name VARCHAR(200) NOT NULL,
        business_type VARCHAR(30) NOT NULL,
        location VARCHAR(100),
        description TEXT,
        level INTEGER DEFAULT 1,
        revenue INTEGER DEFAULT 0,
        expenses INTEGER DEFAULT 0,
        profit INTEGER DEFAULT 0,
        reputation INTEGER DEFAULT 50,
        customers INTEGER DEFAULT 0,
        employees JSONB DEFAULT '[]',
        upgrades JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'open',
        invested_by JSONB DEFAULT '{}',
        events_log JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Player investments in businesses
    await p.query(`
      CREATE TABLE IF NOT EXISTS business_investments (
        id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL,
        business_id VARCHAR(60) NOT NULL,
        amount INTEGER NOT NULL,
        share_pct DECIMAL(5,2) DEFAULT 0,
        returns_collected INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_name, business_id)
      )
    `);

    // Economic events log
    await p.query(`
      CREATE TABLE IF NOT EXISTS economy_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(30) NOT NULL,
        actor VARCHAR(100),
        target VARCHAR(100),
        amount INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await p.query(`CREATE INDEX IF NOT EXISTS idx_biz_owner ON npc_businesses(owner_name)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_biz_status ON npc_businesses(status)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_invest_player ON business_investments(player_name)`);

    console.log('💰 Economy tables initialized');
  } catch (err) {
    console.error('Economy tables error:', err.message);
  }
}

// ==================== INITIALIZATION ====================

function init(pool, anthropic, NPC_PROFILES, NPC_CITIZENS, getCityStats, updateCityStats, cityLiveData, reputation) {
  _pool = pool;
  _anthropic = anthropic;
  _NPC_PROFILES = NPC_PROFILES;
  _NPC_CITIZENS = NPC_CITIZENS;
  _getCityStats = getCityStats;
  _updateCityStats = updateCityStats;
  _cityLiveData = cityLiveData;
  _reputation = reputation;
  console.log('💰 Economy System initialized');
}

// ==================== BUSINESS CREATION ====================

async function createBusiness(ownerName, businessType, customName) {
  try {
    const bType = BUSINESS_TYPES[businessType];
    if (!bType) return { error: 'invalid_type' };

    // Check owner doesn't have too many businesses
    const existing = await _pool.query(
      `SELECT COUNT(*) FROM npc_businesses WHERE owner_name = $1 AND status = 'open'`, [ownerName]
    );
    if (parseInt(existing.rows[0].count) >= 3) return { error: 'max_businesses', message: 'Already owns 3 businesses' };

    const npc = _NPC_PROFILES ? _NPC_PROFILES[ownerName] : null;
    const businessId = `biz_${ownerName}_${businessType}_${Date.now()}`;
    const locations = ['Downtown', 'DeFi District', 'Casino Strip', 'Moon Quarter', 'Whale Bay', 'Degen Alley', 'Town Square'];
    const location = pick(locations);

    const name = customName || `${(ownerName || '').replace(/_/g, ' ')}'s ${bType.label}`;

    await _pool.query(`
      INSERT INTO npc_businesses (business_id, owner_name, name, business_type, location, description, level, status)
      VALUES ($1, $2, $3, $4, $5, $6, 1, 'open')
    `, [businessId, ownerName, name, businessType, location, `A ${bType.vibe} establishment in ${location}.`]);

    // Log event
    await _pool.query(`INSERT INTO economy_events (event_type, actor, amount, description) VALUES ($1,$2,$3,$4)`,
      ['business_opened', ownerName, 0, `Opened "${name}" (${bType.label}) in ${location}`]);

    console.log(`💰 Business opened: "${name}" by ${ownerName} in ${location}`);

    return {
      success: true,
      business_id: businessId,
      name, type: businessType, location,
      emoji: bType.emoji, label: bType.label
    };
  } catch (err) {
    console.error('Create business error:', err.message);
    return { error: 'server_error' };
  }
}

// ==================== ECONOMIC TICK ====================
// Called periodically to simulate economy

async function economicTick() {
  if (!_pool) return;
  try {
    const businesses = await _pool.query(`SELECT * FROM npc_businesses WHERE status = 'open'`);
    const cityStats = _getCityStats ? await _getCityStats() : { economy: 50 };
    const economyMultiplier = (cityStats.economy || 50) / 50; // 0-2x based on city economy

    for (const biz of businesses.rows) {
      const bType = BUSINESS_TYPES[biz.business_type];
      if (!bType) continue;

      // Calculate revenue (base * level * economy * randomness)
      const baseRev = bType.baseIncome * biz.level * economyMultiplier;
      const revenue = Math.floor(baseRev * (0.6 + Math.random() * 0.8));
      const expenses = Math.floor(baseRev * 0.3 * (0.8 + Math.random() * 0.4));
      const profit = revenue - expenses;

      // Risk events
      let statusChange = null;
      if (Math.random() < bType.risk * 0.1) {
        // Bad event
        const events = [
          { type: 'raid', msg: 'Police raided the business!', profitMod: -500 },
          { type: 'robbery', msg: 'Got robbed!', profitMod: -300 },
          { type: 'scandal', msg: 'Scandal hit the business!', profitMod: -200 },
          { type: 'competition', msg: 'New competitor appeared!', profitMod: -150 },
        ];
        const event = pick(events);
        statusChange = event;
      } else if (Math.random() < 0.08) {
        // Good event
        const events = [
          { type: 'viral', msg: 'Went viral! Business booming!', profitMod: 500 },
          { type: 'whale_visit', msg: 'A whale visited and spent big!', profitMod: 800 },
          { type: 'endorsement', msg: 'Got endorsed by the Mayor!', profitMod: 300 },
        ];
        statusChange = pick(events);
      }

      const finalProfit = profit + (statusChange ? statusChange.profitMod : 0);
      const newCustomers = rand(5, 30) * biz.level;

      // Update business
      await _pool.query(`
        UPDATE npc_businesses SET 
          revenue = revenue + $1, expenses = expenses + $2, profit = profit + $3,
          customers = customers + $4, updated_at = NOW()
        WHERE business_id = $5
      `, [revenue, expenses, finalProfit, newCustomers, biz.business_id]);

      // Update NPC wealth
      if (_cityLiveData && _cityLiveData.npcLives && _cityLiveData.npcLives[biz.owner_name]) {
        _cityLiveData.npcLives[biz.owner_name].wealth = Math.max(0,
          (_cityLiveData.npcLives[biz.owner_name].wealth || 0) + finalProfit
        );
      }

      // Pay investors
      const investments = await _pool.query(
        `SELECT * FROM business_investments WHERE business_id = $1 AND status = 'active'`, [biz.business_id]
      );
      for (const inv of investments.rows) {
        const payout = Math.max(0, Math.floor(finalProfit * (parseFloat(inv.share_pct) / 100)));
        if (payout > 0) {
          await _pool.query(
            `UPDATE business_investments SET returns_collected = returns_collected + $1 WHERE id = $2`,
            [payout, inv.id]
          );
        }
      }

      // Bankrupt check
      if (biz.profit + finalProfit < -5000) {
        await _pool.query(`UPDATE npc_businesses SET status = 'bankrupt' WHERE business_id = $1`, [biz.business_id]);
        await _pool.query(`INSERT INTO economy_events (event_type, actor, description) VALUES ($1,$2,$3)`,
          ['bankruptcy', biz.owner_name, `"${biz.name}" went bankrupt!`]);
        await _pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`,
          ['💸 BUSINESS NEWS', `💀 ${biz.name} (owned by ${biz.owner_name.replace(/_/g, ' ')}) has gone BANKRUPT! Another one bites the dust... 📉`]);
      }

      // Business levels up
      if (biz.customers + newCustomers > biz.level * 500 && biz.level < 5) {
        await _pool.query(`UPDATE npc_businesses SET level = level + 1 WHERE business_id = $1`, [biz.business_id]);
        await _pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`,
          ['📈 BUSINESS NEWS', `🎉 ${biz.name} just leveled up to Level ${biz.level + 1}! Business is BOOMING! 🚀`]);
      }
    }
  } catch (err) {
    console.error('Economic tick error:', err.message);
  }
}

// ==================== PLAYER INVESTMENTS ====================

async function investInBusiness(playerName, businessId, amount) {
  try {
    if (!amount || amount < 100) return { error: 'min_investment', message: 'Minimum investment is 100 USD' };
    if (amount > 10000) return { error: 'max_investment', message: 'Maximum investment is 10,000 USD per business' };

    const biz = await _pool.query(`SELECT * FROM npc_businesses WHERE business_id = $1 AND status = 'open'`, [businessId]);
    if (biz.rows.length === 0) return { error: 'not_found', message: 'Business not found or closed' };

    const business = biz.rows[0];
    
    // Calculate share percentage (capped at 25% per investor)
    const totalInvested = Object.values(typeof business.invested_by === 'string' ? JSON.parse(business.invested_by) : (business.invested_by || {}))
      .reduce((a, b) => a + b, 0);
    const sharePct = Math.min(25, (amount / (totalInvested + amount + 5000)) * 100);

    await _pool.query(`
      INSERT INTO business_investments (player_name, business_id, amount, share_pct, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (player_name, business_id) DO UPDATE SET 
        amount = business_investments.amount + $3,
        share_pct = LEAST(25, business_investments.share_pct + $4)
    `, [playerName, businessId, amount, sharePct]);

    // Update business invested_by
    const investedBy = typeof business.invested_by === 'string' ? JSON.parse(business.invested_by) : (business.invested_by || {});
    investedBy[playerName] = (investedBy[playerName] || 0) + amount;
    await _pool.query(`UPDATE npc_businesses SET invested_by = $1 WHERE business_id = $2`,
      [JSON.stringify(investedBy), businessId]);

    // Rep boost with owner
    if (_reputation) {
      await _reputation.trackEvent(playerName, business.owner_name, 'business_investment', rand(3, 8),
        `Invested ${amount} USD in "${business.name}". Smart money.`, 'economy');
    }

    await _pool.query(`INSERT INTO economy_events (event_type, actor, target, amount, description) VALUES ($1,$2,$3,$4,$5)`,
      ['investment', playerName, business.owner_name, amount, `Invested ${amount} USD in "${business.name}"`]);

    return {
      success: true,
      business_name: business.name,
      amount,
      share_pct: sharePct,
      owner: business.owner_name
    };
  } catch (err) {
    console.error('Invest error:', err.message);
    return { error: 'server_error' };
  }
}

// ==================== QUERY HELPERS ====================

async function getAllBusinesses() {
  try {
    const result = await _pool.query(`
      SELECT b.*, 
        (SELECT COUNT(*) FROM business_investments WHERE business_id = b.business_id AND status = 'active') as investor_count
      FROM npc_businesses b 
      WHERE status IN ('open', 'bankrupt')
      ORDER BY b.profit DESC
    `);
    return result.rows.map(b => ({
      ...b,
      type_info: BUSINESS_TYPES[b.business_type] || {},
      invested_by: typeof b.invested_by === 'string' ? JSON.parse(b.invested_by) : (b.invested_by || {}),
    }));
  } catch (err) {
    console.error('Get businesses error:', err.message);
    return [];
  }
}

async function getPlayerInvestments(playerName) {
  try {
    const result = await _pool.query(`
      SELECT bi.*, b.name as business_name, b.business_type, b.owner_name, b.status as biz_status, b.profit as biz_profit, b.level as biz_level
      FROM business_investments bi
      JOIN npc_businesses b ON bi.business_id = b.business_id
      WHERE bi.player_name = $1
      ORDER BY bi.created_at DESC
    `, [playerName]);
    return result.rows;
  } catch (err) {
    console.error('Get investments error:', err.message);
    return [];
  }
}

async function getEconomyStats() {
  try {
    const result = await _pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as active_businesses,
        COUNT(*) FILTER (WHERE status = 'bankrupt') as bankrupt_businesses,
        SUM(CASE WHEN status = 'open' THEN revenue ELSE 0 END) as total_revenue,
        SUM(CASE WHEN status = 'open' THEN profit ELSE 0 END) as total_profit,
        SUM(CASE WHEN status = 'open' THEN customers ELSE 0 END) as total_customers,
        COUNT(DISTINCT owner_name) as business_owners
      FROM npc_businesses
    `);

    const topBiz = await _pool.query(`
      SELECT name, owner_name, business_type, profit, level, customers
      FROM npc_businesses WHERE status = 'open' ORDER BY profit DESC LIMIT 5
    `);

    const recentEvents = await _pool.query(`
      SELECT * FROM economy_events ORDER BY created_at DESC LIMIT 10
    `);

    return {
      ...result.rows[0],
      top_businesses: topBiz.rows,
      recent_events: recentEvents.rows
    };
  } catch (err) {
    console.error('Economy stats error:', err.message);
    return {};
  }
}

// ==================== AUTO-GENERATION ====================
// NPCs autonomously open businesses based on personality

async function autoGenerateBusinesses() {
  if (!_NPC_CITIZENS || !_pool) return;
  
  try {
    // Check how many businesses exist
    const count = await _pool.query(`SELECT COUNT(*) FROM npc_businesses WHERE status = 'open'`);
    const existing = parseInt(count.rows[0].count);
    
    // Want at least 8-12 businesses active
    if (existing >= 12) return;
    
    // Pick an NPC who doesn't have a business yet
    const owners = await _pool.query(`SELECT DISTINCT owner_name FROM npc_businesses WHERE status = 'open'`);
    const existingOwners = new Set(owners.rows.map(r => r.owner_name));
    const available = _NPC_CITIZENS.filter(n => !existingOwners.has(n));
    
    if (available.length === 0) return;
    
    const npcName = pick(available);
    const npc = _NPC_PROFILES ? _NPC_PROFILES[npcName] : null;
    
    // Pick business type based on NPC archetype
    const archetypePrefs = {
      alpha: ['exchange', 'info_broker', 'token_launchpad'],
      whale: ['casino', 'exchange', 'protection'],
      bear: ['pawn_shop', 'info_broker', 'bar'],
      meme: ['nft_gallery', 'food_cart', 'news_outlet'],
      holder: ['exchange', 'degen_gym', 'bar'],
      degen: ['casino', 'token_launchpad', 'underground_lab'],
      fomo: ['token_launchpad', 'exchange', 'casino'],
      cope: ['bar', 'food_cart', 'pawn_shop'],
      hype: ['nft_gallery', 'news_outlet', 'degen_gym'],
      victim: ['pawn_shop', 'food_cart', 'bar'],
      og: ['bar', 'info_broker', 'protection'],
    };
    
    const archetype = npc ? npc.archetype : 'degen';
    const prefs = archetypePrefs[archetype] || Object.keys(BUSINESS_TYPES);
    const businessType = pick(prefs);
    const bType = BUSINESS_TYPES[businessType];
    
    const funNames = [
      `${npcName.replace(/_/g, ' ')}'s ${bType.label}`,
      `The ${pick(['Golden', 'Diamond', 'Degen', 'Moon', 'Ape', 'Based', 'Rekt', 'Whale'])} ${bType.label}`,
      `${pick(['Wen', 'Ultra', 'Mega', 'Chad', 'Sigma'])} ${bType.label}`,
    ];

    const result = await createBusiness(npcName, businessType, pick(funNames));
    
    if (result.success) {
      await _pool.query(`INSERT INTO chat_messages (channel, player_name, message) VALUES ('global',$1,$2)`,
        [npcName, `Just opened "${result.name}" in ${result.location}! Come through, first round's on me! ${bType.emoji}🎊`]);
    }
  } catch (err) {
    console.error('Auto generate business error:', err.message);
  }
}

// ==================== API ROUTES ====================

function registerRoutes(app) {
  // Get all businesses
  app.get('/api/v1/economy/businesses', async (req, res) => {
    try {
      const businesses = await getAllBusinesses();
      res.json({ success: true, businesses });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get economy stats
  app.get('/api/v1/economy/stats', async (req, res) => {
    try {
      const stats = await getEconomyStats();
      res.json({ success: true, stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get player investments
  app.get('/api/v1/economy/investments/:playerName', async (req, res) => {
    try {
      const investments = await getPlayerInvestments(req.params.playerName);
      res.json({ success: true, investments });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Invest in a business
  app.post('/api/v1/economy/invest', async (req, res) => {
    try {
      const { playerName, businessId, amount } = req.body;
      if (!playerName || !businessId || !amount) return res.status(400).json({ success: false, error: 'Missing params' });
      const result = await investInBusiness(playerName, businessId, parseInt(amount));
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('💰 Economy routes registered');
}

// ==================== EXPORTS ====================

module.exports = {
  initEconomyTables,
  init,
  registerRoutes,
  createBusiness,
  economicTick,
  investInBusiness,
  getAllBusinesses,
  getPlayerInvestments,
  getEconomyStats,
  autoGenerateBusinesses,
  BUSINESS_TYPES
};
