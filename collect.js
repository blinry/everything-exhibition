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

    let exhibition = []

    let currentSectionName
    let currentSectionImages = []
    let currentParagraph = []

    for (const section of article.sections) {
        if (section.depth === 0) {
            if (currentSectionName) {
                exhibition.push({
                    name: currentSectionName,
                    images: currentSectionImages,
                    paragraph: currentParagraph,
                })
            }
            currentSectionName = section.title
            currentSectionImages = []
            currentParagraph = []
        }

        if (section?.paragraphs?.[0]?.sentences?.[0]?.text) {
            currentParagraph.push(section.paragraphs[0].sentences[0].text)
        }

        if (!section.images) {
            continue
        }

        let newImagePromises = section.images.map(async (image) => {
            let response = await window.fetch(
                `${API_URL}?action=query&titles=${image.file}&format=json&prop=imageinfo&iiprop=url&origin=*`
            )
            let data = await response.json()
            return {
                url: data.query.pages["-1"].imageinfo[0].url,
                description: image.caption,
            }
        })
        let newImages = await Promise.all(newImagePromises)

        currentSectionImages.push(...newImages)
    }
    exhibition.push({
        name: currentSectionName,
        images: currentSectionImages,
        paragraph: currentParagraph,
    })
    console.log(exhibition)
    return exhibition
}
