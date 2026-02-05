// ====================================================
// player-ui.js — Player stats, zones, quests, profiles
// Degens City - Auto-extracted from index.html
// ====================================================

function PlayerStatsPanel({ character, playerStats, xpProgress, xpNeeded, xpPercent, resources }) {
    const roleEmojis = {
        'Ape Farmer': '🦍',
        'Chart Autist': '📊',
        'Meme Lord': '🎨',
        'Degen': '🎰',
        'Whale': '🐋',
        'Market God': '👑'
    };
    
    return (
        <div className="player-stats-panel">
            <div className="player-level-display">
                <div className="player-avatar">
                    {character?.avatar?.image ? (
                        <img 
                            src={character.avatar.image} 
                            alt={character.avatar.name || 'Avatar'}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                    ) : (
                        roleEmojis[character?.role] || '🦍'
                    )}
                </div>
                <div className="player-info">
                    <div className="player-name-level">
                        <span className="player-name">{character?.name || 'Anon'}</span>
                        <span className="player-level-badge">Lvl {playerStats.level}</span>
                    </div>
                    <div className="xp-bar-container">
                        <div className="xp-bar-fill" style={{ width: `${xpPercent}%` }} />
                        <span className="xp-bar-text">{xpProgress} / {xpNeeded} XP</span>
                    </div>
                </div>
            </div>
            
            <div className="production-resources">
                <div className="production-item">
                    <div className="production-icon">💊</div>
                    <div className="production-amount">{resources.hopium.toLocaleString()}</div>
                    <div className="production-rate">HOPIUM</div>
                </div>
                <div className="production-item">
                    <div className="production-icon">🔮</div>
                    <div className="production-amount">{resources.alpha.toLocaleString()}</div>
                    <div className="production-rate">ALPHA</div>
                </div>
                <div className="production-item">
                    <div className="production-icon">😢</div>
                    <div className="production-amount">{resources.copium.toLocaleString()}</div>
                    <div className="production-rate">COPIUM</div>
                </div>
                <div className="production-item">
                    <div className="production-icon">💧</div>
                    <div className="production-amount">{resources.liquidity.toLocaleString()}</div>
                    <div className="production-rate">LIQUIDITY</div>
                </div>
            </div>
            
            <div className="player-quick-stats">
                <div className="quick-stat">
                    <div className="quick-stat-value">{playerStats.totalGamesPlayed}</div>
                    <div className="quick-stat-label">Games</div>
                </div>
                <div className="quick-stat">
                    <div className="quick-stat-value">{playerStats.questsCompleted}</div>
                    <div className="quick-stat-label">Quests</div>
                </div>
                <div className="quick-stat">
                    <div className="quick-stat-value">{character?.votesCount || 0}</div>
                    <div className="quick-stat-label">Votes</div>
                </div>
                <div className="quick-stat">
                    <div className="quick-stat-value">{playerStats.degenScore}</div>
                    <div className="quick-stat-label">Degen Score</div>
                </div>
            </div>
        </div>
    );
}

// ==================== ZONES SECTION ====================

