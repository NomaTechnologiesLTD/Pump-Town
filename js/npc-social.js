// ====================================================
// npc-social.js — NPC relationships, rivalries, social features
// Degens City - Auto-extracted from index.html
// ====================================================

function NPCRelationships({ character, reputation, showToast }) {
    const [relationships, setRelationships] = useState(() => {
        try { return JSON.parse(localStorage.getItem('dc_npc_relationships') || '{}'); } catch(e) { return {}; }
    });
    const [encounters, setEncounters] = useState(() => {
        try { return JSON.parse(localStorage.getItem('dc_npc_encounters') || '[]'); } catch(e) { return []; }
    });
    const [expanded, setExpanded] = useState(false);
    
    // Save relationships
    useEffect(function() {
        localStorage.setItem('dc_npc_relationships', JSON.stringify(relationships));
    }, [relationships]);
    useEffect(function() {
        localStorage.setItem('dc_npc_encounters', JSON.stringify(encounters));
    }, [encounters]);
    
    // Expose methods globally so Explore City can update relationships
    useEffect(function() {
        window.updateNPCRelationship = function(npcName, change, context) {
            setRelationships(function(prev) {
                var current = prev[npcName] || { score: 0, encounters: 0, lastSeen: null, mood: 'neutral' };
                var newScore = Math.max(-100, Math.min(100, current.score + change));
                var mood = newScore > 40 ? 'friendly' : newScore > 10 ? 'warm' : newScore > -10 ? 'neutral' : newScore > -40 ? 'suspicious' : 'hostile';
                return Object.assign({}, prev, { [npcName]: { score: newScore, encounters: current.encounters + 1, lastSeen: Date.now(), mood: mood, lastContext: context || '' } });
            });
            setEncounters(function(prev) {
                return [{ npc: npcName, change: change, context: context, time: Date.now() }].concat(prev).slice(0, 50);
            });
        };
        window.getNPCRelationship = function(npcName) {
            return relationships[npcName] || { score: 0, encounters: 0, mood: 'neutral' };
        };
        window.getNPCRelationships = function() { return relationships; };
        return function() { delete window.updateNPCRelationship; delete window.getNPCRelationship; delete window.getNPCRelationships; };
    }, [relationships]);
    
    var npcList = Object.entries(relationships).sort(function(a, b) { return Math.abs(b[1].score) - Math.abs(a[1].score); });
    var moodEmojis = { friendly: '😊', warm: '🙂', neutral: '😐', suspicious: '🤨', hostile: '😡' };
    var moodColors = { friendly: '#00ff88', warm: '#88ff00', neutral: '#888', suspicious: '#ff8800', hostile: '#ff4444' };
    
    if (npcList.length === 0) {
        return React.createElement('div', { style: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '20px', textAlign: 'center' } },
            React.createElement('div', { style: { fontSize: '2em', marginBottom: '8px' } }, '🤝'),
            React.createElement('h3', { style: { margin: '0 0 6px', fontSize: '1em' } }, 'NPC Relationships'),
            React.createElement('p', { style: { color: '#888', fontSize: '0.85em', margin: 0 } }, 'Explore the city to meet NPCs. They\'ll remember you.')
        );
    }
    
    var shown = expanded ? npcList : npcList.slice(0, 4);
    
    return React.createElement('div', { style: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', marginBottom: '20px' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' } },
            React.createElement('h3', { style: { margin: 0, fontSize: '1.1em' } }, '🤝 NPC Relationships (' + npcList.length + ')'),
            React.createElement('div', { style: { fontSize: '0.75em', color: '#888' } }, 'They remember everything')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' } },
            shown.map(function(entry) {
                var name = entry[0];
                var rel = entry[1];
                var emoji = moodEmojis[rel.mood] || '😐';
                var color = moodColors[rel.mood] || '#888';
                var barWidth = Math.abs(rel.score);
                var barColor = rel.score >= 0 ? '#00ff88' : '#ff4444';
                return React.createElement('div', { key: name, style: { background: 'rgba(0,0,0,0.3)', border: '1px solid ' + color + '33', borderRadius: '12px', padding: '12px' } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
                        React.createElement('div', { style: { fontWeight: 'bold', fontSize: '0.9em' } }, emoji + ' ' + name),
                        React.createElement('div', { style: { fontSize: '0.75em', color: color, fontWeight: 'bold' } }, rel.mood.toUpperCase())
                    ),
                    // Relationship bar
                    React.createElement('div', { style: { height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginBottom: '6px' } },
                        React.createElement('div', { style: { height: '100%', width: barWidth + '%', background: barColor, borderRadius: '2px', transition: 'width 0.5s' } })
                    ),
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.7em', color: '#666' } },
                        React.createElement('span', null, rel.encounters + ' encounters'),
                        React.createElement('span', { style: { color: barColor } }, (rel.score >= 0 ? '+' : '') + rel.score)
                    ),
                    rel.lastContext && React.createElement('div', { style: { fontSize: '0.7em', color: '#555', marginTop: '4px', fontStyle: 'italic' } }, '💬 ' + rel.lastContext.substring(0, 40) + (rel.lastContext.length > 40 ? '...' : ''))
                );
            })
        ),
        npcList.length > 4 && React.createElement('button', { onClick: function() { setExpanded(!expanded); }, style: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', color: '#888', cursor: 'pointer', marginTop: '10px', fontFamily: 'inherit', fontSize: '0.8em' } }, expanded ? '▲ Show Less' : '▼ Show All (' + npcList.length + ' NPCs)')
    );
}

// ==================== REPUTATION CONSEQUENCES SYSTEM ====================

