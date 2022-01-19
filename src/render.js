import * as THREE from "three"

import {updateStatus, generateExhibition} from "./main.js"
import {setPosition, addSketch, clearSketch} from "./multiplayer.js"
import {timeStart, timeEnd, lerp} from "./utils.js"
import {
    createPicture,
    createAudio,
    createTextPlane,
    createDoorWall,
    createWall,
    createFloor,
    createGround,
    WALL_THICKNESS,
    DOOR_WIDTH,
} from "./objects.js"

import {PointerLockControls} from "three/examples/jsm/controls/PointerLockControls"
//import {VRButton} from "three/examples/jsm/webxr/VRButton.js"
//import {XRControllerModelFactory} from "three/examples/jsm/webxr/XRControllerModelFactory.js"
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

let everything

let scene
let renderer
let controls
let camera, raycaster, mapCamera
let clock
let listener

let mouseDown = false
let selectedObject, cursorLocation, prevCursorLocation
let myColor

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
let sketch = new THREE.Group()

let fps = 0

preloadFont({font: null}, () => {})

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
    clearObjects(sketch)

    everything = await generateChapter(exhibition, 0, false)

    if (exhibition.previous) {
        addBackSign(everything, exhibition.previous)
    }

    var ta = timeStart("add to scene")
    scene.add(everything)
    timeEnd(ta)

    updateStatus("")

    var tf = timeStart("floor")
    setupScene(everything)
    timeEnd(tf)
}

async function generateChapter(chapter, level, stack = false) {
    updateStatus(`Generating "${chapter.name}"...`)

    // Generate subrooms.
    let roomPromises = []
    if (chapter.sections) {
        roomPromises = chapter.sections.map((c) =>
            generateChapter(c, level + 1)
        )
    }

    var to = timeStart("imagedata")
    let picturePromises = generateImageData(chapter)
    timeEnd(to)

    var tp = timeStart("objectpromises")
    var objectPromises = []
    objectPromises.push(...picturePromises)
    objectPromises.push(...roomPromises)
    var objects = await Promise.all(objectPromises)
    timeEnd(tp)

    // Distribute the objects into a new room.
    var td = timeStart("distribute")
    let group = distributeObjects(objects, level)
    timeEnd(td)

    // Generate entrance sign.
    let text = createTextPlane({text: chapter.name, links: []}, 50, 3)
    text.position.x = 0
    text.position.y = 20
    text.position.z = 1
    group.add(text)

    return group
}

function generateImageData(chapter) {
    let things = []
    if (window.SETTINGS.images && chapter.images) {
        const images = chapter.images.filter(
            (image) => image && image.url.match(/\.(jpg|jpeg|png|svg)$/i)
        )
        things.unshift(...images.map((image) => createPicture(image)))

        const audio = chapter.images.filter(
            (audio) => audio && audio.url.match(/\.(ogg|mp3|wav)$/i)
        )
        things.unshift(...audio.map((audio) => createAudio(audio, listener)))
    }
    if (window.SETTINGS.texts && chapter.paragraphs) {
        let maxTextLength = 600
        function tooLong(text) {
            return text.length > maxTextLength || text.split("\n").length > 30
        }
        for (let paragraph of chapter.paragraphs) {
            // Make sure the paragraphs don't get too long.
            if (tooLong(paragraph.text)) {
                let lines = paragraph.text.split("\n")

                let currentP = {text: "", links: paragraph.links}
                for (let line of lines) {
                    if (tooLong(currentP.text + line)) {
                        if (currentP.text.length > 0) {
                            things.push(createTextPlane(currentP, 20))
                        }
                        currentP = {text: line, links: paragraph.links}
                    } else {
                        currentP.text += "\n" + line
                    }
                }
                if (currentP.text.length > 0) {
                    things.push(createTextPlane(currentP, 20))
                }
            } else {
                things.push(createTextPlane(paragraph, 20))
            }
        }
    }
    return things
}

