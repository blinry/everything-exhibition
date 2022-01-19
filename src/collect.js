import {timeStart, timeEnd} from "./utils.js"

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

// Oof, why is this not standardized?
let apiLocations = {
    "/w/api.php": ["wikipedia.org", "wikimedia.org"],
    "/api.php": ["fandom.com"],
    "/mediawiki/api.php": [],
}

export async function apiURL(domain) {
    // Check if domain is one of these.
    for (const [url, domains] of Object.entries(apiLocations)) {
        if (domains.some((d) => domain.endsWith(d))) {
            return `${domain}${url}`
        }
    }

    // Otherwise, try to fetch all of them, and return the first one that works.
    console.log("Unknown domain! Have to guess...")
    for (const [url, _] of Object.entries(apiLocations)) {
        try {
            let response = await window.fetch(`${domain}${url}?origin=*`)
            if (response.ok) {
                apiLocations[url].push(domain)
                return `${domain}${url}`
            }
        } catch (e) {
            // It's okay! <3 Hide error.
            const mute = e
        }
    }

    // Still here? Fail horribly.
    console.log("Failed to find API URL for domain", domain)
}

let domainPrefixes = {
    "wiki/": ["wikipedia.org", "wikimedia.org"],
    "": ["fandom.com"],
}

export async function prefixOfDomain(domain) {
    // Check if domain is one of these.
    for (const [prefix, domains] of Object.entries(domainPrefixes)) {
        if (domains.some((d) => domain.endsWith(d))) {
            return prefix
        }
    }

    // Otherwise, do an API call to find out.
    let response = await window.fetch(
        `${await apiURL(
            domain
        )}?action=query&format=json&meta=siteinfo&origin=*`
    )
    let data = await response.json()
    let prefix = data.query.general.articlepath
        .replace(/\$1$/, "")
        .replace(/^\//, "")
    if (!domainPrefixes[prefix]) {
        domainPrefixes[prefix] = []
    }
    domainPrefixes[prefix].push(domain)

    return prefix
}

export async function mainArticle(domain) {
    let response = await window.fetch(
        `${await apiURL(
            domain
        )}?action=query&format=json&origin=*&meta=siteinfo`
    )
    let data = await response.json()
    return data.query.general.mainpage
}

export async function generateExhibitionDescriptionFromWikipedia(
    topic,
    domain
) {
    let response = await window.fetch(
        `${await apiURL(
            domain
        )}?action=parse&format=json&prop=text&page=${topic}&redirects=1&origin=*`
    )

    let json = await response.json()
    console.log(json)
    let parser = new DOMParser()
    if (json?.parse?.text?.["*"] == undefined) {
        console.log("Article not found: ", topic)
        return
    }
    let content = parser
        .parseFromString(json.parse.text["*"], "text/html")
        .querySelector(".mw-parser-output")
    console.log(content)
    let exhibition = await parseArticle(json.parse.title, content)
    console.log(exhibition)
    return exhibition
}

function resolveLink(a) {
    var href = a.href
    if (href.startsWith(window.location.origin)) {
        href = href.substring(window.location.origin.length)
    }
    return {text: a.textContent, page: href}
}

function parseParagraph(node) {
    var links = [...node.querySelectorAll("a")].map((a) => resolveLink(a))
    return {
        text: node.textContent.trim(),
        links: links,
    }
}

function parseList(node) {
    let paragraph = {text: "", links: []}
    let lis = node.querySelectorAll("li")
    if (lis) {
        for (const li of lis) {
            paragraph.text += "• " + li.textContent + "\n"
            for (const a of li.querySelectorAll("a")) {
                paragraph.links.push(resolveLink(a))
            }
        }
    } else {
        console.log("Got an empty list?", node)
    }
    return paragraph
}

function parseImage(node, selector) {
    if (node.nodeName == "IMG") {
        var img = node
    } else {
        var img = node.querySelector("img")
    }
    if (img) {
        let width =
            img.dataset.fileWidth ||
            img.style.width.replace("px", "") ||
            img.width
        let height =
            img.dataset.fileHeight ||
            img.style.height.replace("px", "") ||
            img.height
        if (!width) {
            console.log("Image has no size: ", node)
        }

        let description
        if (selector) {
            let caption = node.querySelector(selector)
            if (caption) {
                description = parseParagraph(caption)
            }
        }

        let src = img.src

        // For fandom.com:
        if (src.startsWith("data:image")) {
            src = img.dataset.src.replace(/\/revision\/.*$/, "")
        }

        src = src.replace(/\/[0-9]*px-/, `/${width}px-`)
        return {
            url: src,
            description: description,
            width: width,
            height: height,
        }
    } else {
        console.log("No image found in node", node)
        return undefined
    }
}

async function parseArticle(title, html) {
    let intro = {name: "Intro", sections: [], paragraphs: [], images: []}
    let exhibition = {
        name: title,
        sections: [intro],
        paragraphs: [],
        images: [],
    }

    var stack = [exhibition, intro]

    let selectors = ["style", ".mw-cite-backlink", "sup.reference"]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            node.remove()
        })
    })

    selectors = ["center"]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            node.replaceWith(...node.children)
        })
    })

    let navbox = html.querySelector(".navbox")
    if (navbox) {
        let header = document.createElement("h2")
        header.innerText = "Related"
        navbox.parentNode.insertBefore(header, navbox)
    }

    html.childNodes.forEach((node) => {
        var currentSection = stack[stack.length - 1]
        if (node.nodeName.match(/^H\d$/)) {
            let level = parseInt(node.nodeName[1]) - 2
            let section = {
                name:
                    node.querySelector(".mw-headline")?.textContent ||
                    node.textContent,
                paragraphs: [],
                sections: [],
                images: [],
            }
            const depthIncrease = level - (stack.length - 2)
            let removeHowMany = -depthIncrease + 1
            if (removeHowMany > stack.length - 1) {
                removeHowMany = stack.length - 1
            }
            stack.splice(stack.length - removeHowMany, removeHowMany)
            stack[stack.length - 1].sections.push(section)
            stack.push(section)
        } else if (["P", "BLOCKQUOTE", "DL"].includes(node.nodeName)) {
            if (node.textContent.trim() !== "") {
                currentSection.paragraphs.push(parseParagraph(node))
            }
        } else if (node.nodeName == "FIGURE") {
            let image = parseImage(node, ".thumbcaption")
            if (image) {
                currentSection.images.push(image)
            }
        } else if (node.nodeName == "DIV") {
            if (node.classList.contains("thumb")) {
                let imgs = node.querySelectorAll("img")
                if (imgs.length <= 1) {
                    let image = parseImage(node, ".thumbcaption")
                    if (image) {
                        currentSection.images.push(image)
                    }
                } else {
                    let caption = parseParagraph(
                        node.querySelector(".thumbcaption")
                    )
                    let gallerySection = {
                        name: caption.text,
                        paragraphs: [],
                        sections: [],
                        images: [],
                    }
                    for (const img of imgs) {
                        let image = parseImage(img, null)
                        if (image) {
                            gallerySection.images.push(image)
                        }
                    }
                    currentSection.sections.push(gallerySection)
                }
            } else if (node.classList.contains("reflist")) {
                if (node.textContent.trim() != "") {
                    currentSection.paragraphs.push(
                        parseList(node.querySelector("ol"))
                    )
                }
            } else if (
                [
                    "shortdescription",
                    "toc",
                    "toclimit-1",
                    "toclimit-2",
                    "toclimit-3",
                    "toclimit-4",
                    "toclimit-5",
                    "authority-control",
                ].some((c) => node.classList.contains(c))
            ) {
                // This element is not helpful, skip it.
            } else if (node.classList.contains("navbox")) {
                let titleChildren = node.querySelector(".navbox-title").children
                title =
                    titleChildren[titleChildren.length - 1].textContent.trim()
                let navboxSection = {
                    name: title,
                    paragraphs: [parseParagraph(node)],
                    sections: [],
                    images: [],
                }
                currentSection.sections.push(navboxSection)
            } else {
                if (node.textContent.trim() != "") {
                    currentSection.paragraphs.push(parseParagraph(node))
                }
            }
        } else if (node.nodeName == "#text") {
            if (!node.textContent.match(/^\s*$/)) {
                console.log("Skipping #text node: " + node.textContent)
            }
        } else if (node.nodeName == "TABLE") {
            currentSection.paragraphs.push(parseParagraph(node))
        } else if (["LINK", "#comment"].includes(node.nodeName)) {
            // Skip, we can't really use those.
        } else if (node.nodeName == "UL") {
            if (node.classList.contains("gallery")) {
                node.querySelectorAll(".gallerybox").forEach((box) => {
                    let image = parseImage(box, ".gallerytext")
                    if (image) {
                        currentSection.images.push(image)
                    }
                })
            } else {
                currentSection.paragraphs.push(parseList(node))
            }
        } else {
            console.log("Skipping node of type " + node.nodeName)
            console.log(node)
        }
    })
    return exhibition
}

async function getContributors(topic, lang) {
    let response = await window.fetch(
        `${await apiURL(
            lang
        )}?action=query&titles=${topic}&prop=contributors&pclimit=max&format=json&origin=*`
    )
    let data = await response.json()

    // TODO: If there are more than 500 contributors, we need to do more requests!

    let page = data.query.pages[Object.keys(data.query.pages)[0]]
    let contributors = page.contributors.map((c) => c.name).sort()

    let perChunk = 90
    let contributorChunks = contributors
        .reduce((all, one, i) => {
            const ch = Math.floor(i / perChunk)
            all[ch] = [].concat(all[ch] || [], one)
            return all
        }, [])
        .map((c) => c.join(", "))

    let paragraphs = ["This content was written by:"]
    paragraphs.push(...contributorChunks)
    if (page.anoncontributors) {
        paragraphs.push(
            `...and ${page.anoncontributors} anonymous contributors!`
        )
    }

    return paragraphs.map((p) => ({text: p, links: []}))
}
