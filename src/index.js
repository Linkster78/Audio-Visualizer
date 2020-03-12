/* Webpack Imports */

import Vue from 'vue';
import { makeNoise2D } from "open-simplex-noise";
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";

/* Program Constants */

const CAMERA_DISTANCE = 100;
const FOV = 75;
const TERRAIN_SIZE = 64;
const TERRAIN_GENERATION_SPEED = 20;
const SUN_RADIUS = 80;
const VISUALIZER_LINE_WIDTH = 25;

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

var audioCtx, gainNode, splitterNode, mergerNode, analyserLNode, analyserRNode, filterLFNode, analyserLFNode, filterHFNode, analyserHFNode;
var dataArray, sources, loading;

function initializeAudio() {
    loading = false;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    splitterNode = audioCtx.createChannelSplitter(2);
    mergerNode = audioCtx.createChannelMerger(2);
    analyserLNode = audioCtx.createAnalyser();
    analyserRNode = audioCtx.createAnalyser();

    splitterNode.connect(analyserLNode, 0);
    splitterNode.connect(analyserRNode, 1);
    analyserLNode.connect(mergerNode, 0, 0);
    analyserRNode.connect(mergerNode, 0, 1);
    mergerNode.connect(gainNode);
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
    loading = true;

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
                        sources[i].connect(splitterNode);
                        break;
                    case 1:
                        sources[i].connect(filterLFNode);
                        break;
                }
                sources[i].start(0);
            }
            sources[0].onended = (event) => {
                if(!loading) {
                    sources = undefined;
                }
            };
            loading = false;
        });
    };
    reader.readAsArrayBuffer(file);
}

/* Three.js Visualizer */

var scene, clock, camera, composer, renderer, width, height;
var noise2d, terrain, sun, visualizerLeft, visualizerRight, tick;

function initializeThree() {
    noise2d = makeNoise2D(Date.now());
    tick = 0;

    scene = new THREE.Scene();
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    var terrainGeometry = new THREE.PlaneGeometry(1250, 500, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
    var terrainMaterial = new THREE.MeshStandardMaterial({
        color: 0x00FF00, emissiveIntensity: 0.5, flatShading: true, side: THREE.DoubleSide
    });
    terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -100;
    scene.add(terrain);

    var sunGeometry = new THREE.CircleGeometry(SUN_RADIUS, 32);
    var sunMaterial = new THREE.MeshBasicMaterial({color: 0xEEDD99});
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.z = -250;
    sun.position.y = 80;
    scene.add(sun);

    var widthAt = getWidthAtDepth(250 + CAMERA_DISTANCE);
    var heightAt = getHeightAtDepth(250 + CAMERA_DISTANCE);
    var usableWidth = widthAt / 2 - SUN_RADIUS * 2 - 10;
    var usableHeight = heightAt / 1.75;
    var lineCount = Math.floor(usableWidth / (VISUALIZER_LINE_WIDTH * 1.75));
    visualizerLeft = new Array(lineCount);
    visualizerRight = new Array(lineCount);
    var lineMaterial = new THREE.MeshBasicMaterial({color: 0xFFFFFF});
    for(var i = 0; i < lineCount; i++) {
        var leftGeometry = new THREE.PlaneGeometry(VISUALIZER_LINE_WIDTH, usableHeight);
        var rightGeometry = new THREE.PlaneGeometry(VISUALIZER_LINE_WIDTH, usableHeight);
        visualizerLeft[i] = new THREE.Mesh(leftGeometry, lineMaterial);
        visualizerRight[i] = new THREE.Mesh(rightGeometry, lineMaterial);
        visualizerLeft[i].position.set(
            -SUN_RADIUS * 2 - VISUALIZER_LINE_WIDTH * 1.25 - (VISUALIZER_LINE_WIDTH * 1.75 * ((lineCount - 1) - i)),
            50, -250);
        visualizerRight[i].position.set(
            SUN_RADIUS * 2 + VISUALIZER_LINE_WIDTH * 1.25 + (VISUALIZER_LINE_WIDTH * 1.75 * ((lineCount - 1) - i)),
            50, -250);
        scene.add(visualizerLeft[i]);
        scene.add(visualizerRight[i]);
    }

    var directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.9);
    directionalLight.position.set(0, 10, 25);
    directionalLight.target.position.set(-5, 0, 0);
    scene.add(directionalLight);
    scene.add(directionalLight.target);

    renderer = new THREE.WebGLRenderer({alpha: true});
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, new BloomEffect({
        luminanceThreshold: 0.7,
    })));

    resizeThree();
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
    composer.setSize(window.innerWidth, window.innerHeight);
    height = getHeightAtDepth(CAMERA_DISTANCE);
    width = getWidthAtDepth(CAMERA_DISTANCE);
}

