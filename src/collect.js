import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"
const wtf = require("wtf_wikipedia")

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
}

export const API_URL = `https://en.wikipedia.org/w/api.php`

export async function generateExhibitionDescriptionFromWikipedia(topic) {
    var tf = timeStart("fetch")
    var wikiText = await fetchWikiText(topic)
    timeEnd(tf)

    var tw = timeStart("wtf")
    var article = wtf(wikiText).json()
    article.title = topic
    timeEnd(tw)
    console.log(article)

    var tr = timeStart("redirect")
    while (article.redirectTo) {
        topic = article.redirectTo.page

        wikiText = await fetchWikiText(topic)
        article = wtf(wikiText).json()
        article.title = topic
        console.log(article)
    }
    timeEnd(tr)

    var tp = timeStart("parse")
    const exhibition = await parseArticle(article)
    timeEnd(tp)

    return exhibition
}

async function fetchWikiText(article) {
    let response = await window.fetch(
        `${API_URL}?action=query&format=json&prop=revisions&titles=${article}&formatversion=2&rvprop=content&rvslots=*&origin=*`
    )
    let data = await response.json()

    return data.query.pages[0].revisions[0].slots.main.content
}

async function parseArticle(article) {
    const imageURLs = await getImageURLs(article.title)

    // Explicitly add introduction section.
    let intro = createSection(article.sections[0], imageURLs)
    intro.name = " "

    let exhibition = {
        name: capitalizeFirstLetter(article.title),
        images: [],
        paragraphs: [],
        sections: [intro],
    }

    // The stack holds the chain of parents up to the last inserted section.
    var stack = [exhibition]
    for (const section of article.sections.slice(1)) {
        const s = createSection(section, imageURLs)

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

async function getImageURLs(title) {
    let response = await window.fetch(
        `${API_URL}?action=query&format=json&prop=imageinfo&iiprop=url|size&generator=images&gimlimit=max&titles=${title}&origin=*`
    )
    // TODO: What if a page has more than 500 images?
    let data = await response.json()

    let result = {}
    for (const entry of Object.values(data.query.pages)) {
        result[entry.title] = {
            url: entry.imageinfo[0].url,
            width: entry.imageinfo[0].width,
            height: entry.imageinfo[0].height,
        }
    }

    return result
}

function createSection(section, imageURLs) {
    // Convert lists into paragraphs.
    if (section.lists) {
        if (!section.paragraphs) {
            section.paragraphs = []
        }
        for (let list of section.lists) {
            let p = list.map((item) => "- " + item.text).join("\n\n")
            section.paragraphs.push({sentences: [{text: p}]})
        }
    }

    // Get paragraphs.
    var paragraphs = []
    if (section.paragraphs) {
        for (let paragraph of section.paragraphs) {
            if (paragraph.sentences) {
                // Insert HTML links for all links in the text.
                var sentences = paragraph.sentences.map((sentence) => {
                    var text = sentence.text
                    //if (sentence.links) {
                    //    for (var link of sentence.links) {
                    //        if (link.text && link.page) {
                    //            text = text.replace(
                    //                link.text,
                    //                `<a href="${link.page}">${link.text}</a>`
                    //            )
                    //        }
                    //    }
                    //}
                    return text
                })

                // Make sure the individual paragraphs don't get too long.
                var maxLength = 700
                var currentParagraph = ""
                for (var [i, s] of sentences.entries()) {
                    if ((currentParagraph + s).length < maxLength) {
                        if (i !== 0) {
                            currentParagraph += "\n\n"
                        }
                        currentParagraph += s
                    } else {
                        if (currentParagraph.length > 0) {
                            paragraphs.push(currentParagraph)
                        }
                        currentParagraph = s
                    }
                }
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph)
                }
            }
        }
    }

    // Get images.
    var images = []

    if (section.images) {
        images = section.images.map((image) => {
            // In case the name is "File:foobar.png", make it "File:Foobar.png".
            let parts = image.file.split(":", 2)
            image.file = parts[0] + ":" + capitalizeFirstLetter(parts[1])

            // Replace underscores with spaces.
            image.file = image.file.replaceAll("_", " ")

            // Replace "Image:" and "file:" with "File:", removing spaces as neccessary.
            image.file = image.file.replace(/^(image|file): */i, "File:")

            const imageinfo = imageURLs[image.file]
            if (!imageinfo) {
                console.log(imageURLs)
                console.log("Could not find image URL for " + image.file)
            }

            return {
                url: imageinfo.url,
                description: image.caption,
                width: imageinfo.width,
                height: imageinfo.height,
            }
        })
    }

    return {
        name: section.title || "Start here!",
        images: images,
        paragraphs: paragraphs,
        sections: [],
    }
}
