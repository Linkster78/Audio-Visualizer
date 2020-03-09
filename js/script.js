/* Program Constants */

const CAMERA_DISTANCE = 100;
const FOV = 75;
const POINT_COUNT = 1024;

/* Vue.js Configuration */

var app;
var isFrequency = false;

function initializeVue() {
    app = new Vue({
        el: "#app",
        methods: {
            triggerFileInput: function(e) {
                document.getElementById("audioInput").click();
            },
            loadAudioFile: function(e) {
                loadAudio(e);
            },
            toggleAudio: function(e) {
                if(this.paused) {
                    var remainingUntilBeat = 60000.0 / bpm - (pauseTime - lastBeat);
                    setTimeout(() => {
                        graphicsBeat();
                        lastBeat = Date.now();
                        beatId = setInterval(() => {
                            if(this.paused) return;
                            graphicsBeat();
                            lastBeat = Date.now();
                        }, 60000.0 / bpm);
                    }, remainingUntilBeat);

                    audioCtx.resume();
                } else {
                    pauseTime = Date.now();
                    clearInterval(beatId);

                    audioCtx.suspend();
                }
                this.paused = !this.paused;
            },
            toggleDisplay: function(e) {
                this.frequency = !this.frequency;
                isFrequency = this.frequency;
            }
        },
        data: {
            volume: 1,
            paused: false,
            frequency: false
        },
        watch: {
            volume: function(val) {
                gainNode.gain.setValueAtTime(val, audioCtx.currentTime);
            }
        }
    });
}

/* Audio Playback */

var audioCtx, gainNode, analyserNode, source;
var dataArray, bpm, beatId, lastBeat, pauseTime;

function initializeAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    analyserNode = audioCtx.createAnalyser();

    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    analyserNode.fftSize = POINT_COUNT * 2;
    var bufferLength = analyserNode.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function loadAudio(event) {
    if(source !== undefined) source.stop(0);
    if(beatId !== undefined) clearInterval(beatId);

    source = audioCtx.createBufferSource();
    
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = (e) => {
        var buffer = e.target.result;
        audioCtx.decodeAudioData(buffer, (audioBuffer) => {
            webAudioBeatDetector.analyze(audioBuffer)
                .then((tempo) => {
                    source.buffer = audioBuffer;
                    source.connect(gainNode);
                    source.start(0);

                    bpm = tempo;
                    graphicsBeat();
                    lastBeat = Date.now();
                    beatId = setInterval(() => {
                        graphicsBeat();
                        lastBeat = Date.now();
                    }, 60000.0 / bpm);
                })
                .catch((err) => {
                    console.log(`Error while determining BPM. ${err}`);
                });
        });
    };
    reader.readAsArrayBuffer(file);
}

/* Three.js Visualizer */

var scene, camera, renderer, width, height;
var visualizerLine;

function initializeThree() {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    resizeThree();

    var lineGeometry = new THREE.BufferGeometry();
    var linePoints = new Float32Array(POINT_COUNT * 3);
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePoints, 3));
    var lineMaterial = new THREE.LineBasicMaterial({color:0xFFFFFF});
    visualizerLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(visualizerLine);

    animateThree();
}

function resizeThree() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    var openingAngle = camera.fov * Math.PI / 180;
    height = 2 * Math.tan(openingAngle / 2) * CAMERA_DISTANCE;
    width = height * camera.aspect;
}

function animateThree() {
    requestAnimationFrame(animateThree);

    if(isFrequency) {
        analyserNode.getByteFrequencyData(dataArray);
    } else {
        analyserNode.getByteTimeDomainData(dataArray);
    }

    visualizerLine.geometry.attributes.position.needsUpdate = true;
    var positions = visualizerLine.geometry.attributes.position.array;
    var x, y, z, index;
    y = z = index = 0;
    x = -width / 2;
    for(var i = 0; i < POINT_COUNT; i++) {
        x += width / POINT_COUNT;
        y = dataArray[i] / 256 * height - height / 2;

        positions[index++] = x;
        positions[index++] = y;
        positions[index++] = z;
    }

    renderer.render(scene, camera);
}

function graphicsBeat() {
    renderer.setClearColor(new THREE.Color(`hsl(${Math.random() * 255.0}, 100%, 10%)`));
}

/* Callbacks */

window.onload = (event) => {
    initializeVue();
    initializeAudio();
    initializeThree();
};

window.onresize = resizeThree;