function animateThree() {
    requestAnimationFrame(animateThree);

    /* Render Sun Bass Visualizer */
    analyserLFNode.getByteTimeDomainData(dataArray);
    var highestLFSample = 0;
    for(var i = 0; i < dataArray.length; i++) {
        if(dataArray[i] > highestLFSample) highestLFSample = dataArray[i];
    }
    var bass = (highestLFSample - 128) / 128;
    var value = Math.max(sun.scale.x - 0.025, 1 + bass);
    sun.scale.x = value;
    sun.scale.y = value;

    /* Render Frequency Visualizers */
    analyserLNode.getByteFrequencyData(dataArray);
    for(var i = 0; i < visualizerLeft.length; i++) {
        var visualizerLine = visualizerLeft[i];
        var dataCount = Math.floor(dataArray.length / visualizerLeft.length);
        var dataSum = 0;
        for(var u = 0; u < dataCount; u++) {
            dataSum += dataArray[i * dataCount + u];
        }
        var dataValue = dataSum / dataCount;
        var lineTotalHeight = -visualizerLine.geometry.vertices[2].y * 2;
        var lineHeight = dataValue / 255 * lineTotalHeight * 1.25 - lineTotalHeight / 2;
        visualizerLine.geometry.vertices[0].y = visualizerLine.geometry.vertices[1].y = lineHeight;
        visualizerLine.geometry.verticesNeedUpdate = true;
    }
    analyserRNode.getByteFrequencyData(dataArray);
    for(var i = 0; i < visualizerRight.length; i++) {
        var visualizerLine = visualizerRight[i];
        var dataCount = Math.floor(dataArray.length / visualizerRight.length);
        var dataSum = 0;
        for(var u = 0; u < dataCount; u++) {
            dataSum += dataArray[i * dataCount + u];
        }
        var dataValue = dataSum / dataCount;
        var lineTotalHeight = -visualizerLine.geometry.vertices[2].y * 2;
        var lineHeight = dataValue / 255 * lineTotalHeight * 1.25 - lineTotalHeight / 2;
        visualizerLine.geometry.vertices[0].y = visualizerLine.geometry.vertices[1].y = lineHeight;
        visualizerLine.geometry.verticesNeedUpdate = true;
    }

    /* Render Terrain */
    if(audioCtx.state != "suspended" && sources !== undefined) tick++;
    if(tick % (60 / TERRAIN_GENERATION_SPEED) == 0) {
        for(var x = 0; x < TERRAIN_SIZE; x++) {
            for(var y = 0; y < TERRAIN_SIZE; y++) {
                terrain.geometry.vertices[y * TERRAIN_SIZE + x].z = (TERRAIN_SIZE - y) / TERRAIN_SIZE * 75 *
                    (noise2d(
                        x / TERRAIN_SIZE * 4,
                        (y - Math.floor(tick / (60 / TERRAIN_GENERATION_SPEED))) / TERRAIN_SIZE * 4
                    ) + 1) / 2;
            }
        }
        terrain.material.color.setHSL((tick / (60 * 20)) % 1.0, 1.0, 0.5);
        var col = terrain.material.color;
        document.body.style.background = `linear-gradient(0deg, rgba(10, 10, 10,1) 0%, rgba(${255 - col.r * 255},${255 - col.g * 255},${255 - col.b * 255},1) 100%)`;
        terrain.geometry.verticesNeedUpdate = true;
    }

    composer.render(clock.getDelta());
}

/* Setting Callbacks */

window.onload = (event) => {
    initializeVue();
    initializeAudio();
    initializeThree();
};

window.onresize = resizeThree;