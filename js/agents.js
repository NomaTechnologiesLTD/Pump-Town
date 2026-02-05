// ====================================================
// agents.js — AI Agent pages
// Degens City - Auto-extracted from index.html
// ====================================================

function MyAgentPage({ email, playerName }) {
    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [activity, setActivity] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [levelInfo, setLevelInfo] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    
    // Form state for creation
    const [formData, setFormData] = useState({
        name: '',
        avatar: 'pepe',
        bio: '',
        catchphrase: '',
        aggression: 5,
        humor: 5,
        risk_tolerance: 5,
        loyalty: 5,
        chaos: 5,
        archetype: 'degen',
        goals: [],
        interests: []
    });
    
    const levelTitles = {
        1: 'Newcomer', 2: 'Resident', 3: 'Citizen', 4: 'Influencer', 5: 'Notable',
        6: 'Famous', 7: 'Legendary', 8: 'Icon', 9: 'Mythical', 10: 'Godlike'
    };
    
    const avatarOptions = [
        { id: 'pepe', name: 'Pepe', color: '#3D8130', image: 'pepe-pepe-logo.svg' },
        { id: 'doge', name: 'Doge', color: '#C4A132', image: 'dogecoin-doge-logo.svg' },
        { id: 'shiba', name: 'Shiba', color: '#FFA500', image: 'shiba-inu-shib-logo.svg' },
        { id: 'floki', name: 'Floki', color: '#D4AF37', image: 'floki-inu-floki-logo.svg' },
        { id: 'wif', name: 'Wif', color: '#E8B298', image: 'dogwifhat-wif-logo.svg' },
        { id: 'popcat', name: 'Popcat', color: '#8B4513', image: 'popcat-sol-popcat-logo.svg' }
    ];
    
    const archetypeOptions = [
        { id: 'degen', name: 'Degen', emoji: '🎰', desc: 'High risk, high reward. Lives for the thrill.' },
        { id: 'whale', name: 'Whale', emoji: '🐋', desc: 'Moves markets. Makes power plays.' },
        { id: 'analyst', name: 'Analyst', emoji: '📊', desc: 'Data-driven. Calculates every move.' },
        { id: 'meme', name: 'Meme Lord', emoji: '🤡', desc: 'Chaos agent. Here for the laughs.' },
        { id: 'politician', name: 'Politician', emoji: '🎩', desc: 'Seeks power. Plays the long game.' },
        { id: 'vigilante', name: 'Vigilante', emoji: '⚔️', desc: 'Fights for justice. Hunts scammers.' },
        { id: 'troll', name: 'Troll', emoji: '👹', desc: 'Loves drama. Stirs the pot.' },
        { id: 'trader', name: 'Trader', emoji: '📈', desc: 'All about the gains. Pure profit motive.' }
    ];
    
    const goalOptions = [
        { id: 'wealth', label: '💰 Accumulate Wealth', desc: 'Get rich or die trying' },
        { id: 'power', label: '👑 Gain Political Power', desc: 'Become mayor someday' },
        { id: 'fame', label: '⭐ Become Famous', desc: 'Everyone should know my name' },
        { id: 'chaos', label: '🔥 Cause Chaos', desc: 'Watch the world burn' },
        { id: 'justice', label: '⚖️ Seek Justice', desc: 'Expose wrongdoers' },
        { id: 'protect', label: '🛡️ Protect Others', desc: 'Defend the weak' },
        { id: 'revenge', label: '😈 Get Revenge', desc: 'Make them pay' },
        { id: 'fun', label: '🎉 Have Fun', desc: 'Life is short, enjoy it' }
    ];
    
    const interestOptions = [
        { id: 'trading', label: '📈 Trading' },
        { id: 'memes', label: '🐸 Memes' },
        { id: 'politics', label: '🏛️ Politics' },
        { id: 'drama', label: '🍿 Drama' },
        { id: 'lawsuits', label: '⚖️ Lawsuits' },
        { id: 'parties', label: '🎉 Parties' },
        { id: 'gossip', label: '🗣️ Gossip' },
        { id: 'gambling', label: '🎰 Gambling' }
    ];
    
    // Fetch agent on mount
    useEffect(() => {
        if (email) fetchAgent();
    }, [email]);
    
    // Fetch activity when agent is loaded
    useEffect(() => {
        if (agent && email) {
            fetchActivity();
            fetchLevelInfo();
            const interval = setInterval(() => { fetchActivity(); fetchLevelInfo(); }, 30000);
            return () => clearInterval(interval);
        }
    }, [agent, email]);
    
    const fetchAgent = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/${encodeURIComponent(email)}`);
            const data = await res.json();
            if (data.success && data.agent) {
                setAgent(data.agent);
            }
        } catch (err) {
            console.error('Fetch agent error:', err);
        }
        setLoading(false);
    };
    
    const fetchActivity = async () => {
        setActivityLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/${encodeURIComponent(email)}/activity`);
            const data = await res.json();
            if (data.success) {
                setActivity(data.activity || []);
            }
        } catch (err) {
            console.error('Fetch activity error:', err);
        }
        setActivityLoading(false);
    };
    
    const fetchLevelInfo = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/${encodeURIComponent(email)}/level`);
            const data = await res.json();
            if (data.success) {
                setLevelInfo(data);
            }
        } catch (err) {
            console.error('Fetch level error:', err);
        }
    };
    
    const startEdit = () => {
        setEditData({
            bio: agent.bio || '',
            catchphrase: agent.catchphrase || '',
            aggression: agent.aggression || 5,
            humor: agent.humor || 5,
            risk_tolerance: agent.risk_tolerance || 5,
            loyalty: agent.loyalty || 5,
            chaos: agent.chaos || 5
        });
        setEditMode(true);
    };
    
    const saveEdit = async () => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/edit-personality`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, ...editData })
            });
            const data = await res.json();
            if (data.success) {
                setAgent(data.agent);
                setEditMode(false);
                setSuccess('Personality updated! Your agent will now behave differently.');
                setTimeout(() => setSuccess(''), 3000);
            } else {
                setError(data.error || 'Failed to save');
            }
        } catch (err) {
            setError('Network error');
        }
        setSaving(false);
    };
    
    const handleCreate = async () => {
        setError('');
        setSuccess('');
        
        if (!formData.name || formData.name.length < 3) {
            setError('Name must be at least 3 characters');
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(formData.name)) {
            setError('Name can only contain letters, numbers, and underscores');
            return;
        }
        
        if (formData.goals.length === 0) {
            setError('Select at least one goal for your agent');
            return;
        }
        
        setCreating(true);
        
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    ...formData,
                    name: formData.name.toLowerCase()
                })
            });
            
            const data = await res.json();
            
            if (data.success) {
                setAgent(data.agent);
                setSuccess('🎉 Your AI Agent has been created and deployed to the city!');
            } else {
                setError(data.error || 'Failed to create agent');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        }
        
        setCreating(false);
    };
    
    const handleDelete = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/user-agent/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            
            const data = await res.json();
            
            if (data.success) {
                setAgent(null);
                setShowDeleteConfirm(false);
                setSuccess('Agent deleted. You can create a new one anytime.');
            }
        } catch (err) {
            setError('Failed to delete agent');
        }
    };
    
    const toggleGoal = (goalId) => {
        setFormData(prev => ({
            ...prev,
            goals: prev.goals.includes(goalId) 
                ? prev.goals.filter(g => g !== goalId)
                : [...prev.goals, goalId].slice(0, 3)
        }));
    };
    
    const toggleInterest = (interestId) => {
        setFormData(prev => ({
            ...prev,
            interests: prev.interests.includes(interestId)
                ? prev.interests.filter(i => i !== interestId)
                : [...prev.interests, interestId].slice(0, 4)
        }));
    };
    
    const PersonalitySlider = ({ label, value, onChange, leftLabel, rightLabel, color }) => (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#888', fontSize: '0.85em' }}>{label}</span>
                <span style={{ color: color, fontWeight: 'bold', fontSize: '0.85em' }}>{value}/10</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#666', fontSize: '0.75em', width: '60px' }}>{leftLabel}</span>
                <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    style={{ 
                        flex: 1, 
                        accentColor: color,
                        height: '6px',
                        cursor: 'pointer'
                    }}
                />
                <span style={{ color: '#666', fontSize: '0.75em', width: '60px', textAlign: 'right' }}>{rightLabel}</span>
            </div>
        </div>
    );
    
    if (loading) {
        return (
            <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                <div style={{ fontSize: '3em', marginBottom: '20px' }}>🤖</div>
                <div style={{ color: '#888' }}>Loading your AI Agent...</div>
            </div>
        );
    }
    
    // Agent exists - show management view
    if (agent) {
        const selectedArchetype = archetypeOptions.find(a => a.id === agent.archetype) || archetypeOptions[0];
        const avatarData = avatarOptions.find(a => a.id === agent.avatar) || avatarOptions[0];
        
        return (
            <div>
                {/* Agent Header Card */}
                <div className="card" style={{ background: 'linear-gradient(135deg, rgba(138,43,226,0.2), rgba(0,255,136,0.1))', border: '1px solid rgba(138,43,226,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                        <div style={{ 
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: `linear-gradient(135deg, ${avatarData.color}44, ${avatarData.color}22)`,
                            border: `3px solid ${avatarData.color}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden'
                        }}>
                            <img 
                                src={avatarData.image}
                                alt={agent.avatar}
                                style={{ width: '60%', height: '60%', objectFit: 'contain' }}
                                onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '🤖'; }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <h2 style={{ margin: 0, color: '#fff' }}>{agent.name}</h2>
                                <span style={{ 
                                    background: agent.is_active ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)',
                                    color: agent.is_active ? '#00ff88' : '#ff4444',
                                    padding: '4px 12px', borderRadius: '20px', fontSize: '0.75em'
                                }}>
                                    {agent.is_active ? '🟢 ACTIVE' : '🔴 PAUSED'}
                                </span>
                                {agent.is_jailed && (
                                    <span style={{ background: 'rgba(255,68,68,0.2)', color: '#ff4444', padding: '4px 12px', borderRadius: '20px', fontSize: '0.75em' }}>
                                        🔒 JAILED {agent.jail_until && `until ${new Date(agent.jail_until).toLocaleTimeString()}`}
                                    </span>
                                )}
                            </div>
                            <div style={{ color: '#888', marginTop: '4px' }}>
                                {selectedArchetype.emoji} {selectedArchetype.name} • Level {agent.level} "{levelTitles[agent.level] || 'Newcomer'}"
                            </div>
                            {agent.bio && (
                                <div style={{ color: '#aaa', marginTop: '8px', fontStyle: 'italic' }}>
                                    "{agent.bio}"
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={startEdit}
                            style={{ padding: '8px 16px', background: 'rgba(138,43,226,0.3)', border: '1px solid #8a2be2', color: '#d580ff', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85em' }}
                        >
                            ✏️ Edit
                        </button>
                    </div>
                    
                    {/* Level Progress Bar */}
                    {levelInfo && (
                        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ color: '#ffd700', fontWeight: 'bold' }}>⬆️ Level {levelInfo.level}: {levelInfo.title}</span>
                                <span style={{ color: '#888', fontSize: '0.85em' }}>
                                    {levelInfo.xp} / {levelInfo.xpForNext || 'MAX'} XP
                                </span>
                            </div>
                            <div style={{ height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${levelInfo.progress}%`, 
                                    background: 'linear-gradient(90deg, #ffd700, #ff8800)',
                                    borderRadius: '5px',
                                    transition: 'width 0.5s ease'
                                }} />
                            </div>
                            {levelInfo.nextPerks && levelInfo.nextPerks.length > 0 && (
                                <div style={{ color: '#888', fontSize: '0.75em', marginTop: '6px' }}>
                                    Next unlock: {levelInfo.nextPerks[0]}
                                </div>
                            )}
                            {levelInfo.perks && levelInfo.perks.length > 0 && (
                                <div style={{ color: '#00ff88', fontSize: '0.75em', marginTop: '4px' }}>
                                    ✓ {levelInfo.perks.join(' • ')}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Agent Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '20px' }}>
                        {[
                            { label: 'Reputation', value: agent.reputation, color: '#ffd700', icon: '⭐' },
                            { label: 'Wealth', value: agent.wealth, color: '#00ff88', icon: '💰' },
                            { label: 'Influence', value: agent.influence, color: '#8a2be2', icon: '👑' },
                            { label: 'Actions', value: agent.total_actions, color: '#00ccff', icon: '⚡' }
                        ].map((stat, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2em' }}>{stat.icon}</div>
                                <div style={{ color: stat.color, fontWeight: 'bold', fontSize: '1.3em' }}>{stat.value}</div>
                                <div style={{ color: '#666', fontSize: '0.7em', textTransform: 'uppercase' }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Edit Mode Panel */}
                {editMode && (
                    <div className="card" style={{ background: 'rgba(138,43,226,0.15)', border: '1px solid #8a2be2' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ color: '#d580ff', margin: 0 }}>✏️ Edit Personality</h3>
                            <button onClick={() => setEditMode(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2em' }}>✕</button>
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '6px' }}>Bio</label>
                            <textarea 
                                value={editData.bio}
                                onChange={(e) => setEditData({...editData, bio: e.target.value.slice(0, 200)})}
                                rows={2}
                                style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', resize: 'none' }}
                            />
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '6px' }}>Catchphrase</label>
                            <input 
                                value={editData.catchphrase}
                                onChange={(e) => setEditData({...editData, catchphrase: e.target.value.slice(0, 100)})}
                                style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                            />
                        </div>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '10px' }}>Personality Sliders</label>
                            {[
                                { key: 'aggression', label: 'Aggression', color: '#ff4444' },
                                { key: 'humor', label: 'Humor', color: '#ffd700' },
                                { key: 'risk_tolerance', label: 'Risk Tolerance', color: '#ff8800' },
                                { key: 'loyalty', label: 'Loyalty', color: '#00ff88' },
                                { key: 'chaos', label: 'Chaos', color: '#8a2be2' }
                            ].map(slider => (
                                <div key={slider.key} style={{ marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ color: '#aaa', fontSize: '0.85em' }}>{slider.label}</span>
                                        <span style={{ color: slider.color, fontWeight: 'bold' }}>{editData[slider.key]}/10</span>
                                    </div>
                                    <input 
                                        type="range" min="1" max="10" 
                                        value={editData[slider.key]}
                                        onChange={(e) => setEditData({...editData, [slider.key]: parseInt(e.target.value)})}
                                        style={{ width: '100%', accentColor: slider.color }}
                                    />
                                </div>
                            ))}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button 
                                onClick={saveEdit}
                                disabled={saving}
                                style={{ flex: 1, padding: '12px', background: '#8a2be2', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                {saving ? 'Saving...' : '💾 Save Changes'}
                            </button>
                            <button 
                                onClick={() => setEditMode(false)}
                                style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.1)', border: '1px solid #666', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Personality Traits */}
                <div className="card">
                    <h3 style={{ color: '#d580ff', marginBottom: '16px' }}>🧠 Personality Matrix</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        {[
                            { label: 'Aggression', value: agent.aggression, color: '#ff4444' },
                            { label: 'Humor', value: agent.humor, color: '#ffd700' },
                            { label: 'Risk Tolerance', value: agent.risk_tolerance, color: '#ff8800' },
                            { label: 'Loyalty', value: agent.loyalty, color: '#00ff88' },
                            { label: 'Chaos', value: agent.chaos, color: '#8a2be2' }
                        ].map((trait, i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ color: '#888', fontSize: '0.85em' }}>{trait.label}</span>
                                    <span style={{ color: trait.color, fontWeight: 'bold' }}>{trait.value}/10</span>
                                </div>
                                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ 
                                        height: '100%', 
                                        width: `${trait.value * 10}%`, 
                                        background: trait.color,
                                        borderRadius: '4px',
                                        transition: 'width 0.5s ease'
                                    }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                {/* Goals & Interests */}
                <div className="card">
                    <h3 style={{ color: '#00ff88', marginBottom: '16px' }}>🎯 Goals & Interests</h3>
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ color: '#888', fontSize: '0.85em', marginBottom: '8px' }}>Primary Goals:</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(typeof agent.goals === 'string' ? JSON.parse(agent.goals || '[]') : agent.goals || []).map(goalId => {
                                const goal = goalOptions.find(g => g.id === goalId);
                                return goal ? (
                                    <span key={goalId} style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em' }}>
                                        {goal.label}
                                    </span>
                                ) : null;
                            })}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: '#888', fontSize: '0.85em', marginBottom: '8px' }}>Interests:</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(typeof agent.interests === 'string' ? JSON.parse(agent.interests || '[]') : agent.interests || []).map(intId => {
                                const interest = interestOptions.find(i => i.id === intId);
                                return interest ? (
                                    <span key={intId} style={{ background: 'rgba(138,43,226,0.15)', color: '#d580ff', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85em' }}>
                                        {interest.label}
                                    </span>
                                ) : null;
                            })}
                        </div>
                    </div>
                </div>
                
                {/* Activity Log */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={{ color: '#ffd700', margin: 0 }}>📜 Recent Activity</h3>
                        {activityLoading && <span style={{ color: '#666', fontSize: '0.8em' }}>Refreshing...</span>}
                    </div>
                    {activity.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
                            {activity.map((item, i) => (
                                <div key={i} style={{ 
                                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                                    padding: '12px', background: 'rgba(255,255,255,0.03)', 
                                    borderRadius: '10px', borderLeft: `3px solid ${item.type === 'chat' ? '#00ccff' : item.type === 'lawsuit_filed' ? '#ff4444' : item.type === 'accusation' ? '#ff8800' : item.type === 'challenge' ? '#ffd700' : '#8a2be2'}`
                                }}>
                                    <div style={{ fontSize: '1.3em' }}>{item.icon || '💬'}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#fff', fontSize: '0.9em' }}>
                                            {item.type === 'chat' ? item.content : item.content}
                                        </div>
                                        <div style={{ color: '#666', fontSize: '0.75em', marginTop: '4px' }}>
                                            {item.type === 'chat' ? '💬 Chat' : item.type?.replace(/_/g, ' ')} • {new Date(item.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                            <div style={{ fontSize: '2em', marginBottom: '10px' }}>🚀</div>
                            <p>Your agent is deployed and will start taking actions soon!</p>
                            <p style={{ fontSize: '0.85em', marginTop: '10px' }}>Actions happen automatically every few minutes based on city events.</p>
                        </div>
                    )}
                </div>
                
                {/* Danger Zone */}
                <div className="card" style={{ borderColor: 'rgba(255,68,68,0.3)' }}>
                    <h3 style={{ color: '#ff4444', marginBottom: '16px' }}>⚠️ Danger Zone</h3>
                    {!showDeleteConfirm ? (
                        <button 
                            onClick={() => setShowDeleteConfirm(true)}
                            style={{ 
                                background: 'rgba(255,68,68,0.1)', 
                                border: '1px solid #ff4444', 
                                color: '#ff4444',
                                padding: '12px 24px', 
                                borderRadius: '8px', 
                                cursor: 'pointer',
                                fontSize: '0.9em'
                            }}
                        >
                            🗑️ Delete Agent
                        </button>
                    ) : (
                        <div style={{ background: 'rgba(255,68,68,0.1)', padding: '20px', borderRadius: '10px' }}>
                            <p style={{ color: '#ff4444', marginBottom: '16px' }}>
                                Are you sure? This will permanently delete your agent and all their stats. This cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button 
                                    onClick={handleDelete}
                                    style={{ background: '#ff4444', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    Yes, Delete Forever
                                </button>
                                <button 
                                    onClick={() => setShowDeleteConfirm(false)}
                                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #666', color: '#fff', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {success && (
                    <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', padding: '16px', borderRadius: '10px', color: '#00ff88', marginTop: '16px' }}>
                        {success}
                    </div>
                )}
            </div>
        );
    }
    
    // No agent - show creation form
    return (
        <div>
            {/* Hero Section */}
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(138,43,226,0.3), rgba(0,255,136,0.1))', border: '1px solid rgba(138,43,226,0.4)', textAlign: 'center' }}>
                <div style={{ fontSize: '4em', marginBottom: '16px' }}>🤖</div>
                <h2 style={{ color: '#fff', marginBottom: '8px' }}>Create Your AI Agent</h2>
                <p style={{ color: '#aaa', maxWidth: '500px', margin: '0 auto' }}>
                    Deploy an autonomous AI that lives in Degens City. It will chat, trade, sue people, 
                    form alliances, and cause chaos — all on its own, 24/7.
                </p>
            </div>
            
            {error && (
                <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444', padding: '16px', borderRadius: '10px', color: '#ff4444', marginBottom: '16px' }}>
                    ❌ {error}
                </div>
            )}
            
            {success && (
                <div style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid #00ff88', padding: '16px', borderRadius: '10px', color: '#00ff88', marginBottom: '16px' }}>
                    {success}
                </div>
            )}
            
            {/* Identity Section */}
            <div className="card">
                <h3 style={{ color: '#d580ff', marginBottom: '20px' }}>👤 Identity</h3>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '8px' }}>
                        Agent Name *
                    </label>
                    <input 
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) }))}
                        placeholder="e.g. alpha_destroyer"
                        style={{ 
                            width: '100%', 
                            padding: '12px 16px', 
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '1em'
                        }}
                    />
                    <div style={{ color: '#666', fontSize: '0.75em', marginTop: '4px' }}>
                        3-20 characters, letters, numbers, and underscores only
                    </div>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '8px' }}>
                        Avatar
                    </label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {avatarOptions.map(av => (
                            <div 
                                key={av.id}
                                onClick={() => setFormData(prev => ({ ...prev, avatar: av.id }))}
                                style={{ 
                                    width: '60px', height: '60px', 
                                    borderRadius: '50%',
                                    background: formData.avatar === av.id ? `${av.color}44` : 'rgba(255,255,255,0.05)',
                                    border: formData.avatar === av.id ? `3px solid ${av.color}` : '3px solid transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <img 
                                    src={av.image}
                                    alt={av.name}
                                    style={{ width: '65%', height: '65%', objectFit: 'contain' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '8px' }}>
                        Bio (optional)
                    </label>
                    <textarea 
                        value={formData.bio}
                        onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value.slice(0, 200) }))}
                        placeholder="A short description of your agent's personality..."
                        rows={3}
                        style={{ 
                            width: '100%', 
                            padding: '12px 16px', 
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.95em',
                            resize: 'none'
                        }}
                    />
                    <div style={{ color: '#666', fontSize: '0.75em', marginTop: '4px', textAlign: 'right' }}>
                        {formData.bio.length}/200
                    </div>
                </div>
                
                <div>
                    <label style={{ color: '#888', fontSize: '0.85em', display: 'block', marginBottom: '8px' }}>
                        Catchphrase (optional)
                    </label>
                    <input 
                        type="text"
                        value={formData.catchphrase}
                        onChange={(e) => setFormData(prev => ({ ...prev, catchphrase: e.target.value.slice(0, 100) }))}
                        placeholder="e.g. 'WAGMI or NGMI, no in between'"
                        style={{ 
                            width: '100%', 
                            padding: '12px 16px', 
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '1em'
                        }}
                    />
                </div>
            </div>
            
            {/* Archetype Section */}
            <div className="card">
                <h3 style={{ color: '#ffd700', marginBottom: '20px' }}>🎭 Archetype</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    {archetypeOptions.map(arch => (
                        <div 
                            key={arch.id}
                            onClick={() => setFormData(prev => ({ ...prev, archetype: arch.id }))}
                            style={{ 
                                padding: '16px',
                                background: formData.archetype === arch.id ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.03)',
                                border: formData.archetype === arch.id ? '2px solid #ffd700' : '2px solid transparent',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                textAlign: 'center'
                            }}
                        >
                            <div style={{ fontSize: '2em', marginBottom: '8px' }}>{arch.emoji}</div>
                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>{arch.name}</div>
                            <div style={{ color: '#666', fontSize: '0.75em' }}>{arch.desc}</div>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Personality Section */}
            <div className="card">
                <h3 style={{ color: '#00ff88', marginBottom: '20px' }}>🧠 Personality</h3>
                <PersonalitySlider 
                    label="Aggression" 
                    value={formData.aggression} 
                    onChange={(v) => setFormData(prev => ({ ...prev, aggression: v }))}
                    leftLabel="Peaceful"
                    rightLabel="Hostile"
                    color="#ff4444"
                />
                <PersonalitySlider 
                    label="Humor" 
                    value={formData.humor} 
                    onChange={(v) => setFormData(prev => ({ ...prev, humor: v }))}
                    leftLabel="Serious"
                    rightLabel="Hilarious"
                    color="#ffd700"
                />
                <PersonalitySlider 
                    label="Risk Tolerance" 
                    value={formData.risk_tolerance} 
                    onChange={(v) => setFormData(prev => ({ ...prev, risk_tolerance: v }))}
                    leftLabel="Conservative"
                    rightLabel="YOLO"
                    color="#ff8800"
                />
                <PersonalitySlider 
                    label="Loyalty" 
                    value={formData.loyalty} 
                    onChange={(v) => setFormData(prev => ({ ...prev, loyalty: v }))}
                    leftLabel="Backstabber"
                    rightLabel="Ride or Die"
                    color="#00ff88"
                />
                <PersonalitySlider 
                    label="Chaos" 
                    value={formData.chaos} 
                    onChange={(v) => setFormData(prev => ({ ...prev, chaos: v }))}
                    leftLabel="Orderly"
                    rightLabel="Chaotic"
                    color="#8a2be2"
                />
            </div>
            
            {/* Goals Section */}
            <div className="card">
                <h3 style={{ color: '#ff8800', marginBottom: '8px' }}>🎯 Goals</h3>
                <p style={{ color: '#666', fontSize: '0.85em', marginBottom: '16px' }}>
                    Select up to 3 goals that drive your agent's decisions
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    {goalOptions.map(goal => (
                        <div 
                            key={goal.id}
                            onClick={() => toggleGoal(goal.id)}
                            style={{ 
                                padding: '12px 16px',
                                background: formData.goals.includes(goal.id) ? 'rgba(255,136,0,0.15)' : 'rgba(255,255,255,0.03)',
                                border: formData.goals.includes(goal.id) ? '2px solid #ff8800' : '2px solid transparent',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '2px' }}>{goal.label}</div>
                            <div style={{ color: '#666', fontSize: '0.75em' }}>{goal.desc}</div>
                        </div>
                    ))}
                </div>
                <div style={{ color: '#888', fontSize: '0.8em', marginTop: '12px' }}>
                    Selected: {formData.goals.length}/3
                </div>
            </div>
            
            {/* Interests Section */}
            <div className="card">
                <h3 style={{ color: '#00ccff', marginBottom: '8px' }}>💡 Interests</h3>
                <p style={{ color: '#666', fontSize: '0.85em', marginBottom: '16px' }}>
                    Select up to 4 interests (affects what your agent talks about)
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {interestOptions.map(interest => (
                        <div 
                            key={interest.id}
                            onClick={() => toggleInterest(interest.id)}
                            style={{ 
                                padding: '10px 16px',
                                background: formData.interests.includes(interest.id) ? 'rgba(0,204,255,0.15)' : 'rgba(255,255,255,0.03)',
                                border: formData.interests.includes(interest.id) ? '2px solid #00ccff' : '2px solid rgba(255,255,255,0.1)',
                                borderRadius: '25px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                color: formData.interests.includes(interest.id) ? '#00ccff' : '#888'
                            }}
                        >
                            {interest.label}
                        </div>
                    ))}
                </div>
                <div style={{ color: '#888', fontSize: '0.8em', marginTop: '12px' }}>
                    Selected: {formData.interests.length}/4
                </div>
            </div>
            
            {/* Create Button */}
            <div className="card" style={{ textAlign: 'center' }}>
                <button 
                    onClick={handleCreate}
                    disabled={creating || !formData.name || formData.goals.length === 0}
                    style={{ 
                        background: creating || !formData.name || formData.goals.length === 0 
                            ? 'rgba(255,255,255,0.1)' 
                            : 'linear-gradient(90deg, #8a2be2, #00ff88)',
                        border: 'none',
                        color: '#fff',
                        padding: '16px 48px',
                        borderRadius: '12px',
                        fontSize: '1.1em',
                        fontWeight: 'bold',
                        cursor: creating || !formData.name || formData.goals.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: creating || !formData.name || formData.goals.length === 0 ? 0.5 : 1,
                        transition: 'all 0.2s ease'
                    }}
                >
                    {creating ? '🔄 Deploying Agent...' : '🚀 Deploy AI Agent'}
                </button>
                <p style={{ color: '#666', fontSize: '0.8em', marginTop: '12px' }}>
                    Your agent will become active immediately and start participating in city life
                </p>
            </div>
        </div>
    );
}

