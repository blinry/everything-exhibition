import {timeStart, timeEnd} from "./utils.js"
const wtf = require("wtf_wikipedia")

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

export function apiURL(languageCode) {
    return `https://${languageCode}.wikipedia.org/w/api.php`
}

export async function generateExhibitionDescriptionFromWikipedia(topic, lang) {
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

async function fetchWikiText(article, lang) {
    let response = await window.fetch(
        `${apiURL(
            lang
        )}?action=query&format=json&prop=revisions&titles=${article}&formatversion=2&rvprop=content&rvslots=*&origin=*`
    )
    let data = await response.json()

    return data.query.pages[0].revisions[0].slots.main.content
}

async function parseArticle(article, lang) {
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
    if (!section.paragraphs) {
        section.paragraphs = []
    }

    // Convert lists into paragraphs.
    if (section.lists) {
        for (let list of section.lists) {
            let sentences = list.map((item) => {
                item.links = item.links?.map((link) => {
                    return {text: link.text || link.page, page: link.page}
                })
                return {text: item.text, links: item.links}
            })

            section.paragraphs.push({sentences: sentences})
        }
    }

    // Convert tables into paragraphs.
    if (section.tables) {
        for (let table of section.tables) {
            var paragraphs = []
            for (let row of table) {
                let sentences = []
                for (let [key, value] of Object.entries(row)) {
                    value.links = value.links?.map((link) => {
                        return {text: link.text || link.page, page: link.page}
                    })
                    sentences.push({
                        text: `${key}: ${value.text}`,
                        links: value.links,
                    })
                }
                section.paragraphs.push({sentences: sentences})
            }
        }
    }

    // Get paragraphs.
    var paragraphs = []
    if (section.paragraphs) {
        var maxLength = 500
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
        // Combine paragraphs that are too short.
        var minLength = 150
        var i = 0
        /// [1,2,3]
        while (i < paragraphs.length - 1) {
            var totalLength = paragraphs[i].text.length //sentences.map(s => s.text.length).sum()
            var totalLengthNext = paragraphs[i + 1].text.length //sentences.map(s => s.text.length).sum()
            if (
                totalLength < minLength &&
                totalLength + totalLengthNext <= maxLength
            ) {
                paragraphs[i + 1].text =
                    paragraphs[i].text + "\n\n" + paragraphs[i + 1].text
                paragraphs[i + 1].links = paragraphs[i].links.concat(
                    paragraphs[i + 1].links
                )
                paragraphs.splice(i, 1)
            } else {
                i++
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
