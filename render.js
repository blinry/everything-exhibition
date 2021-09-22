import html2canvas from "html2canvas"

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

const CHAPTER_RADIUS = 160
const IMAGE_RADIUS = 40

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
            text.scale.x = 3
            text.scale.y = 3
            text.scale.z = 3
            imageGroup.add(text)
        })

        generateImageData(chapter).then((promiseArr) => {
            let numberOfImages = promiseArr.length
            promiseArr.forEach((picturePromise, j) => {
                picturePromise.then((picture) => {
                    let imageAngle =
                        numberOfImages > 1
                            ? (-j * Math.PI) / (numberOfImages - 1)
                            : -Math.PI / 2
                    let imagePosition = new THREE.Vector3(
                        -IMAGE_RADIUS,
                        0,
                        0
                    ).applyAxisAngle(new THREE.Vector3(0, 1, 0), imageAngle)

                    picture.position.x = imagePosition.x
                    picture.position.z = imagePosition.z
                    picture.lookAt(new THREE.Vector3(0, 0, 0))
                    picture.position.y = 10
                    imageGroup.add(picture)
                })
            })
        })
    }
}

async function generateImageData(chapter) {
    let things = chapter.images.map((image) => addPicture(image))
    things.unshift(createTextPlane(chapter.paragraph[0], 20))
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

    controls = new THREE.PointerLockControls(camera, document.body)

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
            var planeGeometry = new THREE.PlaneGeometry(height * ratio, height)
            var planeMaterial = new THREE.MeshLambertMaterial({
                map: texture,
                side: THREE.DoubleSide,
            })

            var plane = new THREE.Mesh(planeGeometry, planeMaterial)
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
