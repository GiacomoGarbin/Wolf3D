const KEY_SHIFT = 16;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;
const KEY_SPACE = 32;
const KEY_CTRL = 17;

const HalfPI = Math.PI / 2;

let globals = {
    loaders: [], // files to load
    canvas2d: null, // top-down debug view
    canvas3d: null, // 3D view
    x: undefined,     // player position x
    y: undefined,     // player position y
    angle: undefined, // player direction
    grid: [], // level map grid
    rows: 0,  // grid rows
    cols: 0,  // grid cols
    size: 64, // grid cell size
    w: 0,     // grid width
    h: 0,     // grid height
    hits: [], // hit points, one per 3D view column
    palette: [],
    offsets: null,
    assets: null, // VSWAP.WL6
    levels: [],
    level: 0, // current level index
    activeCells: [],
    visibles: new Set(), // visible cells
    sprites: [],
    entities: [],
    fov: HalfPI / 2, // field of view
    keys: {
        KEY_SHIFT: false,
        KEY_LEFT: false,
        KEY_RIGHT: false,
        KEY_A: false,
        KEY_D: false,
        KEY_S: false,
        KEY_W: false,
        KEY_SPACE: false,
        KEY_CTRL: false,
    },
    isSpaceKeyDown: false,
    isCtrlKeyDown: false,
    weaponTextureIndex: 421,
    weaponAnim: {
        frames: [421, 422, 423, 424, 425, 421],
        duration: 600, // milliseconds
        elapsed: 600,
    },
    enemies: []
}

// cell type
const CT_CELL = 0; // base class represents empty cells
const CT_WALL = 1;
const CT_DOOR = 2;
const CT_PUSH = 3; // push walls

class Cell {
    constructor(row, col, textureIndex) {
        this.row = row;
        this.col = col;
        this.x = col * globals.size;
        this.y = row * globals.size;
        this.textureIndex = textureIndex;
        this.entities = []; // index of globals.entities
    }

    getType() {
        return CT_CELL;
    }

    isWall() {
        return this.getType() == CT_WALL; // or isPushWall()
    }

    isDoor() {
        return this.getType() == CT_DOOR;
    }

    isPushWall() {
        return this.getType() == CT_PUSH;
    }

    isWalkable() {
        return (106 <= this.textureIndex) && (this.textureIndex <= 143);
    }

    getTextureIndex() {
        return this.textureIndex;
    }
};

class Wall extends Cell {
    constructor(row, col, textureIndex) {
        super(row, col, textureIndex);

        this.bIsPushable = false;
    }

    getType() {
        return CT_WALL;
    }

    setIsPushable(b) {
        this.bIsPushable = b;
    }

    getIsPushable() {
        return this.bIsPushable;
    }
};

// door status
const DS_CLOSED = 0;
const DS_OPENING = 1;
const DS_OPEN = 2;

class Door extends Cell {
    constructor(row, col, textureIndex) {
        super(row, col, textureIndex);

        this.status = DS_CLOSED;
        this.progress = 0; // [0,1] = [completely closed, fully open]
    }

    getType() {
        return CT_DOOR;
    }

    getStatus() {
        return this.status;
    }

    setStatus(status) {
        this.status = status;
    }

    getProgress() {
        return this.progress;
    }

    setProgress(progress) {
        this.progress = progress;
    }

    isClosed() {
        return this.status == DS_CLOSED;
    }

    isOpening() {
        return this.status == DS_OPENING;
    }

    isOpen() {
        return this.status == DS_OPEN;
    }
};

// push wall status
const PW_READY = 0;
const PW_MOVING = 1;
const PW_MOVED = 2;

class PushWall extends Wall {
    constructor(row, col, textureIndex) {
        super(row, col, textureIndex);

        this.status = PW_READY;
        this.progress = 0; // [0,1]

        // the push wall moves backward until it hits another wall or completes the steps
        this.steps = 0; // how many cell should move? possibly always 2
        this.dir = undefined;
        this.target = undefined; // target cell
    }

    getType() {
        return CT_PUSH;
    }

    getStatus() {
        return this.status;
    }

    setStatus(status) {
        this.status = status;
    }

    getProgress() {
        return this.progress;
    }

    setProgress(progress) {
        this.progress = progress;
    }

    getMoveDir() {
        return this.dir;
    }

    setMoveDir(dir) {
        this.dir = dir;
    }

    getTargetCell() {
        return this.target;
    }

    setTargetCell(target) {
        this.target = target;
    }

    isReady() {
        return this.status == PW_READY;
    }

    isMoving() {
        return this.status == PW_MOVING;
    }

    hasMoved() {
        return this.status == PW_MOVED;
    }
};

// any "entity" (enemies, collectables, probs) in the map 

// entity type
const ET_ENTITY = 0;
const ET_ENEMY = 1;

class Entity { // TODO: should be abstract
    constructor(x, y, index, orientable, blocking, collectable) {
        this.x = x;
        this.y = y;
        this.index = index; // base texture index
        this.orientable = orientable;
        this.blocking = blocking;
        this.collectable = collectable;
    }

    GetType() {
        return ET_ENTITY;
    }

    IsEnemy() {
        return this.GetType() == ET_ENEMY;
    }
};

class Enemy extends Entity {
    constructor(x, y, index, offset, deathAnim) {
        const orientable = true;
        const blocking = false;
        const collectable = false;
        super(x, y, index, orientable, blocking, collectable);

        this.offset = offset;
        this.bIsAlive = true;
        // this.life = 1; // [0, 1]
        this.deathAnim = deathAnim;
    }

    GetType() {
        return ET_ENEMY;
    }

    die() {
        this.bIsAlive = false;
    }

    IsAlive() {
        return this.bIsAlive;
    }
};

class Guard extends Enemy {
    constructor(x, y, offset) {
        const index = 50;
        const deathAnim = {
            frames: [90, 91, 92, 93, 95],
            duration: 500, // milliseconds
            elapsed: 0,
        };
        super(x, y, index, offset, deathAnim);
    }
};

const CHUNKS = 663;
const WALLS = 106;
const SPRITES = 436;
const SOUNDS = 121;

function loadAssets(buffer) {
    const view = new DataView(buffer);
    globals.assets = view;

    // sanity checks
    {
        // total number of chunks = walls + sprites + sounds
        const chunks = view.getUint16(0, true);
        console.assert(chunks == CHUNKS);

        // first sprite chunk
        const walls = view.getUint16(2, true);
        console.assert(walls == WALLS);

        // first sound chunk (- walls)
        const sprites = view.getUint16(4, true) - walls;
        console.assert(sprites == SPRITES);

        const sounds = chunks - walls - sprites;
        console.assert(sounds == SOUNDS);
    }
}

// i: wall index
// j: texel index
function getWall(i, j) {
    console.assert((0 <= i) && (i < WALLS));
    console.assert((0 <= j) && (j < (64 * 64)));

    // TODO: profile getUint*
    const offset = globals.assets.getUint32(6 + i * 4, true);
    return globals.assets.getUint8(offset + j);
}

function isInQ1(angle) {
    return (angle >= 0) && (angle < HalfPI);
}

function isInQ4(angle) {
    return (angle >= (3 * HalfPI)) && (angle < (2 * Math.PI));
}

