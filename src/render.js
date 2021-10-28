import {updateStatus, generateExhibition} from "./main.js"
import {setPosition} from "./multiplayer.js"
import {timeStart, timeEnd} from "./utils.js"

import * as THREE from "three"
import {PointerLockControls} from "three/examples/jsm/controls/PointerLockControls"
import {Sky} from "three/examples/jsm/objects/Sky"
import {Text, preloadFont, getSelectionRects} from "troika-three-text"

Array.prototype.sum = function () {
    return this.reduce((partial_sum, a) => partial_sum + a, 0)
}

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

const DOOR_WIDTH = 20

var SETTINGS = {}

var WALL_TEXTURE

let scene
let renderer
let controls
let camera, raycaster
let clock

let selectedObject

let moveForward = false
let moveBackward = false
let moveLeft = false
let moveRight = false
let moveUp = false
let moveDown = false
let canJump = false
const velocity = new THREE.Vector3()
const direction = new THREE.Vector3()
const defaultMovementSpeed = 800
let movementSpeed = defaultMovementSpeed

let players = {}

preloadFont({font: null}, () => {})

const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
})

function clearObjects(obj) {
    players = {}

    while (obj.children.length > 0) {
        clearObjects(obj.children[0])
        obj.remove(obj.children[0])
    }
    if (obj.geometry) obj.geometry.dispose()

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

export async function render(exhibition, settings) {
    SETTINGS = settings
    clearObjects(scene)

    WALL_TEXTURE = loadMaterial("beige_wall_001", 1, 0xb3b3b3)

    const everything = await generateChapter(exhibition)

    var ta = timeStart("add to scene")
    scene.add(everything)
    timeEnd(ta)

    updateStatus("")

    //createEntrance()
    //createExit()
    var tf = timeStart("floor")
    setupFloor()
    timeEnd(tf)
}

async function generateChapter(chapter) {
    var te = timeStart("entrance")
    let group = new THREE.Group()

    updateStatus(`Generating "${chapter.name}"...`)

    // Generate entrance sign.
    let text = await createTextPlane(chapter.name, 30, 3)
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
    distributeObjects(objects, group, 10, false)
    timeEnd(td)
    return group
}

function generateImageData(chapter) {
    let things = []
    if (SETTINGS.images) {
        const images = chapter.images.filter(
            (image) => image && image.url.match(/\.(jpg|jpeg|png|svg)$/i)
        )
        things.unshift(...images.map((image) => addPicture(image)))
    }
    if (SETTINGS.texts) {
        things.unshift(
            ...chapter.paragraphs.map((paragraph) =>
                createTextPlane(paragraph, 20)
            )
        )
    }
    return things
}

async function addPicture(img) {
    var plane = await createImagePlane(img.url, 30, null, img.width, img.height)
    if (img.description) {
        var textPlane = await createTextPlane(img.description, 10, 0.5)
        textPlane.position.z = 1
        textPlane.position.y = -5
        plane.add(textPlane)
    }
    return plane
}

export function animate() {
    const delta = clock.getDelta()

    if (delta > 0.1) {
        // Moving with a delta this big wouldn't look good. Do nothing.
        requestAnimationFrame(animate)
        return
    }

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

    setPosition(
        controls.getObject().position.x,
        controls.getObject().position.y,
        controls.getObject().position.z
    )

    requestAnimationFrame(animate)

    renderer.render(scene, camera)
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

    raycaster = new THREE.Raycaster()
    raycaster.layers.set(1)

    renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT)
    //renderer.outputEncoding = THREE.sRGBEncoding;
    //renderer.toneMapping = THREE.ACESFilmicToneMapping;
    //renderer.toneMappingExposure = 1
    document.body.appendChild(renderer.domElement)

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
        if (document.getElementById("topic") === document.activeElement) {
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
        if (document.getElementById("topic") === document.activeElement) {
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

    setupFloor()

    onWindowResize()
    window.addEventListener("resize", onWindowResize)
}

function loadMaterial(path, scaling, fallbackColor) {
    if (SETTINGS.textures) {
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
        })
    }
}

