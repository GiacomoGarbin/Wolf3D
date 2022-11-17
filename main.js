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

    // Vertex shader program

    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;
    varying highp vec2 vTextureCoord;
    void main(void) {
      gl_Position = aVertexPosition;
      vTextureCoord = aTextureCoord;
    }
  `;

    // Fragment shader program

    const fsSource = `
    varying highp vec2 vTextureCoord;
    uniform sampler2D uSampler;
    void main(void) {
      gl_FragColor = texture2D(uSampler, vTextureCoord);
      // gl_FragColor = vec4(vTextureCoord, 0, 1);
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

    const buffers = initBuffers(gl);

    texture = loadTexture(gl, globals.canvas.width, globals.canvas.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

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

        // update texture
        texture = updateTexture(gl, texture, globals.canvas.width, globals.canvas.height, globals.x, globals.y)

        drawScene(gl, programInfo, buffers, texture, dt);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
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

function updateTexture(gl, tex, w, h, x, y) {
    gl.deleteTexture(tex);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = w;
    const height = h;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array(w * h * 4);

    const radius = 5;

    for (row = 0; row < h; ++row) {
        for (col = 0; col < w; ++col) {
            i = (row * w + col) * 4;

            r = 127;
            g = 127;
            b = 127;

            if ((Math.abs(row - y) <= radius) && (Math.abs(col - x) <= radius)) {
                r = 255;
                g = 0;
                b = 0;
            }

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

    return texture;
}

function initBuffers(gl) {
    // Create a buffer for the cube's vertex positions.

    const positionBuffer = gl.createBuffer();

    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Now create an array of positions for the cube.

    const positions = [
        // Front face
        -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
    ];

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    // Now set up the texture coordinates for the faces.

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    const textureCoordinates = [
        // Front
        0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0,
    ];

    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(textureCoordinates),
        gl.STATIC_DRAW
    );

    // Build the element array buffer; this specifies the indices
    // into the vertex arrays for each face's vertices.

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

    // This array defines each face as two triangles, using the
    // indices into the vertex array to specify each triangle's
    // position.

    const indices = [
        0,
        1,
        2,
        0,
        2,
        3, // front
    ];

    // Now send the element array to GL

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

function loadTexture(gl, w, h) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = w;
    const height = h;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array(w * h * 4);

    for (row = 0; row < h; ++row) {
        for (col = 0; col < w; ++col) {
            i = (row * w + col) * 4;
            pixel[i + 0] = row / (h - 1) * 255;
            pixel[i + 1] = col / (w - 1) * 255;
            pixel[i + 2] = 0;
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

    return texture;
}

function drawScene(gl, programInfo, buffers, texture, dt) {
    // update texture

    gl.clearColor(1.0, 1.0, 0.0, 1.0);
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

window.onload = main;