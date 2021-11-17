import {updateStatus, generateExhibition} from "./main.js"
import {setPosition} from "./multiplayer.js"
import {timeStart, timeEnd} from "./utils.js"
import {
    createPicture,
    createAudio,
    createImagePlane,
    createTextPlane,
    createDoorWall,
    createWall,
} from "./objects.js"

import * as THREE from "three"
import {PointerLockControls} from "three/examples/jsm/controls/PointerLockControls"
//import {VRButton} from "three/examples/jsm/webxr/VRButton.js"
import {XRControllerModelFactory} from "three/examples/jsm/webxr/XRControllerModelFactory.js"
import {Sky} from "three/examples/jsm/objects/Sky"
import {Text, preloadFont, getSelectionRects} from "troika-three-text"

Array.prototype.sum = function () {
    return this.reduce((partial_sum, a) => partial_sum + a, 0)
}

function isIterable(obj) {
    // checks for null and undefined
    if (obj == null) {
        return false
    }
    return typeof obj[Symbol.iterator] === "function"
}

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

var WALL_TEXTURE, FLOOR_TEXTURE
FLOOR_TEXTURE = loadMaterial("plywood", 256, 0x665d48)

let everything

let scene
let renderer
let controls
let camera, raycaster, mapCamera
let clock
let listener

let selectedObject

let moveForward = false
let moveBackward = false
let moveLeft = false
let moveRight = false
let moveUp = false
let moveDown = false
let canJump = false
let showMap = true
const velocity = new THREE.Vector3()
const direction = new THREE.Vector3()
const defaultMovementSpeed = 800
let movementSpeed = defaultMovementSpeed

// a variable to store the values from the last polling of the gamepads
const prevGamePads = new Map()

let players = {}

preloadFont({font: null}, () => {})

const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
})

function clearObjects(obj) {
    while (obj.children.length > 0) {
        clearObjects(obj.children[0])
        obj.remove(obj.children[0])
    }
    if (obj.geometry) obj.geometry.dispose()
    if (obj instanceof THREE.PositionalAudio) obj.stop()

    // TODO: If obj is a Text, call dispose on it, see
    // https://protectwise.github.io/troika/troika-three-text/

    if (obj.material) {
        Object.keys(obj.material).forEach((prop) => {
            if (!obj.material[prop]) return
            if (
                obj.material[prop] !== null &&
                typeof obj.material[prop].dispose === "function"
            )
                obj.material[prop].dispose()
        })
        obj.material.dispose()
    }
}

export async function render(exhibition) {
    if (everything) {
        clearObjects(everything)
        everything.removeFromParent()
    }

    everything = await generateChapter(exhibition, false)

    var ta = timeStart("add to scene")
    scene.add(everything)
    timeEnd(ta)

    updateStatus("")

    var tf = timeStart("floor")
    setupScene(everything)
    timeEnd(tf)
}

async function generateChapter(chapter, stack = false) {
    var te = timeStart("entrance")
    let group = new THREE.Group()

    updateStatus(`Generating "${chapter.name}"...`)

    // Generate entrance sign.
    let text = await createTextPlane({text: chapter.name, links: []}, 50, 3)
    text.position.x = 0
    text.position.y = 20
    text.position.z = 1
    group.add(text)
    timeEnd(te)

    // Generate subrooms.
    const roomPromises = chapter.sections.map((c) => generateChapter(c))

    var to = timeStart("imagedata")
    let picturePromises = generateImageData(chapter)
    timeEnd(to)

    var tp = timeStart("objectpromises")
    var objectPromises = []
    objectPromises.push(...picturePromises)
    objectPromises.push(...roomPromises)
    var objects = await Promise.all(objectPromises)
    timeEnd(tp)

    var td = timeStart("distribute")
    if (stack) {
        let floorHeight = 50

        for (let i = 0; i < objects.length; i++) {
            objects[i].position.y = i * floorHeight
            group.add(objects[i])
        }
    } else {
        distributeObjects(objects, group, 10, false)
    }
    timeEnd(td)
    return group
}