function ZonesSection({ currentZone, setCurrentZone, playerLevel, onZoneChange }) {
    const [showZoneEffect, setShowZoneEffect] = useState(null);
    
    const zones = [
        {
            id: 'pump_town_square',
            name: 'Degens City Square',
            icon: '🏛️',
            description: 'The heart of the city. Safe for newbies.',
            bonuses: ['+1 HOPIUM/tick', 'Safe Zone'],
            unlockLevel: 1,
            effects: { hopium: 1, alpha: 0, copium: 0, liquidity: 0, gameMultiplier: 1.0 },
            theme: 'rgba(0, 255, 136, 0.1)'
        },
        {
            id: 'shitcoin_slums',
            name: 'Shitcoin Slums',
            icon: '🏚️',
            description: 'Where rugged dreams come to die. High risk, high reward.',
            bonuses: ['+3 HOPIUM/tick', '+1 COPIUM/tick', '+20% Game Risk'],
            unlockLevel: 3,
            effects: { hopium: 3, alpha: 0, copium: 1, liquidity: 0, gameMultiplier: 1.2 },
            theme: 'rgba(255, 100, 100, 0.1)'
        },
        {
            id: 'chart_district',
            name: 'Chart District',
            icon: '📊',
            description: 'Technical analysts unite. Chart Battle bonuses here!',
            bonuses: ['+2 ALPHA/tick', '+1 LIQUIDITY/tick', '+50% Chart Battle XP'],
            unlockLevel: 5,
            effects: { hopium: 1, alpha: 2, copium: 0, liquidity: 1, gameMultiplier: 1.0, chartBonus: 1.5 },
            theme: 'rgba(255, 215, 0, 0.1)'
        },
        {
            id: 'degen_casino',
            name: 'Degen Casino',
            icon: '🎰',
            description: 'For those who like to gamble. 2x rewards but 2x risk!',
            bonuses: ['+2 HOPIUM/tick', '+2 COPIUM/tick', '2x Game Rewards'],
            unlockLevel: 10,
            effects: { hopium: 2, alpha: 1, copium: 2, liquidity: 0, gameMultiplier: 2.0 },
            theme: 'rgba(255, 0, 255, 0.1)'
        },
        {
            id: 'whale_bay',
            name: 'Whale Bay',
            icon: '🐋',
            description: 'Where the big fish swim. Massive liquidity bonuses.',
            bonuses: ['+3 ALPHA/tick', '+3 LIQUIDITY/tick', '+25% Trade Value'],
            unlockLevel: 15,
            effects: { hopium: 1, alpha: 3, copium: 0, liquidity: 3, gameMultiplier: 1.25, tradeBonus: 1.25 },
            theme: 'rgba(0, 150, 255, 0.1)'
        },
        {
            id: 'alpha_vault',
            name: 'Alpha Vault',
            icon: '🔮',
            description: 'Secret insider information. Ultimate ALPHA zone.',
            bonuses: ['+5 ALPHA/tick', '+2 All Resources', 'Legendary Status'],
            unlockLevel: 25,
            effects: { hopium: 2, alpha: 5, copium: 2, liquidity: 2, gameMultiplier: 1.5 },
            theme: 'rgba(155, 89, 182, 0.1)'
        }
    ];
    
    const handleZoneChange = (zone) => {
        if (playerLevel < zone.unlockLevel) return;
        if (zone.id === currentZone) return;
        
        setCurrentZone(zone.id);
        setShowZoneEffect(zone);
        
        // Notify parent of zone change with effects
        if (onZoneChange) {
            onZoneChange(zone);
        }
        
        // Hide effect after 3 seconds
        setTimeout(() => setShowZoneEffect(null), 3000);
    };
    
    const currentZoneData = zones.find(z => z.id === currentZone);
    
    return (
        <div className="zones-section">
            <div className="zones-header">
                <h2>🗺️ Zones</h2>
                <span style={{ color: '#888', fontSize: '0.9em' }}>
                    Current: {currentZoneData?.name}
                </span>
            </div>
            
            {/* Zone Effect Toast */}
            {showZoneEffect && (
                <div style={{
                    background: showZoneEffect.theme,
                    border: '2px solid #00ff88',
                    borderRadius: '10px',
                    padding: '15px',
                    marginBottom: '15px',
                    animation: 'fadeIn 0.3s ease'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.5em' }}>{showZoneEffect.icon}</span>
                        <span style={{ color: '#00ff88', fontWeight: 'bold' }}>
                            Entered {showZoneEffect.name}!
                        </span>
                    </div>
                    <div style={{ color: '#aaa', fontSize: '0.9em' }}>
                        Active bonuses: {showZoneEffect.bonuses.join(' • ')}
                    </div>
                </div>
            )}
            
            {/* Current Zone Stats */}
            {currentZoneData && (
                <div style={{
                    background: currentZoneData.theme,
                    border: '1px solid rgba(0, 255, 136, 0.3)',
                    borderRadius: '10px',
                    padding: '12px 15px',
                    marginBottom: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.2em' }}>{currentZoneData.icon}</span>
                        <span style={{ color: '#fff', fontWeight: 'bold' }}>Active Zone Bonuses:</span>
                    </div>
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                        {currentZoneData.effects.hopium > 0 && (
                            <span style={{ color: '#00ff88' }}>💊+{currentZoneData.effects.hopium}/tick</span>
                        )}
                        {currentZoneData.effects.alpha > 0 && (
                            <span style={{ color: '#ffd700' }}>🔮+{currentZoneData.effects.alpha}/tick</span>
                        )}
                        {currentZoneData.effects.copium > 0 && (
                            <span style={{ color: '#6699ff' }}>😢+{currentZoneData.effects.copium}/tick</span>
                        )}
                        {currentZoneData.effects.liquidity > 0 && (
                            <span style={{ color: '#00ccff' }}>💧+{currentZoneData.effects.liquidity}/tick</span>
                        )}
                        {currentZoneData.effects.gameMultiplier > 1 && (
                            <span style={{ color: '#ff69b4' }}>🎮{currentZoneData.effects.gameMultiplier}x rewards</span>
                        )}
                    </div>
                </div>
            )}
            
            <div className="zones-grid">
                {zones.map(zone => {
                    const isLocked = playerLevel < zone.unlockLevel;
                    const isActive = currentZone === zone.id;
                    
                    return (
                        <div 
                            key={zone.id}
                            className={`zone-card ${isLocked ? 'locked' : ''} ${isActive ? 'active' : ''}`}
                            onClick={() => handleZoneChange(zone)}
                            style={isActive ? { background: zone.theme, borderColor: '#00ff88' } : {}}
                        >
                            {isActive && (
                                <div className="zone-active-badge">HERE</div>
                            )}
                            <div className="zone-icon">{zone.icon}</div>
                            <div className="zone-name">{zone.name}</div>
                            <div className="zone-description">{zone.description}</div>
                            <div className="zone-bonuses">
                                {zone.bonuses.map((bonus, idx) => (
                                    <span key={idx} className="zone-bonus">{bonus}</span>
                                ))}
                            </div>
                            
                            {isLocked && (
                                <div className="zone-lock-overlay">
                                    <div className="zone-lock-icon">🔒</div>
                                    <div className="zone-lock-text">Unlock at Level {zone.unlockLevel}</div>
                                </div>
                            )}
                            
                            {isActive && (
                                <div style={{ 
                                    position: 'absolute', 
                                    top: '10px', 
                                    right: '10px',
                                    background: '#ffd700',
                                    color: '#000',
                                    padding: '3px 8px',
                                    borderRadius: '10px',
                                    fontSize: '0.7em',
                                    fontWeight: 'bold'
                                }}>
                                    HERE
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== QUESTS SECTION ====================

function QuestsSection({ quests, onClaimReward }) {
    if (!quests) return null;
    
    // Calculate time until quest refresh (midnight)
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const hoursLeft = Math.floor((midnight - now) / (1000 * 60 * 60));
    const minutesLeft = Math.floor(((midnight - now) % (1000 * 60 * 60)) / (1000 * 60));
    
    // Count completed quests
    const completedCount = quests.filter(q => q.completed).length;
    const claimedCount = quests.filter(q => q.claimed).length;
    
    return (
        <div className="quests-section">
            <div className="quests-header">
                <h2>📜 Daily Quests</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: completedCount === 3 ? '#00ff88' : '#888' }}>
                        {claimedCount}/3 Complete
                    </span>
                    <span className="quest-refresh-timer">
                        🔄 {hoursLeft}h {minutesLeft}m
                    </span>
                </div>
            </div>
            
            <div className="quests-list">
                {quests.map((quest, idx) => {
                    const progressPercent = Math.min(100, ((quest.progress || 0) / quest.target) * 100);
                    
                    return (
                        <div key={idx} className={`quest-card ${quest.claimed ? 'completed' : quest.completed ? 'ready' : ''}`}>
                            <div className="quest-info">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                                    <span className={`quest-difficulty ${quest.difficulty}`}>
                                        {quest.difficulty === 'easy' ? '⭐' : quest.difficulty === 'medium' ? '⭐⭐' : '⭐⭐⭐'}
                                    </span>
                                    <div className="quest-title">{quest.title}</div>
                                </div>
                                <div className="quest-description">{quest.description}</div>
                                
                                {/* Progress bar */}
                                <div style={{ marginTop: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ color: '#888', fontSize: '0.85em' }}>Progress</span>
                                        <span style={{ color: quest.completed ? '#00ff88' : '#fff', fontSize: '0.85em', fontWeight: 'bold' }}>
                                            {quest.progress || 0} / {quest.target}
                                        </span>
                                    </div>
                                    <div style={{ 
                                        width: '100%', 
                                        height: '8px', 
                                        background: 'rgba(0,0,0,0.3)', 
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{ 
                                            width: `${progressPercent}%`, 
                                            height: '100%', 
                                            background: quest.completed ? '#00ff88' : 'linear-gradient(90deg, #ffd700, #ffaa00)',
                                            borderRadius: '4px',
                                            transition: 'width 0.5s ease'
                                        }}></div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="quest-rewards">
                                <div style={{ marginBottom: '8px', fontSize: '0.85em', color: '#888' }}>Rewards:</div>
                                {quest.rewards.hopium && (
                                    <span className="quest-reward">💊 {quest.rewards.hopium}</span>
                                )}
                                {quest.rewards.alpha && (
                                    <span className="quest-reward">🔮 {quest.rewards.alpha}</span>
                                )}
                                {quest.rewards.xp && (
                                    <span className="quest-reward" style={{ color: '#ffd700' }}>⭐ {quest.rewards.xp} XP</span>
                                )}
                                
                                <button 
                                    className={`quest-claim-btn ${quest.completed && !quest.claimed ? 'pulse-glow' : ''}`}
                                    onClick={() => onClaimReward(idx)}
                                    disabled={!quest.completed || quest.claimed}
                                    style={quest.completed && !quest.claimed ? { animation: 'pulse 1s infinite' } : {}}
                                >
                                    {quest.claimed ? '✓ Claimed' : quest.completed ? '🎁 Claim!' : `${Math.floor(progressPercent)}%`}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== MAYOR'S INBOX — Personal DMs, Missions & Callouts ====================

function PlayerProfileModal({ isOpen, onClose, profile, loading }) {
    if (!isOpen) return null;
    
    if (loading) {
        return (
            <div className="profile-overlay" onClick={onClose}>
                <div className="profile-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                    <button className="profile-close" onClick={onClose}>✕</button>
                    
                    {/* Skeleton Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '25px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <div className="skeleton skeleton-avatar large" style={{ width: '80px', height: '80px' }}></div>
                        <div style={{ flex: 1 }}>
                            <div className="skeleton skeleton-text" style={{ width: '150px', height: '20px', marginBottom: '10px' }}></div>
                            <div className="skeleton skeleton-text" style={{ width: '100px', height: '14px', marginBottom: '10px' }}></div>
                            <div className="skeleton skeleton-badge" style={{ width: '80px', height: '24px' }}></div>
                        </div>
                    </div>
                    
                    {/* Skeleton Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '25px' }}>
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '15px', textAlign: 'center' }}>
                                <div className="skeleton skeleton-stat" style={{ width: '60px', height: '28px', margin: '0 auto 8px' }}></div>
                                <div className="skeleton skeleton-text short" style={{ width: '80px', height: '12px', margin: '0 auto' }}></div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Skeleton Activity */}
                    <div>
                        <div className="skeleton skeleton-text" style={{ width: '120px', height: '16px', marginBottom: '15px' }}></div>
                        {[1,2,3].map(i => (
                            <div key={i} className="skeleton-activity" style={{ marginBottom: '10px' }}>
                                <div className="skeleton skeleton-activity-icon"></div>
                                <div className="skeleton skeleton-activity-text" style={{ width: '70%' }}></div>
                                <div className="skeleton skeleton-activity-time"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    
    if (!profile) return null;
    
    // Get avatar image
    let avatarImage = '/api/placeholder/80/80';
    if (profile.avatar) {
        if (typeof profile.avatar === 'object' && profile.avatar.image) {
            avatarImage = profile.avatar.image;
        } else if (typeof profile.avatar === 'string') {
            const found = AVATAR_OPTIONS.find(a => a.id === profile.avatar || a.name.toLowerCase() === profile.avatar.toLowerCase());
            if (found) avatarImage = found.image;
        }
    }
    
    return (
        <div className="profile-overlay" onClick={onClose}>
            <div className="profile-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                <button className="profile-close" onClick={onClose}>✕</button>
                
                <div className="profile-header">
                    <img src={avatarImage} alt={profile.name} className="profile-avatar" />
                    <div>
                        <div className="profile-name">{profile.name}</div>
                        <div className="profile-role">{profile.role || 'Citizen'}</div>
                        <div className="profile-level-badge">Level {profile.level}</div>
                    </div>
                </div>
                
                <div className="profile-stats-grid">
                    <div className="profile-stat">
                        <div className="profile-stat-value">{(profile.xp || 0).toLocaleString()}</div>
                        <div className="profile-stat-label">⭐ Total XP</div>
                    </div>
                    <div className="profile-stat">
                        <div className="profile-stat-value">{profile.degenScore || 0}</div>
                        <div className="profile-stat-label">🎰 Degen Score</div>
                    </div>
                    <div className="profile-stat">
                        <div className="profile-stat-value">{profile.gamesPlayed || 0}</div>
                        <div className="profile-stat-label">🎮 Games Played</div>
                    </div>
                    <div className="profile-stat">
                        <div className="profile-stat-value">{profile.votesCount || 0}</div>
                        <div className="profile-stat-label">🗳️ Votes Cast</div>
                    </div>
                    <div className="profile-stat">
                        <div className="profile-stat-value">{profile.loginStreak || 0}</div>
                        <div className="profile-stat-label">🔥 Login Streak</div>
                    </div>
                    <div className="profile-stat">
                        <div className="profile-stat-value">{profile.daysSinceJoined || 0}</div>
                        <div className="profile-stat-label">📅 Days Active</div>
                    </div>
                </div>
                
                {profile.badges && profile.badges.length > 0 && (
                    <div className="profile-badges">
                        <h4>🏆 Badges</h4>
                        <div className="profile-badges-list">
                            {profile.badges.map((badge, idx) => (
                                <div key={idx} className="profile-badge">
                                    {badge.icon} {badge.name}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {profile.recentActivities && profile.recentActivities.length > 0 && (
                    <div className="profile-activity">
                        <h4>📜 Recent Activity</h4>
                        {profile.recentActivities.slice(0, 5).map((activity, idx) => (
                            <div key={idx} className="profile-activity-item">
                                <span className="profile-activity-icon">{activity.icon}</span>
                                <span>{activity.description}</span>
                                <span className="profile-activity-time">{activity.timeAgo}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ==================== ACTIVITY FEED COMPONENT ====================

function ActivityFeed({ activities, onPlayerClick }) {
    if (!activities || activities.length === 0) {
        return (
            <div className="activity-feed">
                <div className="activity-feed-header">
                    <span className="activity-feed-title">📢 Activity Feed</span>
                    <span className="activity-feed-live">LIVE</span>
                </div>
                <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                    No activity yet. Be the first to make a move!
                </div>
            </div>
        );
    }
    
    return (
        <div className="activity-feed">
            <div className="activity-feed-header">
                <span className="activity-feed-title">📢 Activity Feed</span>
                <span className="activity-feed-live">LIVE</span>
            </div>
            <div className="activity-feed-list">
                {activities.map((activity) => (
                    <div key={activity.id} className="activity-feed-item">
                        <span className="activity-feed-icon">{activity.icon}</span>
                        <div className="activity-feed-content">
                            <span 
                                className="activity-feed-player"
                                onClick={() => onPlayerClick && onPlayerClick(activity.playerName)}
                            >
                                {activity.playerName}
                            </span>
                            {' '}
                            <span className="activity-feed-text">{activity.description}</span>
                        </div>
                        <span className="activity-feed-time">{activity.timeAgo}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================== MAYOR REACTION MODAL ====================

