const WIKIDATA_API_URL =
    "https://query.wikidata.org/bigdata/namespace/wdq/sparql?format=json&query="
import {apiURL, generateExhibitionDescriptionFromWikipedia} from "./collect.js"
import {setup, generate, animate, render} from "./render.js"
import {setupMultiplayer, setName, setColor} from "./multiplayer.js"
import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"

var lang = "en"

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
    let topicDiv = document.getElementById("topic")
    topicDiv.value = topic

    const settings = {
        lights: document.querySelector("#lights").checked,
        shadows: document.querySelector("#shadows").checked,
        textures: document.querySelector("#textures").checked,
        images: document.querySelector("#images").checked,
        texts: document.querySelector("#texts").checked,
    }

    timeReset()

    var t = timeStart("entire generation")
    updateStatus("Generating...")
    var exhibition = await generateExhibitionDescriptionFromWikipedia(
        topic,
        lang
    )
    await initializeMultiplayer(exhibition.name)
    await render(exhibition, settings)
    timeEnd(t)

    timeDump()
}

async function initializeMultiplayer(topic) {
    await setupMultiplayer(topic)

    // Trigger input events.
    document.getElementById("name").dispatchEvent(new Event("input"))
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

function populateLanguageOptions() {
    const langQuery = `
SELECT ?languageCode ?languageLabel (GROUP_CONCAT(?nativeLabel; SEPARATOR = "/") AS ?nativeLabels) WHERE {
  ?wiki wdt:P31 wd:Q10876391;
    wdt:P424 ?languageCode;
    wdt:P407 ?language.
  ?language wdt:P1705 ?nativeLabel.
  MINUS { ?wiki wdt:P576 ?when. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
GROUP BY ?languageCode ?languageLabel ORDER BY ?languageLabel
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
    document.getElementById("language").addEventListener("change", function () {
        lang = this.value
    })

    document.getElementById("topic").addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            startGeneration()
        }
    })
    document
        .getElementById("generate-button")
        .addEventListener("click", (e) => {
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

    goodSuggestions()

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
    let name = localStorage.getItem("name") || "^_^"
    document.getElementById("name").value = name

    document.getElementById("topic").value = "Kangaroo"
    startGeneration()

    animate()
}
