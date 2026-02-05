// ====================================================
// city-core.js — City explorer, ledger, stats, events
// Degens City - Auto-extracted from index.html
// ====================================================

function ActionsPage({ character, playerStats, showToast }) {
    const [currentLocation, setCurrentLocation] = useState(null);
    const [situation, setSituation] = useState(null);
    const [loadingSituation, setLoadingSituation] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [outcome, setOutcome] = useState(null);
    const [chosenChoice, setChosenChoice] = useState(null);
    const [actionLog, setActionLog] = useState(() => {
        try { return JSON.parse(localStorage.getItem('dc_action_log') || '[]'); } catch(e) { return []; }
    });
    const [cooldownUntil, setCooldownUntil] = useState(() => {
        var saved = parseInt(localStorage.getItem('dc_explore_cooldown') || '0');
        return saved > Date.now() ? saved : 0;
    });
    const [cooldownText, setCooldownText] = useState('');
    const [walkingTo, setWalkingTo] = useState(null);
    const [reputation, setReputation] = useState(() => {
        return parseInt(localStorage.getItem('dc_city_rep') || '0');
    });
    // New states for game-feel
    const [walkPhase, setWalkPhase] = useState(0);
    const [typedText, setTypedText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [outcomeAnim, setOutcomeAnim] = useState('');
    const typingRef = useRef(null);
    
    
    const LOCATIONS = [
        { id: 'casino', name: 'Degen Casino', icon: '🎰', desc: 'High stakes, higher drama', color: '#ffd700', bgGrad: 'linear-gradient(135deg, #2a1a00, #1a1000)', vibe: 'Slot machines, poker tables, broken dreams' },
        { id: 'dark_alley', name: 'Dark Alley', icon: '🌙', desc: 'Shady deals & secrets', color: '#8a2be2', bgGrad: 'linear-gradient(135deg, #1a0a2e, #0a0a1a)', vibe: 'Whispers, shadows, opportunities' },
        { id: 'mayors_office', name: "Mayor's Office", icon: '🏛️', desc: 'Power & politics', color: '#ff4444', bgGrad: 'linear-gradient(135deg, #2a0a0a, #1a0a00)', vibe: 'Corruption, decrees, ambition' },
        { id: 'trading_floor', name: 'Trading Floor', icon: '📈', desc: 'Charts, candles & chaos', color: '#00ff88', bgGrad: 'linear-gradient(135deg, #0a2a1a, #001a0a)', vibe: 'Screens everywhere, pure adrenaline' },
        { id: 'courthouse', name: 'Courthouse', icon: '⚖️', desc: 'Justice (maybe)', color: '#4488ff', bgGrad: 'linear-gradient(135deg, #0a1a2e, #0a0a1a)', vibe: 'Gavels, objections, drama' },
        { id: 'town_square', name: 'Town Square', icon: '🏙️', desc: 'Where citizens clash', color: '#ff8800', bgGrad: 'linear-gradient(135deg, #2a1a0a, #1a0a00)', vibe: 'Protests, fights, gossip' },
        { id: 'underground', name: 'The Underground', icon: '🕳️', desc: 'You didn\'t see this', color: '#ff00ff', bgGrad: 'linear-gradient(135deg, #2a0a2a, #0a001a)', vibe: 'Secret societies, hidden passages' }
    ];
    
    // Typewriter effect
    var typeText = function(text, cb) {
        if (typingRef.current) clearInterval(typingRef.current);
        setTypedText(''); setIsTyping(true);
        var i = 0;
        typingRef.current = setInterval(function() {
            i++;
            setTypedText(text.substring(0, i));
            if (i >= text.length) { clearInterval(typingRef.current); typingRef.current = null; setIsTyping(false); if (cb) cb(); }
        }, 22);
    };
    useEffect(function() { return function() { if (typingRef.current) clearInterval(typingRef.current); }; }, []);
    
    // Cooldown timer
    useEffect(function() {
        if (!cooldownUntil || cooldownUntil <= Date.now()) { setCooldownText(''); return; }
        var iv = setInterval(function() {
            var diff = cooldownUntil - Date.now();
            if (diff <= 0) { setCooldownText(''); setCooldownUntil(0); clearInterval(iv); return; }
            var s = Math.ceil(diff / 1000);
            setCooldownText(s > 60 ? Math.floor(s/60) + 'm ' + (s%60) + 's' : s + 's');
        }, 1000);
        return function() { clearInterval(iv); };
    }, [cooldownUntil]);
    
    useEffect(function() { localStorage.setItem('dc_action_log', JSON.stringify(actionLog.slice(0, 30))); }, [actionLog]);
    useEffect(function() { localStorage.setItem('dc_city_rep', reputation.toString()); }, [reputation]);
    
    var exploreLocation = function(loc) {
        if (cooldownUntil > Date.now()) { showToast('Still cooling down! ' + cooldownText, 'error'); return; }
        setWalkingTo(loc.id); setWalkPhase(1);
        setSituation(null); setOutcome(null); setChosenChoice(null); setTypedText(''); setOutcomeAnim('');
        setTimeout(function() {
            setWalkPhase(2);
            setTimeout(function() {
                setCurrentLocation(loc); setWalkingTo(null); setWalkPhase(0); setLoadingSituation(true);
                fetch(API_BASE + '/api/city-situations?player=' + encodeURIComponent(character?.name || 'Citizen') + '&location=' + loc.id)
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (data.success) { setSituation(data.situation); if (data.situation && data.situation.desc) typeText(data.situation.desc); }
                        else { showToast('Nothing happening here right now...', 'info'); setCurrentLocation(null); }
                        setLoadingSituation(false);
                    })
                    .catch(function() { setLoadingSituation(false); showToast('Failed to scout location', 'error'); setCurrentLocation(null); });
            }, 800);
        }, 1500);
    };
    
    var makeChoice = function(choice) {
        if (resolving) return;
        setResolving(true); setChosenChoice(choice);
        fetch(API_BASE + '/api/city-situations/resolve', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ playerName: character?.name || 'Citizen', location: currentLocation?.id, situationTitle: situation?.title, choiceId: choice.id, choiceLabel: choice.label, risk: choice.risk })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var success = data.outcome === 'success';
            var rewards = success ? (choice.rewards || {}) : (choice.failRewards || choice.rewards || {});
            setOutcomeAnim(success ? 'success' : 'fail');
            setTimeout(function() { setOutcomeAnim(''); }, success ? 3000 : 1500);
            setOutcome({ success: success, narrative: data.narrative || (success ? 'It worked!' : 'Didn\'t go as planned...'), rewards: rewards });
            typeText(data.narrative || (success ? 'It worked!' : 'Didn\'t go as planned...'));
            var xpGain = rewards.xp || 0; var repGain = rewards.rep || 0;
            if (xpGain > 0 && window.addXP) window.addXP(xpGain);
            if (repGain !== 0) {
                // Update local state
                setReputation(function(prev) { return prev + repGain; });
                // Update localStorage directly for syncing
                var currentRep = parseInt(localStorage.getItem('dc_city_rep') || '0');
                var newRep = currentRep + repGain;
                localStorage.setItem('dc_city_rep', newRep.toString());
                console.log('⭐ REP UPDATE: ' + currentRep + ' → ' + newRep + ' (' + (repGain >= 0 ? '+' : '') + repGain + ')');
                // Also call global function if available
                if (window.addReputation) window.addReputation(repGain);
            }
            if (situation?.title && window.updateNPCRelationship) {
                var npcMatch = (situation.title + ' ' + (situation.description || '')).match(/(?:with|from|about|against|for|meet|help|betray|report|convince)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
                var npcName = npcMatch ? npcMatch[1] : situation.npc || null;
                if (!npcName && situation.characters && situation.characters.length > 0) npcName = situation.characters[0];
                if (!npcName) { var lNPCs = { casino:'Casino Tony', dark_alley:'Shadow', mayors_office:'Secretary Mills', trading_floor:'Trader Wang', courthouse:'Bailiff Reed', town_square:'Old Pete', underground:'The Broker' }; npcName = lNPCs[currentLocation?.id] || 'A Stranger'; }
                window.updateNPCRelationship(npcName, success ? (repGain > 0 ? 15 : 5) : (repGain < 0 ? -15 : -5), (success ? 'Helped with: ' : 'Failed at: ') + (situation.title || 'something').substring(0, 30));
            }
            try { var am = JSON.parse(localStorage.getItem('dc_active_mission')); var me = parseInt(localStorage.getItem('dc_mission_expiry') || '0'); if (am && me > Date.now() && am.location === currentLocation?.id) { var mR = am.reward || { xp: 200, rep: 15 }; if (mR.xp && window.addXP) window.addXP(mR.xp); if (mR.rep && window.addReputation) window.addReputation(mR.rep); setReputation(function(p) { return p + (mR.rep || 0); }); localStorage.removeItem('dc_active_mission'); localStorage.removeItem('dc_mission_expiry'); showToast('🎯 MISSION COMPLETE! +' + (mR.xp || 0) + ' XP, +' + (mR.rep || 0) + ' REP', 'success'); } } catch(e) {}
            setActionLog(function(prev) { return [{ location: currentLocation?.name, icon: currentLocation?.icon, situation: situation?.title, choice: choice.label, success: success, rewards: rewards, time: Date.now() }].concat(prev).slice(0, 30); });
            var cd = Date.now() + (45000 + Math.floor(Math.random() * 45000)); setCooldownUntil(cd); localStorage.setItem('dc_explore_cooldown', cd.toString());
            setResolving(false);
            showToast(success ? '🏆 Success! ' + (xpGain > 0 ? '+' + xpGain + ' XP ' : '') + (repGain > 0 ? '+' + repGain + ' REP' : '') : '💀 Failed... ' + (repGain < 0 ? repGain + ' REP' : ''), success ? 'success' : 'error');
        })
        .catch(function() { setResolving(false); showToast('Something went wrong', 'error'); });
    };
    
    var goBack = function() { setCurrentLocation(null); setSituation(null); setOutcome(null); setChosenChoice(null); setTypedText(''); setOutcomeAnim(''); };
    var riskColors = { none: '#00ff88', low: '#88ff00', medium: '#ffd700', high: '#ff8800', extreme: '#ff4444' };
    var onCooldown = cooldownUntil > Date.now();
    
    return React.createElement(React.Fragment, null,
        // ═══════ FULL-SCREEN WALKING OVERLAY ═══════
        walkPhase > 0 && React.createElement('div', { style: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' } },
            React.createElement('div', { style: { fontSize: '4.5em', animation: 'walkBob 0.6s ease-in-out infinite', marginBottom: '20px' } }, '🚶'),
            React.createElement('div', { style: { display: 'flex', gap: '12px', marginBottom: '24px' } },
                [0,1,2,3,4].map(function(i) { var loc = LOCATIONS.find(function(l) { return l.id === walkingTo; }); return React.createElement('div', { key: i, style: { width: '8px', height: '8px', borderRadius: '50%', background: (loc||{}).color || '#ffd700', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: (i * 0.2) + 's' } }); })
            ),
            React.createElement('div', { style: { textAlign: 'center' } },
                React.createElement('div', { style: { color: (LOCATIONS.find(function(l) { return l.id === walkingTo; })||{}).color || '#ffd700', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '6px' } }, walkPhase === 1 ? 'Walking to...' : 'Arriving at...'),
                React.createElement('div', { style: { color: '#fff', fontSize: '1.6em', fontWeight: 'bold' } }, React.createElement('span', { style: { marginRight: '10px', fontSize: '1.2em' } }, (LOCATIONS.find(function(l) { return l.id === walkingTo; })||{}).icon || '📍'), (LOCATIONS.find(function(l) { return l.id === walkingTo; })||{}).name || ''),
                React.createElement('div', { style: { color: '#666', fontSize: '0.85em', marginTop: '8px', fontStyle: 'italic' } }, (LOCATIONS.find(function(l) { return l.id === walkingTo; })||{}).vibe || '')
            )
        ),
        
        // ═══════ HEADER ═══════
        React.createElement('div', { style: { background: 'linear-gradient(135deg, #0a0a1a, #1a0a2e)', borderRadius: '16px', padding: '20px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' } },
            React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #ff4444, #ffd700, #00ff88, #4488ff, #ff00ff)', backgroundSize: '200% 100%', animation: 'gradientShift 4s ease infinite' } }),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } },
                React.createElement('div', null,
                    React.createElement('h2', { style: { margin: '0 0 4px', color: '#fff', fontSize: '1.3em' } }, '🗺️ Explore Degens City'),
                    React.createElement('p', { style: { margin: 0, color: '#888', fontSize: '0.85em' } }, currentLocation ? '📍 Currently at: ' + currentLocation.name : 'Choose your next destination')
                ),
                React.createElement('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
                    React.createElement('div', { style: { background: 'rgba(255,215,0,0.1)', border: '1px solid #ffd70033', borderRadius: '20px', padding: '6px 14px', fontSize: '0.85em' } }, React.createElement('span', { style: { color: '#ffd700' } }, '⭐ '), React.createElement('span', { style: { color: reputation >= 0 ? '#00ff88' : '#ff4444', fontWeight: 'bold' } }, (reputation >= 0 ? '+' : '') + reputation)),
                    cooldownText && React.createElement('div', { style: { background: 'rgba(255,68,68,0.1)', border: '1px solid #ff444433', borderRadius: '20px', padding: '6px 14px', fontSize: '0.85em' } }, React.createElement('span', { style: { color: '#ff4444' } }, '⏳ ' + cooldownText))
                )
            )
        ),
        
        // ═══════ CITY MAP ═══════
        !currentLocation && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '18px', padding: '16px', border: '1px solid rgba(255,255,255,0.04)' } },
            LOCATIONS.map(function(loc) {
                return React.createElement('div', { key: loc.id, onClick: function() { if (!onCooldown) exploreLocation(loc); },
                    style: { background: loc.bgGrad, border: '1px solid ' + loc.color + '33', borderRadius: '14px', padding: '18px 14px', cursor: onCooldown ? 'not-allowed' : 'pointer', transition: 'all 0.3s', textAlign: 'center', opacity: onCooldown ? 0.5 : 1, position: 'relative', overflow: 'hidden' },
                    onMouseOver: function(e) { if (!onCooldown) { e.currentTarget.style.transform = 'translateY(-4px) scale(1.03)'; e.currentTarget.style.borderColor = loc.color + '88'; e.currentTarget.style.boxShadow = '0 8px 30px ' + loc.color + '22'; }},
                    onMouseOut: function(e) { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = loc.color + '33'; e.currentTarget.style.boxShadow = ''; }
                },
                    React.createElement('div', { style: { position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle at center, ' + loc.color + '08, transparent 50%)', pointerEvents: 'none' } }),
                    React.createElement('div', { style: { fontSize: '2.4em', marginBottom: '8px', position: 'relative' } }, loc.icon),
                    React.createElement('div', { style: { color: loc.color, fontWeight: 'bold', fontSize: '0.9em', marginBottom: '4px', position: 'relative' } }, loc.name),
                    React.createElement('div', { style: { color: '#888', fontSize: '0.75em', lineHeight: '1.3', position: 'relative' } }, loc.desc),
                    React.createElement('div', { style: { color: '#555', fontSize: '0.65em', marginTop: '6px', fontStyle: 'italic', position: 'relative' } }, loc.vibe)
                );
            })
        ),
        
        // ═══════ ENCOUNTER SCREEN ═══════
        currentLocation && React.createElement('div', { className: outcomeAnim === 'success' ? 'explore-outcome-success' : outcomeAnim === 'fail' ? 'explore-outcome-fail' : '', style: { animation: 'encounterSlideIn 0.5s ease-out' } },
            React.createElement('button', { onClick: goBack, style: { background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: '10px', color: '#888', padding: '8px 16px', cursor: 'pointer', marginBottom: '15px', fontSize: '0.85em', transition: 'all 0.2s' } }, '← Back to City Map'),
            
            // Location header
            React.createElement('div', { style: { background: currentLocation.bgGrad, border: '1px solid ' + currentLocation.color + '44', borderRadius: '16px', padding: '20px', marginBottom: '15px', position: 'relative', overflow: 'hidden' } },
                React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, ' + currentLocation.color + ', transparent)', backgroundSize: '200% 100%', animation: 'gradientShift 3s ease infinite' } }),
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } },
                    React.createElement('div', { style: { fontSize: '2.5em', filter: 'drop-shadow(0 0 10px ' + currentLocation.color + '44)' } }, currentLocation.icon),
                    React.createElement('div', null,
                        React.createElement('div', { style: { color: currentLocation.color, fontWeight: 'bold', fontSize: '1.2em' } }, currentLocation.name),
                        React.createElement('div', { style: { color: '#888', fontSize: '0.8em', fontStyle: 'italic' } }, currentLocation.vibe)
                    )
                )
            ),
            
            // Loading
            loadingSituation && React.createElement('div', { style: { textAlign: 'center', padding: '60px 20px' } },
                React.createElement('div', { style: { fontSize: '3em', marginBottom: '15px', animation: 'pulse 1s infinite' } }, '👀'),
                React.createElement('div', { style: { color: currentLocation.color, fontWeight: 'bold', marginBottom: '6px' } }, 'Scouting the area...'),
                React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: '6px' } }, [0,1,2].map(function(i) { return React.createElement('div', { key: i, style: { width: '8px', height: '8px', borderRadius: '50%', background: currentLocation.color, animation: 'pulse 1s infinite', animationDelay: (i*0.3)+'s' } }); }))
            ),
            
            // Situation card
            situation && !loadingSituation && React.createElement('div', { style: { background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '18px', overflow: 'hidden', animation: 'encounterSlideIn 0.5s ease-out' } },
                React.createElement('div', { style: { padding: '22px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, ' + currentLocation.color + '0a, transparent)' } },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' } },
                        React.createElement('span', { style: { fontSize: '2em', filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.2))' } }, situation.icon || '⚡'),
                        React.createElement('h3', { style: { margin: 0, color: '#fff', fontSize: '1.2em', lineHeight: '1.3' } }, situation.title)
                    ),
                    React.createElement('p', { style: { margin: 0, color: '#bbb', fontSize: '0.92em', lineHeight: '1.7', minHeight: '48px' } },
                        typedText || situation.desc,
                        isTyping && React.createElement('span', { style: { display: 'inline-block', width: '2px', height: '14px', background: currentLocation.color, marginLeft: '2px', animation: 'blink 0.8s step-end infinite', verticalAlign: 'middle' } })
                    )
                ),
                
                // Choices
                !outcome && React.createElement('div', { style: { padding: '16px 20px' } },
                    React.createElement('div', { style: { color: '#666', fontSize: '0.7em', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '14px' } }, '⚔️ What do you do?'),
                    (situation.choices || []).map(function(choice, idx) {
                        var isChosen = chosenChoice && chosenChoice.id === choice.id; var rColor = riskColors[choice.risk] || '#888';
                        return React.createElement('div', { key: choice.id, onClick: function() { if (!resolving && !chosenChoice) makeChoice(choice); },
                            style: { background: isChosen ? rColor + '15' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isChosen ? rColor + '66' : 'rgba(255,255,255,0.06)'), borderLeft: '3px solid ' + (isChosen ? rColor : 'rgba(255,255,255,0.1)'), borderRadius: '12px', padding: '14px 16px', marginBottom: '8px', cursor: resolving || chosenChoice ? 'default' : 'pointer', transition: 'all 0.25s', opacity: (chosenChoice && !isChosen) ? 0.3 : 1, animation: 'choiceAppear 0.4s ease-out backwards', animationDelay: (idx * 0.1) + 's' },
                            onMouseOver: function(e) { if (!resolving && !chosenChoice) { e.currentTarget.style.transform = 'translateX(6px)'; } },
                            onMouseOut: function(e) { e.currentTarget.style.transform = ''; }
                        },
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
                                React.createElement('span', { style: { color: '#fff', fontWeight: 'bold', fontSize: '0.92em' } }, choice.label),
                                React.createElement('span', { style: { color: rColor, fontSize: '0.7em', fontWeight: 'bold', textTransform: 'uppercase', padding: '2px 10px', borderRadius: '6px', background: rColor + '18' } }, choice.risk === 'none' ? '✓ SAFE' : '⚠ ' + choice.risk)
                            ),
                            React.createElement('div', { style: { color: '#999', fontSize: '0.82em', lineHeight: '1.4' } }, choice.desc),
                            choice.rewards && React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } },
                                choice.rewards.xp && React.createElement('span', { style: { fontSize: '0.72em', color: '#00ccff', background: '#00ccff15', padding: '2px 8px', borderRadius: '4px' } }, '+' + choice.rewards.xp + ' XP'),
                                choice.rewards.hopium && React.createElement('span', { style: { fontSize: '0.72em', color: '#00ff88', background: '#00ff8815', padding: '2px 8px', borderRadius: '4px' } }, (choice.rewards.hopium >= 0 ? '+' : '') + choice.rewards.hopium + ' HOP'),
                                choice.rewards.rep && React.createElement('span', { style: { fontSize: '0.72em', color: choice.rewards.rep >= 0 ? '#ffd700' : '#ff4444', background: (choice.rewards.rep >= 0 ? '#ffd700' : '#ff4444') + '15', padding: '2px 8px', borderRadius: '4px' } }, (choice.rewards.rep >= 0 ? '+' : '') + choice.rewards.rep + ' REP'),
                                choice.rewards.alpha && React.createElement('span', { style: { fontSize: '0.72em', color: '#aa88ff', background: '#aa88ff15', padding: '2px 8px', borderRadius: '4px' } }, '+' + choice.rewards.alpha + ' ALPHA')
                            ),
                            isChosen && resolving && React.createElement('div', { style: { color: '#ffd700', fontSize: '0.8em', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' } }, React.createElement('div', { style: { width: '14px', height: '14px', border: '2px solid #ffd700', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }), 'Resolving...')
                        );
                    })
                ),
                
                // Outcome
                outcome && React.createElement('div', { style: { padding: '20px' } },
                    React.createElement('div', { style: { background: outcome.success ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)', border: '2px solid ' + (outcome.success ? '#00ff8833' : '#ff444433'), borderRadius: '16px', padding: '24px', textAlign: 'center', marginBottom: '16px', position: 'relative', overflow: 'hidden' } },
                        outcome.success && React.createElement('div', { style: { position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 50%, rgba(0,255,136,0.08), transparent 60%)', pointerEvents: 'none' } }),
                        React.createElement('div', { style: { fontSize: '3em', marginBottom: '10px', animation: 'rewardPop 0.6s ease-out' } }, outcome.success ? '🏆' : '💀'),
                        React.createElement('div', { style: { color: outcome.success ? '#00ff88' : '#ff4444', fontWeight: 'bold', fontSize: '1.3em', marginBottom: '10px', letterSpacing: '2px' } }, outcome.success ? 'SUCCESS!' : 'FAILED'),
                        React.createElement('p', { style: { color: '#ccc', margin: '0 0 16px', fontSize: '0.92em', lineHeight: '1.6' } }, typedText, isTyping && React.createElement('span', { style: { display: 'inline-block', width: '2px', height: '14px', background: outcome.success ? '#00ff88' : '#ff4444', marginLeft: '2px', animation: 'blink 0.8s step-end infinite', verticalAlign: 'middle' } })),
                        outcome.rewards && React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' } },
                            outcome.rewards.xp && React.createElement('div', { style: { background: '#00ccff12', border: '1px solid #00ccff33', borderRadius: '12px', padding: '10px 16px', animation: 'rewardPop 0.5s ease-out backwards', animationDelay: '0.3s' } }, React.createElement('div', { style: { color: '#00ccff', fontWeight: 'bold', fontSize: '1.2em' } }, '+' + outcome.rewards.xp), React.createElement('div', { style: { color: '#888', fontSize: '0.7em' } }, 'XP')),
                            outcome.rewards.hopium && React.createElement('div', { style: { background: (outcome.rewards.hopium >= 0 ? '#00ff88' : '#ff4444') + '12', border: '1px solid ' + (outcome.rewards.hopium >= 0 ? '#00ff88' : '#ff4444') + '33', borderRadius: '12px', padding: '10px 16px', animation: 'rewardPop 0.5s ease-out backwards', animationDelay: '0.4s' } }, React.createElement('div', { style: { color: outcome.rewards.hopium >= 0 ? '#00ff88' : '#ff4444', fontWeight: 'bold', fontSize: '1.2em' } }, (outcome.rewards.hopium >= 0 ? '+' : '') + outcome.rewards.hopium), React.createElement('div', { style: { color: '#888', fontSize: '0.7em' } }, 'HOPIUM')),
                            outcome.rewards.rep && React.createElement('div', { style: { background: (outcome.rewards.rep >= 0 ? '#ffd700' : '#ff4444') + '12', border: '1px solid ' + (outcome.rewards.rep >= 0 ? '#ffd700' : '#ff4444') + '33', borderRadius: '12px', padding: '10px 16px', animation: 'rewardPop 0.5s ease-out backwards', animationDelay: '0.5s' } }, React.createElement('div', { style: { color: outcome.rewards.rep >= 0 ? '#ffd700' : '#ff4444', fontWeight: 'bold', fontSize: '1.2em' } }, (outcome.rewards.rep >= 0 ? '+' : '') + outcome.rewards.rep), React.createElement('div', { style: { color: '#888', fontSize: '0.7em' } }, 'REP')),
                            outcome.rewards.alpha && React.createElement('div', { style: { background: '#aa88ff12', border: '1px solid #aa88ff33', borderRadius: '12px', padding: '10px 16px', animation: 'rewardPop 0.5s ease-out backwards', animationDelay: '0.6s' } }, React.createElement('div', { style: { color: '#aa88ff', fontWeight: 'bold', fontSize: '1.2em' } }, '+' + outcome.rewards.alpha), React.createElement('div', { style: { color: '#888', fontSize: '0.7em' } }, 'ALPHA'))
                        )
                    ),
                    React.createElement('div', { style: { display: 'flex', gap: '10px' } },
                        React.createElement('button', { onClick: function() { setSituation(null); setOutcome(null); setChosenChoice(null); setTypedText(''); setOutcomeAnim(''); if (cooldownUntil > Date.now()) { goBack(); return; } setLoadingSituation(true); fetch(API_BASE + '/api/city-situations?player=' + encodeURIComponent(character?.name || 'Citizen') + '&location=' + currentLocation.id).then(function(r) { return r.json(); }).then(function(d) { if (d.success) { setSituation(d.situation); if (d.situation && d.situation.desc) typeText(d.situation.desc); } setLoadingSituation(false); }).catch(function() { setLoadingSituation(false); goBack(); }); }, style: { flex: 1, padding: '14px', border: 'none', borderRadius: '12px', background: onCooldown ? '#222' : currentLocation.color + '22', color: onCooldown ? '#555' : currentLocation.color, fontWeight: 'bold', cursor: onCooldown ? 'not-allowed' : 'pointer', fontSize: '0.9em' } }, onCooldown ? '⏳ On cooldown' : '🔄 Explore Again'),
                        React.createElement('button', { onClick: goBack, style: { flex: 1, padding: '14px', border: '1px solid #333', borderRadius: '12px', background: 'transparent', color: '#888', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9em' } }, '🗺️ Back to Map')
                    )
                )
            )
        ),
        
        // ═══════ ADVENTURE LOG ═══════
        actionLog.length > 0 && React.createElement('div', { style: { background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', marginTop: '20px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('span', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.9em' } }, '📜 Adventure Log'),
                React.createElement('span', { style: { color: '#555', fontSize: '0.75em' } }, actionLog.length + ' entries')
            ),
            React.createElement('div', { style: { maxHeight: '300px', overflowY: 'auto' } },
                actionLog.slice(0, 15).map(function(entry, i) {
                    var ago = Math.round((Date.now() - entry.time) / 60000);
                    var timeStr = ago < 1 ? 'now' : ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
                    return React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: i === 0 ? 'rgba(255,215,0,0.03)' : 'transparent' } },
                        React.createElement('span', { style: { fontSize: '1.3em', minWidth: '28px', textAlign: 'center' } }, entry.success ? '🏆' : '💀'),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, React.createElement('span', { style: { color: '#888' } }, (entry.icon || '📍') + ' '), entry.situation),
                            React.createElement('div', { style: { color: '#666', fontSize: '0.75em', marginTop: '2px' } }, entry.choice)
                        ),
                        React.createElement('div', { style: { textAlign: 'right', minWidth: '50px' } },
                            entry.rewards && entry.rewards.rep && React.createElement('div', { style: { color: entry.rewards.rep >= 0 ? '#00ff88' : '#ff4444', fontSize: '0.8em', fontWeight: 'bold' } }, (entry.rewards.rep >= 0 ? '+' : '') + entry.rewards.rep + ' REP'),
                            React.createElement('div', { style: { color: '#555', fontSize: '0.7em' } }, timeStr)
                        )
                    );
                })
            )
        )
    );
}

