const KEY_SHIFT = 16;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;

const HalfPI = Math.PI / 2;

let globals = {
    canvas2d: null, // top-down debug view
    canvas3d: null, // 3D view
    x: 0,       // player position x
    y: 0,       // player position y
    angle: 0.0, // player direction
    grid: [],
    rows: 0,  // grid rows
    cols: 0,  // grid cols
    size: 64, // grid cell size
    w: 0,     // grid width
    h: 0,     // grid height
    hits: [], // hit points, one per 3D view column
    keys: {
        KEY_SHIFT: false,
        KEY_LEFT: false,
        KEY_RIGHT: false,
        KEY_A: false,
        KEY_D: false,
        KEY_S: false,
        KEY_W: false,
    }
}

function main() {
    let gl2d = init2d();
    let gl3d = init3d();

    // screen size
    globals.w = globals.cols * globals.size;
    globals.h = globals.rows * globals.size;

    // init player position and direction
    globals.x = globals.w / 2;
    globals.y = globals.h / 2;
    globals.angle = -Math.PI / 2;

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
            draw2dScene(gl2d.gl, gl2d.programInfo, gl2d.buffers);
        }

        updateTexture(gl3d);
        draw3dScene(gl3d.gl, gl3d.buffers, gl3d.programInfo, gl3d.texture);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
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

function updateTexture(gl3d) {
    const gl = gl3d.gl;

    gl.deleteTexture(gl3d.texture);

    gl3d.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, gl3d.texture);

    const w = globals.canvas3d.width;
    const h = globals.canvas3d.height;

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = w;
    const height = h;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array(w * h * 4);


    // "draw" floor and ceiling

    for (var row = 0; row < h; ++row) {
        for (var col = 0; col < w; ++col) {
            const sign = (row < (h / 2)) ? +1 : -1;
            const color = 127 + (sign * 32) - 16;

            const r = color;
            const g = color;
            const b = color;

            const i = (row * w + col) * 4;
            pixel[i + 0] = r;
            pixel[i + 1] = g;
            pixel[i + 2] = b;
            pixel[i + 3] = 255;
        }
    }

    // draw walls

    for (var col = 0; col < w; ++col) {
        const hit = globals.hits[col];

        if ((hit.distance == null) || (hit.distance <= 0.0)) {
            continue;
        }

        // column height
        const scale = globals.size * 100.0;
        const height = Math.round(scale / hit.distance) * 2;

        if (height == 0) {
            continue;
        }

        const offset = 0 + (h / 2) - (height / 2);

        const row0 = Math.max(0, offset);
        const row1 = Math.min(offset + height, h);

        for (var row = row0; row < row1; ++row) {

            const i = (row * w + col) * 4;

            const r = 0;
            const g = 0;
            const b = hit.bVerOrHor ? 127 : 255;

            pixel[i + 0] = r;
            pixel[i + 1] = g;
            pixel[i + 2] = b;
            pixel[i + 3] = 255;
        }
    }

    gl.texImage2D(
        gl.TEXTURE_2D,
        level,
        internalFormat,
        width,
        height,
        border,
        srcFormat,
        srcType,
        pixel
    );
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
            {
                globals.keys[event.keyCode] = (event.type == "keydown");
                break;
            }
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

function translate(vertex, offset) {
    console.assert(vertex.length == offset.length);
    return vertex.map((e, i) => vertex[i] + offset[i]);
}

function rotate(vertex, angle) {
    const row0 = [Math.cos(angle), -Math.sin(angle)];
    const row1 = [Math.sin(angle), Math.cos(angle)];
    return [dot(row0, vertex), dot(row1, vertex)]
}

