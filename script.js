const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const STATES = { TITLE: 0, INSTRUCTIONS: 1, SELECT: 2, PLAYING: 3, PAUSED: 4, VICTORY: 5 };
let currentState = STATES.TITLE;

const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Escape' && (currentState === STATES.PLAYING || currentState === STATES.PAUSED)) {
        togglePause();
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

// DEFINIÇÃO DOS PERSONAGENS COM ATAQUES E ATRIBUTOS ÚNICOS
const CHARACTERS = [
    { 
        name: 'KAI', 
        color: '#ffaa00', 
        weapon: 'Skate de Grafite', 
        speed: 6.5, 
        weight: 1.0, 
        isSkate: true,
        desc: 'Ataques rápidos e giros de skate'
    },
    { 
        name: 'EMBER', 
        color: '#ff0055', 
        weapon: 'Lança Voadora', 
        speed: 7.5, 
        weight: 0.8, 
        isSkate: false,
        desc: 'Estocadas rápidas de longo alcance'
    },
    { 
        name: 'TITAN', 
        color: '#00f0ff', 
        weapon: 'Skate Robótico', 
        speed: 4.8, 
        weight: 1.4, 
        isSkate: true,
        desc: 'Golpes pesados e ondas de choque'
    },
    { 
        name: 'NYX', 
        color: '#a000ff', 
        weapon: 'Chakram Sombras', 
        speed: 6.0, 
        weight: 0.9, 
        isSkate: false,
        desc: 'Projéteis sombrios e lâminas de energia'
    }
];

let p1Selection = 0;
let p2Selection = 2;
let p1Ready = false;
let p2Ready = false;

const camera = {
    x: 0, y: 0, zoom: 1,
    update(p1, p2) {
        if (!p1 || !p2) return;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        
        this.zoom = Math.max(0.6, Math.min(1.0, 700 / (dist + 300)));
        this.x = (1280 / 2) - midX * this.zoom;
        this.y = (720 / 2) - midY * this.zoom;
    }
};

class Platform {
    constructor(x, y, w, h, isSemi = false) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.isSemi = isSemi;
    }
    draw() {
        ctx.fillStyle = this.isSemi ? '#1f2438' : '#121526';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = this.isSemi ? '#00f0ff' : '#ff0055';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
}

const platforms = [
    new Platform(-400, 450, 1600, 80),
    new Platform(-250, 250, 350, 20, true),
    new Platform(700, 250, 350, 20, true),
    new Platform(200, 100, 400, 20, true)
];

class WeaponCrate {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.w = 30; this.h = 30;
        this.active = true;
    }
    draw() {
        if (!this.active) return;
        ctx.fillStyle = '#f1c40f';
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(this.x, this.y, this.w, this.h);
    }
}

class Projectile {
    constructor(x, y, vx, vy, color, owner, damage = 14) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.color = color;
        this.owner = owner;
        this.damage = damage;
        this.active = true;
        this.radius = 12;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (Math.abs(this.x) > 1500 || Math.abs(this.y) > 1000) this.active = false;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.color = color;
        this.life = 1.0;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.04;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillRect(this.x, this.y, 6, 6);
        ctx.globalAlpha = 1.0;
    }
}

let weaponCrates = [];
let projectiles = [];
let particles = [];