function drawSprite(sprite, hits, pixels) {
    const sw = 64; // sprite width
    const sh = 64; // sprite height

    const w = globals.canvas3d.width;
    const h = globals.canvas3d.height;

    // grid (world) space -> player (camera) space
    const [dx, dy] = [globals.x, globals.y];
    let [px, py] = translate([sprite.x, sprite.y], [-dx, -dy]);
    [px, py] = rotate([px, py], -globals.angle);

    const distance = px;
    // near clipping plane
    const near = 15;

    if (distance <= near) {
        return;
    }

    const height = getHeight(distance);

    // find sprite screen space horizontal position
    {
        const hx = sprite.x - globals.x;
        const hy = sprite.y - globals.y;

        let p = Math.atan2(-hy, hx);

        if (p >= (2 * Math.PI)) {
            p -= 2 * Math.PI;
        } else if (p < 0) {
            p += 2 * Math.PI;
        }

        // convert player angle from clockwise to counterclockwise
        const a = (globals.angle == 0) ? 0 : (2 * Math.PI - globals.angle);

        let q = a + (globals.fov / 2) - p;

        if (isInQ1(a) && isInQ4(p)) {
            q += 2 * Math.PI;
        } else if (isInQ4(a) && isInQ1(p)) {
            q -= 2 * Math.PI;
        }

        px = q * (globals.canvas3d.width / globals.fov);
    }

    const ho = Math.round(px) - (height) / 2;
    const vo = (h - height) / 2;

    const i = sprite.textureIndex;
    console.assert((0 <= i) && (i < SPRITES));

    const offset = globals.assets.getUint32(6 + (WALLS + i) * 4, true);
    // const size = globals.assets.getUint16(6 + (CHUNKS * 4) + (WALLS + i) * 2, true);

    const c0 = globals.assets.getUint16(offset + 0, true);
    const c1 = globals.assets.getUint16(offset + 2, true);
    console.assert((0 <= c0) && (c0 < sw) && (0 <= c1) && (c1 < sw));
    const cn = c1 - c0 + 1;

    const s0 = height / sh;
    const s1 = Math.ceil(s0);

    let k = 0;

    for (let col = c0; col <= c1; ++col) {
        const i = globals.assets.getUint16(offset + 4 + (col - c0) * 2, true);

        let j = 0;
        let x = globals.assets.getUint16(offset + i + (j * 6 + 0), true);
        // let y = undefined;
        let z = undefined;

        while (x != 0) { // column "commands" loop (blocks of opaque texels in a column)
            // y = globals.assets.getUint16(offset + i + (j * 6 + 2), true);
            z = globals.assets.getUint16(offset + i + (j * 6 + 4), true);

            const r0 = z / 2;
            const r1 = x / 2;

            for (let row = r0; row < r1; ++row) {
                let tx = ho + Math.floor(col * s0);
                let ty = vo + Math.floor(row * s0);

                if (((ty + s1) < 0) || (ty >= h) || ((tx + s1) < 0) || (tx >= w)) {
                    ++k;
                    continue;
                }

                tx = Math.max(0, Math.min(tx, w - 1));
                ty = Math.max(0, Math.min(ty, h - 1));

                const index = globals.assets.getUint8(offset + 4 + cn * 2 + k);
                const color = globals.palette[index];

                for (let x0 = tx; (x0 < (tx + s1)) && (x0 < w); ++x0) {
                    if ((x0 < hits.length) && (hits[x0].distance < distance)) {
                        continue;
                    }

                    for (let y0 = ty; (y0 < (ty + s1)) && (y0 < h); ++y0) {
                        const t = ((vo + height - (y0 - vo)) * globals.canvas3d.width + x0) * 4;
                        pixels[t + 0] = color.r;
                        pixels[t + 1] = color.g;
                        pixels[t + 2] = color.b;
                        pixels[t + 3] = 255;
                    }
                }

                ++k;
            }

            ++j;
            x = globals.assets.getUint16(offset + i + (j * 6 + 0), true);
        }
    }
}

function loadPalette(buffer) {
    console.assert(buffer.byteLength == 893);

    const size = 256 * 3; // 256 rbg colors
    const offset = buffer.byteLength - size - 6;
    const array = new Uint8Array(buffer.slice(offset, offset + size));

    for (let i = 0; i < 256; ++i) {
        const color = {
            // max channel value ~64, then multiply by 4 to get brighter colors
            r: array[i * 3 + 0] * 4,
            g: array[i * 3 + 1] * 4,
            b: array[i * 3 + 2] * 4,
        };
        globals.palette.push(color);
    }
}

function loadMapHead(buffer) {
    const view = new DataView(buffer);
    console.assert(view.getUint16(0, true) == 0xABCD);

    globals.offsets = view;
}

function rlew(view) {
    const token = 0xABCD;
    const size = view.getUint16(0, true); // decoded data byte size

    let buffer = new ArrayBuffer(size);
    let output = new DataView(buffer);

    let i = 2; // input view offset
    let j = 0; // output view offset

    try {
        while (i < view.byteLength) {
            const word = view.getUint16(i, true);
            i += 2;
            if (word == token) {
                const n = view.getUint16(i, true);
                const x = view.getUint16(i + 2, true);
                i += 4;
                for (let k = 0; k < n; ++k) {
                    output.setUint16(j, x, true);
                    j += 2;
                }
            } else {
                output.setUint16(j, word, true);
                j += 2;
            }
        }
    } catch (error) {
        return null;
    }

    return output;
}

function carmack(view) {
    const size = view.getUint16(0, true); // decoded data byte size

    let buffer = new ArrayBuffer(size);
    let output = new DataView(buffer);

    let i = 2; // input view offset
    let j = 0; // output view offset

    try {
        while (i < view.byteLength) {
            const x = view.getUint8(i + 1);
            if ((x == 0xA7) || (x == 0xA8)) { // possibly a pointer
                const n = view.getUint8(i);
                if (n == 0) { // exception (not really a pointer)
                    const y = view.getUint8(i + 2);
                    output.setUint8(j, y);
                    output.setUint8(j + 1, x);
                    i += 3;
                    j += 2;
                } else if (x == 0xA7) { // near pointer
                    const offset = 2 * view.getUint8(i + 2);
                    for (let k = 0; k < n; ++k) {
                        const word = output.getUint16(j - offset, true);
                        output.setUint16(j, word, true);
                        j += 2;
                    }
                    i += 3;
                } else { // far pointer
                    const offset = 2 * view.getUint16(i + 2, true);
                    for (let k = 0; k < n; ++k) {
                        const word = output.getUint16(offset + 2 * k, true);
                        output.setUint16(j, word, true);
                        j += 2;
                    }
                    i += 4
                }
            } else {
                const word = view.getUint16(i, true);
                output.setUint16(j, word, true);
                i += 2;
                j += 2;
            }
        }
    } catch (error) {
        return null;
    }

    return output;
}

function decode(view) {
    // @vpoupet: "each plane data is compressed by RLEW compression followed by Carmack compression"
    // so we need first decode Carmack and then decode RLEW
    return rlew(carmack(view));
}

function loadLevel(buffer, i) {
    let level = {
        header: null,
        planes: new Array(3),
    };

    const offset = globals.offsets.getUint32(2 + 4 * i, true);
    level.header = new DataView(buffer, offset, 42);

    let view = undefined;

    view = new DataView(
        buffer,
        level.header.getUint32(0, true),
        level.header.getUint16(12, true),
    );
    level.planes[0] = decode(view);

    view = new DataView(
        buffer,
        level.header.getUint32(4, true),
        level.header.getUint16(14, true),
    );
    level.planes[1] = decode(view);

    level.planes[2] = [];
    for (let i = 0; i < 64; i++) {
        let row = Array(64);
        row.fill(false);
        level.planes[2].push(row);
    }

    return level;
}

function loadGameMaps(buffer) {
    for (let i = 0; i < 60; ++i) {
        const level = loadLevel(buffer, i);
        globals.levels.push(level);
    }
}

function markLoadDone(loaders, name) {
    for (let loader of loaders) {
        if (loader.name == name) {
            loader.done = true;
            return true;
        }
        if (markLoadDone(loader.next, name)) {
            return true;
        }
    }
    return false;
}

function loadFile(name, func, next) {
    const req = new XMLHttpRequest();

    req.open("GET", "/data/" + name, true);
    req.responseType = "arraybuffer";

    req.onload = (event) => {
        const buffer = req.response;
        if (buffer) {
            func(buffer);
        }
    };

    req.onloadend = (event) => {
        markLoadDone(globals.loaders, name);
        isEngineReady();

        for (const loader of next) {
            loadFile(loader.name, loader.func, loader.next);
        }
    };

    req.send(null);
}

function getPaletteColor(i, j) {
    const k = getWall(i, j);
    return globals.palette[k];
}

