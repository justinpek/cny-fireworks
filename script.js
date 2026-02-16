const canvas = document.getElementById('fireworksCanvas');
const ctx = canvas.getContext('2d');

let canvasWidth = window.innerWidth;
let canvasHeight = window.innerHeight;

canvas.width = canvasWidth;
canvas.height = canvasHeight;

window.addEventListener('resize', () => {
    canvasWidth = window.innerWidth;
    canvasHeight = window.innerHeight;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
});

function random(min, max) {
    return Math.random() * (max - min) + min;
}

// --- Audio Manager (Advanced Realistic Samples) ---
class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);

        this.buffers = {};
        this.soundUrls = {
            'launch': 'https://assets.mixkit.co/active_storage/sfx/1714/1714-preview.mp3',
            'heavy_boom': 'https://assets.mixkit.co/active_storage/sfx/1103/1103-preview.mp3',
            'soft_boom': 'https://assets.mixkit.co/active_storage/sfx/1292/1292-preview.mp3',
            'crackle': 'https://assets.mixkit.co/active_storage/sfx/1668/1668-preview.mp3',
            'whistle': 'https://assets.mixkit.co/active_storage/sfx/1675/1675-preview.mp3',
            'pop': 'https://assets.mixkit.co/active_storage/sfx/2579/2579-preview.mp3',
            'firecracker_string': 'https://assets.mixkit.co/active_storage/sfx/2989/2989-preview.mp3'
        };

        this.loadSounds();
    }

    async loadSounds() {
        for (let [name, url] of Object.entries(this.soundUrls)) {
            try {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                this.buffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
            } catch (e) {
                console.error(`Failed to load sound ${name}:`, e);
            }
        }
    }

    setMute(muted) {
        // Immediate mute using master gain
        this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }

    play(name, options = {}) {
        // Resume context if suspended (needed for some browsers)
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const buffer = this.buffers[name];
        if (!buffer) return;

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        // Realistic variation
        const rate = options.rate || 1.0;
        source.playbackRate.value = rate * random(0.9, 1.1);

        const gainNode = this.ctx.createGain();
        // Lower volume by default as requested
        const baseVolume = (options.volume || 0.5) * 0.6;
        gainNode.gain.value = baseVolume;

        source.connect(gainNode);
        // Connect to masterGain instead of destination
        gainNode.connect(this.masterGain);
        source.start(0);
    }
}

const soundManager = new SoundManager();

// --- Global State ---
let isMuted = true; // Default SFX OFF
const bgMusic = document.getElementById('bgMusic');

// Initialize SoundManager volume
soundManager.setMute(isMuted);

// --- UI Interaction ---
const musicToggle = document.getElementById('musicToggle');
const sfxToggle = document.getElementById('sfxToggle');
const controlsPanel = document.getElementById('controlsPanel');

// Music Control
if (musicToggle && bgMusic) {
    musicToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bgMusic.paused) {
            bgMusic.play().then(() => {
                musicToggle.textContent = '🎵 音乐: 开';
                musicToggle.classList.add('active');
            }).catch(e => {
                console.log("Audio play failed", e);
                // Try to alert only if it's a real error not just user abort
                if (e.name !== 'AbortError') {
                    // alert("背景音乐加载失败..."); // Optional, kept silent effectively
                }
            });
        } else {
            bgMusic.pause();
            musicToggle.textContent = '🎵 音乐: 关';
            musicToggle.classList.remove('active');
        }
    });
}

// SFX Control
// SFX Control
if (sfxToggle) {
    sfxToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        isMuted = !isMuted;

        // Update SoundManager immediately
        soundManager.setMute(isMuted);

        if (isMuted) {
            sfxToggle.textContent = '🔊 音效: 关';
            sfxToggle.classList.remove('active');
        } else {
            sfxToggle.textContent = '🔊 音效: 开';
            sfxToggle.classList.add('active');
            if (soundManager.ctx.state === 'suspended') soundManager.ctx.resume();
        }
    });
}

// Restore UI on Canvas Click (if hidden) - Removed as UI hiding feature is removed
canvas.addEventListener('click', (e) => {
    // Normal firework logic
    if (soundManager.ctx.state === 'suspended') soundManager.ctx.resume();
    // Launch towards click
    launchRandom(e.clientX, e.clientY);
});

// Remove old greeting logic from click if it exists
// (Already handled by above replacement)

// --- Particle System ---

class Particle {
    constructor(x, y, color, velocity, options = {}) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.velocity = velocity;
        this.alpha = 1;
        this.friction = options.friction || 0.95;
        this.gravity = options.gravity || 0.04;
        this.decay = options.decay || random(0.015, 0.03);
        this.size = options.size || 2;
        this.flicker = options.flicker || false;
        this.history = [];
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.flicker ? (Math.random() > 0.5 ? this.alpha : this.alpha * 0.5) : this.alpha;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
    }

    update() {
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.velocity.y += this.gravity;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
    }
}