function generateImageData(chapter) {
    let things = []
    if (window.SETTINGS.images) {
        const images = chapter.images.filter(
            (image) => image && image.url.match(/\.(jpg|jpeg|png|svg)$/i)
        )
        things.unshift(...images.map((image) => createPicture(image)))

        const audio = chapter.images.filter(
            (audio) => audio && audio.url.match(/\.(ogg|mp3|wav)$/i)
        )
        things.unshift(...audio.map((audio) => createAudio(audio, listener)))
    }
    if (window.SETTINGS.texts) {
        things.unshift(
            ...chapter.paragraphs.map((paragraph) =>
                createTextPlane(paragraph, 20)
            )
        )
    }
    return things
}

export function animate() {
    const delta = clock.getDelta()

    //if (delta > 0.1) {
    //    // Moving with a delta this big wouldn't look good. Do nothing.
    //    requestAnimationFrame(animate)
    //    return
    //}

    //xrInput()

    velocity.x -= velocity.x * 10.0 * delta
    velocity.z -= velocity.z * 10.0 * delta
    velocity.y -= velocity.y * 10.0 * delta

    //velocity.y -= 9.8 * 100.0 * delta

    direction.z = Number(moveForward) - Number(moveBackward)
    direction.x = Number(moveRight) - Number(moveLeft)
    direction.y = Number(moveUp) - Number(moveDown)
    direction.normalize()

    if (moveForward || moveBackward)
        velocity.z -= direction.z * movementSpeed * delta
    if (moveLeft || moveRight) velocity.x -= direction.x * movementSpeed * delta
    if (moveUp || moveDown)
        velocity.y -= direction.y * movementSpeed * 3 * delta

    controls.moveRight(-velocity.x * delta)
    controls.moveForward(-velocity.z * delta)
    controls.getObject().position.y += velocity.y * delta

    if (controls.getObject().position.y < 0) {
        velocity.y = 0
        controls.getObject().position.y = 0

        canJump = true
    }

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    const intersects = raycaster.intersectObjects(scene.children, true)
    if (intersects.length > 0) {
        if (selectedObject != intersects[0].object) {
            //if (selectedObject)
            //    selectedObject.material.emissive.setHex(
            //        selectedObject.currentHex
            //    )

            selectedObject = intersects[0].object
            //selectedObject.currentHex =
            //    selectedObject.material.emissive.getHex()
            //selectedObject.material.emissive.setHex(0xff0000)
        }
    } else {
        //if (selectedObject)
        //    selectedObject.material.emissive.setHex(selectedObject.currentHex)

        selectedObject = null
    }

    let dir = controls.getObject().getWorldDirection(new THREE.Vector3(0, 0, 0)) // Trash input vector
    setPosition(
        controls.getObject().position.x,
        controls.getObject().position.y,
        controls.getObject().position.z,
        dir.x,
        dir.y,
        dir.z
    )

    //requestAnimationFrame(animate)

    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight)
    renderer.setScissor(0, 0, window.innerWidth, window.innerHeight)
    //renderer.clear();

    renderer.render(scene, camera)

    const mapWidth = Math.max(window.innerWidth / 6, 200)
    const mapHeight = mapWidth

    if (showMap) {
        renderer.setViewport(10, 10, mapWidth, mapHeight)
        const borderSize = 3
        renderer.setScissor(
            10 - borderSize,
            10 - borderSize,
            mapWidth + borderSize * 2,
            mapHeight + borderSize * 2
        )
        renderer.render(scene, mapCamera)
    }
}

