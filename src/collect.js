import {timeStart, timeEnd} from "./utils.js"

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

// Oof, why is this not standardized?
let apiLocations = {
    "/w/api.php": ["wikipedia.org", "wikimedia.org"],
    "/api.php": ["fandom.com"],
    "/mediawiki/api.php": [],
    "/wiki/api.php": [],
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
    throw new Error(`Failed to find API URL for domain ${domain}`)
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

export async function generateHTMLFromWikipedia(topic, domain) {
    let response = await window.fetch(
        `${await apiURL(
            domain
        )}?action=parse&format=json&prop=text&page=${topic}&redirects=1&origin=*`
    )

    let json = await response.json()
    console.log(json)
    let parser = new DOMParser()
    if (json?.parse?.text?.["*"] == undefined) {
        throw new Error(`Topic "${topic}" not found at ${domain}`)
    }
    let content = parser
        .parseFromString(json.parse.text["*"], "text/html")
        .querySelector(".mw-parser-output")
    console.log(content)
    let markdown = await parseArticle(json.parse.title, content)
    console.log(markdown)
    return markdown
}

async function parseArticle(title, html) {
    // Add a header to the intro.
    let h2 = document.createElement("h2")
    h2.innerText = "Intro"
    html.insertBefore(h2, html.firstChild)

    // Delete elements we don't want to see.
    let selectors = [
        "style",
        ".mw-cite-backlink",
        "sup.reference",
        ".shortdescription",
        ".toc",
        ".toclimit-1",
        ".toclimit-2",
        ".toclimit-3",
        ".toclimit-4",
        ".toclimit-5",
        ".authority-control",
        ".mw-editsection",
    ]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            node.remove()
        })
    })

    // Unwrap certain nodes which could hide other stuff.
    selectors = ["center"]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            node.replaceWith(...node.children)
        })
    })

    // Certain divs are figures!
    selectors = [".thumb"]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            let figure = document.createElement("figure")
            node.parentNode.insertBefore(figure, node)
            figure.appendChild(node)
        })
    })

    // This div is a gallery!
    selectors = [".gallery"]
    selectors.forEach((selector) => {
        ;[...html.querySelectorAll(selector)].forEach((node) => {
            node.childNodes.forEach((child) => {
                let figure = document.createElement("figure")
                child.parentNode.insertBefore(figure, child)
                figure.appendChild(child)
            })
            node.replaceWith(...node.children)
        })
    })

    // Insert a header before any navboxes.
    let navbox = html.querySelector(".navbox")
    if (navbox) {
        let header = document.createElement("h2")
        header.innerText = "Related"
        navbox.parentNode.insertBefore(header, navbox)
    }

    // Navboxes get their own subsection.
    selectors = [".navbox"]
    selectors.forEach((selector) => {
        html.querySelectorAll(selector).forEach((node) => {
            let titleDiv = node.querySelector("th")
            let titleChildren = titleDiv.children
            title = titleChildren[titleChildren.length - 1].textContent.trim()

            let header = document.createElement("h3")
            header.innerText = title

            node.parentNode.insertBefore(header, node)
        })
    })

    return html
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
