const KEY_SHIFT = 16;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;

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
    [globals.x, globals.y] = translate([globals.x, globals.y], [-dx, -dy]);
    [globals.x, globals.y] = rotate([globals.x, globals.y], -globals.angle);

    // move forward
    if (globals.keys[KEY_W]) {
        globals.x = globals.x + step;
    }

    // strafe left
    if (globals.keys[KEY_LEFT]) {
        globals.y = globals.y - step;
    }

    // move backward
    if (globals.keys[KEY_S]) {
        globals.x = globals.x - step;
    }

    // strafe right
    if (globals.keys[KEY_RIGHT]) {
        globals.y = globals.y + step;
    }

    // modulate with dt
    const theta = dt * 0.005;

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

    // player space -> screen space
    [globals.x, globals.y] = rotate([globals.x, globals.y], globals.angle);
    [globals.x, globals.y] = translate([globals.x, globals.y], [dx, dy]);

    // clamp position
    globals.x = Math.max(0, globals.x);
    globals.x = Math.min(globals.x, globals.canvas.height - 1);
    globals.y = Math.max(0, globals.y);
    globals.y = Math.min(globals.y, globals.canvas.width - 1);
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

let ppx = 0.0;
let ppy = 0.0;

function getCell(px, py) {
    console.assert((0 <= px < globals.canvas.width) && (0 <= py < globals.canvas.height));

    const cx = Math.floor(px / globals.size);
    const cy = Math.floor(py / globals.size);
    console.assert((0 <= cx < globals.cols) && (0 <= cy < globals.rows));

    if (ppx != px || ppy != py) {
        ppx = px;
        ppy = py;

        console.log(globals.x, globals.y);
        console.log(px, py);
        console.log(cx, cy);
    }

    const i = cx * globals.cols + cy;
    return globals.grid[i];
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

    // find first cell intersection

    let px = globals.x;
    let py = globals.y;
    let dx = Math.cos(globals.angle);
    let dy = Math.sin(globals.angle);

    // cell
    const cx = Math.floor(px / globals.size) * globals.size;
    const cy = Math.floor(py / globals.size) * globals.size;

    const r = cx + globals.size // right
    const u = cy - 1            // up
    const l = cx - 1            // left
    const d = cy + globals.size // down

    const half = Math.PI / 2;

    let rx = 0.0;
    let ry = 0.0;

    // console.log(px, py, dx, dy, r, u, l, d, globals.angle);

    if (((3 * half) <= globals.angle) && (globals.angle < (2 * Math.PI))) {
        // test right and up
        //    ^
        //    | /
        // ---+--->
        //    |  
        rx = r;
        ry = u;
    } else if ((Math.PI <= globals.angle) && (globals.angle < (3 * half))) {
        // test up and left
        //    ^
        //  \ |  
        // ---+--->
        //    |  
        rx = l;
        ry = u;
    } else if ((half <= globals.angle) && (globals.angle < (Math.PI))) {
        // test left and down
        //    ^
        //    |  
        // ---+--->
        //  / |  
        rx = l;
        ry = d;
    } else {
        // test down and right
        //    ^
        //    |  
        // ---+--->
        //    | \
        rx = r;
        ry = d;
    }

    const t0 = (globals.angle == (2 * Math.PI - half)) ? null : intersect(rx, px, dx);
    const t1 = (dy == 0) ? null : intersect(ry, py, dy);
    // const t = Math.min(t0, t1);

    let points = [];

    if (t0 != null) {
        points.push(px + t0 * dx, py + t0 * dy);
    }

    if (t1 != null) {
        points.push(px + t1 * dx, py + t1 * dy);
    }

    // px = px + t * dx;
    // py = py + t * dy;

    let vx = px + t0 * dx;
    let vy = py + t0 * dy;

    let hx = px + t1 * dx;
    let hy = py + t1 * dy;

    let found = false;

    // switch (getCell(px, py)) {
    //     case 0: // empty
    //         break;
    //     case 1: // wall
    //         found = true;
    //         break;
    // }

    let v = false;
    let h = false;

    dx = Math.tan(half - globals.angle);
    dy = Math.tan(globals.angle);

    // let t = 0.0;

    const sign = (half < globals.angle) && (globals.angle < (3 * half)) ? -1 : +1;

    if (t0 != null) {
        points.push(points[0] + sign * globals.size, points[1] + dy * sign * globals.size);
    }

    console.log(points);

    // while (!found) {

    //     v = isWall(vx, vy); // or out of grid
    //     h = isWall(hx, hy); // or out of grid

    //     if (v && h) {
    //         found = true;
    //         t = Math.min(t0, t1);
    //     }

    //     if (!v) {

    //     }

    //     found = true;
    // }

    gl.deleteBuffer(buffers.rays.buffer);
    const raysBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, raysBuffer);

    const rays = screenSpaceToNDC([
        globals.x,
        globals.y,
        px,
        py]);

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

        gl.uniform1f(programInfo.uniformLocations.uPointSize, 4.0);
    }

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = buffers.points.count;
        gl.drawArrays(mode, first, count);
    }
}

window.onload = main;