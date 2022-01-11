import {timeStart, timeEnd} from "./utils.js"
const wtf = require("wtf_wikipedia")

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

export function apiURL(domain) {
    if (domain.match(/wikipedia\.org$/)) {
        return `${domain}/w/api.php`
    } else if (domain.match(/fandom\.com$/)) {
        return `${domain}/api.php`
    } else if (domain.match(/stratum0\.org$/)) {
        return `${domain}/mediawiki/api.php`
    } else {
        console.log("Unknown domain, guessing API endpoint:", domain)
        return `${domain}/w/api.php`
    }
}

export async function generateExhibitionDescriptionFromWikipedia(
    topic,
    domain
) {
    let response = await window.fetch(
        `${apiURL(
            domain
        )}?action=parse&format=json&prop=text&page=${topic}&redirects=1&origin=*`
    )
    let json = await response.json()
    let parser = new DOMParser()
    let content = parser
        .parseFromString(json.parse.text["*"], "text/html")
        .querySelector(".mw-parser-output")
    console.log(content)
    let exhibition = await parseArticle(json.parse.title, content)
    console.log(exhibition)
    return exhibition
}

export async function generateExhibitionDescriptionFromWikipedia2(topic, lang) {
    var tf = timeStart("fetch")
    var wikiText = await fetchWikiText(topic, lang)
    timeEnd(tf)

    var tw = timeStart("wtf")
    var article = wtf(wikiText).json()
    article.title = topic
    timeEnd(tw)

    var tr = timeStart("redirect")
    while (article.redirectTo) {
        topic = article.redirectTo.page

        wikiText = await fetchWikiText(topic, lang)
        article = wtf(wikiText).json()
        article.title = topic
    }
    timeEnd(tr)

    console.log(article)

    var tp = timeStart("parse")
    const exhibition = await parseArticle(article, lang)

    exhibition.sections.push({
        name: "Credits",
        paragraphs: await getContributors(topic, lang),
    })

    timeEnd(tp)

    return exhibition
}

async function fetchWikiText(article, domain) {
    let response = await window.fetch(
        `${apiURL(
            domain
        )}?action=query&format=json&prop=revisions&titles=${article}&formatversion=2&rvprop=content&rvslots=*&origin=*`
    )
    let data = await response.json()

    return data.query.pages[0].revisions[0].slots.main.content
}

function resolveLink(a) {
    var href = a.href
    if (href.startsWith(window.location.origin)) {
        href = href.substring(window.location.origin.length)
    }
    return {text: a.textContent, page: href}
}

