Array.prototype.sum = function () {
    return this.reduce((partial_sum, a) => partial_sum + a, 0)
}

import * as THREE from "three"
import {PointerLockControls} from "three/examples/jsm/controls/PointerLockControls"
import html2canvas from "html2canvas"

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

const CHAPTER_RADIUS = 400
const IMAGE_RADIUS = 80

const IMAGE_DISTANCE = 10

let scene
let renderer
let controls
let camera
let clock

let moveForward = false
let moveBackward = false
let moveLeft = false
let moveRight = false
let canJump = false
const velocity = new THREE.Vector3()
const direction = new THREE.Vector3()
const defaultMovementSpeed = 400
let movementSpeed = defaultMovementSpeed

function clearObjects(obj) {
    while (obj.children.length > 0) {
        clearObjects(obj.children[0])
        obj.remove(obj.children[0])
    }
    if (obj.geometry) obj.geometry.dispose()

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

export function render(exhibition) {
    clearObjects(scene)
    setupFloor()

    for (let [i, chapter] of exhibition.entries()) {
        let numberOfChapters = exhibition.length
        let chapterMidpoint = new THREE.Vector3(
            0,
            0,
            -CHAPTER_RADIUS
        ).applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            -(i * Math.PI * 2) / numberOfChapters
        )

        let imageGroup = new THREE.Group()
        scene.add(imageGroup)
        imageGroup.position.x = chapterMidpoint.x
        imageGroup.position.y = chapterMidpoint.y
        imageGroup.position.z = chapterMidpoint.z
        imageGroup.lookAt(new THREE.Vector3(0, 0, 0))

        createTextPlane(chapter.name).then((text) => {
            text.position.x = 0
            text.position.y = 40
            text.position.z = 0
            text.scale.x = 10
            text.scale.y = 10
            text.scale.z = 10
            imageGroup.add(text)
        })

        generateImageData(chapter).then((promiseArr) => {
            let numberOfImages = promiseArr.length
            Promise.all(promiseArr).then((pictures) => {
                imageGroup.add(...pictures)
                distributeObjects(pictures)
            })
        })
    }
}

async function generateImageData(chapter) {
    let things = chapter.images.map((image) => addPicture(image))
    things.unshift(
        ...chapter.paragraphs.map((paragraph) => createTextPlane(paragraph, 20))
    )
    return things
}

function addPicture(img) {
    return new Promise((resolve) => {
        createImagePlane(img.url).then((plane) => {
            createTextPlane(img.description).then((textPlane) => {
                textPlane.position.z = 1
                textPlane.position.y = -10
                plane.add(textPlane)
                resolve(plane)
            })
        })
    })
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

    velocity.y -= 9.8 * 100.0 * delta

    direction.z = Number(moveForward) - Number(moveBackward)
    direction.x = Number(moveRight) - Number(moveLeft)
    direction.normalize()

    if (moveForward || moveBackward)
        velocity.z -= direction.z * movementSpeed * delta
    if (moveLeft || moveRight) velocity.x -= direction.x * movementSpeed * delta

    controls.moveRight(-velocity.x * delta)
    controls.moveForward(-velocity.z * delta)

    controls.getObject().position.y += velocity.y * delta

    if (controls.getObject().position.y < 10) {
        velocity.y = 0
        controls.getObject().position.y = 10

        canJump = true
    }

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
        1000
    )

    renderer = new THREE.WebGLRenderer({antialias: true})
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT)
    document.body.appendChild(renderer.domElement)

    controls = new PointerLockControls(camera, document.body)

    renderer.domElement.addEventListener("click", function () {
        controls.lock()
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

            case "ShiftLeft":
            case "ShiftRight":
                movementSpeed = defaultMovementSpeed
                break
        }
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)

    onWindowResize()
    window.addEventListener("resize", onWindowResize)
}

function setupFloor() {
    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.x = 4
    light.castShadow = true
    scene.add(light)

    const ambient = new THREE.AmbientLight(0xffffff) // soft white light
    scene.add(ambient)

    const geometry = new THREE.CylinderGeometry(
        CHAPTER_RADIUS + IMAGE_RADIUS,
        CHAPTER_RADIUS + IMAGE_RADIUS,
        10,
        128
    )
    const material = new THREE.MeshStandardMaterial({color: 0x188c1c})
    const ground = new THREE.Mesh(geometry, material)
    scene.add(ground)
    ground.position.y = -20
}

function createImagePlane(url, height = 30) {
    return new Promise((resolve) => {
        var texture = new THREE.TextureLoader().load(url, (texture) => {
            let ratio = texture.image.width / texture.image.height
            const width = height * ratio
            var planeGeometry = new THREE.PlaneGeometry(width, height)
            var planeMaterial = new THREE.MeshLambertMaterial({
                map: texture,
                side: THREE.DoubleSide,
            })

            var plane = new THREE.Mesh(planeGeometry, planeMaterial)
            // Store the width in the Mesh object. This is a bit of a hack.
            plane.myWidth = width
            resolve(plane)
        })
    })
}

function createTextPlane(text, height = 2) {
    return new Promise((resolve) => {
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
        html2canvas(div, {logging: false}).then(function (canvas) {
            createImagePlane(canvas.toDataURL(), height).then((plane) => {
                div.remove()
                resolve(plane)
            })
        })
    })
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
    let widths = objects.map((obj) => obj.myWidth)
    return widths
}

function distributeObjects(objects) {
    let widths = calculateObjectWidths(objects)
    console.log(widths)
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
        (widths) => widths.sum() + (widths.length + 1) * IMAGE_DISTANCE
    )

    let roomWidth = Math.max(...wallWidths)

    let wallCenters = [
        new THREE.Vector3(-roomWidth / 2, 0, roomWidth / 2),
        new THREE.Vector3(0, 0, -roomWidth),
        new THREE.Vector3(+roomWidth / 2, 0, roomWidth / 2),
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

    parts.forEach((part, i) => {
        let wallProgress = (roomWidth - wallWidths[i]) / 2
        for (const [j, obj] of part.entries()) {
            obj.position.x = wallStarts[i].x
            obj.position.z = wallStarts[i].z
            obj.translateOnAxis(
                wallDirections[i],
                wallProgress + IMAGE_DISTANCE + widthParts[i][j] / 2
            )

            wallProgress += IMAGE_DISTANCE + widthParts[i][j]
            obj.rotateY((1 - i) * (Math.PI / 2))
        }
    })
}