function xrInput() {
    const session = renderer.xr.getSession()
    let i = 0
    let handedness

    if (session) {
        // A check to prevent console errors if only one input source.
        moveLeft = moveRight = moveForward = moveBackward = false
        if (isIterable(session.inputSources)) {
            for (const source of session.inputSources) {
                if (source && source.handedness) {
                    handedness = source.handedness //left or right controllers
                }
                if (!source.gamepad) continue
                const controller = renderer.xr.getController(i++)
                const old = prevGamePads.get(source)
                const data = {
                    handedness: handedness,
                    buttons: source.gamepad.buttons.map((b) => b.value),
                    axes: source.gamepad.axes.slice(0),
                }
                if (old) {
                    data.buttons.forEach((value, i) => {
                        //handlers for buttons
                        if (value !== old.buttons[i] || Math.abs(value) > 0.8) {
                            //check if it is 'all the way pushed'
                            if (value === 1) {
                                if (data.handedness == "left") {
                                    if (i == 1) {
                                        //dolly.rotateY(-THREE.Math.degToRad(1));
                                    }
                                    if (i == 3) {
                                        ////reset teleport to home position
                                        //dolly.position.x = 0;
                                        //dolly.position.y = 5;
                                        //dolly.position.z = 0;
                                    }
                                } else {
                                    if (i == 1) {
                                        //dolly.rotateY(THREE.Math.degToRad(1));
                                    }
                                }
                            } else {
                                if (i == 1) {
                                    //use the paddle buttons to rotate
                                    if (data.handedness == "left") {
                                        //dolly.rotateY(-THREE.Math.degToRad(Math.abs(value)));
                                    } else {
                                        //dolly.rotateY(THREE.Math.degToRad(Math.abs(value)));
                                    }
                                }
                            }
                        }
                    })
                    data.axes.forEach((value, i) => {
                        if (i == 2) {
                            if (Math.abs(value) > 0.2) {
                                if (data.axes[2] > 0) {
                                    moveLeft = true
                                } else {
                                    moveRight = true
                                }
                            }
                        }

                        if (i == 3) {
                            if (Math.abs(value) > 0.2) {
                                if (data.axes[3] > 0) {
                                    moveForward = true
                                } else {
                                    moveBackward = true
                                }
                            }
                        }
                    })
                }
                prevGamePads.set(source, data)
            }
        }
    }
}

export function setup() {
    clock = new THREE.Clock()

    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xa3c3f7)

    camera = new THREE.PerspectiveCamera(
        75,
        CANVAS_WIDTH / CANVAS_HEIGHT,
        0.1,
        4000
    )
    const mapCameraSize = 1
    mapCamera = new THREE.OrthographicCamera(
        -mapCameraSize,
        mapCameraSize,
        mapCameraSize,
        -mapCameraSize,
        0,
        2000
    )
    listener = new THREE.AudioListener()

    raycaster = new THREE.Raycaster()
    raycaster.layers.set(1)

    renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT)
    renderer.xr.enabled = true
    renderer.setClearColor(0xff0000, 1)
    renderer.setScissorTest(true)
    //renderer.autoClear = false;

    //renderer.outputEncoding = THREE.sRGBEncoding;
    //renderer.toneMapping = THREE.ACESFilmicToneMapping;
    //renderer.toneMappingExposure = 1
    document.body.appendChild(renderer.domElement)

    //const xrController = renderer.xr.getController(0)

    //if (HDR) {
    //    const loader = new THREE.TextureLoader()
    //    const texture = loader.load("hdrs/kloppenheim_06.jpg", () => {
    //        const rt = new THREE.WebGLCubeRenderTarget(texture.image.height)
    //        rt.fromEquirectangularTexture(renderer, texture)
    //        scene.background = rt.texture
    //    })
    //}

    controls = new PointerLockControls(camera, document.body)

    renderer.domElement.addEventListener("click", function () {
        controls.lock()
    })

    document.addEventListener("mousedown", () => {
        if (controls.isLocked && selectedObject?.myLink) {
            generateExhibition(selectedObject.myLink)
        }
    })

    const onKeyDown = function (event) {
        if (!controls.isLocked) {
            return
        }

        switch (event.code) {
            case "ArrowUp":
            case "KeyW":
                moveForward = true
                break

            case "ArrowLeft":
            case "KeyA":
                moveLeft = true
                break

            case "ArrowDown":
            case "KeyS":
                moveBackward = true
                break

            case "ArrowRight":
            case "KeyD":
                moveRight = true
                break

            case "KeyQ":
                moveUp = true
                break

            case "KeyE":
                moveDown = true
                break

            case "KeyM":
                showMap = !showMap
                break

            case "Space":
                if (canJump === true) velocity.y += 350
                canJump = false
                break

            case "ShiftLeft":
            case "ShiftRight":
                movementSpeed = 3 * defaultMovementSpeed
                break
        }
    }

    const onKeyUp = function (event) {
        if (!controls.isLocked) {
            return
        }

        switch (event.code) {
            case "ArrowUp":
            case "KeyW":
                moveForward = false
                break

            case "ArrowLeft":
            case "KeyA":
                moveLeft = false
                break

            case "ArrowDown":
            case "KeyS":
                moveBackward = false
                break

            case "ArrowRight":
            case "KeyD":
                moveRight = false
                break

            case "KeyQ":
                moveUp = false
                break

            case "KeyE":
                moveDown = false
                break

            case "ShiftLeft":
            case "ShiftRight":
                movementSpeed = defaultMovementSpeed
                break
        }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)

    setupSceneOnce()

    onWindowResize()
    window.addEventListener("resize", onWindowResize)

    //document.body.appendChild(VRButton.createButton(renderer))

    renderer.setAnimationLoop(animate)
}

