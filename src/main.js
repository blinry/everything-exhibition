window.SETTINGS = {}

const WIKIDATA_API_URL =
    "https://query.wikidata.org/bigdata/namespace/wdq/sparql?format=json&query="
import {
    apiURL,
    prefixOfDomain,
    mainArticle,
    generateHTMLFromWikipedia,
} from "./collect.js"
import {parseHTML} from "./parse.js"
import {setup, animate, render} from "./render.js"
import {
    setupMultiplayer,
    setupGroupConnection,
    setName,
    setColor,
    setFace,
} from "./multiplayer.js"
import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"

var domain
var topicStack

String.prototype.trunc =
    String.prototype.trunc ||
    function (n) {
        return this.length > n ? this.substr(0, n - 1) + "&hellip;" : this
    }

async function getSuggestions(value) {
    window
        .fetch(
            `${await apiURL(
                domain
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

async function randomSuggestions() {
    window
        .fetch(
            `${await apiURL(
                domain
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

async function startGeneration() {
    let domainDiv = document.getElementById("language")
    domain = domainDiv.value

    let topicDiv = document.getElementById("topic")
    topicDiv.blur()

    let topic = topicDiv.value

    console.log(domain)
    let prefix = await prefixOfDomain(domain)
    let url = `${domain}/${prefix}${topic}`
    localStorage.setItem("url", url)
    generateExhibition(url)
}

async function startRandom() {
    window
        .fetch(
            `${await apiURL(
                domain
            )}?action=query&format=json&list=random&rnlimit=1&rnnamespace=0&origin=*`
        )
        .then((response) => {
            response.json().then(async function (data) {
                let prefix = await prefixOfDomain(domain)
                generateExhibition(
                    `${domain}/${prefix}${data.query.random[0].title}`
                )
            })
        })
}

async function parseURL(url) {
    let parts = url.split("/")
    let domain = "https://" + parts[2]
    let remaining = parts.slice(3).join("/")
    let topic = remaining.replace(/^(index\.php|wiki)\//, "")

    if (topic == null || topic == "") {
        topic = await mainArticle(domain)
    }

    return {domain, topic}
}

async function pickCorrectDomainOption(url) {
    let parsedURL = await parseURL(url)

    if (parsedURL.domain) {
        domain = parsedURL.domain
    }

    if (parsedURL.topic) {
        let topic = parsedURL.topic
        // Scan through available options and check whether domain is one of them.
        let languageSelect = document.getElementById("language")
        languageSelect.selectedIndex = -1
        for (let i = 0; i < languageSelect.children.length; i++) {
            if (languageSelect.children[i].value === domain) {
                languageSelect.selectedIndex = i
                break
            }
        }
        if (languageSelect.selectedIndex === -1) {
            let option = document.createElement("option")
            option.innerHTML = domain
            option.value = domain
            languageSelect.appendChild(option)
            languageSelect.value = domain
        }

        document.getElementById("language").value = domain
        document.getElementById("topic").value = topic
    }
}

export async function generateExhibition(url) {
    if (url.startsWith("/")) {
        url = `${domain}${url}`
    }

    let parsedURL = await parseURL(url)

    let api = await apiURL(parsedURL.domain)

    if (!api) {
        window.open(url, "_blank")
        return
    }

    domain = parsedURL.domain

    let topic = parsedURL.topic

    await pickCorrectDomainOption(url)

    if (topicStack[topicStack.length - 1] === url) {
        // The user likely refreshed the page, do nothing.
    } else if (topicStack[topicStack.length - 2] === url) {
        // The user likely clicked on the "back" sign.
        topicStack.pop()
    } else {
        topicStack.push(url)
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

    const urlParams = new URLSearchParams(window.location.search)
    let groupID =
        urlParams.get("group") || localStorage.getItem("groupID") || "default"

    document
        .getElementById("group-button")
        .addEventListener("click", async (e) => {
            M.toast({html: "Link copied to clipboard!"})
            let newGroupID = makeid(30)
            copyStringToClipboard(
                document.location.protocol +
                    "//" +
                    document.location.host +
                    "/?group=" +
                    newGroupID +
                    "#" +
                    url
            )
            await initializeMultiplayer(url, newGroupID)
        })

    history.pushState(null, null, document.location.pathname + "#" + url)

    var html = await generateHTMLFromWikipedia(topic, domain)
    console.log(html)
    var exhibition = parseHTML(html, topic)
    console.log(exhibition)

    //var exhibition = {name: "Test", paragraphs: [{text: "!"}], sections: [
    //    {name: "A", paragraphs: [{text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "fu"}]},
    //    {name: "A", paragraphs: [{text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}]},
    //    {name: "A", paragraphs: [{text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}]},
    //    {name: "B", paragraphs: [{text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}]},
    //    {name: "C", paragraphs: [{text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}, {text: "Lorem ipsum dolor sit amet idipisci blubber bla!"}]},
    //]}

    exhibition.previous = previousTopic

    await initializeMultiplayer(url, groupID)
    await render(exhibition)
    timeEnd(t)

    timeDump()
}

async function initializeMultiplayer(url, groupID) {
    localStorage.setItem("groupID", groupID)
    await setupMultiplayer(url, groupID)
    await setupGroupConnection(groupID)

    // Trigger input events.
    document.getElementById("name").dispatchEvent(new Event("input"))
    document.getElementById("face").dispatchEvent(new Event("input"))
    document.getElementById("color").dispatchEvent(new Event("input"))
}

async function runQuery(query) {
    query = query.replace(/%/g, "%25")
    query = query.replace(/&/g, "%26")

    let response = await window.fetch(WIKIDATA_API_URL + query)

    if (response.status !== 200) {
        updateStatus(
            `The query took too long or failed. This is probably a bug, let us know! (Status code: ${response.status})`
        )
        return
    }
    let data = await response.json()
    return data.results.bindings
}

function populateFaceOptions() {
    addFaceOption("^_^")
    addFaceOption("OvO")
    addFaceOption("'o'")
    addFaceOption("-.-")
    addFaceOption("UwU")
}

async function populateLanguageOptions() {
    let select = document.querySelector("select")

    let option = document.createElement("option")
    option.innerHTML = "Wikimedia Commons"
    option.value = "https://commons.wikimedia.org"
    select.appendChild(option)

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
    let results = await runQuery(langQuery)

    for (let line of results) {
        let option = document.createElement("option")
        option.innerHTML =
            `${line.languageLabel.value} (${line.languageCode.value}) – ${line.nativeLabels.value}`.trunc(
                40
            )
        option.value = `https://${line.languageCode.value}.wikipedia.org`
        select.appendChild(option)
    }

    document.querySelector("#language").value = domain
}

window.onload = async function () {
    await populateLanguageOptions()
    populateFaceOptions()
    document.getElementById("language").addEventListener("change", function () {
        domain = this.value
    })

    document.getElementById("topic").addEventListener("keyup", async (e) => {
        if (e.key === "Enter") {
            topicStack = []
            await startGeneration()
        }
    })
    document
        .getElementById("generate-button")
        .addEventListener("click", async () => {
            topicStack = []
            await startGeneration()
        })
    document
        .getElementById("random-button")
        .addEventListener("click", async function () {
            topicStack = []
            await startRandom()
        })
    document.getElementById("topic").addEventListener("input", async (e) => {
        let text = e.target.value
        if (text === "") {
            //goodSuggestions()
        } else {
            await getSuggestions(text)
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

    //goodSuggestions()

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

    if (location.hash) {
        // Parse language and topic from Wikipedia URL.
        var url = decodeURIComponent(location.hash.substr(1))
    } else {
        var url = localStorage.getItem("url")
    }

    if (url) {
        await pickCorrectDomainOption(url)
        generateExhibition(url) // TODO also put in localstorage
    } else {
        domain = "https://en.wikipedia.org"
        await startRandom()
    }

    window.addEventListener("hashchange", async function () {
        if (location.hash) {
            let url = decodeURIComponent(location.hash.substr(1))
            await pickCorrectDomainOption(url)
            generateExhibition(url) // TODO also put in localstorage
        }
    })

    let name = localStorage.getItem("name") || "squirrel"
    document.getElementById("name").value = name

    let face = localStorage.getItem("face") || "^_^"
    document.getElementById("face").value = face

    animate()
}

//snacked from https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
function copyStringToClipboard(str) {
    // Create new element
    var el = document.createElement("textarea")
    // Set value (string to be copied)
    el.value = str
    // Set non-editable to avoid focus and move outside of view
    el.setAttribute("readonly", "")
    el.style = {position: "absolute", left: "-9999px"}
    document.body.appendChild(el)
    // Select text inside element
    el.select()
    // Copy text to clipboard
    document.execCommand("copy")
    // Remove temporary element
    document.body.removeChild(el)
}

//snacked from https://stackoverflow.com/a/1349426
function makeid(length) {
    var result = ""
    var characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    var charactersLength = characters.length
    for (var i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * charactersLength)
        )
    }
    return result
}
