// ====================================================
// misc.js — Miscellaneous components
// Degens City - Auto-extracted from index.html
// ====================================================

function SoundToggle() {
    const [soundEnabled, setSoundEnabled] = useState(() => {
        const saved = localStorage.getItem('pumptown_sound');
        return saved !== 'false';
    });
    
    useEffect(() => {
        localStorage.setItem('pumptown_sound', soundEnabled.toString());
    }, [soundEnabled]);
    
    const toggleSound = () => {
        const newValue = !soundEnabled;
        setSoundEnabled(newValue);
        // Play a test sound when enabling
        if (newValue && window.GameSounds) {
            setTimeout(() => window.GameSounds.notification(), 100);
        }
    };
    
    return (
        <div 
            className="sound-toggle" 
            onClick={toggleSound}
            title={soundEnabled ? 'Sound On - Click to mute' : 'Sound Off - Click to enable'}
        >
            {soundEnabled ? '🔊' : '🔇'}
        </div>
    );
}

// ==================== NFT ACHIEVEMENT MINT ====================