export function animate() {
    const delta = clock.getDelta()
    if (delta > 0) {
        fps = lerp(fps, Math.round(1 / delta), 0.01)
        document.querySelector("#fps").innerHTML = Math.round(fps)
    }

    if (delta > 0.1) {
        // Moving with a delta this big would jump too wide. Do nothing.
        return
    }

    //xrInput()
    if (mouseDown) {
        if (prevCursorLocation && cursorLocation) {
            addSketch([
                {
                    from: {
                        x: prevCursorLocation.x,
                        y: prevCursorLocation.y,
                        z: prevCursorLocation.z,
                    },
                    to: {
                        x: cursorLocation.x,
                        y: cursorLocation.y,
                        z: cursorLocation.z,
                    },
                    color: myColor || "000000",
                },
            ])
        }
        if (cursorLocation) {
            prevCursorLocation = cursorLocation.clone()
        }
    }

    velocity.x -= velocity.x * 10.0 * delta
    velocity.z -= velocity.z * 10.0 * delta
    velocity.y -= velocity.y * 10.0 * delta

    //velocity.y -= 9.8 * 100.0 * delta

    direction.z = Number(moveForward) - Number(moveBackward)
    direction.x = Number(moveRight) - Number(moveLeft)
    direction.y = Number(moveUp) - Number(moveDown)
    direction.normalize()

    // Wall collision detection
    if (direction.length() > 0) {
        let rayOrigin = camera.position.clone()
        let realDirection = direction.clone()
        realDirection.z *= -1
        let rayDirection = realDirection.clone()
        rayDirection.transformDirection(camera.matrixWorld)
        rayDirection.y = 0
        rayDirection.normalize()

        raycaster.set(rayOrigin, rayDirection)
        let intersections = raycaster.intersectObjects(scene.children, true)
        if (intersections.length > 0) {
            let closest = intersections[0]
            if (closest.distance < 12) {
                direction.set(0, 0, 0)
            }
        }
    }

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
        cursorLocation = intersects[0].point
    } else {
        //if (selectedObject)
        //    selectedObject.material.emissive.setHex(selectedObject.currentHex)

        selectedObject = null
        cursorLocation = null
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

    for (let [idx, player] of Object.entries(players)) {
        player.getObjectByName("name")?.lookAt(camera.position)
    }
}