// --- Firework Types ---

class FireworkBase {
    constructor(startX, startY, targetX, targetY) {
        this.x = startX;
        this.y = startY;
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.exploded = false;
        this.dead = false;
        this.particles = [];
        this.angle = Math.atan2(targetY - startY, targetX - startX);
        this.speed = 4;
        this.acceleration = 1.02;
        this.history = [];
    }

    update() {
        if (!this.exploded) {
            this.speed *= this.acceleration;
            const vx = Math.cos(this.angle) * this.speed;
            const vy = Math.sin(this.angle) * this.speed;
            this.x += vx;
            this.y += vy;
            this.history.push({ x: this.x, y: this.y });
            if (this.history.length > 5) this.history.shift();

            const dist = Math.hypot(this.x - this.startX, this.y - this.startY);
            const totalDist = Math.hypot(this.targetX - this.startX, this.targetY - this.startY);
            if (dist >= totalDist) this.explode();
        } else {
            // Standard particle update
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (this.particles[i].alpha <= 0) this.particles.splice(i, 1);
            }
            if (this.particles.length === 0) this.dead = true;
        }
    }

    draw() {
        if (!this.exploded) {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            if (this.history.length > 0) ctx.lineTo(this.history[0].x, this.history[0].y);
            ctx.strokeStyle = '#fff';
            ctx.stroke();
        } else {
            this.particles.forEach(p => p.draw());
        }
    }

    explode() {
        this.exploded = true;
        soundManager.play('heavy_boom', { volume: 0.8 });
    }
}

// 1. Crossette (Splitting stars)
class CrossetteFirework extends FireworkBase {
    explode() {
        this.exploded = true;
        soundManager.play('soft_boom', { rate: 1.2 }); // Shorter boom
        const count = 8; // Fewer initial stars
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const speed = 4;
            const p = new Particle(this.x, this.y, '#FFD700', {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            }, { decay: 0.01, size: 3 });

            // Custom update to split
            p.origUpdate = p.update;
            p.hasSplit = false;
            p.update = function () {
                this.origUpdate();
                // Random split logic
                if (!this.hasSplit && this.alpha < 0.7 && Math.random() < 0.1) {
                    this.hasSplit = true;
                    soundManager.play('crackle', { volume: 0.2, rate: 1.5 });
                    // Create 4 cross pieces
                    for (let k = 0; k < 4; k++) {
                        const subAngle = (Math.PI / 2) * k;
                        // Orthogonal break
                        this.particles.push(new Particle(this.x, this.y, this.color, {
                            x: Math.cos(subAngle) * 2,
                            y: Math.sin(subAngle) * 2
                        }, { decay: 0.04, size: 1.5 }));
                    }
                }
            };
            this.particles.push(p);
        }
    }
}

// 2. Spinner (Rotates in air)
class SpinnerFirework extends FireworkBase {
    update() {
        if (!this.exploded) {
            super.update();
            // Spiral visual
            this.x += Math.sin(Date.now() / 50) * 3;
        } else {
            super.update();
        }
    }
    explode() {
        this.exploded = true;
        soundManager.play('whistle', { rate: 0.8 }); // Low whistle
        soundManager.play('crackle', { volume: 0.4 });

        const count = 30;
        for (let i = 0; i < count; i++) {
            const angle = random(0, Math.PI * 2);
            const speed = random(1, 8);
            this.particles.push(new Particle(this.x, this.y, `hsl(${random(0, 360)}, 100%, 60%)`, {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            }, { friction: 0.92, gravity: 0 }));
        }
    }
}