// ==================== CITY LEDGER (LIVE Engine Data) ====================

function CityLedger({ character }) {
    const [engineData, setEngineData] = useState(null);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    
    const fetchData = async () => {
        try {
            const res = await fetch(API_BASE + '/api/city-engine/status');
            const data = await res.json();
            if (data.success) setEngineData(data.engine);
        } catch(e) { console.error('Ledger fetch error:', e); }
        setLoading(false);
    };
    useEffect(function() { fetchData(); var iv = setInterval(fetchData, 10000); return function() { clearInterval(iv); }; }, []);
    
    if (loading || !engineData) return React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: '40px' } }, React.createElement('div', { style: { fontSize: '2em', animation: 'pulse 1.5s infinite' } }, '📜'), 'Loading city records...');
    
    var actions = engineData.actionLog || [];
    var typeFilters = { all: null, tokens: ['memecoin_launch','memecoin_rugged','memecoin_pump'], business: ['business_opened'], unrest: ['protest_started','protest_resolved','protest_dispersed','riot','assassination_attempt','suspect_identified','propaganda','ai_uprising','ai_rights','ai_uprising_failed','declared_independence'], factions: ['gang_formed','gang_war','gang_war_ended','cult_formed','secret_society','fight_club','fight_result'], builds: ['structure_built','infrastructure'], power: ['npc_election','hack','heist_planned','heist_success','heist_failed','trial_by_combat','combat_verdict'], drama: ['romance','breakup','love_triangle','gambling_loss','bankruptcy','got_rich','got_drunk','existential_crisis','mental_breakdown','poetry','intervention','npc_death','fake_death_revealed','duel_challenge','duel_result','missing_person','person_found'], weird: ['conspiracy','artifact_found','time_traveler','rocket_launch','fourth_wall_break','portal_opened','portal_closed','radio_started','newspaper_started','weather_change','disaster','disaster_resolved'] };
    var filtered = filter === 'all' ? actions : actions.filter(function(a) { return (typeFilters[filter] || []).includes(a.type); });
    
    var typeStyles = { memecoin_launch: { color: '#00ff88', icon: '🚀', label: 'TOKEN LAUNCH' }, memecoin_rugged: { color: '#ff4444', icon: '💀', label: 'RUGGED' }, memecoin_pump: { color: '#ffd700', icon: '📈', label: 'PUMP' }, business_opened: { color: '#4488ff', icon: '🏪', label: 'BUSINESS' }, protest_started: { color: '#ff8800', icon: '✊', label: 'PROTEST' }, protest_resolved: { color: '#00ff88', icon: '✅', label: 'RESOLVED' }, protest_dispersed: { color: '#888', icon: '💨', label: 'DISPERSED' }, riot: { color: '#ff0000', icon: '🔥', label: 'RIOT' }, gang_formed: { color: '#8a2be2', icon: '🏴', label: 'NEW FACTION' }, gang_war: { color: '#ff4444', icon: '⚔️', label: 'GANG WAR' }, gang_war_ended: { color: '#00ff88', icon: '🏆', label: 'WAR ENDED' }, cult_formed: { color: '#ff88ff', icon: '🙏', label: 'CULT' }, structure_built: { color: '#4488ff', icon: '🏗️', label: 'BUILT' }, npc_election: { color: '#ffd700', icon: '🗳️', label: 'ELECTION' }, hack: { color: '#ff00ff', icon: '💻', label: 'HACKED' }, romance: { color: '#ff69b4', icon: '💕', label: 'ROMANCE' }, breakup: { color: '#ff4444', icon: '💔', label: 'BREAKUP' }, love_triangle: { color: '#ff8800', icon: '😱', label: 'SCANDAL' }, gambling_loss: { color: '#ff8800', icon: '🎰', label: 'GAMBLING' }, bankruptcy: { color: '#ff0000', icon: '💀', label: 'BANKRUPT' }, got_rich: { color: '#ffd700', icon: '💰', label: 'RICH' }, got_drunk: { color: '#ff8800', icon: '🍺', label: 'DRUNK' }, existential_crisis: { color: '#8a2be2', icon: '🌀', label: 'CRISIS' }, mental_breakdown: { color: '#ff0000', icon: '🤯', label: 'BREAKDOWN' }, poetry: { color: '#88aaff', icon: '✍️', label: 'POETRY' }, missing_person: { color: '#ff8800', icon: '🔍', label: 'MISSING' }, person_found: { color: '#00ff88', icon: '✅', label: 'FOUND' }, duel_challenge: { color: '#ffd700', icon: '⚔️', label: 'DUEL' }, duel_result: { color: '#00ff88', icon: '🏆', label: 'DUEL WON' }, conspiracy: { color: '#ff88ff', icon: '🔺', label: 'CONSPIRACY' }, artifact_found: { color: '#ffd700', icon: '🗝️', label: 'ARTIFACT' }, time_traveler: { color: '#4488ff', icon: '⏰', label: 'TIME TRAVEL' }, declared_independence: { color: '#ff8800', icon: '🗽', label: 'INDEPENDENCE' }, rocket_launch: { color: '#00ff88', icon: '🚀', label: 'ROCKET' }, newspaper_started: { color: '#4488ff', icon: '📰', label: 'NEWS' }, disaster: { color: '#ff0000', icon: '🌋', label: 'DISASTER' }, disaster_resolved: { color: '#00ff88', icon: '✅', label: 'RESOLVED' }, weather_change: { color: '#88bbff', icon: '🌤️', label: 'WEATHER' }, secret_society: { color: '#aa44aa', icon: '🔺', label: 'SECRET' }, fight_club: { color: '#ff4444', icon: '👊', label: 'FIGHT CLUB' }, fight_result: { color: '#ff8800', icon: '🥊', label: 'FIGHT' }, heist_planned: { color: '#ffd700', icon: '🎯', label: 'HEIST' }, heist_success: { color: '#00ff88', icon: '💰', label: 'HEIST WIN' }, heist_failed: { color: '#ff4444', icon: '🚔', label: 'HEIST FAIL' }, radio_started: { color: '#4488ff', icon: '📻', label: 'RADIO' }, assassination_attempt: { color: '#ff0000', icon: '🗡️', label: 'ASSASSINATION' }, suspect_identified: { color: '#ff8800', icon: '🚔', label: 'SUSPECT' }, fourth_wall_break: { color: '#aa44aa', icon: '👁️', label: '4TH WALL' }, intervention: { color: '#00ff88', icon: '🫂', label: 'INTERVENTION' }, npc_death: { color: '#ff0000', icon: '💀', label: 'DEATH' }, fake_death_revealed: { color: '#ff8800', icon: '😱', label: 'ALIVE?!' }, ai_uprising: { color: '#ff00ff', icon: '🤖', label: 'AI UPRISING' }, ai_rights: { color: '#00ff88', icon: '✅', label: 'AI RIGHTS' }, ai_uprising_failed: { color: '#888', icon: '😅', label: 'FALSE ALARM' }, portal_opened: { color: '#8a2be2', icon: '🌀', label: 'PORTAL' }, portal_closed: { color: '#888', icon: '✅', label: 'CLOSED' }, propaganda: { color: '#ff8800', icon: '📢', label: 'PROPAGANDA' }, trial_by_combat: { color: '#ffd700', icon: '⚔️', label: 'TRIAL' }, combat_verdict: { color: '#00ff88', icon: '🏆', label: 'VERDICT' }, infrastructure: { color: '#ff8800', icon: '🏗️', label: 'INFRA' } };
    
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '15px' } },
        // CITY STATS SUMMARY
        React.createElement('div', { className: 'card', style: { padding: '15px' } },
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' } },
                [
                    { label: '🚀 Tokens Launched', value: (engineData.memecoins || []).length, color: '#00ff88' },
                    { label: '🏪 Businesses', value: (engineData.businesses || []).length, color: '#4488ff' },
                    { label: '🏗️ Structures', value: (engineData.buildings || []).length, color: '#8a2be2' },
                    { label: '🏴 Factions', value: (engineData.gangs || []).length, color: '#ff8800' }
                ].map(function(s) {
                    return React.createElement('div', { key: s.label, style: { background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', textAlign: 'center' } },
                        React.createElement('div', { style: { color: s.color, fontWeight: 'bold', fontSize: '1.5em' } }, s.value),
                        React.createElement('div', { style: { color: '#888', fontSize: '0.7em', marginTop: '4px' } }, s.label)
                    );
                })
            )
        ),
        
        // HALL OF FAME/SHAME
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
            // Hall of Fame - successful launches
            React.createElement('div', { className: 'card', style: { padding: '15px', borderLeft: '3px solid #00ff88' } },
                React.createElement('h3', { style: { color: '#00ff88', margin: '0 0 10px 0', fontSize: '0.9em' } }, '🏆 Hall of Fame'),
                actions.filter(function(a) { return a.type === 'memecoin_pump' || a.type === 'business_opened' || a.type === 'structure_built' || a.type === 'got_rich' || a.type === 'heist_success' || a.type === 'fight_result' || a.type === 'combat_verdict' || a.type === 'ai_rights'; }).slice(0, 5).map(function(a, i) {
                    var s = typeStyles[a.type] || {};
                    return React.createElement('div', { key: i, style: { display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8em' } },
                        React.createElement('span', null, s.icon || '⚡'),
                        React.createElement('span', { style: { color: '#ccc', flex: 1 } }, (a.npc || '???') + ': ' + (a.headline || '').substring(0, 40)),
                        React.createElement('span', { style: { color: '#00ff88', fontSize: '0.75em' } }, '✅')
                    );
                }),
                actions.filter(function(a) { return a.type === 'memecoin_pump' || a.type === 'business_opened' || a.type === 'structure_built' || a.type === 'got_rich' || a.type === 'heist_success' || a.type === 'fight_result' || a.type === 'combat_verdict' || a.type === 'ai_rights'; }).length === 0 && React.createElement('div', { style: { color: '#555', fontSize: '0.8em', textAlign: 'center', padding: '10px' } }, 'Waiting for legendary plays...')
            ),
            // Wall of Shame - rugs, hacks, riots
            React.createElement('div', { className: 'card', style: { padding: '15px', borderLeft: '3px solid #ff4444' } },
                React.createElement('h3', { style: { color: '#ff4444', margin: '0 0 10px 0', fontSize: '0.9em' } }, '💀 Wall of Shame'),
                actions.filter(function(a) { return a.type === 'memecoin_rugged' || a.type === 'hack' || a.type === 'riot' || a.type === 'bankruptcy' || a.type === 'heist_failed' || a.type === 'assassination_attempt' || a.type === 'npc_death' || a.type === 'disaster' || a.type === 'mental_breakdown'; }).slice(0, 5).map(function(a, i) {
                    var s = typeStyles[a.type] || {};
                    return React.createElement('div', { key: i, style: { display: 'flex', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.8em' } },
                        React.createElement('span', null, s.icon || '💀'),
                        React.createElement('span', { style: { color: '#ccc', flex: 1 } }, (a.npc || '???') + ': ' + (a.headline || '').substring(0, 40)),
                        React.createElement('span', { style: { color: '#ff4444', fontSize: '0.75em' } }, '☠️')
                    );
                }),
                actions.filter(function(a) { return a.type === 'memecoin_rugged' || a.type === 'hack' || a.type === 'riot' || a.type === 'bankruptcy' || a.type === 'heist_failed' || a.type === 'assassination_attempt' || a.type === 'npc_death' || a.type === 'disaster' || a.type === 'mental_breakdown'; }).length === 0 && React.createElement('div', { style: { color: '#555', fontSize: '0.8em', textAlign: 'center', padding: '10px' } }, 'No shame... yet.')
            )
        ),
        
        // FILTER TABS
        React.createElement('div', { className: 'card', style: { padding: '15px' } },
            React.createElement('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' } },
                [
                    { id: 'all', label: '📋 All', color: '#ffd700' },
                    { id: 'tokens', label: '🚀 Tokens', color: '#00ff88' },
                    { id: 'drama', label: '💔 Drama', color: '#ff69b4' },
                    { id: 'unrest', label: '✊ Unrest', color: '#ff8800' },
                    { id: 'factions', label: '🏴 Factions', color: '#8a2be2' },
                    { id: 'power', label: '⚔️ Power', color: '#ffd700' },
                    { id: 'weird', label: '🌀 Weird', color: '#aa44aa' },
                    { id: 'business', label: '🏪 Biz', color: '#4488ff' },
                    { id: 'builds', label: '🏗️ Build', color: '#4488ff' }
                ].map(function(f) {
                    return React.createElement('button', { key: f.id, onClick: function() { setFilter(f.id); }, style: { padding: '5px 12px', borderRadius: '15px', border: filter === f.id ? '1px solid ' + f.color : '1px solid rgba(255,255,255,0.1)', background: filter === f.id ? f.color + '22' : 'rgba(255,255,255,0.03)', color: filter === f.id ? f.color : '#888', fontSize: '0.75em', cursor: 'pointer', fontFamily: 'inherit' } }, f.label);
                })
            ),
            
            // ACTION LOG
            React.createElement('div', { style: { maxHeight: '500px', overflowY: 'auto' } },
                filtered.length === 0 ? React.createElement('div', { style: { textAlign: 'center', color: '#555', padding: '40px' } }, 'No actions recorded yet. The city engine is warming up — check back in a few minutes! 🌆') :
                filtered.map(function(a) {
                    var s = typeStyles[a.type] || { color: '#888', icon: '⚡', label: 'EVENT' };
                    var ago = Math.round((Date.now() - (a.timestamp || 0)) / 60000);
                    var timeStr = ago < 1 ? 'just now' : ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
                    return React.createElement('div', { key: a.id, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: '3px solid ' + s.color } },
                        React.createElement('div', { style: { fontSize: '1.3em', minWidth: '30px', textAlign: 'center' } }, s.icon),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '2px' } },
                                React.createElement('span', { style: { background: s.color + '33', color: s.color, padding: '1px 8px', borderRadius: '8px', fontSize: '0.65em', fontWeight: 'bold' } }, s.label),
                                a.npc && React.createElement('span', { style: { color: '#aaa', fontSize: '0.75em' } }, a.npc)
                            ),
                            React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em' } }, a.headline || 'City action')
                        ),
                        React.createElement('div', { style: { color: '#555', fontSize: '0.7em', whiteSpace: 'nowrap' } }, timeStr)
                    );
                })
            )
        )
    );
}

