import {timeStart, timeEnd, timeReset, timeDump} from "./utils.js"
const wtf = require("wtf_wikipedia")

export const API_URL = `https://en.wikipedia.org/w/api.php`

export async function generateExhibitionDescriptionFromWikipedia(topic) {
    var t = timeStart("parse")
    var wikiText = await fetchWikiText(topic)
    var article = wtf(wikiText).json()
    console.log(article)

    while (article.redirectTo) {
        topic = article.redirectTo.page

        wikiText = await fetchWikiText(topic)
        article = wtf(wikiText).json()
        console.log(article)
    }

    const exhibition = await parseArticle(article)
    timeEnd(t)
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
    let exhibition = await createSection(article.sections[0])

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1)
    }
    exhibition.name = capitalizeFirstLetter(article.title)

    // The stack holds the chain of parents up to the last inserted section.
    var stack = [exhibition]
    for (const section of article.sections.slice(1)) {
        const s = await createSection(section)

        //if (s.images.length + s.paragraphs.length === 0) {
        //    // Skip this section.
        //    continue
        //}

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

async function createSection(section) {
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
        let newImagePromises = section.images.map(async (image) => {
            let response = await window.fetch(
                `${API_URL}?action=query&titles=${image.file}&format=json&prop=imageinfo&iiprop=url|size&iiurlwidth=200&origin=*`
            )
            let data = await response.json()
            if (data?.query?.pages?.["-1"]?.imageinfo?.[0]?.url) {
                var imageinfo = data.query.pages["-1"].imageinfo[0]
                return {
                    url: imageinfo.url,
                    description: image.caption,
                    width: imageinfo.width,
                    height: imageinfo.height,
                }
            }
        })
        images = await Promise.all(newImagePromises)
    }

    return {
        name: section.title || "Start here!",
        images: images,
        paragraphs: paragraphs,
        sections: [],
    }
}