// 3. Firecrackers (String of bangs)
// Ground effect
class FirecrackerString {
    constructor(x) {
        this.x = x;
        this.y = canvasHeight - 100;
        this.particles = [];
        this.dead = false;
        this.duration = 2500;
        this.startTime = Date.now();
        this.hasPlayedSound = false;
        this.nextExplosion = 0;
        this.nextPopSound = 0;
    }
    update() {
        if (this.y < canvasHeight - 50) this.y += 3;

        // Main "Bed" of sound (The string burning)
        if (!this.hasPlayedSound) {
            // Play base layer
            soundManager.play('firecracker_string', { volume: 0.6, rate: 1.0 });
            // Play a second overlap for density
            setTimeout(() => soundManager.play('firecracker_string', { volume: 0.6, rate: 1.1 }), 200);
            this.hasPlayedSound = true;
        }

        // Layer individual loud "pops" for texture realism
        if (Date.now() - this.startTime < this.duration) {
            if (Date.now() > this.nextPopSound) {
                this.nextPopSound = Date.now() + random(50, 150);
                soundManager.play('pop', { volume: 0.4, rate: random(0.8, 1.4) });
            }

            if (Date.now() > this.nextExplosion) {
                this.nextExplosion = Date.now() + random(10, 40);
                const exX = this.x + random(-20, 20);
                const exY = this.y + random(-30, 30);

                // Red paper debris
                for (let i = 0; i < 8; i++) {
                    this.particles.push(new Particle(exX, exY, '#FF0000', {
                        x: random(-5, 5),
                        y: random(-5, 5)
                    }, { decay: random(0.05, 0.1), size: random(2, 4), gravity: 0.15 }));
                }
                this.particles.push(new Particle(exX, exY, '#FFF', { x: 0, y: -1 }, { decay: 0.15, size: 10 }));
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].alpha <= 0) this.particles.splice(i, 1);
        }
        if (Date.now() - this.startTime > this.duration && this.particles.length === 0) this.dead = true;
    }
    draw() {
        this.particles.forEach(p => p.draw());
    }
}

// 4. Roman Candle (Spit Pearls)
class RomanCandle {
    constructor(x) {
        this.x = x;
        this.y = canvasHeight;
        this.shots = 5;
        this.nextShot = 0;
        this.particles = []; // Act as fireworks list essentially
        this.dead = false;
        this.active = true;
    }
    update() {
        if (this.shots > 0 && Date.now() > this.nextShot) {
            this.shots--;
            this.nextShot = Date.now() + 400; // 400ms delay between shots
            soundManager.play('launch', { rate: 1.5 }); // Higher pitch launch
            // Shoot a colorful pearl
            const pearl = new FireworkBase(this.x, this.y, this.x + random(-20, 20), canvasHeight * 0.4 - this.shots * 30);
            pearl.color = `hsl(${random(0, 360)}, 100%, 50%)`;
            // Override draw to look like a ball
            pearl.draw = function () {
                if (!this.exploded) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = this.color;
                    ctx.fill();
                } else { this.particles.forEach(p => p.draw()); }
            };
            // Simple burst
            pearl.explode = function () {
                this.exploded = true;
                soundManager.play('soft_boom', { volume: 0.3 });
                for (let i = 0; i < 20; i++) {
                    const a = random(0, Math.PI * 2); const s = random(1, 3);
                    this.particles.push(new Particle(this.x, this.y, this.color, { x: Math.cos(a) * s, y: Math.sin(a) * s }));
                }
            };
            this.particles.push(pearl);
        }

        this.particles.forEach(p => p.update());
        this.particles = this.particles.filter(p => !p.dead);
        if (this.shots === 0 && this.particles.length === 0) this.dead = true;
    }
    draw() {
        this.particles.forEach(p => p.draw());
    }
}

// Reuse previous standard classes
class StandardFirework extends FireworkBase {
    explode() {
        super.explode();
        const color = `hsl(${random(0, 360)}, 100%, 60%)`;
        for (let i = 0; i < 80; i++) {
            const angle = random(0, Math.PI * 2); const speed = random(1, 6);
            this.particles.push(new Particle(this.x, this.y, color, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }));
        }
    }
}

class WillowFirework extends FireworkBase {
    explode() {
        this.exploded = true;
        soundManager.play('heavy_boom', { rate: 0.8 });
        for (let i = 0; i < 60; i++) {
            const angle = random(0, Math.PI * 2); const speed = random(1, 4);
            this.particles.push(new Particle(this.x, this.y, '#FFD700', { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, {
                friction: 0.92, gravity: 0.02, decay: 0.005, flicker: true
            }));
        }
    }
}

// "Golden Horse" Class - A galloping shape made of particles
class GoldenHorse {
    constructor() {
        this.particles = [];
        this.centerX = -200;
        this.centerY = canvasHeight * 0.5;
        this.speed = 5;
        this.active = false;
        this.frame = 0;
    }

    start() {
        this.active = true;
        this.centerX = -200;
        this.particles = [];
        this.frame = 0;
    }