function parseParagraph(node) {
    node.querySelectorAll("sup.reference").forEach((sup) => {
        sup.remove()
    })
    var links = [...node.querySelectorAll("a")].map((a) => resolveLink(a))
    return {
        text: node.textContent,
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

async function parseArticle(title, html) {
    let exhibition = {name: title, sections: [], paragraphs: [], images: []}
    var stack = [exhibition]
    html.childNodes.forEach((node) => {
        var currentSection = stack[stack.length - 1]
        if (node.nodeName.match(/^H\d$/)) {
            let level = parseInt(node.nodeName[1]) - 2
            let section = {
                name: node.querySelector(".mw-headline").textContent,
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
        } else if (["P", "BLOCKQUOTE"].includes(node.nodeName)) {
            if (node.textContent.trim() !== "") {
                currentSection.paragraphs.push(parseParagraph(node))
            }
        } else if (node.nodeName == "DIV") {
            if (node.classList.contains("thumb")) {
                let img = node.querySelector("img")
                if (img) {
                    let width =
                        img.dataset.fileWidth ||
                        img.style.width.replace("px", "")
                    let height =
                        img.dataset.fileHeight ||
                        img.style.height.replace("px", "")
                    if (!width) {
                        console.log(node)
                        console.log(img)
                    }
                    let caption = node.querySelector(".thumbcaption")
                    let description = undefined
                    if (caption) {
                        description = parseParagraph(caption)
                    }
                    let src = img.src.replace(/\/[0-9]*px-/, `/${width}px-`)
                    let image = {
                        url: src,
                        description: description,
                        width: width,
                        height: height,
                    }
                    currentSection.images.push(image)
                } else {
                    console.log("No image found in thumb div", node)
                }
            } else if (node.classList.contains("reflist")) {
                if (node.textContent.trim() != "") {
                    currentSection.paragraphs.push(
                        parseList(node.querySelector("ol"))
                    )
                }
            } else if (
                node.classList.contains("shortdescription") ||
                node.classList.contains("toc")
            ) {
                // This element is not helpful, skip it.
            } else {
                currentSection.paragraphs.push(parseParagraph(node))
            }
        } else if (node.nodeName == "#text") {
            if (!node.textContent.match(/^\s*$/)) {
                console.log("Skipping #text node: " + node.textContent)
            }
        } else if (node.nodeName == "TABLE") {
            currentSection.paragraphs.push(parseParagraph(node))
        } else if (["STYLE", "LINK", "#comment"].includes(node.nodeName)) {
            // Skip, we can't really use those.
        } else if (node.nodeName == "UL") {
            currentSection.paragraphs.push(parseList(node))
        } else {
            console.log("Skipping node of type " + node.nodeName)
            console.log(node)
        }
    })
    return exhibition
}

async function parseArticle2(article, lang) {
    const imageURLs = await getImageURLs(article.title, lang)
    const fileNamespace = await getFileNamespace(lang)

    // Explicitly add introduction section.
    let intro = createSection(article.sections[0], imageURLs, fileNamespace)
    intro.name = "Intro"

    let exhibition = {
        name: capitalizeFirstLetter(article.title),
        images: [],
        paragraphs: [],
        sections: [intro],
    }

    // The stack holds the chain of parents up to the last inserted section.
    var stack = [exhibition]
    for (const section of article.sections.slice(1)) {
        const s = createSection(section, imageURLs, fileNamespace)

        // How much deeper is the depth of the current section, compared to the top one on the stack?
        const depthIncrease = section.depth - (stack.length - 2)

        // Remove the correct number of sections from the stack.
        const removeHowMany = -depthIncrease + 1
        stack.splice(stack.length - removeHowMany, removeHowMany)

        stack[stack.length - 1].sections.push(s)
        stack.push(s)
    }

    // Clear empty top-level sections.
    exhibition.sections = exhibition.sections.filter(
        (s) => s.images.length + s.paragraphs.length + s.sections.length > 0
    )

    console.log(exhibition)
    return exhibition
}

async function getImageURLs(title, lang) {
    let response = await window.fetch(
        `${apiURL(
            lang
        )}?action=query&format=json&prop=imageinfo&iiprop=url|size&generator=images&gimlimit=max&titles=${title}&origin=*`
    )
    // TODO: What if a page has more than 500 images?
    let data = await response.json()
    let result = {}
    if (data.query?.pages) {
        for (const entry of Object.values(data.query.pages)) {
            // For deadlinks, imageinfo is missing.
            if (entry.imageinfo) {
                result[entry.title] = {
                    url: entry.imageinfo[0].url,
                    width: entry.imageinfo[0].width,
                    height: entry.imageinfo[0].height,
                }
            }
        }
    }

    return result
}

async function getFileNamespace(lang) {
    let response = await window.fetch(
        `${apiURL(
            lang
        )}?action=query&format=json&meta=siteinfo&siprop=namespaces&origin=*`
    )
    let data = await response.json()
    return data.query.namespaces["6"]["*"]
}

function createSection(section, imageURLs, fileNamespace) {
    // Convert lists into paragraphs.
    if (section.lists) {
        if (!section.paragraphs) {
            section.paragraphs = []
        }
        for (let list of section.lists) {
            var links = []
            let sentences = list.map((item) => {
                item.links = item.links?.map((link) => {
                    return {text: link.text || link.page, page: link.page}
                })
                return {text: item.text, links: item.links}
            })

            section.paragraphs.push({sentences})
        }
    }

    // Get paragraphs.
    var paragraphs = []
    if (section.paragraphs) {
        for (let paragraph of section.paragraphs) {
            var links = []
            if (paragraph.sentences) {
                var sentences = paragraph.sentences.map((sentence) => {
                    var text = sentence.text
                    if (sentence.links) {
                        for (const link of sentence.links) {
                            if (link.text && link.page) {
                                // TODO: What happens here when text is not set?
                                links.push({text: link.text, page: link.page})
                            }
                        }
                    }
                    return text
                })

                // Make sure the individual paragraphs don't get too long.
                var maxLength = 500
                var currentParagraph = ""
                for (var [i, s] of sentences.entries()) {
                    if ((currentParagraph + s).length < maxLength) {
                        if (i !== 0) {
                            currentParagraph += "\n\n"
                        }
                        currentParagraph += s
                    } else {
                        if (currentParagraph.length > 0) {
                            paragraphs.push({
                                text: currentParagraph,
                                links: links,
                            })
                        }
                        currentParagraph = s
                    }
                }
                if (currentParagraph.length > 0) {
                    paragraphs.push({text: currentParagraph, links: links})
                }
            }
        }
    }

    var images = []

    // Pull images from gallery templates and multiple image groups.
    if (section.templates) {
        for (let template of section.templates) {
            if (template.template === "gallery") {
                for (let image of template.images) {
                    let caption = image?.caption?.data?.text

                    if (!section.images) {
                        section.images = []
                    }

                    section.images.push({file: image.file, caption})
                }
            }

            if (template.template === "multiple image") {
                for (let key in template) {
                    if (key.startsWith("image")) {
                        if (!section.images) {
                            section.images = []
                        }

                        let caption =
                            template[key.replace("image", "caption")] || ""
                        section.images.push({file: template[key], caption})
                    }
                }
            }

            if (template.template === "listen") {
                if (!section.images) {
                    section.images = []
                }
                section.images.push({
                    file: template.filename,
                    caption: template.description,
                })
            }
        }
    }

    // Get images.
    if (section.images) {
        for (let image of section.images) {
            // Normalize the filename.
            if (image.file.indexOf(":") === -1) {
                image.file = fileNamespace + ":" + image.file
            }
            image.file = image.file.replace(/^image:/i, fileNamespace + ":")
            let parts = image.file.split(/: */, 2)
            image.file =
                capitalizeFirstLetter(parts[0]) +
                ":" +
                capitalizeFirstLetter(parts[1])

            // Replace underscores with spaces.
            image.file = image.file.replaceAll("_", " ")

            if (imageURLs[image.file]) {
                const imageinfo = imageURLs[image.file]

                images.push({
                    url: imageinfo.url,
                    description: image.caption,
                    width: imageinfo.width,
                    height: imageinfo.height,
                })
            } else {
                console.log(imageURLs)
                console.log("Could not find image URL for " + image.file)
            }
        }
    }

    return {
        name: section.title || "Start here!",
        images: images,
        paragraphs: paragraphs,
        sections: [],
    }
}

async function getContributors(topic, lang) {
    let response = await window.fetch(
        `${apiURL(
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