export function loadMaterial(path, scaling, fallbackColor) {
    if (window?.SETTINGS?.textures) {
        let materialData = {
            map: new THREE.TextureLoader().load(`textures/${path}_diff.png`),
            normal: new THREE.TextureLoader().load(
                `textures/${path}_nor_gl.png`
            ),
            rough: new THREE.TextureLoader().load(`textures/${path}_rough.png`),
            arm: new THREE.TextureLoader().load(`textures/${path}_arm.png`),
            ao: new THREE.TextureLoader().load(`textures/${path}_ao.png`),
        }

        for (const [key, value] of Object.entries(materialData)) {
            value.wrapS = THREE.RepeatWrapping
            value.wrapT = THREE.RepeatWrapping
            value.repeat.set(scaling, scaling)
        }

        return new THREE.MeshStandardMaterial({
            map: materialData.map,
            normalMap: materialData.normal,
            roughnessMap: materialData.rough,
            aoMap: materialData.ao,
            side: THREE.DoubleSide,
        })
    } else {
        return new THREE.MeshStandardMaterial({
            color: fallbackColor,
            side: THREE.DoubleSide,
        })
    }
}

function setupSceneOnce() {
    var sky = new Sky()
    sky.scale.setScalar(300000)
    sky.material.uniforms.turbidity.value = 2
    sky.material.uniforms.rayleigh.value = 1
    sky.material.uniforms.mieCoefficient.value = 0.005
    sky.material.uniforms.mieDirectionalG.value = 0.8
    const phi = THREE.MathUtils.degToRad(90 - 30)
    const theta = THREE.MathUtils.degToRad(0)
    let sun = new THREE.Vector3()
    sun.setFromSphericalCoords(1, phi, theta)
    sky.material.uniforms.sunPosition.value.copy(sun)
    scene.add(sky)

    const ambient = new THREE.AmbientLight(0xffffff, 0.2) // soft white light
    if (!window.SETTINGS.lights) {
        ambient.intensity = 1
    }
    scene.add(ambient)

    const geometry = new THREE.CylinderGeometry(4000, 4000, 10, 128)
    const ground = new THREE.Mesh(geometry, FLOOR_TEXTURE)
    if (window.SETTINGS.shadows) {
        ground.receiveShadow = true
    }
    scene.add(ground)
    ground.position.y = -30

    const crosshairMaterial = new THREE.MeshBasicMaterial({color: 0xbcc0ef})
    var crosshair = new THREE.Mesh(
        new THREE.SphereGeometry(0.005),
        crosshairMaterial
    )
    crosshair.position.z = -0.5

    camera.add(crosshair)
    camera.add(listener)
    scene.add(camera)

    scene.add(mapCamera)

    const light = new THREE.DirectionalLight(0xffffff, 0.5)
    light.position.x += 3
    light.position.y += 3
    light.position.z += 1
    light.castShadow = true
    light.shadow.mapSize.width = 4 * 512
    light.shadow.mapSize.height = 4 * 512
    light.shadow.bias = -0.0001
    scene.add(light)
}

