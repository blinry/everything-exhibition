import {API_URL, generateExhibitionDescriptionFromWikipedia} from "./collect.js"
import {setup, generate, animate, render} from "./render.js"
import {setupMultiplayer, setName, setColor} from "./multiplayer.js"
import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"

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

function randomSuggestions() {
    window
        .fetch(
            `${API_URL}?action=query&format=json&list=random&rnlimit=10&rnnamespace=0&origin=*`
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
    var exhibition = await generateExhibitionDescriptionFromWikipedia(topic)
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

window.onload = async function () {
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

    initializeMultiplayer("xxx-lobby")

    animate()
}