function processInput(dt) {
    // double the speed by pressing SHIFT and modulate with dt
    let step = (globals.keys[KEY_SHIFT] ? 2 : 1) * dt * 0.05;

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

    // move forward
    if (globals.keys[KEY_W]) {
        px = px + step;
    }

    // strafe left
    if (globals.keys[KEY_LEFT]) {
        py = py - step;
    }

    // move backward
    if (globals.keys[KEY_S]) {
        px = px - step;
    }

    // strafe right
    if (globals.keys[KEY_RIGHT]) {
        py = py + step;
    }

    // player space -> screen space
    [px, py] = rotate([px, py], globals.angle);
    [px, py] = translate([px, py], [dx, dy]);

    // check wall collision
    if (!isWall(px, globals.y)) {
        // apply translation
        globals.x = px;
    }

    // check wall collision
    if (!isWall(globals.x, py)) {
        // apply translation
        globals.y = py;
    }

    // clamp position
    globals.x = Math.max(0, globals.x);
    globals.x = Math.min(globals.x, globals.h - 1);
    globals.y = Math.max(0, globals.y);
    globals.y = Math.min(globals.y, globals.w - 1);

    // double the speed by pressing SHIFT and modulate with dt
    const theta = (globals.keys[KEY_SHIFT] ? 2 : 1) * dt * 0.0025;

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
}

function updateStats(stats, dt) {
    stats.frames += 1;
    stats.elapsed += dt;

    stats.element.innerText = "fps: " + (1000 / dt).toFixed(3) + " | " + dt.toFixed(3) + " ms";
}

// expects an array of N vertices [x0, y0, x1, x1, ..., xN, yN] in debug view space
function debugViewToNDC(vertices) {
    const w = globals.canvas2d.width;
    const h = globals.canvas2d.height;
    return vertices.map((e, i) => (i % 2 == 0) ? (e / (w / 2) - 1) : (1 - (e / (h / 2))));
}

function initBuffers2dView(gl) {
    globals.grid = [
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 1,
        1, 0, 0, 0, 1, 1, 0, 1,
        1, 0, 1, 0, 0, 1, 0, 1,
        1, 0, 1, 0, 0, 1, 0, 1,
        1, 0, 1, 1, 0, 0, 0, 1,
        1, 0, 0, 0, 0, 0, 0, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
    ];

    globals.rows = 8;
    globals.cols = 8;

    console.assert(globals.grid.length == (globals.rows * globals.cols));

    const half = globals.size / 2;

    let walls = [];
    let cells = [];

    for (let row = 0; row < globals.rows; row++) {
        for (let col = 0; col < globals.cols; col++) {
            const i = row * globals.cols + col;

            const x = col * globals.size + half;
            const y = row * globals.size + half;

            switch (globals.grid[i]) {
                case 0:
                    cells.push(x, y);
                    break;
                case 1:
                    walls.push(x, y);
                    break;
            }
        }
    }

    // ========== walls ==========

    const wallsBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, wallsBuffer);

    // position in NDC
    walls = debugViewToNDC(walls)

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(walls), gl.STATIC_DRAW);

    // ========== cells ==========

    const cellsBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, cellsBuffer);

    // position in NDC
    cells = debugViewToNDC(cells)

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cells), gl.STATIC_DRAW);

    return {
        walls: { buffer: wallsBuffer, count: walls.length / 2, },
        cells: { buffer: cellsBuffer, count: cells.length / 2, },
        player: { buffer: null, count: 0, },
        rays: { buffer: null, count: 0, },
        points: { buffer: null, count: 0, }
    };
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
    console.assert((0 <= cx < globals.cols) && (0 <= cy < globals.rows));

    const i = cy * globals.cols + cx;
    return globals.grid[i];
}

function isWall(px, py) {
    return getCell(px, py) == 1;
}

function inGrid(px, py) {
    return ((0.0 <= px) && (px < globals.w)) && ((0.0 <= py) && (py < globals.h));
}