function setupScene(everything) {
    const w = scene.myWidth

    // Set players on a random position in a half circle around the entrance.
    let randomAngle = Math.random() * Math.PI
    let distance = 60
    var initialCameraPosition = new THREE.Vector3(
        Math.cos(randomAngle) * distance,
        0,
        Math.sin(randomAngle) * distance
    )
    camera.position.x = initialCameraPosition.x
    camera.position.y = initialCameraPosition.y
    camera.position.z = initialCameraPosition.z
    camera.lookAt(0, 0, 0)

    if (everything) {
        // Set up map camera.
        let aabb = new THREE.Box3().setFromObject(everything)
        let center = new THREE.Vector3()
        aabb.getCenter(center)
        center.y = 1000

        const size = new THREE.Vector3()
        aabb.getSize(size)
        const maxSize = Math.max(size.x, size.z)
        const mapCameraSize = maxSize / 2 + 50
        mapCamera.left = -mapCameraSize
        mapCamera.right = mapCameraSize
        mapCamera.top = mapCameraSize
        mapCamera.bottom = -mapCameraSize
        mapCamera.updateProjectionMatrix()

        mapCamera.position.copy(center)
        mapCamera.up = new THREE.Vector3(0, 0, -1)
        mapCamera.lookAt(new THREE.Vector3(center.x, 0, center.z))
    }

    if (window.SETTINGS.lights) {
        // Add a light to the entrance.
        const light = new THREE.PointLight(0xffffff, 1, 50)
        light.position.y += 20
        light.position.z += 10
        if (window.SETTINGS.shadows) {
            light.castShadow = true
            //light.shadow.mapSize.width = 4 * 512
            //light.shadow.mapSize.height = 4 * 512
            light.shadow.bias = -0.005
        }
        everything.add(light)
    }

    //const controllerGrip1 = renderer.xr.getControllerGrip(0)
    //const controllerModelFactory = new XRControllerModelFactory()
    //const model1 = controllerModelFactory.createControllerModel(controllerGrip1)
    //controllerGrip1.add(model1)
    //scene.add(controllerGrip1)
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
}

function splitIntoEqualParts(lengths) {
    let totalLength = lengths.sum()
    let searchLength = totalLength / 3

    function findBestSplit(searchPoint) {
        let lengthProgress = 0
        for (const [i, l] of lengths.entries()) {
            if (lengthProgress + l >= searchPoint) {
                let startPoint = lengthProgress
                let endPoint = lengthProgress + l

                if (
                    Math.abs(startPoint - searchPoint) <
                    Math.abs(endPoint - searchPoint)
                ) {
                    return i
                } else {
                    return i + 1
                }
            }

            lengthProgress += l
        }
    }

    let firstSplit = findBestSplit(searchLength)
    let secondSplit = findBestSplit(2 * searchLength)

    return [firstSplit, secondSplit]
}

function calculateObjectWidths(objects) {
    let widths = objects.map((obj) => obj.safetyWidth)
    return widths
}

/**
 * @param {THREE.Group} group The group to put the generated walls in.
 * @param {bool} singleRoomMode Are we placing images in a single room?
 */
