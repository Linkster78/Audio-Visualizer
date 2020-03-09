/* Program Constants */

const CAMERA_DISTANCE = 100;
const FOV = 75;
const TERRAIN_SIZE = 64;
const TERRAIN_GENERATION_SPEED = 20;

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
                    if(source !== undefined) {
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
                    }

                    audioCtx.resume();
                } else {
                    pauseTime = Date.now();
                    clearInterval(beatId);

                    audioCtx.suspend();
                }
                this.paused = !this.paused;
            }
        },
        data: {
            volume: 1,
            paused: false
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
    analyserNode = audioCtx.createAnalyser();
    gainNode = audioCtx.createGain();

    analyserNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    analyserNode.fftSize = 2048;
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
                    source.connect(analyserNode);
                    source.start(0);
                    source.onended = (e) => {
                        source = undefined;
                        clearInterval(beatId);
                    };

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

var perlin, scene, camera, renderer, width, height;
var terrain, tick;

function initializeThree() {
    perlin = new Perlin(Date.now());
    tick = 0;

    renderer = new THREE.WebGLRenderer({alpha: true});
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    resizeThree();

    var terrainGeometry = new THREE.PlaneGeometry(500, 250, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
    var terrainMaterial = new THREE.MeshStandardMaterial({
        emissive: 0x00CC26, emissiveIntensity: 0.5, flatShading: true,
        side: THREE.DoubleSide
    });
    terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -50;
    scene.add(terrain);

    var ambientLight = new THREE.AmbientLight(0x303030);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0x707070, 0.6);
    directionalLight.position.set(0, 10, 25);
    directionalLight.target.position.set(-5, 0, 0);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

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

    tick++;

    if(tick % (60 / TERRAIN_GENERATION_SPEED) == 0) {
        for(var x = 0; x < TERRAIN_SIZE; x++) {
            for(var y = 0; y < TERRAIN_SIZE; y++) {
                terrain.geometry.vertices[y * TERRAIN_SIZE + x].z = (TERRAIN_SIZE - y) / TERRAIN_SIZE * 75 *
                    perlin.noise(x / TERRAIN_SIZE * 3,
                         (y - Math.floor(tick / (60 / TERRAIN_GENERATION_SPEED))) / TERRAIN_SIZE * 3,
                          0);
            }
        }
        terrain.geometry.verticesNeedUpdate = true;
    }

    renderer.render(scene, camera);
}

function graphicsBeat() {
    /* DO SOMETHING WITH BEAT, OR MAYBE USE A SINE WAVE TO INTERPOLATE AN EFFECT WITH THE GIVEN FREQUENCY? */
}

/* Setting Callbacks */

window.onload = (event) => {
    initializeVue();
    initializeAudio();
    initializeThree();
};

window.onresize = resizeThree;