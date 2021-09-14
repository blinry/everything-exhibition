const wtf = require("wtf_wikipedia")

const API_URL = `https://en.wikipedia.org/w/api.php`
let scene
let renderer
let controls
let camera

function parseArticle(wikiText) {
    const article = wtf(wikiText).json()
    console.log(article)

    let exhibition = []
    for (const section of article.sections) {
        if (!section.images) {
            continue
        }

        let imgArray = []
        for (const image of section.images) {
            imgArray.push({
                fileName: image.file,
                description: image.caption,
                fileURL: image.url,
            })
        }

        exhibition.push({name: section.title, images: imgArray})
    }
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

function render3DExhibition(exhibition) {
    for (let chapter of exhibition) {
        let header = document.createElement("h2")
        header.innerHTML = chapter.name
        output.appendChild(header)
        for (let img of chapter.images) {
            window
                .fetch(
                    `${API_URL}?action=query&titles=${img.fileName}&format=json&prop=imageinfo&iiprop=url&origin=*`
                )
                .then((response) => {
                    response.json().then(function (data) {
                        let url = data.query.pages["-1"].imageinfo[0].url

                        addImage(url)
                    })
                })
        }
    }
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
                // Hack: assume that images are on their own lines.
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
    requestAnimationFrame(animate)

    controls.update()
    renderer.render(scene, camera)
}

function setupScene() {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xa3c3f7)

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    )

    renderer = new THREE.WebGLRenderer()
    renderer.setSize(window.innerWidth, window.innerHeight)
    document.body.appendChild(renderer.domElement)

    camera.position.y = 0
    camera.position.x = 0
    camera.position.z = 5
    controls = new THREE.OrbitControls(camera, renderer.domElement)
    controls.target = new THREE.Vector3(0, 0, 0)
    controls.update()

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.x = 4
    light.castShadow = true
    scene.add(light)

    const ambient = new THREE.AmbientLight(0xffffff) // soft white light
    scene.add(ambient)

    const geometry = new THREE.ConeGeometry(100, 100, 128)
    const material = new THREE.MeshStandardMaterial({color: 0x188c1c})
    const ground = new THREE.Mesh(geometry, material)
    scene.add(ground)
    ground.position.y = -55
    ground.rotateX(Math.PI)
}

function addImage(url) {
    var texture = new THREE.TextureLoader().load(url, (texture) => {
        console.log(texture)
        let ratio = texture.image.width / texture.image.height
        var planeGeometry = new THREE.PlaneGeometry(30 * ratio, 30)
        var planeMaterial = new THREE.MeshLambertMaterial({map: texture})

        var plane = new THREE.Mesh(planeGeometry, planeMaterial)
        plane.position.x = Math.random() * 400 - 200
        plane.position.z = Math.random() * -200

        scene.add(plane)
    })
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

    animate()
}
