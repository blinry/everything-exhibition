import {API_URL, generateExhibitionDescriptionFromWikipedia} from "./collect.js"
import {setup, generate, animate, render} from "./render.js"

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

function startGeneration() {
    let topic = document.getElementById("topic").value

    let topicDiv = document.getElementById("topic")
    topicDiv.blur()

    let outputDiv = document.getElementById("output")
    outputDiv.innerHTML = ""

    generateExhibitionDescriptionFromWikipedia(topic).then((exhibition) =>
        render(exhibition)
    )
}

window.onload = function () {
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
    document
        .getElementById("topic")
        .addEventListener("input", (e) => getSuggestions(e.target.value))

    setup()
    animate()
}