function main() {
    let gl2d = init2d();
    let gl3d = init3d();

    // init player position and direction

    const level = globals.levels[globals.level];
    const plane = level.planes[1];

    for (let row = 0; row < globals.rows; row++) {
        for (let col = 0; col < globals.cols; col++) {
            const i = row * globals.cols + col;
            const v = plane.getUint16(i * 2, true);
            if ((19 <= v) && (v <= 22)) {
                // set position
                globals.x = (col + 0.5) * globals.size;
                globals.y = (row + 0.5) * globals.size;
                // set angle
                switch (v) {
                    case 19:
                        globals.angle = 3 * HalfPI;
                        break;
                    case 20:
                        globals.angle = 0;
                        break;
                    case 21:
                        globals.angle = HalfPI;
                        break;
                    case 22:
                        globals.angle = Math.PI;
                        break;
                }
                break;
            }
        }
        if ((globals.x != undefined) && (globals.y != undefined)) {
            break;
        }
    }

    console.assert((globals.x != undefined) && (globals.y != undefined) && (globals.angle != undefined));

    // bind keyboard events
    document.onkeydown = shortcuts;
    document.onkeyup = shortcuts;

    stats = {
        element: document.getElementById("stats"),
        frames: 0,
        elapsed: 0.0,
    };

    prevTime = 0.0

    function render(currTime) {
        const dt = currTime - prevTime;
        prevTime = currTime;

        // update stats
        updateStats(stats, dt);

        // process input
        processInput(dt);

        if (gl2d.gl != null) {
            // debug top-down view
            gl2d.buffers = updateBuffers(gl2d.gl, gl2d.buffers);
            // draw2dScene(gl2d.gl, gl2d.programInfo, gl2d.buffers);
        }

        updateActiveCells(dt, gl2d);

        updateWeaponAnimation(dt);

        updateEnemyAnimation(dt);

        updateTexture(gl3d);
        draw3dScene(gl3d.gl, gl3d.buffers, gl3d.programInfo, gl3d.texture);

        if (gl2d.gl != null) {
            draw2dScene(gl2d.gl, gl2d.programInfo, gl2d.buffers);
        }

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

function updateWeaponAnimation(dt) {
    if (globals.weaponAnim.elapsed < globals.weaponAnim.duration) {
        const d = globals.weaponAnim.duration / globals.weaponAnim.frames.length;
        const i = Math.floor(globals.weaponAnim.elapsed / d);
        globals.weaponTextureIndex = globals.weaponAnim.frames[i];
        globals.weaponAnim.elapsed += dt;
    } else {
        globals.weaponTextureIndex = 421;
        globals.weaponAnim.elapsed = globals.weaponAnim.duration;
    }
}

function updateEnemyAnimation(dt) {
    for (let i = globals.enemies.length - 1; i >= 0; --i) {
        let enemy = globals.enemies[i];
        let anim = enemy.deathAnim;
        if (anim.elapsed < anim.duration) {
            const d = anim.duration / anim.frames.length;
            const i = Math.floor(anim.elapsed / d);
            enemy.index = anim.frames[i];
            anim.elapsed += dt;
        } else {
            enemy.index = 95;
            anim.elapsed = anim.duration;
            globals.enemies.splice(i, 1);
        }
    }
}

// loop through active cells and update their status
function updateActiveCells(dt, gl2d) {
    for (let i = globals.activeCells.length - 1; i >= 0; --i) {
        let cell = globals.activeCells[i];

        if (cell.isDoor()) {
            switch (cell.getStatus()) {
                case DS_CLOSED:
                    console.assert(false);
                    break;
                case DS_OPENING:
                    const progress = cell.getProgress();
                    if (progress < 1) {
                        cell.setProgress(Math.min(progress + dt * 0.001, 1));
                    } else {
                        cell.setStatus(DS_OPEN);
                    }
                    break;
                case DS_OPEN:
                    // remove cell from active list
                    globals.activeCells.splice(i, 1);
                    break;
            }
        } else if (cell.isPushWall()) {
            switch (cell.getStatus()) {
                case PW_READY:
                    console.assert(false);
                    break;
                case PW_MOVING:
                    const progress = cell.getProgress();
                    if (progress < 1) {
                        cell.setProgress(Math.min(progress + dt * 0.001, 1));
                    } else {
                        const target = cell.getTargetCell();
                        let j = undefined;

                        switch (cell.getMoveDir()) {
                            case CD_DOWN:
                                if ((target.row + 1) < globals.rows) {
                                    j = (target.row + 1) * globals.cols + target.col;
                                }
                                break;
                            case CD_LEFT:
                                if ((target.col - 1) >= 0) {
                                    j = target.row * globals.cols + (target.col - 1);
                                }
                                break;
                            case CD_RIGHT:
                                if ((target.col + 1) < globals.cols) {
                                    j = target.row * globals.cols + (target.col + 1);
                                }
                                break;
                            case CD_UP:
                                if ((target.row - 1) >= 0) {
                                    j = (target.row - 1) * globals.cols + target.col;
                                }
                                break;
                        }

                        // next target
                        const dst = (j == undefined) ? undefined : globals.grid[j];

                        let wall = undefined;

                        if ((dst == undefined) || !dst.isWalkable()) {
                            wall = new Wall(target.row, target.col, cell.textureIndex);
                            // globals.activeCells.splice(i, 1);
                            // cell.setStatus(PW_MOVED);
                        } else {
                            wall = new PushWall(target.row, target.col, cell.textureIndex);
                            wall.setStatus(PW_MOVING);
                            wall.setMoveDir(cell.getMoveDir());
                            wall.setTargetCell(dst);
                        }

                        wall.entities = target.entities;

                        let empty = new Cell(cell.row, cell.col, target.textureIndex);
                        empty.entities = cell.entities;

                        const k = cell.row * globals.cols + cell.col;
                        const t = target.row * globals.cols + target.col;

                        // replace dst
                        globals.grid[t] = wall;

                        // replace src
                        globals.grid[k] = empty;

                        if ((dst == undefined) || !dst.isWalkable()) {
                            globals.activeCells.splice(i, 1);
                        } else {
                            globals.activeCells.splice(i, 1, globals.grid[t]);
                        }

                        // rebuild debug 2D view buffers
                        {
                            let walls = [];
                            let empty = [];

                            const half = globals.size / 2;

                            for (let row = 0; row < globals.rows; ++row) {
                                for (let col = 0; col < globals.cols; ++col) {
                                    const index = row * globals.cols + col;
                                    const cell = globals.grid[index];
                                    switch (cell.getType()) {
                                        case CT_WALL:
                                        case CT_PUSH:
                                            walls.push(cell.x + half, cell.y + half);
                                            break;
                                        case CT_CELL:
                                            empty.push(cell.x + half, cell.y + half);
                                            break;
                                    }
                                }
                            }

                            gl2d.gl.deleteBuffer(gl2d.buffers.walls.buffer);
                            gl2d.buffers.walls.buffer = createBuffer(gl2d.gl, walls);
                            gl2d.buffers.walls.count = walls.length / 2;

                            gl2d.gl.deleteBuffer(gl2d.buffers.empty.buffer);
                            gl2d.buffers.empty.buffer = createBuffer(gl2d.gl, empty);
                            gl2d.buffers.empty.count = empty.length / 2;
                        }
                    }
                    break;
                case PW_MOVED: // TODO: not used
                    // remove cell from active list
                    globals.activeCells.splice(i, 1);
                    break;
            }
        }
    }
}

function init2d() {
    let result = {
        gl: null,
        programInfo: null,
        buffers: null,
    };

    globals.canvas2d = document.getElementById("2d");
    const gl = globals.canvas2d.getContext('webgl');

    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return result;
    }

    const vsSource = `
    precision highp float;
    attribute vec4 aVertexPosition;
    uniform float uPointSize;
    void main(void) {
      gl_Position = aVertexPosition;
      gl_PointSize = uPointSize;
    }
  `;

    const fsSource = `
    precision highp float;
    uniform vec4 uFragColor;
    void main(void) {
      gl_FragColor = uFragColor;
    }
  `;

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
        },
        uniformLocations: {
            uFragColor: gl.getUniformLocation(shaderProgram, "uFragColor"),
            uPointSize: gl.getUniformLocation(shaderProgram, "uPointSize"),
        },
    };

    const buffers = initBuffers2dView(gl);

    result = {
        gl: gl,
        programInfo: programInfo,
        buffers: buffers,
    };

    return result;
}