function setupFloor() {
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
    if (!SETTINGS.lights) {
        ambient.intensity = 1
    }
    scene.add(ambient)

    const geometry = new THREE.CylinderGeometry(4000, 4000, 10, 128)
    const material = loadMaterial("plywood", 256, 0x665d48)
    const ground = new THREE.Mesh(geometry, material)
    if (SETTINGS.shadows) {
        ground.receiveShadow = true
    }
    scene.add(ground)
    ground.position.y = -30

    const w = scene.myWidth
    var defaultCameraPosition = new THREE.Vector3(
        DOOR_WIDTH * 3,
        0,
        DOOR_WIDTH * 3
    )
    camera.position.x = defaultCameraPosition.x
    camera.position.y = defaultCameraPosition.y
    camera.position.z = defaultCameraPosition.z
    camera.lookAt(0, 0, 0)

    const crosshairMaterial = new THREE.MeshBasicMaterial({color: 0xffffff})
    var crosshair = new THREE.Mesh(
        new THREE.SphereGeometry(0.005),
        crosshairMaterial
    )
    crosshair.position.z = -0.5

    camera.add(crosshair)
    scene.add(camera)

    if (SETTINGS.lights) {
        // Add a light to the entrance.
        const light = new THREE.PointLight(0xffffff, 1, 50)
        light.position.y += 20
        light.position.z += 10
        if (SETTINGS.shadows) {
            light.castShadow = true
            //light.shadow.mapSize.width = 4 * 512
            //light.shadow.mapSize.height = 4 * 512
            light.shadow.bias = -0.005
        }
        scene.add(light)
    } else {
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
}

function createImagePlane(
    url,
    height = 30,
    width = null,
    knownWidth = null,
    knownHeight = null
) {
    var texture = new THREE.TextureLoader().load(url)

    let ratio = knownWidth / knownHeight
    if (height !== null && width === null) {
        width = height * ratio
    } else if (height === null && width !== null) {
        height = width / ratio
    } else if (height === null && width === null) {
        height = 30
        width = 30
        console.log("Tried to create an image plane without any size.")
    }
    var planeGeometry = new THREE.BoxGeometry(width, height, 0.1)
    var planeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
    })

    var plane = new THREE.Mesh(planeGeometry, planeMaterial)
    // Store the width in the Mesh object. This is a bit of a hack.
    plane.myWidth = width
    plane.safetyWidth = width
    if (SETTINGS.shadows) {
        plane.receiveShadow = true
    }
    return plane
}

async function createTextPlane(text, width, scale = 1) {
    var margin = scale

    var height = width / 10

    var planeGeometry = new THREE.BoxGeometry(width, height, 0.1)

    var plane = new THREE.Mesh(planeGeometry, whiteMaterial)

    plane.myWidth = width
    plane.safetyWidth = width
    plane.layers.enable(1)

    var link = text.match(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/)
    if (link) {
        plane.myLink = link[2]
    }

    var textObject = new Text()
    plane.add(textObject)
    textObject.text = text
    textObject.fontSize = 1 * scale
    textObject.anchorX = "center"
    textObject.anchorY = "middle"
    textObject.color = 0x000000

    textObject.maxWidth = width - 2 * margin

    textObject.position.z = 0.1
    textObject.sync(() => {
        var bbox = new THREE.Box3().setFromObject(textObject)

        var boxWidth = Math.max(
            bbox.max.x - bbox.min.x,
            bbox.max.z - bbox.min.z
        )
        var boxHeight = bbox.max.y - bbox.min.y

        if (boxWidth > 0) {
            plane.scale.y = (boxHeight + 2 * margin) / height
            textObject.scale.y = height / (boxHeight + 2 * margin)

            plane.scale.x = (boxWidth + 2 * margin) / width
            textObject.scale.x = width / (boxWidth + 2 * margin)
        }
    })

    return plane
}