function distributeObjects(objects, group, gapWidth, singleRoomMode = true) {
    let widths = calculateObjectWidths(objects)

    let groupObjects = objects.filter((o) => o instanceof THREE.Group)
    let groupWidths = calculateObjectWidths(groupObjects)

    let largestGroupObjectWidth =
        groupObjects.length === 0 ? 0 : Math.max(...groupWidths)

    let partIdx = splitIntoEqualParts(widths)

    let parts = [
        objects.slice(0, partIdx[0]),
        objects.slice(partIdx[0], partIdx[1]),
        objects.slice(partIdx[1]),
    ]

    let widthParts = [
        widths.slice(0, partIdx[0]),
        widths.slice(partIdx[0], partIdx[1]),
        widths.slice(partIdx[1]),
    ]

    let wallWidths = widthParts.map(
        (widths) => widths.sum() + (widths.length + 1) * gapWidth
    )

    let roomWidth = Math.max(...wallWidths)

    // Add floor.
    //let floor = new THREE.Mesh(
    //    new THREE.BoxGeometry(roomWidth, 0.1, roomWidth),
    //    FLOOR_TEXTURE
    //)
    //floor.position.y = -25
    //floor.position.z = -roomWidth / 2
    //group.add(floor)

    // Clone, and add as ceiling.
    //let ceiling = floor.clone()
    //ceiling.position.y = 25
    //ceiling.position.z = -roomWidth / 2
    //group.add(ceiling)

    let wallCenters = [
        new THREE.Vector3(-roomWidth / 2, 0, -roomWidth / 2),
        new THREE.Vector3(0, 0, -roomWidth),
        new THREE.Vector3(+roomWidth / 2, 0, -roomWidth / 2),
    ]

    let wallStarts = [
        new THREE.Vector3(-roomWidth / 2, 0, 0),
        new THREE.Vector3(-roomWidth / 2, 0, -roomWidth),
        new THREE.Vector3(+roomWidth / 2, 0, -roomWidth),
    ]

    let wallDirections = [
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
    ]

    let wallNormals = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
    ]

    createDoorWall(wallCenters, wallDirections, roomWidth, group)

    parts.forEach((part, i) => {
        // Wall from left edge to first object.
        let wallProgress = (roomWidth - wallWidths[i]) / 2
        if (wallProgress > 0 && !singleRoomMode) {
            const a = wallStarts[i]
            var wallLength = wallProgress
            if (part[0]) {
                wallLength += (part[0].safetyWidth - part[0].myWidth) / 2
            }
            const b = wallStarts[i]
                .clone()
                .add(wallDirections[i].clone().multiplyScalar(wallLength))
            group.add(
                createWall(
                    new THREE.Vector2(a.x, a.z),
                    new THREE.Vector2(b.x, b.z)
                )
            )
        }
        // Walls between objects.
        for (const [j, obj] of part.entries()) {
            const isImage = !(obj instanceof THREE.Group)
            if (!singleRoomMode) {
                // Add wall into front gap
                const a = wallStarts[i]
                    .clone()
                    .add(wallDirections[i].clone().multiplyScalar(wallProgress))
                const b = wallStarts[i]
                    .clone()
                    .add(
                        wallDirections[i]
                            .clone()
                            .multiplyScalar(
                                wallProgress +
                                    gapWidth +
                                    (obj.safetyWidth - obj.myWidth) / 2
                            )
                    )
                group.add(
                    createWall(
                        new THREE.Vector2(a.x, a.z),
                        new THREE.Vector2(b.x, b.z)
                    )
                )
                if (isImage) {
                    // Add wall into gap behind object.
                    const a3 = wallStarts[i]
                        .clone()
                        .add(
                            wallDirections[i]
                                .clone()
                                .multiplyScalar(
                                    wallProgress +
                                        gapWidth +
                                        (obj.safetyWidth - obj.myWidth) / 2
                                )
                        )
                    const b3 = wallStarts[i]
                        .clone()
                        .add(
                            wallDirections[i]
                                .clone()
                                .multiplyScalar(
                                    wallProgress +
                                        gapWidth +
                                        obj.safetyWidth / 2 +
                                        obj.myWidth / 2
                                )
                        )
                    group.add(
                        createWall(
                            new THREE.Vector2(a3.x, a3.z),
                            new THREE.Vector2(b3.x, b3.z)
                        )
                    )
                }
                // Add wall into gap behind object.
                const a2 = wallStarts[i]
                    .clone()
                    .add(
                        wallDirections[i]
                            .clone()
                            .multiplyScalar(
                                wallProgress +
                                    gapWidth +
                                    obj.safetyWidth / 2 +
                                    obj.myWidth / 2
                            )
                    )
                const b2 = wallStarts[i]
                    .clone()
                    .add(
                        wallDirections[i]
                            .clone()
                            .multiplyScalar(
                                wallProgress + gapWidth + obj.safetyWidth
                            )
                    )
                group.add(
                    createWall(
                        new THREE.Vector2(a2.x, a2.z),
                        new THREE.Vector2(b2.x, b2.z)
                    )
                )
            }

            // Place the actual object.
            const indentation = isImage ? 1 : 0
            obj.position.x = wallStarts[i].x + indentation * wallNormals[i].x
            obj.position.z = wallStarts[i].z + indentation * wallNormals[i].z
            obj.translateOnAxis(
                wallDirections[i],
                wallProgress + gapWidth + widthParts[i][j] / 2
            )

            wallProgress += gapWidth + widthParts[i][j]
            obj.rotateY((1 - i) * (Math.PI / 2))

            // Add the object!
            group.add(obj)
        }
        // Wall to right edge.
        if (wallProgress < roomWidth && !singleRoomMode) {
            const a = wallStarts[i]
                .clone()
                .add(wallDirections[i].clone().multiplyScalar(wallProgress))
            const b = wallStarts[i]
                .clone()
                .add(wallDirections[i].clone().multiplyScalar(roomWidth))
            group.add(
                createWall(
                    new THREE.Vector2(a.x, a.z),
                    new THREE.Vector2(b.x, b.z)
                )
            )
        }
    })

    if (window.SETTINGS.lights) {
        const light = new THREE.PointLight(
            0xffffff,
            1,
            Math.sqrt(2) * roomWidth,
            1
        )
        //light.position.x += 3
        light.position.y += 3
        light.position.z -= roomWidth / 2
        if (window.SETTINGS.shadows) {
            light.castShadow = true
            //light.shadow.mapSize.width = 4 * 512
            //light.shadow.mapSize.height = 4 * 512
            light.shadow.bias = -0.005
        }
        group.add(light)
    }

    group.myWidth = roomWidth
    group.safetyWidth = roomWidth + 2 * largestGroupObjectWidth
}