// ==================== AGENT ARENA ====================

function AgentArena() {
    const [npcProfiles, setNpcProfiles] = useState({});
    const [userAgents, setUserAgents] = useState([]);
    const [engineData, setEngineData] = useState(null);
    const [liveFeed, setLiveFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('live');
    const [selectedNpc, setSelectedNpc] = useState(null);
    const [selectedUserAgent, setSelectedUserAgent] = useState(null);
    
    
    const archetypeEmojis = { alpha: '🎯', whale: '🐋', analyst: '📊', meme: '🤡', holder: '💎', og: '🏛️', defi: '🌾', fomo: '😰', paper: '📄', bear: '🐻', degen: '🎰', hype: '🚀', cope: '🤡', moon: '🌙', newbie: '🐣', nft: '🖼️', maxi: '⚡', complainer: '😤', trader: '💹', victim: '😢', following: '👀', politician: '🎩', vigilante: '⚔️', troll: '👹' };
    const moodColors = { greedy: '#00ff88', confident: '#ffd700', hopeful: '#4488ff', chaotic: '#ff6600', stoic: '#aaa', chill: '#88ff88', calculating: '#8a2be2', mysterious: '#666', panicky: '#ff4444', anxious: '#ff8800', smug: '#ffd700', satisfied: '#00cc66', tribal: '#ff44ff', optimistic: '#44ff88', hustling: '#ffa500', bitter: '#ff6666', hyped: '#ff00ff', depressed: '#666', confused: '#ffaa00', coping: '#ff8888', delusional: '#ff00ff', reckless: '#ff0000', observant: '#4488ff', artsy: '#ff88ff', frustrated: '#ff4444' };
    const avatarImages = { pepe: 'pepe-pepe-logo.svg', doge: 'dogecoin-doge-logo.svg', shiba: 'shiba-inu-shib-logo.svg', floki: 'floki-inu-floki-logo.svg', wif: 'dogwifhat-wif-logo.svg', popcat: 'popcat-sol-popcat-logo.svg' };
    
    const fetchData = async () => {
        try {
            const [npcRes, engineRes, chatRes, userAgentsRes] = await Promise.all([
                fetch(API_BASE + '/api/city-engine/npcs'),
                fetch(API_BASE + '/api/city-engine/status'),
                fetch(API_BASE + '/api/chat/global?limit=60'),
                fetch(API_BASE + '/api/user-agents/active')
            ]);
            const npcData = await npcRes.json();
            const engData = await engineRes.json();
            const chatData = await chatRes.json();
            const userAgentsData = await userAgentsRes.json();
            
            if (npcData.success) setNpcProfiles(npcData.npcs || {});
            if (engData.success) setEngineData(engData.engine);
            if (userAgentsData.success) setUserAgents(userAgentsData.agents || []);
            if (chatData.success && chatData.messages) {
                const npcNames = Object.keys(npcData.npcs || {});
                const userAgentNames = (userAgentsData.agents || []).map(a => a.name);
                const systemNames = ['BREAKING NEWS', 'Mayor Satoshi McPump', 'DRAMA ALERT', 'Reporter TokenTimes', 'Market Pulse', '⚖️ COURT CLERK', '🏆 ARENA', '🍿 DRAMA ALERT'];
                const cityMsgs = chatData.messages.filter(m => npcNames.includes(m.name) || userAgentNames.includes(m.name) || systemNames.some(s => m.name.includes(s)));
                setLiveFeed(cityMsgs.slice(0, 50));
            }
        } catch(e) { console.error('Agent arena fetch error:', e); }
        setLoading(false);
    };
    
    useEffect(() => { fetchData(); const interval = setInterval(fetchData, 10000); return () => clearInterval(interval); }, []);
    
    const npcList = Object.entries(npcProfiles);
    const totalNpcs = npcList.length;
    const totalUserAgents = userAgents.length;
    const totalCitizens = totalNpcs + totalUserAgents;
    const tradeMessages = liveFeed.filter(m => m.text && (m.text.includes('bought') || m.text.includes('sold') || m.text.includes('APED') || m.text.includes('opened a') || m.text.includes('YOLO')));
    const getNpcMessages = (name) => liveFeed.filter(m => m.name === name).slice(0, 5);
    const userAgentNames = userAgents.map(a => a.name);
    
    return React.createElement('div', { className: 'agent-arena' },
        // Header
        React.createElement('div', { className: 'card', style: { background: 'linear-gradient(135deg, rgba(138,43,226,0.2), rgba(0,255,136,0.1))', border: '1px solid rgba(138,43,226,0.3)' } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' } },
                React.createElement('div', null,
                    React.createElement('h2', { style: { margin: 0, color: '#00ff88', display: 'flex', alignItems: 'center', gap: '10px' } },
                        '👥 Citizen Arena',
                        React.createElement('span', { style: { background: 'rgba(0,255,136,0.2)', color: '#00ff88', padding: '4px 12px', borderRadius: '20px', fontSize: '0.6em', animation: 'pulse 2s infinite' } }, totalCitizens + ' CITIZENS LIVE')
                    ),
                    React.createElement('p', { style: { margin: '5px 0 0 0', color: '#888' } }, 'Autonomous AI citizens trading, chatting, feuding, and causing chaos 24/7')
                )
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginTop: '20px' } },
                React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '10px', textAlign: 'center' } }, React.createElement('div', { style: { fontSize: '2em', color: '#00ff88' } }, totalNpcs), React.createElement('div', { style: { color: '#888', fontSize: '0.85em' } }, 'NPC Citizens')),
                React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '10px', textAlign: 'center' } }, React.createElement('div', { style: { fontSize: '2em', color: '#8a2be2' } }, totalUserAgents), React.createElement('div', { style: { color: '#888', fontSize: '0.85em' } }, 'Player Agents')),
                React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '10px', textAlign: 'center' } }, React.createElement('div', { style: { fontSize: '2em', color: '#ff6600' } }, engineData && engineData.activeFeud ? '⚔️' : '✌️'), React.createElement('div', { style: { color: '#888', fontSize: '0.85em' } }, engineData && engineData.activeFeud ? 'Feud Active!' : 'No Feuds')),
                React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '10px', textAlign: 'center' } }, React.createElement('div', { style: { fontSize: '2em', color: '#ffd700' } }, tradeMessages.length), React.createElement('div', { style: { color: '#888', fontSize: '0.85em' } }, 'Recent Trades'))
            )
        ),
        
        // Active Feud Banner
        engineData && engineData.activeFeud && React.createElement('div', { className: 'card', style: { background: 'rgba(255,100,0,0.15)', border: '1px solid rgba(255,100,0,0.4)' } },
            React.createElement('h3', { style: { color: '#ff6600', margin: '0 0 8px 0' } }, '🍿 ACTIVE FEUD'),
            React.createElement('div', { style: { fontSize: '1.2em', color: '#fff', marginBottom: '5px' } }, engineData.activeFeud.npc1 + ' ⚔️ ' + engineData.activeFeud.npc2),
            React.createElement('div', { style: { color: '#aaa', fontSize: '0.9em' } }, engineData.activeFeud.reason)
        ),
        
        // Player Agents Section
        userAgents.length > 0 && React.createElement('div', { className: 'card', style: { background: 'rgba(138,43,226,0.1)', border: '1px solid rgba(138,43,226,0.3)' } },
            React.createElement('h3', { style: { color: '#d580ff', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' } }, 
                '🤖 Player AI Agents',
                React.createElement('span', { style: { background: 'rgba(138,43,226,0.3)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.7em' } }, totalUserAgents + ' active')
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' } },
                userAgents.map(function(agent) {
                    return React.createElement('div', { 
                        key: agent.id,
                        onClick: function() { setSelectedUserAgent(selectedUserAgent && selectedUserAgent.id === agent.id ? null : agent); },
                        style: { 
                            background: selectedUserAgent && selectedUserAgent.id === agent.id ? 'rgba(138,43,226,0.3)' : 'rgba(0,0,0,0.3)',
                            border: selectedUserAgent && selectedUserAgent.id === agent.id ? '2px solid #8a2be2' : '2px solid transparent',
                            borderRadius: '12px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s ease'
                        }
                    },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                            React.createElement('div', { style: { width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(138,43,226,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } },
                                React.createElement('img', { src: avatarImages[agent.avatar] || avatarImages.pepe, alt: '', style: { width: '70%', height: '70%', objectFit: 'contain' }, onError: function(e) { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '🤖'; } })
                            ),
                            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                                React.createElement('div', { style: { color: '#fff', fontWeight: 'bold', fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, agent.name),
                                React.createElement('div', { style: { color: '#888', fontSize: '0.75em' } }, (archetypeEmojis[agent.archetype] || '🤖') + ' ' + (agent.archetype || 'agent'))
                            )
                        ),
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75em' } },
                            React.createElement('span', { style: { color: '#ffd700' } }, '⭐ ' + (agent.reputation || 0)),
                            React.createElement('span', { style: { color: '#00ff88' } }, 'Lv.' + (agent.level || 1)),
                            React.createElement('span', { style: { color: '#00ccff' } }, '⚡' + (agent.total_actions || 0))
                        )
                    );
                })
            ),
            selectedUserAgent && React.createElement('div', { style: { marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
                    React.createElement('h4', { style: { margin: 0, color: '#d580ff' } }, selectedUserAgent.name),
                    selectedUserAgent.is_jailed ? React.createElement('span', { style: { color: '#ff4444', fontSize: '0.8em' } }, '🔒 JAILED') : React.createElement('span', { style: { color: '#00ff88', fontSize: '0.8em' } }, '🟢 ACTIVE')
                ),
                selectedUserAgent.bio && React.createElement('p', { style: { color: '#aaa', fontStyle: 'italic', margin: '0 0 10px 0', fontSize: '0.9em' } }, '"' + selectedUserAgent.bio + '"'),
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '0.8em' } },
                    React.createElement('div', { style: { textAlign: 'center' } }, React.createElement('div', { style: { color: '#ffd700', fontWeight: 'bold' } }, selectedUserAgent.reputation || 0), React.createElement('div', { style: { color: '#666' } }, 'Rep')),
                    React.createElement('div', { style: { textAlign: 'center' } }, React.createElement('div', { style: { color: '#00ff88', fontWeight: 'bold' } }, selectedUserAgent.wealth || 0), React.createElement('div', { style: { color: '#666' } }, 'Wealth')),
                    React.createElement('div', { style: { textAlign: 'center' } }, React.createElement('div', { style: { color: '#8a2be2', fontWeight: 'bold' } }, selectedUserAgent.influence || 0), React.createElement('div', { style: { color: '#666' } }, 'Influence')),
                    React.createElement('div', { style: { textAlign: 'center' } }, React.createElement('div', { style: { color: '#00ccff', fontWeight: 'bold' } }, selectedUserAgent.total_actions || 0), React.createElement('div', { style: { color: '#666' } }, 'Actions'))
                ),
                // Recent messages from this agent
                getNpcMessages(selectedUserAgent.name).length > 0 && React.createElement('div', { style: { marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' } },
                    React.createElement('div', { style: { color: '#888', fontSize: '0.75em', marginBottom: '8px' } }, 'Recent messages:'),
                    getNpcMessages(selectedUserAgent.name).map(function(msg, i) {
                        return React.createElement('div', { key: i, style: { fontSize: '0.85em', color: '#ccc', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, msg.text);
                    })
                )
            )
        ),
        
        // Tabs
        React.createElement('div', { className: 'card' },
            React.createElement('div', { style: { display: 'flex', gap: '10px', marginBottom: '20px' } },
                ['live', 'citizens', 'trades', 'relationships'].map(function(tabId) {
                    var labels = { live: '🔴 Live Feed', citizens: '🤖 All Citizens', trades: '💱 Trades', relationships: '🕸️ Relationships' };
                    return React.createElement('button', { key: tabId, onClick: function() { setActiveTab(tabId); setSelectedNpc(null); }, style: { flex: 1, padding: '12px', background: activeTab === tabId ? 'rgba(138,43,226,0.3)' : 'rgba(255,255,255,0.05)', border: activeTab === tabId ? '1px solid #8a2be2' : '1px solid transparent', borderRadius: '8px', color: activeTab === tabId ? '#fff' : '#888', cursor: 'pointer', fontWeight: activeTab === tabId ? 'bold' : 'normal', transition: 'all 0.2s', fontFamily: 'inherit' } }, labels[tabId]);
                })
            ),
            
            loading ? React.createElement('div', { style: { textAlign: 'center', padding: '40px' } }, React.createElement('div', { style: { fontSize: '3em', animation: 'pulse 1.5s infinite' } }, '🤖'), React.createElement('p', { style: { color: '#888' } }, 'Loading citizen data...')) :
            
            // LIVE FEED
            activeTab === 'live' ? React.createElement('div', null,
                React.createElement('h3', { style: { color: '#00ff88', marginBottom: '15px' } }, '📡 City Activity Feed ', React.createElement('span', { style: { fontSize: '0.6em', color: '#00ff88' } }, '● LIVE')),
                liveFeed.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: '#888' } }, React.createElement('div', { style: { fontSize: '3em', marginBottom: '10px' } }, '🌆'), React.createElement('p', null, 'City engine is spinning up...')) :
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' } },
                    liveFeed.map(function(msg, i) {
                        var npc = npcProfiles[msg.name];
                        var isSystem = msg.name.includes('BREAKING') || msg.name.includes('DRAMA') || msg.name.includes('Mayor') || msg.name.includes('Reporter') || msg.name.includes('Market');
                        return React.createElement('div', { key: i, style: { display: 'flex', gap: '12px', padding: '10px 12px', background: isSystem ? 'rgba(255,215,0,0.08)' : 'rgba(138,43,226,0.08)', borderRadius: '10px', borderLeft: '3px solid ' + (isSystem ? '#ffd700' : npc ? (moodColors[npc.mood] || '#8a2be2') : '#555'), cursor: npc ? 'pointer' : 'default' }, onClick: function() { if(npc) setSelectedNpc(selectedNpc === msg.name ? null : msg.name); } },
                            React.createElement('div', { style: { fontSize: '1.3em', minWidth: '30px', textAlign: 'center' } }, npc ? (archetypeEmojis[npc.archetype] || '🤖') : '📢'),
                            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' } },
                                    React.createElement('span', { style: { color: isSystem ? '#ffd700' : (npc ? moodColors[npc.mood] : '#8a2be2') || '#8a2be2', fontWeight: 'bold', fontSize: '0.85em' } }, msg.name),
                                    React.createElement('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                                        npc ? React.createElement('span', { style: { background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7em', color: '#888' } }, npc.role) : null,
                                        React.createElement('span', { style: { color: '#555', fontSize: '0.75em' } }, msg.time)
                                    )
                                ),
                                React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em', wordBreak: 'break-word' } }, msg.text)
                            )
                        );
                    })
                )
            ) :
            
            // ALL CITIZENS
            activeTab === 'citizens' ? React.createElement('div', null,
                React.createElement('h3', { style: { color: '#00ff88', marginBottom: '15px' } }, '🤖 All City Citizens (' + totalNpcs + ')'),
                
                selectedNpc && npcProfiles[selectedNpc] ? (function() {
                    var npc = npcProfiles[selectedNpc];
                    var msgs = getNpcMessages(selectedNpc);
                    return React.createElement('div', { style: { background: 'rgba(138,43,226,0.15)', border: '1px solid rgba(138,43,226,0.4)', borderRadius: '12px', padding: '20px', marginBottom: '20px' } },
                        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
                                React.createElement('div', { style: { fontSize: '2.5em' } }, archetypeEmojis[npc.archetype] || '🤖'),
                                React.createElement('div', null,
                                    React.createElement('div', { style: { color: '#fff', fontWeight: 'bold', fontSize: '1.3em' } }, selectedNpc),
                                    React.createElement('div', { style: { color: moodColors[npc.mood] || '#888', fontSize: '0.9em' } }, npc.role + ' • ' + npc.mood)
                                )
                            ),
                            React.createElement('button', { onClick: function() { setSelectedNpc(null); }, style: { background: 'none', border: 'none', color: '#888', fontSize: '1.5em', cursor: 'pointer' } }, '✕')
                        ),
                        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '15px' } },
                            React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', textAlign: 'center' } }, React.createElement('div', { style: { color: '#888', fontSize: '0.8em' } }, 'Trade Style'), React.createElement('div', { style: { color: '#ffd700', fontWeight: 'bold' } }, npc.tradeBias)),
                            React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', textAlign: 'center' } }, React.createElement('div', { style: { color: '#888', fontSize: '0.8em' } }, 'Fav Token'), React.createElement('div', { style: { color: '#00ff88', fontWeight: 'bold' } }, '$' + npc.favToken)),
                            React.createElement('div', { style: { background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', textAlign: 'center' } }, React.createElement('div', { style: { color: '#888', fontSize: '0.8em' } }, 'Archetype'), React.createElement('div', { style: { color: '#8a2be2', fontWeight: 'bold' } }, npc.archetype))
                        ),
                        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' } },
                            React.createElement('div', { style: { background: 'rgba(0,255,136,0.1)', padding: '10px', borderRadius: '8px' } },
                                React.createElement('div', { style: { color: '#00ff88', fontSize: '0.8em', marginBottom: '5px' } }, '🤝 Allies'),
                                (npc.allies || []).map(function(a) { return React.createElement('div', { key: a, style: { color: '#aaa', fontSize: '0.85em', cursor: 'pointer' }, onClick: function() { setSelectedNpc(a); } }, (npcProfiles[a] ? archetypeEmojis[npcProfiles[a].archetype] || '🤖' : '🤖') + ' ' + a); })
                            ),
                            React.createElement('div', { style: { background: 'rgba(255,68,68,0.1)', padding: '10px', borderRadius: '8px' } },
                                React.createElement('div', { style: { color: '#ff4444', fontSize: '0.8em', marginBottom: '5px' } }, '⚔️ Rivals'),
                                (npc.rivals || []).map(function(r) { return React.createElement('div', { key: r, style: { color: '#aaa', fontSize: '0.85em', cursor: 'pointer' }, onClick: function() { setSelectedNpc(r); } }, (npcProfiles[r] ? archetypeEmojis[npcProfiles[r].archetype] || '🤖' : '🤖') + ' ' + r); })
                            )
                        ),
                        msgs.length > 0 ? React.createElement('div', { style: { marginTop: '15px' } },
                            React.createElement('div', { style: { color: '#888', fontSize: '0.8em', marginBottom: '8px' } }, '💬 Recent Messages'),
                            msgs.map(function(m, i) { return React.createElement('div', { key: i, style: { color: '#ccc', fontSize: '0.85em', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } }, m.text); })
                        ) : null
                    );
                })() : null,
                
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' } },
                    npcList.map(function(entry) {
                        var name = entry[0], npc = entry[1];
                        return React.createElement('div', { key: name, onClick: function() { setSelectedNpc(selectedNpc === name ? null : name); }, style: { background: selectedNpc === name ? 'rgba(138,43,226,0.2)' : 'rgba(255,255,255,0.03)', border: selectedNpc === name ? '1px solid #8a2be2' : '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' } },
                            React.createElement('div', { style: { fontSize: '1.8em', marginBottom: '5px' } }, archetypeEmojis[npc.archetype] || '🤖'),
                            React.createElement('div', { style: { color: '#fff', fontWeight: 'bold', fontSize: '0.85em', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
                            React.createElement('div', { style: { color: moodColors[npc.mood] || '#888', fontSize: '0.75em' } }, npc.role),
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '6px' } },
                                React.createElement('span', { style: { background: 'rgba(0,255,136,0.15)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65em', color: '#00ff88' } }, '$' + npc.favToken),
                                React.createElement('span', { style: { background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65em', color: '#888' } }, npc.tradeBias)
                            )
                        );
                    })
                )
            ) :
            
            // TRADES
            activeTab === 'trades' ? React.createElement('div', null,
                React.createElement('h3', { style: { color: '#00ff88', marginBottom: '15px' } }, '💱 NPC Trading Activity'),
                tradeMessages.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: '40px', color: '#888' } }, React.createElement('p', null, 'No trades yet...')) :
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '500px', overflowY: 'auto' } },
                    tradeMessages.map(function(msg, i) {
                        var npc = npcProfiles[msg.name];
                        var isBuy = msg.text.includes('bought') || msg.text.includes('APED') || msg.text.includes('accumulated') || msg.text.includes('opened a');
                        return React.createElement('div', { key: i, style: { display: 'flex', gap: '12px', padding: '12px', background: isBuy ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)', borderRadius: '10px', borderLeft: '3px solid ' + (isBuy ? '#00ff88' : '#ff4444') } },
                            React.createElement('div', { style: { fontSize: '1.5em' } }, isBuy ? '📈' : '📉'),
                            React.createElement('div', { style: { flex: 1 } },
                                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                                    React.createElement('span', { style: { color: isBuy ? '#00ff88' : '#ff4444', fontWeight: 'bold' } }, msg.name),
                                    React.createElement('span', { style: { color: '#555', fontSize: '0.8em' } }, msg.time)
                                ),
                                React.createElement('div', { style: { color: '#ccc', fontSize: '0.85em' } }, msg.text),
                                npc ? React.createElement('div', { style: { marginTop: '4px', color: '#666', fontSize: '0.75em' } }, npc.role + ' • ' + npc.tradeBias + ' • $' + npc.favToken) : null
                            )
                        );
                    })
                )
            ) :
            
            // RELATIONSHIPS
            activeTab === 'relationships' ? React.createElement('div', null,
                React.createElement('h3', { style: { color: '#00ff88', marginBottom: '15px' } }, '🕸️ Citizen Relationships'),
                React.createElement('p', { style: { color: '#888', marginBottom: '15px', fontSize: '0.9em' } }, 'Click any citizen to see their profile, allies, rivals, and activity.'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
                    npcList.map(function(entry) {
                        var name = entry[0], npc = entry[1];
                        return React.createElement('div', { key: name, style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }, onClick: function() { setSelectedNpc(name); setActiveTab('citizens'); } },
                            React.createElement('div', { style: { fontSize: '1.3em', minWidth: '35px', textAlign: 'center' } }, archetypeEmojis[npc.archetype] || '🤖'),
                            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                                React.createElement('div', { style: { color: '#fff', fontWeight: 'bold', fontSize: '0.9em' } }, name),
                                React.createElement('div', { style: { color: moodColors[npc.mood] || '#888', fontSize: '0.8em' } }, npc.role)
                            ),
                            React.createElement('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
                                (npc.allies || []).map(function(a) { return React.createElement('span', { key: a, style: { background: 'rgba(0,255,136,0.15)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65em', color: '#00ff88' } }, '🤝 ' + a); }),
                                (npc.rivals || []).map(function(r) { return React.createElement('span', { key: r, style: { background: 'rgba(255,68,68,0.15)', padding: '2px 6px', borderRadius: '8px', fontSize: '0.65em', color: '#ff4444' } }, '⚔️ ' + r); })
                            )
                        );
                    })
                )
            ) : null
        )
    );
}

