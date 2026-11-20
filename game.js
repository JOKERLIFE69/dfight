$(document).ready(function () {
    const state = {
        phase: 'START_SCREEN',
        playerHP: 100,
        playerMaxHP: 100,
        defending: false,
        bossHP: 500,
        bossMaxHP: 500,
        mercyProgress: 0,
        selectedBtnIndex: 0,
        selectedSubIndex: 0,
        subOptions: [],
        turnCount: 0,
        items: [
            { name: 'Горячий плов', heal: 50, desc: 'Восстанавливает 50 HP. Ароматный и рассыпчатый!' },
            { name: 'Шоколадка', heal: 35, desc: 'Восстанавливает 35 HP.' },
            { name: 'Чай с лимоном', heal: 25, desc: 'Восстанавливает 25 HP.' }
        ]
    };

    // Вспомогательная функция для предзагрузки аудио
    function createPreloadedAudio(src, volume = 0.5, loop = false) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.volume = volume;
        audio.loop = loop;
        audio.src = src;
        audio.load();
        return audio;
    }

    // Аудиофайлы и видео концовки с предзагрузкой
    const introAudio = createPreloadedAudio('intro.mp3', 0.7, false);
    const bgm = createPreloadedAudio('game.mp3', 0.4, true);
    const bossVoice = createPreloadedAudio('dasha_voice.mp3', 0.5, false);
    const hitSound = createPreloadedAudio('hit.mp3', 0.6, false);
    const victorySound = createPreloadedAudio('victory.wav', 0.75, false);

    const endingVideo = document.getElementById('ending-video');
    endingVideo.preload = 'auto';
    endingVideo.src = 'ending.mp4';
    endingVideo.volume = 0.85;
    endingVideo.load();

    // Предзагрузка спрайтов, чтобы при интро и бою не было рывков
    ['player.png', 'boss.png'].forEach((imgSrc) => {
        const img = new Image();
        img.src = imgSrc;
    });

    function warmUpAllMedia() {
        [introAudio, bgm, bossVoice, hitSound, victorySound].forEach((media) => {
            if (media.readyState < 2) {
                media.load();
            }
        });
        if (endingVideo.readyState < 2) {
            endingVideo.load();
        }
    }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playBeep(freq = 440, duration = 0.06, type = 'square') {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playFallbackVictoryFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
            setTimeout(() => playBeep(freq, 0.18, 'triangle'), idx * 140);
        });
    }

    // Запуск концовки ending.mp4 после звука победы
    let endingStarted = false;
    function playEndingVideo() {
        if (endingStarted) return;
        endingStarted = true;

        $('#ending-overlay').css('display', 'flex').hide().fadeIn(400);
        endingVideo.currentTime = 0;
        endingVideo.play().catch(err => console.log('Ошибка воспроизведения ending.mp4:', err));
    }

    function triggerVictory(finalMessage) {
        if (state.phase === 'GAMEOVER') return;
        state.phase = 'GAMEOVER';

        bgm.pause();
        bossVoice.pause();
        $('#dodge-box, #boss-speech, #mobile-controls, #sub-menu, #attack-meter').hide();
        showDialog(finalMessage);

        let videoTimer = null;
        const scheduleEnding = (delayMs) => {
            clearTimeout(videoTimer);
            videoTimer = setTimeout(playEndingVideo, delayMs);
        };

        victorySound.onended = () => {
            clearTimeout(videoTimer);
            playEndingVideo();
        };

        victorySound.currentTime = 0;
        victorySound.play().then(() => {
            const durationMs = Number.isFinite(victorySound.duration) && victorySound.duration > 0
                ? victorySound.duration * 1000
                : 2500;
            scheduleEnding(durationMs);
        }).catch(() => {
            playFallbackVictoryFanfare();
            scheduleEnding(1800);
        });
    }

    // === СТАРТОВОЕ МЕНЮ И ИНТРО ===
    let introFinished = false;

    function finishIntroAndStartGame() {
        if (introFinished) return;
        introFinished = true;

        $('#intro-overlay').fadeOut(800, function () {
            state.phase = 'MENU';
            bgm.play().catch(err => console.log('Ошибка запуска game.mp3:', err));
            showDialog('* Даша ждет.');
        });
    }

    $('#start-btn').on('click touchend', function (e) {
        e.preventDefault();
        if (state.phase !== 'START_SCREEN') return;
        state.phase = 'INTRO';

        warmUpAllMedia();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        playBeep(660, 0.1);

        $(this).fadeOut(300, function () {
            $('#intro-boss-container').show();
            setTimeout(() => {
                $('#intro-boss-container').addClass('reveal');
            }, 50);

            introAudio.play().then(() => {
                introAudio.onended = finishIntroAndStartGame;
            }).catch(() => {
                setTimeout(finishIntroAndStartGame, 9000);
            });

            // Резкое исчезновение Даши на 6.5 сек (при необходимости поменяй 6500)
            setTimeout(() => {
                if (introFinished) return;
                $('#intro-boss-container').removeClass('reveal').addClass('hide');
            }, 6500);
        });
    });

    function initHearts() {
        const $row = $('#hearts-row').empty();
        for (let i = 0; i < 10; i++) {
            $row.append('<span class="heart-icon">❤</span>');
        }
    }

    function updateHUD() {
        state.playerHP = Math.max(0, Math.min(state.playerMaxHP, state.playerHP));
        $('#hp-text').text(`${state.playerHP} / ${state.playerMaxHP}`);
        $('#hp-bar-fill').css('width', `${(state.playerHP / state.playerMaxHP) * 100}%`);

        const activeHearts = Math.ceil((state.playerHP / state.playerMaxHP) * 10);
        $('.heart-icon').each(function (idx) {
            $(this).toggleClass('lost', idx >= activeHearts);
        });

        const bossPct = Math.max(0, (state.bossHP / state.bossMaxHP) * 100);
        $('#boss-hp-bar').css('width', `${bossPct}%`);

        if (state.mercyProgress >= 100) {
            $('.act-btn[data-action="mercy"]').addClass('mercy-ready');
        }
    }

    let typeTimer = null;
    function showDialog(text, callback) {
        clearInterval(typeTimer);
        $('#sub-menu, #attack-meter').hide();
        $('#dialog-text').show().text('');
        let i = 0;
        typeTimer = setInterval(() => {
            $('#dialog-text').append(text[i]);
            if (text[i] !== ' ') playBeep(320, 0.03);
            i++;
            if (i >= text.length) {
                clearInterval(typeTimer);
                if (callback) callback();
            }
        }, 25);
    }

    function selectActionBtn(index) {
        const btns = $('.act-btn');
        state.selectedBtnIndex = (index + btns.length) % btns.length;
        btns.removeClass('selected').eq(state.selectedBtnIndex).addClass('selected');
        playBeep(520, 0.04);
    }

    $('.act-btn').on('mouseenter click', function (e) {
        if (state.phase !== 'MENU') return;
        const idx = $(this).index();
        selectActionBtn(idx);
        if (e.type === 'click') confirmAction();
    });

    function confirmAction() {
        const action = $('.act-btn').eq(state.selectedBtnIndex).data('action');
        state.defending = false;
        playBeep(660, 0.07);

        if (action === 'fight') {
            startAttackMinigame();
        } else if (action === 'act') {
            openSubMenu([
                { label: 'Осмотреть', action: () => {
                    state.phase = 'DIALOG';
                    showDialog('* ДАША — ATK 18 DEF 12. Выглядит грозно, но явно не против перекусить.', () => setTimeout(startBossTurn, 1400));
                }},
                { label: 'Похвалить', action: () => {
                    state.mercyProgress += 50;
                    updateHUD();
                    state.phase = 'DIALOG';
                    showDialog('* Вы сделали Даше искренний комплимент! Она смутилась', () => setTimeout(startBossTurn, 1500));
                }},
                { label: 'Дать ей плов', action: () => {
                    state.mercyProgress += 50;
                    updateHUD();
                    state.phase = 'DIALOG';
                    showDialog('* Вы протянули тарелку горячего плова! Даша в восторге, а может и нет...', () => setTimeout(startBossTurn, 1500));
                }},
                { label: 'Назад', action: () => returnToMenu() }
            ]);
        } else if (action === 'item') {
            if (state.items.length === 0) {
                state.phase = 'DIALOG';
                showDialog('* Рюкзак пуст!', () => setTimeout(returnToMenu, 1000));
                return;
            }
            const opts = state.items.map((item, idx) => ({
                label: `${item.name} (+${item.heal})`,
                action: () => {
                    state.playerHP += item.heal;
                    state.items.splice(idx, 1);
                    updateHUD();
                    playBeep(880, 0.15, 'sine');
                    state.phase = 'DIALOG';
                    showDialog(`* Вы съели: ${item.name}! Восстановлено ${item.heal} HP.`, () => setTimeout(startBossTurn, 1400));
                }
            }));
            opts.push({ label: 'Назад', action: () => returnToMenu() });
            openSubMenu(opts);
        } else if (action === 'mercy') {
            if (state.mercyProgress >= 100) {
                $('#boss-wrapper').fadeOut(600);
                triggerVictory('* ВЫ ПОЩАДИЛИ ДАШУ! Ваши комплименты остановили в ней сердце...');
            } else {
                state.phase = 'DIALOG';
                showDialog(`* Даша еще не готова сдаться (Готовность: ${state.mercyProgress}%).`, () => setTimeout(startBossTurn, 1400));
            }
        } else if (action === 'defend') {
            state.defending = true;
            state.phase = 'DIALOG';
            showDialog('* Вы встали в защитную стойку! Урон в этот ход снижен вдвое.', () => setTimeout(startBossTurn, 1200));
        }
    }

    function openSubMenu(options) {
        state.phase = 'SUBMENU';
        state.subOptions = options;
        state.selectedSubIndex = 0;
        $('#dialog-text').hide();
        const $sub = $('#sub-menu').empty().css('display', 'grid');

        options.forEach((opt, i) => {
            const $el = $(`<div class="sub-option ${i === 0 ? 'active' : ''}">${opt.label}</div>`);
            $el.on('mouseenter click', function (e) {
                state.selectedSubIndex = i;
                $('.sub-option').removeClass('active').eq(i).addClass('active');
                if (e.type === 'click') opt.action();
            });
            $sub.append($el);
        });
    }

    function returnToMenu() {
        state.phase = 'MENU';
        $('#sub-menu, #attack-meter').hide();
        showDialog('* Ваш ход. Выберите действие.');
    }

    // === МИНИ-ИГРА АТАКИ ===
    let attackAnim = null;
    let cursorPos = 0;

    function startAttackMinigame() {
        state.phase = 'ATTACKING';
        $('#dialog-text').hide();
        $('#attack-meter').show();
        cursorPos = 0;
        const meterWidth = $('#attack-meter').width();

        attackAnim = setInterval(() => {
            cursorPos += 14;
            $('#attack-cursor').css('left', cursorPos + 'px');
            if (cursorPos >= meterWidth) {
                finishAttack(0);
            }
        }, 16);
    }

    function finishAttack(pos) {
        clearInterval(attackAnim);
        const meterWidth = $('#attack-meter').width();
        const center = meterWidth / 2;
        const dist = Math.abs(pos - center);

        let damage = 0;
        if (pos > 0) {
            const accuracy = Math.max(0.2, 1 - dist / center);
            damage = Math.round(95 * accuracy);
        }

        $('#player-wrapper').addClass('attack-lunge');
        setTimeout(() => $('#player-wrapper').removeClass('attack-lunge'), 200);

        if (damage > 0) {
            state.bossHP -= damage;
            $('#boss-wrapper').addClass('hurt-shake');
            hitSound.currentTime = 0;
            hitSound.play().catch(err => {});
            setTimeout(() => $('#boss-wrapper').removeClass('hurt-shake'), 300);
        } else {
            playBeep(200, 0.1);
        }

        updateHUD();
        $('#attack-meter').hide();

        if (state.bossHP <= 0) {
            $('#boss-wrapper').fadeOut(600);
            triggerVictory('* ДАША убита! ПОБЕДА!');
        } else {
            state.phase = 'DIALOG';
            const msg = damage > 0 ? `* Вы нанесли ${damage} урона!` : '* ПРОМАХ!';
            showDialog(msg, () => setTimeout(startBossTurn, 1200));
        }
    }

    $('#attack-meter').on('click touchend', function (e) {
        e.preventDefault();
        if (state.phase === 'ATTACKING') finishAttack(cursorPos);
    });

    // === ХОД БОССА (УКЛОНЕНИЕ В КОРОБКЕ) ===
    const canvas = document.getElementById('dodge-canvas');
    const ctx = canvas.getContext('2d');
    const keys = {};

    $(window).on('keydown', (e) => {
        keys[e.code] = true;

        if (state.phase === 'START_SCREEN') {
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
                $('#start-btn').trigger('click');
            }
        } else if (state.phase === 'MENU') {
            if (e.code === 'ArrowRight' || e.code === 'KeyD') selectActionBtn(state.selectedBtnIndex + 1);
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') selectActionBtn(state.selectedBtnIndex - 1);
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') confirmAction();
        } else if (state.phase === 'SUBMENU') {
            if (e.code === 'ArrowRight' || e.code === 'KeyD') {
                state.selectedSubIndex = (state.selectedSubIndex + 1) % state.subOptions.length;
                $('.sub-option').removeClass('active').eq(state.selectedSubIndex).addClass('active');
            }
            if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
                state.selectedSubIndex = (state.selectedSubIndex - 1 + state.subOptions.length) % state.subOptions.length;
                $('.sub-option').removeClass('active').eq(state.selectedSubIndex).addClass('active');
            }
            if (e.code === 'Escape' || e.code === 'KeyX') returnToMenu();
            if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
                state.subOptions[state.selectedSubIndex].action();
            }
        } else if (state.phase === 'ATTACKING') {
            if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') {
                finishAttack(cursorPos);
            }
        }
    });

    $(window).on('keyup', (e) => { keys[e.code] = false; });

    const bindTouchButton = (id, keyCode) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', (e) => { e.preventDefault(); keys[keyCode] = true; });
        el.addEventListener('touchend', (e) => { e.preventDefault(); keys[keyCode] = false; });
        el.addEventListener('mousedown', (e) => { e.preventDefault(); keys[keyCode] = true; });
        el.addEventListener('mouseup', (e) => { e.preventDefault(); keys[keyCode] = false; });
    };

    bindTouchButton('m-up', 'ArrowUp');
    bindTouchButton('m-down', 'ArrowDown');
    bindTouchButton('m-left', 'ArrowLeft');
    bindTouchButton('m-right', 'ArrowRight');

    function startBossTurn() {
        if (state.phase === 'GAMEOVER') return;
        state.phase = 'DODGING';
        state.turnCount++;

        const phrases = [
            'ТЫ РАЗБИЛ МНЕ СЕРДЦЕ!',
            'ПОПРОБУЙ УКЛОНИТЬСЯ ОТ ЭТОГО!',
            'Я ПОМНЮ ЭТИ 20 ПОДРУГ...',
            'Я ВСЁ ЕЩЁ ЖДУ СВОЙ ПЛОВ...',
            'НЕ ТАК БЫСТРО!',
            'ДЕРЖИ ГОРЯЧИЙ КОФЕ!'
        ];
        const chosenPhrase = phrases[state.turnCount % phrases.length];

        $('#boss-speech').text(chosenPhrase).fadeIn(200);

        bossVoice.currentTime = 0;
        bossVoice.play().catch(err => {});

        $('#dialog-text').text(`* Даша: "${chosenPhrase}"`);

        setTimeout(() => {
            if (state.phase !== 'DODGING') return;

            $('#dialog-text').text('* Уклоняйся от атак Даши!');
            $('#dodge-box').fadeIn(200);

            const isMobile = (navigator.maxTouchPoints > 0) || (window.innerWidth <= 980);
            if (isMobile) {
                $('#mobile-controls').show();
            }

            const soul = { x: 110, y: 110, r: 7, speed: 3.4, invuln: 0 };
            const bullets = [];
            let frames = 0;
            const maxFrames = 360;

            function spawnBullet() {
                const pattern = state.turnCount % 3;

                if (pattern === 1) {
                    bullets.push({
                        type: 'heart',
                        x: 15 + Math.random() * 190,
                        y: -12,
                        vx: (Math.random() - 0.5) * 1.4,
                        vy: 2.8 + Math.random() * 1.6,
                        size: 10
                    });
                } else if (pattern === 2) {
                    const fromLeft = Math.random() > 0.5;
                    bullets.push({
                        type: 'heart',
                        x: fromLeft ? -12 : 232,
                        y: 20 + Math.random() * 180,
                        vx: fromLeft ? 3.2 : -3.2,
                        vy: (Math.random() - 0.5) * 0.8,
                        size: 10
                    });
                } else {
                    bullets.push({
                        type: 'coffee',
                        x: 20 + Math.random() * 180,
                        y: -14,
                        vx: (Math.random() - 0.5) * 2.2,
                        vy: 2.5 + Math.random() * 1.4,
                        size: 12,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }

            function loop() {
                if (state.phase !== 'DODGING') return;
                frames++;

                if (keys['ArrowLeft'] || keys['KeyA']) soul.x -= soul.speed;
                if (keys['ArrowRight'] || keys['KeyD']) soul.x += soul.speed;
                if (keys['ArrowUp'] || keys['KeyW']) soul.y -= soul.speed;
                if (keys['ArrowDown'] || keys['KeyS']) soul.y += soul.speed;

                soul.x = Math.max(soul.r + 2, Math.min(canvas.width - soul.r - 2, soul.x));
                soul.y = Math.max(soul.r + 2, Math.min(canvas.height - soul.r - 2, soul.y));
                if (soul.invuln > 0) soul.invuln--;

                if (frames % 14 === 0) spawnBullet();

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                for (let i = bullets.length - 1; i >= 0; i--) {
                    const b = bullets[i];
                    b.x += b.vx;
                    b.y += b.vy;

                    if (b.type === 'coffee') {
                        b.phase += 0.12;
                        b.x += Math.sin(b.phase) * 0.9;
                        drawCoffeeMug(ctx, b.x, b.y, b.size);
                    } else {
                        drawBrokenHeart(ctx, b.x, b.y - 8, 18);
                    }

                    const dist = Math.hypot(soul.x - b.x, soul.y - b.y);
                    if (dist < soul.r + b.size * 0.7 && soul.invuln === 0) {
                        const dmg = state.defending ? 7 : 15;
                        state.playerHP -= dmg;
                        soul.invuln = 45;
                        playBeep(110, 0.25, 'sawtooth');
                        updateHUD();

                        if (state.playerHP <= 0) {
                            $('#dodge-box, #boss-speech, #mobile-controls').hide();
                            bossVoice.pause();
                            bgm.pause();
                            state.phase = 'GAMEOVER';
                            showDialog('* ВАША ДУША РАЗБИЛАСЬ...');
                            return;
                        }
                    }

                    if (b.x < -30 || b.x > 250 || b.y > 250) {
                        bullets.splice(i, 1);
                    }
                }

                if (soul.invuln % 6 < 3) {
                    drawHeart(ctx, soul.x, soul.y - 6, 14);
                }

                if (frames < maxFrames) {
                    requestAnimationFrame(loop);
                } else {
                    $('#dodge-box, #boss-speech').fadeOut(200);
                    $('#mobile-controls').hide();
                    bossVoice.pause();
                    returnToMenu();
                }
            }

            requestAnimationFrame(loop);

        }, 2000);
    }

    function drawHeart(ctx, x, y, size) {
        ctx.save();
        ctx.fillStyle = '#ff1e1e';
        ctx.beginPath();
        const topCurveHeight = size * 0.3;
        ctx.moveTo(x, y + topCurveHeight);
        ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
        ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 1.4, x, y + size);
        ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 1.4, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
        ctx.fill();
        ctx.restore();
    }

    function drawBrokenHeart(ctx, x, y, size) {
        ctx.save();
        ctx.fillStyle = '#ff2a7a';
        ctx.beginPath();
        const topCurveHeight = size * 0.3;
        ctx.moveTo(x, y + topCurveHeight);
        ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
        ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 1.4, x, y + size);
        ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 1.4, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
        ctx.fill();

        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + topCurveHeight);
        ctx.lineTo(x - 2.5, y + size * 0.48);
        ctx.lineTo(x + 2.5, y + size * 0.68);
        ctx.lineTo(x, y + size);
        ctx.stroke();
        ctx.restore();
    }

    function drawCoffeeMug(ctx, x, y, size) {
        ctx.save();
        const w = size * 1.3;
        const h = size * 1.1;
        const left = x - w / 2;
        const top = y - h / 2;

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(left + w, top + h * 0.5, h * 0.32, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        ctx.fillStyle = '#f5f5dc';
        ctx.strokeStyle = '#d2b48c';
        ctx.lineWidth = 2;
        ctx.fillRect(left, top, w, h);
        ctx.strokeRect(left, top, w, h);

        ctx.fillStyle = '#4b260d';
        ctx.fillRect(left + 2, top + 2, w - 4, 5);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 4, top - 3);
        ctx.quadraticCurveTo(x - 7, top - 8, x - 3, top - 12);
        ctx.moveTo(x + 4, top - 3);
        ctx.quadraticCurveTo(x + 1, top - 8, x + 5, top - 12);
        ctx.stroke();

        ctx.restore();
    }

    initHearts();
    updateHUD();
});
