const wtf = require("wtf_wikipedia")
import html2canvas from "html2canvas"

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720

const CHAPTER_RADIUS = 160
const IMAGE_RADIUS = 40

const API_URL = `https://en.wikipedia.org/w/api.php`
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

function parseArticle(wikiText) {
    const article = wtf(wikiText).json()
    console.log(article)

    let exhibition = []

    let currentSectionName
    let currentSectionImages = []
    let currentParagraph = []

    for (const section of article.sections) {
        if (section.depth === 0) {
            if (currentSectionName) {
                exhibition.push({
                    name: currentSectionName,
                    images: currentSectionImages,
                    paragraph: currentParagraph,
                })
            }
            currentSectionName = section.title
            currentSectionImages = []
            currentParagraph = []
        }

        if (section?.paragraphs?.[0]?.sentences?.[0]?.text) {
            currentParagraph.push(section.paragraphs[0].sentences[0].text)
        }

        if (!section.images) {
            continue
        }

        for (const image of section.images) {
            currentSectionImages.push({
                fileName: image.file,
                description: image.caption,
                fileURL: image.url,
            })
        }
    }
    exhibition.push({
        name: currentSectionName,
        images: currentSectionImages,
        paragraph: currentParagraph,
    })
    return exhibition
}

function render(exhibition) {
    let output = document.getElementById("output")

    for (let chapter of exhibition) {
        let header = document.createElement("h2")
        header.innerHTML = chapter.name
        output.appendChild(header)
        for (let img of chapter.images) {
            fetchImage(img.fileName, img.description)
        }
    }
}

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

function render3DExhibition(exhibition) {
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

function generateImageData(chapter) {
    let imageData = []

    let imagePromises = []

    return new Promise((resolve) => {
        //for regular images
        for (let [j, img] of chapter.images.entries()) {
            let p = window.fetch(
                `${API_URL}?action=query&titles=${img.fileName}&format=json&prop=imageinfo&iiprop=url&origin=*`
            )
            imagePromises.push(p)
        }

        Promise.all(imagePromises).then((responseArr) => {
            let jsonPromises = responseArr.map((response) => {
                return response.json()
            })
            Promise.all(jsonPromises).then(function (dataArr) {
                let picPromises = dataArr.map((data, idx) => {
                    let url = data.query.pages["-1"].imageinfo[0].url
                    let img = {
                        fileURL: url,
                        description: chapter.images[idx].description,
                    }
                    return addPicture(img)
                })

                picPromises.unshift(createTextPlane(chapter.paragraph[0], 20))

                resolve(picPromises)
            })
        })
    })
}

function addPicture(img) {
    return new Promise((resolve) => {
        createImagePlane(img.fileURL).then((plane) => {
            createTextPlane(img.description).then((textPlane) => {
                textPlane.position.z = 1
                textPlane.position.y = -10
                plane.add(textPlane)
                resolve(plane)
            })
        })
    })
}

function fetchImage(filename, description) {
    let output = document.getElementById("output")

    let img = document.createElement("img")
    img.title = description
    output.appendChild(img)

    window
        .fetch(
            `${API_URL}?action=query&titles=${filename}&format=json&prop=imageinfo&iiprop=url&origin=*`
        )
        .then((response) => {
            response.json().then(function (data) {
                let url = data.query.pages["-1"].imageinfo[0].url

                img.src = url
            })
        })
}

function generate() {
    let topic = document.getElementById("topic").value

    let topicDiv = document.getElementById("topic")
    topicDiv.blur()

    let outputDiv = document.getElementById("output")
    outputDiv.innerHTML = ""

    window
        .fetch(
            `${API_URL}?action=query&format=json&prop=revisions&titles=${topic}&formatversion=2&rvprop=content&rvslots=*&origin=*`
        )
        .then((response) => {
            response.json().then(function (data) {
                let wikiContent =
                    data.query.pages[0].revisions[0].slots.main.content
                let exhibition = parseArticle(wikiContent)
                render3DExhibition(exhibition)
            })
        })
}

function getSuggestions(value) {
    window
        .fetch(
            `${API_URL}?action=opensearch&format=json&formatversion=2&search=${value}&namespace=0&limit=10&origin=*`
        )
        .then((response) => {
            response.json().then(function (data) {
                let datalist = document.getElementById("suggestions")
                datalist.innerHTML = ""

                for (let item of data[1]) {
                    addOption(item)
                }
            })
        })
}

function addOption(label) {
    let datalist = document.getElementById("suggestions")
    let option = document.createElement("option")

    option.value = `${label}`
    datalist.appendChild(option)
}

function animate() {
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

function setupScene() {
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
                console.log("shift down")
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

window.onload = function () {
    document.getElementById("topic").addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            generate()
        }
    })
    document
        .getElementById("generate-button")
        .addEventListener("click", (e) => generate())
    document
        .getElementById("topic")
        .addEventListener("input", (e) => getSuggestions(e.target.value))

    setupScene()
    onWindowResize()
    window.addEventListener("resize", onWindowResize)

    animate()
}
