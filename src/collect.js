const wtf = require("wtf_wikipedia")

export const API_URL = `https://en.wikipedia.org/w/api.php`

export async function generateExhibitionDescriptionFromWikipedia(topic) {
    let response = await window.fetch(
        `${API_URL}?action=query&format=json&prop=revisions&titles=${topic}&formatversion=2&rvprop=content&rvslots=*&origin=*`
    )
    let data = await response.json()

    let wikiContent = data.query.pages[0].revisions[0].slots.main.content
    return await parseArticle(wikiContent)
}

async function parseArticle(wikiText) {
    const article = wtf(wikiText).json()
    console.log(article)

    let exhibition = {name: "TBD", sections: [], images: [], paragraphs: []}

    let currentSectionName
    let currentSectionImages = []
    let currentParagraphs = []

    // The stack holds the chain of parents up to the last inserted section.
    var stack = [exhibition]
    for (const section of article.sections) {
        const s = await createSection(section)

        if (s.images.length + s.paragraphs.length === 0) {
            // Skip this section.
            continue
        }

        // How much deeper is the depth of the current section, compared to the top one on the stack?
        const depthIncrease = section.depth - (stack.length - 2)

        // Remove the correct number of sections from the stack.
        const removeHowMany = -depthIncrease + 1
        stack.splice(stack.length - removeHowMany, removeHowMany)

        stack[stack.length - 1].sections.push(s)
        stack.push(s)
    }

    console.log(exhibition)
    return exhibition
}

async function createSection(section) {
    // Get paragraphs.
    var paragraphs = []
    if (section.paragraphs) {
        for (let paragraph of section.paragraphs) {
            if (paragraph.sentences) {
                const p = paragraph.sentences
                    .map((sentence) => {
                        var text = sentence.text
                        if (sentence.links) {
                            for (var link of sentence.links) {
                                if (link.text && link.page) {
                                    text = text.replace(
                                        link.text,
                                        `<a href="${link.page}">${link.text}</a>`
                                    )
                                }
                            }
                        }
                        return text
                    })
                    .join("<br><br>")
                if (p.length > 0) {
                    paragraphs.push(p)
                }
            }
        }
    }

    // Get images.
    var images = []

    if (section.images) {
        let newImagePromises = section.images.map(async (image) => {
            let response = await window.fetch(
                `${API_URL}?action=query&titles=${image.file}&format=json&prop=imageinfo&iiprop=url&origin=*`
            )
            let data = await response.json()
            if (data?.query?.pages?.["-1"]?.imageinfo?.[0]?.url) {
                return {
                    url: data.query.pages["-1"].imageinfo[0].url,
                    description: image.caption,
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