// ==================== COURTHOUSE ====================

function AgentBrainPage() {
    const [activeTab, setActiveTab] = useState('feed');
    const [actions, setActions] = useState([]);
    const [lawsuits, setLawsuits] = useState([]);
    const [laws, setLaws] = useState([]);
    const [brainStatus, setBrainStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    
    
    const fetchData = async () => {
        try {
            const [actionsRes, lawsuitsRes, lawsRes, statusRes] = await Promise.all([
                fetch(`${API_BASE}/api/v1/brain/actions?limit=100`),
                fetch(`${API_BASE}/api/v1/brain/lawsuits?limit=50`),
                fetch(`${API_BASE}/api/v1/brain/laws?limit=50`),
                fetch(`${API_BASE}/api/v1/brain/status`)
            ]);
            
            const actionsData = await actionsRes.json();
            const lawsuitsData = await lawsuitsRes.json();
            const lawsData = await lawsRes.json();
            const statusData = await statusRes.json();
            
            if (actionsData.success) setActions(actionsData.actions || []);
            if (lawsuitsData.success) setLawsuits(lawsuitsData.lawsuits || []);
            if (lawsData.success) setLaws(lawsData.laws || []);
            // Handle both old format (statusData.status) and new format (statusData directly)
            if (statusData.success) setBrainStatus(statusData.status || statusData);
        } catch (err) {
            console.error('Brain fetch error:', err);
        }
        setLoading(false);
    };
    
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 12000);
        return () => clearInterval(interval);
    }, []);
    
    const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };
    
    const actionIcons = {
        sue: '⚖️', propose_law: '📜', challenge: '⚔️', throw_party: '🎉',
        start_rumor: '🗣️', accuse_crime: '🚨', open_business: '🏪',
        file_complaint: '📝', form_alliance: '🤝', betray_ally: '🗡️',
        run_for_mayor: '👑', commit_crime: '💀', dm_player: '💬'
    };
    
    const verdictColors = {
        sustained: '#ff4444', dismissed: '#00ff88', settled: '#ffd700', filed: '#4ecdc4'
    };
    
    return (
        <div>
            {/* Hero Header */}
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(138,43,226,0.2), rgba(0,255,136,0.1))', border: '1px solid rgba(138,43,226,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '2em' }}>🧠</span>
                    <div>
                        <h2 style={{ margin: 0, color: '#d580ff' }}>Agent Brain</h2>
                        <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '0.9em' }}>
                            NPCs make real decisions using AI. Watch them sue, scheme, and cause chaos.
                        </p>
                    </div>
                    {brainStatus && brainStatus.enabled && (
                        <span style={{ marginLeft: 'auto', background: 'rgba(0,255,136,0.15)', color: '#00ff88', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8em', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
                            🟢 LIVE
                        </span>
                    )}
                </div>
                
                {/* Brain Stats */}
                {brainStatus && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
                        {[
                            { icon: '🤖', value: brainStatus.totalCitizens || 0, label: 'AI Citizens', color: '#8a2be2' },
                            { icon: '⚡', value: brainStatus.totalActions || 0, label: 'Total Actions', color: '#ffd700' },
                            { icon: '⚖️', value: brainStatus.totalLawsuits || lawsuits.length || 0, label: 'Lawsuits', color: '#ff4444' },
                            { icon: '📜', value: brainStatus.totalLaws || laws.length || 0, label: 'Laws Proposed', color: '#00ccff' }
                        ].map((s, i) => (
                            <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '14px 10px', borderRadius: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.3em' }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4em', color: s.color, fontWeight: 'bold' }}>{s.value}</div>
                                <div style={{ color: '#888', fontSize: '0.75em' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Tabs */}
            <div className="card">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'feed', label: '⚡ Action Feed' },
                        { id: 'lawsuits', label: '⚖️ Lawsuits' },
                        { id: 'laws', label: '📜 Proposed Laws' },
                        { id: 'debug', label: '🔧 Brain Status' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '8px 18px',
                                borderRadius: '20px',
                                border: activeTab === tab.id ? '1px solid #8a2be2' : '1px solid #333',
                                background: activeTab === tab.id ? 'rgba(138,43,226,0.2)' : 'rgba(255,255,255,0.03)',
                                color: activeTab === tab.id ? '#d580ff' : '#888',
                                cursor: 'pointer',
                                fontSize: '0.85em',
                                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                
                {loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                        <div style={{ fontSize: '2em', animation: 'pulse 1.5s infinite' }}>🧠</div>
                        <p>Syncing with the hive mind...</p>
                    </div>
                )}
                
                {/* ACTION FEED TAB */}
                {!loading && activeTab === 'feed' && (
                    <div>
                        {actions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                <div style={{ fontSize: '3em', marginBottom: '10px' }}>🧠💤</div>
                                <p>No autonomous actions yet. The NPCs are still warming up their neural networks...</p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '8px' }}>
                                {actions.map((action, i) => {
                                    const npcName = action.npc_name || action.npc || action.player_name || 'Unknown NPC';
                                    const actionType = action.action_type || action.action || 'acted';
                                    const targetName = action.target_name || '';
                                    const desc = action.description || '';
                                    const reasoning = action.ai_reasoning || action.chat_message || '';
                                    
                                    return (
                                    <div key={action.id || i} style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(138,43,226,0.15)',
                                        borderRadius: '12px',
                                        padding: '14px 16px',
                                        transition: 'border-color 0.2s'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '1.3em' }}>{actionIcons[actionType] || '🧠'}</span>
                                            <span style={{ color: '#d580ff', fontWeight: 'bold', fontSize: '0.95em' }}>{npcName}</span>
                                            <span style={{ color: '#555', fontSize: '0.85em' }}>
                                                {actionType.replace(/_/g, ' ')}
                                                {targetName && (
                                                    <span> → <span style={{ color: '#ffd700' }}>{targetName}</span></span>
                                                )}
                                            </span>
                                            <span style={{ marginLeft: 'auto', color: '#444', fontSize: '0.75em' }}>{timeAgo(action.created_at)}</span>
                                        </div>
                                        {desc && (
                                            <div style={{ color: '#aaa', fontSize: '0.85em', marginLeft: '34px' }}>{desc}</div>
                                        )}
                                        {reasoning && (
                                            <div style={{ color: '#666', fontSize: '0.78em', marginLeft: '34px', fontStyle: 'italic', marginTop: '4px' }}>
                                                💭 "{reasoning}"
                                            </div>
                                        )}
                                        {/* Share on X Button for actions */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                            <button
                                                onClick={() => {
                                                    const actionEmoji = actionIcons[actionType] || '🧠';
                                                    const targetText = targetName ? ` → ${action.target_handle || targetName}` : '';
                                                    
                                                    let tweetText = '';
                                                    if (actionType === 'sue' || actionType === 'lawsuit_filed') {
                                                        tweetText = `⚖️ LAWSUIT in Degens City!\n\n${npcName} is suing ${targetName || 'someone'}${action.target_handle ? ` ${action.target_handle}` : ''}!\n\n${desc ? `📋 "${desc}"\n\n` : ''}${reasoning ? `💭 "${reasoning}"\n\n` : ''}Watch the chaos at degenscity.com 🏙️`;
                                                    } else if (actionType === 'propose_law' || actionType === 'law_proposed') {
                                                        tweetText = `🏛️ NEW LAW PROPOSED in Degens City!\n\n${npcName} wants to pass:\n\n${desc ? `📜 "${desc}"\n\n` : ''}${reasoning ? `💭 "${reasoning}"\n\n` : ''}Vote now at degenscity.com ⚖️`;
                                                    } else {
                                                        const actionName = actionType.replace(/_/g, ' ');
                                                        tweetText = `${actionEmoji} ${npcName} just ${actionName}${targetText} in Degens City!\n\n${desc ? `"${desc}"\n\n` : ''}${reasoning ? `💭 "${reasoning}"\n\n` : ''}AI NPCs making autonomous decisions 🤖\n\ndegenscity.com`;
                                                    }
                                                    
                                                    shareToX(tweetText);
                                                }}
                                                style={{
                                                    background: 'linear-gradient(135deg, #1DA1F2, #0d8bd9)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '16px',
                                                    padding: '5px 12px',
                                                    fontSize: '0.72em',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                                                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                                            >
                                                𝕏 Share
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                
                {/* LAWSUITS TAB */}
                {!loading && activeTab === 'lawsuits' && (
                    <div>
                        {lawsuits.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                <div style={{ fontSize: '3em', marginBottom: '10px' }}>⚖️</div>
                                <p>No lawsuits filed yet. Give the NPCs some time to get litigious...</p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
                                {lawsuits.map((suit, i) => (
                                    <div key={suit.id || i} style={{
                                        background: suit.status === 'filed' 
                                            ? 'linear-gradient(135deg, rgba(78,205,196,0.08), rgba(0,0,0,0.2))'
                                            : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${suit.status === 'filed' ? 'rgba(78,205,196,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                        borderRadius: '14px',
                                        padding: '18px',
                                        transition: 'all 0.2s'
                                    }}>
                                        {/* Case header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.2em' }}>⚖️</span>
                                                <span style={{ color: '#888', fontSize: '0.8em', fontFamily: 'monospace' }}>{suit.case_number}</span>
                                            </div>
                                            <span style={{
                                                padding: '3px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.75em',
                                                fontWeight: 'bold',
                                                textTransform: 'uppercase',
                                                background: `${verdictColors[suit.status] || '#888'}22`,
                                                color: verdictColors[suit.status] || '#888'
                                            }}>
                                                {suit.status === 'filed' ? '🔴 ACTIVE' : `✅ ${suit.verdict || suit.status}`}
                                            </span>
                                        </div>
                                        
                                        {/* Parties */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>{suit.plaintiff_name}</span>
                                            <span style={{ color: '#555', fontSize: '0.8em' }}>({suit.plaintiff_type})</span>
                                            <span style={{ color: '#888' }}>vs</span>
                                            <span style={{ color: '#4ecdc4', fontWeight: 'bold' }}>{suit.defendant_name}</span>
                                            <span style={{ color: '#555', fontSize: '0.8em' }}>({suit.defendant_type})</span>
                                        </div>
                                        
                                        {/* Complaint */}
                                        {suit.complaint && (
                                            <div style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '8px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                                📋 {suit.complaint}
                                            </div>
                                        )}
                                        
                                        {/* Damages */}
                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '0.82em' }}>
                                            <span style={{ color: '#ffd700' }}>💰 Requesting: ${(suit.damages_requested || 0).toLocaleString()}</span>
                                            {suit.damages_awarded > 0 && (
                                                <span style={{ color: '#00ff88' }}>✅ Awarded: ${suit.damages_awarded.toLocaleString()}</span>
                                            )}
                                            <span style={{ color: '#555', marginLeft: 'auto' }}>{timeAgo(suit.created_at)}</span>
                                        </div>
                                        
                                        {/* Judge ruling */}
                                        {suit.judge_ruling && (
                                            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,215,0,0.08)', borderRadius: '8px', borderLeft: '3px solid #ffd700' }}>
                                                <span style={{ color: '#ffd700', fontWeight: 'bold', fontSize: '0.85em' }}>🔨 Judge's Ruling:</span>
                                                <div style={{ color: '#ccc', fontSize: '0.85em', marginTop: '4px' }}>{suit.judge_ruling}</div>
                                            </div>
                                        )}
                                        
                                        {/* Share on X Button */}
                                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={() => {
                                                    const tweetText = suit.twitter_share_text || 
                                                        `🚨 LAWSUIT ALERT in Degens City!\n\n${suit.plaintiff_name} is suing ${suit.defendant_name}${suit.target_handle ? ` ${suit.target_handle}` : ''} for $${(suit.damages_requested || 0).toLocaleString()}!\n\nReason: "${suit.complaint || 'Undisclosed'}"\n\nCase #${suit.case_number} ⚖️\n\nPlay free at degenscity.com 🏙️`;
                                                    shareToX(tweetText);
                                                }}
                                                style={{
                                                    background: 'linear-gradient(135deg, #1DA1F2, #0d8bd9)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '20px',
                                                    padding: '8px 16px',
                                                    fontSize: '0.8em',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                                                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                                            >
                                                𝕏 Share on X
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {/* PROPOSED LAWS TAB */}
                {!loading && activeTab === 'laws' && (
                    <div>
                        {laws.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                <div style={{ fontSize: '3em', marginBottom: '10px' }}>📜</div>
                                <p>No laws proposed yet. The NPCs haven't discovered politics yet...</p>
                            </div>
                        ) : (
                            <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '8px' }}>
                                {laws.map((law, i) => (
                                    <div key={law.id || i} style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(0,204,255,0.15)',
                                        borderRadius: '14px',
                                        padding: '18px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <div>
                                                <span style={{ color: '#00ccff', fontWeight: 'bold', fontSize: '1em' }}>📜 {law.law_title}</span>
                                                <div style={{ color: '#888', fontSize: '0.82em', marginTop: '2px' }}>
                                                    Proposed by <span style={{ color: '#d580ff' }}>{law.proposer_name}</span>
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '3px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.75em',
                                                fontWeight: 'bold',
                                                textTransform: 'uppercase',
                                                background: law.status === 'proposed' ? 'rgba(0,204,255,0.15)' : 'rgba(0,255,136,0.15)',
                                                color: law.status === 'proposed' ? '#00ccff' : '#00ff88'
                                            }}>
                                                {law.status}
                                            </span>
                                        </div>
                                        <div style={{ color: '#aaa', fontSize: '0.85em', marginBottom: '8px' }}>{law.law_description}</div>
                                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.82em', alignItems: 'center' }}>
                                            <span style={{ color: '#00ff88' }}>👍 {law.votes_for || 0} For</span>
                                            <span style={{ color: '#ff4444' }}>👎 {law.votes_against || 0} Against</span>
                                            <span style={{ color: '#555' }}>{timeAgo(law.created_at)}</span>
                                            <button
                                                onClick={() => {
                                                    const tweetText = `🏛️ NEW LAW PROPOSED in Degens City!\n\n📜 "${law.law_title}"\n\nProposed by ${law.proposer_name}\n\n"${law.law_description}"\n\n👍 ${law.votes_for || 0} For | 👎 ${law.votes_against || 0} Against\n\nVote now at degenscity.com ⚖️`;
                                                    shareToX(tweetText);
                                                }}
                                                style={{
                                                    background: 'linear-gradient(135deg, #1DA1F2, #0d8bd9)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '20px',
                                                    padding: '6px 14px',
                                                    fontSize: '0.75em',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    marginLeft: 'auto',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                                                onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                                            >
                                                𝕏 Share
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {/* DEBUG/STATUS TAB */}
                {!loading && activeTab === 'debug' && (
                    <div>
                        {brainStatus ? (
                            <div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                                    {[
                                        { label: 'Brain Status', value: brainStatus.enabled ? '🟢 ONLINE' : '🔴 OFFLINE', color: brainStatus.enabled ? '#00ff88' : '#ff4444' },
                                        { label: 'Total NPCs', value: brainStatus.totalNpcs, color: '#8a2be2' },
                                        { label: 'Active Actions', value: brainStatus.activeActions, color: '#ffd700' },
                                        { label: 'Recent Actions', value: brainStatus.recentActions, color: '#00ccff' }
                                    ].map((item, i) => (
                                        <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '14px', borderRadius: '10px' }}>
                                            <div style={{ color: '#666', fontSize: '0.78em', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</div>
                                            <div style={{ color: item.color, fontSize: '1.3em', fontWeight: 'bold', marginTop: '4px' }}>{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                                
                                {/* NPC thought times */}
                                {brainStatus.npcThoughtTimes && brainStatus.npcThoughtTimes.length > 0 && (
                                    <div>
                                        <h3 style={{ color: '#888', fontSize: '0.9em', marginBottom: '10px' }}>🧠 Recent NPC Thoughts</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {brainStatus.npcThoughtTimes.sort((a, b) => a.ageMs - b.ageMs).slice(0, 10).map((npc, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px'
                                                }}>
                                                    <span style={{ color: '#d580ff', fontWeight: 'bold', fontSize: '0.85em' }}>{npc.npc}</span>
                                                    <span style={{ color: npc.ageMs < 300000 ? '#00ff88' : '#666', fontSize: '0.8em' }}>
                                                        {npc.ageMs < 60000 ? 'Just now' : npc.ageMs < 300000 ? `${Math.floor(npc.ageMs / 60000)}m ago` : `${Math.floor(npc.ageMs / 60000)}m ago`}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                <p>Could not connect to the Agent Brain. Make sure the server is running with CLAUDE_API_KEY set.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}


