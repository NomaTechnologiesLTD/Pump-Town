// ====================================================
// economy.js — Trading, banking, portfolio, economy
// Degens City - Auto-extracted from index.html
// ====================================================

function TradingSection({ playerName, resources, onResourceChange }) {
    const resourceTypes = [
        { id: 'hopium', name: 'HOPIUM', icon: '💊', color: '#00ff88' },
        { id: 'alpha', name: 'ALPHA', icon: '🔮', color: '#ffd700' },
        { id: 'copium', name: 'COPIUM', icon: '😢', color: '#6699ff' },
        { id: 'liquidity', name: 'LIQUIDITY', icon: '💧', color: '#00ccff' }
    ];
    
    // Load trade offers from localStorage
    const [tradeOffers, setTradeOffers] = useState(() => {
        const saved = localStorage.getItem('pumptown_trade_offers');
        if (saved) return JSON.parse(saved);
        
        // Default offers from NPCs
        return [
            { id: 1, trader: 'DiamondHands69', givingType: 'hopium', givingAmount: 100, wantingType: 'alpha', wantingAmount: 20, timestamp: Date.now() - 3600000 },
            { id: 2, trader: 'WhaleWatcher', givingType: 'alpha', givingAmount: 50, wantingType: 'liquidity', wantingAmount: 100, timestamp: Date.now() - 7200000 },
            { id: 3, trader: 'MoonBoi2024', givingType: 'copium', givingAmount: 200, wantingType: 'hopium', wantingAmount: 80, timestamp: Date.now() - 1800000 },
            { id: 4, trader: 'RugSurvivor', givingType: 'liquidity', givingAmount: 75, wantingType: 'alpha', wantingAmount: 30, timestamp: Date.now() - 5400000 }
        ];
    });
    
    const [tradeHistory, setTradeHistory] = useState(() => {
        const saved = localStorage.getItem('pumptown_trade_history');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [activeTab, setActiveTab] = useState('market'); // market, my-offers, history
    const [givingType, setGivingType] = useState('hopium');
    const [givingAmount, setGivingAmount] = useState(50);
    const [wantingType, setWantingType] = useState('alpha');
    const [wantingAmount, setWantingAmount] = useState(10);
    
    // Save to localStorage
    useEffect(() => {
        localStorage.setItem('pumptown_trade_offers', JSON.stringify(tradeOffers));
    }, [tradeOffers]);
    
    useEffect(() => {
        localStorage.setItem('pumptown_trade_history', JSON.stringify(tradeHistory));
    }, [tradeHistory]);
    
    // Get resource icon
    const getResourceIcon = (type) => {
        const resource = resourceTypes.find(r => r.id === type);
        return resource ? resource.icon : '❓';
    };
    
    // Get resource name
    const getResourceName = (type) => {
        const resource = resourceTypes.find(r => r.id === type);
        return resource ? resource.name : type;
    };
    
    // Format time ago
    
    // Create new offer
    const createOffer = () => {
        if (givingAmount <= 0 || wantingAmount <= 0) return;
        if (resources[givingType] < givingAmount) return;
        if (givingType === wantingType) return;
        
        // Deduct resources when creating offer
        onResourceChange(givingType, -givingAmount);
        
        const newOffer = {
            id: Date.now(),
            trader: playerName,
            givingType,
            givingAmount,
            wantingType,
            wantingAmount,
            timestamp: Date.now()
        };
        
        setTradeOffers(prev => [newOffer, ...prev]);
        
        // Reset form
        setGivingAmount(50);
        setWantingAmount(10);
    };
    
    // Accept an offer
    const acceptOffer = (offer) => {
        // Check if player has enough resources
        if (resources[offer.wantingType] < offer.wantingAmount) return;
        
        // Execute trade
        onResourceChange(offer.wantingType, -offer.wantingAmount);
        onResourceChange(offer.givingType, offer.givingAmount);
        
        // Add to history
        const historyEntry = {
            id: Date.now(),
            type: 'completed',
            trader: offer.trader,
            acceptedBy: playerName,
            givingType: offer.givingType,
            givingAmount: offer.givingAmount,
            wantingType: offer.wantingType,
            wantingAmount: offer.wantingAmount,
            timestamp: Date.now()
        };
        
        setTradeHistory(prev => [historyEntry, ...prev].slice(0, 50)); // Keep last 50
        
        // Remove offer
        setTradeOffers(prev => prev.filter(o => o.id !== offer.id));
        
        // Simulate the other trader getting their resources (for NPC trades)
        // In real app this would be server-side
    };
    
    // Cancel my offer
    const cancelOffer = (offer) => {
        // Return resources
        onResourceChange(offer.givingType, offer.givingAmount);
        
        // Add to history
        const historyEntry = {
            id: Date.now(),
            type: 'cancelled',
            trader: offer.trader,
            givingType: offer.givingType,
            givingAmount: offer.givingAmount,
            wantingType: offer.wantingType,
            wantingAmount: offer.wantingAmount,
            timestamp: Date.now()
        };
        
        setTradeHistory(prev => [historyEntry, ...prev].slice(0, 50));
        
        // Remove offer
        setTradeOffers(prev => prev.filter(o => o.id !== offer.id));
    };
    
    // Filter offers based on tab
    const myOffers = tradeOffers.filter(o => o.trader === playerName);
    const marketOffers = tradeOffers.filter(o => o.trader !== playerName);
    
    const canCreateOffer = givingAmount > 0 && 
                           wantingAmount > 0 && 
                           givingType !== wantingType && 
                           resources[givingType] >= givingAmount;
    
    return (
        <div className="trading-section">
            <div className="trading-header">
                <h2>🔄 Trading Post</h2>
                <div style={{ color: '#888', fontSize: '0.9em' }}>
                    {tradeOffers.length} active offers
                </div>
            </div>
            
            <div className="trading-tabs">
                <button 
                    className={`trading-tab ${activeTab === 'market' ? 'active' : ''}`}
                    onClick={() => setActiveTab('market')}
                >
                    🏪 Market ({marketOffers.length})
                </button>
                <button 
                    className={`trading-tab ${activeTab === 'my-offers' ? 'active' : ''}`}
                    onClick={() => setActiveTab('my-offers')}
                >
                    📋 My Offers ({myOffers.length})
                </button>
                <button 
                    className={`trading-tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    📜 History
                </button>
            </div>
            
            {/* Create Offer Form */}
            {(activeTab === 'market' || activeTab === 'my-offers') && (
                <div className="create-offer-form">
                    <h3>Create Trade Offer</h3>
                    <div className="offer-form-row">
                        <div className="offer-form-group">
                            <label>I'm giving</label>
                            <select value={givingType} onChange={(e) => setGivingType(e.target.value)}>
                                {resourceTypes.map(r => (
                                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="offer-form-group">
                            <label>Amount (have: {resources[givingType] || 0})</label>
                            <input 
                                type="number" 
                                value={givingAmount}
                                onChange={(e) => setGivingAmount(Math.max(1, parseInt(e.target.value) || 0))}
                                min="1"
                                max={resources[givingType] || 0}
                            />
                        </div>
                        
                        <div className="offer-arrow">➡️</div>
                        
                        <div className="offer-form-group">
                            <label>I want</label>
                            <select value={wantingType} onChange={(e) => setWantingType(e.target.value)}>
                                {resourceTypes.map(r => (
                                    <option key={r.id} value={r.id}>{r.icon} {r.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="offer-form-group">
                            <label>Amount</label>
                            <input 
                                type="number" 
                                value={wantingAmount}
                                onChange={(e) => setWantingAmount(Math.max(1, parseInt(e.target.value) || 0))}
                                min="1"
                            />
                        </div>
                        
                        <button 
                            className="create-offer-btn"
                            onClick={createOffer}
                            disabled={!canCreateOffer}
                        >
                            📝 Post Offer
                        </button>
                    </div>
                    {givingType === wantingType && (
                        <div style={{ color: '#ff6666', fontSize: '0.85em' }}>
                            ⚠️ Can't trade same resource type
                        </div>
                    )}
                </div>
            )}
            
            {/* Market Offers */}
            {activeTab === 'market' && (
                <div className="trade-offers-list">
                    {marketOffers.length === 0 ? (
                        <div className="no-offers-message">
                            <p>No offers available right now.</p>
                            <p style={{ fontSize: '0.85em' }}>Create an offer or wait for other traders!</p>
                        </div>
                    ) : (
                        marketOffers.map(offer => {
                            const canAccept = resources[offer.wantingType] >= offer.wantingAmount;
                            return (
                                <div key={offer.id} className="trade-offer-card">
                                    <div className="trade-offer-info">
                                        <div className="trade-offer-trader">
                                            👤 {offer.trader}
                                        </div>
                                        <div className="trade-offer-details">
                                            <div className="trade-offer-giving">
                                                <span>Selling:</span>
                                                <strong>{offer.givingAmount} {getResourceIcon(offer.givingType)}</strong>
                                            </div>
                                            <div className="trade-offer-arrow">⇄</div>
                                            <div className="trade-offer-wanting">
                                                <span>For:</span>
                                                <strong>{offer.wantingAmount} {getResourceIcon(offer.wantingType)}</strong>
                                            </div>
                                        </div>
                                        <div className="trade-offer-time">{getTimeAgo(offer.timestamp)}</div>
                                    </div>
                                    <div className="trade-offer-actions">
                                        <button 
                                            className="accept-trade-btn"
                                            onClick={() => acceptOffer(offer)}
                                            disabled={!canAccept}
                                            title={!canAccept ? `Need ${offer.wantingAmount} ${getResourceName(offer.wantingType)}` : 'Accept trade'}
                                        >
                                            ✓ Accept
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
            
            {/* My Offers */}
            {activeTab === 'my-offers' && (
                <div className="trade-offers-list">
                    {myOffers.length === 0 ? (
                        <div className="no-offers-message">
                            <p>You don't have any active offers.</p>
                            <p style={{ fontSize: '0.85em' }}>Create one above to start trading!</p>
                        </div>
                    ) : (
                        myOffers.map(offer => (
                            <div key={offer.id} className="trade-offer-card my-offer">
                                <div className="trade-offer-info">
                                    <div className="trade-offer-trader">
                                        📋 Your Offer
                                    </div>
                                    <div className="trade-offer-details">
                                        <div className="trade-offer-giving">
                                            <span>Selling:</span>
                                            <strong>{offer.givingAmount} {getResourceIcon(offer.givingType)}</strong>
                                        </div>
                                        <div className="trade-offer-arrow">⇄</div>
                                        <div className="trade-offer-wanting">
                                            <span>For:</span>
                                            <strong>{offer.wantingAmount} {getResourceIcon(offer.wantingType)}</strong>
                                        </div>
                                    </div>
                                    <div className="trade-offer-time">Posted {getTimeAgo(offer.timestamp)}</div>
                                </div>
                                <div className="trade-offer-actions">
                                    <button 
                                        className="cancel-trade-btn"
                                        onClick={() => cancelOffer(offer)}
                                    >
                                        ✕ Cancel
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
            
            {/* Trade History */}
            {activeTab === 'history' && (
                <div className="trade-offers-list">
                    {tradeHistory.length === 0 ? (
                        <div className="no-offers-message">
                            <p>No trade history yet.</p>
                            <p style={{ fontSize: '0.85em' }}>Complete some trades to see them here!</p>
                        </div>
                    ) : (
                        tradeHistory.map(entry => (
                            <div key={entry.id} className={`trade-history-item ${entry.type}`}>
                                <div>
                                    <div style={{ color: entry.type === 'completed' ? '#00ff88' : '#ff6666', fontWeight: 'bold' }}>
                                        {entry.type === 'completed' ? '✓ Completed' : '✕ Cancelled'}
                                    </div>
                                    <div style={{ color: '#888', fontSize: '0.9em' }}>
                                        {entry.givingAmount} {getResourceIcon(entry.givingType)} ⇄ {entry.wantingAmount} {getResourceIcon(entry.wantingType)}
                                    </div>
                                    {entry.acceptedBy && (
                                        <div style={{ color: '#666', fontSize: '0.8em' }}>
                                            {entry.trader} → {entry.acceptedBy}
                                        </div>
                                    )}
                                </div>
                                <div style={{ color: '#666', fontSize: '0.8em' }}>
                                    {getTimeAgo(entry.timestamp)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== TUTORIAL/ONBOARDING ====================

function BankSection({ resources, onResourceChange, showToast }) {
    const [stakes, setStakes] = useState(() => {
        const saved = localStorage.getItem('pumptown_stakes');
        return saved ? JSON.parse(saved) : [];
    });
    const [stakeAmounts, setStakeAmounts] = useState({});
    
    const stakingPools = [
        { 
            id: 'hopium_flex', 
            name: 'HOPIUM Flex', 
            icon: '💊', 
            resource: 'hopium',
            apy: 15, 
            lockDays: 0, 
            minStake: 100,
            description: 'No lock period, withdraw anytime'
        },
        { 
            id: 'hopium_30', 
            name: 'HOPIUM 30-Day', 
            icon: '💊', 
            resource: 'hopium',
            apy: 45, 
            lockDays: 30, 
            minStake: 500,
            description: '30-day lock for higher returns'
        },
        { 
            id: 'alpha_vault', 
            name: 'ALPHA Vault', 
            icon: '🔮', 
            resource: 'alpha',
            apy: 25, 
            lockDays: 7, 
            minStake: 50,
            description: '7-day lock period'
        },
        { 
            id: 'liquidity_pool', 
            name: 'Liquidity Pool', 
            icon: '💧', 
            resource: 'liquidity',
            apy: 60, 
            lockDays: 14, 
            minStake: 200,
            description: 'Provide liquidity, earn rewards'
        }
    ];
    
    // Save stakes
    useEffect(() => {
        localStorage.setItem('pumptown_stakes', JSON.stringify(stakes));
    }, [stakes]);
    
    // Process rewards every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setStakes(prev => prev.map(stake => {
                const pool = stakingPools.find(p => p.id === stake.poolId);
                if (!pool) return stake;
                
                // Calculate rewards (APY / 365 / 24 / 60 for per-minute)
                const minuteRate = pool.apy / 100 / 365 / 24 / 60;
                const newRewards = stake.amount * minuteRate;
                
                return {
                    ...stake,
                    pendingRewards: (stake.pendingRewards || 0) + newRewards
                };
            }));
        }, 60000);
        
        return () => clearInterval(interval);
    }, []);
    
    const handleStake = (pool) => {
        const amount = parseInt(stakeAmounts[pool.id]) || 0;
        
        if (amount < pool.minStake) {
            showToast(`Minimum stake is ${pool.minStake} ${pool.resource.toUpperCase()}`, 'error');
            return;
        }
        
        if ((resources[pool.resource] || 0) < amount) {
            showToast(`Not enough ${pool.resource.toUpperCase()}!`, 'error');
            return;
        }
        
        onResourceChange(pool.resource, -amount);
        
        const newStake = {
            id: Date.now(),
            poolId: pool.id,
            resource: pool.resource,
            amount,
            stakedAt: Date.now(),
            unlockAt: pool.lockDays > 0 ? Date.now() + (pool.lockDays * 24 * 60 * 60 * 1000) : null,
            pendingRewards: 0
        };
        
        setStakes(prev => [...prev, newStake]);
        setStakeAmounts(prev => ({ ...prev, [pool.id]: '' }));
        showToast(`Staked ${amount} ${pool.resource.toUpperCase()}!`, 'success');
    };
    
    const handleUnstake = (stake) => {
        if (stake.unlockAt && Date.now() < stake.unlockAt) {
            showToast('Stake is still locked!', 'error');
            return;
        }
        
        const totalReturn = stake.amount + Math.floor(stake.pendingRewards || 0);
        onResourceChange(stake.resource, totalReturn);
        
        setStakes(prev => prev.filter(s => s.id !== stake.id));
        showToast(`Unstaked ${stake.amount} + ${Math.floor(stake.pendingRewards || 0)} rewards!`, 'success');
    };
    
    const handleClaimRewards = (stake) => {
        const rewards = Math.floor(stake.pendingRewards || 0);
        if (rewards < 1) {
            showToast('No rewards to claim yet!', 'error');
            return;
        }
        
        onResourceChange(stake.resource, rewards);
        setStakes(prev => prev.map(s => 
            s.id === stake.id ? { ...s, pendingRewards: 0 } : s
        ));
        showToast(`Claimed ${rewards} ${stake.resource.toUpperCase()}!`, 'success');
    };
    
    const getPoolStakes = (poolId) => stakes.filter(s => s.poolId === poolId);
    const getTotalStaked = (poolId) => getPoolStakes(poolId).reduce((sum, s) => sum + s.amount, 0);
    
    return (
        <div className="bank-section">
            <div className="bank-header">
                <h2>🏦 Degens City Bank</h2>
                <div className="bank-balance">
                    Total Staked: {stakes.reduce((sum, s) => sum + s.amount, 0).toLocaleString()}
                </div>
            </div>
            
            <div className="staking-pools">
                {stakingPools.map(pool => {
                    const poolStakes = getPoolStakes(pool.id);
                    const totalStaked = getTotalStaked(pool.id);
                    const hasActiveStake = poolStakes.length > 0;
                    
                    return (
                        <div key={pool.id} className={`staking-pool ${hasActiveStake ? 'active' : ''}`}>
                            <div className="pool-header">
                                <div className="pool-name">
                                    <span>{pool.icon}</span>
                                    {pool.name}
                                </div>
                                <div className="pool-apy">{pool.apy}% APY</div>
                            </div>
                            
                            <p style={{ color: '#888', fontSize: '0.85em', marginBottom: '15px' }}>
                                {pool.description}
                            </p>
                            
                            <div className="pool-stats">
                                <div className="pool-stat">
                                    <div className="pool-stat-label">Your Stake</div>
                                    <div className="pool-stat-value">{totalStaked.toLocaleString()}</div>
                                </div>
                                <div className="pool-stat">
                                    <div className="pool-stat-label">Pending</div>
                                    <div className="pool-stat-value" style={{ color: '#00ff88' }}>
                                        +{poolStakes.reduce((sum, s) => sum + (s.pendingRewards || 0), 0).toFixed(1)}
                                    </div>
                                </div>
                            </div>
                            
                            {!hasActiveStake ? (
                                <>
                                    <div className="pool-input">
                                        <input 
                                            type="number"
                                            placeholder={`Min ${pool.minStake}`}
                                            value={stakeAmounts[pool.id] || ''}
                                            onChange={(e) => setStakeAmounts(prev => ({ ...prev, [pool.id]: e.target.value }))}
                                        />
                                    </div>
                                    <button 
                                        className="stake-btn"
                                        onClick={() => handleStake(pool)}
                                        disabled={!stakeAmounts[pool.id]}
                                    >
                                        Stake {pool.resource.toUpperCase()}
                                    </button>
                                </>
                            ) : (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button 
                                        className="stake-btn"
                                        onClick={() => handleClaimRewards(poolStakes[0])}
                                        style={{ flex: 1 }}
                                    >
                                        Claim Rewards
                                    </button>
                                    <button 
                                        className="stake-btn unstake"
                                        onClick={() => handleUnstake(poolStakes[0])}
                                        style={{ flex: 1 }}
                                        disabled={poolStakes[0].unlockAt && Date.now() < poolStakes[0].unlockAt}
                                    >
                                        {poolStakes[0].unlockAt && Date.now() < poolStakes[0].unlockAt 
                                            ? `Locked ${Math.ceil((poolStakes[0].unlockAt - Date.now()) / 86400000)}d`
                                            : 'Unstake'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ==================== CASINO / GAMBLING ====================

function PortfolioSimulator({ playerName, resources, onResourceChange, showToast, onTradeComplete }) {
    const [portfolio, setPortfolio] = useState([]);
    const [allCoins, setAllCoins] = useState([]);
    const [prices, setPrices] = useState({});
    const [buyAmount, setBuyAmount] = useState(100);
    const [selectedCoin, setSelectedCoin] = useState('bitcoin');
    const [searchTerm, setSearchTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [sortBy, setSortBy] = useState('rank'); // rank, price, change
    const [loading, setLoading] = useState(true);
    const [portfolioLoaded, setPortfolioLoaded] = useState(false);
    
    // Load portfolio from database on mount
    useEffect(() => {
        const loadPortfolio = async () => {
            if (!playerName || playerName === 'Guest') {
                // Guest users use localStorage
                const saved = localStorage.getItem('pumptown_portfolio');
                setPortfolio(saved ? JSON.parse(saved) : []);
                setPortfolioLoaded(true);
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/player/holdings/${encodeURIComponent(playerName)}`);
                const data = await response.json();
                if (data.success && data.holdings) {
                    // Convert server format to local format
                    const holdings = data.holdings.map(h => ({
                        id: h.id,
                        symbol: h.symbol,
                        amount: h.amount,
                        invested: h.invested,
                        buyPrice: h.avgBuyPrice
                    }));
                    setPortfolio(holdings);
                    // Also save to localStorage as backup
                    localStorage.setItem('pumptown_portfolio', JSON.stringify(holdings));
                }
            } catch (err) {
                console.error('Failed to load portfolio from server:', err);
                // Fallback to localStorage
                const saved = localStorage.getItem('pumptown_portfolio');
                setPortfolio(saved ? JSON.parse(saved) : []);
            }
            setPortfolioLoaded(true);
        };
        loadPortfolio();
    }, [playerName]);
    
    // Save to localStorage as backup whenever portfolio changes
    useEffect(() => {
        if (portfolioLoaded) {
            localStorage.setItem('pumptown_portfolio', JSON.stringify(portfolio));
        }
    }, [portfolio, portfolioLoaded]);
    
    // Fetch top 100 coins from CoinGecko
    useEffect(() => {
        const fetchCoins = async () => {
            try {
                const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h');
                const data = await response.json();
                
                if (Array.isArray(data)) {
                    const formattedCoins = data.map((coin, index) => ({
                        id: coin.id,
                        symbol: coin.symbol?.toUpperCase() || '???',
                        name: coin.name,
                        image: coin.image,
                        rank: index + 1,
                        price: coin.current_price,
                        change: coin.price_change_percentage_24h || 0,
                        marketCap: coin.market_cap
                    })).filter(c => c.price);
                    
                    setAllCoins(formattedCoins);
                    
                    // Build prices object
                    const pricesObj = {};
                    formattedCoins.forEach(c => {
                        pricesObj[c.id] = { usd: c.price, change: c.change, image: c.image, symbol: c.symbol };
                    });
                    setPrices(pricesObj);
                    
                    if (formattedCoins.length > 0 && !formattedCoins.find(c => c.id === selectedCoin)) {
                        setSelectedCoin(formattedCoins[0].id);
                    }
                }
                setLoading(false);
            } catch (err) {
                console.error('Error fetching coins:', err);
                // Fallback coins
                const fallback = [
                    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 100000, change: 2.5, rank: 1 },
                    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', price: 3500, change: 1.8, rank: 2 },
                    { id: 'solana', symbol: 'SOL', name: 'Solana', price: 180, change: 3.2, rank: 3 }
                ];
                setAllCoins(fallback);
                setLoading(false);
            }
        };
        
        fetchCoins();
        const interval = setInterval(fetchCoins, 60000);
        return () => clearInterval(interval);
    }, []);
    
    // Filter and sort coins
    const filteredCoins = allCoins
        .filter(coin => 
            coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => {
            if (sortBy === 'price') return b.price - a.price;
            if (sortBy === 'change') return b.change - a.change;
            return a.rank - b.rank;
        });
    
    const selectedCoinData = allCoins.find(c => c.id === selectedCoin);
    
    const buyToken = async () => {
        const coin = allCoins.find(c => c.id === selectedCoin);
        const price = prices[selectedCoin]?.usd;
        if (!price || !coin) return;
        
        if (resources.hopium < buyAmount) {
            showToast('Not enough HOPIUM!', 'error');
            return;
        }
        
        onResourceChange('hopium', -buyAmount);
        
        const amount = buyAmount / price;
        
        // Save to database if logged in
        if (playerName && playerName !== 'Guest') {
            try {
                await fetch(`${API_BASE}/api/player/trade/buy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        playerName,
                        coinId: selectedCoin,
                        symbol: coin.symbol,
                        amount,
                        price,
                        total: buyAmount
                    })
                });
            } catch (err) {
                console.error('Failed to save trade:', err);
            }
        }
        
        setPortfolio(prev => {
            const existing = prev.find(p => p.id === selectedCoin);
            if (existing) {
                return prev.map(p => p.id === selectedCoin ? {
                    ...p,
                    amount: p.amount + amount,
                    invested: p.invested + buyAmount
                } : p);
            }
            return [...prev, {
                id: selectedCoin,
                symbol: coin.symbol,
                name: coin.name,
                image: coin.image,
                amount: amount,
                invested: buyAmount,
                buyPrice: price
            }];
        });
        
        // Track trade for achievements
        if (onTradeComplete) onTradeComplete(buyAmount);
        
        showToast(`Bought ${amount.toFixed(6)} ${coin.symbol}!`, 'success');
    };
    
    const sellToken = async (coinId) => {
        const holding = portfolio.find(p => p.id === coinId);
        const price = prices[coinId]?.usd;
        if (!holding || !price) return;
        
        const value = holding.amount * price;
        
        // Save to database if logged in
        if (playerName && playerName !== 'Guest') {
            try {
                await fetch(`${API_BASE}/api/player/trade/sell`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        playerName,
                        coinId,
                        symbol: holding.symbol,
                        amount: holding.amount,
                        price
                    })
                });
            } catch (err) {
                console.error('Failed to save trade:', err);
            }
        }
        
        onResourceChange('hopium', Math.floor(value));
        setPortfolio(prev => prev.filter(p => p.id !== coinId));
        
        // Track trade for achievements
        if (onTradeComplete) onTradeComplete(Math.floor(value));
        
        const pnl = value - holding.invested;
        showToast(`Sold for ${Math.floor(value)} HOPIUM (${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)})`, pnl >= 0 ? 'success' : 'error');
    };
    
    const totalValue = portfolio.reduce((sum, p) => sum + (p.amount * (prices[p.id]?.usd || 0)), 0);
    const totalInvested = portfolio.reduce((sum, p) => sum + p.invested, 0);
    const totalPnL = totalValue - totalInvested;
    const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    
    
    return (
        <div className="portfolio-section">
            <div className="portfolio-header">
                <div>
                    <h2 style={{ color: '#0064c8', margin: 0 }}>💼 Portfolio Simulator</h2>
                    <p style={{ color: '#888', fontSize: '0.85em', margin: '5px 0 0 0' }}>Trade top 100 cryptos with REAL prices!</p>
                </div>
                <div className="portfolio-total">
                    <div className="portfolio-total-value">${totalValue.toFixed(2)}</div>
                    <div className={`portfolio-total-change ${totalPnL >= 0 ? 'positive' : 'negative'}`} style={{ color: totalPnL >= 0 ? '#00ff88' : '#ff4444' }}>
                        {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} ({totalPnLPercent.toFixed(2)}%)
                    </div>
                </div>
            </div>
            
            {/* Coin Selection with Search */}
            <div style={{ position: 'relative', marginBottom: '15px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setShowDropdown(true); }}
                        onFocus={() => setShowDropdown(true)}
                        placeholder="🔍 Search 100 coins..."
                        style={{
                            background: 'rgba(0,0,0,0.4)',
                            border: '2px solid #0064c8',
                            borderRadius: '10px',
                            padding: '10px 15px',
                            color: '#fff',
                            flex: '1'
                        }}
                    />
                    <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            background: 'rgba(0,0,0,0.4)',
                            border: '2px solid #333',
                            borderRadius: '10px',
                            padding: '10px',
                            color: '#888',
                            width: '120px'
                        }}
                    >
                        <option value="rank">By Rank</option>
                        <option value="price">By Price</option>
                        <option value="change">By Change</option>
                    </select>
                </div>
                
                {/* Selected Coin Display */}
                {selectedCoinData && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 15px',
                        background: 'rgba(0, 100, 200, 0.2)',
                        borderRadius: '10px',
                        marginBottom: '10px',
                        border: '2px solid #0064c8'
                    }}>
                        {selectedCoinData.image && (
                            <img src={selectedCoinData.image} alt={selectedCoinData.symbol} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                        )}
                        <div style={{ flex: 1 }}>
                            <div style={{ color: '#fff', fontWeight: 'bold' }}>
                                #{selectedCoinData.rank} {selectedCoinData.name} ({selectedCoinData.symbol})
                            </div>
                            <div style={{ color: '#888', fontSize: '0.85em' }}>
                                {formatPrice(selectedCoinData.price)}
                                <span style={{ color: selectedCoinData.change >= 0 ? '#00ff88' : '#ff4444', marginLeft: '10px' }}>
                                    {selectedCoinData.change >= 0 ? '▲' : '▼'} {Math.abs(selectedCoinData.change).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                        <button onClick={() => setShowDropdown(!showDropdown)} style={{ background: 'none', border: 'none', color: '#0064c8', cursor: 'pointer', fontSize: '1.2em' }}>
                            {showDropdown ? '▲' : '▼'}
                        </button>
                    </div>
                )}
                
                {/* Dropdown List */}
                {showDropdown && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'rgba(20, 20, 40, 0.98)',
                        border: '2px solid #0064c8',
                        borderRadius: '10px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 100
                    }}>
                        {loading ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading coins...</div>
                        ) : filteredCoins.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No coins found</div>
                        ) : (
                            filteredCoins.slice(0, 50).map(coin => (
                                <div
                                    key={coin.id}
                                    onClick={() => { setSelectedCoin(coin.id); setShowDropdown(false); setSearchTerm(''); }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 15px',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        background: coin.id === selectedCoin ? 'rgba(0, 100, 200, 0.3)' : 'transparent'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 100, 200, 0.2)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = coin.id === selectedCoin ? 'rgba(0, 100, 200, 0.3)' : 'transparent'}
                                >
                                    {coin.image ? (
                                        <img src={coin.image} alt={coin.symbol} style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                    ) : (
                                        <span style={{ width: '24px', textAlign: 'center' }}>🪙</span>
                                    )}
                                    <span style={{ color: '#666', width: '35px' }}>#{coin.rank}</span>
                                    <span style={{ color: '#fff', flex: 1 }}>{coin.symbol}</span>
                                    <span style={{ color: '#888' }}>{formatPrice(coin.price)}</span>
                                    <span style={{ color: coin.change >= 0 ? '#00ff88' : '#ff4444', width: '70px', textAlign: 'right' }}>
                                        {coin.change >= 0 ? '+' : ''}{coin.change?.toFixed(1)}%
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
            
            {/* Buy Interface */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <input 
                    type="number"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(Number(e.target.value))}
                    placeholder="HOPIUM amount"
                    style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '2px solid #0064c8',
                        borderRadius: '10px',
                        padding: '10px 15px',
                        color: '#fff',
                        flex: '1',
                        minWidth: '120px'
                    }}
                />
                <div style={{ display: 'flex', gap: '5px' }}>
                    {[100, 500, 1000, 5000].map(amt => (
                        <button
                            key={amt}
                            onClick={() => setBuyAmount(amt)}
                            style={{
                                background: buyAmount === amt ? '#0064c8' : 'rgba(0,100,200,0.2)',
                                border: '1px solid #0064c8',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '0.85em'
                            }}
                        >
                            {amt >= 1000 ? `${amt/1000}k` : amt}
                        </button>
                    ))}
                </div>
                <button 
                    onClick={buyToken}
                    style={{
                        background: 'linear-gradient(135deg, #00ff88, #00cc66)',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '10px 30px',
                        color: '#000',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    🛒 Buy
                </button>
            </div>
            
            {/* Holdings */}
            {portfolio.length > 0 ? (
                <div className="portfolio-holdings">
                    <h3 style={{ color: '#fff', marginBottom: '15px' }}>📊 Your Holdings ({portfolio.length})</h3>
                    {portfolio.map(holding => {
                        const currentPrice = prices[holding.id]?.usd || 0;
                        const currentValue = holding.amount * currentPrice;
                        const pnl = currentValue - holding.invested;
                        const pnlPercent = holding.invested > 0 ? (pnl / holding.invested) * 100 : 0;
                        
                        return (
                            <div key={holding.id} className="portfolio-holding">
                                <div className="holding-info">
                                    {holding.image ? (
                                        <img src={holding.image} alt={holding.symbol} style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                                    ) : (
                                        <span className="holding-icon">🪙</span>
                                    )}
                                    <div className="holding-details">
                                        <span className="holding-name">{holding.symbol}</span>
                                        <span className="holding-amount">{holding.amount.toFixed(6)} @ {formatPrice(holding.buyPrice)}</span>
                                    </div>
                                </div>
                                <div className="holding-value">
                                    <div className="holding-current">${currentValue.toFixed(2)}</div>
                                    <div className="holding-pnl" style={{ color: pnl >= 0 ? '#00ff88' : '#ff4444' }}>
                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} ({pnlPercent.toFixed(1)}%)
                                    </div>
                                </div>
                                <button 
                                    onClick={() => sellToken(holding.id)}
                                    style={{
                                        background: '#ff4444',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '8px 15px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        marginLeft: '15px'
                                    }}
                                >
                                    Sell
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                    No holdings yet. Buy some crypto above! 📈
                </div>
            )}
        </div>
    );
}

// ==================== AIRDROP SYSTEM ====================

function PortfolioRoast({ playerName }) {
    const [roasting, setRoasting] = useState(false);
    const [roast, setRoast] = useState(null);
    const [expanded, setExpanded] = useState(false);
    
    const getPortfolio = () => {
        const saved = localStorage.getItem('pumptown_portfolio');
        return saved ? JSON.parse(saved) : [];
    };
    
    const generateRoast = async () => {
        const portfolio = getPortfolio();
        
        if (portfolio.length === 0) {
            setRoast({
                type: 'empty',
                mayorComment: "Ser... you have NO portfolio?! 😭 Not even a single satoshi? You're not even gambling, you're just... watching others gamble. That's somehow sadder than losing money. At least apes have conviction! Go buy something, ANYTHING, and then come back so I can properly roast your choices. 📉👀",
                rating: 'N/A',
                emoji: '👻'
            });
            return;
        }
        
        setRoasting(true);
        
        // Format portfolio for the AI
        const holdings = portfolio.map(h => `${h.symbol}: ${h.amount.toFixed(4)} (bought at $${h.avgPrice?.toFixed(2) || '?'})`).join(', ');
        
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Roast this citizen's crypto portfolio. Be funny and savage but also give real talk about their choices. Here's what they're holding: ${holdings}`,
                    playerName: playerName || 'Anonymous Degen',
                    playerLevel: 1,
                    xUserContext: {
                        query: 'portfolio_roast',
                        info: `PORTFOLIO ROAST REQUEST. Holdings: ${holdings}. 
                        
                        Give a savage but entertaining roast of their portfolio. Consider:
                        - Are they too heavy in one coin? (bad diversification)
                        - Are they holding memecoins? (degen energy)
                        - Are they playing it safe with only BTC/ETH? (boring but smart)
                        - Did they buy at likely bad prices?
                        - What does their portfolio say about them as a person?
                        
                        End with a 1-5 degen rating:
                        ⭐ = Boomer portfolio (all BTC/ETH)
                        ⭐⭐ = Playing it safe
                        ⭐⭐⭐ = Balanced degen
                        ⭐⭐⭐⭐ = True degen
                        ⭐⭐⭐⭐⭐ = Maximum degen (mostly memecoins)
                        
                        Keep it fun, 2-4 sentences max, then the rating.`
                    }
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Extract rating from response
                const starMatch = data.response.match(/⭐+/);
                const rating = starMatch ? starMatch[0] : '⭐⭐⭐';
                
                setRoast({
                    type: 'roast',
                    mayorComment: data.response,
                    holdings: portfolio,
                    rating: rating,
                    emoji: rating.length >= 4 ? '🔥' : rating.length >= 3 ? '😎' : '😴'
                });
            } else {
                throw new Error('Failed to get roast');
            }
        } catch (error) {
            // Fallback roast based on portfolio analysis
            const fallbackRoast = generateFallbackRoast(portfolio);
            setRoast(fallbackRoast);
        }
        
        setRoasting(false);
    };
    
    const generateFallbackRoast = (portfolio) => {
        const symbols = portfolio.map(h => h.symbol.toUpperCase());
        const hasBTC = symbols.includes('BTC');
        const hasETH = symbols.includes('ETH');
        const hasMeme = symbols.some(s => ['DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF'].includes(s));
        const holdingCount = portfolio.length;
        
        let comment = '';
        let rating = '⭐⭐⭐';
        let emoji = '😎';
        
        if (holdingCount === 1) {
            comment = `All-in on ${symbols[0]}? Either you're a genius or you're about to learn an expensive lesson about diversification. No in-between ser. 🎲`;
            rating = symbols[0] === 'BTC' ? '⭐⭐' : '⭐⭐⭐⭐';
        } else if (hasBTC && hasETH && !hasMeme && holdingCount <= 3) {
            comment = "BTC and ETH only? Ser, this is a casino, not a retirement fund! Where's the degen energy? Your portfolio has the personality of plain oatmeal. Safe? Yes. Exciting? Absolutely not. 😴";
            rating = '⭐';
            emoji = '😴';
        } else if (hasMeme && !hasBTC && !hasETH) {
            comment = "100% memecoins and no BTC/ETH?! 💀 You're either going to Valhalla or the shadow realm, no in-between. This portfolio screams 'I get my financial advice from Twitter.' Respect the conviction though. 🚀";
            rating = '⭐⭐⭐⭐⭐';
            emoji = '🔥';
        } else if (holdingCount > 7) {
            comment = `${holdingCount} different coins?! Ser, this isn't Pokemon, you don't have to catch them all! This portfolio looks like you bought everything anyone ever shilled you. Classic degen move. 📊`;
            rating = '⭐⭐⭐⭐';
            emoji = '🎰';
        } else {
            comment = "A balanced mix of majors and alts. Not too safe, not too degen. You're the 'I've been in crypto for a few cycles' type. Could use more memecoins if you want to really gamble though. 😏";
            rating = '⭐⭐⭐';
            emoji = '😎';
        }
        
        return {
            type: 'roast',
            mayorComment: comment + `\n\nDegen Rating: ${rating}`,
            holdings: portfolio,
            rating,
            emoji
        };
    };
    
    const shareRoast = () => {
        if (!roast) return;
        const text = `🎩 Mayor Satoshi roasted my portfolio!\n\n"${roast.mayorComment.substring(0, 150)}..."\n\nDegen Rating: ${roast.rating} ${roast.emoji}\n\nGet roasted at degenscity.com 🔥`;
        shareToX(text);
    };
    
    const portfolio = getPortfolio();
    
    return (
        <div className="portfolio-roast">
            <div 
                className="portfolio-roast-header"
                onClick={() => setExpanded(!expanded)}
                style={{ cursor: 'pointer' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔥</span>
                    <span>Portfolio Roast</span>
                    {roast && (
                        <span className="roast-rating-badge">{roast.rating}</span>
                    )}
                </div>
                <span style={{ color: '#888' }}>{expanded ? '▼' : '▶'}</span>
            </div>
            
            {expanded && (
                <div className="portfolio-roast-content">
                    {/* Current Holdings Summary */}
                    <div className="roast-holdings-summary">
                        <div className="holdings-count">
                            <span className="count-value">{portfolio.length}</span>
                            <span className="count-label">Holdings</span>
                        </div>
                        <div className="holdings-list">
                            {portfolio.length === 0 ? (
                                <span style={{ color: '#666' }}>No holdings yet</span>
                            ) : (
                                portfolio.slice(0, 5).map((h, idx) => (
                                    <span key={idx} className="holding-chip">{h.symbol}</span>
                                ))
                            )}
                            {portfolio.length > 5 && (
                                <span className="holding-chip more">+{portfolio.length - 5}</span>
                            )}
                        </div>
                    </div>
                    
                    {/* Roast Button */}
                    <button 
                        className="roast-me-btn"
                        onClick={generateRoast}
                        disabled={roasting}
                    >
                        {roasting ? (
                            <>🤔 Mayor is judging...</>
                        ) : (
                            <>🔥 Roast My Portfolio</>
                        )}
                    </button>
                    
                    {/* Roast Result */}
                    {roast && (
                        <div className="roast-result">
                            <div className="roast-result-header">
                                <span style={{ fontSize: '1.5em' }}>{roast.emoji}</span>
                                <span className="roast-rating">{roast.rating}</span>
                            </div>
                            
                            <div className="roast-comment">
                                <span className="mayor-icon">🎩</span>
                                {roast.mayorComment}
                            </div>
                            
                            <button className="share-roast-btn" onClick={shareRoast}>
                                📤 Share Roast
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== CITIZEN ACTIONS (SUE, PROPOSE LAW, etc.) ====================

function EconomyPanel({ resources }) {
    const [priceHistory, setPriceHistory] = useState(() => {
        // Generate fake price history
        const history = [];
        let price = 100;
        for (let i = 0; i < 24; i++) {
            price = price + (Math.random() - 0.48) * 10;
            price = Math.max(50, Math.min(200, price));
            history.push(price);
        }
        return history;
    });
    
    const [currentPrices, setCurrentPrices] = useState({
        hopium: 1.0,
        alpha: 5.0,
        copium: 0.5,
        liquidity: 2.5
    });
    
    // Update prices periodically
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPrices(prev => ({
                hopium: Math.max(0.5, Math.min(2, prev.hopium + (Math.random() - 0.5) * 0.1)),
                alpha: Math.max(2, Math.min(10, prev.alpha + (Math.random() - 0.5) * 0.5)),
                copium: Math.max(0.1, Math.min(1, prev.copium + (Math.random() - 0.5) * 0.05)),
                liquidity: Math.max(1, Math.min(5, prev.liquidity + (Math.random() - 0.5) * 0.2))
            }));
            
            setPriceHistory(prev => {
                const newHistory = [...prev.slice(1)];
                const lastPrice = prev[prev.length - 1];
                newHistory.push(lastPrice + (Math.random() - 0.48) * 10);
                return newHistory;
            });
        }, 5000);
        
        return () => clearInterval(interval);
    }, []);
    
    const maxPrice = Math.max(...priceHistory);
    const minPrice = Math.min(...priceHistory);
    const range = maxPrice - minPrice || 1;
    
    const portfolioValue = 
        (resources.hopium * currentPrices.hopium) +
        (resources.alpha * currentPrices.alpha) +
        (resources.copium * currentPrices.copium) +
        (resources.liquidity * currentPrices.liquidity);
    
    return (
        <div className="economy-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ color: '#ffd700', margin: 0 }}>📈 Resource Market</h3>
                <div style={{ color: '#00ff88', fontWeight: 'bold' }}>
                    Portfolio: {'$'}{portfolioValue.toFixed(2)}
                </div>
            </div>
            
            {/* Mini price chart */}
            <div className="price-chart">
                {priceHistory.map((price, idx) => {
                    const height = ((price - minPrice) / range) * 80 + 10;
                    const isUp = idx > 0 && price >= priceHistory[idx - 1];
                    return (
                        <div 
                            key={idx} 
                            className={`price-bar ${isUp ? '' : 'down'}`}
                            style={{ height: `${height}%` }}
                        />
                    );
                })}
            </div>
            
            {/* Current prices */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px 30px', marginTop: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>💊 HOPIUM</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{'$'}{currentPrices.hopium.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🔮 ALPHA</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{'$'}{currentPrices.alpha.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>😢 COPIUM</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{'$'}{currentPrices.copium.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>💧 LIQUIDITY</span>
                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{'$'}{currentPrices.liquidity.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}

// ==================== SOUND TOGGLE ====================

function LivePriceTicker() {
    const [prices, setPrices] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const fetchPrices = async () => {
        try {
            // Fetch top 100 cryptocurrencies by market cap from CoinGecko
            const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h');
            const data = await response.json();
            
            if (Array.isArray(data)) {
                const formattedPrices = data.map((coin, index) => ({
                    rank: index + 1,
                    symbol: coin.symbol?.toUpperCase() || '???',
                    name: coin.name,
                    image: coin.image,
                    price: coin.current_price,
                    change: coin.price_change_percentage_24h,
                    marketCap: coin.market_cap
                })).filter(p => p.price);
                
                setPrices(formattedPrices);
            }
            setLoading(false);
        } catch (err) {
            console.error('Error fetching prices:', err);
            // Fallback to basic coins if API fails
            setPrices([
                { rank: 1, symbol: 'BTC', name: 'Bitcoin', price: 100000, change: 2.5 },
                { rank: 2, symbol: 'ETH', name: 'Ethereum', price: 3500, change: 1.8 },
                { rank: 3, symbol: 'SOL', name: 'Solana', price: 150, change: 3.2 }
            ]);
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchPrices();
        const interval = setInterval(fetchPrices, 60000); // Update every 60s (rate limit friendly)
        return () => clearInterval(interval);
    }, []);
    
    if (loading || prices.length === 0) return null;
    
    return (
        <div className="price-ticker">
            <div className="ticker-content">
                {[...prices, ...prices].map((coin, idx) => (
                    <div key={idx} className="ticker-item">
                        {coin.image ? (
                            <img 
                                src={coin.image} 
                                alt={coin.symbol}
                                style={{ 
                                    width: '18px', 
                                    height: '18px', 
                                    borderRadius: '50%',
                                    marginRight: '4px'
                                }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        ) : (
                            <span style={{ fontSize: '1em', marginRight: '4px' }}>🪙</span>
                        )}
                        <span className="ticker-symbol">{coin.symbol}</span>
                        <span className="ticker-price">{formatPrice(coin.price)}</span>
                        <span className={`ticker-change ${coin.change >= 0 ? 'positive' : 'negative'}`}>
                            {coin.change >= 0 ? '▲' : '▼'} {Math.abs(coin.change || 0).toFixed(2)}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================== FEAR & GREED INDEX ====================
// ==================== CITY PULSE (LIVE ENGINE DATA) ====================

function MemecoinLauncher({ resources, onResourceChange, showToast }) {
    const [coinName, setCoinName] = useState('');
    const [coinTicker, setCoinTicker] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('🚀');
    const [launchedCoins, setLaunchedCoins] = useState(() => {
        const saved = localStorage.getItem('pumptown_launched_coins');
        if (!saved) return [];
        
        // Migrate old format to new format
        const coins = JSON.parse(saved);
        return coins.map(coin => {
            // If coin has old priceHistory format, convert to candles
            if (coin.priceHistory && !coin.candles) {
                const candles = [];
                for (let i = 0; i < coin.priceHistory.length; i++) {
                    const price = coin.priceHistory[i];
                    const prevPrice = coin.priceHistory[i - 1] || price;
                    candles.push({
                        open: prevPrice,
                        close: price,
                        high: Math.max(prevPrice, price) * 1.01,
                        low: Math.min(prevPrice, price) * 0.99,
                        volume: Math.floor(Math.random() * 100) + 20
                    });
                }
                return { ...coin, candles, priceHistory: undefined };
            }
            // If no candles at all, create initial ones
            if (!coin.candles) {
                return { ...coin, candles: [{ open: coin.launchPrice, close: coin.currentPrice, high: coin.currentPrice * 1.01, low: coin.launchPrice * 0.99, volume: 50 }] };
            }
            return coin;
        });
    });
    const [selectedCoin, setSelectedCoin] = useState(null);
    const [viralEvent, setViralEvent] = useState(null);
    
    // Fun emoji options for coin branding
    const emojiOptions = ['🚀', '🐕', '🐸', '🦊', '🐱', '🦍', '🌙', '💎', '🔥', '⚡', '🎮', '👽', '🤖', '🦄', '🐋', '🍕', '🌮', '🍌', '🥜', '💀'];
    
    // Random name generators
    const prefixes = ['Doge', 'Pepe', 'Shiba', 'Moon', 'Safe', 'Baby', 'Floki', 'Turbo', 'Giga', 'Chad', 'Based', 'King', 'Wojak', 'Smol', 'Big', 'Super', 'Mega', 'Ultra', 'Elon', 'Trump'];
    const suffixes = ['Inu', 'Moon', 'Rocket', 'Coin', 'Token', 'Cash', 'Swap', 'Fi', 'DAO', 'Pump', 'Doge', 'Cat', 'Frog', 'Wif', 'Hat', 'AI', 'GPT', 'Chain', 'Verse', 'World'];
    
    const generateRandomName = () => {
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const name = prefix + suffix;
        const ticker = (prefix.slice(0, 2) + suffix.slice(0, 2)).toUpperCase();
        setCoinName(name);
        setCoinTicker(ticker);
        setSelectedEmoji(emojiOptions[Math.floor(Math.random() * emojiOptions.length)]);
    };
    
    useEffect(() => {
        localStorage.setItem('pumptown_launched_coins', JSON.stringify(launchedCoins));
    }, [launchedCoins]);
    
    // Generate OHLC candle data
    const generateCandle = (prevClose, volatility) => {
        const change = (Math.random() - 0.45) * volatility;
        const open = prevClose;
        const close = prevClose * (1 + change);
        const high = Math.max(open, close) * (1 + Math.random() * 0.02);
        const low = Math.min(open, close) * (1 - Math.random() * 0.02);
        const volume = Math.floor(Math.random() * 100) + 20;
        
        return { open, high, low, close, volume };
    };
    
    // Viral events that can happen
    const viralEvents = [
        { type: 'whale', icon: '🐋', text: 'WHALE BOUGHT IN!', multiplier: 1.5, color: '#00d4ff' },
        { type: 'celeb', icon: '⭐', text: 'INFLUENCER TWEETED!', multiplier: 2.0, color: '#ffd700' },
        { type: 'listing', icon: '📈', text: 'EXCHANGE LISTING!', multiplier: 3.0, color: '#00ff88' },
        { type: 'fud', icon: '😱', text: 'FUD SPREADING...', multiplier: 0.5, color: '#ff4444' },
        { type: 'meme', icon: '🔥', text: 'WENT VIRAL!', multiplier: 2.5, color: '#ff6b6b' },
        { type: 'dev', icon: '👨‍💻', text: 'DEV UPDATE!', multiplier: 1.3, color: '#a855f7' }
    ];
    
    // Update coin prices every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setLaunchedCoins(prev => prev.map(coin => {
                if (coin.rugged) return coin;
                
                // Safety check - ensure candles array exists
                if (!coin.candles || !Array.isArray(coin.candles)) {
                    coin.candles = [{ open: coin.launchPrice || 0.001, close: coin.currentPrice || 0.001, high: (coin.currentPrice || 0.001) * 1.01, low: (coin.launchPrice || 0.001) * 0.99, volume: 50 }];
                }
                
                // Volatile price movement
                const volatility = coin.hype / 10;
                const lastCandle = coin.candles[coin.candles.length - 1] || { close: coin.launchPrice || 0.001 };
                let newCandle = generateCandle(lastCandle.close, volatility);
                
                // Random viral event chance (3%)
                let eventTriggered = null;
                if (Math.random() < 0.03 && !coin.rugged) {
                    eventTriggered = viralEvents[Math.floor(Math.random() * viralEvents.length)];
                    newCandle.close = lastCandle.close * eventTriggered.multiplier;
                    newCandle.high = Math.max(newCandle.high, newCandle.close * 1.05);
                    newCandle.low = Math.min(newCandle.low, newCandle.close * 0.95);
                    
                    setViralEvent({ ...eventTriggered, coin: coin.ticker });
                    setTimeout(() => setViralEvent(null), 3000);
                    
                    if (showToast) {
                        showToast(`${eventTriggered.icon} $${coin.ticker}: ${eventTriggered.text}`, eventTriggered.multiplier > 1 ? 'success' : 'error', 3000);
                    }
                }
                
                // Rug pull chance (0.5% per tick if hype is low)
                const rugChance = coin.hype < 30 ? 0.005 : 0.001;
                const rugged = Math.random() < rugChance;
                
                if (rugged) {
                    newCandle.close = lastCandle.close * 0.01;
                    newCandle.low = newCandle.close * 0.5;
                    newCandle.high = lastCandle.close;
                    newCandle.open = lastCandle.close;
                    if (showToast) showToast(`🚨 ${coin.ticker} RUGGED! -99%`, 'error', 5000);
                }
                
                // Update hype (decays over time, boosted by events)
                let newHype = Math.max(5, coin.hype - 0.5 + (Math.random() * 0.3));
                if (eventTriggered && eventTriggered.multiplier > 1) {
                    newHype = Math.min(100, newHype + 15);
                }
                
                // Update candles (keep last 30)
                const newCandles = [...coin.candles.slice(-29), newCandle];
                
                return {
                    ...coin,
                    currentPrice: Math.max(0.0001, newCandle.close),
                    candles: newCandles,
                    hype: newHype,
                    holders: coin.holders + Math.floor(Math.random() * 3) - 1,
                    rugged,
                    lastEvent: eventTriggered ? eventTriggered.type : coin.lastEvent
                };
            }));
        }, 3000);
        
        return () => clearInterval(interval);
    }, [showToast]);
    
    const launchCoin = () => {
        if (!coinName || !coinTicker) {
            if (showToast) showToast('Enter a name and ticker!', 'error');
            return;
        }
        if (resources.hopium < 100) {
            if (showToast) showToast('Need 100 HOPIUM to launch!', 'error');
            return;
        }
        
        onResourceChange('hopium', -100);
        
        // Generate initial candles with some drama
        const initialCandles = [];
        let price = 0.001;
        for (let i = 0; i < 15; i++) {
            const candle = generateCandle(price, 8);
            initialCandles.push(candle);
            price = candle.close;
        }
        
        // Random starting hype based on name "quality"
        const hasMemeName = prefixes.some(p => coinName.toLowerCase().includes(p.toLowerCase()));
        const startingHype = hasMemeName ? Math.floor(Math.random() * 20) + 80 : Math.floor(Math.random() * 30) + 60;
        
        const newCoin = {
            id: Date.now(),
            name: coinName,
            ticker: coinTicker.toUpperCase(),
            emoji: selectedEmoji,
            launchPrice: 0.001,
            currentPrice: price,
            candles: initialCandles,
            hype: startingHype,
            holders: Math.floor(Math.random() * 50) + 10,
            marketCap: 1000,
            rugged: false,
            launchTime: Date.now(),
            lastEvent: null
        };
        
        setLaunchedCoins(prev => [newCoin, ...prev].slice(0, 10));
        setCoinName('');
        setCoinTicker('');
        
        if (showToast) showToast(`${selectedEmoji} $${newCoin.ticker} LAUNCHED! Starting hype: ${startingHype}%`, 'success', 3000);
    };
    
    const sellCoin = (coin) => {
        if (coin.rugged) return;
        
        const profit = Math.floor((coin.currentPrice / coin.launchPrice) * 100);
        onResourceChange('hopium', profit);
        
        setLaunchedCoins(prev => prev.filter(c => c.id !== coin.id));
        
        if (showToast) {
            const pnl = profit - 100;
            showToast(`Sold $${coin.ticker} for ${profit} HOPIUM (${pnl >= 0 ? '+' : ''}${pnl})`, pnl >= 0 ? 'success' : 'warning');
        }
    };
    
    // Render candlestick chart
    const renderCandleChart = (candles) => {
        if (!candles || candles.length === 0) return null;
        
        const allHighs = candles.map(c => c.high);
        const allLows = candles.map(c => c.low);
        const maxPrice = Math.max(...allHighs);
        const minPrice = Math.min(...allLows);
        const priceRange = maxPrice - minPrice || 0.0001;
        
        const maxVolume = Math.max(...candles.map(c => c.volume));
        
        const chartHeight = 140;
        const volumeHeight = 30;
        
        return (
            <div className="coin-chart" style={{ height: chartHeight + volumeHeight + 20 }}>
                {/* Grid lines */}
                <div className="chart-grid">
                    {[0, 25, 50, 75, 100].map(pct => (
                        <div 
                            key={pct} 
                            className="chart-grid-line" 
                            style={{ top: `${pct * (chartHeight / 100)}px` }}
                        />
                    ))}
                </div>
                
                {/* Candles */}
                {candles.map((candle, idx) => {
                    const isGreen = candle.close >= candle.open;
                    
                    // Calculate positions (inverted because CSS top is from top)
                    const highPos = ((maxPrice - candle.high) / priceRange) * chartHeight;
                    const lowPos = ((maxPrice - candle.low) / priceRange) * chartHeight;
                    const openPos = ((maxPrice - candle.open) / priceRange) * chartHeight;
                    const closePos = ((maxPrice - candle.close) / priceRange) * chartHeight;
                    
                    const bodyTop = Math.min(openPos, closePos);
                    const bodyHeight = Math.max(2, Math.abs(closePos - openPos));
                    
                    const wickTop = highPos;
                    const wickHeight = lowPos - highPos;
                    
                    const volumeBarHeight = (candle.volume / maxVolume) * volumeHeight;
                    
                    return (
                        <div key={idx} className={`candlestick ${isGreen ? 'green' : 'red'}`}>
                            {/* Wick */}
                            <div 
                                className="candle-wick"
                                style={{
                                    top: wickTop,
                                    height: wickHeight
                                }}
                            />
                            {/* Body */}
                            <div 
                                className="candle-body"
                                style={{
                                    top: bodyTop,
                                    height: bodyHeight
                                }}
                            />
                            {/* Volume */}
                            <div 
                                className={`volume-bar ${isGreen ? 'green' : 'red'}`}
                                style={{
                                    height: volumeBarHeight,
                                    bottom: 0
                                }}
                            />
                        </div>
                    );
                })}
                
                {/* Price labels */}
                <div style={{ 
                    position: 'absolute', 
                    right: -5, 
                    top: 0, 
                    fontSize: '0.65em', 
                    color: '#888',
                    transform: 'translateX(100%)',
                    paddingLeft: '5px'
                }}>
                    {'$'}{maxPrice.toFixed(6)}
                </div>
                <div style={{ 
                    position: 'absolute', 
                    right: -5, 
                    bottom: volumeHeight + 10, 
                    fontSize: '0.65em', 
                    color: '#888',
                    transform: 'translateX(100%)',
                    paddingLeft: '5px'
                }}>
                    {'$'}{minPrice.toFixed(6)}
                </div>
            </div>
        );
    };
    
    return (
        <div className="memecoin-launcher">
            <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🚀 Memecoin Launcher
                <span style={{ fontSize: '0.6em', color: '#888' }}>Cost: 100 💊</span>
            </h2>
            
            {/* Viral Event Banner */}
            {viralEvent && (
                <div style={{
                    background: `linear-gradient(135deg, ${viralEvent.color}33, ${viralEvent.color}11)`,
                    border: `2px solid ${viralEvent.color}`,
                    borderRadius: '12px',
                    padding: '12px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'pulse 0.5s ease-in-out'
                }}>
                    <span style={{ fontSize: '2em' }}>{viralEvent.icon}</span>
                    <div>
                        <div style={{ color: viralEvent.color, fontWeight: 'bold' }}>${viralEvent.coin}</div>
                        <div style={{ color: '#fff' }}>{viralEvent.text}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', color: viralEvent.multiplier > 1 ? '#00ff88' : '#ff4444', fontWeight: 'bold', fontSize: '1.2em' }}>
                        {viralEvent.multiplier > 1 ? '+' : ''}{((viralEvent.multiplier - 1) * 100).toFixed(0)}%
                    </span>
                </div>
            )}
            
            {/* Emoji Picker */}
            <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#888', fontSize: '0.85em', marginBottom: '8px' }}>Choose your coin's emoji:</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {emojiOptions.map(emoji => (
                        <button
                            key={emoji}
                            onClick={() => setSelectedEmoji(emoji)}
                            style={{
                                background: selectedEmoji === emoji ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255,255,255,0.05)',
                                border: selectedEmoji === emoji ? '2px solid #ffd700' : '2px solid transparent',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                fontSize: '1.3em',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="coin-creator">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
                    <span style={{ fontSize: '2em', background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '10px' }}>{selectedEmoji}</span>
                    <input
                        type="text"
                        placeholder="Coin Name (e.g., DogWifHat)"
                        value={coinName}
                        onChange={(e) => setCoinName(e.target.value)}
                        className="coin-input"
                        maxLength={20}
                        style={{ flex: 1 }}
                    />
                </div>
                <input
                    type="text"
                    placeholder="Ticker (e.g., WIF)"
                    value={coinTicker}
                    onChange={(e) => setCoinTicker(e.target.value.toUpperCase())}
                    className="coin-input"
                    maxLength={6}
                    style={{ width: '120px' }}
                />
            </div>
            
            {/* Random Generator Button */}
            <button 
                onClick={generateRandomName}
                style={{
                    background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '10px 20px',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    marginBottom: '15px',
                    width: '100%'
                }}
            >
                🎲 Generate Random Memecoin Name
            </button>
            
            <button className="launch-btn" onClick={launchCoin} disabled={resources.hopium < 100}>
                {selectedEmoji} LAUNCH ${coinTicker || 'COIN'} (-100 💊)
            </button>
            
            {/* Stats */}
            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-around', 
                marginTop: '15px', 
                padding: '10px', 
                background: 'rgba(0,0,0,0.3)', 
                borderRadius: '10px',
                fontSize: '0.85em'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888' }}>Launched</div>
                    <div style={{ color: '#ffd700', fontWeight: 'bold' }}>{launchedCoins.length}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888' }}>Rugged</div>
                    <div style={{ color: '#ff4444', fontWeight: 'bold' }}>{launchedCoins.filter(c => c.rugged).length}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888' }}>Mooning</div>
                    <div style={{ color: '#00ff88', fontWeight: 'bold' }}>{launchedCoins.filter(c => !c.rugged && c.currentPrice > c.launchPrice * 2).length}</div>
                </div>
            </div>
            
            {launchedCoins.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                    <h3 style={{ color: '#ffd700', marginBottom: '15px' }}>Your Launched Coins ({launchedCoins.length}/10):</h3>
                    {launchedCoins.map(coin => {
                        const pnlPercent = ((coin.currentPrice / coin.launchPrice) - 1) * 100;
                        const isProfit = pnlPercent >= 0;
                        const lastCandle = coin.candles[coin.candles.length - 1];
                        const prevCandle = coin.candles[coin.candles.length - 2];
                        const priceChange = lastCandle && prevCandle 
                            ? ((lastCandle.close - prevCandle.close) / prevCandle.close * 100).toFixed(2)
                            : 0;
                        const isMooning = pnlPercent > 100;
                        
                        return (
                            <div key={coin.id} className="launched-coin" style={{ 
                                borderLeft: `4px solid ${coin.rugged ? '#666' : isMooning ? '#ffd700' : isProfit ? '#00ff88' : '#ff4444'}`,
                                opacity: coin.rugged ? 0.5 : 1,
                                background: isMooning && !coin.rugged ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0.3))' : undefined
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '1.5em' }}>{coin.emoji || '🚀'}</span>
                                        <div>
                                            <div>
                                                <span style={{ fontSize: '1.3em', fontWeight: 'bold', color: '#fff' }}>{'$'}{coin.ticker}</span>
                                                <span style={{ color: '#888', marginLeft: '10px' }}>{coin.name}</span>
                                            </div>
                                            {coin.rugged && <span style={{ color: '#ff4444' }}>☠️ RUGGED</span>}
                                            {isMooning && !coin.rugged && <span style={{ color: '#ffd700' }}>🌙 MOONING!</span>}
                                            {coin.lastEvent && !coin.rugged && (
                                                <span style={{ color: '#a855f7', marginLeft: '5px', fontSize: '0.8em' }}>
                                                    Last: {coin.lastEvent}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ color: isMooning ? '#ffd700' : isProfit ? '#00ff88' : '#ff4444', fontSize: '1.4em', fontWeight: 'bold' }}>
                                            {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
                                        </div>
                                        <div style={{ color: '#fff', fontSize: '1em' }}>
                                            {'$'}{coin.currentPrice.toFixed(6)}
                                        </div>
                                        <div style={{ color: priceChange >= 0 ? '#00ff88' : '#ff4444', fontSize: '0.8em' }}>
                                            {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange)}% (1m)
                                        </div>
                                    </div>
                                </div>
                                
                                {/* OHLC Info */}
                                {lastCandle && (
                                    <div style={{ 
                                        display: 'flex', 
                                        gap: '15px', 
                                        fontSize: '0.75em', 
                                        color: '#888',
                                        marginBottom: '5px',
                                        padding: '5px 0',
                                        borderBottom: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        <span>O: <span style={{ color: '#fff' }}>{'$'}{lastCandle.open.toFixed(6)}</span></span>
                                        <span>H: <span style={{ color: '#00ff88' }}>{'$'}{lastCandle.high.toFixed(6)}</span></span>
                                        <span>L: <span style={{ color: '#ff4444' }}>{'$'}{lastCandle.low.toFixed(6)}</span></span>
                                        <span>C: <span style={{ color: '#fff' }}>{'$'}{lastCandle.close.toFixed(6)}</span></span>
                                    </div>
                                )}
                                
                                {/* Candlestick Chart */}
                                {renderCandleChart(coin.candles)}
                                
                                {/* Footer */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                    <div style={{ color: '#888', fontSize: '0.85em' }}>
                                        📊 Hype: <span style={{ color: coin.hype > 50 ? '#00ff88' : '#ff4444' }}>{coin.hype.toFixed(0)}%</span> | 
                                        👥 {coin.holders} holders |
                                        💰 MCap: {'$'}{(coin.currentPrice * 1000000000).toFixed(0)}
                                    </div>
                                    {!coin.rugged && (
                                        <button 
                                            onClick={() => sellCoin(coin)}
                                            style={{
                                                background: isProfit ? 'linear-gradient(90deg, #00ff88, #00cc6a)' : 'linear-gradient(90deg, #ff4444, #cc0000)',
                                                color: isProfit ? '#000' : '#fff',
                                                border: 'none',
                                                padding: '10px 25px',
                                                borderRadius: '8px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                fontSize: '1em'
                                            }}
                                        >
                                            {isProfit ? '💰 TAKE PROFIT' : '🛑 CUT LOSSES'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ==================== CRYPTO TWITTER FEED ====================

function LeverageTrading({ resources, onResourceChange, showToast }) {
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('pumptown_leverage_position');
        return saved ? JSON.parse(saved) : null;
    });
    const [leverage, setLeverage] = useState(5);
    const [amount, setAmount] = useState(50);
    const [currentPrice, setCurrentPrice] = useState(100);
    
    useEffect(() => {
        if (position) {
            localStorage.setItem('pumptown_leverage_position', JSON.stringify(position));
        } else {
            localStorage.removeItem('pumptown_leverage_position');
        }
    }, [position]);
    
    // Price movement
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentPrice(prev => {
                const change = (Math.random() - 0.5) * 5;
                return Math.max(50, Math.min(150, prev + change));
            });
        }, 2000);
        
        return () => clearInterval(interval);
    }, []);
    
    // Check for liquidation
    useEffect(() => {
        if (!position) return;
        
        const pnlPercent = position.type === 'long' 
            ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage
            : ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
        
        if (pnlPercent <= -90) {
            // LIQUIDATED
            if (showToast) showToast('💀 LIQUIDATED! Position wiped out!', 'error', 5000);
            setPosition(null);
        }
    }, [currentPrice, position, showToast]);
    
    const openPosition = (type) => {
        if (position) {
            if (showToast) showToast('Close existing position first!', 'warning');
            return;
        }
        if (resources.hopium < amount) {
            if (showToast) showToast('Not enough HOPIUM!', 'error');
            return;
        }
        
        onResourceChange('hopium', -amount);
        
        setPosition({
            type,
            entryPrice: currentPrice,
            amount,
            leverage,
            openTime: Date.now()
        });
        
        if (showToast) showToast(`Opened ${leverage}x ${type.toUpperCase()} position!`, 'info');
    };
    
    const closePosition = () => {
        if (!position) return;
        
        const pnlPercent = position.type === 'long' 
            ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage
            : ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
        
        const pnl = Math.floor(position.amount * (1 + pnlPercent / 100));
        const finalAmount = Math.max(0, pnl);
        
        onResourceChange('hopium', finalAmount);
        setPosition(null);
        
        if (showToast) {
            const profit = finalAmount - position.amount;
            showToast(`Closed position: ${profit >= 0 ? '+' : ''}${profit} HOPIUM`, profit >= 0 ? 'success' : 'warning');
        }
    };
    
    const getPnL = () => {
        if (!position) return { percent: 0, amount: 0 };
        
        const pnlPercent = position.type === 'long' 
            ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100 * position.leverage
            : ((position.entryPrice - currentPrice) / position.entryPrice) * 100 * position.leverage;
        
        const pnlAmount = Math.floor(position.amount * (pnlPercent / 100));
        
        return { percent: pnlPercent, amount: pnlAmount };
    };
    
    const pnl = getPnL();
    const liquidationPrice = position 
        ? position.type === 'long'
            ? position.entryPrice * (1 - 0.9 / position.leverage)
            : position.entryPrice * (1 + 0.9 / position.leverage)
        : 0;
    
    return (
        <div className="leverage-section">
            <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📈 Leverage Trading
                <span style={{ fontSize: '0.6em', color: '#888' }}>High Risk!</span>
            </h2>
            
            {/* Current Price */}
            <div style={{ 
                textAlign: 'center', 
                fontSize: '2em', 
                fontWeight: 'bold',
                color: '#ffd700',
                marginBottom: '20px'
            }}>
                $BTC: {'$'}{currentPrice.toFixed(2)}K
            </div>
            
            {!position ? (
                <>
                    {/* Controls */}
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#888', display: 'block', marginBottom: '5px' }}>
                            Leverage: {leverage}x
                        </label>
                        <input 
                            type="range" 
                            min="2" 
                            max="100" 
                            value={leverage}
                            onChange={(e) => setLeverage(parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.8em' }}>
                            <span>2x (Safe)</span>
                            <span>100x (Degen)</span>
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ color: '#888', display: 'block', marginBottom: '5px' }}>
                            Amount: {amount} HOPIUM
                        </label>
                        <input 
                            type="range" 
                            min="10" 
                            max={Math.min(500, resources.hopium)} 
                            value={amount}
                            onChange={(e) => setAmount(parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        />
                    </div>
                    
                    <div className="leverage-controls">
                        <button className="leverage-btn long" onClick={() => openPosition('long')}>
                            📈 LONG
                        </button>
                        <button className="leverage-btn short" onClick={() => openPosition('short')}>
                            📉 SHORT
                        </button>
                    </div>
                </>
            ) : (
                <div className={`position-card ${pnl.percent >= 0 ? 'profit' : 'loss'}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <div>
                            <div style={{ color: '#888' }}>Position</div>
                            <div style={{ 
                                fontSize: '1.3em', 
                                fontWeight: 'bold',
                                color: position.type === 'long' ? '#00ff88' : '#ff4444'
                            }}>
                                {position.leverage}x {position.type.toUpperCase()}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ color: '#888' }}>PnL</div>
                            <div style={{ 
                                fontSize: '1.3em', 
                                fontWeight: 'bold',
                                color: pnl.percent >= 0 ? '#00ff88' : '#ff4444'
                            }}>
                                {pnl.percent >= 0 ? '+' : ''}{pnl.percent.toFixed(1)}%
                                <br />
                                <span style={{ fontSize: '0.8em' }}>
                                    ({pnl.amount >= 0 ? '+' : ''}{pnl.amount} 💊)
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '0.9em', marginBottom: '15px' }}>
                        <span>Entry: {'$'}{position.entryPrice.toFixed(2)}K</span>
                        <span>Size: {position.amount} 💊</span>
                    </div>
                    
                    {/* Liquidation warning */}
                    {pnl.percent < -50 && (
                        <div className="liquidation-warning">
                            ⚠️ LIQUIDATION AT {'$'}{liquidationPrice.toFixed(2)}K
                        </div>
                    )}
                    
                    <button 
                        onClick={closePosition}
                        style={{
                            width: '100%',
                            marginTop: '15px',
                            padding: '12px',
                            background: pnl.percent >= 0 ? 'linear-gradient(90deg, #00ff88, #00cc6a)' : 'linear-gradient(90deg, #ff4444, #cc0000)',
                            color: pnl.percent >= 0 ? '#000' : '#fff',
                            border: 'none',
                            borderRadius: '10px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        {pnl.percent >= 0 ? '💰 TAKE PROFIT' : '🛑 CLOSE POSITION'}
                    </button>
                </div>
            )}
        </div>
    );
}

// ==================== WHALE ALERTS ====================

function WhaleAlerts({ showToast }) {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const whaleActions = [
        { action: 'bought', emoji: '🟢', impact: 'bullish' },
        { action: 'sold', emoji: '🔴', impact: 'bearish' },
        { action: 'transferred to exchange', emoji: '⚠️', impact: 'bearish' },
        { action: 'moved to cold wallet', emoji: '💎', impact: 'bullish' },
        { action: 'is accumulating', emoji: '🐋', impact: 'bullish' }
    ];
    
    const tokens = ['BTC', 'ETH', 'SOL', 'PEPE', 'WIF', 'BONK', 'DOGE', 'XRP', 'AVAX'];
    const amounts = ['$2.5M', '$5M', '$10M', '$25M', '$50M', '$100M', '$250M'];
    const whales = ['Whale 0x7a3...f2d', 'Smart Money', 'Known Accumulator', 'Exchange Whale', 'Binance Hot Wallet', 'Coinbase Whale', 'Jump Trading', 'Wintermute'];
    
    // Try to fetch real whale alerts from Whale Alert RSS
    const fetchRealWhaleAlerts = async () => {
        try {
            // Use RSS2JSON to get Whale Alert Twitter/RSS feed
            const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https://nitter.poast.org/whale_alert/rss');
            const data = await response.json();
            
            if (data.status === 'ok' && data.items && data.items.length > 0) {
                const realAlerts = data.items.slice(0, 5).map((item, index) => {
                    const text = item.title || item.description || '';
                    const isBullish = text.toLowerCase().includes('from exchange') || 
                                     text.toLowerCase().includes('cold wallet') ||
                                     text.toLowerCase().includes('unknown wallet');
                    return {
                        id: Date.now() + index,
                        text: `🐋 ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
                        impact: isBullish ? 'bullish' : 'bearish',
                        timestamp: new Date(item.pubDate).getTime(),
                        isReal: true
                    };
                });
                return realAlerts;
            }
        } catch (err) {
            console.log('Using simulated whale alerts');
        }
        return null;
    };
    
    // Generate a simulated alert
    const generateAlert = () => {
        const action = whaleActions[Math.floor(Math.random() * whaleActions.length)];
        const token = tokens[Math.floor(Math.random() * tokens.length)];
        const amount = amounts[Math.floor(Math.random() * amounts.length)];
        const whale = whales[Math.floor(Math.random() * whales.length)];
        
        return {
            id: Date.now() + Math.random(),
            text: `${action.emoji} ${whale} ${action.action} ${amount} worth of $${token}`,
            impact: action.impact,
            timestamp: Date.now(),
            isReal: false
        };
    };
    
    useEffect(() => {
        // Initialize with some alerts immediately
        const initAlerts = async () => {
            // Try to get real alerts first
            const realAlerts = await fetchRealWhaleAlerts();
            
            if (realAlerts && realAlerts.length > 0) {
                setAlerts(realAlerts);
            } else {
                // Generate 3 initial simulated alerts
                const initialAlerts = [
                    generateAlert(),
                    generateAlert(),
                    generateAlert()
                ];
                setAlerts(initialAlerts);
            }
            setLoading(false);
        };
        
        initAlerts();
        
        // Add new alerts periodically
        const interval = setInterval(() => {
            if (Math.random() > 0.5) { // 50% chance every 15 seconds
                const newAlert = generateAlert();
                setAlerts(prev => [newAlert, ...prev.slice(0, 4)]);
                
                // Show toast for big moves
                if (newAlert.text.includes('$100M') || newAlert.text.includes('$250M')) {
                    showToast(`🐋 WHALE ALERT: ${newAlert.text}`, newAlert.impact === 'bullish' ? 'success' : 'error');
                }
            }
        }, 15000);
        
        // Try to refresh real alerts every 2 minutes
        const realAlertInterval = setInterval(async () => {
            const realAlerts = await fetchRealWhaleAlerts();
            if (realAlerts && realAlerts.length > 0) {
                setAlerts(prev => {
                    const newAlerts = realAlerts.filter(ra => !prev.some(p => p.text === ra.text));
                    if (newAlerts.length > 0) {
                        return [...newAlerts.slice(0, 2), ...prev.slice(0, 3)];
                    }
                    return prev;
                });
            }
        }, 120000);
        
        return () => {
            clearInterval(interval);
            clearInterval(realAlertInterval);
        };
    }, []);
    
    return (
        <div className="card">
            <h3 style={{ color: '#0096ff', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🐋 Whale Alerts
                <span style={{ fontSize: '0.5em', color: '#00ff88', background: 'rgba(0,255,136,0.2)', padding: '3px 8px', borderRadius: '10px' }}>LIVE</span>
            </h3>
            
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    Loading whale activity...
                </div>
            ) : alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    Watching for whale movements...
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {alerts.map(alert => (
                        <div key={alert.id} style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '12px 15px',
                            borderRadius: '10px',
                            borderLeft: `3px solid ${alert.impact === 'bullish' ? '#00ff88' : '#ff4444'}`
                        }}>
                            <div style={{ 
                                color: alert.impact === 'bullish' ? '#00ff88' : '#ff4444',
                                fontSize: '0.95em'
                            }}>
                                {alert.text}
                            </div>
                            <div style={{ color: '#666', fontSize: '0.8em', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{getTimeAgo(alert.timestamp)}</span>
                                {alert.isReal && <span style={{ color: '#0096ff' }}>📡 Live</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ==================== PREDICTION MARKET ====================

function TradingCompetition({ playerName, playerStats }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [leaderboard, setLeaderboard] = useState([
        { name: 'WhaleKing', pnl: 125000, rank: 1 },
        { name: 'DiamondHands99', pnl: 98500, rank: 2 },
        { name: 'CryptoChad', pnl: 87200, rank: 3 },
        { name: playerName || 'You', pnl: playerStats.xp * 10, rank: 4, isYou: true },
        { name: 'MoonBoi', pnl: 45000, rank: 5 }
    ]);
    
    useEffect(() => {
        // Competition ends Sunday midnight
        const updateTimer = () => {
            const now = new Date();
            const endOfWeek = new Date(now);
            endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
            endOfWeek.setHours(23, 59, 59, 999);
            
            const diff = endOfWeek - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            setTimeLeft(`${days}d ${hours}h ${mins}m`);
        };
        
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, []);
    
    // Update player position
    useEffect(() => {
        setLeaderboard(prev => {
            const updated = prev.map(p => 
                p.isYou ? { ...p, pnl: playerStats.xp * 10 } : p
            ).sort((a, b) => b.pnl - a.pnl);
            
            return updated.map((p, idx) => ({ ...p, rank: idx + 1 }));
        });
    }, [playerStats.xp]);
    
    return (
        <div className="trading-comp">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h3 style={{ color: '#ff6400', margin: 0 }}>🏆 Weekly Trading Competition</h3>
                    <p style={{ color: '#888', fontSize: '0.85em', margin: '5px 0 0 0' }}>Top 3 win prizes!</p>
                </div>
                <div className="comp-timer">⏰ {timeLeft}</div>
            </div>
            
            <div className="comp-leaderboard">
                {leaderboard.map(player => (
                    <div key={player.name} className={`comp-entry ${player.isYou ? 'you' : ''}`}>
                        <span className={`comp-rank ${player.rank === 1 ? 'gold' : player.rank === 2 ? 'silver' : player.rank === 3 ? 'bronze' : ''}`}>
                            #{player.rank}
                        </span>
                        <span style={{ flex: 1, marginLeft: '15px', color: player.isYou ? '#ffd700' : '#fff' }}>
                            {player.name} {player.isYou && '(You)'}
                        </span>
                        <span style={{ color: player.pnl >= 0 ? '#00ff88' : '#ff4444', fontWeight: 'bold' }}>
                            ${player.pnl.toLocaleString()}
                        </span>
                    </div>
                ))}
            </div>
            
            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,100,0,0.1)', borderRadius: '10px' }}>
                <div style={{ color: '#ff6400', fontWeight: 'bold', marginBottom: '10px' }}>🎁 Prizes</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', color: '#fff', fontSize: '0.9em' }}>
                    <div>🥇 10,000 HOPIUM</div>
                    <div>🥈 5,000 HOPIUM</div>
                    <div>🥉 2,500 HOPIUM</div>
                </div>
            </div>
        </div>
    );
}


function AirdropSystem({ onResourceChange, showToast, playerStats }) {
    const [activeAirdrop, setActiveAirdrop] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [claimed, setClaimed] = useState(() => {
        const saved = localStorage.getItem('pumptown_airdrop_claimed');
        return saved ? JSON.parse(saved) : [];
    });
    
    const airdrops = [
        { id: 'hopium_drop', name: 'HOPIUM Airdrop', icon: '💊', reward: { hopium: 500 }, rarity: 'common' },
        { id: 'alpha_drop', name: 'ALPHA Secrets', icon: '🔮', reward: { alpha: 100 }, rarity: 'uncommon' },
        { id: 'copium_drop', name: 'Emergency COPIUM', icon: '😤', reward: { copium: 200 }, rarity: 'common' },
        { id: 'mega_drop', name: 'MEGA Drop', icon: '💎', reward: { hopium: 2000, alpha: 200 }, rarity: 'rare' },
        { id: 'whale_gift', name: 'Whale Gift', icon: '🐋', reward: { hopium: 5000 }, rarity: 'legendary' }
    ];
    
    useEffect(() => {
        localStorage.setItem('pumptown_airdrop_claimed', JSON.stringify(claimed));
    }, [claimed]);
    
    // Random airdrop spawner
    useEffect(() => {
        const spawnAirdrop = () => {
            if (activeAirdrop) return;
            
            // Random chance based on rarity
            const rand = Math.random();
            let drop;
            if (rand < 0.01) drop = airdrops.find(a => a.rarity === 'legendary');
            else if (rand < 0.05) drop = airdrops.find(a => a.rarity === 'rare');
            else if (rand < 0.15) drop = airdrops.find(a => a.rarity === 'uncommon');
            else if (rand < 0.25) drop = airdrops.filter(a => a.rarity === 'common')[Math.floor(Math.random() * 2)];
            
            if (drop && !claimed.includes(drop.id + '_' + new Date().toDateString())) {
                setActiveAirdrop(drop);
                setTimeLeft(30); // 30 seconds to claim
            }
        };
        
        // Check every 60 seconds
        const interval = setInterval(spawnAirdrop, 60000);
        // Initial check after 10 seconds
        setTimeout(spawnAirdrop, 10000);
        
        return () => clearInterval(interval);
    }, [activeAirdrop, claimed]);
    
    // Countdown timer
    useEffect(() => {
        if (!activeAirdrop || timeLeft <= 0) return;
        
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setActiveAirdrop(null);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [activeAirdrop, timeLeft]);
    
    const claimAirdrop = () => {
        if (!activeAirdrop) return;
        
        // Play collect sound
        if (window.GameSounds) window.GameSounds.collect();
        
        // Give rewards
        Object.entries(activeAirdrop.reward).forEach(([resource, amount]) => {
            onResourceChange(resource, amount);
        });
        
        showToast(`🪂 Claimed ${activeAirdrop.name}!`, 'success');
        setClaimed(prev => [...prev, activeAirdrop.id + '_' + new Date().toDateString()]);
        setActiveAirdrop(null);
    };
    
    if (!activeAirdrop) return null;
    
    return (
        <div className="airdrop-notification">
            <div className="airdrop-icon">🪂</div>
            <div className="airdrop-title">{activeAirdrop.name}</div>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '2em' }}>{activeAirdrop.icon}</span>
            </div>
            <div style={{ textAlign: 'center', color: '#fff', marginBottom: '10px' }}>
                {Object.entries(activeAirdrop.reward).map(([r, a]) => (
                    <div key={r}>+{a} {r.toUpperCase()}</div>
                ))}
            </div>
            <div className="airdrop-timer">⏰ {timeLeft}s</div>
            <button className="airdrop-claim-btn" onClick={claimAirdrop}>
                CLAIM NOW!
            </button>
        </div>
    );
}

// ==================== TOKEN SNIPER GAME ====================

function PassiveIncomePanel({ resources, currentZone }) {
    const [totalIncome, setTotalIncome] = useState({ hopium: 0, alpha: 0, copium: 0, liquidity: 0 });
    
    useEffect(() => {
        // Calculate zone income per hour
        const zoneRates = {
            pump_town_square: { hopium: 120, alpha: 0, copium: 0, liquidity: 0 },
            shitcoin_slums: { hopium: 360, alpha: 0, copium: 120, liquidity: 0 },
            chart_district: { hopium: 120, alpha: 240, copium: 0, liquidity: 120 },
            degen_casino: { hopium: 240, alpha: 120, copium: 240, liquidity: 0 },
            whale_bay: { hopium: 120, alpha: 360, copium: 0, liquidity: 360 },
            alpha_vault: { hopium: 240, alpha: 600, copium: 240, liquidity: 240 }
        };
        
        const zoneIncome = zoneRates[currentZone] || zoneRates.pump_town_square;
        
        setTotalIncome(zoneIncome);
    }, [currentZone]);
    
    const hasIncome = totalIncome.hopium > 0 || totalIncome.alpha > 0 || totalIncome.copium > 0 || totalIncome.liquidity > 0;
    
    if (!hasIncome) return null;
    
    return (
        <div className="passive-income-panel">
            <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: '10px' }}>
                💰 Passive Income (per hour)
            </div>
            {totalIncome.hopium > 0 && (
                <div className="income-row">
                    <span className="income-source">💊 HOPIUM</span>
                    <span className="income-amount">+{totalIncome.hopium}/hr</span>
                </div>
            )}
            {totalIncome.alpha > 0 && (
                <div className="income-row">
                    <span className="income-source">🔮 ALPHA</span>
                    <span className="income-amount">+{totalIncome.alpha}/hr</span>
                </div>
            )}
            {totalIncome.copium > 0 && (
                <div className="income-row">
                    <span className="income-source">😢 COPIUM</span>
                    <span className="income-amount">+{totalIncome.copium}/hr</span>
                </div>
            )}
            {totalIncome.liquidity > 0 && (
                <div className="income-row">
                    <span className="income-source">💧 LIQUIDITY</span>
                    <span className="income-amount">+{totalIncome.liquidity}/hr</span>
                </div>
            )}
        </div>
    );
}

// ==================== ECONOMY/PRICE CHART ====================

