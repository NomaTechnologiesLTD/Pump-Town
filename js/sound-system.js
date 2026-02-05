// Sound Effects & Audio System
// Auto-extracted from index.html

// ==================== SOUND EFFECTS ====================
// ==================== SOUND SYSTEM ====================
// Global Audio Context for sound effects
let audioContext = null;

const getAudioContext = () => {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
};

// Sound generator using Web Audio API
const SoundGenerator = {
    // Play a tone with specific frequency and duration
    playTone: (frequency, duration, type = 'sine', volume = 0.3) => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        try {
            const ctx = getAudioContext();
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(volume, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            
            oscillator.start(ctx.currentTime);
            oscillator.stop(ctx.currentTime + duration);
        } catch (e) {}
    },
    
    // Win sound - happy ascending chime
    win: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            setTimeout(() => SoundGenerator.playTone(freq, 0.2, 'sine', 0.25), i * 100);
        });
    },
    
    // Big win / Jackpot sound
    jackpot: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        const notes = [523, 659, 784, 880, 1047, 1175, 1319, 1568];
        notes.forEach((freq, i) => {
            setTimeout(() => SoundGenerator.playTone(freq, 0.3, 'sine', 0.3), i * 80);
        });
    },
    
    // Lose sound - descending sad tone
    lose: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        const notes = [400, 350, 300, 250];
        notes.forEach((freq, i) => {
            setTimeout(() => SoundGenerator.playTone(freq, 0.25, 'sawtooth', 0.15), i * 120);
        });
    },
    
    // Coin flip sound
    coinFlip: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        for (let i = 0; i < 8; i++) {
            setTimeout(() => SoundGenerator.playTone(800 + Math.random() * 400, 0.05, 'square', 0.1), i * 50);
        }
    },
    
    // Dice roll sound
    diceRoll: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        for (let i = 0; i < 12; i++) {
            setTimeout(() => SoundGenerator.playTone(200 + Math.random() * 300, 0.08, 'triangle', 0.15), i * 60);
        }
    },
    
    // Wheel spin sound - continuous ticking
    wheelSpin: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        let tickCount = 0;
        const maxTicks = 40;
        const tick = () => {
            if (tickCount >= maxTicks) return;
            SoundGenerator.playTone(600 + Math.random() * 200, 0.03, 'square', 0.1);
            tickCount++;
            // Slow down over time
            const delay = 50 + (tickCount * 5);
            setTimeout(tick, delay);
        };
        tick();
    },
    
    // Wheel stop / result sound
    wheelStop: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(880, 0.3, 'sine', 0.3);
    },
    
    // Notification sound
    notification: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(880, 0.1, 'sine', 0.2);
        setTimeout(() => SoundGenerator.playTone(1100, 0.15, 'sine', 0.2), 100);
    },
    
    // Click sound
    click: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(600, 0.05, 'square', 0.1);
    },
    
    // Level up sound
    levelUp: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        const notes = [440, 554, 659, 880, 1047, 1319];
        notes.forEach((freq, i) => {
            setTimeout(() => SoundGenerator.playTone(freq, 0.25, 'sine', 0.25), i * 100);
        });
    },
    
    // Rocket launch sound
    rocketLaunch: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        let freq = 100;
        const launch = () => {
            if (freq > 2000) return;
            SoundGenerator.playTone(freq, 0.1, 'sawtooth', 0.15);
            freq += 50;
            setTimeout(launch, 30);
        };
        launch();
    },
    
    // Rocket crash / explosion
    explosion: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        try {
            const ctx = getAudioContext();
            const noise = ctx.createBufferSource();
            const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
            }
            noise.buffer = buffer;
            const gainNode = ctx.createGain();
            gainNode.gain.value = 0.3;
            noise.connect(gainNode);
            gainNode.connect(ctx.destination);
            noise.start();
        } catch (e) {}
    },
    
    // Slot machine spinning
    slotSpin: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        for (let i = 0; i < 20; i++) {
            setTimeout(() => SoundGenerator.playTone(300 + (i % 3) * 100, 0.05, 'square', 0.08), i * 50);
        }
    },
    
    // Countdown beep
    countdown: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(800, 0.1, 'square', 0.2);
    },
    
    // Error / invalid action sound
    error: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(200, 0.3, 'sawtooth', 0.2);
    },
    
    // Collect / pickup sound
    collect: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(500, 0.1, 'sine', 0.2);
        setTimeout(() => SoundGenerator.playTone(700, 0.1, 'sine', 0.2), 80);
    },
    
    // Purchase / spend sound
    purchase: () => {
        if (localStorage.getItem('pumptown_sound') === 'false') return;
        SoundGenerator.playTone(400, 0.15, 'triangle', 0.2);
        setTimeout(() => SoundGenerator.playTone(300, 0.15, 'triangle', 0.15), 100);
    }
};

// Make sounds globally available
window.GameSounds = SoundGenerator;

function useSoundEffects() {
    const [enabled, setEnabled] = useState(() => {
        return localStorage.getItem('pumptown_sound') !== 'false';
    });
    
    const play = (soundName) => {
        if (!enabled) return;
        if (SoundGenerator[soundName]) {
            SoundGenerator[soundName]();
        }
    };
    
    const toggle = () => {
        const newValue = !enabled;
        setEnabled(newValue);
        localStorage.setItem('pumptown_sound', newValue.toString());
        if (newValue) {
            // Play a test sound when enabling
            setTimeout(() => SoundGenerator.click(), 100);
        }
    };
    
    return { enabled, toggle, play };
}

