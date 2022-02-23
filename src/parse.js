function parseImages(node) {
    if (node.nodeName == "IMG") {
        var imgs = [node]
    } else {
        var imgs = [...node.querySelectorAll("img")]
    }
    if (imgs.length == 0) {
        console.log("No image found in node", node)
        return []
    } else {
        let description = parseParagraph(node)

        let returns = imgs.map((img) => {
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

            let maxHeight = 1000

            let ratio = height / width
            height = Math.min(height, maxHeight)
            width = Math.floor(height / ratio)

            let src = img.src

            // For fandom.com:
            if (src.startsWith("data:image")) {
                src = img.dataset.src.replace(/\/revision\/.*$/, "")
            }

            src = src.replace(/\/[0-9]*px-/, `/${width}px-`)
            return {
                type: "image",
                url: src,
                width: width,
                height: height,
            }
        })
        if (returns.length == 1) {
            returns = returns[0]
            returns.type = "image"
            returns.description = description
        } else {
            returns = {
                type: "section",
                name: description.text,
                content: returns,
            }
        }
        return returns
    }
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
        type: "paragraph",
        text: node.textContent.trim(),
        links: links,
    }
}

function parseList(node) {
    let paragraph = {type: "paragraph", text: "", links: []}
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

function parseTable(node) {
    console.log(node)
    let paragraph = {type: "paragraph", text: "", links: []}
    let rows = [...node.querySelectorAll("tr")]
    rows.map((row) => {
        let cells = [...row.querySelectorAll("th, td")]
        let rowtext = cells
            .map((cell) => {
                for (const a of cell.querySelectorAll("a")) {
                    paragraph.links.push(resolveLink(a))
                }
                return cell.textContent
            })
            .join(" | ")
        paragraph.text += rowtext + "\n"
    })
    return paragraph
}

export function parseHTML(html, title, domain) {
    let exhibition = {
        type: "section",
        name: title,
        content: [],
    }

    var stack = [exhibition]
    let sectionCounter = 0

    html.childNodes.forEach((node) => {
        var currentSection = stack[stack.length - 1]
        if (node.nodeName.match(/^H\d$/)) {
            let level = parseInt(node.nodeName[1]) - 2
            let section = {
                type: "section",
                name: node.textContent,
                content: [],
                editURL: `${domain}/wiki/${title}?action=edit&section=${sectionCounter++}`,
            }
            console.log(section.editURL)
            const depthIncrease = level - (stack.length - 2)
            let removeHowMany = -depthIncrease + 1
            if (removeHowMany > stack.length - 1) {
                removeHowMany = stack.length - 1
            }
            stack.splice(stack.length - removeHowMany, removeHowMany)
            stack[stack.length - 1].content.push(section)
            stack.push(section)
        } else if (["P", "BLOCKQUOTE", "DL", "DIV"].includes(node.nodeName)) {
            if (node.textContent.trim() !== "") {
                currentSection.content.push(parseParagraph(node))
            }
        } else if (node.nodeName == "TABLE") {
            let paragraph = parseTable(node)
            currentSection.content.push(paragraph)
        } else if (node.nodeName == "FIGURE") {
            let images = parseImages(node)
            currentSection.content.push(images)
        } else if (["LINK", "#comment"].includes(node.nodeName)) {
            // Skip, we can't really use those.
        } else if (node.nodeName == "#text") {
            if (!node.textContent.match(/^\s*$/)) {
                console.log(
                    "Skipping non-empty #text node: " + node.textContent
                )
            }
        } else if (["UL", "OL"].includes(node.nodeName)) {
            currentSection.content.push(parseList(node))
        } else {
            console.log("Skipping node of type " + node.nodeName)
            console.log(node)
        }
    })
    return exhibition
}
