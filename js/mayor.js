// ====================================================
// mayor.js — Mayor-related components
// Degens City - Auto-extracted from index.html
// ====================================================

function MayorInbox({ character, showToast, reputation, onNavigate }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeMission, setActiveMission] = useState(() => {
        try { return JSON.parse(localStorage.getItem('dc_active_mission')); } catch(e) { return null; }
    });
    const [missionExpiry, setMissionExpiry] = useState(() => {
        return parseInt(localStorage.getItem('dc_mission_expiry') || '0');
    });
    const [missionTimeLeft, setMissionTimeLeft] = useState('');
    const [claimingReward, setClaimingReward] = useState(false);
    var playerName = character?.name || 'Citizen';
    var playerLevel = character?.level || 1;
    
    // Generate personalized mayor messages based on rep & level
    useEffect(function() {
        var generateMessages = async function() {
            try {
                var res = await fetch(API_BASE + '/api/ai/mayor-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        playerName: playerName,
                        message: '[SYSTEM] Generate 1-2 personal DMs from Mayor Satoshi to this player. Player rep: ' + reputation + ', level: ' + playerLevel + '. If rep > 50 be friendly and offer opportunities. If rep < -20 be threatening. If rep is mid, be sarcastic. Include a MISSION assignment — send them to a specific city location to do something. Keep each message under 60 words. Format: JSON array of {type: "dm"|"mission"|"threat"|"opportunity", text: "...", missionLocation: "casino|dark_alley|mayors_office|trading_floor|courthouse|town_square|underground", missionReward: {xp: number, rep: number}}',
                        context: 'mayor_inbox'
                    })
                });
                var data = await res.json();
                if (data.success && data.response) {
                    // Try to parse AI response as JSON
                    try {
                        var cleaned = data.response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                        var parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) { setMessages(parsed); setLoading(false); return; }
                    } catch(e) {}
                }
            } catch(e) {}
            // Fallback messages based on rep
            var fallback = [];
            if (reputation > 50) {
                fallback.push({ type: 'dm', text: playerName + '! My favorite citizen. I\'ve got something special for you. The Trading Floor has been acting suspicious — go check it out and report back. You\'re one of the few I trust.' });
                fallback.push({ type: 'mission', text: 'MISSION: Investigate suspicious activity on the Trading Floor. I need eyes I can trust.', missionLocation: 'trading_floor', missionReward: { xp: 300, rep: 25 } });
            } else if (reputation < -20) {
                fallback.push({ type: 'threat', text: 'Listen here, ' + playerName + '. Your reputation is in the gutter. I\'ve got the police watching you. One more stunt and you\'re done in this city. Consider this your LAST warning.' });
                fallback.push({ type: 'mission', text: 'REDEMPTION MISSION: Go to the Courthouse and turn yourself in for community service. It\'s this or exile.', missionLocation: 'courthouse', missionReward: { xp: 200, rep: 40 } });
            } else {
                fallback.push({ type: 'dm', text: playerName + ', you\'re... fine I guess. Not great, not terrible. Like a mid-tier memecoin — could moon, could rug. Prove yourself in the Dark Alley tonight.' });
                fallback.push({ type: 'mission', text: 'MISSION: Something\'s going down in the Dark Alley. Go investigate and don\'t get yourself killed. Or do. I don\'t care that much.', missionLocation: 'dark_alley', missionReward: { xp: 250, rep: 15 } });
            }
            setMessages(fallback);
            setLoading(false);
        };
        generateMessages();
        var iv = setInterval(generateMessages, 180000); // Refresh every 3 min
        return function() { clearInterval(iv); };
    }, [reputation, playerLevel]);
    
    // Mission timer
    useEffect(function() {
        if (!activeMission || !missionExpiry) { setMissionTimeLeft(''); return; }
        var iv = setInterval(function() {
            var diff = missionExpiry - Date.now();
            if (diff <= 0) {
                setMissionTimeLeft('EXPIRED');
                setActiveMission(null);
                localStorage.removeItem('dc_active_mission');
                localStorage.removeItem('dc_mission_expiry');
                if (showToast) showToast('⏰ Mission expired! Mayor is disappointed...', 'error');
                clearInterval(iv);
                return;
            }
            var m = Math.floor(diff / 60000);
            var s = Math.floor((diff % 60000) / 1000);
            setMissionTimeLeft(m + ':' + (s < 10 ? '0' : '') + s);
        }, 1000);
        return function() { clearInterval(iv); };
    }, [activeMission, missionExpiry]);
    
    var acceptMission = function(msg) {
        var mission = { location: msg.missionLocation, reward: msg.missionReward || { xp: 200, rep: 15 }, text: msg.text, acceptedAt: Date.now() };
        var expiry = Date.now() + 600000; // 10 min to complete
        setActiveMission(mission);
        setMissionExpiry(expiry);
        localStorage.setItem('dc_active_mission', JSON.stringify(mission));
        localStorage.setItem('dc_mission_expiry', expiry.toString());
        if (showToast) showToast('🎯 Mission accepted! You have 10 minutes.', 'success');
    };
    
    var typeIcons = { dm: '💬', mission: '🎯', threat: '🚨', opportunity: '💎', callout: '📢' };
    var typeColors = { dm: '#4488ff', mission: '#ffd700', threat: '#ff4444', opportunity: '#00ff88', callout: '#ff8800' };
    
    return React.createElement('div', { style: { background: 'linear-gradient(135deg, rgba(138,43,226,0.08), rgba(75,0,130,0.12))', border: '1px solid rgba(138,43,226,0.2)', borderRadius: '16px', padding: '20px', marginBottom: '20px' } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
            React.createElement('h3', { style: { margin: 0, fontSize: '1.1em' } }, '🎩 Mayor\'s Inbox'),
            activeMission && React.createElement('div', { style: { background: 'rgba(255,215,0,0.15)', border: '1px solid #ffd70044', borderRadius: '20px', padding: '4px 12px', fontSize: '0.8em', color: '#ffd700', fontWeight: 'bold', animation: 'pulse 2s infinite' } }, '🎯 ACTIVE MISSION — ' + missionTimeLeft)
        ),
        
        // Active mission banner
        activeMission && React.createElement('div', { style: { background: 'rgba(255,215,0,0.08)', border: '1px solid #ffd70033', borderRadius: '12px', padding: '14px', marginBottom: '14px' } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', null,
                    React.createElement('div', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.9em', marginBottom: '4px' } }, '🎯 Current Mission'),
                    React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em' } }, 'Go to: ' + (activeMission.location || '').replace(/_/g, ' ').toUpperCase()),
                    React.createElement('div', { style: { color: '#888', fontSize: '0.75em', marginTop: '4px' } }, '💰 Reward: +' + (activeMission.reward?.xp || 0) + ' XP, +' + (activeMission.reward?.rep || 0) + ' REP')
                ),
                React.createElement('button', { onClick: function() { if (onNavigate) onNavigate('actions'); }, style: { background: 'linear-gradient(135deg, #ffd700, #e6a800)', color: '#000', border: 'none', borderRadius: '10px', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85em' } }, '🗺️ GO NOW')
            )
        ),
        
        loading ? React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: '#888' } }, '🎩 Mayor is composing messages...') :
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
            messages.map(function(msg, i) {
                var icon = typeIcons[msg.type] || '💬';
                var color = typeColors[msg.type] || '#4488ff';
                var isMission = msg.type === 'mission' && msg.missionLocation && !activeMission;
                return React.createElement('div', { key: i, style: { background: 'rgba(0,0,0,0.3)', border: '1px solid ' + color + '33', borderRadius: '12px', padding: '14px', borderLeft: '3px solid ' + color } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' } },
                        React.createElement('div', { style: { flex: 1 } },
                            React.createElement('div', { style: { fontSize: '0.75em', color: color, fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' } }, icon + ' ' + (msg.type || 'message')),
                            React.createElement('div', { style: { color: '#ddd', fontSize: '0.9em', lineHeight: '1.5' } }, msg.text)
                        ),
                        isMission && React.createElement('button', { onClick: function() { acceptMission(msg); }, style: { background: color + '22', border: '1px solid ' + color + '44', color: color, borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8em', fontFamily: 'inherit', whiteSpace: 'nowrap' } }, '✅ Accept')
                    )
                );
            })
        )
    );
}

// ==================== NPC RELATIONSHIP TRACKER ====================

function MayorDynamicEvents({ gameState, resources, onResourceChange, showToast, playerName }) {
    // Load persisted state from localStorage
    const [activeEvent, setActiveEvent] = useState(() => {
        const saved = localStorage.getItem('pumptown_mayor_event');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Check if event is still valid (not expired)
            if (parsed.endTime > Date.now()) {
                return parsed;
            }
        }
        return null;
    });
    
    const [participated, setParticipated] = useState(() => {
        const saved = localStorage.getItem('pumptown_mayor_event_participated');
        return saved === 'true';
    });
    
    const [eventTimer, setEventTimer] = useState(0);
    const [lastEventCheck, setLastEventCheck] = useState(() => {
        const saved = localStorage.getItem('pumptown_last_event_check');
        return saved ? parseInt(saved) : 0;
    });
    
    // Event definitions based on city state
    const eventTemplates = {
        crime_wave: {
            id: 'crime_wave',
            type: 'crisis',
            icon: '🚨',
            title: 'CRIME WAVE ALERT',
            description: 'Crime has spiraled out of control! The Mayor is calling all citizens to help patrol the streets.',
            trigger: (stats) => stats.crime > 70,
            effects: [
                { type: 'negative', text: '-20% HOPIUM production' },
                { type: 'negative', text: 'Territories at risk' }
            ],
            actions: [
                { id: 'patrol', label: '🚔 Join Patrol (+50 REP)', cost: { hopium: 100 }, reward: { reputation: 50, xp: 200 } },
                { id: 'donate', label: '💰 Fund Police (+COPIUM)', cost: { hopium: 200 }, reward: { copium: 150, xp: 100 } }
            ],
            duration: 3600
        },
        economic_boom: {
            id: 'economic_boom',
            type: 'prosperity',
            icon: '📈',
            title: 'ECONOMIC BOOM',
            description: 'The city treasury is overflowing! The Mayor is distributing bonuses to active citizens.',
            trigger: (stats) => stats.treasury > 8000 && stats.morale > 70,
            effects: [
                { type: 'positive', text: '+50% HOPIUM gains' },
                { type: 'positive', text: 'Double XP from games' }
            ],
            actions: [
                { id: 'invest', label: '💎 Invest (2x Return)', cost: { hopium: 150 }, reward: { hopium: 300, alpha: 50 } },
                { id: 'celebrate', label: '🎉 Celebrate (Free)', cost: {}, reward: { hopium: 100, xp: 150 } }
            ],
            duration: 7200
        },
        morale_crisis: {
            id: 'morale_crisis',
            type: 'crisis',
            icon: '😢',
            title: 'MORALE CRISIS',
            description: 'Citizens are losing hope! The Mayor needs your help to boost city morale.',
            trigger: (stats) => stats.morale < 30,
            effects: [
                { type: 'negative', text: '-30% game rewards' },
                { type: 'negative', text: 'Airdrop chances reduced' }
            ],
            actions: [
                { id: 'speech', label: '📢 Give Speech (+Morale)', cost: { alpha: 30 }, reward: { xp: 300, reputation: 30 } },
                { id: 'party', label: '🎊 Throw Party', cost: { hopium: 250 }, reward: { copium: 200, xp: 200 } }
            ],
            duration: 5400
        },
        whale_alert: {
            id: 'whale_alert',
            type: 'neutral',
            icon: '🐋',
            title: 'WHALE SIGHTING',
            description: 'A massive whale has entered Degens City! Quick actions may yield massive rewards.',
            trigger: () => Math.random() < 0.05, // 5% random chance (reduced)
            effects: [
                { type: 'positive', text: 'Rare reward opportunity' },
                { type: 'negative', text: 'Limited time only' }
            ],
            actions: [
                { id: 'follow', label: '🎯 Follow Whale (Risky)', cost: { hopium: 200 }, reward: { hopium: 500, alpha: 100 }, riskFail: 0.4 },
                { id: 'observe', label: '👀 Observe (Safe)', cost: {}, reward: { alpha: 30, xp: 100 } }
            ],
            duration: 1800
        },
        festival: {
            id: 'festival',
            type: 'prosperity',
            icon: '🎪',
            title: 'CITY FESTIVAL',
            description: 'The annual Degens City Festival is here! Special games and rewards available.',
            trigger: (stats) => stats.morale > 60 && Math.random() < 0.08,
            effects: [
                { type: 'positive', text: '+100% game XP' },
                { type: 'positive', text: 'Special festival games' }
            ],
            actions: [
                { id: 'games', label: '🎮 Play Festival Games', cost: { hopium: 50 }, reward: { hopium: 120, xp: 250 } },
                { id: 'sponsor', label: '🏆 Sponsor Event', cost: { hopium: 300 }, reward: { reputation: 100, alpha: 80 } }
            ],
            duration: 10800
        }
    };
    
    // Save active event to localStorage whenever it changes
    useEffect(() => {
        if (activeEvent) {
            localStorage.setItem('pumptown_mayor_event', JSON.stringify(activeEvent));
        } else {
            localStorage.removeItem('pumptown_mayor_event');
        }
    }, [activeEvent]);
    
    // Save participation state
    useEffect(() => {
        localStorage.setItem('pumptown_mayor_event_participated', participated.toString());
    }, [participated]);
    
    // Check for new events only if no active event and enough time has passed
    useEffect(() => {
        const checkEvents = () => {
            // Don't check if there's already an active event
            if (activeEvent) return;
            
            // Only check for new events every 5 minutes minimum
            const now = Date.now();
            const minInterval = 5 * 60 * 1000; // 5 minutes
            if (now - lastEventCheck < minInterval) return;
            
            const stats = gameState?.stats || { crime: 50, morale: 50, treasury: 5000 };
            
            for (const event of Object.values(eventTemplates)) {
                if (event.trigger(stats)) {
                    const newEvent = {
                        ...event,
                        startTime: now,
                        endTime: now + (event.duration * 1000)
                    };
                    setActiveEvent(newEvent);
                    setParticipated(false);
                    localStorage.setItem('pumptown_mayor_event_participated', 'false');
                    setLastEventCheck(now);
                    localStorage.setItem('pumptown_last_event_check', now.toString());
                    break;
                }
            }
        };
        
        // Check on mount and every 60 seconds
        checkEvents();
        const interval = setInterval(checkEvents, 60000);
        
        return () => clearInterval(interval);
    }, [gameState, activeEvent, lastEventCheck]);
    
    // Timer countdown
    useEffect(() => {
        if (!activeEvent) return;
        
        const timer = setInterval(() => {
            const remaining = Math.max(0, activeEvent.endTime - Date.now());
            setEventTimer(Math.floor(remaining / 1000));
            
            if (remaining <= 0) {
                setActiveEvent(null);
                setParticipated(false);
                localStorage.removeItem('pumptown_mayor_event');
                localStorage.setItem('pumptown_mayor_event_participated', 'false');
            }
        }, 1000);
        
        // Initial calculation
        const initialRemaining = Math.max(0, activeEvent.endTime - Date.now());
        setEventTimer(Math.floor(initialRemaining / 1000));
        
        return () => clearInterval(timer);
    }, [activeEvent]);
    
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    };
    
    const handleAction = (action) => {
        // Check cost
        for (const [resource, amount] of Object.entries(action.cost)) {
            if ((resources[resource] || 0) < amount) {
                showToast(`Not enough ${resource.toUpperCase()}!`, 'error');
                return;
            }
        }
        
        // Deduct cost
        for (const [resource, amount] of Object.entries(action.cost)) {
            onResourceChange(resource, -amount);
        }
        
        // Check for risk failure
        if (action.riskFail && Math.random() < action.riskFail) {
            showToast('The risky move failed! Better luck next time.', 'error');
            setParticipated(true);
            return;
        }
        
        // Give rewards
        for (const [resource, amount] of Object.entries(action.reward)) {
            if (resource === 'xp' || resource === 'reputation') {
                // These would be handled by parent
            } else {
                onResourceChange(resource, amount);
            }
        }
        
        showToast(`Event action successful! Earned rewards.`, 'success');
        setParticipated(true);
    };
    
    if (!activeEvent) return null;
    
    return (
        <div className={`mayor-event-alert ${activeEvent.type}`}>
            <div className="mayor-event-header">
                <span className="mayor-event-icon">{activeEvent.icon}</span>
                <div>
                    <div className="mayor-event-title">{activeEvent.title}</div>
                    <div style={{ color: '#888', fontSize: '0.9em' }}>AI Mayor Emergency Broadcast</div>
                </div>
                <div className="mayor-event-timer">⏰ {formatTime(eventTimer)}</div>
            </div>
            
            <p className="mayor-event-desc">{activeEvent.description}</p>
            
            <div className="mayor-event-effects">
                {activeEvent.effects.map((effect, idx) => (
                    <span key={idx} className={`mayor-event-effect ${effect.type}`}>
                        {effect.text}
                    </span>
                ))}
            </div>
            
            {!participated ? (
                <div className="mayor-event-actions">
                    {activeEvent.actions.map(action => (
                        <button 
                            key={action.id}
                            className={`mayor-event-btn ${action.cost.hopium ? 'primary' : 'secondary'}`}
                            onClick={() => handleAction(action)}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', color: '#00ff88', padding: '15px' }}>
                    ✅ You've participated in this event!
                </div>
            )}
        </div>
    );
}

// ==================== BANK / STAKING SYSTEM ====================

function MayorMood({ stats }) {
    const calculateMood = () => {
        if (!stats) return { mood: 'neutral', icon: '😐', label: 'Neutral', color: '#888', value: 50 };
        
        const avg = (stats.economy + stats.security + stats.culture + stats.morale) / 4;
        const lowest = Math.min(stats.economy, stats.security, stats.culture, stats.morale);
        const highest = Math.max(stats.economy, stats.security, stats.culture, stats.morale);
        
        if (lowest < 20) return { mood: 'panic', icon: '😱', label: 'MAXIMUM PANIC', color: '#ff4444', value: 15 };
        if (lowest < 35) return { mood: 'bearish', icon: '😰', label: 'Bearish & Stressed', color: '#ff6b6b', value: 30 };
        if (avg < 40) return { mood: 'concerned', icon: '😟', label: 'Concerned', color: '#ffa500', value: 40 };
        if (avg < 55) return { mood: 'neutral', icon: '😐', label: 'Cautiously Optimistic', color: '#888', value: 50 };
        if (avg < 70) return { mood: 'bullish', icon: '😊', label: 'Bullish Vibes', color: '#00ff88', value: 65 };
        if (highest > 85) return { mood: 'euphoric', icon: '🤑', label: 'EUPHORIA MODE', color: '#ffd700', value: 90 };
        return { mood: 'pumped', icon: '🚀', label: 'Pumped & Ready', color: '#00d4ff', value: 75 };
    };
    
    const { mood, icon, label, color, value } = calculateMood();
    
    return (
        <div className="mayor-mood">
            <div className="mayor-mood-icon">{icon}</div>
            <div className="mayor-mood-info">
                <div className="mayor-mood-label">Mayor's Mood</div>
                <div className="mayor-mood-status" style={{ color }}>{label}</div>
                <div className="mayor-mood-bar">
                    <div 
                        className="mayor-mood-fill" 
                        style={{ width: `${value}%`, background: color }}
                    />
                </div>
            </div>
        </div>
    );
}

// ==================== MAYOR DAILY BRIEFING ====================

function MayorDailyBriefing({ stats, playerName, day, onClose }) {
    const [briefing, setBriefing] = useState(null);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchBriefing = async () => {
            try {
                const response = await fetch(API_BASE + '/api/ai/daily-briefing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ playerName, stats, day })
                });
                const data = await response.json();
                if (data.success) {
                    setBriefing(data.briefing);
                } else {
                    throw new Error('Failed');
                }
            } catch (error) {
                // Fallback briefing
                setBriefing({
                    greeting: `GM ${playerName}! Welcome back to Degens City!`,
                    summary: `Day ${day} of governance. The city needs your votes, citizen. Markets are moving, decisions await. WAGMI! 🚀`,
                    tip: "Pro tip: Vote early, vote often. Diamond hands get rewarded."
                });
            }
            setLoading(false);
        };
        fetchBriefing();
    }, []);
    
    const getStatColor = (value) => {
        if (value < 30) return '#ff4444';
        if (value < 50) return '#ffa500';
        if (value < 70) return '#ffd700';
        return '#00ff88';
    };
    
    return (
        <div className="daily-briefing-overlay" onClick={onClose}>
            <div className="daily-briefing" onClick={e => e.stopPropagation()}>
                <button className="daily-briefing-x" onClick={onClose}>✕</button>
                <div className="daily-briefing-header">
                    <div className="daily-briefing-avatar">🎩</div>
                    <div className="daily-briefing-title">Mayor's Daily Briefing</div>
                </div>
                
                {loading ? (
                    <div style={{ padding: '40px', color: '#888' }}>
                        <div className="spinner" style={{ marginBottom: '15px' }}></div>
                        Mayor is preparing your briefing...
                    </div>
                ) : (
                    <>
                        <div className="daily-briefing-content">
                            <p style={{ marginBottom: '10px', color: '#ffd700' }}>{briefing?.greeting}</p>
                            <p>{briefing?.summary}</p>
                        </div>
                        
                        {stats && (
                            <div className="daily-briefing-stats">
                                <div className="daily-briefing-stat">
                                    <div className="daily-briefing-stat-label">Economy</div>
                                    <div className="daily-briefing-stat-value" style={{ color: getStatColor(stats.economy) }}>
                                        {stats.economy}%
                                    </div>
                                </div>
                                <div className="daily-briefing-stat">
                                    <div className="daily-briefing-stat-label">Security</div>
                                    <div className="daily-briefing-stat-value" style={{ color: getStatColor(stats.security) }}>
                                        {stats.security}%
                                    </div>
                                </div>
                                <div className="daily-briefing-stat">
                                    <div className="daily-briefing-stat-label">Culture</div>
                                    <div className="daily-briefing-stat-value" style={{ color: getStatColor(stats.culture) }}>
                                        {stats.culture}%
                                    </div>
                                </div>
                                <div className="daily-briefing-stat">
                                    <div className="daily-briefing-stat-label">Morale</div>
                                    <div className="daily-briefing-stat-value" style={{ color: getStatColor(stats.morale) }}>
                                        {stats.morale}%
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {briefing?.tip && (
                            <div style={{ fontSize: '0.9em', color: '#888', marginBottom: '20px' }}>
                                💡 {briefing.tip}
                            </div>
                        )}
                    </>
                )}
                
                <button className="daily-briefing-close" onClick={onClose}>
                    LFG! 🚀
                </button>
            </div>
        </div>
    );
}

// ==================== MAYOR QUICK ACTIONS ====================

function MayorQuickActions({ playerName, playerLevel, onResponse }) {
    const [loading, setLoading] = useState(null);
    
    const actions = [
        { id: 'roast', label: '🔥 Roast Me', className: 'roast', prompt: `Roast me playfully! My name is ${playerName} and I'm level ${playerLevel}. Give me a funny, savage but friendly roast about being a degen in Degens City.` },
        { id: 'prophecy', label: '🔮 Prophecy', className: 'prophecy', prompt: `Give me a cryptic market prophecy! Be mysterious and dramatic, mix real crypto wisdom with absurd predictions. Make it feel like ancient wisdom from a chaotic oracle.` },
        { id: 'advice', label: '💡 Advice', className: 'advice', prompt: `Give me your best degen advice for succeeding in Degens City! Mix actual helpful tips with your chaotic Mayor energy.` },
        { id: 'compliment', label: '💎 Hype Me', className: 'compliment', prompt: `Hype me up! My name is ${playerName}, level ${playerLevel}. Give me an over-the-top motivational speech that makes me feel like the ultimate crypto chad. Maximum hype energy!` }
    ];
    
    const handleAction = async (action) => {
        if (loading) return;
        setLoading(action.id);
        
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: action.prompt,
                    playerName,
                    playerLevel
                })
            });
            
            const data = await response.json();
            if (data.success && onResponse) {
                onResponse({
                    type: action.id,
                    label: action.label,
                    response: data.response
                });
            }
        } catch (error) {
            console.error('Quick action error:', error);
        }
        
        setLoading(null);
    };
    
    return (
        <div className="mayor-quick-actions">
            {actions.map(action => (
                <button
                    key={action.id}
                    className={`mayor-quick-btn ${action.className}`}
                    onClick={() => handleAction(action)}
                    disabled={loading !== null}
                >
                    {loading === action.id ? '...' : action.label}
                </button>
            ))}
        </div>
    );
}

