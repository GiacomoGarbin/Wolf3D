const KEY_SHIFT = 16;
const KEY_A = 65;
const KEY_D = 68;
const KEY_S = 83;
const KEY_W = 87;

globals = {
    canvas: null,
    x: 0,
    y: 0,
    keys: {
        KEY_SHIFT: false,
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
      gl_PointSize = 10.0;
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

    const buffers = initBuffers(gl);

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

        drawScene(gl, programInfo, buffers, dt);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

function shortcuts(event) {
    //console.log(event.keyCode, event.type);
    switch (event.keyCode) {
        case KEY_SHIFT:
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
}

function updateStats(stats, dt) {
    stats.frames += 1;
    stats.elapsed += dt;

    stats.element.innerText = "fps: " + (1000 / dt).toFixed(3) + " | " + dt.toFixed(3) + " ms";
}

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();

    // select the buffer to apply buffer operations to from here out

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // points position in NDC

    const positions1 = [
        -1.0, -1.0, 1.0,
        1.0, -1.0, 1.0,
        1.0, 1.0, 1.0,
        -1.0, 1.0, 1.0,
    ];

    const positions = positions1.map(x => x * 0.5);

    // fill the current buffer.

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        position: positionBuffer,
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

    {
        const numComponents = 3;
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

    gl.useProgram(programInfo.program);

    const color = [0.0, 1.0, 0.0, 1.0];
    gl.uniform4fv(programInfo.uniformLocations.uFragColor, new Float32Array(color));

    {
        const mode = gl.POINTS;
        const first = 0;
        const count = 4;
        gl.drawArrays(mode, first, count);
    }
}

window.onload = main;