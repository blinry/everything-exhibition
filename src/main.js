window.SETTINGS = {}

const WIKIDATA_API_URL =
    "https://query.wikidata.org/bigdata/namespace/wdq/sparql?format=json&query="
import {apiURL, generateExhibitionDescriptionFromWikipedia} from "./collect.js"
import {setup, animate, render} from "./render.js"
import {setupMultiplayer, setName, setColor, setFace} from "./multiplayer.js"
import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"

var lang = localStorage.getItem("lang") || "en"
var topicStack

String.prototype.trunc =
    String.prototype.trunc ||
    function (n) {
        return this.length > n ? this.substr(0, n - 1) + "&hellip;" : this
    }

function getSuggestions(value) {
    window
        .fetch(
            `${apiURL(
                lang
            )}?action=opensearch&format=json&formatversion=2&search=${value}&namespace=0&limit=10&origin=*`
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

function randomSuggestions() {
    window
        .fetch(
            `${apiURL(
                lang
            )}?action=query&format=json&list=random&rnlimit=10&rnnamespace=0&origin=*`
        )
        .then((response) => {
            response.json().then(function (data) {
                let datalist = document.getElementById("suggestions")
                datalist.innerHTML = ""

                for (let item of data.query.random) {
                    addOption(item.title)
                }
            })
        })
}

function goodSuggestions() {
    let datalist = document.getElementById("suggestions")
    datalist.innerHTML = ""

    addOption("Kangaroo")
    addOption("Ada Lovelace")
    addOption("Elementary particle")
    addOption("Optical illusion")
    addOption("Camera obscura")
    addOption("Leonardo da Vinci")
    addOption("Mammal")
}

function addOption(label) {
    let datalist = document.getElementById("suggestions")
    let option = document.createElement("option")

    option.value = `${label}`
    datalist.appendChild(option)
}

function addFaceOption(label) {
    let datalist = document.getElementById("face-suggestions")
    let option = document.createElement("option")

    option.value = `${label}`
    datalist.appendChild(option)
}

export function updateStatus(text) {
    document.querySelector("#status").innerHTML = text
}

function startGeneration() {
    let topic = document.getElementById("topic").value

    let topicDiv = document.getElementById("topic")
    topicDiv.blur()

    generateExhibition(topic)
}

export async function generateExhibition(topic) {
    localStorage.setItem("topic", topic)

    if (topicStack[topicStack.length - 1] === topic) {
        // The user likely refreshed the page, do nothing.
    } else if (topicStack[topicStack.length - 2] === topic) {
        // The user likely clicked on the "back" sign.
        topicStack.pop()
    } else {
        topicStack.push(topic)
    }
    var previousTopic = topicStack[topicStack.length - 2]
    localStorage.setItem("topicStack", JSON.stringify(topicStack))

    let topicDiv = document.getElementById("topic")
    topicDiv.value = topic

    window.SETTINGS = {
        lights: document.querySelector("#lights")?.checked || false,
        shadows: document.querySelector("#shadows")?.checked || false,
        textures: document.querySelector("#textures")?.checked || false,
        images: document.querySelector("#images")?.checked || true,
        texts: document.querySelector("#texts")?.checked || true,
    }

    timeReset()

    var t = timeStart("entire generation")
    updateStatus("Generating...")

    location.hash = `https://${lang}.wikipedia.org/wiki/${topic}`

    var exhibition = await generateExhibitionDescriptionFromWikipedia(
        topic,
        lang
    )
    exhibition.previous = previousTopic
    await initializeMultiplayer(exhibition.name)
    await render(exhibition)
    timeEnd(t)

    timeDump()
}

async function initializeMultiplayer(topic) {
    await setupMultiplayer(topic)

    // Trigger input events.
    document.getElementById("name").dispatchEvent(new Event("input"))
    document.getElementById("face").dispatchEvent(new Event("input"))
    document.getElementById("color").dispatchEvent(new Event("input"))
}

function runQuery(query, callback) {
    query = query.replace(/%/g, "%25")
    query = query.replace(/&/g, "%26")

    window
        .fetch(WIKIDATA_API_URL + query)
        .then(function (response) {
            if (response.status !== 200) {
                updateStatus(
                    `The query took too long or failed. This is probably a bug, let us know! (Status code: ${response.status})`
                )
                return
            }
            response.json().then(function (data) {
                callback(data.results.bindings)
            })
        })
        .catch(function (err) {
            updateStatus(
                'An error occurred while running the query: "' + err + '"'
            )
        })
}

function populateFaceOptions() {
    addFaceOption("^_^")
    addFaceOption("OvO")
    addFaceOption("'o'")
    addFaceOption("-.-")
    addFaceOption("UwU")
}

function populateLanguageOptions() {
    const langQuery = `
SELECT ?languageCode ?languageLabel ?records (GROUP_CONCAT(?nativeLabel; SEPARATOR = "/") AS ?nativeLabels) WHERE {
  ?wiki wdt:P31 wd:Q10876391;
    wdt:P424 ?languageCode;
    wdt:P407 ?language.
  OPTIONAL { ?wiki wdt:P4876 ?records. }
  ?language wdt:P1705 ?nativeLabel.
  MINUS { ?wiki wdt:P576 ?when. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?languageCode ?languageLabel ?records ORDER BY DESC(?records)
    `
    runQuery(langQuery, (results) => {
        let select = document.querySelector("select")
        for (let line of results) {
            let option = document.createElement("option")
            option.innerHTML =
                `${line.languageLabel.value} (${line.languageCode.value}) – ${line.nativeLabels.value}`.trunc(
                    40
                )
            option.value = line.languageCode.value
            select.appendChild(option)
        }

        document.querySelector("#language").value = lang
    })
}

window.onload = async function () {
    populateLanguageOptions()
    populateFaceOptions()
    document.getElementById("language").addEventListener("change", function () {
        lang = this.value
        localStorage.setItem("lang", lang)
    })

    document.getElementById("topic").addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            topicStack = []
            startGeneration()
        }
    })
    document.getElementById("generate-button").addEventListener("click", () => {
        topicStack = []
        startGeneration()
    })
    document.getElementById("topic").addEventListener("input", (e) => {
        let text = e.target.value
        if (text === "") {
            goodSuggestions()
        } else {
            getSuggestions(text)
        }
    })

    document.getElementById("color").addEventListener("input", (e) => {
        setColor(e.target.value)
        localStorage.setItem("color", e.target.value)
    })

    document.getElementById("name").addEventListener("input", (e) => {
        setName(e.target.value)
        localStorage.setItem("name", e.target.value)
    })

    document.getElementById("face").addEventListener("input", (e) => {
        setFace(e.target.value)
        localStorage.setItem("face", e.target.value)
    })

    goodSuggestions()

    topicStack = JSON.parse(localStorage.getItem("topicStack") || "[]")

    setup()

    // Pick random color.
    let color =
        localStorage.getItem("color") ||
        "#" +
            Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0")
    document.getElementById("color").value = color

    // Set or load name.

    if (location.hash) {
        // Parse language and topic from Wikipedia URL.
        let url = decodeURIComponent(location.hash.substr(1))
        console.log(url)

        let regex = /^https:\/\/([^.]*)\.wikipedia\.org\/wiki\/([^#]*)$/
        let match = url.match(regex)

        if (match) {
            lang = match[1]
            let topic = match[2]
            document.getElementById("language").value = lang
            document.getElementById("topic").value = topic
            startGeneration()
        }
    } else {
        document.getElementById("topic").value =
            localStorage.getItem("topic") || "Lebkuchen"
        startGeneration()
    }

    let name = localStorage.getItem("name") || "squirrel"
    document.getElementById("name").value = name

    let face = localStorage.getItem("face") || "^_^"
    document.getElementById("face").value = face

    animate()
}
