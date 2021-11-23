import * as Y from "yjs"
import {WebrtcProvider} from "y-webrtc"
import {updateMultiplayer} from "./render.js"

var awareness, provider

export async function setupMultiplayer(topic) {
    if (awareness) {
        provider.destroy()
        awareness.destroy()
    }

    const ydoc = new Y.Doc()
    provider = new WebrtcProvider(`everything-exhibition-en-${topic}`, ydoc, {
        signaling: [
            "wss://signaling.yjs.dev",
            "wss://y-webrtc-signaling-eu.herokuapp.com",
            "wss://y-webrtc-signaling-us.herokuapp.com",
        ],
    })

    awareness = provider.awareness

    awareness.on("change", async () => {
        await updateMultiplayer(awareness.getStates(), awareness.clientID)
    })
}

export function setPosition(x, y, z, dirX, dirY, dirZ) {
    if (awareness) {
        awareness.setLocalStateField("transformation", {
            position: {x: x, y: y, z: z},
            rotation: {x: dirX, y: dirY, z: dirZ},
        })
    }
}

export function setName(name) {
    if (awareness) {
        awareness.setLocalStateField("name", name)
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
}