function ReputationStatus({ reputation, character, showToast }) {
    const [lastEvent, setLastEvent] = useState(null);
    const [eventVisible, setEventVisible] = useState(false);
    
    // Reputation tiers with consequences
    var getTier = function(rep) {
        if (rep >= 100) return { name: 'CITY LEGEND', emoji: '👑', color: '#ffd700', perks: 'VIP everywhere, Mayor consults you, NPCs worship you', tier: 5 };
        if (rep >= 50) return { name: 'RESPECTED', emoji: '⭐', color: '#00ff88', perks: 'Better deals, insider tips, police look the other way', tier: 4 };
        if (rep >= 20) return { name: 'KNOWN', emoji: '🟢', color: '#88ff00', perks: 'NPCs recognize you, small discounts', tier: 3 };
        if (rep >= -19) return { name: 'NOBODY', emoji: '😐', color: '#888', perks: 'No special treatment — prove yourself', tier: 2 };
        if (rep >= -50) return { name: 'SUSPICIOUS', emoji: '🟡', color: '#ff8800', perks: 'Cops watch you, prices up 20%, NPCs nervous', tier: 1 };
        return { name: 'WANTED', emoji: '🔴', color: '#ff4444', perks: 'Police target you, banned from some locations, enemies everywhere', tier: 0 };
    };
    
    var tier = getTier(reputation);
    var nextTier = reputation < 100 ? getTier(reputation + 50) : null;
    var prevTier = reputation > -50 ? getTier(reputation - 50) : null;
    
    // Random reputation consequences
    useEffect(function() {
        var triggerEvent = function() {
            var events = [];
            if (reputation >= 100) {
                events = [
                    { icon: '👑', text: 'An NPC bowed as you walked past', color: '#ffd700' },
                    { icon: '💎', text: 'A merchant gave you a secret discount', color: '#00ff88' },
                    { icon: '🎩', text: 'Mayor mentioned your name in a speech', color: '#a855f7' }
                ];
            } else if (reputation >= 50) {
                events = [
                    { icon: '🤝', text: 'A trader shared an insider tip with you', color: '#00ff88' },
                    { icon: '🛡️', text: 'A guard nodded and let you through', color: '#4488ff' },
                    { icon: '💰', text: 'Someone paid back a debt... with interest', color: '#ffd700' }
                ];
            } else if (reputation <= -50) {
                events = [
                    { icon: '🚔', text: 'Police patrol increased near you', color: '#ff4444' },
                    { icon: '💀', text: 'Someone spray-painted "SNITCH" on your wall', color: '#ff4444' },
                    { icon: '🔪', text: 'A Dark Alley NPC gave you a threatening look', color: '#ff8800' }
                ];
            } else if (reputation <= -20) {
                events = [
                    { icon: '👀', text: 'NPCs whisper when you walk by', color: '#ff8800' },
                    { icon: '📸', text: 'Someone was following you...', color: '#ff8800' },
                    { icon: '🚫', text: 'A shop owner raised their prices for you', color: '#ff4444' }
                ];
            } else {
                events = [
                    { icon: '😐', text: 'Nobody noticed you today', color: '#888' },
                    { icon: '🌫️', text: 'You blended into the crowd', color: '#888' }
                ];
            }
            var event = events[Math.floor(Math.random() * events.length)];
            setLastEvent(event);
            setEventVisible(true);
            setTimeout(function() { setEventVisible(false); }, 8000);
        };
        
        // Trigger random events every 60-120 seconds
        var delay = 60000 + Math.floor(Math.random() * 60000);
        var timeout = setTimeout(triggerEvent, 15000); // First one after 15s
        var iv = setInterval(triggerEvent, delay);
        return function() { clearTimeout(timeout); clearInterval(iv); };
    }, [reputation]);
    
    // Expose rep tier globally for other components
    useEffect(function() {
        window.getRepTier = function() { return tier; };
        window.getReputation = function() { return reputation; };
        return function() { delete window.getRepTier; delete window.getReputation; };
    }, [reputation, tier]);
    
    return React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', border: '1px solid ' + tier.color + '33', borderRadius: '16px', padding: '20px', marginBottom: '20px', position: 'relative', overflow: 'hidden' } },
        // Glow effect
        React.createElement('div', { style: { position: 'absolute', top: '-50%', right: '-20%', width: '200px', height: '200px', background: 'radial-gradient(circle, ' + tier.color + '08 0%, transparent 70%)', pointerEvents: 'none' } }),
        
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', position: 'relative' } },
            React.createElement('div', null,
                React.createElement('h3', { style: { margin: '0 0 4px', fontSize: '1.1em' } }, '🏅 City Reputation'),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    React.createElement('span', { style: { fontSize: '1.8em' } }, tier.emoji),
                    React.createElement('div', null,
                        React.createElement('div', { style: { color: tier.color, fontWeight: 'bold', fontSize: '1.1em', letterSpacing: '1px' } }, tier.name),
                        React.createElement('div', { style: { color: '#888', fontSize: '0.8em' } }, tier.perks)
                    )
                )
            ),
            React.createElement('div', { style: { textAlign: 'right' } },
                React.createElement('div', { style: { fontSize: '2em', fontWeight: 'bold', color: tier.color } }, (reputation >= 0 ? '+' : '') + reputation),
                React.createElement('div', { style: { fontSize: '0.7em', color: '#666', letterSpacing: '1px' } }, 'REPUTATION')
            )
        ),
        
        // Rep bar
        React.createElement('div', { style: { height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' } },
            React.createElement('div', { style: { height: '100%', width: Math.min(100, Math.max(0, (reputation + 100) / 2)) + '%', background: 'linear-gradient(90deg, #ff4444, #ff8800, #ffd700, #88ff00, #00ff88)', borderRadius: '3px', transition: 'width 0.8s' } })
        ),
        
        // Tier labels
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.65em', color: '#555', marginBottom: '12px' } },
            React.createElement('span', null, '🔴 WANTED'),
            React.createElement('span', null, '😐 NOBODY'),
            React.createElement('span', null, '👑 LEGEND')
        ),
        
        // Random reputation event toast
        lastEvent && eventVisible && React.createElement('div', { style: { background: lastEvent.color + '15', border: '1px solid ' + lastEvent.color + '33', borderRadius: '10px', padding: '10px 14px', animation: 'fadeIn 0.5s', display: 'flex', alignItems: 'center', gap: '10px' } },
            React.createElement('span', { style: { fontSize: '1.3em' } }, lastEvent.icon),
            React.createElement('span', { style: { color: '#ccc', fontSize: '0.85em' } }, lastEvent.text)
        )
    );
}

// ==================== ACTIONS PAGE (Core Loop) ====================
// ==================== CITY EXPLORER — Interactive Map + Situations ====================

