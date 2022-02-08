import * as THREE from "three"
import {Text, getSelectionRects} from "troika-three-text"
import escapeStringRegexp from "escape-string-regexp"
import {loadMaterial} from "./render.js"

export const WALL_THICKNESS = 2
export const DOOR_WIDTH = 20

const WALL_TEXTURE = loadMaterial("beige_wall_001", 0.2, 0xcccccc)
var FLOOR_TEXTURE = loadMaterial("plywood", 0.5, 0x665d48)
var GROUND_TEXTURE = loadMaterial("beach", 0.5, 0x665d48)

var LINK_TEXTURE = new THREE.MeshBasicMaterial({
    color: 0xcce0ff,
})

var INVISIBLE_TEXTURE = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
})

export function createGround() {
    const geometry = new THREE.BoxGeometry(10000, 0.1, 10000)
    fixUVs(geometry)
    const ground = new THREE.Mesh(geometry, GROUND_TEXTURE)
    ground.position.y = -30

    return ground
}

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

export function createPicture(img, link) {
    var plane = createImagePlane(img.url, 30, null, img.width, img.height)
    if (img.description) {
        if (link) {
            img.description.links = [{page: link, text: "View Source"}]
            img.description.text += " View Source"
        }
        var textPlane = createTextPlane(img.description, 10, 0.5)
        textPlane.position.z = 1
        textPlane.position.y = -18
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
    var margin = 4

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

    var invisibleBoxGeometry = new THREE.BoxGeometry(
        width + 2 * margin,
        height,
        0.1
    )
    var invisibleBox = new THREE.Mesh(invisibleBoxGeometry, INVISIBLE_TEXTURE)
    plane.add(invisibleBox)

    let BORDER_SIZE = 1
    var borderBottom = new THREE.BoxGeometry(
        width + BORDER_SIZE * 2,
        BORDER_SIZE,
        BORDER_SIZE
    )
    var borderSide = new THREE.BoxGeometry(BORDER_SIZE, height, BORDER_SIZE)

    var borderBottomMesh = new THREE.Mesh(borderBottom, FLOOR_TEXTURE)
    borderBottomMesh.position.y -= height / 2 + BORDER_SIZE / 2
    plane.add(borderBottomMesh)
    var borderTopMesh = new THREE.Mesh(borderBottom, FLOOR_TEXTURE)
    borderTopMesh.position.y += height / 2 + BORDER_SIZE / 2
    plane.add(borderTopMesh)

    var borderLeftMesh = new THREE.Mesh(borderSide, FLOOR_TEXTURE)
    borderLeftMesh.position.x -= width / 2 + BORDER_SIZE / 2
    plane.add(borderLeftMesh)
    var borderRightMesh = new THREE.Mesh(borderSide, FLOOR_TEXTURE)
    borderRightMesh.position.x += width / 2 + BORDER_SIZE / 2
    plane.add(borderRightMesh)

    if (window.SETTINGS.shadows) {
        plane.receiveShadow = true
    }
    return plane
}

export function createTextPlane(paragraph, width, scale = 1) {
    var group = new THREE.Group()

    var text = paragraph.text
    var links = paragraph.links || []

    var padding = scale
    var margin = scale * 4

    var height = width / 10

    var planeGeometry = new THREE.BoxGeometry(width, height, 0.5)
    let textMaterial = new THREE.MeshStandardMaterial({color: "#eee"})
    var plane = new THREE.Mesh(planeGeometry, textMaterial)
    group.add(plane)

    var invisibleBoxGeometry = new THREE.BoxGeometry(
        width + 2 * margin,
        height,
        0.1
    )
    var invisibleBox = new THREE.Mesh(invisibleBoxGeometry, INVISIBLE_TEXTURE)
    group.add(invisibleBox)

    // Hangul hack :D
    const match = text.match(
        /[\uac00-\ud7af]|[\u1100-\u11ff]|[\u3130-\u318f]|[\ua960-\ua97f]|[\ud7b0-\ud7ff]/g
    )

    var textObject = new Text()
    textObject.text = text
    textObject.fontSize = 1 * scale
    textObject.font = "fonts/GoNotoCurrent.ttf"
    if (match) {
        textObject.font = "fonts/NotoSansKR-Regular.otf"
    }
    textObject.anchorX = "center"
    textObject.anchorY = "middle"
    textObject.color = 0x000000

    textObject.maxWidth = width - 2 * padding

    textObject.position.z = 0.27

    group.add(textObject)
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

        linkGroup.position.z = 0.26
        group.add(linkGroup)

        if (boxWidth > 0) {
            plane.scale.y = (boxHeight + 2 * padding) / height

            plane.scale.x = (boxWidth + 2 * padding) / width
        }
    })

    return group
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

function fixUVs(bufferGeometry) {
    // Iterate through faces and scale the UV coordinates according to their position.
    for (var i = 0; i < bufferGeometry.attributes.uv.count; i++) {
        let normalX = bufferGeometry.attributes.normal.getX(i)
        let normalY = bufferGeometry.attributes.normal.getY(i)
        let normalZ = bufferGeometry.attributes.normal.getZ(i)

        let positionX = bufferGeometry.attributes.position.getX(i)
        let positionY = bufferGeometry.attributes.position.getY(i)
        let positionZ = bufferGeometry.attributes.position.getZ(i)

        var u = bufferGeometry.attributes.uv.getX(i)
        var v = bufferGeometry.attributes.uv.getY(i)

        let uvScale = 5
        if (normalX === 1 && normalY === 0 && normalZ === 0) {
            u *= -positionZ / uvScale
            v *= positionY / uvScale
        } else if (normalX === 0 && normalY === 1 && normalZ === 0) {
            u *= positionX / uvScale
            v *= -positionZ / uvScale
        } else if (normalX === 0 && normalY === 0 && normalZ === 1) {
            u *= positionX / uvScale
            v *= positionY / uvScale
        } else if (normalX === -1 && normalY === 0 && normalZ === 0) {
            u *= positionZ / uvScale
            v *= -positionY / uvScale
        } else if (normalX === 0 && normalY === -1 && normalZ === 0) {
            u *= -positionX / uvScale
            v *= positionZ / uvScale
        } else if (normalX === 0 && normalY === 0 && normalZ === -1) {
            u *= -positionX / uvScale
            v *= -positionY / uvScale
        }

        bufferGeometry.attributes.uv.setXY(i, u, v)
    }
}

export function createFloor(width, depth) {
    let floorGeometry = new THREE.BoxGeometry(width, 0.1, depth)
    fixUVs(floorGeometry)
    let floor = new THREE.Mesh(floorGeometry, FLOOR_TEXTURE)
    return floor
}

export function createWall(a, b) {
    if (a instanceof THREE.Vector3) {
        a = new THREE.Vector2(a.x, a.z)
    }
    if (b instanceof THREE.Vector3) {
        b = new THREE.Vector2(b.x, b.z)
    }

    const l = a.distanceTo(b) + WALL_THICKNESS
    var boxGeometry = new THREE.BoxGeometry(l, 50, WALL_THICKNESS)
    fixUVs(boxGeometry)

    var boxMaterial = WALL_TEXTURE
    var box = new THREE.Mesh(boxGeometry, boxMaterial)
    if (SETTINGS.shadows) {
        box.castShadow = true
        box.receiveShadow = true
    }
    var center = a.add(b).divideScalar(2)
    box.position.x = center.x
    box.position.z = center.y
    let rotationAngle = Math.atan2(a.y - b.y, a.x - b.x)
    box.rotateY(rotationAngle)
    box.layers.enable(1)
    return box
}
