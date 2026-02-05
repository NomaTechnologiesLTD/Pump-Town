// ====================================================
// casino-games.js — Casino, arcade, mini-games
// Degens City - Auto-extracted from index.html
// ====================================================

function CasinoSection({ resources, onResourceChange, showToast }) {
    const [activeGame, setActiveGame] = useState(null);
    const [betAmount, setBetAmount] = useState(50);
    const [gameState, setGameState] = useState('idle'); // idle, playing, result
    const [result, setResult] = useState(null);
    const [coinSide, setCoinSide] = useState(null);
    const [diceValues, setDiceValues] = useState([1, 1]);
    const [wheelRotation, setWheelRotation] = useState(0);
    
    // Animation states
    const [flipResult, setFlipResult] = useState(null);
    const [diceRolling, setDiceRolling] = useState(false);
    const [diceDisplay, setDiceDisplay] = useState(['?', '?']);
    const [diceResult, setDiceResult] = useState([1, 1]);
    const [houseRolling, setHouseRolling] = useState(false);
    const [houseResult, setHouseResult] = useState([1, 1]);
    const [showHouse, setShowHouse] = useState(false);
    const [crashMultiplier, setCrashMultiplier] = useState(1.00);
    const [rocketCrashed, setRocketCrashed] = useState(false);
    const [wheelSpinning, setWheelSpinning] = useState(false);
    
    // Helper function to get dice rotation based on result
    const getDiceRotation = (value) => {
        const rotations = {
            1: 'rotateX(0deg) rotateY(0deg)',      // front
            2: 'rotateX(-90deg) rotateY(0deg)',   // top
            3: 'rotateX(0deg) rotateY(-90deg)',   // right
            4: 'rotateX(0deg) rotateY(90deg)',    // left
            5: 'rotateX(90deg) rotateY(0deg)',    // bottom
            6: 'rotateX(0deg) rotateY(180deg)'    // back
        };
        return rotations[value] || rotations[1];
    };
    
    const games = [
        {
            id: 'coinflip',
            name: 'Coin Flip',
            icon: '🪙',
            description: 'Heads or tails? Double or nothing!',
            odds: '50% win chance • 2x payout',
            minBet: 10,
            maxBet: 1000
        },
        {
            id: 'dice',
            name: 'Lucky Dice',
            icon: '🎲',
            description: 'Roll higher than the house!',
            odds: '45% win chance • 2.2x payout',
            minBet: 20,
            maxBet: 500
        },
        {
            id: 'wheel',
            name: 'Wheel of Fortune',
            icon: '🎡',
            description: 'Spin to win big multipliers!',
            odds: 'Various prizes • Up to 10x',
            minBet: 50,
            maxBet: 200
        },
        {
            id: 'crash',
            name: 'Rocket Crash',
            icon: '🚀',
            description: 'Cash out before it crashes!',
            odds: 'Variable • Cash out anytime',
            minBet: 25,
            maxBet: 500
        }
    ];
    
    const playGame = (gameId) => {
        if (resources.hopium < betAmount) {
            showToast('Not enough HOPIUM!', 'error');
            return;
        }
        
        onResourceChange('hopium', -betAmount);
        setGameState('playing');
        
        switch(gameId) {
            case 'coinflip':
                playCoinFlip();
                break;
            case 'dice':
                playDice();
                break;
            case 'wheel':
                playWheel();
                break;
            case 'crash':
                playCrash();
                break;
        }
    };
    
    const playCoinFlip = () => {
        const playerChoice = coinSide || 'heads';
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        
        // Play coin flip sound
        if (window.GameSounds) window.GameSounds.coinFlip();
        
        // Set the flip result to trigger animation
        setFlipResult(result);
        
        setTimeout(() => {
            const won = playerChoice === result;
            const winnings = won ? betAmount * 2 : 0;
            
            if (won) {
                onResourceChange('hopium', winnings);
                if (window.GameSounds) window.GameSounds.win();
            } else {
                if (window.GameSounds) window.GameSounds.lose();
            }
            
            setResult({
                won,
                message: won ? `🎉 ${result.toUpperCase()}! You won ${winnings} HOPIUM!` : `😢 ${result.toUpperCase()}! Better luck next time.`,
                amount: won ? winnings : -betAmount
            });
            setFlipResult(null);
            setGameState('result');
        }, 1800);
    };
    
    const playDice = () => {
        const playerRoll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        const houseRoll = [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)];
        
        // Play dice roll sound
        if (window.GameSounds) window.GameSounds.diceRoll();
        
        // Start player rolling animation
        setDiceRolling(true);
        setDiceResult([1, 1]);
        setShowHouse(false);
        setHouseResult([1, 1]);
        
        // Stop player rolling after 1.5 seconds
        setTimeout(() => {
            setDiceRolling(false);
            setDiceResult(playerRoll);
            
            // Start house rolling after a brief pause
            setTimeout(() => {
                if (window.GameSounds) window.GameSounds.diceRoll();
                setShowHouse(true);
                setHouseRolling(true);
                
                // Stop house rolling
                setTimeout(() => {
                    setHouseRolling(false);
                    setHouseResult(houseRoll);
                    
                    // Show result after house dice settle
                    setTimeout(() => {
                        const playerTotal = playerRoll[0] + playerRoll[1];
                        const houseTotal = houseRoll[0] + houseRoll[1];
                        const won = playerTotal > houseTotal;
                        const tie = playerTotal === houseTotal;
                        const winnings = won ? Math.floor(betAmount * 2.2) : (tie ? betAmount : 0);
                        
                        if (won) {
                            onResourceChange('hopium', winnings);
                            if (window.GameSounds) window.GameSounds.win();
                        } else if (tie) {
                            onResourceChange('hopium', betAmount); // Return bet on tie
                            if (window.GameSounds) window.GameSounds.coinFlip();
                        } else {
                            if (window.GameSounds) window.GameSounds.lose();
                        }
                        
                        setResult({
                            won,
                            tie,
                            message: tie 
                                ? `🤝 TIE! Both rolled ${playerTotal}! Bet returned.`
                                : won 
                                    ? `🎉 You rolled ${playerTotal} vs House ${houseTotal}! Won ${winnings} HOPIUM!`
                                    : `😢 You rolled ${playerTotal} vs House ${houseTotal}. House wins!`,
                            amount: won ? winnings : (tie ? 0 : -betAmount),
                            playerRoll,
                            houseRoll
                        });
                        setGameState('result');
                    }, 500);
                }, 1200);
            }, 500);
        }, 1500);
        
        setDiceValues(playerRoll);
    };
    
    const playWheel = () => {
        const segments = [
            { multiplier: 0, label: '💀', chance: 0.25 },
            { multiplier: 1.5, label: '1.5x', chance: 0.30 },
            { multiplier: 2, label: '2x', chance: 0.20 },
            { multiplier: 3, label: '3x', chance: 0.15 },
            { multiplier: 5, label: '5x', chance: 0.08 },
            { multiplier: 10, label: '10x', chance: 0.02 }
        ];
        
        const rand = Math.random();
        let cumulative = 0;
        let selectedSegment = segments[0];
        
        for (const seg of segments) {
            cumulative += seg.chance;
            if (rand <= cumulative) {
                selectedSegment = seg;
                break;
            }
        }
        
        // Play wheel spin sound
        if (window.GameSounds) window.GameSounds.wheelSpin();
        
        // Calculate spin: 5-8 full rotations (1800-2880 deg) plus random landing
        const baseRotation = 1800 + Math.random() * 1080;
        setWheelRotation(baseRotation);
        setWheelSpinning(true);
        
        setTimeout(() => {
            setWheelSpinning(false);
            
            // Play wheel stop sound
            if (window.GameSounds) window.GameSounds.wheelStop();
            
            const won = selectedSegment.multiplier > 0;
            const winnings = Math.floor(betAmount * selectedSegment.multiplier);
            
            setTimeout(() => {
                if (won) {
                    onResourceChange('hopium', winnings);
                    if (selectedSegment.multiplier >= 5) {
                        if (window.GameSounds) window.GameSounds.jackpot();
                    } else {
                        if (window.GameSounds) window.GameSounds.win();
                    }
                } else {
                    if (window.GameSounds) window.GameSounds.lose();
                }
                
                setResult({
                    won,
                    message: won 
                        ? `🎉 ${selectedSegment.label}! Won ${winnings} HOPIUM!`
                        : `😢 Landed on ${selectedSegment.label}. No luck this time!`,
                    amount: won ? winnings : -betAmount
                });
                setGameState('result');
            }, 300);
        }, 4200);
    };
    
    const playCrash = () => {
        // Interactive crash - player must cash out manually!
        const crashPoint = 1 + Math.random() * 9; // 1x to 10x (can go higher!)
        
        // Play rocket launch sound
        if (window.GameSounds) window.GameSounds.rocketLaunch();
        
        // Reset rocket state
        setCrashMultiplier(1.00);
        setRocketCrashed(false);
        setCrashPoint(crashPoint);
        setCashedOut(false);
        
        // Animate multiplier counting up
        let currentMultiplier = 1.00;
        const speed = 0.02 + Math.random() * 0.03; // Variable speed
        
        const countInterval = setInterval(() => {
            if (cashedOutRef.current) {
                clearInterval(countInterval);
                return;
            }
            
            currentMultiplier += speed * (1 + (currentMultiplier - 1) * 0.1); // Accelerates!
            setCrashMultiplier(currentMultiplier);
            
            // Check if crashed
            if (currentMultiplier >= crashPoint) {
                clearInterval(countInterval);
                setRocketCrashed(true);
                setCrashMultiplier(crashPoint);
                
                // Play explosion sound
                if (window.GameSounds) window.GameSounds.explosion();
                
                setTimeout(() => {
                    if (window.GameSounds) window.GameSounds.lose();
                    
                    setResult({
                        won: false,
                        message: `💥 CRASHED at ${crashPoint.toFixed(2)}x! You didn't cash out in time!`,
                        amount: -betAmount
                    });
                    setGameState('result');
                }, 800);
            }
        }, 50);
        
        // Store interval for cleanup
        crashIntervalRef.current = countInterval;
    };
    
    // Refs for crash game
    const cashedOutRef = React.useRef(false);
    const crashIntervalRef = React.useRef(null);
    const [crashPoint, setCrashPoint] = useState(1);
    const [cashedOut, setCashedOut] = useState(false);
    
    const cashOut = () => {
        if (cashedOut || rocketCrashed || gameState !== 'playing') return;
        
        cashedOutRef.current = true;
        setCashedOut(true);
        
        if (crashIntervalRef.current) {
            clearInterval(crashIntervalRef.current);
        }
        
        const winnings = Math.floor(betAmount * crashMultiplier);
        onResourceChange('hopium', winnings);
        
        if (crashMultiplier >= 3) {
            if (window.GameSounds) window.GameSounds.jackpot();
        } else {
            if (window.GameSounds) window.GameSounds.win();
        }
        
        setResult({
            won: true,
            message: `🎉 Cashed out at ${crashMultiplier.toFixed(2)}x! Won ${winnings} HOPIUM!`,
            amount: winnings - betAmount
        });
        setGameState('result');
    };
    
    // Reset refs when starting new game
    React.useEffect(() => {
        if (gameState === 'playing' && activeGame?.id === 'crash') {
            cashedOutRef.current = false;
        }
    }, [gameState, activeGame]);
    
    const resetGame = () => {
        setGameState('idle');
        setResult(null);
        setActiveGame(null);
        setFlipResult(null);
        setDiceRolling(false);
        setDiceResult([1, 1]);
        setHouseRolling(false);
        setHouseResult([1, 1]);
        setShowHouse(false);
        setCrashMultiplier(1.00);
        setRocketCrashed(false);
        setCashedOut(false);
        setCrashPoint(1);
        setWheelSpinning(false);
        setWheelRotation(0);
        cashedOutRef.current = false;
        if (crashIntervalRef.current) {
            clearInterval(crashIntervalRef.current);
        }
    };
    
    return (
        <div className="casino-section">
            <div className="casino-header">
                <h2>🎰 Degen Casino</h2>
                <div style={{ color: '#888' }}>House edge benefits city treasury</div>
            </div>
            
            {!activeGame ? (
                <div className="casino-games">
                    {games.map(game => (
                        <div 
                            key={game.id} 
                            className="casino-game"
                            onClick={() => setActiveGame(game)}
                        >
                            <span className="casino-game-icon">{game.icon}</span>
                            <div className="casino-game-name">{game.name}</div>
                            <div className="casino-game-desc">{game.description}</div>
                            <div className="casino-game-odds">{game.odds}</div>
                            <button className="casino-play-btn">Play Now</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <h3 style={{ color: '#ffd700', marginBottom: '20px' }}>
                        {activeGame.icon} {activeGame.name}
                    </h3>
                    
                    {gameState === 'idle' && (
                        <>
                            {activeGame.id === 'coinflip' && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ color: '#888', marginBottom: '10px' }}>Choose your side:</p>
                                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                                        <button 
                                            className={`casino-bet-btn ${coinSide === 'heads' ? 'active' : ''}`}
                                            onClick={() => setCoinSide('heads')}
                                            style={{ 
                                                width: '80px', height: '80px', 
                                                background: coinSide === 'heads' ? '#ffd700' : 'transparent',
                                                color: coinSide === 'heads' ? '#000' : '#ffd700'
                                            }}
                                        >
                                            Heads
                                        </button>
                                        <button 
                                            className={`casino-bet-btn ${coinSide === 'tails' ? 'active' : ''}`}
                                            onClick={() => setCoinSide('tails')}
                                            style={{ 
                                                width: '80px', height: '80px',
                                                background: coinSide === 'tails' ? '#c0c0c0' : 'transparent',
                                                color: coinSide === 'tails' ? '#000' : '#c0c0c0'
                                            }}
                                        >
                                            Tails
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            <div className="casino-bet-controls">
                                <button 
                                    className="casino-bet-btn"
                                    onClick={() => setBetAmount(Math.max(activeGame.minBet, betAmount - 10))}
                                >
                                    -
                                </button>
                                <div className="casino-bet-amount">💊 {betAmount}</div>
                                <button 
                                    className="casino-bet-btn"
                                    onClick={() => setBetAmount(Math.min(activeGame.maxBet, betAmount + 10))}
                                >
                                    +
                                </button>
                            </div>
                            
                            <button 
                                className="casino-play-btn"
                                onClick={() => playGame(activeGame.id)}
                                disabled={resources.hopium < betAmount || (activeGame.id === 'coinflip' && !coinSide)}
                            >
                                {activeGame.id === 'coinflip' ? 'Flip!' : 
                                 activeGame.id === 'dice' ? 'Roll!' :
                                 activeGame.id === 'wheel' ? 'Spin!' : 'Launch!'}
                            </button>
                            
                            <button 
                                onClick={resetGame}
                                style={{ 
                                    marginTop: '15px', 
                                    background: 'transparent', 
                                    border: '1px solid #666', 
                                    color: '#666',
                                    padding: '8px 20px',
                                    borderRadius: '20px',
                                    cursor: 'pointer'
                                }}
                            >
                                ← Back to Games
                            </button>
                        </>
                    )}
                    
                    {gameState === 'playing' && (
                        <div style={{ padding: '20px' }}>
                            {/* Coin Flip Animation */}
                            {activeGame.id === 'coinflip' && (
                                <div className="coin-flip-container">
                                    <div className={`coin ${flipResult ? (flipResult === 'heads' ? 'flipping-heads' : 'flipping-tails') : 'flipping'}`}>
                                        <div className="coin-face coin-heads">🦁</div>
                                        <div className="coin-face coin-tails">🦅</div>
                                    </div>
                                    <p style={{ color: '#ffd700', marginTop: '20px', fontSize: '1.2em' }}>
                                        🪙 Flipping...
                                    </p>
                                </div>
                            )}
                            
                            {/* 3D Dice Rolling Animation */}
                            {activeGame.id === 'dice' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                                    {/* Player Dice */}
                                    <div>
                                        <p style={{ color: '#00ff88', marginBottom: '15px', fontWeight: 'bold', fontSize: '1.1em' }}>🎯 YOUR ROLL</p>
                                        <div className="dice-container">
                                            {[0, 1].map(diceIndex => (
                                                <div key={diceIndex} className={`dice-3d ${diceRolling ? 'rolling' : ''}`} 
                                                     style={!diceRolling && diceResult[diceIndex] ? {
                                                         transform: getDiceRotation(diceResult[diceIndex])
                                                     } : {}}>
                                                    {/* Face 1 - front */}
                                                    <div className="dice-face front">
                                                        <div></div><div></div><div></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div></div><div></div><div></div>
                                                    </div>
                                                    {/* Face 6 - back */}
                                                    <div className="dice-face back">
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 3 - right */}
                                                    <div className="dice-face right">
                                                        <div className="dice-dot"></div><div></div><div></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 4 - left */}
                                                    <div className="dice-face left">
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div></div><div></div><div></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 2 - top */}
                                                    <div className="dice-face top">
                                                        <div className="dice-dot"></div><div></div><div></div>
                                                        <div></div><div></div><div></div>
                                                        <div></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 5 - bottom */}
                                                    <div className="dice-face bottom">
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p style={{ color: '#00ff88', marginTop: '15px', fontSize: '1.3em', fontWeight: 'bold' }}>
                                            {diceRolling ? '🎲 Rolling...' : `Total: ${diceResult[0] + diceResult[1]}`}
                                        </p>
                                    </div>
                                    
                                    {/* VS Divider */}
                                    <div style={{ textAlign: 'center', color: '#ffd700', fontSize: '1.5em', fontWeight: 'bold' }}>
                                        ⚔️ VS ⚔️
                                    </div>
                                    
                                    {/* House Dice */}
                                    <div style={{ opacity: showHouse ? 1 : 0.3, transition: 'opacity 0.5s' }}>
                                        <p style={{ color: '#ff4444', marginBottom: '15px', fontWeight: 'bold', fontSize: '1.1em' }}>🏠 HOUSE ROLL</p>
                                        <div className="dice-container">
                                            {[0, 1].map(diceIndex => (
                                                <div key={`house-${diceIndex}`} className={`dice-3d ${houseRolling ? 'rolling' : ''}`} 
                                                     style={{
                                                         ...(!houseRolling && showHouse && houseResult[diceIndex] ? {
                                                             transform: getDiceRotation(houseResult[diceIndex])
                                                         } : {}),
                                                         background: 'linear-gradient(145deg, #ff4444, #cc0000)'
                                                     }}>
                                                    {/* Face 1 - front */}
                                                    <div className="dice-face front" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div></div><div></div><div></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div></div><div></div><div></div>
                                                    </div>
                                                    {/* Face 6 - back */}
                                                    <div className="dice-face back" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 3 - right */}
                                                    <div className="dice-face right" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div className="dice-dot"></div><div></div><div></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 4 - left */}
                                                    <div className="dice-face left" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div></div><div></div><div></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 2 - top */}
                                                    <div className="dice-face top" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div className="dice-dot"></div><div></div><div></div>
                                                        <div></div><div></div><div></div>
                                                        <div></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                    {/* Face 5 - bottom */}
                                                    <div className="dice-face bottom" style={{ background: 'linear-gradient(145deg, #ff4444, #cc0000)' }}>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                        <div></div><div className="dice-dot"></div><div></div>
                                                        <div className="dice-dot"></div><div></div><div className="dice-dot"></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p style={{ color: '#ff4444', marginTop: '15px', fontSize: '1.3em', fontWeight: 'bold' }}>
                                            {!showHouse ? '🎲 Waiting...' : houseRolling ? '🎲 Rolling...' : `Total: ${houseResult[0] + houseResult[1]}`}
                                        </p>
                                    </div>
                                </div>
                            )}
                            
                            {/* Wheel Spinning Animation */}
                            {activeGame.id === 'wheel' && (
                                <div>
                                    <div className="wheel-container">
                                        <div className="wheel-pointer">▼</div>
                                        <div 
                                            className={`wheel ${wheelSpinning ? 'spinning' : ''}`}
                                            style={{ 
                                                '--spin-degrees': `${wheelRotation}deg`,
                                                '--spin-duration': '4s'
                                            }}
                                        >
                                            {/* Segment labels */}
                                            {['💀', '1.5x', '2x', '3x', '5x', '10x'].map((label, i) => (
                                                <div 
                                                    key={i}
                                                    className="wheel-segment-label"
                                                    style={{ transform: `rotate(${i * 60 + 30}deg)` }}
                                                >
                                                    {label}
                                                </div>
                                            ))}
                                            <div className="wheel-inner">🎰</div>
                                        </div>
                                    </div>
                                    <p style={{ color: '#ffd700', marginTop: '10px', fontSize: '1.2em' }}>
                                        🎡 Spinning the wheel...
                                    </p>
                                </div>
                            )}
                            
                            {/* Rocket Crash Animation */}
                            {activeGame.id === 'crash' && (
                                <div>
                                    <div className="rocket-container">
                                        <div className="rocket-multiplier" style={{
                                            color: crashMultiplier >= 3 ? '#ffd700' : crashMultiplier >= 2 ? '#00ff88' : '#fff',
                                            textShadow: crashMultiplier >= 3 ? '0 0 20px #ffd700' : 'none'
                                        }}>
                                            {crashMultiplier.toFixed(2)}x
                                        </div>
                                        <div className={`rocket ${rocketCrashed ? 'crashed' : 'flying'}`}>
                                            {rocketCrashed ? '💥' : '🚀'}
                                        </div>
                                        {!rocketCrashed && !cashedOut && <div className="rocket-trail"></div>}
                                    </div>
                                    
                                    {/* Cash Out Button - Only visible while flying */}
                                    {!rocketCrashed && !cashedOut && (
                                        <button 
                                            onClick={cashOut}
                                            style={{
                                                background: crashMultiplier >= 2 
                                                    ? 'linear-gradient(135deg, #ffd700, #ff8c00)' 
                                                    : 'linear-gradient(135deg, #00ff88, #00cc6a)',
                                                border: 'none',
                                                borderRadius: '15px',
                                                padding: '15px 40px',
                                                color: '#000',
                                                fontWeight: 'bold',
                                                fontSize: '1.2em',
                                                cursor: 'pointer',
                                                marginTop: '20px',
                                                animation: 'pulse 0.5s ease-in-out infinite',
                                                boxShadow: '0 0 20px rgba(0, 255, 136, 0.5)'
                                            }}
                                        >
                                            💰 CASH OUT ({Math.floor(betAmount * crashMultiplier)} HOPIUM)
                                        </button>
                                    )}
                                    
                                    <p style={{ color: rocketCrashed ? '#ff4444' : cashedOut ? '#ffd700' : '#00ff88', marginTop: '15px', fontSize: '1.1em' }}>
                                        {rocketCrashed ? '💥 CRASHED!' : cashedOut ? '💰 CASHED OUT!' : '🚀 Cash out before it crashes!'}
                                    </p>
                                    
                                    {/* Potential Winnings Display */}
                                    {!rocketCrashed && !cashedOut && (
                                        <div style={{ marginTop: '10px', color: '#888', fontSize: '0.9em' }}>
                                            Potential: <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{Math.floor(betAmount * crashMultiplier)}</span> HOPIUM
                                            <br/>
                                            <span style={{ color: '#ff4444', fontSize: '0.8em' }}>⚠️ Could crash any moment!</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {gameState === 'result' && result && (
                        <div className={`casino-result ${result.won ? 'win' : 'lose'}`}>
                            <p style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: '10px' }}>
                                {result.message}
                            </p>
                            <p style={{ color: result.won ? '#00ff88' : '#ff4444' }}>
                                {result.won ? `+${result.amount}` : result.amount} HOPIUM
                            </p>
                            <button 
                                className="casino-play-btn"
                                onClick={resetGame}
                                style={{ marginTop: '15px' }}
                            >
                                Play Again
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ==================== EXPANDED ACHIEVEMENTS ====================

function DegenArcade({ resources, onResourceChange, playerName, onGameComplete, onUpdateQuest, zoneMultiplier = 1.0, currentZone }) {
    const [activeGame, setActiveGame] = useState(null);
    
    const games = [
        {
            id: 'shill_typing_race',
            title: 'Shill Typing Race',
            icon: '⌨️',
            difficulty: 'easy',
            description: 'Type bullish crypto phrases as fast as you can! 7 seconds of pure shilling!',
            rewards: ['+HOPIUM', '+WPM'],
            component: ShillTypingRace,
            featured: true
        },
        {
            id: 'whale_watcher',
            title: 'Whale Watcher',
            icon: '🐋',
            difficulty: 'hard',
            description: 'Spot whale transactions ($100K+) in a sea of trades! Don\'t let them escape.',
            rewards: ['+ALPHA', '+XP'],
            component: WhaleWatcher,
            featured: true
        },
        {
            id: 'rug_pull_reflex',
            title: 'Rug Pull Reflex',
            icon: '🚨',
            difficulty: 'medium',
            description: 'Watch the chart pump then SELL before the rug! 10 rounds of panic.',
            rewards: ['+HOPIUM', '+REFLEXES'],
            component: RugPullReflex,
            featured: true
        },
        {
            id: 'falling_knife',
            title: 'Catch the Falling Knife',
            icon: '🔪',
            difficulty: 'easy',
            description: 'Catch green candles, avoid red ones. Classic degen reflexes test!',
            rewards: ['+HOPIUM', '+XP'],
            component: CatchTheFallingKnife
        },
        {
            id: 'chart_battle',
            title: 'Chart Battle',
            icon: '📊',
            difficulty: 'medium',
            description: 'Predict candle directions. Test your TA skills against the algo!',
            rewards: ['+ALPHA', '+Reputation'],
            component: ChartBattle,
            zoneBonus: currentZone === 'chart_district' ? 1.5 : 1.0
        },
        {
            id: 'meme_generator',
            title: 'Meme Generator',
            icon: '🎨',
            difficulty: 'easy',
            description: 'Create viral memes for the community. Top memes win prizes!',
            rewards: ['+HOPIUM', '+Social Score'],
            component: MemeGenerator
        },
        {
            id: 'rug_detector',
            title: 'Spot the Rug',
            icon: '🔍',
            difficulty: 'hard',
            description: 'Analyze tokenomics and spot the rugs before they pull!',
            rewards: ['+ALPHA', '+Detective Badge'],
            component: SpotTheRug
        }
    ];
    
    const handleReward = (resourceType, amount) => {
        if (onResourceChange) {
            // Apply zone multiplier to rewards!
            const multipliedAmount = Math.floor(amount * zoneMultiplier);
            onResourceChange(resourceType, multipliedAmount);
        }
    };
    
    const handleGameComplete = (gameId, stats) => {
        if (onGameComplete) {
            onGameComplete(gameId, stats);
        }
        if (onUpdateQuest) {
            onUpdateQuest('games_played', 1);
            // Update specific quest types based on game
            if (gameId === 'falling_knife') {
                onUpdateQuest('hopium_earned', stats.hopiumEarned || 0);
                if (stats.score >= 500) onUpdateQuest('knife_highscore', 1);
            }
            if (gameId === 'chart_battle' && stats.wins) {
                onUpdateQuest('chart_wins', stats.wins);
            }
            if (gameId === 'rug_detector' && stats.correctRugs) {
                onUpdateQuest('rugs_found', stats.correctRugs);
            }
            if (gameId === 'meme_generator' && stats.score >= 60) {
                onUpdateQuest('viral_memes', 1);
            }
            if (stats.maxCombo >= 10) {
                onUpdateQuest('max_combo', 1);
            }
        }
    };
    
    return (
        <div className="arcade-section">
            <div className="arcade-header">
                <h2>🎮 Degen Arcade</h2>
                <div className="resource-display">
                    {zoneMultiplier > 1 && (
                        <div className="resource-item" style={{ borderColor: '#ff69b4', color: '#ff69b4' }}>
                            <span>🎯 {zoneMultiplier}x Zone Bonus!</span>
                        </div>
                    )}
                    <div className="resource-item hopium">
                        <span className="resource-icon">💊</span>
                        <span>{(resources?.hopium || 0).toLocaleString()} HOPIUM</span>
                    </div>
                    <div className="resource-item alpha">
                        <span className="resource-icon">🔮</span>
                        <span>{(resources?.alpha || 0).toLocaleString()} ALPHA</span>
                    </div>
                </div>
            </div>
            
            <div className="games-grid">
                {games.map(game => (
                    <div 
                        key={game.id}
                        className="game-card"
                        onClick={() => !game.comingSoon && setActiveGame(game)}
                        style={{ opacity: game.comingSoon ? 0.6 : 1 }}
                    >
                        <div className="game-card-header">
                            <span className="game-icon">{game.icon}</span>
                            <div>
                                <div className="game-title">{game.title}</div>
                                <div className={`game-difficulty ${game.difficulty}`}>
                                    {game.difficulty.toUpperCase()}
                                </div>
                            </div>
                        </div>
                        <div className="game-description">
                            {game.comingSoon ? '🔒 Coming Soon...' : game.description}
                        </div>
                        <div className="game-rewards">
                            {game.rewards.map((reward, idx) => (
                                <span key={idx} className="reward-tag">{reward}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            
            {activeGame && (
                <activeGame.component
                    onClose={() => setActiveGame(null)}
                    onReward={handleReward}
                    playerName={playerName}
                    onGameComplete={(stats) => handleGameComplete(activeGame.id, stats)}
                />
            )}
        </div>
    );
}


function TokenSniperGame({ resources, onResourceChange, showToast }) {
    const [gameState, setGameState] = useState('idle'); // idle, countdown, playing, result
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [targetVisible, setTargetVisible] = useState(false);
    const [targetPosition, setTargetPosition] = useState({ x: 50, y: 50 });
    const [countdown, setCountdown] = useState(3);
    const [hits, setHits] = useState(0);
    const [misses, setMisses] = useState(0);
    
    const startGame = () => {
        if (resources.hopium < 50) {
            showToast('Need 50 HOPIUM to play!', 'error');
            return;
        }
        onResourceChange('hopium', -50);
        setGameState('countdown');
        setCountdown(3);
        setScore(0);
        setHits(0);
        setMisses(0);
    };
    
    useEffect(() => {
        if (gameState === 'countdown' && countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else if (gameState === 'countdown' && countdown === 0) {
            setGameState('playing');
            setTimeLeft(15);
        }
    }, [gameState, countdown]);
    
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        if (timeLeft <= 0) {
            setGameState('result');
            const reward = Math.floor(score * 2);
            if (reward > 0) {
                onResourceChange('hopium', reward);
                showToast(`🎯 Earned ${reward} HOPIUM!`, 'success');
            }
            return;
        }
        
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [gameState, timeLeft]);
    
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const showTarget = () => {
            setTargetPosition({
                x: 20 + Math.random() * 60,
                y: 20 + Math.random() * 60
            });
            setTargetVisible(true);
            
            // Hide after random time
            setTimeout(() => {
                setTargetVisible(false);
            }, 500 + Math.random() * 500);
        };
        
        showTarget();
        const interval = setInterval(showTarget, 800 + Math.random() * 400);
        return () => clearInterval(interval);
    }, [gameState]);
    
    const handleClick = (e) => {
        if (gameState !== 'playing') return;
        
        if (targetVisible) {
            setScore(prev => prev + 10);
            setHits(prev => prev + 1);
            setTargetVisible(false);
        } else {
            setScore(prev => Math.max(0, prev - 5));
            setMisses(prev => prev + 1);
        }
    };
    
    return (
        <div className="sniper-game">
            <h3 style={{ color: '#ff0064', marginBottom: '10px' }}>🎯 Token Sniper</h3>
            <p style={{ color: '#888', fontSize: '0.85em' }}>Snipe tokens before they disappear!</p>
            
            {gameState === 'idle' && (
                <div style={{ marginTop: '20px' }}>
                    <p style={{ color: '#ffd700', marginBottom: '15px' }}>Cost: 50 HOPIUM</p>
                    <button 
                        onClick={startGame}
                        style={{
                            background: 'linear-gradient(135deg, #ff0064, #cc0050)',
                            border: 'none',
                            padding: '15px 40px',
                            borderRadius: '25px',
                            color: '#fff',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '1.1em'
                        }}
                    >
                        Start Sniping
                    </button>
                </div>
            )}
            
            {gameState === 'countdown' && (
                <div style={{ fontSize: '4em', color: '#ffd700', margin: '40px 0' }}>
                    {countdown}
                </div>
            )}
            
            {gameState === 'playing' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '15px 0' }}>
                        <span style={{ color: '#ffd700' }}>Score: {score}</span>
                        <span style={{ color: '#ff6666' }}>Time: {timeLeft}s</span>
                    </div>
                    <div 
                        onClick={handleClick}
                        style={{
                            width: '100%',
                            height: '200px',
                            background: 'rgba(0,0,0,0.5)',
                            borderRadius: '10px',
                            position: 'relative',
                            cursor: 'crosshair',
                            overflow: 'hidden'
                        }}
                    >
                        {targetVisible && (
                            <div style={{
                                position: 'absolute',
                                left: `${targetPosition.x}%`,
                                top: `${targetPosition.y}%`,
                                transform: 'translate(-50%, -50%)',
                                fontSize: '2em',
                                animation: 'pulse 0.3s ease infinite'
                            }}>
                                🎯
                            </div>
                        )}
                    </div>
                </>
            )}
            
            {gameState === 'result' && (
                <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '1.5em', color: '#ffd700', marginBottom: '15px' }}>
                        Final Score: {score}
                    </div>
                    <div style={{ color: '#888', marginBottom: '15px' }}>
                        Hits: {hits} | Misses: {misses}
                    </div>
                    <div style={{ color: '#00ff88', marginBottom: '20px' }}>
                        Reward: +{Math.floor(score * 2)} HOPIUM
                    </div>
                    <button 
                        onClick={() => setGameState('idle')}
                        style={{
                            background: '#444',
                            border: 'none',
                            padding: '10px 25px',
                            borderRadius: '20px',
                            color: '#fff',
                            cursor: 'pointer'
                        }}
                    >
                        Play Again
                    </button>
                </div>
            )}
        </div>
    );
}

// ==================== SLOT MACHINE ====================

function SlotMachine({ resources, onResourceChange, showToast, onMayorComment, playerName, playerLevel }) {
    const [reels, setReels] = useState(['🍋', '🍋', '🍋']);
    const [spinning, setSpinning] = useState(false);
    const [bet, setBet] = useState(25);
    const [result, setResult] = useState(null);
    
    const symbols = ['🍋', '🍒', '🍊', '💎', '7️⃣', '🐋', '🚀', '💰'];
    const payouts = {
        '7️⃣7️⃣7️⃣': 50,
        '💎💎💎': 25,
        '🚀🚀🚀': 15,
        '🐋🐋🐋': 10,
        '💰💰💰': 8,
        '🍒🍒🍒': 5,
        '🍊🍊🍊': 3,
        '🍋🍋🍋': 2
    };
    
    const spin = () => {
        if (resources.hopium < bet) {
            showToast('Not enough HOPIUM!', 'error');
            if (window.GameSounds) window.GameSounds.error();
            return;
        }
        
        onResourceChange('hopium', -bet);
        setSpinning(true);
        setResult(null);
        
        // Play slot spin sound
        if (window.GameSounds) window.GameSounds.slotSpin();
        
        // Animate reels
        let spins = 0;
        const spinInterval = setInterval(() => {
            setReels([
                symbols[Math.floor(Math.random() * symbols.length)],
                symbols[Math.floor(Math.random() * symbols.length)],
                symbols[Math.floor(Math.random() * symbols.length)]
            ]);
            spins++;
            
            if (spins >= 20) {
                clearInterval(spinInterval);
                
                // Final result
                const finalReels = [
                    symbols[Math.floor(Math.random() * symbols.length)],
                    symbols[Math.floor(Math.random() * symbols.length)],
                    symbols[Math.floor(Math.random() * symbols.length)]
                ];
                setReels(finalReels);
                setSpinning(false);
                
                // Check win
                const combo = finalReels.join('');
                const multiplier = payouts[combo];
                
                if (multiplier) {
                    const winnings = bet * multiplier;
                    onResourceChange('hopium', winnings);
                    setResult({ win: true, amount: winnings, multiplier });
                    showToast(`🎰 JACKPOT! Won ${winnings} HOPIUM!`, 'success');
                    // Play jackpot sound for big wins
                    if (window.GameSounds) {
                        if (multiplier >= 10) {
                            window.GameSounds.jackpot();
                        } else {
                            window.GameSounds.win();
                        }
                    }
                    // Trigger Mayor comment for big wins
                    if (onMayorComment && multiplier >= 10) {
                        onMayorComment('casino', 'jackpot', { playerName, playerLevel, amount: winnings });
                    } else if (onMayorComment && winnings > 100) {
                        onMayorComment('casino', 'win', { playerName, playerLevel, amount: winnings });
                    }
                } else if (finalReels[0] === finalReels[1] || finalReels[1] === finalReels[2]) {
                    // Two matching
                    const winnings = Math.floor(bet * 1.5);
                    onResourceChange('hopium', winnings);
                    setResult({ win: true, amount: winnings, multiplier: 1.5 });
                    if (window.GameSounds) window.GameSounds.win();
                } else {
                    setResult({ win: false });
                    if (window.GameSounds) window.GameSounds.lose();
                    // Occasionally comment on losses (10% chance)
                    if (onMayorComment && Math.random() < 0.1) {
                        onMayorComment('casino', 'loss', { playerName, playerLevel, amount: bet });
                    }
                }
            }
        }, 100);
    };
    
    return (
        <div className="slot-machine">
            <h3 style={{ color: '#ffd700', marginBottom: '10px' }}>🎰 Lucky Slots</h3>
            
            <div className="slot-display">
                {reels.map((symbol, idx) => (
                    <div key={idx} className={`slot-reel ${spinning ? 'spinning' : ''}`}>
                        {symbol}
                    </div>
                ))}
            </div>
            
            {result && (
                <div style={{ 
                    color: result.win ? '#00ff88' : '#ff4444',
                    fontSize: '1.2em',
                    marginBottom: '15px'
                }}>
                    {result.win ? `🎉 Won ${result.amount} HOPIUM! (${result.multiplier}x)` : '😢 No luck!'}
                </div>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '15px' }}>
                <button 
                    onClick={() => setBet(Math.max(10, bet - 10))}
                    style={{ background: '#444', border: 'none', padding: '8px 15px', borderRadius: '5px', color: '#fff', cursor: 'pointer' }}
                >
                    -
                </button>
                <span style={{ color: '#ffd700', fontWeight: 'bold', minWidth: '80px' }}>
                    Bet: {bet}
                </span>
                <button 
                    onClick={() => setBet(Math.min(500, bet + 10))}
                    style={{ background: '#444', border: 'none', padding: '8px 15px', borderRadius: '5px', color: '#fff', cursor: 'pointer' }}
                >
                    +
                </button>
            </div>
            
            <button 
                onClick={spin}
                disabled={spinning}
                style={{
                    background: spinning ? '#666' : 'linear-gradient(135deg, #ffd700, #ff8c00)',
                    border: 'none',
                    padding: '15px 50px',
                    borderRadius: '25px',
                    color: '#000',
                    fontWeight: 'bold',
                    fontSize: '1.2em',
                    cursor: spinning ? 'not-allowed' : 'pointer'
                }}
            >
                {spinning ? 'Spinning...' : 'SPIN!'}
            </button>
            
            <div style={{ marginTop: '15px', fontSize: '0.8em', color: '#888' }}>
                Match 3: 2x-50x | Match 2: 1.5x
            </div>
        </div>
    );
}

// ==================== BATTLE PASS ====================

function CatchTheFallingKnife({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start'); // start, playing, gameover
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [timeLeft, setTimeLeft] = useState(30);
    const [playerX, setPlayerX] = useState(50);
    const [fallingItems, setFallingItems] = useState([]);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [showCombo, setShowCombo] = useState(null);
    const [highScore, setHighScore] = useState(() => {
        const saved = localStorage.getItem('knife_game_highscore');
        return saved ? parseInt(saved) : 0;
    });
    const gameRef = useRef(null);
    const animationRef = useRef(null);
    const lastSpawnRef = useRef(0);
    
    // Item types
    const ITEMS = {
        GREEN_CANDLE: { emoji: '📈', points: 10, type: 'good' },
        GOLDEN_CANDLE: { emoji: '⭐', points: 50, type: 'golden' },
        RED_CANDLE: { emoji: '📉', points: -1, type: 'bad' }, // Lose a life
        HOPIUM: { emoji: '💊', points: 25, type: 'good' },
        RUG: { emoji: '🧹', points: -1, type: 'bad' }
    };
    
    // Handle keyboard/touch input
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'a') {
                setPlayerX(prev => Math.max(5, prev - 8));
            } else if (e.key === 'ArrowRight' || e.key === 'd') {
                setPlayerX(prev => Math.min(95, prev + 8));
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);
    
    // Mouse/touch movement
    const handleMouseMove = useCallback((e) => {
        if (gameState !== 'playing' || !gameRef.current) return;
        const rect = gameRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        setPlayerX(Math.max(5, Math.min(95, x)));
    }, [gameState]);
    
    const handleTouchMove = useCallback((e) => {
        if (gameState !== 'playing' || !gameRef.current) return;
        const rect = gameRef.current.getBoundingClientRect();
        const x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
        setPlayerX(Math.max(5, Math.min(95, x)));
    }, [gameState]);
    
    // Game loop
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const gameLoop = () => {
            const now = Date.now();
            
            // Spawn new items
            const spawnRate = Math.max(500, 1500 - (30 - timeLeft) * 30); // Gets faster
            if (now - lastSpawnRef.current > spawnRate) {
                lastSpawnRef.current = now;
                
                // Determine item type
                const rand = Math.random();
                let itemType;
                if (rand < 0.5) itemType = ITEMS.GREEN_CANDLE;
                else if (rand < 0.7) itemType = ITEMS.RED_CANDLE;
                else if (rand < 0.85) itemType = ITEMS.HOPIUM;
                else if (rand < 0.95) itemType = ITEMS.RUG;
                else itemType = ITEMS.GOLDEN_CANDLE;
                
                const newItem = {
                    id: now,
                    x: 5 + Math.random() * 90,
                    y: -5,
                    speed: 0.6 + Math.random() * 0.6 + (30 - timeLeft) * 0.02,
                    ...itemType
                };
                
                setFallingItems(prev => [...prev, newItem]);
            }
            
            // Update item positions and check collisions
            setFallingItems(prev => {
                const updated = [];
                let scoreChange = 0;
                let livesChange = 0;
                let caught = false;
                let caughtGood = false;
                
                for (const item of prev) {
                    const newY = item.y + item.speed;
                    
                    // Check collision with player (bottom 15% of screen, within player width)
                    const playerLeft = playerX - 8;
                    const playerRight = playerX + 8;
                    
                    if (newY > 80 && newY < 95 && item.x > playerLeft && item.x < playerRight) {
                        // Caught!
                        caught = true;
                        if (item.type === 'bad') {
                            livesChange -= 1;
                            setCombo(0);
                            // Screen shake
                            if (gameRef.current) {
                                gameRef.current.classList.add('screen-shake');
                                setTimeout(() => gameRef.current?.classList.remove('screen-shake'), 200);
                            }
                        } else {
                            caughtGood = true;
                            const comboMultiplier = 1 + Math.floor(combo / 5) * 0.5;
                            scoreChange += Math.floor(item.points * comboMultiplier);
                            if (item.type === 'golden') {
                                setShowCombo('⭐ GOLDEN! ⭐');
                                setTimeout(() => setShowCombo(null), 500);
                            }
                        }
                        continue; // Don't add to updated list
                    }
                    
                    // Remove if off screen
                    if (newY > 105) {
                        // Missed a good item
                        if (item.type === 'good' || item.type === 'golden') {
                            setCombo(0);
                        }
                        continue;
                    }
                    
                    updated.push({ ...item, y: newY });
                }
                
                if (caughtGood) {
                    setCombo(c => {
                        const newCombo = c + 1;
                        if (newCombo > maxCombo) {
                            setMaxCombo(newCombo);
                        }
                        if (newCombo > 0 && newCombo % 5 === 0) {
                            setShowCombo(`🔥 ${newCombo}x COMBO! 🔥`);
                            setTimeout(() => setShowCombo(null), 500);
                        }
                        return newCombo;
                    });
                }
                
                if (scoreChange !== 0) {
                    setScore(s => Math.max(0, s + scoreChange));
                }
                
                if (livesChange !== 0) {
                    setLives(l => {
                        const newLives = l + livesChange;
                        if (newLives <= 0) {
                            setGameState('gameover');
                        }
                        return Math.max(0, newLives);
                    });
                }
                
                return updated;
            });
            
            animationRef.current = requestAnimationFrame(gameLoop);
        };
        
        animationRef.current = requestAnimationFrame(gameLoop);
        
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [gameState, playerX, timeLeft, combo]);
    
    // Timer
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    setGameState('gameover');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [gameState]);
    
    // Handle game over
    useEffect(() => {
        if (gameState === 'gameover') {
            // Update high score
            if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('knife_game_highscore', score.toString());
            }
            
            // Calculate HOPIUM reward
            const hopiumEarned = Math.floor(score / 2);
            if (hopiumEarned > 0 && onReward) {
                onReward('hopium', hopiumEarned);
            }
            
            // Report game completion for tracking
            if (onGameComplete) {
                onGameComplete({
                    score,
                    hopiumEarned,
                    maxCombo,
                    isHighScore: score > highScore
                });
            }
        }
    }, [gameState, score, highScore, onReward, maxCombo, onGameComplete]);
    
    const startGame = () => {
        setGameState('playing');
        setScore(0);
        setLives(3);
        setTimeLeft(30);
        setFallingItems([]);
        setCombo(0);
        setMaxCombo(0);
        lastSpawnRef.current = Date.now();
    };
    
    const hopiumEarned = Math.floor(score / 2);
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal">
                <div className="game-modal-header">
                    <div className="game-modal-title">🔪 Catch the Falling Knife</div>
                    <button className="game-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div 
                    ref={gameRef}
                    className="knife-game-container"
                    onMouseMove={handleMouseMove}
                    onTouchMove={handleTouchMove}
                >
                    {gameState === 'start' && (
                        <div className="game-start-screen">
                            <h3>🔪 Catch the Falling Knife 🔪</h3>
                            <div className="game-instructions">
                                <p>Catch <span className="green">📈 Green candles</span> and <span className="green">💊 Hopium</span> for points!</p>
                                <p>Avoid <span className="red">📉 Red candles</span> and <span className="red">🧹 Rugs</span>!</p>
                                <p>Catch <span className="gold">⭐ Golden stars</span> for bonus points!</p>
                                <p style={{ marginTop: '15px' }}>Use <strong>mouse</strong>, <strong>touch</strong>, or <strong>arrow keys</strong> to move</p>
                                <p style={{ marginTop: '10px', color: '#00ff88' }}>Build combos for multiplier bonuses!</p>
                            </div>
                            <button className="game-start-btn" onClick={startGame}>
                                🎮 START GAME
                            </button>
                            {highScore > 0 && (
                                <p style={{ marginTop: '15px', color: '#ffd700' }}>
                                    🏆 High Score: {highScore}
                                </p>
                            )}
                        </div>
                    )}
                    
                    {gameState === 'playing' && (
                        <>
                            <div className="knife-game-hud">
                                <div className="knife-game-score hopium">
                                    💰 Score: {score}
                                    {combo >= 5 && <span style={{ marginLeft: '10px', color: '#ffd700' }}>🔥{combo}x</span>}
                                </div>
                                <div className="knife-game-timer">⏱️ {timeLeft}s</div>
                                <div className="knife-game-score lives">
                                    {'❤️'.repeat(lives)}{'🖤'.repeat(3 - lives)}
                                </div>
                            </div>
                            
                            {/* Falling items */}
                            {fallingItems.map(item => (
                                <div
                                    key={item.id}
                                    className={`falling-item ${item.type === 'good' ? 'green-candle' : item.type === 'golden' ? 'golden' : 'red-candle'}`}
                                    style={{
                                        left: `${item.x}%`,
                                        top: `${item.y}%`,
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    {item.emoji}
                                </div>
                            ))}
                            
                            {/* Player basket */}
                            <div 
                                className="knife-game-player"
                                style={{ left: `calc(${playerX}% - 30px)` }}
                            />
                            
                            {/* Combo popup */}
                            {showCombo && (
                                <div className="combo-indicator">{showCombo}</div>
                            )}
                        </>
                    )}
                    
                    {gameState === 'gameover' && (
                        <div className="game-over-screen">
                            <h3>💀 REKT! 💀</h3>
                            <div className="final-score">
                                Final Score: {score}
                                {score > highScore - score && score === highScore && (
                                    <span style={{ display: 'block', color: '#ffd700', fontSize: '0.8em' }}>
                                        🏆 NEW HIGH SCORE! 🏆
                                    </span>
                                )}
                            </div>
                            <div className="reward-earned">
                                +{hopiumEarned} HOPIUM earned! 💊
                            </div>
                            <div className="game-over-buttons">
                                <button className="game-over-btn play-again" onClick={startGame}>
                                    🔄 Play Again
                                </button>
                                <button className="game-over-btn close" onClick={onClose}>
                                    Exit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Mini leaderboard */}
                <div className="game-leaderboard">
                    <h4>🏆 Top Degens Today</h4>
                    {[
                        { rank: 1, name: 'DiamondHands69', score: 2450 },
                        { rank: 2, name: 'RektRevenger', score: 1890 },
                        { rank: 3, name: 'RugSurvivor', score: 1650 },
                        { rank: 4, name: playerName || 'You', score: Math.max(score, highScore), isYou: true },
                        { rank: 5, name: 'PaperTrader', score: 890 }
                    ].sort((a, b) => b.score - a.score).map((entry, idx) => (
                        <div key={idx} className={`leaderboard-row ${entry.isYou ? 'you' : ''}`}>
                            <span className="leaderboard-rank">#{idx + 1}</span>
                            <span className="leaderboard-name">{entry.name}</span>
                            <span className="leaderboard-score">{entry.score}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ==================== CHART BATTLE GAME ====================

function ChartBattle({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start');
    const [round, setRound] = useState(1);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(5);
    const [candles, setCandles] = useState([]);
    const [prediction, setPrediction] = useState(null);
    const [result, setResult] = useState(null);
    const [streak, setStreak] = useState(0);
    const [wins, setWins] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [highScore, setHighScore] = useState(() => {
        const saved = localStorage.getItem('chart_battle_highscore');
        return saved ? parseInt(saved) : 0;
    });
    const totalRounds = 10;
    
    // Generate random candle pattern
    const generateCandles = () => {
        const newCandles = [];
        let currentPrice = 50 + Math.random() * 30; // Starting price
        
        for (let i = 0; i < 7; i++) {
            const prevPrice = currentPrice;
            // Random price change
            const change = (Math.random() - 0.5) * 25;
            currentPrice = Math.max(15, Math.min(95, currentPrice + change));
            
            // Green if price went UP, Red if price went DOWN
            const isGreen = currentPrice > prevPrice;
            const isCrab = Math.abs(currentPrice - prevPrice) < 3; // Small change = crab
            
            const bodyHeight = 15 + Math.random() * 25;
            const wickTop = 5 + Math.random() * 12;
            const wickBottom = 5 + Math.random() * 12;
            
            newCandles.push({
                openPrice: prevPrice,
                closePrice: currentPrice,
                height: Math.max(prevPrice, currentPrice), // Visual height for positioning
                bodyHeight,
                wickTop,
                wickBottom,
                isGreen,
                isCrab,
                hidden: i === 6 // Last candle is hidden
            });
        }
        return newCandles;
    };
    
    // Start new round
    const startRound = () => {
        setCandles(generateCandles());
        setPrediction(null);
        setResult(null);
        setTimeLeft(5);
    };
    
    // Timer countdown
    useEffect(() => {
        if (gameState !== 'playing' || result !== null) return;
        
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    // Time's up - auto fail if no prediction
                    if (prediction === null) {
                        handleResult(false);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(timer);
    }, [gameState, result, prediction]);
    
    // Make prediction
    const makePrediction = (pred) => {
        if (prediction !== null || result !== null) return;
        setPrediction(pred);
        
        // Reveal the candle and check result
        setTimeout(() => {
            const lastCandle = candles[6];
            
            // Determine actual result based on candle properties
            let actual;
            if (lastCandle.isCrab) {
                actual = 'crab';
            } else if (lastCandle.isGreen) {
                actual = 'up';  // Green = price went UP
            } else {
                actual = 'down'; // Red = price went DOWN
            }
            
            const correct = pred === actual;
            handleResult(correct, actual);
        }, 500);
    };
    
    const handleResult = (correct, actual) => {
        // Reveal candle
        setCandles(prev => prev.map((c, i) => i === 6 ? { ...c, hidden: false } : c));
        
        if (correct) {
            const streakBonus = Math.floor(streak / 3) * 10;
            const points = 100 + streakBonus;
            setScore(prev => prev + points);
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > maxStreak) setMaxStreak(newStreak);
                return newStreak;
            });
            setWins(prev => prev + 1);
            setResult('✅ Correct! +' + points);
        } else {
            setStreak(0);
            setResult('❌ Wrong!');
        }
        
        // Next round or game over
        setTimeout(() => {
            if (round >= totalRounds) {
                setGameState('gameover');
            } else {
                setRound(prev => prev + 1);
                startRound();
            }
        }, 1500);
    };
    
    // Handle game over
    useEffect(() => {
        if (gameState === 'gameover') {
            if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('chart_battle_highscore', score.toString());
            }
            
            const alphaEarned = Math.floor(score / 10);
            if (alphaEarned > 0 && onReward) {
                onReward('alpha', alphaEarned);
            }
            
            // Report game completion
            if (onGameComplete) {
                onGameComplete({
                    score,
                    wins,
                    maxCombo: maxStreak,
                    alphaEarned
                });
            }
        }
    }, [gameState, score, highScore, onReward, wins, maxStreak, onGameComplete]);
    
    const startGame = () => {
        setGameState('playing');
        setRound(1);
        setScore(0);
        setStreak(0);
        setWins(0);
        setMaxStreak(0);
        startRound();
    };
    
    const alphaEarned = Math.floor(score / 10);
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal">
                <div className="game-modal-header">
                    <div className="game-modal-title">📊 Chart Battle</div>
                    <button className="game-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="chart-battle-container">
                    {gameState === 'start' && (
                        <div className="game-start-screen">
                            <h3>📊 Chart Battle 📊</h3>
                            <div className="game-instructions">
                                <p>Predict where the next candle will go!</p>
                                <p><span className="green">📈 UP</span> - Price goes higher</p>
                                <p><span className="red">📉 DOWN</span> - Price goes lower</p>
                                <p><span className="gold">🦀 CRAB</span> - Price stays flat</p>
                                <p style={{ marginTop: '15px' }}>Build streaks for bonus points!</p>
                                <p style={{ color: '#888' }}>{totalRounds} rounds total</p>
                            </div>
                            <button className="game-start-btn" onClick={startGame}>
                                🎮 START BATTLE
                            </button>
                            {highScore > 0 && (
                                <p style={{ marginTop: '15px', color: '#ffd700' }}>
                                    🏆 High Score: {highScore}
                                </p>
                            )}
                        </div>
                    )}
                    
                    {gameState === 'playing' && (
                        <>
                            <div className="chart-battle-hud">
                                <div className="round-indicator">
                                    Round {round}/{totalRounds} | Score: {score}
                                    {streak >= 3 && <span style={{ color: '#ff6600' }}> 🔥{streak}</span>}
                                </div>
                                <div className="chart-timer">⏱️ {timeLeft}s</div>
                            </div>
                            
                            <div className="chart-display">
                                <div className="chart-candles">
                                    {candles.map((candle, idx) => (
                                        <div 
                                            key={idx} 
                                            className={`candle ${candle.isGreen ? 'green' : 'red'} ${candle.hidden ? 'hidden' : ''} ${idx === 6 && !candle.hidden ? 'reveal' : ''}`}
                                            style={{ height: `${candle.height}%` }}
                                        >
                                            <div className="candle-wick" style={{ height: `${candle.wickTop}px` }} />
                                            <div className="candle-body" style={{ height: `${candle.bodyHeight}px` }} />
                                            <div className="candle-wick" style={{ height: `${candle.wickBottom}px` }} />
                                        </div>
                                    ))}
                                </div>
                                
                                {result && (
                                    <div className="result-overlay">{result}</div>
                                )}
                            </div>
                            
                            <div className="prediction-buttons">
                                <button 
                                    className={`predict-btn up ${prediction === 'up' ? 'selected' : ''}`}
                                    onClick={() => makePrediction('up')}
                                    disabled={prediction !== null}
                                >
                                    📈 UP
                                </button>
                                <button 
                                    className={`predict-btn crab ${prediction === 'crab' ? 'selected' : ''}`}
                                    onClick={() => makePrediction('crab')}
                                    disabled={prediction !== null}
                                >
                                    🦀 CRAB
                                </button>
                                <button 
                                    className={`predict-btn down ${prediction === 'down' ? 'selected' : ''}`}
                                    onClick={() => makePrediction('down')}
                                    disabled={prediction !== null}
                                >
                                    📉 DOWN
                                </button>
                            </div>
                        </>
                    )}
                    
                    {gameState === 'gameover' && (
                        <div className="game-over-screen">
                            <h3>📊 Battle Complete!</h3>
                            <div className="final-score">
                                Final Score: {score}
                                {score > highScore - score && score === highScore && (
                                    <span style={{ display: 'block', color: '#ffd700', fontSize: '0.8em' }}>
                                        🏆 NEW HIGH SCORE! 🏆
                                    </span>
                                )}
                            </div>
                            <div className="reward-earned">
                                +{alphaEarned} ALPHA earned! 🔮
                            </div>
                            <div className="game-over-buttons">
                                <button className="game-over-btn play-again" onClick={startGame}>
                                    🔄 Play Again
                                </button>
                                <button className="game-over-btn close" onClick={onClose}>
                                    Exit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ==================== MEME GENERATOR GAME ====================

function MemeGenerator({ onClose, onReward, playerName, onGameComplete }) {
    const [topText, setTopText] = useState('');
    const [bottomText, setBottomText] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('🐸');
    const [customImage, setCustomImage] = useState(null);
    const [bgColor, setBgColor] = useState('#1a1a2e');
    const [submitted, setSubmitted] = useState(false);
    const [memeScore, setMemeScore] = useState(0);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const fileInputRef = useRef(null);
    
    // Load high score and meme count from localStorage
    const [highScore, setHighScore] = useState(() => {
        const saved = localStorage.getItem('meme_generator_highscore');
        return saved ? parseInt(saved) : 0;
    });
    const [totalMemes, setTotalMemes] = useState(() => {
        const saved = localStorage.getItem('meme_generator_total');
        return saved ? parseInt(saved) : 0;
    });
    
    // Comprehensive emoji list for memes
    const emojiCategories = {
        'Crypto': ['🚀', '💎', '🙌', '📈', '📉', '🐻', '🐂', '💰', '🤑', '💸', '🏦', '⛏️', '🔥', '🌙', '☀️', '⚡', '🎰'],
        'Faces': ['😂', '🤣', '😭', '😤', '🤔', '😏', '🥴', '🤡', '💀', '👀', '🙄', '😱', '🥺', '😈', '👽', '🤖'],
        'Animals': ['🐸', '🦍', '🐕', '🐶', '🐱', '🦊', '🐻', '🐼', '🦁', '🐯', '🐮', '🐷', '🐵', '🦧', '🐔', '🐲'],
        'Objects': ['💊', '🧠', '🎯', '🎪', '🎭', '🎨', '🔮', '💡', '⚙️', '🔧', '🛠️', '⚖️', '🏆', '🎖️', '👑', '💍'],
        'Symbols': ['✅', '❌', '⚠️', '🚨', '💯', '‼️', '❓', '❗', '🔴', '🟢', '🟡', '⭐', '✨', '💥', '💫', '🌈'],
        'Hands': ['👆', '👇', '👈', '👉', '🤝', '👊', '✊', '🤌', '👏', '🙏', '💪', '🦾', '🖕', '✌️', '🤞', '🫡']
    };
    
    const bgColors = [
        { color: '#1a1a2e', name: 'Dark Blue' },
        { color: '#2d1b4e', name: 'Purple' },
        { color: '#1a3a1a', name: 'Green' },
        { color: '#4a2a1a', name: 'Brown' },
        { color: '#1a4a4a', name: 'Teal' },
        { color: '#4a1a3a', name: 'Pink' },
        { color: '#000000', name: 'Black' },
        { color: '#2a2a2a', name: 'Gray' }
    ];
    
    const cryptoTopTexts = [
        "When you buy the dip",
        "POV: You checked your portfolio",
        "Me explaining crypto to my family",
        "When the coin you sold",
        "Diamond hands when",
        "Paper hands be like",
        "Dev after rugging",
        "Me watching my bags",
        "Bought at ATH",
        "Trust me bro"
    ];
    
    const cryptoBottomTexts = [
        "But it keeps dipping",
        "And it's all red",
        "They still don't get it",
        "Does a 10x without you",
        "The price drops 50%",
        "When it dips 5%",
        "LP unlocked",
        "WAGMI... right?",
        "This is fine",
        "Wen moon?"
    ];
    
    const randomizeMeme = () => {
        setTopText(cryptoTopTexts[Math.floor(Math.random() * cryptoTopTexts.length)]);
        setBottomText(cryptoBottomTexts[Math.floor(Math.random() * cryptoBottomTexts.length)]);
        const allEmojis = Object.values(emojiCategories).flat();
        setSelectedEmoji(allEmojis[Math.floor(Math.random() * allEmojis.length)]);
        setBgColor(bgColors[Math.floor(Math.random() * bgColors.length)].color);
        setCustomImage(null);
    };
    
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setCustomImage(e.target.result);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const submitMeme = () => {
        const textScore = Math.min(50, (topText.length + bottomText.length) * 2);
        const imageBonus = customImage ? 20 : 0;
        const randomViralBonus = Math.floor(Math.random() * 50);
        const totalScore = textScore + imageBonus + randomViralBonus;
        
        setMemeScore(totalScore);
        setSubmitted(true);
        
        // Update stats
        const newTotal = totalMemes + 1;
        setTotalMemes(newTotal);
        localStorage.setItem('meme_generator_total', newTotal.toString());
        
        if (totalScore > highScore) {
            setHighScore(totalScore);
            localStorage.setItem('meme_generator_highscore', totalScore.toString());
        }
        
        const hopiumEarned = Math.floor(totalScore / 2);
        if (onReward && hopiumEarned > 0) {
            onReward('hopium', hopiumEarned);
        }
        
        // Report game completion
        if (onGameComplete) {
            onGameComplete({
                score: totalScore,
                hopiumEarned,
                isViral: totalScore >= 60
            });
        }
    };
    
    const resetMeme = () => {
        setTopText('');
        setBottomText('');
        setSubmitted(false);
        setMemeScore(0);
        setCustomImage(null);
    };
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal" style={{ maxWidth: '650px' }}>
                <div className="game-modal-header">
                    <div className="game-modal-title">🎨 Meme Generator</div>
                    <button className="game-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="meme-generator-container">
                    {!submitted ? (
                        <>
                            <div className="meme-canvas" style={{ background: bgColor, minHeight: '260px' }}>
                                <div className="meme-text top">{topText || 'TOP TEXT'}</div>
                                {customImage ? (
                                    <img 
                                        src={customImage} 
                                        alt="Custom meme" 
                                        style={{ 
                                            maxWidth: '70%', 
                                            maxHeight: '120px', 
                                            objectFit: 'contain',
                                            borderRadius: '10px',
                                            margin: '35px 0'
                                        }} 
                                    />
                                ) : (
                                    <div className="meme-emoji-display">{selectedEmoji}</div>
                                )}
                                <div className="meme-text bottom">{bottomText || 'BOTTOM TEXT'}</div>
                            </div>
                            
                            {/* Emoji Dropdown and Image Upload */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                                    <label style={{ color: '#888', fontSize: '0.9em' }}>Emoji:</label>
                                    <div 
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        style={{
                                            background: 'rgba(0, 0, 0, 0.5)',
                                            border: '2px solid #ffd700',
                                            color: '#fff',
                                            padding: '8px 15px',
                                            borderRadius: '10px',
                                            fontSize: '1.5em',
                                            cursor: 'pointer',
                                            minWidth: '70px',
                                            textAlign: 'center',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px'
                                        }}
                                    >
                                        <span>{selectedEmoji}</span>
                                        <span style={{ fontSize: '0.6em', color: '#888' }}>▼</span>
                                    </div>
                                    
                                    {/* Custom Emoji Dropdown */}
                                    {showEmojiPicker && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            background: '#1a1a2e',
                                            border: '2px solid #ffd700',
                                            borderRadius: '10px',
                                            padding: '10px',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            zIndex: 100,
                                            minWidth: '250px',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                        }}>
                                            {Object.entries(emojiCategories).map(([category, emojis]) => (
                                                <div key={category} style={{ marginBottom: '10px' }}>
                                                    <div style={{ color: '#ffd700', fontSize: '0.75em', marginBottom: '5px', fontWeight: 'bold' }}>{category}</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                        {emojis.map((emoji, idx) => (
                                                            <span
                                                                key={idx}
                                                                onClick={(e) => { 
                                                                    e.stopPropagation();
                                                                    setSelectedEmoji(emoji); 
                                                                    setCustomImage(null); 
                                                                    setShowEmojiPicker(false);
                                                                }}
                                                                style={{
                                                                    fontSize: '1.3em',
                                                                    cursor: 'pointer',
                                                                    padding: '4px 6px',
                                                                    borderRadius: '5px',
                                                                    background: selectedEmoji === emoji ? 'rgba(255,215,0,0.3)' : 'transparent',
                                                                    transition: 'background 0.2s'
                                                                }}
                                                            >
                                                                {emoji}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        background: 'rgba(0, 255, 136, 0.2)',
                                        border: '2px solid #00ff88',
                                        color: '#00ff88',
                                        padding: '8px 20px',
                                        borderRadius: '10px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📷 Upload Image
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                />
                                
                                {customImage && (
                                    <button 
                                        onClick={() => setCustomImage(null)}
                                        style={{
                                            background: 'rgba(255, 68, 68, 0.2)',
                                            border: '2px solid #ff4444',
                                            color: '#ff4444',
                                            padding: '8px 15px',
                                            borderRadius: '10px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✕ Clear Image
                                    </button>
                                )}
                            </div>
                            
                            {/* Background Color Picker */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', justifyContent: 'center' }}>
                                {bgColors.map((bg) => (
                                    <div
                                        key={bg.color}
                                        onClick={() => setBgColor(bg.color)}
                                        style={{
                                            width: '25px',
                                            height: '25px',
                                            background: bg.color,
                                            borderRadius: '50%',
                                            cursor: 'pointer',
                                            border: bgColor === bg.color ? '3px solid #ffd700' : '2px solid #444'
                                        }}
                                        title={bg.name}
                                    />
                                ))}
                            </div>
                            
                            <div className="meme-controls">
                                <input
                                    type="text"
                                    className="meme-input"
                                    placeholder="Top text..."
                                    value={topText}
                                    onChange={(e) => setTopText(e.target.value.toUpperCase())}
                                    maxLength={50}
                                />
                                <input
                                    type="text"
                                    className="meme-input"
                                    placeholder="Bottom text..."
                                    value={bottomText}
                                    onChange={(e) => setBottomText(e.target.value.toUpperCase())}
                                    maxLength={50}
                                />
                            </div>
                            
                            <div className="meme-actions">
                                <button className="meme-btn random" onClick={randomizeMeme}>
                                    🎲 Random
                                </button>
                                <button 
                                    className="meme-btn submit" 
                                    onClick={submitMeme}
                                    disabled={!topText && !bottomText}
                                >
                                    📤 Submit Meme
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="game-over-screen">
                            <h3>🎨 Meme Submitted!</h3>
                            <div className="final-score">
                                Virality Score: {memeScore}
                                {memeScore >= 80 && <span style={{ display: 'block', color: '#ffd700' }}>🔥 VIRAL POTENTIAL! 🔥</span>}
                                {memeScore >= 50 && memeScore < 80 && <span style={{ display: 'block', color: '#00ff88' }}>📈 Solid Meme!</span>}
                                {memeScore < 50 && <span style={{ display: 'block', color: '#888' }}>😐 Needs work...</span>}
                            </div>
                            <div className="reward-earned">
                                +{Math.floor(memeScore / 2)} HOPIUM earned! 💊
                            </div>
                            <div className="game-over-buttons">
                                <button className="game-over-btn play-again" onClick={resetMeme}>
                                    🎨 Create Another
                                </button>
                                <button className="game-over-btn close" onClick={onClose}>
                                    Exit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ==================== SPOT THE RUG GAME ====================
// ==================== IS THIS CAP? MINI-GAME ====================

function IsThisCap({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start');
    const [currentBio, setCurrentBio] = useState(null);
    const [round, setRound] = useState(1);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [result, setResult] = useState(null);
    const [mayorComment, setMayorComment] = useState('');
    const [loadingComment, setLoadingComment] = useState(false);
    const [highScore, setHighScore] = useState(() => {
        const saved = localStorage.getItem('is_this_cap_highscore');
        return saved ? parseInt(saved) : 0;
    });
    const totalRounds = 10;
    
    // Curated bios - mix of real ridiculous claims and fake ones
    const bioDatabase = [
        // DEFINITE CAP - Fake/Exaggerated claims
        {
            name: "CryptoGenius42",
            handle: "@CryptoGenius42",
            bio: "IQ 276 | Self-made billionaire at 19 | Predicted BTC at $1 | Ex-NASA | 10x entrepreneur",
            isCap: true,
            reason: "IQ 276 is IMPOSSIBLE (Einstein was 160). 'Self-made billionaire at 19' with no verifiable company? And 'predicted BTC at $1' - everyone says that now 🧢"
        },
        {
            name: "AlphaSignals",
            handle: "@AlphaSignals",
            bio: "100% win rate trader | Never lost a trade | Turned $100 into $10M | DM for signals 💰",
            isCap: true,
            reason: "100% win rate is IMPOSSIBLE in trading. Anyone claiming this is running a scam. The 'DM for signals' is the giveaway 🚨"
        },
        {
            name: "ThoughtLeaderX",
            handle: "@ThoughtLeaderX",
            bio: "Visionary | Thought Leader | Futurist | 3x TEDx Speaker | Changing the world one post at a time",
            isCap: true,
            reason: "Self-proclaimed 'Thought Leader' and 'Visionary' = red flag. Real visionaries don't call themselves that. TEDx (not TED) speakers pay to speak 💀"
        },
        {
            name: "Web3Maven",
            handle: "@Web3Maven",
            bio: "Serial Entrepreneur (12 exits) | Angel Investor | Advisor to 50+ startups | Building the future",
            isCap: true,
            reason: "12 exits with no company names? 'Advisor to 50+ startups' = they added me to their website. This bio is fiction 📝"
        },
        {
            name: "QuantumTrader",
            handle: "@QuantumTrader",
            bio: "Ex-Goldman MD | Ex-Citadel | Ex-Renaissance | Now sharing alpha for free because I care",
            isCap: true,
            reason: "Ex-Goldman AND Citadel AND Renaissance? Cap. And nobody from those firms 'shares alpha for free' 😂"
        },
        {
            name: "MindsetKing",
            handle: "@MindsetKing",
            bio: "IQ 195 | Mensa member | Read 500 books/year | Wake up at 3AM | Millionaire mindset coach",
            isCap: true,
            reason: "500 books/year = 1.4 books per DAY. IQ 195 is top 0.0001% - they wouldn't be a 'mindset coach'. Pure cap 🧢"
        },
        {
            name: "CryptoWhale",
            handle: "@CryptoWhale",
            bio: "Top 10 BTC holder | 500,000 ETH | Retired at 22 | Not financial advice | 🐋",
            isCap: true,
            reason: "Top 10 BTC holder is publicly trackable - none match this account. 500k ETH = $1B+. Cap of the highest order 🎪"
        },
        {
            name: "AIFounder",
            handle: "@AIFounder",
            bio: "Former OpenAI researcher | Left to build something bigger | Raised $50M stealth | Changing everything",
            isCap: true,
            reason: "'Former OpenAI' is verifiable - this person isn't listed. 'Stealth' for years with nothing to show = vaporware 💨"
        },
        // NO CAP - Legitimate (but might seem like cap)
        {
            name: "Vitalik Buterin",
            handle: "@VitalikButerin",
            bio: "Ethereum",
            isCap: false,
            reason: "Simple, humble bio. Built Ethereum. Let the work speak. This is what real credibility looks like ✅"
        },
        {
            name: "Naval",
            handle: "@naval",
            bio: "Angel investor",
            isCap: false,
            reason: "Two words. No flex. But actually one of the most successful angel investors ever. Real ones don't need to brag ✅"
        },
        {
            name: "Balaji",
            handle: "@balaboroseis",
            bio: "Author of The Network State. Former CTO of Coinbase.",
            isCap: false,
            reason: "Verifiable credentials, humble presentation. Former Coinbase CTO is checkable. This is legit ✅"
        },
        {
            name: "Elon Musk",
            handle: "@elonmusk",
            bio: "Tesla, SpaceX, X",
            isCap: false,
            reason: "No 'IQ 300' or 'visionary' - just the companies. You can verify he runs these. No cap ✅"
        },
        {
            name: "SomeDevGuy",
            handle: "@SomeDevGuy",
            bio: "Software eng @Google | Building side projects | Opinions my own",
            isCap: false,
            reason: "Humble, verifiable, specific. Doesn't claim to be a genius or thought leader. Probably legit ✅"
        },
        {
            name: "indie_hacker",
            handle: "@indie_hacker",
            bio: "Making $5k MRR from my SaaS | Sharing the journey | Shipped 3 products",
            isCap: false,
            reason: "Specific, achievable numbers. Not claiming millions. This is believable and verifiable ✅"
        },
        // More CAP
        {
            name: "MetaverseMogul",
            handle: "@MetaverseMogul",
            bio: "Own 10,000 ETH in virtual land | Metaverse real estate billionaire | The future is virtual",
            isCap: true,
            reason: "10,000 ETH = $20M+ in 'virtual land'? Even Snoop Dogg's neighbor plot was only $450k. Mega cap 🏠"
        },
        {
            name: "DeFiDegen",
            handle: "@DeFiDegen",
            bio: "Turned $1000 into $50M in DeFi summer | Now I teach others | Not selling anything (yet)",
            isCap: true,
            reason: "50,000x return would be one of the greatest trades ever. 'Not selling anything (yet)' = definitely selling something 🎣"
        },
        {
            name: "StartupSage",
            handle: "@StartupSage",
            bio: "Rejected by YC 5 times | Now worth $500M | Take that Sam Altman | Motivation speaker",
            isCap: true,
            reason: "Worth $500M but a 'motivation speaker'? Real $500M founders don't have time for speaking gigs. Also, weird flex on YC rejection 🤔"
        },
        {
            name: "NFTLord",
            handle: "@NFTLord",
            bio: "Sold NFTs for $100M total | Own 50 Bored Apes | Art collector | DM for colabs",
            isCap: true,
            reason: "50 Bored Apes = $5M+ minimum. '$100M in NFT sales' would make them one of the top artists ever. No evidence exists 🖼️"
        },
        {
            name: "ZenMasterCEO",
            handle: "@ZenMasterCEO",
            bio: "Meditating CEO | 4 hours sleep | 2 hour morning routine | 10 companies | Balance is key",
            isCap: true,
            reason: "4 hours sleep, 2 hour morning routine, running 10 companies, and has 'balance'? The math doesn't math ser 🧘"
        }
    ];
    
    const getRandomBio = () => {
        const available = bioDatabase.filter(b => b.handle !== currentBio?.handle);
        return available[Math.floor(Math.random() * available.length)];
    };
    
    const startGame = () => {
        setGameState('playing');
        setRound(1);
        setScore(0);
        setStreak(0);
        setMaxStreak(0);
        setCurrentBio(getRandomBio());
        setResult(null);
        setMayorComment('');
    };
    
    const makeGuess = async (guessedCap) => {
        const correct = guessedCap === currentBio.isCap;
        
        // Calculate points
        let points = correct ? 100 : 0;
        if (correct) {
            points += streak * 25; // Streak bonus
            if (currentBio.isCap === false && guessedCap === false) {
                points += 50; // Bonus for correctly identifying legit people
            }
        }
        
        const newScore = score + points;
        const newStreak = correct ? streak + 1 : 0;
        const newMaxStreak = Math.max(maxStreak, newStreak);
        
        setScore(newScore);
        setStreak(newStreak);
        setMaxStreak(newMaxStreak);
        setResult({ correct, points, wasCAp: currentBio.isCap });
        setGameState('result');
        
        // Get Mayor's commentary
        setLoadingComment(true);
        try {
            const response = await fetch(API_BASE + '/api/ai/mayor-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Quick reaction to this X bio: "${currentBio.bio}" - The answer was ${currentBio.isCap ? 'CAP (fake/exaggerated)' : 'NO CAP (legit)'}. Give a 1-2 sentence savage or respectful comment.`,
                    playerName: playerName || 'Citizen',
                    playerLevel: 1,
                    xUserContext: {
                        query: currentBio.handle,
                        info: `${currentBio.handle} (${currentBio.name}) - Bio: "${currentBio.bio}" - This is ${currentBio.isCap ? 'CAP/FAKE' : 'LEGIT/NO CAP'}. Reason: ${currentBio.reason}`
                    }
                })
            });
            const data = await response.json();
            if (data.success) {
                setMayorComment(data.response);
            } else {
                setMayorComment(currentBio.reason);
            }
        } catch (e) {
            setMayorComment(currentBio.reason);
        }
        setLoadingComment(false);
        
        // Award resources
        if (correct && onReward) {
            onReward('hopium', Math.floor(points / 2));
            onReward('alpha', Math.floor(points / 10));
        }
    };
    
    const nextRound = () => {
        if (round >= totalRounds) {
            // Game over
            if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('is_this_cap_highscore', score.toString());
            }
            // Track games played
            const gamesPlayed = parseInt(localStorage.getItem('is_this_cap_games') || '0') + 1;
            localStorage.setItem('is_this_cap_games', gamesPlayed.toString());
            
            if (onGameComplete) {
                onGameComplete('is_this_cap', { 
                    score, 
                    maxStreak: maxStreak,
                    correctGuesses: Math.floor(score / 100)
                });
            }
            setGameState('gameover');
        } else {
            setRound(round + 1);
            setCurrentBio(getRandomBio());
            setResult(null);
            setMayorComment('');
            setGameState('playing');
        }
    };
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal is-this-cap-game" onClick={e => e.stopPropagation()}>
                <button className="game-close-btn" onClick={onClose}>✕</button>
                
                <div className="game-header">
                    <h2>🧢 Is This Cap?</h2>
                    <p>Can you spot the BS in X bios?</p>
                </div>
                
                {gameState === 'start' && (
                    <div className="game-start-screen">
                        <div style={{ fontSize: '4em', marginBottom: '20px' }}>🧢</div>
                        <h3>How to Play</h3>
                        <p style={{ color: '#aaa', marginBottom: '20px', lineHeight: '1.6' }}>
                            You'll see real X/Twitter bios with various claims.<br/>
                            Decide if the claims are <span style={{ color: '#ff6b6b' }}>🧢 CAP</span> (fake/exaggerated)<br/>
                            or <span style={{ color: '#00ff88' }}>✅ NO CAP</span> (legit)
                        </p>
                        <div style={{ 
                            background: 'rgba(255,215,0,0.1)', 
                            padding: '15px', 
                            borderRadius: '10px',
                            marginBottom: '20px',
                            border: '1px solid rgba(255,215,0,0.3)'
                        }}>
                            <p style={{ color: '#ffd700', margin: 0 }}>
                                🎩 Mayor Satoshi will give his savage verdict on each one!
                            </p>
                        </div>
                        <p style={{ color: '#888', fontSize: '0.9em' }}>
                            High Score: <span style={{ color: '#ffd700' }}>{highScore}</span>
                        </p>
                        <button className="game-start-btn" onClick={startGame}>
                            Start Detecting 🔍
                        </button>
                    </div>
                )}
                
                {gameState === 'playing' && currentBio && (
                    <div className="cap-game-play">
                        <div className="cap-game-stats">
                            <div>Round: {round}/{totalRounds}</div>
                            <div>Score: {score}</div>
                            <div>Streak: {streak > 0 ? `🔥 ${streak}` : '0'}</div>
                        </div>
                        
                        <div className="cap-bio-card">
                            <div className="cap-bio-header">
                                <div className="cap-bio-avatar">👤</div>
                                <div>
                                    <div className="cap-bio-name">{currentBio.name}</div>
                                    <div className="cap-bio-handle">{currentBio.handle}</div>
                                </div>
                            </div>
                            <div className="cap-bio-text">
                                "{currentBio.bio}"
                            </div>
                        </div>
                        
                        <div className="cap-guess-buttons">
                            <button 
                                className="cap-btn cap"
                                onClick={() => makeGuess(true)}
                            >
                                🧢 CAP<br/>
                                <span style={{ fontSize: '0.7em', opacity: 0.8 }}>Fake / Exaggerated</span>
                            </button>
                            <button 
                                className="cap-btn no-cap"
                                onClick={() => makeGuess(false)}
                            >
                                ✅ NO CAP<br/>
                                <span style={{ fontSize: '0.7em', opacity: 0.8 }}>Legit</span>
                            </button>
                        </div>
                    </div>
                )}
                
                {gameState === 'result' && result && (
                    <div className="cap-result-screen">
                        <div style={{ 
                            fontSize: '3em', 
                            marginBottom: '15px',
                            animation: result.correct ? 'pulse 0.5s ease' : 'shake 0.5s ease'
                        }}>
                            {result.correct ? '✅' : '❌'}
                        </div>
                        <h3 style={{ color: result.correct ? '#00ff88' : '#ff4444' }}>
                            {result.correct ? 'CORRECT!' : 'WRONG!'}
                        </h3>
                        <p style={{ color: '#ffd700', fontSize: '1.1em', marginBottom: '15px' }}>
                            It was: {result.wasCap ? '🧢 CAP' : '✅ NO CAP'}
                        </p>
                        
                        {result.correct && (
                            <div style={{ color: '#00ff88', marginBottom: '15px' }}>
                                +{result.points} points {streak > 1 && `(${streak}x streak! 🔥)`}
                            </div>
                        )}
                        
                        <div className="mayor-verdict">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '1.5em' }}>🎩</span>
                                <span style={{ color: '#ffd700', fontWeight: 'bold' }}>Mayor's Verdict:</span>
                            </div>
                            <div style={{ 
                                background: 'rgba(138,43,226,0.2)', 
                                padding: '15px', 
                                borderRadius: '10px',
                                borderLeft: '4px solid #8a2be2',
                                minHeight: '60px'
                            }}>
                                {loadingComment ? (
                                    <span style={{ color: '#888' }}>Mayor is thinking... 🤔</span>
                                ) : (
                                    <span style={{ color: '#ddd', lineHeight: '1.5' }}>{mayorComment}</span>
                                )}
                            </div>
                        </div>
                        
                        <button 
                            className="game-start-btn" 
                            onClick={nextRound}
                            style={{ marginTop: '20px' }}
                            disabled={loadingComment}
                        >
                            {round >= totalRounds ? 'See Results' : 'Next Bio →'}
                        </button>
                    </div>
                )}
                
                {gameState === 'gameover' && (
                    <div className="cap-gameover">
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>🏆</div>
                        <h3>Game Over!</h3>
                        <div className="cap-final-stats">
                            <div className="cap-stat">
                                <span className="cap-stat-value">{score}</span>
                                <span className="cap-stat-label">Final Score</span>
                            </div>
                            <div className="cap-stat">
                                <span className="cap-stat-value">{maxStreak}</span>
                                <span className="cap-stat-label">Best Streak</span>
                            </div>
                            <div className="cap-stat">
                                <span className="cap-stat-value">{Math.floor(score / 100)}/{totalRounds}</span>
                                <span className="cap-stat-label">Correct</span>
                            </div>
                        </div>
                        
                        {score > highScore && (
                            <div style={{ color: '#ffd700', marginBottom: '15px' }}>
                                🎉 NEW HIGH SCORE! 🎉
                            </div>
                        )}
                        
                        <div style={{ 
                            background: 'rgba(0,255,136,0.1)', 
                            padding: '15px', 
                            borderRadius: '10px',
                            marginBottom: '20px'
                        }}>
                            <p style={{ color: '#00ff88', margin: 0 }}>
                                Rewards: +{Math.floor(score / 2)} HOPIUM, +{Math.floor(score / 10)} ALPHA
                            </p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="game-start-btn" onClick={startGame}>
                                Play Again
                            </button>
                            <button 
                                className="game-start-btn" 
                                onClick={onClose}
                                style={{ background: 'rgba(255,255,255,0.1)' }}
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


function SpotTheRug({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start');
    const [currentToken, setCurrentToken] = useState(null);
    const [round, setRound] = useState(1);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [correctRugs, setCorrectRugs] = useState(0);
    const [maxStreak, setMaxStreak] = useState(0);
    const [result, setResult] = useState(null);
    const [showFlags, setShowFlags] = useState(false);
    const [highScore, setHighScore] = useState(() => {
        const saved = localStorage.getItem('rug_detector_highscore');
        return saved ? parseInt(saved) : 0;
    });
    const totalRounds = 8;
    
    // Token name generators
    const prefixes = ['Safe', 'Moon', 'Baby', 'Elon', 'Doge', 'Shiba', 'Pepe', 'Floki', 'Inu', 'Chad'];
    const suffixes = ['Moon', 'Rocket', 'Inu', 'Coin', 'Token', 'Finance', 'Swap', 'DAO', 'Protocol', 'AI'];
    
    const generateToken = () => {
        const name = prefixes[Math.floor(Math.random() * prefixes.length)] + 
                    suffixes[Math.floor(Math.random() * suffixes.length)];
        const ticker = '$' + name.substring(0, 4).toUpperCase();
        
        // Generate random stats first, then determine if it's a rug based on red flags
        const redFlags = [];
        
        // Liquidity - CRITICAL: Low liquidity = easy to rug
        const liquidity = Math.random() > 0.5 ? 
            Math.floor(Math.random() * 15000) :  // Low liquidity
            Math.floor(30000 + Math.random() * 500000);  // Good liquidity
        if (liquidity < 10000) redFlags.push('🚨 Very low liquidity (<$10k)');
        
        // Holders - Few holders = concentrated ownership
        const holders = Math.random() > 0.5 ?
            Math.floor(20 + Math.random() * 150) :  // Few holders
            Math.floor(300 + Math.random() * 5000);  // Many holders
        if (holders < 100) redFlags.push('🚨 Less than 100 holders');
        
        // Top holder % - High concentration = whale can dump
        const topHolder = Math.random() > 0.5 ?
            Math.floor(35 + Math.random() * 55) :  // High concentration
            Math.floor(3 + Math.random() * 20);     // Distributed
        if (topHolder > 25) redFlags.push('🚨 Top wallet holds >' + topHolder + '%');
        
        // Contract verified - CRITICAL: Unverified = can't check code
        const verified = Math.random() > 0.4;
        if (!verified) redFlags.push('🚨 Contract NOT verified');
        
        // LP locked - CRITICAL: Unlocked LP = dev can pull liquidity
        const lpLocked = Math.random() > 0.45;
        if (!lpLocked) redFlags.push('🚨 Liquidity NOT locked - DEV CAN RUG');
        
        // Dev wallet holding
        const devHolding = Math.random() > 0.5;
        const devHoldingPercent = devHolding ? Math.floor(5 + Math.random() * 25) : 0;
        if (devHolding && devHoldingPercent > 10) redFlags.push('🚨 Dev holds ' + devHoldingPercent + '% of supply');
        
        // Dev supply burnt
        const supplyBurnt = Math.random() > 0.5;
        const burntPercent = supplyBurnt ? Math.floor(20 + Math.random() * 70) : 0;
        // Burnt supply is GOOD, not a red flag
        
        // Mint function enabled - Can create more tokens
        const mintEnabled = Math.random() > 0.6;
        if (mintEnabled) redFlags.push('🚨 Mint function ENABLED - can create more tokens');
        
        // Honeypot - Can buy but can't sell
        const isHoneypot = Math.random() > 0.85;  // Rare but deadly
        if (isHoneypot) redFlags.push('🚨 HONEYPOT DETECTED - Cannot sell!');
        
        // Age
        const ageHours = Math.random() > 0.5 ?
            Math.floor(1 + Math.random() * 24) :  // Very new
            Math.floor(48 + Math.random() * 720);  // Established
        if (ageHours < 24) redFlags.push('🚨 Token less than 24 hours old');
        
        // Social
        const twitter = Math.random() > 0.4;
        const telegram = Math.random() > 0.4;
        if (!twitter && !telegram) redFlags.push('🚨 No social media presence');
        
        // Buy/Sell tax
        const buyTax = Math.random() > 0.7 ? Math.floor(10 + Math.random() * 40) : Math.floor(Math.random() * 5);
        const sellTax = Math.random() > 0.7 ? Math.floor(15 + Math.random() * 50) : Math.floor(Math.random() * 5);
        if (buyTax > 10) redFlags.push('🚨 High buy tax: ' + buyTax + '%');
        if (sellTax > 10) redFlags.push('🚨 High sell tax: ' + sellTax + '%');
        
        // DETERMINE IF RUG based on actual red flags
        // Critical flags that make it definitely a rug:
        const criticalFlags = [
            !lpLocked,           // LP not locked = almost certainly rug
            isHoneypot,          // Honeypot = definite rug
            mintEnabled && !verified,  // Can mint + unverified = rug
            topHolder > 50,      // Someone holds >50% = can dump
            liquidity < 5000,    // Super low liquidity = easy rug
            sellTax > 30         // Can't sell = rug
        ];
        
        const hasCriticalFlag = criticalFlags.some(flag => flag);
        const totalRedFlags = redFlags.length;
        
        // Rug if: has critical flag OR has 4+ red flags
        const isRug = hasCriticalFlag || totalRedFlags >= 4;
        
        // Price change correlates with rug status
        const priceChange = isRug ? 
            Math.floor(-60 + Math.random() * 250) :  // Rugs often pump hard then dump
            Math.floor(-15 + Math.random() * 80);
        
        return {
            name,
            ticker,
            isRug,
            liquidity,
            holders,
            topHolder,
            verified,
            lpLocked,
            devHolding,
            devHoldingPercent,
            supplyBurnt,
            burntPercent,
            mintEnabled,
            isHoneypot,
            ageHours,
            twitter,
            telegram,
            buyTax,
            sellTax,
            redFlags,
            priceChange
        };
    };
    
    const makeVerdict = (verdict) => {
        const correct = (verdict === 'rug' && currentToken.isRug) || 
                       (verdict === 'safe' && !currentToken.isRug);
        
        setShowFlags(true);
        
        if (correct) {
            const streakBonus = streak * 25;
            const points = 100 + streakBonus;
            setScore(prev => prev + points);
            setStreak(prev => {
                const newStreak = prev + 1;
                if (newStreak > maxStreak) setMaxStreak(newStreak);
                return newStreak;
            });
            // Track if correctly identified a rug
            if (verdict === 'rug' && currentToken.isRug) {
                setCorrectRugs(prev => prev + 1);
            }
            setResult({ correct: true, message: `✅ Correct! +${points} pts` });
        } else {
            setStreak(0);
            setResult({ correct: false, message: '❌ Wrong! ' + (currentToken.isRug ? 'It was a RUG!' : 'It was SAFE!') });
        }
        
        setTimeout(() => {
            if (round >= totalRounds) {
                setGameState('gameover');
            } else {
                setRound(prev => prev + 1);
                setCurrentToken(generateToken());
                setResult(null);
                setShowFlags(false);
            }
        }, 2000);
    };
    
    useEffect(() => {
        if (gameState === 'gameover') {
            if (score > highScore) {
                setHighScore(score);
                localStorage.setItem('rug_detector_highscore', score.toString());
            }
            
            const alphaEarned = Math.floor(score / 5);
            if (alphaEarned > 0 && onReward) {
                onReward('alpha', alphaEarned);
            }
            
            // Report game completion
            if (onGameComplete) {
                onGameComplete({
                    score,
                    correctRugs,
                    maxCombo: maxStreak,
                    alphaEarned
                });
            }
        }
    }, [gameState, score, highScore, onReward, correctRugs, maxStreak, onGameComplete]);
    
    const startGame = () => {
        setGameState('playing');
        setRound(1);
        setScore(0);
        setStreak(0);
        setCorrectRugs(0);
        setMaxStreak(0);
        setCurrentToken(generateToken());
        setResult(null);
        setShowFlags(false);
    };
    
    const alphaEarned = Math.floor(score / 5);
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal">
                <div className="game-modal-header">
                    <div className="game-modal-title">🔍 Spot the Rug</div>
                    <button className="game-close-btn" onClick={onClose}>✕</button>
                </div>
                
                <div className="rug-detector-container">
                    {gameState === 'start' && (
                        <div className="game-start-screen">
                            <h3>🔍 Spot the Rug 🔍</h3>
                            <div className="game-instructions">
                                <p>Analyze token stats and spot the rugs!</p>
                                <p>Look for red flags:</p>
                                <p><span className="red">• Low liquidity</span></p>
                                <p><span className="red">• Few holders</span></p>
                                <p><span className="red">• Unverified contract</span></p>
                                <p><span className="red">• Unlocked LP</span></p>
                                <p style={{ marginTop: '10px', color: '#00ff88' }}>Build streaks for bonus ALPHA!</p>
                            </div>
                            <button className="game-start-btn" onClick={startGame}>
                                🔍 START DETECTING
                            </button>
                            {highScore > 0 && (
                                <p style={{ marginTop: '15px', color: '#ffd700' }}>
                                    🏆 High Score: {highScore}
                                </p>
                            )}
                        </div>
                    )}
                    
                    {gameState === 'playing' && currentToken && (
                        <>
                            <div className="chart-battle-hud">
                                <div className="round-indicator">
                                    Round {round}/{totalRounds} | Score: {score}
                                    {streak >= 2 && <span style={{ color: '#ff6600' }}> 🔥{streak}</span>}
                                </div>
                            </div>
                            
                            <div className="token-card">
                                <div className="token-header">
                                    <div className="token-name">
                                        {currentToken.name}
                                        <span className="token-ticker">{currentToken.ticker}</span>
                                    </div>
                                    <div style={{ 
                                        color: currentToken.priceChange >= 0 ? '#00ff88' : '#ff4444',
                                        fontWeight: 'bold'
                                    }}>
                                        {currentToken.priceChange >= 0 ? '+' : ''}{currentToken.priceChange}%
                                    </div>
                                </div>
                                
                                <div className="token-stats">
                                    <div className="token-stat">
                                        <div className="token-stat-label">💰 Liquidity</div>
                                        <div className={`token-stat-value ${currentToken.liquidity < 10000 ? 'red' : 'green'}`}>
                                            ${currentToken.liquidity.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">👥 Holders</div>
                                        <div className={`token-stat-value ${currentToken.holders < 100 ? 'red' : 'green'}`}>
                                            {currentToken.holders.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">🐋 Top Holder</div>
                                        <div className={`token-stat-value ${currentToken.topHolder > 30 ? 'red' : 'green'}`}>
                                            {currentToken.topHolder}%
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">⏰ Age</div>
                                        <div className={`token-stat-value ${currentToken.ageHours < 12 ? 'red' : 'yellow'}`}>
                                            {currentToken.ageHours < 24 ? `${currentToken.ageHours}h` : `${Math.floor(currentToken.ageHours / 24)}d`}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">✅ Verified</div>
                                        <div className={`token-stat-value ${currentToken.verified ? 'green' : 'red'}`}>
                                            {currentToken.verified ? 'Yes' : 'No'}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">🔒 LP Locked</div>
                                        <div className={`token-stat-value ${currentToken.lpLocked ? 'green' : 'red'}`}>
                                            {currentToken.lpLocked ? 'Yes' : 'NO ⚠️'}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">👨‍💻 Dev Wallet</div>
                                        <div className={`token-stat-value ${currentToken.devHoldingPercent > 10 ? 'red' : 'green'}`}>
                                            {currentToken.devHolding ? `${currentToken.devHoldingPercent}%` : 'None'}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">🔥 Supply Burnt</div>
                                        <div className={`token-stat-value ${currentToken.supplyBurnt ? 'green' : 'yellow'}`}>
                                            {currentToken.supplyBurnt ? `${currentToken.burntPercent}%` : 'No'}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">🖨️ Mint Enabled</div>
                                        <div className={`token-stat-value ${currentToken.mintEnabled ? 'red' : 'green'}`}>
                                            {currentToken.mintEnabled ? 'YES ⚠️' : 'No'}
                                        </div>
                                    </div>
                                    <div className="token-stat">
                                        <div className="token-stat-label">💸 Buy/Sell Tax</div>
                                        <div className={`token-stat-value ${currentToken.buyTax > 10 || currentToken.sellTax > 10 ? 'red' : 'green'}`}>
                                            {currentToken.buyTax}% / {currentToken.sellTax}%
                                        </div>
                                    </div>
                                </div>
                                
                                <div style={{ marginTop: '10px', display: 'flex', gap: '15px', justifyContent: 'center', alignItems: 'center' }}>
                                    {currentToken.twitter && <span style={{ color: '#1DA1F2' }}>𝕏 Twitter</span>}
                                    {currentToken.telegram && <span style={{ color: '#0088cc' }}>📱 Telegram</span>}
                                    {!currentToken.twitter && !currentToken.telegram && <span style={{ color: '#ff4444' }}>❌ No socials</span>}
                                    {currentToken.isHoneypot && showFlags && <span style={{ color: '#ff0000', fontWeight: 'bold' }}>🍯 HONEYPOT!</span>}
                                </div>
                            </div>
                            
                            {showFlags && currentToken.redFlags.length > 0 && (
                                <div className="red-flags">
                                    <div style={{ color: '#ffd700', marginBottom: '8px', fontWeight: 'bold' }}>
                                        ⚠️ {currentToken.redFlags.length} Red Flag{currentToken.redFlags.length > 1 ? 's' : ''} Found:
                                    </div>
                                    {currentToken.redFlags.map((flag, idx) => (
                                        <div key={idx} className="red-flag-item">{flag}</div>
                                    ))}
                                </div>
                            )}
                            
                            {showFlags && currentToken.redFlags.length === 0 && (
                                <div style={{ 
                                    marginTop: '15px', 
                                    padding: '15px', 
                                    background: 'rgba(0, 255, 136, 0.1)', 
                                    border: '1px solid rgba(0, 255, 136, 0.3)', 
                                    borderRadius: '10px',
                                    textAlign: 'center',
                                    color: '#00ff88'
                                }}>
                                    ✅ No major red flags detected!
                                </div>
                            )}
                            
                            {result ? (
                                <div className="streak-display" style={{ color: result.correct ? '#00ff88' : '#ff4444' }}>
                                    {result.message}
                                </div>
                            ) : (
                                <div className="rug-verdict-buttons">
                                    <button className="verdict-btn safe" onClick={() => makeVerdict('safe')}>
                                        ✅ SAFE
                                    </button>
                                    <button className="verdict-btn rug" onClick={() => makeVerdict('rug')}>
                                        🚨 RUG
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    
                    {gameState === 'gameover' && (
                        <div className="game-over-screen">
                            <h3>🔍 Detection Complete!</h3>
                            <div className="final-score">
                                Final Score: {score}
                                {score > highScore - score && score === highScore && (
                                    <span style={{ display: 'block', color: '#ffd700', fontSize: '0.8em' }}>
                                        🏆 NEW HIGH SCORE! 🏆
                                    </span>
                                )}
                            </div>
                            <div className="reward-earned">
                                +{alphaEarned} ALPHA earned! 🔮
                            </div>
                            <div className="game-over-buttons">
                                <button className="game-over-btn play-again" onClick={startGame}>
                                    🔄 Play Again
                                </button>
                                <button className="game-over-btn close" onClick={onClose}>
                                    Exit
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Degen Arcade Section

function DailyPuzzle({ resources, onResourceChange, showToast }) {
    // Expanded word list with hints
    const wordData = [
        { word: 'HODL', hint: 'Hold on for dear life - never sell!' },
        { word: 'MOON', hint: 'When price goes to the ___' },
        { word: 'PUMP', hint: 'Price goes up fast!' },
        { word: 'DUMP', hint: 'Price crashes hard!' },
        { word: 'FOMO', hint: 'Fear of missing out' },
        { word: 'WAGMI', hint: "We're all gonna make it" },
        { word: 'NGMI', hint: 'Not gonna make it' },
        { word: 'DEGEN', hint: 'Risky trader who apes into anything' },
        { word: 'WHALE', hint: 'Big holder who moves markets' },
        { word: 'ALPHA', hint: 'Secret profitable info' },
        { word: 'SHILL', hint: 'Aggressively promote a coin' },
        { word: 'REKT', hint: 'Totally wrecked/destroyed' },
        { word: 'BAGS', hint: 'Your token holdings' },
        { word: 'SWAP', hint: 'Exchange one token for another' },
        { word: 'MINT', hint: 'Create new NFTs or tokens' },
        { word: 'GWEI', hint: 'Ethereum gas unit' },
        { word: 'BEAR', hint: 'Market going down' },
        { word: 'BULL', hint: 'Market going up' },
        { word: 'RUGS', hint: 'Scam projects that steal funds' },
        { word: 'DEFI', hint: 'Decentralized finance' },
    ];
    
    const [targetData, setTargetData] = useState(() => {
        const today = new Date().toDateString();
        const saved = localStorage.getItem('pumptown_puzzle_word');
        const savedDate = localStorage.getItem('pumptown_puzzle_date');
        const savedHint = localStorage.getItem('pumptown_puzzle_hint');
        
        if (savedDate === today && saved) {
            return { word: saved, hint: savedHint || 'Crypto slang term' };
        }
        
        // Pick a random word for today
        const data = wordData[Math.floor(Math.random() * wordData.length)];
        localStorage.setItem('pumptown_puzzle_word', data.word);
        localStorage.setItem('pumptown_puzzle_hint', data.hint);
        localStorage.setItem('pumptown_puzzle_date', today);
        localStorage.removeItem('pumptown_puzzle_guesses');
        localStorage.removeItem('pumptown_puzzle_claimed');
        return data;
    });
    
    const targetWord = targetData.word;
    const hint = targetData.hint;
    
    const [guesses, setGuesses] = useState(() => {
        const saved = localStorage.getItem('pumptown_puzzle_guesses');
        return saved ? JSON.parse(saved) : [];
    });
    
    const [currentGuess, setCurrentGuess] = useState('');
    const [gameOver, setGameOver] = useState(false);
    const [won, setWon] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [usedLetters, setUsedLetters] = useState({});
    
    // Check win/lose condition
    useEffect(() => {
        localStorage.setItem('pumptown_puzzle_guesses', JSON.stringify(guesses));
        
        // Build used letters map
        const letterMap = {};
        guesses.forEach(guess => {
            guess.forEach((letter, idx) => {
                if (letter === targetWord[idx]) {
                    letterMap[letter] = 'correct';
                } else if (targetWord.includes(letter) && letterMap[letter] !== 'correct') {
                    letterMap[letter] = 'present';
                } else if (!letterMap[letter]) {
                    letterMap[letter] = 'absent';
                }
            });
        });
        setUsedLetters(letterMap);
        
        if (guesses.length > 0) {
            const lastGuess = guesses[guesses.length - 1];
            if (lastGuess.join('') === targetWord) {
                setWon(true);
                setGameOver(true);
                if (!localStorage.getItem('pumptown_puzzle_claimed')) {
                    const reward = (6 - guesses.length) * 200 + 200;
                    onResourceChange('hopium', reward);
                    showToast(`🧩 Puzzle solved! +${reward} HOPIUM`, 'success');
                    localStorage.setItem('pumptown_puzzle_claimed', 'true');
                }
            } else if (guesses.length >= 6) {
                setGameOver(true);
            }
        }
    }, [guesses]);
    
    const handleKey = (key) => {
        if (gameOver) return;
        
        if (key === 'ENTER') {
            if (currentGuess.length === targetWord.length) {
                setGuesses(prev => [...prev, currentGuess.split('')]);
                setCurrentGuess('');
            }
        } else if (key === 'DEL') {
            setCurrentGuess(prev => prev.slice(0, -1));
        } else if (currentGuess.length < targetWord.length && /^[A-Z]$/.test(key)) {
            setCurrentGuess(prev => prev + key);
        }
    };
    
    // Handle physical keyboard
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (gameOver) return;
            if (e.key === 'Enter') {
                handleKey('ENTER');
            } else if (e.key === 'Backspace') {
                handleKey('DEL');
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                handleKey(e.key.toUpperCase());
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentGuess, gameOver, targetWord]);
    
    const getCellStatus = (letter, index, guess) => {
        if (letter === targetWord[index]) return 'correct';
        if (targetWord.includes(letter)) return 'present';
        return 'absent';
    };
    
    const getKeyStatus = (key) => {
        return usedLetters[key] || '';
    };
    
    return (
        <div className="daily-puzzle">
            <h3 style={{ color: '#00aaaa', marginBottom: '5px' }}>🧩 Daily Crypto Puzzle</h3>
            <p style={{ color: '#888', fontSize: '0.85em', marginBottom: '10px' }}>
                Guess the {targetWord.length}-letter crypto term!
            </p>
            
            {/* Hint Section */}
            <div style={{ marginBottom: '15px' }}>
                {!showHint ? (
                    <button 
                        onClick={() => setShowHint(true)}
                        style={{
                            background: 'rgba(255, 215, 0, 0.2)',
                            border: '1px solid #ffd700',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            color: '#ffd700',
                            cursor: 'pointer',
                            fontSize: '0.85em'
                        }}
                    >
                        💡 Show Hint
                    </button>
                ) : (
                    <div style={{
                        background: 'rgba(255, 215, 0, 0.1)',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '10px 15px',
                        color: '#ffd700',
                        fontSize: '0.9em'
                    }}>
                        💡 <strong>Hint:</strong> {hint}
                    </div>
                )}
            </div>
            
            {/* Puzzle Grid */}
            <div className="puzzle-grid" style={{ 
                display: 'grid',
                gridTemplateColumns: `repeat(${targetWord.length}, 40px)`,
                gap: '5px',
                justifyContent: 'center',
                marginBottom: '20px'
            }}>
                {Array(6).fill(null).map((_, rowIdx) => (
                    <React.Fragment key={rowIdx}>
                        {Array(targetWord.length).fill(null).map((_, colIdx) => {
                            const guess = guesses[rowIdx];
                            const letter = guess ? guess[colIdx] : (rowIdx === guesses.length ? currentGuess[colIdx] : '');
                            const status = guess ? getCellStatus(guess[colIdx], colIdx, guess) : '';
                            
                            return (
                                <div 
                                    key={colIdx} 
                                    className={`puzzle-cell ${status}`}
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        fontSize: '1.2em'
                                    }}
                                >
                                    {letter}
                                </div>
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
            
            {gameOver ? (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    {won ? (
                        <div style={{ color: '#00ff88', fontSize: '1.2em' }}>
                            🎉 You got it in {guesses.length} {guesses.length === 1 ? 'try' : 'tries'}!
                        </div>
                    ) : (
                        <div style={{ color: '#ff4444' }}>
                            😢 The word was: <strong style={{ color: '#00ff88' }}>{targetWord}</strong>
                        </div>
                    )}
                    <p style={{ color: '#888', marginTop: '10px', fontSize: '0.9em' }}>
                        🕐 Come back tomorrow for a new puzzle!
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '100%', maxWidth: '280px', margin: '0 auto' }}>
                    {/* Row 1: Q-P */}
                    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        {'QWERTYUIOP'.split('').map(key => (
                            <button 
                                key={key}
                                className={`puzzle-key ${getKeyStatus(key)}`}
                                onClick={() => handleKey(key)}
                                style={{
                                    width: '24px',
                                    height: '32px',
                                    padding: '0',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                    minWidth: '24px'
                                }}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                    {/* Row 2: A-L */}
                    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        {'ASDFGHJKL'.split('').map(key => (
                            <button 
                                key={key}
                                className={`puzzle-key ${getKeyStatus(key)}`}
                                onClick={() => handleKey(key)}
                                style={{
                                    width: '24px',
                                    height: '32px',
                                    padding: '0',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                    minWidth: '24px'
                                }}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                    {/* Row 3: Enter + Z-M + Del */}
                    <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                        <button 
                            className="puzzle-key"
                            onClick={() => handleKey('ENTER')}
                            style={{
                                width: '38px',
                                height: '32px',
                                padding: '0',
                                fontSize: '0.6em',
                                fontWeight: 'bold',
                                background: 'rgba(0, 255, 136, 0.3)',
                                borderColor: '#00ff88',
                                minWidth: '38px'
                            }}
                        >
                            ✓
                        </button>
                        {'ZXCVBNM'.split('').map(key => (
                            <button 
                                key={key}
                                className={`puzzle-key ${getKeyStatus(key)}`}
                                onClick={() => handleKey(key)}
                                style={{
                                    width: '24px',
                                    height: '32px',
                                    padding: '0',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                    minWidth: '24px'
                                }}
                            >
                                {key}
                            </button>
                        ))}
                        <button 
                            className="puzzle-key"
                            onClick={() => handleKey('DEL')}
                            style={{
                                width: '38px',
                                height: '32px',
                                padding: '0',
                                fontSize: '0.75em',
                                fontWeight: 'bold',
                                background: 'rgba(255, 68, 68, 0.3)',
                                borderColor: '#ff4444',
                                minWidth: '38px'
                            }}
                        >
                            ⌫
                        </button>
                    </div>
                </div>
            )}
            
            {/* Attempts remaining */}
            {!gameOver && (
                <div style={{ 
                    textAlign: 'center', 
                    marginTop: '15px', 
                    color: '#666',
                    fontSize: '0.85em'
                }}>
                    {6 - guesses.length} attempts remaining
                </div>
            )}
        </div>
    );
}

// ==================== TRADING COMPETITION ====================

function ShillTypingRace({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start'); // start, countdown, playing, result
    const [countdown, setCountdown] = useState(3);
    const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
    const [typedText, setTypedText] = useState('');
    const [timeLeft, setTimeLeft] = useState(60);
    const [score, setScore] = useState(0);
    const [wpm, setWpm] = useState(0);
    const [accuracy, setAccuracy] = useState(100);
    const [totalChars, setTotalChars] = useState(0);
    const [correctChars, setCorrectChars] = useState(0);
    const [completedPhrases, setCompletedPhrases] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [highScore, setHighScore] = useState(() => {
        return parseInt(localStorage.getItem('shill_race_highscore') || '0');
    });
    const inputRef = useRef(null);
    
    const phrases = [
        "WAGMI",
        "TO THE MOON",
        "DIAMOND HANDS",
        "BUY THE DIP",
        "LFG",
        "GN KINGS",
        "GM FRENS",
        "NGMI IF YOU SELL",
        "PUMP IT",
        "BULLISH AF",
        "APE IN NOW",
        "THIS IS THE WAY",
        "HODL FOREVER",
        "SEND IT",
        "GENERATIONAL WEALTH",
        "GONNA MAKE IT",
        "FEW UNDERSTAND",
        "STILL EARLY",
        "NFA BUT BUY",
        "LOOKS RARE",
        "UP ONLY",
        "NUMBER GO UP",
        "MEGA BULLISH",
        "LAMBO SOON",
        "RETIRE NEXT YEAR",
        "100X INCOMING",
        "BEAR MARKET IS OVER",
        "ACCUMULATE MORE",
        "DONT FADE THIS",
        "ALPHA LEAK",
        "TRUST THE PROCESS",
        "PATIENCE PAYS",
        "STACKING SATS",
        "FLOOR IS RISING",
        "BREAKOUT IMMINENT",
        "WHALES ARE BUYING",
        "SMART MONEY ENTERING",
        "THIS WILL 10X",
        "EASY MONEY",
        "FREE MONEY GLITCH"
    ];
    
    const [shuffledPhrases, setShuffledPhrases] = useState([]);
    
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };
    
    const startGame = () => {
        setShuffledPhrases(shuffleArray(phrases));
        setGameState('countdown');
        setCountdown(3);
        setCurrentPhraseIndex(0);
        setTypedText('');
        setTimeLeft(60);
        setScore(0);
        setTotalChars(0);
        setCorrectChars(0);
        setCompletedPhrases(0);
        setCombo(0);
        setMaxCombo(0);
        setAccuracy(100);
        setWpm(0);
    };
    
    // Countdown timer
    useEffect(() => {
        if (gameState !== 'countdown') return;
        
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setGameState('playing');
            if (inputRef.current) inputRef.current.focus();
        }
    }, [gameState, countdown]);
    
    // Game timer
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            endGame();
        }
    }, [gameState, timeLeft]);
    
    // Calculate WPM periodically
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const elapsed = 60 - timeLeft;
        if (elapsed > 0) {
            const words = correctChars / 5;
            const minutes = elapsed / 60;
            setWpm(Math.round(words / minutes) || 0);
        }
    }, [timeLeft, correctChars, gameState]);
    
    const currentPhrase = shuffledPhrases[currentPhraseIndex] || phrases[0];
    
    const handleInput = (e) => {
        if (gameState !== 'playing') return;
        
        const value = e.target.value.toUpperCase();
        setTypedText(value);
        
        // Check if phrase completed
        if (value === currentPhrase) {
            // Correct phrase!
            const points = currentPhrase.length * 10 * (1 + combo * 0.1);
            setScore(prev => prev + Math.round(points));
            setCorrectChars(prev => prev + currentPhrase.length);
            setTotalChars(prev => prev + currentPhrase.length);
            setCompletedPhrases(prev => prev + 1);
            setCombo(prev => {
                const newCombo = prev + 1;
                setMaxCombo(max => Math.max(max, newCombo));
                return newCombo;
            });
            
            // Next phrase
            setTypedText('');
            if (currentPhraseIndex < shuffledPhrases.length - 1) {
                setCurrentPhraseIndex(prev => prev + 1);
            } else {
                setShuffledPhrases(shuffleArray(phrases));
                setCurrentPhraseIndex(0);
            }
            
            // Reward
            if (onReward) {
                onReward('hopium', Math.round(points / 10));
            }
        }
    };
    
    const handleKeyDown = (e) => {
        if (e.key === 'Backspace' && typedText.length > 0) {
            // Backspace resets combo
            if (combo > 0) setCombo(0);
        }
    };
    
    const endGame = () => {
        setGameState('result');
        
        const finalAccuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 0;
        setAccuracy(finalAccuracy);
        
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('shill_race_highscore', score.toString());
        }
        
        // Track games played
        const gamesPlayed = parseInt(localStorage.getItem('shill_race_games') || '0') + 1;
        localStorage.setItem('shill_race_games', gamesPlayed.toString());
        
        if (onGameComplete) {
            onGameComplete('shill_typing_race', {
                score,
                wpm,
                accuracy: finalAccuracy,
                completedPhrases,
                maxCombo
            });
        }
    };
    
    const getCharClass = (char, index) => {
        if (index >= typedText.length) return 'pending';
        return typedText[index] === char ? 'correct' : 'incorrect';
    };
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal shill-race-game" onClick={e => e.stopPropagation()}>
                <button className="game-close-btn" onClick={onClose}>✕</button>
                
                <div className="game-header">
                    <h2>🚀 Shill Typing Race</h2>
                    <p>Type bullish phrases as fast as you can!</p>
                </div>
                
                {gameState === 'start' && (
                    <div className="game-start-screen">
                        <div style={{ fontSize: '4em', marginBottom: '20px' }}>⌨️</div>
                        <h3>How to Play</h3>
                        <p style={{ color: '#aaa', marginBottom: '20px', lineHeight: '1.6' }}>
                            Type the crypto phrases as fast as you can!<br/>
                            Build combos for bonus points.<br/>
                            You have 60 seconds. LFG! 🚀
                        </p>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            gap: '20px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#ffd700', fontSize: '1.5em' }}>{highScore}</div>
                                <div style={{ color: '#888', fontSize: '0.8em' }}>High Score</div>
                            </div>
                        </div>
                        <button className="game-start-btn" onClick={startGame}>
                            Start Shilling! 🚀
                        </button>
                    </div>
                )}
                
                {gameState === 'countdown' && (
                    <div className="shill-countdown">
                        <div className="countdown-number">{countdown}</div>
                        <div style={{ color: '#888' }}>Get Ready...</div>
                    </div>
                )}
                
                {gameState === 'playing' && (
                    <div className="shill-game-play">
                        {/* Stats Bar */}
                        <div className="shill-stats-bar">
                            <div className="shill-stat">
                                <span className="stat-value">{timeLeft}s</span>
                                <span className="stat-label">Time</span>
                            </div>
                            <div className="shill-stat">
                                <span className="stat-value">{score}</span>
                                <span className="stat-label">Score</span>
                            </div>
                            <div className="shill-stat">
                                <span className="stat-value">{wpm}</span>
                                <span className="stat-label">WPM</span>
                            </div>
                            <div className="shill-stat combo">
                                <span className="stat-value">{combo}x</span>
                                <span className="stat-label">Combo</span>
                            </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="shill-timer-bar">
                            <div 
                                className="shill-timer-fill"
                                style={{ width: `${(timeLeft / 60) * 100}%` }}
                            ></div>
                        </div>
                        
                        {/* Phrase Display */}
                        <div className="shill-phrase-container">
                            <div className="shill-phrase">
                                {currentPhrase.split('').map((char, idx) => (
                                    <span 
                                        key={idx} 
                                        className={`shill-char ${getCharClass(char, idx)}`}
                                    >
                                        {char}
                                    </span>
                                ))}
                            </div>
                            <div className="shill-phrase-count">
                                Phrase #{completedPhrases + 1}
                            </div>
                        </div>
                        
                        {/* Input */}
                        <input
                            ref={inputRef}
                            type="text"
                            className="shill-input"
                            value={typedText}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Start typing..."
                            autoComplete="off"
                            autoCapitalize="characters"
                        />
                        
                        {/* Combo Indicator */}
                        {combo >= 3 && (
                            <div className="shill-combo-popup">
                                🔥 {combo}x COMBO!
                            </div>
                        )}
                    </div>
                )}
                
                {gameState === 'result' && (
                    <div className="shill-result">
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>
                            {score > highScore ? '🏆' : '🚀'}
                        </div>
                        <h3 style={{ color: '#ffd700' }}>
                            {score > highScore ? 'NEW HIGH SCORE!' : 'Time\'s Up!'}
                        </h3>
                        
                        <div className="shill-final-stats">
                            <div className="shill-final-stat main">
                                <span className="stat-value">{score}</span>
                                <span className="stat-label">Final Score</span>
                            </div>
                            <div className="shill-final-stat">
                                <span className="stat-value">{wpm}</span>
                                <span className="stat-label">WPM</span>
                            </div>
                            <div className="shill-final-stat">
                                <span className="stat-value">{completedPhrases}</span>
                                <span className="stat-label">Phrases</span>
                            </div>
                            <div className="shill-final-stat">
                                <span className="stat-value">{maxCombo}x</span>
                                <span className="stat-label">Max Combo</span>
                            </div>
                        </div>
                        
                        <div style={{ 
                            background: 'rgba(0,255,136,0.1)', 
                            padding: '12px', 
                            borderRadius: '10px',
                            marginBottom: '20px'
                        }}>
                            <p style={{ color: '#00ff88', margin: 0 }}>
                                Rewards: +{Math.floor(score / 10)} HOPIUM
                            </p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="game-start-btn" onClick={startGame}>
                                Play Again
                            </button>
                            <button 
                                className="game-start-btn" 
                                onClick={onClose}
                                style={{ background: 'rgba(255,255,255,0.1)' }}
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==================== PORTFOLIO ROAST ====================

function WhaleWatcher({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start'); // start, playing, gameover
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(3);
    const [level, setLevel] = useState(1);
    const [transactions, setTransactions] = useState([]);
    const [timeLeft, setTimeLeft] = useState(45);
    const [whalesCaught, setWhalesCaught] = useState(0);
    const [missedWhales, setMissedWhales] = useState(0);
    const [combo, setCombo] = useState(0);
    const [maxCombo, setMaxCombo] = useState(0);
    const [showFeedback, setShowFeedback] = useState(null);
    const [highScore, setHighScore] = useState(() => {
        return parseInt(localStorage.getItem('whale_watcher_highscore') || '0');
    });
    const gameAreaRef = useRef(null);
    
    const walletPrefixes = ['0x7a', '0x3f', '0xd8', '0x1c', '0x9e', '0x4b', '0x2d', '0x8f', '0x5a', '0x6c'];
    const walletSuffixes = ['a3f', 'b7e', 'c9d', 'd2a', 'e5f', 'f8c', '1b4', '2e7', '3d9', '4c6'];
    const coins = ['BTC', 'ETH', 'SOL', 'DOGE', 'PEPE', 'SHIB', 'ARB', 'OP', 'MATIC', 'AVAX'];
    
    const generateTransaction = (isWhale = false) => {
        const prefix = walletPrefixes[Math.floor(Math.random() * walletPrefixes.length)];
        const suffix = walletSuffixes[Math.floor(Math.random() * walletSuffixes.length)];
        const coin = coins[Math.floor(Math.random() * coins.length)];
        
        let amount;
        if (isWhale) {
            // Whale transaction: $100K - $50M
            amount = Math.floor(Math.random() * 49900000) + 100000;
        } else {
            // Normal transaction: $10 - $50K
            amount = Math.floor(Math.random() * 49990) + 10;
        }
        
        return {
            id: Date.now() + Math.random(),
            wallet: `${prefix}...${suffix}`,
            coin,
            amount,
            isWhale,
            direction: Math.random() > 0.5 ? 'buy' : 'sell',
            x: Math.random() * 80 + 10, // 10-90% of width
            speed: (Math.random() * 2 + 2) - (level * 0.2), // Gets faster each level
            y: 0
        };
    };
    
    const formatAmount = (amount) => {
        if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
        return `$${amount}`;
    };
    
    const startGame = () => {
        setGameState('playing');
        setScore(0);
        setLives(3);
        setLevel(1);
        setTransactions([]);
        setTimeLeft(45);
        setWhalesCaught(0);
        setMissedWhales(0);
        setCombo(0);
        setMaxCombo(0);
    };
    
    // Game timer
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        if (timeLeft > 0 && lives > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            endGame();
        }
    }, [gameState, timeLeft, lives]);
    
    // Spawn transactions
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const spawnRate = Math.max(800 - (level * 100), 400); // Faster spawning each level
        const whaleChance = 0.15 + (level * 0.02); // More whales each level
        
        const spawner = setInterval(() => {
            const isWhale = Math.random() < whaleChance;
            setTransactions(prev => [...prev, generateTransaction(isWhale)]);
        }, spawnRate);
        
        return () => clearInterval(spawner);
    }, [gameState, level]);
    
    // Move transactions down
    useEffect(() => {
        if (gameState !== 'playing') return;
        
        const mover = setInterval(() => {
            setTransactions(prev => {
                const updated = prev.map(tx => ({
                    ...tx,
                    y: tx.y + tx.speed
                }));
                
                // Check for missed whales
                const missed = updated.filter(tx => tx.y > 100 && tx.isWhale);
                if (missed.length > 0) {
                    setMissedWhales(m => m + missed.length);
                    setLives(l => Math.max(0, l - missed.length));
                    setCombo(0);
                }
                
                // Remove off-screen transactions
                return updated.filter(tx => tx.y <= 100);
            });
        }, 50);
        
        return () => clearInterval(mover);
    }, [gameState]);
    
    // Level up every 500 points
    useEffect(() => {
        const newLevel = Math.floor(score / 500) + 1;
        if (newLevel > level && newLevel <= 10) {
            setLevel(newLevel);
        }
    }, [score]);
    
    const handleClick = (tx) => {
        if (gameState !== 'playing') return;
        
        if (tx.isWhale) {
            // Caught a whale!
            const points = 100 * (1 + combo * 0.2);
            setScore(s => s + Math.round(points));
            setWhalesCaught(w => w + 1);
            setCombo(c => {
                const newCombo = c + 1;
                setMaxCombo(m => Math.max(m, newCombo));
                return newCombo;
            });
            setShowFeedback({ type: 'success', x: tx.x, y: tx.y, text: `+${Math.round(points)} 🐋` });
            
            if (onReward) onReward('alpha', Math.round(points / 10));
        } else {
            // Clicked a normal transaction - penalty!
            setScore(s => Math.max(0, s - 25));
            setCombo(0);
            setShowFeedback({ type: 'fail', x: tx.x, y: tx.y, text: '-25 ❌' });
        }
        
        // Remove clicked transaction
        setTransactions(prev => prev.filter(t => t.id !== tx.id));
        
        // Clear feedback after animation
        setTimeout(() => setShowFeedback(null), 500);
    };
    
    const endGame = () => {
        setGameState('gameover');
        
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('whale_watcher_highscore', score.toString());
        }
        
        const gamesPlayed = parseInt(localStorage.getItem('whale_watcher_games') || '0') + 1;
        localStorage.setItem('whale_watcher_games', gamesPlayed.toString());
        
        if (onGameComplete) {
            onGameComplete('whale_watcher', {
                score,
                whalesCaught,
                maxCombo,
                level
            });
        }
    };
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal whale-watcher-game" onClick={e => e.stopPropagation()}>
                <button className="game-close-btn" onClick={onClose}>✕</button>
                
                <div className="game-header">
                    <h2>🐋 Whale Watcher</h2>
                    <p>Tap the whale transactions! Miss them and lose lives.</p>
                </div>
                
                {gameState === 'start' && (
                    <div className="game-start-screen">
                        <div style={{ fontSize: '4em', marginBottom: '20px' }}>🐋</div>
                        <h3>How to Play</h3>
                        <p style={{ color: '#aaa', marginBottom: '15px', lineHeight: '1.6' }}>
                            Tap transactions over $100K - those are WHALES!<br/>
                            Don't tap small transactions.<br/>
                            Don't let whales escape!
                        </p>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            gap: '20px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#ffd700', fontSize: '1.5em' }}>{highScore}</div>
                                <div style={{ color: '#888', fontSize: '0.8em' }}>High Score</div>
                            </div>
                        </div>
                        <div style={{ 
                            display: 'flex', 
                            gap: '15px', 
                            justifyContent: 'center',
                            marginBottom: '20px',
                            fontSize: '0.85em'
                        }}>
                            <div style={{ color: '#00ff88' }}>🐋 $100K+ = WHALE</div>
                            <div style={{ color: '#888' }}>🐟 &lt;$100K = Skip</div>
                        </div>
                        <button className="game-start-btn" onClick={startGame}>
                            Start Watching! 🐋
                        </button>
                    </div>
                )}
                
                {gameState === 'playing' && (
                    <div className="whale-game-play">
                        {/* Stats Bar */}
                        <div className="whale-stats-bar">
                            <div className="whale-stat">
                                <span className="stat-value">{timeLeft}s</span>
                                <span className="stat-label">Time</span>
                            </div>
                            <div className="whale-stat">
                                <span className="stat-value">{score}</span>
                                <span className="stat-label">Score</span>
                            </div>
                            <div className="whale-stat lives">
                                <span className="stat-value">{'❤️'.repeat(lives)}{'🖤'.repeat(3-lives)}</span>
                                <span className="stat-label">Lives</span>
                            </div>
                            <div className="whale-stat">
                                <span className="stat-value">Lv.{level}</span>
                                <span className="stat-label">Level</span>
                            </div>
                        </div>
                        
                        {/* Combo indicator */}
                        {combo >= 3 && (
                            <div className="whale-combo">🔥 {combo}x COMBO!</div>
                        )}
                        
                        {/* Game Area */}
                        <div className="whale-game-area" ref={gameAreaRef}>
                            {transactions.map(tx => (
                                <div
                                    key={tx.id}
                                    className={`whale-transaction ${tx.isWhale ? 'whale' : 'fish'} ${tx.direction}`}
                                    style={{
                                        left: `${tx.x}%`,
                                        top: `${tx.y}%`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    onClick={() => handleClick(tx)}
                                >
                                    <div className="tx-amount">{formatAmount(tx.amount)}</div>
                                    <div className="tx-details">
                                        <span className="tx-coin">{tx.coin}</span>
                                        <span className={`tx-direction ${tx.direction}`}>
                                            {tx.direction === 'buy' ? '📈' : '📉'}
                                        </span>
                                    </div>
                                    <div className="tx-wallet">{tx.wallet}</div>
                                    {tx.isWhale && <div className="whale-indicator">🐋</div>}
                                </div>
                            ))}
                            
                            {/* Feedback popup */}
                            {showFeedback && (
                                <div 
                                    className={`whale-feedback ${showFeedback.type}`}
                                    style={{ left: `${showFeedback.x}%`, top: `${showFeedback.y}%` }}
                                >
                                    {showFeedback.text}
                                </div>
                            )}
                        </div>
                        
                        {/* Bottom indicator */}
                        <div className="whale-escape-zone">
                            ⚠️ ESCAPE ZONE - Don't let whales pass!
                        </div>
                    </div>
                )}
                
                {gameState === 'gameover' && (
                    <div className="whale-result">
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>
                            {score > highScore ? '🏆' : whalesCaught >= 10 ? '🐋' : '🐟'}
                        </div>
                        <h3 style={{ color: '#ffd700' }}>
                            {score > highScore ? 'NEW HIGH SCORE!' : lives === 0 ? 'Game Over!' : 'Time\'s Up!'}
                        </h3>
                        
                        <div className="whale-final-stats">
                            <div className="whale-final-stat main">
                                <span className="stat-value">{score}</span>
                                <span className="stat-label">Final Score</span>
                            </div>
                            <div className="whale-final-stat">
                                <span className="stat-value">{whalesCaught}</span>
                                <span className="stat-label">🐋 Caught</span>
                            </div>
                            <div className="whale-final-stat">
                                <span className="stat-value">{maxCombo}x</span>
                                <span className="stat-label">Max Combo</span>
                            </div>
                            <div className="whale-final-stat">
                                <span className="stat-value">Lv.{level}</span>
                                <span className="stat-label">Reached</span>
                            </div>
                        </div>
                        
                        <div style={{ 
                            background: 'rgba(0,255,136,0.1)', 
                            padding: '12px', 
                            borderRadius: '10px',
                            marginBottom: '20px'
                        }}>
                            <p style={{ color: '#00ff88', margin: 0 }}>
                                Rewards: +{Math.floor(score / 10)} ALPHA 🔮
                            </p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="game-start-btn" onClick={startGame}>
                                Play Again
                            </button>
                            <button 
                                className="game-start-btn" 
                                onClick={onClose}
                                style={{ background: 'rgba(255,255,255,0.1)' }}
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==================== RUG PULL REFLEX GAME ====================

function RugPullReflex({ onClose, onReward, playerName, onGameComplete }) {
    const [gameState, setGameState] = useState('start'); // start, pumping, warning, rugged, sold, result
    const [round, setRound] = useState(1);
    const [totalRounds, setTotalRounds] = useState(10);
    const [score, setScore] = useState(0);
    const [reactionTime, setReactionTime] = useState(null);
    const [bestTime, setBestTime] = useState(null);
    const [avgTime, setAvgTime] = useState(0);
    const [allTimes, setAllTimes] = useState([]);
    const [survived, setSurvived] = useState(0);
    const [rugged, setRugged] = useState(0);
    const [currentCoin, setCurrentCoin] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [currentPrice, setCurrentPrice] = useState(100);
    const [priceChange, setPriceChange] = useState(0);
    const [warningStartTime, setWarningStartTime] = useState(null);
    const [tooEarly, setTooEarly] = useState(false);
    const [highScore, setHighScore] = useState(() => {
        return parseInt(localStorage.getItem('rug_pull_highscore') || '0');
    });
    const timerRef = useRef(null);
    const rugTimerRef = useRef(null);
    const chartIntervalRef = useRef(null);
    const startPriceRef = useRef(100);
    
    const memeCoins = [
        { name: 'SAFEMOON', icon: '🌙', dev: 'Anonymous Dev' },
        { name: 'ELONSPERM', icon: '🚀', dev: 'Definitely Not Elon' },
        { name: 'BABYDOGE', icon: '🐕', dev: 'Cute Puppy LLC' },
        { name: 'CATGIRL', icon: '😺', dev: 'Anime Ventures' },
        { name: 'CUMROCKET', icon: '💦', dev: 'Adult DAO' },
        { name: 'FLOKI2.0', icon: '🐶', dev: 'Viking Capital' },
        { name: 'SQUIDGAME', icon: '🦑', dev: 'Totally Legit Inc' },
        { name: 'DOGELON', icon: '👽', dev: 'Mars Colony Fund' },
        { name: 'SHIBARMY', icon: '⚔️', dev: 'Woof Woof Labs' },
        { name: 'SAITAMA', icon: '👊', dev: 'Anime Finance' },
        { name: 'PONZICOIN', icon: '🔺', dev: 'Charles P. Scheme' },
        { name: 'TRUSTME', icon: '🤝', dev: 'Nigerian Prince' },
        { name: '100XGEM', icon: '💎', dev: 'Guaranteed Gains LLC' },
        { name: 'MOONSOON', icon: '🌕', dev: 'Lunar Ventures' },
        { name: 'SAFERUG', icon: '🧹', dev: 'Ironic Dev' }
    ];
    
    const startGame = () => {
        setRound(1);
        setScore(0);
        setSurvived(0);
        setRugged(0);
        setAllTimes([]);
        setBestTime(null);
        setAvgTime(0);
        startRound();
    };
    
    const startRound = () => {
        // Pick random coin
        const coin = memeCoins[Math.floor(Math.random() * memeCoins.length)];
        setCurrentCoin(coin);
        setReactionTime(null);
        setTooEarly(false);
        
        // Reset chart
        const startPrice = 100;
        startPriceRef.current = startPrice;
        setCurrentPrice(startPrice);
        setPriceChange(0);
        setChartData([{ price: startPrice, time: 0 }]);
        
        setGameState('pumping');
        
        // Animate chart pumping
        let price = startPrice;
        let time = 0;
        chartIntervalRef.current = setInterval(() => {
            time += 1;
            // Price goes up with some variance
            const change = (Math.random() * 15) + 5; // Always up 5-20
            price = price + change;
            setCurrentPrice(price);
            setPriceChange(((price - startPriceRef.current) / startPriceRef.current * 100));
            setChartData(prev => [...prev, { price, time }].slice(-20));
        }, 150);
        
        // Random delay before rug warning (2-5 seconds)
        const delay = 2000 + Math.random() * 3000;
        
        timerRef.current = setTimeout(() => {
            // Show warning - chart starts to wobble
            setGameState('warning');
            setWarningStartTime(Date.now());
            
            // Auto-rug after 600ms if not sold
            rugTimerRef.current = setTimeout(() => {
                handleRugged();
            }, 600);
        }, delay);
    };
    
    const handleSell = () => {
        if (gameState === 'pumping') {
            // Too early!
            clearTimeout(timerRef.current);
            clearInterval(chartIntervalRef.current);
            setTooEarly(true);
            setGameState('rugged');
            setRugged(r => r + 1);
            return;
        }
        
        if (gameState === 'warning') {
            // Perfect timing!
            clearTimeout(rugTimerRef.current);
            clearInterval(chartIntervalRef.current);
            const reaction = Date.now() - warningStartTime;
            setReactionTime(reaction);
            
            // Calculate points (faster = more points)
            const points = Math.max(10, Math.round(500 - reaction));
            setScore(s => s + points);
            setSurvived(s => s + 1);
            
            // Track times
            const newTimes = [...allTimes, reaction];
            setAllTimes(newTimes);
            if (!bestTime || reaction < bestTime) setBestTime(reaction);
            setAvgTime(Math.round(newTimes.reduce((a,b) => a+b, 0) / newTimes.length));
            
            setGameState('sold');
            
            if (onReward) onReward('hopium', Math.round(points / 5));
        }
    };
    
    const handleRugged = () => {
        clearTimeout(timerRef.current);
        clearTimeout(rugTimerRef.current);
        clearInterval(chartIntervalRef.current);
        
        // Animate the rug pull - price crashes
        let price = currentPrice;
        const crashInterval = setInterval(() => {
            price = price * 0.3; // Crash hard
            setCurrentPrice(price);
            setPriceChange(((price - startPriceRef.current) / startPriceRef.current * 100));
            setChartData(prev => [...prev, { price, time: prev.length }].slice(-25));
            
            if (price < 1) {
                clearInterval(crashInterval);
            }
        }, 50);
        
        setTimeout(() => clearInterval(crashInterval), 500);
        
        setGameState('rugged');
        setRugged(r => r + 1);
    };
    
    const nextRound = () => {
        if (round >= totalRounds) {
            endGame();
        } else {
            setRound(r => r + 1);
            startRound();
        }
    };
    
    const endGame = () => {
        setGameState('result');
        
        if (score > highScore) {
            setHighScore(score);
            localStorage.setItem('rug_pull_highscore', score.toString());
        }
        
        const gamesPlayed = parseInt(localStorage.getItem('rug_pull_games') || '0') + 1;
        localStorage.setItem('rug_pull_games', gamesPlayed.toString());
        
        if (onGameComplete) {
            onGameComplete('rug_pull_reflex', { score, survived, rugged, bestTime, avgTime });
        }
    };
    
    // Cleanup timers
    useEffect(() => {
        return () => {
            clearTimeout(timerRef.current);
            clearTimeout(rugTimerRef.current);
            clearInterval(chartIntervalRef.current);
        };
    }, []);
    
    const getRugMessage = () => {
        const messages = [
            "LIQUIDITY REMOVED 💀",
            "DEV DUMPED EVERYTHING 🏃‍♂️",
            "CONTRACT HONEYPOTTED 🍯",
            "WALLET DRAINED 💸",
            "RUG PULL COMPLETE 🧹",
            "FUNDS ARE SAFU... JK 😂",
            "THANKS FOR PLAYING 👋"
        ];
        return messages[Math.floor(Math.random() * messages.length)];
    };
    
    // Render chart
    const renderChart = () => {
        if (chartData.length < 2) return null;
        
        const maxPrice = Math.max(...chartData.map(d => d.price));
        const minPrice = Math.min(...chartData.map(d => d.price));
        const range = maxPrice - minPrice || 1;
        const width = 280;
        const height = 120;
        const padding = 10;
        
        const points = chartData.map((d, i) => {
            const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
            const y = height - padding - ((d.price - minPrice) / range) * (height - padding * 2);
            return `${x},${y}`;
        }).join(' ');
        
        const isRuinging = gameState === 'rugged' && !tooEarly;
        const lineColor = isRuinging ? '#ff4444' : gameState === 'warning' ? '#ffd700' : '#00ff88';
        
        return (
            <svg width={width} height={height} className="rug-chart-svg">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map((ratio, i) => (
                    <line 
                        key={i}
                        x1={padding} 
                        y1={padding + ratio * (height - padding * 2)} 
                        x2={width - padding} 
                        y2={padding + ratio * (height - padding * 2)}
                        stroke="rgba(255,255,255,0.1)"
                        strokeDasharray="3,3"
                    />
                ))}
                
                {/* Area fill */}
                <polygon
                    points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
                    fill={`url(#chartGradient-${gameState})`}
                    opacity="0.3"
                />
                
                {/* Line */}
                <polyline
                    points={points}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: `drop-shadow(0 0 6px ${lineColor})` }}
                />
                
                {/* Gradient definitions */}
                <defs>
                    <linearGradient id="chartGradient-pumping" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00ff88" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="chartGradient-warning" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffd700" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="chartGradient-rugged" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff4444" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                    <linearGradient id="chartGradient-sold" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00ff88" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                </defs>
            </svg>
        );
    };
    
    return (
        <div className="game-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="game-modal rug-pull-game" onClick={e => e.stopPropagation()}>
                <button className="game-close-btn" onClick={onClose}>✕</button>
                
                <div className="game-header">
                    <h2>🚨 Rug Pull Reflex</h2>
                    <p>Watch the chart pump, then SELL before the rug!</p>
                </div>
                
                {gameState === 'start' && (
                    <div className="game-start-screen">
                        <div style={{ fontSize: '4em', marginBottom: '20px' }}>📈</div>
                        <h3>How to Play</h3>
                        <p style={{ color: '#aaa', marginBottom: '15px', lineHeight: '1.6' }}>
                            Watch the chart go up... 📈<br/>
                            When it starts flashing YELLOW ⚠️<br/>
                            SMASH that SELL button!<br/>
                            <span style={{ color: '#ff6b6b' }}>Sell too early = paper hands! 📄</span>
                        </p>
                        <div style={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            gap: '20px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: '#ffd700', fontSize: '1.5em' }}>{highScore}</div>
                                <div style={{ color: '#888', fontSize: '0.8em' }}>High Score</div>
                            </div>
                        </div>
                        <button className="game-start-btn" onClick={startGame}>
                            Start Trading 📊
                        </button>
                    </div>
                )}
                
                {(gameState === 'pumping' || gameState === 'warning' || gameState === 'sold' || gameState === 'rugged') && (
                    <div className="rug-game-play">
                        {/* Round indicator */}
                        <div className="rug-round-bar">
                            <span>Round {round}/{totalRounds}</span>
                            <span>Score: {score}</span>
                            <span>✅ {survived} | ❌ {rugged}</span>
                        </div>
                        
                        {/* Coin info with price */}
                        {currentCoin && (
                            <div className={`rug-coin-info ${gameState}`}>
                                <div className="coin-header">
                                    <span className="coin-icon">{currentCoin.icon}</span>
                                    <div className="coin-details">
                                        <div className="coin-name">${currentCoin.name}</div>
                                        <div className="coin-dev">by {currentCoin.dev}</div>
                                    </div>
                                    <div className="coin-price-display">
                                        <div className={`coin-price ${priceChange >= 0 ? 'up' : 'down'}`}>
                                            ${currentPrice.toFixed(2)}
                                        </div>
                                        <div className={`coin-change ${priceChange >= 0 ? 'up' : 'down'}`}>
                                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Chart area */}
                        <div className={`rug-chart-area ${gameState}`}>
                            {renderChart()}
                            
                            {/* Overlay messages */}
                            {gameState === 'warning' && (
                                <div className="chart-overlay warning">
                                    <div className="warning-flash">⚠️ SELL NOW ⚠️</div>
                                </div>
                            )}
                            
                            {gameState === 'sold' && (
                                <div className="chart-overlay sold">
                                    <div className="sold-text">✅ SOLD!</div>
                                    <div className="sold-time">{reactionTime}ms</div>
                                    <div className="sold-points">+{Math.max(10, Math.round(500 - reactionTime))} pts</div>
                                </div>
                            )}
                            
                            {gameState === 'rugged' && (
                                <div className="chart-overlay rugged">
                                    <div className="rugged-text">
                                        {tooEarly ? '📄 PAPER HANDS!' : getRugMessage()}
                                    </div>
                                    <div className="rugged-subtext">
                                        {tooEarly ? 'You sold too early!' : '-100% 💀'}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Sell button */}
                        {(gameState === 'pumping' || gameState === 'warning') && (
                            <button 
                                className={`rug-sell-btn ${gameState === 'warning' ? 'urgent' : ''}`}
                                onClick={handleSell}
                            >
                                💰 SELL EVERYTHING 💰
                            </button>
                        )}
                        
                        {/* Next round button */}
                        {(gameState === 'sold' || gameState === 'rugged') && (
                            <button className="rug-next-btn" onClick={nextRound}>
                                {round >= totalRounds ? 'See Results' : 'Next Round →'}
                            </button>
                        )}
                    </div>
                )}
                
                {gameState === 'result' && (
                    <div className="rug-result">
                        <div style={{ fontSize: '3em', marginBottom: '15px' }}>
                            {survived >= 8 ? '🏆' : survived >= 5 ? '😅' : '💀'}
                        </div>
                        <h3 style={{ color: survived >= 5 ? '#ffd700' : '#ff6b6b' }}>
                            {score > highScore ? 'NEW HIGH SCORE!' : survived >= 8 ? 'Rug Survivor!' : survived >= 5 ? 'Not Bad!' : 'Rekt!'}
                        </h3>
                        
                        <div className="rug-final-stats">
                            <div className="rug-final-stat main">
                                <span className="stat-value">{score}</span>
                                <span className="stat-label">Final Score</span>
                            </div>
                            <div className="rug-final-stat">
                                <span className="stat-value">{survived}/{totalRounds}</span>
                                <span className="stat-label">Survived</span>
                            </div>
                            <div className="rug-final-stat">
                                <span className="stat-value">{bestTime || '-'}ms</span>
                                <span className="stat-label">Best Time</span>
                            </div>
                            <div className="rug-final-stat">
                                <span className="stat-value">{avgTime || '-'}ms</span>
                                <span className="stat-label">Avg Time</span>
                            </div>
                        </div>
                        
                        <div style={{ 
                            background: 'rgba(0,255,136,0.1)', 
                            padding: '12px', 
                            borderRadius: '10px',
                            marginBottom: '20px'
                        }}>
                            <p style={{ color: '#00ff88', margin: 0 }}>
                                Rewards: +{Math.floor(score / 5)} HOPIUM 💊
                            </p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="game-start-btn" onClick={startGame}>
                                Play Again
                            </button>
                            <button 
                                className="game-start-btn" 
                                onClick={onClose}
                                style={{ background: 'rgba(255,255,255,0.1)' }}
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ==================== PREDICTION STREAKS ====================

function DegenBingo({ showToast }) {
    const bingoItems = [
        "Elon tweets", "Rug pull", "New ATH", "Flash crash", "-50% dump",
        "CEX listing", "Airdrop", "Dev doxxed", "Whale buy", "FUD article",
        "Exchange hack", "FREE", "Bull trap", "Bear trap", "Liquidation",
        "Moon mission", "Dead cat bounce", "FOMO buy", "Panic sell", "Diamond hands",
        "Paper hands", "Pump & dump", "Insider trading", "SEC news", "ETF approval"
    ];
    
    const [markedCells, setMarkedCells] = useState(() => {
        const saved = localStorage.getItem('pumptown_bingo');
        const data = saved ? JSON.parse(saved) : null;
        const today = new Date().toDateString();
        if (data && data.date === today) {
            return data.marked;
        }
        return [12]; // Free space always marked
    });
    
    useEffect(() => {
        localStorage.setItem('pumptown_bingo', JSON.stringify({
            date: new Date().toDateString(),
            marked: markedCells
        }));
    }, [markedCells]);
    
    const toggleCell = (idx) => {
        if (idx === 12) return; // Free space
        
        setMarkedCells(prev => {
            if (prev.includes(idx)) {
                return prev.filter(i => i !== idx);
            }
            return [...prev, idx];
        });
    };
    
    // Check for bingo
    const checkBingo = () => {
        const lines = [
            [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24], // rows
            [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], // cols
            [0,6,12,18,24], [4,8,12,16,20] // diagonals
        ];
        
        return lines.some(line => line.every(idx => markedCells.includes(idx)));
    };
    
    const hasBingo = checkBingo();
    
    return (
        <div style={{ 
            marginTop: '20px',
            padding: '15px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '15px',
            border: hasBingo ? '2px solid #ffd700' : '2px solid rgba(0,255,136,0.3)',
            overflow: 'hidden',
            boxSizing: 'border-box'
        }}>
            <h3 style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1em' }}>
                <span>🎱 Degen Bingo</span>
                {hasBingo && <span style={{ color: '#ffd700' }}>🎉 BINGO!</span>}
            </h3>
            <div className="bingo-card">
                {bingoItems.map((item, idx) => (
                    <div 
                        key={idx}
                        className={`bingo-cell ${markedCells.includes(idx) ? 'marked' : ''} ${idx === 12 ? 'free' : ''}`}
                        onClick={() => toggleCell(idx)}
                    >
                        {idx === 12 ? '⭐ FREE' : item}
                    </div>
                ))}
            </div>
            <div style={{ color: '#888', fontSize: '0.75em', marginTop: '8px', textAlign: 'center' }}>
                Click cells when events happen IRL • Resets daily
            </div>
        </div>
    );
}

// ==================== FRIENDS/SOCIAL SECTION ====================
// ==================== PASSIVE INCOME DISPLAY ====================

