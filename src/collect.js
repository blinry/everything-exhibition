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
    let currentParagraphs = []

    for (const section of article.sections) {
        if (section.depth === 0) {
            if (currentSectionName) {
                exhibition.push({
                    name: currentSectionName,
                    images: currentSectionImages,
                    paragraphs: currentParagraphs,
                })
            }
            currentSectionName = section.title
            currentSectionImages = []
            currentParagraphs = []
        }

        if (section.paragraphs) {
            for (let paragraph of section.paragraphs) {
                if (paragraph.sentences) {
                    currentParagraphs.push(
                        paragraph.sentences
                            .map((sentence) => {
                                return sentence.text
                            })
                            .join("<br><br>")
                    )
                }
            }
        }

        if (!section.images) {
            continue
        }

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
        let newImages = await Promise.all(newImagePromises)

        currentSectionImages.push(...newImages)
    }
    exhibition.push({
        name: currentSectionName,
        images: currentSectionImages,
        paragraphs: currentParagraphs,
    })
    console.log(exhibition)
    return exhibition
}