export async function updateMultiplayer(states, myId) {
    // Update the player positions.
    for (let [id, values] of states) {
        if (!players[id]) {
            const geometry = new THREE.CylinderGeometry(5, 5, 10, 32)
            const material = loadMaterial("plywood", 1, 0xee3333)
            const player = new THREE.Mesh(geometry, material)

            // Add a big marker for the minimap camera.
            const markerRadius = 20
            const circleGeometry = new THREE.CircleGeometry(markerRadius, 16)
            const circleMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                //side: THREE.DoubleSide
            })
            const circle = new THREE.Mesh(circleGeometry, circleMaterial)
            circle.rotateX(-Math.PI / 2)
            circle.name = "circle"

            const marker = new THREE.Group()
            marker.position.y = 500

            // Add a square to the circle to make it pointy!
            const squareGeometry = new THREE.PlaneGeometry(
                markerRadius,
                markerRadius
            )
            const square = new THREE.Mesh(squareGeometry, circleMaterial)
            square.rotateZ(Math.PI / 4)
            square.position.y = (Math.sqrt(2) * markerRadius) / 2
            square.name = "square"
            circle.add(square)

            marker.add(circle)
            player.add(marker)

            players[id] = player
            scene.add(player)
        }

        if (values.color) {
            players[id].material.color = new THREE.Color(values.color)
            if (players[id].getObjectByName("circle")) {
                players[id].getObjectByName("circle").material.color =
                    new THREE.Color(values.color)
                players[id].getObjectByName("square").material.color =
                    new THREE.Color(values.color)
            }
        }

        if (values.name !== undefined) {
            if (players[id].myName !== values.name) {
                if (players[id].children.length > 0) {
                    players[id].remove(players[id].getObjectByName("text"))
                }
                const textPlane = await createTextPlane(
                    {text: values.name, links: []},
                    20,
                    2
                )
                textPlane.position.y = 10
                textPlane.name = "text"
                players[id].add(textPlane)
                players[id].myName = values.name
            }
        }

        if (values.transformation) {
            players[id].position.x = values.transformation.position.x
            players[id].position.y = values.transformation.position.y - 20
            players[id].position.z = values.transformation.position.z

            let direction = new THREE.Vector3(
                values.transformation.rotation.x,
                values.transformation.rotation.y,
                values.transformation.rotation.z
            )
            direction.multiplyScalar(500)
            direction.add(values.transformation.position)
            if (players[id].children.length > 0) {
                let sign = players[id].getObjectByName("text")
                sign.lookAt(direction)

                let marker = players[id].getObjectByName("circle")
                // This is horrible. I'm sorry.
                direction.y = marker.parent.position.y
                marker.lookAt(direction)
                marker.rotateX(-Math.PI / 2)
                marker.rotateZ(Math.PI)
            }
        }

        // Skip myself.
        if (id === myId) {
            ////continue
            if (players[id].parent === scene) {
                scene.add(players[id])
            }
        }
    }

    // Remove players who disconnected.
    for (let id of Object.keys(players)) {
        if (!states.has(parseInt(id))) {
            scene.remove(players[id])
            delete players[id]
        }
    }
}