function findAxisIntersection(theta, r, p, d, vs, hs) {
    let dx = Math.cos(theta);
    let dy = Math.sin(theta);

    // find first axis intersection
    const t = intersect(r, p, d);
    let px = globals.x + t * dx;
    let py = globals.y + t * dy;

    if (!inGrid(px, py)) {
        return null;
    } else if (isWall(px, py)) {
        return [px, py];
    }

    // find first wall intersection
    while (true) {
        px = px + hs;
        py = py + vs;

        if (!inGrid(px, py)) {
            return null;
        } else if (isWall(px, py)) {
            return [px, py];
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
    const r = cx + globals.size // right
    const l = cx - 0.00001      // left

    // ray point
    const rx = side ? l : r;

    // vertical and horizontal steps
    const sign = side ? -1 : +1;
    const vs = sign * globals.size * Math.tan(theta);
    const hs = sign * globals.size;

    return findAxisIntersection(theta, rx, px, dx, vs, hs);
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
    const u = cy - 0.00001      // up
    const d = cy + globals.size // down

    // ray point
    const ry = side ? d : u;

    // vertical and horizontal steps
    const sign = side ? +1 : -1;
    const vs = sign * globals.size;
    const hs = sign * globals.size * Math.tan(HalfPI - theta);

    return findAxisIntersection(theta, ry, py, dy, vs, hs);
}

function distance(px, py) {
    const x = globals.x - px;
    const y = globals.y - py;
    return Math.sqrt(x * x + y * y);
}

function updateBuffers(gl, buffers) {

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

    const fov = HalfPI / 2;                   // field of view
    console.assert((0.0 < fov) && (fov < Math.PI));
    const count = globals.canvas3d.width; // number of rays

    let rays = [];
    let points = [];

    // clear hits
    globals.hits = [];

    let angle = 0.0;
    let inc = 0.0;

    if (count > 1) {
        angle -= (fov / 2);
        inc = fov / (count - 1);
    }

    for (let i = 0; i < count; ++i, angle += inc) {
        let theta = globals.angle + angle;

        // clamp angle
        if (theta < 0.0) {
            theta += 2 * Math.PI;
        } else if (theta >= 2 * Math.PI) {
            theta -= 2 * Math.PI;
        }

        const pv = findVerticalIntersection(theta);
        const ph = findHorizontalIntersection(theta);

        let p = null;

        let hit = {
            distance: null,
            bVerOrHor: null,
        };

        if ((pv != null) && (ph != null)) {
            // TODO: we can use the distance square here
            const d0 = distance(pv[0], pv[1]);
            const d1 = distance(ph[0], ph[1]);

            if (d0 < d1) {
                p = pv;

                hit.distance = d0;
                hit.bVerOrHor = true;
            } else {
                p = ph;

                hit.distance = d1;
                hit.bVerOrHor = false;
            }
        } else if (pv != null) {
            p = pv;

            hit.distance = distance(pv[0], pv[1]);
            hit.bVerOrHor = true;
        } else if (ph != null) {
            p = ph;

            hit.distance = distance(ph[0], ph[1]);
            hit.bVerOrHor = false;
        }

        if (p != null) {
            rays.push(globals.x, globals.y, ...p);
            points.push(...p);

            // fix fish-eye effect
            hit.distance *= Math.cos(angle);
            // const dx = p[0] - globals.x;
            // const dy = p[1] - globals.y;
            // hit.distance = dx * Math.cos(globals.angle) + dy * Math.sin(globals.angle);
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
        cells: buffers.cells,
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

function draw2dScene(gl, programInfo, buffers) {

    const rgb = (127 - 32 - 16) / 255;
    gl.clearColor(rgb, rgb, rgb, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);

    // draw walls

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.walls.buffer);
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
        const color = [0.0, 0.0, 1.0, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, globals.size - 1);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.walls.count;
        gl.drawArrays(mode, first, count);
    }

    // draw floor

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.cells.buffer);
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
        const rgb = (127 + 32 - 16) / 255;
        const color = [rgb, rgb, rgb, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, globals.size - 1);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.cells.count;
        gl.drawArrays(mode, first, count);
    }

    // draw rays

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.rays.buffer);
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
        const color = [1.0, 0.0, 1.0, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));
    }

    {
        const mode = gl.LINES;
        const first = 0;
        const count = buffers.rays.count;
        gl.drawArrays(mode, first, count);
    }

    // draw player

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.player.buffer);
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
        const color = [1.0, 1.0, 0.0, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 5.0);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.player.count;
        gl.drawArrays(mode, first, count);
    }

    // draw debug points

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.points.buffer);
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
        const color = [0.0, 1.0, 1.0, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 2.0);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.points.count;
        gl.drawArrays(mode, first, count);
    }
}

window.onload = main;