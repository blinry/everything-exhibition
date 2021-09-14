const wtf = require("wtf_wikipedia")

const API_URL = `https://en.wikipedia.org/w/api.php`

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
            imgArray.push({fileName: image.file, description: image.caption})
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
                render(exhibition)
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
}