// ==================== DAILY REWARD MODAL ====================

function MayorReactionModal({ reaction, onClose }) {
    if (!reaction) return null;
    
    const moodIcons = {
        excited: '🎉',
        concerned: '😰',
        proud: '👑',
        chaotic: '🌀'
    };
    
    return (
        <div className="mayor-reaction-overlay" onClick={onClose}>
            <div className={`mayor-reaction ${reaction.mood || 'proud'}`} onClick={e => e.stopPropagation()}>
                <button className="mayor-reaction-x" onClick={onClose}>✕</button>
                <div className="mayor-reaction-header">
                    {moodIcons[reaction.mood] || '🎩'}
                </div>
                <div className="mayor-reaction-mood">
                    Mayor is {reaction.mood || 'reacting'}
                </div>
                <div className="mayor-reaction-speech">
                    "{reaction.speech}"
                </div>
                {reaction.nextHint && (
                    <div className="mayor-reaction-hint">
                        🔮 {reaction.nextHint}
                    </div>
                )}
                <button className="mayor-reaction-close" onClick={onClose}>
                    WAGMI! 💎
                </button>
            </div>
        </div>
    );
}

// ==================== SPECIAL EVENT BANNER ====================

function MayorTips({ playerLevel }) {
    const [tip, setTip] = useState(null);
    const [loading, setLoading] = useState(false);
    
    const localTips = [
        "Diamond hands aren't born, they're forged in the fires of red candles. 💎",
        "In Degens City, we don't have paper hands. We have origami enthusiasts who left. 📄",
        "The best time to buy was yesterday. The second best time is after doing your own research. 📊",
        "Remember: Every whale started as a shrimp. Keep stacking, fren. 🦐→🐋",
        "WAGMI isn't just a saying, it's a lifestyle choice. Choose wisely. 🚀",
        "The real treasure was the degens we met along the way. And also actual treasure. 💰",
        "When in doubt, zoom out. Unless you're already zoomed out. Then maybe touch grass. 🌿",
        "Not financial advice, but voting is always a good investment in democracy. 🗳️",
        "They said I was crazy for building an AI-governed city. They were right. But here we are! 🏛️",
        "Pro tip: The casino always wins. But so do legends. Are you a legend? 🎰",
        "Degens City wasn't built in a day. It was built in a fever dream. Welcome. 🌙",
        "Your portfolio is temporary. Your voting record is forever. Choose based. ✅"
    ];
    
    useEffect(() => {
        // Set initial random tip
        setTip(localTips[Math.floor(Math.random() * localTips.length)]);
    }, []);
    
    const fetchNewTip = async () => {
        setLoading(true);
        
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: 'Give me one short piece of degen wisdom or a funny crypto tip. Just the tip itself, no preamble. Make it memorable and quotable.',
                    playerName: 'Wisdom Seeker',
                    playerLevel: playerLevel || 1
                })
            });
            
            const data = await response.json();
            if (data.success) {
                setTip(data.response);
            } else {
                throw new Error('Failed');
            }
        } catch (error) {
            // Fallback to local tip
            setTip(localTips[Math.floor(Math.random() * localTips.length)]);
        }
        
        setLoading(false);
    };
    
    return (
        <div className="mayor-tips">
            <div className="mayor-tips-header">
                <span>🎩</span>
                <span>Mayor's Wisdom</span>
                <button 
                    className="mayor-tips-refresh" 
                    onClick={fetchNewTip}
                    disabled={loading}
                >
                    {loading ? '...' : '🔄 New'}
                </button>
            </div>
            <div className="mayor-tips-content">
                "{tip || 'Loading wisdom...'}"
            </div>
        </div>
    );
}

