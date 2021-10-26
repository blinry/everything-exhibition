import * as Y from "yjs"
import {WebrtcProvider} from "y-webrtc"
import {updateMultiplayer} from "./render.js"

var awareness

export function setupMultiplayer(topic) {
    const ydoc = new Y.Doc()
    const provider = new WebrtcProvider(
        `everything-exhibition-en-#{topic}`,
        ydoc,
        {
            signaling: [
                "wss://signaling.yjs.dev",
                "wss://y-webrtc-signaling-eu.herokuapp.com",
                "wss://y-webrtc-signaling-us.herokuapp.com",
            ],
        }
    )

    awareness = provider.awareness

    awareness.on("change", (changes) => {
        //console.log(Array.from(awareness.getStates()))
        updateMultiplayer(awareness.getStates())
    })
}

export function setPosition(x, y, z) {
    if (awareness) {
        awareness.setLocalStateField("position", {x: x, y: y, z: z})
    }
}
