// ====================================================
// achievements.js — Achievements, battle pass, NFTs, seasonal
// Degens City - Auto-extracted from index.html
// ====================================================

function AchievementSection({ playerStats, character, resources }) {
    const [selectedCategory, setSelectedCategory] = useState('all');
    
    // Get actual resource values
    const hopium = resources?.hopium || 0;
    const alpha = resources?.alpha || 0;
    const maxHopiumEver = playerStats?.maxHopiumEver || hopium;
    const largestTrade = playerStats?.largestTrade || 0;
    const totalTrades = playerStats?.totalTrades || 0;
    const loginStreak = character?.consecutiveDays || playerStats?.loginStreak || 0;
    
    const achievements = [
        // Participation
        { id: 'first_login', name: 'Fresh Meat', icon: '🆕', desc: 'Join Degens City', tier: 'bronze', category: 'participation', progress: 1, max: 1, unlocked: true },
        { id: 'play_10', name: 'Getting Started', icon: '🎮', desc: 'Play 10 games', tier: 'bronze', category: 'participation', progress: playerStats.totalGamesPlayed || 0, max: 10, unlocked: (playerStats.totalGamesPlayed || 0) >= 10 },
        { id: 'play_50', name: 'Regular', icon: '🎮', desc: 'Play 50 games', tier: 'silver', category: 'participation', progress: playerStats.totalGamesPlayed || 0, max: 50, unlocked: (playerStats.totalGamesPlayed || 0) >= 50 },
        { id: 'play_200', name: 'Addicted', icon: '🎮', desc: 'Play 200 games', tier: 'gold', category: 'participation', progress: playerStats.totalGamesPlayed || 0, max: 200, unlocked: (playerStats.totalGamesPlayed || 0) >= 200 },
        
        // Level
        { id: 'level_5', name: 'Novice', icon: '⭐', desc: 'Reach level 5', tier: 'bronze', category: 'level', progress: playerStats.level, max: 5, unlocked: playerStats.level >= 5 },
        { id: 'level_15', name: 'Experienced', icon: '⭐', desc: 'Reach level 15', tier: 'silver', category: 'level', progress: playerStats.level, max: 15, unlocked: playerStats.level >= 15 },
        { id: 'level_30', name: 'Veteran', icon: '⭐', desc: 'Reach level 30', tier: 'gold', category: 'level', progress: playerStats.level, max: 30, unlocked: playerStats.level >= 30 },
        
        // Governance
        { id: 'vote_5', name: 'Civic Duty', icon: '🗳️', desc: 'Cast 5 votes', tier: 'bronze', category: 'governance', progress: character?.votesCount || 0, max: 5, unlocked: (character?.votesCount || 0) >= 5 },
        { id: 'vote_25', name: 'Active Voter', icon: '🗳️', desc: 'Cast 25 votes', tier: 'silver', category: 'governance', progress: character?.votesCount || 0, max: 25, unlocked: (character?.votesCount || 0) >= 25 },
        { id: 'vote_100', name: 'Democracy Champion', icon: '🗳️', desc: 'Cast 100 votes', tier: 'gold', category: 'governance', progress: character?.votesCount || 0, max: 100, unlocked: (character?.votesCount || 0) >= 100 },
        
        // Wealth - Now using actual resource values
        { id: 'hopium_1k', name: 'Hopeful', icon: '💊', desc: 'Own 1,000 HOPIUM', tier: 'bronze', category: 'wealth', progress: Math.min(hopium, 1000), max: 1000, unlocked: hopium >= 1000 || maxHopiumEver >= 1000 },
        { id: 'hopium_10k', name: 'Hopium Dealer', icon: '💊', desc: 'Own 10,000 HOPIUM', tier: 'silver', category: 'wealth', progress: Math.min(hopium, 10000), max: 10000, unlocked: hopium >= 10000 || maxHopiumEver >= 10000 },
        { id: 'hopium_100k', name: 'Hopium Lord', icon: '💊', desc: 'Own 100,000 HOPIUM', tier: 'gold', category: 'wealth', progress: Math.min(hopium, 100000), max: 100000, unlocked: hopium >= 100000 || maxHopiumEver >= 100000 },
        { id: 'alpha_1k', name: 'Alpha Hunter', icon: '🔮', desc: 'Own 1,000 ALPHA', tier: 'silver', category: 'wealth', progress: Math.min(alpha, 1000), max: 1000, unlocked: alpha >= 1000 },
        
        // Trading
        { id: 'trade_10', name: 'Trader', icon: '📊', desc: 'Complete 10 trades', tier: 'bronze', category: 'trading', progress: totalTrades, max: 10, unlocked: totalTrades >= 10 },
        { id: 'trade_50', name: 'Day Trader', icon: '📊', desc: 'Complete 50 trades', tier: 'silver', category: 'trading', progress: totalTrades, max: 50, unlocked: totalTrades >= 50 },
        { id: 'whale_trade', name: 'Whale Move', icon: '🐋', desc: 'Make a 10,000+ HOPIUM trade', tier: 'gold', category: 'trading', progress: largestTrade >= 10000 ? 1 : 0, max: 1, unlocked: largestTrade >= 10000 },
        
        // Special
        { id: 'streak_7', name: 'Dedicated', icon: '🔥', desc: '7-day login streak', tier: 'silver', category: 'special', progress: loginStreak, max: 7, unlocked: loginStreak >= 7 },
        { id: 'streak_30', name: 'Committed', icon: '🔥', desc: '30-day login streak', tier: 'gold', category: 'special', progress: loginStreak, max: 30, unlocked: loginStreak >= 30 },
        { id: 'early_adopter', name: 'Early Adopter', icon: '🌟', desc: 'Joined during beta', tier: 'gold', category: 'special', progress: 1, max: 1, unlocked: character?.isEarlyResident || true }
    ];
    
    const categories = ['all', 'participation', 'level', 'governance', 'wealth', 'trading', 'special'];
    
    const filteredAchievements = selectedCategory === 'all' 
        ? achievements 
        : achievements.filter(a => a.category === selectedCategory);
    
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const totalPoints = achievements.filter(a => a.unlocked).reduce((sum, a) => 
        sum + (a.tier === 'bronze' ? 10 : a.tier === 'silver' ? 25 : 50), 0
    );
    
    return (
        <div className="achievement-section">
            <div className="achievement-header">
                <h2>🏆 Achievements</h2>
                <div className="achievement-progress">
                    {unlockedCount}/{achievements.length} • {totalPoints} pts
                </div>
            </div>
            
            <div className="achievement-categories">
                {categories.map(cat => (
                    <button 
                        key={cat}
                        className={`achievement-category-btn ${selectedCategory === cat ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat)}
                    >
                        {cat === 'all' ? '📋 All' : 
                         cat === 'participation' ? '🎮 Play' :
                         cat === 'level' ? '⭐ Level' :
                         cat === 'governance' ? '🗳️ Govern' :
                         cat === 'wealth' ? '💰 Wealth' :
                         cat === 'trading' ? '📊 Trade' : '✨ Special'}
                    </button>
                ))}
            </div>
            
            <div className="achievements-grid">
                {filteredAchievements.map(achievement => (
                    <div 
                        key={achievement.id} 
                        className={`achievement-card ${achievement.unlocked ? 'unlocked' : 'locked'} ${achievement.tier}`}
                    >
                        <div className="achievement-icon">{achievement.icon}</div>
                        <div className="achievement-info">
                            <div className="achievement-name">
                                {achievement.name}
                                <span className={`achievement-tier ${achievement.tier}`}>
                                    {achievement.tier}
                                </span>
                            </div>
                            <div className="achievement-desc">{achievement.desc}</div>
                            {!achievement.unlocked && (
                                <>
                                    <div className="achievement-progress-bar">
                                        <div 
                                            className="achievement-progress-fill"
                                            style={{ width: `${Math.min(100, (achievement.progress / achievement.max) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="achievement-progress-text">
                                        {achievement.progress}/{achievement.max}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================== LIVE PRICE TICKER ====================

function BattlePass({ playerStats, resources, onResourceChange, showToast }) {
    const [bpLevel, setBpLevel] = useState(() => {
        const saved = localStorage.getItem('pumptown_bp_level');
        const level = saved ? parseInt(saved) : 1;
        // Reset if corrupted (level > 100 is unreasonable for a new game)
        if (level > 100) {
            localStorage.removeItem('pumptown_bp_level');
            localStorage.removeItem('pumptown_bp_xp');
            localStorage.removeItem('pumptown_bp_claimed');
            localStorage.removeItem('pumptown_bp_last_tracked_xp');
            return 1;
        }
        return level;
    });
    const [bpXP, setBpXP] = useState(() => {
        const saved = localStorage.getItem('pumptown_bp_xp');
        const xp = saved ? parseInt(saved) : 0;
        // Reset if corrupted
        if (xp > 200) return 0;
        return xp;
    });
    const [claimedRewards, setClaimedRewards] = useState(() => {
        const saved = localStorage.getItem('pumptown_bp_claimed');
        return saved ? JSON.parse(saved) : [];
    });
    const [lastTrackedXP, setLastTrackedXP] = useState(() => {
        const saved = localStorage.getItem('pumptown_bp_last_tracked_xp');
        return saved ? parseInt(saved) : 0;
    });
    
    const xpPerLevel = 200;
    
    // Generate rewards for any tier (0-9, 10-19, 20-29, etc.)
    const generateTierRewards = (tierStart) => {
        const tierNum = Math.floor(tierStart / 10) + 1;
        const multiplier = tierNum; // Rewards scale with tier
        
        return [
            { level: tierStart + 1, icon: '💊', name: `${500 * multiplier} HOPIUM`, reward: { hopium: 500 * multiplier } },
            { level: tierStart + 2, icon: '🔮', name: `${100 * multiplier} ALPHA`, reward: { alpha: 100 * multiplier } },
            { level: tierStart + 3, icon: '🎫', name: 'Loot Box', reward: { hopium: 1000 * multiplier } },
            { level: tierStart + 4, icon: '🎯', name: `${200 * multiplier} ALPHA`, reward: { alpha: 200 * multiplier } },
            { level: tierStart + 5, icon: '💎', name: tierNum === 1 ? 'Diamond Badge' : `Diamond Badge ${tierNum}`, reward: { hopium: 2000 * multiplier, alpha: 200 * multiplier } },
            { level: tierStart + 7, icon: '🐋', name: tierNum === 1 ? 'Whale Title' : `Whale Title ${tierNum}`, reward: { hopium: 3000 * multiplier } },
            { level: tierStart + 10, icon: '👑', name: tierNum === 1 ? 'Season Crown' : `Season Crown ${tierNum}`, reward: { hopium: 10000 * multiplier, alpha: 1000 * multiplier } }
        ];
    };
    
    // Calculate which tier to show based on current level
    const currentTierStart = Math.floor((bpLevel - 1) / 10) * 10;
    const rewards = generateTierRewards(currentTierStart);
    
    useEffect(() => {
        localStorage.setItem('pumptown_bp_level', bpLevel.toString());
        localStorage.setItem('pumptown_bp_xp', bpXP.toString());
        localStorage.setItem('pumptown_bp_claimed', JSON.stringify(claimedRewards));
        localStorage.setItem('pumptown_bp_last_tracked_xp', lastTrackedXP.toString());
    }, [bpLevel, bpXP, claimedRewards, lastTrackedXP]);
    
    // Level up check
    useEffect(() => {
        if (bpXP >= xpPerLevel) {
            setBpLevel(prev => prev + 1);
            setBpXP(prev => prev - xpPerLevel);
            showToast(`🎉 Battle Pass Level ${bpLevel + 1}!`, 'success');
        }
    }, [bpXP]);
    
    // Track XP GAINS only (not total XP) - add only the difference since last check
    useEffect(() => {
        if (playerStats.xp > lastTrackedXP) {
            const xpGained = playerStats.xp - lastTrackedXP;
            // Only add reasonable XP gains (prevent huge jumps from corrupted data)
            if (xpGained > 0 && xpGained < 1000) {
                setBpXP(prev => prev + xpGained);
            }
            setLastTrackedXP(playerStats.xp);
        }
    }, [playerStats.xp]);
    
    const claimReward = (level) => {
        if (bpLevel < level || claimedRewards.includes(level)) return;
        
        // Find reward from current tier
        const reward = rewards.find(r => r.level === level);
        if (!reward) return;
        
        // Play collect sound
        if (window.GameSounds) window.GameSounds.collect();
        
        Object.entries(reward.reward).forEach(([r, a]) => {
            onResourceChange(r, a);
        });
        
        setClaimedRewards(prev => [...prev, level]);
        showToast(`Claimed ${reward.name}!`, 'success');
    };
    
    const tierNum = Math.floor(currentTierStart / 10) + 1;
    
    return (
        <div className="battle-pass">
            <div className="battle-pass-header">
                <div className="battle-pass-level">
                    <div className="bp-level-badge">{bpLevel}</div>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>Season 1 {tierNum > 1 ? `• Tier ${tierNum}` : ''}</div>
                        <div style={{ color: '#888', fontSize: '0.85em' }}>Ends Feb 28</div>
                    </div>
                </div>
                <div className="battle-pass-progress">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ color: '#888', fontSize: '0.85em' }}>Level {bpLevel}</span>
                        <span style={{ color: '#888', fontSize: '0.85em' }}>{bpXP}/{xpPerLevel} XP</span>
                    </div>
                    <div className="bp-progress-bar">
                        <div className="bp-progress-fill" style={{ width: `${(bpXP / xpPerLevel) * 100}%` }}></div>
                    </div>
                </div>
            </div>
            
            <div className="battle-pass-rewards">
                {rewards.map(reward => {
                    const unlocked = bpLevel >= reward.level;
                    const claimed = claimedRewards.includes(reward.level);
                    const current = bpLevel === reward.level - 1;
                    
                    return (
                        <div 
                            key={reward.level}
                            className={`bp-reward ${unlocked ? 'unlocked' : ''} ${current ? 'current' : ''}`}
                            onClick={() => claimReward(reward.level)}
                            style={{ cursor: unlocked && !claimed ? 'pointer' : 'default', opacity: claimed ? 0.5 : 1 }}
                        >
                            <div className="bp-reward-level">Lv {reward.level}</div>
                            <div className="bp-reward-icon">{reward.icon}</div>
                            <div style={{ color: '#fff', fontSize: '0.8em' }}>{reward.name}</div>
                            {claimed && <div style={{ color: '#00ff88', fontSize: '0.7em' }}>✓ Claimed</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== LIVE ACTIVITY FEED ====================

function NFTAchievementSection({ character, playerStats }) {
    const [mintableAchievements, setMintableAchievements] = useState([]);
    const [mintingId, setMintingId] = useState(null);
    const [mintedNFTs, setMintedNFTs] = useState(() => {
        const saved = localStorage.getItem('pumptown_minted_nfts');
        return saved ? JSON.parse(saved) : [];
    });
    
    useEffect(() => {
        // Determine which achievements can be minted
        const achievements = [];
        
        if (playerStats.level >= 10 && !mintedNFTs.includes('level_10')) {
            achievements.push({ id: 'level_10', name: 'Degen Rookie', icon: '🎮', description: 'Reached Level 10' });
        }
        if (playerStats.totalGamesPlayed >= 50 && !mintedNFTs.includes('games_50')) {
            achievements.push({ id: 'games_50', name: 'Arcade Master', icon: '🕹️', description: 'Played 50 games' });
        }
        if ((character?.votesCount || 0) >= 10 && !mintedNFTs.includes('votes_10')) {
            achievements.push({ id: 'votes_10', name: 'Democracy Enjoyer', icon: '🗳️', description: 'Cast 10 votes' });
        }
        if (playerStats.questsCompleted >= 20 && !mintedNFTs.includes('quests_20')) {
            achievements.push({ id: 'quests_20', name: 'Quest Champion', icon: '📜', description: 'Completed 20 quests' });
        }
        
        setMintableAchievements(achievements);
    }, [playerStats, character, mintedNFTs]);
    
    const mintNFT = (achievement) => {
        setMintingId(achievement.id);
        
        // Simulate minting process
        setTimeout(() => {
            setMintedNFTs(prev => {
                const updated = [...prev, achievement.id];
                localStorage.setItem('pumptown_minted_nfts', JSON.stringify(updated));
                return updated;
            });
            setMintingId(null);
        }, 2000);
    };
    
    if (mintableAchievements.length === 0) return null;
    
    return (
        <div style={{
            background: 'linear-gradient(145deg, rgba(155, 89, 182, 0.2), rgba(0, 0, 0, 0.3))',
            border: '2px solid #9b59b6',
            borderRadius: '15px',
            padding: '20px',
            marginTop: '20px'
        }}>
            <h3 style={{ color: '#9b59b6', marginBottom: '15px' }}>
                🔗 Mintable NFT Achievements
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {mintableAchievements.map(achievement => (
                    <div key={achievement.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(0, 0, 0, 0.3)',
                        padding: '15px',
                        borderRadius: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <span style={{ fontSize: '2em' }}>{achievement.icon}</span>
                            <div>
                                <div style={{ fontWeight: 'bold', color: '#ffd700' }}>{achievement.name}</div>
                                <div style={{ color: '#888', fontSize: '0.9em' }}>{achievement.description}</div>
                            </div>
                        </div>
                        <button 
                            className="mint-btn"
                            onClick={() => mintNFT(achievement)}
                            disabled={mintingId === achievement.id}
                        >
                            {mintingId === achievement.id ? '⏳ Minting...' : '🔗 Mint NFT'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}


function SeasonalEventBanner({ playerStats }) {
    const [timeLeft, setTimeLeft] = useState('');
    
    // Current event (would come from server in production)
    const currentEvent = {
        id: 'lunar_new_year_2026',
        name: '🧧 Lunar New Year Event',
        description: 'Celebrate the Year of the Horse! Double XP and special rewards!',
        endDate: new Date('2026-02-10T00:00:00'),
        rewards: [
            { icon: '🧧', name: 'Lucky Red Envelope', description: 'Random resources' },
            { icon: '🐴', name: 'Horse Badge', description: 'Limited edition' },
            { icon: '2️⃣', name: '2x XP', description: 'All activities' }
        ],
        bonuses: { xpMultiplier: 2, hopiumBonus: 50 }
    };
    
    useEffect(() => {
        const updateTimer = () => {
            const now = new Date();
            const diff = currentEvent.endDate - now;
            
            if (diff <= 0) {
                setTimeLeft('Event Ended');
                return;
            }
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            setTimeLeft(`${days}d ${hours}h ${minutes}m`);
        };
        
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, []);
    
    return (
        <div className="event-banner">
            <div className="event-header">
                <div className="event-title">
                    {currentEvent.name}
                </div>
                <div className="event-timer">
                    ⏰ {timeLeft}
                </div>
            </div>
            <div style={{ color: '#ccc', marginBottom: '15px' }}>{currentEvent.description}</div>
            <div className="event-rewards">
                {currentEvent.rewards.map((reward, idx) => (
                    <div key={idx} className="event-reward">
                        <span style={{ fontSize: '1.5em', marginRight: '8px' }}>{reward.icon}</span>
                        <span style={{ color: '#ffd700' }}>{reward.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================== MEMECOIN LAUNCHER ====================

function DailyRewardModal({ isOpen, onClose, rewardData, onClaim }) {
    if (!isOpen || !rewardData) return null;
    
    const { currentStreak, rewardDay, todayReward, allRewards, canClaim } = rewardData;
    
    return (
        <div className="daily-reward-overlay" onClick={onClose}>
            <div className="daily-reward-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                <button className="daily-reward-close" onClick={onClose}>✕</button>
                
                <div className="daily-reward-title">🎁 Daily Login Reward</div>
                
                <div className="daily-reward-streak">{currentStreak || 0}</div>
                <div className="daily-reward-streak-label">Day Streak 🔥</div>
                
                {/* 7-day grid */}
                <div className="daily-reward-grid">
                    {allRewards.map((reward, idx) => {
                        const dayNum = idx + 1;
                        const isCurrent = dayNum === rewardDay;
                        const isClaimed = dayNum < rewardDay || (dayNum === rewardDay && !canClaim);
                        
                        return (
                            <div 
                                key={dayNum}
                                className={`daily-reward-day ${isCurrent ? 'current' : ''} ${isClaimed ? 'claimed' : ''}`}
                            >
                                <div className="daily-reward-day-num">Day {dayNum}</div>
                                <div className="daily-reward-day-reward">
                                    {dayNum === 7 ? '🎉' : '💊'}{reward.hopium}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Today's reward details */}
                <div className="daily-reward-today">
                    <h4>{canClaim ? `Day ${rewardDay} Reward` : 'Already Claimed Today!'}</h4>
                    {todayReward && (
                        <div className="daily-reward-items">
                            {todayReward.hopium > 0 && (
                                <div className="daily-reward-item">
                                    <div className="daily-reward-item-value">+{todayReward.hopium}</div>
                                    <div className="daily-reward-item-label">💊 Hopium</div>
                                </div>
                            )}
                            {todayReward.alpha > 0 && (
                                <div className="daily-reward-item">
                                    <div className="daily-reward-item-value">+{todayReward.alpha}</div>
                                    <div className="daily-reward-item-label">🔮 Alpha</div>
                                </div>
                            )}
                            {todayReward.copium > 0 && (
                                <div className="daily-reward-item">
                                    <div className="daily-reward-item-value">+{todayReward.copium}</div>
                                    <div className="daily-reward-item-label">😢 Copium</div>
                                </div>
                            )}
                            {todayReward.liquidity > 0 && (
                                <div className="daily-reward-item">
                                    <div className="daily-reward-item-value">+{todayReward.liquidity}</div>
                                    <div className="daily-reward-item-label">💧 Liquidity</div>
                                </div>
                            )}
                            {todayReward.xp > 0 && (
                                <div className="daily-reward-item">
                                    <div className="daily-reward-item-value">+{todayReward.xp}</div>
                                    <div className="daily-reward-item-label">⭐ XP</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {canClaim ? (
                    <button className="daily-reward-claim-btn" onClick={onClaim}>
                        🎁 Claim Reward!
                    </button>
                ) : (
                    <p style={{ color: '#888', marginTop: '15px' }}>Come back tomorrow for more rewards!</p>
                )}
            </div>
        </div>
    );
}

// ==================== PLAYER PROFILE MODAL ====================