function addBackSign(everything, topic) {
    let text = createTextPlane(
        {
            text: `Back to: ${topic}`,
            links: [{text: topic, page: topic}],
        },
        20
    )
    text.position.x = -30
    text.position.z = -WALL_THICKNESS / 2 - 0.01
    text.rotateY(Math.PI)
    everything.add(text)
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

    scene.add(sketch)

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
        if (controls.isLocked) {
            mouseDown = true
            if (selectedObject?.myLink) {
                console.log("clicked ", selectedObject.myLink)
                generateExhibition(selectedObject.myLink)
            }
        }
    })

    document.addEventListener("mouseup", () => {
        mouseDown = false
        prevCursorLocation = null
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
                //if (canJump === true) velocity.y += 350
                //canJump = false
                addSketch([
                    {
                        x: camera.position.x,
                        y: camera.position.y,
                        z: camera.position.z,
                    },
                ])

                break

            case "KeyC":
                clearSketch()
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
    let materialData = {
        map: new THREE.TextureLoader().load(`textures/${path}_diff.png`),
        normal: new THREE.TextureLoader().load(`textures/${path}_nor_gl.png`),
        /*rough: new THREE.TextureLoader().load(`textures/${path}_rough.png`),
        arm: new THREE.TextureLoader().load(`textures/${path}_arm.png`),
        ao: new THREE.TextureLoader().load(`textures/${path}_ao.png`),*/
    }

    for (const [_, value] of Object.entries(materialData)) {
        value.wrapS = THREE.RepeatWrapping
        value.wrapT = THREE.RepeatWrapping
        value.repeat.set(scaling, scaling)
    }

    return new THREE.MeshStandardMaterial({
        map: materialData.map,
        normalMap: materialData.normal,
        /**roughnessMap: materialData.rough,
        aoMap: materialData.ao,
        side: THREE.DoubleSide,*/
    })
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

    scene.add(createGround())
    //if (window.SETTINGS.shadows) {
    //    ground.receiveShadow = true
    //}
    //scene.add(ground)
    //ground.position.y = -30
    //ground.layers.enable(1)

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
    // Set players on a random position in a half circle around the entrance.
    let angle = Math.PI / 4 //Math.PI/2 + Math.random() * Math.PI/2
    let distance = 60
    var initialCameraPosition = new THREE.Vector3(
        Math.cos(angle) * distance,
        0,
        Math.sin(angle) * distance
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

// The key defines the ratios of the resulting split.
function splitIntoKey(objects, key, criterion) {
    if (key.length == 1) {
        return [objects]
    }

    let totalLength = objects.map(criterion).sum()
    let totalKey = key.sum()
    let searchLength = (key[0] / totalKey) * totalLength
    let splitIndex = findBestSplitWithCriterion(
        objects,
        searchLength,
        criterion
    )

    let firstPart = objects.slice(0, splitIndex)
    let secondPart = objects.slice(splitIndex)

    let v = [firstPart]
    v.push(...splitIntoKey(secondPart, key.slice(1), criterion))
    return v
}

function findBestSplitWithCriterion(objects, searchPoint, criterion) {
    let lengthProgress = 0
    for (const [i, o] of objects.entries()) {
        let l = criterion(o)
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

function calculateObjectWidth(obj) {
    if (obj.widthL) {
        return obj.widthL + obj.widthR
    }
    let aabb = new THREE.Box3().setFromObject(obj)
    return aabb.max.x - aabb.min.x
}

function calculateObjectHeight(obj) {
    let aabb = new THREE.Box3().setFromObject(obj)
    return aabb.max.z - aabb.min.z
}

function isFullRoom(obj) {
    return calculateObjectHeight(obj) > WALL_THICKNESS + 2
}

/*function calculateObjectWidthLR(obj) {
    let aabb = new THREE.Box3().setFromObject(obj)
    return [-aabb.min.x, aabb.max.x]
}*/

function distributeObjects(objects, level) {
    let group = new THREE.Group()
    group.isChapter = true

    let parts

    if (
        objects.length > 2 ||
        (objects.length == 2 &&
            (isFullRoom(objects[0]) || isFullRoom(objects[1])))
    ) {
        parts = splitIntoKey(objects, [2, 1, 2], calculateObjectWidth)
    } else {
        parts = [[], objects, []]
    }

    for (let [idx, side] of parts.entries()) {
        for (let i = 0; i < side.length; i++) {
            let aabb = new THREE.Box3().setFromObject(side[i])
            if (!side[i].widthL) {
                side[i].widthL = -aabb.min.x
            }
            side[i].widthR = aabb.max.x
            side[i].originalR = aabb.max.x
            side[i].originalL = -aabb.min.x
            if (side[i + 1]) {
                if (isFullRoom(side[i]) && !isFullRoom(side[i + 1])) {
                    side[i].widthR = DOOR_WIDTH
                }
                if (!isFullRoom(side[i]) && isFullRoom(side[i + 1])) {
                    side[i + 1].widthL = DOOR_WIDTH
                }
            }
        }

        //fix rooms that overlap because we shrink collapsed rooms too much
        let lastFullRoom
        let flatWidth = 0
        for (let i = 0; i < side.length; i++) {
            if (isFullRoom(side[i])) {
                if (lastFullRoom != undefined) {
                    // we found a spot to possible fix
                    if (
                        side[lastFullRoom].widthR + flatWidth + side[i].widthL <
                        side[lastFullRoom].originalR + side[i].originalL
                    ) {
                        let newWidth =
                            (side[lastFullRoom].originalR +
                                side[i].originalL -
                                flatWidth) /
                            2
                        side[lastFullRoom].widthR = newWidth
                        side[i].widthL = newWidth
                    }
                } else {
                    // This is the first room. Don't allow it to grow beneath
                    // the left side of the wall.
                    if (flatWidth + side[i].widthL < side[i].originalL) {
                        side[i].widthL = side[i].originalL - flatWidth
                        //side[0].widthL = (side[i].originalL - flatWidth)/2
                    }
                    // ... except when it's on the right wall.
                    if (idx == 2 || (idx == 0 && level == 0)) {
                        side[i].widthL = DOOR_WIDTH
                    }
                }
                lastFullRoom = i
                flatWidth = 0
            } else {
                flatWidth += calculateObjectWidth(side[i])
            }
        }
        if (
            (idx == 0 || (idx == 2 && level == 0)) &&
            lastFullRoom != undefined
        ) {
            side[lastFullRoom].widthR = DOOR_WIDTH
        }
    }

    let depth = Math.max(
        parts[0].map(calculateObjectWidth).sum(),
        parts[2].map(calculateObjectWidth).sum()
    )
    let width = Math.max(
        parts[1].map(calculateObjectWidth).sum(),
        50 + 4 * 3 * 2
    )

    let sides = [
        {
            start: new THREE.Vector3(-width / 2, 0, 0),
            dir: new THREE.Vector3(0, 0, -1),
            length: depth,
            objects: parts[0],
            angle: Math.PI / 2,
        },
        {
            start: new THREE.Vector3(-width / 2, 0, -depth),
            dir: new THREE.Vector3(1, 0, 0),
            length: width,
            objects: parts[1],
            angle: 0,
        },
        {
            start: new THREE.Vector3(width / 2, 0, -depth),
            dir: new THREE.Vector3(0, 0, 1),
            length: depth,
            objects: parts[2],
            angle: -Math.PI / 2,
        },
    ]

    for (let side of sides) {
        let widthOfAllObjects = side.objects.map(calculateObjectWidth).sum()
        let runningWidth = (side.length - widthOfAllObjects) / 2
        let lastWallEnd = side.start.clone()
        for (let o of side.objects) {
            let width = calculateObjectWidth(o)
            //let widthLR = calculateObjectWidthLR(o)

            o.position.copy(
                side.start
                    .clone()
                    .addScaledVector(side.dir, runningWidth + o.widthL)
            )

            if (!o.isChapter) {
                // This is an image thing, offset it a bit.
                let normal = side.dir
                    .clone()
                    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
                o.position.add(normal.multiplyScalar(1.1))
            }

            o.rotateY(side.angle)

            runningWidth += width

            let thisWallEnd = side.start
                .clone()
                .addScaledVector(side.dir, runningWidth)
            if (o.isChapter) {
                // Build walls at both sides of the chapter.
                let diffL = side.dir.clone().multiplyScalar(o.widthL)
                let diffR = side.dir.clone().multiplyScalar(o.widthR)
                group.add(
                    createWall(lastWallEnd, o.position.clone().sub(diffL))
                )
                group.add(
                    createWall(o.position.clone().add(diffR), thisWallEnd)
                )
            } else {
                group.add(createWall(lastWallEnd, thisWallEnd))
            }

            lastWallEnd = thisWallEnd
            group.add(o)
        }
        if (runningWidth < side.length) {
            const wallEnd = side.start
                .clone()
                .addScaledVector(side.dir, side.length)
            group.add(createWall(lastWallEnd, wallEnd))
        }
    }

    // Add front wall.
    if (level == 0) {
        var widthL = width / 2
        var widthR = width / 2
    } else {
        let aabb = new THREE.Box3().setFromObject(group)
        var widthL = -aabb.min.x
        var widthR = aabb.max.x
    }
    group.add(
        createWall(
            new THREE.Vector3(-widthL, 0, 0),
            new THREE.Vector3(-DOOR_WIDTH / 2, 0, 0)
        )
    )
    group.add(
        createWall(
            new THREE.Vector3(DOOR_WIDTH / 2, 0, 0),
            new THREE.Vector3(widthR, 0, 0)
        )
    )

    return group
}

export async function updateMultiplayer(states, myId) {
    // Update the player positions.
    for (let [id, values] of states) {
        if (!players[id]) {
            const geometry = new THREE.CylinderGeometry(5, 5, 10, 32)
            const material = new THREE.MeshStandardMaterial({
                color: 0xee3333,
            })

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

        if (id !== myId) {
            if (players[id].myFace !== values.face) {
                if (players[id].children.length > 0) {
                    players[id].remove(players[id].getObjectByName("face"))
                }
                const textPlane = await createTextPlane(
                    {text: values.face, links: []},
                    20,
                    2
                )
                textPlane.position.y = 10
                textPlane.name = "face"
                players[id].add(textPlane)
                players[id].myFace = values.face

                if (players[id].myColor) {
                    textPlane.material.color = new THREE.Color(
                        players[id].myColor
                    )

                    let col = new THREE.Color()
                    textPlane.material.color.getHSL(col)
                    if (col.l < 0.5) {
                        textPlane.children[0].color = 0xffffff
                    } else {
                        textPlane.children[0].color = 0x000000
                    }
                }
            }

            if (players[id].myName !== values.name) {
                const match = values.name.match(
                    /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/g
                )

                if (players[id].getObjectByName("name")) {
                    players[id].remove(players[id].getObjectByName("name"))
                }
                const textObject = new Text()
                textObject.text = values.name
                textObject.fontSize = 2
                textObject.font = "/fonts/Roboto-Regular.ttf"
                if (match) {
                    textObject.font = "/fonts/NotoSansKR-Regular.otf"
                }
                textObject.anchorX = "center"
                textObject.anchorY = "middle"
                textObject.color = 0x000000
                textObject.position.y = 15
                textObject.name = "name"
                players[id].add(textObject)
                players[id].myName = values.name
            }
        }

        if (players[id].myColor != values.color) {
            players[id].material.color = new THREE.Color(values.color)
            if (players[id].getObjectByName("circle")) {
                players[id].getObjectByName("circle").material.color =
                    new THREE.Color(values.color)
                players[id].getObjectByName("square").material.color =
                    new THREE.Color(values.color)
            }
            let face = players[id].getObjectByName("face")
            if (face) {
                face.material.color = new THREE.Color(values.color)
                let col = new THREE.Color()
                face.material.color.getHSL(col)
                if (col.l < 0.5) {
                    face.children[0].color = 0xffffff
                } else {
                    face.children[0].color = 0x000000
                }
            }
            players[id].myColor = values.color
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
                players[id].getObjectByName("face")?.lookAt(direction)

                let marker = players[id].getObjectByName("circle")
                // This is horrible. I'm sorry.
                direction.y = marker.parent.position.y
                marker.lookAt(direction)
                marker.rotateX(-Math.PI / 2)
                marker.rotateZ(Math.PI)
            }
        }

        if (id === myId) {
            myColor = values.color
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

export function updateSketch(event, transaction) {
    clearObjects(sketch)

    event.target.forEach((line) => {
        let from = new THREE.Vector3(line.from.x, line.from.y, line.from.z)
        let to = new THREE.Vector3(line.to.x, line.to.y, line.to.z)
        let length = from.distanceTo(to)

        let geometry = new THREE.CylinderGeometry(0.1, 0.1, length, 6)

        const material = new THREE.MeshBasicMaterial({
            color: line.color,
        })

        let mesh = new THREE.Mesh(geometry, material)

        mesh.position.set(from.x, from.y, from.z)
        mesh.lookAt(to)
        mesh.rotateX(Math.PI / 2)
        mesh.translateY(length / 2)

        sketch.add(mesh)
    })
}