async function getTextImage(text) {
    let div = document.createElement("div")
    div.innerHTML = text
    div.style.maxWidth = "300px"
    div.style.display = "inline-block"
    div.style.padding = "3px"
    div.style.position = "absolute"
    div.style.textAlign = "left"
    div.style.top = "9000px"
    div.style.left = "0px"
    document.body.appendChild(div)

    var canvas = await html2canvas(div, {logging: false})

    var dataURL = canvas.toDataURL()
    div.remove()

    return dataURL
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

    if (SETTINGS.lights) {
        const light = new THREE.PointLight(
            0xffffff,
            1,
            Math.sqrt(2) * roomWidth,
            1
        )
        //light.position.x += 3
        light.position.y += 3
        light.position.z -= roomWidth / 2
        if (SETTINGS.shadows) {
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

function createDoorWall(wallCenters, wallDirections, roomWidth, group) {
    // Add a front wall with a door.
    const a = wallCenters[0].clone()
    a.sub(wallDirections[0].clone().multiplyScalar(roomWidth / 2))
    const b = wallCenters[2].clone()
    b.add(wallDirections[2].clone().multiplyScalar(roomWidth / 2))

    const sideWallLength = (roomWidth - DOOR_WIDTH) / 2

    const a1 = a.clone()
    const b1 = a.clone()
    b1.add(wallDirections[1].clone().multiplyScalar(sideWallLength))
    group.add(
        createWall(new THREE.Vector2(a1.x, a1.z), new THREE.Vector2(b1.x, b1.z))
    )

    const a2 = b.clone()
    const b2 = b.clone()
    b2.add(wallDirections[1].clone().multiplyScalar(-sideWallLength))
    group.add(
        createWall(new THREE.Vector2(a2.x, a2.z), new THREE.Vector2(b2.x, b2.z))
    )
}

function createEntrance() {
    const w = scene.myWidth
    scene.add(createWall(new THREE.Vector2(0, 0), new THREE.Vector2(0, w / 2)))
    scene.add(
        createWall(
            new THREE.Vector2(-w / 2, w / 2),
            new THREE.Vector2(0, w / 2)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(0, 0),
            new THREE.Vector2(-w / 4 + DOOR_WIDTH / 2, 0)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(-w / 4 - DOOR_WIDTH / 2, 0),
            new THREE.Vector2(-w / 2, 0)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(-w / 2, 0),
            new THREE.Vector2(-w / 2, w / 4 - DOOR_WIDTH / 2)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(-w / 2, w / 4 + DOOR_WIDTH / 2),
            new THREE.Vector2(-w / 2, w / 2)
        )
    )
}

function createExit() {
    const w = scene.myWidth
    //scene.add(createWall(new THREE.Vector2(0, 0), new THREE.Vector2(0, w / 2)))
    scene.add(
        createWall(new THREE.Vector2(w / 2, w / 2), new THREE.Vector2(0, w / 2))
    )
    scene.add(
        createWall(
            new THREE.Vector2(0, 0),
            new THREE.Vector2(w / 4 + DOOR_WIDTH / 2, 0)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(w / 4 - DOOR_WIDTH / 2, 0),
            new THREE.Vector2(w / 2, 0)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(w / 2, 0),
            new THREE.Vector2(w / 2, w / 4 - DOOR_WIDTH / 2)
        )
    )
    scene.add(
        createWall(
            new THREE.Vector2(w / 2, w / 4 + DOOR_WIDTH / 2),
            new THREE.Vector2(w / 2, w / 2)
        )
    )
}

function createWall(a, b) {
    const l = a.distanceTo(b)
    var planeGeometry = new THREE.BoxGeometry(l, 50, 1)
    var planeMaterial = WALL_TEXTURE
    var plane = new THREE.Mesh(planeGeometry, planeMaterial)
    if (SETTINGS.shadows) {
        plane.castShadow = true
        plane.receiveShadow = true
    }
    var center = a.add(b).divideScalar(2)
    plane.position.x = center.x
    plane.position.z = center.y
    let rotationAngle = Math.atan2(a.y - b.y, a.x - b.x)
    plane.rotateY(rotationAngle)
    return plane
}

export function updateMultiplayer(states) {
    for (let [id, values] of states) {
        if (!players[id]) {
            const geometry = new THREE.CylinderGeometry(10, 10, 35, 32)
            const material = loadMaterial("plywood", 1, 0xee3333)
            const player = new THREE.Mesh(geometry, material)
            players[id] = player
            scene.add(player)
        }

        players[id].position.x = values.position.x
        players[id].position.y = values.position.y
        players[id].position.z = values.position.z
    }
}