function init3d() {
    let result = {
        gl: null,
        programInfo: null,
        buffers: null,
        texture: null,
    };

    globals.canvas3d = document.getElementById("3d");
    const gl = globals.canvas3d.getContext('webgl');

    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return result;
    }

    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying highp vec2 vTextureCoord;
    void main(void) {
      gl_Position = aVertexPosition;
      vTextureCoord = aTextureCoord;
    }
  `;

    const fsSource = `
    varying highp vec2 vTextureCoord;
    uniform sampler2D uSampler;
    void main(void) {
      gl_FragColor = texture2D(uSampler, vTextureCoord);
    }
  `;

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
        },
        uniformLocations: {
            uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
        },
    };

    buffers = initBuffers3dView(gl);

    result = {
        gl: gl,
        programInfo: programInfo,
        buffers: buffers,
        texture: null,
    };

    return result;
}

function getHeight(distance) {
    // TODO: scale based on 3D canvas aspect ratio
    const scale = globals.size * globals.canvas3d.width / (2 * globals.fov);
    return Math.round(scale / distance) * 2;
}

function updateTexture(gl3d) {
    const gl = gl3d.gl;

    gl.deleteTexture(gl3d.texture);

    gl3d.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gl3d.texture);

    const w = globals.canvas3d.width;
    const h = globals.canvas3d.height;
    const pixels = new Uint8Array(w * h * 4);

    // "draw" floor and ceiling

    for (var row = 0; row < h; ++row) {
        const half = row < (h / 2);
        const r = half ? 114 : 47;
        const g = half ? 112 : 46;
        const b = half ? 114 : 48;
        for (var col = 0; col < w; ++col) {
            const i = (row * w + col) * 4;
            pixels[i + 0] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
            pixels[i + 3] = 255;
        }
    }

    const tw = 64;
    const th = 64;

    // draw walls and doors

    for (var col = 0; col < w; ++col) {
        const hit = globals.hits[col];

        if ((hit.distance == Infinity) || (hit.distance <= 0.0)) {
            continue;
        }

        // pixels column height
        const height = getHeight(hit.distance);

        if (height == 0) {
            continue;
        }

        const offset = 0 + (h / 2) - (height / 2);

        const row0 = Math.max(0, offset);
        const row1 = Math.min(offset + height, h);

        const p = hit.bVerOrHor ? hit.py : hit.px;
        const c = Math.floor(p / globals.size) * globals.size;
        const side = (hit.bVerOrHor ? (hit.px - globals.x) : (hit.py - globals.y)) > 0; // 0 -> l/u, 1 -> r/d
        let u = (p - c) / globals.size; // (globals.size - 0.000001)
        u = (hit.bVerOrHor ? !side : side) ? (1 - u) : u;
        console.assert((0.0 <= u) && (u <= 1.0));

        if (hit.cell.isDoor() && ((hit.textureIndex == 98) || (hit.textureIndex == 99))) {
            if (hit.bVerOrHor) {
                if (!side) {
                    u += hit.cell.getProgress();
                    // display door handle at the same position regardless of the door side
                    u = 1 - u;
                } else {
                    u -= hit.cell.getProgress();
                }
            } else {
                if (side) {
                    u += hit.cell.getProgress();
                    // display door handle at the same position regardless of the door side
                    u = 1 - u;
                } else {
                    u -= hit.cell.getProgress();
                }
            }

            u = Math.max(0, Math.min(u, 1));
        }

        const padding = (height - h) / 2;

        for (var row = row0; row < row1; ++row) {
            // flip vertically
            const v = 1 - (row + padding) / (height - 1);
            console.assert((0.0 <= v) && (v <= 1.0));
            const tx = Math.min(Math.floor(u * tw), tw - 1);
            const ty = Math.min(Math.floor(v * th), th - 1);
            console.assert((0 <= tx) && (tx < tw));
            console.assert((0 <= ty) && (ty < th));
            const j = tx * tw + ty;
            console.assert((0 <= j) && (j < tw * th));

            let color = getPaletteColor(hit.textureIndex, j);

            // // draw uv [0-1]
            // color.r = u * 255;
            // color.g = v * 255;
            // color.b = 0;

            // // draw texel coords [0-255]
            // const r = Math.min(tx * 4, 255);
            // const g = Math.min(ty * 4, 255);
            // const b = 0;

            const i = (row * w + col) * 4;
            pixels[i + 0] = color.r;
            pixels[i + 1] = color.g;
            pixels[i + 2] = color.b;
            pixels[i + 3] = 255;
        }
    }

    // draw sprites

    // level we are displaying
    const level = globals.levels[globals.level];
    const plane = level.planes[1];
    console.assert((plane.byteLength / 2) == (64 * 64));

    // clear sprites
    globals.sprites = [];

    for (let visible of globals.visibles) {
        const i = plane.getUint16(visible * 2, true); // get i from globals.grid
        // TODO: assert i

        const cell = globals.grid[visible];
        console.assert(cell.entities.length <= 1);

        const x = (visible % globals.size) * globals.size + 32;
        const y = Math.floor(visible / globals.size) * globals.size + 32;

        let j = undefined;
        let entity = undefined;

        if (cell.entities.length != 0) {
            const index = cell.entities[0];
            entity = globals.entities[index];

            if (entity.orientable && entity.IsEnemy() && entity.IsAlive()) {
                j = getSpriteTextureIndex(x, y, entity.index, entity.offset);
            } else {
                j = entity.index;
            }
        }

        // if ((23 <= i) && (i <= 70)) { // probs
        //     // TODO: collectible
        //     // TODO: blocking
        //     j = i - 21;
        // } else if (i == 124) { // dead guard
        //     j = 95;
        // } else if (i >= 108) { // enemies
        //     if ((108 <= i) && (i < 116)) { // guard
        //         j = getSpriteTextureIndex(x, y, 50, i - 108);
        //     } else if ((144 <= i) && (i < 152)) { // guard
        //         j = getSpriteTextureIndex(x, y, 50, i - 144);
        //     } else if ((134 <= i) && (i < 142)) { // dog
        //         j = getSpriteTextureIndex(x, y, 99, i - 134);
        //     } else if ((170 <= i) && (i < 178)) { // dog
        //         j = getSpriteTextureIndex(x, y, 99, i - 170);
        //     }
        // }

        if (j != undefined) {
            const d = distance(x, y);
            if ((d == Infinity) || (d <= 0.0)) {
                continue;
            }

            const sprite = {
                textureIndex: j,
                x: x,
                y: y,
                distance: d,
                entity: entity
            }
            globals.sprites.push(sprite);
        }
    }

    // sort the sprites based on camera distance
    globals.sprites.sort((a, b) => { return b.distance - a.distance; });

    for (const sprite of globals.sprites) {
        // pass hits so we can read hit distance and check if a sprite column is hidden by a wall column
        drawSprite(sprite, globals.hits, pixels);
    }

    // draw weapon
    {
        const d = 64 * 1.25;
        const x = globals.x + d * Math.cos(globals.angle);
        const y = globals.y + d * Math.sin(globals.angle);

        const sprite = {
            textureIndex: globals.weaponTextureIndex,
            x: x,
            y: y,
            distance: d,
        }

        drawSprite(sprite, [], pixels);
    }

    // write texture
    {
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = w;
        const height = h;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;

        gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            internalFormat,
            width,
            height,
            border,
            srcFormat,
            srcType,
            pixels
        );
    }
}

function getSpriteTextureIndex(x, y, index, offset) {
    const dx = x - globals.x;
    const dy = y - globals.y;

    // (-PI, +PI) -> (0, 2*PI)
    let a = Math.PI + Math.atan2(dy, dx);

    const direction = offset % 4;
    switch (direction) {
        case 0: // up
            a -= 3 * HalfPI;
            break;
        case 1: // right
            a -= 0;
            break;
        case 2: // down
            a -= HalfPI;
            break;
        case 3: // left
            a -= Math.PI;
            break;
    }

    // center at PI/8
    a -= (Math.PI / 8);

    if (a < 0) {
        a += 2 * Math.PI;
    }

    return index + (7 - Math.floor(a / (Math.PI / 4)));
}

function shortcuts(event) {
    // console.log(event.keyCode, event.type);
    switch (event.keyCode) {
        case KEY_SHIFT:
        case KEY_LEFT:
        case KEY_RIGHT:
        case KEY_A:
        case KEY_D:
        case KEY_S:
        case KEY_W:
        case KEY_SPACE:
        case KEY_CTRL:
            {
                globals.keys[event.keyCode] = (event.type == "keydown");
                break;
            }
        // case 38: // up
        //     if (event.type == "keyup") {
        //         globals.index += 1;
        //     }
        //     break;
        // case 40: // down
        //     if (event.type == "keyup") {
        //         globals.index -= 1;
        //     }
        //     break;
        default:
            {
                break;
            }
    }
}

function dot(a, b) {
    console.assert(a.length == b.length);
    return a.map((e, i) => a[i] * b[i]).reduce((t, v) => t + v, 0);
}

function cross(a, b) {
    console.assert((a.length == 2) && (b.length == 2));
    return a[0] * b[1] - a[1] * b[0];
}

function translate(vertex, offset) {
    console.assert(vertex.length == offset.length);
    return vertex.map((e, i) => vertex[i] + offset[i]);
}

function rotate(vertex, angle) {
    const row0 = [Math.cos(angle), -Math.sin(angle)];
    const row1 = [Math.sin(angle), Math.cos(angle)];
    return [dot(row0, vertex), dot(row1, vertex)]
}

function intersectSegments(p, r, q, s) {
    const qmp = [q[0] - p[0], q[1] - p[1]];
    const qmpxs = cross(qmp, s);
    const qmpxr = cross(qmp, r);
    const rxs = cross(r, s);

    if ((rxs == 0) && (qmpxr == 0)) { // collinear
        console.assert(false);
    }

    if ((rxs == 0) && (qmpxr != 0)) { // parallel and non-intersecting
        return Infinity;
    }

    // t = (q ??? p) x s / (r x s)
    const t = qmpxs / rxs;
    // u = (q ??? p) x r / (r x s)
    const u = qmpxr / rxs;

    if ((rxs != 0) && ((0 <= t) && (t <= 1)) && ((0 <= u) && (u <= 1))) { // intersecting
        return t;
    } else { // not-parallel but not-intersecting
        return Infinity;
    }
}

// cardinal directions
const CD_UP = 0;
const CD_RIGHT = 1;
const CD_DOWN = 2;
const CD_LEFT = 3;

function getTargetCell(cell, dir) {
    let j = undefined;

    switch (dir) {
        case CD_DOWN:
            if ((cell.row + 1) < globals.rows) {
                j = (cell.row + 1) * globals.cols + cell.col;
            }
            break;
        case CD_LEFT:
            if ((cell.col - 1) >= 0) {
                j = cell.row * globals.cols + (cell.col - 1);
            }
            break;
        case CD_RIGHT:
            if ((cell.col + 1) < globals.cols) {
                j = cell.row * globals.cols + (cell.col + 1);
            }
            break;
        case CD_UP:
            if ((cell.row - 1) >= 0) {
                j = (cell.row - 1) * globals.cols + cell.col;
            }
            break;
    }

    return (j == undefined) ? undefined : globals.grid[j];
}

function processInput(dt) {
    // double the speed by pressing SHIFT and modulate with dt
    let step = (globals.keys[KEY_SHIFT] ? 8 : 4) * dt * 0.05;

    let n = 0;
    n += (globals.keys[KEY_W] ? 1 : 0);
    n += (globals.keys[KEY_LEFT] ? 1 : 0);
    n += (globals.keys[KEY_RIGHT] ? 1 : 0);
    n += (globals.keys[KEY_D] ? 1 : 0);

    // are we moving diagonally?
    if (n == 2) {
        // this second check is not necessary as opposite directions cancel each other out
        if ((globals.keys[KEY_W] != globals.keys[KEY_S]) || (globals.keys[KEY_LEFT] != globals.keys[KEY_RIGHT])) {
            // then modulate step, TODO: cache sqrt(2)/2
            step *= Math.sqrt(2) / 2;
        }
    }

    let [dx, dy] = [globals.x, globals.y];

    // screen space -> player space
    let [px, py] = translate([globals.x, globals.y], [-dx, -dy]);
    [px, py] = rotate([px, py], -globals.angle);

    // steps
    let sx = 0;
    let sy = 0;

    // move forward
    if (globals.keys[KEY_W]) {
        sx = +step;
    }

    // strafe left
    if (globals.keys[KEY_LEFT]) {
        sy = -step;
    }

    // move backward
    if (globals.keys[KEY_S]) {
        sx = -step;
    }

    // strafe right
    if (globals.keys[KEY_RIGHT]) {
        sy = +step;
    }

    px += sx;
    py += sy;

    // collision offset
    const offset = globals.size * 0.25;
    let tx = px + offset * Math.sign(sx);
    let ty = py + offset * Math.sign(sy);

    // player space -> screen space
    [px, py] = rotate([px, py], globals.angle);
    [px, py] = translate([px, py], [dx, dy]);
    [tx, ty] = rotate([tx, ty], globals.angle);
    [tx, ty] = translate([tx, ty], [dx, dy]);

    // check wall, push walls and (closed) door collision
    {
        const cell = getCell(tx, globals.y);

        if (cell.isWall() || cell.isPushWall()) {
            // block
        } else if (cell.isDoor() && !cell.isOpen()) {
            // block
        } else {
            // apply translation
            globals.x = px;
        }
    }

    // check wall, push walls and (closed) door collision
    {
        const cell = getCell(globals.x, ty);

        if (cell.isWall() || cell.isPushWall()) {
            // block
        } else if (cell.isDoor() && !cell.isOpen()) {
            // block
        } else {
            // apply translation
            globals.y = py;
        }
    }

    // clamp position
    globals.x = Math.max(0, globals.x);
    globals.x = Math.min(globals.x, globals.h - 1);
    globals.y = Math.max(0, globals.y);
    globals.y = Math.min(globals.y, globals.w - 1);

    // double the speed by pressing SHIFT and modulate with dt
    const theta = (globals.keys[KEY_SHIFT] ? 1 : 0.5) * dt * 0.0025;

    // rotate left
    if (globals.keys[KEY_A]) {
        globals.angle = globals.angle - theta;
    }

    // rotate right
    if (globals.keys[KEY_D]) {
        globals.angle = globals.angle + theta;
    }

    // clamp angle
    if (globals.angle < 0.0) {
        globals.angle += 2 * Math.PI;
    } else if (globals.angle >= 2 * Math.PI) {
        globals.angle -= 2 * Math.PI;
    }

    // press space
    if (!globals.keys[KEY_SPACE]) {
        globals.isSpaceKeyDown = false;
    } else if (globals.keys[KEY_SPACE] && !globals.isSpaceKeyDown) {
        globals.isSpaceKeyDown = true;

        if (!getCell(globals.x, globals.y).isDoor()) {
            const dx = Math.cos(globals.angle);
            const dy = Math.sin(globals.angle);

            const t = 32 + 16;
            const sx = t * dx;
            const sy = t * dy;
            const px = globals.x + sx;
            const py = globals.y + sy;

            let cell = getCell(px, py);

            if (cell.isDoor() && cell.isClosed()) {
                cell.setStatus(DS_OPENING);
                globals.activeCells.push(cell);
            } else if (cell.isPushWall() && cell.isReady()) {
                // find moving dir
                const p = [globals.x, globals.y];
                const r = [sx, sy];

                const q0 = [cell.x, cell.y];
                const s0 = [globals.size, 0];

                const q1 = [cell.x, cell.y];
                const s1 = [0, globals.size];

                const q2 = [cell.x + globals.size, cell.y];
                const s2 = [0, globals.size];

                const q3 = [cell.x, cell.y + globals.size];
                const s3 = [globals.size, 0];

                // find intersection points with the 4 sides (segments) of the push wall
                const t0 = intersectSegments(p, r, q0, s0); // up
                const t1 = intersectSegments(p, r, q1, s1); // left
                const t2 = intersectSegments(p, r, q2, s2); // right
                const t3 = intersectSegments(p, r, q3, s3); // down

                // pick the closest intersection point
                const t = Math.min(t0, t1, t2, t3);
                console.assert(t != Infinity);

                let dir = undefined;

                switch (t) {
                    case t0:
                        dir = CD_DOWN;
                        break;
                    case t1:
                        dir = CD_RIGHT;
                        break;
                    case t2:
                        dir = CD_LEFT;
                        break;
                    case t3:
                        dir = CD_UP;
                        break;
                }

                const dst = getTargetCell(cell, dir);

                if ((dst != undefined) && dst.isWalkable()) {
                    cell.setStatus(PW_MOVING);
                    cell.setMoveDir(dir);
                    cell.setTargetCell(dst);
                    globals.activeCells.push(cell);
                } else {
                    // TODO: transform in wall
                }
            }
        }
    }

    // press ctrl
    if (!globals.keys[KEY_CTRL]) {
        globals.isCtrlKeyDown = false;
    } else if (globals.keys[KEY_CTRL] && !globals.isCtrlKeyDown) {
        globals.isCtrlKeyDown = true;

        if (globals.weaponAnim.elapsed == globals.weaponAnim.duration) {
            globals.weaponAnim.elapsed = 0;
        }

        // check if an enemy was hit

        // sort visible enemies based on distance (exploit visible sprites list)

        // for each visible enemy
        // damage = hit cone / distance -> interpolation
        // enemy.life -= dagame
        // if enemy.life <= 0: dead animation

        // is there an hit animation?

        //   E
        // 0...1...0
        //  \..|../
        //   \.|./
        //    \|/
        //     P

        // each weapon should have
        // * max damage value
        // * hit cone angle
        // * max hit distance
        // max damage should be scaled based on
        // * distance player-enemy
        // * hit angle 

        for (let i = globals.sprites.length - 1; i >= 0; --i) {
            const sprite = globals.sprites[i];
            const entity = sprite.entity;

            if (entity.IsEnemy() && entity.IsAlive()) {
                entity.die();
                globals.enemies.push(entity);
                break;
            }
        }
    }
}

function updateStats(stats, dt) {
    stats.frames += 1;
    stats.elapsed += dt;

    stats.element.innerText = "fps: " + (1000 / dt).toFixed(3) + " | " + dt.toFixed(3) + " ms";
}

// expects an array of N vertices [x0, y0, x1, x1, ..., xN, yN] in debug view space
function debugViewToNDC(vertices) {
    const w = globals.w;
    const h = globals.h;
    return vertices.map((e, i) => (i % 2 == 0) ? (e / (w / 2) - 1) : (1 - (e / (h / 2))));
}

function createBuffer(gl, data) {
    let buffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // transform position from grid space to NDC
    data = debugViewToNDC(data);
    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

    return buffer;
}

function initBuffers2dView(gl) {
    // TODO: detach game code/data from 2d debug view code

    // grid size in cells
    globals.rows = 64;
    globals.cols = 64;

    // grid size in texels
    globals.w = globals.cols * globals.size;
    globals.h = globals.rows * globals.size;

    // level we are displaying
    const level = globals.levels[globals.level];
    const plane0 = level.planes[0];
    const plane1 = level.planes[1];
    console.assert((plane0.byteLength / 2) == (64 * 64));
    console.assert((plane1.byteLength / 2) == (64 * 64));

    const half = globals.size / 2;

    let walls = [];
    let doors = [];
    let empty = [];

    for (let row = 0; row < globals.rows; row++) {
        for (let col = 0; col < globals.cols; col++) {
            const i = row * globals.cols + col;
            const i0 = plane0.getUint16(i * 2, true);
            // TODO: assert i0

            let cell = undefined;

            const x = col * globals.size + half;
            const y = row * globals.size + half;

            if (i0 <= 63) { // walls
                cell = new Wall(row, col, i0);
                walls.push(x, y);
            } else if (i0 <= 101) { // doors
                cell = new Door(row, col, i0);
                doors.push(x, y);
            } else { // empty cells
                cell = new Cell(row, col, i0);
                empty.push(x, y);
            }

            const i1 = plane1.getUint16(i * 2, true);
            // TODO: assert i1

            let entity = undefined;

            if (i1 == 0) {
                // empty
            } else if (i1 == 98) { // push wall
                console.assert(cell.isWall());
                // cell.setIsPushable(true);
                delete cell;
                cell = new PushWall(row, col, i0);
            } else if ((19 <= i1) && (i1 <= 22)) {
                // player init position and direction
            } else if ((23 <= i1) && (i1 <= 70)) { // probs
                // TODO: collectible
                // TODO: blocking
                entity = new Entity(x, y, i1 - 21, false, false, false);
            } else if (i1 == 124) { // dead guard
                entity = new Entity(x, y, 95, false, false, false);
            } else if (i1 >= 108) { // enemies
                if ((108 <= i1) && (i1 < 116)) { // guard
                    entity = new Guard(x, y, i1 - 108);
                } else if ((144 <= i1) && (i1 < 152)) { // guard
                    entity = new Guard(x, y, i1 - 144);
                } else if ((134 <= i1) && (i1 < 142)) { // dog
                    entity = new Entity(x, y, 99, true, false, false);
                } else if ((170 <= i1) && (i1 < 178)) { // dog
                    entity = new Entity(x, y, 99, true, false, false);
                }
            } else { // unimplemented
                entity = new Entity(x, y, undefined, false, false, false);
            }

            if (entity != undefined) {
                globals.entities.push(entity);
                cell.entities.push(globals.entities.length - 1);

                if (entity.index == undefined) {
                    console.warn("TODO: unimplemented entity type " + i1);
                }
            }

            globals.grid.push(cell);
        }
    }

    let buffers = {
        walls: { buffer: null, count: 0, },
        doors: { buffer: null, count: 0, },
        empty: { buffer: null, count: 0, },
        player: { buffer: null, count: 0, },
        rays: { buffer: null, count: 0, },
        points: { buffer: null, count: 0, }
    };

    buffers.walls.buffer = createBuffer(gl, walls);
    buffers.walls.count = walls.length / 2;

    buffers.doors.buffer = createBuffer(gl, doors);
    buffers.doors.count = doors.length / 2;

    buffers.empty.buffer = createBuffer(gl, empty);
    buffers.empty.count = empty.length / 2;

    return buffers;
}

function initBuffers3dView(gl) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // screen size quad
    const positions = [
        -1.0, -1.0,
        +1.0, -1.0,
        +1.0, +1.0,
        -1.0, +1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    const textureCoordinates = [
        0.0, 0.0,
        1.0, 0.0,
        1.0, 1.0,
        0.0, 1.0,
    ];

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(textureCoordinates),
        gl.STATIC_DRAW
    );

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    const indices = [
        0, 1, 2,
        0, 2, 3,
    ];

    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array(indices),
        gl.STATIC_DRAW
    );

    return {
        position: positionBuffer,
        textureCoord: textureCoordBuffer,
        indices: indexBuffer,
    };
}


function intersect(r, p, d) {
    return Math.abs((r - p) / d);
}

function getCell(px, py) {
    console.assert((0 <= px < globals.w) && (0 <= py < globals.h));

    const cx = Math.floor(px / globals.size);
    const cy = Math.floor(py / globals.size);
    console.assert((0 <= cx) && (cx < globals.cols));
    console.assert((0 <= cy) && (cy < globals.rows));

    const i = cy * globals.cols + cx;
    return globals.grid[i];
}

function isEmpty(px, py) {
    const cell = getCell(px, py);
    return !cell.isWall() && !cell.isDoor();
}

function inGrid(px, py) {
    return ((0.0 <= px) && (px < globals.w)) && ((0.0 <= py) && (py < globals.h));
}

function doWall(cell, px, py, bVerOrHor) {
    let hit = {
        distance: Infinity,
        cell: cell,
        px: px,
        py: py,
        bVerOrHor: bVerOrHor,
        textureIndex: 2 * cell.getTextureIndex() - (bVerOrHor ? 1 : 2),
    };

    if (getCell(globals.x, globals.y).isDoor()) {
        const cx = Math.floor(globals.x / globals.size);
        const cy = Math.floor(globals.y / globals.size);

        const cpx = Math.floor(px / globals.size);
        const cpy = Math.floor(py / globals.size);

        const a = Math.abs(cx - cpx);
        const b = Math.abs(cy - cpy);

        if (((a == 0) && (b == 1)) || ((a == 1) && (b == 0))) {
            // display door side walls
            hit.textureIndex = !bVerOrHor ? 100 : 101;
        }
    }

    return hit;
}

function doDoor(cell, px, py, hs, vs, bVerOrHor) {
    const dx = px + hs / 2;
    const dy = py + vs / 2;

    let hit = {
        distance: Infinity,
        cell: cell,
        px: dx,
        py: dy,
        bVerOrHor: bVerOrHor,
        textureIndex: cell.getTextureIndex(),
    };

    switch (cell.getTextureIndex()) {
        // vertical hit
        case 90:
            hit.textureIndex = 99;
            break;
        case 92:
        case 94:
            hit.textureIndex = 105;
            break;
        case 100: // ?
            hit.textureIndex = 103;
            break;
        // horizontal hit
        case 91:
            hit.textureIndex = 98;
            break;
        case 93:
        case 95:
            hit.textureIndex = 104;
            break;
        case 101: // ?
            hit.textureIndex = 102;
            break;
    }

    if (bVerOrHor) {
        const cpy = Math.floor(py / globals.size) * globals.size;
        const cdy = Math.floor(dy / globals.size) * globals.size;

        const diff = cdy - cpy;

        if (diff != 0) {
            let y = cpy;

            if (diff > 0) {
                y += 64 - 0.000001;
            }

            let m = (dy - py) / (dx - px);
            // y = m*x + c => c = y - m*x
            let c = py - m * px;
            // y = m*x + c => x = (y - c) / m
            let x = (y - c) / m;

            hit.px = x;
            hit.py = y;
            hit.bVerOrHor = !bVerOrHor;
            hit.textureIndex = 100;

            return hit;
        } else if ((dy % 64) > (cell.getProgress() * 64)) {
            return hit;
        } else {
            const dx = px + hs;
            const dy = py + vs;

            const cpy = Math.floor(py / globals.size) * globals.size;
            const cdy = Math.floor(dy / globals.size) * globals.size;

            const diff = cdy - cpy;

            if (diff != 0) {
                let y = cpy;

                if (diff > 0) {
                    y += 64 - 0.000001;
                }

                let m = (dy - py) / (dx - px);
                // y = m*x + c => c = y - m*x
                let c = py - m * px;
                // y = m*x + c => x = (y - c) / m
                let x = (y - c) / m;

                hit.px = x;
                hit.py = y;
                hit.bVerOrHor = !bVerOrHor;
                hit.textureIndex = 100;

                return hit;
            } else {
                return null;
            }
        }
    } else {
        const cpx = Math.floor(px / globals.size) * globals.size;
        const cdx = Math.floor(dx / globals.size) * globals.size;

        const diff = cdx - cpx;

        if (diff != 0) {
            let x = cpx;

            if (diff > 0) {
                x += 64 - 0.000001;
            }

            let m = (dx - px) / (dy - py);
            // y = m*x + c => c = y - m*x
            let c = px - m * py;
            // y = m*x + c => x = (y - c) / m
            let y = (x - c) / m;

            hit.px = x;
            hit.py = y;
            hit.bVerOrHor = !bVerOrHor;
            hit.textureIndex = 101;

            return hit;
        } else if ((dx % 64) > (cell.getProgress() * 64)) {
            return hit;
        } else {
            const dx = px + hs;
            const dy = py + vs;

            const cpx = Math.floor(px / globals.size) * globals.size;
            const cdx = Math.floor(dx / globals.size) * globals.size;

            const diff = cdx - cpx;

            if (diff != 0) {
                let x = cpx;

                if (diff > 0) {
                    x += 64 - 0.000001;
                }

                let m = (dx - px) / (dy - py);
                // y = m*x + c => c = y - m*x
                let c = px - m * py;
                // y = m*x + c => x = (y - c) / m
                let y = (x - c) / m;

                hit.px = x;
                hit.py = y;
                hit.bVerOrHor = !bVerOrHor;
                hit.textureIndex = 101;

                return hit;
            } else {
                return null;
            }
        }
    }
}

function doPushWall(cell, px, py, hs, vs, bVerOrHor) {
    const dx = px + hs * cell.getProgress();
    const dy = py + vs * cell.getProgress();

    let hit = {
        distance: Infinity,
        cell: cell,
        px: dx,
        py: dy,
        bVerOrHor: bVerOrHor,
        textureIndex: 2 * cell.getTextureIndex() - (bVerOrHor ? 1 : 2),
    };

    if (bVerOrHor) {
        const cpy = Math.floor(py / globals.size) * globals.size;
        const cdy = Math.floor(dy / globals.size) * globals.size;

        const diff = cdy - cpy;

        if (diff != 0) {
            return null;
        }
    } else {
        const cpx = Math.floor(px / globals.size) * globals.size;
        const cdx = Math.floor(dx / globals.size) * globals.size;

        const diff = cdx - cpx;

        if (diff != 0) {
            return null;
        }
    }

    return hit;
}

function markVisible(px, py) {
    const cx = Math.floor(px / globals.size);
    const cy = Math.floor(py / globals.size);
    console.assert((0 <= cx) && (cx < globals.cols));
    console.assert((0 <= cy) && (cy < globals.rows));

    const i = cy * globals.cols + cx;
    globals.visibles.add(i);
}

function findAxisIntersection(theta, r, p, d, vs, hs, bVerOrHor) {
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);

    // find first axis intersection
    const t = intersect(r, p, d);
    let px = globals.x + t * dx;
    let py = globals.y + t * dy;

    if (!inGrid(px, py)) {
        return null;
    } else {
        const cell = getCell(px, py);
        if (cell.isWall()) {
            return doWall(cell, px, py, bVerOrHor);
        } else {
            markVisible(px, py);
            if (cell.isDoor()) {
                const hit = doDoor(cell, px, py, hs, vs, bVerOrHor);
                if (hit != null) {
                    return hit;
                }
            } else if (cell.isPushWall()) {
                const hit = doPushWall(cell, px, py, hs, vs, bVerOrHor);
                if (hit != null) {
                    return hit;
                }
            }
        }
    }

    // find first wall or door intersection
    while (true) {
        px = px + hs;
        py = py + vs;

        if (!inGrid(px, py)) {
            return null;
        } else {
            const cell = getCell(px, py);
            if (cell.isWall()) {
                return doWall(cell, px, py, bVerOrHor);
            } else {
                markVisible(px, py);
                if (cell.isDoor()) {
                    const hit = doDoor(cell, px, py, hs, vs, bVerOrHor);
                    if (hit != null) {
                        return hit;
                    }
                } else if (cell.isPushWall()) {
                    const hit = doPushWall(cell, px, py, hs, vs, bVerOrHor);
                    if (hit != null) {
                        return hit;
                    }
                }
            }
        }
    }
}

function findVerticalIntersection(theta) {
    const a1 = 3 * HalfPI;
    const a3 = HalfPI;

    if ((theta == a1) || (theta == a3)) {
        return null;
    }

    const side = ((a3 < theta) && (theta < a1));

    // player position
    const px = globals.x;

    // player direction
    let dx = Math.cos(theta);

    // player cell
    const cx = Math.floor(px / globals.size) * globals.size;

    // neighboring cells
    const r = cx + globals.size; // right
    const l = cx - 0.00001;      // left

    // ray point
    const rx = side ? l : r;

    // vertical and horizontal steps
    const sign = side ? -1 : +1;
    const vs = sign * globals.size * Math.tan(theta);
    const hs = sign * globals.size;

    return findAxisIntersection(theta, rx, px, dx, vs, hs, true);
}

function findHorizontalIntersection(theta) {
    const a0 = 0.0;
    const a2 = Math.PI;

    if ((theta == a0) || (theta == a2)) {
        return null;
    }

    const side = ((a0 < theta) && (theta < a2));

    // player position
    const py = globals.y;

    // player direction
    let dy = Math.sin(theta);

    // player cell
    const cy = Math.floor(py / globals.size) * globals.size;

    // neighboring cells
    const u = cy - 0.00001;      // up
    const d = cy + globals.size; // down

    // ray point
    const ry = side ? d : u;

    // vertical and horizontal steps
    const sign = side ? +1 : -1;
    const vs = sign * globals.size;
    const hs = sign * globals.size * Math.tan(HalfPI - theta);

    return findAxisIntersection(theta, ry, py, dy, vs, hs, false);
}

function distance(px, py) {
    const x = globals.x - px;
    const y = globals.y - py;
    return Math.sqrt(x * x + y * y);
}

function updateBuffers(gl, buffers) {
    // TODO: detach game code/data from 2d debug view code

    // ========== player ==========

    gl.deleteBuffer(buffers.player.buffer);
    const playerBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, playerBuffer);

    // position in NDC
    const player = debugViewToNDC([globals.x, globals.y]);

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(player), gl.STATIC_DRAW);

    // ========== rays ==========

    console.assert((0.0 < globals.fov) && (globals.fov < Math.PI));
    const count = globals.canvas3d.width; // number of rays

    let rays = [];
    let points = [];

    // clear hits
    globals.hits = [];

    let angle = 0.0;
    let inc = 0.0;

    if (count > 1) {
        angle -= (globals.fov / 2);
        inc = globals.fov / (count - 1);
    }

    globals.visibles.clear();
    markVisible(globals.x, globals.y);

    for (let i = 0; i < count; ++i, angle += inc) {
        let theta = globals.angle + angle;

        // clamp angle
        if (theta < 0.0) {
            theta += 2 * Math.PI;
        } else if (theta >= 2 * Math.PI) {
            theta -= 2 * Math.PI;
        }

        // TODO: improve DDA, ping-pong between vertical and horizontal jumps
        // you can stop as soon as you have a hit and the other ray is already over the hit point
        // this should refine the visible cells list as well as speed-up the raycaster
        const pv = findVerticalIntersection(theta);
        const ph = findHorizontalIntersection(theta);

        let p = null;

        let hit = {
            distance: Infinity,
            bVerOrHor: null,
            px: 0.0,
            py: 0.0,
            cell: null,
            textureIndex: null,
        };

        if ((pv != null) && (ph != null)) {
            const d0 = distance(pv.px, pv.py);
            const d1 = distance(ph.px, ph.py);
            if (d0 < d1) {
                p = pv;
                hit.distance = d0;
            } else {
                p = ph;
                hit.distance = d1;
            }
        } else if (pv != null) {
            p = pv;
            hit.distance = distance(pv.px, pv.py);
        } else if (ph != null) {
            p = ph;
            hit.distance = distance(ph.px, ph.py);
        }

        if (p != null) {
            rays.push(globals.x, globals.y, p.px, p.py);
            points.push(p.px, p.py);

            // fix fish-eye effect
            hit.distance *= Math.cos(angle);
            // const dx = p[0] - globals.x;
            // const dy = p[1] - globals.y;
            // hit.distance = dx * Math.cos(globals.angle) + dy * Math.sin(globals.angle);

            hit.px = p.px;
            hit.py = p.py;
            hit.cell = p.cell;
            hit.bVerOrHor = p.bVerOrHor;
            hit.textureIndex = p.textureIndex;
        } else {
            // ray to infinity
        }

        globals.hits.push(hit);
    } // for each angle

    gl.deleteBuffer(buffers.rays.buffer);
    const raysBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, raysBuffer);

    rays = debugViewToNDC(rays);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rays), gl.STATIC_DRAW);

    // ========== hit points ==========

    gl.deleteBuffer(buffers.points.buffer);
    const pointsBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);

    points = debugViewToNDC(points);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    return {
        walls: buffers.walls,
        doors: buffers.doors,
        empty: buffers.empty,
        player: { buffer: playerBuffer, count: player.length / 2, },
        rays: { buffer: raysBuffer, count: rays.length / 2, },
        points: { buffer: pointsBuffer, count: points.length / 2, }
    };
}

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            "Unable to initialize the shader program: " +
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function draw3dScene(gl, buffers, programInfo, texture) {
    // TODO: we might skip the clear
    gl.clearColor(1.0, 1.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
        gl.vertexAttribPointer(
            programInfo.attribLocations.textureCoord,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);

    gl.useProgram(programInfo.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    {
        const vertexCount = 6;
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl.TRIANGLES, vertexCount, type, offset);
    }
}

function draw2dElement(gl, buffer, programInfo, fragColor, pointSize, mode) {
    const numComponents = 2;
    const type = gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);

    gl.vertexAttribPointer(
        programInfo.attribLocations.vertexPosition,
        numComponents,
        type,
        normalize,
        stride,
        offset
    );
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(fragColor));

    if (pointSize != null) {
        gl.uniform1f(programInfo.uniformLocations.uPointSize, pointSize);
    }

    gl.drawArrays(mode, 0, buffer.count);
}

function draw2dScene(gl, programInfo, buffers) {
    gl.useProgram(programInfo.program);

    // clear
    {
        const r = 47 / 255;
        const g = 46 / 255;
        const b = 48 / 255;
        gl.clearColor(r, g, b, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // cell point size
    const pointSize = Math.max(1, (globals.size / globals.w) * globals.canvas2d.width - 1);

    // draw empty cells
    {
        const r = 114 / 255;
        const g = 112 / 255;
        const b = 114 / 255;
        const fragColor = [r, g, b, 1.0];
        draw2dElement(gl, buffers.empty, programInfo, fragColor, pointSize, gl.POINTS);
    }

    // draw visible cells (right now all cells visited by the raycaster) 
    {
        let vertices = [];

        for (const visible of globals.visibles) {
            const x = (visible % 64) * 64 + 32;
            const y = Math.floor(visible / 64) * 64 + 32;
            vertices.push(x, y);
        }

        const buffer = {
            buffer: createBuffer(gl, vertices),
            count: vertices.length / 2,
        };

        const r = Math.round(114 * 1.5) / 255;
        const g = Math.round(112 * 1.5) / 255;
        const b = Math.round(114 * 1.5) / 255;
        const fragColor = [r, g, b, 1.0];
        // draw2dElement(gl, buffer, programInfo, fragColor, pointSize, gl.POINTS);

        gl.deleteBuffer(buffer.buffer);
    }

    // draw walls
    {
        const fragColor = [0.0, 0.0, 1.0, 1.0];
        draw2dElement(gl, buffers.walls, programInfo, fragColor, pointSize, gl.POINTS);
    }

    // draw doors
    {
        const fragColor = [0.0, 1.0, 1.0, 1.0];
        draw2dElement(gl, buffers.doors, programInfo, fragColor, pointSize, gl.POINTS);
    }

    // draw rays
    {
        const fragColor = [1.0, 0.0, 1.0, 1.0];
        const pointSize = null;
        draw2dElement(gl, buffers.rays, programInfo, fragColor, pointSize, gl.LINES);
    }

    // draw hit points
    {
        const fragColor = [1.0, 1.0, 0.0, 1.0];
        const pointSize = 2;
        draw2dElement(gl, buffers.points, programInfo, fragColor, pointSize, gl.POINTS);
    }

    // draw player
    {
        const fragColor = [1.0, 1.0, 0.0, 1.0];
        const pointSize = 5;
        draw2dElement(gl, buffers.player, programInfo, fragColor, pointSize, gl.POINTS);
    }

    // draw entities
    {
        let vertices = [];
        let buffer = { buffer: null, count: 0 };

        for (const entity of globals.entities) {
            if (entity.index != undefined) {
                vertices.push(entity.x, entity.y);
            }
        }

        buffer = {
            buffer: createBuffer(gl, vertices),
            count: vertices.length / 2,
        };

        let fragColor = [0.0, 1.0, 0.0, 1.0];
        let pointSize = 2;
        draw2dElement(gl, buffer, programInfo, fragColor, pointSize, gl.POINTS);
        gl.deleteBuffer(buffer.buffer);

        vertices = [];

        for (const entity of globals.entities) {
            if (entity.index == undefined) {
                vertices.push(entity.x, entity.y);
            }
        }

        buffer = {
            buffer: createBuffer(gl, vertices),
            count: vertices.length / 2,
        };

        fragColor = [1.0, 0.0, 0.0, 1.0];
        pointSize = 3;
        draw2dElement(gl, buffer, programInfo, fragColor, pointSize, gl.POINTS);
        gl.deleteBuffer(buffer.buffer);
    }
}

function isEngineReady() {
    if (isLoadDone(globals.loaders)) {
        const event = new CustomEvent('main');
        window.dispatchEvent(event);
    }
}

function isLoadDone(loaders) {
    for (const loader of loaders) {
        if (!loader.done) {
            return false;
        }
        if (!isLoadDone(loader.next)) {
            return false;
        }
    }
    return true;
}

function init() {
    globals.loaders = [
        {
            name: "VSWAP.WL6",
            func: loadAssets,
            done: false,
            next: [],
        },
        {
            name: "GAMEPAL.OBJ",
            func: loadPalette,
            done: false,
            next: [],
        },
        {
            name: "MAPHEAD.WL6",
            func: loadMapHead,
            done: false,
            next: [
                {
                    name: "GAMEMAPS.WL6",
                    func: loadGameMaps,
                    done: false,
                    next: [],
                }
            ],
        },
    ];

    window.addEventListener('main', (event) => { main(); }, false);

    for (const loader of globals.loaders) {
        loadFile(loader.name, loader.func, loader.next);
    }
}

window.onload = init;