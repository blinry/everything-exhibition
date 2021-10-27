var timings = {}

export function timeStart(category) {
    var timer = {
        start: performance.now(),
        category: category,
    }
    return timer
}

export function timeEnd(timer) {
    var end = performance.now()
    var duration = (end - timer.start) / 1000 // seconds
    if (!timings[timer.category]) {
        timings[timer.category] = 0
    }
    timings[timer.category] += duration
}

export function timeReset() {
    timings = {}
}

export function timeDump() {
    console.log(timings)
}
