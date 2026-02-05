// ====================================================
// social-chat.js — Chat, soap opera, cap features
// Degens City - Auto-extracted from index.html
// ====================================================

function ChatSection({ playerName, onPlayerClick }) {
    const [globalMessages, setGlobalMessages] = useState([]);
    const [whaleMessages, setWhaleMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeTab, setActiveTab] = useState('global');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [showInputEmoji, setShowInputEmoji] = useState(false);
    const [inputEmojiCategory, setInputEmojiCategory] = useState('popular');
    const messagesEndRef = useRef(null);
    const lastFetchTime = useRef({ global: 0, whale: 0 });
    const inputEmojiRef = useRef(null);
    
    // Emoji categories for chat input
    const inputEmojiCategories = {
        popular: ['🔥', '😂', '🚀', '💎', '❤️', '👀', '💀', '😭'],
        crypto: ['📈', '📉', '💰', '🐋', '🌙', '💸', '🪙', '⚡'],
        faces: ['😀', '🤣', '😎', '🤑', '😤', '🤡', '😱', '🥺'],
        meme: ['🦍', '🐶', '🐸', '👑', '🧠', '🙌', '💪', '🎯']
    };
    
    // Add emoji to message
    const addEmojiToMessage = (emoji) => {
        setNewMessage(prev => prev + emoji);
        setShowInputEmoji(false);
    };
    
    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (inputEmojiRef.current && !inputEmojiRef.current.contains(event.target)) {
                setShowInputEmoji(false);
            }
        };
        if (showInputEmoji) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [showInputEmoji]);
    
    // Parse message text to highlight @mentions
    const renderMessageText = (text, mentions = []) => {
        if (!mentions || mentions.length === 0) {
            // Still check for @mentions in text
            const mentionRegex = /@(\w+)/g;
            const parts = [];
            let lastIndex = 0;
            let match;
            
            while ((match = mentionRegex.exec(text)) !== null) {
                // Add text before mention
                if (match.index > lastIndex) {
                    parts.push(text.substring(lastIndex, match.index));
                }
                // Add mention span
                const mentionName = match[1];
                const isMe = mentionName.toLowerCase() === playerName?.toLowerCase();
                parts.push(
                    <span 
                        key={match.index}
                        className={`chat-mention ${isMe ? 'is-me' : ''}`}
                        onClick={() => onPlayerClick && onPlayerClick(mentionName)}
                    >
                        @{mentionName}
                    </span>
                );
                lastIndex = match.index + match[0].length;
            }
            // Add remaining text
            if (lastIndex < text.length) {
                parts.push(text.substring(lastIndex));
            }
            return parts.length > 0 ? parts : text;
        }
        return text;
    };
    
    // Handle click on player name
    const handleNameClick = (name) => {
        if (name && name !== playerName && onPlayerClick) {
            onPlayerClick(name);
        }
    };
    
    // Fetch messages from backend
    const fetchMessages = async (channel) => {
        try {
            const response = await fetch(`${API_BASE}/api/chat/${channel}`);
            const data = await response.json();
            if (data.success && data.messages) {
                if (channel === 'global') {
                    setGlobalMessages(data.messages);
                    if (data.messages.length > 0) {
                        lastFetchTime.current.global = data.messages[data.messages.length - 1].timestamp;
                    }
                } else {
                    setWhaleMessages(data.messages);
                    if (data.messages.length > 0) {
                        lastFetchTime.current.whale = data.messages[data.messages.length - 1].timestamp;
                    }
                }
            }
        } catch (err) {
            console.error('Error fetching chat:', err);
        }
    };
    
    // Fetch new messages since last fetch (polling)
    const fetchNewMessages = async (channel) => {
        const lastTime = channel === 'global' ? lastFetchTime.current.global : lastFetchTime.current.whale;
        if (!lastTime) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/chat/${channel}/since/${lastTime}`);
            const data = await response.json();
            if (data.success && data.messages && data.messages.length > 0) {
                if (channel === 'global') {
                    setGlobalMessages(prev => {
                        // Filter out duplicates
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
                        if (newMsgs.length > 0) {
                            lastFetchTime.current.global = newMsgs[newMsgs.length - 1].timestamp;
                            return [...prev, ...newMsgs].slice(-100); // Keep last 100
                        }
                        return prev;
                    });
                } else {
                    setWhaleMessages(prev => {
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
                        if (newMsgs.length > 0) {
                            lastFetchTime.current.whale = newMsgs[newMsgs.length - 1].timestamp;
                            return [...prev, ...newMsgs].slice(-100);
                        }
                        return prev;
                    });
                }
            }
        } catch (err) {
            console.error('Error fetching new messages:', err);
        }
    };
    
    // Initial load
    useEffect(() => {
        const loadChat = async () => {
            setLoading(true);
            await Promise.all([fetchMessages('global'), fetchMessages('whale')]);
            setLoading(false);
        };
        loadChat();
    }, []);
    
    // Poll for new messages every 3 seconds
    useEffect(() => {
        const pollInterval = setInterval(() => {
            fetchNewMessages('global');
            fetchNewMessages('whale');
        }, 3000);
        
        return () => clearInterval(pollInterval);
    }, []);
    
    // Auto scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [globalMessages, whaleMessages, activeTab]);
    
    // Send message to backend
    const sendMessage = async () => {
        if (!newMessage.trim() || sending) return;
        
        setSending(true);
        const messageText = newMessage.trim();
        setNewMessage(''); // Clear input immediately for better UX
        
        try {
            const response = await fetch(API_BASE + '/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: activeTab,
                    playerName: playerName || 'Anon',
                    message: messageText
                })
            });
            
            const data = await response.json();
            if (data.success && data.message) {
                // Add message to local state immediately
                if (activeTab === 'global') {
                    setGlobalMessages(prev => [...prev, data.message].slice(-100));
                    lastFetchTime.current.global = data.message.timestamp;
                } else {
                    setWhaleMessages(prev => [...prev, data.message].slice(-100));
                    lastFetchTime.current.whale = data.message.timestamp;
                }
            }
        } catch (err) {
            console.error('Error sending message:', err);
            // Restore message if failed
            setNewMessage(messageText);
        }
        
        setSending(false);
    };
    
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !sending) {
            sendMessage();
        }
    };
    
    // Get current messages based on active tab
    const currentMessages = activeTab === 'global' ? globalMessages : whaleMessages;
    
    return (
        <div className="chat-section">
            <div className="chat-header">
                <h2>💬 Global Chat</h2>
                <div className="chat-tabs">
                    <button 
                        className={`chat-tab ${activeTab === 'global' ? 'active' : ''}`}
                        onClick={() => setActiveTab('global')}
                    >
                        🌍 Global ({globalMessages.length})
                    </button>
                    <button 
                        className={`chat-tab ${activeTab === 'whale' ? 'active' : ''}`}
                        onClick={() => setActiveTab('whale')}
                    >
                        🐋 Whales ({whaleMessages.length})
                    </button>
                </div>
            </div>
            
            <div className="chat-messages">
                {loading ? (
                    <div style={{ padding: '10px 0' }}>
                        {[1,2,3,4,5,6].map(i => (
                            <div key={i} className="skeleton-message">
                                <div className="skeleton-message-header">
                                    <div className="skeleton skeleton-message-name"></div>
                                    <div className="skeleton skeleton-message-time"></div>
                                </div>
                                <div className="skeleton skeleton-message-text" style={{ width: `${60 + Math.random() * 30}%` }}></div>
                            </div>
                        ))}
                    </div>
                ) : currentMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        <p>No messages yet. Be the first to say something! 🎉</p>
                    </div>
                ) : (
                    currentMessages.map(msg => (
                        <ChatMessageWithReactions 
                            key={msg.id}
                            msg={msg}
                            playerName={playerName}
                            handleNameClick={handleNameClick}
                            renderMessageText={renderMessageText}
                        />
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>
            
            <div className="chat-input-area" style={{ position: 'relative' }}>
                {/* Emoji Picker Button */}
                <div ref={inputEmojiRef} style={{ position: 'relative' }}>
                    <button
                        type="button"
                        onClick={() => setShowInputEmoji(!showInputEmoji)}
                        style={{
                            background: showInputEmoji ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 0, 0, 0.5)',
                            border: '2px solid rgba(0, 255, 136, 0.3)',
                            borderRadius: '10px',
                            padding: '12px',
                            fontSize: '1.2em',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        {showInputEmoji ? '✕' : '😀'}
                    </button>
                    
                    {/* Emoji Picker Popup */}
                    {showInputEmoji && (
                        <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '0',
                            marginBottom: '8px',
                            background: 'rgba(20, 20, 40, 0.98)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: '12px',
                            padding: '0',
                            zIndex: 1000,
                            boxShadow: '0 5px 20px rgba(0, 0, 0, 0.5)',
                            width: '220px',
                            overflow: 'hidden'
                        }}>
                            {/* Category tabs */}
                            <div style={{
                                display: 'flex',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(0, 0, 0, 0.3)'
                            }}>
                                {[
                                    { key: 'popular', icon: '⭐' },
                                    { key: 'crypto', icon: '📈' },
                                    { key: 'faces', icon: '😀' },
                                    { key: 'meme', icon: '🦍' }
                                ].map(cat => (
                                    <button
                                        key={cat.key}
                                        onClick={() => setInputEmojiCategory(cat.key)}
                                        style={{
                                            flex: 1,
                                            padding: '8px',
                                            border: 'none',
                                            background: inputEmojiCategory === cat.key ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                            cursor: 'pointer',
                                            fontSize: '1em',
                                            opacity: inputEmojiCategory === cat.key ? 1 : 0.5,
                                            borderBottom: inputEmojiCategory === cat.key ? '2px solid #00ff88' : '2px solid transparent'
                                        }}
                                    >
                                        {cat.icon}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Emoji grid */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '4px',
                                padding: '8px'
                            }}>
                                {inputEmojiCategories[inputEmojiCategory].map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => addEmojiToMessage(emoji)}
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            border: 'none',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '1.3em',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => {
                                            e.target.style.background = 'rgba(255, 255, 255, 0.15)';
                                            e.target.style.transform = 'scale(1.15)';
                                        }}
                                        onMouseLeave={e => {
                                            e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                                            e.target.style.transform = 'scale(1)';
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <input 
                    type="text"
                    className="chat-input"
                    placeholder={activeTab === 'global' ? "Chat with everyone... (use @name to mention)" : "Chat with whales... (use @name to mention)"}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    maxLength={500}
                    disabled={sending}
                />
                <button 
                    className="chat-send-btn" 
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    style={sending ? { opacity: 0.6 } : {}}
                >
                    {sending ? '...' : 'Send'}
                </button>
            </div>
            
            <div style={{ fontSize: '0.75em', color: '#666', textAlign: 'center', marginTop: '8px' }}>
                🌐 Real-time global chat • All players can see messages
            </div>
        </div>
    );
}

// ==================== TRADING SECTION ====================

function SoapOperaPanel({ showToast, playerName }) {
    const [arcs, setArcs] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [betting, setBetting] = useState(null);
    
    useEffect(function() {
        var fetchSoaps = async function() {
            try {
                var res = await fetch(API_BASE + '/api/city-engine/soap-operas');
                var data = await res.json();
                if (data.success) {
                    setArcs(data.activeArcs || []);
                    setHistory(data.recentHistory || []);
                }
            } catch(e) { console.error('Soap fetch error:', e); }
            setLoading(false);
        };
        fetchSoaps();
        var iv = setInterval(fetchSoaps, 15000);
        return function() { clearInterval(iv); };
    }, []);
    
    var placeBet = async function(arcId, choice) {
        try {
            setBetting(arcId + choice);
            var res = await fetch(API_BASE + '/api/city-engine/soap-bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName: playerName || 'Anon', arcId: arcId, choice: choice, amount: 100 })
            });
            var data = await res.json();
            if (data.success) {
                if (showToast) showToast('🎰 Bet placed! ' + data.bet.amount + ' REP on the line!', 'success');
            } else {
                if (showToast) showToast(data.error || 'Bet failed', 'error');
            }
        } catch(e) { if (showToast) showToast('Bet failed', 'error'); }
        setBetting(null);
    };
    
    if (loading) return React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: '#888' } }, '🎬 Loading drama...');
    if (arcs.length === 0 && history.length === 0) return null;
    
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        // Active arcs
        arcs.length > 0 && React.createElement('div', { style: { borderRadius: '14px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '10px 14px', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid rgba(168,85,247,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('span', { style: { color: '#e0b0ff', fontWeight: 'bold', fontSize: '0.9em' } }, '🎬 Active Soap Operas'),
                React.createElement('span', { style: { color: '#a855f7', fontSize: '0.7em', animation: 'pulse 2s infinite' } }, '● ' + arcs.length + ' LIVE')
            ),
            arcs.map(function(arc) {
                var isExpanded = expanded === arc.id;
                var stageProgress = ((arc.currentStage + 1) / arc.totalStages * 100);
                return React.createElement('div', { key: arc.id, className: 'soap-card', style: { margin: '8px', cursor: 'pointer' }, onClick: function() { setExpanded(isExpanded ? null : arc.id); } },
                    React.createElement('div', { className: 'soap-header' },
                        React.createElement('span', { className: 'soap-title' }, arc.title),
                        React.createElement('span', { className: 'soap-stage' }, 'Ch. ' + (arc.currentStage + 1) + '/' + arc.totalStages)
                    ),
                    // Progress bar
                    React.createElement('div', { style: { height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginBottom: '8px' } },
                        React.createElement('div', { style: { height: '100%', width: stageProgress + '%', background: 'linear-gradient(90deg, #a855f7, #ff6b6b)', borderRadius: '2px', transition: 'width 0.5s ease' } })
                    ),
                    // VS display
                    React.createElement('div', { className: 'soap-vs' },
                        React.createElement('div', { className: 'soap-npc' },
                            React.createElement('div', { className: 'soap-npc-name' }, (arc.npc1 || '').replace(/_/g, ' ')),
                            React.createElement('div', { className: 'soap-npc-role' }, 'Challenger')
                        ),
                        React.createElement('span', { className: 'soap-bolt' }, '⚡'),
                        React.createElement('div', { className: 'soap-npc' },
                            React.createElement('div', { className: 'soap-npc-name' }, (arc.npc2 || '').replace(/_/g, ' ')),
                            React.createElement('div', { className: 'soap-npc-role' }, 'Rival')
                        )
                    ),
                    React.createElement('div', { style: { color: '#999', fontSize: '0.75em', textAlign: 'center', marginBottom: '6px' } }, '📺 ' + (arc.currentLabel || 'In Progress')),
                    // Betting (expanded)
                    isExpanded && arc.bettingOpen && React.createElement('div', null,
                        React.createElement('div', { style: { color: '#888', fontSize: '0.7em', textAlign: 'center', marginBottom: '6px' } }, '🎰 Place your bet — 100 REP per bet'),
                        React.createElement('div', { className: 'soap-bet-row' },
                            (arc.outcomes || []).map(function(o) {
                                var betKey = o.id.includes('n1') ? 'n1' : o.id.includes('n2') ? 'n2' : 'other';
                                var totalBets = (arc.bets.n1_wins || 0) + (arc.bets.n2_wins || 0) + (arc.bets.other || 0);
                                var thisBets = arc.bets[betKey + '_wins'] || arc.bets[betKey] || 0;
                                var odds = totalBets > 0 ? Math.round(thisBets / totalBets * 100) : 33;
                                return React.createElement('button', {
                                    key: o.id,
                                    className: 'soap-bet-btn',
                                    disabled: betting === arc.id + betKey,
                                    onClick: function(e) { e.stopPropagation(); placeBet(arc.id, betKey); },
                                    style: betting === arc.id + betKey ? { opacity: 0.5 } : {}
                                }, o.label.substring(0, 20), React.createElement('div', { style: { fontSize: '0.85em', color: '#a855f7' } }, odds + '% odds'));
                            })
                        )
                    )
                );
            })
        ),
        
        // Recent completed arcs
        history.length > 0 && React.createElement('div', { style: { borderRadius: '12px', overflow: 'hidden' } },
            React.createElement('div', { style: { padding: '8px 14px', background: 'rgba(255,255,255,0.02)' } },
                React.createElement('span', { style: { color: '#666', fontWeight: 'bold', fontSize: '0.78em' } }, '📼 Recent Drama History')
            ),
            history.slice(0, 3).map(function(h) {
                var ago = Math.round((Date.now() - h.startTime) / 60000);
                var timeStr = ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago';
                return React.createElement('div', { key: h.id, style: { padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                    React.createElement('div', null,
                        React.createElement('span', { style: { color: '#999', fontSize: '0.78em' } }, h.title),
                        h.resolvedOutcome && React.createElement('div', { style: { color: '#00ff88', fontSize: '0.7em' } }, '✅ ' + (h.resolvedOutcome.text || '').substring(0, 50))
                    ),
                    React.createElement('span', { style: { color: '#555', fontSize: '0.68em' } }, timeStr)
                );
            })
        )
    );
}

// ==================== MAYOR UNHINGED PANEL (Dashboard widget) ====================

function CapAlertSystem() {
    const [alerts, setAlerts] = useState([]);
    const [enabled, setEnabled] = useState(() => {
        const saved = localStorage.getItem('cap_alerts_enabled');
        return saved !== 'false';
    });
    
    // Simulated real-time alerts (in production, this would be websocket)
    const alertTemplates = [
        { type: 'roast', handle: '@CryptoMentor99', verdict: 'cap', reason: 'Claimed 500% monthly returns', mayorQuote: "500% monthly?! That's not trading, that's a Ponzi with extra steps 💀" },
        { type: 'roast', handle: '@Web3Visionary', verdict: 'cap', reason: 'Self-proclaimed thought leader', mayorQuote: "Thought leader of WHAT exactly? The thoughts seem to be missing ser 🧠❌" },
        { type: 'respect', handle: '@SimpleBuilder', verdict: 'nocap', reason: 'Actually ships code', mayorQuote: "No IQ flex, no fake exits. Just builds. This is the way ✅" },
        { type: 'roast', handle: '@AlphaKing', verdict: 'cap', reason: 'IQ 280 in bio', mayorQuote: "IQ 280?! Einstein is SHAKING in his grave at this audacity 😭🧢" },
        { type: 'game', player: 'cap_hunter_9000', score: 2900, streak: 13, message: "just hit a 13-streak in Is This Cap! 🔥" },
        { type: 'rivalry', challenger: 'roast_master', defender: 'vibe_checker', message: "New rivalry! roast_master vs vibe_checker - 500 HOPIUM on the line! ⚔️" },
        { type: 'roast', handle: '@NFTMillionaire', verdict: 'cap', reason: 'Claims $50M in JPEG sales', mayorQuote: "Where's the OpenSea history? Where's the Etherscan? This is FICTION 📖🧢" },
        { type: 'respect', handle: '@AnonymousDev', verdict: 'nocap', reason: 'Open source contributor', mayorQuote: "Ships code, doesn't flex. GitHub history speaks louder than any bio ✅" },
        { type: 'roast', handle: '@QuantGenius', verdict: 'cap', reason: 'Ex-everything prestigious', mayorQuote: "Ex-Goldman, Ex-Citadel, Ex-NASA? More like Ex-tremely full of cap 🚀🧢" },
        { type: 'game', player: 'bs_detector_pro', score: 2750, streak: 11, message: "is on FIRE with 11 correct in a row! 🎯" },
    ];
    
    // Generate random alerts periodically
    useEffect(() => {
        if (!enabled) return;
        
        // Initial alert after 5 seconds
        const initialTimeout = setTimeout(() => {
            addRandomAlert();
        }, 5000);
        
        // Then every 30-60 seconds
        const interval = setInterval(() => {
            if (Math.random() > 0.4) { // 60% chance each interval
                addRandomAlert();
            }
        }, 30000 + Math.random() * 30000);
        
        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [enabled]);
    
    const addRandomAlert = () => {
        const template = alertTemplates[Math.floor(Math.random() * alertTemplates.length)];
        const newAlert = {
            id: Date.now(),
            ...template,
            timestamp: Date.now()
        };
        
        setAlerts(prev => [newAlert, ...prev].slice(0, 5)); // Keep max 5 alerts
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
        }, 8000);
    };
    
    const dismissAlert = (id) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
    };
    
    const toggleEnabled = () => {
        const newValue = !enabled;
        setEnabled(newValue);
        localStorage.setItem('cap_alerts_enabled', newValue.toString());
    };
    
    const getAlertIcon = (alert) => {
        if (alert.type === 'roast') return alert.verdict === 'cap' ? '🧢' : '✅';
        if (alert.type === 'game') return '🎮';
        if (alert.type === 'rivalry') return '⚔️';
        return '📢';
    };
    
    const getAlertColor = (alert) => {
        if (alert.type === 'roast' && alert.verdict === 'cap') return '#ff6b6b';
        if (alert.type === 'roast' && alert.verdict === 'nocap') return '#00ff88';
        if (alert.type === 'game') return '#ffd700';
        if (alert.type === 'rivalry') return '#ff6b6b';
        return '#00d4ff';
    };
    
    return (
        <>
            {/* Alert Toggle Button */}
            <button 
                className={`cap-alert-toggle ${enabled ? 'enabled' : 'disabled'}`}
                onClick={toggleEnabled}
                title={enabled ? 'Disable Cap Alerts' : 'Enable Cap Alerts'}
            >
                🚨 {enabled ? 'ON' : 'OFF'}
            </button>
            
            {/* Alert Container */}
            <div className="cap-alert-container">
                {alerts.map((alert, idx) => (
                    <div 
                        key={alert.id}
                        className="cap-alert"
                        style={{ 
                            borderLeftColor: getAlertColor(alert),
                            animationDelay: `${idx * 0.1}s`
                        }}
                    >
                        <div className="cap-alert-header">
                            <span className="cap-alert-icon">{getAlertIcon(alert)}</span>
                            <span className="cap-alert-type">
                                {alert.type === 'roast' && alert.verdict === 'cap' && 'CAP DETECTED'}
                                {alert.type === 'roast' && alert.verdict === 'nocap' && 'RESPECT GIVEN'}
                                {alert.type === 'game' && 'GAME ALERT'}
                                {alert.type === 'rivalry' && 'NEW BEEF'}
                            </span>
                            <button 
                                className="cap-alert-dismiss"
                                onClick={() => dismissAlert(alert.id)}
                            >
                                ✕
                            </button>
                        </div>
                        
                        {alert.type === 'roast' && (
                            <div className="cap-alert-content">
                                <div className="cap-alert-handle">{alert.handle}</div>
                                <div className="cap-alert-reason">{alert.reason}</div>
                                <div className="cap-alert-quote">
                                    🎩 "{alert.mayorQuote}"
                                </div>
                            </div>
                        )}
                        
                        {alert.type === 'game' && (
                            <div className="cap-alert-content">
                                <div className="cap-alert-player">
                                    <strong>{alert.player}</strong> {alert.message}
                                </div>
                                <div className="cap-alert-score">
                                    Score: {alert.score} • Streak: {alert.streak}
                                </div>
                            </div>
                        )}
                        
                        {alert.type === 'rivalry' && (
                            <div className="cap-alert-content">
                                <div className="cap-alert-rivalry">
                                    {alert.message}
                                </div>
                            </div>
                        )}
                        
                        <div className="cap-alert-progress"></div>
                    </div>
                ))}
            </div>
        </>
    );
}

// ==================== CAP OR CHAD PERSONALITY QUIZ ====================

function CapOrChadQuiz({ playerName, onComplete }) {
    const [quizState, setQuizState] = useState('start'); // start, playing, result
    const [currentQuestion, setCurrentQuestion] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [result, setResult] = useState(null);
    const [showShare, setShowShare] = useState(false);
    
    const questions = [
        {
            id: 1,
            question: "Your portfolio is down 80%. What do you do?",
            options: [
                { text: "Diamond hands. This is just a dip.", score: { chad: 2, degen: 1 } },
                { text: "Sell everything and touch grass for 6 months", score: { rational: 2 } },
                { text: "Double down. Average down is the way.", score: { degen: 2, chad: 1 } },
                { text: "Post 'still early' on Twitter while crying", score: { cap: 2, degen: 1 } }
            ]
        },
        {
            id: 2,
            question: "Someone asks for your crypto advice. You say:",
            options: [
                { text: "DYOR. Not financial advice.", score: { rational: 2 } },
                { text: "Buy my bags please I'm begging you", score: { cap: 2, degen: 1 } },
                { text: "Here's a detailed analysis with charts and research", score: { chad: 2, rational: 1 } },
                { text: "ALL IN on whatever's pumping today", score: { degen: 3 } }
            ]
        },
        {
            id: 3,
            question: "What's in your Twitter bio?",
            options: [
                { text: "Just my name and maybe a project I work on", score: { chad: 2, rational: 1 } },
                { text: "IQ 180 | Serial Entrepreneur | Thought Leader", score: { cap: 3 } },
                { text: "🚀💎🙌 WAGMI | NFA | Crypto since 2021", score: { degen: 2 } },
                { text: "Nothing. I prefer anonymity.", score: { rational: 2, chad: 1 } }
            ]
        },
        {
            id: 4,
            question: "A new memecoin launches. Your move?",
            options: [
                { text: "Ape in first, research never", score: { degen: 3 } },
                { text: "Wait for others to lose money first", score: { rational: 2, chad: 1 } },
                { text: "Create a detailed thread about why it's a scam", score: { chad: 2, rational: 1 } },
                { text: "Buy, shill it, then dump on followers", score: { cap: 3 } }
            ]
        },
        {
            id: 5,
            question: "How do you handle being wrong about a trade?",
            options: [
                { text: "Delete the tweet. It never happened.", score: { cap: 3 } },
                { text: "Own it publicly and analyze what went wrong", score: { chad: 3 } },
                { text: "Blame market manipulation and whales", score: { cap: 2, degen: 1 } },
                { text: "Double down until I'm right", score: { degen: 2 } }
            ]
        },
        {
            id: 6,
            question: "Your friend wants to invest their life savings in crypto. You:",
            options: [
                { text: "Tell them to only invest what they can afford to lose", score: { rational: 2, chad: 1 } },
                { text: "Give them your referral code", score: { cap: 2, degen: 1 } },
                { text: "Share your exact portfolio breakdown", score: { degen: 2 } },
                { text: "Explain both the risks and opportunities honestly", score: { chad: 3 } }
            ]
        },
        {
            id: 7,
            question: "What time do you check crypto prices?",
            options: [
                { text: "Every 5 minutes including 3 AM", score: { degen: 3 } },
                { text: "Once a day, maybe", score: { rational: 2 } },
                { text: "Only when someone mentions it", score: { rational: 2, chad: 1 } },
                { text: "I have price alerts for everything", score: { degen: 2, rational: 1 } }
            ]
        },
        {
            id: 8,
            question: "Someone calls your favorite project a scam. You:",
            options: [
                { text: "Engage in a 47-tweet thread war", score: { degen: 2, cap: 1 } },
                { text: "Consider if they might have valid points", score: { chad: 2, rational: 1 } },
                { text: "Block them immediately", score: { cap: 2 } },
                { text: "Screenshot and post to your community for backup", score: { cap: 2, degen: 1 } }
            ]
        }
    ];
    
    const resultTypes = {
        chad: {
            title: "Sigma Chad Builder",
            emoji: "👑",
            color: "#ffd700",
            description: "You're the real deal. You build, you ship, you take accountability. No fake flexing, no need for validation. The space needs more people like you.",
            traits: ["Humble but confident", "Builds in public", "Owns mistakes", "Helps others"],
            mayorComment: "Now THIS is what credibility looks like! No IQ numbers, no fake exits, just pure VALUE. You're welcome in Degens City anytime, fren. 👑✅"
        },
        degen: {
            title: "Professional Degen",
            emoji: "🎰",
            color: "#ff6b6b",
            description: "You live for the thrill. Green candles are your oxygen, and you've diamond-handed through things that would make normal people cry. Respect... and concern.",
            traits: ["High risk tolerance", "Never sleeps", "Portfolio? You mean slot machine", "WAGMI energy"],
            mayorComment: "A true degen of culture! Your portfolio gives me anxiety but your conviction is unmatched. May your candles be green and your rugs be few. 🎰💎"
        },
        rational: {
            title: "Galaxy Brain Analyst",
            emoji: "🧠",
            color: "#00d4ff",
            description: "You actually do research. You understand risk management. You've never panic sold... because you never panic bought. Are you even having fun?",
            traits: ["DYOR master", "Risk management king", "Probably in profit", "Boring but effective"],
            mayorComment: "The rarest type in crypto - someone who actually thinks before acting! You probably have a spreadsheet for your spreadsheets. Respect the discipline. 🧠📊"
        },
        cap: {
            title: "Supreme Cap Detector (Ironic)",
            emoji: "🧢",
            color: "#8a2be2",
            description: "Plot twist: YOU might be the cap. Your answers suggest a certain... flexibility with authenticity. But hey, at least you're self-aware now!",
            traits: ["Creative with facts", "Influencer energy", "Bio longer than resume", "Deletes old takes"],
            mayorComment: "Ser... I hate to break it to you, but the cap was coming from INSIDE THE HOUSE this whole time. 😭🧢 But recognizing it is the first step to becoming based!"
        }
    };
    
    const startQuiz = () => {
        setQuizState('playing');
        setCurrentQuestion(0);
        setAnswers([]);
        setResult(null);
    };
    
    const selectAnswer = (option) => {
        const newAnswers = [...answers, option];
        setAnswers(newAnswers);
        
        if (currentQuestion < questions.length - 1) {
            setCurrentQuestion(currentQuestion + 1);
        } else {
            // Calculate result
            calculateResult(newAnswers);
        }
    };
    
    const calculateResult = (allAnswers) => {
        const scores = { chad: 0, degen: 0, rational: 0, cap: 0 };
        
        allAnswers.forEach(answer => {
            Object.entries(answer.score).forEach(([type, points]) => {
                scores[type] = (scores[type] || 0) + points;
            });
        });
        
        // Find highest score
        const maxType = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0];
        
        setResult({
            type: maxType,
            ...resultTypes[maxType],
            scores
        });
        setQuizState('result');
        
        // Save to localStorage
        localStorage.setItem('degen_personality_type', maxType);
        localStorage.setItem('degen_personality_scores', JSON.stringify(scores));
    };
    
    const shareResult = () => {
        const text = `${result.emoji} My Degens City personality type: ${result.title}!\n\n🎩 Mayor Satoshi says: "${result.mayorComment.substring(0, 100)}..."\n\nTake the quiz at degenscity.com 🧢`;
        shareToX(text);
    };
    
    return (
        <div className="cap-chad-quiz">
            <div 
                className="quiz-header"
                onClick={() => quizState === 'start' ? startQuiz() : null}
                style={{ cursor: quizState === 'start' ? 'pointer' : 'default' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🎭</span>
                    <span>Cap or Chad Quiz</span>
                    {localStorage.getItem('degen_personality_type') && quizState === 'start' && (
                        <span className="quiz-completed-badge">
                            {resultTypes[localStorage.getItem('degen_personality_type')]?.emoji} Done
                        </span>
                    )}
                </div>
                {quizState === 'start' && <span style={{ color: '#00ff88' }}>Take Quiz →</span>}
            </div>
            
            {quizState === 'playing' && (
                <div className="quiz-content">
                    <div className="quiz-progress">
                        <div 
                            className="quiz-progress-bar" 
                            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                        ></div>
                    </div>
                    <div className="quiz-question-count">
                        Question {currentQuestion + 1} of {questions.length}
                    </div>
                    
                    <div className="quiz-question">
                        {questions[currentQuestion].question}
                    </div>
                    
                    <div className="quiz-options">
                        {questions[currentQuestion].options.map((option, idx) => (
                            <button
                                key={idx}
                                className="quiz-option"
                                onClick={() => selectAnswer(option)}
                            >
                                {option.text}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {quizState === 'result' && result && (
                <div className="quiz-result">
                    <div 
                        className="result-type"
                        style={{ color: result.color }}
                    >
                        <span className="result-emoji">{result.emoji}</span>
                        <span className="result-title">{result.title}</span>
                    </div>
                    
                    <div className="result-description">
                        {result.description}
                    </div>
                    
                    <div className="result-traits">
                        {result.traits.map((trait, idx) => (
                            <span key={idx} className="trait-tag">{trait}</span>
                        ))}
                    </div>
                    
                    <div className="result-mayor-comment">
                        <span className="mayor-icon">🎩</span>
                        {result.mayorComment}
                    </div>
                    
                    <div className="result-scores">
                        <div className="score-bar">
                            <span className="score-label">👑 Chad</span>
                            <div className="score-track">
                                <div className="score-fill chad" style={{ width: `${(result.scores.chad / 12) * 100}%` }}></div>
                            </div>
                        </div>
                        <div className="score-bar">
                            <span className="score-label">🎰 Degen</span>
                            <div className="score-track">
                                <div className="score-fill degen" style={{ width: `${(result.scores.degen / 12) * 100}%` }}></div>
                            </div>
                        </div>
                        <div className="score-bar">
                            <span className="score-label">🧠 Rational</span>
                            <div className="score-track">
                                <div className="score-fill rational" style={{ width: `${(result.scores.rational / 12) * 100}%` }}></div>
                            </div>
                        </div>
                        <div className="score-bar">
                            <span className="score-label">🧢 Cap</span>
                            <div className="score-track">
                                <div className="score-fill cap" style={{ width: `${(result.scores.cap / 12) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="result-actions">
                        <button className="result-btn share" onClick={shareResult}>
                            📤 Share Result
                        </button>
                        <button className="result-btn retake" onClick={startQuiz}>
                            🔄 Retake Quiz
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== FLEX CARD GENERATOR ====================

function CapDetectiveBadges({ playerName }) {
    const [expanded, setExpanded] = useState(false);
    const [badgeData, setBadgeData] = useState(() => {
        const saved = localStorage.getItem('cap_detective_badges');
        return saved ? JSON.parse(saved) : {
            unlockedBadges: [],
            totalXP: 0,
            detectiveRank: 'Rookie'
        };
    });
    
    // Badge definitions
    const allBadges = [
        // Is This Cap? Badges
        { 
            id: 'first_cap', 
            name: 'First Cap Spotted', 
            description: 'Correctly identify your first fake bio',
            icon: '🔍', 
            category: 'cap_detection',
            xp: 50,
            requirement: () => parseInt(localStorage.getItem('is_this_cap_games') || '0') >= 1,
            rarity: 'common'
        },
        { 
            id: 'cap_streak_5', 
            name: 'BS Radar', 
            description: 'Get a 5-streak in Is This Cap?',
            icon: '📡', 
            category: 'cap_detection',
            xp: 100,
            requirement: () => parseInt(localStorage.getItem('is_this_cap_highscore') || '0') >= 500,
            rarity: 'uncommon'
        },
        { 
            id: 'cap_master', 
            name: 'Cap Master', 
            description: 'Score 2000+ in Is This Cap?',
            icon: '🧢', 
            category: 'cap_detection',
            xp: 250,
            requirement: () => parseInt(localStorage.getItem('is_this_cap_highscore') || '0') >= 2000,
            rarity: 'rare'
        },
        { 
            id: 'cap_legend', 
            name: 'Walking Lie Detector', 
            description: 'Score 5000+ in Is This Cap?',
            icon: '🎭', 
            category: 'cap_detection',
            xp: 500,
            requirement: () => parseInt(localStorage.getItem('is_this_cap_highscore') || '0') >= 5000,
            rarity: 'legendary'
        },
        
        // Typing Race Badges
        { 
            id: 'first_shill', 
            name: 'First Shill', 
            description: 'Complete your first Shill Typing Race',
            icon: '⌨️', 
            category: 'arcade',
            xp: 50,
            requirement: () => parseInt(localStorage.getItem('shill_race_games') || '0') >= 1,
            rarity: 'common'
        },
        { 
            id: 'speed_shiller', 
            name: 'Speed Shiller', 
            description: 'Score 1500+ in Shill Typing Race',
            icon: '💨', 
            category: 'arcade',
            xp: 150,
            requirement: () => parseInt(localStorage.getItem('shill_race_highscore') || '0') >= 1500,
            rarity: 'uncommon'
        },
        { 
            id: 'keyboard_warrior', 
            name: 'Keyboard Warrior', 
            description: 'Score 3000+ in Shill Typing Race',
            icon: '⚔️', 
            category: 'arcade',
            xp: 300,
            requirement: () => parseInt(localStorage.getItem('shill_race_highscore') || '0') >= 3000,
            rarity: 'rare'
        },
        
        // Whale Watcher Badges
        { 
            id: 'whale_spotter', 
            name: 'Whale Spotter', 
            description: 'Complete your first Whale Watcher game',
            icon: '🐋', 
            category: 'arcade',
            xp: 50,
            requirement: () => parseInt(localStorage.getItem('whale_watcher_games') || '0') >= 1,
            rarity: 'common'
        },
        { 
            id: 'whale_hunter', 
            name: 'Whale Hunter', 
            description: 'Score 1000+ in Whale Watcher',
            icon: '🎯', 
            category: 'arcade',
            xp: 200,
            requirement: () => parseInt(localStorage.getItem('whale_watcher_highscore') || '0') >= 1000,
            rarity: 'uncommon'
        },
        
        // Rug Pull Badges
        { 
            id: 'rug_survivor', 
            name: 'Rug Survivor', 
            description: 'Complete your first Rug Pull Reflex game',
            icon: '🧹', 
            category: 'arcade',
            xp: 50,
            requirement: () => parseInt(localStorage.getItem('rug_pull_games') || '0') >= 1,
            rarity: 'common'
        },
        { 
            id: 'paper_hands_pro', 
            name: 'Paper Hands Pro', 
            description: 'Score 2000+ in Rug Pull Reflex',
            icon: '📄', 
            category: 'arcade',
            xp: 200,
            requirement: () => parseInt(localStorage.getItem('rug_pull_highscore') || '0') >= 2000,
            rarity: 'uncommon'
        },
        { 
            id: 'reflex_god', 
            name: 'Reflex God', 
            description: 'Score 4000+ in Rug Pull Reflex',
            icon: '⚡', 
            category: 'arcade',
            xp: 400,
            requirement: () => parseInt(localStorage.getItem('rug_pull_highscore') || '0') >= 4000,
            rarity: 'rare'
        },
        
        // Personality & Roast Badges
        { 
            id: 'personality_revealed', 
            name: 'True Self Revealed', 
            description: 'Complete the Cap or Chad personality quiz',
            icon: '🪞', 
            category: 'social',
            xp: 75,
            requirement: () => localStorage.getItem('degen_personality_type') !== null,
            rarity: 'common'
        },
        { 
            id: 'sigma_chad', 
            name: 'Certified Sigma', 
            description: 'Get Sigma Chad result in personality quiz',
            icon: '👑', 
            category: 'social',
            xp: 150,
            requirement: () => localStorage.getItem('degen_personality_type') === 'chad',
            rarity: 'uncommon'
        },
        { 
            id: 'portfolio_roasted', 
            name: 'Thick Skin', 
            description: 'Get your portfolio roasted by Mayor',
            icon: '🔥', 
            category: 'social',
            xp: 75,
            requirement: () => localStorage.getItem('portfolio_roasted') === 'true',
            rarity: 'common'
        },
        { 
            id: 'flex_master', 
            name: 'Flex Master', 
            description: 'Create your first Flex Card',
            icon: '💪', 
            category: 'social',
            xp: 50,
            requirement: () => localStorage.getItem('flex_card_created') === 'true',
            rarity: 'common'
        },
        
        // Streak & Engagement Badges
        { 
            id: 'daily_voter', 
            name: 'Active Citizen', 
            description: 'Vote on Mayor approval rating',
            icon: '🗳️', 
            category: 'engagement',
            xp: 50,
            requirement: () => {
                const data = localStorage.getItem('mayor_approval_data');
                return data && JSON.parse(data).playerVote !== null;
            },
            rarity: 'common'
        },
        { 
            id: 'hot_take_reactor', 
            name: 'Hot Take Enjoyer', 
            description: 'React to 10 Hot Takes',
            icon: '🌶️', 
            category: 'engagement',
            xp: 100,
            requirement: () => {
                const reactions = localStorage.getItem('hot_takes_reactions');
                return reactions && Object.keys(JSON.parse(reactions)).length >= 10;
            },
            rarity: 'uncommon'
        },
        
        // Ultimate Badges
        { 
            id: 'arcade_regular', 
            name: 'Arcade Regular', 
            description: 'Play all 4 arcade games at least once',
            icon: '🎮', 
            category: 'ultimate',
            xp: 200,
            requirement: () => {
                return parseInt(localStorage.getItem('is_this_cap_games') || '0') >= 1 &&
                       parseInt(localStorage.getItem('shill_race_games') || '0') >= 1 &&
                       parseInt(localStorage.getItem('whale_watcher_games') || '0') >= 1 &&
                       parseInt(localStorage.getItem('rug_pull_games') || '0') >= 1;
            },
            rarity: 'rare'
        },
        { 
            id: 'ultimate_detective', 
            name: 'Ultimate Detective', 
            description: 'Unlock 15 badges',
            icon: '🏆', 
            category: 'ultimate',
            xp: 1000,
            requirement: () => false, // Checked separately
            rarity: 'legendary'
        },
    ];
    
    // Check for newly unlocked badges
    useEffect(() => {
        const checkBadges = () => {
            let updated = false;
            let newUnlocked = [...badgeData.unlockedBadges];
            let totalXP = badgeData.totalXP;
            
            allBadges.forEach(badge => {
                if (!newUnlocked.includes(badge.id)) {
                    // Special case for ultimate_detective
                    if (badge.id === 'ultimate_detective') {
                        if (newUnlocked.length >= 15) {
                            newUnlocked.push(badge.id);
                            totalXP += badge.xp;
                            updated = true;
                        }
                    } else if (badge.requirement()) {
                        newUnlocked.push(badge.id);
                        totalXP += badge.xp;
                        updated = true;
                    }
                }
            });
            
            if (updated) {
                const newRank = getDetectiveRank(totalXP);
                const newData = { 
                    unlockedBadges: newUnlocked, 
                    totalXP, 
                    detectiveRank: newRank 
                };
                setBadgeData(newData);
                localStorage.setItem('cap_detective_badges', JSON.stringify(newData));
            }
        };
        
        checkBadges();
        const interval = setInterval(checkBadges, 5000);
        return () => clearInterval(interval);
    }, [badgeData]);
    
    const getDetectiveRank = (xp) => {
        if (xp >= 3000) return 'Legendary Detective';
        if (xp >= 2000) return 'Master Detective';
        if (xp >= 1000) return 'Senior Detective';
        if (xp >= 500) return 'Detective';
        if (xp >= 200) return 'Junior Detective';
        return 'Rookie';
    };
    
    const getRarityColor = (rarity) => {
        switch(rarity) {
            case 'common': return '#aaaaaa';
            case 'uncommon': return '#00ff88';
            case 'rare': return '#00d4ff';
            case 'legendary': return '#ffd700';
            default: return '#888';
        }
    };
    
    const categories = [
        { id: 'cap_detection', name: '🧢 Cap Detection', color: '#ff6b6b' },
        { id: 'arcade', name: '🎮 Arcade', color: '#00d4ff' },
        { id: 'social', name: '👥 Social', color: '#ffd700' },
        { id: 'engagement', name: '⭐ Engagement', color: '#00ff88' },
        { id: 'ultimate', name: '🏆 Ultimate', color: '#8a2be2' },
    ];
    
    const unlockedCount = badgeData.unlockedBadges.length;
    const totalCount = allBadges.length;
    const progressPercent = (unlockedCount / totalCount) * 100;
    
    return (
        <div className="cap-badges">
            <div 
                className="badges-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🏅</span>
                    <span>Cap Detective Badges</span>
                    <span className="badges-count">{unlockedCount}/{totalCount}</span>
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="badges-content">
                    {/* Rank & XP Display */}
                    <div className="badges-rank-display">
                        <div className="rank-info">
                            <div className="rank-title">{badgeData.detectiveRank}</div>
                            <div className="rank-xp">{badgeData.totalXP} XP</div>
                        </div>
                        <div className="rank-progress">
                            <div className="progress-bar">
                                <div 
                                    className="progress-fill"
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                            <div className="progress-text">{unlockedCount}/{totalCount} badges unlocked</div>
                        </div>
                    </div>
                    
                    {/* Badge Categories */}
                    {categories.map(category => {
                        const categoryBadges = allBadges.filter(b => b.category === category.id);
                        const unlockedInCategory = categoryBadges.filter(b => badgeData.unlockedBadges.includes(b.id)).length;
                        
                        return (
                            <div key={category.id} className="badge-category">
                                <div className="category-header" style={{ borderLeftColor: category.color }}>
                                    <span>{category.name}</span>
                                    <span className="category-count">{unlockedInCategory}/{categoryBadges.length}</span>
                                </div>
                                <div className="badges-grid">
                                    {categoryBadges.map(badge => {
                                        const isUnlocked = badgeData.unlockedBadges.includes(badge.id);
                                        return (
                                            <div 
                                                key={badge.id}
                                                className={`badge-item ${isUnlocked ? 'unlocked' : 'locked'}`}
                                                style={{ 
                                                    borderColor: isUnlocked ? getRarityColor(badge.rarity) : 'transparent'
                                                }}
                                            >
                                                <div className="badge-icon">
                                                    {isUnlocked ? badge.icon : '🔒'}
                                                </div>
                                                <div className="badge-info">
                                                    <div className="badge-name">{badge.name}</div>
                                                    <div className="badge-desc">{badge.description}</div>
                                                    <div 
                                                        className="badge-rarity"
                                                        style={{ color: getRarityColor(badge.rarity) }}
                                                    >
                                                        {badge.rarity} • +{badge.xp} XP
                                                    </div>
                                                </div>
                                                {isUnlocked && (
                                                    <div className="badge-check">✓</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                    
                    {/* Tips */}
                    <div className="badges-tips">
                        💡 Play games and use features to unlock badges and earn XP!
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== MAYOR ACTION COMMENTS ====================

function FlexCardGenerator({ character, playerStats, resources }) {
    const [showModal, setShowModal] = useState(false);
    const [cardStyle, setCardStyle] = useState('classic');
    const [generating, setGenerating] = useState(false);
    const [generatedCard, setGeneratedCard] = useState(null);
    const canvasRef = useRef(null);
    
    const cardStyles = [
        { id: 'classic', name: 'Classic', bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', accent: '#00ff88' },
        { id: 'fire', name: 'Fire', bg: 'linear-gradient(135deg, #1a0a0a 0%, #2d1515 100%)', accent: '#ff6b6b' },
        { id: 'gold', name: 'Gold', bg: 'linear-gradient(135deg, #1a1708 0%, #2d2810 100%)', accent: '#ffd700' },
        { id: 'purple', name: 'Purple', bg: 'linear-gradient(135deg, #150a1a 0%, #1f1029 100%)', accent: '#8a2be2' },
        { id: 'cyber', name: 'Cyber', bg: 'linear-gradient(135deg, #0a1a1a 0%, #0d2d2d 100%)', accent: '#00d4ff' },
    ];
    
    const getPersonalityType = () => {
        const saved = localStorage.getItem('degen_personality_type');
        const types = {
            chad: { emoji: '👑', title: 'Sigma Chad' },
            degen: { emoji: '🎰', title: 'Pro Degen' },
            rational: { emoji: '🧠', title: 'Galaxy Brain' },
            cap: { emoji: '🧢', title: 'Cap Detector' }
        };
        return types[saved] || { emoji: '🎮', title: 'Citizen' };
    };
    
    const getCapScore = () => {
        return parseInt(localStorage.getItem('is_this_cap_highscore') || '0');
    };
    
    const getTitle = () => {
        const level = playerStats?.level || 1;
        if (level >= 50) return 'Legendary Degen';
        if (level >= 30) return 'Master Trader';
        if (level >= 20) return 'Diamond Hands';
        if (level >= 10) return 'Rising Ape';
        if (level >= 5) return 'Rookie Degen';
        return 'Fresh Citizen';
    };
    
    const stats = [
        { label: 'Level', value: playerStats?.level || 1, icon: '⭐' },
        { label: 'XP', value: (playerStats?.xp || 0).toLocaleString(), icon: '✨' },
        { label: 'HOPIUM', value: (resources?.hopium || 0).toLocaleString(), icon: '💊' },
        { label: 'ALPHA', value: (resources?.alpha || 0).toLocaleString(), icon: '🔮' },
        { label: 'Cap Score', value: getCapScore(), icon: '🧢' },
        { label: 'Votes', value: playerStats?.totalVotes || 0, icon: '🗳️' },
    ];
    
    const generateCard = async () => {
        setGenerating(true);
        
        // Create card data for display
        const style = cardStyles.find(s => s.id === cardStyle);
        const personality = getPersonalityType();
        
        setGeneratedCard({
            style,
            character,
            title: getTitle(),
            personality,
            stats: stats.slice(0, 6),
            timestamp: new Date().toLocaleDateString()
        });
        
        setGenerating(false);
    };
    
    const shareFlexCard = () => {
        const personality = getPersonalityType();
        const text = `🏛️ My Degens City Flex Card

${personality.emoji} ${getTitle()}
⭐ Level ${playerStats?.level || 1}
💊 ${(resources?.hopium || 0).toLocaleString()} HOPIUM
🧢 Cap Score: ${getCapScore()}

${personality.emoji} Type: ${personality.title}

Think you can beat my stats? 👀
Play at degenscity.com

#DegensCity #CryptoGaming`;
        
        shareToX(text);
    };
    
    const currentStyle = cardStyles.find(s => s.id === cardStyle);
    const personality = getPersonalityType();
    
    return (
        <>
            <button 
                className="flex-card-btn"
                onClick={() => setShowModal(true)}
            >
                💪 Create Flex Card
            </button>
            
            {showModal && (
                <div className="flex-card-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="flex-card-modal">
                        <button className="flex-card-close" onClick={() => setShowModal(false)}>✕</button>
                        
                        <h2 style={{ color: '#ffd700', marginBottom: '5px', textAlign: 'center' }}>💪 Flex Card Generator</h2>
                        <p style={{ color: '#888', fontSize: '0.85em', textAlign: 'center', marginBottom: '20px' }}>
                            Show off your stats to the world!
                        </p>
                        
                        {/* Style Selector */}
                        <div className="flex-card-styles">
                            {cardStyles.map(style => (
                                <button
                                    key={style.id}
                                    className={`style-btn ${cardStyle === style.id ? 'active' : ''}`}
                                    onClick={() => setCardStyle(style.id)}
                                    style={{ 
                                        background: style.bg,
                                        borderColor: cardStyle === style.id ? style.accent : 'transparent'
                                    }}
                                >
                                    <span style={{ color: style.accent }}>●</span>
                                    <span>{style.name}</span>
                                </button>
                            ))}
                        </div>
                        
                        {/* Card Preview */}
                        <div 
                            className="flex-card-preview"
                            style={{ background: currentStyle.bg }}
                        >
                            <div className="flex-card-border" style={{ borderColor: currentStyle.accent }}></div>
                            
                            <div className="flex-card-header">
                                <div className="flex-card-avatar" style={{ borderColor: currentStyle.accent }}>
                                    {character?.avatar?.image ? (
                                        <img src={character.avatar.image} alt="" />
                                    ) : (
                                        <span>🎮</span>
                                    )}
                                </div>
                                <div className="flex-card-identity">
                                    <div className="flex-card-name" style={{ color: currentStyle.accent }}>
                                        {character?.name || 'Anonymous'}
                                    </div>
                                    <div className="flex-card-title">{getTitle()}</div>
                                    <div className="flex-card-personality">
                                        {personality.emoji} {personality.title}
                                    </div>
                                </div>
                                <div className="flex-card-logo">🏛️</div>
                            </div>
                            
                            <div className="flex-card-stats">
                                {stats.map((stat, idx) => (
                                    <div key={idx} className="flex-card-stat">
                                        <span className="stat-icon">{stat.icon}</span>
                                        <span className="stat-value" style={{ color: currentStyle.accent }}>{stat.value}</span>
                                        <span className="stat-label">{stat.label}</span>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="flex-card-footer">
                                <span>degenscity.com</span>
                                <span style={{ color: currentStyle.accent }}>●</span>
                                <span>{new Date().toLocaleDateString()}</span>
                            </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex-card-actions">
                            <button className="flex-action-btn share" onClick={shareFlexCard}>
                                📤 Share on X
                            </button>
                            <button className="flex-action-btn copy" onClick={() => {
                                navigator.clipboard.writeText(`🏛️ Check out my Degens City stats!\n⭐ Level ${playerStats?.level || 1} | 💊 ${resources?.hopium || 0} HOPIUM | 🧢 Cap Score: ${getCapScore()}\nPlay at degenscity.com`);
                                alert('Stats copied to clipboard!');
                            }}>
                                📋 Copy Stats
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ==================== SHILL TYPING RACE ====================

function CTFeed({ playerName }) {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all'); // all, bullish, bearish
    
    // Fetch real crypto news from CryptoPanic RSS via RSS2JSON (bypasses CORS)
    const fetchNews = async () => {
        setLoading(true);
        try {
            // Use RSS2JSON to fetch CryptoPanic RSS feed (free, no CORS issues)
            const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://cryptopanic.com/news/rss/');
            
            if (!response.ok) {
                throw new Error('Failed to fetch news');
            }
            
            const data = await response.json();
            
            if (data.status === 'ok' && data.items) {
                const formattedNews = data.items.slice(0, 15).map((item, index) => {
                    // Determine sentiment from title keywords
                    const title = item.title.toLowerCase();
                    let sentiment = 'neutral';
                    const bullishWords = ['surge', 'jump', 'soar', 'rally', 'gain', 'bull', 'high', 'up', 'rise', 'pump', 'moon', 'ath', 'record', 'boost', 'growth'];
                    const bearishWords = ['crash', 'drop', 'fall', 'plunge', 'dump', 'bear', 'low', 'down', 'sell', 'fear', 'warn', 'risk', 'decline', 'loss'];
                    
                    if (bullishWords.some(word => title.includes(word))) sentiment = 'bullish';
                    else if (bearishWords.some(word => title.includes(word))) sentiment = 'bearish';
                    
                    // Extract crypto tickers from title
                    const cryptoRegex = /\b(BTC|ETH|SOL|XRP|DOGE|SHIB|PEPE|ADA|AVAX|DOT|MATIC|LINK|UNI|AAVE|BNB|LTC|ATOM)\b/gi;
                    const matches = item.title.match(cryptoRegex) || [];
                    const currencies = [...new Set(matches.map(m => ({ code: m.toUpperCase() })))];
                    
                    return {
                        id: index + Date.now(),
                        title: item.title,
                        url: item.link,
                        source: item.author || 'CryptoPanic',
                        published: new Date(item.pubDate),
                        sentiment: sentiment,
                        votes: {
                            positive: Math.floor(Math.random() * 50) + 10,
                            negative: Math.floor(Math.random() * 20) + 5,
                            important: Math.floor(Math.random() * 15)
                        },
                        currencies: currencies
                    };
                });
                setNews(formattedNews);
                setError(null);
            } else {
                throw new Error('Invalid response');
            }
        } catch (err) {
            console.error('Error fetching news:', err);
            // Try backup: CoinGecko news via RSS2JSON
            try {
                const backupResponse = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://cointelegraph.com/rss');
                const backupData = await backupResponse.json();
                
                if (backupData.status === 'ok' && backupData.items) {
                    const formattedNews = backupData.items.slice(0, 12).map((item, index) => {
                        const title = item.title.toLowerCase();
                        let sentiment = 'neutral';
                        if (['surge', 'jump', 'rally', 'gain', 'bull', 'rise', 'pump'].some(w => title.includes(w))) sentiment = 'bullish';
                        else if (['crash', 'drop', 'fall', 'dump', 'bear', 'sell', 'fear'].some(w => title.includes(w))) sentiment = 'bearish';
                        
                        return {
                            id: index + Date.now(),
                            title: item.title,
                            url: item.link,
                            source: 'CoinTelegraph',
                            published: new Date(item.pubDate),
                            sentiment: sentiment,
                            votes: { positive: Math.floor(Math.random() * 40) + 10, negative: Math.floor(Math.random() * 15) + 5, important: Math.floor(Math.random() * 10) },
                            currencies: []
                        };
                    });
                    setNews(formattedNews);
                    setError(null);
                } else {
                    setNews(getFallbackNews());
                }
            } catch {
                setNews(getFallbackNews());
            }
        }
        setLoading(false);
    };
    
    // Fallback news if API fails
    const getFallbackNews = () => [
        { id: 1, title: 'Bitcoin Shows Strength Above Key Support Level', source: 'CoinDesk', published: new Date(Date.now() - 3600000), sentiment: 'bullish', votes: { positive: 45, negative: 12, important: 8 }, currencies: [{ code: 'BTC' }] },
        { id: 2, title: 'Ethereum Layer 2 TVL Reaches New All-Time High', source: 'The Block', published: new Date(Date.now() - 7200000), sentiment: 'bullish', votes: { positive: 38, negative: 5, important: 15 }, currencies: [{ code: 'ETH' }] },
        { id: 3, title: 'SEC Delays Decision on Spot ETF Application', source: 'Bloomberg', published: new Date(Date.now() - 10800000), sentiment: 'bearish', votes: { positive: 10, negative: 52, important: 20 }, currencies: [] },
        { id: 4, title: 'Solana DeFi Ecosystem Sees Surge in Activity', source: 'Decrypt', published: new Date(Date.now() - 14400000), sentiment: 'bullish', votes: { positive: 29, negative: 8, important: 5 }, currencies: [{ code: 'SOL' }] },
        { id: 5, title: 'Major Exchange Reports Record Trading Volume', source: 'CryptoSlate', published: new Date(Date.now() - 18000000), sentiment: 'neutral', votes: { positive: 22, negative: 18, important: 12 }, currencies: [] },
        { id: 6, title: 'New Memecoin Gains 500% in 24 Hours', source: 'CoinTelegraph', published: new Date(Date.now() - 21600000), sentiment: 'bullish', votes: { positive: 55, negative: 30, important: 3 }, currencies: [] },
        { id: 7, title: 'Whale Moves $500M in Bitcoin to Unknown Wallet', source: 'Whale Alert', published: new Date(Date.now() - 25200000), sentiment: 'neutral', votes: { positive: 15, negative: 20, important: 25 }, currencies: [{ code: 'BTC' }] },
        { id: 8, title: 'Fed Officials Signal Cautious Approach on Rates', source: 'Reuters', published: new Date(Date.now() - 28800000), sentiment: 'bearish', votes: { positive: 8, negative: 35, important: 18 }, currencies: [] }
    ];
    
    useEffect(() => {
        fetchNews();
        // Refresh news every 5 minutes
        const interval = setInterval(fetchNews, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);
    
    const filteredNews = filter === 'all' ? news : news.filter(n => n.sentiment === filter);
    
    return (
        <div className="ct-feed">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        📰 Crypto News
                        <span style={{ fontSize: '0.5em', color: '#00ff88', background: 'rgba(0,255,136,0.2)', padding: '3px 8px', borderRadius: '10px' }}>LIVE</span>
                    </h2>
                    <p style={{ color: '#666', fontSize: '0.8em', margin: '5px 0 0 0' }}>
                        Real-time headlines from CryptoPanic
                    </p>
                </div>
                <button 
                    onClick={fetchNews}
                    style={{
                        background: 'rgba(0,255,136,0.2)',
                        border: '1px solid #00ff88',
                        color: '#00ff88',
                        padding: '8px 15px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.85em'
                    }}
                >
                    🔄 Refresh
                </button>
            </div>
            
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                {['all', 'bullish', 'bearish'].map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            background: filter === f ? 
                                (f === 'bullish' ? 'rgba(0,255,136,0.3)' : f === 'bearish' ? 'rgba(255,68,68,0.3)' : 'rgba(255,255,255,0.1)') : 
                                'transparent',
                            border: `1px solid ${filter === f ? (f === 'bullish' ? '#00ff88' : f === 'bearish' ? '#ff4444' : '#666') : '#444'}`,
                            color: filter === f ? (f === 'bullish' ? '#00ff88' : f === 'bearish' ? '#ff4444' : '#fff') : '#888',
                            padding: '6px 15px',
                            borderRadius: '15px',
                            cursor: 'pointer',
                            fontSize: '0.85em',
                            textTransform: 'capitalize'
                        }}
                    >
                        {f === 'bullish' ? '🟢 ' : f === 'bearish' ? '🔴 ' : ''}{f}
                    </button>
                ))}
            </div>
            
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        <div style={{ fontSize: '2em', marginBottom: '10px' }}>📡</div>
                        Loading live news...
                    </div>
                ) : filteredNews.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        No {filter} news at the moment
                    </div>
                ) : (
                    filteredNews.map(item => (
                        <a 
                            key={item.id} 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                        >
                            <div className={`ct-post ${item.sentiment}`} style={{ cursor: 'pointer' }}>
                                <div className="ct-author">
                                    <div className="ct-avatar" style={{ 
                                        fontSize: '1.2em',
                                        background: item.sentiment === 'bullish' ? 'rgba(0,255,136,0.2)' : 
                                                   item.sentiment === 'bearish' ? 'rgba(255,68,68,0.2)' : 'rgba(100,100,100,0.2)'
                                    }}>
                                        {item.sentiment === 'bullish' ? '📈' : item.sentiment === 'bearish' ? '📉' : '📊'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div className="ct-handle">{item.source}</div>
                                        <div className="ct-time">{getTimeAgo(item.published)}</div>
                                    </div>
                                    {item.currencies.length > 0 && (
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            {item.currencies.slice(0, 3).map(c => (
                                                <span key={c.code} style={{
                                                    background: 'rgba(255,215,0,0.2)',
                                                    color: '#ffd700',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    fontSize: '0.75em',
                                                    fontWeight: 'bold'
                                                }}>
                                                    ${c.code}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="ct-content" style={{ color: '#fff' }}>{item.title}</div>
                                <div className="ct-engagement">
                                    <span style={{ color: '#00ff88' }}>👍 {item.votes.positive}</span>
                                    <span style={{ color: '#ff4444' }}>👎 {item.votes.negative}</span>
                                    <span style={{ color: '#ffd700' }}>⭐ {item.votes.important}</span>
                                    <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.8em' }}>Click to read →</span>
                                </div>
                            </div>
                        </a>
                    ))
                )}
            </div>
            
            <div style={{ 
                marginTop: '15px', 
                padding: '10px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '8px',
                textAlign: 'center',
                fontSize: '0.75em',
                color: '#666'
            }}>
                Powered by CryptoPanic • News updates every 5 minutes
            </div>
        </div>
    );
}

// ==================== LEVERAGE TRADING ====================

function CitizenActions({ playerName, showToast }) {
    const [activeTab, setActiveTab] = useState('sue'); // sue, law, status
    const [target, setTarget] = useState('');
    const [targetType, setTargetType] = useState('celebrity');
    const [reason, setReason] = useState('');
    const [damages, setDamages] = useState(69420);
    const [lawTitle, setLawTitle] = useState('');
    const [lawDescription, setLawDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [recentActions, setRecentActions] = useState([]);
    const [playerStatus, setPlayerStatus] = useState({ isJailed: false, jailUntil: null, lawsuitsAgainst: 0 });
    
    // Fetch player status and recent actions
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/player/legal-status/${encodeURIComponent(playerName)}`);
                const data = await res.json();
                if (data.success) {
                    setPlayerStatus(data.status);
                    setRecentActions(data.recentActions || []);
                }
            } catch (e) { console.log('Could not fetch legal status'); }
        };
        if (playerName && playerName !== 'Guest') fetchStatus();
    }, [playerName]);
    
    const fileLawsuit = async () => {
        if (!target.trim() || !reason.trim()) {
            showToast('Please fill in target and reason!', 'error');
            return;
        }
        if (playerStatus.isJailed) {
            showToast('You cannot sue while in jail! 🔒', 'error');
            return;
        }
        
        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/api/player/sue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName,
                    targetName: target,
                    targetType,
                    complaint: reason,
                    damagesRequested: damages
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`⚖️ Lawsuit filed against ${target}! Case #${data.caseNumber}`, 'success');
                setTarget('');
                setReason('');
                // Refresh status
                const statusRes = await fetch(`${API_BASE}/api/player/legal-status/${encodeURIComponent(playerName)}`);
                const statusData = await statusRes.json();
                if (statusData.success) setRecentActions(statusData.recentActions || []);
            } else {
                showToast(data.error || 'Failed to file lawsuit', 'error');
            }
        } catch (e) {
            showToast('Failed to file lawsuit', 'error');
        }
        setSubmitting(false);
    };
    
    const proposeLaw = async () => {
        if (!lawTitle.trim() || !lawDescription.trim()) {
            showToast('Please fill in law title and description!', 'error');
            return;
        }
        if (playerStatus.isJailed) {
            showToast('You cannot propose laws while in jail! 🔒', 'error');
            return;
        }
        
        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE}/api/player/propose-law`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName,
                    lawTitle,
                    lawDescription
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast(`📜 Law proposed: "${lawTitle}"! Citizens will vote.`, 'success');
                setLawTitle('');
                setLawDescription('');
            } else {
                showToast(data.error || 'Failed to propose law', 'error');
            }
        } catch (e) {
            showToast('Failed to propose law', 'error');
        }
        setSubmitting(false);
    };
    
    // Calculate jail time remaining
    const jailTimeRemaining = playerStatus.jailUntil ? Math.max(0, new Date(playerStatus.jailUntil) - new Date()) : 0;
    const jailMinutes = Math.ceil(jailTimeRemaining / 60000);
    
    return (
        <div className="card" style={{ marginTop: '20px' }}>
            <h2 style={{ color: '#ff6b6b', marginBottom: '15px' }}>⚖️ Citizen Actions</h2>
            
            {/* Jail Status Banner */}
            {playerStatus.isJailed && jailTimeRemaining > 0 && (
                <div style={{ 
                    background: 'linear-gradient(135deg, #ff4444, #cc0000)', 
                    padding: '15px', 
                    borderRadius: '12px', 
                    marginBottom: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '2em', marginBottom: '5px' }}>⛓️🔒⛓️</div>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1em' }}>YOU ARE IN DEGEN JAIL!</div>
                    <div style={{ color: '#ffcccc', fontSize: '0.9em', marginTop: '5px' }}>
                        Time remaining: {jailMinutes} minute{jailMinutes !== 1 ? 's' : ''}
                    </div>
                    <div style={{ color: '#ffaaaa', fontSize: '0.8em', marginTop: '5px' }}>
                        You cannot sue or propose laws while jailed.
                    </div>
                </div>
            )}
            
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                    { id: 'sue', label: '⚖️ File Lawsuit', color: '#ff6b6b' },
                    { id: 'law', label: '📜 Propose Law', color: '#ffd700' },
                    { id: 'status', label: '📋 My Legal Status', color: '#4ecdc4' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 18px',
                            borderRadius: '20px',
                            border: activeTab === tab.id ? `2px solid ${tab.color}` : '1px solid #333',
                            background: activeTab === tab.id ? `${tab.color}22` : 'rgba(255,255,255,0.03)',
                            color: activeTab === tab.id ? tab.color : '#888',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            fontSize: '0.9em'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            
            {/* Sue Tab */}
            {activeTab === 'sue' && (
                <div>
                    <p style={{ color: '#888', marginBottom: '15px', fontSize: '0.9em' }}>
                        File a lawsuit against NPCs, celebrities, or other players! Your case will be announced in the city.
                    </p>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Target Type</label>
                        <select 
                            value={targetType} 
                            onChange={(e) => setTargetType(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#fff',
                                fontSize: '0.95em'
                            }}
                        >
                            <option value="celebrity">🌟 Celebrity / KOL</option>
                            <option value="npc">🤖 NPC Citizen</option>
                            <option value="player">👤 Real Player</option>
                            <option value="user_agent">🤖 User Agent</option>
                        </select>
                    </div>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Who are you suing?</label>
                        <input 
                            type="text"
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            placeholder="e.g., Vitalik Buterin, Gary Gensler, alpha_hunter..."
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#fff',
                                fontSize: '0.95em'
                            }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Reason / Complaint</label>
                        <textarea 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Made me buy the top and now I'm down 90%..."
                            rows={3}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#fff',
                                fontSize: '0.95em',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Damages Requested ($)</label>
                        <input 
                            type="number"
                            value={damages}
                            onChange={(e) => setDamages(parseInt(e.target.value) || 0)}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#ffd700',
                                fontSize: '0.95em'
                            }}
                        />
                        <div style={{ color: '#666', fontSize: '0.8em', marginTop: '5px' }}>
                            Popular amounts: $69,420 | $420,069 | $1,000,000
                        </div>
                    </div>
                    
                    <button
                        onClick={fileLawsuit}
                        disabled={submitting || (playerStatus.isJailed && jailTimeRemaining > 0)}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '12px',
                            border: 'none',
                            background: (submitting || playerStatus.isJailed) ? '#444' : 'linear-gradient(135deg, #ff6b6b, #ff4444)',
                            color: '#fff',
                            fontSize: '1em',
                            fontWeight: 'bold',
                            cursor: (submitting || playerStatus.isJailed) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {submitting ? '📝 Filing...' : '⚖️ FILE LAWSUIT'}
                    </button>
                </div>
            )}
            
            {/* Propose Law Tab */}
            {activeTab === 'law' && (
                <div>
                    <p style={{ color: '#888', marginBottom: '15px', fontSize: '0.9em' }}>
                        Propose a new law for Degens City! Citizens and AI agents will vote on it.
                    </p>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Law Title</label>
                        <input 
                            type="text"
                            value={lawTitle}
                            onChange={(e) => setLawTitle(e.target.value)}
                            placeholder="e.g., Ban Paper Hands Act"
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#fff',
                                fontSize: '0.95em'
                            }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ color: '#aaa', fontSize: '0.85em', display: 'block', marginBottom: '5px' }}>Law Description</label>
                        <textarea 
                            value={lawDescription}
                            onChange={(e) => setLawDescription(e.target.value)}
                            placeholder="e.g., Anyone who sells within 24 hours of buying must pay a 50% paper hands tax..."
                            rows={4}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #333',
                                background: '#1a1a2e',
                                color: '#fff',
                                fontSize: '0.95em',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                    
                    <div style={{ background: 'rgba(255,215,0,0.1)', padding: '12px', borderRadius: '8px', marginBottom: '20px', borderLeft: '3px solid #ffd700' }}>
                        <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '5px' }}>💡 Law Ideas:</div>
                        <div style={{ color: '#888', fontSize: '0.85em', lineHeight: '1.6' }}>
                            • "Mandatory Diamond Hands" - No selling for 48 hours<br/>
                            • "FUD Prevention Act" - Spreading FUD = jail time<br/>
                            • "Degen Tax" - 10% of all gains go to the city treasury<br/>
                            • "Leverage Limit" - Max 100x leverage allowed
                        </div>
                    </div>
                    
                    <button
                        onClick={proposeLaw}
                        disabled={submitting || (playerStatus.isJailed && jailTimeRemaining > 0)}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '12px',
                            border: 'none',
                            background: (submitting || playerStatus.isJailed) ? '#444' : 'linear-gradient(135deg, #ffd700, #ff8800)',
                            color: '#000',
                            fontSize: '1em',
                            fontWeight: 'bold',
                            cursor: (submitting || playerStatus.isJailed) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {submitting ? '📝 Submitting...' : '📜 PROPOSE LAW'}
                    </button>
                </div>
            )}
            
            {/* Status Tab */}
            {activeTab === 'status' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ background: 'rgba(255,107,107,0.1)', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.8em', marginBottom: '5px' }}>⚖️</div>
                            <div style={{ color: '#ff6b6b', fontSize: '1.5em', fontWeight: 'bold' }}>{playerStatus.lawsuitsFiled || 0}</div>
                            <div style={{ color: '#888', fontSize: '0.8em' }}>Lawsuits Filed</div>
                        </div>
                        <div style={{ background: 'rgba(78,205,196,0.1)', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.8em', marginBottom: '5px' }}>📜</div>
                            <div style={{ color: '#4ecdc4', fontSize: '1.5em', fontWeight: 'bold' }}>{playerStatus.lawsProposed || 0}</div>
                            <div style={{ color: '#888', fontSize: '0.8em' }}>Laws Proposed</div>
                        </div>
                        <div style={{ background: 'rgba(255,68,68,0.1)', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.8em', marginBottom: '5px' }}>🎯</div>
                            <div style={{ color: '#ff4444', fontSize: '1.5em', fontWeight: 'bold' }}>{playerStatus.lawsuitsAgainst || 0}</div>
                            <div style={{ color: '#888', fontSize: '0.8em' }}>Sued By Others</div>
                        </div>
                        <div style={{ background: playerStatus.isJailed ? 'rgba(255,68,68,0.2)' : 'rgba(0,255,136,0.1)', padding: '15px', borderRadius: '12px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.8em', marginBottom: '5px' }}>{playerStatus.isJailed && jailTimeRemaining > 0 ? '⛓️' : '✅'}</div>
                            <div style={{ color: playerStatus.isJailed && jailTimeRemaining > 0 ? '#ff4444' : '#00ff88', fontSize: '1em', fontWeight: 'bold' }}>
                                {playerStatus.isJailed && jailTimeRemaining > 0 ? 'IN JAIL' : 'FREE'}
                            </div>
                            <div style={{ color: '#888', fontSize: '0.8em' }}>Status</div>
                        </div>
                    </div>
                    
                    {/* Recent Legal Activity */}
                    <h4 style={{ color: '#aaa', marginBottom: '10px' }}>📋 Recent Legal Activity</h4>
                    {recentActions.length === 0 ? (
                        <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                            No legal activity yet. File a lawsuit or propose a law!
                        </div>
                    ) : (
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {recentActions.map((action, i) => (
                                <div key={i} style={{ 
                                    background: 'rgba(255,255,255,0.03)', 
                                    padding: '12px', 
                                    borderRadius: '8px', 
                                    marginBottom: '8px',
                                    borderLeft: `3px solid ${action.type === 'lawsuit' ? '#ff6b6b' : '#ffd700'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: action.type === 'lawsuit' ? '#ff6b6b' : '#ffd700', fontWeight: 'bold' }}>
                                            {action.type === 'lawsuit' ? '⚖️ Lawsuit' : '📜 Law Proposed'}
                                        </span>
                                        <span style={{ color: '#555', fontSize: '0.8em' }}>{action.timeAgo || 'recently'}</span>
                                    </div>
                                    <div style={{ color: '#ccc', fontSize: '0.9em', marginTop: '5px' }}>{action.description}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== WHALE WATCHER GAME ====================