    update() {
        if (!this.active) return;
        this.centerX += this.speed;
        this.centerY = canvasHeight * 0.5 + Math.sin(this.frame * 0.1) * 30;
        this.frame++;

        const shapeOffsets = [
            { x: 40, y: -30 }, { x: 35, y: -20 }, { x: 20, y: -10 },
            { x: 0, y: 0 }, { x: 20, y: 0 }, { x: -20, y: 0 },
            { x: -30, y: 5 },
            { x: 10 + Math.sin(this.frame * 0.2) * 20, y: 30 },
            { x: -10 - Math.sin(this.frame * 0.2) * 20, y: 30 }
        ];

        if (this.frame % 2 === 0) {
            shapeOffsets.forEach(offset => {
                this.particles.push(new Particle(
                    this.centerX + offset.x + random(-2, 2),
                    this.centerY + offset.y + random(-2, 2),
                    Math.random() > 0.3 ? '#FFD700' : '#FFA500',
                    { x: random(-2, -0.5), y: random(-0.5, 0.5) },
                    { decay: 0.05, flicker: true }
                ));
            });
        }

        if (this.centerX > canvasWidth + 200) this.active = false;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].velocity.x *= 0.9;
            this.particles[i].x += this.particles[i].velocity.x;
            this.particles[i].y += this.particles[i].velocity.y;
            this.particles[i].alpha -= 0.02;
            if (this.particles[i].alpha <= 0) this.particles.splice(i, 1);
        }
    }

    draw() {
        if (!this.active && this.particles.length === 0) return;
        this.particles.forEach(p => p.draw());
    }
}

// --- Main Loop ---

let fireworks = []; // Holds all active objects (Fireworks, RomanCandles, Firecrackers)
let goldenHorse = new GoldenHorse();

function animate() {
    requestAnimationFrame(animate);
    ctx.fillStyle = 'rgba(5, 0, 0, 0.2)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Update all
    fireworks = fireworks.filter(f => !f.dead);
    fireworks.forEach(f => {
        f.update();
        f.draw();
    });

    goldenHorse.update();
    goldenHorse.draw();

    // Random Auto Launch
    if (Math.random() < 0.02) {
        launchRandom(random(100, canvasWidth - 100), random(100, canvasHeight / 2));
    }

    // Horse
    if (!goldenHorse.active && Math.random() < 0.002) goldenHorse.start();
}

function launchRandom(targetX, targetY) {
    const r = Math.random();
    const startX = random(canvasWidth * 0.2, canvasWidth * 0.8);

    if (r < 0.3) {
        soundManager.play('launch');
        fireworks.push(new StandardFirework(startX, canvasHeight, targetX, targetY));
    } else if (r < 0.5) {
        soundManager.play('launch');
        fireworks.push(new WillowFirework(startX, canvasHeight, targetX, targetY));
    } else if (r < 0.65) {
        soundManager.play('launch');
        fireworks.push(new SpinnerFirework(startX, canvasHeight, targetX, targetY));
    } else if (r < 0.8) {
        soundManager.play('launch', { rate: 1.2 });
        fireworks.push(new CrossetteFirework(startX, canvasHeight, targetX, targetY));
    } else if (r < 0.9) {
        // Firecrackers (Ground)
        fireworks.push(new FirecrackerString(random(100, canvasWidth - 100)));
    } else {
        // Roman Candle
        fireworks.push(new RomanCandle(random(100, canvasWidth - 100)));
    }
}

// Interaction
canvas.addEventListener('click', (e) => {
    launchRandom(e.clientX, e.clientY);
    soundManager.ctx.resume(); // Ensure audio context is running
    showRandomGreeting();
});

let lastMove = 0;
canvas.addEventListener('mousemove', (e) => {
    if (Date.now() - lastMove > 200) {
        // Mouse move only launches standard shells for performance and visual clarity
        soundManager.play('launch', { volume: 0.3, rate: 1.5 });
        fireworks.push(new StandardFirework(random(canvasWidth * 0.2, canvasWidth * 0.8), canvasHeight, e.clientX, e.clientY));
        lastMove = Date.now();
    }
});

// Greetings
const greetings = [
    "新年快乐", "万事如意", "马到成功", "恭喜发财", "大吉大利", "岁岁平安",
    "金马迎春", "龙马精神", "一马当先", "万马奔腾", "鹏程万里", "财源广进",
    "心想事成", "五福临门", "吉星高照", "年年有余", "步步高升", "喜气洋洋",
    "合家欢乐", "身体健康", "国泰民安", "风调雨顺", "吉祥如意", "笑口常开"
];
const greetingEl = document.getElementById('dynamic-greeting');
function showRandomGreeting() {
    if (!greetingEl) return;
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    greetingEl.innerText = text;
    greetingEl.classList.remove('show');
    void greetingEl.offsetWidth;
    greetingEl.classList.add('show');
}

// Firecracker Button
const firecrackerBtn = document.getElementById('firecrackerBtn');
if (firecrackerBtn) {
    firecrackerBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent launching a firework at button location
        soundManager.ctx.resume();
        // Spawn a string of firecrackers at random x
        fireworks.push(new FirecrackerString(random(100, canvasWidth - 100)));
    });
}

// Music


animate();
