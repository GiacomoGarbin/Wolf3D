const KEY_SHIFT = 16;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;

globals = {
    canvas: null,
    x: 0,
    y: 0,
    angle: 0.0,
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
    attribute vec4 aVertexPosition;
    void main(void) {
      gl_Position = aVertexPosition;
      gl_PointSize = 4.0;
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
        },
    };

    buffers = initBuffers(gl);

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

function processInput(dt) {
    // double the speed by pressing SHIFT and modulate with dt
    step = (globals.keys[KEY_SHIFT] ? 2 : 1) * dt * 0.05;

    n = 0;
    n += (globals.keys[KEY_W] ? 1 : 0);
    n += (globals.keys[KEY_A] ? 1 : 0);
    n += (globals.keys[KEY_S] ? 1 : 0);
    n += (globals.keys[KEY_D] ? 1 : 0);

    // are we moving diagonally?
    if (n == 2) {
        // this second if it is not necessary as opposite directions cancel each other out
        if ((globals.keys[KEY_W] != globals.keys[KEY_S]) || (globals.keys[KEY_A] != globals.keys[KEY_D])) {
            // then modulate step, TODO: cache sqrt(2)/2
            step *= Math.sqrt(2) / 2;
        }
    }

    if (globals.keys[KEY_W]) {
        globals.y = Math.max(0, globals.y - step);
    }

    if (globals.keys[KEY_A]) {
        globals.x = Math.max(0, globals.x - step);
    }

    if (globals.keys[KEY_S]) {
        globals.y = Math.min(globals.y + step, globals.canvas.height - 1);
    }

    if (globals.keys[KEY_D]) {
        globals.x = Math.min(globals.x + step, globals.canvas.width - 1);
    }

    const theta = dt * 0.005;

    if (globals.keys[KEY_LEFT]) {
        globals.angle = globals.angle - theta;

        if (globals.angle < 0.0) {
            globals.angle += 2 * Math.PI;
        } else if (globals.angle > 2 * Math.PI) {
            globals.angle -= 2 * Math.PI;
        }
    }

    if (globals.keys[KEY_RIGHT]) {
        globals.angle = globals.angle + theta;
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
    const playerBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out

    gl.bindBuffer(gl.ARRAY_BUFFER, playerBuffer);

    // position in NDC

    const positions = screenSpaceToNDC([globals.x, globals.y])

    // fill the current buffer

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        grid: null,
        player: null,
        rays: null,
    };
}

function updateBuffers(gl, buffers) {

    // ========== player ==========

    gl.deleteBuffer(buffers.player);
    const playerBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out
    gl.bindBuffer(gl.ARRAY_BUFFER, playerBuffer);

    // position in NDC
    const player = screenSpaceToNDC([globals.x, globals.y]);

    // fill the current buffer
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(player), gl.STATIC_DRAW);

    // ========== rays ==========

    gl.deleteBuffer(buffers.rays);
    const raysBuffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, raysBuffer);

    const length = 100.0;
    const rays = screenSpaceToNDC([
        globals.x,
        globals.y,
        globals.x + length * Math.cos(globals.angle),
        globals.y + length * Math.sin(globals.angle)]);

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(rays), gl.STATIC_DRAW);

    return {
        grid: buffers.grid,
        player: playerBuffer,
        rays: raysBuffer,
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
    gl.clearColor(0.5, 0.5, 0.5, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);

    // draw grid


    // draw rays

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.rays);
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
        const count = 2;
        gl.drawArrays(mode, first, count);
    }

    // draw player

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.player);
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

    const color = [0.0, 1.0, 0.0, 1.0];
    gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = 1;
        gl.drawArrays(mode, first, count);
    }
}

window.onload = main;