// ==================== DAILY MAYOR ROAST ====================

function DailyMayorRoast({ playerName }) {
    const [roast, setRoast] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);
    const [votes, setVotes] = useState({ fire: 0, cap: 0 });
    const [showNominate, setShowNominate] = useState(false);
    const [nominateHandle, setNominateHandle] = useState('');
    const [nominateReason, setNominateReason] = useState('');
    const [nominated, setNominated] = useState(false);
    
    // Daily roast targets - rotates based on day
    const roastTargets = [
        {
            handle: "@CryptoGuru999",
            name: "CryptoGuru999",
            bio: "IQ 250 | Predicted every crash | $500M portfolio | DM for mentorship 🚀",
            category: "Fake Genius"
        },
        {
            handle: "@Web3Visionary",
            name: "Web3 Visionary",
            bio: "Serial Entrepreneur (15 exits) | Angel Investor | Advisor to 100+ startups | Building the future",
            category: "Vague Flexer"
        },
        {
            handle: "@AlphaLeaks",
            name: "Alpha Leaks",
            bio: "100% win rate | Turned $50 into $5M | Free signals in DMs | Not financial advice",
            category: "Scam Alert"
        },
        {
            handle: "@MindsetMillionaire",
            name: "Mindset Millionaire",
            bio: "Wake up at 3AM | Read 2 books/day | 10x mindset | Retired at 25 | You're just lazy",
            category: "Grindset Cringe"
        },
        {
            handle: "@NFTWhale",
            name: "NFT Whale",
            bio: "Own 200 Bored Apes | $50M in JPEGs | The future is digital art | DM for collabs",
            category: "Cap Collector"
        },
        {
            handle: "@ThoughtLeaderX",
            name: "Thought Leader X", 
            bio: "Visionary | Futurist | 5x TEDx Speaker | Changing paradigms one post at a time",
            category: "Self-Proclaimed"
        },
        {
            handle: "@QuantKing",
            name: "Quant King",
            bio: "Ex-Goldman Ex-Citadel Ex-Jane Street | Now sharing secrets for free | You're welcome",
            category: "Resume Stacker"
        }
    ];
    
    // Get today's roast target based on date
    const getTodaysTarget = () => {
        const today = new Date();
        const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        return roastTargets[dayOfYear % roastTargets.length];
    };
    
    // Check if user already voted today
    useEffect(() => {
        const today = new Date().toDateString();
        const savedVote = localStorage.getItem('daily_roast_vote');
        const savedVotes = localStorage.getItem('daily_roast_votes');
        
        if (savedVote === today) {
            setHasVoted(true);
        }
        
        if (savedVotes) {
            try {
                const parsed = JSON.parse(savedVotes);
                if (parsed.date === today) {
                    setVotes(parsed.votes);
                }
            } catch (e) {}
        }
        
        fetchRoast();
    }, []);
    
    const fetchRoast = async () => {
        setLoading(true);
        const target = getTodaysTarget();
        
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Give me your daily roast of this X profile. Be savage but funny!`,
                    playerName: 'Daily Roast',
                    playerLevel: 1,
                    xUserContext: {
                        query: target.handle,
                        info: `${target.handle} (${target.name}) - Bio: "${target.bio}" - Category: ${target.category}. This is today's roast target. Be SAVAGE and call out the BS!`
                    }
                })
            });
            
            const data = await response.json();
            if (data.success) {
                setRoast({
                    target,
                    mayorComment: data.response,
                    date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                });
            }
        } catch (error) {
            // Fallback roast
            setRoast({
                target,
                mayorComment: `${target.handle}?! Ser, this bio is PURE FICTION. "${target.bio}" - I've seen more credibility in a rugpull whitepaper! 🧢💀`,
                date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
            });
        }
        
        setLoading(false);
    };
    
    const handleVote = (type) => {
        if (hasVoted) return;
        
        const newVotes = { ...votes, [type]: votes[type] + 1 };
        setVotes(newVotes);
        setHasVoted(true);
        
        const today = new Date().toDateString();
        localStorage.setItem('daily_roast_vote', today);
        localStorage.setItem('daily_roast_votes', JSON.stringify({ date: today, votes: newVotes }));
    };
    
    const handleNominate = () => {
        if (!nominateHandle.trim()) return;
        
        // In a real app, this would send to backend
        console.log('Nomination:', { handle: nominateHandle, reason: nominateReason, by: playerName });
        
        setNominated(true);
        setTimeout(() => {
            setShowNominate(false);
            setNominateHandle('');
            setNominateReason('');
            setNominated(false);
        }, 2000);
    };
    
    const shareOnX = () => {
        const text = `🧢 Today's Roast on Degens City!\n\n${roast.target.handle}: "${roast.target.bio}"\n\n🎩 Mayor Satoshi says: "${roast.mayorComment.substring(0, 150)}..."\n\nPlay at degenscity.com 🏛️`;
        shareToX(text);
    };
    
    if (loading) {
        return (
            <div className="daily-roast">
                <div className="daily-roast-header">
                    <span>🔥</span>
                    <span>Daily Roast</span>
                </div>
                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                    Mayor is preparing today's roast... 🎩
                </div>
            </div>
        );
    }
    
    return (
        <div className="daily-roast">
            <div 
                className="daily-roast-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔥</span>
                    <span>Daily Roast</span>
                    <span style={{ 
                        fontSize: '0.7em', 
                        background: 'rgba(255,107,107,0.2)', 
                        padding: '2px 8px', 
                        borderRadius: '10px',
                        color: '#ff6b6b'
                    }}>
                        {roast?.date}
                    </span>
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && roast && (
                <div className="daily-roast-content">
                    {/* Target Bio Card */}
                    <div className="roast-target-card">
                        <div className="roast-target-header">
                            <div className="roast-target-avatar">👤</div>
                            <div>
                                <div className="roast-target-name">{roast.target.name}</div>
                                <div className="roast-target-handle">{roast.target.handle}</div>
                            </div>
                            <div className="roast-category">{roast.target.category}</div>
                        </div>
                        <div className="roast-target-bio">
                            "{roast.target.bio}"
                        </div>
                    </div>
                    
                    {/* Mayor's Roast */}
                    <div className="mayor-roast-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '1.3em' }}>🎩</span>
                            <span style={{ color: '#ffd700', fontWeight: 'bold' }}>Mayor's Verdict:</span>
                        </div>
                        <div className="mayor-roast-text">
                            {roast.mayorComment}
                        </div>
                    </div>
                    
                    {/* Voting */}
                    <div className="roast-voting">
                        <button 
                            className={`roast-vote-btn fire ${hasVoted ? 'voted' : ''}`}
                            onClick={() => handleVote('fire')}
                            disabled={hasVoted}
                        >
                            🔥 {votes.fire} Fire
                        </button>
                        <button 
                            className={`roast-vote-btn cap ${hasVoted ? 'voted' : ''}`}
                            onClick={() => handleVote('cap')}
                            disabled={hasVoted}
                        >
                            🧢 {votes.cap} Cap
                        </button>
                    </div>
                    
                    {/* Actions */}
                    <div className="roast-actions">
                        <button className="roast-action-btn" onClick={shareOnX}>
                            📤 Share on X
                        </button>
                        <button 
                            className="roast-action-btn nominate"
                            onClick={() => setShowNominate(!showNominate)}
                        >
                            ✋ Nominate
                        </button>
                    </div>
                    
                    {/* Nominate Form */}
                    {showNominate && (
                        <div className="nominate-form">
                            {nominated ? (
                                <div style={{ textAlign: 'center', color: '#00ff88', padding: '15px' }}>
                                    ✅ Nomination submitted! Mayor will review it.
                                </div>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="@handle to roast"
                                        value={nominateHandle}
                                        onChange={(e) => setNominateHandle(e.target.value)}
                                        className="nominate-input"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Why should they be roasted? (optional)"
                                        value={nominateReason}
                                        onChange={(e) => setNominateReason(e.target.value)}
                                        className="nominate-input"
                                    />
                                    <button 
                                        className="nominate-submit"
                                        onClick={handleNominate}
                                        disabled={!nominateHandle.trim()}
                                    >
                                        Submit Nomination 🔥
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== ROAST LEADERBOARD ====================

function MayorUnhingedPanel() {
    const [mayorData, setMayorData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [triggerLoading, setTriggerLoading] = useState(null);
    
    useEffect(function() {
        var fetchMayor = async function() {
            try {
                var res = await fetch(API_BASE + '/api/city-engine/mayor-unhinged');
                var data = await res.json();
                if (data.success) setMayorData(data);
            } catch(e) {}
            setLoading(false);
        };
        fetchMayor();
        var iv = setInterval(fetchMayor, 20000);
        return function() { clearInterval(iv); };
    }, []);
    
    var triggerMayor = async function(type) {
        setTriggerLoading(type);
        try {
            await fetch(API_BASE + '/api/city-engine/mayor-speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type })
            });
            // Re-fetch
            var res = await fetch(API_BASE + '/api/city-engine/mayor-unhinged');
            var data = await res.json();
            if (data.success) setMayorData(data);
        } catch(e) {}
        setTriggerLoading(null);
    };
    
    if (loading || !mayorData) return null;
    
    var moodEmoji = mayorData.mood === 'smug' ? '😏' : mayorData.mood === 'confident' ? '😎' : mayorData.mood === 'nervous' ? '😰' : '🤪';
    var moodColor = mayorData.mood === 'smug' ? '#00ff88' : mayorData.mood === 'confident' ? '#4488ff' : mayorData.mood === 'nervous' ? '#ffd700' : '#ff4444';
    var isUnhinged = mayorData.isUnhinged;
    
    // Get most recent mayor content
    var recentItems = [];
    (mayorData.recentDecrees || []).forEach(function(d) { recentItems.push({ type: '📜', text: d.text, time: d.timestamp }); });
    (mayorData.predictions || []).forEach(function(p) { recentItems.push({ type: '🔮', text: p.text, time: p.timestamp }); });
    (mayorData.hotTakes || []).forEach(function(h) { recentItems.push({ type: '🌶️', text: h.text, time: h.timestamp }); });
    recentItems.sort(function(a, b) { return (b.time || 0) - (a.time || 0); });
    
    return React.createElement('div', { style: { background: isUnhinged ? 'linear-gradient(135deg, rgba(255,68,68,0.08), rgba(168,85,247,0.08))' : 'rgba(255,215,0,0.04)', borderRadius: '14px', padding: '14px', border: '1px solid ' + moodColor + '33', position: 'relative', overflow: 'hidden' } },
        // Chaos bar
        isUnhinged && React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #ff4444, #a855f7, #ff4444)', backgroundSize: '200%', animation: 'soapShimmer 2s linear infinite' } }),
        
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                React.createElement('span', { style: { fontSize: '1.5em' } }, '👑'),
                React.createElement('div', null,
                    React.createElement('div', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.9em' } }, mayorData.mayor || 'Mayor'),
                    React.createElement('div', { style: { color: moodColor, fontSize: '0.7em', fontWeight: 'bold' } }, moodEmoji + ' ' + (mayorData.mood || 'unknown').toUpperCase() + (isUnhinged ? ' ⚠️' : ''))
                )
            ),
            React.createElement('div', { style: { textAlign: 'right' } },
                React.createElement('div', { style: { color: mayorData.approval > 50 ? '#00ff88' : '#ff4444', fontSize: '1em', fontWeight: 'bold' } }, Math.round(mayorData.approval || 0) + '%'),
                React.createElement('div', { style: { color: '#666', fontSize: '0.65em' } }, 'Approval')
            )
        ),
        
        // Recent mayor content
        recentItems.length > 0 && React.createElement('div', { style: { marginBottom: '10px', maxHeight: '120px', overflowY: 'auto' } },
            recentItems.slice(0, 3).map(function(item, i) {
                var ago = Math.round((Date.now() - (item.time || 0)) / 60000);
                var timeStr = ago < 1 ? 'now' : ago < 60 ? ago + 'm' : Math.round(ago / 60) + 'h';
                return React.createElement('div', { key: i, style: { padding: '6px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', gap: '8px', alignItems: 'flex-start' } },
                    React.createElement('span', { style: { fontSize: '0.9em' } }, item.type),
                    React.createElement('span', { style: { color: '#bbb', fontSize: '0.78em', flex: 1 } }, (item.text || '').substring(0, 100)),
                    React.createElement('span', { style: { color: '#555', fontSize: '0.65em', whiteSpace: 'nowrap' } }, timeStr)
                );
            })
        ),
        
        // Action buttons
        React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            [
                { type: 'roast', icon: '🔥', label: 'Roast' },
                { type: 'predict', icon: '🔮', label: 'Prophecy' },
                { type: 'decree', icon: '📜', label: 'Decree' },
                { type: 'hottake', icon: '🌶️', label: 'Hot Take' }
            ].map(function(btn) {
                return React.createElement('button', {
                    key: btn.type,
                    onClick: function() { triggerMayor(btn.type); },
                    disabled: triggerLoading === btn.type,
                    style: {
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,215,0,0.2)',
                        background: triggerLoading === btn.type ? 'rgba(255,215,0,0.15)' : 'rgba(255,215,0,0.05)',
                        color: '#ffd700',
                        fontSize: '0.72em',
                        cursor: triggerLoading === btn.type ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: triggerLoading === btn.type ? 0.6 : 1
                    }
                }, btn.icon + ' ' + (triggerLoading === btn.type ? '...' : btn.label));
            })
        )
    );
}

// ==================== LIVE CITY FEED (pulls from activity_feed + chat) ====================

function MayorHotTakes() {
    const [currentTakeIndex, setCurrentTakeIndex] = useState(0);
    const [reactions, setReactions] = useState(() => {
        const saved = localStorage.getItem('hot_takes_reactions');
        return saved ? JSON.parse(saved) : {};
    });
    const [isAnimating, setIsAnimating] = useState(false);
    
    const hotTakes = [
        { id: 1, take: "If your portfolio needs 'diamond hands' to hold, maybe you just made bad decisions 💎🤔", category: "truth bomb" },
        { id: 2, take: "Anyone with 'IQ' in their bio has an IQ lower than their follower count 🧠📉", category: "roast" },
        { id: 3, take: "The real friends were the rugs we survived along the way 🤝", category: "wisdom" },
        { id: 4, take: "'Not financial advice' is just legal speak for 'I'm about to say something stupid' 📜", category: "truth bomb" },
        { id: 5, take: "If a coin needs a 10-page whitepaper to explain what it does, it does nothing 📄", category: "alpha" },
        { id: 6, take: "Every 'generational buying opportunity' is followed by an even more generational one 📊", category: "truth bomb" },
        { id: 7, take: "'Serial Entrepreneur' = I've failed upward multiple times and somehow kept getting funded 💼", category: "roast" },
        { id: 8, take: "The best indicator is not RSI or MACD, it's how confident crypto Twitter is 🐦", category: "alpha" },
        { id: 9, take: "If you're taking trading advice from someone with laser eyes, you deserve what happens next 👀", category: "roast" },
        { id: 10, take: "WAGMI but statistically speaking, most of us NGMI and that's just math 📈", category: "truth bomb" },
        { id: 11, take: "'Building in public' is often just 'failing in public with better marketing' 🏗️", category: "roast" },
        { id: 12, take: "The real alpha is touching grass occasionally. Trust me, I'm an AI and even I know that 🌿", category: "wisdom" },
        { id: 13, take: "If your exit strategy is 'never selling', your exit strategy is dying poor 💀", category: "truth bomb" },
        { id: 14, take: "'Thought leader' is what you call yourself when you don't actually build anything 💭", category: "roast" },
        { id: 15, take: "The market can stay irrational longer than you can stay liquid. Ask me how I know 💧", category: "wisdom" },
        { id: 16, take: "Every influencer's 'conviction play' is just their biggest bag they need to dump 🎒", category: "alpha" },
        { id: 17, take: "'I'm early' and 'I bought the top' are often the same thing said at different times ⏰", category: "truth bomb" },
        { id: 18, take: "Your 'life-changing money' target keeps changing because you keep losing money 🎯", category: "roast" },
        { id: 19, take: "The best time to buy Bitcoin was 10 years ago. The second best time is after you DYOR 🔍", category: "wisdom" },
        { id: 20, take: "If someone DMs you about an 'opportunity', the only opportunity is for them to scam you 📩", category: "alpha" },
    ];
    
    // Rotate takes every 8 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentTakeIndex(prev => (prev + 1) % hotTakes.length);
                setIsAnimating(false);
            }, 500);
        }, 8000);
        
        return () => clearInterval(interval);
    }, []);
    
    const currentTake = hotTakes[currentTakeIndex];
    const takeReactions = reactions[currentTake.id] || { fire: 0, cap: 0 };
    const hasReacted = localStorage.getItem(`take_reaction_${currentTake.id}`);
    
    const handleReaction = (type) => {
        if (hasReacted) return;
        
        const newReactions = {
            ...reactions,
            [currentTake.id]: {
                ...takeReactions,
                [type]: takeReactions[type] + 1
            }
        };
        
        setReactions(newReactions);
        localStorage.setItem('hot_takes_reactions', JSON.stringify(newReactions));
        localStorage.setItem(`take_reaction_${currentTake.id}`, type);
    };
    
    const shareOnX = () => {
        const text = `🎩 Mayor Satoshi's Hot Take:\n\n"${currentTake.take}"\n\n${takeReactions.fire > takeReactions.cap ? '🔥 The people agree!' : '🧢 Controversial!'}\n\nMore alpha at degenscity.com`;
        shareToX(text);
    };
    
    const getCategoryColor = (category) => {
        switch(category) {
            case 'roast': return '#ff6b6b';
            case 'alpha': return '#00ff88';
            case 'wisdom': return '#ffd700';
            case 'truth bomb': return '#00d4ff';
            default: return '#888';
        }
    };
    
    const nextTake = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentTakeIndex(prev => (prev + 1) % hotTakes.length);
            setIsAnimating(false);
        }, 300);
    };
    
    const prevTake = () => {
        setIsAnimating(true);
        setTimeout(() => {
            setCurrentTakeIndex(prev => (prev - 1 + hotTakes.length) % hotTakes.length);
            setIsAnimating(false);
        }, 300);
    };
    
    return (
        <div className="hot-takes-ticker">
            <div className="hot-takes-label">
                <span className="hot-takes-icon">🎩</span>
                <span>HOT TAKE</span>
                <span 
                    className="hot-takes-category"
                    style={{ background: `${getCategoryColor(currentTake.category)}33`, color: getCategoryColor(currentTake.category) }}
                >
                    {currentTake.category.toUpperCase()}
                </span>
            </div>
            
            <div className="hot-takes-content">
                <button className="hot-takes-nav prev" onClick={prevTake}>‹</button>
                
                <div className={`hot-takes-text ${isAnimating ? 'animating' : ''}`}>
                    "{currentTake.take}"
                </div>
                
                <button className="hot-takes-nav next" onClick={nextTake}>›</button>
            </div>
            
            <div className="hot-takes-actions">
                <div className="hot-takes-reactions">
                    <button 
                        className={`take-reaction fire ${hasReacted === 'fire' ? 'reacted' : ''}`}
                        onClick={() => handleReaction('fire')}
                        disabled={!!hasReacted}
                    >
                        🔥 {takeReactions.fire}
                    </button>
                    <button 
                        className={`take-reaction cap ${hasReacted === 'cap' ? 'reacted' : ''}`}
                        onClick={() => handleReaction('cap')}
                        disabled={!!hasReacted}
                    >
                        🧢 {takeReactions.cap}
                    </button>
                </div>
                <button className="take-share" onClick={shareOnX}>
                    📤
                </button>
                <div className="hot-takes-counter">
                    {currentTakeIndex + 1}/{hotTakes.length}
                </div>
            </div>
        </div>
    );
}