function CitizenRivalries({ playerName, playerStats }) {
    const [expanded, setExpanded] = useState(false);
    const [activeChallenge, setActiveChallenge] = useState(null);
    const [showChallenge, setShowChallenge] = useState(false);
    const [challengeTarget, setChallengeTarget] = useState('');
    const [challengeSent, setChallengeSent] = useState(false);
    const [rivalries, setRivalries] = useState(() => {
        const saved = localStorage.getItem('pump_town_rivalries');
        return saved ? JSON.parse(saved) : [];
    });
    
    // Active beefs in Degens City (seeded data + player rivalries)
    const activeBeefs = [
        {
            id: 'beef_1',
            challenger: 'cap_hunter_9000',
            defender: 'bs_detector_pro',
            challengerScore: 2850,
            defenderScore: 2640,
            status: 'active',
            mayorComment: "Two TITANS of cap detection going head to head! 🔥 cap_hunter_9000 is up 210 points but bs_detector_pro has that comeback energy. This is gonna be SPICY ser! 🌶️",
            stake: '500 HOPIUM',
            startedAt: '2 hours ago'
        },
        {
            id: 'beef_2',
            challenger: 'roast_master',
            defender: 'vibe_checker',
            challengerScore: 2180,
            defenderScore: 1950,
            status: 'active',
            mayorComment: "roast_master threw down the GAUNTLET and vibe_checker accepted! Currently 230 points apart. Will the vibes be checked or will they be WRECKED?! 💀",
            stake: '300 HOPIUM',
            startedAt: '5 hours ago'
        },
        {
            id: 'beef_3',
            challenger: 'truth_seeker',
            defender: 'fraud_finder',
            challengerScore: 2410,
            defenderScore: 1690,
            status: 'complete',
            winner: 'truth_seeker',
            mayorComment: "ABSOLUTE DOMINATION! truth_seeker came in with 720 POINTS MORE and sent fraud_finder back to the shadow realm! That's not a rivalry, that's a PUBLIC EXECUTION! 😭🏆",
            stake: '400 HOPIUM',
            completedAt: '1 day ago'
        }
    ];
    
    // Potential rivals (players close to your skill level)
    const potentialRivals = [
        { name: 'skeptic_supreme', score: 1540, level: 8, status: 'online', matchup: '52%' },
        { name: 'cap_police', score: 1820, level: 9, status: 'online', matchup: '48%' },
        { name: 'fraud_finder', score: 1690, level: 7, status: 'away', matchup: '50%' },
        { name: 'truth_seeker', score: 2410, level: 12, status: 'online', matchup: '35%' },
    ];
    
    const sendChallenge = () => {
        if (!challengeTarget.trim()) return;
        
        // Create new rivalry
        const newRivalry = {
            id: `rivalry_${Date.now()}`,
            challenger: playerName,
            defender: challengeTarget,
            challengerScore: playerStats?.highScore || 0,
            defenderScore: 0,
            status: 'pending',
            stake: '250 HOPIUM',
            createdAt: new Date().toISOString()
        };
        
        const updatedRivalries = [...rivalries, newRivalry];
        setRivalries(updatedRivalries);
        localStorage.setItem('pump_town_rivalries', JSON.stringify(updatedRivalries));
        
        setChallengeSent(true);
        setTimeout(() => {
            setShowChallenge(false);
            setChallengeTarget('');
            setChallengeSent(false);
        }, 2000);
    };
    
    const quickChallenge = (rivalName) => {
        setChallengeTarget(rivalName);
        setShowChallenge(true);
    };
    
    return (
        <div className="citizen-rivalries">
            <div 
                className="rivalries-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>⚔️</span>
                    <span>Citizen Rivalries</span>
                    {activeBeefs.filter(b => b.status === 'active').length > 0 && (
                        <span className="rivalry-badge">
                            {activeBeefs.filter(b => b.status === 'active').length} LIVE
                        </span>
                    )}
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="rivalries-content">
                    {/* Challenge Button */}
                    <button 
                        className="challenge-btn"
                        onClick={() => setShowChallenge(!showChallenge)}
                    >
                        ⚔️ Challenge a Citizen
                    </button>
                    
                    {/* Challenge Form */}
                    {showChallenge && (
                        <div className="challenge-form">
                            {challengeSent ? (
                                <div className="challenge-sent">
                                    ⚔️ Challenge sent to {challengeTarget}!<br/>
                                    <span style={{ fontSize: '0.85em', color: '#888' }}>They have 24h to respond</span>
                                </div>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Enter citizen name..."
                                        value={challengeTarget}
                                        onChange={(e) => setChallengeTarget(e.target.value)}
                                        className="challenge-input"
                                    />
                                    <div className="challenge-stake">
                                        Stake: <span style={{ color: '#00ff88' }}>250 HOPIUM</span>
                                    </div>
                                    <button 
                                        className="send-challenge-btn"
                                        onClick={sendChallenge}
                                        disabled={!challengeTarget.trim()}
                                    >
                                        Send Challenge ⚔️
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Quick Challenge - Potential Rivals */}
                    <div className="potential-rivals">
                        <div className="rivals-section-title">🎯 Potential Rivals</div>
                        <div className="rivals-list">
                            {potentialRivals.map((rival, idx) => (
                                <div key={idx} className="rival-card">
                                    <div className="rival-info">
                                        <div className="rival-name">
                                            {rival.name}
                                            <span className={`rival-status ${rival.status}`}>●</span>
                                        </div>
                                        <div className="rival-stats">
                                            Score: {rival.score} • Lvl {rival.level}
                                        </div>
                                    </div>
                                    <div className="rival-matchup">
                                        <div className="matchup-percent">{rival.matchup}</div>
                                        <div className="matchup-label">win chance</div>
                                    </div>
                                    <button 
                                        className="quick-challenge-btn"
                                        onClick={() => quickChallenge(rival.name)}
                                    >
                                        ⚔️
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Active Beefs */}
                    <div className="active-beefs">
                        <div className="rivals-section-title">🔥 Active Beefs</div>
                        {activeBeefs.filter(b => b.status === 'active').map((beef, idx) => (
                            <div key={idx} className="beef-card active">
                                <div className="beef-header">
                                    <div className="beef-players">
                                        <span className="beef-player challenger">{beef.challenger}</span>
                                        <span className="beef-vs">⚔️</span>
                                        <span className="beef-player defender">{beef.defender}</span>
                                    </div>
                                    <div className="beef-stake">{beef.stake}</div>
                                </div>
                                <div className="beef-scores">
                                    <div className="beef-score challenger">
                                        <span className="score-value">{beef.challengerScore}</span>
                                        <span className="score-label">pts</span>
                                    </div>
                                    <div className="beef-diff">
                                        {beef.challengerScore > beef.defenderScore ? (
                                            <span style={{ color: '#00ff88' }}>+{beef.challengerScore - beef.defenderScore}</span>
                                        ) : (
                                            <span style={{ color: '#ff6b6b' }}>{beef.challengerScore - beef.defenderScore}</span>
                                        )}
                                    </div>
                                    <div className="beef-score defender">
                                        <span className="score-value">{beef.defenderScore}</span>
                                        <span className="score-label">pts</span>
                                    </div>
                                </div>
                                <div className="beef-mayor-comment">
                                    <span style={{ marginRight: '8px' }}>🎩</span>
                                    {beef.mayorComment}
                                </div>
                                <div className="beef-footer">
                                    <span>Started {beef.startedAt}</span>
                                    <span className="beef-live">🔴 LIVE</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Recent Results */}
                    <div className="beef-results">
                        <div className="rivals-section-title">🏆 Recent Results</div>
                        {activeBeefs.filter(b => b.status === 'complete').map((beef, idx) => (
                            <div key={idx} className="beef-card complete">
                                <div className="beef-header">
                                    <div className="beef-players">
                                        <span className={`beef-player ${beef.winner === beef.challenger ? 'winner' : 'loser'}`}>
                                            {beef.winner === beef.challenger && '👑 '}{beef.challenger}
                                        </span>
                                        <span className="beef-vs">vs</span>
                                        <span className={`beef-player ${beef.winner === beef.defender ? 'winner' : 'loser'}`}>
                                            {beef.winner === beef.defender && '👑 '}{beef.defender}
                                        </span>
                                    </div>
                                    <div className="beef-stake won">+{beef.stake}</div>
                                </div>
                                <div className="beef-mayor-comment result">
                                    <span style={{ marginRight: '8px' }}>🎩</span>
                                    {beef.mayorComment}
                                </div>
                                <div className="beef-footer">
                                    <span>Ended {beef.completedAt}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== MAYOR'S HOT TAKES TICKER ====================

function RoastLeaderboard({ playerName }) {
    const [activeTab, setActiveTab] = useState('detectors');
    const [expanded, setExpanded] = useState(false);
    
    // Get player's roast stats from localStorage
    const getPlayerRoastStats = () => {
        const highScore = parseInt(localStorage.getItem('is_this_cap_highscore') || '0');
        const gamesPlayed = parseInt(localStorage.getItem('is_this_cap_games') || '0');
        return { highScore, gamesPlayed };
    };
    
    const playerStats = getPlayerRoastStats();
    
    // Top Cap Detectors (players who are good at spotting BS)
    const topDetectors = [
        { rank: 1, name: 'cap_hunter_9000', score: 2850, streak: 12, accuracy: '94%', badge: '🏆' },
        { rank: 2, name: 'bs_detector_pro', score: 2640, streak: 10, accuracy: '91%', badge: '🥈' },
        { rank: 3, name: 'truth_seeker', score: 2410, streak: 8, accuracy: '89%', badge: '🥉' },
        { rank: 4, name: 'roast_master', score: 2180, streak: 9, accuracy: '87%', badge: '' },
        { rank: 5, name: 'vibe_checker', score: 1950, streak: 7, accuracy: '85%', badge: '' },
        { rank: 6, name: 'cap_police', score: 1820, streak: 6, accuracy: '84%', badge: '' },
        { rank: 7, name: 'fraud_finder', score: 1690, streak: 5, accuracy: '82%', badge: '' },
        { rank: 8, name: 'skeptic_supreme', score: 1540, streak: 5, accuracy: '80%', badge: '' },
    ];
    
    // Wall of Shame - Most roasted bio types
    const wallOfShame = [
        { rank: 1, type: 'Fake IQ Claims', example: 'IQ 250+', roasts: 1247, icon: '🧠', shame: '🧢🧢🧢' },
        { rank: 2, type: '100% Win Rate', example: 'Never lost a trade', roasts: 1089, icon: '📈', shame: '🧢🧢🧢' },
        { rank: 3, type: 'Serial Entrepreneur', example: '10+ exits', roasts: 982, icon: '💼', shame: '🧢🧢' },
        { rank: 4, type: 'Thought Leader', example: 'Self-proclaimed visionary', roasts: 876, icon: '💭', shame: '🧢🧢' },
        { rank: 5, type: 'Grindset Guru', example: 'Wake up at 3AM', roasts: 754, icon: '⏰', shame: '🧢🧢' },
        { rank: 6, type: 'Crypto Oracle', example: 'Predicted BTC at $1', roasts: 698, icon: '🔮', shame: '🧢' },
        { rank: 7, type: 'Stealth Founder', example: 'Building in stealth for 3 years', roasts: 621, icon: '🥷', shame: '🧢' },
        { rank: 8, type: 'NFT Whale', example: 'Own 100 Bored Apes', roasts: 543, icon: '🖼️', shame: '🧢' },
    ];
    
    // Hall of Fame - Actually legit people (rare)
    const hallOfFame = [
        { rank: 1, name: 'Vitalik Buterin', handle: '@VitalikButerin', bio: 'Ethereum', respect: 2341, icon: '✅' },
        { rank: 2, name: 'Naval', handle: '@naval', bio: 'Angel investor', respect: 1987, icon: '✅' },
        { rank: 3, name: 'Satoshi Nakamoto', handle: '@satoshi', bio: '...', respect: 1876, icon: '👻' },
        { rank: 4, name: 'Humble Devs', handle: '@various', bio: 'Just building', respect: 1654, icon: '✅' },
    ];
    
    // Find player's rank
    const getPlayerRank = () => {
        if (playerStats.highScore === 0) return null;
        const rank = topDetectors.findIndex(d => playerStats.highScore > d.score) + 1;
        return rank > 0 ? rank : topDetectors.length + 1;
    };
    
    const playerRank = getPlayerRank();
    
    return (
        <div className="roast-leaderboard">
            <div 
                className="roast-leaderboard-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🏆</span>
                    <span>Roast Leaderboard</span>
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="roast-leaderboard-content">
                    {/* Player Stats Banner */}
                    {playerStats.highScore > 0 && (
                        <div className="player-roast-stats">
                            <div className="player-roast-stat">
                                <span className="stat-value">{playerStats.highScore}</span>
                                <span className="stat-label">Your Best</span>
                            </div>
                            <div className="player-roast-stat">
                                <span className="stat-value">#{playerRank || '?'}</span>
                                <span className="stat-label">Your Rank</span>
                            </div>
                            <div className="player-roast-stat">
                                <span className="stat-value">{playerStats.gamesPlayed}</span>
                                <span className="stat-label">Games</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Tabs */}
                    <div className="roast-lb-tabs">
                        <button 
                            className={`roast-lb-tab ${activeTab === 'detectors' ? 'active' : ''}`}
                            onClick={() => setActiveTab('detectors')}
                        >
                            🔍 Top Detectors
                        </button>
                        <button 
                            className={`roast-lb-tab ${activeTab === 'shame' ? 'active' : ''}`}
                            onClick={() => setActiveTab('shame')}
                        >
                            🧢 Wall of Shame
                        </button>
                        <button 
                            className={`roast-lb-tab ${activeTab === 'fame' ? 'active' : ''}`}
                            onClick={() => setActiveTab('fame')}
                        >
                            ✅ Hall of Fame
                        </button>
                    </div>
                    
                    {/* Top Detectors Tab */}
                    {activeTab === 'detectors' && (
                        <div className="roast-lb-list">
                            {topDetectors.map((player, idx) => (
                                <div key={idx} className={`roast-lb-entry ${idx < 3 ? 'top-3' : ''}`}>
                                    <div className="roast-lb-rank">
                                        {player.badge || `#${player.rank}`}
                                    </div>
                                    <div className="roast-lb-info">
                                        <div className="roast-lb-name">{player.name}</div>
                                        <div className="roast-lb-meta">
                                            🔥 {player.streak} streak • {player.accuracy} accuracy
                                        </div>
                                    </div>
                                    <div className="roast-lb-score">{player.score.toLocaleString()}</div>
                                </div>
                            ))}
                            
                            {/* Show player if not in top 8 */}
                            {playerStats.highScore > 0 && playerRank > 8 && (
                                <>
                                    <div className="roast-lb-divider">• • •</div>
                                    <div className="roast-lb-entry you">
                                        <div className="roast-lb-rank">#{playerRank}</div>
                                        <div className="roast-lb-info">
                                            <div className="roast-lb-name">{playerName} (You)</div>
                                            <div className="roast-lb-meta">Keep playing to climb!</div>
                                        </div>
                                        <div className="roast-lb-score">{playerStats.highScore.toLocaleString()}</div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    
                    {/* Wall of Shame Tab */}
                    {activeTab === 'shame' && (
                        <div className="roast-lb-list">
                            <div className="shame-intro">
                                Most common BS claims spotted by Degens City citizens:
                            </div>
                            {wallOfShame.map((item, idx) => (
                                <div key={idx} className={`roast-lb-entry shame ${idx < 3 ? 'top-3' : ''}`}>
                                    <div className="roast-lb-rank shame-icon">{item.icon}</div>
                                    <div className="roast-lb-info">
                                        <div className="roast-lb-name">{item.type}</div>
                                        <div className="roast-lb-meta">
                                            "{item.example}" {item.shame}
                                        </div>
                                    </div>
                                    <div className="roast-lb-score shame-count">
                                        {item.roasts.toLocaleString()}
                                        <span style={{ fontSize: '0.7em', display: 'block', color: '#888' }}>roasts</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* Hall of Fame Tab */}
                    {activeTab === 'fame' && (
                        <div className="roast-lb-list">
                            <div className="fame-intro">
                                Accounts with humble, verifiable bios. Real ones don't flex:
                            </div>
                            {hallOfFame.map((item, idx) => (
                                <div key={idx} className="roast-lb-entry fame">
                                    <div className="roast-lb-rank fame-icon">{item.icon}</div>
                                    <div className="roast-lb-info">
                                        <div className="roast-lb-name">{item.name}</div>
                                        <div className="roast-lb-meta">
                                            {item.handle} • "{item.bio}"
                                        </div>
                                    </div>
                                    <div className="roast-lb-score fame-count">
                                        {item.respect.toLocaleString()}
                                        <span style={{ fontSize: '0.7em', display: 'block', color: '#00ff88' }}>respect</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== CITIZEN RIVALRIES ====================

function LiveActivityFeed({ playerName, onPlayerClick }) {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Fetch activities from backend
    const fetchActivities = async () => {
        try {
            const response = await fetch(API_BASE + '/api/activity/recent?limit=10');
            const data = await response.json();
            
            if (data.success && data.activities.length > 0) {
                setActivities(data.activities);
            } else {
                // Fallback to generated activities if none exist
                generateFallbackActivities();
            }
        } catch (err) {
            console.error('Failed to fetch activities:', err);
            generateFallbackActivities();
        }
        setLoading(false);
    };
    
    // Generate fallback activities for new servers
    const generateFallbackActivities = () => {
        const names = ['alex_trades', 'ser_pump', 'degen_mike', 'alpha_hunter', 'moon_chaser', playerName || 'anon'];
        const actionTemplates = [
            { icon: '🎰', text: 'won big in the casino' },
            { icon: '🗳️', text: 'voted on governance' },
            { icon: '🎯', text: 'scored high in Token Sniper' },
            { icon: '🎮', text: 'played a game' },
            { icon: '💰', text: 'earned resources' }
        ];
        
        const generated = Array(5).fill(null).map((_, i) => {
            const name = names[Math.floor(Math.random() * names.length)];
            const action = actionTemplates[Math.floor(Math.random() * actionTemplates.length)];
            return {
                id: Date.now() + i,
                playerName: name,
                icon: action.icon,
                description: action.text,
                timeAgo: `${Math.floor(Math.random() * 30) + 1}m ago`
            };
        });
        setActivities(generated);
    };
    
    useEffect(() => {
        fetchActivities();
        // Poll for new activities every 30 seconds
        const interval = setInterval(fetchActivities, 30000);
        return () => clearInterval(interval);
    }, [playerName]);
    
    // Handle click on player name
    const handlePlayerClick = (name) => {
        if (name && name !== playerName && onPlayerClick) {
            onPlayerClick(name);
        }
    };
    
    return (
        <div className="activity-feed">
            <h3 style={{ color: '#00ff88', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📡 Live Activity
                <span style={{ width: '8px', height: '8px', background: '#00ff88', borderRadius: '50%', animation: 'pulse 1s infinite' }}></span>
            </h3>
            
            {loading ? (
                <div>
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className="skeleton-activity">
                            <div className="skeleton skeleton-activity-icon"></div>
                            <div className="skeleton skeleton-activity-text" style={{ width: `${50 + Math.random() * 40}%` }}></div>
                            <div className="skeleton skeleton-activity-time"></div>
                        </div>
                    ))}
                </div>
            ) : activities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No activity yet</div>
            ) : (
                activities.map(activity => (
                    <div key={activity.id} className="activity-item">
                        <span className="activity-icon">{activity.icon}</span>
                        <span className="activity-text">
                            <strong 
                                className="chat-player-name"
                                onClick={() => handlePlayerClick(activity.playerName)}
                                style={{ cursor: activity.playerName !== playerName ? 'pointer' : 'default' }}
                            >
                                {activity.playerName}
                            </strong>
                            {' '}{activity.description}
                        </span>
                        <span className="activity-time">
                            {activity.timeAgo}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
}

// ==================== DAILY PUZZLE (Crypto Wordle) ====================

function LiveCityFeed() {
    const [feed, setFeed] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    
    useEffect(function() {
        var fetchFeed = async function() {
            try {
                var chatRes = await fetch(API_BASE + '/api/chat/global?limit=60');
                var chatData = await chatRes.json();
                var items = [];
                if (chatData.success && chatData.messages) {
                    chatData.messages.forEach(function(m) {
                        var type = 'chat';
                        var name = m.name || '';
                        var text = m.text || '';
                        if (name.includes('BREAKING') || name.includes('DRAMA') || name.includes('City Development')) type = 'event';
                        else if (name.includes('Mayor') || name.includes('🎩')) type = 'mayor';
                        else if (name.includes('Reporter') || name.includes('📰')) type = 'news';
                        else if (name.includes('Market Pulse')) type = 'trade';
                        else if (name.includes('Officer') || name.includes('Judge') || name.includes('Court') || name.includes('Detective')) type = 'crime';
                        else if (text.includes('bought') || text.includes('sold') || text.includes('APED') || text.includes('opened a') || text.includes('YOLO')) type = 'trade';
                        else if (text.includes('ARRESTED') || text.includes('GUILTY') || text.includes('CRIME') || text.includes('CASE:')) type = 'crime';
                        else if (text.includes('LAUNCHED') || text.includes('launched $') || text.includes('RUGGED')) type = 'event';
                        else if (text.includes('PROTEST') || text.includes('RIOT') || text.includes('FACTION') || text.includes('CULT') || text.includes('HACK')) type = 'event';
                        items.push({ id: 'c' + m.id, name: name, text: text, time: m.time, timestamp: m.timestamp, type: type });
                    });
                }
                items.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });
                setFeed(items.slice(0, 80));
            } catch(e) { console.error('Feed error:', e); }
            setLoading(false);
        };
        fetchFeed();
        var interval = setInterval(fetchFeed, 8000);
        return function() { clearInterval(interval); };
    }, []);
    
    var filtered = filter === 'all' ? feed : feed.filter(function(f) { return f.type === filter; });
    var typeColors = { event: '#ff6600', mayor: '#ffd700', trade: '#00ff88', crime: '#ff4444', news: '#4488ff', chat: '#888' };
    var typeEmojis = { event: '⚡', mayor: '🎩', trade: '💱', crime: '🚨', news: '📰', chat: '💬' };
    
    return React.createElement('div', { className: 'card', style: { padding: '20px' } },
        React.createElement('h2', { style: { color: '#ffd700', marginBottom: '15px' } }, '📜 Live City Feed ', React.createElement('span', { style: { fontSize: '0.5em', color: '#00ff88', animation: 'pulse 2s infinite' } }, '● LIVE')),
        React.createElement('div', { style: { display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' } },
            ['all', 'event', 'trade', 'crime', 'mayor', 'news', 'chat'].map(function(f) {
                return React.createElement('button', { key: f, onClick: function() { setFilter(f); }, style: { padding: '6px 12px', borderRadius: '20px', border: filter === f ? '1px solid ' + (typeColors[f] || '#ffd700') : '1px solid rgba(255,255,255,0.1)', background: filter === f ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.03)', color: filter === f ? (typeColors[f] || '#ffd700') : '#888', fontSize: '0.8em', cursor: 'pointer', fontFamily: 'inherit' } },
                    (typeEmojis[f] || '📋') + ' ' + f.charAt(0).toUpperCase() + f.slice(1)
                );
            })
        ),
        React.createElement('div', { style: { maxHeight: '500px', overflowY: 'auto' } },
            loading ? React.createElement('div', { style: { textAlign: 'center', color: '#888', padding: '30px' } }, 'Loading feed...') :
            filtered.length === 0 ? React.createElement('div', { style: { textAlign: 'center', color: '#555', padding: '30px' } }, 'Feed loading... city engine is generating events. Refresh in a moment! 🌆') :
            filtered.map(function(item) {
                return React.createElement('div', { key: item.id, style: { display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'flex-start' } },
                    React.createElement('div', { style: { fontSize: '1.2em', minWidth: '28px', textAlign: 'center' } }, typeEmojis[item.type] || '📝'),
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' } },
                            React.createElement('span', { style: { color: typeColors[item.type] || '#888', fontWeight: 'bold', fontSize: '0.85em' } }, item.name),
                            React.createElement('span', { style: { color: '#555', fontSize: '0.75em' } }, item.time)
                        ),
                        React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em', wordBreak: 'break-word' } }, item.text)
                    )
                );
            })
        )
    );
}

// ==================== NPC TRADES FEED ====================

function NpcTradesFeed() {
    const [trades, setTrades] = useState([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchTrades = async () => {
            try {
                const res = await fetch(API_BASE + '/api/chat/global?limit=50');
                const data = await res.json();
                if (data.success) {
                    const tradeMessages = data.messages.filter(m => 
                        m.text.includes('bought') || m.text.includes('sold') || m.text.includes('APED') || 
                        m.text.includes('opened a') || m.text.includes('accumulated') || m.text.includes('YOLO') ||
                        m.text.includes('closed my') || m.text.includes('SELLING') || m.text.includes('going all in')
                    );
                    setTrades(tradeMessages.slice(0, 20));
                }
            } catch(e) { console.error('Trades feed error:', e); }
            setLoading(false);
        };
        fetchTrades();
        const interval = setInterval(fetchTrades, 12000);
        return () => clearInterval(interval);
    }, []);
    
    return React.createElement('div', { className: 'card', style: { padding: '20px' } },
        React.createElement('h2', { style: { color: '#00ff88', marginBottom: '15px' } }, '💱 Live NPC Trades ', React.createElement('span', { style: { fontSize: '0.5em', color: '#00ff88' } }, '● LIVE')),
        React.createElement('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
            loading ? React.createElement('div', { style: { textAlign: 'center', color: '#888', padding: '30px' } }, 'Loading trades...') :
            trades.length === 0 ? React.createElement('div', { style: { textAlign: 'center', color: '#888', padding: '30px' } }, 'No trades yet — NPC traders are warming up...') :
            trades.map(t => React.createElement('div', { key: t.id, style: { display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                React.createElement('div', { style: { fontSize: '1.2em' } }, t.text.includes('sold') || t.text.includes('SELLING') || t.text.includes('closed') ? '📉' : '📈'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.85em' } }, t.name),
                    React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em' } }, t.text)
                ),
                React.createElement('div', { style: { color: '#555', fontSize: '0.75em', whiteSpace: 'nowrap' } }, t.time)
            ))
        )
    );
}

// ==================== CITY ENGINE EVENTS LOG ====================

function ChatMessageWithReactions({ msg, playerName, handleNameClick, renderMessageText }) {
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [reactions, setReactions] = useState(() => {
        const saved = localStorage.getItem(`chat_reactions_${msg.id}`);
        return saved ? JSON.parse(saved) : {};
    });
    const [userReaction, setUserReaction] = useState(() => {
        return localStorage.getItem(`my_reaction_${msg.id}`) || null;
    });
    const [showQuickReact, setShowQuickReact] = useState(false);
    
    // Expanded emoji categories
    const reactionCategories = {
        popular: ['🔥', '😂', '🚀', '💎', '🧢', '❤️', '👀', '💀'],
        bullish: ['📈', '🐂', '💰', '🤑', '🌙', '💪', '🎯', '✅'],
        bearish: ['📉', '🐻', '😭', '💸', '🪦', '⚰️', '📊', '❌'],
        meme: ['🦍', '🐶', '🐸', '😤', '🤡', '👑', '🧠', '⏰']
    };
    
    const [activeCategory, setActiveCategory] = useState('popular');
    
    const handleReaction = (emoji) => {
        // Remove previous reaction if clicking same emoji
        if (userReaction === emoji) {
            const newReactions = { ...reactions };
            newReactions[emoji] = Math.max(0, (newReactions[emoji] || 1) - 1);
            if (newReactions[emoji] === 0) delete newReactions[emoji];
            setReactions(newReactions);
            setUserReaction(null);
            localStorage.removeItem(`my_reaction_${msg.id}`);
            localStorage.setItem(`chat_reactions_${msg.id}`, JSON.stringify(newReactions));
        } else {
            // Remove old reaction first
            const newReactions = { ...reactions };
            if (userReaction) {
                newReactions[userReaction] = Math.max(0, (newReactions[userReaction] || 1) - 1);
                if (newReactions[userReaction] === 0) delete newReactions[userReaction];
            }
            // Add new reaction
            newReactions[emoji] = (newReactions[emoji] || 0) + 1;
            setReactions(newReactions);
            setUserReaction(emoji);
            localStorage.setItem(`my_reaction_${msg.id}`, emoji);
            localStorage.setItem(`chat_reactions_${msg.id}`, JSON.stringify(newReactions));
        }
        setShowReactionPicker(false);
        setShowQuickReact(false);
    };
    
    const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);
    
    // Sort reactions by count
    const sortedReactions = Object.entries(reactions).sort((a, b) => b[1] - a[1]);
    
    return (
        <div 
            className={`chat-message ${msg.name === playerName ? 'own-message' : ''} ${msg.system ? 'system' : ''}`}
            onMouseEnter={() => setShowQuickReact(true)}
            onMouseLeave={() => { setShowQuickReact(false); setShowReactionPicker(false); }}
        >
            <div className="chat-message-header">
                <span 
                    className={`chat-message-name ${msg.name !== playerName ? 'chat-player-name' : ''}`}
                    style={msg.name === playerName ? { color: '#00ff88' } : {}}
                    onClick={() => handleNameClick(msg.name)}
                >
                    {msg.name === playerName ? `${msg.name} (You)` : msg.name}
                </span>
                <span className="chat-message-time">{msg.time}</span>
                
                {/* Quick react on hover */}
                {showQuickReact && !showReactionPicker && (
                    <div className="quick-react-bar">
                        {reactionCategories.popular.slice(0, 4).map(emoji => (
                            <button
                                key={emoji}
                                className={`quick-react-btn ${userReaction === emoji ? 'active' : ''}`}
                                onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                            >
                                {emoji}
                            </button>
                        ))}
                        <button
                            className="quick-react-btn more"
                            onClick={(e) => { e.stopPropagation(); setShowReactionPicker(true); }}
                        >
                            +
                        </button>
                    </div>
                )}
            </div>
            <div className="chat-message-text">{renderMessageText(msg.text, msg.mentions)}</div>
            
            {/* Reactions Display */}
            <div className="chat-reactions-row">
                {/* Existing reactions - sorted by popularity */}
                {sortedReactions.map(([emoji, count]) => (
                    <button
                        key={emoji}
                        className={`reaction-chip ${userReaction === emoji ? 'active' : ''}`}
                        onClick={() => handleReaction(emoji)}
                        title={`${count} reaction${count > 1 ? 's' : ''}`}
                    >
                        <span className="reaction-emoji">{emoji}</span>
                        <span className="reaction-count">{count}</span>
                    </button>
                ))}
                
                {/* Add reaction button */}
                <div className="reaction-picker-container">
                    <button 
                        className="add-reaction-btn"
                        onClick={() => setShowReactionPicker(!showReactionPicker)}
                    >
                        {showReactionPicker ? '✕' : '😀+'}
                    </button>
                    
                    {showReactionPicker && (
                        <div className="reaction-picker enhanced">
                            {/* Category tabs */}
                            <div className="reaction-categories">
                                <button 
                                    className={`category-btn ${activeCategory === 'popular' ? 'active' : ''}`}
                                    onClick={() => setActiveCategory('popular')}
                                    style={{ fontSize: '1.2em', lineHeight: 1 }}
                                >
                                    ⭐
                                </button>
                                <button 
                                    className={`category-btn ${activeCategory === 'bullish' ? 'active' : ''}`}
                                    onClick={() => setActiveCategory('bullish')}
                                    style={{ fontSize: '1.2em', lineHeight: 1 }}
                                >
                                    📈
                                </button>
                                <button 
                                    className={`category-btn ${activeCategory === 'bearish' ? 'active' : ''}`}
                                    onClick={() => setActiveCategory('bearish')}
                                    style={{ fontSize: '1.2em', lineHeight: 1 }}
                                >
                                    📉
                                </button>
                                <button 
                                    className={`category-btn ${activeCategory === 'meme' ? 'active' : ''}`}
                                    onClick={() => setActiveCategory('meme')}
                                    style={{ fontSize: '1.2em', lineHeight: 1 }}
                                >
                                    🦍
                                </button>
                            </div>
                            
                            {/* Emoji grid */}
                            <div className="reaction-emoji-grid">
                                {reactionCategories[activeCategory].map(emoji => (
                                    <button
                                        key={emoji}
                                        className={`reaction-option ${userReaction === emoji ? 'selected' : ''}`}
                                        onClick={() => handleReaction(emoji)}
                                        style={{
                                            fontSize: '1.5em',
                                            lineHeight: 1,
                                            color: 'white',
                                            WebkitFontSmoothing: 'antialiased'
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Total reactions indicator */}
                {totalReactions > 0 && (
                    <span className="total-reactions-count">
                        {totalReactions} reaction{totalReactions > 1 ? 's' : ''}
                    </span>
                )}
            </div>
        </div>
    );
}

// ==================== MAYOR APPROVAL RATING ====================

function PredictionStreaks({ playerName }) {
    const [streakData, setStreakData] = useState(() => {
        const saved = localStorage.getItem('prediction_streak_data');
        return saved ? JSON.parse(saved) : {
            currentStreak: 0,
            bestStreak: 0,
            totalWins: 0,
            totalLosses: 0,
            lastResult: null,
            streakRewards: [],
            milestones: []
        };
    });
    const [expanded, setExpanded] = useState(false);
    const [showReward, setShowReward] = useState(null);
    
    // Streak milestones and rewards
    const streakMilestones = [
        { streak: 3, reward: 100, title: 'Lucky Start', emoji: '🍀', badge: 'bronze' },
        { streak: 5, reward: 250, title: 'On Fire', emoji: '🔥', badge: 'silver' },
        { streak: 7, reward: 500, title: 'Prediction God', emoji: '🔮', badge: 'gold' },
        { streak: 10, reward: 1000, title: 'Oracle', emoji: '👁️', badge: 'diamond' },
        { streak: 15, reward: 2500, title: 'Time Traveler', emoji: '⏰', badge: 'legendary' },
        { streak: 20, reward: 5000, title: 'Market Manipulator', emoji: '🐋', badge: 'mythic' },
    ];
    
    // Get next milestone
    const getNextMilestone = () => {
        return streakMilestones.find(m => m.streak > streakData.currentStreak) || streakMilestones[streakMilestones.length - 1];
    };
    
    // Get achieved milestones
    const getAchievedMilestones = () => {
        return streakMilestones.filter(m => streakData.bestStreak >= m.streak);
    };
    
    // Calculate win rate
    const getWinRate = () => {
        const total = streakData.totalWins + streakData.totalLosses;
        if (total === 0) return 0;
        return Math.round((streakData.totalWins / total) * 100);
    };
    
    // Streak multiplier for rewards
    const getStreakMultiplier = () => {
        if (streakData.currentStreak >= 10) return 3.0;
        if (streakData.currentStreak >= 7) return 2.5;
        if (streakData.currentStreak >= 5) return 2.0;
        if (streakData.currentStreak >= 3) return 1.5;
        return 1.0;
    };
    
    const nextMilestone = getNextMilestone();
    const achievedMilestones = getAchievedMilestones();
    const winRate = getWinRate();
    const multiplier = getStreakMultiplier();
    
    const getBadgeColor = (badge) => {
        switch(badge) {
            case 'bronze': return '#cd7f32';
            case 'silver': return '#c0c0c0';
            case 'gold': return '#ffd700';
            case 'diamond': return '#00d4ff';
            case 'legendary': return '#ff6b6b';
            case 'mythic': return '#8a2be2';
            default: return '#888';
        }
    };
    
    return (
        <div className="prediction-streaks">
            <div 
                className="streak-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔥</span>
                    <span>Prediction Streaks</span>
                    {streakData.currentStreak >= 3 && (
                        <span className="streak-active-badge">
                            {streakData.currentStreak}🔥 ACTIVE
                        </span>
                    )}
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="streak-content">
                    {/* Current Streak Display */}
                    <div className="streak-main-display">
                        <div className="streak-fire-container">
                            <div className={`streak-number ${streakData.currentStreak >= 5 ? 'on-fire' : ''}`}>
                                {streakData.currentStreak}
                            </div>
                            <div className="streak-label">Current Streak</div>
                            {multiplier > 1 && (
                                <div className="streak-multiplier">
                                    {multiplier}x Rewards Active!
                                </div>
                            )}
                        </div>
                        
                        <div className="streak-progress-container">
                            <div className="streak-progress-label">
                                Next: {nextMilestone.emoji} {nextMilestone.title}
                            </div>
                            <div className="streak-progress-bar">
                                <div 
                                    className="streak-progress-fill"
                                    style={{ 
                                        width: `${Math.min(100, (streakData.currentStreak / nextMilestone.streak) * 100)}%`,
                                        background: getBadgeColor(nextMilestone.badge)
                                    }}
                                ></div>
                            </div>
                            <div className="streak-progress-text">
                                {streakData.currentStreak}/{nextMilestone.streak} • +{nextMilestone.reward} HOPIUM
                            </div>
                        </div>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="streak-stats-grid">
                        <div className="streak-stat">
                            <span className="stat-value">{streakData.bestStreak}</span>
                            <span className="stat-label">Best Streak</span>
                        </div>
                        <div className="streak-stat">
                            <span className="stat-value">{streakData.totalWins}</span>
                            <span className="stat-label">Total Wins</span>
                        </div>
                        <div className="streak-stat">
                            <span className="stat-value">{winRate}%</span>
                            <span className="stat-label">Win Rate</span>
                        </div>
                        <div className="streak-stat">
                            <span className="stat-value" style={{ color: multiplier > 1 ? '#00ff88' : '#888' }}>
                                {multiplier}x
                            </span>
                            <span className="stat-label">Multiplier</span>
                        </div>
                    </div>
                    
                    {/* Milestones */}
                    <div className="streak-milestones">
                        <div className="milestones-title">🏆 Streak Milestones</div>
                        <div className="milestones-grid">
                            {streakMilestones.map((milestone, idx) => {
                                const achieved = streakData.bestStreak >= milestone.streak;
                                return (
                                    <div 
                                        key={idx} 
                                        className={`milestone-item ${achieved ? 'achieved' : 'locked'}`}
                                        style={{ borderColor: achieved ? getBadgeColor(milestone.badge) : 'transparent' }}
                                    >
                                        <div className="milestone-emoji">
                                            {achieved ? milestone.emoji : '🔒'}
                                        </div>
                                        <div className="milestone-info">
                                            <div className="milestone-title">{milestone.title}</div>
                                            <div className="milestone-req">{milestone.streak} streak</div>
                                        </div>
                                        <div 
                                            className="milestone-reward"
                                            style={{ color: achieved ? getBadgeColor(milestone.badge) : '#555' }}
                                        >
                                            +{milestone.reward}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    
                    {/* Streak Tips */}
                    <div className="streak-tips">
                        <div className="tip-title">💡 Pro Tips</div>
                        <ul className="tips-list">
                            <li>Build streaks for bigger multipliers (up to 3x!)</li>
                            <li>Hit milestones for bonus HOPIUM rewards</li>
                            <li>One wrong prediction resets your streak</li>
                            <li>Win rate matters for long-term gains</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== CHAT MESSAGE WITH REACTIONS ====================

