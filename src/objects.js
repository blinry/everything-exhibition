import * as THREE from "three"
import {Text, getSelectionRects} from "troika-three-text"
import escapeStringRegexp from "escape-string-regexp"

export const WALL_THICKNESS = 2
const DOOR_WIDTH = 20

const WALL_TEXTURE = new THREE.MeshStandardMaterial({
    color: 0xb3b3b3,
    side: THREE.DoubleSide,
})

var LINK_TEXTURE = new THREE.MeshBasicMaterial({
    color: 0xcce0ff,
})

export function createAudio(audio, listener) {
    var textPlane = createTextPlane({text: "audio", links: []}, 10, 1)

    // create the PositionalAudio object (passing in the listener)
    const sound = new THREE.PositionalAudio(listener)

    // load a sound and set it as the PositionalAudio object's buffer
    const audioLoader = new THREE.AudioLoader()
    audioLoader.load(audio.url, function (buffer) {
        sound.setBuffer(buffer)
        sound.setLoop(true)

        sound.setRefDistance(30)
        sound.setDistanceModel("exponential")
        sound.setRolloffFactor(10)

        sound.play()
    })

    textPlane.add(sound)
    return textPlane
}

export function createPicture(img) {
    var plane = createImagePlane(img.url, 30, null, img.width, img.height)
    if (img.description) {
        var textPlane = createTextPlane(
            {text: img.description, links: []},
            10,
            0.5
        )
        textPlane.position.z = 1
        textPlane.position.y = -5
        plane.add(textPlane)
    }
    return plane
}

export function createImagePlane(
    url,
    height = 30,
    width = null,
    knownWidth = null,
    knownHeight = null
) {
    var texture = new THREE.TextureLoader().load(url)

    let ratio = knownWidth / knownHeight
    if (height !== null && width === null) {
        width = height * ratio
    } else if (height === null && width !== null) {
        height = width / ratio
    } else if (height === null && width === null) {
        height = 30
        width = 30
        console.log("Tried to create an image plane without any size.")
    }
    var planeGeometry = new THREE.BoxGeometry(width, height, 0.1)
    var planeMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.5,
    })

    var plane = new THREE.Mesh(planeGeometry, planeMaterial)
    // Store the width in the Mesh object. This is a bit of a hack.
    plane.myWidth = width
    plane.safetyWidth = width
    if (window.SETTINGS.shadows) {
        plane.receiveShadow = true
    }
    return plane
}

export function createTextPlane(paragraph, width, scale = 1) {
    var text = paragraph.text
    var links = paragraph.links || []

    var margin = scale

    var height = width / 10

    var planeGeometry = new THREE.BoxGeometry(width, height, 0.1)

    var plane = new THREE.Mesh(planeGeometry)

    plane.myWidth = width
    plane.safetyWidth = width
    //plane.layers.enable(1)

    //var link = "Philosophy"//text.match(/<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/)
    //if (link) {
    //    plane.myLink = link
    //}

    var textObject = new Text()
    textObject.text = text
    textObject.fontSize = 1 * scale
    textObject.font = "/fonts/Roboto-Regular.ttf"
    textObject.anchorX = "center"
    textObject.anchorY = "middle"
    textObject.color = 0x000000

    textObject.maxWidth = width - 2 * margin

    textObject.position.z = 0.2

    plane.add(textObject)
    textObject.sync(() => {
        var bbox = new THREE.Box3().setFromObject(textObject)

        var boxWidth = Math.max(
            bbox.max.x - bbox.min.x,
            bbox.max.z - bbox.min.z
        )
        var boxHeight = bbox.max.y - bbox.min.y

        const linkGroup = new THREE.Group()

        for (const linkDefinition of links) {
            const link = linkDefinition.text
            const linkPage = linkDefinition.page
            // Find all matches of link in the text.
            const match = new RegExp(escapeStringRegexp(link), "gi").exec(text)
            if (match) {
                const fromIndex = match.index
                const toIndex = fromIndex + link.length
                const rects = getSelectionRects(
                    textObject.textRenderInfo,
                    fromIndex,
                    toIndex
                )

                for (const r of rects) {
                    const w = r.right - r.left
                    const h = r.top - r.bottom
                    var linkGeometry = new THREE.BoxGeometry(w, h, 0.01)
                    var linkObject = new THREE.Mesh(linkGeometry, LINK_TEXTURE)
                    linkObject.position.y = (r.top + r.bottom) / 2
                    linkObject.position.x = (r.left + r.right) / 2
                    linkObject.layers.enable(1)
                    linkObject.myLink = linkPage
                    linkGroup.add(linkObject)
                }
            }
        }

        linkGroup.position.z = 0.1
        plane.add(linkGroup)

        if (boxWidth > 0) {
            plane.scale.y = (boxHeight + 2 * margin) / height
            textObject.scale.y = height / (boxHeight + 2 * margin)
            linkGroup.scale.y = height / (boxHeight + 2 * margin)
            linkGroup.position.y *= height / (boxHeight + 2 * margin)

            plane.scale.x = (boxWidth + 2 * margin) / width
            textObject.scale.x = width / (boxWidth + 2 * margin)
            linkGroup.scale.x = width / (boxWidth + 2 * margin)
            linkGroup.position.x *= (boxWidth + 2 * margin) / width
        }
    })

    return plane
}

export function createDoorWall(wallCenters, wallDirections, roomWidth, group) {
    // Add a front wall with a door.
    const a = wallCenters[0].clone()
    a.sub(wallDirections[0].clone().multiplyScalar(roomWidth / 2))
    const b = wallCenters[2].clone()
    b.add(wallDirections[2].clone().multiplyScalar(roomWidth / 2))

    const sideWallLength = (roomWidth - DOOR_WIDTH) / 2

    const a1 = a.clone()
    const b1 = a.clone()
    b1.add(wallDirections[1].clone().multiplyScalar(sideWallLength))
    group.add(
        createWall(new THREE.Vector2(a1.x, a1.z), new THREE.Vector2(b1.x, b1.z))
    )

    const a2 = b.clone()
    const b2 = b.clone()
    b2.add(wallDirections[1].clone().multiplyScalar(-sideWallLength))
    group.add(
        createWall(new THREE.Vector2(a2.x, a2.z), new THREE.Vector2(b2.x, b2.z))
    )
}

export function createWall(a, b) {
    a = a.clone()
    b = b.clone()
    const l = a.distanceTo(b) + WALL_THICKNESS
    var planeGeometry = new THREE.BoxGeometry(l, 50, WALL_THICKNESS)
    var planeMaterial = WALL_TEXTURE
    var plane = new THREE.Mesh(planeGeometry, planeMaterial)
    if (SETTINGS.shadows) {
        plane.castShadow = true
        plane.receiveShadow = true
    }
    var center = a.add(b).divideScalar(2)
    plane.position.x = center.x
    plane.position.z = center.y
    let rotationAngle = Math.atan2(a.y - b.y, a.x - b.x)
    plane.rotateY(rotationAngle)
    plane.layers.enable(1)
    return plane
}

export function createRoom(corner, other_corner) {
    let lower_left = corner.clone()
    let upper_right = other_corner.clone()
    let lower_right = new THREE.Vector2(upper_right.x, lower_left.y)
    let upper_left = new THREE.Vector2(lower_left.x, upper_right.y)

    let group = new THREE.Group()

    group.add(createWall(lower_left, upper_left))
    group.add(createWall(upper_left, upper_right))
    group.add(createWall(upper_right, lower_right))
    group.add(createWall(lower_left, lower_right))

    return group
}
