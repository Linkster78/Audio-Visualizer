/* Program Constants */

const CAMERA_DISTANCE = 100;
const FOV = 75;
const TERRAIN_SIZE = 64;
const TERRAIN_GENERATION_SPEED = 20;

/* Vue.js Configuration */

var app;

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
                    audioCtx.resume();
                } else {
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

var audioCtx, gainNode, sources, filterLFNode, analyserLFNode, filterHFNode, analyserHFNode;
var dataArray;

function initializeAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);

    filterLFNode = audioCtx.createBiquadFilter();
    analyserLFNode = audioCtx.createAnalyser();

    filterLFNode.connect(analyserLFNode);

    filterLFNode.type = "lowpass";
    filterLFNode.frequency.setValueAtTime(250, audioCtx.currentTime);
    filterLFNode.gain.setValueAtTime(25, audioCtx.currentTime);

    analyserLFNode.fftSize = 2048;
    var bufferLength = analyserLFNode.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
}

function loadAudio(event) {
    if(sources !== undefined) sources.forEach((source) => source.stop(0));

    sources = new Array(2);
    for(var i = 0; i < sources.length; i++) {
        sources[i] = audioCtx.createBufferSource();
    }
    
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = (e) => {
        var buffer = e.target.result;
        audioCtx.decodeAudioData(buffer, (audioBuffer) => {
            for(var i = 0; i < sources.length; i++) {
                sources[i].buffer = audioBuffer;
                switch(i) {
                    case 0:
                        sources[i].connect(gainNode);
                        break;
                    case 1:
                        sources[i].connect(filterLFNode);
                        break;
                }
                sources[i].start(0);
            }
        });
    };
    reader.readAsArrayBuffer(file);
}

/* Three.js Visualizer */

var perlin, scene, camera, renderer, width, height;
var terrain, sun, sunCenter, tick;

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

    var sunGeometry = new THREE.CircleGeometry(50, 32);
    var sunMaterial = new THREE.MeshBasicMaterial({color: 0xFFEA00});
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.z = -125;
    sun.position.y = 80;
    scene.add(sun);

    var ambientLight = new THREE.AmbientLight(0x303030);
    scene.add(ambientLight);

    var directionalLight = new THREE.DirectionalLight(0x707070, 0.6);
    directionalLight.position.set(0, 10, 25);
    directionalLight.target.position.set(-5, 0, 0);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    animateThree();
}

function getHeightAtDepth(depth) {
    var openingAngle = camera.fov * Math.PI / 180;
    return 2 * Math.tan(openingAngle / 2) * depth;
}

function getWidthAtDepth(depth) {
    return getHeightAtDepth(depth) * camera.aspect;
}

function resizeThree() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    height = getHeightAtDepth(CAMERA_DISTANCE);
    width = getWidthAtDepth(CAMERA_DISTANCE);
}

function animateThree() {
    requestAnimationFrame(animateThree);

    analyserLFNode.getByteTimeDomainData(dataArray);
    var highestLFSample = 0;
    for(var i = 0; i < dataArray.length; i++) {
        if(dataArray[i] > highestLFSample) highestLFSample = dataArray[i];
    }
    var bass = (highestLFSample - 128) / 128;
    var value = Math.max(sun.scale.x - 0.025, 1 + bass);
    sun.scale.x = value;
    sun.scale.y = value;

    if(audioCtx.state != "suspended" && sources !== undefined) tick++;
    if(tick % (60 / TERRAIN_GENERATION_SPEED) == 0) {
        for(var x = 0; x < TERRAIN_SIZE; x++) {
            for(var y = 0; y < TERRAIN_SIZE; y++) {
                terrain.geometry.vertices[y * TERRAIN_SIZE + x].z = (TERRAIN_SIZE - y) / TERRAIN_SIZE * 75 *
                    perlin.noise(x / TERRAIN_SIZE * 3,
                         (y - Math.floor(tick / (60 / TERRAIN_GENERATION_SPEED))) / TERRAIN_SIZE * 3,
                          0);
            }
        }
        terrain.material.color.setHSL((tick / (60 * 15)) % 1, 1.0, 0.6);
        terrain.geometry.verticesNeedUpdate = true;
    }

    renderer.render(scene, camera);
}

/* Setting Callbacks */

window.onload = (event) => {
    initializeVue();
    initializeAudio();
    initializeThree();
};

window.onresize = resizeThree;