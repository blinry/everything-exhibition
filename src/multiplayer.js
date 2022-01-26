import * as Y from "yjs"
import {WebrtcProvider} from "y-webrtc"
import {updateMultiplayer, updateSketch} from "./render.js"
import {updateNameList, updateMarkers} from "./main.js"

var awareness, provider, sketchArray, groupAwareness, groupProvider

export async function setupGroupConnection(groupID) {
    if (groupAwareness) {
        groupProvider.destroy()
        groupAwareness.destroy()
    }

    const ydoc = new Y.Doc()

    groupProvider = new WebrtcProvider(
        `everything-exhibition-group-${groupID}`,
        ydoc,
        {
            signaling: [
                "wss://signaling.yjs.dev",
                "wss://y-webrtc-signaling-eu.herokuapp.com",
                "wss://y-webrtc-signaling-us.herokuapp.com",
            ],
        }
    )

    console.log("groupID", groupID)

    groupAwareness = groupProvider.awareness

    groupAwareness.on("change", async () => {
        await updateNameList(
            groupAwareness.getStates(),
            groupAwareness.clientID
        )
    })
}

export async function setupMultiplayer(url, groupID) {
    if (awareness) {
        provider.destroy()
        awareness.destroy()
    }

    const ydoc = new Y.Doc()
    sketchArray = ydoc.getArray("sketch")
    provider = new WebrtcProvider(
        `everything-exhibition-room-${url}-${groupID}`,
        ydoc,
        {
            signaling: [
                "wss://signaling.yjs.dev",
                "wss://y-webrtc-signaling-eu.herokuapp.com",
                "wss://y-webrtc-signaling-us.herokuapp.com",
            ],
        }
    )
    console.log("roomname", `everything-exhibition-room-${url}-${groupID}`)

    awareness = provider.awareness

    awareness.on("change", async () => {
        await updateMultiplayer(awareness.getStates(), awareness.clientID)
        await updateMarkers(awareness.getStates(), awareness.clientID)
    })

    sketchArray.observe(updateSketch)
}

export function addSketch(sketchPoints) {
    sketchArray.push(sketchPoints)
}

export function clearSketch() {
    sketchArray.delete(0, sketchArray.length)
}

export function setPosition(x, y, z, dirX, dirY, dirZ) {
    if (awareness) {
        awareness.setLocalStateField("transformation", {
            position: {x: x, y: y, z: z},
            rotation: {x: dirX, y: dirY, z: dirZ},
        })
    }
}

export function setURL(url) {
    if (groupAwareness) {
        groupAwareness.setLocalStateField("url", url)
    }
}

export function setName(name) {
    if (awareness) {
        awareness.setLocalStateField("name", name)
    }
    if (groupAwareness) {
        groupAwareness.setLocalStateField("name", name)
    }
}

export function setFace(face) {
    if (awareness) {
        awareness.setLocalStateField("face", face)
    }
}

export function setColor(htmlColor) {
    if (awareness) {
        awareness.setLocalStateField("color", htmlColor)
    }
    if (groupAwareness) {
        groupAwareness.setLocalStateField("color", htmlColor)
    }
}
