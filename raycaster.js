const KEY_SHIFT = 16;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;

const HalfPI = Math.PI / 2;

globals = {
    canvas: null,
    x: 0,       // player position x
    y: 0,       // player position y
    angle: 0.0, // player direction
    grid: [],
    rows: 0,  // grid rows
    cols: 0,  // grid cols
    size: 64, // grid cell size
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
    globals.canvas = document.getElementsByTagName("canvas")[0];
    const gl = globals.canvas.getContext('webgl');

    if (!gl) {
        alert('Unable to initialize WebGL. Your browser or machine may not support it.');
        return;
    }

    document.onkeydown = shortcuts;
    document.onkeyup = shortcuts;

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

    buffers = initBuffers(gl);

    stats = {
        element: document.getElementById("stats"),
        frames: 0,
        elapsed: 0.0,
    };

    prevTime = 0.0

    globals.x = globals.canvas.width / 2;
    globals.y = globals.canvas.height / 2;
    globals.angle = -Math.PI / 2;

    function render(currTime) {
        const dt = currTime - prevTime;
        prevTime = currTime;

        // update stats
        updateStats(stats, dt);

        processInput(dt)

        buffers = updateBuffers(gl, buffers);

        drawScene(gl, programInfo, buffers, dt);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
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
    step = (globals.keys[KEY_SHIFT] ? 2 : 1) * dt * 0.05;

    n = 0;
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

    [dx, dy] = [globals.x, globals.y];

    // screen space -> player space
    [px, py] = translate([globals.x, globals.y], [-dx, -dy]);
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
    globals.x = Math.min(globals.x, globals.canvas.height - 1);
    globals.y = Math.max(0, globals.y);
    globals.y = Math.min(globals.y, globals.canvas.width - 1);

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

// expects an array of N vertices [x0, y0, x1, x1, ..., xN, yN] in screen space
function screenSpaceToNDC(vertices) {
    const w = globals.canvas.width;
    const h = globals.canvas.height;
    return vertices.map((e, i) => (i % 2 == 0) ? (e / (w / 2) - 1) : (1 - (e / (h / 2))));
}

function initBuffers(gl) {

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
    walls = screenSpaceToNDC(walls)

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(walls), gl.STATIC_DRAW);

    // ========== cells ==========

    const cellsBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, cellsBuffer);

    // position in NDC
    cells = screenSpaceToNDC(cells)

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cells), gl.STATIC_DRAW);

    return {
        walls: { buffer: wallsBuffer, count: walls.length / 2, },
        cells: { buffer: cellsBuffer, count: cells.length / 2, },
        player: { buffer: null, count: 0, },
        rays: { buffer: null, count: 0, },
        // debug
        points: { buffer: null, count: 0, }
    };
}

function intersect(r, p, d) {
    return Math.abs((r - p) / d);
}

function getCell(px, py) {
    console.assert((0 <= px < globals.canvas.width) && (0 <= py < globals.canvas.height));

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
    return ((0.0 <= px) && (px < globals.canvas.width)) && ((0.0 <= py) && (py < globals.canvas.height));
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
    const l = cx - 1            // left

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
    const u = cy - 1            // up
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
    const player = screenSpaceToNDC([globals.x, globals.y]);

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(player), gl.STATIC_DRAW);

    // ========== rays ==========

    const fov = HalfPI; // field of view
    const count = 60;   // number of rays

    let rays = [];
    let points = []; // debug

    let a = globals.angle;
    let b = globals.angle;
    let inc = 1.0;

    if (count > 1) {
        a -= fov / 2;
        b += fov / 2;
        inc = fov / (count - 1);
    }

    for (let angle = a; angle <= b; angle += inc) {

        let theta = angle;

        // clamp angle
        if (theta < 0.0) {
            theta += 2 * Math.PI;
        } else if (theta >= 2 * Math.PI) {
            theta -= 2 * Math.PI;
        }

        const pv = findVerticalIntersection(theta);
        const ph = findHorizontalIntersection(theta);

        let p = null;

        if ((pv != null) && (ph != null)) {
            // TODO: we can use the distance square here
            const d0 = distance(pv[0], pv[1]);
            const d1 = distance(ph[0], ph[1]);

            p = (d0 < d1) ? pv : ph;
        } else if (pv != null) {
            p = pv;
        } else if (ph != null) {
            p = ph;
        }

        if (p != null) {
            rays.push(globals.x, globals.y, ...p);
            // debug
            points.push(...p);
        } else {
            // ray to infinity
        }
    } // for each angle

    gl.deleteBuffer(buffers.rays.buffer);
    const raysBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, raysBuffer);

    rays = screenSpaceToNDC(rays);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rays), gl.STATIC_DRAW);

    // ========== debug points ==========

    gl.deleteBuffer(buffers.points.buffer);
    const pointsBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);

    points = screenSpaceToNDC(points);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

    return {
        walls: buffers.walls,
        cells: buffers.cells,
        player: { buffer: playerBuffer, count: player.length / 2, },
        rays: { buffer: raysBuffer, count: rays.length / 2, },
        // debug
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

function drawScene(gl, programInfo, buffers) {
    gl.clearColor(0.2, 0.2, 0.2, 1.0);
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
        const color = [0.5, 0.5, 0.5, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 63.0);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.walls.count;
        gl.drawArrays(mode, first, count);
    }

    // draw cells

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
        const color = [0.3, 0.3, 0.3, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 63.0);
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

        // gl.uniform1f(programInfo.uniformLocations.uPointSize, 4.0);
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
        const color = [0.0, 1.0, 0.0, 1.0];
        gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 4.0);
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