function createImpactVFX(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

class Player {
    constructor(id, charData, x, controls) {
        this.id = id;
        this.charData = charData;
        this.x = x; this.y = 200;
        this.vx = 0; this.vy = 0;
        this.w = 30; this.h = 60;
        this.controls = controls;
        
        this.damage = 0;
        this.facing = id === 1 ? 1 : -1;
        this.grounded = false;
        this.hasWeapon = false;
        
        // Pulo Duplo
        this.maxJumps = 2;
        this.jumpsLeft = 2;
        this.jumpKeyPressed = false;

        // Sistema de Esquiva
        this.isDodging = false;
        this.dodgeTimer = 0;
        this.dodgeCooldown = 0;
        this.dodgeDuration = 18; // Duração do i-frame em frames
        this.dodgeSpeed = 11;

        this.inMount = true;
        this.mountTimer = 180;
        
        this.hitstun = 0;
        this.attackCooldown = 0;
        this.isAttacking = false;
        this.attackBox = null;
    }

    update() {
        if (this.hitstun > 0) {
            this.hitstun--;
            this.x += this.vx;
            this.y += this.vy;
            this.vy += 0.3;
            return;
        }

        if (this.inMount) {
            this.vy = 0;
            this.vx = 0;
            this.y = Math.min(200, this.y + 2);
            this.mountTimer--;
            
            if (keys[this.controls.left] || keys[this.controls.right] || keys[this.controls.up] || keys[this.controls.attack]) {
                this.inMount = false;
            }
            return;
        }

        // Atualizar Timers de Esquiva
        if (this.dodgeCooldown > 0) this.dodgeCooldown--;
        if (this.dodgeTimer > 0) {
            this.dodgeTimer--;
            if (this.dodgeTimer === 0) {
                this.isDodging = false;
            }
        }

        // Lógica de Ativação da Esquiva
        const dodgePressed = keys[this.controls.dodge] || (this.controls.dodgeAlt && keys[this.controls.dodgeAlt]);
        if (dodgePressed && this.dodgeCooldown === 0 && !this.isDodging) {
            this.isDodging = true;
            this.dodgeTimer = this.dodgeDuration;
            this.dodgeCooldown = 45; // Tempo entre esquivas
            
            // Direção do impulso de esquiva
            let dir = this.facing;
            if (keys[this.controls.left]) dir = -1;
            if (keys[this.controls.right]) dir = 1;
            
            this.vx = dir * this.dodgeSpeed;
            this.vy = -1; // Leve sustentação no ar
            createImpactVFX(this.x + this.w/2, this.y + this.h/2, '#00f0ff');
        }

        // Movimentação Normal (bloqueada durante a esquiva para manter o impulso)
        if (!this.isDodging) {
            if (keys[this.controls.left]) {
                this.vx = -this.charData.speed;
                this.facing = -1;
            } else if (keys[this.controls.right]) {
                this.vx = this.charData.speed;
                this.facing = 1;
            } else {
                this.vx *= 0.8;
            }

            // Pulo Duplo
            if (keys[this.controls.up]) {
                if (!this.jumpKeyPressed && this.jumpsLeft > 0) {
                    this.vy = -12;
                    this.jumpsLeft--;
                    this.grounded = false;
                    this.jumpKeyPressed = true;
                    createImpactVFX(this.x + this.w/2, this.y + this.h, '#fff');
                }
            } else {
                this.jumpKeyPressed = false;
            }
        }

        this.vy += 0.5;
        this.x += this.vx;
        this.y += this.vy;

        // Colisões com Plataformas
        this.grounded = false;
        platforms.forEach(p => {
            if (this.x + this.w > p.x && this.x < p.x + p.w) {
                if (this.y + this.h >= p.y && this.y + this.h <= p.y + p.h + this.vy && this.vy >= 0) {
                    if (!p.isSemi || !keys[this.controls.down]) {
                        this.y = p.y - this.h;
                        this.vy = 0;
                        this.grounded = true;
                        this.jumpsLeft = this.maxJumps;
                    }
                }
            }
        });

        // Coleta de Armas
        weaponCrates.forEach(crate => {
            if (crate.active && Math.hypot(this.x - crate.x, this.y - crate.y) < 40) {
                if (keys[this.controls.attack]) {
                    this.hasWeapon = true;
                    crate.active = false;
                    createImpactVFX(crate.x, crate.y, '#f1c40f');
                }
            }
        });

        if (this.attackCooldown > 0) this.attackCooldown--;
        
        if (this.attackCooldown === 0 && !this.isDodging) {
            if (keys[this.controls.attack]) {
                this.performAttack(false);
            } else if (keys[this.controls.special]) {
                this.performAttack(true);
            }
        }

        if (Math.abs(this.x) > 1200 || this.y > 900 || this.y < -800) {
            this.respawn();
        }
    }

    performAttack(isSpecial) {
        this.attackCooldown = isSpecial ? 40 : 20;
        this.isAttacking = true;

        const charName = this.charData.name;
        let range = 50;
        let dmg = 10;
        let kbForce = 8;
        let boxY = this.y + 10;
        let boxH = 40;

        if (!isSpecial) {
            switch (charName) {
                case 'KAI':
                    range = this.hasWeapon ? 85 : 60;
                    dmg = 11;
                    kbForce = 7;
                    break;
                case 'EMBER':
                    range = this.hasWeapon ? 110 : 70;
                    dmg = 9;
                    kbForce = 9;
                    boxY = this.y + 20;
                    boxH = 20;
                    break;
                case 'TITAN':
                    range = this.hasWeapon ? 70 : 50;
                    dmg = 16;
                    kbForce = 12;
                    break;
                case 'NYX':
                    range = this.hasWeapon ? 90 : 65;
                    dmg = 12;
                    kbForce = 8;
                    break;
            }
        } else {
            switch (charName) {
                case 'KAI':
                    range = 90;
                    dmg = 18;
                    kbForce = 14;
                    projectiles.push(new Projectile(this.x + this.w/2, this.y + 20, this.facing * 14, 0, '#ffaa00', this, 15));
                    break;
                case 'EMBER':
                    range = 120;
                    dmg = 20;
                    kbForce = 16;
                    this.vx = this.facing * 12;
                    break;
                case 'TITAN':
                    range = 100;
                    dmg = 24;
                    kbForce = 18;
                    boxY = this.y + 30;
                    boxH = 50;
                    createImpactVFX(this.x + (this.facing * 40), this.y + 50, '#00f0ff');
                    break;
                case 'NYX':
                    range = 70;
                    dmg = 16;
                    kbForce = 12;
                    projectiles.push(new Projectile(this.x + this.w/2, this.y + 10, this.facing * 10, -2, '#a000ff', this, 18));
                    break;
            }
        }

        const kb = kbForce * (1 + (this.damage / 80) / this.charData.weight);

        this.attackBox = {
            x: this.facing === 1 ? this.x + this.w : this.x - range,
            y: boxY,
            w: range,
            h: boxH,
            damage: dmg,
            knockback: kb
        };

        setTimeout(() => { this.attackBox = null; this.isAttacking = false; }, 150);
    }

    respawn() {
        createImpactVFX(this.x, this.y, '#ff0055');
        this.x = this.id === 1 ? -100 : 100;
        this.y = -200;
        this.vx = 0; this.vy = 0;
        this.damage = 0;
        this.hasWeapon = false;
        this.inMount = true;
        this.mountTimer = 180;
        this.jumpsLeft = this.maxJumps;
        this.isDodging = false;
    }

    draw() {
        ctx.save();
        
        // Efeito Visual de Esquiva (Transparência/Fantasma)
        if (this.isDodging) {
            ctx.globalAlpha = 0.4;
        }

        if (this.inMount) {
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.ellipse(this.x + this.w/2, this.y + this.h + 10, 30, 10, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = this.charData.color;
        ctx.fillRect(this.x + 5, this.y, 20, 20);
        ctx.fillRect(this.x + 2, this.y + 20, 26, 25);
        ctx.fillRect(this.x + 4, this.y + 45, 8, 15);
        ctx.fillRect(this.x + 18, this.y + 45, 8, 15);

        if (this.hasWeapon || this.charData.isSkate) {
            ctx.fillStyle = '#eee';
            const weaponX = this.facing === 1 ? this.x + 20 : this.x - 15;
            ctx.fillRect(weaponX, this.y + 25, 25, 8);
        }

        if (this.attackBox) {
            ctx.fillStyle = 'rgba(255, 0, 85, 0.5)';
            ctx.fillRect(this.attackBox.x, this.attackBox.y, this.attackBox.w, this.attackBox.h);
        }

        ctx.restore();
    }
}

let p1 = null;
let p2 = null;
let matchTimer = 180;
let timerInterval = null;

function initGame() {
    p1 = new Player(1, CHARACTERS[p1Selection], -200, {
        left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', attack: 'KeyF', special: 'KeyG', dodge: 'KeyE', dodgeAlt: 'ShiftLeft'
    });
    p2 = new Player(2, CHARACTERS[p2Selection], 200, {
        left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', attack: 'KeyK', special: 'KeyL', dodge: 'ShiftRight', dodgeAlt: 'KeyM'
    });

    document.getElementById('p1-hud-name').innerText = `P1: ${p1.charData.name}`;
    document.getElementById('p2-hud-name').innerText = `P2: ${p2.charData.name}`;

    projectiles = [];
    particles = [];
    weaponCrates = [new WeaponCrate(0, -100)];

    matchTimer = 180;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
    if (currentState === STATES.PLAYING && matchTimer > 0) {
        matchTimer--;
        const mins = String(Math.floor(matchTimer / 60)).padStart(2, '0');
        const secs = String(matchTimer % 60).padStart(2, '0');
        document.getElementById('hud-timer').innerText = `${mins}:${secs}`;
        
        if (matchTimer === 0) {
            let winText = "EMPATE!";
            if (p1.damage < p2.damage) winText = "JOGADOR 1 VENCEU!";
            else if (p2.damage < p1.damage) winText = "JOGADOR 2 VENCEU!";
            document.getElementById('victory-text').innerText = winText;
            setScreen(STATES.VICTORY);
        }
    }
}

function spawnWeaponCrate() {
    if (currentState === STATES.PLAYING) {
        weaponCrates = [new WeaponCrate((Math.random() - 0.5) * 600, -200)];
    }
}
setInterval(spawnWeaponCrate, 15000);

const screens = {
    title: document.getElementById('screen-title'),
    instructions: document.getElementById('screen-instructions'),
    select: document.getElementById('screen-select'),
    pause: document.getElementById('screen-pause'),
    victory: document.getElementById('screen-victory'),
    hud: document.getElementById('hud')
};

function setScreen(state) {
    currentState = state;
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens.hud.style.display = 'none';

    if (state === STATES.TITLE) screens.title.classList.add('active');
    if (state === STATES.INSTRUCTIONS) screens.instructions.classList.add('active');
    if (state === STATES.SELECT) screens.select.classList.add('active');
    if (state === STATES.PAUSED) screens.pause.classList.add('active');
    if (state === STATES.VICTORY) screens.victory.classList.add('active');
    if (state === STATES.PLAYING) screens.hud.style.display = 'block';
}

function togglePause() {
    if (currentState === STATES.PLAYING) setScreen(STATES.PAUSED);
    else if (currentState === STATES.PAUSED) setScreen(STATES.PLAYING);
}

document.getElementById('btn-play').onclick = () => setScreen(STATES.SELECT);
document.getElementById('btn-how').onclick = () => setScreen(STATES.INSTRUCTIONS);
document.getElementById('btn-back-inst').onclick = () => setScreen(STATES.TITLE);
document.getElementById('btn-resume').onclick = () => setScreen(STATES.PLAYING);
document.getElementById('btn-restart').onclick = () => { initGame(); setScreen(STATES.PLAYING); };
document.getElementById('btn-menu').onclick = () => setScreen(STATES.TITLE);
document.getElementById('btn-rematch').onclick = () => { initGame(); setScreen(STATES.PLAYING); };
document.getElementById('btn-reselect').onclick = () => setScreen(STATES.SELECT);
document.getElementById('btn-victory-menu').onclick = () => setScreen(STATES.TITLE);

function handleSelectionInput() {
    if (currentState !== STATES.SELECT) return;

    if (keys['KeyA']) { p1Selection = (p1Selection - 1 + 4) % 4; keys['KeyA'] = false; }
    if (keys['KeyD']) { p1Selection = (p1Selection + 1) % 4; keys['KeyD'] = false; }
    if (keys['KeyF']) { p1Ready = true; keys['KeyF'] = false; }

    if (keys['ArrowLeft']) { p2Selection = (p2Selection - 1 + 4) % 4; keys['ArrowLeft'] = false; }
    if (keys['ArrowRight']) { p2Selection = (p2Selection + 1) % 4; keys['ArrowRight'] = false; }
    if (keys['KeyK']) { p2Ready = true; keys['KeyK'] = false; }

    document.querySelectorAll('.char-card').forEach((card, idx) => {
        card.className = 'char-card';
        if (p1Selection === idx && p2Selection === idx) card.classList.add('both-hover');
        else if (p1Selection === idx) card.classList.add('p1-hover');
        else if (p2Selection === idx) card.classList.add('p2-hover');
    });

    if (p1Ready && p2Ready) {
        p1Ready = false; p2Ready = false;
        initGame();
        setScreen(STATES.PLAYING);
    }
}

function checkCombat(attacker, defender) {
    if (attacker && defender && attacker.attackBox) {
        // Se o defensor estiver esquivando, ignora o acerto (Invulnerável)
        if (defender.isDodging) return;

        const box = attacker.attackBox;
        if (box.x < defender.x + defender.w && box.x + box.w > defender.x &&
            box.y < defender.y + defender.h && box.y + box.h > defender.y) {
            
            defender.damage += box.damage;
            defender.hitstun = 15;
            defender.vx = attacker.facing * box.knockback;
            defender.vy = -box.knockback * 0.5;
            
            createImpactVFX(defender.x, defender.y, '#ff0055');
            attacker.attackBox = null;
        }
    }
}

function gameLoop() {
    handleSelectionInput();

    ctx.fillStyle = '#0d0e15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentState === STATES.PLAYING && p1 && p2) {
        p1.update();
        p2.update();

        checkCombat(p1, p2);
        checkCombat(p2, p1);

        projectiles.forEach(p => {
            p.update();
            const target = p.owner === p1 ? p2 : p1;
            
            // Checar colisão de projétil respeitando a esquiva do defensor
            if (target && !target.isDodging && Math.hypot(p.x - target.x, p.y - target.y) < p.radius + 20) {
                target.damage += p.damage;
                target.hitstun = 14;
                target.vx = Math.sign(p.vx) * 11;
                target.vy = -6;
                p.active = false;
                createImpactVFX(p.x, p.y, p.color);
            }
        });
        projectiles = projectiles.filter(p => p.active);

        particles.forEach(p => p.update());
        particles = particles.filter(p => p.life > 0);

        camera.update(p1, p2);

        document.getElementById('p1-hud-damage').innerText = `${Math.floor(p1.damage)}%`;
        document.getElementById('p2-hud-damage').innerText = `${Math.floor(p2.damage)}%`;
        document.getElementById('p1-hud-status').innerText = p1.isDodging ? 'ESQUIVANDO!' : (p1.hasWeapon ? p1.charData.weapon : 'DESARMADO');
        document.getElementById('p2-hud-status').innerText = p2.isDodging ? 'ESQUIVANDO