// ==================== MAYOR'S VERDICT HISTORY ====================

function MayorVerdictHistory({ playerName }) {
    const [expanded, setExpanded] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [verdicts, setVerdicts] = useState(() => {
        const saved = localStorage.getItem('mayor_verdict_history');
        return saved ? JSON.parse(saved) : [];
    });
    
    // Seeded verdict history for new players
    const seededVerdicts = [
        {
            id: 'v1',
            handle: '@CryptoGuru999',
            name: 'CryptoGuru999',
            bio: 'IQ 250 | Predicted every crash | $500M portfolio',
            verdict: 'cap',
            mayorComment: "IQ 250?! 😭 Ser, Einstein was 160. This person is claiming to be 60% SMARTER than Einstein while shilling on crypto Twitter. The only thing they predicted was how to farm engagement from gullible degens. MAXIMUM CAP! 🧢🚨",
            timestamp: Date.now() - 86400000 * 2,
            reactions: { fire: 127, cap: 12 }
        },
        {
            id: 'v2',
            handle: '@VitalikButerin',
            name: 'Vitalik Buterin',
            bio: 'Ethereum',
            verdict: 'nocap',
            mayorComment: "One word bio. Built a $200B+ ecosystem. Doesn't need to flex IQ numbers or list fake credentials. This is what ACTUAL credibility looks like, frens. The work speaks. Respect. ✅🙌",
            timestamp: Date.now() - 86400000 * 3,
            reactions: { fire: 342, cap: 5 }
        },
        {
            id: 'v3',
            handle: '@AlphaLeaks',
            name: 'Alpha Leaks',
            bio: '100% win rate | Never lost a trade | Free signals in DMs',
            verdict: 'cap',
            mayorComment: "100% WIN RATE?! 💀 Ser, even the best quants in the world hit maybe 55-60%. This is either a scammer or someone who deletes their losing calls. 'Free signals in DMs' = incoming rug. RUN. 🏃‍♂️🚨",
            timestamp: Date.now() - 86400000 * 4,
            reactions: { fire: 89, cap: 3 }
        },
        {
            id: 'v4',
            handle: '@naval',
            name: 'Naval',
            bio: 'Angel investor',
            verdict: 'nocap',
            mayorComment: "Two words. Doesn't say 'LEGENDARY angel investor' or '1000x returns'. Just 'Angel investor'. Meanwhile actually has hits like Twitter, Uber, and countless others. Humble kings stay humble. ✅",
            timestamp: Date.now() - 86400000 * 5,
            reactions: { fire: 201, cap: 8 }
        },
        {
            id: 'v5',
            handle: '@ThoughtLeaderX',
            name: 'Thought Leader X',
            bio: 'Visionary | Futurist | 5x TEDx Speaker | Changing paradigms',
            verdict: 'cap',
            mayorComment: "Self-proclaimed 'Visionary' and 'Thought Leader' 💀 Fren, these are titles OTHER PEOPLE give you. Also TEDx ≠ TED. Anyone can do TEDx if they pay. This bio is a red flag factory. 🧢",
            timestamp: Date.now() - 86400000 * 6,
            reactions: { fire: 156, cap: 21 }
        },
        {
            id: 'v6',
            handle: '@Web3Founder',
            name: 'Web3 Founder',
            bio: 'Building in stealth | Raised $50M | Ex-FAANG | Disrupting everything',
            verdict: 'cap',
            mayorComment: "'Building in stealth' for how long tho? 🤔 If you raised $50M, there would be a Crunchbase entry. 'Ex-FAANG' doing what exactly? This bio has more red flags than a Chinese military parade. 🧢",
            timestamp: Date.now() - 86400000 * 7,
            reactions: { fire: 98, cap: 15 }
        },
        {
            id: 'v7',
            handle: '@HumbleDev',
            name: 'Sarah Chen',
            bio: 'Software engineer. Building stuff. she/her',
            verdict: 'nocap',
            mayorComment: "No fake IQ. No 'serial entrepreneur'. No 'thought leader'. Just someone who codes and ships. This is the energy we need more of. Actual builders > Professional bio writers. ✅",
            timestamp: Date.now() - 86400000 * 8,
            reactions: { fire: 178, cap: 2 }
        },
        {
            id: 'v8',
            handle: '@GrindsetKing',
            name: 'Grindset King',
            bio: 'Wake up 3AM | Cold showers | No days off | Millionaire by 25 | You\'re just lazy',
            verdict: 'cap',
            mayorComment: "Ah yes, the 'you're just lazy' guy 😂 Ser, sleep deprivation isn't a flex. Cold showers don't make you rich. And millionaires don't spend their time posting motivational content at 3AM. Touch grass. 🧢💀",
            timestamp: Date.now() - 86400000 * 9,
            reactions: { fire: 234, cap: 45 }
        }
    ];
    
    // Combine seeded + player verdicts
    const allVerdicts = [...seededVerdicts, ...verdicts].sort((a, b) => b.timestamp - a.timestamp);
    
    // Filter verdicts
    const filteredVerdicts = allVerdicts.filter(v => {
        const matchesSearch = searchTerm === '' || 
            v.handle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.bio.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesFilter = filterType === 'all' || v.verdict === filterType;
        
        return matchesSearch && matchesFilter;
    });
    
    // Stats
    const stats = {
        total: allVerdicts.length,
        cap: allVerdicts.filter(v => v.verdict === 'cap').length,
        nocap: allVerdicts.filter(v => v.verdict === 'nocap').length,
        totalFire: allVerdicts.reduce((sum, v) => sum + (v.reactions?.fire || 0), 0)
    };
    
    const formatTime = (timestamp) => {
        const diff = Date.now() - timestamp;
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor(diff / 60000);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    };
    
    const shareVerdict = (verdict) => {
        const emoji = verdict.verdict === 'cap' ? '🧢' : '✅';
        const text = `${emoji} Mayor Satoshi's verdict on ${verdict.handle}:\n\n"${verdict.bio}"\n\n🎩 "${verdict.mayorComment.substring(0, 100)}..."\n\nMore roasts at degenscity.com`;
        shareToX(text);
    };
    
    return (
        <div className="verdict-history">
            <div 
                className="verdict-history-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📜</span>
                    <span>Verdict History</span>
                    <span className="verdict-count">{stats.total} roasts</span>
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="verdict-history-content">
                    {/* Stats Bar */}
                    <div className="verdict-stats">
                        <div className="verdict-stat">
                            <span className="stat-value">{stats.cap}</span>
                            <span className="stat-label">🧢 Cap</span>
                        </div>
                        <div className="verdict-stat">
                            <span className="stat-value">{stats.nocap}</span>
                            <span className="stat-label">✅ Legit</span>
                        </div>
                        <div className="verdict-stat">
                            <span className="stat-value">{stats.totalFire}</span>
                            <span className="stat-label">🔥 Total</span>
                        </div>
                    </div>
                    
                    {/* Search & Filter */}
                    <div className="verdict-filters">
                        <input
                            type="text"
                            placeholder="Search handles, names, bios..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="verdict-search"
                        />
                        <div className="verdict-filter-btns">
                            <button 
                                className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
                                onClick={() => setFilterType('all')}
                            >
                                All
                            </button>
                            <button 
                                className={`filter-btn cap ${filterType === 'cap' ? 'active' : ''}`}
                                onClick={() => setFilterType('cap')}
                            >
                                🧢 Cap
                            </button>
                            <button 
                                className={`filter-btn nocap ${filterType === 'nocap' ? 'active' : ''}`}
                                onClick={() => setFilterType('nocap')}
                            >
                                ✅ Legit
                            </button>
                        </div>
                    </div>
                    
                    {/* Verdicts List */}
                    <div className="verdict-list">
                        {filteredVerdicts.length === 0 ? (
                            <div className="verdict-empty">
                                No verdicts found matching "{searchTerm}"
                            </div>
                        ) : (
                            filteredVerdicts.slice(0, 10).map((verdict, idx) => (
                                <div key={verdict.id || idx} className={`verdict-card ${verdict.verdict}`}>
                                    <div className="verdict-card-header">
                                        <div className="verdict-target">
                                            <span className="verdict-handle">{verdict.handle}</span>
                                            <span className="verdict-name">{verdict.name}</span>
                                        </div>
                                        <div className={`verdict-badge ${verdict.verdict}`}>
                                            {verdict.verdict === 'cap' ? '🧢 CAP' : '✅ LEGIT'}
                                        </div>
                                    </div>
                                    
                                    <div className="verdict-bio">
                                        "{verdict.bio}"
                                    </div>
                                    
                                    <div className="verdict-mayor-comment">
                                        <span className="mayor-icon">🎩</span>
                                        {verdict.mayorComment}
                                    </div>
                                    
                                    <div className="verdict-card-footer">
                                        <div className="verdict-reactions">
                                            <span className="reaction">🔥 {verdict.reactions?.fire || 0}</span>
                                            <span className="reaction">🧢 {verdict.reactions?.cap || 0}</span>
                                        </div>
                                        <span className="verdict-time">{formatTime(verdict.timestamp)}</span>
                                        <button 
                                            className="verdict-share-btn"
                                            onClick={() => shareVerdict(verdict)}
                                        >
                                            📤
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    
                    {filteredVerdicts.length > 10 && (
                        <div className="verdict-more">
                            Showing 10 of {filteredVerdicts.length} verdicts
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== CAP ALERT SYSTEM ====================

function MayorActionComment({ comment, onClose }) {
    const [leaving, setLeaving] = useState(false);
    
    useEffect(() => {
        if (!comment) return;
        
        // Auto-dismiss after 6 seconds
        const timer = setTimeout(() => {
            setLeaving(true);
            setTimeout(onClose, 400);
        }, 6000);
        
        return () => clearTimeout(timer);
    }, [comment, onClose]);
    
    if (!comment) return null;
    
    const handleClose = () => {
        setLeaving(true);
        setTimeout(onClose, 400);
    };
    
    return (
        <div className={`mayor-action-comment ${leaving ? 'leaving' : ''}`}>
            <button className="mayor-action-comment-close" onClick={handleClose}>✕</button>
            <div className="mayor-action-comment-header">
                <div className="mayor-action-comment-avatar">🎩</div>
                <div>
                    <div className="mayor-action-comment-name">Mayor Satoshi</div>
                    <div className="mayor-action-comment-context">{comment.context}</div>
                </div>
            </div>
            <div className="mayor-action-comment-text">{comment.text}</div>
        </div>
    );
}

// ==================== MAYOR CHAT COMPONENT ====================

function MayorChat({ playerName, playerLevel }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    
    // Known name-to-handle mappings for famous people
    const knownHandles = {
        // Tech & Crypto figures
        'elon musk': 'elonmusk',
        'elon': 'elonmusk',
        'vitalik': 'VitalikButerin',
        'vitalik buterin': 'VitalikButerin',
        'cz': 'caborose',
        'changpeng zhao': 'caborose',
        'sbf': 'SBF_FTX',
        'sam bankman': 'SBF_FTX',
        'sam bankman-fried': 'SBF_FTX',
        'sam bankman fried': 'SBF_FTX',
        'brian armstrong': 'brian_armstrong',
        'michael saylor': 'saborose',
        'saylor': 'saborose',
        'jack dorsey': 'jack',
        'marc andreessen': 'pmarca',
        'balaji': 'balajis',
        'balaji srinivasan': 'balajis',
        'naval': 'naval',
        'naval ravikant': 'naval',
        'gary gensler': 'GaryGensler',
        'gensler': 'GaryGensler',
        'cathie wood': 'CathieDWood',
        'cathie': 'CathieDWood',
        'do kwon': 'staborose',
        'justin sun': 'justinsuntron',
        'richard heart': 'RichardHeartWin',
        'cobie': 'coaborose',
        'hsaka': 'HsakaTrades',
        'ansem': 'blaborose',
        'murad': 'MustStopMurad',
        // Tech CEOs
        'zuck': 'finkd',
        'zuckerberg': 'finkd',
        'mark zuckerberg': 'finkd',
        'jeff bezos': 'JeffBezos',
        'bezos': 'JeffBezos',
        'bill gates': 'BillGates',
        'tim cook': 'tim_cook',
        'sundar pichai': 'sundaborosechai',
        'satya nadella': 'sataboroseadella',
        'jensen huang': 'nvidia',
        // Politicians & Public figures
        'trump': 'realDonaldTrump',
        'donald trump': 'realDonaldTrump',
        'biden': 'POTUS',
        'joe biden': 'POTUS',
        'obama': 'BarackObama',
        'barack obama': 'BarackObama',
        // Entertainers
        'mr beast': 'MrBeast',
        'mrbeast': 'MrBeast',
        'pewdiepie': 'pewdiepie',
        'logan paul': 'LoganPaul',
        'jake paul': 'jakepaul',
        'kim kardashian': 'KimKardashian',
        'kanye': 'kaboroseest',
        'kanye west': 'kaboroseest',
        'drake': 'Drake',
        'rihanna': 'riaborosea',
        'taylor swift': 'taylorswift13',
        // Sports
        'lebron': 'KingJames',
        'lebron james': 'KingJames',
        'ronaldo': 'Cristiano',
        'cristiano ronaldo': 'Cristiano',
        'messi': 'TeamMessi'
    };
    
    // Detect if message is asking about an X/Twitter user
    const detectXUserQuery = (message) => {
        const lowerMsg = message.toLowerCase();
        
        // Pattern 1: Direct @handle mention
        const handleMatch = message.match(/@([a-zA-Z0-9_]{1,15})\b/);
        if (handleMatch) {
            return { type: 'handle', query: handleMatch[0], handle: handleMatch[1] };
        }
        
        // Pattern 2: Check if message contains a known name
        for (const [name, handle] of Object.entries(knownHandles)) {
            if (lowerMsg.includes(name)) {
                return { type: 'known', query: name, handle: handle };
            }
        }
        
        // Pattern 3: "who is [name]" or "look up [name]" or "tell me about [name]"
        const whoIsPatterns = [
            /who\s+is\s+([a-zA-Z0-9_\s]+?)(?:\s+on\s+(?:x|twitter))?\s*\??$/i,
            /look\s*up\s+([a-zA-Z0-9_\s]+?)(?:\s+on\s+(?:x|twitter))?\s*$/i,
            /tell\s+me\s+about\s+([a-zA-Z0-9_\s]+?)(?:\s+on\s+(?:x|twitter))?\s*$/i,
            /what\s+(?:do\s+you\s+)?(?:know|think)\s+(?:about|of)\s+([a-zA-Z0-9_\s]+?)(?:\s+on\s+(?:x|twitter))?\s*\??$/i,
            /search\s+(?:for\s+)?([a-zA-Z0-9_\s]+?)(?:\s+on\s+(?:x|twitter))?\s*$/i,
            /^([a-zA-Z0-9_\s]{2,30})\??\s*$/i  // Just a name with optional question mark
        ];
        
        for (const pattern of whoIsPatterns) {
            const match = message.match(pattern);
            if (match && match[1] && match[1].trim().length > 1) {
                const name = match[1].trim().toLowerCase();
                // Skip common words that aren't names
                const skipWords = ['degens city', 'the mayor', 'this', 'that', 'you', 'me', 'us', 'it', 'what', 'how', 'why', 'when', 'where', 'hi', 'hello', 'hey'];
                if (!skipWords.includes(name)) {
                    // Check if this name is in our known handles
                    if (knownHandles[name]) {
                        return { type: 'known', query: name, handle: knownHandles[name] };
                    }
                    return { type: 'name', query: match[1].trim(), handle: null };
                }
            }
        }
        
        return null;
    };
    
    // Look up X user info via backend (avoids CORS issues)
    const lookupXUser = async (query, handle) => {
        try {
            const lookupHandle = handle || query.replace(/\s+/g, '').replace('@', '');
            
            console.log(`🔍 Looking up X user via backend: @${lookupHandle}`);
            
            const response = await fetch(`${API_BASE}/api/x/lookup/${lookupHandle}`);
            const data = await response.json();
            
            if (data.success && data.user) {
                const { displayName, bio, handle: userHandle } = data.user;
                console.log(`✅ Found X user: ${displayName} (@${userHandle})`);
                
                return {
                    query: `@${userHandle}`,
                    info: `@${userHandle} (${displayName})${bio ? ` - Bio: "${bio}"` : ' - No bio available'}`
                };
            }
            
            console.log(`❌ X lookup failed: ${data.error}`);
            return null;
        } catch (error) {
            console.log('X lookup error (non-critical):', error.message);
            return null;
        }
    };
    
    const sendMessage = async () => {
        if (!input.trim() || loading) return;
        
        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setLoading(true);
        
        try {
            // Check if this is an X user query
            let xUserContext = null;
            const xQuery = detectXUserQuery(userMessage);
            
            // Also check if message contains IQ claims to analyze
            const iqMatch = userMessage.match(/iq\s*[:\-]?\s*(\d+)|(\d+)\s*iq/i);
            const mentionedIQ = iqMatch ? (iqMatch[1] || iqMatch[2]) : null;
            
            if (xQuery) {
                console.log('🔍 Detected X user query:', xQuery);
                // Try to look up the user
                xUserContext = await lookupXUser(xQuery.query, xQuery.handle);
                
                if (xUserContext) {
                    console.log('✅ Found X user info:', xUserContext);
                    // If user mentioned an IQ in their message, add it to context
                    if (mentionedIQ) {
                        xUserContext.info += ` [USER CLAIMS IQ: ${mentionedIQ}]`;
                    }
                } else {
                    // Lookup failed - build context from the user's message
                    let contextInfo = `User asked about "${xQuery.query}".`;
                    if (mentionedIQ) {
                        contextInfo += ` IMPORTANT: This person allegedly claims an IQ of ${mentionedIQ}. This is a FAKE/MADE UP number that needs to be called out!`;
                    }
                    contextInfo += ` No X/Twitter profile was found, but analyze based on what the citizen told you.`;
                    
                    xUserContext = {
                        query: xQuery.query,
                        info: contextInfo
                    };
                }
            } else if (mentionedIQ && parseInt(mentionedIQ) > 160) {
                // User mentioned a high IQ even without a specific person query - still flag it
                xUserContext = {
                    query: 'IQ claim analysis',
                    info: `The citizen mentioned someone with an alleged IQ of ${mentionedIQ}. This is a FAKE/MADE UP number - Einstein was only 160! Call this out as BS.`
                };
            }
            
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    playerName: playerName || 'Citizen',
                    playerLevel: playerLevel || 1,
                    xUserContext: xUserContext
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                setMessages(prev => [...prev, { role: 'mayor', text: data.response }]);
                // Play notification sound
                if (window.GameSounds) window.GameSounds.notification();
            } else {
                setMessages(prev => [...prev, { role: 'mayor', text: "Hmm, my brain is buffering... The mempool is congested! Try again, fren. 🧠" }]);
            }
        } catch (error) {
            console.error('Mayor chat error:', error);
            setMessages(prev => [...prev, { role: 'mayor', text: "Ser, the connection to City Hall is rugged right now. WAGMI though! 📡" }]);
        }
        
        setLoading(false);
    };
    
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    const handleQuickAction = async (actionType) => {
        if (loading) return;
        
        const prompts = {
            roast: `Roast me playfully! My name is ${playerName} and I'm level ${playerLevel}. Give me a funny, savage but friendly roast about being a degen in Degens City.`,
            prophecy: `Give me a cryptic market prophecy! Be mysterious and dramatic, mix real crypto wisdom with absurd predictions. Make it feel like ancient wisdom from a chaotic oracle.`,
            advice: `Give me your best degen advice for succeeding in Degens City! Mix actual helpful tips with your chaotic Mayor energy.`,
            hype: `Hype me up! My name is ${playerName}, level ${playerLevel}. Give me an over-the-top motivational speech that makes me feel like the ultimate crypto chad. Maximum hype energy!`
        };
        
        const labels = {
            roast: '🔥 Roast Me',
            prophecy: '🔮 Prophecy',
            advice: '💡 Advice',
            hype: '💎 Hype Me'
        };
        
        setMessages(prev => [...prev, { role: 'user', text: labels[actionType] }]);
        setLoading(true);
        
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompts[actionType],
                    playerName: playerName || 'Citizen',
                    playerLevel: playerLevel || 1
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                setMessages(prev => [...prev, { role: 'mayor', text: data.response }]);
                if (window.GameSounds) window.GameSounds.notification();
            } else {
                setMessages(prev => [...prev, { role: 'mayor', text: "The Mayor's brain is buffering... Try again fren! 🧠" }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'mayor', text: "Connection to City Hall rugged! WAGMI though! 📡" }]);
        }
        
        setLoading(false);
    };
    
    return (
        <div className="mayor-chat">
            <div 
                className="mayor-chat-header" 
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <span style={{ fontSize: '1.5em' }}>🤖</span>
                <span>Chat with Mayor Satoshi</span>
                <span style={{ marginLeft: 'auto', color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <>
                    {/* Quick Action Buttons */}
                    <div className="mayor-quick-actions">
                        <button className="mayor-quick-btn roast" onClick={() => handleQuickAction('roast')} disabled={loading}>
                            🔥 Roast Me
                        </button>
                        <button className="mayor-quick-btn prophecy" onClick={() => handleQuickAction('prophecy')} disabled={loading}>
                            🔮 Prophecy
                        </button>
                        <button className="mayor-quick-btn advice" onClick={() => handleQuickAction('advice')} disabled={loading}>
                            💡 Advice
                        </button>
                        <button className="mayor-quick-btn compliment" onClick={() => handleQuickAction('hype')} disabled={loading}>
                            💎 Hype Me
                        </button>
                    </div>
                    
                    <div className="mayor-chat-messages">
                        {messages.length === 0 && (
                            <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                                Ask the Mayor anything about Degens City! 🏛️
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`mayor-chat-message ${msg.role}`}>
                                <div className="sender">
                                    {msg.role === 'mayor' ? '🏛️ Mayor Satoshi:' : '👤 You:'}
                                </div>
                                <div className="text">{msg.text}</div>
                            </div>
                        ))}
                        {loading && (
                            <div className="mayor-typing">
                                Mayor is typing...
                            </div>
                        )}
                    </div>
                    
                    <div className="mayor-chat-input">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Ask the Mayor something..."
                            maxLength={500}
                            disabled={loading}
                        />
                        <button onClick={sendMessage} disabled={loading || !input.trim()}>
                            {loading ? '...' : 'Send'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}


function MayorSection({ currentVote, onVote, aiGenerating, character, showConfetti, votingDisabled }) {
    const [selectedOption, setSelectedOption] = useState(null);
    const [voted, setVoted] = useState(votingDisabled);
    
    // Calculate time remaining in current 6-hour cycle CLIENT-SIDE
    // This ensures the timer is always accurate regardless of backend
    const calculateTimeRemaining = () => {
        const CYCLE_MS = 2 * 60 * 60 * 1000; // 6 hours in ms
        const now = Date.now();
        
        // Align to 6-hour windows starting from midnight UTC
        const midnight = new Date();
        midnight.setUTCHours(0, 0, 0, 0);
        const midnightMs = midnight.getTime();
        
        // Find when current cycle started
        const cyclesSinceMidnight = Math.floor((now - midnightMs) / CYCLE_MS);
        const cycleStart = midnightMs + (cyclesSinceMidnight * CYCLE_MS);
        const cycleEnd = cycleStart + CYCLE_MS;
        
        // Return seconds remaining
        return Math.max(0, Math.floor((cycleEnd - now) / 1000));
    };
    
    const [timeLeft, setTimeLeft] = useState(calculateTimeRemaining());

    // Real countdown timer - recalculates every second
    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeRemaining());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Update voted state when votingDisabled changes
    useEffect(() => {
        setVoted(votingDisabled);
    }, [votingDisabled]);

    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m ${secs}s`;
    };

    const handleVote = () => {
        if (selectedOption) {
            onVote(selectedOption);
            setVoted(true);
        }
    };

    const handleShare = () => {
        const text = `I just voted in Degens City! 🏛️\n\nCheck it out: degenscity.com\n\n#DegensCity #Solana`;
        shareToX(text);
    };

    const winningOption = currentVote.options.reduce((a, b) => 
        (a.percentage || a.votes) > (b.percentage || b.votes) ? a : b
    );

    const isUrgent = timeLeft < 3600; // Less than 1 hour

    return (
        <div className="card">
            <div className="mayor-report">
                <div className="mayor-avatar" style={{ background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABAADASIAAhEBAxEB/8QAHQABAAEEAwEAAAAAAAAAAAAAAAECAwQHBQYICf/EAGAQAAEDAwEFBAYHBAYECAsFCQEAAgMEBREGBxIhMUETUWFxCBQigZGhIzJCUrHB0RVicoIkM0OSosJTsuHwCRYlNGNzlNIXGCY1NkRFdISTo1Vkg7PD4vFUhZXTRlZl/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAECAwQFBgf/xABCEQACAQMCAwMLAwIEBQQDAQAAAQIDBBEFMRIhQQYTUSIyYXGBkaGx0eHwFELBFTMjNFLxFiRDcpIHJVOiRGKCsv/aAAwDAQACEQMRAD8A8aIiIWCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAnBEQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBQpRAQpREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAERTwQEIpRAQik4UIAiIgCIiAIiIBhFKcEBCKcKEAREQBEwiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAilEBGEwpRTgDCFEQEIiYUAImFOFIwQilMICEUogIRSiDBHvRSiEkIpRCCEUogwQilEAUKUwgChTwTCgAIiKQEREAwowpRQBhMIiAhFJUIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIApwgRAFBUoVIIREwgJUKUQYCIpQEIiIAiIpJCIpUEBQpUKQEUomAQinCJgEIpRMAhFKYTBJCKcImAQilQmCMBFKhMAIiKCQiIpIyERMqAFGFKISEREBCKUKEBMIiAjCKVCYARSowoAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEQKcICEwpTKAKCpRTgEIngpwgHRERAEREJCIikBFOEwmAQpQKQpwQRhERMEjCImFOAOiKVGEwCVBUopwMFKlThMJgYIymVKJwjBBRSinAwRwRSiYGCEU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hMoikgnOUUJkoApUZTKnIJUIiZJJRQpU5AypUZRTkEooUpxDJOUyoRTxEk5TKhE4gTlMqEU8QyTlMqMqMpxEFWUyqcqcqeInJVlRlRlRlOIZK8qMqMoo4hknKZUInEMk5UJlFHERkKMooUZGSpQmUTIyEyihRkZJyicFGVGSCVCjKJkE5UZRSFACImUJCZUIoGSVCnmoQgIiKAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAUHkpRAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBSCoRASmVCICUUJlASoU9FCkDKnKhEBKhFOUAUKUQAJlMogGUyiIAihMlSCUUZU5TIJRRlEyCUynBQmQTlMooU5JClQiZIClQiZARFKZJIU5RQmQTlQmUymSCUUZCZUZBKhOKBATwTKhEyCcqERAQilFAwQpQqEBKKEQEoihAEREyAiIoAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREA4opUICUUIpGSUUKeaAYUYUomQRhFKJkYIRSiDBCIUTIwMplETIGUyilMjBCc1KKcjAUKUUE4IRSoTJGCcIihMkkoihQCUUIhBKFQpKkAqERAERFACIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiABERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQEooRASoREAREQEqERAETKZQBFKhAEUqFICZREATKBEBKhEQBERQAiIgCIiAnooREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQEhQiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCKFKEBERCQiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIihASiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCKMplCCUUZTKAlFGVKAIoymUBKIiEhERAEREAREQBERAEREB//9k=" alt="Mayor" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }} />
                </div>
                <h2 style={{ marginBottom: '15px' }}>Mayor's Address</h2>
                <div className="mayor-quote">"{currentVote.mayorQuote}"</div>
            </div>

            {aiGenerating ? (
                <div style={{ 
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '2px dashed #ffd700',
                    padding: '40px',
                    borderRadius: '10px',
                    textAlign: 'center',
                    color: '#ffd700'
                }}>
                    <div className="spinner" style={{ marginBottom: '15px' }}></div>
                    <p>AI Mayor is processing your vote...</p>
                    <p style={{ fontSize: '0.9em', marginTop: '10px', color: '#888' }}>
                        Analyzing consequences, generating new scenario...
                    </p>
                </div>
            ) : (
                <>
                    <div className={`timer ${isUrgent ? 'urgent' : ''}`}>
                        ⏰ Vote closes in {formatTime(timeLeft)}
                        {isUrgent && <div style={{ fontSize: '0.8em', marginTop: '5px' }}>⚠️ HURRY!</div>}
                    </div>

                    <div className="vote-section">
                        {/* Category Badge */}
                        {currentVote.category && (
                            <div style={{ 
                                display: 'inline-block',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '0.75em',
                                fontWeight: 'bold',
                                marginBottom: '12px',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                background: {
                                    economy: 'linear-gradient(135deg, #ffd700, #ff8c00)',
                                    drama: 'linear-gradient(135deg, #ff4444, #ff69b4)',
                                    chaos: 'linear-gradient(135deg, #9b59b6, #3498db)',
                                    crime: 'linear-gradient(135deg, #2c3e50, #34495e)',
                                    culture: 'linear-gradient(135deg, #1abc9c, #16a085)',
                                    tech: 'linear-gradient(135deg, #3498db, #2980b9)',
                                    emergency: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                                    weird: 'linear-gradient(135deg, #9b59b6, #8e44ad)',
                                    meta: 'linear-gradient(135deg, #95a5a6, #7f8c8d)',
                                    social: 'linear-gradient(135deg, #e91e63, #c2185b)',
                                    legacy: 'linear-gradient(135deg, #795548, #5d4037)'
                                }[currentVote.category] || 'linear-gradient(135deg, #666, #444)',
                                color: '#fff',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                            }}>
                                {{
                                    economy: '💰 ECONOMY',
                                    drama: '🎭 DRAMA',
                                    chaos: '🌀 CHAOS',
                                    crime: '⚖️ CRIME & JUSTICE',
                                    culture: '🎨 CULTURE',
                                    tech: '🤖 TECHNOLOGY',
                                    emergency: '🚨 EMERGENCY',
                                    weird: '👽 WEIRD',
                                    meta: '🗳️ GOVERNANCE',
                                    social: '💬 SOCIAL',
                                    legacy: '🏛️ LEGACY'
                                }[currentVote.category] || '📋 VOTE'}
                            </div>
                        )}
                        
                        <h3 style={{ color: '#ffd700', marginBottom: '15px' }}>
                            {currentVote.question}
                        </h3>

                        {currentVote.options.map(option => (
                            <div 
                                key={option.id}
                                className={`vote-option 
                                    ${selectedOption === option.id ? 'selected' : ''} 
                                    ${option.id === winningOption.id ? 'winning' : ''}`}
                                onClick={() => !voted && setSelectedOption(option.id)}
                            >
                                <div className="option-title">
                                    {option.id}. {option.title}
                                </div>
                                <div className="option-description">
                                    {option.description}
                                </div>
                                <div className="option-effects">
                                    {option.effects.map((effect, idx) => (
                                        <span key={idx} className={`effect-badge effect-${effect.type}`}>
                                            {effect.stat}: {effect.value > 0 ? '+' : ''}{effect.value}
                                        </span>
                                    ))}
                                </div>
                                <div className="vote-results">
                                    <span>Current Votes: {option.percentage || 0}%</span>
                                    {option.id === winningOption.id && <span style={{ color: '#ffd700' }}>🏆 WINNING</span>}
                                </div>
                            </div>
                        ))}

                        <button 
                            className="vote-btn"
                            onClick={handleVote}
                            disabled={!selectedOption || voted || votingDisabled}
                        >
                            {(voted || votingDisabled) ? '✓ Already Voted' : 'Cast Your Vote'}
                        </button>

                        {(voted || votingDisabled) && (
                            <>
                                <p style={{ textAlign: 'center', color: '#ffd700', marginTop: '15px' }}>
                                    {votingDisabled ? '⚠️ You have already voted in this round!' : '🎉 Your vote has been recorded! Results will be announced when voting closes.'}
                                </p>
                                <button className="share-btn" onClick={handleShare} style={{ width: '100%' }}>
                                    𝕏 Share on X
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}


function MayorApprovalRating({ playerName, gameState }) {
    const [expanded, setExpanded] = useState(false);
    const [approvalData, setApprovalData] = useState(() => {
        const saved = localStorage.getItem('mayor_approval_data');
        return saved ? JSON.parse(saved) : {
            currentRating: 72,
            trend: 'up',
            totalVotes: 1247,
            playerVote: null,
            history: [
                { day: 1, rating: 65 },
                { day: 2, rating: 68 },
                { day: 3, rating: 71 },
                { day: 4, rating: 69 },
                { day: 5, rating: 72 },
            ],
            recentDecisions: [
                { id: 1, decision: 'Lowered meme tax by 5%', impact: +8, votes: { approve: 234, disapprove: 56 } },
                { id: 2, decision: 'Opened new Degen District', impact: +12, votes: { approve: 312, disapprove: 89 } },
                { id: 3, decision: 'Banned FUD spreading', impact: -3, votes: { approve: 156, disapprove: 178 } },
                { id: 4, decision: 'Increased HOPIUM rewards', impact: +15, votes: { approve: 445, disapprove: 34 } },
            ],
            lastVoteTime: null
        };
    });
    
    // Save to localStorage
    useEffect(() => {
        localStorage.setItem('mayor_approval_data', JSON.stringify(approvalData));
    }, [approvalData]);
    
    // Can vote once per day
    const canVote = () => {
        if (!approvalData.lastVoteTime) return true;
        const lastVote = new Date(approvalData.lastVoteTime);
        const now = new Date();
        return lastVote.toDateString() !== now.toDateString();
    };
    
    const submitVote = (vote) => {
        if (!canVote()) return;
        
        const voteImpact = vote === 'approve' ? 0.5 : -0.5;
        const newRating = Math.max(0, Math.min(100, approvalData.currentRating + voteImpact));
        const previousRating = approvalData.currentRating;
        
        setApprovalData(prev => ({
            ...prev,
            currentRating: newRating,
            trend: newRating > previousRating ? 'up' : newRating < previousRating ? 'down' : 'stable',
            totalVotes: prev.totalVotes + 1,
            playerVote: vote,
            lastVoteTime: new Date().toISOString(),
            history: [...prev.history.slice(-6), { day: prev.history.length + 1, rating: Math.round(newRating) }]
        }));
    };
    
    const getRatingColor = (rating) => {
        if (rating >= 70) return '#00ff88';
        if (rating >= 50) return '#ffd700';
        if (rating >= 30) return '#ff8844';
        return '#ff4444';
    };
    
    const getRatingLabel = (rating) => {
        if (rating >= 80) return 'Beloved';
        if (rating >= 70) return 'Popular';
        if (rating >= 60) return 'Approved';
        if (rating >= 50) return 'Mixed';
        if (rating >= 40) return 'Unpopular';
        if (rating >= 30) return 'Disliked';
        return 'Hated';
    };
    
    const getMayorMood = (rating) => {
        if (rating >= 80) return { emoji: '😎', text: 'The Mayor is thriving!' };
        if (rating >= 70) return { emoji: '😊', text: 'The Mayor is pleased' };
        if (rating >= 60) return { emoji: '🙂', text: 'The Mayor is content' };
        if (rating >= 50) return { emoji: '😐', text: 'The Mayor is concerned' };
        if (rating >= 40) return { emoji: '😟', text: 'The Mayor is worried' };
        if (rating >= 30) return { emoji: '😰', text: 'The Mayor is sweating' };
        return { emoji: '😱', text: 'RECALL ELECTION INCOMING!' };
    };
    
    const rating = approvalData.currentRating;
    const ratingColor = getRatingColor(rating);
    const ratingLabel = getRatingLabel(rating);
    const mayorMood = getMayorMood(rating);
    
    return (
        <div className="mayor-approval">
            <div 
                className="approval-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📊</span>
                    <span>Mayor Approval</span>
                    <span 
                        className="approval-quick-rating"
                        style={{ color: ratingColor }}
                    >
                        {Math.round(rating)}%
                        {approvalData.trend === 'up' && ' ↑'}
                        {approvalData.trend === 'down' && ' ↓'}
                    </span>
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="approval-content">
                    {/* Main Rating Display */}
                    <div className="approval-main-display">
                        <div className="approval-gauge">
                            <svg viewBox="0 0 120 70" className="gauge-svg">
                                {/* Background arc */}
                                <path
                                    d="M 10 60 A 50 50 0 0 1 110 60"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.1)"
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                />
                                {/* Colored arc based on rating */}
                                <path
                                    d="M 10 60 A 50 50 0 0 1 110 60"
                                    fill="none"
                                    stroke={ratingColor}
                                    strokeWidth="10"
                                    strokeLinecap="round"
                                    strokeDasharray={`${(rating / 100) * 157} 157`}
                                    style={{ filter: `drop-shadow(0 0 8px ${ratingColor})` }}
                                />
                            </svg>
                            <div className="gauge-center">
                                <div className="gauge-value" style={{ color: ratingColor }}>
                                    {Math.round(rating)}%
                                </div>
                                <div className="gauge-label">{ratingLabel}</div>
                            </div>
                        </div>
                        
                        <div className="approval-mayor-mood">
                            <span className="mood-emoji">{mayorMood.emoji}</span>
                            <span className="mood-text">{mayorMood.text}</span>
                        </div>
                    </div>
                    
                    {/* Vote Section */}
                    <div className="approval-vote-section">
                        <div className="vote-question">
                            Do you approve of Mayor Satoshi's leadership?
                        </div>
                        {canVote() ? (
                            <div className="vote-buttons">
                                <button 
                                    className="vote-btn approve"
                                    onClick={() => submitVote('approve')}
                                >
                                    👍 Approve
                                </button>
                                <button 
                                    className="vote-btn disapprove"
                                    onClick={() => submitVote('disapprove')}
                                >
                                    👎 Disapprove
                                </button>
                            </div>
                        ) : (
                            <div className="vote-submitted">
                                <span className="vote-check">✅</span>
                                You voted: <strong>{approvalData.playerVote === 'approve' ? '👍 Approve' : '👎 Disapprove'}</strong>
                                <div className="vote-next">Vote again tomorrow!</div>
                            </div>
                        )}
                        <div className="total-votes">
                            {approvalData.totalVotes.toLocaleString()} citizens have voted
                        </div>
                    </div>
                    
                    {/* Rating History Mini Chart */}
                    <div className="approval-history">
                        <div className="history-title">📈 Rating History</div>
                        <div className="history-chart">
                            {approvalData.history.map((point, idx) => (
                                <div key={idx} className="history-bar-container">
                                    <div 
                                        className="history-bar"
                                        style={{ 
                                            height: `${point.rating}%`,
                                            background: getRatingColor(point.rating)
                                        }}
                                    ></div>
                                    <div className="history-day">D{point.day}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Recent Decisions */}
                    <div className="approval-decisions">
                        <div className="decisions-title">🗳️ Recent Decisions</div>
                        <div className="decisions-list">
                            {approvalData.recentDecisions.map((decision, idx) => (
                                <div key={idx} className="decision-item">
                                    <div className="decision-text">{decision.decision}</div>
                                    <div className="decision-stats">
                                        <span className={`decision-impact ${decision.impact >= 0 ? 'positive' : 'negative'}`}>
                                            {decision.impact >= 0 ? '+' : ''}{decision.impact}%
                                        </span>
                                        <span className="decision-votes">
                                            👍 {decision.votes.approve} | 👎 {decision.votes.disapprove}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Mayor's Response */}
                    <div className="mayor-response">
                        <span className="mayor-icon">🎩</span>
                        {rating >= 70 
                            ? "Thank you for your support, frens! Together we're building the greatest degen city in crypto history! WAGMI! 🚀"
                            : rating >= 50
                            ? "I hear your concerns, citizens. I'm working hard to make Degens City even better. Trust the process! 💪"
                            : "Look, I know times are tough, but have you considered that maybe... you're all just paper-handed? JK, I'll do better. 😅"
                        }
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== CAP DETECTIVE BADGES ====================