// Helper: Time ago
// ==================== LEADERBOARD SECTION ====================

function CityPulse() {
    const [engineData, setEngineData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [chatMessages, setChatMessages] = useState([]);
    const [flashEvent, setFlashEvent] = useState(null);
    const [prevActionCount, setPrevActionCount] = useState(0);
    const [dramaHighlights, setDramaHighlights] = useState([]);
    const [chaosFeed, setChaosFeed] = useState([]);
    
    const fetchEngine = async () => {
        try {
            const [engRes, chatRes, chaosRes] = await Promise.all([
                fetch(API_BASE + '/api/city-engine/status'),
                fetch(API_BASE + '/api/chat/global?limit=20'),
                fetch(API_BASE + '/api/city-engine/chaos-feed?limit=15').catch(() => null)
            ]);
            const engData = await engRes.json();
            const chatData = await chatRes.json();
            if (engData.success) {
                var e = engData.engine;
                // Flash new events
                var acts = e.actionLog || [];
                if (acts.length > 0 && prevActionCount > 0 && acts.length !== prevActionCount) {
                    setFlashEvent(acts[0]);
                    setTimeout(function() { setFlashEvent(null); }, 5000);
                }
                setPrevActionCount(acts.length);
                setEngineData(e);
            }
            if (chatData.success && chatData.messages) setChatMessages(chatData.messages.slice(0, 15));
            // Process chaos feed data
            if (chaosRes) {
                try {
                    var chaosData = await chaosRes.json();
                    if (chaosData.success) {
                        setDramaHighlights(chaosData.dramaHighlights || []);
                        setChaosFeed((chaosData.feed || []).slice(0, 10));
                    }
                } catch(ce) {}
            }
        } catch(e) { console.error('CityPulse error:', e); }
        setLoading(false);
    };
    useEffect(function() { fetchEngine(); var iv = setInterval(fetchEngine, 8000); return function() { clearInterval(iv); }; }, [prevActionCount]);
    
    if (loading || !engineData) return React.createElement('div', { style: { textAlign: 'center', padding: '60px 20px' } }, React.createElement('div', { style: { fontSize: '4em', animation: 'pulse 1s infinite' } }, '🌆'), React.createElement('p', { style: { color: '#888', marginTop: '15px' } }, 'Connecting to Degens City...'));
    
    var cs = engineData.cityStats || {};
    var actions = engineData.actionLog || [];
    var chaos = engineData.chaosLevel || 0;
    var approval = engineData.mayorApproval || 50;
    var weather = engineData.weather || 'clear';
    var wEmojis = { clear:'☀️', rain:'🌧️', storm:'⛈️', fog:'🌫️', snow:'❄️', heatwave:'🔥', aurora:'🌌', blood_moon:'🌑', rainbow:'🌈' };
    var chaosText = chaos > 80 ? 'ABSOLUTE MAYHEM' : chaos > 60 ? 'OUT OF CONTROL' : chaos > 40 ? 'GETTING WILD' : chaos > 20 ? 'Slightly Chaotic' : 'Suspiciously Calm';
    var chaosColor = chaos > 80 ? '#ff0000' : chaos > 60 ? '#ff4444' : chaos > 40 ? '#ff8800' : chaos > 20 ? '#ffd700' : '#00ff88';
    var bgGlow = chaos > 60 ? 'rgba(255,0,0,0.08)' : chaos > 40 ? 'rgba(255,136,0,0.06)' : 'rgba(0,255,136,0.04)';
    
    var typeIcons = { memecoin_launch:'🚀', memecoin_rugged:'💀', memecoin_pump:'📈', business_opened:'🏪', protest_started:'✊', riot:'🔥', gang_formed:'🏴', gang_war:'⚔️', cult_formed:'🙏', structure_built:'🏗️', npc_election:'🗳️', hack:'💻', romance:'💕', breakup:'💔', love_triangle:'😱', gambling_loss:'🎰', bankruptcy:'💀', got_rich:'💰', got_drunk:'🍺', existential_crisis:'🌀', mental_breakdown:'🤯', poetry:'✍️', missing_person:'🔍', person_found:'✅', duel_challenge:'⚔️', duel_result:'🏆', conspiracy:'🔺', artifact_found:'🗝️', time_traveler:'⏰', declared_independence:'🗽', rocket_launch:'🚀', newspaper_started:'📰', disaster:'🌋', disaster_resolved:'✅', weather_change:'🌤️', secret_society:'👁️', fight_club:'👊', fight_result:'🥊', heist_planned:'🎯', heist_success:'💰', heist_failed:'🚔', radio_started:'📻', assassination_attempt:'🗡️', fourth_wall_break:'👁️', intervention:'🫂', npc_death:'💀', fake_death_revealed:'😱', ai_uprising:'🤖', propaganda:'📢', trial_by_combat:'⚔️', portal_opened:'🌀', infrastructure:'🏗️' };
    var typeColors = { memecoin_launch:'#00ff88', memecoin_rugged:'#ff4444', memecoin_pump:'#ffd700', business_opened:'#4488ff', protest_started:'#ff8800', riot:'#ff0000', gang_formed:'#8a2be2', gang_war:'#ff4444', cult_formed:'#ff88ff', structure_built:'#4488ff', npc_election:'#ffd700', hack:'#ff00ff', romance:'#ff69b4', breakup:'#ff4444', love_triangle:'#ff8800', gambling_loss:'#ff8800', bankruptcy:'#ff0000', got_rich:'#ffd700', got_drunk:'#ff8800', existential_crisis:'#8a2be2', mental_breakdown:'#ff0000', poetry:'#88aaff', missing_person:'#ff8800', person_found:'#00ff88', duel_challenge:'#ffd700', duel_result:'#00ff88', conspiracy:'#ff88ff', artifact_found:'#ffd700', time_traveler:'#4488ff', declared_independence:'#ff8800', rocket_launch:'#00ff88', newspaper_started:'#4488ff', disaster:'#ff0000', disaster_resolved:'#00ff88', weather_change:'#88bbff', secret_society:'#aa44aa', fight_club:'#ff4444', fight_result:'#ff8800', heist_planned:'#ffd700', heist_success:'#00ff88', heist_failed:'#ff4444', radio_started:'#4488ff', assassination_attempt:'#ff0000', fourth_wall_break:'#aa44aa', intervention:'#00ff88', npc_death:'#ff0000', fake_death_revealed:'#ff8800', ai_uprising:'#ff00ff', propaganda:'#ff8800', trial_by_combat:'#ffd700', portal_opened:'#8a2be2', infrastructure:'#ff8800' };
    
    // Collect all active situations for the ticker
    var situations = [];
    if (engineData.cityDisaster) situations.push({ icon: '🌋', text: 'DISASTER: ' + (engineData.cityDisaster.title || 'Unknown'), color: '#ff0000', flash: true });
    if (engineData.warzone) situations.push({ icon: '⚔️', text: 'GANG WAR: ' + engineData.warzone.gang1 + ' vs ' + engineData.warzone.gang2, color: '#ff4444', flash: true });
    if (engineData.activeFeud) situations.push({ icon: '🍿', text: 'BEEF: ' + engineData.activeFeud.npc1 + ' vs ' + engineData.activeFeud.npc2, color: '#ff8800' });
    if (engineData.activeDuel) situations.push({ icon: '⚔️', text: 'DUEL: ' + engineData.activeDuel.challenger + ' vs ' + engineData.activeDuel.opponent, color: '#ffd700' });
    if (engineData.fightClub) situations.push({ icon: '👊', text: 'UNDERGROUND FIGHT CLUB ACTIVE', color: '#ff4444', flash: true });
    if (engineData.activeCult) situations.push({ icon: '🙏', text: 'CULT: ' + engineData.activeCult.name, color: '#8a2be2' });
    if (engineData.activeConspiracy) situations.push({ icon: '🔺', text: (engineData.activeConspiracy.theory || '').substring(0, 40), color: '#ff88ff' });
    if (engineData.secretSociety) situations.push({ icon: '👁️', text: engineData.secretSociety.name + ' operates in shadows...', color: '#aa44aa' });
    if (engineData.missingNpc) situations.push({ icon: '🔍', text: engineData.missingNpc.name + ' IS MISSING', color: '#ff8800' });
    if (engineData.radioStation) situations.push({ icon: '📻', text: 'PIRATE RADIO: ' + engineData.radioStation.name, color: '#4488ff' });
    if (engineData.newspaper) situations.push({ icon: '📰', text: engineData.newspaper.name + ' publishing gossip', color: '#4488ff' });
    if (engineData.protests) engineData.protests.forEach(function(p) { situations.push({ icon: p.status === 'riot' ? '🔥' : '✊', text: (p.status === 'riot' ? 'RIOT' : 'PROTEST') + ': ' + p.cause, color: p.status === 'riot' ? '#ff0000' : '#ff8800', flash: p.status === 'riot' }); });
    if (engineData.electionActive) situations.push({ icon: '🗳️', text: 'ELECTION IN PROGRESS', color: '#ffd700' });
    
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        
        // ═══════ BREAKING EVENT FLASH ═══════
        flashEvent && React.createElement('div', { style: { background: 'linear-gradient(90deg, ' + (typeColors[flashEvent.type] || '#ffd700') + '22, transparent)', border: '1px solid ' + (typeColors[flashEvent.type] || '#ffd700') + '44', borderRadius: '12px', padding: '12px 16px', animation: 'pulse 0.5s ease-in-out 3' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                React.createElement('span', { style: { fontSize: '1.5em' } }, typeIcons[flashEvent.type] || '⚡'),
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { color: typeColors[flashEvent.type] || '#ffd700', fontWeight: 'bold', fontSize: '0.85em', textTransform: 'uppercase' } }, 'JUST NOW'),
                    React.createElement('div', { style: { color: '#fff', fontSize: '0.95em' } }, flashEvent.headline || 'Something happened!')
                )
            )
        ),
        
        // ═══════ CITY HEADER — feels like a war room ═══════
        React.createElement('div', { style: { background: bgGlow, borderRadius: '14px', padding: '16px', border: '1px solid ' + chaosColor + '33', position: 'relative', overflow: 'hidden' } },
            // Chaos level bar at the top
            React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, height: '3px', width: chaos + '%', background: 'linear-gradient(90deg, #00ff88, ' + chaosColor + ')', transition: 'width 1s ease' } }),
            
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } },
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: '1.2em', fontWeight: 'bold', color: '#fff' } }, '🌆 DEGENS CITY'),
                    React.createElement('div', { style: { fontSize: '0.7em', color: chaosColor, fontWeight: 'bold' } }, chaosText + ' • ' + (wEmojis[weather] || '☀️') + ' ' + weather.replace('_', ' '))
                ),
                React.createElement('div', { style: { textAlign: 'right' } },
                    React.createElement('div', { style: { color: '#00ff88', fontSize: '0.7em', animation: 'pulse 2s infinite' } }, '● LIVE'),
                    React.createElement('div', { style: { color: '#888', fontSize: '0.65em' } }, (engineData.eventCount || 0) + ' events today')
                )
            ),
            
            // Key stats as colorful pills
            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                React.createElement('span', { style: { background: (approval > 50 ? '#00ff88' : '#ff4444') + '22', color: approval > 50 ? '#00ff88' : '#ff4444', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em', fontWeight: 'bold' } }, '👑 Mayor ' + Math.round(approval) + '%'),
                React.createElement('span', { style: { background: chaosColor + '22', color: chaosColor, padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em', fontWeight: 'bold' } }, '🔥 Chaos ' + Math.round(chaos) + '%'),
                React.createElement('span', { style: { background: '#4488ff22', color: '#4488ff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em' } }, '💰 Econ ' + (cs.economy || 50)),
                React.createElement('span', { style: { background: '#8a2be222', color: '#8a2be2', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em' } }, '🛡️ ' + (cs.security || 50)),
                (engineData.memecoins || []).length > 0 && React.createElement('span', { style: { background: '#00ff8822', color: '#00ff88', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em' } }, '🚀 ' + engineData.memecoins.length + ' tokens'),
                (engineData.gangs || []).length > 0 && React.createElement('span', { style: { background: '#ff880022', color: '#ff8800', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em' } }, '🏴 ' + engineData.gangs.length + ' factions'),
                (engineData.businesses || []).length > 0 && React.createElement('span', { style: { background: '#4488ff22', color: '#4488ff', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75em' } }, '🏪 ' + engineData.businesses.length + ' shops')
            )
        ),
        
        // ═══════ SITUATION TICKER — scrolling alerts ═══════
        situations.length > 0 && React.createElement('div', { style: { background: 'rgba(255,0,0,0.06)', borderRadius: '10px', padding: '8px 12px', border: '1px solid rgba(255,68,0,0.2)', overflow: 'hidden' } },
            React.createElement('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
                situations.map(function(s, i) {
                    return React.createElement('span', { key: i, style: { color: s.color, fontSize: '0.78em', fontWeight: 'bold', whiteSpace: 'nowrap', animation: s.flash ? 'pulse 1s infinite' : 'none' } }, s.icon + ' ' + s.text);
                })
            )
        ),
        
        // ═══════ DRAMA HIGHLIGHTS — from chaos-feed ═══════
        dramaHighlights.length > 0 && React.createElement('div', { style: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 0', WebkitOverflowScrolling: 'touch' } },
            dramaHighlights.map(function(d, i) {
                var severityColors = { critical: '#ff4444', hot: '#ff8800', medium: '#ffd700' };
                var severityIcons = { critical: '🚨', hot: '🔥', medium: '⚡', feud: '🍿', war: '⚔️', disaster: '🌋' };
                return React.createElement('div', { key: i, style: { background: (severityColors[d.severity] || '#ffd700') + '11', border: '1px solid ' + (severityColors[d.severity] || '#ffd700') + '33', borderRadius: '10px', padding: '8px 12px', minWidth: '120px', maxWidth: '200px', flex: '0 0 auto' } },
                    React.createElement('div', { style: { color: severityColors[d.severity] || '#ffd700', fontWeight: 'bold', fontSize: '0.72em', textTransform: 'uppercase', marginBottom: '3px' } }, (severityIcons[d.type] || '⚡') + ' ' + (d.type || '').replace('_', ' ')),
                    React.createElement('div', { style: { color: '#ccc', fontSize: '0.75em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: '1.3' } }, d.title || d.reason || 'Drama unfolding...'),
                    d.severity === 'critical' && React.createElement('div', { style: { color: '#ff4444', fontSize: '0.65em', marginTop: '3px', animation: 'pulse 1s infinite' } }, '● ONGOING')
                );
            })
        ),
        
        // ═══════ LIVE ACTION FEED — the heartbeat ═══════
        actions.length > 0 && React.createElement('div', { style: { borderRadius: '12px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('span', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.85em' } }, '⚡ What\'s Happening'),
                React.createElement('span', { style: { color: '#555', fontSize: '0.7em' } }, 'updates every 8s')
            ),
            React.createElement('div', { style: { maxHeight: '280px', overflowY: 'auto' } },
                actions.slice(0, 10).map(function(a, idx) {
                    var ago = Math.round((Date.now() - a.timestamp) / 60000);
                    var timeStr = ago < 1 ? 'now' : ago < 60 ? ago + 'm' : Math.round(ago / 60) + 'h';
                    var c = typeColors[a.type] || '#888';
                    return React.createElement('div', { key: a.id || idx, style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: idx === 0 ? 'rgba(255,215,0,0.04)' : 'transparent' } },
                        React.createElement('span', { style: { fontSize: '1.2em', minWidth: '28px', textAlign: 'center' } }, typeIcons[a.type] || '⚡'),
                        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                            a.npc && React.createElement('span', { style: { color: c, fontWeight: 'bold', fontSize: '0.78em' } }, a.npc + ' '),
                            React.createElement('span', { style: { color: '#bbb', fontSize: '0.82em' } }, a.headline || 'Something happened')
                        ),
                        React.createElement('span', { style: { color: '#555', fontSize: '0.68em', whiteSpace: 'nowrap' } }, timeStr)
                    );
                })
            )
        ),
        
        // ═══════ LIVE CHAT PREVIEW — citizens talking ═══════
        chatMessages.length > 0 && React.createElement('div', { style: { borderRadius: '12px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
                React.createElement('span', { style: { color: '#888', fontWeight: 'bold', fontSize: '0.85em' } }, '💬 Citizens Talking')
            ),
            React.createElement('div', { style: { maxHeight: '200px', overflowY: 'auto' } },
                chatMessages.slice(0, 8).map(function(m, i) {
                    var isSystem = (m.name || '').includes('BREAKING') || (m.name || '').includes('ALERT') || (m.name || '').includes('EMERGENCY') || (m.name || '').includes('Reporter') || (m.name || '').includes('Mayor') || (m.name || '').includes('Weather') || (m.name || '').includes('Detective') || (m.name || '').includes('Judge');
                    return React.createElement('div', { key: i, style: { padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', background: isSystem ? 'rgba(255,215,0,0.03)' : 'transparent' } },
                        React.createElement('span', { style: { color: isSystem ? '#ffd700' : '#888', fontWeight: 'bold', fontSize: '0.75em' } }, (m.name || 'anon') + ': '),
                        React.createElement('span', { style: { color: '#bbb', fontSize: '0.78em' } }, (m.text || '').substring(0, 120))
                    );
                })
            )
        ),
        
        // ═══════ MEMECOINS ROW ═══════
        (engineData.memecoins || []).length > 0 && React.createElement('div', { style: { display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' } },
            engineData.memecoins.slice(0, 8).map(function(c, i) {
                var rugged = c.rugged;
                var pumped = c.pumpPercent > 0;
                return React.createElement('div', { key: i, style: { minWidth: '100px', background: rugged ? 'rgba(255,0,0,0.1)' : pumped ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid ' + (rugged ? '#ff444433' : pumped ? '#00ff8833' : '#ffffff11'), flex: '0 0 auto' } },
                    React.createElement('div', { style: { fontWeight: 'bold', fontSize: '0.8em', color: rugged ? '#ff4444' : '#fff' } }, c.name),
                    React.createElement('div', { style: { fontSize: '0.85em', marginTop: '3px', color: rugged ? '#ff4444' : pumped ? '#00ff88' : '#888', fontWeight: 'bold' } }, rugged ? '☠️ RUG' : pumped ? '+' + c.pumpPercent + '%' : '...'),
                    React.createElement('div', { style: { fontSize: '0.6em', color: '#555', marginTop: '2px' } }, c.launcher)
                );
            })
        ),
        
        // ═══════ NPC STATUS GRID — who's doing what ═══════
        engineData.npcStatuses && React.createElement('div', { style: { borderRadius: '12px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' } },
                React.createElement('span', { style: { color: '#888', fontWeight: 'bold', fontSize: '0.85em' } }, '🏘️ Citizens of Degens City')
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px', padding: '10px' } },
                Object.entries(engineData.npcStatuses || {}).slice(0, 12).map(function(entry) {
                    var name = entry[0]; var s = entry[1];
                    var statusEmoji = s.status === 'bankrupt' ? '💀' : s.status === 'unhinged' ? '🤯' : s.status === 'missing' ? '❓' : s.status === 'dead' ? '⚰️' : s.status === 'rich' ? '🤑' : s.status === 'recovering' ? '🩹' : s.drunk > 3 ? '🍺' : s.partner ? '💕' : '😐';
                    var wealthColor = s.bankrupt ? '#ff4444' : s.wealth > 50000 ? '#ffd700' : s.wealth > 10000 ? '#00ff88' : '#888';
                    return React.createElement('div', { key: name, style: { background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '2px solid ' + (s.bankrupt ? '#ff4444' : s.reputation > 60 ? '#00ff88' : s.reputation > 30 ? '#ffd700' : '#ff4444') } },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                            React.createElement('span', { style: { color: '#ccc', fontWeight: 'bold', fontSize: '0.7em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' } }, name.replace(/_/g, ' ')),
                            React.createElement('span', { style: { fontSize: '0.9em' } }, statusEmoji)
                        ),
                        React.createElement('div', { style: { color: wealthColor, fontSize: '0.65em' } }, s.bankrupt ? 'BROKE' : '$' + (s.wealth || 0).toLocaleString()),
                        React.createElement('div', { style: { color: '#555', fontSize: '0.6em' } }, '📍 ' + (s.location || '???').substring(0, 14)),
                        s.partner && React.createElement('div', { style: { color: '#ff69b4', fontSize: '0.6em' } }, '❤️ ' + s.partner.replace(/_/g, ' '))
                    );
                })
            )
        )
    );
}

// ==================== CHAOS TOAST NOTIFICATION SYSTEM ====================
// ==================== WELCOME BACK RECAP ====================

function CityEventsLog() {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const fetchEvents = async () => {
            try {
                const res = await fetch(API_BASE + '/api/chat/global?limit=50');
                const data = await res.json();
                if (data.success) {
                    const eventMsgs = data.messages.filter(m => 
                        m.name.includes('BREAKING') || m.name.includes('DRAMA') || m.name.includes('Mayor') || 
                        m.name.includes('🎩') || m.name.includes('Reporter') || m.name.includes('📰') ||
                        m.name.includes('Market Pulse') || m.text.includes('ARRESTED') || m.text.includes('GUILTY') || 
                        m.text.includes('DECREE') || m.text.includes('FEUD') || m.text.includes('COUP')
                    );
                    setEvents(eventMsgs.slice(0, 30));
                }
            } catch(e) { console.error('Events log error:', e); }
            setLoading(false);
        };
        fetchEvents();
        const interval = setInterval(fetchEvents, 12000);
        return () => clearInterval(interval);
    }, []);
    
    return React.createElement('div', { className: 'card', style: { padding: '20px' } },
        React.createElement('h2', { style: { color: '#ff6600', marginBottom: '15px' } }, '⚡ City Events Log ', React.createElement('span', { style: { fontSize: '0.5em', color: '#00ff88' } }, '● LIVE')),
        React.createElement('div', { style: { maxHeight: '400px', overflowY: 'auto' } },
            loading ? React.createElement('div', { style: { textAlign: 'center', color: '#888', padding: '30px' } }, 'Loading events...') :
            events.length === 0 ? React.createElement('div', { style: { textAlign: 'center', color: '#888', padding: '30px' } }, 'No events yet — the city engine is spinning up...') :
            events.map(e => React.createElement('div', { key: e.id, style: { display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                        React.createElement('span', { style: { color: '#ffd700', fontWeight: 'bold', fontSize: '0.85em' } }, e.name),
                        React.createElement('span', { style: { color: '#555', fontSize: '0.75em' } }, e.time)
                    ),
                    React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em', marginTop: '3px' } }, e.text)
                )
            ))
        )
    );
}


function CityView({ gameState, citizenCount, character }) {
    // Early return if no gameState
    if (!gameState || !gameState.stats) {
        return (
            <div className="city-section">
                <div className="city-view" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: '#888' }}>Loading city view...</div>
                </div>
            </div>
        );
    }
    
    // Determine city status based on stats
    const getCityStatus = () => {
        const { morale = 50, crime = 50, treasury = 5000 } = gameState.stats || {};
        if (crime > 70 || morale < 30) return { status: 'danger', text: '⚠️ City in Crisis' };
        if (crime > 50 || morale < 50 || treasury < 3000) return { status: 'warning', text: '⚡ Tensions Rising' };
        return { status: 'good', text: '✨ City Thriving' };
    };

    const cityStatus = getCityStatus();
    const highCrime = (gameState.stats?.crime || 0) > 60;
    const highProsperity = (gameState.stats?.treasury || 0) > 7000 && (gameState.stats?.morale || 0) > 60;

    return (
        <>
        <div className="city-section">
            <div className="city-view">
                {/* Dynamic overlays based on city stats */}
                <div className={`city-crime-overlay ${highCrime ? 'high' : ''}`}></div>
                <div className={`city-prosperity-overlay ${highProsperity ? 'high' : ''}`}></div>

                {/* Subtle neon flicker effect */}
                <div className="city-neon-flicker"></div>

                {/* Vignette for depth */}
                <div className="city-vignette"></div>
            </div>
            
            {/* Town Report - AI Driven */}
            <div className="town-report-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ margin: 0 }}>📜 Town Report</h2>
                    <div style={{ 
                        padding: '6px 14px', 
                        borderRadius: '20px', 
                        background: `rgba(${cityStatus.status === 'danger' ? '255,68,68' : cityStatus.status === 'warning' ? '255,165,0' : '0,255,136'}, 0.2)`,
                        border: `1px solid ${cityStatus.status === 'danger' ? '#ff4444' : cityStatus.status === 'warning' ? '#ffa500' : '#00ff88'}`,
                        color: cityStatus.status === 'danger' ? '#ff4444' : cityStatus.status === 'warning' ? '#ffa500' : '#00ff88',
                        fontSize: '0.85em',
                        fontWeight: 'bold'
                    }}>
                        {cityStatus.text}
                    </div>
                </div>
                <TownReportAI gameState={gameState} cityStatus={cityStatus} />
            </div>
        </div>
        
        {/* Mayor Chat - Below Town Report with proper spacing */}
        <div className="mayor-chat-section">
            <MayorChat 
                playerName={character?.name || 'Citizen'} 
                playerLevel={character?.level || 1} 
            />
        </div>
        </>
    );
}

// AI-Driven Town Report Component

function TownReportAI({ gameState, cityStatus }) {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    
    // Generate dynamic report based on stats
    const generateReport = () => {
        if (!gameState || !gameState.stats) return null;
        const { morale = 50, treasury = 5000, crime = 50 } = gameState.stats;
        const day = gameState.day || 1;
        
        // Headlines based on dominant stat
        const headlines = [];
        
        if (crime > 70) {
            headlines.push(
                { text: "🚨 CRIME WAVE SWEEPS DEGENS CITY", color: '#ff4444', priority: 3 },
                { text: "🔫 Underground Rug Syndicates On The Rise", color: '#ff6b6b', priority: 2 },
                { text: "💀 Citizens Fear Walking The Blockchain At Night", color: '#ff8888', priority: 1 }
            );
        } else if (crime < 30) {
            headlines.push(
                { text: "✨ DEGENS CITY SAFEST IT'S EVER BEEN", color: '#00ff88', priority: 3 },
                { text: "👮 Mayor's Anti-Rug Task Force Working", color: '#00cc66', priority: 2 }
            );
        }
        
        if (morale > 80) {
            headlines.push(
                { text: "🎉 CITIZENS EUPHORIC AS BAGS PUMP", color: '#ffd700', priority: 3 },
                { text: "🚀 \"WAGMI\" Chants Echo Through Town Square", color: '#ffaa00', priority: 2 },
                { text: "💎 Diamond Hands Sentiment At All-Time High", color: '#00d4ff', priority: 1 }
            );
        } else if (morale < 30) {
            headlines.push(
                { text: "😰 MORALE PLUMMETS AS BEARS CIRCLE", color: '#ff4444', priority: 3 },
                { text: "📉 Paper Hands Epidemic Spreads", color: '#ff6b6b', priority: 2 },
                { text: "😢 \"NGMI\" Graffiti Appears Overnight", color: '#ff8888', priority: 1 }
            );
        }
        
        if (treasury > 8000) {
            headlines.push(
                { text: "💰 TREASURY OVERFLOWING WITH HOPIUM", color: '#00ff88', priority: 2 },
                { text: "🏦 Mayor Considers Stimulus Airdrop", color: '#00cc66', priority: 1 }
            );
        } else if (treasury < 2000) {
            headlines.push(
                { text: "⚠️ TREASURY RUNNING LOW ON FUNDS", color: '#ffa500', priority: 3 },
                { text: "💸 Budget Cuts Threaten City Services", color: '#ff9f43', priority: 2 }
            );
        }
        
        // Random events
        const randomEvents = [
            { text: "🐋 Whale spotted moving 10M HOPIUM on-chain", color: '#00d4ff' },
            { text: "📰 CryptoTwitter influencer mentions Degens City", color: '#1da1f2' },
            { text: "🎮 New arcade opens in Degen District", color: '#a855f7' },
            { text: "🌙 Night market reports record trading volume", color: '#ffd700' },
            { text: "🔮 Local oracle predicts bullish Q1", color: '#9b59b6' },
            { text: "🦍 Ape gang forms new HODLer coalition", color: '#00ff88' },
            { text: "📊 Technical analysts argue over support levels", color: '#888' },
            { text: "🎪 Meme coin fair announced for next week", color: '#ff69b4' },
            { text: "🏗️ New DeFi protocol breaks ground in Alpha Zone", color: '#00cc66' },
            { text: "☕ Mayor spotted at local coffee shop, \"just vibing\"", color: '#ffd700' }
        ];
        
        // Mayor quotes based on situation
        const mayorQuotes = [];
        if (cityStatus.status === 'danger') {
            mayorQuotes.push(
                "\"We've seen worse. Remember the Great Rug of '24? We survived that, we'll survive this.\"",
                "\"Citizens, I urge calm. Panic selling is exactly what the bears want.\"",
                "\"Dark times test our resolve. Diamond hands, everyone. Diamond hands.\""
            );
        } else if (cityStatus.status === 'warning') {
            mayorQuotes.push(
                "\"We're not out of the woods yet, but I see green candles on the horizon.\"",
                "\"Vigilance, citizens. The market rewards the patient.\"",
                "\"Some turbulence ahead, but our fundamentals are solid. Trust the process.\""
            );
        } else {
            mayorQuotes.push(
                "\"This is what we've been building toward. Enjoy the pump, you've earned it!\"",
                "\"To the moon? No, friends - to the STARS. 🚀\"",
                "\"I told you all to HODL. Who's laughing now? WE ARE.\""
            );
        }
        
        // Select content based on day (deterministic but varied)
        const seed = day * 7 + Math.floor(morale / 10) + Math.floor(crime / 10);
        const selectedHeadlines = headlines.sort((a, b) => b.priority - a.priority).slice(0, 2);
        const selectedEvent = randomEvents[seed % randomEvents.length];
        const selectedQuote = mayorQuotes[seed % mayorQuotes.length];
        
        setReport({
            headlines: selectedHeadlines,
            event: selectedEvent,
            quote: selectedQuote,
            stats: { morale, treasury, crime }
        });
    };
    
    useEffect(() => {
        if (!gameState || !gameState.stats) return;
        generateReport();
        // Refresh every 30 seconds for dynamic feel
        const interval = setInterval(generateReport, 30000);
        return () => clearInterval(interval);
    }, [gameState?.stats, gameState?.day]);
    
    if (!gameState || !gameState.stats) {
        return <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>Loading city data...</div>;
    }
    
    if (!report) return <div style={{ color: '#888', padding: '20px', textAlign: 'center' }}>Loading report...</div>;
    
    return (
        <div className="report-content" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Headlines */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px' }}>
                {report.headlines.map((headline, idx) => (
                    <div key={idx} style={{ 
                        color: headline.color, 
                        fontWeight: idx === 0 ? 'bold' : 'normal',
                        fontSize: idx === 0 ? '1.1em' : '0.95em',
                        marginBottom: '8px'
                    }}>
                        {headline.text}
                    </div>
                ))}
            </div>
            
            {/* Random Event */}
            <div style={{ 
                background: 'rgba(255,255,255,0.05)', 
                padding: '12px 15px', 
                borderRadius: '10px',
                borderLeft: `3px solid ${report.event.color}`
            }}>
                <span style={{ color: '#888', fontSize: '0.8em' }}>BREAKING: </span>
                <span style={{ color: report.event.color }}>{report.event.text}</span>
            </div>
            
            {/* Stats Summary */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.75em', color: '#888' }}>MORALE</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: report.stats.morale > 50 ? '#00ff88' : '#ff4444' }}>{report.stats.morale}%</div>
                </div>
                <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.75em', color: '#888' }}>TREASURY</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: report.stats.treasury > 5000 ? '#00ff88' : '#ffa500' }}>{report.stats.treasury.toLocaleString()}</div>
                </div>
                <div style={{ flex: 1, minWidth: '80px', textAlign: 'center', padding: '10px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '0.75em', color: '#888' }}>CRIME</div>
                    <div style={{ fontSize: '1.3em', fontWeight: 'bold', color: report.stats.crime < 40 ? '#00ff88' : '#ff4444' }}>{report.stats.crime}%</div>
                </div>
            </div>
            
            {/* Mayor Quote */}
            <div style={{ 
                background: 'linear-gradient(135deg, rgba(138, 43, 226, 0.1), rgba(75, 0, 130, 0.2))',
                border: '1px solid rgba(138, 43, 226, 0.3)',
                borderRadius: '12px',
                padding: '15px',
                fontStyle: 'italic'
            }}>
                <div style={{ color: '#a855f7', fontSize: '0.8em', marginBottom: '5px' }}>🎩 MAYOR SATOSHI MCPUMP:</div>
                <div style={{ color: '#fff' }}>{report.quote}</div>
            </div>
        </div>
    );
}


function TownStats({ stats, day, round }) {
    // Only show actual game stats, filter out database fields
    const displayStats = ['economy', 'security', 'culture', 'morale'];
    
    return (
        <div className="card">
            <div className="day-counter">Day {day}</div>
            <div className="round-counter">Round {round} • 6H Cycle</div>
            
            <div className="stats-grid">
                {displayStats.map(key => {
                    const value = stats[key];
                    if (value === undefined) return null;
                    return (
                        <div key={key} className="stat-item">
                            <div className="stat-label">{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                            <div className="stat-value">{value}%</div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${value}%` }}></div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


function VoteHistory({ history }) {
    // Calculate "time ago" from timestamp
    return (
        <div className="card" style={{ marginTop: '20px' }}>
            <h2>📜 Vote History</h2>
            <div className="timeline">
                {history.map((item, idx) => (
                    <div key={idx} className="timeline-item">
                        <div className="timeline-time">{item.timestamp ? getTimeAgo(item.timestamp) : item.time}</div>
                        <div className="timeline-title">{item.title} ({item.percentage}%)</div>
                        <div className="timeline-description">{item.description}</div>
                        <div className="timeline-effects">
                            {item.effects.map((effect, i) => (
                                <span key={i} className={`effect-tag ${effect.type}`}>
                                    {effect.stat}: {effect.value > 0 ? '+' : ''}{effect.value}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================== MAYOR MOOD COMPONENT ====================

function BreakingNewsTicker({ stats, day, onClose }) {
    const [headlines, setHeadlines] = useState([]);
    const [visible, setVisible] = useState(true);
    
    useEffect(() => {
        const generateHeadlines = async () => {
            // Generate contextual headlines based on city stats
            const baseHeadlines = [];
            
            if (stats) {
                if (stats.economy < 30) {
                    baseHeadlines.push({ icon: '📉', label: 'ALERT', text: 'ECONOMY IN FREEFALL: Treasury reserves critically low!' });
                } else if (stats.economy > 80) {
                    baseHeadlines.push({ icon: '📈', label: 'LIVE', text: 'BULL RUN CONFIRMED: Economy pumping to new highs!' });
                }
                
                if (stats.security < 30) {
                    baseHeadlines.push({ icon: '🚨', label: 'ALERT', text: 'CRIME WAVE: Ruggers running rampant in DeFi District!' });
                }
                
                if (stats.morale > 80) {
                    baseHeadlines.push({ icon: '🎉', label: 'LIVE', text: 'VIBES IMMACULATE: Citizen morale at all-time high!' });
                }
                
                if (stats.culture > 80) {
                    baseHeadlines.push({ icon: '🎨', label: 'UPDATE', text: 'NFT Renaissance: Degens City art scene exploding!' });
                }
            }
            
            // Add some evergreen headlines
            const evergreenHeadlines = [
                { icon: '🏛️', label: 'LIVE', text: `Day ${day || 1} of Governance: Mayor Satoshi addresses the citizens` },
                { icon: '🗳️', label: 'UPDATE', text: 'VOTE NOW: Your voice shapes the future of Degens City!' },
                { icon: '💎', label: 'LIVE', text: 'Diamond hands report record holding streaks this week' },
                { icon: '🐋', label: 'ALERT', text: 'Whale activity detected: Large positions moving' },
                { icon: '🎰', label: 'UPDATE', text: 'Degen Casino jackpot growing: Will you be the next winner?' },
                { icon: '🚀', label: 'LIVE', text: 'Mayor Satoshi: "WAGMI is not just a meme, it\'s a lifestyle"' }
            ];
            
            // Combine and shuffle
            const allHeadlines = [...baseHeadlines, ...evergreenHeadlines.slice(0, 3)];
            setHeadlines(allHeadlines);
        };
        
        generateHeadlines();
        
        // Refresh headlines periodically
        const interval = setInterval(generateHeadlines, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [stats, day]);
    
    if (!visible || headlines.length === 0) return null;
    
    return (
        <div className="news-ticker-container">
            <div className="news-ticker">
                {headlines.concat(headlines).map((headline, idx) => (
                    <div key={idx} className="news-ticker-item">
                        <span className="news-ticker-icon">{headline.icon}</span>
                        <span className={`news-ticker-label ${headline.label.toLowerCase()}`}>{headline.label}</span>
                        <span>{headline.text}</span>
                    </div>
                ))}
            </div>
            <button className="news-ticker-close" onClick={() => { setVisible(false); onClose?.(); }}>✕</button>
        </div>
    );
}

// ==================== EMERGENCY BROADCAST ====================

function EmergencyBroadcast({ broadcast, onClose }) {
    if (!broadcast) return null;
    
    const typeConfig = {
        crisis: { header: '🚨 EMERGENCY BROADCAST 🚨', icon: '💥' },
        opportunity: { header: '💰 SPECIAL OPPORTUNITY 💰', icon: '🎯' },
        chaos: { header: '🌀 CHAOS ALERT 🌀', icon: '🎪' },
        celebration: { header: '🎉 CELEBRATION TIME 🎉', icon: '🏆' }
    };
    
    const config = typeConfig[broadcast.type] || typeConfig.chaos;
    
    return (
        <div className="emergency-broadcast-overlay" onClick={onClose}>
            <div className={`emergency-broadcast ${broadcast.type || 'chaos'}`} onClick={e => e.stopPropagation()}>
                <div className="emergency-broadcast-header">{config.header}</div>
                <div className="emergency-broadcast-icon">{broadcast.icon || config.icon}</div>
                <div className="emergency-broadcast-title">{broadcast.title}</div>
                <div className="emergency-broadcast-message">{broadcast.message}</div>
                
                {broadcast.mayorMessage && (
                    <div className="emergency-broadcast-mayor">
                        <div className="emergency-broadcast-mayor-label">🎩 Mayor Satoshi Says:</div>
                        <div className="emergency-broadcast-mayor-text">"{broadcast.mayorMessage}"</div>
                    </div>
                )}
                
                <button className="emergency-broadcast-close" onClick={onClose}>
                    I Understand 💎
                </button>
            </div>
        </div>
    );
}

// ==================== MAYOR TIPS & WISDOM ====================

function SpecialEventBanner({ event, onDismiss }) {
    if (!event) return null;
    
    return (
        <div className={`special-event-banner ${event.type || 'chaos'}`}>
            <div className="special-event-title">{event.title}</div>
            <div className="special-event-description">{event.description}</div>
            {event.mayorAnnouncement && (
                <div className="special-event-mayor">
                    🎩 "{event.mayorAnnouncement}"
                </div>
            )}
            <button className="special-event-dismiss" onClick={onDismiss}>
                Dismiss
            </button>
        </div>
    );
}

// ==================== BREAKING NEWS TICKER ====================

function FearGreedIndex() {
    const [data, setData] = useState({ value: 50, classification: 'Neutral' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    
    useEffect(() => {
        const fetchFearGreed = async () => {
            try {
                // Fetch through our backend to avoid CORS
                const response = await fetch(API_BASE + '/api/fear-greed');
                
                if (!response.ok) {
                    throw new Error('Backend API failed');
                }
                
                const result = await response.json();
                if (result.success && result.value !== undefined) {
                    console.log('Fear & Greed fetched:', result.value, result.classification);
                    setData({ 
                        value: result.value, 
                        classification: result.classification 
                    });
                    setLastUpdated(new Date().toLocaleTimeString());
                    setError(false);
                } else {
                    throw new Error('Invalid response');
                }
            } catch (err) {
                console.error('Fear & Greed fetch error:', err);
                setError(true);
            }
            setLoading(false);
        };
        
        fetchFearGreed();
        // Update every 5 minutes
        const interval = setInterval(fetchFearGreed, 300000);
        return () => clearInterval(interval);
    }, []);
    
    const getColor = (value) => {
        if (value <= 25) return '#ff4444';
        if (value <= 45) return '#ff8844';
        if (value <= 55) return '#ffcc00';
        if (value <= 75) return '#88cc00';
        return '#00ff88';
    };
    
    const needleAngle = (data.value / 100) * 180 - 90;
    
    return (
        <div className="fear-greed-widget">
            <h3 style={{ color: '#ffa500', marginBottom: '10px' }}>😱 Fear & Greed Index</h3>
            <p style={{ color: '#888', fontSize: '0.85em' }}>Real-time market sentiment</p>
            
            <div className="fear-greed-meter">
                <div className="fear-greed-gauge"></div>
                <div className="fear-greed-cover"></div>
                <div 
                    className="fear-greed-needle"
                    style={{ transform: `rotate(${needleAngle}deg)` }}
                ></div>
            </div>
            
            <div className="fear-greed-value" style={{ color: getColor(data.value) }}>
                {loading ? '...' : data.value}
            </div>
            <div className="fear-greed-label" style={{ color: getColor(data.value) }}>
                {loading ? 'Loading...' : (error ? 'Unable to fetch' : data.classification)}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', fontSize: '0.8em', color: '#666' }}>
                <span>Extreme Fear</span>
                <span>Extreme Greed</span>
            </div>
            {lastUpdated && (
                <div style={{ fontSize: '0.7em', color: '#555', marginTop: '8px', textAlign: 'center' }}>
                    Updated: {lastUpdated}
                </div>
            )}
        </div>
    );
}

// ==================== PORTFOLIO SIMULATOR ====================

function ChaosToastSystem() {
    const [toasts, setToasts] = useState([]);
    const [lastCheck, setLastCheck] = useState(Date.now());
    const [mayorFlash, setMayorFlash] = useState(null);
    
    useEffect(function() {
        var fetchNotifs = async function() {
            try {
                var res = await fetch(API_BASE + '/api/city-engine/chaos-notifications?since=' + lastCheck);
                var data = await res.json();
                if (data.success && data.notifications && data.notifications.length > 0) {
                    var newToasts = data.notifications.slice(0, 3).map(function(n) {
                        return { id: n.id, icon: n.icon, message: n.message, severity: n.severity, type: n.type, exiting: false };
                    });
                    setToasts(function(prev) {
                        var combined = newToasts.concat(prev).slice(0, 5);
                        return combined;
                    });
                    
                    // Flash mayor decrees/predictions as overlay
                    var mayorTypes = ['mayor_decree', 'mayor_prediction', 'mayor_hottake'];
                    var mayorNotif = data.notifications.find(function(n) { return mayorTypes.includes(n.type); });
                    if (mayorNotif && !mayorFlash) {
                        setMayorFlash({
                            type: mayorNotif.type === 'mayor_decree' ? 'DECREE' : mayorNotif.type === 'mayor_prediction' ? 'PROPHECY' : 'HOT TAKE',
                            icon: mayorNotif.type === 'mayor_decree' ? '📜' : mayorNotif.type === 'mayor_prediction' ? '🔮' : '🌶️',
                            text: mayorNotif.message,
                            severity: mayorNotif.severity
                        });
                    }
                }
                setLastCheck(data.serverTime || Date.now());
            } catch(e) { console.error('Chaos notif error:', e); }
        };
        fetchNotifs();
        var iv = setInterval(fetchNotifs, 12000);
        return function() { clearInterval(iv); };
    }, [lastCheck]);
    
    // Auto-dismiss toasts after 5s
    useEffect(function() {
        if (toasts.length === 0) return;
        var timer = setTimeout(function() {
            setToasts(function(prev) {
                if (prev.length === 0) return prev;
                var updated = prev.slice();
                updated[updated.length - 1] = Object.assign({}, updated[updated.length - 1], { exiting: true });
                return updated;
            });
            setTimeout(function() {
                setToasts(function(prev) { return prev.slice(0, -1); });
            }, 300);
        }, 5000);
        return function() { clearTimeout(timer); };
    }, [toasts.length]);
    
    // Auto-dismiss mayor flash after 6s
    useEffect(function() {
        if (!mayorFlash) return;
        var timer = setTimeout(function() { setMayorFlash(null); }, 6000);
        return function() { clearTimeout(timer); };
    }, [mayorFlash]);
    
    return React.createElement(React.Fragment, null,
        // Toast notifications
        toasts.length > 0 && React.createElement('div', { className: 'chaos-toast-container' },
            toasts.map(function(t) {
                return React.createElement('div', { key: t.id, className: 'chaos-toast ' + t.severity + (t.exiting ? ' chaos-toast-exit' : ''), onClick: function() { setToasts(function(prev) { return prev.filter(function(x) { return x.id !== t.id; }); }); } },
                    React.createElement('div', { className: 'chaos-toast-icon' }, t.icon || '⚡'),
                    React.createElement('div', { className: 'chaos-toast-content' },
                        React.createElement('div', { className: 'chaos-toast-label' }, t.severity === 'critical' ? '🚨 CRITICAL' : t.severity === 'high' ? '⚠️ ALERT' : '📢 UPDATE'),
                        React.createElement('div', { className: 'chaos-toast-text' }, (t.message || '').substring(0, 80))
                    ),
                    React.createElement('div', { className: 'toast-progress' })
                );
            })
        ),
        
        // Mayor flash decree overlay
        mayorFlash && React.createElement('div', { className: 'mayor-flash-overlay', onClick: function() { setMayorFlash(null); } },
            React.createElement('div', { className: 'mayor-flash-card', onClick: function(e) { e.stopPropagation(); } },
                React.createElement('button', { className: 'flash-dismiss', onClick: function() { setMayorFlash(null); } }, '✕'),
                React.createElement('div', { className: 'flash-icon' }, mayorFlash.icon),
                React.createElement('div', { className: 'flash-type' }, '👑 MAYOR\'S ' + mayorFlash.type),
                React.createElement('div', { className: 'flash-text' }, mayorFlash.text),
                React.createElement('div', { className: 'flash-mayor' }, '— Mayor Satoshi McPump')
            )
        )
    );
}

// ==================== SOAP OPERA PANEL (Active drama arcs with betting) ====================

function WelcomeBackRecap({ playerName, onDismiss }) {
    const [recap, setRecap] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showContent, setShowContent] = useState(false);
    const [currentHeadline, setCurrentHeadline] = useState(0);
    
    useEffect(function() {
        var lastVisit = localStorage.getItem('pumptown_last_visit') || (Date.now() - 3600000);
        fetch(API_BASE + '/api/city-recap?since=' + lastVisit + '&player=' + encodeURIComponent(playerName || ''))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success && data.totalEvents > 0) {
                    setRecap(data);
                    setTimeout(function() { setShowContent(true); }, 300);
                } else {
                    onDismiss();
                }
                setLoading(false);
            })
            .catch(function() { setLoading(false); onDismiss(); });
        
        // Update last visit time
        localStorage.setItem('pumptown_last_visit', Date.now().toString());
    }, []);
    
    // Auto-scroll through headlines
    useEffect(function() {
        if (!recap || !recap.headlines || recap.headlines.length <= 1) return;
        var iv = setInterval(function() {
            setCurrentHeadline(function(prev) { return (prev + 1) % recap.headlines.length; });
        }, 4000);
        return function() { clearInterval(iv); };
    }, [recap]);
    
    if (loading) {
        return React.createElement('div', { className: 'recap-overlay' },
            React.createElement('div', { style: { textAlign: 'center', color: '#888' } },
                React.createElement('div', { style: { fontSize: '3em', marginBottom: '15px', animation: 'recapPulse 1s infinite' } }, '🏙️'),
                React.createElement('div', null, 'Loading city report...')
            )
        );
    }
    
    if (!recap) return null;
    
    var dramaColor = recap.dramaScore > 70 ? '#ff4444' : recap.dramaScore > 40 ? '#ffd700' : '#00ff88';
    var dramaLabel = recap.dramaScore > 80 ? '🔥 ABSOLUTE CHAOS' : recap.dramaScore > 60 ? '😱 DRAMA OVERLOAD' : recap.dramaScore > 40 ? '⚡ THINGS HAPPENED' : recap.dramaScore > 20 ? '😐 RELATIVELY CALM' : '😴 QUIET DAY';
    var sentimentEmoji = { bull: '📈', bear: '📉', mania: '🤑', panic: '😱', neutral: '😐' };
    
    return React.createElement('div', { className: 'recap-overlay', onClick: function(e) { if (e.target.classList.contains('recap-overlay')) onDismiss(); } },
        React.createElement('div', { className: 'recap-container' },
            React.createElement('div', { className: 'recap-scanline' }),
            
            // Header
            React.createElement('div', { className: 'recap-header' },
                React.createElement('h1', null, '🏙️ Welcome Back' + (playerName ? ', ' + playerName : '') + '!'),
                React.createElement('div', { className: 'recap-time' }, 'You were away for ' + recap.timeAway + ' — here\'s what happened:')
            ),
            
            // Drama Meter
            React.createElement('div', { className: 'recap-drama-meter' },
                React.createElement('h3', null, 'DRAMA LEVEL'),
                React.createElement('div', { className: 'recap-drama-bar' },
                    React.createElement('div', { className: 'recap-drama-fill', style: { width: recap.dramaScore + '%', background: 'linear-gradient(90deg, #00ff88, ' + dramaColor + ')' } })
                ),
                React.createElement('div', { className: 'recap-drama-label', style: { color: dramaColor } }, dramaLabel)
            ),
            
            // Quick Stats
            React.createElement('div', { className: 'recap-stats' },
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#ff4444' } }, recap.stats.breakingNews),
                    React.createElement('span', { className: 'stat-label' }, 'Breaking News')
                ),
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#ff6600' } }, recap.stats.crimes),
                    React.createElement('span', { className: 'stat-label' }, 'Crimes')
                ),
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#ffd700' } }, recap.stats.mayorActions),
                    React.createElement('span', { className: 'stat-label' }, 'Mayor Acts')
                ),
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#9966ff' } }, recap.stats.trials),
                    React.createElement('span', { className: 'stat-label' }, 'Trials')
                ),
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#00ccff' } }, recap.stats.npcMessages),
                    React.createElement('span', { className: 'stat-label' }, 'NPC Chatter')
                ),
                React.createElement('div', { className: 'recap-stat' },
                    React.createElement('span', { className: 'stat-num', style: { color: '#00ff88' } }, recap.totalEvents),
                    React.createElement('span', { className: 'stat-label' }, 'Total Events')
                )
            ),
            
            // Headlines
            recap.headlines && recap.headlines.length > 0 && React.createElement('div', { className: 'recap-headlines' },
                React.createElement('h3', null, '📰 TOP HEADLINES'),
                recap.headlines.slice(0, 6).map(function(h, i) {
                    return React.createElement('div', { key: i, className: 'recap-headline ' + h.type, style: { animationDelay: (i * 0.15) + 's' } },
                        React.createElement('span', { className: 'hl-icon' }, h.icon),
                        React.createElement('span', { className: 'hl-text' }, h.text)
                    );
                })
            ),
            
            // Player Mentions
            recap.playerMentions && recap.playerMentions.length > 0 && React.createElement('div', { className: 'recap-mentions' },
                React.createElement('h3', null, '💬 PEOPLE TALKED ABOUT YOU (' + recap.stats.playerMentions + ')'),
                recap.playerMentions.map(function(m, i) {
                    return React.createElement('div', { key: i, className: 'recap-mention' },
                        React.createElement('div', { className: 'mention-from' }, m.from + ':'),
                        React.createElement('div', { className: 'mention-msg' }, m.message)
                    );
                })
            ),
            
            // City State
            React.createElement('div', { className: 'recap-city-state' },
                React.createElement('div', { className: 'recap-state-card' },
                    React.createElement('div', { className: 'state-icon' }, '🌡️'),
                    React.createElement('div', { className: 'state-label' }, 'Chaos Level'),
                    React.createElement('div', { className: 'state-value', style: { color: recap.cityState.chaosLevel > 60 ? '#ff4444' : recap.cityState.chaosLevel > 30 ? '#ffd700' : '#00ff88' } }, recap.cityState.chaosLevel + '%')
                ),
                React.createElement('div', { className: 'recap-state-card' },
                    React.createElement('div', { className: 'state-icon' }, '🎩'),
                    React.createElement('div', { className: 'state-label' }, 'Mayor Approval'),
                    React.createElement('div', { className: 'state-value', style: { color: recap.cityState.mayorApproval > 60 ? '#00ff88' : recap.cityState.mayorApproval > 30 ? '#ffd700' : '#ff4444' } }, recap.cityState.mayorApproval + '%')
                ),
                React.createElement('div', { className: 'recap-state-card' },
                    React.createElement('div', { className: 'state-icon' }, sentimentEmoji[recap.cityState.marketSentiment] || '😐'),
                    React.createElement('div', { className: 'state-label' }, 'Market'),
                    React.createElement('div', { className: 'state-value', style: { color: '#ffd700', textTransform: 'uppercase' } }, recap.cityState.marketSentiment || 'neutral')
                ),
                React.createElement('div', { className: 'recap-state-card' },
                    React.createElement('div', { className: 'state-icon' }, '🎭'),
                    React.createElement('div', { className: 'state-label' }, 'Soap Operas'),
                    React.createElement('div', { className: 'state-value', style: { color: '#ff88aa' } }, (recap.cityState.activeSoapOperas || 0) + ' active')
                )
            ),
            
            // Active Feud
            recap.cityState.activeFeud && React.createElement('div', { style: { background: '#1a0a0a', border: '1px solid #ff4444', borderRadius: '12px', padding: '12px', marginBottom: '20px', textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '1.2em', marginBottom: '5px' } }, '⚔️ ACTIVE FEUD'),
                React.createElement('div', { style: { color: '#ff8888', fontWeight: 'bold' } }, recap.cityState.activeFeud.npc1 + ' vs ' + recap.cityState.activeFeud.npc2),
                React.createElement('div', { style: { color: '#888', fontSize: '0.8em', marginTop: '3px' } }, recap.cityState.activeFeud.reason)
            ),
            
            // Disaster
            recap.cityState.disaster && React.createElement('div', { style: { background: '#1a1a0a', border: '1px solid #ff6600', borderRadius: '12px', padding: '12px', marginBottom: '20px', textAlign: 'center' } },
                React.createElement('div', { style: { fontSize: '1.2em', marginBottom: '5px' } }, '🚨 ACTIVE DISASTER'),
                React.createElement('div', { style: { color: '#ffaa44', fontWeight: 'bold' } }, recap.cityState.disaster.title)
            ),
            
            // NPC Drama Statuses
            recap.npcStatuses && Object.keys(recap.npcStatuses).length > 0 && React.createElement('div', { className: 'recap-npc-drama' },
                React.createElement('h3', null, '🎭 NPC STATUS REPORT'),
                Object.entries(recap.npcStatuses).slice(0, 6).map(function(entry) {
                    var name = entry[0]; var npc = entry[1];
                    var badgeColor = npc.bankrupt ? '#ff4444' : npc.drunk ? '#ffaa00' : npc.wanted ? '#ff0000' : npc.status === 'unhinged' ? '#ff44ff' : '#00ff88';
                    var badgeText = npc.bankrupt ? 'BROKE' : npc.drunk ? 'DRUNK' : npc.wanted ? 'WANTED' : npc.status === 'unhinged' ? 'UNHINGED' : npc.partner ? 'IN LOVE' : 'DRAMA';
                    return React.createElement('div', { key: name, className: 'recap-npc-item' },
                        React.createElement('span', { className: 'npc-status-badge', style: { background: badgeColor + '22', color: badgeColor, border: '1px solid ' + badgeColor } }, badgeText),
                        React.createElement('span', { style: { color: '#fff', fontWeight: 'bold', fontSize: '0.85em' } }, name),
                        React.createElement('span', { style: { color: '#888', fontSize: '0.75em' } }, npc.role),
                        npc.partner && React.createElement('span', { style: { color: '#ff88aa', fontSize: '0.75em' } }, '❤️ ' + npc.partner)
                    );
                })
            ),
            
            // Enter Button
            React.createElement('button', {
                className: 'recap-enter-btn',
                onClick: onDismiss,
                style: { background: 'linear-gradient(135deg, ' + dramaColor + ', #333)', color: recap.dramaScore > 40 ? '#000' : '#fff' }
            }, '⚡ ENTER THE CITY ⚡')
        )
    );
}


function ConfettiEffect() {
    const confettiCount = 50;
    const colors = ['#00ff88', '#ffd700', '#ff4444', '#1da1f2', '#ff69b4'];
    
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}>
            {[...Array(confettiCount)].map((_, i) => (
                <div
                    key={i}
                    style={{
                        position: 'absolute',
                        left: `${Math.random() * 100}%`,
                        top: '-10px',
                        width: '10px',
                        height: '10px',
                        background: colors[Math.floor(Math.random() * colors.length)],
                        animation: `confettiFall ${2 + Math.random() * 2}s linear forwards`,
                        animationDelay: `${Math.random() * 0.5}s`,
                        transform: `rotate(${Math.random() * 360}deg)`
                    }}
                />
            ))}
        </div>
    );
}

// ==================== AGENT BRAIN PAGE ====================

