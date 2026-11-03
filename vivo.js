/* =========================================================
   TU REMÍS EN VIVO
   Simulación del local de Madero Remises, vista desde arriba:
   - Lobby: máquina de café a la derecha de la entrada ($1.000)
     y sillas de colores (verde, roja, gris, azul).
   - Ventanilla: el operador toma el pedido y asigna el chofer
     más cercano.
   - Calle: el remís estaciona en la puerta y el pasajero sube.
   - Pantalla de la central: mapa con los móviles.
   Todo es HTML + canvas + JavaScript, sin librerías.
========================================================= */
(() => {
    'use strict';

    const cv = document.getElementById('vivo-canvas');
    const mapCv = document.getElementById('vivo-map');
    if (!cv || !mapCv) return;
    const ctx = cv.getContext('2d');
    const mctx = mapCv.getContext('2d');
    const $ = id => document.getElementById(id);
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- utilidades ---------- */
    const W = 600, H = 780;                 // mundo en unidades
    const TS = 20;                           // segundos reales del local por segundo de simulación
    const rnd = (a, b) => a + Math.random() * (b - a);
    const rint = (a, b) => Math.floor(rnd(a, b + 1));
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const angTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    const wpick = list => { const tot = list.reduce((s, x) => s + x.w, 0); let r = Math.random() * tot; for (const x of list) { r -= x.w; if (r <= 0) return x; } return list[0]; };
    function rrect(g, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + h, r);
        g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
    }
    function shade(hex, k) {
        const n = parseInt(hex.slice(1), 16);
        const f = v => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
        return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
    const FONT = 'Inter, system-ui, sans-serif';

    /* ---------- plano del local ---------- */
    const WALK_X = 336;                              // pasillo por donde se camina
    const OP_POS = { x: 300, y: 56 };                // operador, detrás del vidrio
    const SPOT = [160, 196, 230, 264].map(y => ({ x: 300, y }));   // fila de la ventanilla
    const MACH = { x: 550, y: 444, w: 34, h: 70 };   // máquina de café, a la derecha al entrar
    const MACH_FRONT = { x: 528, y: 479 };
    const MACH_WAIT = { x: 500, y: 540 };
    const DOOR_IN = { x: 300, y: 584 }, DOOR_OUT = { x: 300, y: 626 };
    const SIDE_Y = 638;                              // vereda
    const LANE_Y = 710, PARK_Y = 684, FAR_Y = 752;   // calle
    const STAND = { x: 470, y: 572 };                // si no hay sillas, esperan parados

    const CHAIR = { verde: '#2E9B5B', roja: '#D2433F', gris: '#8C96A3', azul: '#2D6FD1' };
    const CHAIR_ORDER = ['verde', 'roja', 'gris', 'azul'];
    const SEATS = [], BLOCKS = [];
    [[330, [80, 392]], [410, [80, 392]], [490, [80]]].forEach(([y, starts], ri) => {
        starts.forEach((x0, bi) => {
            BLOCKS.push({ x0, x1: x0 + 128, y });
            for (let i = 0; i < 5; i++) {
                SEATS.push({ x: x0 + i * 32, y, lane: y - 30, col: CHAIR[CHAIR_ORDER[(i * 3 + ri * 2 + bi * 3) % 4]], occ: null });
            }
        });
    });

    /* ---------- datos de ejemplo ---------- */
    const DESTS = [
        { id: 'eze', label: 'Ezeiza', icon: '✈', bag: 0.85, w: 2 },
        { id: 'aep', label: 'Aeroparque', icon: '✈', bag: 0.7, w: 2 },
        { id: 'cap', label: 'Capital', icon: '🏙', bag: 0.1, w: 3 },
        { id: 'tren', label: 'Estación de tren', icon: '🚆', bag: 0.15, w: 2 },
        { id: 'cli', label: 'Clínica', icon: '🏥', bag: 0.05, w: 2 },
        { id: 'casa', label: 'A casa', icon: '🏠', bag: 0.2, w: 3 }
    ];
    const TYPES = [{ id: 'sedan', w: 7 }, { id: 'familiar', w: 2 }, { id: 'utilitario', w: 1 }];
    const FLEET = [
        [3, 'Carlos', 'Chevrolet Onix', 'sedan', '#F2F4F6'],
        [7, 'Silvia', 'Volkswagen Virtus', 'sedan', '#9AA3AD'],
        [11, 'Marcelo', 'Chevrolet Cruze', 'sedan', '#23272C'],
        [14, 'Gustavo', 'Chevrolet Onix', 'sedan', '#C9CED4'],
        [18, 'Ramón', 'Chevrolet Spin', 'familiar', '#B8BEC6'],
        [21, 'Daniel', 'Renault Kangoo', 'utilitario', '#EEF0F2'],
        [25, 'Mariela', 'Chevrolet Onix', 'sedan', '#3A4A5C'],
        [29, 'Sergio', 'Volkswagen Virtus', 'sedan', '#F2F4F6'],
        [33, 'Hugo', 'Chevrolet Spin', 'familiar', '#5B6670'],
        [36, 'Alejandro', 'Chevrolet Cruze', 'sedan', '#A9B0B8'],
        [40, 'Pablo', 'Renault Kangoo', 'utilitario', '#C9CED4']
    ];
    const SKIN = ['#F1C7A5', '#E8B894', '#D49B74', '#B97A55', '#8C5A3C', '#F6D7C3', '#C98E6B'];
    const HAIR = ['#2A1B12', '#3D2A1C', '#5C3B22', '#8A5A33', '#C79A5F', '#1E1E1E', '#7A2E22', '#B9B2A8'];
    const SHIRT = ['#C2313B', '#2F5D73', '#E3A558', '#5E7D4E', '#7A5A9E', '#D9866E', '#3A3A3A', '#EDE6DA', '#4D6A8C', '#B4741A', '#8A3B5C', '#2E6E64', '#9FB7C9'];
    const PANTS = ['#2F3B52', '#3E4C66', '#2A2A2A', '#5A4636', '#7C6A55', '#46505C'];
    const HS = ['short', 'short', 'long', 'bun', 'curly', 'cap', 'long', 'short', 'bob'];
    const BAGS = ['#2C3E50', '#8E2B2B', '#1F5F8B', '#4A4F57', '#6B3FA0'];
    const NAMES = ['Lucía', 'Tomás', 'Ana', 'Mateo', 'Valen', 'Juan', 'Sofi', 'Nico', 'Cami', 'Fran', 'Pilar', 'Bruno', 'Mica', 'Lauti', 'Abril', 'Joaco', 'Delfi', 'Santi', 'Emma', 'Lola', 'Rocío', 'Agus', 'Maite', 'Ramiro', 'Paz', 'Norma', 'Héctor', 'Graciela'];
    const shortModel = m => m.split(' ').slice(1).join(' ');
    const typeName = { sedan: 'auto', familiar: 'familiar', utilitario: 'utilitario' };

    /* ---------- estado ---------- */
    let clock = 0, speed = 1, running = true, visible = true;
    let people = [], street = [], traffic = [], fx = [], timers = [], trips = [], pending = [];
    let spawnT = 1.2, trafficT = 1, pedT = 2, doorA = 0, tripId = 1, pid = 1;
    const stats = { viajes: 0, cafes: 0 };
    const queue = [];
    const mach = { busy: null, user: null, brewing: false, t: 0, done: null, q: [] };
    const vos = { p: null, sc: null, car: null, trip: null, dest: null, vtype: 'sedan', coffee: true, active: false };
    const t0 = new Date();

    function schedule(sec, fn) { timers.push({ at: clock + sec, fn }); }
    function say(p, text, dur, kind) { p.bubble = { text, t: 0, dur: dur || 2, kind: kind || '' }; }

    /* ---------- personas ---------- */
    function mkPerson(x, y, kind, o) {
        return Object.assign({
            id: pid++, x, y, a: -Math.PI / 2, face: null, kind, path: [], cb: null,
            spd: kind === 'ped' ? rnd(46, 60) : 58, ph: Math.random() * 6, moving: false, seated: false,
            alpha: 1, fading: false, gone: false, hold: null, bag: false, bagCol: pick(BAGS), bubble: null,
            skin: pick(SKIN), hair: pick(HAIR), hs: pick(HS), shirt: pick(SHIRT), pants: pick(PANTS),
            capCol: pick(['#B3202E', '#1F5F8B', '#2A2A2A', '#5E7D4E']), name: pick(NAMES),
            lane: null, state: '', phone: 0, phoneT: rnd(3, 9), sipT: rnd(2, 6), typing: 0
        }, o || {});
    }
    function freshName() {
        const used = new Set(people.map(q => q.name));
        const free = NAMES.filter(n => !used.has(n));
        return pick(free.length ? free : NAMES);
    }
    function goTo(p, pts, cb) { p.path = pts.slice(); p.cb = cb || null; p.seated = false; p.face = null; }
    /* camino por el pasillo: salir a mi carril, ir al pasillo, cambiar de carril, llegar */
    function routePts(p, dest, lane) {
        const pts = [], ly = p.lane != null ? p.lane : p.y;
        if (Math.abs(p.y - ly) > 1) pts.push({ x: p.x, y: ly });
        if (ly !== lane) {
            if (Math.abs(p.x - WALK_X) > 1) pts.push({ x: WALK_X, y: ly });
            pts.push({ x: WALK_X, y: lane });
        }
        if (Math.abs(dest.x - (pts.length ? pts[pts.length - 1].x : p.x)) > 1) pts.push({ x: dest.x, y: lane });
        pts.push({ x: dest.x, y: dest.y });
        p.lane = lane;
        return pts;
    }
    function movePerson(p, dt) {
        if (!p.path.length) {
            p.moving = false;
            if (p.face != null) p.a += angTo(p.a, p.face) * Math.min(1, dt * 8);
            return;
        }
        const t = p.path[0], dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), st = p.spd * dt;
        p.moving = true;
        if (d > 0.01) p.a += angTo(p.a, Math.atan2(dy, dx)) * Math.min(1, dt * 12);
        if (d <= st) {
            p.x = t.x; p.y = t.y; p.path.shift();
            if (!p.path.length) { p.moving = false; const cb = p.cb; p.cb = null; if (cb) cb(); }
        } else { p.x += (dx / d) * st; p.y += (dy / d) * st; }
        p.ph += dt * 9;
    }

    /* ---------- llegada al local ---------- */
    function spawnCustomer(o) {
        o = o || {};
        const fromLeft = Math.random() < 0.5;
        const v = view();
        const p = mkPerson(fromLeft ? v.l - 16 : v.r + 16, SIDE_Y + rnd(-6, 8), o.kind || 'cust', Object.assign({ name: freshName() }, o.look));
        p.vos = !!o.vos;
        p.dest = o.dest || wpick(DESTS);
        p.vtype = o.vtype || wpick(TYPES).id;
        p.bag = o.bag != null ? o.bag : (p.kind === 'cust' && Math.random() < p.dest.bag);
        p.wantCoffee = o.coffee != null ? o.coffee : Math.random() < (p.kind === 'chofer' ? 1 : 0.4);
        p.tIn = clock;
        people.push(p);
        goTo(p, [{ x: 300 + rnd(-3, 3), y: p.y }, DOOR_OUT, DOOR_IN], () => { p.lane = DOOR_IN.y; afterEnter(p); });
        if (p.kind === 'cust') feedAdd(`${p.vos ? 'Entraste' : 'Entró ' + p.name} · va a ${p.dest.label}`);
        return p;
    }
    function afterEnter(p) {
        if (p.vos) { vosStep('entrar', 'done'); vosStep(p.wantCoffee ? 'cafe' : 'ventanilla', 'active'); }
        if (p.kind === 'chofer') {
            if (Math.random() < 0.6) say(p, '¡Buenas!', 1.3);
            if (!useMachine(p, () => leaveLobby(p))) leaveLobby(p);
            return;
        }
        if (p.wantCoffee && useMachine(p, () => joinQueue(p))) {
            if (p.vos && mach.busy !== p) say(p, 'Espero mi turno ☕', 1.8);
            return;
        }
        if (p.vos && p.wantCoffee) vosStep('cafe', 'skip');
        joinQueue(p);
    }
    function leaveLobby(p) {
        const v = view();
        goTo(p, routePts(p, DOOR_IN, DOOR_IN.y).concat([DOOR_OUT, { x: p.x < 300 ? v.l - 20 : v.r + 20, y: SIDE_Y + rnd(-4, 6) }]), () => (p.gone = true));
    }

    /* ---------- máquina de café ---------- */
    function useMachine(p, done) {
        const waitSpot = { x: MACH_WAIT.x - mach.q.length * 26, y: MACH_WAIT.y };
        if (!mach.busy && !mach.q.length) {
            mach.busy = p;
            goTo(p, routePts(p, MACH_FRONT, MACH_FRONT.y), () => startCoffee(p, done));
            return true;
        }
        if (mach.q.length < 1 || (p.vos && mach.q.length < 3)) {
            mach.q.push({ p, done });
            goTo(p, routePts(p, waitSpot, waitSpot.y), () => (p.face = -0.7));
            return true;
        }
        return false;
    }
    function startCoffee(p, done) {
        p.face = 0; mach.user = p; mach.t = 0; mach.done = done; mach.brewing = true;
        say(p, '$1.000 ☕', 1.6);
        fx.push({ k: 'bill', t: 0, life: 0.9, x0: p.x + 8, y0: p.y + 6, x1: MACH.x + 3, y1: MACH.y + 22 });
        cue(MACH.x - 40, MACH.y + 34, 2.1, 4.3, 2);
        if (p.vos) vosStep('cafe', 'active');
    }
    function machTick(dt) {
        if (!mach.brewing) return;
        mach.t += dt;
        if (mach.t > 1 && mach.t < 3.4 && Math.random() < dt * 9) fx.push({ k: 'steam', t: 0, life: 1.1, x: MACH.x + 7 + rnd(-2, 2), y: MACH.y + 42 });
        if (mach.t >= 3.8) {
            const p = mach.user;
            mach.brewing = false; mach.user = null; mach.busy = null;
            p.hold = 'coffee'; stats.cafes++;
            if (p.vos) { vosStep('cafe', 'done'); vosStep('ventanilla', 'active'); }
            if (p.kind === 'chofer') feedAdd('Un chofer pasó a buscar un café ☕');
            const d = mach.done; mach.done = null;
            if (d) d();
            const nx = mach.q.shift();
            if (nx) {
                mach.busy = nx.p; nx.p.lane = MACH_FRONT.y;
                goTo(nx.p, [{ x: MACH_FRONT.x - 8, y: MACH_WAIT.y }, MACH_FRONT], () => startCoffee(nx.p, nx.done));
                mach.q.forEach((w, i) => { const sp = { x: MACH_WAIT.x - i * 26, y: MACH_WAIT.y }; w.p.lane = sp.y; goTo(w.p, [sp], () => (w.p.face = -0.7)); });
            }
        }
    }

    /* ---------- fila y ventanilla ---------- */
    const op = mkPerson(OP_POS.x, OP_POS.y, 'op', { shirt: '#1769AA', pants: '#2A2F36', hs: 'long', hair: '#3D2A1C', skin: '#E8B894', name: 'Operadora' });
    op.seated = true; op.a = op.face = Math.PI / 2; op.busy = false;

    function joinQueue(p) { p.state = 'queue'; p.qi = -1; queue.push(p); layoutQueue(); }
    function layoutQueue() {
        queue.forEach((p, i) => {
            if (p.qi === i) return;
            const first = p.qi === -1;
            p.qi = i; p.atFront = false;
            const s = SPOT[Math.min(i, SPOT.length - 1)];
            goTo(p, first ? routePts(p, s, s.y) : [s], () => {
                p.face = -Math.PI / 2; p.lane = s.y;
                if (p.qi === 0) p.atFront = true;
            });
            if (!first) p.lane = s.y;
        });
    }
    function serve(p) {
        op.busy = true; p.state = 'window'; p.qi = null;
        const trip = { id: tripId++, p, dest: p.dest, vtype: p.vtype, car: null, sc: null, called: false };
        p.trip = trip; trips.push(trip);
        if (p.vos) { vos.trip = trip; vosStep('ventanilla', 'active'); }
        cue(300, 126, 2.1, 4.6, 3);
        schedule(0.3, () => say(p, `${p.dest.icon} ${p.dest.label}${p.bag ? ' · con valija' : ''}`, 2));
        schedule(1.4, () => (op.typing = 1.4));
        schedule(2.6, () => {
            const car = assign(trip);
            if (car) say(op, `Móvil ${car.n} · ${shortModel(car.model)} · ${etaMin(car)} min`, 2.8, 'op');
            else say(op, 'Ya te busco un móvil', 2.4, 'op');
            if (p.vos) vosStep('ventanilla', 'done');
        });
        schedule(3.8, () => { p.state = 'wait'; sitDown(p); });
        schedule(4.3, () => (op.busy = false));
    }
    function sitDown(p) {
        if (p.trip && p.trip.called) { board(p); return; }
        const free = SEATS.filter(s => !s.occ);
        if (!free.length) {
            const n = people.filter(q => q.standing).length;
            p.standing = true;
            goTo(p, routePts(p, { x: STAND.x - n * 22, y: STAND.y }, STAND.y), () => (p.face = -Math.PI / 2));
            return;
        }
        const center = { x: 300, y: 330 };
        free.sort((a, b) => (dist(a, center) + (p.vos ? 0 : rnd(0, 160))) - (dist(b, center) + (p.vos ? 0 : rnd(0, 160))));
        const s = free[0];
        s.occ = p; p.seat = s;
        goTo(p, routePts(p, s, s.lane), () => { p.seated = true; p.face = -Math.PI / 2; });
    }
    function board(p) {
        const sc = p.trip.sc;
        if (p.seat) { p.seat.occ = null; p.seat = null; }
        p.standing = false; p.seated = false; p.state = 'board';
        const pts = routePts(p, DOOR_IN, DOOR_IN.y).concat([DOOR_OUT, { x: sc.x - 4, y: 662 }]);
        goTo(p, pts, () => { p.fading = true; p.face = Math.PI / 2; });
    }
    function onBoarded(p) {
        const trip = p.trip, s = trip.sc, car = trip.car;
        stats.viajes++;
        s.honk = 0.6;
        feedAdd(`${p.vos ? 'Saliste' : p.name + ' salió'} en el móvil ${car.n} hacia ${trip.dest.label} ${trip.dest.icon}`);
        schedule(0.9, () => {
            s.stage = 'out'; s.v = 8;
            car.state = 'viaje'; car.trip = null; car.sc = null;
            car.i = car.ti = BASE.i; car.j = car.tj = BASE.j; car.k = 0;
            car.path = manhattan(BASE, farNode());
        });
        trip.done = true;
        if (p.vos) {
            vosStep('puerta', 'done'); vosStep('viaje', 'done');
            vos.sc = s; vos.p = null;
            schedule(2.6, vosFinish);
        }
    }

    /* ---------- la central: mapa con los móviles ---------- */
    const COLS = 8, ROWS = 6, BASE = { i: 4, j: 3 };
    const PARKS = ['1,1', '6,4', '2,4', '6,0'];
    const neighbors = (i, j) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ({ i: i + a, j: j + b })).filter(n => n.i >= 0 && n.i <= COLS && n.j >= 0 && n.j <= ROWS);
    function manhattan(a, b) {
        const pts = []; let i = a.i, j = a.j;
        const stI = () => { while (i !== b.i) { i += Math.sign(b.i - i); pts.push({ i, j }); } };
        const stJ = () => { while (j !== b.j) { j += Math.sign(b.j - j); pts.push({ i, j }); } };
        if (Math.random() < 0.5) { stI(); stJ(); } else { stJ(); stI(); }
        return pts;
    }
    function farNode() {
        let n;
        do { n = { i: rint(0, COLS), j: rint(0, ROWS) }; } while (Math.abs(n.i - BASE.i) + Math.abs(n.j - BASE.j) < 4);
        return n;
    }
    const cars = FLEET.map(([n, name, model, type, color], idx) => {
        let i, j;
        do { i = rint(0, COLS); j = rint(0, ROWS); } while (Math.abs(i - BASE.i) + Math.abs(j - BASE.j) < 2);
        const big = type !== 'sedan', cruze = model.includes('Cruze');
        const c = { n, name, model, type, color, i, j, ti: i, tj: j, k: 0, ang: 0, path: [], last: null, state: 'libre', trip: null, sc: null, len: type === 'utilitario' ? 64 : big || cruze ? 62 : 58, wid: big ? 29 : 27 };
        if (idx % 4 === 2) { c.state = 'viaje'; c.path = manhattan(c, farNode()); }
        return c;
    });
    const carFrom = c => (c.k > 0 ? { i: c.ti, j: c.tj } : { i: c.i, j: c.j });
    const edgesLeft = c => (c.k > 0 ? 1 - c.k : 0) + c.path.length;
    const etaMin = c => Math.max(1, Math.round(edgesLeft(c) * 1.6));
    const kmOf = c => (Math.max(0.3, edgesLeft(c) * 0.45)).toFixed(1).replace('.', ',');

    function assign(trip) {
        const free = cars.filter(c => c.state === 'libre');
        if (!free.length) { trip.pending = true; pending.push(trip); return null; }
        const same = free.filter(c => c.type === trip.vtype);
        const pool = same.length ? same : free;
        const d = c => { const f = carFrom(c); return Math.abs(f.i - BASE.i) + Math.abs(f.j - BASE.j) + (c.k > 0 ? 1 - c.k : 0); };
        pool.sort((a, b) => d(a) - d(b));
        bindCar(pool[0], trip);
        return pool[0];
    }
    function bindCar(c, trip) {
        c.state = 'asignado'; c.trip = trip; trip.car = c; trip.pending = false;
        c.path = manhattan(carFrom(c), BASE);
        trip.km = kmOf(c);
        const who = trip.p.vos ? 'vos' : trip.p.name;
        feedAdd(`Móvil ${c.n} (${shortModel(c.model)}) asignado a ${who} · a ${trip.km} km`);
        const note = $('vivo-map-note');
        if (note) note.textContent = `Último pedido: móvil ${c.n} · ${c.model} · a ${trip.km} km de la base.`;
        if (trip.p.vos) vosAssigned(c);
        if (c.k === 0 && c.i === BASE.i && c.j === BASE.j) arriveBase(c);
    }
    function nextNode(c) {
        if (c.path.length) { const n = c.path.shift(); c.ti = n.i; c.tj = n.j; return; }
        if (c.state === 'viaje') c.state = 'libre';
        if (c.state === 'asignado') { c.path = manhattan(c, BASE); if (c.path.length) { nextNode(c); } return; }
        const all = neighbors(c.i, c.j);
        const nb = all.filter(n => !(c.last && n.i === c.last.i && n.j === c.last.j));
        const n = pick(nb.length ? nb : all);
        c.ti = n.i; c.tj = n.j;
    }
    function mapTick(dt) {
        cars.forEach(c => {
            if (c.state === 'puerta') return;
            if (c.ti === c.i && c.tj === c.j) {
                if (c.state === 'asignado' && c.i === BASE.i && c.j === BASE.j) { arriveBase(c); return; }
                nextNode(c);
                if (c.ti === c.i && c.tj === c.j) return;
            }
            const v = c.state === 'asignado' ? 0.62 : c.state === 'viaje' ? 0.55 : 0.38;
            c.k += dt * v;
            if (c.k >= 1) {
                c.k = 0; c.last = { i: c.i, j: c.j }; c.i = c.ti; c.j = c.tj;
                if (c.state === 'asignado' && c.i === BASE.i && c.j === BASE.j) { arriveBase(c); return; }
                nextNode(c);
            }
        });
        if (pending.length && cars.some(c => c.state === 'libre')) {
            const trip = pending.shift();
            const car = assign(trip);
            if (car) say(op, `Móvil ${car.n} para ${trip.p.vos ? 'vos' : trip.p.name}`, 2.4, 'op');
        }
    }

    /* ---------- la calle ---------- */
    function arriveBase(c) {
        c.state = 'puerta'; c.k = 0; c.ti = c.i = BASE.i; c.tj = c.j = BASE.j; c.path = [];
        const used = street.filter(s => s.stage !== 'out').map(s => s.tx);
        const tx = [330, 466, 194].find(x => !used.includes(x));
        const sc = { car: c, x: view().l - 80, y: LANE_Y, tx: tx != null ? tx : 560, stage: 'in', v: 150, t: 0, honk: 0 };
        street.push(sc); c.sc = sc; c.trip.sc = sc;
        if (c.trip.p.vos) { vosStep('camino', 'active'); }
    }
    function onParked(s) {
        const trip = s.car.trip, p = trip.p;
        trip.called = true;
        cue(s.x, 632, 1.9, 4.6, 3);
        say(op, p.vos ? `¡Móvil ${s.car.n}, te espera en la puerta!` : `¡Móvil ${s.car.n} para ${p.name}!`, 2.6, 'call');
        feedAdd(`El móvil ${s.car.n} llegó a la puerta`);
        if (p.vos) { vosStep('camino', 'done'); vosStep('puerta', 'active'); }
        if (p.state === 'wait') { say(p, p.vos ? '¡Es el mío!' : '¡Es para mí!', 1.4); schedule(0.6, () => board(p)); }
    }
    function streetTick(dt) {
        street.forEach(s => {
            s.t += dt;
            if (s.honk > 0) s.honk -= dt;
            if (s.stage === 'in') {
                const rem = s.tx - s.x;
                s.v = clamp(rem * 1.5, 16, 150);
                s.x += s.v * dt;
                s.y = lerp(LANE_Y, PARK_Y, ease(clamp(1 - rem / 90, 0, 1)));
                if (rem < 0.8) { s.x = s.tx; s.y = PARK_Y; s.stage = 'park'; s.t = 0; onParked(s); }
            } else if (s.stage === 'out') {
                s.v = Math.min(170, s.v + 110 * dt);
                s.x += s.v * dt;
                s.y = lerp(s.y, LANE_Y, Math.min(1, dt * 2));
                if (s.x > view().r + 120) s.dead = true;
            }
        });
        street = street.filter(s => !s.dead);
    }
    function trafficTick(dt) {
        const v = view();
        trafficT -= dt;
        if (trafficT <= 0) {
            const last = traffic[traffic.length - 1];
            if (!last || last.x < v.r - 40) {
                const bus = Math.random() < 0.13;
                traffic.push(bus
                    ? { bus: true, x: v.r + 80, y: FAR_Y, len: 104, wid: 30, v: 100, color: pick(['#E8C21F', '#D2433F', '#2D6FD1', '#2E9B5B']) }
                    : { x: v.r + 60, y: FAR_Y + rnd(-2, 2), len: rnd(54, 62), wid: 26, v: rnd(115, 140), color: pick(['#B3202E', '#F2F4F6', '#23272C', '#9AA3AD', '#2F5D73', '#C9CED4', '#5E7D4E', '#E3A558']) });
            }
            trafficT = rnd(2.2, 5.5);
        }
        traffic.sort((a, b) => a.x - b.x);
        traffic.forEach((t, i) => {
            const ahead = traffic[i - 1];
            let vv = t.v;
            if (ahead && t.x - ahead.x < (t.len + ahead.len) / 2 + 22) vv = Math.min(vv, ahead.v * 0.9);
            t.cur = vv;
            t.x -= vv * dt;
        });
        traffic = traffic.filter(t => t.x > v.l - 140);
        // gente que pasa por la vereda
        pedT -= dt;
        if (pedT <= 0) {
            const left = Math.random() < 0.5;
            const p = mkPerson(left ? v.l - 16 : v.r + 16, SIDE_Y + rnd(-10, 14), 'ped');
            if (Math.random() < 0.15) p.bag = true;
            goTo(p, [{ x: left ? v.r + 20 : v.l - 20, y: p.y }], () => (p.gone = true));
            people.push(p);
            pedT = rnd(4, 9);
        }
    }

    /* ---------- efectos ---------- */
    function fxTick(dt) {
        fx.forEach(f => (f.t += dt));
        fx = fx.filter(f => f.t < f.life);
    }

    /* ---------- escena inicial ---------- */
    function seed() {
        const free = SEATS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
        free.forEach(s => {
            const p = mkPerson(s.x, s.y, 'cust', { name: freshName() });
            p.dest = wpick(DESTS); p.vtype = wpick(TYPES).id; p.bag = Math.random() < p.dest.bag;
            p.seated = true; p.seat = s; s.occ = p; p.state = 'wait'; p.lane = s.lane; p.a = p.face = -Math.PI / 2;
            p.tIn = 0;
            if (Math.random() < 0.5) p.hold = 'coffee';
            people.push(p);
            const trip = { id: tripId++, p, dest: p.dest, vtype: p.vtype, car: null, sc: null, called: false };
            p.trip = trip; trips.push(trip);
            assign(trip);
        });
        for (let i = 0; i < 3; i++) traffic.push({ x: rnd(-20, W + 20) + i * 200, y: FAR_Y, len: 58, wid: 26, v: rnd(115, 135), color: pick(['#B3202E', '#F2F4F6', '#23272C', '#9AA3AD']) });
    }

    /* ---------- bucle ---------- */
    function update(dt) {
        clock += dt;
        if (timers.length) {
            const due = timers.filter(t => t.at <= clock);
            timers = timers.filter(t => t.at > clock);
            due.forEach(t => t.fn());
        }
        spawnT -= dt;
        if (spawnT <= 0) {
            const inside = people.filter(p => p.kind === 'cust' && !p.gone && p.state !== 'board').length;
            if (inside < 11 && queue.length < 3) spawnCustomer(Math.random() < 0.15 ? { kind: 'chofer', look: { shirt: '#1C2B3A', pants: '#202833', hs: pick(['short', 'cap']) } } : {});
            spawnT = rnd(5, 8.5);
        }
        people.forEach(p => {
            movePerson(p, dt);
            if (p.bubble) { p.bubble.t += dt; if (p.bubble.t > p.bubble.dur) p.bubble = null; }
            if (p.fading) { p.alpha -= dt * 3; if (p.alpha <= 0) { p.alpha = 0; p.gone = true; p.fading = false; if (p.trip) onBoarded(p); } }
            if (p.seated && p.kind === 'cust') {
                p.phoneT -= dt;
                if (p.phoneT <= 0) { p.phone = p.phone ? 0 : 1; p.phoneT = p.phone ? rnd(3, 7) : rnd(4, 10); }
                if (p.hold === 'coffee') { p.sipT -= dt; if (p.sipT <= 0) { p.sipT = rnd(3, 7); const c = Math.cos(p.a), s = Math.sin(p.a); fx.push({ k: 'steam', t: 0, life: 1, x: p.x + c * 7 - s * 5, y: p.y + s * 7 + c * 5 }); } }
            } else p.phone = 0;
        });
        people = people.filter(p => !p.gone);
        if (op.bubble) { op.bubble.t += dt; if (op.bubble.t > op.bubble.dur) op.bubble = null; }
        if (op.typing > 0) op.typing -= dt;
        op.ph += dt * 14;
        if (!op.busy && queue.length && queue[0].atFront) { serve(queue.shift()); layoutQueue(); }
        machTick(dt);
        mapTick(dt);
        streetTick(dt);
        trafficTick(dt);
        fxTick(dt);
        const near = people.some(p => Math.abs(p.x - 300) < 30 && Math.abs(p.y - 604) < 32);
        doorA += ((near ? 1 : 0) - doorA) * Math.min(1, dt * 7);
    }

    /* ---------- cámara ---------- */
    const cam = { x: W / 2, y: H / 2, z: 1 };
    const shot = { until: -1, pri: 0, x: 0, y: 0, z: 1 };
    let lastShotEnd = -10, camMode = reduceMotion ? 'general' : 'auto';
    let cssW = 0, cssH = 0, base = 1, dpr = 1;
    function cue(x, y, z, dur, pri) {
        if (camMode !== 'auto' || vos.active) return;
        if (clock < shot.until && pri <= shot.pri) return;
        if (clock >= shot.until && clock - lastShotEnd < 2.4 && pri < 3) return;
        Object.assign(shot, { x, y, z, until: clock + dur, pri });
        lastShotEnd = shot.until;
    }
    function view() {
        const s = base * cam.z || 1;
        return { l: cam.x - cssW / (2 * s), r: cam.x + cssW / (2 * s), t: cam.y - cssH / (2 * s), b: cam.y + cssH / (2 * s) };
    }
    function clampCam() {
        const s = base * cam.z, hw = cssW / (2 * s), hh = cssH / (2 * s);
        cam.x = W > 2 * hw ? clamp(cam.x, hw, W - hw) : W / 2;
        cam.y = H > 2 * hh ? clamp(cam.y, hh, H - hh) : H / 2;
    }
    function camTick(dtR) {
        let tx = W / 2, ty = H / 2, tz = 1;
        if (camMode === 'auto') {
            if (vos.p && !vos.p.gone) { tx = vos.p.x; ty = vos.p.y - 20; tz = 1.6; }
            else if (vos.sc && !vos.sc.dead && vos.active) { tx = clamp(vos.sc.x, 0, W); ty = 640; tz = 1.45; }
            else if (clock < shot.until) { tx = shot.x; ty = shot.y; tz = shot.z; }
        }
        const k = Math.min(1, dtR * 2.2);
        cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
        clampCam();
    }

    /* ---------- dibujo: fondo fijo ---------- */
    let bg = null, bgRes = 0;
    function drawPlant(g, x, y, r) {
        g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.ellipse(x + 2, y + 3, r, r * 0.8, 0, 0, 7); g.fill();
        g.fillStyle = '#8A5A3C'; g.beginPath(); g.arc(x, y, r * 0.62, 0, 7); g.fill();
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            g.fillStyle = i % 2 ? '#3E8E4E' : '#2F7A40';
            g.beginPath(); g.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.55, r * 0.3, a, 0, 7); g.fill();
        }
        g.fillStyle = '#4FA35E'; g.beginPath(); g.arc(x, y, r * 0.3, 0, 7); g.fill();
    }
    function buildBg(res) {
        bg = document.createElement('canvas');
        bg.width = Math.round(W * res); bg.height = Math.round(H * res); bgRes = res;
        const g = bg.getContext('2d');
        g.scale(res, res);

        // oficina del operador (piso de madera)
        g.fillStyle = '#C79F76'; g.fillRect(14, 10, W - 28, 102);
        g.strokeStyle = 'rgba(90,60,30,.18)'; g.lineWidth = 1;
        for (let y = 10; y < 112; y += 13) {
            g.beginPath(); g.moveTo(14, y); g.lineTo(W - 14, y); g.stroke();
            for (let x = 14 + ((y / 13) % 2) * 40; x < W - 14; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 13); g.stroke(); }
        }
        // lobby: baldosas
        g.fillStyle = '#E8ECF0'; g.fillRect(14, 128, W - 28, 470);
        for (let x = 14, i = 0; x < W - 14; x += 36, i++) {
            for (let y = 128, j = 0; y < 598; y += 36, j++) {
                if ((i + j) % 2) { g.fillStyle = '#E0E5EA'; g.fillRect(x, y, 36, 36); }
            }
        }
        g.strokeStyle = 'rgba(160,172,185,.35)';
        for (let x = 14; x < W - 14; x += 36) { g.beginPath(); g.moveTo(x, 128); g.lineTo(x, 598); g.stroke(); }
        for (let y = 128; y < 598; y += 36) { g.beginPath(); g.moveTo(14, y); g.lineTo(W - 14, y); g.stroke(); }
        // sombra bajo las paredes
        let gr = g.createLinearGradient(0, 128, 0, 146); gr.addColorStop(0, 'rgba(11,31,51,.14)'); gr.addColorStop(1, 'rgba(11,31,51,0)');
        g.fillStyle = gr; g.fillRect(14, 128, W - 28, 18);
        // alfombra de entrada
        g.fillStyle = '#2B3946'; rrect(g, 262, 554, 76, 38, 4); g.fill();
        g.strokeStyle = '#F5B800'; g.lineWidth = 1.2; rrect(g, 266, 558, 68, 30, 3); g.stroke();
        g.fillStyle = '#F5B800'; g.font = `800 9px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MADERO', 300, 573);

        // paredes
        g.fillStyle = '#0B1F33';
        g.fillRect(0, 0, W, 10); g.fillRect(0, 0, 14, 608); g.fillRect(W - 14, 0, 14, 608);
        g.fillRect(0, 112, 228, 16); g.fillRect(372, 112, W - 372, 16);
        g.fillRect(0, 598, 268, 10); g.fillRect(332, 598, W - 332, 10);
        // ventanilla: vidrio y mostrador
        g.fillStyle = 'rgba(150,200,232,.9)'; g.fillRect(228, 113, 144, 10);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(236, 115, 40, 2); g.fillRect(320, 115, 22, 2);
        g.fillStyle = '#F2F5F8'; rrect(g, 220, 122, 160, 13, 3); g.fill();
        g.strokeStyle = '#B9C3CD'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#9AA6B2'; rrect(g, 287, 125, 26, 4, 2); g.fill();
        // carteles en la pared
        g.fillStyle = '#F5B800'; g.font = `800 9px ${FONT}`;
        g.fillText('MADERO REMISES', 116, 120.5);
        g.fillText('PEDÍ TU REMÍS ACÁ', 486, 120.5);

        // muebles de la oficina
        g.fillStyle = '#2B3036'; rrect(g, 284, 30, 32, 9, 3); g.fill();           // respaldo de la silla
        g.fillStyle = '#3A4048'; g.beginPath(); g.arc(300, 50, 13, 0, 7); g.fill();  // silla
        g.fillStyle = 'rgba(0,0,0,.18)'; rrect(g, 234, 76, 136, 26, 4); g.fill();
        g.fillStyle = '#6E4B32'; rrect(g, 232, 72, 136, 26, 4); g.fill();
        g.fillStyle = '#80583B'; rrect(g, 234, 73, 132, 22, 3); g.fill();
        g.fillStyle = '#2A2F36'; rrect(g, 284, 76, 32, 7, 2); g.fill();            // teclado
        g.fillStyle = '#1F2329'; rrect(g, 342, 78, 14, 10, 2); g.fill();           // radio
        g.strokeStyle = '#1F2329'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(353, 78); g.lineTo(358, 70); g.stroke();
        g.save(); g.translate(254, 84); g.rotate(-0.2); g.fillStyle = '#FBFBF7'; g.fillRect(-9, -6, 18, 12); g.fillStyle = '#C9D2DB'; for (let i = 0; i < 4; i++) g.fillRect(-7, -4 + i * 2.6, 12, 0.9); g.restore();
        g.fillStyle = '#7F8C99'; rrect(g, 24, 16, 46, 30, 3); g.fill();            // archivero
        g.strokeStyle = '#6A7682'; g.lineWidth = 1; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(26, 16 + i * 10); g.lineTo(68, 16 + i * 10); g.stroke(); }
        g.fillStyle = '#FFFFFF'; rrect(g, 400, 14, 120, 24, 3); g.fill();           // pizarra
        g.strokeStyle = '#B9C3CD'; g.stroke();
        g.fillStyle = '#0B1F33'; g.font = `800 6.5px ${FONT}`; g.fillText('MÓVILES DEL DÍA', 460, 21);
        g.fillStyle = '#9AA6B2'; for (let i = 0; i < 3; i++) g.fillRect(408, 26 + i * 3.5, 60 + i * 12, 1.2);
        g.fillStyle = '#5F6B77'; rrect(g, 548, 46, 22, 22, 4); g.fill();          // dispenser
        g.fillStyle = '#A9D6F5'; g.beginPath(); g.arc(559, 57, 8, 0, 7); g.fill();
        drawPlant(g, 96, 40, 13);

        // lobby: plantas, tacho, cartel
        drawPlant(g, 36, 150, 14);
        drawPlant(g, 564, 150, 14);
        drawPlant(g, 36, 574, 15);
        g.fillStyle = '#5F6B77'; g.beginPath(); g.arc(566, 546, 8, 0, 7); g.fill();
        g.fillStyle = '#4A5560'; g.beginPath(); g.arc(566, 546, 5.5, 0, 7); g.fill();

        // sillas de colores
        BLOCKS.forEach(b => { g.fillStyle = '#5F6A75'; g.fillRect(b.x0 - 15, b.y + 13, b.x1 - b.x0 + 30, 3.5); });
        SEATS.forEach(s => {
            g.fillStyle = 'rgba(0,0,0,.14)'; rrect(g, s.x - 12, s.y - 10, 27, 26, 6); g.fill();
            g.fillStyle = shade(s.col, -0.28); rrect(g, s.x - 13, s.y + 7, 26, 8, 3); g.fill();
            g.fillStyle = s.col; rrect(g, s.x - 13, s.y - 12, 26, 22, 6); g.fill();
            g.fillStyle = shade(s.col, 0.18); rrect(g, s.x - 9, s.y - 9, 18, 12, 4); g.fill();
        });
    }

    /* ---------- dibujo: piezas ---------- */
    function drawCar(g, x, y, a, c) {
        const L = c.len, Wd = c.wid, van = c.type === 'utilitario';
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = 'rgba(0,0,0,.3)'; rrect(g, -L / 2 + 2, -Wd / 2 + 3, L, Wd, 8); g.fill();
        g.fillStyle = c.color; rrect(g, -L / 2, -Wd / 2, L, Wd, van ? 6 : 9); g.fill();
        g.strokeStyle = shade(c.color, -0.35); g.lineWidth = 1; g.stroke();
        const f = L * 0.16;
        g.fillStyle = '#26333F';
        g.beginPath(); g.moveTo(f, -Wd / 2 + 4); g.lineTo(f + L * 0.13, -Wd / 2 + 2.5); g.lineTo(f + L * 0.13, Wd / 2 - 2.5); g.lineTo(f, Wd / 2 - 4); g.closePath(); g.fill();
        const rb = van ? -L * 0.47 : -L * 0.36;
        g.beginPath(); g.moveTo(rb + L * 0.11, -Wd / 2 + 4); g.lineTo(rb, -Wd / 2 + 3); g.lineTo(rb, Wd / 2 - 3); g.lineTo(rb + L * 0.11, Wd / 2 - 4); g.closePath(); g.fill();
        g.fillStyle = shade(c.color, 0.1);
        if (van) rrect(g, -L * 0.36, -Wd / 2 + 3.5, L * 0.52, Wd - 7, 3); else rrect(g, -L * 0.25, -Wd / 2 + 3.5, L * 0.41, Wd - 7, 4);
        g.fill();
        g.fillStyle = 'rgba(38,51,63,.75)';
        g.fillRect(van ? -L * 0.36 : -L * 0.24, -Wd / 2 + 1.6, van ? L * 0.5 : L * 0.38, 1.6);
        g.fillRect(van ? -L * 0.36 : -L * 0.24, Wd / 2 - 3.2, van ? L * 0.5 : L * 0.38, 1.6);
        g.fillStyle = shade(c.color, -0.3); g.fillRect(f - 1, -Wd / 2 - 2.2, 3.5, 2.6); g.fillRect(f - 1, Wd / 2 - 0.4, 3.5, 2.6);
        g.fillStyle = '#FFF6D5'; rrect(g, L / 2 - 3, -Wd / 2 + 2.5, 2.6, 6, 1); g.fill(); rrect(g, L / 2 - 3, Wd / 2 - 8.5, 2.6, 6, 1); g.fill();
        const blink = c.hazard && Math.sin(clock * 9) > 0;
        g.fillStyle = blink ? '#FFB020' : '#B3202E';
        rrect(g, -L / 2 + 0.6, -Wd / 2 + 2.5, 2.6, 5, 1); g.fill(); rrect(g, -L / 2 + 0.6, Wd / 2 - 7.5, 2.6, 5, 1); g.fill();
        if (blink) { g.fillStyle = '#FFB020'; g.fillRect(L / 2 - 6, -Wd / 2 - 0.4, 4, 2); g.fillRect(L / 2 - 6, Wd / 2 - 1.6, 4, 2); }
        if (c.num) {
            g.fillStyle = '#F5B800'; rrect(g, -8, -5, 16, 10, 2); g.fill();
            g.fillStyle = '#0B1F33'; g.font = `800 7.5px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(c.num), 0, 0.6);
        }
        g.restore();
    }
    function drawBus(g, t) {
        g.save(); g.translate(t.x, t.y);
        g.fillStyle = 'rgba(0,0,0,.3)'; rrect(g, -t.len / 2 + 2, -t.wid / 2 + 3, t.len, t.wid, 6); g.fill();
        g.fillStyle = t.color; rrect(g, -t.len / 2, -t.wid / 2, t.len, t.wid, 6); g.fill();
        g.fillStyle = '#F2F4F6'; rrect(g, -t.len / 2 + 6, -t.wid / 2 + 4, t.len - 12, t.wid - 8, 3); g.fill();
        g.fillStyle = 'rgba(38,51,63,.5)'; for (let i = 0; i < 4; i++) g.fillRect(-t.len / 2 + 14 + i * 22, -t.wid / 2 + 9, 12, t.wid - 18);
        g.fillStyle = '#26333F'; g.fillRect(-t.len / 2 + 1, -t.wid / 2 + 4, 4, t.wid - 8);
        g.restore();
    }
    function drawPerson(p) {
        const g = ctx;
        g.save(); g.globalAlpha = p.alpha; g.translate(p.x, p.y);
        g.fillStyle = 'rgba(15,25,35,.18)'; g.beginPath(); g.ellipse(1.5, 3, 10, 8, 0, 0, 7); g.fill();
        g.rotate(p.a);
        const sw = p.moving ? Math.sin(p.ph) : 0;
        // piernas
        g.fillStyle = p.pants;
        if (p.seated) {
            rrect(g, 2, -6, 13, 4.8, 2.3); g.fill(); rrect(g, 2, 1.2, 13, 4.8, 2.3); g.fill();
            g.fillStyle = '#22262B'; g.beginPath(); g.arc(15.5, -3.6, 2.3, 0, 7); g.arc(15.5, 3.6, 2.3, 0, 7); g.fill();
        } else if (p.moving) {
            rrect(g, -3 + sw * 5, -6, 8, 4.6, 2.2); g.fill(); rrect(g, -3 - sw * 5, 1.4, 8, 4.6, 2.2); g.fill();
            g.fillStyle = '#22262B'; g.beginPath(); g.ellipse(5 + sw * 5, -3.7, 2.4, 2, 0, 0, 7); g.ellipse(5 - sw * 5, 3.7, 2.4, 2, 0, 0, 7); g.fill();
        } else {
            g.fillStyle = '#22262B'; g.beginPath(); g.ellipse(4, -3.6, 2.4, 2, 0, 0, 7); g.ellipse(4, 3.6, 2.4, 2, 0, 0, 7); g.fill();
        }
        // cuerpo
        g.fillStyle = p.shirt; g.beginPath(); g.ellipse(-0.5, 0, 6.4, 10, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(-2.6, 0, 3.6, 9, 0, 0, 7); g.fill();
        if (p.kind === 'chofer') { g.fillStyle = '#F5B800'; g.fillRect(-1, -9.6, 1.6, 19.2); }
        // brazos y manos
        let h1 = { x: 2 + sw * 3.6, y: -10 }, h2 = { x: 2 - sw * 3.6, y: 10 };
        if (p.seated && (p.hold === 'coffee' || p.phone)) { h1 = { x: 6, y: -4 }; h2 = { x: 7, y: 4.5 }; }
        if (p.kind === 'op' && p.typing > 0) { h1 = { x: 9 + Math.sin(p.ph) * 1.4, y: -4 }; h2 = { x: 9 + Math.cos(p.ph * 1.3) * 1.4, y: 4 }; }
        g.fillStyle = shade(p.shirt.length === 7 ? p.shirt : '#555555', -0.15);
        g.beginPath(); g.arc(-0.5 + (h1.x - 2) * 0.4, -9.8, 3, 0, 7); g.arc(-0.5 + (h2.x - 2) * 0.4, 9.8, 3, 0, 7); g.fill();
        g.fillStyle = p.skin; g.beginPath(); g.arc(h1.x, h1.y, 2.2, 0, 7); g.arc(h2.x, h2.y, 2.2, 0, 7); g.fill();
        // cabeza
        g.fillStyle = p.skin; g.beginPath(); g.arc(0.6, 0, 5.4, 0, 7); g.fill();
        g.fillStyle = p.hair;
        if (p.hs === 'cap') {
            g.fillStyle = p.capCol; g.beginPath(); g.arc(0, 0, 5.7, 0, 7); g.fill();
            rrect(g, 3.6, -4.2, 4.6, 8.4, 2); g.fill();
        } else {
            g.beginPath(); g.arc(0.3, 0, 5.6, Math.PI * 0.5, Math.PI * 1.5); g.fill();
            g.beginPath(); g.ellipse(-0.6, 0, 4.4, 5.3, 0, 0, 7); g.fill();
            if (p.hs === 'long') { g.beginPath(); g.ellipse(-5.4, 0, 3.2, 5.8, 0, 0, 7); g.fill(); }
            if (p.hs === 'bun') { g.beginPath(); g.arc(-6.4, 0, 2.7, 0, 7); g.fill(); }
            if (p.hs === 'bob') { g.beginPath(); g.ellipse(-1.4, 0, 5, 6.4, 0, 0, 7); g.fill(); }
            if (p.hs === 'curly') { for (let i = 0; i < 6; i++) { const a = Math.PI * 0.55 + (i / 5) * Math.PI * 0.9; g.beginPath(); g.arc(Math.cos(a) * 5, Math.sin(a) * 5, 2.2, 0, 7); g.fill(); } }
        }
        if (p.kind === 'op') {
            g.strokeStyle = '#1F2329'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-1, -6.2); g.lineTo(-1, 6.2); g.stroke();
            g.fillStyle = '#1F2329'; g.beginPath(); g.arc(-1, -6.2, 1.8, 0, 7); g.arc(-1, 6.2, 1.8, 0, 7); g.fill();
            g.beginPath(); g.moveTo(-1, 6.2); g.quadraticCurveTo(4, 7, 5.5, 3); g.stroke();
        }
        // objetos en la mano
        if (p.hold === 'coffee') {
            const c = p.seated ? h1 : h2;
            g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(c.x + 1.5, c.y, 2.9, 0, 7); g.fill();
            g.fillStyle = '#6B3E26'; g.beginPath(); g.arc(c.x + 1.5, c.y, 1.9, 0, 7); g.fill();
        }
        if (p.phone) {
            g.fillStyle = '#1F2329'; rrect(g, 8, -2.6, 4, 6, 1); g.fill();
            g.fillStyle = 'rgba(140,200,255,.9)'; g.fillRect(8.6, -2, 2.8, 4.6);
        }
        g.restore();
    }
    function drawBag(p) {
        const g = ctx;
        g.save(); g.globalAlpha = p.alpha;
        if (p.seated) {
            g.translate(p.x + 1, p.y - 28);
            g.fillStyle = 'rgba(0,0,0,.18)'; rrect(g, -6, -3, 14, 10, 2); g.fill();
            g.fillStyle = p.bagCol; rrect(g, -7, -5, 14, 10, 2.5); g.fill();
            g.fillStyle = shade(p.bagCol, 0.25); g.fillRect(-5, -1, 10, 1.4);
        } else {
            g.translate(p.x, p.y); g.rotate(p.a);
            g.strokeStyle = '#3A3F46'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-10, 9); g.lineTo(-1, 10); g.stroke();
            g.fillStyle = 'rgba(0,0,0,.18)'; rrect(g, -24, 6, 14, 11, 2); g.fill();
            g.fillStyle = p.bagCol; rrect(g, -25, 4, 14, 10, 2.5); g.fill();
            g.fillStyle = shade(p.bagCol, 0.25); g.fillRect(-23, 8, 10, 1.4);
        }
        g.restore();
    }
    function drawMachine() {
        const g = ctx, m = MACH;
        g.fillStyle = 'rgba(0,0,0,.2)'; rrect(g, m.x - 2, m.y + 3, m.w, m.h, 4); g.fill();
        g.fillStyle = '#1E2A36'; rrect(g, m.x, m.y, m.w, m.h, 4); g.fill();
        g.fillStyle = '#B3202E'; rrect(g, m.x + 16, m.y + 3, 15, m.h - 6, 3); g.fill();
        g.save(); g.translate(m.x + 23.5, m.y + m.h / 2); g.rotate(-Math.PI / 2);
        g.fillStyle = '#FFF8EE'; g.font = `800 7px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('CAFÉ  $1.000', 0, 0.5); g.restore();
        // pantalla
        const t = mach.t, on = mach.brewing;
        g.fillStyle = on ? (t < 1 ? '#F5B800' : t < 3.4 ? '#4FD1A1' : '#8FD2FF') : '#2E9B5B';
        rrect(g, m.x + 3, m.y + 7, 10, 14, 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(m.x + 5, m.y + 10, 6, 1.2); g.fillRect(m.x + 5, m.y + 14, 4, 1.2);
        // ranura del billete
        g.fillStyle = '#0B1F33'; g.fillRect(m.x + 1, m.y + 24, 3, 9);
        // dispensador
        g.fillStyle = '#0D1720'; rrect(g, m.x + 2, m.y + 36, 12, 14, 2); g.fill();
        if (on && t > 0.9) {
            const k = clamp((t - 1) / 2.4, 0, 1);
            g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(m.x + 8, m.y + 43, 4.2, 0, 7); g.fill();
            g.fillStyle = '#6B3E26'; g.beginPath(); g.arc(m.x + 8, m.y + 43, 3 * k, 0, 7); g.fill();
            if (t < 3.4) { g.strokeStyle = 'rgba(107,62,38,.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(m.x + 8, m.y + 37); g.lineTo(m.x + 8, m.y + 42); g.stroke(); }
        }
    }
    function drawMonitor() {
        const g = ctx, glow = op.typing > 0 || op.busy;
        g.fillStyle = '#1A1F25'; rrect(g, 282, 86, 36, 7, 2); g.fill();
        g.fillStyle = glow ? 'rgba(143,210,255,.55)' : 'rgba(143,210,255,.25)';
        g.beginPath(); g.moveTo(284, 86); g.lineTo(316, 86); g.lineTo(312, 74); g.lineTo(288, 74); g.closePath(); g.fill();
    }
    function drawDoor() {
        const g = ctx;
        g.strokeStyle = 'rgba(160,205,235,.95)'; g.lineWidth = 3.4; g.lineCap = 'round';
        g.save(); g.translate(268, 603); g.rotate(-doorA * 1.33); g.beginPath(); g.moveTo(0, 0); g.lineTo(31, 0); g.stroke(); g.restore();
        g.save(); g.translate(332, 603); g.rotate(Math.PI + doorA * 1.33); g.beginPath(); g.moveTo(0, 0); g.lineTo(31, 0); g.stroke(); g.restore();
        g.lineCap = 'butt';
    }
    function drawTrees() {
        const g = ctx, v = view();
        [-400, 70, 540, 1010].forEach(tx => {
            if (tx < v.l - 40 || tx > v.r + 40) return;
            const ty = 644;
            g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(tx + 6, ty + 8, 27, 0, 7); g.fill();
            g.fillStyle = '#2F7A40'; g.beginPath(); g.arc(tx, ty, 26, 0, 7); g.fill();
            g.fillStyle = '#3E8E4E';
            [[-9, -7, 13], [9, -5, 12], [-4, 9, 12], [10, 9, 10]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(tx + dx, ty + dy, r, 0, 7); g.fill(); });
            g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(tx - 7, ty - 8, 9, 0, 7); g.fill();
        });
    }
    function drawFx() {
        const g = ctx;
        fx.forEach(f => {
            const k = f.t / f.life;
            if (f.k === 'bill') {
                const e = ease(clamp(k / 0.85, 0, 1));
                g.save(); g.translate(lerp(f.x0, f.x1, e), lerp(f.y0, f.y1, e)); g.rotate(-0.3 + e * 0.3);
                g.globalAlpha = 1 - clamp((k - 0.8) / 0.2, 0, 1);
                g.fillStyle = '#5E9E6E'; rrect(g, -6, -3.5, 12, 7, 1); g.fill();
                g.fillStyle = '#D9EBD9'; g.fillRect(-2, -1.6, 4, 3.2);
                g.restore();
            } else if (f.k === 'steam') {
                g.fillStyle = `rgba(255,255,255,${(0.55 * (1 - k)).toFixed(3)})`;
                g.beginPath(); g.arc(f.x + Math.sin(f.t * 6) * 2, f.y - k * 12, 2 + k * 3, 0, 7); g.fill();
            }
        });
        street.forEach(s => {
            if (s.honk > 0) {
                g.strokeStyle = `rgba(245,184,0,${(s.honk / 0.6).toFixed(3)})`; g.lineWidth = 1.6;
                for (let i = 1; i <= 2; i++) { g.beginPath(); g.arc(s.x + s.car.len / 2 + 2, s.y, 6 * i + (0.6 - s.honk) * 10, -0.6, 0.6); g.stroke(); }
            }
        });
    }

    /* ---------- etiquetas y globos (en pantalla, siempre legibles) ---------- */
    function w2s(x, y) { const s = base * cam.z; return { x: (x - cam.x) * s + cssW / 2, y: (y - cam.y) * s + cssH / 2 }; }
    function bubble(g, x, y, text, kind, alpha) {
        g.save(); g.globalAlpha = alpha;
        g.font = `700 12px ${FONT}`;
        const w = g.measureText(text).width + 16, h = 24;
        let bx = clamp(x - w / 2, 6, cssW - w - 6), by = y - h - 8;
        const bgc = kind === 'call' ? '#F5B800' : kind === 'op' ? '#0B1F33' : '#FFFFFF';
        const fg = kind === 'op' ? '#FFFFFF' : '#0B1F33';
        g.fillStyle = 'rgba(11,31,51,.18)'; rrect(g, bx + 1, by + 2, w, h, 12); g.fill();
        g.fillStyle = bgc; rrect(g, bx, by, w, h, 12); g.fill();
        g.beginPath(); g.moveTo(x - 5, by + h - 0.5); g.lineTo(x + 5, by + h - 0.5); g.lineTo(x, by + h + 6); g.closePath(); g.fill();
        g.fillStyle = fg; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, bx + 8, by + h / 2 + 0.5);
        g.restore();
    }
    function tag(g, x, y, text, bgc, fg) {
        g.font = `800 11px ${FONT}`;
        const w = g.measureText(text).width + 12;
        g.fillStyle = bgc; rrect(g, x - w / 2, y - 9, w, 18, 9); g.fill();
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
    }
    function drawOverlay() {
        const g = ctx;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        street.forEach(s => {
            if (s.stage === 'out' && s.x > W + 40) return;
            const q = w2s(s.x, s.y + 22);
            tag(g, q.x, q.y, `Móvil ${s.car.n}`, s.car.trip && s.car.trip.p.vos ? '#1769AA' : '#0B1F33', '#FFFFFF');
        });
        people.forEach(p => {
            if (p.vos && !p.gone) { const q = w2s(p.x, p.y + 17); tag(g, q.x, q.y, 'Vos', '#1769AA', '#FFFFFF'); }
        });
        const all = people.concat([op]).filter(p => p.bubble);
        all.forEach(p => {
            const b = p.bubble, a = Math.min(1, b.t / 0.15, (b.dur - b.t) / 0.25);
            const q = w2s(p.x, p.y - 12);
            bubble(g, q.x, q.y, b.text, b.kind, clamp(a, 0, 1));
        });
    }

    function draw() {
        const g = ctx, s = base * cam.z, v = view();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = '#16293D'; g.fillRect(0, 0, cv.width, cv.height);
        g.setTransform(s * dpr, 0, 0, s * dpr, (cssW / 2 - cam.x * s) * dpr, (cssH / 2 - cam.y * s) * dpr);
        // calle y vereda continúan fuera del local
        const L = v.l - 20, R = v.r + 20;
        g.fillStyle = '#394148'; g.fillRect(L, 666, R - L, 200);
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (let x = Math.floor(L / 46) * 46 + 10; x < R; x += 46) g.fillRect(x, 721, 24, 3);
        g.fillStyle = '#CDD4DB'; g.fillRect(L, 608, R - L, 58);
        g.strokeStyle = 'rgba(120,132,145,.25)'; g.lineWidth = 1;
        for (let x = Math.floor(L / 30) * 30; x < R; x += 30) { g.beginPath(); g.moveTo(x, 608); g.lineTo(x, 662); g.stroke(); }
        for (let y = 608; y < 662; y += 27) { g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
        g.fillStyle = '#9AA4AF'; g.fillRect(L, 662, R - L, 5);
        g.fillStyle = '#F5B800'; g.fillRect(150, 666, 360, 3);
        // locales vecinos
        if (L < 0) { g.fillStyle = '#22374C'; g.fillRect(L, 0, -L, 608); }
        if (R > W) { g.fillStyle = '#22374C'; g.fillRect(W, 0, R - W, 608); }
        g.drawImage(bg, 0, 0, W, H);

        traffic.forEach(t => (t.bus ? drawBus(g, t) : drawCar(g, t.x, t.y, Math.PI, t)));
        street.forEach(s => drawCar(g, s.x, s.y, 0, { len: s.car.len, wid: s.car.wid, color: s.car.color, type: s.car.type, num: s.car.n, hazard: s.stage === 'park' }));
        drawMachine(); drawMonitor(); drawDoor();
        const list = people.concat([op]).sort((a, b) => a.y - b.y);
        list.forEach(p => { if (p.bag) drawBag(p); });
        list.forEach(drawPerson);
        drawFx();
        drawTrees();
        drawOverlay();
    }

    /* ---------- dibujo: pantalla de la central ---------- */
    let mW = 0, mH = 0, mdpr = 1;
    const MM = 18;
    const nx = i => MM + (i * (mW - 2 * MM)) / COLS;
    const ny = j => MM + (j * (mH - 2 * MM)) / ROWS;
    function carXY(c) { return { x: lerp(nx(c.i), nx(c.ti), c.k), y: lerp(ny(c.j), ny(c.tj), c.k) }; }
    const STATE_COL = { libre: '#2FA36B', asignado: '#F5B800', puerta: '#F5B800', viaje: '#8A97A6' };
    function drawMap() {
        const g = mctx;
        g.setTransform(mdpr, 0, 0, mdpr, 0, 0);
        g.fillStyle = '#D3DBE3'; g.fillRect(0, 0, mW, mH);
        const bw = (mW - 2 * MM) / COLS, bh = (mH - 2 * MM) / ROWS, gap = 4;
        for (let i = -1; i <= COLS; i++) for (let j = -1; j <= ROWS; j++) {
            g.fillStyle = PARKS.includes(i + ',' + j) ? '#CFE6D3' : '#F7F9FB';
            rrect(g, nx(i) + gap, ny(j) + gap, bw - 2 * gap, bh - 2 * gap, 3); g.fill();
        }
        g.strokeStyle = '#F2D675'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(0, ny(BASE.j)); g.lineTo(mW, ny(BASE.j)); g.moveTo(nx(BASE.i), 0); g.lineTo(nx(BASE.i), mH); g.stroke();
        // recorridos de los asignados
        cars.filter(c => c.state === 'asignado').forEach(c => {
            const mine = vos.car === c;
            const pts = [carXY(c), { x: nx(c.ti), y: ny(c.tj) }].concat(c.path.map(n => ({ x: nx(n.i), y: ny(n.j) })));
            g.setLineDash([6, 5]); g.lineDashOffset = -clock * 24;
            g.strokeStyle = mine ? '#1769AA' : 'rgba(214,150,0,.85)'; g.lineWidth = mine ? 3.2 : 2.2;
            g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke();
            g.setLineDash([]);
        });
        // base
        const bx = nx(BASE.i), by = ny(BASE.j), pr = (clock * 0.8) % 1;
        g.strokeStyle = `rgba(23,105,170,${(0.5 * (1 - pr)).toFixed(3)})`; g.lineWidth = 2;
        g.beginPath(); g.arc(bx, by, 10 + pr * 16, 0, 7); g.stroke();
        g.fillStyle = '#0B1F33'; g.beginPath(); g.arc(bx, by, 10, 0, 7); g.fill();
        g.fillStyle = '#F5B800'; g.font = `800 10px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', bx, by + 0.5);
        // móviles
        cars.forEach(c => {
            const q = carXY(c);
            if (c.ti !== c.i || c.tj !== c.j) c.ang = Math.atan2(ny(c.tj) - ny(c.j), nx(c.ti) - nx(c.i));
            let x = q.x, y = q.y;
            if (c.state === 'puerta') {
                const k = cars.filter(o => o.state === 'puerta').indexOf(c);
                x = bx + 16 + k * 17; y = by - 12;
            }
            g.save(); g.translate(x, y); g.rotate(c.ang);
            const blink = c.state === 'puerta' && Math.sin(clock * 8) < 0;
            g.fillStyle = blink ? '#FFFFFF' : STATE_COL[c.state];
            rrect(g, -7, -4, 14, 8, 2.6); g.fill();
            g.strokeStyle = vos.car === c ? '#1769AA' : '#FFFFFF'; g.lineWidth = vos.car === c ? 2 : 1.3; g.stroke();
            g.restore();
            if (c.state === 'asignado' || c.state === 'puerta') {
                g.font = `800 10px ${FONT}`;
                const t = 'M' + c.n, w = g.measureText(t).width + 10;
                g.fillStyle = vos.car === c ? '#1769AA' : '#0B1F33'; rrect(g, x - w / 2, y - 21, w, 15, 7.5); g.fill();
                g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.fillText(t, x, y - 13);
            }
        });
    }

    /* ---------- tamaño ---------- */
    function resize() {
        const w = cv.parentElement.clientWidth;
        const maxH = Math.max(420, window.innerHeight * 0.78);
        cssW = w; cssH = Math.min(Math.round((w * H) / W), Math.round(maxH));
        base = Math.min(cssW / W, cssH / H);
        dpr = Math.min(2.5, window.devicePixelRatio || 1);
        cv.style.height = cssH + 'px';
        cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
        const res = clamp(base * dpr * 1.8, 1, 3.4);
        if (!bg || Math.abs(res - bgRes) > 0.25) buildBg(res);
        clampCam();
        const mw = mapCv.parentElement.clientWidth;
        mW = mw; mH = Math.round(mw * 0.62); mdpr = Math.min(2.5, window.devicePixelRatio || 1);
        mapCv.style.height = mH + 'px';
        mapCv.width = Math.round(mW * mdpr); mapCv.height = Math.round(mH * mdpr);
    }

    /* ---------- panel: "Probalo vos" y novedades ---------- */
    const STEPS = [
        ['entrar', 'Entrás al local'],
        ['cafe', 'Café de la máquina · $1.000'],
        ['ventanilla', 'Pedís en la ventanilla'],
        ['asignado', 'El operador te asigna un chofer'],
        ['camino', 'El móvil viene en camino'],
        ['puerta', 'Tu remís está en la puerta'],
        ['viaje', '¡Buen viaje!']
    ];
    function vosStep(key, st) {
        const li = document.querySelector(`#vivo-steps li[data-step="${key}"]`);
        if (!li) return;
        li.classList.remove('active', 'done', 'skip');
        li.classList.add(st);
    }
    function vosDetail(key, text) {
        const el = document.querySelector(`#vivo-steps li[data-step="${key}"] small`);
        if (el) el.textContent = text;
    }
    function vosAssigned(c) {
        vos.car = c;
        vosStep('asignado', 'done');
        const other = vos.trip && c.type !== vos.trip.vtype ? ` (no había ${typeName[vos.trip.vtype]} libre cerca)` : '';
        vosDetail('asignado', `Móvil ${c.n} · ${c.name} · ${c.model} · a ${vos.trip.km} km${other}`);
        vosStep('camino', 'active');
    }
    function vosFinish() {
        vos.active = false;
        const end = $('vivo-end');
        if (end) end.hidden = false;
        vosDetail('viaje', `Saliste hacia ${vos.dest.label} ${vos.dest.icon} en el móvil ${vos.car ? vos.car.n : ''}.`);
        $('vivo-again') && $('vivo-again').focus({ preventScroll: true });
    }
    function startVos() {
        if (vos.active) return;
        const dest = DESTS.find(d => d.id === chosen.dest);
        Object.assign(vos, { active: true, p: null, sc: null, car: null, trip: null, dest, vtype: chosen.type, coffee: $('vivo-coffee').checked });
        $('vivo-choose').hidden = true;
        $('vivo-status').hidden = false;
        $('vivo-end').hidden = true;
        $('vivo-status-title').textContent = `Tu viaje a ${dest.label}`;
        const ul = $('vivo-steps');
        ul.innerHTML = STEPS.filter(([k]) => k !== 'cafe' || vos.coffee)
            .map(([k, t]) => `<li data-step="${k}"><span>${t}<small></small></span></li>`).join('');
        vosStep('entrar', 'active');
        spawnT = Math.max(spawnT, 14);
        vos.p = spawnCustomer({ vos: true, dest, vtype: vos.vtype, coffee: vos.coffee, bag: dest.bag > 0.5, look: { shirt: '#1769AA', pants: '#1F2A36', name: 'Vos', hs: 'short' } });
        vos.p.x = view().l - 10;
        if (camMode === 'auto' && window.innerWidth < 950) cv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function resetVos() {
        Object.assign(vos, { active: false, p: null, sc: null, car: null, trip: null });
        $('vivo-status').hidden = true;
        $('vivo-choose').hidden = false;
    }
    const chosen = { dest: 'eze', type: 'sedan' };
    document.querySelectorAll('#en-vivo .vivo-chips').forEach(group => {
        group.addEventListener('click', e => {
            const b = e.target.closest('button[data-v]');
            if (!b) return;
            group.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            chosen[group.dataset.group] = b.dataset.v;
        });
    });
    $('vivo-go').addEventListener('click', startVos);
    $('vivo-again').addEventListener('click', resetVos);
    $('vivo-pause').addEventListener('click', e => {
        running = !running;
        e.currentTarget.setAttribute('aria-pressed', String(!running));
        e.currentTarget.textContent = running ? 'Pausa' : 'Seguir';
    });
    $('vivo-speed').addEventListener('click', e => {
        speed = speed === 1 ? 2 : 1;
        e.currentTarget.setAttribute('aria-pressed', String(speed === 2));
        e.currentTarget.textContent = speed === 2 ? 'Velocidad x1' : 'Velocidad x2';
    });
    const camBtn = $('vivo-cam');
    function syncCam() {
        camBtn.setAttribute('aria-pressed', String(camMode === 'auto'));
        camBtn.textContent = camMode === 'auto' ? 'Cámara automática' : 'Vista general';
    }
    camBtn.addEventListener('click', () => { camMode = camMode === 'auto' ? 'general' : 'auto'; syncCam(); });
    syncCam();

    const feedEl = $('vivo-feed');
    function hhmm() {
        const d = new Date(t0.getTime() + clock * TS * 1000);
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function feedAdd(text) {
        if (!feedEl) return;
        const li = document.createElement('li');
        li.innerHTML = `<time>${hhmm()}</time><span></span>`;
        li.lastChild.textContent = text;
        feedEl.prepend(li);
        while (feedEl.children.length > 5) feedEl.lastChild.remove();
    }
    let uiT = 0;
    function uiTick(dtR) {
        uiT += dtR;
        if (uiT < 0.4) return;
        uiT = 0;
        $('vivo-viajes').textContent = stats.viajes;
        $('vivo-cafes').textContent = stats.cafes;
        $('vivo-libres').textContent = cars.filter(c => c.state === 'libre').length;
        if (vos.active && vos.car && vos.car.state === 'asignado') vosDetail('camino', `Llega en ~${etaMin(vos.car)} min · mirá la pantalla de la central`);
        if (vos.active && vos.car && vos.car.state === 'puerta') vosDetail('camino', 'Llegó');
        if (vos.active && vos.trip && !vos.car) vosDetail('asignado', 'Buscando el móvil libre más cercano…');
    }

    /* ---------- arranque ---------- */
    let last = performance.now();
    function frame(now) {
        const dtR = Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        if (visible && !document.hidden) {
            if (running) { let rem = dtR * speed; while (rem > 1e-6) { const st = Math.min(0.05, rem); update(st); rem -= st; } }
            camTick(dtR);
            draw();
            drawMap();
            uiTick(dtR);
        }
        requestAnimationFrame(frame);
    }
    resize();
    feedAdd('Abrió la central de Madero Remises');
    seed();
    if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(cv.parentElement);
    else window.addEventListener('resize', resize);
    if (window.IntersectionObserver) new IntersectionObserver(es => { visible = es[0].isIntersecting; last = performance.now(); }, { rootMargin: '200px' }).observe(cv);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { bg = null; resize(); });
    requestAnimationFrame(frame);

    // para probar desde la consola
    window.__vivo = { stats, cars, people: () => people, queue, speed: s => (speed = s), vos };
})();
